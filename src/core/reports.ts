/**
 * Muammo yozib qo'yish — baza mantig'i. Faqat sql/config bilan ishlaydi,
 * Telegram bilan bog'liq hech narsa yo'q (xabar yuborish
 * `bot/handlers/reports.ts` da) — `core/topshiriq.ts` bilan bir xil
 * qatlamlash saqlanadi.
 *
 * `submissions`/`confirmations` dan ataylab alohida: bu yerda bitta ADMIN
 * ko'rib chiqadi (ko'p kishilik tenglar-tasdiqlashi emas) va reporter_id
 * hech qachon Telegram'ga chiqadigan matnlarda ishlatilmaydi — buni shu
 * yerga ajratib qo'yish umumiy kodga aralashtirib anonimlikni tasodifan
 * ochib qo'yish xavfini yo'qotadi.
 *
 * Bu ayblov emas: sababchi noma'lum bo'lishi ("bilmayman") mumkin — u holda
 * `reported_id` NULL bo'ladi va tasdiqlansa ham hech kimdan ball
 * ayirilmaydi (quyidagi SQL'da `rp.reported_id = u.id` NULL bilan hech
 * qachon TRUE bo'lmaydi).
 */
import { sql, type Report } from "../db/index.js";
import { BALLAR, type Ishonch } from "../config.js";

/** Bir kishi bir odam haqida shuncha vaqt ichida qayta yoza olmaydi. */
export const TAKROR_MS = 30 * 60_000;

/** Sof funksiya — DB'siz testlanadi. */
export function takrorlanganmi(oxirgiVaqt: Date, hozir: Date = new Date()): boolean {
  return hozir.getTime() - new Date(oxirgiVaqt).getTime() < TAKROR_MS;
}

export type ReportToliq = Report & { reporter_ism: string; reported_ism: string | null };

export type MuammoXato = "ozi" | "topilmadi" | "takror";

export type MuammoNatija =
  | { ok: true; report: Report }
  | { ok: false; sabab: MuammoXato };

/**
 * Yangi yozuv yaratadi (hali kutilmoqda holatida).
 *
 * @param reportedId sababchi — "bilmayman" tanlansa null
 */
export async function muammoYuborish(
  reporterId: number,
  reportedId: number | null,
  ishonch: Ishonch,
  izoh: string,
  photoId: string | null,
): Promise<MuammoNatija> {
  // Sababchi noma'lum bo'lsa "o'zini o'zi ko'rsatish" yoki "takror nishon"
  // tushunchasi ma'nosiz — faqat kimdir ko'rsatilganda tekshiramiz.
  if (reportedId !== null) {
    if (reportedId === reporterId) return { ok: false, sabab: "ozi" };

    const [nishon] = await sql<{ id: number }[]>`
      SELECT id FROM users WHERE id = ${reportedId} AND faol
    `;
    if (!nishon) return { ok: false, sabab: "topilmadi" };

    const [oxirgi] = await sql<{ created_at: Date }[]>`
      SELECT created_at FROM reports
      WHERE reporter_id = ${reporterId} AND reported_id = ${reportedId}
      ORDER BY id DESC LIMIT 1
    `;
    if (oxirgi && takrorlanganmi(oxirgi.created_at)) return { ok: false, sabab: "takror" };
  }

  const [report] = await sql<Report[]>`
    INSERT INTO reports (reporter_id, reported_id, ishonch, izoh, photo_id, ball)
    VALUES (${reporterId}, ${reportedId}, ${ishonch}, ${izoh.trim().slice(0, 500)},
            ${photoId}, ${BALLAR.muammoJarima})
    RETURNING *
  `;
  if (!report) throw new Error("Yozuv yaratilmadi");
  return { ok: true, report };
}

/**
 * Admin sababchini belgilaydi yoki o'zgartiradi — reporter "bilmayman"
 * degan bo'lsa ham, yoki noto'g'ri taxmin qilgan bo'lsa ham. Faqat hali hal
 * qilinmagan yozuvda ishlaydi; qaror chiqqandan keyin o'zgartirib
 * bo'lmaydi.
 *
 * @param javobgarId null — "hech kim (noma'lum)" deb belgilash
 */
export async function javobgarniOzgartir(
  reportId: number,
  javobgarId: number | null,
  ishonch: Ishonch,
): Promise<Report | null> {
  const [r] = await sql<Report[]>`
    UPDATE reports SET reported_id = ${javobgarId}, ishonch = ${ishonch}
    WHERE id = ${reportId} AND holat = 'kutilmoqda'
    RETURNING *
  `;
  return r ?? null;
}

/** Adminning erkin izohi — reporterning o'z izohidan alohida saqlanadi. */
export async function adminIzohQoshish(reportId: number, izoh: string): Promise<Report | null> {
  const [r] = await sql<Report[]>`
    UPDATE reports SET admin_note = ${izoh.trim().slice(0, 500)}
    WHERE id = ${reportId} AND holat = 'kutilmoqda'
    RETURNING *
  `;
  return r ?? null;
}

/**
 * Admin qarorini yozadi. Ball o'zi bu funksiyada berilmaydi — u
 * `rating.ts`da `holat='tasdiqlandi' AND reported_id = u.id` bo'yicha
 * hisoblanadi, ya'ni sababchisi noma'lum yozuv hech kimning hisobiga
 * tushmaydi, qo'shimcha shart yozish shart emas.
 *
 * Ikki admin bir vaqtda bosishi mumkin, shuning uchun `FOR UPDATE` bilan
 * qulflangan tranzaksiya ichida — allaqachon hal qilingan bo'lsa `null`.
 */
export async function muammoniHalQil(
  reportId: number,
  adminId: number,
  qaror: "tasdiqlandi" | "rad",
): Promise<Report | null> {
  return sql.begin(async (tx) => {
    const [r] = await tx<Report[]>`
      SELECT * FROM reports WHERE id = ${reportId} AND holat = 'kutilmoqda' FOR UPDATE
    `;
    if (!r) return null;

    const [yangi] = await tx<Report[]>`
      UPDATE reports SET holat = ${qaror}, admin_id = ${adminId}, hal_qilindi = now()
      WHERE id = ${reportId}
      RETURNING *
    `;
    return yangi ?? null;
  });
}

export async function muammoniOl(id: number): Promise<ReportToliq | null> {
  const [r] = await sql<ReportToliq[]>`
    SELECT rp.*, u1.ism AS reporter_ism, u2.ism AS reported_ism
    FROM reports rp
    JOIN users u1 ON u1.id = rp.reporter_id
    LEFT JOIN users u2 ON u2.id = rp.reported_id
    WHERE rp.id = ${id}
  `;
  return r ?? null;
}

/** Hali admin ko'rib chiqmagan yozuvlar — /muammolar buyrug'i uchun. */
export async function kutayotganMuammolar(): Promise<ReportToliq[]> {
  return sql<ReportToliq[]>`
    SELECT rp.*, u1.ism AS reporter_ism, u2.ism AS reported_ism
    FROM reports rp
    JOIN users u1 ON u1.id = rp.reporter_id
    LEFT JOIN users u2 ON u2.id = rp.reported_id
    WHERE rp.holat = 'kutilmoqda'
    ORDER BY rp.id
  `;
}

/** Har bir adminga yuborilgan xabar id'sini saqlaydi — keyin hammasini yangilash uchun. */
export async function adminXabarlarniSaqla(
  id: number,
  xabarlar: { chat_id: number; message_id: number }[],
): Promise<void> {
  await sql`UPDATE reports SET admin_msgs = ${sql.json(xabarlar)} WHERE id = ${id}`;
}
