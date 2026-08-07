import type { Bot, Context } from "grammy";
import { BALLAR } from "../../config.js";
import { xarajatQoshish } from "../../core/expenses.js";
import { guruhId, kim } from "../group.js";
import { esc } from "../text.js";
import { holatOrnat, holatTozala } from "../state.js";
import { bekorKeyboard } from "../keyboards.js";

const SORAV =
  "📷 Olib kelgan narsangizning rasmini tashlang.\n\n" +
  "<i>Rasm kelgach nima olib kelganingizni so'rayman.</i>";

export async function xarajatniBoshla(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }
  await holatOrnat(ctx.from.id, { tur: "xarajat", qadam: "rasm" });
  await ctx.reply(SORAV, { parse_mode: "HTML", reply_markup: bekorKeyboard() });
}

/** Rasm va nomi yig'ilgach chaqiriladi. */
export async function xarajatniSaqla(
  ctx: Context,
  izoh: string,
  photoId: string | null,
): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) return;

  await holatTozala(ctx.from.id);
  await xarajatQoshish(u.id, izoh, photoId);

  await ctx.reply(`✅ Yozib qo'ydim — <b>+${BALLAR.xarajat} ball</b>`, { parse_mode: "HTML" });

  const chatId = await guruhId();
  if (!chatId) return;

  const matn =
    `🛒 <b>${esc(u.ism)}</b> uyga olib keldi:\n\n` +
    `${esc(izoh)}\n\n` +
    `🏅 <b>+${BALLAR.xarajat} ball</b>`;

  if (photoId) {
    await ctx.api.sendPhoto(chatId, photoId, { caption: matn, parse_mode: "HTML" });
  } else {
    await ctx.api.sendMessage(chatId, matn, { parse_mode: "HTML" });
  }
}

export function register(bot: Bot) {
  bot.command("yangixarajat", async (ctx) => {
    if (ctx.chat.type !== "private") {
      const me = ctx.me.username;
      return ctx.reply(
        `Xarajatni botga shaxsiy yozib qo'shasiz: https://t.me/${me}?start=xarajat`,
      );
    }
    await xarajatniBoshla(ctx);
  });
}
