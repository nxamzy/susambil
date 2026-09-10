/**
 * Admin: navbat vazifalarini sozlash.
 *
 * Nima uchun bor: "Mening Navbatim" panelidagi majburiy ishlar ro'yxati
 * (va har biriga nechta rasm kerakligi) ilgari `config.ts` ichida qattiq
 * yozilgan edi — uyda ikkinchi hammom paydo bo'lsa kod tahriri va deploy
 * kerak bo'lardi. Endi ro'yxat bazada (`core/vazifalar.ts`) va shu panelda
 * boshqariladi, xuddi foydalanuvchilar `adminUsers.ts` da boshqarilgani
 * kabi — o'sha naqsh takrorlanadi, ikkinchi usul o'ylab topilmagan.
 *
 * Barcha yozuvchi amallar `core/vazifalar.ts` orqali; jurnalga yozish ham
 * o'sha yerda, bu yerda takrorlanmaydi.
 */
import type { Bot, Context } from "grammy";
import type { User } from "../../db/index.js";
import { RASM_MAX } from "../../config.js";
import {
  barchaVazifalar,
  faolVazifalar,
  vazifaFaollikni,
  vazifaKochir,
  vazifaNominiOzgartir,
  vazifaOl,
  vazifaQoshish,
  vazifaRasmSoniniOrnat,
  vazifaTakrorSoniniOrnat,
  vazifaOraliqKuniniOrnat,
  VAZIFA_MAX,
} from "../../core/vazifalar.js";
import { kim } from "../group.js";
import {
  bekorKeyboard,
  vazifaDetalKeyboard,
  vazifalarKeyboard,
  vazifaRasmSoniKeyboard,
  vazifaTakrorSoniKeyboard,
  vazifaOraliqKuniKeyboard,
} from "../keyboards.js";
import { esc, vazifaDetalMatni, vazifalarMatni } from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

export async function vazifalarKorsat(ctx: Context): Promise<void> {
  const royxat = await barchaVazifalar();
  await ctx.reply(vazifalarMatni(royxat), {
    parse_mode: "HTML",
    reply_markup: vazifalarKeyboard(royxat),
  });
}

/**
 * Bitta vazifa kartochkasi. ⬆️/⬇️ tugmalari faqat haqiqatan ko'chirish
 * mumkin bo'lsa chiqadi — buni bilish uchun joriy FAOL ro'yxatdagi o'rni
 * hisoblanadi (nofaol vazifa hech qayerga ko'chmaydi).
 */
async function vazifaDetalKorsat(ctx: Context, id: number): Promise<void> {
  const v = await vazifaOl(id);
  if (!v) {
    await ctx.reply("Bu vazifa topilmadi.");
    return;
  }

  const faol = await faolVazifalar();
  const joy = faol.findIndex((x) => x.id === v.id);
  await ctx.reply(vazifaDetalMatni(v), {
    parse_mode: "HTML",
    reply_markup: vazifaDetalKeyboard(v, joy > 0, joy !== -1 && joy < faol.length - 1),
  });
}

/** Yangi vazifa nomi yozilgach — messages.ts dispatch'idan chaqiriladi. */
export async function vazifaYangiNomiKeldi(ctx: Context, xom: string): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin || !ctx.from) return;

  const natija = await vazifaQoshish(admin.id, xom);
  if (!natija.ok) {
    await ctx.reply(
      natija.sabab === "kop"
        ? `Vazifalar soni eng ko'pi ${VAZIFA_MAX} ta. Avval keraksizini ro'yxatdan chiqaring.`
        : "Nom juda qisqa. Qaytadan yozing.",
    );
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const v = natija.vazifa;
  // Rasm sonini darrov so'raymiz: standarti 1, lekin hammom kabi vazifaga
  // odatda ko'proq kerak — keyin alohida qidirib o'tirmasin.
  await ctx.reply(
    [
      `✅ <b>${esc(v.emoji)} ${esc(v.nom)}</b> qo'shildi.`,
      ``,
      `📷 <b>Nechta rasm talab qilinsin?</b>`,
      ``,
      `<i>Bu MINIMUM: shuncha rasm kelgach vazifa bajarilgan hisoblanadi.</i>`,
      `<i>Undan ortig'i ham rad etilmaydi (${RASM_MAX} tagacha).</i>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: vazifaRasmSoniKeyboard(v.id) },
  );
}

/** Mavjud vazifaning yangi nomi yozilgach. */
export async function vazifaNomiKeldi(
  ctx: Context,
  vazifaId: number,
  xom: string,
): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin || !ctx.from) return;

  const v = await vazifaNominiOzgartir(admin.id, vazifaId, xom);
  if (!v) {
    await ctx.reply("Nom juda qisqa yoki vazifa topilmadi. Qaytadan yozing.");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);
  await vazifaDetalKorsat(ctx, vazifaId);
}

export function register(bot: Bot) {
  bot.callbackQuery("vazifalar", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await vazifalarKorsat(ctx);
  });

  bot.callbackQuery(/^vazifa:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await vazifaDetalKorsat(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery("vazifa_yangi", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "vazifa_yangi" } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply(
      [
        `➕ <b>YANGI VAZIFA</b>`,
        ``,
        `Nomini yozing. Boshiga emoji qo'ysangiz o'sha ishlatiladi:`,
        `<code>🚿 2-hammom</code>`,
        ``,
        `<i>Emojisiz yozsangiz 🧹 qo'yiladi.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery(/^vazifa_nom:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const vazifaId = Number(ctx.match[1]);
    const v = await vazifaOl(vazifaId);
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "vazifa_nom", vazifaId } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply(
      [
        `✏️ <b>Yangi nom</b>`,
        ``,
        `Hozirgisi: <b>${esc(v.emoji)} ${esc(v.nom)}</b>`,
        ``,
        `<i>Ichki kalit (<code>${esc(v.kod)}</code>) o'zgarmaydi — shuning</i>`,
        `<i>uchun eski navbatlardagi rasmlar yo'qolmaydi.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery(/^vazifa_rasm:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const vazifaId = Number(ctx.match[1]);
    const v = await vazifaOl(vazifaId);
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      [
        `📷 <b>${esc(v.nom)} — nechta rasm?</b>`,
        ``,
        `Hozirgisi: <b>${v.rasm_soni}</b> ta`,
        ``,
        `<i>Bu MINIMUM: shuncha rasm kelgach vazifa bajarilgan hisoblanadi,</i>`,
        `<i>ortig'i esa rad etilmaydi (${RASM_MAX} tagacha saqlanadi).</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: vazifaRasmSoniKeyboard(v.id) },
    );
  });

  bot.callbackQuery(/^vazifa_rasm_set:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const vazifaId = Number(ctx.match[1]);
    const v = await vazifaRasmSoniniOrnat(admin.id, vazifaId, Number(ctx.match[2]));
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx.answerCallbackQuery({ text: `✅ ${v.rasm_soni} ta rasm` }).catch(() => {});
    await vazifaDetalKorsat(ctx, vazifaId);
  });

  bot.callbackQuery(/^vazifa_takror:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const vazifaId = Number(ctx.match[1]);
    const v = await vazifaOl(vazifaId);
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      [
        `🔁 <b>${esc(v.nom)} — navbat davomida necha marta?</b>`,
        ``,
        `Hozirgisi: <b>${v.takror_soni}</b> marta`,
        ``,
        `<i>Musor idishi 5 kunlik navbatda odatda 2 marta to'ladi —</i>`,
        `<i>har safar alohida rasm bilan tasdiqlanadi. Oddiy vazifaga 1.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: vazifaTakrorSoniKeyboard(v.id) },
    );
  });

  bot.callbackQuery(/^vazifa_takror_set:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const vazifaId = Number(ctx.match[1]);
    const v = await vazifaTakrorSoniniOrnat(admin.id, vazifaId, Number(ctx.match[2]));
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx.answerCallbackQuery({ text: `✅ ${v.takror_soni} marta` }).catch(() => {});
    await vazifaDetalKorsat(ctx, vazifaId);
  });

  bot.callbackQuery(/^vazifa_oraliq:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const vazifaId = Number(ctx.match[1]);
    const v = await vazifaOl(vazifaId);
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      [
        `🕐 <b>${esc(v.nom)} — oraliq eslatma</b>`,
        ``,
        v.oraliq_kun > 0
          ? `Hozirgisi: navbatning <b>${v.oraliq_kun}-kunidan</b>`
          : `Hozirgisi: <b>o'chiq</b>`,
        ``,
        `<i>Yoqilsa, vazifa navbat boshlanganidan shuncha kun o'tgach</i>`,
        `<i>erta ochiladi va bajarilmasa xona a'zolariga har 5 soatda</i>`,
        `<i>DM boradi — 1-marta bajarilgunicha. Musor uchun 3-kun.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: vazifaOraliqKuniKeyboard(v.id) },
    );
  });

  bot.callbackQuery(/^vazifa_oraliq_set:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const vazifaId = Number(ctx.match[1]);
    const v = await vazifaOraliqKuniniOrnat(admin.id, vazifaId, Number(ctx.match[2]));
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx
      .answerCallbackQuery({ text: v.oraliq_kun > 0 ? `✅ ${v.oraliq_kun}-kundan` : "✅ O'chirildi" })
      .catch(() => {});
    await vazifaDetalKorsat(ctx, vazifaId);
  });

  bot.callbackQuery(/^vazifa_faol:(\d+):(0|1)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const vazifaId = Number(ctx.match[1]);
    const yangiFaol = ctx.match[2] === "1";

    // Oxirgi faol vazifani o'chirishga yo'l qo'ymaymiz: bo'sh ro'yxatda
    // navbatni umuman yakunlab bo'lmaydi (`barchaIshlarBajarildimi` false
    // qaytaradi) va navbatchi qamalib qolardi.
    if (!yangiFaol) {
      const faol = await faolVazifalar();
      if (faol.length <= 1) {
        return ctx
          .answerCallbackQuery({
            text: "Bu oxirgi vazifa — o'chirilsa navbatni yakunlab bo'lmaydi.",
            show_alert: true,
          })
          .catch(() => {});
      }
    }

    const v = await vazifaFaollikni(admin.id, vazifaId, yangiFaol);
    if (!v) return ctx.answerCallbackQuery({ text: "Vazifa topilmadi." }).catch(() => {});

    await ctx
      .answerCallbackQuery({ text: yangiFaol ? "✅ Ro'yxatga qaytdi" : "⛔️ Ro'yxatdan chiqdi" })
      .catch(() => {});
    await vazifaDetalKorsat(ctx, vazifaId);
  });

  bot.callbackQuery(/^vazifa_kochir:(\d+):(yuqori|past)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const vazifaId = Number(ctx.match[1]);
    const kochdi = await vazifaKochir(admin.id, vazifaId, ctx.match[2] as "yuqori" | "past");
    await ctx
      .answerCallbackQuery({ text: kochdi ? "✅ Ko'chirildi" : "Bu chekkadagi vazifa." })
      .catch(() => {});
    if (kochdi) await vazifalarKorsat(ctx);
  });
}
