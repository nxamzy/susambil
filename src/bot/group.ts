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

/**
 * Ma'lumot xabari (reyting, tarix, navbat...). Chatda bir vaqtda faqat
 * bittasi turadi — yangisini yuborishdan oldin eskisi o'chiriladi, aks holda
 * guruh tugma bosilgani sayin to'lib ketardi.
 */
export async function korishXabar(
  api: Api,
  chatId: number,
  matn: string,
  extra: object = {},
): Promise<void> {
  const kalit = `korish_msg:${chatId}`;

  const [eski] = await sql<{ qiymat: string }[]>`
    SELECT qiymat FROM settings WHERE kalit = ${kalit}
  `;
  if (eski?.qiymat) {
    await api.deleteMessage(chatId, Number(eski.qiymat)).catch(() => {});
  }

  const yangi = await api.sendMessage(chatId, matn, { parse_mode: "HTML", ...extra });

  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES (${kalit}, ${String(yangi.message_id)})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
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

export type AzolikHolati = "azo" | "azo_emas" | "guruh_yoq";

/**
 * Odam hozir guruh a'zosimi — bazadagi holatga emas, Telegram'ning o'ziga
 * so'raladi (`getChatMember`), shuning uchun guruhdan chiqib ketgan odam
 * darrov aniqlanadi.
 *
 * Guruh hali sozlanmagan bo'lsa ("guruh_yoq") ataylab TO'SIQ QO'YMAYMIZ —
 * aks holda hech kim /id bosmaguncha butun shikoyat funksiyasi butunlay
 * ishlamay qolardi. Faqat aniq "chiqib ketgan/chiqarilgan" holatda
 * to'siladi.
 */
export async function guruhAzosimi(api: Api, telegramId: number): Promise<AzolikHolati> {
  const chatId = await guruhId();
  if (!chatId) return "guruh_yoq";

  try {
    const azo = await api.getChatMember(chatId, telegramId);
    return azo.status === "left" || azo.status === "kicked" ? "azo_emas" : "azo";
  } catch {
    // Telegram odam guruhda hech qachon bo'lmagan holatda ham xato qaytarishi
    // mumkin — bu ham "a'zo emas" degani.
    return "azo_emas";
  }
}
