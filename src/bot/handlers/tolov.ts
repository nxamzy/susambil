/**
 * Kvartira to'lovi — Telegram tomoni.
 *
 * Oqim: "💳 To'lov qilish" → summa → dalil (rasm/PDF) → barcha bog'langan
 * adminlarga (shu jumladan Sorabek, chunki u ham admin) tekshiruv uchun DM.
 *
 * Admin "✅ Tasdiqlash" bossa HAQIQIY summani so'raymiz — foydalanuvchi
 * yozganiga emas, admin bank/karta tarixini tekshirib kiritgan summaga
 * ishonamiz (bu "authoritative" qiymat). Keyin foydalanuvchiga DM, guruhga
 * e'lon. "❌ Rad etish" bossa sababini so'raymiz — faqat foydalanuvchiga DM,
 * guruhga hech narsa (tasdiqlanmagan to'lov e'lon qilinmaydi).
 *
 * Har bir to'lov mustaqil yozuv (`core/tolov.ts`) — foydalanuvchining joriy
 * holati har doim SUM(tasdiqlangan_summa) bilan qayta hisoblanadi, hech
 * qanday "jami" ustuni qayta yozilmaydi.
 */
import type { Api, Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type TolovDalilTuri, type User } from "../../db/index.js";
import { summaTekshir } from "../../core/topshiriq.js";
import {
  adminXabarlarniSaqla,
  avvalgiDalil,
  foydalanuvchiTolovHolati,
  foydalanuvchiTolovlari,
  guruhXabarniSaqla,
  kutayotganTolovlar,
  siklniOl,
  siklniYakunla,
  siklTarixi,
  tolovDashboard,
  tolovniOl,
  tolovniRadEt,
  tolovniTasdiqla,
  tolovQabulQiluvchi,
  tolovYuborish,
  type TolovToliq,
} from "../../core/tolov.js";
import type { TolovSikl } from "../../db/index.js";
import { adminlarRoyxati, guruhgaYubor, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  tolovAdminKeyboard,
  tolovDashboardKeyboard,
  tolovFoydalanuvchiKeyboard,
  tolovRoyxatKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH,
  chekla,
  pul,
  siklOyi,
  tolovAdminXabari,
  tolovDashboardMatni,
  tolovFoydalanuvchiMatni,
  tolovGuruhXabari,
  tolovRadXabari,
  tolovRoyxatMatni,
  tolovTakrorXabari,
  tolovTarixXulosasi,
  type TolovRoyxatTuri,
  tolovTarixi,
  tolovTasdiqXabari,
  tolovYuborildiXabari,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";

/** Menyudan "💳 Kvartira to'lovi" → "💳 To'lov qilish" bosilganda. */
export async function tolovBoshla(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }

  // Overpayment protection: allaqachon to'liq to'lagan bo'lsa yangi oddiy
  // to'lov boshlashga ruxsat bermaymiz — talab: "do not allow another
  // normal payment to increase the balance" once FULLY PAID.
  //
  // Bu tekshiruv endi FAQAT SHU OY bo'yicha: ilgari butun tarix
  // sanalgani uchun avgustda to'lagan odam sentabrda ham "to'liq
  // to'lagansiz" degan javobni olib, umuman to'lay olmasdi.
  const holat = await foydalanuvchiTolovHolati(u.id);
  if (holat.daraja === "tola") {
    await ctx.reply(
      `✅ ${siklOyi(holat.sikl)} oyi uchun to'liq to'lagansiz. Qo'shimcha to'lov shart emas.`,
    );
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const yangi = { tur: "tolov", qadam: "summa" } as const;
  await holatOrnat(ctx.from.id, yangi);

  const xabar = await ctx.reply(
    [
      `💳 <b>QANCHA TO'LADINGIZ?</b>`,
      AJRATGICH,
      ``,
      `<i>Faqat raqam yozing:</i> <code>400000</code>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
}

/** Summa yozilgach dalil so'raydi. messages.ts'dan chaqiriladi. */
export async function tolovDalilSora(ctx: Context, summa: number): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const yangi = { tur: "tolov", qadam: "dalil", summa } as const;
  await holatOrnat(ctx.from.id, yangi);

  const xabar = await ctx.reply(
    [
      `💰 Siz kiritdingiz: <b>${pul(summa)}</b>`,
      ``,
      `📎 <b>Endi to'lov dalilini yuboring</b>`,
      `(chek rasmi yoki PDF hujjat).`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
}

/** Rasm/hujjat bo'lsa mos usul bilan yuboradi — dalil har doim majburiy, shuning uchun matn shoxobchasi yo'q. */
async function dalilXabarYubor(
  api: Api,
  chatId: number,
  matn: string,
  t: TolovToliq,
  extra: object = {},
): Promise<{ message_id: number; chat: { id: number } }> {
  return t.dalil_turi === "hujjat"
    ? api.sendDocument(chatId, t.dalil_id, { caption: matn, parse_mode: "HTML", ...extra })
    : api.sendPhoto(chatId, t.dalil_id, { caption: matn, parse_mode: "HTML", ...extra });
}

/** Mavjud dalil xabarining caption'ini tahrirlaydi — qayta yubormasdan. */
async function dalilXabarTahrirla(
  api: Api,
  chatId: number,
  messageId: number,
  matn: string,
  extra: object = {},
): Promise<boolean> {
  return api
    .editMessageCaption(chatId, messageId, { caption: matn, parse_mode: "HTML", ...extra })
    .then(() => true)
    .catch(() => false);
}

/** Har bir bog'langan adminga tekshiruv uchun DM qiladi, xabar id'larini saqlaydi. */
async function adminlargaYubor(api: Api, t: TolovToliq, joriyTasdiqlangan: number): Promise<void> {
  const adminlar = await adminlarRoyxati();
  const matn = tolovAdminXabari(t, joriyTasdiqlangan);
  const kb = tolovAdminKeyboard(t.id);
  const yuborilganlar: { chat_id: number; message_id: number }[] = [];

  for (const a of adminlar) {
    try {
      const msg = await dalilXabarYubor(api, Number(a.telegram_id), matn, t, { reply_markup: kb });
      yuborilganlar.push({ chat_id: msg.chat.id, message_id: msg.message_id });
    } catch {
      /* admin botni bloklagan yoki hali /start bosmagan */
    }
  }
  if (yuborilganlar.length > 0) await adminXabarlarniSaqla(t.id, yuborilganlar);
}

/** Barcha adminlarga yuborilgan nusxalarni yangilaydi — hal qilingandan keyin tugmalar yo'qoladi. */
async function panelniYangila(api: Api, t: TolovToliq): Promise<void> {
  const matn = tolovAdminXabari(t, 0);
  const kb = t.holat === "kutilmoqda" ? tolovAdminKeyboard(t.id) : new InlineKeyboard();
  for (const m of t.admin_msgs) {
    await dalilXabarTahrirla(api, m.chat_id, m.message_id, matn, { reply_markup: kb });
  }
}

/** Dalil (rasm/PDF) kelgach chaqiriladi — photos.ts / hujjat handler'idan. */
export async function tolovDalilKeldi(
  ctx: Context,
  summa: number,
  dalilId: string,
  dalilTuri: TolovDalilTuri,
): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) return;

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  // Ayni chek shu oyda allaqachon yuborilgan bo'lsa ikkinchi qarz yozuvi
  // yaratilmaydi — aks holda bitta pul ikki marta hisobga tushardi.
  const avvalgi = await avvalgiDalil(u.id, dalilId);
  if (avvalgi) {
    await ctx.reply(tolovTakrorXabari(avvalgi), { parse_mode: "HTML" });
    return;
  }

  const t = await tolovYuborish(u.id, summa, dalilId, dalilTuri);
  if (!t) {
    // Poyga: ikkita dalil deyarli bir vaqtda kelgan, bazadagi indeks to'sdi.
    await ctx.reply("⏳ Bu chek allaqachon qabul qilingan — tekshiruvni kuting.");
    return;
  }

  await ctx.reply(tolovYuborildiXabari(summa), { parse_mode: "HTML" });

  const toliq = await tolovniOl(t.id);
  if (!toliq) return;

  // t.holat hali 'kutilmoqda' — foydalanuvchiTolovHolati faqat 'tasdiqlandi'
  // yozuvlarni sanaydi, shuning uchun bu haqiqatan ham "shu to'lovdan oldingi
  // joriy tasdiqlangan jami".
  const holat = await foydalanuvchiTolovHolati(u.id);
  await adminlargaYubor(ctx.api, toliq, holat.tasdiqlangan);
}

/** Admin/Sorabek: "📊 Mening to'lovlarim" — hammaga o'zinikini ko'rsatadi. */
export async function tolovTarixKorsat(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }
  const tarix = await foydalanuvchiTolovlari(u.id);
  // Tarix oylar o'tgan sari uzayadi — Telegram chegarasidan oshib
  // ketmasligi uchun kesamiz. Eng yangi oy birinchi turgani uchun
  // kesilsa faqat eng eski yozuvlar tushib qoladi.
  await ctx.reply(chekla(tolovTarixi(tarix)), { parse_mode: "HTML" });
}

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

/** Admin haqiqiy summani yozib bo'lgach — messages.ts'dan chaqiriladi. */
export async function tolovTasdiqlash(ctx: Context, tolovId: number, xom: string): Promise<void> {
  if (!ctx.from) return;
  const admin = await kim(ctx.from.id);
  if (!admin?.admin) return;

  const summa = summaTekshir(xom);
  if (summa === null) {
    await ctx.reply("Faqat musbat raqam yozing, masalan: 350000");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const yangi = await tolovniTasdiqla(tolovId, admin.id, summa);
  if (!yangi) {
    await ctx.reply("Bu to'lov allaqachon ko'rib chiqilgan.");
    return;
  }

  await ctx.reply(`✅ Tasdiqlandi: <b>${pul(summa)}</b>`, { parse_mode: "HTML" });

  const toliq = await tolovniOl(tolovId);
  if (!toliq) return;
  await panelniYangila(ctx.api, toliq);

  // Holat TO'LOVNING O'Z OYI bo'yicha hisoblanadi, joriy oy bo'yicha emas:
  // 31-avgustda yuborilgan to'lov 1-sentabrda tasdiqlansa ham avgust
  // hisobiga tushishi kerak (`tolovlar.sikl_id` yuborilganda belgilanadi).
  const siklniIshlat = toliq.sikl_id ? await siklniOl(toliq.sikl_id) : null;
  const holatYangi = await foydalanuvchiTolovHolati(toliq.user_id, siklniIshlat ?? undefined);
  const qabul = await tolovQabulQiluvchi();

  const [foydalanuvchi] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.user_id}`;
  if (foydalanuvchi) {
    await shaxsiy(ctx.api, foydalanuvchi, tolovTasdiqXabari(qabul.ism, summa, holatYangi));
  }

  // Guruhga FAQAT tasdiqlangandan keyin, faqat ushbu tasdiq haqida e'lon
  // qilinadi — karta, chek rasmi va boshqa bank ma'lumotlari hech qachon
  // guruhga chiqmaydi (faqat kim/qancha/holat).
  const guruhXabar = await guruhgaYubor(
    ctx.api,
    tolovGuruhXabari(foydalanuvchi?.ism ?? toliq.ism, holatYangi),
  );
  if (guruhXabar) await guruhXabarniSaqla(toliq.id, guruhXabar.message_id);
}

/** Admin rad etish sababini yozib bo'lgach — messages.ts'dan chaqiriladi. */
export async function tolovRadEtish(ctx: Context, tolovId: number, sababXom: string): Promise<void> {
  if (!ctx.from) return;
  const admin = await kim(ctx.from.id);
  if (!admin?.admin) return;

  const sabab = sababXom.trim().slice(0, 300);
  if (sabab.length < 2) {
    await ctx.reply("Juda qisqa. Sababini yozing.");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const yangi = await tolovniRadEt(tolovId, admin.id, sabab);
  if (!yangi) {
    await ctx.reply("Bu to'lov allaqachon ko'rib chiqilgan.");
    return;
  }

  await ctx.reply("❌ Rad etildi.");

  const toliq = await tolovniOl(tolovId);
  if (!toliq) return;
  await panelniYangila(ctx.api, toliq);

  // Rad etilgan to'lov hisobga qo'shilmaydi va guruhga umuman chiqmaydi —
  // faqat foydalanuvchining o'ziga, tasdiqlanmagan to'lovni ochiq
  // e'lon qilmaslik uchun.
  const [foydalanuvchi] = await sql<User[]>`SELECT * FROM users WHERE id = ${toliq.user_id}`;
  if (foydalanuvchi) await shaxsiy(ctx.api, foydalanuvchi, tolovRadXabari(sabab));
}

/**
 * /tolovlar admin buyrug'i uchun — shu oylik umumiy ko'rinish, har bir
 * odam alohida tugmada, so'ng tasdiq kutayotgan to'lovlar.
 */
export async function tolovDashboardKorsat(ctx: Context, sikl?: TolovSikl): Promise<void> {
  const d = await tolovDashboard(sikl);
  await ctx.reply(chekla(tolovDashboardMatni(d)), {
    parse_mode: "HTML",
    reply_markup: tolovDashboardKeyboard(d),
  });
}

/** Bitta ro'yxat: qarzdorlar / kechikkanlar / to'liq to'laganlar. */
async function tolovRoyxatKorsat(ctx: Context, tur: TolovRoyxatTuri): Promise<void> {
  const d = await tolovDashboard();
  const odamlar =
    tur === "qarzdor" ? d.qarzdorlar : tur === "kechikkan" ? d.kechikkanlar : d.tola;

  await ctx.reply(chekla(tolovRoyxatMatni(d, tur)), {
    parse_mode: "HTML",
    reply_markup: tolovRoyxatKeyboard(odamlar),
  });
}

/**
 * Tasdiq kutayotgan cheklar — har biri dalil rasmi va tugmalari bilan.
 * Ilgari bu dashboardning oxiriga yopishtirilgan edi; endi alohida tugmada,
 * chunki 12 kishilik uyda bir necha chek kelsa umumiy ko'rinish butunlay
 * ko'rinmay ketardi.
 */
export async function kutayotganTolovlarniKorsat(ctx: Context): Promise<void> {
  const kutilmoqda = await kutayotganTolovlar();
  if (kutilmoqda.length === 0 || !ctx.chat) {
    await ctx.reply("✅ Tasdiq kutayotgan to'lov yo'q.");
    return;
  }

  await ctx.reply(`⏳ <b>${kutilmoqda.length} ta to'lov tasdiq kutmoqda:</b>`, {
    parse_mode: "HTML",
  });
  for (const t of kutilmoqda) {
    const oz = t.sikl_id ? await siklniOl(t.sikl_id) : null;
    const holat = await foydalanuvchiTolovHolati(t.user_id, oz ?? undefined);
    const matn = tolovAdminXabari(t, holat.tasdiqlangan);
    await dalilXabarYubor(ctx.api, ctx.chat.id, matn, t, { reply_markup: tolovAdminKeyboard(t.id) });
  }
}

/**
 * Admin bitta odamni ochganda — talab, tasdiqlangan, qoldiq, tekshiruvdagi
 * to'lovlar, muddat natijasi, jarima holati va butun to'lov tarixi
 * (talab: "Admin should be able to open each user and see ...").
 */
export async function tolovFoydalanuvchiKorsat(ctx: Context, userId: number): Promise<void> {
  const d = await tolovDashboard();
  const odam = d.odamlar.find((o) => o.userId === userId);
  if (!odam) {
    await ctx.reply("Bu foydalanuvchi topilmadi yoki faol emas.");
    return;
  }

  const tarix = await foydalanuvchiTolovlari(userId);
  await ctx.reply(chekla(tolovFoydalanuvchiMatni(d.sikl, odam, tarix)), {
    parse_mode: "HTML",
    reply_markup: tolovFoydalanuvchiKeyboard(),
  });
}

export function register(bot: Bot) {
  bot.callbackQuery("tolov_boshla", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await tolovBoshla(ctx);
  });

  bot.callbackQuery("tolov_tarix", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await tolovTarixKorsat(ctx);
  });

  bot.callbackQuery("tolov_dashboard", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await tolovDashboardKorsat(ctx);
  });

  bot.callbackQuery(/^tolov_royxat:(qarzdor|kechikkan|tolagan)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await tolovRoyxatKorsat(ctx, ctx.match[1] as TolovRoyxatTuri);
  });

  bot.callbackQuery("tolov_kutilmoqda", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await kutayotganTolovlarniKorsat(ctx);
  });

  bot.callbackQuery("tolov_tarix_admin", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(chekla(tolovTarixXulosasi(await siklTarixi())), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("⬅️ To'lovlar", "tolov_dashboard"),
    });
  });

  bot.callbackQuery(/^tolov_user:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await tolovFoydalanuvchiKorsat(ctx, Number(ctx.match[1]));
  });

  // Oyni qo'lda yopish. Faqat muddat kelgan siklda ishlaydi va tarixdan
  // hech narsa o'chirmaydi — yozuvlar joyida qoladi, faqat holat yopiladi.
  bot.callbackQuery(/^tolov_yakunla:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const yopildi = await siklniYakunla(Number(ctx.match[1]));
    if (!yopildi) {
      return ctx
        .answerCallbackQuery({
          text: "Bu oyni hozir yopib bo'lmaydi — muddati hali kelmagan yoki allaqachon yopilgan.",
          show_alert: true,
        })
        .catch(() => {});
    }

    await ctx.answerCallbackQuery({ text: `${siklOyi(yopildi)} oyi yakunlandi.` }).catch(() => {});
    await tolovDashboardKorsat(ctx, yopildi);
  });

  bot.callbackQuery(/^tolov_tasdiq:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const tolovId = Number(ctx.match[1]);
    const toliq = await tolovniOl(tolovId);
    if (!toliq || toliq.holat !== "kutilmoqda") {
      return ctx.answerCallbackQuery({ text: "Bu to'lov allaqachon ko'rib chiqilgan." }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "tolov_tasdiq", tolovId } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply(
      [
        `💰 <b>Haqiqatda qancha pul keldi?</b>`,
        ``,
        `<i>Foydalanuvchi yozgani:</i> ${pul(Number(toliq.kiritgan_summa))}`,
        ``,
        `Bank/karta tarixini tekshirib, aniq summani yozing:`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery(/^tolov_rad:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const tolovId = Number(ctx.match[1]);
    const toliq = await tolovniOl(tolovId);
    if (!toliq || toliq.holat !== "kutilmoqda") {
      return ctx.answerCallbackQuery({ text: "Bu to'lov allaqachon ko'rib chiqilgan." }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "tolov_rad", tolovId } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx.reply("✏️ Rad etish sababini yozing:", { reply_markup: bekorKeyboard() });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });
}
