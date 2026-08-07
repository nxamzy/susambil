import type { Api } from "grammy";
import { sql, type User } from "../db/index.js";
import { config } from "../config.js";

let keshlanganGuruh: number | null | undefined;

/** Guruh chat id si: avval .env, bo'lmasa settings jadvalidan. */
export async function guruhId(): Promise<number | null> {
  if (keshlanganGuruh !== undefined) return keshlanganGuruh;
  if (config.groupChatId) {
    keshlanganGuruh = config.groupChatId;
    return keshlanganGuruh;
  }
  const [r] = await sql<{ qiymat: string }[]>`
    SELECT qiymat FROM settings WHERE kalit = 'guruh_id'
  `;
  keshlanganGuruh = r ? Number(r.qiymat) : null;
  return keshlanganGuruh;
}

export async function guruhIdOrnat(id: number): Promise<void> {
  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES ('guruh_id', ${String(id)})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
  keshlanganGuruh = id;
}

export async function guruhgaYubor(api: Api, matn: string, extra: object = {}) {
  const id = await guruhId();
  if (!id) return null;
  return api.sendMessage(id, matn, { parse_mode: "HTML", ...extra });
}

/** Telegram id bo'yicha ro'yxatdan o'tgan odamni topadi. */
export async function kim(telegramId: number | undefined): Promise<User | null> {
  if (!telegramId) return null;
  const [u] = await sql<User[]>`
    SELECT * FROM users WHERE telegram_id = ${telegramId} AND faol
  `;
  return u ?? null;
}

/** Shaxsiy xabar yuboradi; odam botni bloklagan bo'lsa jim o'tadi. */
export async function shaxsiy(api: Api, u: User, matn: string, extra: object = {}) {
  if (!u.telegram_id) return;
  try {
    await api.sendMessage(Number(u.telegram_id), matn, { parse_mode: "HTML", ...extra });
  } catch {
    /* bot bloklangan yoki hali /start bosilmagan */
  }
}
