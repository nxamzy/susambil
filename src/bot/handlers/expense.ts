import type { Bot, Context } from "grammy";
import { xarajatQoshish, pul } from "../../core/kassa.js";
import { guruhId, kim } from "../group.js";
import { esc } from "../text.js";
import { xarajatHolati, xarajatOrnat, xarajatTozala } from "../state.js";

function summaOqi(matn: string): number | null {
  const raqam = matn.replace(/[^\d]/g, "");
  if (!raqam) return null;
  const n = Number(raqam);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function register(bot: Bot) {
  async function saqla(ctx: Context, summa: number, izoh: string, photoId: string | null) {
    if (!ctx.from) return;
    const u = await kim(ctx.from.id);
    if (!u) return;
    await xarajatTozala(ctx.from.id);

    const { ulush } = await xarajatQoshish(u.id, summa, izoh, photoId);

    await ctx.reply(
      `✅ Yozib qo'ydim.\n\n<b>${esc(izoh)}</b> — ${pul(summa)}\n` +
        (ulush ? `Har kimdan ${pul(ulush)} ulush yozildi.` : ""),
      { parse_mode: "HTML" },
    );

    const chatId = await guruhId();
    if (!chatId) return;

    const matn =
      `🛒 <b>${esc(u.ism)}</b> xarajat qildi\n\n` +
      `${esc(izoh)} — <b>${pul(summa)}</b>\n` +
      (ulush ? `<i>Har kimning ulushi: ${pul(ulush)}</i>` : "");

    if (photoId) {
      await ctx.api.sendPhoto(chatId, photoId, { caption: matn, parse_mode: "HTML" });
    } else {
      await ctx.api.sendMessage(chatId, matn, { parse_mode: "HTML" });
    }
  }

  bot.command("xarajat", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply("Xarajatni botga shaxsiy yozing — bu yerda summa so'rashim kerak.");
    }
    if (!ctx.from) return;
    const u = await kim(ctx.from.id);
    if (!u) return ctx.reply("Avval /start bosib ro'yxatdan o'ting.");

    await xarajatOrnat(ctx.from.id, { qadam: "summa" });
    await ctx.reply(
      "💸 Qancha pul sarfladingiz?\n\nFaqat raqam yozing, masalan: <code>45000</code>\n\nBekor qilish: /otkaz",
      { parse_mode: "HTML" },
    );
  });

  bot.command("otkaz", async (ctx) => {
    if (ctx.from) await xarajatTozala(ctx.from.id);
    await ctx.reply("Bekor qilindi.");
  });

  bot.command("rasmsiz", async (ctx) => {
    if (!ctx.from) return;
    const holat = await xarajatHolati(ctx.from.id);
    if (!holat || holat.qadam !== "rasm") return;
    await saqla(ctx, holat.summa, holat.izoh, null);
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private" || !ctx.from) return next();
    if (ctx.message.text.startsWith("/")) return next();

    const holat = await xarajatHolati(ctx.from.id);
    if (!holat) return next();

    if (holat.qadam === "summa") {
      const summa = summaOqi(ctx.message.text);
      if (!summa) return ctx.reply("Tushunmadim. Faqat raqam yozing, masalan: 45000");
      await xarajatOrnat(ctx.from.id, { qadam: "izoh", summa });
      return ctx.reply(`✅ ${pul(summa)}\n\nNima olib keldingiz? Qisqacha yozing.`);
    }

    if (holat.qadam === "izoh") {
      await xarajatOrnat(ctx.from.id, {
        qadam: "rasm",
        summa: holat.summa,
        izoh: ctx.message.text.slice(0, 200),
      });
      return ctx.reply("📷 Endi chek yoki mahsulot rasmini tashlang.\n\nRasmsiz saqlash: /rasmsiz");
    }

    return ctx.reply("Rasm kutyapman. Yoki /rasmsiz deb yozing.");
  });

  bot.on("message:photo", async (ctx, next) => {
    if (ctx.chat.type !== "private" || !ctx.from) return next();
    const holat = await xarajatHolati(ctx.from.id);
    if (!holat || holat.qadam !== "rasm") return next();

    const eng = ctx.message.photo.at(-1);
    await saqla(ctx, holat.summa, holat.izoh, eng?.file_id ?? null);
  });
}
