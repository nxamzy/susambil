import type { Bot, Api } from "grammy";
import { sql, type Room } from "../../db/index.js";
import { config, ISH_TURLARI, BALLAR } from "../../config.js";
import { faolNavbat, keyingiXona, xonaAzolari } from "../../core/rotation.js";
import { reyting, xonaHolati, tarix } from "../../core/rating.js";
import { oxirgiXarajatlar, xarajatReytingi } from "../../core/expenses.js";
import { guruhId, guruhIdOrnat, kim } from "../group.js";
import {
  ismTanlashKeyboard,
  panelKeyboard,
  xonaTanlashKeyboard,
  xarajatQoshishKeyboard,
} from "../keyboards.js";
import { esc, ismlar, navbatXabari, pul, qisqaSana } from "../text.js";
import { holatOrnat, holatTozala } from "../state.js";
import { xarajatniBoshla } from "./expense.js";

const CHIZIQ = "━━━━━━━━━━━━━━";

function oyBoshi(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function panelMatni(): Promise<string> {
  const n = await faolNavbat();
  const bosh = n
    ? `🧹 Hozir navbat: <b>${n.room.raqam}-xona</b> — ${esc(ismlar(n.azolar))}`
    : "🧹 Hozircha navbat boshlanmagan.";

  return [
    "🏠 <b>Uy paneli</b>",
    "",
    bosh,
    "",
    "Biror ish qilsangiz pastdagi tugmani bosing — rasm so'rayman va ball qo'shaman.",
    `Tozalash navbatingiz kelsa guruhga <b>${config.minRasm} ta rasm</b> tashlang.`,
  ].join("\n");
}

async function navbatMatni(): Promise<string> {
  const n = await faolNavbat();
  if (!n) return "Hozircha navbat boshlanmagan. Admin /navbatboshla bersin.";

  const keyingi = await keyingiXona(n.room);
  const keyingiAzolar = await xonaAzolari(keyingi.id);

  return (
    navbatXabari(n.room, n.azolar, n.turn.muddat) +
    `\n\n➡️ <b>Keyingi:</b> ${keyingi.raqam}-xona — ${esc(ismlar(keyingiAzolar))}`
  );
}

async function xarajatMatni(): Promise<string> {
  const top = await xarajatReytingi(oyBoshi());
  const oxirgi = await oxirgiXarajatlar(8);

  const satrlar = ["🛒 <b>Uyga olib kelinganlar</b>", ""];

  if (top.length === 0) {
    satrlar.push("<i>Shu oyda hali hech kim hech narsa olib kelmagan.</i>");
  } else {
    satrlar.push("<b>Shu oylik reyting:</b>");
    for (const [i, x] of top.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? "▫️";
      satrlar.push(`${medal} ${esc(x.ism)} — ${x.soni} marta (${x.soni * BALLAR.xarajat} ball)`);
    }
  }

  if (oxirgi.length > 0) {
    satrlar.push("", "<b>Oxirgi olib kelinganlar:</b>");
    for (const x of oxirgi) {
      satrlar.push(`• ${esc(x.izoh)} — ${esc(x.ism)}, ${qisqaSana(x.created_at)}`);
    }
  }

  satrlar.push(
    "",
    CHIZIQ,
    `<b>Nimadir sotib oldingizmi?</b>`,
    `Pastdagi tugmani bosing — rasm va nomini so'rayman, <b>+${BALLAR.xarajat} ball</b> qo'shiladi.`,
  );
  return satrlar.join("\n");
}

async function reytingMatni(): Promise<string> {
  const dan = oyBoshi();
  const odamlar = await reyting(dan);
  const xonalar = await xonaHolati(dan);

  const s: string[] = ["🏆 <b>REYTING</b> — shu oy", ""];

  // 1) Umumiy ball
  const jamiBoyicha = [...odamlar].sort((a, b) => b.jami - a.jami);
  s.push(`${CHIZIQ}\n<b>Umumiy ball</b>\n${CHIZIQ}`);
  if ((jamiBoyicha[0]?.jami ?? 0) === 0) {
    s.push("<i>Shu oyda hali ball yig'ilmagan.</i>");
  } else {
    for (const [i, o] of jamiBoyicha.entries()) {
      if (o.jami === 0) continue;
      const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
      s.push(`${medal} ${esc(o.ism)} — <b>${o.jami}</b> ball`);
    }
  }

  // 2) Xonalar intizomi
  s.push("", `${CHIZIQ}\n<b>🧹 Tozalash navbatlari</b>\n${CHIZIQ}`);
  for (const x of xonalar) {
    if (x.navbat === 0) {
      s.push(`${x.xona}-xona (${x.azoSoni} kishi) — hali navbat bo'lmagan`);
      continue;
    }
    const holat =
      x.kechikkan === 0
        ? `✅ ${x.navbat} marta, hammasi vaqtida`
        : `🔴 ${x.navbat} marta, ${x.kechikkan} tasi kech (${x.kechikkanKun} kun · ${pul(x.jarima)})`;
    s.push(`${x.xona}-xona (${x.azoSoni} kishi) — ${holat}`);
  }

  // 3) Qo'shimcha ishlar
  const ishBoyicha = odamlar
    .filter((o) => o.musor + o.hammom + o.oshxona > 0)
    .sort((a, b) => b.ishBall - a.ishBall);
  s.push("", `${CHIZIQ}\n<b>♻️ Qo'shimcha ishlar</b>\n${CHIZIQ}`);
  if (ishBoyicha.length === 0) {
    s.push("<i>hali hech kim belgilamagan</i>");
  } else {
    for (const o of ishBoyicha) {
      s.push(
        `${esc(o.ism)} — ♻️${o.musor} 🚿${o.hammom} 🍽${o.oshxona} = <b>${o.ishBall}</b> ball`,
      );
    }
  }

  // 4) Olib kelinganlar
  const xarajatBoyicha = odamlar.filter((o) => o.xarajat > 0).sort((a, b) => b.xarajat - a.xarajat);
  s.push("", `${CHIZIQ}\n<b>🛒 Uyga olib kelganlar</b>\n${CHIZIQ}`);
  if (xarajatBoyicha.length === 0) {
    s.push("<i>hali hech kim olib kelmagan</i>");
  } else {
    for (const o of xarajatBoyicha) {
      s.push(`${esc(o.ism)} — ${o.xarajat} marta = <b>${o.xarajatBall}</b> ball`);
    }
  }

  // 5) Tasdiqlashlar
  const tasdiqBoyicha = odamlar.filter((o) => o.tasdiq > 0).sort((a, b) => b.tasdiq - a.tasdiq);
  if (tasdiqBoyicha.length > 0) {
    s.push("", `${CHIZIQ}\n<b>✅ Boshqalarning ishini tasdiqlaganlar</b>\n${CHIZIQ}`);
    for (const o of tasdiqBoyicha) s.push(`${esc(o.ism)} — ${o.tasdiq} marta`);
  }

  // 6) Ball jadvali
  s.push(
    "",
    `${CHIZIQ}\n<b>Ball qanday beriladi</b>\n${CHIZIQ}`,
    `🧹 Tozalash navbati — ${BALLAR.navbatXona} ball xonaga, a'zolar soniga bo'linadi`,
    `   <i>2 kishilik xona → ${Math.round(BALLAR.navbatXona / 2)}, 4 kishilik → ${Math.round(BALLAR.navbatXona / 4)}</i>`,
    `   vaqtida tugatsa +${BALLAR.vaqtidaBonus}, kechiksa har kun −${BALLAR.kechikishJarima}`,
    `🚿 Hammom / 🍽 Oshxona — ${ISH_TURLARI.hammom.ball} ball`,
    `♻️ Musor — ${ISH_TURLARI.musor.ball} ball`,
    `🛒 Uyga narsa olib kelish — ${BALLAR.xarajat} ball`,
    `✅ Tasdiqlash — ${BALLAR.tasdiq} ball`,
  );

  return s.join("\n");
}

async function tarixMatni(): Promise<string> {
  const yozuvlar = await tarix(10);
  if (yozuvlar.length === 0) return "🕘 Tarix hali bo'sh.";

  const s = ["🕘 <b>Oxirgi navbatlar</b>", ""];
  for (const y of yozuvlar) {
    const belgi = y.kechikkan_kun > 0 ? "🔴" : "✅";
    s.push(
      `${belgi} <b>${y.xona}-xona</b> · ${qisqaSana(y.boshlandi)} → ` +
        `${y.tasdiqlandi ? qisqaSana(y.tasdiqlandi) : "—"}`,
    );
    s.push(
      `   Yuklagan: ${esc(y.topshirdi ?? "—")} · ${y.rasm_soni} rasm · ` +
        `tasdiq: ${y.tasdiqlovchilar.length ? y.tasdiqlovchilar.map(esc).join(", ") : "—"}` +
        (y.kechikkan_kun > 0 ? ` · ${y.kechikkan_kun} kun kech` : ""),
    );
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
      "Salom! Ro'yxatdan o'zingizni tanlang.\n\n" +
        "<i>Ismingiz ro'yxatda bo'lmasa — pastdagi \"Men yangi a'zoman\" tugmasini bosing.</i>",
      { parse_mode: "HTML", reply_markup: ismTanlashKeyboard(bosh) },
    );
  });

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
    await ctx
      .editMessageText(`✅ Xush kelibsiz, <b>${esc(natija[0]!.ism)}</b>!`, { parse_mode: "HTML" })
      .catch(() => {});
    await ctx.reply(await panelMatni(), { parse_mode: "HTML", reply_markup: panelKeyboard() });
  });

  bot.callbackQuery("yangiazo", async (ctx) => {
    if (await kim(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "Siz allaqachon ro'yxatdasiz." });
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await holatOrnat(ctx.from.id, { tur: "royxat", qadam: "ism" });
    await ctx.editMessageText("✍️ Ismingizni yozing:").catch(() => {});
  });

  bot.callbackQuery(/^yangixona:(\d+)$/, async (ctx) => {
    const raqam = Number(ctx.match[1]);
    const { holatOl } = await import("../state.js");
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
    await ctx
      .editMessageText(
        `✅ <b>${esc(holat.ism)}</b> — ${raqam}-xonaga qo'shildingiz.`,
        { parse_mode: "HTML" },
      )
      .catch(() => {});
    await ctx.reply(await panelMatni(), { parse_mode: "HTML", reply_markup: panelKeyboard() });

    await guruhgaChiqar(
      ctx.api,
      `👋 <b>${esc(holat.ism)}</b> ${raqam}-xonaga qo'shildi.`,
    );
  });

  bot.callbackQuery("bekor", async (ctx) => {
    await holatTozala(ctx.from.id);
    await ctx.answerCallbackQuery({ text: "Bekor qilindi" }).catch(() => {});
    await ctx.editMessageText("✖️ Bekor qilindi.").catch(() => {});
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
    await javob(ctx, await xarajatMatni(), {
      reply_markup: xarajatQoshishKeyboard(ctx.me.username),
    });
  });

  /** Tugma qayerda bosilgan bo'lsa, javob ham o'sha yerga. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function javob(ctx: any, matn: string, extra: object = {}) {
    if (ctx.chat) {
      await ctx.reply(matn, { parse_mode: "HTML", ...extra });
    } else {
      await guruhgaChiqar(ctx.api, matn, extra);
    }
  }

  // Yangi a'zo xona tanlashi uchun (bekor qilingandan keyin qayta chiqarish)
  bot.command("xonatanla", async (ctx) => {
    const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
    await ctx.reply("Qaysi xonada turasiz?", {
      reply_markup: xonaTanlashKeyboard(xonalar.map((x) => x.raqam)),
    });
  });
}

export { navbatMatni, reytingMatni, tarixMatni, xarajatMatni };
