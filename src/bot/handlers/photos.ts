import type { Bot } from "grammy";
import { kim } from "../group.js";
import { holatOl } from "../state.js";
import { shikoyatDalilKeldi } from "./reports.js";
import { tolovDalilKeldi } from "./tolov.js";
import { vazifaRasmiKeldi } from "./navbat.js";

/**
 * Rasm uch xil maqsadda kelishi mumkin — tartib muhim, har biri holat
 * tekshiruvi bilan aniq ushlanadi, aks holda masalan shikoyat dalili
 * boshqa oqimga tushib qolib, butunlay boshqa joyga yozilib ketardi:
 *   1) shikoyat dalili — faqat shaxsiy chatda
 *   2) to'lov cheki (kvartira puli yoki pul yig'imi) — faqat shaxsiy chatda
 *   3) navbat vazifasi dalili — faqat shaxsiy chatda, "Mening Navbatim"
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

    // Shikoyat oqimi faqat shaxsiy chatda — guruhga tashlangan rasm
    // navbat topshirig'iga ketishi kerak.
    if (holat?.tur === "shikoyat" && holat.qadam === "dalil" && ctx.chat.type === "private") {
      return shikoyatDalilKeldi(ctx, holat, eng.file_id, "rasm");
    }

    // To'lov dalili ham faqat shaxsiy chatda — xuddi shikoyatdagi kabi.
    // `siklId` yig'imga to'lovni bildiradi (bo'lmasa kvartira puli).
    if (holat?.tur === "tolov" && holat.qadam === "dalil" && ctx.chat.type === "private") {
      return tolovDalilKeldi(ctx, holat.summa, eng.file_id, "rasm", holat.siklId);
    }

    // Navbat vazifasi dalili — "Mening Navbatim" panelida tugma bosilgach,
    // faqat shaxsiy chatda. Boshqa hech qanday holatda rasm hech nimaga
    // bog'lanmaydi — guruhga tasodifan tashlangan rasm endi avtomatik
    // navbatga hisoblanmaydi (aniq vazifa tugmasi bosilishi shart).
    if (holat?.tur === "navbat_ish" && ctx.chat.type === "private") {
      return vazifaRasmiKeldi(ctx, holat.kod, holat.turnId, eng.file_id);
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

    await tolovDalilKeldi(ctx, holat.summa, ctx.message.document.file_id, "hujjat", holat.siklId);
  });
}

