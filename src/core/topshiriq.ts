/**
 * Topshiriq — tasdiqqa qo'yilgan har qanday ish. `submissions` jadvalida
 * uch turi yashaydi va uchalasi ham bitta `confirmations` orqali
 * tasdiqlanadi — ikkinchi tasdiqlash tizimi hech qachon yaratilmagan:
 *
 *   navbat  — navbatdagi xonaning tozalash ishi (turn_id bilan)
 *   ish     — qo'shimcha ish (ESKI, yangi yozuv yaratilmaydi)
 *   xarajat — uyga olib kelingan narsa (ESKI, yangi yozuv yaratilmaydi)
 *
 * `ish` va `xarajat` oqimlari OLIB TASHLANDI — hech kim o'z ixtiyori bilan
 * tozalamas, o'zidan narsa olib kelmas edi; pul esa endi admin boshlaydigan
 * yig'im orqali yig'iladi (`core/tolov.ts`, `tur='yigim'`). Yozuvlar va
 * ularning `yakunla()`dagi tarmoqlari QOLDI: eski tasdiqlangan ishlar
 * reytingda turaveradi, tasdiq kutayotgani esa baribir yopiladi
 * ("tarix hech qachon o'chmaydi").
 *
 * Shu sababli bu faylda endi FAQAT navbat topshirig'i yaratiladi
 * (`core/rotation.ts` orqali) — `topshiriqYarat`/`topshiriqBalli` o'z
 * chaqiruvchisi bilan birga olib tashlandi.
 */
import { sql, type Submission, type User } from "../db/index.js";
import { sozlamalarOl } from "./sozlamalar.js";

/** Summaning yuqori chegarasi — bosh barmoq bilan yozib yuborishdan. */
export const SUMMA_CHEGARA = 100_000_000;

/** Summani tozalaydi: butun, manfiy emas, chegaradan oshmaydi. */
export function summaTekshir(xom: unknown): number | null {
  const n = typeof xom === "number" ? xom : Number(String(xom ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), SUMMA_CHEGARA);
}

export type TasdiqXato =
  | "topilmadi"
  | "yopilgan"
  | "ozi"
  | "takror"
  | "oz_xonasi";

export type TasdiqNatija =
  | { holat: "yetmadi"; ismlar: string[]; kerak: number }
  | { holat: "yakunlandi"; ismlar: string[]; sub: Submission }
  | { holat: "xato"; sabab: TasdiqXato };

/**
 * Tasdiq qo'shadi va yetarli bo'lsa topshiriqni yakunlaydi.
 *
 * Ikki kishi bir vaqtda bosishi mumkin, shuning uchun:
 *   - takror tasdiqni `confirmations` dagi UNIQUE to'sadi
 *   - yakunlash `FOR UPDATE` bilan qulflangan tranzaksiya ichida bo'ladi
 *   - daftarga yozish `ON CONFLICT DO NOTHING` bilan ketadi
 * Ya'ni ball ikki marta berilishi mumkin emas.
 *
 * Navbat topshirig'ini bu funksiya yakunlamaydi — u navbatni ham surishi
 * kerak, buni `confirm.ts` `navbatniYopish` bilan qiladi.
 */
export async function tasdiqla(submissionId: number, u: User): Promise<TasdiqNatija> {
  const [sub] = await sql<Submission[]>`
    SELECT * FROM submissions WHERE id = ${submissionId} AND NOT bekor
  `;
  if (!sub) return { holat: "xato", sabab: "topilmadi" };
  if (sub.holat !== "kutilmoqda") return { holat: "xato", sabab: "yopilgan" };
  if (sub.user_id === u.id) return { holat: "xato", sabab: "ozi" };

  const qoshildi = await sql`
    INSERT INTO confirmations (submission_id, user_id)
    VALUES (${submissionId}, ${u.id})
    ON CONFLICT (submission_id, user_id) DO NOTHING
    RETURNING id
  `;
  if (qoshildi.length === 0) return { holat: "xato", sabab: "takror" };

  const ismlar = await tasdiqlovchilar(submissionId);
  const { kerakliTasdiq } = await sozlamalarOl();
  if (ismlar.length < kerakliTasdiq) {
    return { holat: "yetmadi", ismlar, kerak: kerakliTasdiq };
  }

  const yakun = await yakunla(submissionId);
  // Boshqa chaqiruv baravar yakunlagan bo'lsa `null` keladi — bu xato emas,
  // shunchaki ball allaqachon berilgan.
  return { holat: "yakunlandi", ismlar, sub: yakun ?? sub };
}

export async function tasdiqlovchilar(submissionId: number): Promise<string[]> {
  const r = await sql<{ ism: string }[]>`
    SELECT u.ism FROM confirmations c
    JOIN users u ON u.id = c.user_id
    WHERE c.submission_id = ${submissionId}
    ORDER BY c.created_at
  `;
  return r.map((x) => x.ism);
}

/**
 * Topshiriqni tasdiqlangan deb yopadi va daftarga yozadi. Ball aynan shu
 * yerda beriladi — bir marta.
 *
 * @returns yopilgan topshiriq, yoki allaqachon yopilgan bo'lsa null
 */
export async function yakunla(submissionId: number): Promise<Submission | null> {
  return sql.begin(async (tx) => {
    const [sub] = await tx<Submission[]>`
      SELECT * FROM submissions
      WHERE id = ${submissionId} AND holat = 'kutilmoqda' AND NOT bekor
      FOR UPDATE
    `;
    if (!sub) return null; // boshqa chaqiruv ulgurdi

    if (sub.tur === "ish") {
      await tx`
        INSERT INTO chores (user_id, tur, photo_id, izoh, ball, submission_id)
        VALUES (${sub.user_id}, ${sub.ish_turi}, ${sub.photo_ids[0] ?? null},
                ${sub.izoh}, ${sub.ball}, ${sub.id})
        ON CONFLICT (submission_id) DO NOTHING
      `;
    } else if (sub.tur === "xarajat") {
      await tx`
        INSERT INTO expenses (user_id, izoh, photo_id, summa, ball, submission_id)
        VALUES (${sub.user_id}, ${sub.izoh ?? "—"}, ${sub.photo_ids[0] ?? null},
                ${sub.summa}, ${sub.ball}, ${sub.id})
        ON CONFLICT (submission_id) DO NOTHING
      `;
    }

    const [yangi] = await tx<Submission[]>`
      UPDATE submissions SET holat = 'tasdiqlandi', yopildi = now()
      WHERE id = ${submissionId}
      RETURNING *
    `;
    return yangi ?? null;
  });
}

/** Topshiriqni rad etadi. Ball berilmaydi, daftarga hech nima yozilmaydi. */
export async function radEt(
  submissionId: number,
  u: User,
  sabab: string | null,
): Promise<Submission | null> {
  return sql.begin(async (tx) => {
    const [sub] = await tx<Submission[]>`
      SELECT * FROM submissions
      WHERE id = ${submissionId} AND holat = 'kutilmoqda' AND NOT bekor
      FOR UPDATE
    `;
    if (!sub) return null;

    const [yangi] = await tx<Submission[]>`
      UPDATE submissions
      SET holat = 'rad', yopildi = now(),
          rad_sababi = ${sabab?.trim().slice(0, 200) || null}, rad_qildi = ${u.id}
      WHERE id = ${submissionId}
      RETURNING *
    `;
    return yangi ?? null;
  });
}

/** Bitta odamning ochiq (hali tasdiqlanmagan) topshiriqlari. */
export async function ochiqTopshiriqlar(userId: number): Promise<Submission[]> {
  return sql<Submission[]>`
    SELECT * FROM submissions
    WHERE user_id = ${userId} AND holat = 'kutilmoqda' AND NOT bekor
    ORDER BY id DESC
  `;
}
