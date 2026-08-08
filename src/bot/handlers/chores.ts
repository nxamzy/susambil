import type { Bot, Context } from "grammy";
import { sql, type User } from "../../db/index.js";
import { ISH_TURLARI, type IshTuri } from "../../config.js";
import { kim } from "../group.js";
import { esc } from "../text.js";
import { holatOl, holatOrnat, sorovniEslat, sorovniOchir } from "../state.js";
import { bekorKeyboard } from "../keyboards.js";

/** Bir odam bir ishni 30 daqiqada bir martadan ko'p belgilay olmaydi. */
const TAKROR_MS = 30 * 60_000;

/** Ish boshlash mumkinmi? Mumkin bo'lsa odamni, bo'lmasa sababini qaytaradi. */
async function tekshir(telegramId: number, tur: IshTuri): Promise<User | string> {
  const u = await kim(telegramId);
  if (!u) return "Siz ro'yxatda yo'qsiz. Botga shaxsiy yozib /start bosing.";

  const [oxirgi] = await sql<{ created_at: Date }[]>`
    SELECT created_at FROM chores
    WHERE user_id = ${u.id} AND tur = ${tur}
    ORDER BY id DESC LIMIT 1
  `;
  if (oxirgi && Date.now() - new Date(oxirgi.created_at).getTime() < TAKROR_MS) {
    return "Yaqinda belgilagansiz. Biroz kutib turing.";
  }
  return u;
}

/** Rasm kutish holatiga o'tkazadi va so'rov xabarini yuboradi. */
async function sora(ctx: Context, u: User, tur: IshTuri): Promise<void> {
  if (!ctx.from) return;
  const t = ISH_TURLARI[tur];

  // Oldingi tugallanmagan so'rov qolib ketmasin — menyu tugmasi bilan
  // yangisini boshlash oson bo'lgani uchun eskisi chatda osilib qolardi.
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

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
}

/** Doimiy menyudagi matnli tugma bosilganda (callback emas). */
export async function ishniBoshla(ctx: Context, tur: IshTuri): Promise<void> {
  if (!ctx.from) return;
  const n = await tekshir(ctx.from.id, tur);
  if (typeof n === "string") {
    await ctx.reply(n);
    return;
  }
  await sora(ctx, n, tur);
}

export function register(bot: Bot) {
  bot.callbackQuery(/^ish:(musor|hammom|oshxona)$/, async (ctx) => {
    const tur = ctx.match[1] as IshTuri;

    const n = await tekshir(ctx.from.id, tur);
    if (typeof n === "string") {
      return ctx.answerCallbackQuery({ text: n, show_alert: true });
    }

    await ctx.answerCallbackQuery({ text: "📷 Endi rasmini tashlang" }).catch(() => {});
    await sora(ctx, n, tur);
  });
}
