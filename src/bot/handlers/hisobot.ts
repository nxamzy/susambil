/**
 * Admin hisobotlari — qo'lda ochish. Avtomatik yuborish `jobs/reminders.ts`
 * da (har navbat yopilgach va har oy boshida); bu yerda o'sha matnlarning
 * o'zi, ikkinchi nusxa yozilmagan (`core/hisobot.ts` + `bot/text.ts`).
 */
import type { Bot, Context } from "grammy";
import type { User } from "../../db/index.js";
import { faolNavbat } from "../../core/rotation.js";
import { navbatHisoboti, oldingiOy, oxirgiYopilganNavbat, oylikHisobot } from "../../core/hisobot.js";
import { bugungiSana } from "../../core/vaqt.js";
import { kim } from "../group.js";
import { hisobotKeyboard } from "../keyboards.js";
import { chekla, hisobotMenyuMatni, navbatHisobotiMatni, oylikHisobotMatni } from "../text.js";

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const u = await kim(ctx.from?.id);
  return u?.admin ? u : null;
}

async function navbatniKorsat(ctx: Context, turnId: number | null): Promise<void> {
  const h = turnId ? await navbatHisoboti(turnId) : null;
  if (!h) {
    await ctx.reply("🤷 Hisobot uchun navbat topilmadi.", { reply_markup: hisobotKeyboard() });
    return;
  }
  await ctx.reply(chekla(navbatHisobotiMatni(h)), { parse_mode: "HTML", reply_markup: hisobotKeyboard() });
}

async function oyniKorsat(ctx: Context, davr: string): Promise<void> {
  await ctx.reply(chekla(oylikHisobotMatni(await oylikHisobot(davr))), {
    parse_mode: "HTML",
    reply_markup: hisobotKeyboard(),
  });
}

export function register(bot: Bot) {
  bot.callbackQuery("hisobot", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(hisobotMenyuMatni(), { parse_mode: "HTML", reply_markup: hisobotKeyboard() });
  });

  bot.callbackQuery(/^hisobot:(oxirgi|joriy|oy|otgan)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const joriyOy = bugungiSana().slice(0, 7);
    switch (ctx.match[1]) {
      case "oxirgi":
        return navbatniKorsat(ctx, await oxirgiYopilganNavbat());
      case "joriy":
        return navbatniKorsat(ctx, (await faolNavbat())?.turn.id ?? null);
      case "oy":
        return oyniKorsat(ctx, joriyOy);
      case "otgan":
        return oyniKorsat(ctx, oldingiOy(joriyOy));
    }
  });

  bot.command("hisobot", async (ctx) => {
    if (ctx.chat.type !== "private" || !(await faqatAdmin(ctx))) return;
    await ctx.reply(hisobotMenyuMatni(), { parse_mode: "HTML", reply_markup: hisobotKeyboard() });
  });
}
