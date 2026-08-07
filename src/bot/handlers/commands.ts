import type { Bot, Api, Context } from "grammy";
import { sql, type Room } from "../../db/index.js";
import { config, ISH_TURLARI, BALLAR } from "../../config.js";
import { faolNavbat, keyingiXona, xonaAzolari } from "../../core/rotation.js";
import { reyting, xonaHolati, tarix } from "../../core/rating.js";
import { oxirgiXarajatlar, xarajatReytingi } from "../../core/expenses.js";
import { guruhId, guruhIdOrnat, kim, korishXabar } from "../group.js";
import {
  ismTanlashKeyboard,
  panelKeyboard,
  panelgaKeyboard,
  xonaTanlashKeyboard,
  xarajatQoshishKeyboard,
} from "../keyboards.js";
import {
  AJRATGICH, chekla, esc, ismlar, muddatHolati, navbatXabari, pul, qisqaSana, sana, tanishtirish,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat } from "../state.js";
import { xarajatniBoshla } from "./expense.js";

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

  const keyingi = await keyingiXona(n.room);
  const keyingiAzolar = await xonaAzolari(keyingi.id);

  return (
    navbatXabari(n.room, n.azolar, n.turn.muddat) +
    `\n\n➡️ <b>Keyingi:</b> ${keyingi.raqam}-xona\n` +
    `   👥 ${esc(ismlar(keyingiAzolar))}`
  );
}

async function xarajatMatni(): Promise<string> {
  const top = await xarajatReytingi(oyBoshi());
  const oxirgi = await oxirgiXarajatlar(8);

  const s = [`🛒 <b>UYGA OLIB KELINGANLAR</b>`, AJRATGICH, ``];

  if (top.length === 0) {
    s.push(`🤷 <i>Shu oyda hali hech kim hech narsa</i>`, `<i>olib kelmagan.</i>`);
  } else {
    s.push(`🏆 <b>Shu oylik reyting</b>`);
    for (const [i, x] of top.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? "▫️";
      s.push(`${medal} ${esc(x.ism)} — ${x.soni} marta · <b>${x.soni * BALLAR.xarajat} ball</b>`);
    }
  }

  if (oxirgi.length > 0) {
    s.push(``, `📦 <b>Oxirgi olib kelinganlar</b>`);
    for (const x of oxirgi) {
      s.push(`• ${esc(x.izoh)}`, `   👤 ${esc(x.ism)} · 📅 ${qisqaSana(x.created_at)}`);
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

async function reytingMatni(): Promise<string> {
  const dan = oyBoshi();
  const odamlar = await reyting(dan);
  const xonalar = await xonaHolati(dan);

  const s: string[] = [`🏆 <b>REYTING — ${oyNomi()}</b>`, AJRATGICH, ``];

  // 1) Umumiy ball
  const jamiBoyicha = [...odamlar].sort((a, b) => b.jami - a.jami);
  s.push(`🥇 <b>UMUMIY BALL</b>`, AJRATGICH);
  if ((jamiBoyicha[0]?.jami ?? 0) === 0) {
    s.push(`🤷 <i>Shu oyda hali ball yig'ilmagan.</i>`);
  } else {
    for (const [i, o] of jamiBoyicha.entries()) {
      if (o.jami === 0) continue;
      const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
      s.push(`${medal} ${esc(o.ism)} — <b>${o.jami}</b> ball`);
    }
  }

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
  const ishBoyicha = odamlar
    .filter((o) => o.musor + o.hammom + o.oshxona > 0)
    .sort((a, b) => b.ishBall - a.ishBall);
  s.push(``, `♻️ <b>QO'SHIMCHA ISHLAR</b>`, AJRATGICH);
  if (ishBoyicha.length === 0) {
    s.push(`🤷 <i>hali hech kim belgilamagan</i>`);
  } else {
    for (const [i, o] of ishBoyicha.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? "▫️";
      s.push(
        `${medal} ${esc(o.ism)} — <b>${o.ishBall}</b> ball`,
        `   ${ISH_TURLARI.musor.emoji}${o.musor}  ${ISH_TURLARI.hammom.emoji}${o.hammom}  ${ISH_TURLARI.oshxona.emoji}${o.oshxona}`,
      );
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

async function guruhgaChiqar(api: Api, matn: string, extra: object = {}) {
  const chatId = await guruhId();
  if (chatId) await api.sendMessage(chatId, matn, { parse_mode: "HTML", ...extra });
}

export function register(bot: Bot) {
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;

    const mavjud = await kim(ctx.from.id);
    if (mavjud && ctx.match === "xarajat") return xarajatniBoshla(ctx);
    if (mavjud) {
      return ctx.reply(await panelMatni(), {
        parse_mode: "HTML",
        reply_markup: panelKeyboard(),
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
  async function kutibOl(ctx: Context, ism: string) {
    await ctx
      .editMessageText(`✅ <b>Xush kelibsiz, ${esc(ism)}!</b>`, { parse_mode: "HTML" })
      .catch(() => {});
    await ctx.reply(tanishtirish(), { parse_mode: "HTML" });
    await ctx.reply(await panelMatni(), { parse_mode: "HTML", reply_markup: panelKeyboard() });
  }

  bot.callbackQuery(/^men:(\d+)$/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    if (await kim(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "Siz allaqachon ro'yxatdasiz." });
    }

    const natija = await sql<{ ism: string }[]>`
      UPDATE users
      SET telegram_id = ${ctx.from.id}, username = ${ctx.from.username ?? null}
      WHERE id = ${userId} AND telegram_id IS NULL
      RETURNING ism
    `;
    if (natija.length === 0) {
      return ctx.answerCallbackQuery({
        text: "Bu ismni boshqa kimdir olib bo'lgan.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({ text: "Qabul qilindi!" }).catch(() => {});
    await kutibOl(ctx, natija[0]!.ism);
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
    await kutibOl(ctx, `${holat.ism} (${raqam}-xona)`);
    await guruhgaChiqar(ctx.api, `👋 <b>${esc(holat.ism)}</b> ${raqam}-xonaga qo'shildi!`);
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

  bot.command("navbat", async (ctx) => ctx.reply(await navbatMatni(), { parse_mode: "HTML" }));
  bot.command("reyting", async (ctx) => ctx.reply(await reytingMatni(), { parse_mode: "HTML" }));
  bot.command("tarix", async (ctx) => ctx.reply(await tarixMatni(), { parse_mode: "HTML" }));

  bot.command("panel", async (ctx) => {
    const u = await kim(ctx.from?.id);
    if (!u?.admin) return;
    if (ctx.chat.type === "private") {
      return ctx.reply(await panelMatni(), { parse_mode: "HTML", reply_markup: panelKeyboard() });
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

  /**
   * Ko'rinish xabarini chiqaradi va chatni toza tutadi:
   *  - shaxsiy chatda tugma bosilgan xabarning o'rniga yozadi
   *  - guruhda esa oldingi ko'rinish xabarini o'chirib, yangisini yuboradi
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function javob(ctx: any, matn: string, extra: Record<string, unknown> = {}) {
    const toza = chekla(matn);
    const bilan = { reply_markup: panelgaKeyboard(), ...extra };

    const chatId = ctx.chat?.id;
    if (!chatId) return guruhgaChiqar(ctx.api, toza, bilan);

    if (ctx.chat.type === "private" && ctx.callbackQuery) {
      const almashdi = await ctx
        .editMessageText(toza, { parse_mode: "HTML", ...bilan })
        .then(() => true)
        .catch(() => false);
      if (almashdi) return;
    }

    await korishXabar(ctx.api, chatId, toza, bilan);
  }

  bot.callbackQuery("korish:navbat", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await javob(ctx, await navbatMatni());
  });
  bot.callbackQuery("korish:reyting", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await javob(ctx, await reytingMatni());
  });
  bot.callbackQuery("korish:tarix", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await javob(ctx, await tarixMatni());
  });
  bot.callbackQuery("korish:xarajat", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const nom = ctx.me?.username;
    await javob(ctx, await xarajatMatni(), nom ? { reply_markup: xarajatQoshishKeyboard(nom) } : {});
  });
  bot.callbackQuery("korish:tanishtirish", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await javob(ctx, tanishtirish(), { reply_markup: panelgaKeyboard() });
  });
  bot.callbackQuery("korish:panel", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await javob(ctx, await panelMatni(), { reply_markup: panelKeyboard() });
  });

  bot.command("xonatanla", async (ctx) => {
    const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
    await ctx.reply("🚪 Qaysi xonada turasiz?", {
      reply_markup: xonaTanlashKeyboard(xonalar.map((x) => x.raqam)),
    });
  });
}

export { navbatMatni, reytingMatni, tarixMatni, xarajatMatni };
