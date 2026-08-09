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

/**
 * Guruhga xabar yuboradi. Guruh hali sozlanmagan bo'lsa yoki yuborish
 * muvaffaqiyatsiz bo'lsa (bot guruhdan chiqarilgan, guruh o'chirilgan va h.k.)
 * `null` qaytaradi va sababini log qiladi — chaqiruvchi shu orqali "yetdi
 * yoki yo'q"ni bilib, kerak bo'lsa (masalan eslatmalarni) ertaga qayta
 * urinishga qoldirishi mumkin.
 */
export async function guruhgaYubor(api: Api, matn: string, extra: object = {}) {
  const id = await guruhId();
  if (!id) {
    console.error("[guruhgaYubor] guruh sozlanmagan (guruh_id yo'q) — yuborilmadi.");
    return null;
  }
  try {
    return await api.sendMessage(id, matn, { parse_mode: "HTML", ...extra });
  } catch (e) {
    console.error("[guruhgaYubor] guruhga yuborishda xato:", e);
    return null;
  }
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

/**
 * Botga DM yuborish mumkin bo'lgan hamma admin — shikoyat va to'lov kabi
 * har qanday "adminlarga xabar/tasdiq" oqimi shu bir xil ro'yxatdan
 * foydalanadi, ikkinchi nusxa yozilmaydi.
 */
export async function adminlarRoyxati(): Promise<User[]> {
  return sql<User[]>`SELECT * FROM users WHERE admin AND faol AND telegram_id IS NOT NULL`;
}

/**
 * Shaxsiy xabar yuboradi. Odam hali ulanmagan bo'lsa (`telegram_id` yo'q)
 * jimgina o'tkazib yuboriladi — bu normal holat, log kerak emas. Yuborish
 * o'zi muvaffaqiyatsiz bo'lsa esa (bot bloklangan, hisob o'chirilgan,
 * xabar noto'g'ri formatlangan) — bu odatiy emas, shuning uchun log
 * qilinadi va kim ekani (`ism`/`id`) ko'rsatiladi, aks holda muammoni
 * hech kim payqamas edi.
 *
 * @returns true — yetkazildi, false — ulanmagan yoki muvaffaqiyatsiz
 */
export async function shaxsiy(
  api: Api,
  u: User,
  matn: string,
  extra: object = {},
): Promise<boolean> {
  if (!u.telegram_id) return false;
  try {
    await api.sendMessage(Number(u.telegram_id), matn, { parse_mode: "HTML", ...extra });
    return true;
  } catch (e) {
    console.error(`[shaxsiy] ${u.ism} (id=${u.id}) ga xabar yuborib bo'lmadi:`, e);
    return false;
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
