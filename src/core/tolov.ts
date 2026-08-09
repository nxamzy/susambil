/**
 * Kvartira to'lovi — baza mantig'i. Faqat sql/config bilan ishlaydi,
 * Telegram bilan bog'liq hech narsa yo'q (xabar yuborish
 * `bot/handlers/tolov.ts` da) — `core/reports.ts` bilan bir xil qatlamlash
 * saqlanadi.
 *
 * Har bir to'lov MUSTAQIL yozuv (bitta "jami to'landi" ustunini qayta yozib
 * turmaymiz). Odamning joriy holati har doim shu jadvaldan
 * SUM(tasdiqlangan_summa) WHERE holat='tasdiqlandi' bilan hisoblanadi —
 * bu funksiyaning o'zi (`hisoblaHolat`) yagona joy, boshqa hech qayerda
 * qo'shimcha mantiq kerak emas.
 *
 * `kiritgan_summa` — foydalanuvchining o'zi yozgan DA'VO, hisobga
 * qo'shilmaydi. `tasdiqlangan_summa` — admin tekshirib kiritgan haqiqiy
 * miqdor, FAQAT shu haqiqiy hisobga tushadi (talab: "actual received
 * amount is authoritative, not the user-entered claim").
 */
import { sql, type Tolov, type TolovDalilTuri } from "../db/index.js";
import { TOLOV_STD } from "../config.js";

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

/** Admin buyruq bilan o'zgartirishi uchun — kod o'zgarmasdan. */
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

export type TolovHolatMalumoti = {
  talab: number;
  tasdiqlangan: number;
  qoldiq: number;
  daraja: TolovDaraja;
  /** Hali admin ko'rib chiqmagan (bu hisobga QO'SHILMAGAN) to'lovlar soni */
  kutilmoqdaSoni: number;
};

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

/** Bitta odamning joriy to'lov holati — faqat tasdiqlangan summalar hisobga kiradi. */
export async function foydalanuvchiTolovHolati(userId: number): Promise<TolovHolatMalumoti> {
  const talab = await tolovTalabi();
  const [r] = await sql<{ tasdiqlangan: string; kutilmoqda: number }[]>`
    SELECT
      COALESCE(SUM(tasdiqlangan_summa) FILTER (WHERE holat = 'tasdiqlandi'), 0)::bigint AS tasdiqlangan,
      count(*) FILTER (WHERE holat = 'kutilmoqda')::int AS kutilmoqda
    FROM tolovlar WHERE user_id = ${userId}
  `;
  const tasdiqlangan = Number(r?.tasdiqlangan ?? 0);
  return {
    talab,
    tasdiqlangan,
    qoldiq: Math.max(0, talab - tasdiqlangan),
    daraja: hisoblaDaraja(tasdiqlangan, talab),
    kutilmoqdaSoni: r?.kutilmoqda ?? 0,
  };
}

/**
 * Yangi to'lov yozuvi yaratadi ('kutilmoqda' holatida). `kiritganSumma`
 * faqat foydalanuvchining o'z da'vosi — hisobga hali qo'shilmaydi, buni
 * faqat admin `tolovniTasdiqla` orqali qiladi.
 */
export async function tolovYuborish(
  userId: number,
  kiritganSumma: number,
  dalilId: string,
  dalilTuri: TolovDalilTuri,
): Promise<Tolov> {
  const [t] = await sql<Tolov[]>`
    INSERT INTO tolovlar (user_id, kiritgan_summa, dalil_id, dalil_turi)
    VALUES (${userId}, ${kiritganSumma}, ${dalilId}, ${dalilTuri})
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
 */
export async function tolovniTasdiqla(
  tolovId: number,
  adminId: number,
  tasdiqlanganSumma: number,
): Promise<Tolov | null> {
  return sql.begin(async (tx) => {
    const [t] = await tx<Tolov[]>`
      SELECT * FROM tolovlar WHERE id = ${tolovId} AND holat = 'kutilmoqda' FOR UPDATE
    `;
    if (!t) return null;

    const [yangi] = await tx<Tolov[]>`
      UPDATE tolovlar
      SET holat = 'tasdiqlandi', tasdiqlangan_summa = ${tasdiqlanganSumma},
          hal_qildi = ${adminId}, hal_qilindi = now()
      WHERE id = ${tolovId}
      RETURNING *
    `;
    return yangi ?? null;
  });
}

/** Rad etilgan to'lov hech qachon hisobga qo'shilmaydi — tasdiqlangan_summa NULL qoladi. */
export async function tolovniRadEt(
  tolovId: number,
  adminId: number,
  sabab: string,
): Promise<Tolov | null> {
  return sql.begin(async (tx) => {
    const [t] = await tx<Tolov[]>`
      SELECT * FROM tolovlar WHERE id = ${tolovId} AND holat = 'kutilmoqda' FOR UPDATE
    `;
    if (!t) return null;

    const [yangi] = await tx<Tolov[]>`
      UPDATE tolovlar
      SET holat = 'rad', rad_sababi = ${sabab.trim().slice(0, 300)},
          hal_qildi = ${adminId}, hal_qilindi = now()
      WHERE id = ${tolovId}
      RETURNING *
    `;
    return yangi ?? null;
  });
}

export type TolovToliq = Tolov & { ism: string };

export async function tolovniOl(id: number): Promise<TolovToliq | null> {
  const [r] = await sql<TolovToliq[]>`
    SELECT t.*, u.ism FROM tolovlar t JOIN users u ON u.id = t.user_id WHERE t.id = ${id}
  `;
  return r ?? null;
}

/** Tarixda kim tekshirgani ham ko'rinishi uchun — faqat ko'rsatish uchun, hisobga tegmaydi. */
export type TolovTarix = Tolov & { hal_qildi_ism: string | null };

/** Bitta odamning butun to'lov tarixi — eng yangisi birinchi. */
export async function foydalanuvchiTolovlari(userId: number): Promise<TolovTarix[]> {
  return sql<TolovTarix[]>`
    SELECT t.*, adm.ism AS hal_qildi_ism
    FROM tolovlar t LEFT JOIN users adm ON adm.id = t.hal_qildi
    WHERE t.user_id = ${userId} ORDER BY t.id DESC
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

export type TolovDashboard = {
  talab: number;
  jamiTalab: number;
  jamiTasdiqlangan: number;
  jamiQoldiq: number;
  kutilmoqdaSoni: number;
  radSoni: number;
  tola: { userId: number; ism: string }[];
  qisman: { userId: number; ism: string; tasdiqlangan: number; qoldiq: number }[];
  tolanmagan: { userId: number; ism: string }[];
};

/** Admin/Sorabek uchun umumiy ko'rinish: kim qancha to'lagan, kim qolgan. */
export async function tolovDashboard(): Promise<TolovDashboard> {
  const talab = await tolovTalabi();

  const odamlar = await sql<{ id: number; ism: string; tasdiqlangan: string }[]>`
    SELECT u.id, u.ism,
           COALESCE((
             SELECT SUM(t.tasdiqlangan_summa) FROM tolovlar t
             WHERE t.user_id = u.id AND t.holat = 'tasdiqlandi'
           ), 0)::bigint AS tasdiqlangan
    FROM users u WHERE u.faol ORDER BY u.ism
  `;

  const [kutilmoqda] = await sql<{ soni: number }[]>`
    SELECT count(*)::int AS soni FROM tolovlar WHERE holat = 'kutilmoqda'
  `;
  const [rad] = await sql<{ soni: number }[]>`
    SELECT count(*)::int AS soni FROM tolovlar WHERE holat = 'rad'
  `;

  const tola: TolovDashboard["tola"] = [];
  const qisman: TolovDashboard["qisman"] = [];
  const tolanmagan: TolovDashboard["tolanmagan"] = [];
  let jamiTasdiqlangan = 0;

  for (const o of odamlar) {
    const summa = Number(o.tasdiqlangan);
    jamiTasdiqlangan += summa;
    const daraja = hisoblaDaraja(summa, talab);
    if (daraja === "tola") tola.push({ userId: o.id, ism: o.ism });
    else if (daraja === "qisman") {
      qisman.push({ userId: o.id, ism: o.ism, tasdiqlangan: summa, qoldiq: talab - summa });
    } else {
      tolanmagan.push({ userId: o.id, ism: o.ism });
    }
  }

  const jamiTalab = talab * odamlar.length;
  return {
    talab,
    jamiTalab,
    jamiTasdiqlangan,
    jamiQoldiq: Math.max(0, jamiTalab - jamiTasdiqlangan),
    kutilmoqdaSoni: kutilmoqda?.soni ?? 0,
    radSoni: rad?.soni ?? 0,
    tola,
    qisman,
    tolanmagan,
  };
}
