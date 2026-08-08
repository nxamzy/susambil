/**
 * Muammo yozib qo'yish — Telegram tomoni. Bu ayblov emas: uy a'zolari
 * bir-birini shikoyat qilmaydi, shunchaki uyda nimadir noto'g'ri
 * ketganini yozib qo'yadi, kerak bo'lsa sababchisi kim ekanini ham
 * (aniq/gumon/bilmayman) ko'rsatadi.
 *
 * Oqim: menyu tugmasi → izoh → rasm (ixtiyoriy) → qanchalik aniq bilasiz →
 * (aniq/gumon bo'lsa) kimni tanlash → barcha adminlarga DM.
 *
 * Bitta admin ko'rib chiqadi — `submissions`dagi ko'p kishilik
 * tenglar-tasdiqlashidan farqli. Reporter ismi shu faylda FAQAT adminga
 * ketadigan xabarlarda ishlatiladi (`muammoAdminXabari`,
 * `muammoHalQilindiXabari`); guruhga chiqadigan `muammoGuruhXabari` va
 * ball olganga ketadigan `muammoJarimaXabari` reporterni bilmaydi ham —
 * bu funksiyalarga reporter umuman berilmaydi, shuning uchun anonimlikni
 * "unutib qoldirish" mumkin emas.
 */
import type { Bot, Context, Api, InlineKeyboard } from "grammy";
import { sql, type User } from "../../db/index.js";
import type { Ishonch } from "../../config.js";
import {
  adminIzohQoshish,
  adminXabarlarniSaqla,
  javobgarniOzgartir,
  kutayotganMuammolar,
  muammoniHalQil,
  muammoniOl,
  muammoYuborish,
  type ReportToliq,
} from "../../core/reports.js";
import { guruhgaYubor, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  ishonchKeyboard,
  muammoAdminKeyboard,
  muammoKimKeyboard,
  muammoQaytaKeyboard,
  muammoRasmKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH,
  muammoAdminXabari,
  muammoGuruhXabari,
  muammoHalQilindiXabari,
  muammoJarimaXabari,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir, type Flow } from "../state.js";

/** Menyudan "📝 Muammo yozish" bosilganda. */
export async function muammoBoshla(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const reporter = await kim(ctx.from.id);
  if (!reporter) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "muammo", qadam: "izoh" } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `📝 <b>MUAMMO YOZIB QO'YISH</b>`,
      AJRATGICH,
      ``,
      `Uyda nimadir noto'g'ri bo'ldimi? Batafsil yozing —`,
      `admin ko'rib chiqadi.`,
      ``,
      `<i>Bu maxfiy — yozganingizni faqat admin biladi.</i>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/** Izoh yozilgach rasm so'raydi. messages.ts'dan chaqiriladi. */
export async function muammoRasmSora(ctx: Context, izoh: string): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "muammo", qadam: "rasm", izoh } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `📷 <b>Rasm bormi?</b>`,
      ``,
      `Bo'lsa shu yerga tashlang. Bo'lmasa pastdagi`,
      `tugmani bosing.`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: muammoRasmKeyboard() },
  );
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/** Rasm kelgach (yoki "rasmim yo'q" bosilgach) sababchi haqida so'raydi. */
export async function muammoJavobgarSora(
  ctx: Context,
  izoh: string,
  photoId: string | null,
): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "muammo", qadam: "javobgar", izoh, photoId } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(`🤔 <b>Kim sabab bo'lgan deb o'ylaysiz?</b>`, {
    parse_mode: "HTML",
    reply_markup: ishonchKeyboard(),
  });
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

type YuborishManbasi = { izoh: string; photoId: string | null; ishonch: Ishonch; reportedId: number | null };

/**
 * Yozuvni yakunlaydi: bazaga yozadi, reporterga tasdiq, adminlarga DM.
 * "Bilmayman" tanlansa to'g'ridan-to'g'ri shu yerdan, "aniq"/"gumon" bo'lsa
 * odam tanlangandan keyin chaqiriladi.
 */
async function muammoYuborildi(ctx: Context, m: YuborishManbasi): Promise<void> {
  if (!ctx.from) return;
  const reporter = await kim(ctx.from.id);
  if (!reporter) return;

  await holatTozala(ctx.from.id);

  const natija = await muammoYuborish(reporter.id, m.reportedId, m.ishonch, m.izoh, m.photoId);
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
      `Admin ko'rib chiqadi. Bu maxfiy — yozganingizni`,
      `faqat admin biladi.`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );

  const toliq = await muammoniOl(natija.report.id);
  if (toliq) await adminlargaYubor(ctx.api, toliq);
}

type RasmHolati = Extract<Flow, { tur: "muammo"; qadam: "rasm" }>;

/** photos.ts'dan chaqiriladi — rasm (yoki uning yo'qligi) sababchi so'roviga o'tkazadi. */
export async function muammoRasmKeldi(
  ctx: Context,
  holat: RasmHolati,
  photoId: string | null,
): Promise<void> {
  await muammoJavobgarSora(ctx, holat.izoh, photoId);
}

/** Har bir bog'langan adminga DM qiladi, xabar id'larini keyingi yangilash uchun saqlaydi. */
async function adminlargaYubor(api: Api, report: ReportToliq): Promise<void> {
  const adminlar = await sql<User[]>`
    SELECT * FROM users WHERE admin AND faol AND telegram_id IS NOT NULL
  `;

  const matn = muammoAdminXabari(report);
  const kb = muammoAdminKeyboard(report.id);
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

/**
 * Barcha adminlarga yuborilgan nusxalarni yangilaydi. `faolMi=true` bo'lsa
 * hali kutilmoqda holati — to'liq harakat tugmalari bilan; `false` bo'lsa
 * qaror chiqqan — tugmalar butunlay tozalanadi, aks holda eski "Tasdiqlash"
 * tugmasi ko'rinib qolib, bosilganda "allaqachon hal qilingan" deb
 * chalkashtirardi.
 */
async function panelniYangila(api: Api, report: ReportToliq, faolMi: boolean): Promise<void> {
  const matn = faolMi
    ? muammoAdminXabari(report)
    : muammoHalQilindiXabari(report, report.holat === "tasdiqlandi");
  const kb: InlineKeyboard | undefined = faolMi ? muammoAdminKeyboard(report.id) : undefined;

  for (const m of report.admin_msgs) {
    if (report.photo_id) {
      await api
        .editMessageCaption(m.chat_id, m.message_id, {
          caption: matn,
          parse_mode: "HTML",
          ...(kb ? { reply_markup: kb } : {}),
        })
        .catch(() => {});
    } else {
      await api
        .editMessageText(m.chat_id, m.message_id, matn, {
          parse_mode: "HTML",
          ...(kb ? { reply_markup: kb } : {}),
        })
        .catch(() => {});
    }
  }
}

/** /muammolar buyrug'i uchun ham ishlatiladi — bir xil ko'rinish, ikkinchi nusxa yo'q. */
export async function kutayotganlarniJonat(ctx: Context): Promise<void> {
  const royxat = await kutayotganMuammolar();
  if (royxat.length === 0) {
    await ctx.reply("✅ Tasdiq kutayotgan muammo yo'q.");
    return;
  }
  for (const r of royxat) {
    const matn = muammoAdminXabari(r);
    const kb = muammoAdminKeyboard(r.id);
    if (r.photo_id) {
      await ctx.replyWithPhoto(r.photo_id, { caption: matn, parse_mode: "HTML", reply_markup: kb });
    } else {
      await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
    }
  }
}

/** Admin izohini yozib bo'lgach — messages.ts'dan chaqiriladi. */
export async function muammoIzohSaqlandi(
  ctx: Context,
  reportId: number,
  izoh: string,
): Promise<void> {
  if (!ctx.from) return;
  await holatTozala(ctx.from.id);

  const yangi = await adminIzohQoshish(reportId, izoh);
  if (!yangi) {
    await ctx.reply("Bu muammo allaqachon hal qilingan yoki topilmadi.");
    return;
  }
  await ctx.reply("✅ Izoh saqlandi.");

  const toliq = await muammoniOl(reportId);
  if (toliq) await panelniYangila(ctx.api, toliq, true);
}

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

async function qarorQabulQil(
  ctx: Context,
  reportId: number,
  qaror: "tasdiqlandi" | "rad",
): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    return;
  }

  const yopildi = await muammoniHalQil(reportId, admin.id, qaror);
  if (!yopildi) {
    await ctx.answerCallbackQuery({ text: "Bu muammo allaqachon ko'rib chiqilgan." }).catch(() => {});
    return;
  }

  await ctx
    .answerCallbackQuery({
      text: qaror === "tasdiqlandi" ? "✅ Ko'rib chiqildi." : "Rad etildi.",
    })
    .catch(() => {});

  const toliq = await muammoniOl(reportId);
  if (!toliq) return;

  await panelniYangila(ctx.api, toliq, false);

  const [reporter] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reporter_id}`;

  if (qaror === "tasdiqlandi") {
    // Sababchi aniqlangan bo'lsagina ball ayiriladi va e'lon qilinadi —
    // "bilmayman" bilan tugagan yozuv shunchaki qayd bo'lib qoladi.
    if (toliq.reported_id) {
      const [reported] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.reported_id}`;
      if (reported) {
        await shaxsiy(ctx.api, reported, muammoJarimaXabari(toliq, admin.ism));
        await guruhgaYubor(ctx.api, muammoGuruhXabari(toliq));
      }
    }
    if (reporter) await shaxsiy(ctx.api, reporter, "✅ Yozganingiz ko'rib chiqildi.");
  } else if (reporter) {
    await shaxsiy(ctx.api, reporter, "Yozganingiz ko'rib chiqildi, lekin rad etildi.");
  }
}

export function register(bot: Bot) {
  bot.callbackQuery(/^muammo_ishonch:(aniq|gumon|nomalum)$/, async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "muammo" || holat.qadam !== "javobgar") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }

    const ishonch = ctx.match[1] as Ishonch;
    await ctx.answerCallbackQuery().catch(() => {});

    if (ishonch === "nomalum") {
      await sorovniOchir(ctx.api, holat);
      await muammoYuborildi(ctx, {
        izoh: holat.izoh,
        photoId: holat.photoId,
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
      tur: "muammo",
      qadam: "kim",
      izoh: holat.izoh,
      photoId: holat.photoId,
      ishonch,
    } as const;
    await holatOrnat(ctx.from.id, yangi);

    const xabar = await ctx
      .editMessageText(`👤 <b>Kimni nazarda tutyapsiz?</b>`, {
        parse_mode: "HTML",
        reply_markup: muammoKimKeyboard(odamlar),
      })
      .catch(() => null);

    if (xabar && typeof xabar !== "boolean") {
      await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
    }
  });

  bot.callbackQuery(/^muammo_kim:(\d+)$/, async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "muammo" || holat.qadam !== "kim") {
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
    await muammoYuborildi(ctx, {
      izoh: holat.izoh,
      photoId: holat.photoId,
      ishonch: holat.ishonch,
      reportedId,
    });
  });

  bot.callbackQuery("muammo_rasmsiz", async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "muammo" || holat.qadam !== "rasm") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await muammoJavobgarSora(ctx, holat.izoh, null);
  });

  bot.callbackQuery(/^muammo_tasdiq:(\d+)$/, async (ctx) => {
    await qarorQabulQil(ctx, Number(ctx.match[1]), "tasdiqlandi");
  });

  bot.callbackQuery(/^muammo_rad:(\d+)$/, async (ctx) => {
    await qarorQabulQil(ctx, Number(ctx.match[1]), "rad");
  });

  bot.callbackQuery(/^muammo_qayta:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    const toliq = await muammoniOl(reportId);
    if (!toliq || toliq.holat !== "kutilmoqda") {
      return ctx.answerCallbackQuery({ text: "Bu muammo allaqachon hal qilingan." });
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const odamlar = await sql<{ id: number; ism: string }[]>`
      SELECT id, ism FROM users WHERE faol ORDER BY ism
    `;
    const kb = muammoQaytaKeyboard(reportId, odamlar);

    if (toliq.photo_id) {
      await ctx
        .editMessageCaption({ caption: `👤 <b>Kimni belgilaysiz?</b>`, parse_mode: "HTML", reply_markup: kb })
        .catch(() => {});
    } else {
      await ctx
        .editMessageText(`👤 <b>Kimni belgilaysiz?</b>`, { parse_mode: "HTML", reply_markup: kb })
        .catch(() => {});
    }
  });

  bot.callbackQuery(/^muammo_belgila:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    const personId = Number(ctx.match[2]);

    // Admin belgilagani — bu allaqachon aniqlangan deb hisoblanadi.
    const yangi = await javobgarniOzgartir(reportId, personId, "aniq");
    if (!yangi) return ctx.answerCallbackQuery({ text: "Bu muammo allaqachon hal qilingan." });
    await ctx.answerCallbackQuery({ text: "✅ Belgilandi." }).catch(() => {});

    const toliq = await muammoniOl(reportId);
    if (toliq) await panelniYangila(ctx.api, toliq, true);
  });

  bot.callbackQuery(/^muammo_notanilgan:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    const yangi = await javobgarniOzgartir(reportId, null, "nomalum");
    if (!yangi) return ctx.answerCallbackQuery({ text: "Bu muammo allaqachon hal qilingan." });
    await ctx.answerCallbackQuery({ text: "✅ Belgilandi." }).catch(() => {});

    const toliq = await muammoniOl(reportId);
    if (toliq) await panelniYangila(ctx.api, toliq, true);
  });

  bot.callbackQuery(/^muammo_qayta_bekor:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});

    const toliq = await muammoniOl(Number(ctx.match[1]));
    if (!toliq) return;

    const matn = muammoAdminXabari(toliq);
    const kb = muammoAdminKeyboard(toliq.id);
    if (toliq.photo_id) {
      await ctx.editMessageCaption({ caption: matn, parse_mode: "HTML", reply_markup: kb }).catch(() => {});
    } else {
      await ctx.editMessageText(matn, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
    }
  });

  bot.callbackQuery(/^muammo_izoh:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true });
    }

    const reportId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "muammo_izoh", reportId } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply("✏️ Izohingizni yozing:", { reply_markup: bekorKeyboard() });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });
}
