import {
  sql,
  type Room,
  type Submission,
  type Turn,
  type TurnIshBelgisi,
  type TurnIshlar,
  type User,
} from "../db/index.js";
import { config, RASM_MAX } from "../config.js";
import type { NavbatVazifasi } from "./vazifalar.js";
import { navbatBalli } from "./rating.js";

const KUN_MS = 24 * 60 * 60 * 1000;

export type FaolNavbat = {
  turn: Turn;
  room: Room;
  azolar: User[];
};

/** Hozir navbatda turgan xona. Navbat yo'q bo'lsa null. */
export async function faolNavbat(): Promise<FaolNavbat | null> {
  const [turn] = await sql<Turn[]>`
    SELECT * FROM turns WHERE holat = 'faol' ORDER BY id DESC LIMIT 1
  `;
  if (!turn) return null;

  const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${turn.room_id}`;
  if (!room) return null;

  return { turn, room, azolar: await xonaAzolari(turn.room_id) };
}

/**
 * Shu xona hozir navbatda turibdimi — "🧹 Mening navbatim" tugmasini
 * pastki menyuda ko'rsatish/yashirish shu bilan aniqlanadi (bot/keyboards.ts
 * `menyuKeyboard`). Xonasiz odam (`roomId === null`) hech qachon `true`
 * bo'lmaydi.
 */
export async function joriyNavbatchimi(roomId: number | null): Promise<boolean> {
  if (roomId === null) return false;
  const n = await faolNavbat();
  return n?.room.id === roomId;
}

export async function xonaAzolari(roomId: number): Promise<User[]> {
  return sql<User[]>`
    SELECT * FROM users WHERE room_id = ${roomId} AND faol ORDER BY id
  `;
}

/**
 * Navbat tartibi u yoq-bu yoq yuradi — oxiriga yetgach boshiga sakramaydi,
 * orqasiga qaytadi:
 *
 *   1 → 2 → 3 → 4 → 3 → 2 → 1 → 2 → 3 → 4 → ...
 *
 * Yo'nalish alohida saqlanmaydi, oldingi navbatdan aniqlanadi. Shunday
 * qilingani uchun admin /navbatber bilan qo'lda sakratsa ham tartib o'zidan
 * tiklanadi — hech qayerda "eskirgan yo'nalish" qolib ketmaydi.
 */
export async function keyingiXona(hozirgi: Room): Promise<Room> {
  const xonalar = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib`;
  if (xonalar.length === 0) throw new Error("Bazada birorta ham xona yo'q");

  const joy = xonalar.findIndex((x) => x.id === hozirgi.id);
  if (joy === -1) return xonalar[0]!;

  // Oldingi tugagan navbat boshqa xonada bo'lgan — qay tomonga yurayotganimiz
  // shundan bilinadi. Birinchi navbatda hech nima yo'q, oldinga yuramiz.
  const [oldingi] = await sql<{ room_id: number }[]>`
    SELECT room_id FROM turns
    WHERE holat <> 'faol' AND room_id <> ${hozirgi.id}
    ORDER BY id DESC LIMIT 1
  `;
  const oldingiJoy = oldingi ? xonalar.findIndex((x) => x.id === oldingi.room_id) : -1;

  return xonalar[keyingiJoy(joy, oldingiJoy, xonalar.length)]!;
}

/**
 * Yuqoridagi tartibning sof mantiqi — bazasiz testlash uchun ajratilgan.
 *
 * @param joy        hozirgi xonaning tartibdagi o'rni (0 dan)
 * @param oldingiJoy oldingi navbat xonasining o'rni; bilinmasa -1
 * @param soni       jami xonalar soni
 */
/**
 * Kelgusi navbatlar tartibi. Hozirgi navbatdan keyin kim kelishini oldindan
 * ko'rsatish uchun — bazaga tegmasdan, o'sha tartib mantiqi bilan hisoblanadi.
 */
export async function kelgusiTartib(nechta = 3): Promise<{ room: Room; azolar: User[] }[]> {
  const navbat = await faolNavbat();
  if (!navbat) return [];

  const xonalar = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib`;
  if (xonalar.length < 2) return [];

  const [oldingi] = await sql<{ room_id: number }[]>`
    SELECT room_id FROM turns
    WHERE holat <> 'faol' AND room_id <> ${navbat.room.id}
    ORDER BY id DESC LIMIT 1
  `;

  let joy = xonalar.findIndex((x) => x.id === navbat.room.id);
  let oldingiJoy = oldingi ? xonalar.findIndex((x) => x.id === oldingi.room_id) : -1;
  if (joy === -1) return [];

  const natija: { room: Room; azolar: User[] }[] = [];
  for (let i = 0; i < Math.min(nechta, xonalar.length); i++) {
    const keyingi = keyingiJoy(joy, oldingiJoy, xonalar.length);
    oldingiJoy = joy;
    joy = keyingi;
    const room = xonalar[joy]!;
    natija.push({ room, azolar: await xonaAzolari(room.id) });
  }
  return natija;
}

export function keyingiJoy(joy: number, oldingiJoy: number, soni: number): number {
  if (soni <= 1) return 0;
  let yonalish = oldingiJoy === -1 || oldingiJoy < joy ? 1 : -1;
  if (joy + yonalish < 0 || joy + yonalish >= soni) yonalish = -yonalish;
  return joy + yonalish;
}

/** Muddatdan necha kun kechikkani (butun kun, kamida 0). */
export function kechikkanKun(muddat: Date, sana: Date = new Date()): number {
  const farq = sana.getTime() - new Date(muddat).getTime();
  return farq <= 0 ? 0 : Math.ceil(farq / KUN_MS);
}

export type YopishNatijasi = {
  kechikkanKun: number;
  jarima: number;
  /** Xonaning har bir a'zosiga tegadigan ball */
  ballHar: number;
  keyingi: { room: Room; azolar: User[]; muddat: Date };
};

/**
 * Navbatni yopadi va keyingi xonaga o'tkazadi.
 *
 * Ikki kishi 3-tasdiqni bir vaqtda bosishi mumkin, shuning uchun navbat
 * qatori `FOR UPDATE` bilan qulflanadi va holati tranzaksiya ichida qayta
 * tekshiriladi. Allaqachon yopilgan bo'lsa `null` qaytadi — aks holda
 * ikkita keyingi navbat yaralib qolardi.
 *
 * @param hisoblashVaqti Kechikish shu vaqtdan hisoblanadi — navbatchi
 *   "Yakuniy topshirish"ni BOSGAN payt (`submissions.created_at`), guruh/
 *   admin QACHON tasdiqlagani EMAS. Aks holda tasdiqlash kechiksa (masalan
 *   admin kechqurun ko'rib chiqsa), navbatchi o'z vazifasini vaqtida
 *   topshirgan bo'lsa ham jarimalanib qolardi — bu uning aybi emas.
 *   Chaqiruvchida mos submission topilmasa (masalan admin hech kim hech
 *   narsa topshirmagan holda majburan yopsa), standart `new Date()` qoladi.
 */
export async function navbatniYopish(
  turn: Turn,
  room: Room,
  sabab: "tasdiqlandi" | "admin_yopdi" = "tasdiqlandi",
  hisoblashVaqti: Date = new Date(),
): Promise<YopishNatijasi | null> {
  const hozir = new Date();
  const kechikdi = kechikkanKun(turn.muddat, hisoblashVaqti);
  const keyingiRoom = await keyingiXona(room);
  const yangiMuddat = new Date(hozir.getTime() + config.siklKuni * KUN_MS);

  const yopildi = await sql.begin(async (tx) => {
    const qulf = await tx<{ id: number }[]>`
      SELECT id FROM turns WHERE id = ${turn.id} AND holat = 'faol' FOR UPDATE
    `;
    if (qulf.length === 0) return false; // boshqa chaqiruv allaqachon yopgan

    await tx`
      UPDATE turns
      SET holat = ${sabab}, tasdiqlandi = ${hozir}, kechikkan_kun = ${kechikdi}
      WHERE id = ${turn.id}
    `;

    await tx`
      INSERT INTO turns (room_id, muddat) VALUES (${keyingiRoom.id}, ${yangiMuddat})
    `;
    return true;
  });

  if (!yopildi) return null;

  const azolar = await xonaAzolari(room.id);
  return {
    kechikkanKun: kechikdi,
    jarima: kechikdi * config.jarimaKunlik,
    ballHar: navbatBalli(azolar.length, kechikdi),
    keyingi: {
      room: keyingiRoom,
      azolar: await xonaAzolari(keyingiRoom.id),
      muddat: yangiMuddat,
    },
  };
}

/**
 * Admin: navbatni yo'qdan boshlaydi — hech qanday navbat ketmayotgan
 * bo'lsagina ishlaydi (aks holda ikkita faol navbat yaralib qolardi).
 * /navbatboshla buyrug'i va Admin Panel'dagi "▶️ Navbatni boshlash"
 * tugmasi shu bir funksiyani ishlatadi, ikkinchi nusxa yo'q.
 */
export async function navbatniBoshlash(): Promise<FaolNavbat | null> {
  if (await faolNavbat()) return null;

  const [birinchi] = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib LIMIT 1`;
  if (!birinchi) return null;

  const muddat = new Date(Date.now() + config.siklKuni * KUN_MS);
  await sql`INSERT INTO turns (room_id, muddat) VALUES (${birinchi.id}, ${muddat})`;

  return faolNavbat();
}

/** Navbatni admin qo'lda boshqa xonaga o'tkazadi. */
export async function navbatniOzgartirish(xonaRaqami: number): Promise<FaolNavbat> {
  const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE raqam = ${xonaRaqami}`;
  if (!room) throw new Error(`${xonaRaqami}-xona topilmadi`);

  const muddat = new Date(Date.now() + config.siklKuni * KUN_MS);

  await sql.begin(async (tx) => {
    await tx`UPDATE turns SET holat = 'admin_yopdi', tasdiqlandi = now() WHERE holat = 'faol'`;
    await tx`INSERT INTO turns (room_id, muddat) VALUES (${room.id}, ${muddat})`;
  });

  const yangi = await faolNavbat();
  if (!yangi) throw new Error("Yangi navbat yaratilmadi");
  return yangi;
}

/**
 * Bitta vazifaning to'plangan rasmlari — eski ("photo_id", bitta rasm) va
 * yangi ("photo_ids", array) formatni ikkalasini ham tushunadi, shuning
 * uchun deploydan oldin allaqachon belgilangan vazifalar yo'qolib
 * qolmaydi. Yangi yozuvlar hech qachon "photo_id"ni ishlatmaydi.
 */
export function ishRasmlari(belgi: TurnIshBelgisi | undefined): string[] {
  if (!belgi) return [];
  if (belgi.photo_ids) return belgi.photo_ids;
  return belgi.photo_id ? [belgi.photo_id] : [];
}

export type IshBelgilashNatija = {
  turn: Turn;
  /** Shu vazifa uchun kerakli (MINIMUM) rasm yig'ilib bo'ldimi. */
  toliq: boolean;
  /**
   * AYNAN shu rasm vazifani birinchi marta to'ldirdimi. Qo'shish atomik
   * bo'lgani uchun bu butun albom davomida ROSA BIR MARTA `true` bo'ladi —
   * chaqiruvchi panelni shunga qarab bir marta qayta chizadi, har rasmga
   * emas (albom bilan 9 ta rasm tashlanganda 18 ta xabar ketardi va
   * Telegram flood chegarasiga urilardi).
   */
  yangiToldi: boolean;
  soni: number;
  kerak: number;
  /**
   * Shu chaqiruvdagi rasm saqlandimi. `false` — faqat QATTIQ chegaraga
   * (`config.RASM_MAX`) yetilgan holat. Ilgari bu "kerakli sondan ortiq"
   * degani ham edi: musorga 1 ta rasm yetarli bo'lgani uchun albomdagi
   * qolgan 2 tasi ataylab tashlab yuborilardi. Endi ortiqcha rasm ham
   * saqlanadi — dalil ko'p bo'lgani hech kimga zarar qilmaydi, yo'qolgani
   * esa qiladi.
   */
  yozildimi: boolean;
};

/**
 * Bitta vazifaga rasm qo'shadi — YOZIB YUBORMAYDI, YIG'ADI. Nechta rasm
 * kerakligi `navbat_vazifalari.rasm_soni` dan keladi (admin panelidan
 * o'zgartiriladi), bu yerda hech qanday qattiq son yo'q.
 *
 * Bitta SQL bilan atomik qo'shiladi (o'qib-yozish emas) — Telegram albomni
 * bir nechta ALOHIDA yangilanish qilib, ko'pincha bir vaqtda yetkazadi;
 * o'qib-yozish bo'lsa ikkita chaqiruv bir xil eski qiymatni o'qib,
 * bir-birining ustidan yozib yuborardi.
 *
 * `COALESCE` ichidagi `photo_id` bo'limi eski (bitta rasmli) formatdagi
 * yozuvni yangi massivga ko'chiradi — bo'lmasa migratsiyadan oldin
 * belgilangan vazifaga yangi rasm tushganda eskisi yo'qolib ketardi.
 *
 * Faqat 'faol' navbatda ishlaydi; yopilgan navbatga eski callback orqali
 * urinilsa `null` qaytadi.
 */
export async function ishBelgila(
  turnId: number,
  vazifa: NavbatVazifasi,
  userId: number,
  photoId: string,
): Promise<IshBelgilashNatija | null> {
  const kod = vazifa.kod;
  const kerak = vazifa.rasm_soni;

  const [yangilangan] = await sql<Turn[]>`
    UPDATE turns
    SET ishlar = jsonb_set(
      ishlar,
      ARRAY[${kod}]::text[],
      jsonb_build_object(
        'photo_ids', ${mavjudRasmlar(kod)} || to_jsonb(${photoId}::text),
        'user_id', ${userId}::int,
        'vaqt', now()
      ),
      true
    )
    WHERE id = ${turnId} AND holat = 'faol'
      AND jsonb_array_length(${mavjudRasmlar(kod)}) < ${RASM_MAX}
    RETURNING *
  `;

  if (yangilangan) {
    const soni = ishRasmlari(yangilangan.ishlar[kod]).length;
    return { turn: yangilangan, toliq: soni >= kerak, yangiToldi: soni === kerak, soni, kerak, yozildimi: true };
  }

  // Yozilmadi — navbat yopilganmi yoki qattiq chegaraga yetilganmi.
  const [joriy] = await sql<Turn[]>`SELECT * FROM turns WHERE id = ${turnId} AND holat = 'faol'`;
  if (!joriy) return null;

  const soni = ishRasmlari(joriy.ishlar[kod]).length;
  return { turn: joriy, toliq: soni >= kerak, yangiToldi: false, soni, kerak, yozildimi: false };
}

/**
 * Vazifadagi hozirgi rasmlar massivi — yangi (`photo_ids`) formatni, u
 * bo'lmasa eski bitta rasmli (`photo_id`) formatni o'qiydi.
 *
 * FUNKSIYA, konstanta emas: postgres.js fragment sifatida inline qilinganda
 * Query obyektini o'zgartiradi, shuning uchun bitta nusxani ikki joyda
 * ishlatib bo'lmaydi (CLAUDE.md dagi qoida).
 */
function mavjudRasmlar(kod: string) {
  return sql`COALESCE(
    ishlar -> ${kod} -> 'photo_ids',
    CASE WHEN jsonb_exists(ishlar -> ${kod}, 'photo_id')
         THEN jsonb_build_array(ishlar -> ${kod} -> 'photo_id')
         ELSE '[]'::jsonb END
  )`;
}

/**
 * Sof funksiyalar — bazasiz testlanadi. Vazifalar ro'yxati ATAYLAB
 * parametr: shunda bu yerda ham, `bot/text.ts`da ham baza chaqiruvi
 * bo'lmaydi, ro'yxatni esa chaqiruvchi bir marta o'qib hammasiga uzatadi.
 */
export function barchaIshlarBajarildimi(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): boolean {
  // Bo'sh ro'yxatda `every` `true` qaytaradi — admin hamma vazifani
  // o'chirib qo'ysa navbatni hech narsa qilmasdan yakunlash mumkin bo'lardi.
  if (vazifalar.length === 0) return false;
  return vazifalar.every((v) => ishRasmlari(ishlar[v.kod]).length >= v.rasm_soni);
}

export function qolganIshlar(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): NavbatVazifasi[] {
  return vazifalar.filter((v) => ishRasmlari(ishlar[v.kod]).length < v.rasm_soni);
}

export function bajarilganIshlarSoni(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): number {
  return vazifalar.length - qolganIshlar(ishlar, vazifalar).length;
}

/**
 * Navbatda yig'ilgan BARCHA rasmlar — avval joriy vazifalar tartibida,
 * keyin ro'yxatdan chiqarilgan (nofaol qilingan) vazifalarniki.
 *
 * Ikkinchi qism muhim: admin navbat o'rtasida "Hammom"ni ikkiga bo'lsa,
 * eski `hammom` kaliti endi hech qaysi faol vazifaga to'g'ri kelmaydi —
 * lekin unga tashlangan rasm ham dalil, guruhga baribir chiqishi kerak.
 */
export function navbatRasmlari(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): string[] {
  const kodlar = vazifalar.map((v) => v.kod);
  const qolganKalitlar = Object.keys(ishlar).filter((k) => !kodlar.includes(k));
  return [...kodlar, ...qolganKalitlar].flatMap((k) => ishRasmlari(ishlar[k]));
}

/**
 * Navbatning MAJBURIY tozalash vazifalari muddat tugashiga
 * `config.majburiyOchilishKuni` kun (yoki kamroq) qolganda ochiladi. Muddat
 * allaqachon o'tib ketgan bo'lsa ham (kechikkan holat) ochiq hisoblanadi —
 * lock faqat "hali erta" holatini to'sadi.
 */
export function majburiyOchildimi(muddat: Date, hozir: Date = new Date()): boolean {
  return hozir.getTime() >= new Date(muddat).getTime() - config.majburiyOchilishKuni * KUN_MS;
}

/**
 * Shu navbat uchun hali rad etilmagan topshiriq bormi (kutilmoqda yoki
 * tasdiqlangan). Rad etilgan ataylab hisobga kirmaydi — aks holda bir marta
 * rad etilgach xona qaytadan topshira olmay qolardi (eski buferdagi bilan
 * bir xil qoida, `submissions_faol_navbat_uniq` indeksi ham shunga mos).
 */
export async function navbatFaolTopshirigi(turnId: number): Promise<Submission | null> {
  const [sub] = await sql<Submission[]>`
    SELECT * FROM submissions
    WHERE turn_id = ${turnId} AND tur = 'navbat' AND NOT bekor AND holat <> 'rad'
    ORDER BY id DESC LIMIT 1
  `;
  return sub ?? null;
}

/**
 * Barcha vazifalar bajarilgach yakuniy topshiriqni yaratadi — guruh
 * tasdig'iga tayyor. `finalizerUserId` — "✅ Yakuniy topshirish" tugmasini
 * bosgan odam (guruh xabarida shu ko'rsatiladi, xuddi eski "kim yukladi"
 * bilan bir xil rolda).
 */
export async function navbatTopshir(
  turn: Turn,
  finalizerUserId: number,
  vazifalar: NavbatVazifasi[],
): Promise<Submission> {
  const photoIds = navbatRasmlari(turn.ishlar, vazifalar);

  const [sub] = await sql<Submission[]>`
    INSERT INTO submissions (turn_id, user_id, photo_ids, tur, holat)
    VALUES (${turn.id}, ${finalizerUserId}, ${photoIds}, 'navbat', 'kutilmoqda')
    RETURNING *
  `;
  if (!sub) throw new Error("Navbat topshirig'i yaratilmadi");
  return sub;
}

/** Admin: navbatni boshidan boshlaydi — vazifalar tozalanadi, oldingi rad etilgan/kutilmoqda topshiriq bekor qilinadi. */
export async function navbatniQaytaBoshla(turnId: number): Promise<Turn | null> {
  return sql.begin(async (tx) => {
    const [t] = await tx<Turn[]>`
      UPDATE turns SET ishlar = '{}'::jsonb, oxirgi_eslatma = NULL
      WHERE id = ${turnId} AND holat = 'faol'
      RETURNING *
    `;
    if (!t) return null;
    await tx`
      UPDATE submissions SET bekor = TRUE
      WHERE turn_id = ${turnId} AND tur = 'navbat' AND holat = 'kutilmoqda'
    `;
    return t;
  });
}
