import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type Room } from "../../db/index.js";
import { config, ISH_TURLARI, type IshTuri } from "../../config.js";
import { ochiqTopshiriqlar } from "../../core/topshiriq.js";
import {
  faolNavbat,
  joriyNavbatchimi,
  kelgusiTartib,
  navbatSozlamalari,
  navbatTartibi,
  xonaAzolari,
} from "../../core/rotation.js";
import { sozlamalarOl } from "../../core/sozlamalar.js";
import { faolVazifalar } from "../../core/vazifalar.js";
import { tarix } from "../../core/tarix.js";
import { faollikRoyxati, orinlar } from "../../core/faollik.js";
import { kunQismlari, oyBoshi, oyNomi } from "../../core/vaqt.js";
import { foydalanuvchiTolovHolati, tolovQabulQiluvchi } from "../../core/tolov.js";
import { guruhgaYubor, guruhIdOrnat, kim, korishRasm, korishXabar } from "../group.js";
import {
  ismTanlashKeyboard,
  menyuKeyboard,
  panelKeyboard,
  panelgaKeyboard,
  qollanmaKeyboard,
  tolovKeyboard,
  xonaTanlashKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH, chekla, esc, faollikMatni, ismlar, muddatHolati, navbatXabari, qisqaSana,
  qollanmaIzohi, sana, tanishtirish, tolovKorinishi,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat } from "../state.js";
import { yigimKorinishMatni } from "./yigim.js";
import { vazifaPaneliniKorsat } from "./navbat.js";

export async function panelMatni(): Promise<string> {
  const n = await faolNavbat();

  const navbat = n
    ? [
        `🧹 <b>Navbat: ${n.room.raqam}-xona</b>`,
        `👥 ${esc(ismlar(n.azolar))}`,
        `📅 ${sana(n.turn.muddat)}`,
        `${muddatHolati(n.turn.muddat)}`,
      ]
    : ["🧹 <i>Hozircha navbat boshlanmagan.</i>"];

  return [
    `🏠 <b>SUSAMBIL — UY PANELI</b>`,
    AJRATGICH,
    ``,
    ...navbat,
    ``,
    AJRATGICH,
    `👇 Pastdagi tugmalardan foydalaning.`,
  ].join("\n");
}

async function navbatMatni(): Promise<string> {
  const n = await faolNavbat();
  if (!n) return "🧹 Hozircha navbat boshlanmagan.";

  const s = [navbatXabari(n.room, n.azolar, n.turn.muddat)];

  const vazifalar = await faolVazifalar();
  s.push(
    ``,
    AJRATGICH,
    `<b>BAJARILISHI KERAK</b>`,
    ...vazifalar.map(
      (v) =>
        `   ${esc(v.emoji)} ${esc(v.nom)}` + (v.rasm_soni > 1 ? ` — ${v.rasm_soni} ta rasm` : ""),
    ),
    ``,
    `👤 Navbatdagi xona a'zolari botda "Mening Navbatim"`,
    `   orqali har birini alohida belgilaydi.`,
    `✅ <b>${(await sozlamalarOl()).kerakliTasdiq} kishi</b> tasdiqlaydi.`,
  );

  const kelgusi = await kelgusiTartib(3);
  if (kelgusi.length > 0) {
    s.push(``, AJRATGICH, `➡️ <b>KEYINGI NAVBATLAR</b>`);
    for (const [i, k] of kelgusi.entries()) {
      s.push(`   ${i + 1}. <b>${k.room.raqam}-xona</b> — ${esc(ismlar(k.azolar))}`);
    }
  }

  return s.join("\n");
}

/** `text.ts` dagi sof `tanishtirish` uchun hamma parametrni bazadan yig'adi. */
export async function tanishtirishMatni(): Promise<string> {
  return tanishtirish(
    await faolVazifalar(),
    (await navbatSozlamalari()).siklKuni,
    await sozlamalarOl(),
    await navbatTartibi(),
  );
}

/**
 * Kvartira to'lovi ko'rinishi — matn va tugmalar birga, chunki
 * "🙁 To'lay olmayapman" faqat qarzi bor odamga va o'sha siklga chiqadi.
 */
async function tolovKorinishiniOl(
  telegramId: number | undefined,
): Promise<{ matn: string; tugma: ReturnType<typeof tolovKeyboard> }> {
  const u = await kim(telegramId);
  if (!u) return { matn: "💳 Avval /start bosib ro'yxatdan o'ting.", tugma: tolovKeyboard() };
  const qabul = await tolovQabulQiluvchi();
  const holat = await foydalanuvchiTolovHolati(u.id);
  return {
    matn: tolovKorinishi(qabul, holat),
    tugma: tolovKeyboard(holat.qoldiq > 0 ? holat.sikl.id : undefined),
  };
}

/**
 * `text.ts` dagi sof `faollikMatni` uchun ma'lumot yig'adi. Nomi ostiga
 * chiziqcha bilan: `text.ts` dagi bilan bir xil nom, lekin bu yerdagisi
 * BAZAGA boradi — qatlamlar chalkashmasin.
 */
async function faollikMatni_(telegramId?: number): Promise<string> {
  const royxat = await faollikRoyxati(oyBoshi());
  const men = telegramId ? await kim(telegramId) : null;
  return faollikMatni(royxat, orinlar(royxat), men?.id ?? null, oyNomi(kunQismlari().oy));
}

async function tarixMatni(): Promise<string> {
  const yozuvlar = await tarix(10);
  if (yozuvlar.length === 0) return "🕘 <b>Tarix hali bo'sh.</b>";

  const s = [`🕘 <b>OXIRGI NAVBATLAR</b>`, AJRATGICH, ``];
  for (const y of yozuvlar) {
    const belgi = y.kechikkan_kun > 0 ? "🔴" : "✅";
    s.push(`${belgi} <b>${y.xona}-xona</b>`);
    s.push(`   📅 ${qisqaSana(y.boshlandi)} → ${y.tasdiqlandi ? qisqaSana(y.tasdiqlandi) : "—"}`);
    s.push(`   🙋 ${esc(y.topshirdi ?? "—")} · 📷 ${y.rasm_soni} rasm`);
    if (y.tasdiqlovchilar.length) {
      s.push(`   ✅ ${y.tasdiqlovchilar.map(esc).join(", ")}`);
    }
    if (y.kechikkan_kun > 0) s.push(`   ⏰ ${y.kechikkan_kun} kun kechikkan`);
    s.push(``);
  }
  return s.join("\n");
}

/**
 * Ko'rinish xabarini chiqaradi va chatni toza tutadi:
 *  - inline tugma bosilgan bo'lsa, shaxsiy chatda o'sha xabarning o'rniga yozadi
 *  - aks holda oldingi ko'rinish xabarini o'chirib, yangisini yuboradi
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function javob(ctx: any, matn: string, extra: Record<string, unknown> = {}): Promise<void> {
  const toza = chekla(matn);
  const bilan = { reply_markup: panelgaKeyboard(), ...extra };

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await guruhgaYubor(ctx.api, toza, bilan);
    return;
  }

  if (ctx.chat.type === "private" && ctx.callbackQuery) {
    const almashdi = await ctx
      .editMessageText(toza, { parse_mode: "HTML", ...bilan })
      .then(() => true)
      .catch(() => false);
    if (almashdi) return;
  }

  await korishXabar(ctx.api, chatId, toza, bilan);
}

export type Korinish =
  | "navbat"
  | "faollik"
  | "tarix"
  | "yigim"
  | "tolov"
  | "profil"
  | "azolar"
  | "tanishtirish"
  | "tanishtirish_matn"
  | "panel";

/**
 * Bir xil ko'rinishlar ikki joydan chaqiriladi: guruhdagi inline paneldan va
 * shaxsiy chatdagi doimiy menyu tugmalaridan. Mantiq shu yerda bitta.
 */
export async function korinish(ctx: Context, nom: Korinish): Promise<void> {
  switch (nom) {
    case "navbat":
      // Shaxsiy chatda navbatdagi xona a'zosi bo'lsa — interaktiv vazifa
      // paneli (tugmalar bilan); guruh panelida esa har doim umumiy,
      // faqat o'qish uchun ko'rinish — tugmalar boshqa a'zolarga
      // ko'rinib qolmasligi kerak (SHIKOYAT_TUGMA bilan bir xil sabab).
      if (ctx.chat?.type === "private") return vazifaPaneliniKorsat(ctx);
      return javob(ctx, await navbatMatni());
    case "faollik":
      return javob(ctx, await faollikMatni_(ctx.from?.id));
    case "tarix":
      return javob(ctx, await tarixMatni());
    case "yigim": {
      const { matn, tugma } = await yigimKorinishMatni(ctx.from?.id);
      return javob(ctx, matn, tugma ? { reply_markup: tugma } : {});
    }
    case "tolov": {
      const { matn, tugma } = await tolovKorinishiniOl(ctx.from?.id);
      return javob(ctx, matn, { reply_markup: tugma });
    }
    case "profil":
      return javob(ctx, await profilMatni(ctx.from?.id));
    case "azolar":
      return javob(ctx, await azolarMatni());
    case "tanishtirish":
      // Avval RASM — bir qarashda hamma tugma. Yuborib bo'lmasa (rasm hali
      // deploy qilinmagan, lokal ishga tushirish) matnli qo'llanmaga qaytamiz.
      if (ctx.chat?.id) {
        const yetdi = await korishRasm(ctx.api, ctx.chat.id, config.qollanmaRasm, qollanmaIzohi(), {
          reply_markup: qollanmaKeyboard(),
        });
        if (yetdi) return;
      }
      return javob(ctx, await tanishtirishMatni(), { reply_markup: panelgaKeyboard() });
    case "tanishtirish_matn":
      // Rasm xabarining matnini tahrirlab bo'lmaydi (u caption) — `javob`
      // tahrirlashga urinib, uddalay olmasa yangi xabar yuboradi.
      return javob(ctx, await tanishtirishMatni(), { reply_markup: panelgaKeyboard() });
    case "panel":
      return javob(ctx, await panelMatni(), { reply_markup: panelKeyboard() });
  }
}

/**
 * Nechta odam borligi va to'liq ro'yxat — hammaga ochiq. Admin buyrug'i
 * /royxat ham shu funksiyani ishlatadi, ikkinchi nusxa yaratilmagan.
 */
export async function azolarMatni(): Promise<string> {
  // `raqam` bo'yicha, `tartib` emas: tartib endi navbat yo'nalishi
  // (4 → 3 → 2 → 1), ro'yxat esa odatdagidek 1-xonadan boshlanishi kerak.
  const rooms = await sql<Room[]>`SELECT * FROM rooms ORDER BY raqam`;

  const [hisob] = await sql<{ jami: number; ulangan: number }[]>`
    SELECT count(*)::int AS jami, count(telegram_id)::int AS ulangan
    FROM users WHERE faol
  `;

  const s = [`👥 <b>A'ZOLAR</b>`, AJRATGICH, ``];
  if (hisob) s.push(`<b>${hisob.ulangan}/${hisob.jami}</b> kishi botga ulangan`, ``);

  for (const r of rooms) {
    const azolar = await xonaAzolari(r.id);
    if (azolar.length === 0) continue;
    s.push(`🚪 <b>${r.raqam}-xona</b>`);
    for (const a of azolar) s.push(`   ${a.telegram_id ? "✅" : "⏳"} ${esc(a.ism)}`);
  }

  s.push(``, AJRATGICH, `<i>✅ = botga ulangan, ⏳ = hali /start bosmagan</i>`);
  return s.join("\n");
}


/**
 * Odamning shaxsiy holati: xonasi, navbat statistikasi va tasdiq kutayotgan
 * ishlari.
 *
 * Ilgari bu ekran ball va reyting o'rni atrofida qurilgan edi. Ball tizimi
 * olib tashlangach undan "kim, qayerda, navbati qanday o'tgan" qoldi —
 * ya'ni baho emas, holat. Raqamlar baribir TARIXDAN qayta hisoblanadi,
 * `users` da yig'indi ustun yo'q ("agregat ustun saqlanmaydi" qoidasi).
 */
async function profilMatni(telegramId: number | undefined): Promise<string> {
  const u = await kim(telegramId);
  if (!u) return "👤 Avval /start bosib ro'yxatdan o'ting.";

  const [xona] = await sql<{ raqam: number }[]>`
    SELECT raqam FROM rooms WHERE id = ${u.room_id}
  `;

  const [n] = await sql<{ jami: number; kechikkan: number; kechikkan_kun: number }[]>`
    SELECT count(*)::int                                        AS jami,
           count(*) FILTER (WHERE t.kechikkan_kun > 0)::int     AS kechikkan,
           COALESCE(SUM(t.kechikkan_kun), 0)::int               AS kechikkan_kun
    FROM turns t
    WHERE t.room_id = ${u.room_id} AND t.holat <> 'faol'
  `;

  const [tasdiq] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM confirmations WHERE user_id = ${u.id}
  `;

  const kutayotgan = await ochiqTopshiriqlar(u.id);

  const royxat = await faollikRoyxati(oyBoshi());
  const meniki = royxat.find((o) => o.userId === u.id);
  const orin = orinlar(royxat).get(u.id);

  const s = [
    `👤 <b>${esc(u.ism).toUpperCase()}</b>`,
    AJRATGICH,
    ``,
    `🏠 ${xona ? `${xona.raqam}-xona` : "xonasiz"}${u.admin ? " · 👑 admin" : ""}`,
    ``,
    AJRATGICH,
  ];

  if (!n || n.jami === 0) {
    s.push(`🧹 <i>Xonangizda hali navbat bo'lmagan.</i>`);
  } else if (n.kechikkan === 0) {
    s.push(`🧹 Navbat — <b>${n.jami} marta</b>, hammasi vaqtida ✅`);
  } else {
    s.push(
      `🧹 Navbat — <b>${n.jami} marta</b>`,
      `🔴 Kechikkani: ${n.kechikkan} marta · ${n.kechikkan_kun} kun`,
    );
  }
  s.push(`✅ Boshqalarning ishini tasdiqlagansiz — <b>${tasdiq?.n ?? 0} marta</b>`);

  // Faollik — baho emas, sanoq (`core/faollik.ts`). Shuning uchun bu yerda
  // ham "ball" so'zi yo'q va o'rin qavs ichida, ikkinchi darajali.
  if (meniki) {
    s.push(
      ``,
      `📊 Faolligingiz: <b>${meniki.oy}</b> ta harakat` +
        (orin ? ` · ${orin}-o'rin` : ``),
      `<i>Butun vaqt davomida: ${meniki.jami} ta</i>`,
    );
  }

  if (kutayotgan.length > 0) {
    s.push(``, AJRATGICH, `⏳ <b>TASDIQ KUTAYOTGAN ${kutayotgan.length} TA ISH</b>`);
    for (const k of kutayotgan) {
      const nom =
        k.tur === "xarajat"
          ? `🛒 ${esc(k.izoh ?? "xarajat")}`
          : k.ish_turi && k.ish_turi in ISH_TURLARI
            ? `${ISH_TURLARI[k.ish_turi as IshTuri].emoji} ${ISH_TURLARI[k.ish_turi as IshTuri].tugma}`
            : "🧹 Navbat ishi";
      s.push(`   ${nom}`);
    }
  }

  return s.join("\n");
}

export function register(bot: Bot) {
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;

    const mavjud = await kim(ctx.from.id);
    if (mavjud) {
      return ctx.reply(await panelMatni(), {
        parse_mode: "HTML",
        reply_markup: menyuKeyboard(mavjud.admin, await joriyNavbatchimi(mavjud.room_id)),
      });
    }

    const bosh = await sql<{ id: number; ism: string }[]>`
      SELECT id, ism FROM users WHERE telegram_id IS NULL AND faol ORDER BY id
    `;
    await ctx.reply(
      [
        `👋 <b>Salom!</b>`,
        AJRATGICH,
        ``,
        `Men <b>Susambil</b> — uyimizdagi tozalash`,
        `navbatini yuritaman va kim qancha ish`,
        `qilganini hisoblab boraman.`,
        ``,
        `Boshlash uchun ro'yxatdan o'zingizni tanlang.`,
        `Ismingiz ro'yxatda bo'lmasa — <b>"Men yangi a'zoman"</b>`,
        `tugmasini bosing.`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: ismTanlashKeyboard(bosh) },
    );
  });

  /** Ro'yxatdan o'tgandan keyin tanishtirish + panel. */
  async function kutibOl(
    ctx: Context,
    ism: string,
    xona: number | null,
    yangimi = false,
    admin = false,
  ) {
    await ctx
      .editMessageText(`✅ <b>Xush kelibsiz, ${esc(ism)}!</b>`, { parse_mode: "HTML" })
      .catch(() => {});
    // Yangi a'zoga avval rasm — uzun matnni birinchi kuni hech kim o'qimaydi.
    const rasmYetdi = ctx.chat
      ? await ctx
          .replyWithPhoto(config.qollanmaRasm, {
            caption: qollanmaIzohi(),
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("📖 Batafsil (matn)", "korish:tanishtirish_matn"),
          })
          .then(() => true)
          .catch(() => false)
      : false;
    if (!rasmYetdi) await ctx.reply(await tanishtirishMatni(), { parse_mode: "HTML" });

    // Bu yerda room_id emas, xona RAQAMI bor — faolNavbat() bilan
    // to'g'ridan-to'g'ri solishtiramiz (joriyNavbatchimi id kutadi).
    const joriy = await faolNavbat();
    const isDutyUser = xona !== null && joriy?.room.raqam === xona;
    await ctx.reply(await panelMatni(), {
      parse_mode: "HTML",
      reply_markup: menyuKeyboard(admin, isDutyUser),
    });

    // Guruh ham bilsin — kim ulangani ko'rinib tursin. To'liq ro'yxat va
    // sanoq endi "👥 A'zolar" ko'rinishida (hammaga ochiq), shuning uchun bu
    // yerda takrorlanmaydi.
    //
    // Ikkinchi darajali: guruh biriktirilmagan bo'lsa yoki bot u yerdan
    // chiqarilgan bo'lsa ham ro'yxatdan o'tish buzilmasligi kerak —
    // guruhgaYubor() xatoni o'zi yutib, log qilib qo'yadi, bu yerda
    // qo'shimcha try/catch shart emas.
    const s = yangimi
      ? [`👋 <b>${esc(ism)}</b> uyga qo'shildi!`]
      : [`✅ <b>${esc(ism)}</b> botga ulandi`];
    if (xona) s.push(`🏠 ${xona}-xona`);
    await guruhgaYubor(ctx.api, s.join("\n"));
  }

  /**
   * ILDIZ SABAB TUZATISH: ilgari "men:<id>" tugmasi bosilgan zahoti profilni
   * darhol egallardi — hech qanday tasdiq yo'q edi. Aynan shu tarzda
   * Sorabek shoshilib "Diyorbek"ni bosib qo'ygan (ikkalasi ham haqiqiy,
   * bo'sh profil edi — xato Telegram identifikatsiyasida emas, inson
   * xatosida edi). Endi bosilganda avval "Siz ISMmisiz?" deb tasdiq
   * so'raladi, faqat "Ha" bosilgach haqiqatan bog'lanadi.
   */
  bot.callbackQuery(/^men:(\d+)$/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    if (await kim(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "Siz allaqachon ro'yxatdasiz." });
    }

    const [nomzod] = await sql<{ ism: string }[]>`
      SELECT ism FROM users WHERE id = ${userId} AND telegram_id IS NULL
    `;
    if (!nomzod) {
      return ctx.answerCallbackQuery({ text: "Bu ismni boshqa kimdir olib bo'lgan.", show_alert: true });
    }

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx
      .editMessageText(`❓ <b>Siz ${esc(nomzod.ism)}misiz?</b>`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("✅ Ha, bu men", `mentasdiq:${userId}`)
          .text("❌ Yo'q, orqaga", "menortga"),
      })
      .catch(() => {});
  });

  bot.callbackQuery("menortga", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const bosh = await sql<{ id: number; ism: string }[]>`
      SELECT id, ism FROM users WHERE telegram_id IS NULL AND faol ORDER BY id
    `;
    await ctx
      .editMessageText(`👋 <b>Ismingizni ro'yxatdan tanlang.</b>`, {
        parse_mode: "HTML",
        reply_markup: ismTanlashKeyboard(bosh),
      })
      .catch(() => {});
  });

  bot.callbackQuery(/^mentasdiq:(\d+)$/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    if (await kim(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "Siz allaqachon ro'yxatdasiz." });
    }

    // Xona alohida olinadi: UPDATE ... FROM rooms bo'lsa xonasiz odam
    // umuman yangilanmay qolardi (room_id NULL bo'lishi mumkin).
    const natija = await sql<{ ism: string; room_id: number | null; admin: boolean }[]>`
      UPDATE users
      SET telegram_id = ${ctx.from.id}, username = ${ctx.from.username ?? null}
      WHERE id = ${userId} AND telegram_id IS NULL
      RETURNING ism, room_id, admin
    `;
    if (natija.length === 0) {
      return ctx.answerCallbackQuery({
        text: "Bu ismni boshqa kimdir olib bo'lgan.",
        show_alert: true,
      });
    }

    const [xona] = await sql<{ raqam: number }[]>`
      SELECT raqam FROM rooms WHERE id = ${natija[0]!.room_id}
    `;

    await ctx.answerCallbackQuery({ text: "Qabul qilindi!" }).catch(() => {});
    await kutibOl(ctx, natija[0]!.ism, xona?.raqam ?? null, false, natija[0]!.admin);
  });

  bot.callbackQuery("yangiazo", async (ctx) => {
    if (await kim(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "Siz allaqachon ro'yxatdasiz." });
    }
    await ctx.answerCallbackQuery().catch(() => {});
    const holat = { tur: "royxat", qadam: "ism" } as const;
    await holatOrnat(ctx.from.id, holat);

    const xabar = await ctx
      .editMessageText(`✍️ <b>Ismingizni yozing</b>\n\n<i>Masalan: Sardor</i>`, {
        parse_mode: "HTML",
      })
      .catch(() => null);

    if (xabar && typeof xabar !== "boolean") {
      await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
    }
  });

  bot.callbackQuery(/^yangixona:(\d+)$/, async (ctx) => {
    const raqam = Number(ctx.match[1]);
    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "royxat" || holat.qadam !== "xona") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. /start dan boshlang." });
    }

    const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE raqam = ${raqam}`;
    if (!room) return ctx.answerCallbackQuery({ text: "Bunday xona yo'q." });

    await sql`
      INSERT INTO users (ism, telegram_id, username, room_id)
      VALUES (${holat.ism}, ${ctx.from.id}, ${ctx.from.username ?? null}, ${room.id})
    `;
    await holatTozala(ctx.from.id);

    await ctx.answerCallbackQuery({ text: "Qo'shildingiz!" }).catch(() => {});
    // Guruhga xabarni kutibOl yuboradi — bu yerda takrorlanmasin
    await kutibOl(ctx, holat.ism, raqam, true);
  });

  bot.callbackQuery("bekor", async (ctx) => {
    const holat = await holatOl(ctx.from.id);
    await holatTozala(ctx.from.id);
    await ctx.answerCallbackQuery({ text: "Bekor qilindi" }).catch(() => {});

    // So'rov xabarini butunlay o'chiramiz — "bekor qilindi" ham qolmasin
    if (holat?.sorov) {
      const ochdi = await ctx.api
        .deleteMessage(holat.sorov.chatId, holat.sorov.msgId)
        .then(() => true)
        .catch(() => false);
      if (ochdi) return;
    }
    await ctx.deleteMessage().catch(() => ctx.editMessageText("✖️ Bekor qilindi."));
  });

  bot.command("navbat", async (ctx) => {
    if (ctx.chat.type === "private") return vazifaPaneliniKorsat(ctx);
    return ctx.reply(await navbatMatni(), { parse_mode: "HTML" });
  });
  bot.command("tarix", async (ctx) => ctx.reply(await tarixMatni(), { parse_mode: "HTML" }));
  bot.command("faollik", async (ctx) =>
    ctx.reply(await faollikMatni_(ctx.from?.id), { parse_mode: "HTML" }),
  );

  bot.command("panel", async (ctx) => {
    const u = await kim(ctx.from?.id);
    if (!u?.admin) return;
    if (ctx.chat.type === "private") {
      return ctx.reply(await panelMatni(), {
        parse_mode: "HTML",
        reply_markup: menyuKeyboard(u.admin, await joriyNavbatchimi(u.room_id)),
      });
    }
    await guruhIdOrnat(ctx.chat.id);
    const xabar = await ctx.reply(await panelMatni(), {
      parse_mode: "HTML",
      reply_markup: panelKeyboard(),
    });
    await ctx.api.pinChatMessage(ctx.chat.id, xabar.message_id).catch(() => {});
  });

  // Admin guruhda /qollanma yozsa — rasm guruhga chiqadi va pin qilinadi
  // (panel pin'i bilan birga turadi). Shaxsiy chatda — o'ziga ko'rsatadi.
  bot.command("qollanma", async (ctx) => {
    const u = await kim(ctx.from?.id);
    if (ctx.chat.type === "private") return korinish(ctx, "tanishtirish");
    if (!u?.admin) return;
    const xabar = await ctx
      .replyWithPhoto(config.qollanmaRasm, { caption: qollanmaIzohi(), parse_mode: "HTML" })
      .catch(() => null);
    if (!xabar) return ctx.reply("⚠️ Rasmni yuborib bo'lmadi — deploy qilinganmi?");
    await ctx.api.pinChatMessage(ctx.chat.id, xabar.message_id, { disable_notification: true }).catch(() => {});
  });

  bot.command("id", async (ctx) => {
    const u = await kim(ctx.from?.id);
    if (!u?.admin) return;
    await ctx.reply(`Bu chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: "HTML" });
    if (ctx.chat.type !== "private") {
      await guruhIdOrnat(ctx.chat.id);
      await ctx.reply("✅ Shu guruh asosiy guruh sifatida saqlandi.");
    }
  });

  // "tolov" ataylab bu yerda yo'q — u faqat shaxsiy chatdagi doimiy
  // menyudan to'g'ridan-to'g'ri korinish() chaqiradi (guruh paneliga
  // qo'shilmagan, chunki "To'lov qilish" oqimi shaxsiy suhbatda o'tishi
  // shart — SHIKOYAT_TUGMA bilan bir xil sabab).
  const korishlar = "navbat|faollik|tarix|yigim|profil|azolar|tanishtirish_matn|tanishtirish|panel";
  bot.callbackQuery(new RegExp(`^korish:(${korishlar})$`), async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await korinish(ctx, ctx.match[1] as Korinish);
  });

  bot.command("xonatanla", async (ctx) => {
    const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
    await ctx.reply("🚪 Qaysi xonada turasiz?", {
      reply_markup: xonaTanlashKeyboard(xonalar.map((x) => x.raqam)),
    });
  });
}

export { navbatMatni, tarixMatni };
