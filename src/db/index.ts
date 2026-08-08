import postgres from "postgres";
import { config, type Ishonch, type ShikoyatJoyi } from "../config.js";

/** Neon'ning "-pooler" manzili PgBouncer (transaction mode) orqali ishlaydi —
 *  u prepared statement'larni qo'llab-quvvatlamaydi, shuning uchun o'chiramiz. */
const poolerOrqali = config.databaseUrl.includes("-pooler.");

export const sql = postgres(config.databaseUrl, {
  ssl: config.databaseUrl.includes("sslmode=require") ? "require" : undefined,
  max: 5,
  prepare: !poolerOrqali,
  transform: { undefined: null },
});

export type Room = { id: number; raqam: number; tartib: number };

export type User = {
  id: number;
  ism: string;
  telegram_id: string | null;
  username: string | null;
  room_id: number | null;
  admin: boolean;
  faol: boolean;
};

export type Turn = {
  id: number;
  room_id: number;
  boshlandi: Date;
  muddat: Date;
  tasdiqlandi: Date | null;
  holat: "faol" | "tasdiqlandi" | "admin_yopdi";
  kechikkan_kun: number;
  eslatildi: boolean;
  oxirgi_ping: Date | null;
};

/** Topshiriq turi. Uchalasi ham bir xil tasdiqlash yo'lidan o'tadi. */
export type SubTur = "navbat" | "ish" | "xarajat";

/** kutilmoqda → tasdiqlandi | rad */
export type SubHolat = "kutilmoqda" | "tasdiqlandi" | "rad";

export type Submission = {
  id: number;
  /** Faqat tur='navbat' da to'la, boshqasida null */
  turn_id: number | null;
  user_id: number;
  photo_ids: string[];
  media_group_id: string | null;
  guruh_msg_id: string | null;
  bekor: boolean;
  created_at: Date;
  tur: SubTur;
  /** musor | hammom | oshxona | xona | boshqa — faqat tur='ish' da */
  ish_turi: string | null;
  izoh: string | null;
  /** BIGINT — postgres.js uni matn qilib qaytaradi */
  summa: string | null;
  /** Server hisoblab yozadi; mijozdan hech qachon olinmaydi */
  ball: number;
  holat: SubHolat;
  yopildi: Date | null;
  rad_sababi: string | null;
  rad_qildi: number | null;
};

/**
 * kutilmoqda -> tuzatilmoqda -> tuzatildi | jarima
 *           \-> rad
 *
 * Bitta admin hal qiladi (ko'p kishilik tasdiq emas). "tuzatilmoqda" —
 * admin tasdiqlagan, sababchiga tuzatish uchun imkoniyat berilgan;
 * "jarima" — tuzatilmagan, ball ayirilgan; "tuzatildi" — hal qilingan,
 * ball ayirilmagan.
 */
export type ReportHolat = "kutilmoqda" | "tuzatilmoqda" | "tuzatildi" | "jarima" | "rad";

/**
 * Anonim shikoyat. `reporter_id` va `reported_id` faqat admin ko'radigan
 * joylarda ishlatiladi (adminga DM, /shikoyatlar) — guruhga yoki oddiy
 * a'zoga chiqadigan hech qanday matnda bu maydonlar o'qilmasligi kerak.
 */
export type Report = {
  id: number;
  reporter_id: number;
  /** Sababchi noma'lum bo'lsa null — admin keyinroq belgilashi mumkin */
  reported_id: number | null;
  ishonch: Ishonch;
  joy: ShikoyatJoyi;
  izoh: string;
  photo_id: string | null;
  media_turi: "rasm" | "video";
  ball: number;
  holat: ReportHolat;
  admin_id: number | null;
  /** Adminning erkin izohi — reporterning izohidan alohida */
  admin_note: string | null;
  /** Admin tasdiqlab, tuzatish uchun imkoniyat bergan payt */
  confirmed_at: Date | null;
  hal_qilindi: Date | null;
  admin_msgs: { chat_id: number; message_id: number }[];
  /** Guruhdagi anonim xabar — qayta yubormasdan shu tahrirlanadi */
  guruh_msg_id: string | null;
  created_at: Date;
};
