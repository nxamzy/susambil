/**
 * Anonim shikoyat — Telegram tomoni. Oqim: menyu tugmasi → kimni tanlash →
 * turkum → izoh → rasm (ixtiyoriy) → barcha adminlarga DM.
 *
 * Bitta admin tasdiqlaydi yoki rad etadi — `submissions`dagi ko'p kishilik
 * tenglar-tasdiqlashidan farqli. Reporter ismi shu faylda FAQAT adminga
 * ketadigan xabarlarda ishlatiladi (`shikoyatAdminXabari`,
 * `shikoyatHalQilindiXabari`); guruhga chiqadigan `shikoyatGuruhXabari` va
 * jarima olganga ketadigan `shikoyatJarimaXabari` reporterni bilmaydi ham —
 * bu funksiyalarga reporter umuman berilmaydi, shuning uchun anonimlikni
 * "unutib qoldirish" mumkin emas.
 */
import type { Bot, Context, Api } from "grammy";
import { sql, type User } from "../../db/index.js";
import { SHIKOYAT_TURKUMLARI, type ShikoyatTurkumi } from "../../config.js";
import {
  adminXabarlarniSaqla,
  kutayotganShikoyatlar,
  shikoyatniHalQil,
  shikoyatniOl,
  shikoyatYuborish,
  type ReportToliq,
} from "../../core/reports.js";
import { guruhgaYubor, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  shikoyatAdminKeyboard,
  shikoyatKimKeyboard,
  shikoyatRasmKeyboard,
  shikoyatTurkumKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH,
  esc,
  shikoyatAdminXabari,
  shikoyatGuruhXabari,
  shikoyatHalQilindiXabari,
  shikoyatJarimaXabari,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir, type Flow } from "../state.js";

/** Menyudan "🚨 Shikoyat qilish" bosilganda. */
export async function shikoyatBoshla(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const reporter = await kim(ctx.from.id);
  if (!reporter) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const odamlar = await sql<{ id: number; ism: string }[]>`
    SELECT id, ism FROM users WHERE faol AND id <> ${reporter.id} ORDER BY ism
  `;
  if (odamlar.length === 0) {
    await ctx.reply("Hozircha shikoyat qiladigan boshqa odam yo'q.");
    return;
  }

  const holat = { tur: "shikoyat", qadam: "kim" } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `🚨 <b>ANONIM SHIKOYAT</b>`,
      AJRATGICH,
      ``,
      `Kimni shikoyat qilmoqchisiz?`,
      ``,
      `<i>Bu butunlay maxfiy — faqat admin ko'radi.</i>`,
      `<i>Guruhda va boshqa a'zolarga ismingiz</i>`,
      `<i>hech qachon ko'rsatilmaydi.</i>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: shikoyatKimKeyboard(odamlar) },
  );
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/** Izoh yozilgach rasm so'raydi. messages.ts'dan chaqiriladi. */
export async function shikoyatRasmSora(
  ctx: Context,
  reportedId: number,
  turkum: ShikoyatTurkumi,
  izoh: string,
): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "shikoyat", qadam: "rasm", reportedId, turkum, izoh } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `📷 <b>Rasm bormi?</b>`,
      ``,
      `Bo'lsa shu yerga tashlang — dalil sifatida admin`,
      `ko'radi. Bo'lmasa pastdagi tugmani bosing.`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: shikoyatRasmKeyboard() },
  );
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

type RasmHolati = Extract<Flow, { tur: "shikoyat"; qadam: "rasm" }>;

/**
 * Shikoyatni yakunlaydi: bazaga yozadi, reporterga tasdiq, adminlarga DM.
 * photos.ts (rasm kelganda) va shu faylning o'zi ("rasmim yo'q" tugmasi)
 * chaqiradi.
 */
export async function shikoyatYuborildi(
  ctx: Context,
  holat: RasmHolati,
  photoId: string | null,
): Promise<void> {
  if (!ctx.from) return;
  const reporter = await kim(ctx.from.id);
  if (!reporter) return;

  await sorovniOchir(ctx.api, holat);
  await holatTozala(ctx.from.id);

  const natija = await shikoyatYuborish(
    reporter.id,
    holat.reportedId,
    holat.turkum,
    holat.izoh,
    photoId,
  );

  if (!natija.ok) {
    const xabar = {
      ozi: "O'zingizni shikoyat qila olmaysiz.",
      topilmadi: "Bu odam topilmadi.",
      takror: "Yaqinda shu odam haqida shikoyat yubordingiz. Biroz kutib turing.",
    }[natija.sabab];
    await ctx.reply(xabar);
    return;
  }

  await ctx.reply(
    [
      `✅ <b>Shikoyatingiz yuborildi.</b>`,
      ``,
      `Admin ko'rib chiqadi. Bu butunlay maxfiy —`,
      `hech kim buni sizdan bilib olmaydi.`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );

  const toliq = await shikoyatniOl(natija.report.id);
  if (toliq) await adminlargaYubor(ctx.api, toliq);
}

/** Har bir bog'langan adminga DM qiladi, xabar id'larini keyingi yangilash uchun saqlaydi. */
async function adminlargaYubor(api: Api, report: ReportToliq): Promise<void> {
  const adminlar = await sql<User[]>`
    SELECT * FROM users WHERE admin AND faol AND telegram_id IS NOT NULL
  `;

  const matn = shikoyatAdminXabari(report);
  const kb = shikoyatAdminKeyboard(report.id);
  const yuborilganlar: { chat_id: number; message_id: number }[] = [];

  for (const a of adminlar) {
    try {
      const msg = report.photo_id
        ? await api.sendPhoto(Number(a.telegram_id), report.photo_id, {
            caption: matn,
            parse_mode: "HTML",
            reply_markup: kb,
          })
        : await api.sendMessage(Number(a.telegram_id), matn, {
            parse_mode: "HTML",
            reply_markup: kb,
          });
      yuborilganlar.push({ chat_id: msg.chat.id, message_id: msg.message_id });
    } catch {
      /* admin botni bloklagan yoki hali /start bosmagan */
    }
  }

  if (yuborilganlar.length > 0) await adminXabarlarniSaqla(report.id, yuborilganlar);
}

/** Barcha adminlarga yuborilgan nusxalarni yangilaydi — biri hal qilganda qolganlari ham bilsin. */
async function adminXabarlarniYangila(api: Api, report: ReportToliq, matn: string): Promise<void> {
  for (const m of report.admin_msgs) {
    if (report.photo_id) {
      await api
        .editMessageCaption(m.chat_id, m.message_id, { caption: matn, parse_mode: "HTML" })
        .catch(() => {});
    } else {
      await api
        .editMessageText(m.chat_id, m.message_id, matn, { parse_mode: "HTML" })
        .catch(() => {});
    }
  }
}

/** /shikoyatlar buyrug'i uchun ham ishlatiladi — bir xil ko'rinish, ikkinchi nusxa yo'q. */
export async function kutayotganlarniJonat(ctx: Context): Promise<void> {
  const royxat = await kutayotganShikoyatlar();
  if (royxat.length === 0) {
    await ctx.reply("✅ Tasdiq kutayotgan shikoyat yo'q.");
    return;
  }
  for (const r of royxat) {
    const matn = shikoyatAdminXabari(r);
    const kb = shikoyatAdminKeyboard(r.id);
    if (r.photo_id) {
      await ctx.replyWithPhoto(r.photo_id, { caption: matn, parse_mode: "HTML", reply_markup: kb });
    } else {
      await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
    }
  }
}

async function qarorQabulQil(
  ctx: Context,
  reportId: number,
  qaror: "tasdiqlandi" | "rad",
): Promise<void> {
  const admin = await kim(ctx.from?.id);
  if (!admin?.admin) {
    await ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    return;
  }

  const yopildi = await shikoyatniHalQil(reportId, admin.id, qaror);
  if (!yopildi) {
    await ctx.answerCallbackQuery({ text: "Bu shikoyat allaqachon ko'rib chiqilgan." }).catch(() => {});
    return;
  }

  await ctx
    .answerCallbackQuery({
      text: qaror === "tasdiqlandi" ? "✅ Tasdiqlandi, ball ayirildi." : "Rad etildi.",
    })
    .catch(() => {});

  const toliq = await shikoyatniOl(reportId);
  if (!toliq) return;

  await adminXabarlarniYangila(
    ctx.api,
    toliq,
    shikoyatHalQilindiXabari(toliq, qaror === "tasdiqlandi"),
  );

  const [reported] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reported_id}`;
  const [reporter] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reporter_id}`;

  if (qaror === "tasdiqlandi") {
    if (reported) await shaxsiy(ctx.api, reported, shikoyatJarimaXabari(toliq, admin.ism));
    if (reported) await guruhgaYubor(ctx.api, shikoyatGuruhXabari(toliq));
    if (reporter) {
      await shaxsiy(ctx.api, reporter, "✅ Shikoyatingiz ko'rib chiqildi va qabul qilindi.");
    }
  } else if (reporter) {
    await shaxsiy(ctx.api, reporter, "Shikoyatingiz ko'rib chiqildi, lekin rad etildi.");
  }
}

export function register(bot: Bot) {
  bot.callbackQuery(/^shikoyat_kim:(\d+)$/, async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "shikoyat" || holat.qadam !== "kim") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }
    const reporter = await kim(ctx.from.id);
    if (!reporter) return ctx.answerCallbackQuery({ text: "Siz ro'yxatda yo'qsiz." });

    const reportedId = Number(ctx.match[1]);
    // Klaviaturada o'zi yo'q, lekin callback ma'lumoti tashqaridan
    // kelgani uchun serverda ham tekshiramiz.
    if (reportedId === reporter.id) {
      return ctx.answerCallbackQuery({
        text: "O'zingizni shikoyat qila olmaysiz.",
        show_alert: true,
      });
    }

    const [nishon] = await sql<{ ism: string }[]>`
      SELECT ism FROM users WHERE id = ${reportedId} AND faol
    `;
    if (!nishon) return ctx.answerCallbackQuery({ text: "Bu odam topilmadi." });

    await ctx.answerCallbackQuery().catch(() => {});

    const yangi = { tur: "shikoyat", qadam: "turkum", reportedId } as const;
    await holatOrnat(ctx.from.id, yangi);

    const xabar = await ctx
      .editMessageText(
        [
          `🚨 <b>ANONIM SHIKOYAT</b>`,
          AJRATGICH,
          ``,
          `👤 <b>${esc(nishon.ism)}</b> haqida.`,
          ``,
          `Nima turdagi muammo?`,
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: shikoyatTurkumKeyboard() },
      )
      .catch(() => null);

    if (xabar && typeof xabar !== "boolean") {
      await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
    }
  });

  bot.callbackQuery(/^shikoyat_turkum:(\w+)$/, async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "shikoyat" || holat.qadam !== "turkum") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }

    const kod = ctx.match[1];
    if (!kod || !(kod in SHIKOYAT_TURKUMLARI)) {
      return ctx.answerCallbackQuery({ text: "Noto'g'ri turkum." });
    }
    const turkum = kod as ShikoyatTurkumi;

    await ctx.answerCallbackQuery().catch(() => {});
    await sorovniOchir(ctx.api, holat);

    const yangi = { tur: "shikoyat", qadam: "izoh", reportedId: holat.reportedId, turkum } as const;
    await holatOrnat(ctx.from.id, yangi);

    const xabar = await ctx.reply(
      [
        `✍️ <b>Nima bo'ldi?</b>`,
        ``,
        `Qisqa va aniq yozing — admin shuni o'qib qaror qiladi.`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery("shikoyat_rasmsiz", async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "shikoyat" || holat.qadam !== "rasm") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }
    await ctx.answerCallbackQuery({ text: "Yuborildi" }).catch(() => {});
    await shikoyatYuborildi(ctx, holat, null);
  });

  bot.callbackQuery(/^shikoyat_tasdiq:(\d+)$/, async (ctx) => {
    await qarorQabulQil(ctx, Number(ctx.match[1]), "tasdiqlandi");
  });

  bot.callbackQuery(/^shikoyat_rad:(\d+)$/, async (ctx) => {
    await qarorQabulQil(ctx, Number(ctx.match[1]), "rad");
  });
}
