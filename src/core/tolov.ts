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
import { sql, type Tolov, type TolovDalilTuri, type TolovSikl, type User } from "../db/index.js";
import { config, TOLOV_STD } from "../config.js";
import { bugungiSana, kunFarqi, siklDavri } from "./vaqt.js";

let keshlanganTalab: number | undefined;
let keshlanganQabul: { ism: string; karta: string } | undefined;
let keshlanganJarimaFoiz: number | undefined;

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

/**
 * Muddatda yig'ilmay qolgan summadan olinadigan jarima foizi.
 *
 * Standart 0 = jarima o'chiq. Uy qoidalari kvartira to'lovi uchun jarima
 * belgilamagan (mavjud `jarimaKunlik` faqat tozalash navbatiga tegishli),
 * shuning uchun bot o'zicha moliyaviy qoida o'ylab chiqarmaydi — foizni
 * admin ochiq ravishda o'zi kiritadi.
 */
export async function tolovJarimaFoizi(): Promise<number> {
  if (keshlanganJarimaFoiz !== undefined) return keshlanganJarimaFoiz;
  const [r] = await sql<{ qiymat: string }[]>`
    SELECT qiymat FROM settings WHERE kalit = 'tolov_jarima_foiz'
  `;
  keshlanganJarimaFoiz = r ? Number(r.qiymat) : TOLOV_STD.jarimaFoiz;
  return keshlanganJarimaFoiz;
}

export async function tolovJarimaFoiziniOrnat(foiz: number): Promise<void> {
  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES ('tolov_jarima_foiz', ${String(foiz)})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
  keshlanganJarimaFoiz = foiz;
}

export type TolovDaraja = "tolanmagan" | "qisman" | "tola";

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

export async function siklniDavrBoyichaOl(davr: string): Promise<TolovSikl | null> {
  const [s] = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari WHERE davr = ${davr}::date
  `;
  return s ? siklMap(s) : null;
}

/** Eng yangisi birinchi — admin tarixni ko'rishi uchun. */
export async function sikllarRoyxati(limit = 12): Promise<TolovSikl[]> {
  const rows = await sql<SiklQator[]>`
    SELECT ${siklUstunlari()} FROM tolov_sikllari ORDER BY davr DESC LIMIT ${limit}
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
  const { davr, muddat } = siklDavri(new Date(), config.tolovMuddatKuni);

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
    WHERE holat = 'muddat_yetdi' AND davr < ${davr}::date
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
    WHERE holat = 'ochiq' AND muddat < ${bugun}::date
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
  /** Muddatda hali tekshiruvda turgan to'lovi bor edi — jarima kechiktiriladi */
  tekshiruvKutilmoqda: boolean;
  jarima: number;
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
 *     tekshirmagan bo'lsa, u JAZOLANMAYDI: `jarima` 0 bo'lib qoladi va
 *     `tekshiruvKutilmoqda` bayrog'i qo'yiladi. Admin tekshirgach surat
 *     qayta hisoblanadi (`muddatSuratiniYangila`) — o'shanda haqiqiy
 *     natija chiqadi. Talab: "Do not punish the user for the verification
 *     delay".
 *
 * `jarimaFoiz` standart holatda 0 — uy qoidasi kvartira to'lovi uchun
 * jarima belgilamagan, shuning uchun bot o'zicha summa o'ylab chiqarmaydi.
 */
export function muddatNatijasi(p: {
  talab: number;
  tasdiqlangan: number;
  kutilmoqda: number;
  jarimaFoiz: number;
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
    jarima: tekshiruvKutilmoqda ? 0 : Math.round((qoldiq * p.jarimaFoiz) / 100),
  };
}

/**
 * Shu odamga bugun to'lov eslatmasi yuborilsinmi.
 *
 * Spam bo'lmasligi uchun to'rt shart:
 *  - qarzi qolmagan bo'lsa — umuman yuborilmaydi (talab: to'liq to'lagan
 *    odam eslatma olishda davom etmasligi kerak);
 *  - bir kunda bir marta;
 *  - muddatga `eslatmaKuni` kundan ko'p qolgan bo'lsa hali erta;
 *  - muddat o'tib ketgan bo'lsa DAVOM ETADI — qarz o'z-o'zidan yo'qolmaydi.
 */
export function tolovEslatmasiKerakmi(p: {
  qoldiq: number;
  bugun: string;
  muddat: string;
  oxirgiEslatma: string | null;
  eslatmaKuni: number;
}): boolean {
  if (p.qoldiq <= 0) return false;
  if (p.oxirgiEslatma === p.bugun) return false;
  return kunFarqi(p.bugun, p.muddat) <= p.eslatmaKuni;
}

// ---------------------------------------------------------------------------
// FOYDALANUVCHI HOLATI
// ---------------------------------------------------------------------------

export type TolovHolatMalumoti = {
  talab: number;
  tasdiqlangan: number;
  qoldiq: number;
  daraja: TolovDaraja;
  /** Hali admin ko'rib chiqmagan (bu hisobga QO'SHILMAGAN) to'lovlar soni */
  kutilmoqdaSoni: number;
  /** O'sha kutayotgan to'lovlarda foydalanuvchi da'vo qilgan jami summa */
  kutilmoqdaSumma: number;
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
  const [r] = await sql<{ tasdiqlangan: string; kutilmoqda_summa: string; kutilmoqda: number }[]>`
    SELECT
      COALESCE(SUM(tasdiqlangan_summa) FILTER (WHERE holat = 'tasdiqlandi'), 0)::bigint AS tasdiqlangan,
      COALESCE(SUM(kiritgan_summa)     FILTER (WHERE holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda_summa,
      count(*) FILTER (WHERE holat = 'kutilmoqda')::int AS kutilmoqda
    FROM tolovlar WHERE user_id = ${userId} AND sikl_id = ${s.id}
  `;
  const tasdiqlangan = Number(r?.tasdiqlangan ?? 0);
  return {
    talab: s.talab,
    tasdiqlangan,
    qoldiq: Math.max(0, s.talab - tasdiqlangan),
    daraja: hisoblaDaraja(tasdiqlangan, s.talab),
    kutilmoqdaSoni: r?.kutilmoqda ?? 0,
    kutilmoqdaSumma: Number(r?.kutilmoqda_summa ?? 0),
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
): Promise<Tolov> {
  const sikl = await joriySikl();
  const [t] = await sql<Tolov[]>`
    INSERT INTO tolovlar (user_id, sikl_id, kiritgan_summa, dalil_id, dalil_turi)
    VALUES (${userId}, ${sikl.id}, ${kiritganSumma}, ${dalilId}, ${dalilTuri})
    RETURNING *
  `;
  if (!t) throw new Error("To'lov yozuvi yaratilmadi");
  return t;
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
 * yoziladi (talab: tekshiruv kechikkani uchun jarima yozilmasin).
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
           to_char(s.davr, 'YYYY-MM-DD') AS sikl_davr
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
           COALESCE(SUM(t.tasdiqlangan_summa) FILTER (WHERE t.holat = 'tasdiqlandi'), 0)::bigint AS tasdiqlangan,
           COALESCE(SUM(t.kiritgan_summa)     FILTER (WHERE t.holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda
    FROM users u
    LEFT JOIN tolovlar t
      ON t.user_id = u.id
     AND t.sikl_id = ${sikl.id}
     AND (t.created_at AT TIME ZONE 'Asia/Tashkent')::date <= ${sikl.muddat}::date
    WHERE u.faol AND (${userId ?? null}::int IS NULL OR u.id = ${userId ?? null}::int)
    GROUP BY u.id, u.ism
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
      muddat_qoldiq, muddat_daraja, muddat_jarima, muddat_vaqti
    )
    VALUES (
      ${siklId}, ${userId}, ${n.talab}, ${n.tasdiqlangan}, ${n.kutilmoqda},
      ${n.qoldiq}, ${n.daraja}, ${n.jarima}, now()
    )
    ON CONFLICT (sikl_id, user_id) DO UPDATE SET
      muddat_talab        = EXCLUDED.muddat_talab,
      muddat_tasdiqlangan = EXCLUDED.muddat_tasdiqlangan,
      muddat_kutilmoqda   = EXCLUDED.muddat_kutilmoqda,
      muddat_qoldiq       = EXCLUDED.muddat_qoldiq,
      muddat_daraja       = EXCLUDED.muddat_daraja,
      muddat_jarima       = EXCLUDED.muddat_jarima,
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
  const jarimaFoiz = await tolovJarimaFoizi();

  return sql.begin(async (tx) => {
    const [s] = await tx<{ holat: string }[]>`
      SELECT holat FROM tolov_sikllari WHERE id = ${sikl.id} FOR UPDATE
    `;
    if (!s || s.holat !== "ochiq") return null;

    const qatorlar = await muddatYigindisi(sikl, undefined, tx);
    const natijalar: MuddatSurati[] = [];

    for (const q of qatorlar) {
      const n = muddatNatijasi({
        talab: sikl.talab,
        tasdiqlangan: Number(q.tasdiqlangan),
        kutilmoqda: Number(q.kutilmoqda),
        jarimaFoiz,
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

  const [q] = await muddatYigindisi(sikl, userId);
  if (!q) return null;

  const n = muddatNatijasi({
    talab: sikl.talab,
    tasdiqlangan: Number(q.tasdiqlangan),
    kutilmoqda: Number(q.kutilmoqda),
    jarimaFoiz: await tolovJarimaFoizi(),
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
      muddat_jarima: string | null;
    }[]
  >`
    SELECT muddat_talab, muddat_tasdiqlangan, muddat_kutilmoqda,
           muddat_qoldiq, muddat_daraja, muddat_jarima
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
    jarima: Number(r.muddat_jarima ?? 0),
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
// ESLATMA
// ---------------------------------------------------------------------------

export type EslatmaNomzodi = {
  userId: number;
  ism: string;
  /** To'liq qator — `shaxsiy()` shuni kutadi, sun'iy obyekt yasalmaydi. */
  user: User;
  tasdiqlangan: number;
  qoldiq: number;
  kutilmoqdaSumma: number;
  oxirgiEslatma: string | null;
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
      oxirgi_eslatma: string | null;
    })[]
  >`
    SELECT u.*,
           COALESCE(SUM(t.tasdiqlangan_summa) FILTER (WHERE t.holat = 'tasdiqlandi'), 0)::bigint AS tasdiqlangan,
           COALESCE(SUM(t.kiritgan_summa)     FILTER (WHERE t.holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda_summa,
           to_char(h.oxirgi_eslatma, 'YYYY-MM-DD') AS oxirgi_eslatma
    FROM users u
    LEFT JOIN tolovlar t ON t.user_id = u.id AND t.sikl_id = ${sikl.id}
    LEFT JOIN tolov_holat h ON h.sikl_id = ${sikl.id} AND h.user_id = u.id
    WHERE u.faol AND u.telegram_id IS NOT NULL
    GROUP BY u.id, h.oxirgi_eslatma
    ORDER BY u.ism
  `;

  return rows.map((r) => {
    const tasdiqlangan = Number(r.tasdiqlangan);
    return {
      userId: r.id,
      ism: r.ism,
      user: r,
      tasdiqlangan,
      qoldiq: Math.max(0, sikl.talab - tasdiqlangan),
      kutilmoqdaSumma: Number(r.kutilmoqda_summa),
      oxirgiEslatma: r.oxirgi_eslatma,
    };
  });
}

/** "Bugun eslatildi" — bazada, ya'ni bot qayta ishga tushsa ham yo'qolmaydi. */
export async function eslatmaBelgila(
  siklId: number,
  userId: number,
  kun: string,
): Promise<void> {
  await sql`
    INSERT INTO tolov_holat (sikl_id, user_id, oxirgi_eslatma)
    VALUES (${siklId}, ${userId}, ${kun}::date)
    ON CONFLICT (sikl_id, user_id) DO UPDATE SET oxirgi_eslatma = EXCLUDED.oxirgi_eslatma
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
  tasdiqlangan: number;
  qoldiq: number;
  kutilmoqdaSumma: number;
  kutilmoqdaSoni: number;
  daraja: TolovDaraja;
  /** Muddat surati — muddat hali kelmagan bo'lsa `null` */
  muddat: MuddatNatija | null;
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
      muddat_jarima: string | null;
    }[]
  >`
    SELECT u.id AS user_id, u.ism,
           COALESCE(SUM(t.tasdiqlangan_summa) FILTER (WHERE t.holat = 'tasdiqlandi'), 0)::bigint AS tasdiqlangan,
           COALESCE(SUM(t.kiritgan_summa)     FILTER (WHERE t.holat = 'kutilmoqda'),   0)::bigint AS kutilmoqda_summa,
           count(t.id) FILTER (WHERE t.holat = 'kutilmoqda')::int AS kutilmoqda_soni,
           count(t.id) FILTER (WHERE t.holat = 'rad')::int        AS rad_soni,
           h.muddat_talab, h.muddat_tasdiqlangan, h.muddat_kutilmoqda,
           h.muddat_qoldiq, h.muddat_daraja, h.muddat_jarima
    FROM users u
    LEFT JOIN tolovlar t ON t.user_id = u.id AND t.sikl_id = ${s.id}
    LEFT JOIN tolov_holat h ON h.sikl_id = ${s.id} AND h.user_id = u.id
    WHERE u.faol
    GROUP BY u.id, u.ism, h.muddat_talab, h.muddat_tasdiqlangan,
             h.muddat_kutilmoqda, h.muddat_qoldiq, h.muddat_daraja, h.muddat_jarima
    ORDER BY u.ism
  `;

  const odamlar: SiklOdam[] = qatorlar.map((q) => {
    const tasdiqlangan = Number(q.tasdiqlangan);
    const muddatQoldiq = Number(q.muddat_qoldiq ?? 0);
    const muddatKutilmoqda = Number(q.muddat_kutilmoqda ?? 0);
    return {
      userId: q.user_id,
      ism: q.ism,
      tasdiqlangan,
      qoldiq: Math.max(0, s.talab - tasdiqlangan),
      kutilmoqdaSumma: Number(q.kutilmoqda_summa),
      kutilmoqdaSoni: q.kutilmoqda_soni,
      daraja: hisoblaDaraja(tasdiqlangan, s.talab),
      muddat:
        q.muddat_daraja && q.muddat_talab !== null
          ? {
              talab: Number(q.muddat_talab),
              tasdiqlangan: Number(q.muddat_tasdiqlangan ?? 0),
              kutilmoqda: muddatKutilmoqda,
              qoldiq: muddatQoldiq,
              daraja: q.muddat_daraja,
              tekshiruvKutilmoqda: muddatQoldiq > 0 && muddatKutilmoqda > 0,
              jarima: Number(q.muddat_jarima ?? 0),
            }
          : null,
    };
  });

  const jamiTasdiqlangan = odamlar.reduce((n, o) => n + o.tasdiqlangan, 0);
  const jamiTalab = s.talab * odamlar.length;

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
  };
}
