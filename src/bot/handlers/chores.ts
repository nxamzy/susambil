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

/**
 * Ish boshlanadi. Ba'zi turlar (masalan "Boshqa ish") avval izoh talab
 * qiladi — u holda avval nima qilganini so'raymiz, rasm keyin keladi.
 */
async function sora(ctx: Context, u: User, tur: IshTuri): Promise<void> {
  if (!ctx.from) return;
  const t = ISH_TURLARI[tur];

  // Oldingi tugallanmagan so'rov qolib ketmasin — menyu tugmasi bilan
  // yangisini boshlash oson bo'lgani uchun eskisi chatda osilib qolardi.
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  if (t.izohShart) {
    const holat = { tur: "ish", ish: tur, qadam: "izoh", chatId: ctx.chat?.id ?? 0 } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply(
      [
        `${t.emoji} <b>Nima qildingiz?</b>`,
        ``,
        `<i>Qisqa yozing:</i> <code>Koridorni supurdim</code>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
    return;
  }

  await rasmSora(ctx, tur, null, u.ism);
}

/** Izoh yozilgach (yoki kerak bo'lmasa darrov) rasm so'raymiz. */
export async function ishRasminiSora(
  ctx: Context,
  tur: IshTuri,
  izoh: string,
): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  const u = await kim(ctx.from.id);
  await rasmSora(ctx, tur, izoh, u?.ism ?? "");
}

async function rasmSora(
  ctx: Context,
  tur: IshTuri,
  izoh: string | null,
  ism: string,
): Promise<void> {
  if (!ctx.from) return;
  const t = ISH_TURLARI[tur];

  const holat = { tur: "ish", ish: tur, chatId: ctx.chat?.id ?? 0, ...(izoh ? { izoh } : {}) } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `${t.emoji} <b>${esc(ism)}</b> — ${esc(t.tugma.toLowerCase())}`,
      ...(izoh ? [`📝 ${esc(izoh)}`] : []),
      ``,
      `📷 <b>Rasmini tashlang.</b>`,
      `🏅 Guruh tasdig'idan keyin <b>+${t.ball} ball</b>.`,
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
