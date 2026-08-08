/**
 * Anonim shikoyat — Telegram tomoni.
 *
 * Oqim: menyu tugmasi → izoh → joy → dalil (rasm/video, ixtiyoriy) →
 * qanchalik aniq bilasiz → (aniq/gumon bo'lsa) kimni tanlash → guruhga
 * anonim xabar + barcha adminlarga to'liq DM.
 *
 * Admin boshlang'ich ko'rib chiqishda: ✅ Tasdiqlash / ➖ Rad etish /
 * 👤 Boshqa odam / ✏️ Izoh qo'shish. Tasdiqlansa sababchiga (bo'lsa)
 * tuzatish uchun imkoniyat beriladi ("tuzatilmoqda"), keyin admin qaytib
 * ✅ Tuzatildi / ❌ Tuzatilmadi deb belgilaydi. Faqat "tuzatilmadi"da ball
 * ayiriladi.
 *
 * Guruh bitta xabarni butun umr davomida ko'radi — qayta yubormasdan shu
 * tahrirlanadi (`guruh_msg_id`). Reporter HAM, sababchi HAM guruhga hech
 * qachon chiqmaydi: `shikoyatGuruhXabari` bu ikkalasini parametr sifatida
 * ham olmaydi, shuning uchun buni "unutib qoldirish" mumkin emas.
 */
import type { Bot, Context, Api, InlineKeyboard as InlineKeyboardType } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type Report, type User } from "../../db/index.js";
import { SHIKOYAT_JOYLARI, type Ishonch, type ShikoyatJoyi } from "../../config.js";
import {
  adminIzohQoshish,
  adminXabarlarniSaqla,
  guruhXabarniSaqla,
  javobgarniOzgartir,
  kutayotganShikoyatlar,
  shikoyatniOl,
  shikoyatniRadEt,
  shikoyatniTasdiqla,
  shikoyatniTekshir,
  shikoyatYuborish,
  type ReportToliq,
} from "../../core/reports.js";
import { guruhId, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  ishonchKeyboard,
  shikoyatAdminKeyboard,
  shikoyatDalilKeyboard,
  shikoyatJoyKeyboard,
  shikoyatKimKeyboard,
  shikoyatQaytaKeyboard,
  shikoyatTekshiruvKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH,
  shikoyatAdminXabari,
  shikoyatGuruhXabari,
  shikoyatJarimaXabari,
  shikoyatTuzatishSorovi,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir, type Flow } from "../state.js";

/** Menyudan "🔒 Anonim shikoyat" bosilganda. */
export async function shikoyatBoshla(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const reporter = await kim(ctx.from.id);
  if (!reporter) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "shikoyat", qadam: "izoh" } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `🔒 <b>ANONIM SHIKOYAT</b>`,
      AJRATGICH,
      ``,
      `Nima bo'ldi? Batafsil yozing.`,
      ``,
      `<i>Bu maxfiy — yozganingizni faqat admin biladi.</i>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/** Izoh yozilgach joyni so'raydi. messages.ts'dan chaqiriladi. */
export async function shikoyatJoySora(ctx: Context, izoh: string): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "shikoyat", qadam: "joy", izoh } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(`📍 <b>Uyning qaysi joyiga tegishli?</b>`, {
    parse_mode: "HTML",
    reply_markup: shikoyatJoyKeyboard(),
  });
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/** Joy tanlangach dalil so'raydi. */
async function shikoyatDalilSora(ctx: Context, izoh: string, joy: ShikoyatJoyi): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "shikoyat", qadam: "dalil", izoh, joy } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `📸 <b>Rasm yoki video bormi?</b>`,
      ``,
      `Bo'lsa shu yerga tashlang. Bo'lmasa pastdagi`,
      `tugmani bosing.`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: shikoyatDalilKeyboard() },
  );
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/** Dalil kelgach (yoki o'tkazib yuborilgach) sababchi haqida so'raydi. */
async function shikoyatJavobgarSora(
  ctx: Context,
  izoh: string,
  joy: ShikoyatJoyi,
  mediaId: string | null,
  mediaTuri: "rasm" | "video" | null,
): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "shikoyat", qadam: "javobgar", izoh, joy, mediaId, mediaTuri } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(`🤔 <b>Kim sabab bo'lgan deb o'ylaysiz?</b>`, {
    parse_mode: "HTML",
    reply_markup: ishonchKeyboard(),
  });
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

type DalilHolati = Extract<Flow, { tur: "shikoyat"; qadam: "dalil" }>;

/** photos.ts'dan chaqiriladi — rasm/video (yoki uning yo'qligi) sababchi so'roviga o'tkazadi. */
export async function shikoyatDalilKeldi(
  ctx: Context,
  holat: DalilHolati,
  mediaId: string,
  mediaTuri: "rasm" | "video",
): Promise<void> {
  await shikoyatJavobgarSora(ctx, holat.izoh, holat.joy, mediaId, mediaTuri);
}

type YuborishManbasi = {
  izoh: string;
  joy: ShikoyatJoyi;
  mediaId: string | null;
  mediaTuri: "rasm" | "video" | null;
  ishonch: Ishonch;
  reportedId: number | null;
};

/**
 * Yozuvni yakunlaydi: bazaga yozadi, reporterga tasdiq, guruhga anonim
 * xabar, barcha adminlarga to'liq DM.
 */
async function shikoyatYuborildi(ctx: Context, m: YuborishManbasi): Promise<void> {
  if (!ctx.from) return;
  const reporter = await kim(ctx.from.id);
  if (!reporter) return;

  await holatTozala(ctx.from.id);

  const natija = await shikoyatYuborish(
    reporter.id,
    m.reportedId,
    m.ishonch,
    m.joy,
    m.izoh,
    m.mediaId,
    m.mediaTuri ?? "rasm",
  );
  if (!natija.ok) {
    const xabar = {
      ozi: "O'zingizni tanlay olmaysiz.",
      topilmadi: "Bu odam topilmadi.",
      takror: "Yaqinda shu odam haqida yozgansiz. Biroz kutib turing.",
    }[natija.sabab];
    await ctx.reply(xabar);
    return;
  }

  await ctx.reply(
    [
      `✅ <b>Qabul qildim.</b>`,
      ``,
      `Bu butunlay maxfiy — yozganingizni faqat`,
      `admin biladi.`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );

  const toliq = await shikoyatniOl(natija.report.id);
  if (!toliq) return;

  await guruhXabarniYangila(ctx.api, toliq);
  await adminlargaYubor(ctx.api, toliq);
}

/** Rasm/video bo'lsa mos usul bilan, bo'lmasa oddiy matn bilan yuboradi. */
async function mediaXabarYubor(
  api: Api,
  chatId: number,
  matn: string,
  r: Report,
  extra: object = {},
): Promise<{ message_id: number; chat: { id: number } }> {
  if (!r.photo_id) return api.sendMessage(chatId, matn, { parse_mode: "HTML", ...extra });
  return r.media_turi === "video"
    ? api.sendVideo(chatId, r.photo_id, { caption: matn, parse_mode: "HTML", ...extra })
    : api.sendPhoto(chatId, r.photo_id, { caption: matn, parse_mode: "HTML", ...extra });
}

/** Yuqoridagi bilan bir xil, lekin mavjud xabarni tahrirlaydi. */
async function mediaXabarTahrirla(
  api: Api,
  chatId: number,
  messageId: number,
  matn: string,
  r: Report,
  extra: object = {},
): Promise<void> {
  if (!r.photo_id) {
    await api.editMessageText(chatId, messageId, matn, { parse_mode: "HTML", ...extra }).catch(() => {});
    return;
  }
  await api
    .editMessageCaption(chatId, messageId, { caption: matn, parse_mode: "HTML", ...extra })
    .catch(() => {});
}

/**
 * Guruhdagi yagona anonim xabarni yuboradi (birinchi marta) yoki
 * tahrirlaydi (keyingi har bir holat o'zgarishida) — qayta yubormaymiz,
 * aks holda guruh bir shikoyat uchun bir necha marta bezovta bo'lardi.
 */
async function guruhXabarniYangila(api: Api, r: ReportToliq): Promise<void> {
  const chatId = await guruhId();
  if (!chatId) return;
  const matn = shikoyatGuruhXabari(r);

  if (r.guruh_msg_id) {
    await mediaXabarTahrirla(api, chatId, Number(r.guruh_msg_id), matn, r);
    return;
  }
  const msg = await mediaXabarYubor(api, chatId, matn, r);
  await guruhXabarniSaqla(r.id, msg.message_id);
}

/** Har bir bog'langan adminga to'liq DM qiladi, xabar id'larini saqlaydi. */
async function adminlargaYubor(api: Api, r: ReportToliq): Promise<void> {
  const adminlar = await sql<User[]>`
    SELECT * FROM users WHERE admin AND faol AND telegram_id IS NOT NULL
  `;

  const matn = shikoyatAdminXabari(r);
  const kb = shikoyatAdminKeyboard(r.id);
  const yuborilganlar: { chat_id: number; message_id: number }[] = [];

  for (const a of adminlar) {
    try {
      const msg = await mediaXabarYubor(api, Number(a.telegram_id), matn, r, { reply_markup: kb });
      yuborilganlar.push({ chat_id: msg.chat.id, message_id: msg.message_id });
    } catch {
      /* admin botni bloklagan yoki hali /start bosmagan */
    }
  }

  if (yuborilganlar.length > 0) await adminXabarlarniSaqla(r.id, yuborilganlar);
}

/** Barcha adminlarga yuborilgan nusxalarni yangilaydi — berilgan klaviatura bilan. */
async function panelniYangila(api: Api, r: ReportToliq, kb: InlineKeyboardType): Promise<void> {
  const matn = shikoyatAdminXabari(r);
  for (const m of r.admin_msgs) {
    await mediaXabarTahrirla(api, m.chat_id, m.message_id, matn, r, { reply_markup: kb });
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
    if (!r.photo_id) {
      await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
    } else if (r.media_turi === "video") {
      await ctx.replyWithVideo(r.photo_id, { caption: matn, parse_mode: "HTML", reply_markup: kb });
    } else {
      await ctx.replyWithPhoto(r.photo_id, { caption: matn, parse_mode: "HTML", reply_markup: kb });
    }
  }
}

/** Admin izohini yozib bo'lgach — messages.ts'dan chaqiriladi. */
export async function shikoyatIzohSaqlandi(
  ctx: Context,
  reportId: number,
  izoh: string,
): Promise<void> {
  if (!ctx.from) return;
  await holatTozala(ctx.from.id);

  const yangi = await adminIzohQoshish(reportId, izoh);
  if (!yangi) {
    await ctx.reply("Bu shikoyat allaqachon ko'rib chiqilgan yoki topilmadi.");
    return;
  }
  await ctx.reply("✅ Izoh saqlandi.");

  const toliq = await shikoyatniOl(reportId);
  if (toliq) await panelniYangila(ctx.api, toliq, shikoyatAdminKeyboard(reportId));
}

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

/** Boshlang'ich ko'rib chiqish: ✅ Tasdiqlash yoki ➖ Rad etish. */
async function boshlangichQaror(
  ctx: Context,
  reportId: number,
  qaror: "tasdiq" | "rad",
): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    return;
  }

  const yangi =
    qaror === "tasdiq"
      ? await shikoyatniTasdiqla(reportId, admin.id)
      : await shikoyatniRadEt(reportId, admin.id);

  if (!yangi) {
    await ctx.answerCallbackQuery({ text: "Bu shikoyat allaqachon ko'rib chiqilgan." }).catch(() => {});
    return;
  }

  await ctx
    .answerCallbackQuery({ text: qaror === "tasdiq" ? "✅ Tasdiqlandi." : "Rad etildi." })
    .catch(() => {});

  const toliq = await shikoyatniOl(reportId);
  if (!toliq) return;

  await guruhXabarniYangila(ctx.api, toliq);

  if (qaror === "tasdiq") {
    await panelniYangila(ctx.api, toliq, shikoyatTekshiruvKeyboard(reportId));

    if (toliq.reported_id) {
      const [reported] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reported_id}`;
      if (reported) await shaxsiy(ctx.api, reported, shikoyatTuzatishSorovi(toliq));
    }
  } else {
    await panelniYangila(ctx.api, toliq, new InlineKeyboard());

    const [reporter] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reporter_id}`;
    if (reporter) await shaxsiy(ctx.api, reporter, "Yozganingiz ko'rib chiqildi, lekin rad etildi.");
  }
}

/** Qayta tekshiruv: ✅ Tuzatildi yoki ❌ Tuzatilmadi. Faqat shu yerda ball beriladi. */
async function tekshiruvQarori(
  ctx: Context,
  reportId: number,
  natija: "tuzatildi" | "jarima",
): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    return;
  }

  const yangi = await shikoyatniTekshir(reportId, admin.id, natija);
  if (!yangi) {
    await ctx.answerCallbackQuery({ text: "Bu shikoyat allaqachon yopilgan." }).catch(() => {});
    return;
  }

  await ctx
    .answerCallbackQuery({ text: natija === "tuzatildi" ? "✅ Hal qilindi." : "➖ Ball ayirildi." })
    .catch(() => {});

  const toliq = await shikoyatniOl(reportId);
  if (!toliq) return;

  await guruhXabarniYangila(ctx.api, toliq);
  await panelniYangila(ctx.api, toliq, new InlineKeyboard());

  const [reporter] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reporter_id}`;
  const reported = toliq.reported_id
    ? (await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reported_id}`)[0]
    : null;

  if (natija === "tuzatildi") {
    if (reported) await shaxsiy(ctx.api, reported, "✅ Rahmat! Muammo hal qilindi deb belgilandi.");
    if (reporter) await shaxsiy(ctx.api, reporter, "✅ Yozganingiz hal qilindi.");
  } else {
    if (reported) await shaxsiy(ctx.api, reported, shikoyatJarimaXabari(toliq, admin.ism));
    if (reporter) await shaxsiy(ctx.api, reporter, "Yozganingiz bo'yicha chora ko'rildi.");
  }
}

export function register(bot: Bot) {
  bot.callbackQuery(/^shikoyat_joy:(\w+)$/, async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "shikoyat" || holat.qadam !== "joy") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }
    const kod = ctx.match[1];
    if (!kod || !(kod in SHIKOYAT_JOYLARI)) return ctx.answerCallbackQuery({ text: "Noto'g'ri joy." });

    await ctx.answerCallbackQuery().catch(() => {});
    await sorovniOchir(ctx.api, holat);
    await shikoyatDalilSora(ctx, holat.izoh, kod as ShikoyatJoyi);
  });

  bot.callbackQuery("shikoyat_dalilsiz", async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "shikoyat" || holat.qadam !== "dalil") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await shikoyatJavobgarSora(ctx, holat.izoh, holat.joy, null, null);
  });

  bot.callbackQuery(/^shikoyat_ishonch:(aniq|gumon|nomalum)$/, async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "shikoyat" || holat.qadam !== "javobgar") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }

    const ishonch = ctx.match[1] as Ishonch;
    await ctx.answerCallbackQuery().catch(() => {});

    if (ishonch === "nomalum") {
      await sorovniOchir(ctx.api, holat);
      await shikoyatYuborildi(ctx, {
        izoh: holat.izoh,
        joy: holat.joy,
        mediaId: holat.mediaId,
        mediaTuri: holat.mediaTuri,
        ishonch,
        reportedId: null,
      });
      return;
    }

    const reporter = await kim(ctx.from.id);
    const odamlar = await sql<{ id: number; ism: string }[]>`
      SELECT id, ism FROM users WHERE faol AND id <> ${reporter?.id ?? 0} ORDER BY ism
    `;

    const yangi = {
      tur: "shikoyat",
      qadam: "kim",
      izoh: holat.izoh,
      joy: holat.joy,
      mediaId: holat.mediaId,
      mediaTuri: holat.mediaTuri,
      ishonch,
    } as const;
    await holatOrnat(ctx.from.id, yangi);

    const xabar = await ctx
      .editMessageText(`👤 <b>Kimni nazarda tutyapsiz?</b>`, {
        parse_mode: "HTML",
        reply_markup: shikoyatKimKeyboard(odamlar),
      })
      .catch(() => null);

    if (xabar && typeof xabar !== "boolean") {
      await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
    }
  });

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
      return ctx.answerCallbackQuery({ text: "O'zingizni tanlay olmaysiz.", show_alert: true });
    }

    const [nishon] = await sql<{ id: number }[]>`
      SELECT id FROM users WHERE id = ${reportedId} AND faol
    `;
    if (!nishon) return ctx.answerCallbackQuery({ text: "Bu odam topilmadi." });

    await ctx.answerCallbackQuery().catch(() => {});
    await sorovniOchir(ctx.api, holat);
    await shikoyatYuborildi(ctx, {
      izoh: holat.izoh,
      joy: holat.joy,
      mediaId: holat.mediaId,
      mediaTuri: holat.mediaTuri,
      ishonch: holat.ishonch,
      reportedId,
    });
  });

  bot.callbackQuery(/^shikoyat_tasdiq:(\d+)$/, (ctx) => boshlangichQaror(ctx, Number(ctx.match[1]), "tasdiq"));
  bot.callbackQuery(/^shikoyat_rad:(\d+)$/, (ctx) => boshlangichQaror(ctx, Number(ctx.match[1]), "rad"));
  bot.callbackQuery(/^shikoyat_tuzatildi:(\d+)$/, (ctx) =>
    tekshiruvQarori(ctx, Number(ctx.match[1]), "tuzatildi"),
  );
  bot.callbackQuery(/^shikoyat_tuzatilmadi:(\d+)$/, (ctx) =>
    tekshiruvQarori(ctx, Number(ctx.match[1]), "jarima"),
  );

  bot.callbackQuery(/^shikoyat_qayta:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    const toliq = await shikoyatniOl(reportId);
    if (!toliq || toliq.holat !== "kutilmoqda") {
      return ctx.answerCallbackQuery({ text: "Bu shikoyat allaqachon ko'rib chiqilgan." });
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const odamlar = await sql<{ id: number; ism: string }[]>`
      SELECT id, ism FROM users WHERE faol ORDER BY ism
    `;
    const matn = `👤 <b>Kimni belgilaysiz?</b>`;
    const kb = shikoyatQaytaKeyboard(reportId, odamlar);

    if (toliq.photo_id) {
      await ctx
        .editMessageCaption({ caption: matn, parse_mode: "HTML", reply_markup: kb })
        .catch(() => {});
    } else {
      await ctx.editMessageText(matn, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
    }
  });

  bot.callbackQuery(/^shikoyat_belgila:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    const personId = Number(ctx.match[2]);

    // Admin belgilagani — bu allaqachon aniqlangan deb hisoblanadi.
    const yangi = await javobgarniOzgartir(reportId, personId, "aniq");
    if (!yangi) return ctx.answerCallbackQuery({ text: "Bu shikoyat allaqachon ko'rib chiqilgan." });
    await ctx.answerCallbackQuery({ text: "✅ Belgilandi." }).catch(() => {});

    const toliq = await shikoyatniOl(reportId);
    if (toliq) await panelniYangila(ctx.api, toliq, shikoyatAdminKeyboard(reportId));
  });

  bot.callbackQuery(/^shikoyat_notanilgan:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    const yangi = await javobgarniOzgartir(reportId, null, "nomalum");
    if (!yangi) return ctx.answerCallbackQuery({ text: "Bu shikoyat allaqachon ko'rib chiqilgan." });
    await ctx.answerCallbackQuery({ text: "✅ Belgilandi." }).catch(() => {});

    const toliq = await shikoyatniOl(reportId);
    if (toliq) await panelniYangila(ctx.api, toliq, shikoyatAdminKeyboard(reportId));
  });

  bot.callbackQuery(/^shikoyat_qayta_bekor:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});

    const toliq = await shikoyatniOl(Number(ctx.match[1]));
    if (!toliq) return;

    const matn = shikoyatAdminXabari(toliq);
    const kb = shikoyatAdminKeyboard(toliq.id);
    if (toliq.photo_id) {
      await ctx.editMessageCaption({ caption: matn, parse_mode: "HTML", reply_markup: kb }).catch(() => {});
    } else {
      await ctx.editMessageText(matn, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
    }
  });

  bot.callbackQuery(/^shikoyat_izoh:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "shikoyat_izoh", reportId } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply("✏️ Izohingizni yozing:", { reply_markup: bekorKeyboard() });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });
}
