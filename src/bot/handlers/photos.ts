import type { Bot, Context } from "grammy";
import { sql, type User } from "../../db/index.js";
import { config, ISH_TURLARI, type IshTuri } from "../../config.js";
import { guruhId, kim } from "../group.js";
import { tasdiqKeyboard, bekorKeyboard } from "../keyboards.js";
import { topshiriqXabari } from "../text.js";
import { topshiriqYarat } from "../../core/topshiriq.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import { shikoyatDalilKeldi } from "./reports.js";
import { tolovDalilKeldi } from "./tolov.js";
import { vazifaRasmiKeldi } from "./navbat.js";

/**
 * Rasm besh xil maqsadda kelishi mumkin — tartib muhim, har biri holat
 * tekshiruvi bilan aniq ushlanadi, aks holda masalan shikoyat dalili
 * boshqa oqimga tushib qolib, butunlay boshqa joyga yozilib ketardi:
 *   1) qo'shimcha ish tasdig'i (tugma bosilgan, rasm kutilyapti)
 *   2) yangi xarajat rasmi — faqat shaxsiy chatda
 *   3) shikoyat dalili — faqat shaxsiy chatda
 *   4) kvartira to'lovi dalili — faqat shaxsiy chatda
 *   5) navbat vazifasi dalili — faqat shaxsiy chatda, "Mening Navbatim"
 *      panelida tugma bosilgandan keyin (`navbat_ish` holati)
 *
 * Video faqat shikoyat dalili sifatida, PDF esa faqat to'lov dalili
 * sifatida ishlatiladi — boshqa hech qanday oqim ularni kutmaydi, shuning
 * uchun ikkalasi ham alohida, qisqa handler bilan yetarli.
 */
export function register(bot: Bot) {
  bot.on("message:photo", async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId) return;

    const eng = ctx.message.photo.at(-1);
    if (!eng) return;

    const u = await kim(fromId);
    if (!u) {
      if (ctx.chat.type === "private") {
        await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
      }
      return;
    }

    const holat = await holatOl(fromId);

    if (holat?.tur === "ish") {
      if ("qadam" in holat && holat.qadam === "izoh") {
        await ctx.reply("✍️ Avval nima qilganingizni yozing.");
        return;
      }
      await sorovniOchir(ctx.api, holat);
      return ishniYakunla(ctx, u, holat.ish, holat.izoh ?? null, eng.file_id);
    }

    // Xarajat oqimi faqat shaxsiy chatda. Aks holda odam botda xarajat
    // boshlab, guruhga tozalash rasmini tashlasa — birinchi rasm xarajatga
    // ketib qolardi.
    if (holat?.tur === "xarajat" && holat.qadam === "rasm" && ctx.chat.type === "private") {
      await sorovniOchir(ctx.api, holat);
      const yangi = { tur: "xarajat", qadam: "izoh", photoId: eng.file_id } as const;
      await holatOrnat(fromId, yangi);
      const xabar = await ctx.reply(
        [
          `✍️ <b>Nima olib keldingiz?</b>`,
          ``,
          `<i>Bir nechta narsa bo'lsa hammasini yozing:</i>`,
          `<code>Falga, gubka, qop-qog'oz</code>`,
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: bekorKeyboard() },
      );
      await sorovniEslat(fromId, yangi, xabar.chat.id, xabar.message_id);
      return;
    }

    // Shikoyat oqimi ham faqat shaxsiy chatda — xuddi xarajatdagi kabi,
    // guruhga tashlangan rasm navbat topshirig'iga ketishi kerak.
    if (holat?.tur === "shikoyat" && holat.qadam === "dalil" && ctx.chat.type === "private") {
      return shikoyatDalilKeldi(ctx, holat, eng.file_id, "rasm");
    }

    // To'lov dalili ham faqat shaxsiy chatda — xuddi shikoyat/xarajatdagi kabi.
    if (holat?.tur === "tolov" && holat.qadam === "dalil" && ctx.chat.type === "private") {
      return tolovDalilKeldi(ctx, holat.summa, eng.file_id, "rasm");
    }

    // Navbat vazifasi dalili — "Mening Navbatim" panelida tugma bosilgach,
    // faqat shaxsiy chatda. Boshqa hech qanday holatda rasm hech nimaga
    // bog'lanmaydi — guruhga tasodifan tashlangan rasm endi avtomatik
    // navbatga hisoblanmaydi (aniq vazifa tugmasi bosilishi shart).
    if (holat?.tur === "navbat_ish" && ctx.chat.type === "private") {
      return vazifaRasmiKeldi(ctx, holat.ish, holat.turnId, eng.file_id);
    }
  });

  // Video faqat shikoyat dalili sifatida qabul qilinadi — boshqa hech
  // qanday jarayon uni kutmaydi, shuning uchun boshqa holatlarda jim o'tadi.
  bot.on("message:video", async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId || ctx.chat.type !== "private") return;

    const holat = await holatOl(fromId);
    if (holat?.tur !== "shikoyat" || holat.qadam !== "dalil") return;

    await shikoyatDalilKeldi(ctx, holat, ctx.message.video.file_id, "video");
  });

  // Hujjat (PDF) faqat to'lov dalili sifatida qabul qilinadi — boshqa
  // fayl turlari yoki jarayonlar bunga tegishli emas.
  bot.on("message:document", async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId || ctx.chat.type !== "private") return;

    const holat = await holatOl(fromId);
    if (holat?.tur !== "tolov" || holat.qadam !== "dalil") return;

    if (ctx.message.document.mime_type !== "application/pdf") {
      await ctx.reply("📎 Faqat rasm yoki PDF hujjat qabul qilinadi.");
      return;
    }

    await tolovDalilKeldi(ctx, holat.summa, ctx.message.document.file_id, "hujjat");
  });
}

/**
 * Qo'shimcha ish rasmi keldi. Ilgari shu yerda darrov ball berilardi; endi
 * topshiriq guruhga tasdiqqa chiqadi va ball faqat tasdiqdan keyin beriladi.
 */
export async function ishniYakunla(
  ctx: Context,
  u: User,
  ish: IshTuri,
  izoh: string | null,
  photoId: string | null,
) {
  const t = ISH_TURLARI[ish];
  const sub = await topshiriqYarat(u.id, { tur: "ish", ish, izoh }, photoId ? [photoId] : []);
  if (ctx.from) await holatTozala(ctx.from.id);

  await ctx.reply(
    [
      `${t.emoji} <b>Qabul qildim.</b>`,
      ``,
      `Guruhga tasdiqqa qo'ydim — <b>${config.kerakliTasdiq} kishi</b> bosgach`,
      `<b>+${t.ball} ball</b> qo'shiladi.`,
      ``,
      `<i>Holatini "Profil" bo'limidan kuzatasiz.</i>`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );

  const guruh = await guruhId();
  if (!guruh) return;

  const matn = topshiriqXabari(sub, u.ism, [], config.kerakliTasdiq);
  const tugma = tasdiqKeyboard(sub.id, 0, config.kerakliTasdiq);

  const xabar = photoId
    ? await ctx.api.sendPhoto(guruh, photoId, {
        caption: matn,
        parse_mode: "HTML",
        reply_markup: tugma,
      })
    : await ctx.api.sendMessage(guruh, matn, { parse_mode: "HTML", reply_markup: tugma });

  await sql`UPDATE submissions SET guruh_msg_id = ${xabar.message_id} WHERE id = ${sub.id}`;
}
