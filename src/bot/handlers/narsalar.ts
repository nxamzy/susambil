/**
 * "Uyga nima kerak" ro'yxati — Telegram tomoni.
 *
 * NEGA BOR: yig'im e'lon qilinganda "nima olamiz" ro'yxati har safar kalta
 * chiqardi, chunki nima tugaganini faqat admin eslardi. Endi bumaga
 * tugaganini KO'RGAN odam bir tugma bosadi, ro'yxat o'sib boradi va admin
 * yig'im boshlaganda tayyor turadi.
 *
 * Shu sababli ikkita qoida:
 *
 *  1) Belgilash va ro'yxatga qo'shish — HAMMAGA ochiq, admin bo'lish shart
 *     emas. Aks holda ro'yxat yana bitta odamning xotirasiga bog'lanib
 *     qolardi, ya'ni muammo joyida qolardi.
 *  2) Belgilangan zahoti ADMINLARGA DM ketadi. Ro'yxat jimgina o'sib,
 *     hech kim qaramasa foydasi yo'q.
 *
 * Ro'yxatning O'ZINI tahrirlash (nom, ro'yxatdan chiqarish, "olindi" bilan
 * tozalash) — admin qo'lida, `handlers/vazifalar.ts` bilan bir xil naqsh.
 */
import type { Bot, Context } from "grammy";
import type { User } from "../../db/index.js";
import {
  barchaNarsalar,
  faolNarsalar,
  keraklilar,
  narsaBor,
  narsaFaollikni,
  narsaNominiOzgartir,
  narsaTugadi,
  narsalarOlindi,
  narsalarQosh,
  narsaniOl,
} from "../../core/narsalar.js";
import { adminlarRoyxati, guruhgaYubor, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  narsaDetalKeyboard,
  narsalarKeyboard,
  narsalarTahrirKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH,
  narsaDetalMatni,
  narsaTugadiAdminga,
  narsalarMatni,
  narsalarOlindiGuruh,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const u = await kim(ctx.from?.id);
  return u?.admin ? u : null;
}

/** Ro'yxatni ko'rsatadi. `javob=false` bo'lsa mavjud xabarni tahrirlaydi. */
export async function narsalarKorsat(ctx: Context, tahrirla = false): Promise<void> {
  const u = await kim(ctx.from?.id);
  const admin = Boolean(u?.admin);
  const narsalar = admin ? await barchaNarsalar() : await faolNarsalar();

  const matn = narsalarMatni(narsalar, admin);
  const kb = narsalarKeyboard(narsalar, admin);

  // Tugma bosilganda yangi xabar yozmaymiz — bitta jonli ro'yxat turadi
  // (`state.ts` `sorovniTahrirla` va `group.ts` `korishXabar` bilan bir xil
  // falsafa: ro'yxat har bosishda chatni to'ldirmasin).
  if (tahrirla) {
    const ok = await ctx
      .editMessageText(matn, { parse_mode: "HTML", reply_markup: kb })
      .then(() => true)
      .catch(() => false);
    if (ok) return;
  }
  await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
}

/**
 * Narsa nomi(lari) yozilgach — messages.ts'dan chaqiriladi.
 *
 * BIR YO'LDA bir nechtasini qabul qiladi (`qatorlarniAjrat`): admin
 * ko'pincha "1. Bumaga / 2. Hammom uchun azelit / 3. Oshxona uchun
 * azelit" kabi tayyor ro'yxat yozadi, bitta-bitta so'rab charchatishning
 * hojati yo'q.
 */
export async function narsaNomiKeldi(ctx: Context, xom: string): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) return;

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const { qoshildi, borEdi, sabab } = await narsalarQosh(u.id, xom);

  if (qoshildi.length === 0 && borEdi.length === 0) {
    await ctx.reply(
      sabab === "kop"
        ? "Ro'yxat to'lib ketdi. Avval keraksizlarini ro'yxatdan chiqaring."
        : "Nom juda qisqa. Qaytadan yozing.",
    );
    await narsalarKorsat(ctx);
    return;
  }

  const xabar: string[] = [];
  if (qoshildi.length > 0) {
    xabar.push(
      `✅ <b>Qo'shildi (${qoshildi.length} ta):</b>`,
      ...qoshildi.map((n) => `   ${n.emoji} ${n.nom}`),
    );
  }
  if (borEdi.length > 0) {
    xabar.push(
      ...(xabar.length > 0 ? [``] : []),
      `<i>Ro'yxatda allaqachon bor edi (endi «tugadi»):</i>`,
      ...borEdi.map((n) => `   • ${n}`),
    );
  }
  if (sabab === "kop") xabar.push(``, `⚠️ Ro'yxat to'lib qoldi, qolganlari qo'shilmadi.`);

  await ctx.reply(xabar.join("\n"), { parse_mode: "HTML" });
  for (const n of qoshildi) await adminlarniOgohlantir(ctx, n, u);
  await narsalarKorsat(ctx);
}

/** Admin narsaning yangi nomini yozgach. */
export async function narsaNomTahririKeldi(
  ctx: Context,
  narsaId: number,
  xom: string,
): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin || !ctx.from) return;

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const yangi = await narsaNominiOzgartir(admin.id, narsaId, xom);
  if (!yangi) {
    await ctx.reply("Nom juda qisqa yoki narsa topilmadi.");
    return;
  }
  await ctx.reply(`✅ Endi: <b>${yangi.emoji} ${yangi.nom}</b>`, { parse_mode: "HTML" });

  const toliq = await narsaniOl(narsaId);
  if (toliq) {
    await ctx.reply(narsaDetalMatni(toliq), {
      parse_mode: "HTML",
      reply_markup: narsaDetalKeyboard(toliq),
    });
  }
}

/**
 * Narsa tugadi deb belgilanganda adminlarga DM.
 *
 * Guruhga YOZILMAYDI: bumaga tugagani butun guruhni bezovta qiladigan
 * xabar emas, lekin admin buni bilishi shart — yig'imni u boshlaydi.
 */
async function adminlarniOgohlantir(
  ctx: Context,
  narsa: { emoji: string; nom: string },
  kimAytdi: User,
): Promise<void> {
  const soni = (await keraklilar()).length;
  const matn = narsaTugadiAdminga(narsa, kimAytdi.ism, soni);
  for (const a of await adminlarRoyxati()) {
    if (a.id === kimAytdi.id) continue; // o'zi belgilagan bo'lsa o'ziga kerak emas
    await shaxsiy(ctx.api, a, matn);
  }
}

export function register(bot: Bot) {
  bot.command("kerak", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!(await kim(ctx.from?.id))) {
      return ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    }
    await narsalarKorsat(ctx);
  });

  bot.callbackQuery("narsalar", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!(await kim(ctx.from?.id))) {
      return ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    }
    await narsalarKorsat(ctx);
  });

  /** Bitta bosish: tugadi ↔ bor. Ro'yxat o'sha xabarning o'zida yangilanadi. */
  bot.callbackQuery(/^narsa_belgi:(\d+)$/, async (ctx) => {
    const u = await kim(ctx.from?.id);
    if (!u) {
      return ctx
        .answerCallbackQuery({ text: "Avval /start bosib ro'yxatdan o'ting.", show_alert: true })
        .catch(() => {});
    }

    const id = Number(ctx.match[1]);
    const narsa = await narsaniOl(id);
    if (!narsa) return ctx.answerCallbackQuery().catch(() => {});

    if (narsa.tugadi) {
      await narsaBor(id);
      await ctx.answerCallbackQuery({ text: `${narsa.nom} — bor deb belgilandi` }).catch(() => {});
    } else {
      const yangi = await narsaTugadi(id, u.id);
      await ctx.answerCallbackQuery({ text: `${narsa.nom} — ro'yxatga tushdi` }).catch(() => {});
      // Faqat HAQIQATAN yangi belgilangan bo'lsa xabar ketadi: ikki kishi
      // ketma-ket bossa adminga ikki marta DM kelmasin (`narsaTugadi`
      // `tugadi IS NULL` sharti bilan ikkinchisiga `null` qaytaradi).
      if (yangi) await adminlarniOgohlantir(ctx, narsa, u);
    }

    await narsalarKorsat(ctx, true);
  });

  bot.callbackQuery("narsa_yangi", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!ctx.from || !(await kim(ctx.from.id))) return;

    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    const holat = { tur: "narsa_yangi" } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply(
      [
        `🛒 <b>NIMA KERAK?</b>`,
        AJRATGICH,
        ``,
        `Narsalarni yozing — bir nechtasi bo'lsa har birini`,
        `ALOHIDA QATORDA:`,
        ``,
        `<code>Bumaga</code>`,
        `<code>Hammom uchun azelit</code>`,
        `<code>Oshxona uchun azelit</code>`,
        ``,
        `<i>Emoji ham qo'yish mumkin:</i> <code>🧴 Shampun</code>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  // --- admin: ro'yxatni tahrirlash --------------------------------------

  bot.callbackQuery("narsa_tahrir", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    const narsalar = await barchaNarsalar();
    await ctx.reply(narsalarMatni(narsalar, true), {
      parse_mode: "HTML",
      reply_markup: narsalarTahrirKeyboard(narsalar),
    });
  });

  bot.callbackQuery(/^narsa:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    const n = await narsaniOl(Number(ctx.match[1]));
    if (!n) return;
    await ctx.reply(narsaDetalMatni(n), {
      parse_mode: "HTML",
      reply_markup: narsaDetalKeyboard(n),
    });
  });

  bot.callbackQuery(/^narsa_nom:(\d+)$/, async (ctx) => {
    if (!ctx.from || !(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "narsa_nom", narsaId: Number(ctx.match[1]) } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply("✏️ Yangi nomini yozing (emoji bilan bo'lsa ham bo'ladi):", {
      reply_markup: bekorKeyboard(),
    });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery(/^narsa_faol:(\d+):(0|1)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const yangi = await narsaFaollikni(admin.id, Number(ctx.match[1]), ctx.match[2] === "1");
    if (!yangi) return;
    const narsalar = await barchaNarsalar();
    await ctx.reply(narsalarMatni(narsalar, true), {
      parse_mode: "HTML",
      reply_markup: narsalarTahrirKeyboard(narsalar),
    });
  });

  /**
   * "Olindi" — ro'yxatni tozalaydi va GURUHGA nima olinganini yozadi.
   * Jimgina tozalash noto'g'ri bo'lardi: narsa tugadi deb aytgan odam
   * olingan-olinmaganini bilmay qolardi.
   */
  bot.callbackQuery("narsa_olindi", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const olingan = await narsalarOlindi();
    if (olingan.length === 0) {
      return ctx.answerCallbackQuery({ text: "Ro'yxat allaqachon toza." }).catch(() => {});
    }
    await ctx.answerCallbackQuery({ text: `${olingan.length} ta narsa tozalandi.` }).catch(() => {});

    await guruhgaYubor(ctx.api, narsalarOlindiGuruh(olingan));
    await narsalarKorsat(ctx, true);
  });
}
