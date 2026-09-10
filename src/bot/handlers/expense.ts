import type { Bot, Context } from "grammy";
import { sql } from "../../db/index.js";
import { BALLAR } from "../../config.js";
import { sozlamalarOl } from "../../core/sozlamalar.js";
import { topshiriqYarat } from "../../core/topshiriq.js";
import { guruhId, kim } from "../group.js";
import { AJRATGICH, topshiriqXabari } from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import { bekorKeyboard, tasdiqKeyboard } from "../keyboards.js";

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

/** Nomi yozilgach summasini so'raymiz. */
export async function summaniSora(
  ctx: Context,
  izoh: string,
  photoId: string,
): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const yangi = { tur: "xarajat", qadam: "summa", photoId, izoh } as const;
  await holatOrnat(ctx.from.id, yangi);

  const xabar = await ctx.reply(
    [
      `💰 <b>Qancha pul ketdi?</b>`,
      ``,
      `<i>Faqat raqam yozing:</i> <code>120000</code>`,
      ``,
      `<i>Bilmasangiz yoki pul ketmagan bo'lsa</i> <code>0</code> <i>yozing.</i>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
}

/**
 * Hammasi yig'ilgach chaqiriladi. Ilgari shu yerda darrov ball berilardi;
 * endi guruh tasdig'idan keyin beriladi.
 *
 * Summa va ball ikki xil narsa: summa — sarflangan pul, ball esa har qanday
 * xarajat uchun bir xil. Summa ballga ta'sir qilmaydi.
 */
export async function xarajatniSaqla(
  ctx: Context,
  izoh: string,
  photoId: string | null,
  summa: number | null,
): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) return;

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const sub = await topshiriqYarat(
    u.id,
    { tur: "xarajat", izoh, summa },
    photoId ? [photoId] : [],
  );
  const { kerakliTasdiq: kerak } = await sozlamalarOl();

  await ctx.reply(
    [
      `✅ <b>Qabul qildim.</b>`,
      ``,
      `Guruhga tasdiqqa qo'ydim — <b>${kerak} kishi</b> bosgach`,
      `<b>+${BALLAR.xarajat} ball</b> qo'shiladi.`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );

  const chatId = await guruhId();
  if (!chatId) return;

  const matn = topshiriqXabari(sub, u.ism, [], kerak);
  const tugma = tasdiqKeyboard(sub.id, 0, kerak);

  const xabar = photoId
    ? await ctx.api.sendPhoto(chatId, photoId, {
        caption: matn,
        parse_mode: "HTML",
        reply_markup: tugma,
      })
    : await ctx.api.sendMessage(chatId, matn, { parse_mode: "HTML", reply_markup: tugma });

  await sql`UPDATE submissions SET guruh_msg_id = ${xabar.message_id} WHERE id = ${sub.id}`;
}

export function register(bot: Bot) {
  // Ikkala nom ham ishlasin: menyuda /xarajat turadi, eski /yangixarajat esa
  // odat bo'lib qolganlar uchun qoldirildi.
  bot.command(["xarajat", "yangixarajat"], async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        `🛒 Xarajatni botga shaxsiy yozib qo'shasiz:\nhttps://t.me/${ctx.me.username}?start=xarajat`,
      );
    }
    await xarajatniBoshla(ctx);
  });
}
