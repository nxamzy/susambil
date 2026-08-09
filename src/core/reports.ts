/**
 * Anonim shikoyat — baza mantig'i. Faqat sql/config bilan ishlaydi,
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
 * Hayot sikli:
 *   kutilmoqda -> tuzatilmoqda -> tuzatildi | jarima
 *             \-> rad
 *
 * Ball faqat "jarima" holatiga o'tganda — ya'ni admin tasdiqlab, sababchiga
 * imkoniyat berib, keyin "tuzatilmadi" deb belgilaganda — beriladi. Buni
 * rating.ts oddiy `holat = 'jarima'` sharti bilan hisoblaydi, boshqa hech
 * qanday qo'shimcha mantiq kerak emas: holatning o'zi ballning berilgan-
 * berilmaganini bildiradi.
 */
import { sql, type Report } from "../db/index.js";
import { BALLAR, type Ishonch, type ShikoyatJoyi } from "../config.js";

/** Bir kishi bir odam haqida shuncha vaqt ichida qayta yoza olmaydi. */
export const TAKROR_MS = 30 * 60_000;

/** Sof funksiya — DB'siz testlanadi. */
export function takrorlanganmi(oxirgiVaqt: Date, hozir: Date = new Date()): boolean {
  return hozir.getTime() - new Date(oxirgiVaqt).getTime() < TAKROR_MS;
}

export type ReportToliq = Report & { reporter_ism: string; reported_ism: string | null };

export type ShikoyatXato = "ozi" | "topilmadi" | "takror";

export type ShikoyatNatija =
  | { ok: true; report: Report }
  | { ok: false; sabab: ShikoyatXato };

/**
 * Yangi shikoyat yaratadi (hali kutilmoqda holatida).
 *
 * @param reportedId sababchi — "bilmayman" tanlansa null
 */
export async function shikoyatYuborish(
  reporterId: number,
  reportedId: number | null,
  ishonch: Ishonch,
  joy: ShikoyatJoyi,
  izoh: string,
  mediaId: string | null,
  mediaTuri: "rasm" | "video",
): Promise<ShikoyatNatija> {
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
    INSERT INTO reports (reporter_id, reported_id, ishonch, joy, izoh, photo_id, media_turi, ball)
    VALUES (${reporterId}, ${reportedId}, ${ishonch}, ${joy}, ${izoh.trim().slice(0, 500)},
            ${mediaId}, ${mediaTuri}, ${BALLAR.shikoyatJarima})
    RETURNING *
  `;
  if (!report) throw new Error("Yozuv yaratilmadi");
  return { ok: true, report };
}

/**
 * Admin sababchini belgilaydi yoki o'zgartiradi — reporter "bilmayman"
 * degan bo'lsa ham, yoki noto'g'ri taxmin qilgan bo'lsa ham. Faqat hali
 * boshlang'ich ko'rib chiqilmagan yozuvda ishlaydi.
 *
 * `javobgarId` callback_data'dan (raqamli tugma) keladi — normal foydalanishda
 * u faqat bot o'zi chiqargan haqiqiy ro'yxatdan bo'ladi, lekin boshqa shu
 * turdagi joylar (masalan shikoyat_kim) kabi bu yerda ham serverda
 * tekshiramiz: FK xatosiga tayanib qolmaymiz, aniq "topilmadi" javobi
 * qaytaramiz.
 *
 * @param javobgarId null — "hech kim (noma'lum)" deb belgilash
 */
export async function javobgarniOzgartir(
  reportId: number,
  javobgarId: number | null,
  ishonch: Ishonch,
): Promise<Report | null> {
  if (javobgarId !== null) {
    const [nishon] = await sql<{ id: number }[]>`
      SELECT id FROM users WHERE id = ${javobgarId} AND faol
    `;
    if (!nishon) return null;
  }

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
 * Admin tasdiqlaydi — sababchiga (bo'lsa) tuzatish uchun imkoniyat
 * beriladi. Ball hali berilmaydi.
 *
 * Ikki admin bir vaqtda bosishi mumkin, shuning uchun `FOR UPDATE` bilan
 * qulflangan tranzaksiya ichida — allaqachon ko'rib chiqilgan bo'lsa `null`.
 */
export async function shikoyatniTasdiqla(reportId: number, adminId: number): Promise<Report | null> {
  return sql.begin(async (tx) => {
    const [r] = await tx<Report[]>`
      SELECT * FROM reports WHERE id = ${reportId} AND holat = 'kutilmoqda' FOR UPDATE
    `;
    if (!r) return null;

    const [yangi] = await tx<Report[]>`
      UPDATE reports SET holat = 'tuzatilmoqda', admin_id = ${adminId}, confirmed_at = now()
      WHERE id = ${reportId}
      RETURNING *
    `;
    return yangi ?? null;
  });
}

/** Admin boshlang'ich ko'rib chiqishda rad etadi — hech qachon ball berilmaydi. */
export async function shikoyatniRadEt(reportId: number, adminId: number): Promise<Report | null> {
  return sql.begin(async (tx) => {
    const [r] = await tx<Report[]>`
      SELECT * FROM reports WHERE id = ${reportId} AND holat = 'kutilmoqda' FOR UPDATE
    `;
    if (!r) return null;

    const [yangi] = await tx<Report[]>`
      UPDATE reports SET holat = 'rad', admin_id = ${adminId}, hal_qilindi = now()
      WHERE id = ${reportId}
      RETURNING *
    `;
    return yangi ?? null;
  });
}

/**
 * Admin qayta tekshiradi: tuzatildimi yoki yo'qmi. "jarima" tanlansa ball
 * shu qatorning o'zida saqlanadi va rating.ts uni `holat = 'jarima'`
 * bo'yicha topib oladi — bitta shikoyat ikki marta ball bera olmaydi,
 * chunki `WHERE holat = 'tuzatilmoqda'` sharti uni faqat bir marta
 * o'tkazadi.
 */
export async function shikoyatniTekshir(
  reportId: number,
  adminId: number,
  natija: "tuzatildi" | "jarima",
): Promise<Report | null> {
  return sql.begin(async (tx) => {
    const [r] = await tx<Report[]>`
      SELECT * FROM reports WHERE id = ${reportId} AND holat = 'tuzatilmoqda' FOR UPDATE
    `;
    if (!r) return null;

    const [yangi] = await tx<Report[]>`
      UPDATE reports SET holat = ${natija}, admin_id = ${adminId}, hal_qilindi = now()
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
    LEFT JOIN users u2 ON u2.id = rp.reported_id
    WHERE rp.id = ${id}
  `;
  return r ?? null;
}

/** Hali admin boshlang'ich ko'rib chiqmagan yozuvlar — /shikoyatlar buyrug'i uchun. */
export async function kutayotganShikoyatlar(): Promise<ReportToliq[]> {
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

/** Guruhdagi anonim xabar id'sini saqlaydi — keyin qayta yubormasdan shuni tahrirlash uchun. */
export async function guruhXabarniSaqla(id: number, messageId: number): Promise<void> {
  await sql`UPDATE reports SET guruh_msg_id = ${messageId} WHERE id = ${id}`;
}
