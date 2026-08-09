import type { Bot, Context } from "grammy";
import { sql } from "../../db/index.js";
import { kim } from "../group.js";
import { esc } from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import {
  BOSHQA_ISH,
  MENYU,
  menyuKeyboard,
  SHIKOYAT_TUGMA,
  tugmaIshTuri,
  xonaTanlashKeyboard,
} from "../keyboards.js";
import { summaniSora, xarajatniSaqla } from "./expense.js";
import { korinish, panelMatni } from "./commands.js";
import { ishniBoshla, ishRasminiSora } from "./chores.js";
import { javobgarIzohiSaqlandi, shikoyatBoshla, shikoyatIzohSaqlandi, shikoyatJoySora } from "./reports.js";
import { tolovDalilSora, tolovRadEtish, tolovTasdiqlash } from "./tolov.js";
import { summaTekshir } from "../../core/topshiriq.js";

/**
 * Doimiy menyu tugmasi bosilgan bo'lsa bajaradi. Bu tekshiruv jarayon
 * qadamlaridan oldin turadi: menyu har doim ishlashi kerak, aks holda
 * yarim qolgan jarayon odamni qamab qo'yadi.
 */
async function menyuTugmasi(ctx: Context, matn: string): Promise<boolean> {
  if (!ctx.from) return false;

  const ish = tugmaIshTuri(matn);
  if (ish) {
    await ishniBoshla(ctx, ish);
    return true;
  }

  if (matn === SHIKOYAT_TUGMA) {
    await shikoyatBoshla(ctx);
    return true;
  }

  const nom =
    matn === BOSHQA_ISH
      ? ("boshqaish" as const)
      : (Object.keys(MENYU) as (keyof typeof MENYU)[]).find((k) => MENYU[k] === matn);
  if (!nom) return false;

  if (!(await kim(ctx.from.id))) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return true;
  }
  await korinish(ctx, nom);
  return true;
}

/**
 * Shaxsiy chatdagi oddiy matn. Jarayon ketayotgan bo'lsa — o'sha qadam,
 * bo'lmasa — panel ko'rsatiladi (hech kim buyruq yozib o'tirmasin).
 */
export function register(bot: Bot) {
  bot.on("message:text", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    // Tanilgan buyruqlar yuqoridagi handlerlarda ushlanadi — bu yergacha
    // faqat yo'q buyruq yetib keladi. Jimgina qaytmaymiz: odam menyudan
    // eski buyruqni bosib, javob kelmasa nima bo'lganini bilmaydi.
    if (ctx.message.text.startsWith("/")) {
      await ctx.reply("Bunday buyruq yo'q. /yordam yozing yoki pastdagi tugmalardan foydalaning.");
      return;
    }

    if (await menyuTugmasi(ctx, ctx.message.text.trim())) {
      // Doimiy tugma bosilganda uning yozuvi chatda oddiy xabar bo'lib
      // qolib ketadi ("Hammom tozaladim") — chat toza tursin deb o'chiramiz.
      await ctx.deleteMessage().catch(() => {});
      return;
    }

    const holat = await holatOl(ctx.from.id);

    if (holat?.tur === "royxat" && holat.qadam === "ism") {
      const ism = ctx.message.text.trim().slice(0, 40);
      if (ism.length < 2) return ctx.reply("Ism juda qisqa. Qaytadan yozing.");

      const band = await sql<{ id: number }[]>`
        SELECT id FROM users WHERE lower(ism) = lower(${ism}) AND faol
      `;
      if (band.length > 0) {
        return ctx.reply("Bu ism ro'yxatda bor. Boshqacha yozing (masalan familiyangiz bilan).");
      }

      await sorovniOchir(ctx.api, holat);
      const yangi = { tur: "royxat", qadam: "xona", ism } as const;
      await holatOrnat(ctx.from.id, yangi);

      const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
      const xabar = await ctx.reply(
        `👋 Xush kelibsiz, <b>${esc(ism)}</b>!\n\n🚪 <b>Qaysi xonada turasiz?</b>`,
        { parse_mode: "HTML", reply_markup: xonaTanlashKeyboard(xonalar.map((x) => x.raqam)) },
      );
      await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
      return;
    }

    if (holat?.tur === "ish" && "qadam" in holat && holat.qadam === "izoh") {
      const izoh = ctx.message.text.trim().slice(0, 300);
      if (izoh.length < 3) return ctx.reply("Juda qisqa. Nima qilganingizni yozing.");
      return ishRasminiSora(ctx, holat.ish, izoh);
    }

    if (holat?.tur === "xarajat" && holat.qadam === "izoh") {
      const izoh = ctx.message.text.trim().slice(0, 300);
      if (izoh.length < 2) return ctx.reply("Juda qisqa. Nima olib kelganingizni yozing.");
      return summaniSora(ctx, izoh, holat.photoId);
    }

    if (holat?.tur === "xarajat" && holat.qadam === "summa") {
      const xom = ctx.message.text.trim();
      // "0" — pul ketmagan degani, bu to'g'ri javob
      const summa = /^0+$/.test(xom.replace(/\D/g, "")) ? 0 : summaTekshir(xom);
      if (summa === null) {
        return ctx.reply("Faqat raqam yozing, masalan: 120000\nPul ketmagan bo'lsa: 0");
      }
      return xarajatniSaqla(ctx, holat.izoh, holat.photoId, summa || null);
    }

    if (holat?.tur === "xarajat" && holat.qadam === "rasm") {
      return ctx.reply("📷 Avval rasmini tashlang.");
    }

    if (holat?.tur === "shikoyat" && holat.qadam === "izoh") {
      const izoh = ctx.message.text.trim().slice(0, 500);
      if (izoh.length < 5) return ctx.reply("Juda qisqa. Nima bo'lganini birroz batafsil yozing.");
      return shikoyatJoySora(ctx, izoh);
    }

    if (holat?.tur === "shikoyat" && holat.qadam === "dalil") {
      return ctx.reply("📷 Avval rasm/video tashlang (yoki tugmani bosing).");
    }

    if (holat?.tur === "shikoyat") {
      return ctx.reply("👆 Yuqoridagi tugmalardan birini tanlang.");
    }

    if (holat?.tur === "shikoyat_izoh") {
      const izoh = ctx.message.text.trim().slice(0, 500);
      if (izoh.length < 2) return ctx.reply("Juda qisqa. Qaytadan yozing.");
      return shikoyatIzohSaqlandi(ctx, holat.reportId, izoh);
    }

    if (holat?.tur === "javobgar_izoh") {
      const izoh = ctx.message.text.trim().slice(0, 500);
      if (izoh.length < 2) return ctx.reply("Juda qisqa. Qaytadan yozing.");
      return javobgarIzohiSaqlandi(ctx, holat.reportId, izoh);
    }

    if (holat?.tur === "tolov" && holat.qadam === "summa") {
      const summa = summaTekshir(ctx.message.text.trim());
      if (summa === null) return ctx.reply("Faqat musbat raqam yozing, masalan: 400000");
      return tolovDalilSora(ctx, summa);
    }

    if (holat?.tur === "tolov" && holat.qadam === "dalil") {
      return ctx.reply("📎 Avval to'lov dalilini (rasm yoki PDF) tashlang.");
    }

    if (holat?.tur === "tolov_tasdiq") {
      return tolovTasdiqlash(ctx, holat.tolovId, ctx.message.text.trim());
    }

    if (holat?.tur === "tolov_rad") {
      return tolovRadEtish(ctx, holat.tolovId, ctx.message.text.trim());
    }

    if (holat?.tur === "ish") {
      return ctx.reply("📷 Rasm kutyapman — qilgan ishingizning rasmini tashlang.");
    }

    const u = await kim(ctx.from.id);
    if (!u) {
      await holatTozala(ctx.from.id);
      return ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    }

    await ctx.reply(await panelMatni(), {
      parse_mode: "HTML",
      reply_markup: menyuKeyboard(),
    });
  });
}
