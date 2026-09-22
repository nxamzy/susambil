/**
 * "🗑 Musor to'ldi" — uyda turgan istalgan a'zo navbatdagi xonaga bir
 * bosishda xabar beradi, bot esa musor tashlanmaguncha eslatib turadi.
 *
 * NEGA KERAK: musor navbat o'rtasida kutilmaganda to'ladi. Avtomatik
 * oraliq eslatma (`oraliq_kun`) buni bilmaydi, admin esa navbatchiga
 * "📣 Xabar yuborish" orqali aytishi kerak edi — to'rt qadam va matn
 * yozish, amalda hech kim qilmasdi.
 *
 * IKKINCHI TASDIQLASH OQIMI EMAS. Signal faqat "hozir kerak" degan turtki:
 * u musor vazifasini (qulflangan bo'lsa ham) ochadi va navbatchi o'sha
 * mavjud yo'l bilan — rasm + "✅ Tugatdim" — javob beradi; `martaniYop`
 * dan keyin signal o'zi yopiladi. Faqat vazifa allaqachon to'liq
 * bajarilgan (ikkala marta ham) yoki navbat topshirilgan bo'lsa, DM'dagi
 * "🗑 Tashladim" tugmasi rasmsiz yopadi — bu holatda rasm yozadigan joy yo'q.
 *
 * Ochiq signal navbat+vazifa bo'yicha BITTA (qisman UNIQUE indeks): ikkinchi
 * odam bosganda yangisi yaralmaydi, mavjudining holati ko'rsatiladi.
 * Eslatma `jobs/reminders.ts` da, qolganlari bilan bir xil "holatdan qayta
 * hisoblash" intizomida (`oxirgi_eslatma` lahzasi, bayroq yo'q).
 */
import { sql } from "../db/index.js";
import { faollikYoz } from "./faollik.js";

/**
 * Signal beriladigan vazifa. `kod` yaratilgach o'zgarmaydi (CLAUDE.md),
 * `musor` esa `db/schema.sql` da seed qilingan standart vazifa — nomini
 * admin o'zgartirsa ham kod shu bo'lib qoladi.
 */
export const MUSOR_KOD = "musor";

export type Signal = {
  id: number;
  turn_id: number;
  vazifa_kod: string;
  user_id: number;
  created_at: Date;
  oxirgi_eslatma: Date | null;
  hal_qilindi: Date | null;
  hal_qildi: number | null;
};

/** Signal + kim xabar bergani va kim hal qilgani (ism bilan). */
export type SignalToliq = Signal & { ism: string; hal_ism: string | null };

const toliqUstunlar = () => sql`
  s.*, u.ism, h.ism AS hal_ism
`;

export async function signalniOl(id: number): Promise<SignalToliq | null> {
  const [s] = await sql<SignalToliq[]>`
    SELECT ${toliqUstunlar()} FROM navbat_signallari s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users h ON h.id = s.hal_qildi
    WHERE s.id = ${id}
  `;
  return s ?? null;
}

/** Shu navbatdagi ochiq signal — yo'q bo'lsa `null`. */
export async function ochiqSignal(turnId: number, kod: string): Promise<SignalToliq | null> {
  const [s] = await sql<SignalToliq[]>`
    SELECT ${toliqUstunlar()} FROM navbat_signallari s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users h ON h.id = s.hal_qildi
    WHERE s.turn_id = ${turnId} AND s.vazifa_kod = ${kod} AND s.hal_qilindi IS NULL
  `;
  return s ?? null;
}

/** Shu navbatda ochiq signali bor vazifa kodlari — panel qulfini ochish uchun. */
export async function ochiqSignalKodlari(turnId: number): Promise<Set<string>> {
  const rows = await sql<{ vazifa_kod: string }[]>`
    SELECT vazifa_kod FROM navbat_signallari
    WHERE turn_id = ${turnId} AND hal_qilindi IS NULL
  `;
  return new Set(rows.map((r) => r.vazifa_kod));
}

/** Navbatning barcha signallari (hisobot uchun) — eng eskisi birinchi. */
export async function navbatSignallari(turnId: number): Promise<SignalToliq[]> {
  return sql<SignalToliq[]>`
    SELECT ${toliqUstunlar()} FROM navbat_signallari s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users h ON h.id = s.hal_qildi
    WHERE s.turn_id = ${turnId}
    ORDER BY s.id
  `;
}

/**
 * Yangi signal. Ochig'i allaqachon bo'lsa `null` — ikki kishi bir vaqtda
 * bossa ham qisman UNIQUE indeks ikkinchisini to'sadi (`ON CONFLICT DO
 * NOTHING`), xato tashlanmaydi.
 */
export async function signalYarat(turnId: number, kod: string, userId: number): Promise<Signal | null> {
  const [s] = await sql<Signal[]>`
    INSERT INTO navbat_signallari (turn_id, vazifa_kod, user_id)
    VALUES (${turnId}, ${kod}, ${userId})
    ON CONFLICT (turn_id, vazifa_kod) WHERE hal_qilindi IS NULL DO NOTHING
    RETURNING *
  `;
  if (s) await faollikYoz(userId, "signal");
  return s ?? null;
}

/**
 * Ochiq signalni yopadi. Yopadigan narsa bo'lmasa `null` — chaqiruvchi
 * shunga qarab guruhga "tashlandi" deb yozadimi-yo'qmi hal qiladi, ya'ni
 * ikki marta bosilgan tugma ikkita e'lon tug'dirmaydi.
 */
export async function signalniYop(turnId: number, kod: string, userId: number): Promise<SignalToliq | null> {
  const [s] = await sql<{ id: number }[]>`
    UPDATE navbat_signallari SET hal_qilindi = now(), hal_qildi = ${userId}
    WHERE turn_id = ${turnId} AND vazifa_kod = ${kod} AND hal_qilindi IS NULL
    RETURNING id
  `;
  return s ? signalniOl(s.id) : null;
}

/** Eslatma YETKAZILGACH chaqiriladi — bloklangan hisob oraliqni yeb qo'ymasin. */
export async function signalEslatildi(id: number): Promise<void> {
  await sql`UPDATE navbat_signallari SET oxirgi_eslatma = now() WHERE id = ${id}`;
}

/**
 * Hozir yana eslatish kerakmi — sof funksiya. Birinchi DM signal berilgan
 * zahoti ketadi (u `oxirgi_eslatma`ni yozadi); yetmagan bo'lsa (hamma
 * bloklagan) yaratilgan vaqtdan hisoblanadi.
 */
export function signalEslatmasiKerakmi(p: {
  yaratildi: Date;
  oxirgiEslatma: Date | null;
  hozir: number;
  oraliqSoat: number;
}): boolean {
  const oxirgi = new Date(p.oxirgiEslatma ?? p.yaratildi).getTime();
  return p.hozir - oxirgi >= p.oraliqSoat * 3_600_000;
}
