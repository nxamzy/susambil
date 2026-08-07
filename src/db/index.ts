import postgres from "postgres";
import { config } from "../config.js";

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

export type Submission = {
  id: number;
  turn_id: number;
  user_id: number;
  photo_ids: string[];
  guruh_msg_id: string | null;
  bekor: boolean;
  created_at: Date;
};
