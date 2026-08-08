import type { Bot, Context } from "grammy";
import { sql } from "../../db/index.js";
import { kim } from "../group.js";
import { esc } from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import { MENYU, menyuKeyboard, tugmaIshTuri, xonaTanlashKeyboard } from "../keyboards.js";
import { xarajatniSaqla } from "./expense.js";
import { korinish, panelMatni } from "./commands.js";
import { ishniBoshla } from "./chores.js";

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

  const nom = (Object.keys(MENYU) as (keyof typeof MENYU)[]).find((k) => MENYU[k] === matn);
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
    if (ctx.message.text.startsWith("/")) return;

    if (await menyuTugmasi(ctx, ctx.message.text.trim())) return;

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

    if (holat?.tur === "xarajat" && holat.qadam === "izoh") {
      const izoh = ctx.message.text.trim().slice(0, 300);
      if (izoh.length < 2) return ctx.reply("Juda qisqa. Nima olib kelganingizni yozing.");
      return xarajatniSaqla(ctx, izoh, holat.photoId);
    }

    if (holat?.tur === "xarajat" && holat.qadam === "rasm") {
      return ctx.reply("📷 Avval rasmini tashlang.");
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
