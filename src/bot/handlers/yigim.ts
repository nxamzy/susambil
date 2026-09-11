/**
 * Pul yig'imi — Telegram tomoni.
 *
 * Oqim: admin "💰 Pul yig'ish" → nomi → har kishidan qancha → muddati →
 * tasdiq → guruhga KARTA BILAN e'lon + hammaga shaxsiy xabar. A'zo
 * "💰 To'ladim" bosadi, summa va chek yuboradi — o'sha yerdan boshlab
 * kvartira to'lovi bilan AYNAN BITTA yo'l: admin tekshiradi, haqiqiy summa
 * hisobga tushadi, guruhga "falonchi shuncha to'ladi" e'loni chiqadi.
 *
 * Shuning uchun bu faylda tekshiruv/tasdiqlash kodi YO'Q — `handlers/tolov.ts`
 * niki ishlatiladi. Bu yerda faqat yig'imga xos qism: uni boshlash, kimga
 * qancha tegishini e'lon qilish va admin boshqaruvi.
 *
 * Dashboard, ro'yxatlar va odam kartochkasi ham o'sha fayldagi funksiyalar —
 * ular `sikl` parametrini oladi, ya'ni ikkinchi nusxa yozilmadi.
 */
import type { Bot, Context } from "grammy";
import type { TolovSikl, User } from "../../db/index.js";
import { summaTekshir } from "../../core/topshiriq.js";
import {
  foydalanuvchiTolovHolati,
  ochiqYigim,
  siklniOl,
  tolovDashboard,
  tolovQabulQiluvchi,
  yigimlarRoyxati,
  yigimMuddatiniOzgartir,
  yigimniYakunla,
  yigimTalabiniOzgartir,
  yigimTarixi,
  yigimYarat,
} from "../../core/tolov.js";
import { logla } from "../../core/adminlog.js";
import { sql } from "../../db/index.js";
import { guruhgaYubor, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  yigimBoshlashKeyboard,
  yigimKeyboard,
  yigimKunKeyboard,
  yigimTolashKeyboard,
  yigimYakunlashKeyboard,
  yigimYoqKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH,
  chekla,
  pul,
  tolovTarixXulosasi,
  yigimEslatmaXabari,
  yigimGuruhElon,
  yigimKorinishi,
  yigimOzgardiGuruh,
  yigimShaxsiyElon,
  yigimTasdiqMatni,
  yigimYopildiGuruh,
  yigimYoqMatni,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import { tolovDashboardKorsat, tolovFoydalanuvchiKorsat, tolovRoyxatKorsat } from "./tolov.js";
import type { TolovRoyxatTuri } from "../text.js";

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const u = await kim(ctx.from?.id);
  return u?.admin ? u : null;
}

async function faolOdamlar(): Promise<User[]> {
  return sql<User[]>`SELECT * FROM users WHERE faol ORDER BY ism`;
}

// ---------------------------------------------------------------------------
// KO'RINISH (a'zo ham, admin ham)
// ---------------------------------------------------------------------------

/**
 * "💰 Pul yig'imi" ko'rinishi. Ochiq yig'im bo'lsa — o'z holati va to'lash
 * tugmasi; bo'lmasa — oxirgi yig'imlar va (admin bo'lsa) boshlash tugmasi.
 *
 * Matnni `korinish()` ham ishlatadi, shuning uchun matn va tugma alohida
 * qaytariladi — guruh panelida xabar boshqacha yuboriladi.
 */
export async function yigimKorinishMatni(
  telegramId: number | undefined,
): Promise<{ matn: string; tugma: ReturnType<typeof yigimKeyboard> | undefined }> {
  const u = await kim(telegramId);
  const yigim = await ochiqYigim();

  if (!yigim) {
    return {
      matn: yigimYoqMatni(await yigimTarixi(5), Boolean(u?.admin)),
      tugma: yigimYoqKeyboard(Boolean(u?.admin)),
    };
  }

  const qabul = await tolovQabulQiluvchi();

  // Ro'yxatdan o'tmagan odam (yoki guruh paneli) — shaxsiy holat yo'q,
  // shuning uchun e'lonning o'zi ko'rsatiladi. "Yig'im yo'q" deb aytish
  // xato bo'lardi: yig'im bor, faqat kimligi noma'lum.
  if (!u) {
    return {
      matn: yigimGuruhElon(yigim, qabul, (await faolOdamlar()).length),
      tugma: undefined,
    };
  }

  const holat = await foydalanuvchiTolovHolati(u.id, yigim);
  return {
    matn: yigimKorinishi(qabul, holat),
    tugma: yigimKeyboard(holat.daraja === "tola"),
  };
}

// ---------------------------------------------------------------------------
// ADMIN: YANGI YIG'IM
// ---------------------------------------------------------------------------

async function yigimNominiSora(ctx: Context): Promise<void> {
  if (!ctx.from) return;

  // Bir vaqtda bitta ochiq yig'im — bazadagi qisman UNIQUE indeks buni
  // kafolatlaydi, bu yerda esa adminga tushunarli sabab aytiladi.
  const mavjud = await ochiqYigim();
  if (mavjud) {
    await ctx.reply(
      [
        `⚠️ <b>Allaqachon ochiq yig'im bor</b>`,
        ``,
        `📌 «${mavjud.nom ?? "Yig'im"}»`,
        ``,
        `Yangisini boshlash uchun avval shuni yakunlang.`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
    return yigimDashboardKorsat(ctx);
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  const yangi = { tur: "yigim_yangi", qadam: "nom" } as const;
  await holatOrnat(ctx.from.id, yangi);

  const xabar = await ctx.reply(
    [
      `💰 <b>YANGI YIG'IM</b>`,
      AJRATGICH,
      ``,
      `✍️ <b>Nima uchun pul yig'yapmiz?</b>`,
      ``,
      `<i>Masalan:</i> <code>Internet puli</code>`,
      `<i>yoki</i> <code>Oshxonaga gaz ballon</code>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
}

/** Nomi yozilgach summani so'raymiz. messages.ts'dan chaqiriladi. */
export async function yigimNomiKeldi(ctx: Context, nom: string): Promise<void> {
  if (!ctx.from || !(await faqatAdmin(ctx))) return;

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  const yangi = { tur: "yigim_yangi", qadam: "summa", nom } as const;
  await holatOrnat(ctx.from.id, yangi);

  const odamSoni = (await faolOdamlar()).length;
  const xabar = await ctx.reply(
    [
      `📌 <b>${nom}</b>`,
      ``,
      `💵 <b>Har kishidan qancha yig'amiz?</b>`,
      ``,
      `<i>Faqat raqam yozing:</i> <code>30000</code>`,
      ``,
      `<i>Hozir uyda ${odamSoni} kishi bor.</i>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
}

/** Summa yozilgach muddatni tugma bilan so'raymiz. */
export async function yigimSummasiKeldi(ctx: Context, nom: string, xom: string): Promise<void> {
  if (!ctx.from || !(await faqatAdmin(ctx))) return;

  const talab = summaTekshir(xom);
  if (talab === null) {
    await ctx.reply("Faqat musbat raqam yozing, masalan: 30000");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  const yangi = { tur: "yigim_yangi", qadam: "kun", nom, talab } as const;
  await holatOrnat(ctx.from.id, yangi);

  const xabar = await ctx.reply(
    [
      `📌 <b>${nom}</b>`,
      `💵 Har kishidan: <b>${pul(talab)}</b>`,
      ``,
      `📅 <b>Qachongacha yig'amiz?</b>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: yigimKunKeyboard("yigim_kun") },
  );
  await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
}

/**
 * Yig'imni haqiqatan ochadi va e'lon qiladi.
 *
 * E'lon IKKI JOYGA ketadi va ikkalasi ham muhim: guruhga — karta bilan
 * ("mana shu kartaga tashlanglar"), har bir a'zoga — shaxsiy, to'lash
 * tugmasi bilan. Guruhdagi xabarni hamma ham o'qimaydi, shaxsiysi esa
 * yo'qolmaydi.
 */
async function yigimniOchish(ctx: Context, nom: string, talab: number, kun: number): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin || !ctx.from) return;

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const yigim = await yigimYarat(nom, talab, kun);
  if (!yigim) {
    await ctx.reply("⚠️ Ochiq yig'im allaqachon bor — avval uni yakunlang.");
    return yigimDashboardKorsat(ctx);
  }

  await logla(admin.id, "yigim_boshlandi", "sikl", yigim.id, null, `${nom}: ${talab}`);

  const qabul = await tolovQabulQiluvchi();
  const odamlar = await faolOdamlar();

  await guruhgaYubor(ctx.api, yigimGuruhElon(yigim, qabul, odamlar.length));

  const shaxsiyMatn = yigimShaxsiyElon(yigim, qabul);
  const natijalar = await Promise.all(
    odamlar.map((o) => shaxsiy(ctx.api, o, shaxsiyMatn, { reply_markup: yigimTolashKeyboard() })),
  );
  const yetdi = natijalar.filter(Boolean).length;

  await ctx.reply(
    [
      `✅ <b>Yig'im boshlandi</b>`,
      ``,
      `📢 Guruhga e'lon ketdi`,
      `👤 ${yetdi}/${odamlar.length} kishiga shaxsiy xabar yetdi`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );
  await yigimDashboardKorsat(ctx);
}

// ---------------------------------------------------------------------------
// ADMIN: BOSHQARUV
// ---------------------------------------------------------------------------

/** Ochiq yig'imning dashboardi — `tolovDashboardKorsat` bilan bitta kod. */
export async function yigimDashboardKorsat(ctx: Context): Promise<void> {
  const yigim = await ochiqYigim();
  if (!yigim) {
    const admin = Boolean(await faqatAdmin(ctx));
    await ctx.reply(yigimYoqMatni(await yigimTarixi(5), admin), {
      parse_mode: "HTML",
      reply_markup: yigimYoqKeyboard(admin),
    });
    return;
  }
  await tolovDashboardKorsat(ctx, yigim);
}

/** Ochiq yig'imni oladi; yo'q bo'lsa adminga sababini aytadi. */
async function ochiqniOl(ctx: Context): Promise<TolovSikl | null> {
  const yigim = await ochiqYigim();
  if (!yigim) {
    await ctx.reply("Bu yig'im allaqachon yakunlangan.");
    await yigimDashboardKorsat(ctx);
  }
  return yigim;
}

/**
 * Admin "📣 Hammaga eslatma" bosganda — 5 soatlik oynani KUTMASDAN darrov
 * yuboradi. Avtomatik eslatma (`jobs/reminders.ts`) o'z jadvalida davom
 * etadi; bu shunchaki qo'lda turtki, shuning uchun `oxirgi_eslatma_ts`
 * yozilmaydi va jadvalni surib yubormaydi.
 */
async function qolgaTurtki(ctx: Context, yigim: TolovSikl): Promise<void> {
  const d = await tolovDashboard(yigim);
  const qabul = await tolovQabulQiluvchi();
  const odamlar = await faolOdamlar();

  let yetdi = 0;
  for (const o of d.qarzdorlar) {
    const u = odamlar.find((x) => x.id === o.userId);
    if (!u) continue;
    const ok = await shaxsiy(
      ctx.api,
      u,
      yigimEslatmaXabari(
        yigim,
        { qoldiq: o.qoldiq, tasdiqlangan: o.tasdiqlangan, kutilmoqdaSumma: o.kutilmoqdaSumma },
        qabul,
      ),
      { reply_markup: yigimTolashKeyboard() },
    );
    if (ok) yetdi++;
  }

  await ctx.reply(
    d.qarzdorlar.length === 0
      ? "🎉 Qarzdor yo'q — eslatma kerak emas."
      : `📣 ${yetdi}/${d.qarzdorlar.length} qarzdorga eslatma yuborildi.`,
  );
}

export function register(bot: Bot) {
  // --- ko'rinish -----------------------------------------------------------

  bot.callbackQuery("yigim_dashboard", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await yigimDashboardKorsat(ctx);
  });

  bot.command("yigim", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (await faqatAdmin(ctx)) return yigimDashboardKorsat(ctx);
    const { matn, tugma } = await yigimKorinishMatni(ctx.from?.id);
    await ctx.reply(matn, { parse_mode: "HTML", reply_markup: tugma });
  });

  // --- a'zo: to'lash -------------------------------------------------------

  bot.callbackQuery("yigim_tolash", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    if (!ctx.from) return;

    const u = await kim(ctx.from.id);
    if (!u) return ctx.reply("Avval /start bosib ro'yxatdan o'ting.");

    const yigim = await ochiqYigim();
    if (!yigim) return ctx.reply("Hozir ochiq yig'im yo'q.");

    // Kvartira to'lovidagi bilan bir xil himoya: to'liq to'lagan odam
    // yana yangi to'lov yuborib hisobni oshira olmaydi.
    const holat = await foydalanuvchiTolovHolati(u.id, yigim);
    if (holat.daraja === "tola") {
      return ctx.reply(`✅ «${yigim.nom ?? "Yig'im"}» bo'yicha to'liq to'lagansiz.`);
    }

    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    const yangi = { tur: "tolov", qadam: "summa", siklId: yigim.id } as const;
    await holatOrnat(ctx.from.id, yangi);

    const xabar = await ctx.reply(
      [
        `💰 <b>${(yigim.nom ?? "YIG'IM").toUpperCase()}</b>`,
        AJRATGICH,
        ``,
        `<b>Qancha to'ladingiz?</b>`,
        ``,
        `<i>Sizdan kutilgani:</i> <b>${pul(holat.qoldiq)}</b>`,
        `<i>Faqat raqam yozing:</i> <code>${holat.qoldiq}</code>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
  });

  // --- admin: yangi yig'im -------------------------------------------------

  bot.callbackQuery("yigim_yangi", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await yigimNominiSora(ctx);
  });

  bot.callbackQuery(/^yigim_kun:(\d+)$/, async (ctx) => {
    if (!ctx.from || !(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "yigim_yangi" || holat.qadam !== "kun") {
      return ctx.reply("Bu jarayon eskirdi. Qaytadan boshlang.");
    }

    const kun = Number(ctx.match[1]);
    await sorovniOchir(ctx.api, holat);

    const yangi = { tur: "yigim_yangi", qadam: "tasdiq", nom: holat.nom, talab: holat.talab, kun } as const;
    await holatOrnat(ctx.from.id, yangi);

    const odamSoni = (await faolOdamlar()).length;
    const xabar = await ctx.reply(yigimTasdiqMatni(holat.nom, holat.talab, kun, odamSoni), {
      parse_mode: "HTML",
      reply_markup: yigimBoshlashKeyboard(),
    });
    await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery("yigim_boshla", async (ctx) => {
    if (!ctx.from || !(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "yigim_yangi" || holat.qadam !== "tasdiq") {
      return ctx.reply("Bu jarayon eskirdi. Qaytadan boshlang.");
    }
    await yigimniOchish(ctx, holat.nom, holat.talab, holat.kun);
  });

  // --- admin: ro'yxat / odam / tuzatish (tolov.ts bilan bitta kod) ---------

  bot.callbackQuery(/^yigim_royxat:(qarzdor|kechikkan|tolagan)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    const yigim = await ochiqniOl(ctx);
    if (!yigim) return;
    await tolovRoyxatKorsat(ctx, ctx.match[1] as TolovRoyxatTuri, yigim);
  });

  bot.callbackQuery(/^yigim_user:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    const yigim = await ochiqniOl(ctx);
    if (!yigim) return;
    await tolovFoydalanuvchiKorsat(ctx, Number(ctx.match[1]), yigim);
  });

  /**
   * "To'ladi/to'lamadi" — dalilsiz qo'lda tuzatish, xuddi kvartira
   * to'lovidagi kabi (`tolov_tuzat`), faqat yig'im sikliga yoziladi.
   * Naqd qo'lma-qo'l bergan odam uchun eng ko'p kerak bo'ladigan tugma.
   */
  bot.callbackQuery(/^yigim_tuzat:(\d+)$/, async (ctx) => {
    if (!ctx.from || !(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const yigim = await ochiqniOl(ctx);
    if (!yigim) return;

    const userId = Number(ctx.match[1]);
    const holat = { tur: "tolov_tuzat", qadam: "summa", userId, siklId: yigim.id } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply(
      [
        `✏️ <b>«${yigim.nom ?? "Yig'im"}» — qo'lda belgilash</b>`,
        AJRATGICH,
        ``,
        `Summani ISHORA bilan yozing — dalilsiz "to'ladi" deb`,
        `belgilash uchun musbat, hisobdan ayirish uchun manfiy:`,
        `<code>+${yigim.talab}</code>`,
        `<code>-${yigim.talab}</code>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  // --- admin: summa / muddat / eslatma / yakunlash -------------------------

  bot.callbackQuery(/^yigim_summa:(\d+)$/, async (ctx) => {
    if (!ctx.from || !(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const siklId = Number(ctx.match[1]);
    const holat = { tur: "yigim_summa", siklId } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply(
      [
        `💵 <b>Har kishidan qancha bo'lsin?</b>`,
        ``,
        `<i>Faqat raqam yozing:</i> <code>30000</code>`,
        ``,
        `<i>Yangi summa DARROV kuchga kiradi — kim allaqachon</i>`,
        `<i>to'lagan bo'lsa, qoldig'i qayta hisoblanadi.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery(/^yigim_muddat:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(`📅 <b>Bugundan boshlab necha kun?</b>`, {
      parse_mode: "HTML",
      reply_markup: yigimKunKeyboard(`yigim_muddat_set:${ctx.match[1]}`),
    });
  });

  bot.callbackQuery(/^yigim_muddat_set:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const kun = Number(ctx.match[2]);
    const yangi = await yigimMuddatiniOzgartir(Number(ctx.match[1]), kun);
    if (!yangi) return ctx.reply("Bu yig'im allaqachon yakunlangan.");

    await logla(admin.id, "yigim_muddat", "sikl", yangi.id, null, String(kun));
    // Muddat o'zgarishi JIMGINA bo'lmaydi — navbat muddatidagi bilan bir
    // xil qoida: muddat odamdan nima kutilishini belgilaydi.
    await guruhgaYubor(
      ctx.api,
      yigimOzgardiGuruh(yangi, `📅 Muddat o'zgardi: <b>${kun === 0 ? "bugun kechgacha" : `${kun} kun`}</b>`),
    );
    await yigimDashboardKorsat(ctx);
  });

  bot.callbackQuery(/^yigim_turtki:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery({ text: "Yuborilmoqda..." }).catch(() => {});
    const yigim = await siklniOl(Number(ctx.match[1]));
    if (!yigim) return;
    await qolgaTurtki(ctx, yigim);
  });

  bot.callbackQuery(/^yigim_yakunla:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const yigim = await siklniOl(Number(ctx.match[1]));
    if (!yigim) return;
    const d = await tolovDashboard(yigim);

    await ctx.reply(
      [
        `🔒 <b>Yig'imni yakunlaymizmi?</b>`,
        AJRATGICH,
        ``,
        `📌 <b>${yigim.nom ?? "Yig'im"}</b>`,
        `💵 Yig'ilgan: <b>${pul(d.jamiTasdiqlangan)}</b> / ${pul(d.jamiTalab)}`,
        ...(d.jamiQoldiq > 0
          ? [``, `⚠️ <b>${d.qarzdorlar.length} kishidan ${pul(d.jamiQoldiq)} tushmagan.</b>`,
             `<i>Yakunlansa ulardan endi so'ralmaydi va eslatma to'xtaydi.</i>`]
          : [``, `✅ Hammadan to'liq tushgan.`]),
        ``,
        `<i>Tarix o'chmaydi — yozuvlar joyida qoladi.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: yigimYakunlashKeyboard(yigim.id) },
    );
  });

  bot.callbackQuery(/^yigim_yakunla_ok:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const siklId = Number(ctx.match[1]);
    // Dashboard YOPISHDAN OLDIN olinadi: yakuniy e'londa kim qancha
    // to'lagani ko'rinishi kerak, yopilgach esa u baribir o'zgarmaydi.
    const oldingi = await siklniOl(siklId);
    const d = oldingi ? await tolovDashboard(oldingi) : null;

    const yopildi = await yigimniYakunla(siklId);
    if (!yopildi) {
      return ctx
        .answerCallbackQuery({ text: "Bu yig'im allaqachon yakunlangan.", show_alert: true })
        .catch(() => {});
    }
    await ctx.answerCallbackQuery({ text: "Yakunlandi." }).catch(() => {});

    await logla(admin.id, "yigim_yakunlandi", "sikl", yopildi.id, null, yopildi.nom);
    if (d) await guruhgaYubor(ctx.api, yigimYopildiGuruh(d));
    await yigimDashboardKorsat(ctx);
  });

  bot.callbackQuery("yigim_tarix", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      chekla(
        tolovTarixXulosasi(
          await yigimTarixi(12),
          `📜 <b>YIG'IMLAR TARIXI</b>`,
          `🤷 <i>Hali yig'im bo'lmagan.</i>`,
        ),
      ),
      { parse_mode: "HTML", reply_markup: yigimYoqKeyboard(true) },
    );
  });
}

/** Admin ochiq yig'imning summasini yozib bo'lgach — messages.ts'dan. */
export async function yigimSummaOzgartirishKeldi(
  ctx: Context,
  siklId: number,
  xom: string,
): Promise<void> {
  const admin = await faqatAdmin(ctx);
  if (!admin || !ctx.from) return;

  const talab = summaTekshir(xom);
  if (talab === null) {
    await ctx.reply("Faqat musbat raqam yozing, masalan: 30000");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const yangi = await yigimTalabiniOzgartir(siklId, talab);
  if (!yangi) {
    await ctx.reply("Bu yig'im allaqachon yakunlangan.");
    return;
  }

  await logla(admin.id, "yigim_summa", "sikl", yangi.id, null, String(talab));
  await guruhgaYubor(
    ctx.api,
    yigimOzgardiGuruh(yangi, `💵 Har kishidan yangi summa: <b>${pul(talab)}</b>`),
  );
  await ctx.reply(`✅ Yangi summa: <b>${pul(talab)}</b>`, { parse_mode: "HTML" });
  await yigimDashboardKorsat(ctx);
}
