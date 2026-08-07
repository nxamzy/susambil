import type { Bot, Context } from "grammy";
import { BALLAR } from "../../config.js";
import { xarajatQoshish } from "../../core/expenses.js";
import { guruhId, kim } from "../group.js";
import { esc, AJRATGICH } from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import { bekorKeyboard } from "../keyboards.js";

export async function xarajatniBoshla(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }

  const holat = { tur: "xarajat", qadam: "rasm" } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `🛒 <b>YANGI XARAJAT</b>`,
      AJRATGICH,
      ``,
      `📷 <b>Olib kelgan narsangizning rasmini tashlang.</b>`,
      ``,
      `<i>Rasm kelgach nima olib kelganingizni so'rayman.</i>`,
      `🏅 <b>+${BALLAR.xarajat} ball</b>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );

  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
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

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);
  await xarajatQoshish(u.id, izoh, photoId);

  await ctx.reply(`✅ Yozib qo'ydim — 🏅 <b>+${BALLAR.xarajat} ball</b>`, { parse_mode: "HTML" });

  const chatId = await guruhId();
  if (!chatId) return;

  const matn = [
    `🛒 <b>${esc(u.ism)}</b> uyga olib keldi:`,
    ``,
    `📦 ${esc(izoh)}`,
    ``,
    `🏅 <b>+${BALLAR.xarajat} ball</b>`,
  ].join("\n");

  if (photoId) {
    await ctx.api.sendPhoto(chatId, photoId, { caption: matn, parse_mode: "HTML" });
  } else {
    await ctx.api.sendMessage(chatId, matn, { parse_mode: "HTML" });
  }
}

export function register(bot: Bot) {
  bot.command("yangixarajat", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        `🛒 Xarajatni botga shaxsiy yozib qo'shasiz:\nhttps://t.me/${ctx.me.username}?start=xarajat`,
      );
    }
    await xarajatniBoshla(ctx);
  });
}
