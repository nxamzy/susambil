/**
 * Navbat — shaxsiy vazifa paneli.
 *
 * Navbatdagi xonaning har bir a'zosi botda "👤 Mening Navbatim"ni ochsa
 * (yoki shaxsiy chatdagi "📋 Navbat" tugmasi/`/navbat` orqali) o'z
 * xonasining 4 ta vazifasini (xona/hammom/oshxona/musor) alohida-alohida,
 * har biriga rasm bilan, belgilaydi. Holat `turns.ishlar`da saqlanadi —
 * bot qayta ishga tushsa ham yo'qolmaydi.
 *
 * Boshqa xonadagi odam shu ko'rinishni ochsa — faqat umumiy ma'lumot
 * (`boshqaXonaMatni`), hech qanday tugma yo'q. Har bir harakat serverda
 * `kim(ctx.from.id)` orqali aniqlangan `room_id` bilan tekshiriladi.
 *
 * Hammasi bajarilgach "📸 Yakuniy topshirish" mavjud tasdiqlash oqimiga
 * (bot/handlers/confirm.ts, `tasdiqXabari`/`tasdiqKeyboard`) ulanadi —
 * ikkinchi tasdiqlash tizimi yaratilmagan.
 */
import type { Api, Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { InputMediaPhoto } from "grammy/types";
import { sql, type Room, type Turn, type User } from "../../db/index.js";
import { config, ISH_TURLARI, type NavbatIshi } from "../../config.js";
import {
  barchaIshlarBajarildimi,
  faolNavbat,
  ishBelgila,
  majburiyOchildimi,
  navbatFaolTopshirigi,
  navbatniBoshlash,
  navbatniOzgartirish,
  navbatniQaytaBoshla,
  navbatniYopish,
  navbatTopshir,
} from "../../core/rotation.js";
import { tasdiqlovchilar } from "../../core/topshiriq.js";
import { guruhId, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  menyuKeyboard,
  navbatAdminKeyboard,
  navbatBoshlashKeyboard,
  navbatXonagaOtkazishKeyboard,
  tasdiqKeyboard,
  vazifaKeyboard,
} from "../keyboards.js";
import {
  boshqaXonaMatni,
  majburiyQulfMatni,
  navbatAdminPaneli,
  navbatXabari,
  tasdiqXabari,
  vazifaPaneli,
  type VazifaHolati,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniOchir } from "../state.js";

/** Joriy navbat uchun ko'rinish holati — kutilmoqda/rad/faol. */
async function vazifaHolatiniAniqla(turn: Turn): Promise<VazifaHolati> {
  const faolSub = await navbatFaolTopshirigi(turn.id);
  if (faolSub) {
    const ismlar = await tasdiqlovchilar(faolSub.id);
    return { tur: "kutilmoqda", tasdiqlovchilar: ismlar, kerak: config.kerakliTasdiq };
  }

  const [oxirgiRad] = await sql<{ rad_sababi: string | null }[]>`
    SELECT rad_sababi FROM submissions
    WHERE turn_id = ${turn.id} AND tur = 'navbat' AND holat = 'rad'
    ORDER BY id DESC LIMIT 1
  `;
  if (oxirgiRad) return { tur: "rad", sabab: oxirgiRad.rad_sababi };

  return { tur: "faol" };
}

/**
 * Majburiy vazifalar (xona/hammom/oshxona/musor) muddat tugashiga
 * `config.majburiyOchilishKuni` kun qolmaguncha ko'rsatilmaydi — shu
 * paytgacha bu yerda faqat qulf xabari chiqadi. Ixtiyoriy tozalash
 * (bottom menyudagi tez ish tugmalari) bundan butunlay mustaqil — ular
 * bu tekshiruvga umuman tegishli emas.
 */
async function panelniYubor(ctx: Context, turn: Turn, room: Room): Promise<void> {
  if (!majburiyOchildimi(turn.muddat)) {
    await ctx.reply(majburiyQulfMatni(room, turn.muddat), { parse_mode: "HTML" });
    return;
  }

  const status = await vazifaHolatiniAniqla(turn);
  const matn = vazifaPaneli(room, turn, status);
  const kb = status.tur === "faol" ? vazifaKeyboard(turn.id, turn.ishlar) : new InlineKeyboard();
  await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
}

/**
 * Asosiy kirish nuqtasi — FAQAT shaxsiy chatda chaqiriladi (guruh panelida
 * hech qachon, chunki bu yerdagi tugmalar faqat aynan shu xonaga tegishli
 * bo'lishi shart, boshqa a'zolar ularni bosa olmasligi kerak).
 */
export async function vazifaPaneliniKorsat(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }

  const n = await faolNavbat();
  if (!n) {
    await ctx.reply("🧹 Hozircha navbat boshlanmagan.");
    return;
  }

  if (u.room_id !== n.room.id) {
    await ctx.reply(boshqaXonaMatni(n.room, n.azolar, n.turn.muddat), { parse_mode: "HTML" });
    return;
  }

  await panelniYubor(ctx, n.turn, n.room);
}

/**
 * Vazifa rasmi kelgach chaqiriladi — photos.ts'dan. Rasm YIG'ILADI, darrov
 * yakunlanmaydi: kerakli sondan (`NAVBAT_RASM_SONI`) kamida bittasi qolgan
 * bo'lsa, jarayon holati ("navbat_ish") ATAYLAB tozalanmaydi — keyingi
 * xabar (masalan albom ichidagi navbatdagi rasm) xuddi shu vazifaga davom
 * etadi, odam qayta tugma bosishi shart emas.
 */
export async function vazifaRasmiKeldi(
  ctx: Context,
  ish: NavbatIshi,
  turnId: number,
  fileId: string,
): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) return;

  const natija = await ishBelgila(turnId, ish, u.id, fileId);
  if (!natija) {
    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    await holatTozala(ctx.from.id);
    await ctx.reply("Bu navbat allaqachon yopilgan.");
    return;
  }

  const t = ISH_TURLARI[ish];

  if (!natija.yozildimi) {
    // Vazifa bu rasmdan OLDIN ham to'liq edi — hech narsa yo'qolmadi,
    // shu rasm shunchaki hisobga olinmadi (odam adashib qayta tashlagan).
    await ctx.reply(
      `✅ <b>${t.nom}</b> uchun kerakli ${natija.kerak} ta rasm allaqachon yig'ilgan — bu rasm qo'shimcha, hisobga olinmadi.`,
      { parse_mode: "HTML" },
    );
  } else if (natija.toliq) {
    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    await holatTozala(ctx.from.id);
    await ctx.reply(
      natija.kerak > 1
        ? `✅ <b>${t.nom}</b> belgilandi — ${natija.soni}/${natija.kerak} rasm qabul qilindi.`
        : `✅ <b>${t.nom}</b> belgilandi.`,
      { parse_mode: "HTML" },
    );
  } else {
    // Jarayonni davom ettiramiz — muddatni yangilab qo'yamiz, aks holda
    // odam bir nechta rasmni sekin-sekin tashlasa 15 daqiqadan keyin holat
    // eskirib, keyingi rasm hech nimaga bog'lanmay qolishi mumkin edi.
    await holatOrnat(ctx.from.id, { tur: "navbat_ish", ish, turnId });
    await ctx.reply(
      [
        `📷 <b>${t.nom}</b> — ${natija.soni}/${natija.kerak} rasm qabul qilindi.`,
        `Yana <b>${natija.kerak - natija.soni} ta</b> kerak — shu yerga tashlang.`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
  }

  const n = await faolNavbat();
  if (n) await panelniYubor(ctx, n.turn, n.room);
}

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

/** /joriynavbat admin buyrug'i va Admin Panel → Navbat havolasi uchun. */
export async function navbatAdminDashboard(ctx: Context): Promise<void> {
  const n = await faolNavbat();
  if (!n) {
    await ctx.reply("🧹 Hozircha navbat boshlanmagan.", {
      reply_markup: navbatBoshlashKeyboard(),
    });
    return;
  }
  const status = await vazifaHolatiniAniqla(n.turn);
  await ctx.reply(navbatAdminPaneli(n.room, n.turn, n.azolar, status), {
    parse_mode: "HTML",
    reply_markup: navbatAdminKeyboard(n.turn.id),
  });
}

/**
 * Navbat yangi xonaga o'tganda (avtomatik 3-tasdiqdan yoki har qanday admin
 * harakatidan keyin) yangi a'zolarga DM — bitta joyda, to'rtta chaqiruvchi
 * (confirm.ts avtomatik yopilish, va shu fayldagi uchta admin harakati)
 * bir xil funksiyani ishlatadi, ikkinchi nusxa yaratilmagan.
 *
 * `reply_markup` shu bilan birga qabul qiluvchining pastki menyusini ham
 * yangilaydi — "🧹 Mening navbatim" endi ko'rinadi. Bu shart, chunki
 * Telegram'ning doimiy klaviaturasi FAQAT bot o'sha chatga yangi xabar
 * yuborganda yangilanadi — boshqa hech qanday "push" usuli yo'q.
 */
export async function navbatKelganiniXabarQil(api: Api, room: Room, azolar: User[]): Promise<void> {
  const matn = [
    `🧹 <b>NAVBAT SIZGA KELDI</b>`,
    ``,
    `🏠 ${room.raqam}-xona`,
    ``,
    `👇 Pastdagi <b>"🧹 Mening navbatim"</b> tugmasi orqali kuzatib boring.`,
    ``,
    `<i>Majburiy xona tozalash muddat tugashiga ${config.majburiyOchilishKuni} kun</i>`,
    `<i>qolganda ochiladi — shu paytgacha ixtiyoriy tozalash tugmalaridan</i>`,
    `<i>foydalanishingiz mumkin.</i>`,
  ].join("\n");

  for (const a of azolar) {
    await shaxsiy(api, a, matn, { reply_markup: menyuKeyboard(a.admin, true) });
  }
}

export function register(bot: Bot) {
  bot.callbackQuery("navbat_panel", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await vazifaPaneliniKorsat(ctx);
  });

  bot.callbackQuery(/^navbat_ish:(\d+):(xona|hammom|oshxona|musor)$/, async (ctx) => {
    const turnId = Number(ctx.match[1]);
    const ish = ctx.match[2] as NavbatIshi;

    const u = await kim(ctx.from.id);
    if (!u) return ctx.answerCallbackQuery({ text: "Siz ro'yxatda yo'qsiz." });

    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId || u.room_id !== n.room.id) {
      return ctx.answerCallbackQuery({ text: "Bu sizning navbatingiz emas.", show_alert: true });
    }

    // Backend tomonda ham tekshiramiz — eski (keshlangan) tugma hali
    // ko'rinib tursa ham, majburiy tozalash muddatdan oldin ochilmaydi.
    if (!majburiyOchildimi(n.turn.muddat)) {
      return ctx.answerCallbackQuery({
        text: `Majburiy tozalash hali ochilmagan — navbatingiz tugashiga ${config.majburiyOchilishKuni} kun qolganda ochiladi.`,
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({ text: "📷 Rasmni shu yerga tashlang." }).catch(() => {});

    const holat = { tur: "navbat_ish", ish, turnId } as const;
    await holatOrnat(ctx.from.id, holat);

    const t = ISH_TURLARI[ish];
    await ctx.reply(
      [`${t.emoji} <b>${t.nom}</b>`, ``, `📷 Rasmini shu yerga tashlang.`].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
  });

  bot.callbackQuery(/^navbat_topshir:(\d+)$/, async (ctx) => {
    const turnId = Number(ctx.match[1]);
    const u = await kim(ctx.from.id);
    if (!u) return ctx.answerCallbackQuery({ text: "Siz ro'yxatda yo'qsiz." });

    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId || u.room_id !== n.room.id) {
      return ctx.answerCallbackQuery({ text: "Bu sizning navbatingiz emas.", show_alert: true });
    }
    if (!barchaIshlarBajarildimi(n.turn.ishlar)) {
      return ctx.answerCallbackQuery({ text: "Hali barcha vazifalar bajarilmagan.", show_alert: true });
    }
    if (await navbatFaolTopshirigi(turnId)) {
      return ctx.answerCallbackQuery({ text: "Allaqachon topshirilgan." });
    }

    await ctx.answerCallbackQuery({ text: "✅ Topshirildi!" }).catch(() => {});

    const sub = await navbatTopshir(n.turn, u.id);
    await panelniYubor(ctx, n.turn, n.room);

    // Guruhga xuddi eski (rasm-to'plash) mexanizmi bilan bir xil xabar —
    // ikkinchi tasdiqlash tizimi yaratilmagan, faqat tetiklovchisi boshqa.
    const chatId = await guruhId();
    if (!chatId) return;

    if (sub.photo_ids.length > 0) {
      const media: InputMediaPhoto[] = sub.photo_ids
        .slice(0, 10)
        .map((file_id) => ({ type: "photo", media: file_id }));
      await ctx.api.sendMediaGroup(chatId, media).catch(() => {});
    }

    const xabar = await ctx.api.sendMessage(
      chatId,
      tasdiqXabari(n.room, u.ism, [], config.kerakliTasdiq),
      { parse_mode: "HTML", reply_markup: tasdiqKeyboard(sub.id, 0, config.kerakliTasdiq) },
    );
    await sql`UPDATE submissions SET guruh_msg_id = ${xabar.message_id} WHERE id = ${sub.id}`;
  });

  bot.callbackQuery(/^navbat_admin_tugat:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const [turn] = await sql<Turn[]>`SELECT * FROM turns WHERE id = ${turnId} AND holat = 'faol'`;
    if (!turn) return ctx.answerCallbackQuery({ text: "Bu navbat allaqachon yopilgan." });
    const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${turn.room_id}`;
    if (!room) return ctx.answerCallbackQuery({ text: "Xona topilmadi." });

    // Xona allaqachon topshirgan, faqat 3-tasdiq kutilayotgan bo'lsa — o'sha
    // topshirilgan vaqtdan hisoblaymiz (admin qachon tugatgani emas). Hech
    // narsa topshirilmagan bo'lsa (admin haqiqatan majburan yopyapti),
    // navbatniYopish o'zining standart `new Date()`sini ishlatadi.
    const mavjudTopshiriq = await navbatFaolTopshirigi(turnId);
    const natija = await navbatniYopish(
      turn,
      room,
      "admin_yopdi",
      mavjudTopshiriq ? mavjudTopshiriq.created_at : undefined,
    );
    if (!natija) return ctx.answerCallbackQuery({ text: "Bu navbat allaqachon yopilgan." });

    await ctx.answerCallbackQuery({ text: "✅ Yakunlandi." }).catch(() => {});
    await ctx.reply(`✅ ${room.raqam}-xona navbati admin tomonidan yakunlandi.`);

    const chatId = await guruhId();
    if (chatId) {
      await ctx.api.sendMessage(
        chatId,
        navbatXabari(natija.keyingi.room, natija.keyingi.azolar, natija.keyingi.muddat),
        { parse_mode: "HTML" },
      );
    }
    await navbatKelganiniXabarQil(ctx.api, natija.keyingi.room, natija.keyingi.azolar);
  });

  bot.callbackQuery(/^navbat_admin_qayta:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const yangi = await navbatniQaytaBoshla(turnId);
    if (!yangi) return ctx.answerCallbackQuery({ text: "Navbat topilmadi yoki allaqachon yopilgan." });

    await ctx.answerCallbackQuery({ text: "🔄 Qayta boshlandi." }).catch(() => {});
    await ctx.reply("🔄 Vazifalar tozalandi, xona qaytadan boshlaydi.");
  });

  bot.callbackQuery(/^navbat_admin_eslatma:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId) {
      return ctx.answerCallbackQuery({ text: "Bu navbat endi faol emas." }).catch(() => {});
    }

    await ctx.answerCallbackQuery({ text: "🔔 Yuborildi." }).catch(() => {});

    // Qo'lda yuborilgan eslatma AVTOMATIK 5 soatlik jadvalga tegmaydi —
    // `oxirgi_eslatma` ataylab o'zgartirilmaydi, aks holda admin bosgani
    // navbatdagi avtomatik eslatmani kechiktirib yoki tezlashtirib
    // yuborardi.
    const matn = [
      `🔔 <b>ESLATMA</b>`,
      ``,
      `Hali bajarilmagan vazifalaringiz bor. Iltimos, tozalab,`,
      `dalil rasmlarini yuboring.`,
    ].join("\n");
    for (const a of n.azolar) {
      await shaxsiy(ctx.api, a, matn, { reply_markup: new InlineKeyboard().text("👤 Mening Navbatim", "navbat_panel") });
    }
  });

  // Hali hech qanday navbat ketmayotganda Admin Panel'dan boshlash —
  // /navbatboshla bilan bir xil funksiyani ishlatadi, ikkinchi nusxa yo'q.
  bot.callbackQuery("admin_navbat_boshla", async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const yangi = await navbatniBoshlash();
    if (!yangi) {
      return ctx
        .answerCallbackQuery({ text: "Navbat allaqachon ketyapti yoki bazada xona yo'q.", show_alert: true })
        .catch(() => {});
    }

    await ctx.answerCallbackQuery({ text: "▶️ Boshlandi." }).catch(() => {});
    await navbatAdminDashboard(ctx);
    await navbatKelganiniXabarQil(ctx.api, yangi.room, yangi.azolar);
  });

  // Eski /navbatber buyrug'ining Admin Panel'dagi o'rni — xona raqamini
  // qo'lda yozish shart emas, ro'yxatdan tugma bilan tanlanadi.
  bot.callbackQuery("admin_navbat_xonaga", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
    await ctx.reply("🔀 Navbatni qaysi xonaga o'tkazamiz?", {
      reply_markup: navbatXonagaOtkazishKeyboard(xonalar.map((x) => x.raqam)),
    });
  });

  bot.callbackQuery(/^admin_navbat_xona:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const raqam = Number(ctx.match[1]);
    const yangi = await navbatniOzgartirish(raqam);

    await ctx.answerCallbackQuery({ text: `✅ ${raqam}-xonaga o'tkazildi.` }).catch(() => {});
    await ctx.reply(navbatXabari(yangi.room, yangi.azolar, yangi.turn.muddat), { parse_mode: "HTML" });
    await navbatKelganiniXabarQil(ctx.api, yangi.room, yangi.azolar);
  });
}
