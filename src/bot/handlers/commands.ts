import type { Bot, Api, Context } from "grammy";
import { sql, type Room } from "../../db/index.js";
import { config, ISH_TURLARI, NAVBAT_ISHLARI, SEKIN_ISHLAR, BALLAR, type IshTuri } from "../../config.js";
import { ochiqTopshiriqlar } from "../../core/topshiriq.js";
import { faolNavbat, kelgusiTartib, xonaAzolari } from "../../core/rotation.js";
import { reyting, orinlarniHisobla, xonaHolati, tarix } from "../../core/rating.js";
import { jamiXarajat, oxirgiXarajatlar, xarajatReytingi } from "../../core/expenses.js";
import { foydalanuvchiTolovHolati, tolovQabulQiluvchi } from "../../core/tolov.js";
import { guruhgaYubor, guruhId, guruhIdOrnat, kim, korishXabar } from "../group.js";
import {
  boshqaIshKeyboard,
  ismTanlashKeyboard,
  menyuKeyboard,
  panelKeyboard,
  panelgaKeyboard,
  tolovKeyboard,
  xonaTanlashKeyboard,
  xarajatQoshishKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH, chekla, esc, ismlar, muddatHolati, navbatXabari, pul, qisqaSana, reytingRoyxati,
  sana, tanishtirish, tolovKorinishi,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat } from "../state.js";
import { xarajatniBoshla } from "./expense.js";
import { vazifaPaneliniKorsat } from "./navbat.js";

function oyBoshi(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function oyNomi(): string {
  const oylar = ["yanvar", "fevral", "mart", "aprel", "may", "iyun",
    "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  const oy = Number(new Intl.DateTimeFormat("en-US", {
    month: "numeric", timeZone: "Asia/Tashkent",
  }).format(new Date()));
  return oylar[oy - 1] ?? "";
}

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
    `👇 <b>Ish qildingizmi?</b> Tugmani bosing —`,
    `   rasm so'rayman, ball qo'shaman.`,
  ].join("\n");
}

async function navbatMatni(): Promise<string> {
  const n = await faolNavbat();
  if (!n) return "🧹 Hozircha navbat boshlanmagan.";

  const s = [navbatXabari(n.room, n.azolar, n.turn.muddat)];

  s.push(
    ``,
    AJRATGICH,
    `<b>BAJARILISHI KERAK</b>`,
    ...NAVBAT_ISHLARI.map((t) => `   ${ISH_TURLARI[t].emoji} ${ISH_TURLARI[t].nom}`),
    ``,
    `👤 Navbatdagi xona a'zolari botda "Mening Navbatim"`,
    `   orqali har birini alohida belgilaydi.`,
    `✅ <b>${config.kerakliTasdiq} kishi</b> tasdiqlaydi.`,
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

async function xarajatMatni(): Promise<string> {
  const top = await xarajatReytingi(oyBoshi());
  const oxirgi = await oxirgiXarajatlar(8);

  const jami = await jamiXarajat(oyBoshi());

  const s = [`💰 <b>UMUMIY XARAJATLAR</b>`, AJRATGICH, `<i>${oyNomi()} oyi</i>`, ``];

  if (top.length === 0) {
    s.push(`🤷 <i>Shu oyda hali hech kim hech narsa</i>`, `<i>olib kelmagan.</i>`);
  } else {
    for (const [i, x] of top.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? "▫️";
      // Pul va ball ikki xil narsa: summa sarflangan pul, ball esa har bir
      // xarajat uchun bir xil — summaga bog'liq emas.
      s.push(
        `${medal} ${esc(x.ism)} — <b>${x.summa > 0 ? pul(x.summa) : "—"}</b>`,
        `   📦 ${x.soni} marta · 🏅 ${x.soni * BALLAR.xarajat} ball`,
      );
    }
    s.push(``, AJRATGICH, `💵 <b>JAMI: ${pul(jami)}</b>`);
  }

  if (oxirgi.length > 0) {
    s.push(``, `📦 <b>Oxirgi olib kelinganlar</b>`);
    for (const x of oxirgi) {
      const narx = x.summa ? ` — <b>${pul(Number(x.summa))}</b>` : "";
      s.push(`• ${esc(x.izoh)}${narx}`, `   👤 ${esc(x.ism)} · 📅 ${qisqaSana(x.created_at)}`);
    }
  }

  s.push(
    ``,
    AJRATGICH,
    `🛍 <b>Nimadir sotib oldingizmi?</b>`,
    `Pastdagi tugmani bosing — rasm va nomini`,
    `so'rayman, <b>+${BALLAR.xarajat} ball</b> qo'shiladi.`,
  );
  return s.join("\n");
}

async function tolovMatni(telegramId: number | undefined): Promise<string> {
  const u = await kim(telegramId);
  if (!u) return "💳 Avval /start bosib ro'yxatdan o'ting.";
  const qabul = await tolovQabulQiluvchi();
  const holat = await foydalanuvchiTolovHolati(u.id);
  return tolovKorinishi(qabul, holat);
}

async function reytingMatni(telegramId?: number): Promise<string> {
  const dan = oyBoshi();
  const odamlar = await reyting(dan);
  const xonalar = await xonaHolati(dan);

  const men = telegramId ? await kim(telegramId) : null;
  const s = reytingRoyxati(odamlar, men?.id ?? null, oyNomi());

  // 2) Xonalar intizomi
  s.push(``, `🧹 <b>TOZALASH NAVBATLARI</b>`, AJRATGICH);
  for (const x of xonalar) {
    const boshi = `🚪 <b>${x.xona}-xona</b> (${x.azoSoni} kishi)`;
    if (x.navbat === 0) {
      s.push(`${boshi} — <i>navbat bo'lmagan</i>`);
    } else if (x.kechikkan === 0) {
      s.push(`${boshi}`, `   ✅ ${x.navbat} marta, hammasi vaqtida`);
    } else {
      s.push(
        `${boshi}`,
        `   🔴 ${x.navbat} martadan ${x.kechikkan} tasi kech`,
        `   📉 ${x.kechikkanKun} kun · 💸 ${pul(x.jarima)}`,
      );
    }
  }

  // 3) Qo'shimcha ishlar
  const ishBoyicha = odamlar.filter((o) => o.ishSoni > 0).sort((a, b) => b.ishBall - a.ishBall);
  s.push(``, `♻️ <b>QO'SHIMCHA ISHLAR</b>`, AJRATGICH);
  if (ishBoyicha.length === 0) {
    s.push(`🤷 <i>hali hech kim belgilamagan</i>`);
  } else {
    for (const [i, o] of ishBoyicha.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? "▫️";
      const tafsil = (Object.keys(ISH_TURLARI) as IshTuri[])
        .filter((t) => (o.ishlar[t] ?? 0) > 0)
        .map((t) => `${ISH_TURLARI[t].emoji}${o.ishlar[t]}`)
        .join("  ");
      s.push(`${medal} ${esc(o.ism)} — <b>${o.ishBall}</b> ball`, `   ${tafsil}`);
    }
  }

  // 4) Olib kelinganlar
  const xarajatBoyicha = odamlar.filter((o) => o.xarajat > 0).sort((a, b) => b.xarajat - a.xarajat);
  s.push(``, `🛒 <b>UYGA OLIB KELGANLAR</b>`, AJRATGICH);
  if (xarajatBoyicha.length === 0) {
    s.push(`🤷 <i>hali hech kim olib kelmagan</i>`);
  } else {
    for (const [i, o] of xarajatBoyicha.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? "▫️";
      s.push(`${medal} ${esc(o.ism)} — ${o.xarajat} marta · <b>${o.xarajatBall}</b> ball`);
    }
  }

  // 5) Tasdiqlashlar
  const tasdiqBoyicha = odamlar.filter((o) => o.tasdiq > 0).sort((a, b) => b.tasdiq - a.tasdiq);
  if (tasdiqBoyicha.length > 0) {
    s.push(``, `✅ <b>TASDIQLAGANLAR</b>`, AJRATGICH);
    for (const o of tasdiqBoyicha) s.push(`▫️ ${esc(o.ism)} — ${o.tasdiq} marta`);
  }

  s.push(``, AJRATGICH, `ℹ️ <i>Ball qanday hisoblanishini bilish uchun</i>`,
    `<i>paneldagi "Bu bot qanday ishlaydi?" tugmasini bosing.</i>`);

  return s.join("\n");
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
  | "reyting"
  | "tarix"
  | "xarajat"
  | "tolov"
  | "profil"
  | "azolar"
  | "tanishtirish"
  | "boshqaish"
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
    case "reyting":
      return javob(ctx, await reytingMatni(ctx.from?.id));
    case "tarix":
      return javob(ctx, await tarixMatni());
    case "xarajat": {
      const bot = ctx.me?.username;
      return javob(
        ctx,
        await xarajatMatni(),
        bot ? { reply_markup: xarajatQoshishKeyboard(bot) } : {},
      );
    }
    case "tolov":
      return javob(ctx, await tolovMatni(ctx.from?.id), { reply_markup: tolovKeyboard() });
    case "profil":
      return javob(ctx, await profilMatni(ctx.from?.id));
    case "azolar":
      return javob(ctx, await azolarMatni());
    case "boshqaish":
      return javob(ctx, boshqaIshMatni(), { reply_markup: boshqaIshKeyboard() });
    case "tanishtirish":
      return javob(ctx, tanishtirish(), { reply_markup: panelgaKeyboard() });
    case "panel":
      return javob(ctx, await panelMatni(), { reply_markup: panelKeyboard() });
  }
}

/**
 * Nechta odam borligi va to'liq ro'yxat — hammaga ochiq. Admin buyrug'i
 * /royxat ham shu funksiyani ishlatadi, ikkinchi nusxa yaratilmagan.
 */
export async function azolarMatni(): Promise<string> {
  const rooms = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib`;

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

function boshqaIshMatni(): string {
  return [
    `➕ <b>BOSHQA ISH</b>`,
    AJRATGICH,
    ``,
    `Nima qildingiz? Tanlang — keyin rasmini so'rayman.`,
    ``,
    ...SEKIN_ISHLAR.map((t) => `   ${ISH_TURLARI[t].emoji} ${ISH_TURLARI[t].tugma} — <b>+${ISH_TURLARI[t].ball} ball</b>`),
    ``,
    `<i>Har qanday ish guruh tasdig'idan keyin ball beradi.</i>`,
  ].join("\n");
}

/** Odamning shaxsiy holati: shu oylik balli, o'rni va kutib turgan ishlari. */
async function profilMatni(telegramId: number | undefined): Promise<string> {
  const u = await kim(telegramId);
  if (!u) return "👤 Avval /start bosib ro'yxatdan o'ting.";

  const odamlar = (await reyting(oyBoshi())).sort((a, b) => b.jami - a.jami);
  const orin = odamlar.findIndex((o) => o.userId === u.id);
  const men = odamlar[orin];
  if (!men) return "👤 Ma'lumot topilmadi.";

  const [xona] = await sql<{ raqam: number }[]>`
    SELECT raqam FROM rooms WHERE id = ${u.room_id}
  `;
  const kutayotgan = await ochiqTopshiriqlar(u.id);

  const s = [
    `👤 <b>${esc(u.ism).toUpperCase()}</b>`,
    AJRATGICH,
    ``,
    `🏠 ${xona ? `${xona.raqam}-xona` : "xonasiz"}${u.admin ? " · 👑 admin" : ""}`,
    `📅 ${oyNomi()} oyi`,
    ``,
    `🏅 <b>${men.jami} ball</b>`,
    `📊 O'rningiz: <b>${orin + 1}</b> / ${odamlar.length}`,
    ``,
    AJRATGICH,
    `🧹 Navbat — ${men.navbatSoni} marta · <b>${men.navbatBall}</b> ball`,
    `♻️ Qo'shimcha ish — ${men.ishSoni} marta · <b>${men.ishBall}</b> ball`,
    `🛒 Olib kelgan — ${men.xarajat} marta · <b>${men.xarajatBall}</b> ball`,
    `✅ Tasdiqlagan — ${men.tasdiq} marta · <b>${men.tasdiqBall}</b> ball`,
  ];

  if (men.shikoyatBall > 0) {
    s.push(`🔴 Tuzatilmagan shikoyat — ${men.shikoyatSoni} marta · <b>-${men.shikoyatBall}</b> ball`);
  }
  if (men.xarajatSumma > 0) s.push(``, `💰 Uyga sarflagan pulingiz: <b>${pul(men.xarajatSumma)}</b>`);
  if (men.kechikkanKun > 0) s.push(`🔴 Kechikkan: ${men.kechikkanKun} kun`);

  if (kutayotgan.length > 0) {
    s.push(``, AJRATGICH, `⏳ <b>TASDIQ KUTAYOTGAN ${kutayotgan.length} TA ISH</b>`);
    for (const k of kutayotgan) {
      const nom =
        k.tur === "xarajat"
          ? `🛒 ${esc(k.izoh ?? "xarajat")}`
          : k.ish_turi && k.ish_turi in ISH_TURLARI
            ? `${ISH_TURLARI[k.ish_turi as IshTuri].emoji} ${ISH_TURLARI[k.ish_turi as IshTuri].tugma}`
            : "🧹 Navbat ishi";
      s.push(`   ${nom} — <i>+${k.ball} ball kutilmoqda</i>`);
    }
    s.push(`<i>Tasdiqlanmaguncha ball hisobga qo'shilmaydi.</i>`);
  }

  return s.join("\n");
}

export function register(bot: Bot) {
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;

    const mavjud = await kim(ctx.from.id);
    if (mavjud && ctx.match === "xarajat") return xarajatniBoshla(ctx);
    if (mavjud) {
      return ctx.reply(await panelMatni(), {
        parse_mode: "HTML",
        reply_markup: menyuKeyboard(),
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
  async function kutibOl(ctx: Context, ism: string, xona: number | null, yangimi = false) {
    await ctx
      .editMessageText(`✅ <b>Xush kelibsiz, ${esc(ism)}!</b>`, { parse_mode: "HTML" })
      .catch(() => {});
    await ctx.reply(tanishtirish(), { parse_mode: "HTML" });
    await ctx.reply(await panelMatni(), { parse_mode: "HTML", reply_markup: menyuKeyboard() });

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

  bot.callbackQuery(/^men:(\d+)$/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    if (await kim(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "Siz allaqachon ro'yxatdasiz." });
    }

    // Xona alohida olinadi: UPDATE ... FROM rooms bo'lsa xonasiz odam
    // umuman yangilanmay qolardi (room_id NULL bo'lishi mumkin).
    const natija = await sql<{ ism: string; room_id: number | null }[]>`
      UPDATE users
      SET telegram_id = ${ctx.from.id}, username = ${ctx.from.username ?? null}
      WHERE id = ${userId} AND telegram_id IS NULL
      RETURNING ism, room_id
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
    await kutibOl(ctx, natija[0]!.ism, xona?.raqam ?? null);
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
  bot.command("reyting", async (ctx) =>
    ctx.reply(await reytingMatni(ctx.from?.id), { parse_mode: "HTML" }),
  );
  bot.command("tarix", async (ctx) => ctx.reply(await tarixMatni(), { parse_mode: "HTML" }));

  bot.command("panel", async (ctx) => {
    const u = await kim(ctx.from?.id);
    if (!u?.admin) return;
    if (ctx.chat.type === "private") {
      return ctx.reply(await panelMatni(), { parse_mode: "HTML", reply_markup: menyuKeyboard() });
    }
    await guruhIdOrnat(ctx.chat.id);
    const xabar = await ctx.reply(await panelMatni(), {
      parse_mode: "HTML",
      reply_markup: panelKeyboard(),
    });
    await ctx.api.pinChatMessage(ctx.chat.id, xabar.message_id).catch(() => {});
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
  const korishlar = "navbat|reyting|tarix|xarajat|profil|azolar|tanishtirish|boshqaish|panel";
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

export { navbatMatni, reytingMatni, tarixMatni, xarajatMatni };
