/**
 * Kvartira to'lovi — baza mantig'i. Faqat sql/config bilan ishlaydi,
 * Telegram bilan bog'liq hech narsa yo'q (xabar yuborish
 * `bot/handlers/tolov.ts` da) — `core/reports.ts` bilan bir xil qatlamlash
 * saqlanadi.
 *
 * Har bir to'lov MUSTAQIL yozuv (bitta "jami to'landi" ustunini qayta yozib
 * turmaymiz). Odamning joriy holati har doim shu jadvaldan
 * SUM(tasdiqlangan_summa) WHERE holat='tasdiqlandi' bilan hisoblanadi —
 * bu funksiyaning o'zi (`foydalanuvchiTolovHolati`) yagona joy, boshqa hech
 * qayerda qo'shimcha mantiq kerak emas.
 *
 * `kiritgan_summa` — foydalanuvchining o'zi yozgan DA'VO, hisobga
 * qo'shilmaydi. `tasdiqlangan_summa` — admin tekshirib kiritgan haqiqiy
 * miqdor, FAQAT shu haqiqiy hisobga tushadi (talab: "actual received
 * amount is authoritative, not the user-entered claim").
 *
 * OYLIK SIKL. Yuqoridagi yig'indi endi har doim BITTA OY ichida olinadi
 * (`tolov_sikllari`). Ilgari butun tarix bo'yicha yig'ilardi va bu ikkinchi
 * oydan boshlab buzilardi: avgustda to'langan 900 000 sentabrda ham "to'liq
 * to'langan" bo'lib turaverardi. Eski oylar o'chirilmaydi — har biri o'z
 * siklida, o'sha oyning muzlatilgan talabi bilan qoladi.
 */
import type postgres from "postgres";
import { sql, type SiklTur, type Tolov, type TolovDalilTuri, type TolovSikl, type User } from "../db/index.js";
import { TOLOV_STD } from "../config.js";
import { sozlamalarOl } from "./sozlamalar.js";
import { bugungiSana, kunFarqi, kunQosh, siklDavri } from "./vaqt.js";
import { logla } from "./adminlog.js";
import { faollikYoz } from "./faollik.js";

let keshlanganTalab: number | undefined;
let keshlanganQabul: { ism: string; karta: string } | undefined;

/** Har kishidan talab qilinadigan summa — settings'da bo'lmasa standart qiymat. */
export async function tolovTalabi(): Promise<number> {
  if (keshlanganTalab !== undefined) return keshlanganTalab;
  const [r] = await sql<{ qiymat: string }[]>`
    SELECT qiymat FROM settings WHERE kalit = 'tolov_talab'
  `;
  keshlanganTalab = r ? Number(r.qiymat) : TOLOV_STD.talab;
  return keshlanganTalab;
}

/**
 * Admin buyruq bilan o'zgartirishi uchun — kod o'zgarmasdan.
 *
 * Bu FAQAT kelgusi sikllarga ta'sir qiladi: har bir sikl o'z talabini
 * yaratilgan paytda nusxalab oladi, shuning uchun yopilgan oylarning
 * tarixi o'zgarmaydi.
 */
export async function tolovTalabiniOrnat(summa: number): Promise<void> {
  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES ('tolov_talab', ${String(summa)})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
  keshlanganTalab = summa;
}

/** Qabul qiluvchi ism va karta raqami — settings'da bo'lmasa standart. */
export async function tolovQabulQiluvchi(): Promise<{ ism: string; karta: string }> {
  if (keshlanganQabul !== undefined) return keshlanganQabul;
  const rows = await sql<{ kalit: string; qiymat: string }[]>`
    SELECT kalit, qiymat FROM settings WHERE kalit IN ('tolov_qabul_ism', 'tolov_qabul_karta')
  `;
  const ism = rows.find((r) => r.kalit === "tolov_qabul_ism")?.qiymat ?? TOLOV_STD.qabulQiluvchi;
  const karta = rows.find((r) => r.kalit === "tolov_qabul_karta")?.qiymat ?? TOLOV_STD.karta;
  keshlanganQabul = { ism, karta };
  return keshlanganQabul;
}

export async function tolovQabulQiluvchiniOrnat(ism: string, karta: string): Promise<void> {
  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES ('tolov_qabul_ism', ${ism})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES ('tolov_qabul_karta', ${karta})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
  keshlanganQabul = { ism, karta };
}

export type TolovDaraja = "tolanmagan" | "qisman" | "tola";

// ---------------------------------------------------------------------------
// SHAXSIY TALAB
// ---------------------------------------------------------------------------

/**
 * Bitta odamdan shu siklda talab qilinadigan summa.
 *
 * Uyda hamma bir xil turmaydi: oyning 20 kunini turib chiqib ketadigan odam
 * kelishuv bo'yicha 900 000 emas, 600 000 to'laydi. Ilgari bunday odam
 * abadiy "qisman to'lagan" bo'lib qolar, qarzdorlar ro'yxatidan tushmas va
 * har 5 soatda eslatma olardi.
 *
 * `tolov_holat.shaxsiy_talab` NULL bo'lsa siklning umumiy talabi amal
 * qiladi. HAR JOYDA shu funksiyadan o'tiladi — `qoldiq`, `daraja`,
 * `kechikkan`, muddat surati va eslatma ro'yxati bir xil raqamga tayanishi
 * shart, aks holda odam bir ekranda "to'lagan", boshqasida "qarzdor" bo'lib
 * ko'rinardi.
 */
export function amaldagiTalab(siklTalab: number, shaxsiy: string | number | null): number {
  return shaxsiy === null || shaxsiy === undefined ? siklTalab : Number(shaxsiy);
}

/**
 * Shaxsiy talabni qo'yadi yoki olib tashlaydi (`null`).
 *
 * FAQAT SHU SIKL uchun: keyingi oy yana umumiy talabdan boshlanadi, ya'ni
 * bir marta kelishilgan chegirma jimgina abadiylashib qolmaydi. `talab`
 * o'zi `tolov_sikllari` da muzlatilgani bilan bir xil falsafa.
 *
 * Muddat surati allaqachon olingan bo'lsa qayta hisoblanadi — aks holda
 * dashboardda eski "muddatda yetmagan" raqami qolib ketardi.
 */
export async function shaxsiyTalabOrnat(
  siklId: number,
  userId: number,
  summa: number | null,
  adminId: number,
): Promise<void> {
  await sql`
    INSERT INTO tolov_holat (sikl_id, user_id, shaxsiy_talab)
    VALUES (${siklId}, ${userId}, ${summa})
    ON CONFLICT (sikl_id, user_id) DO UPDATE SET shaxsiy_talab = EXCLUDED.shaxsiy_talab
  `;
  await logla(
    adminId,
    "shaxsiy_talab",
    "sikl",
    siklId,
    null,
    summa === null ? `${userId}: umumiy talab` : `${userId}: ${summa}`,
  );
  await muddatSuratiniYangila(siklId, userId);
}

/**
 * Tasdiqlangan summadan holatni aniqlaydi — yagona joy, hamma yerda shu
 * ishlatiladi (foydalanuvchi ko'rinishi ham, dashboard ham).
 *
 *   0                    -> tolanmagan
 *   0 < summa < talab     -> qisman
 *   summa >= talab         -> tola
 */
export function hisoblaDaraja(tasdiqlangan: number, talab: number): TolovDaraja {
  if (tasdiqlangan <= 0) return "tolanmagan";
  if (tasdiqlangan < talab) return "qisman";
  return "tola";
}

/**
 * Muddat o'tib ketdimi. Muddat KUN OXIRIGACHA hisoblangani uchun muddat
 * kunining o'zi hali "o'tgan" emas.
 */
export function muddatiOtdimi(muddat: string, bugun = bugungiSana()): boolean {
  return kunFarqi(bugun, muddat) < 0;
}

/**
 * "Kechikkan" — muddat o'tgan VA qarz qolgan.
 *
 * Ataylab `TolovDaraja`ga to'rtinchi qiymat qilib qo'shilmadi: daraja
 * PULNING holati (qancha to'landi), kechikish esa VAQTNING holati. Ikkalasi
 * mustaqil o'zgaradi — muddat o'tgandan keyin to'lagan odam ham "tola",
 * ham "kechikkan emas" bo'lib qoladi. Ularni bitta maydonga siqish
 * `hisoblaDaraja`ni ham, uning sinovlarini ham buzardi.
 */
export function kechikkanmi(qoldiq: number, muddat: string, bugun = bugungiSana()): boolean {
  return qoldiq > 0 && muddatiOtdimi(muddat, bugun);
}

// ---------------------------------------------------------------------------
// OYLIK SIKL
// ---------------------------------------------------------------------------

/**
 * `to_char` bilan o'qish — DATE ustuni JS'da UTC yarim tunga aylanib, bir
 * kunlik siljish bermasin.
 *
 * Ataylab FUNKSIYA, doimiy emas: postgres.js'da `sql\`\`` har safar yangi
 * so'rov obyektini yaratadi va bitta obyektni bir necha so'rovda qayta
 * ishlatish xavfli. Har chaqiruvda yangi fragment qaytariladi.
 */
const siklUstunlari = () => sql`
  id,
  to_char(davr, 'YYYY-MM-DD') AS davr,
  tur,
  nom,
  narsalar,
  talab,
  to_char(muddat, 'YYYY-MM-DD') AS muddat,
  holat,
  to_char(guruh_eslatma, 'YYYY-MM-DD') AS guruh_eslatma,
  muddat_hisoblandi,
  yakunlandi,
  created_at
`;

/**
 * `sql` ham, tranzaksiya ichidagi `tx` ham shu interfeysni qo'llaydi —
 * shuning uchun bir xil funksiya ikkalasi bilan ham ishlaydi (postgres.js'da
 * `Sql` va `TransactionSql` ikkalasi ham `ISql`dan meros oladi).
 */
type Baza = postgres.ISql;

/** BIGINT postgres.js'da matn bo'lib keladi — raqamga faqat shu yerda o'giriladi. */
type SiklQator = Omit<TolovSikl, "talab"> & { talab: string };

function siklMap(r: SiklQator): TolovSikl {
  return { ...r, talab: Number(r.talab) };
}

export async function siklniOl(id: number): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari WHERE id = ${id}
  `;
  return s ? siklMap(s) : null;
}

/**
 * `tur = 'oylik'` filtri bu fayldagi hamma "sikllarni topish" so'roviga
 * ATAYLAB qo'shilgan: yig'im ham shu jadvalda yashaydi, lekin u kvartira
 * puli hisobiga hech qachon aralashmasligi kerak. Bitta id bo'yicha o'qish
 * (`siklniOl`) filtrsiz — u yerda qaysi sikl kerakligi allaqachon ma'lum.
 */
export async function siklniDavrBoyichaOl(davr: string): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari
    WHERE tur = 'oylik' AND davr = ${davr}::date
  `;
  return s ? siklMap(s) : null;
}

/** Eng yangisi birinchi — admin tarixni ko'rishi uchun. */
export async function sikllarRoyxati(limit = 12): Promise<TolovSikl[]> {
  const rows = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari
    WHERE tur = 'oylik' ORDER BY davr DESC LIMIT ${limit}
  `;
  return rows.map(siklMap);
}

/**
 * Shu oyning sikli — bo'lmasa yaratiladi.
 *
 * Talab settings'dan NUSXALANADI: admin kelasi oy summani o'zgartirsa,
 * o'tgan oylarning yozuvi o'z-o'zidan qayta hisoblanib ketmasligi kerak.
 *
 * Ikki so'rov bir vaqtda kelishi mumkin (webhook + cron), shuning uchun
 * `ON CONFLICT DO NOTHING` — ikkinchisi jimgina mavjudini oladi.
 */
export async function joriySikl(): Promise<TolovSikl> {
  const { davr, muddat } = siklDavri(new Date(), (await sozlamalarOl()).tolovMuddatKuni);

  const mavjud = await siklniDavrBoyichaOl(davr);
  if (mavjud) return mavjud;

  const talab = await tolovTalabi();
  await sql`
    INSERT INTO tolov_sikllari (davr, talab, muddat)
    VALUES (${davr}::date, ${talab}, ${muddat}::date)
    ON CONFLICT (davr) DO NOTHING
  `;

  // Yangi oy ochildi — muddat surati allaqachon olingan eski sikllar
  // yopiladi. Hech narsa o'chirilmaydi, faqat holat yakunlanadi.
  await sql`
    UPDATE tolov_sikllari SET holat = 'yakunlandi', yakunlandi = now()
    WHERE tur = 'oylik' AND holat = 'muddat_yetdi' AND davr < ${davr}::date
  `;

  const yangi = await siklniDavrBoyichaOl(davr);
  if (!yangi) throw new Error("Joriy to'lov sikli yaratilmadi");
  return yangi;
}

/**
 * Muddati o'tgan, lekin hali suratga olinmagan sikllar. Odatda bittadan
 * ko'p bo'lmaydi; migratsiyadan keyingi birinchi ishga tushishda esa eski
 * oylar ham shu yerdan o'tib, tarixi to'ldiriladi.
 */
export async function muddatiOtganSikllar(bugun = bugungiSana()): Promise<TolovSikl[]> {
  const rows = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari
    WHERE tur = 'oylik' AND holat = 'ochiq' AND muddat < ${bugun}::date
    ORDER BY davr
  `;
  return rows.map(siklMap);
}

// ---------------------------------------------------------------------------
// MUDDAT NATIJASI (sof funksiyalar — bazasiz sinaladi)
// ---------------------------------------------------------------------------

export type MuddatNatija = {
  talab: number;
  tasdiqlangan: number;
  /** Muddatgacha yuborilgan, lekin hali tekshirilmagan to'lovlarning da'vosi */
  kutilmoqda: number;
  qoldiq: number;
  daraja: TolovDaraja;
  /** Muddatda hali tekshiruvda turgan to'lovi bor edi — natija yakuniy emas */
  tekshiruvKutilmoqda: boolean;
};

/**
 * Muddat kelgan paytdagi yakuniy holat.
 *
 * Ikki muhim qoida:
 *
 *  1) Hisobga faqat TASDIQLANGAN summa kiradi (`qoldiq` shundan chiqadi) —
 *     tekshirilmagan da'vo pulni yig'ilgan qilib ko'rsatmaydi.
 *
 *  2) Lekin agar odam muddatgacha to'lov yuborgan bo'lsa-yu, admin hali
 *     tekshirmagan bo'lsa, natija YAKUNIY DEB BELGILANMAYDI:
 *     `tekshiruvKutilmoqda` bayrog'i qo'yiladi va ko'rinishlarda "tekshiruv
 *     kechikkan" deb aytiladi. Admin tekshirgach surat qayta hisoblanadi
 *     (`muddatSuratiniYangila`) — o'shanda haqiqiy natija chiqadi. Talab:
 *     "Do not punish the user for the verification delay".
 *
 * Jarima (pul) tizimi olib tashlangan: uy qoidasi kvartira to'lovi uchun
 * jarima belgilamagan edi va foiz hech qachon 0 dan boshqa qilinmadi.
 * Bot faqat YETMAGAN summani ko'rsatadi, moliyaviy jazo o'ylab chiqarmaydi.
 */
export function muddatNatijasi(p: {
  talab: number;
  tasdiqlangan: number;
  kutilmoqda: number;
}): MuddatNatija {
  const qoldiq = Math.max(0, p.talab - p.tasdiqlangan);
  const tekshiruvKutilmoqda = qoldiq > 0 && p.kutilmoqda > 0;
  return {
    talab: p.talab,
    tasdiqlangan: p.tasdiqlangan,
    kutilmoqda: p.kutilmoqda,
    qoldiq,
    daraja: hisoblaDaraja(p.tasdiqlangan, p.talab),
    tekshiruvKutilmoqda,
  };
}

/**
 * Shu odamga hozir to'lov eslatmasi yuborilsinmi.
 *
 * ILGARI KUNIGA BIR MARTA edi — va shunchaki e'tibordan chetda qolardi.
 * Endi `yigimEslatmasiKerakmi` bilan bir xil SOATLIK chastota
 * (`oraliqSoat`, standart 5), faqat bitta farq bilan: bu funksiya OYNAGA
 * bog'liq. Muddatga `eslatmaKuni` kundan ko'p qolgan bo'lsa hali erta —
 * aks holda oyning boshidan har 5 soatda DM ketib, oyiga yetmishta xabar
 * bo'lib qolardi. Yig'imniki esa muddatdan mustaqil, chunki u umuman
 * kalendar oyiga bog'lanmaydi.
 *
 * Spam bo'lmasligi uchun to'rt shart:
 *  - qarzi qolmagan bo'lsa — umuman yuborilmaydi (talab: to'liq to'lagan
 *    odam eslatma olishda davom etmasligi kerak). "Qarz" endi SHAXSIY
 *    talabdan hisoblanadi, ya'ni kelishilgan kam summani to'lagan odam ham
 *    ro'yxatdan chiqadi;
 *  - oxirgi eslatmadan `oraliqSoat` o'tmagan bo'lsa — hali erta;
 *  - oyna ochilmagan bo'lsa — hali erta;
 *  - muddat o'tib ketgan bo'lsa DAVOM ETADI — qarz o'z-o'zidan yo'qolmaydi.
 */
export function tolovEslatmasiKerakmi(p: {
  qoldiq: number;
  bugun: string;
  muddat: string;
  oxirgiTs: Date | null;
  eslatmaKuni: number;
  oraliqSoat: number;
  hozir: number;
  /** Odam "🙁 To'lay olmayapman" deb sabab yozgan oxirgi lahza */
  uzrTs?: Date | null;
}): boolean {
  if (p.qoldiq <= 0) return false;
  if (uzrTinimidami(p.uzrTs, p.hozir)) return false;
  if (kunFarqi(p.bugun, p.muddat) > p.eslatmaKuni) return false;
  if (!p.oxirgiTs) return true;
  return p.hozir - new Date(p.oxirgiTs).getTime() >= p.oraliqSoat * 3_600_000;
}

// ---------------------------------------------------------------------------
// FOYDALANUVCHI HOLATI
// ---------------------------------------------------------------------------

export type TolovHolatMalumoti = {
  /** Shu ODAMDAN talab qilinadigan summa — `amaldagiTalab` natijasi */
  talab: number;
  /** Talab siklning umumiysi emas, shu odamga alohida qo'yilgan */
  shaxsiy: boolean;
  tasdiqlangan: number;
  qoldiq: number;
  daraja: TolovDaraja;
  /** Hali admin ko'rib chiqmagan (bu hisobga QO'SHILMAGAN) to'lovlar soni */
  kutilmoqdaSoni: number;
  /** O'sha kutayotgan to'lovlarda foydalanuvchi da'vo qilgan jami summa */
  kutilmoqdaSumma: number;
  /** Muddat o'tgan va qarz qolgan */
  kechikkan: boolean;
  /** Qaysi oy hisoblanmoqda — muddat va talab shu yerdan olinadi */
  sikl: TolovSikl;
};

/**
 * Bitta odamning joriy to'lov holati — faqat SHU SIKL ichidagi va faqat
 * tasdiqlangan summalar hisobga kiradi.
 */
export async function foydalanuvchiTolovHolati(
  userId: number,
  sikl?: TolovSikl,
): Promise<TolovHolatMalumoti> {
  const s = sikl ?? (await joriySikl());
  const [r] = await sql<
    { tasdiqlangan: string; kutilmoqda_summa: string; kutilmoqda: number; shaxsiy_talab: string | null }[]
  >`
    SELECT
      (COALESCE(SUM(t.tasdiqlangan_summa) FILTER (WHERE t.holat = 'tasdiqlandi'), 0) +
       COALESCE((SELECT SUM(summa) FROM tolov_tuzatish
                 WHERE user_id = ${userId} AND sikl_id = ${s.id}), 0)
      )::bigint AS tasdiqlangan,
      COALESCE(SUM(t.kiritgan_summa)     FILTER (WHERE t.holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda_summa,
      count(t.id) FILTER (WHERE t.holat = 'kutilmoqda')::int AS kutilmoqda,
      (SELECT shaxsiy_talab FROM tolov_holat
        WHERE sikl_id = ${s.id} AND user_id = ${userId}) AS shaxsiy_talab
    FROM tolovlar t WHERE t.user_id = ${userId} AND t.sikl_id = ${s.id}
  `;
  const tasdiqlangan = Number(r?.tasdiqlangan ?? 0);
  const talab = amaldagiTalab(s.talab, r?.shaxsiy_talab ?? null);
  const qoldiq = Math.max(0, talab - tasdiqlangan);
  const kechikkan = kechikkanmi(qoldiq, s.muddat);
  return {
    talab,
    shaxsiy: (r?.shaxsiy_talab ?? null) !== null,
    tasdiqlangan,
    qoldiq,
    daraja: hisoblaDaraja(tasdiqlangan, talab),
    kutilmoqdaSoni: r?.kutilmoqda ?? 0,
    kutilmoqdaSumma: Number(r?.kutilmoqda_summa ?? 0),
    kechikkan,
    sikl: s,
  };
}

/**
 * Yangi to'lov yozuvi yaratadi ('kutilmoqda' holatida). `kiritganSumma`
 * faqat foydalanuvchining o'z da'vosi — hisobga hali qo'shilmaydi, buni
 * faqat admin `tolovniTasdiqla` orqali qiladi.
 *
 * Sikl YUBORILGAN payt bo'yicha biriktiriladi va keyin o'zgarmaydi: admin
 * tasdiqlashni kechiktirsa ham to'lov o'z oyida qoladi.
 */
export async function tolovYuborish(
  userId: number,
  kiritganSumma: number,
  dalilId: string,
  dalilTuri: TolovDalilTuri,
  siklId?: number,
): Promise<Tolov | null> {
  // `siklId` berilsa — pul YIG'IMIGA to'lov (`bot/handlers/yigim.ts`).
  // Berilmasa — kvartira puli, o'z oyiga tushadi. Ikkalasi bir xil
  // yozuvdan iborat, farqi faqat qaysi siklga biriktirilishida.
  const sikl = siklId ? await siklniOl(siklId) : await joriySikl();
  if (!sikl) return null;
  // Bir xil chek ikkinchi marta yuborilsa yangi yozuv yaratilmaydi —
  // `tolovlar_dalil_uniq` qisman indeksi buni bazada kafolatlaydi, ya'ni
  // ikki so'rov bir vaqtda kelsa ham ikkita qarz yozuvi paydo bo'lmaydi.
  // Rad etilgan chek bundan mustasno: xato tuzatilib qayta yuborilishi
  // mumkin (indeks `holat <> 'rad'` shartida).
  const [t] = await sql<Tolov[]>`
    INSERT INTO tolovlar (user_id, sikl_id, kiritgan_summa, dalil_id, dalil_turi)
    VALUES (${userId}, ${sikl.id}, ${kiritganSumma}, ${dalilId}, ${dalilTuri})
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  // `ON CONFLICT DO NOTHING` — bir xil chek ikkinchi marta yuborilsa yangi
  // yozuv ham, faollik ham qo'shilmaydi.
  if (t) await faollikYoz(userId, "tolov");
  return t ?? null;
}

/**
 * Shu chek shu oyda allaqachon yuborilganmi. Foydalanuvchiga tushunarli
 * xabar berish uchun — qattiq kafolat baribir bazadagi indeksda.
 */
export async function avvalgiDalil(
  userId: number,
  dalilId: string,
  siklId?: number,
): Promise<Tolov | null> {
  const sikl = siklId ? await siklniOl(siklId) : await joriySikl();
  if (!sikl) return null;
  const [t] = await sql<Tolov[]>`
    SELECT * FROM tolovlar
    WHERE user_id = ${userId} AND sikl_id = ${sikl.id}
      AND dalil_id = ${dalilId} AND holat <> 'rad'
    LIMIT 1
  `;
  return t ?? null;
}

/**
 * Admin tekshirib tasdiqlaydi — foydalanuvchi yozgan summaga emas, ADMIN
 * kiritgan haqiqiy summaga ishonamiz (talab: "actual amount is
 * authoritative, not the user's claim").
 *
 * Ikki admin bir vaqtda bosishi mumkin, shuning uchun `FOR UPDATE` bilan
 * qulflangan tranzaksiya ichida — allaqachon hal qilingan bo'lsa `null`,
 * ya'ni ikkinchi bosish hisobni ikki marta oshira olmaydi.
 *
 * Tasdiq muddatdan KEYIN kelgan bo'lsa, o'sha siklning muddat surati qayta
 * hisoblanadi: "tekshiruv kutilmoqda" holati yopilib, haqiqiy natija
 * yoziladi (talab: tekshiruv kechikkani odamga zarar qilmasin).
 */
export async function tolovniTasdiqla(
  tolovId: number,
  adminId: number,
  tasdiqlanganSumma: number,
): Promise<Tolov | null> {
  const yangi = await sql.begin(async (tx) => {
    const [t] = await tx<Tolov[]>`
      SELECT * FROM tolovlar WHERE id = ${tolovId} AND holat = 'kutilmoqda' FOR UPDATE
    `;
    if (!t) return null;

    const [natija] = await tx<Tolov[]>`
      UPDATE tolovlar
      SET holat = 'tasdiqlandi', tasdiqlangan_summa = ${tasdiqlanganSumma},
          hal_qildi = ${adminId}, hal_qilindi = now()
      WHERE id = ${tolovId}
      RETURNING *
    `;
    return natija ?? null;
  });

  if (yangi?.sikl_id) await muddatSuratiniYangila(yangi.sikl_id, yangi.user_id);
  return yangi;
}

/** Rad etilgan to'lov hech qachon hisobga qo'shilmaydi — tasdiqlangan_summa NULL qoladi. */
export async function tolovniRadEt(
  tolovId: number,
  adminId: number,
  sabab: string,
): Promise<Tolov | null> {
  const yangi = await sql.begin(async (tx) => {
    const [t] = await tx<Tolov[]>`
      SELECT * FROM tolovlar WHERE id = ${tolovId} AND holat = 'kutilmoqda' FOR UPDATE
    `;
    if (!t) return null;

    const [natija] = await tx<Tolov[]>`
      UPDATE tolovlar
      SET holat = 'rad', rad_sababi = ${sabab.trim().slice(0, 300)},
          hal_qildi = ${adminId}, hal_qilindi = now()
      WHERE id = ${tolovId}
      RETURNING *
    `;
    return natija ?? null;
  });

  // Rad etish ham "tekshiruv kutilmoqda"ni yopadi — endi haqiqatan ham
  // to'lanmagan bo'lib qoladi, demak surat yangilanishi kerak.
  if (yangi?.sikl_id) await muddatSuratiniYangila(yangi.sikl_id, yangi.user_id);
  return yangi;
}

export type TolovToliq = Tolov & { ism: string };

export async function tolovniOl(id: number): Promise<TolovToliq | null> {
  const [r] = await sql<TolovToliq[]>`
    SELECT t.*, u.ism FROM tolovlar t JOIN users u ON u.id = t.user_id WHERE t.id = ${id}
  `;
  return r ?? null;
}

/** Tarixda kim tekshirgani ham ko'rinishi uchun — faqat ko'rsatish uchun, hisobga tegmaydi. */
export type TolovTarix = Tolov & {
  hal_qildi_ism: string | null;
  /** Qaysi oyga tegishli (`YYYY-MM-01`). Migratsiyadan oldingi yozuvlarda `null`. */
  sikl_davr: string | null;
  /** `oylik` yoki `yigim` — tarixda ikkalasi aralash chiqadi. */
  sikl_tur: SiklTur | null;
  /** Yig'imning nomi — `sikl_tur='yigim'` bo'lganda to'ladi. */
  sikl_nom: string | null;
};

/**
 * Bitta odamning to'lov tarixi — eng yangisi birinchi.
 * `siklId` berilsa faqat o'sha oy, bo'lmasa butun tarix (oylar aralashmasin
 * uchun ko'rinishda oy bo'yicha guruhlanadi).
 */
export async function foydalanuvchiTolovlari(
  userId: number,
  siklId?: number,
): Promise<TolovTarix[]> {
  return sql<TolovTarix[]>`
    SELECT t.*, adm.ism AS hal_qildi_ism,
           to_char(s.davr, 'YYYY-MM-DD') AS sikl_davr,
           s.tur AS sikl_tur, s.nom AS sikl_nom
    FROM tolovlar t
    LEFT JOIN users adm ON adm.id = t.hal_qildi
    LEFT JOIN tolov_sikllari s ON s.id = t.sikl_id
    WHERE t.user_id = ${userId}
      AND (${siklId ?? null}::int IS NULL OR t.sikl_id = ${siklId ?? null}::int)
    ORDER BY t.id DESC
  `;
}

/** Hali admin ko'rib chiqmagan to'lovlar — admin dashboard uchun. */
export async function kutayotganTolovlar(): Promise<TolovToliq[]> {
  return sql<TolovToliq[]>`
    SELECT t.*, u.ism FROM tolovlar t JOIN users u ON u.id = t.user_id
    WHERE t.holat = 'kutilmoqda' ORDER BY t.id
  `;
}

/** Har bir bog'langan adminga yuborilgan xabar id'sini saqlaydi — keyin hammasini yangilash uchun. */
export async function adminXabarlarniSaqla(
  id: number,
  xabarlar: { chat_id: number; message_id: number }[],
): Promise<void> {
  await sql`UPDATE tolovlar SET admin_msgs = ${sql.json(xabarlar)} WHERE id = ${id}`;
}

/** Guruhdagi e'lon xabari id'si — faqat tasdiqlangandan keyin yuboriladi. */
export async function guruhXabarniSaqla(id: number, messageId: number): Promise<void> {
  await sql`UPDATE tolovlar SET guruh_msg_id = ${messageId} WHERE id = ${id}`;
}

// ---------------------------------------------------------------------------
// MUDDAT SURATI
// ---------------------------------------------------------------------------

export type MuddatSurati = MuddatNatija & { userId: number; ism: string };

type SuratQator = {
  user_id: number;
  ism: string;
  tasdiqlangan: string;
  kutilmoqda: string;
  /** NULL bo'lsa siklning umumiy talabi (`amaldagiTalab`) */
  shaxsiy_talab: string | null;
};

/**
 * Muddatgacha YUBORILGAN to'lovlar bo'yicha yig'indi.
 *
 * `created_at <= muddat` filtri butun mexanizmning yuragi: 14-avgustda
 * yuborilgan to'lov 16-avgustda tasdiqlansa ham AVGUST muddatiga kiradi,
 * chunki odam o'z ishini muddatida bajargan.
 */
async function muddatYigindisi(
  sikl: TolovSikl,
  userId?: number,
  db: Baza = sql,
): Promise<SuratQator[]> {
  return db<SuratQator[]>`
    SELECT u.id AS user_id, u.ism,
           (COALESCE(SUM(t.tasdiqlangan_summa) FILTER (WHERE t.holat = 'tasdiqlandi'), 0) +
            COALESCE((SELECT SUM(tz.summa) FROM tolov_tuzatish tz
                      WHERE tz.user_id = u.id AND tz.sikl_id = ${sikl.id}
                        AND (tz.created_at AT TIME ZONE 'Asia/Tashkent')::date <= ${sikl.muddat}::date), 0)
           )::bigint AS tasdiqlangan,
           COALESCE(SUM(t.kiritgan_summa)     FILTER (WHERE t.holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda,
           h.shaxsiy_talab
    FROM users u
    LEFT JOIN tolovlar t
      ON t.user_id = u.id
     AND t.sikl_id = ${sikl.id}
     AND (t.created_at AT TIME ZONE 'Asia/Tashkent')::date <= ${sikl.muddat}::date
    LEFT JOIN tolov_holat h ON h.sikl_id = ${sikl.id} AND h.user_id = u.id
    WHERE u.faol AND (${userId ?? null}::int IS NULL OR u.id = ${userId ?? null}::int)
    GROUP BY u.id, u.ism, h.shaxsiy_talab
    ORDER BY u.ism
  `;
}

async function suratniYoz(
  siklId: number,
  userId: number,
  n: MuddatNatija,
  db: Baza = sql,
): Promise<void> {
  await db`
    INSERT INTO tolov_holat (
      sikl_id, user_id, muddat_talab, muddat_tasdiqlangan, muddat_kutilmoqda,
      muddat_qoldiq, muddat_daraja, muddat_vaqti
    )
    VALUES (
      ${siklId}, ${userId}, ${n.talab}, ${n.tasdiqlangan}, ${n.kutilmoqda},
      ${n.qoldiq}, ${n.daraja}, now()
    )
    ON CONFLICT (sikl_id, user_id) DO UPDATE SET
      muddat_talab        = EXCLUDED.muddat_talab,
      muddat_tasdiqlangan = EXCLUDED.muddat_tasdiqlangan,
      muddat_kutilmoqda   = EXCLUDED.muddat_kutilmoqda,
      muddat_qoldiq       = EXCLUDED.muddat_qoldiq,
      muddat_daraja       = EXCLUDED.muddat_daraja,
      muddat_vaqti        = EXCLUDED.muddat_vaqti
  `;
}

/**
 * Muddat kelgan siklni suratga oladi va holatini `muddat_yetdi` ga o'tkazadi.
 *
 * HAMMASI BITTA TRANZAKSIYADA. Ikki sabab:
 *
 *  1) Sikl qatori `FOR UPDATE` bilan qulflanadi va holat qayta
 *     tekshiriladi — cron, GitHub Actions pingi va webhook uchalasi bir
 *     vaqtda kelsa ham surat bir marta olinadi. Ikkinchi chaqiruv `null`
 *     qaytaradi, ya'ni e'lon ham ikki marta yuborilmaydi.
 *
 *  2) Jarayon o'rtada uzilib qolsa (serverless funksiya to'xtatilishi
 *     odatiy hol), sikl "muddat_yetdi" bo'lib, lekin bir qism odamning
 *     surati yozilmay qolmasligi kerak edi — aks holda ular dashboardda
 *     "muddat hali kelmagan" bo'lib ko'rinardi.
 *
 * Xabar yuborish ataylab TASHQARIDA (`jobs/reminders.ts`): Telegram
 * so'rovlari tranzaksiyani uzoq ushlab turmasligi kerak.
 */
export async function siklMuddatiniHisobla(sikl: TolovSikl): Promise<MuddatSurati[] | null> {
  return sql.begin(async (tx) => {
    const [s] = await tx<{ holat: string }[]>`
      SELECT holat FROM tolov_sikllari WHERE id = ${sikl.id} FOR UPDATE
    `;
    if (!s || s.holat !== "ochiq") return null;

    const qatorlar = await muddatYigindisi(sikl, undefined, tx);
    const natijalar: MuddatSurati[] = [];

    for (const q of qatorlar) {
      const n = muddatNatijasi({
        talab: amaldagiTalab(sikl.talab, q.shaxsiy_talab),
        tasdiqlangan: Number(q.tasdiqlangan),
        kutilmoqda: Number(q.kutilmoqda),
      });
      await suratniYoz(sikl.id, q.user_id, n, tx);
      natijalar.push({ ...n, userId: q.user_id, ism: q.ism });
    }

    await tx`
      UPDATE tolov_sikllari
      SET holat = 'muddat_yetdi', muddat_hisoblandi = now()
      WHERE id = ${sikl.id}
    `;

    return natijalar;
  });
}

/**
 * Bitta odamning muddat suratini qayta hisoblaydi — to'lovi muddatdan keyin
 * tasdiqlangan yoki rad etilgan bo'lsa. Sikl hali suratga olinmagan bo'lsa
 * hech narsa qilmaydi (surat muddat kelganda olinadi).
 */
export async function muddatSuratiniYangila(
  siklId: number,
  userId: number,
): Promise<MuddatNatija | null> {
  const sikl = await siklniOl(siklId);
  if (!sikl || sikl.holat === "ochiq") return null;
  // Yig'imda "muddatda qancha yetmagan edi" degan savol yo'q —
  // surat ham faqat oylik siklniki. Yig'imga to'lov ham shu funksiyadan
  // o'tadi (bitta tasdiqlash yo'li), shuning uchun to'siq aynan shu yerda.
  if (sikl.tur === "yigim") return null;

  const [q] = await muddatYigindisi(sikl, userId);
  if (!q) return null;

  const n = muddatNatijasi({
    talab: amaldagiTalab(sikl.talab, q.shaxsiy_talab),
    tasdiqlangan: Number(q.tasdiqlangan),
    kutilmoqda: Number(q.kutilmoqda),
  });
  await suratniYoz(siklId, userId, n);
  return n;
}

/** Muddat suratini o'qish — hali olinmagan bo'lsa `null`. */
export async function muddatSuratiniOl(
  siklId: number,
  userId: number,
): Promise<MuddatNatija | null> {
  const [r] = await sql<
    {
      muddat_talab: string | null;
      muddat_tasdiqlangan: string | null;
      muddat_kutilmoqda: string | null;
      muddat_qoldiq: string | null;
      muddat_daraja: TolovDaraja | null;
    }[]
  >`
    SELECT muddat_talab, muddat_tasdiqlangan, muddat_kutilmoqda,
           muddat_qoldiq, muddat_daraja
    FROM tolov_holat WHERE sikl_id = ${siklId} AND user_id = ${userId}
  `;
  if (!r?.muddat_daraja || r.muddat_talab === null) return null;

  const kutilmoqda = Number(r.muddat_kutilmoqda ?? 0);
  const qoldiq = Number(r.muddat_qoldiq ?? 0);
  return {
    talab: Number(r.muddat_talab),
    tasdiqlangan: Number(r.muddat_tasdiqlangan ?? 0),
    kutilmoqda,
    qoldiq,
    daraja: r.muddat_daraja,
    tekshiruvKutilmoqda: qoldiq > 0 && kutilmoqda > 0,
  };
}

/** Admin siklni yakunlaydi — tarix o'chirilmaydi, faqat holat yopiladi. */
export async function siklniYakunla(siklId: number): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    UPDATE tolov_sikllari SET holat = 'yakunlandi', yakunlandi = now()
    WHERE id = ${siklId} AND holat = 'muddat_yetdi'
    RETURNING ${siklUstunlari()}
  `;
  return s ? siklMap(s) : null;
}

// ---------------------------------------------------------------------------
// QO'LDA TUZATISH
// ---------------------------------------------------------------------------

/**
 * Admin to'lovni qo'lda tuzatadi — dalil (chek) TALAB QILINMAYDI.
 * `core/users.ts`dagi `ballTuzat` bilan bir xil falsafa: mavjud hisoblash
 * (`tolovlar`dan SUM) buzilmaydi, bu shunga qo'shiladigan qo'shimcha manba.
 *
 * Musbat summa — masalan naqd qo'lma-qo'l olingan pulni "to'ladi" deb
 * belgilash. Manfiy summa — xato tasdiqlangan/kiritilgan to'lovni ortga
 * qaytarish, ya'ni odamni qayta qarzdor qilib belgilash (talab: admin
 * har qanday odamni "to'ladi/to'lamadi" deb bemalol o'zgartira olishi
 * kerak, dalilga qaramasdan).
 *
 * Muddat surati qayta hisoblanadi — `tolovniTasdiqla`/`tolovniRadEt` bilan
 * bir xil naqsh, aks holda tuzatish dashboardda ko'rinsa ham muddat
 * natijasida (kechikkanmi) eskirgan raqam qolib ketardi.
 */
export async function tolovTuzat(
  userId: number,
  siklId: number,
  summa: number,
  sabab: string,
  adminId: number,
): Promise<void> {
  const toza = sabab.trim().slice(0, 300);
  await sql`
    INSERT INTO tolov_tuzatish (user_id, sikl_id, summa, sabab, admin_id)
    VALUES (${userId}, ${siklId}, ${summa}, ${toza || null}, ${adminId})
  `;
  await muddatSuratiniYangila(siklId, userId);
  await logla(
    adminId,
    "tolov_tuzatildi",
    "user",
    userId,
    null,
    `${summa > 0 ? "+" : ""}${summa}: ${toza}`,
  );
}

/** Bitta odamning shu sikldagi qo'lda tuzatishlari — admin ko'rinishida (ball_tuzatishTarixi bilan bir xil naqsh). */
export async function tolovTuzatishTarixi(
  userId: number,
  siklId: number,
  limit = 10,
): Promise<{ summa: number; sabab: string | null; admin_ism: string; created_at: Date }[]> {
  const rows = await sql<
    { summa: string; sabab: string | null; admin_ism: string; created_at: Date }[]
  >`
    SELECT tz.summa, tz.sabab, a.ism AS admin_ism, tz.created_at
    FROM tolov_tuzatish tz JOIN users a ON a.id = tz.admin_id
    WHERE tz.user_id = ${userId} AND tz.sikl_id = ${siklId}
    ORDER BY tz.id DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, summa: Number(r.summa) }));
}

// ---------------------------------------------------------------------------
// ESLATMA
// ---------------------------------------------------------------------------

export type EslatmaNomzodi = {
  userId: number;
  ism: string;
  /** To'liq qator — `shaxsiy()` shuni kutadi, sun'iy obyekt yasalmaydi. */
  user: User;
  /** Shu ODAMDAN talab qilinadigan summa (shaxsiy bo'lishi mumkin) */
  talab: number;
  tasdiqlangan: number;
  qoldiq: number;
  kutilmoqdaSumma: number;
  /**
   * Yig'im eslatmasi — har bir necha SOATDA, shuning uchun aniq lahza
   * kerak. Ikkalasi bir qatorda yonma-yon: bitta (sikl, odam) juftligi
   * ikkala turga tegishli bo'la olmaydi, demak chalkashmaydi.
   */
  oxirgiEslatmaTs: Date | null;
  /** Oxirgi "🙁 To'lay olmayapman" sababi yozilgan payt — tinim shundan */
  oxirgiUzrTs: Date | null;
};

/**
 * Shu sikl bo'yicha eslatma yuborish mumkin bo'lgan odamlar — qarzi
 * borlarigina. Kimga aynan bugun yuborish kerakligini
 * `tolovEslatmasiKerakmi` hal qiladi (sof funksiya, alohida sinaladi).
 *
 * Bu yerda muddatgacha filtri YO'Q: eslatma joriy qarzga qaraydi, muddatdan
 * keyin to'langan pul ham qarzni kamaytiradi.
 */
export async function eslatmaNomzodlari(sikl: TolovSikl): Promise<EslatmaNomzodi[]> {
  // `GROUP BY u.id` yetarli — u.id birlamchi kalit, shuning uchun Postgres
  // qolgan `u.*` ustunlarini funksional bog'liq deb qabul qiladi.
  const rows = await sql<
    (User & {
      tasdiqlangan: string;
      kutilmoqda_summa: string;
      oxirgi_eslatma_ts: Date | null;
      shaxsiy_talab: string | null;
      oxirgi_uzr_ts: Date | null;
    })[]
  >`
    SELECT u.*,
           (COALESCE(SUM(t.tasdiqlangan_summa) FILTER (WHERE t.holat = 'tasdiqlandi'), 0) +
            COALESCE((SELECT SUM(tz.summa) FROM tolov_tuzatish tz
                      WHERE tz.user_id = u.id AND tz.sikl_id = ${sikl.id}), 0)
           )::bigint AS tasdiqlangan,
           COALESCE(SUM(t.kiritgan_summa)     FILTER (WHERE t.holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda_summa,
           h.oxirgi_eslatma_ts,
           h.shaxsiy_talab,
           (SELECT max(uz.created_at) FROM tolov_uzrlari uz
             WHERE uz.sikl_id = ${sikl.id} AND uz.user_id = u.id) AS oxirgi_uzr_ts
    FROM users u
    LEFT JOIN tolovlar t ON t.user_id = u.id AND t.sikl_id = ${sikl.id}
    LEFT JOIN tolov_holat h ON h.sikl_id = ${sikl.id} AND h.user_id = u.id
    WHERE u.faol AND u.telegram_id IS NOT NULL
    GROUP BY u.id, h.oxirgi_eslatma_ts, h.shaxsiy_talab
    ORDER BY u.ism
  `;

  return rows.map((r) => {
    const tasdiqlangan = Number(r.tasdiqlangan);
    const talab = amaldagiTalab(sikl.talab, r.shaxsiy_talab);
    return {
      userId: r.id,
      ism: r.ism,
      user: r,
      talab,
      tasdiqlangan,
      qoldiq: Math.max(0, talab - tasdiqlangan),
      kutilmoqdaSumma: Number(r.kutilmoqda_summa),
      oxirgiEslatmaTs: r.oxirgi_eslatma_ts,
      oxirgiUzrTs: r.oxirgi_uzr_ts,
    };
  });
}

/**
 * Yig'im eslatmasi yuborildi — LAHZA bilan (soatlik chastota uchun).
 * `eslatmaBelgila` bilan bir xil naqsh, faqat ustuni boshqa.
 */
export async function eslatmaTsBelgila(siklId: number, userId: number): Promise<void> {
  await sql`
    INSERT INTO tolov_holat (sikl_id, user_id, oxirgi_eslatma_ts)
    VALUES (${siklId}, ${userId}, now())
    ON CONFLICT (sikl_id, user_id) DO UPDATE SET oxirgi_eslatma_ts = EXCLUDED.oxirgi_eslatma_ts
  `;
}

/** Guruhga kuniga bir marta — `turns.oxirgi_ping` bilan bir xil naqsh. */
export async function guruhEslatmasiniBelgila(siklId: number, kun: string): Promise<void> {
  await sql`UPDATE tolov_sikllari SET guruh_eslatma = ${kun}::date WHERE id = ${siklId}`;
}

// ---------------------------------------------------------------------------
// ADMIN KO'RINISHI
// ---------------------------------------------------------------------------

export type SiklOdam = {
  userId: number;
  ism: string;
  /** Shu ODAMDAN talab qilinadigan summa (shaxsiy bo'lishi mumkin) */
  talab: number;
  /** Talab siklning umumiysi emas, shu odamga alohida qo'yilgan */
  shaxsiy: boolean;
  tasdiqlangan: number;
  qoldiq: number;
  kutilmoqdaSumma: number;
  kutilmoqdaSoni: number;
  daraja: TolovDaraja;
  /** Muddat o'tgan va qarzi qolgan */
  kechikkan: boolean;
  /** Muddat surati — muddat hali kelmagan bo'lsa `null` */
  muddat: MuddatNatija | null;
  /** Oxirgi "🙁 To'lay olmayapman" sababi — FAQAT admin ko'rinishlari uchun */
  uzr: Uzr | null;
};

export type TolovDashboard = {
  sikl: TolovSikl;
  talab: number;
  jamiTalab: number;
  jamiTasdiqlangan: number;
  jamiQoldiq: number;
  kutilmoqdaSoni: number;
  radSoni: number;
  odamlar: SiklOdam[];
  tola: SiklOdam[];
  qisman: SiklOdam[];
  tolanmagan: SiklOdam[];
  /** Qarzi borlar (qisman + tolanmagan) — eng ko'p qarzdori birinchi */
  qarzdorlar: SiklOdam[];
  /** Muddat o'tgan va hamon qarzi bor — `qarzdorlar`ning quyi to'plami */
  kechikkanlar: SiklOdam[];
};

/** Admin/Sorabek uchun umumiy ko'rinish: shu oyda kim qancha to'lagan. */
export async function tolovDashboard(sikl?: TolovSikl): Promise<TolovDashboard> {
  const s = sikl ?? (await joriySikl());

  const qatorlar = await sql<
    {
      user_id: number;
      ism: string;
      tasdiqlangan: string;
      kutilmoqda_summa: string;
      kutilmoqda_soni: number;
      rad_soni: number;
      muddat_talab: string | null;
      muddat_tasdiqlangan: string | null;
      muddat_kutilmoqda: string | null;
      muddat_qoldiq: string | null;
      muddat_daraja: TolovDaraja | null;
      shaxsiy_talab: string | null;
      uzr_sabab: string | null;
      uzr_vaqt: Date | null;
    }[]
  >`
    SELECT u.id AS user_id, u.ism,
           (COALESCE(SUM(t.tasdiqlangan_summa) FILTER (WHERE t.holat = 'tasdiqlandi'), 0) +
            COALESCE((SELECT SUM(tz.summa) FROM tolov_tuzatish tz
                      WHERE tz.user_id = u.id AND tz.sikl_id = ${s.id}), 0)
           )::bigint AS tasdiqlangan,
           COALESCE(SUM(t.kiritgan_summa)     FILTER (WHERE t.holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda_summa,
           count(t.id) FILTER (WHERE t.holat = 'kutilmoqda')::int AS kutilmoqda_soni,
           count(t.id) FILTER (WHERE t.holat = 'rad')::int        AS rad_soni,
           h.muddat_talab, h.muddat_tasdiqlangan, h.muddat_kutilmoqda,
           h.muddat_qoldiq, h.muddat_daraja, h.shaxsiy_talab,
           uz.sabab AS uzr_sabab, uz.created_at AS uzr_vaqt
    FROM users u
    LEFT JOIN tolovlar t ON t.user_id = u.id AND t.sikl_id = ${s.id}
    LEFT JOIN tolov_holat h ON h.sikl_id = ${s.id} AND h.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT sabab, created_at FROM tolov_uzrlari
      WHERE sikl_id = ${s.id} AND user_id = u.id
      ORDER BY id DESC LIMIT 1
    ) uz ON TRUE
    WHERE u.faol
    GROUP BY u.id, u.ism, h.muddat_talab, h.muddat_tasdiqlangan,
             h.muddat_kutilmoqda, h.muddat_qoldiq, h.muddat_daraja, h.shaxsiy_talab,
             uz.sabab, uz.created_at
    ORDER BY u.ism
  `;

  const odamlar: SiklOdam[] = qatorlar.map((q) => {
    const tasdiqlangan = Number(q.tasdiqlangan);
    const talab = amaldagiTalab(s.talab, q.shaxsiy_talab);
    const qoldiq = Math.max(0, talab - tasdiqlangan);
    const kechikkan = kechikkanmi(qoldiq, s.muddat);
    const muddatQoldiq = Number(q.muddat_qoldiq ?? 0);
    const muddatKutilmoqda = Number(q.muddat_kutilmoqda ?? 0);
    return {
      userId: q.user_id,
      ism: q.ism,
      talab,
      shaxsiy: q.shaxsiy_talab !== null,
      tasdiqlangan,
      qoldiq,
      kutilmoqdaSumma: Number(q.kutilmoqda_summa),
      kutilmoqdaSoni: q.kutilmoqda_soni,
      daraja: hisoblaDaraja(tasdiqlangan, talab),
      kechikkan,
      muddat:
        q.muddat_daraja && q.muddat_talab !== null
          ? {
              talab: Number(q.muddat_talab),
              tasdiqlangan: Number(q.muddat_tasdiqlangan ?? 0),
              kutilmoqda: muddatKutilmoqda,
              qoldiq: muddatQoldiq,
              daraja: q.muddat_daraja,
              tekshiruvKutilmoqda: muddatQoldiq > 0 && muddatKutilmoqda > 0,
            }
          : null,
      uzr: q.uzr_sabab && q.uzr_vaqt ? { sabab: q.uzr_sabab, vaqt: q.uzr_vaqt } : null,
    };
  });

  const jamiTasdiqlangan = odamlar.reduce((n, o) => n + o.tasdiqlangan, 0);
  // Har kimning O'Z talabidan — shaxsiy summa qo'yilgan odam bo'lsa
  // `talab × odam soni` noto'g'ri jami berardi.
  const jamiTalab = odamlar.reduce((n, o) => n + o.talab, 0);

  return {
    sikl: s,
    talab: s.talab,
    jamiTalab,
    jamiTasdiqlangan,
    jamiQoldiq: Math.max(0, jamiTalab - jamiTasdiqlangan),
    kutilmoqdaSoni: odamlar.reduce((n, o) => n + o.kutilmoqdaSoni, 0),
    radSoni: qatorlar.reduce((n, q) => n + q.rad_soni, 0),
    odamlar,
    tola: odamlar.filter((o) => o.daraja === "tola"),
    qisman: odamlar.filter((o) => o.daraja === "qisman"),
    tolanmagan: odamlar.filter((o) => o.daraja === "tolanmagan"),
    // Eng ko'p qarzdori birinchi — admin kimdan boshlashini bir qarashda ko'rsin.
    qarzdorlar: odamlar.filter((o) => o.qoldiq > 0).sort((a, b) => b.qoldiq - a.qoldiq),
    kechikkanlar: odamlar.filter((o) => o.kechikkan).sort((a, b) => b.qoldiq - a.qoldiq),
  };
}

export type SiklXulosa = {
  sikl: TolovSikl;
  jamiTalab: number;
  jamiTasdiqlangan: number;
  jamiQoldiq: number;
  odamSoni: number;
};

/**
 * Oxirgi oylarning qisqa xulosasi — admin "📜 Tarix" tugmasida ko'radi.
 * Har oy o'z siklidagi TALAB bilan hisoblanadi (joriy sozlama bilan emas),
 * shuning uchun o'tgan oy ko'rsatkichlari keyin ham o'zgarmaydi.
 */
export async function siklTarixi(limit = 12): Promise<SiklXulosa[]> {
  const sikllar = await sikllarRoyxati(limit);
  if (sikllar.length === 0) return [];

  const yigindilar = await sql<{ sikl_id: number; tasdiqlangan: string }[]>`
    SELECT sikl_id, COALESCE(SUM(tasdiqlangan_summa), 0)::bigint AS tasdiqlangan
    FROM tolovlar
    WHERE holat = 'tasdiqlandi' AND sikl_id = ANY(${sikllar.map((s) => s.id)})
    GROUP BY sikl_id
  `;

  // Qo'lda tuzatishlar ham shu oyning yig'indisiga qo'shiladi — dashboard
  // bilan bir xil hisoblash (yagona joy printsipi buzilmasin).
  const tuzatishlar = await sql<{ sikl_id: number; summa: string }[]>`
    SELECT sikl_id, COALESCE(SUM(summa), 0)::bigint AS summa
    FROM tolov_tuzatish
    WHERE sikl_id = ANY(${sikllar.map((s) => s.id)})
    GROUP BY sikl_id
  `;

  const [odam] = await sql<{ soni: number }[]>`
    SELECT count(*)::int AS soni FROM users WHERE faol
  `;
  const odamSoni = odam?.soni ?? 0;

  return sikllar.map((sikl) => {
    const jamiTasdiqlangan =
      Number(yigindilar.find((y) => y.sikl_id === sikl.id)?.tasdiqlangan ?? 0) +
      Number(tuzatishlar.find((t) => t.sikl_id === sikl.id)?.summa ?? 0);
    const jamiTalab = sikl.talab * odamSoni;
    return {
      sikl,
      jamiTalab,
      jamiTasdiqlangan,
      jamiQoldiq: Math.max(0, jamiTalab - jamiTasdiqlangan),
      odamSoni,
    };
  });
}

// ---------------------------------------------------------------------------
// PUL YIG'IMI
// ---------------------------------------------------------------------------

/**
 * Yig'im — admin istalgan paytda boshlaydigan bir martalik pul yig'imi
 * ("internet puli", "suv", "yangi changyutgich"). Bu YANGI TIZIM EMAS:
 * yuqoridagi butun mexanizm (chek yuborish, admin tekshiruvi, qo'lda
 * tuzatish, dashboard, guruh e'loni) o'zgarmasdan ishlatiladi, yig'im
 * shunchaki `tolov_sikllari`ning ikkinchi turi.
 *
 * Oylik sikldan uchta farqi bor, uchalasi ham ATAYLAB:
 *
 *  1) `davr` yo'q — kalendar oyiga bog'lanmaydi, `nom` esa bor.
 *  2) MUDDAT SURATI OLINMAYDI (`muddatiOtganSikllar` `tur='oylik'` bilan
 *     cheklangan). Yig'imda "muddatda yetmagan edi" degan savol yo'q:
 *     pul yig'ilmaguncha eslatma davom etadi, xolos.
 *  3) Bir vaqtda BITTA ochiq yig'im (bazadagi qisman UNIQUE indeks).
 *     Aks holda chek qaysi yig'imga tegishli ekani noaniq bo'lardi.
 */

/** Hozir ochiq turgan yig'im — yo'q bo'lsa `null`. */
export async function ochiqYigim(): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari
    WHERE tur = 'yigim' AND holat = 'ochiq' LIMIT 1
  `;
  return s ? siklMap(s) : null;
}

/** Eng yangisi birinchi — admin tarixni ko'rishi uchun. */
export async function yigimlarRoyxati(limit = 10): Promise<TolovSikl[]> {
  const rows = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari
    WHERE tur = 'yigim' ORDER BY id DESC LIMIT ${limit}
  `;
  return rows.map(siklMap);
}

/**
 * Yangi yig'im ochadi. Allaqachon ochiq yig'im bo'lsa `null` qaytaradi —
 * chaqiruvchi adminga tushunarli xabar beradi. Poyga holatida bazadagi
 * qisman UNIQUE indeks ikkinchisini baribir to'sadi, shuning uchun
 * `ON CONFLICT DO NOTHING` ham qo'yilgan: ikki admin bir vaqtda bossa
 * ikkinchisi jimgina `null` oladi, xato tashlanmaydi.
 *
 * `talab` shu yerda MUZLATILADI (oylik sikldagi bilan bir xil qoida):
 * keyin admin summani o'zgartirsa ham bu YANGI qiymat bo'ladi, eski
 * yig'imlarning tarixi qayta hisoblanmaydi.
 */
export async function yigimYarat(
  nom: string,
  talab: number,
  kun: number,
  narsalar: string[] = [],
): Promise<TolovSikl | null> {
  const toza = nom.trim().slice(0, 80);
  const muddat = kunQosh(bugungiSana(), Math.max(0, kun));

  const [s] = await sql<SiklQator[]>`
    INSERT INTO tolov_sikllari (tur, nom, narsalar, talab, muddat)
    VALUES (
      'yigim', ${toza},
      ${narsalar.length > 0 ? narsalar : null},
      ${talab}, ${muddat}::date
    )
    ON CONFLICT DO NOTHING
    RETURNING ${siklUstunlari()}
  `;
  return s ? siklMap(s) : null;
}

/**
 * Yig'imni yopadi. Oylik sikldagi `siklniYakunla`dan ALOHIDA: u
 * `muddat_yetdi` holatini talab qiladi (surat olingan bo'lishi shart),
 * yig'imda esa surat degan bosqich yo'q — admin xohlagan paytda yopadi.
 *
 * Tarix o'chirilmaydi: to'lovlar, tuzatishlar va yig'imning o'zi joyida
 * qoladi, faqat holat yopiladi va yangi yig'im ochish yo'li bo'shaydi.
 */
export async function yigimniYakunla(id: number): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    UPDATE tolov_sikllari SET holat = 'yakunlandi', yakunlandi = now()
    WHERE id = ${id} AND tur = 'yigim' AND holat = 'ochiq'
    RETURNING ${siklUstunlari()}
  `;
  return s ? siklMap(s) : null;
}

/**
 * Ochiq yig'imning summasini o'zgartiradi — "30 ming deb boshlagan edim,
 * 35 ming bo'lar ekan". Oylik sikldagi `tolovTalabiniOrnat`dan farqli
 * o'laroq bu JORIY yig'imga darrov ta'sir qiladi: yig'im hali davom
 * etayotgan bitta voqea, "o'tgan davrni qayta yozmaslik" qoidasi bu yerga
 * tegishli emas. Yopilgan yig'im esa o'zgarmaydi (`holat = 'ochiq'` sharti).
 */
export async function yigimTalabiniOzgartir(
  id: number,
  talab: number,
): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    UPDATE tolov_sikllari SET talab = ${talab}
    WHERE id = ${id} AND tur = 'yigim' AND holat = 'ochiq'
    RETURNING ${siklUstunlari()}
  `;
  return s ? siklMap(s) : null;
}

/** Ochiq yig'imning muddatini "bugundan N kun" qilib suradi. */
export async function yigimMuddatiniOzgartir(
  id: number,
  kun: number,
): Promise<TolovSikl | null> {
  const muddat = kunQosh(bugungiSana(), Math.max(0, kun));
  const [s] = await sql<SiklQator[]>`
    UPDATE tolov_sikllari SET muddat = ${muddat}::date
    WHERE id = ${id} AND tur = 'yigim' AND holat = 'ochiq'
    RETURNING ${siklUstunlari()}
  `;
  return s ? siklMap(s) : null;
}

/** Yig'imning nomini tuzatadi (xato yozilgan bo'lsa). */
export async function yigimNominiOzgartir(
  id: number,
  nom: string,
): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    UPDATE tolov_sikllari SET nom = ${nom.trim().slice(0, 80)}
    WHERE id = ${id} AND tur = 'yigim' AND holat = 'ochiq'
    RETURNING ${siklUstunlari()}
  `;
  return s ? siklMap(s) : null;
}

/**
 * Ochiq yig'imning savdo ro'yxatini ALMASHTIRADI. Yig'im hali davom
 * etayotgan voqea (`yigimTalabiniOzgartir` bilan bir xil sabab) — admin
 * e'londan keyin "yana idish yuvish suyuqligi ham kerak" deb qo'shishi
 * yoki `NOM_MAX` dan oldin nomga yozilib kesilgan ro'yxatni to'g'rilashi
 * mumkin. Yopilgan yig'im o'zgarmaydi.
 */
// ---------------------------------------------------------------------------
// "TO'LAY OLMAYAPMAN" — qarzdorning o'z sababi
// ---------------------------------------------------------------------------

/**
 * Sabab yozilgach shu odamga eslatma necha soat to'xtab turadi.
 *
 * "Maoshim 25-da tushadi" deb yozgan odamni o'sha kuni yana har 5 soatda
 * bezovta qilish uning botni o'chirib qo'yishiga olib keladi. To'liq
 * to'xtatib ham bo'lmaydi — qarz o'z-o'zidan yo'qolmaydi. Bir kunlik tinim:
 * admin sababni ko'rib ulguradi (kerak bo'lsa "🧾 Shaxsiy summa" qo'yadi),
 * so'ng eslatma o'z jadvaliga qaytadi.
 */
export const UZR_TINIM_SOAT = 24;

/** Sabab uzunligi — admin DM'ida va dashboard qatorida sig'sin. */
export const UZR_MAX = 300;

export type Uzr = { sabab: string; vaqt: Date };

/** Yangi sabab — har biri alohida qator, eskisi bosib yozilmaydi. */
export async function uzrYoz(siklId: number, userId: number, sabab: string): Promise<void> {
  await sql`
    INSERT INTO tolov_uzrlari (sikl_id, user_id, sabab)
    VALUES (${siklId}, ${userId}, ${sabab.trim().slice(0, UZR_MAX)})
  `;
}

/** Bitta odamning shu sikldagi barcha sabablari — eng yangisi birinchi. */
export async function uzrlarTarixi(siklId: number, userId: number): Promise<Uzr[]> {
  return sql<Uzr[]>`
    SELECT sabab, created_at AS vaqt FROM tolov_uzrlari
    WHERE sikl_id = ${siklId} AND user_id = ${userId}
    ORDER BY id DESC
  `;
}

/**
 * Sabab yozilganidan beri tinim hali tugamaganmi — sof funksiya, ikkala
 * eslatma (`tolovEslatmasiKerakmi`, `yigimEslatmasiKerakmi`) ham shundan
 * o'tadi.
 */
export function uzrTinimidami(uzrTs: Date | null | undefined, hozir: number): boolean {
  if (!uzrTs) return false;
  return hozir - new Date(uzrTs).getTime() < UZR_TINIM_SOAT * 3_600_000;
}

export async function yigimNarsalariniOzgartir(
  id: number,
  narsalar: string[],
): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    UPDATE tolov_sikllari SET narsalar = ${narsalar.length > 0 ? narsalar : null}
    WHERE id = ${id} AND tur = 'yigim' AND holat = 'ochiq'
    RETURNING ${siklUstunlari()}
  `;
  return s ? siklMap(s) : null;
}

/**
 * Shu odamga hozir yig'im eslatmasi yuborilsinmi — sof funksiya,
 * `tolovEslatmasiKerakmi` bilan bir xil naqsh (bazasiz sinaladi).
 *
 * Oylikdagidan farqi: u KUNGA (sana solishtiriladi), bu esa SOATGA
 * qaraydi va muddatdan mustaqil — yig'im "har 5 soatda, to'langunicha"
 * degan talabdan kelib chiqqan. Qarzi yo'q odam ro'yxatga umuman
 * tushmaydi, ya'ni to'laganidan keyin eslatma O'ZIDAN to'xtaydi
 * (alohida "o'chirish" bayrog'i yo'q — `turns.oxirgi_ping` bilan bir xil
 * "holatdan qayta hisoblash" intizomi).
 */
export function yigimEslatmasiKerakmi(p: {
  qoldiq: number;
  hozir: number;
  oxirgiTs: Date | null;
  oraliqSoat: number;
  /** Odam "🙁 To'lay olmayapman" deb sabab yozgan oxirgi lahza */
  uzrTs?: Date | null;
}): boolean {
  if (p.qoldiq <= 0) return false;
  if (uzrTinimidami(p.uzrTs, p.hozir)) return false;
  if (!p.oxirgiTs) return true;
  return p.hozir - new Date(p.oxirgiTs).getTime() >= p.oraliqSoat * 3_600_000;
}

/** Yig'imlarning qisqa xulosasi — admin "📜 Tarix" da ko'radi. */
export async function yigimTarixi(limit = 10): Promise<SiklXulosa[]> {
  const yigimlar = await yigimlarRoyxati(limit);
  if (yigimlar.length === 0) return [];

  const idlar = yigimlar.map((y) => y.id);

  // Dashboard bilan bir xil ikki manba: tasdiqlangan cheklar + qo'lda
  // tuzatishlar. Yagona joy printsipi buzilmasin uchun `siklTarixi` bilan
  // bir xil shaklda hisoblanadi.
  const yigindilar = await sql<{ sikl_id: number; tasdiqlangan: string }[]>`
    SELECT sikl_id, COALESCE(SUM(tasdiqlangan_summa), 0)::bigint AS tasdiqlangan
    FROM tolovlar WHERE holat = 'tasdiqlandi' AND sikl_id = ANY(${idlar})
    GROUP BY sikl_id
  `;
  const tuzatishlar = await sql<{ sikl_id: number; summa: string }[]>`
    SELECT sikl_id, COALESCE(SUM(summa), 0)::bigint AS summa
    FROM tolov_tuzatish WHERE sikl_id = ANY(${idlar})
    GROUP BY sikl_id
  `;
  const [odam] = await sql<{ soni: number }[]>`
    SELECT count(*)::int AS soni FROM users WHERE faol
  `;
  const odamSoni = odam?.soni ?? 0;

  return yigimlar.map((sikl) => {
    const jamiTasdiqlangan =
      Number(yigindilar.find((y) => y.sikl_id === sikl.id)?.tasdiqlangan ?? 0) +
      Number(tuzatishlar.find((t) => t.sikl_id === sikl.id)?.summa ?? 0);
    const jamiTalab = sikl.talab * odamSoni;
    return {
      sikl,
      jamiTalab,
      jamiTasdiqlangan,
      jamiQoldiq: Math.max(0, jamiTalab - jamiTasdiqlangan),
      odamSoni,
    };
  });
}
