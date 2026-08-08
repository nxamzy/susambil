/**
 * Anonim shikoyat — baza mantig'i. Faqat sql/config bilan ishlaydi, Telegram
 * bilan bog'liq hech narsa yo'q (xabar yuborish `bot/handlers/reports.ts`
 * da) — `core/topshiriq.ts` bilan bir xil qatlamlash saqlanadi.
 *
 * `submissions`/`confirmations` dan ataylab alohida: bu yerda bitta ADMIN
 * qaror qiladi (ko'p kishilik tenglar-tasdiqlashi emas) va reporter_id hech
 * qachon Telegram'ga chiqadigan matnlarda ishlatilmaydi — buni shu yerga
 * ajratib qo'yish umumiy kodga aralashtirib anonimlikni tasodifan
 * ochib qo'yish xavfini yo'qotadi.
 */
import { sql, type Report } from "../db/index.js";
import { BALLAR, type ShikoyatTurkumi } from "../config.js";

/** Bir kishi bir odam haqida shuncha vaqt ichida qayta shikoyat yoza olmaydi. */
export const TAKROR_MS = 30 * 60_000;

/** Sof funksiya — DB'siz testlanadi. */
export function takrorlanganmi(oxirgiVaqt: Date, hozir: Date = new Date()): boolean {
  return hozir.getTime() - new Date(oxirgiVaqt).getTime() < TAKROR_MS;
}

export type ReportToliq = Report & { reporter_ism: string; reported_ism: string };

export type ShikoyatXato = "ozi" | "topilmadi" | "takror";

export type ShikoyatNatija =
  | { ok: true; report: Report }
  | { ok: false; sabab: ShikoyatXato };

/**
 * Yangi shikoyat yaratadi (hali kutilmoqda holatida). Server tomonda
 * tekshiradi: o'zini o'zi shikoyat qilolmaydi, nishon faol bo'lishi kerak,
 * yaqinda shu ikkovi haqida yozilgan bo'lmasligi kerak.
 */
export async function shikoyatYuborish(
  reporterId: number,
  reportedId: number,
  turkum: ShikoyatTurkumi,
  izoh: string,
  photoId: string | null,
): Promise<ShikoyatNatija> {
  if (reporterId === reportedId) return { ok: false, sabab: "ozi" };

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

  const [report] = await sql<Report[]>`
    INSERT INTO reports (reporter_id, reported_id, turkum, izoh, photo_id, ball)
    VALUES (${reporterId}, ${reportedId}, ${turkum}, ${izoh.trim().slice(0, 500)},
            ${photoId}, ${BALLAR.shikoyatJarima})
    RETURNING *
  `;
  if (!report) throw new Error("Shikoyat yaratilmadi");
  return { ok: true, report };
}

/**
 * Admin qarorini yozadi — ball faqat shu yerda va bir marta beriladi (yozib
 * qo'yiladi, `reports.ball` qatorning o'zi ball tarixi vazifasini ham
 * bajaradi, xuddi chores/expenses kabi).
 *
 * Ikki admin bir vaqtda bosishi mumkin, shuning uchun `FOR UPDATE` bilan
 * qulflangan tranzaksiya ichida — allaqachon hal qilingan bo'lsa `null`.
 */
export async function shikoyatniHalQil(
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

export async function shikoyatniOl(id: number): Promise<ReportToliq | null> {
  const [r] = await sql<ReportToliq[]>`
    SELECT rp.*, u1.ism AS reporter_ism, u2.ism AS reported_ism
    FROM reports rp
    JOIN users u1 ON u1.id = rp.reporter_id
    JOIN users u2 ON u2.id = rp.reported_id
    WHERE rp.id = ${id}
  `;
  return r ?? null;
}

/** Hali admin ko'rib chiqmagan shikoyatlar — /shikoyatlar buyrug'i uchun. */
export async function kutayotganShikoyatlar(): Promise<ReportToliq[]> {
  return sql<ReportToliq[]>`
    SELECT rp.*, u1.ism AS reporter_ism, u2.ism AS reported_ism
    FROM reports rp
    JOIN users u1 ON u1.id = rp.reporter_id
    JOIN users u2 ON u2.id = rp.reported_id
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
