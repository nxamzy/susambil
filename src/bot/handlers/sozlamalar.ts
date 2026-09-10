/**
 * Admin: umumiy sozlamalar — Admin Panel → "⚙️ Sozlamalar".
 *
 * `config.ts`dagi qiymatlar (kerakli tasdiqlar, eslatma chastotasi/oynalari,
 * jarima, to'lov muddati/eslatmasi) endi shu yerdan o'zgartiriladi. Barcha
 * mantiq `core/sozlamalar.ts`da — bu fayl faqat Telegram sim-tortishi.
 */
import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { User } from "../../db/index.js";
import {
  SOZLAMA_TAVSIF,
  SOZLAMA_VARIANT,
  sozlamaOrnat,
  sozlamalarOl,
  type SozlamaKalit,
} from "../../core/sozlamalar.js";
import { kim } from "../group.js";
import { AJRATGICH, esc, pul } from "../text.js";

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

const KALITLAR = Object.keys(SOZLAMA_TAVSIF) as SozlamaKalit[];

/** Qiymatni odam tilida — jarima so'mda, qolganlari son. */
function qiymatMatni(kalit: SozlamaKalit, q: number): string {
  return kalit === "jarima_kunlik" ? (q === 0 ? "o'chiq" : pul(q)) : String(q);
}

async function sozlamalarKorsat(ctx: Context): Promise<void> {
  const s = await sozlamalarOl();
  const qatorlar = [`⚙️ <b>UMUMIY SOZLAMALAR</b>`, AJRATGICH, ``];
  for (const kalit of KALITLAR) {
    const t = SOZLAMA_TAVSIF[kalit];
    qatorlar.push(
      `• <b>${esc(t.nom)}:</b> ${qiymatMatni(kalit, s[t.maydon])}`,
      `  <i>${esc(t.izoh)}</i>`,
    );
  }
  qatorlar.push(``, `<i>O'zgartirish uchun tugmani bosing.</i>`);

  const kb = new InlineKeyboard();
  for (const kalit of KALITLAR) {
    kb.text(SOZLAMA_TAVSIF[kalit].nom, `sozlama:${kalit}`).row();
  }
  kb.text("⬅️ Admin panel", "admin_panel");

  await ctx.reply(qatorlar.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

async function birSozlamaKorsat(ctx: Context, kalit: SozlamaKalit): Promise<void> {
  const t = SOZLAMA_TAVSIF[kalit];
  const joriy = (await sozlamalarOl())[t.maydon];

  const kb = new InlineKeyboard();
  for (const [i, v] of SOZLAMA_VARIANT[kalit].entries()) {
    kb.text(`${qiymatMatni(kalit, v)}${v === joriy ? " ✓" : ""}`, `sozlama_set:${kalit}:${v}`);
    if (i % 4 === 3) kb.row();
  }
  kb.row().text("⬅️ Orqaga", "sozlamalar");

  await ctx.reply(
    [
      `⚙️ <b>${esc(t.nom)}</b>`,
      AJRATGICH,
      ``,
      `Hozirgisi: <b>${qiymatMatni(kalit, joriy)}</b>`,
      ``,
      `<i>${esc(t.izoh)}</i>`,
      ...(kalit === "tolov_muddat_kuni"
        ? [``, `<i>⚠️ Faqat KELGUSI oylik sikllarga ta'sir qiladi.</i>`]
        : []),
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: kb },
  );
}

export function register(bot: Bot) {
  bot.callbackQuery("sozlamalar", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await sozlamalarKorsat(ctx);
  });

  bot.callbackQuery(/^sozlama:([a-z_]+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const kalit = ctx.match[1] as SozlamaKalit;
    if (!(kalit in SOZLAMA_TAVSIF)) {
      return ctx.answerCallbackQuery({ text: "Noma'lum sozlama." }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await birSozlamaKorsat(ctx, kalit);
  });

  bot.callbackQuery(/^sozlama_set:([a-z_]+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const kalit = ctx.match[1] as SozlamaKalit;
    if (!(kalit in SOZLAMA_TAVSIF)) {
      return ctx.answerCallbackQuery({ text: "Noma'lum sozlama." }).catch(() => {});
    }

    const yangi = await sozlamaOrnat(admin.id, kalit, Number(ctx.match[2]));
    await ctx.answerCallbackQuery({ text: `✅ ${qiymatMatni(kalit, yangi)}` }).catch(() => {});
    await birSozlamaKorsat(ctx, kalit);
  });
}
