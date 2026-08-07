import type { Bot } from "grammy";
import { sql } from "../../db/index.js";
import { ISH_TURLARI, type IshTuri } from "../../config.js";
import { kim } from "../group.js";
import { esc } from "../text.js";
import { holatOrnat, sorovniEslat } from "../state.js";
import { bekorKeyboard } from "../keyboards.js";

/** Bir odam bir ishni 30 daqiqada bir martadan ko'p belgilay olmaydi. */
const TAKROR_MS = 30 * 60_000;

export function register(bot: Bot) {
  bot.callbackQuery(/^ish:(musor|hammom|oshxona)$/, async (ctx) => {
    const tur = ctx.match[1] as IshTuri;
    const t = ISH_TURLARI[tur];

    const u = await kim(ctx.from.id);
    if (!u) {
      return ctx.answerCallbackQuery({
        text: "Siz ro'yxatda yo'qsiz. Botga shaxsiy yozib /start bosing.",
        show_alert: true,
      });
    }

    const [oxirgi] = await sql<{ created_at: Date }[]>`
      SELECT created_at FROM chores
      WHERE user_id = ${u.id} AND tur = ${tur}
      ORDER BY id DESC LIMIT 1
    `;
    if (oxirgi && Date.now() - new Date(oxirgi.created_at).getTime() < TAKROR_MS) {
      return ctx.answerCallbackQuery({
        text: "Yaqinda belgilagansiz. Biroz kutib turing.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({ text: "📷 Endi rasmini tashlang" }).catch(() => {});

    const holat = { tur: "ish", ish: tur, chatId: ctx.chat?.id ?? 0 } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply(
      [
        `${t.emoji} <b>${esc(u.ism)}</b> — ${esc(t.tugma.toLowerCase())}`,
        ``,
        `📷 <b>Tasdiqlash uchun rasmini tashlang.</b>`,
        `🏅 Rasm kelgach <b>+${t.ball} ball</b> qo'shiladi.`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );

    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });
}
