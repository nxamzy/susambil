import type { Bot } from "grammy";
import { sql } from "../../db/index.js";
import { ISH_TURLARI, type IshTuri } from "../../config.js";
import { guruhId, kim } from "../group.js";
import { esc } from "../text.js";

/** Bir odam bir ishni 30 daqiqada bir martadan ko'p bosa olmaydi (tasodifiy bosishga qarshi). */
const TAKROR_MS = 30 * 60_000;

export function register(bot: Bot) {
  bot.callbackQuery(/^ish:(musor|hammom|oshxona)$/, async (ctx) => {
    const tur = ctx.match[1] as IshTuri;

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

    await sql`INSERT INTO chores (user_id, tur) VALUES (${u.id}, ${tur})`;
    await ctx.answerCallbackQuery({ text: `${ISH_TURLARI[tur].emoji} Yozib qo'ydim, rahmat!` });

    const chatId = await guruhId();
    if (chatId) {
      await ctx.api.sendMessage(
        chatId,
        `${ISH_TURLARI[tur].emoji} <b>${esc(u.ism)}</b> ${ISH_TURLARI[tur].matn}.`,
        { parse_mode: "HTML" },
      );
    }
  });
}
