import type { Bot, Api } from "grammy";
import { sql } from "../../db/index.js";
import { config } from "../../config.js";
import { faolNavbat, keyingiXona, xonaAzolari } from "../../core/rotation.js";
import { balanslar, pul } from "../../core/kassa.js";
import { odamReytingi, xonaReytingi, tarix } from "../../core/rating.js";
import { guruhId, guruhIdOrnat, kim } from "../group.js";
import { ismTanlashKeyboard, panelKeyboard } from "../keyboards.js";
import { esc, ismlar, navbatXabari, qisqaSana, sana } from "../text.js";

async function navbatMatni(): Promise<string> {
  const n = await faolNavbat();
  if (!n) return "Hozircha navbat boshlanmagan. Admin /navbatboshla buyrug'ini bersin.";

  const keyingi = await keyingiXona(n.room);
  const keyingiAzolar = await xonaAzolari(keyingi.id);

  return (
    navbatXabari(n.room, n.azolar, n.turn.muddat) +
    `\n\n➡️ <b>Keyingi:</b> ${keyingi.raqam}-xona — ${esc(ismlar(keyingiAzolar))}`
  );
}

async function kassaMatni(): Promise<string> {
  const b = await balanslar();
  if (b.length === 0) return "Kassa bo'sh.";

  const qatorlar = b.map((x) => {
    const belgi = x.balans > 0 ? "🟢" : x.balans < 0 ? "🔴" : "⚪️";
    const izoh = x.balans > 0 ? "olishi kerak" : x.balans < 0 ? "qarzdor" : "tenglik";
    return `${belgi} ${esc(x.ism)} (${x.xona ?? "?"}-xona) — ${pul(Math.abs(x.balans))} ${izoh}`;
  });

  const jami = b.reduce((s, x) => s + x.balans, 0);
  return [
    "💰 <b>Kassa holati</b>",
    "",
    ...qatorlar,
    "",
    `<i>Umumiy farq: ${pul(jami)}</i>`,
    `<i>🔴 = kassaga qarzdor, 🟢 = kassadan olishi kerak</i>`,
  ].join("\n");
}

async function reytingMatni(): Promise<string> {
  const oyBoshi = new Date();
  oyBoshi.setDate(1);
  oyBoshi.setHours(0, 0, 0, 0);

  const odamlar = await odamReytingi(oyBoshi);
  const xonalar = await xonaReytingi(oyBoshi);

  const qoshimcha = odamlar
    .map((o) => ({ ...o, jami: o.musor + o.hammom + o.oshxona }))
    .sort((a, b) => b.jami - a.jami);

  const eng = qoshimcha.filter((o) => o.jami > 0).slice(0, 5);

  const satrlar = ["🏆 <b>Shu oylik reyting</b>", "", "<b>Qo'shimcha ishlar:</b>"];
  if (eng.length === 0) {
    satrlar.push("<i>hali hech kim belgilamagan</i>");
  } else {
    for (const [i, o] of eng.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? "▫️";
      satrlar.push(
        `${medal} ${esc(o.ism)} — ${o.jami} ta ` +
          `(♻️${o.musor} 🚿${o.hammom} 🍽${o.oshxona})`,
      );
    }
  }

  satrlar.push("", "<b>Xonalar intizomi:</b>");
  for (const x of xonalar) {
    const holat =
      x.navbat === 0 ? "navbat bo'lmagan"
      : x.kechikkan === 0 ? "✅ doim vaqtida"
      : `🔴 ${x.kechikkan} marta kechikdi, jami ${x.kechikkan_kun} kun`;
    satrlar.push(`${x.xona}-xona — ${holat}`);
  }

  return satrlar.join("\n");
}

async function tarixMatni(): Promise<string> {
  const yozuvlar = await tarix(10);
  if (yozuvlar.length === 0) return "🕘 Tarix hali bo'sh.";

  const satrlar = ["🕘 <b>Oxirgi 10 navbat</b>", ""];
  for (const y of yozuvlar) {
    const belgi = y.kechikkan_kun > 0 ? "🔴" : "✅";
    satrlar.push(
      `${belgi} <b>${y.xona}-xona</b> · ${qisqaSana(y.boshlandi)} → ` +
        `${y.tasdiqlandi ? qisqaSana(y.tasdiqlandi) : "—"}`,
    );
    satrlar.push(
      `   Yuklagan: ${esc(y.topshirdi ?? "—")} · ${y.rasm_soni} rasm · ` +
        `tasdiq: ${y.tasdiqlovchilar.length ? y.tasdiqlovchilar.map(esc).join(", ") : "—"}` +
        (y.kechikkan_kun > 0 ? ` · ${y.kechikkan_kun} kun kech` : ""),
    );
  }
  return satrlar.join("\n");
}

async function guruhgaChiqar(api: Api, matn: string) {
  const chatId = await guruhId();
  if (chatId) await api.sendMessage(chatId, matn, { parse_mode: "HTML" });
}

export function register(bot: Bot) {
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const mavjud = await kim(ctx.from?.id);
    if (mavjud) {
      return ctx.reply(
        `Salom, <b>${esc(mavjud.ism)}</b>! Siz allaqachon ro'yxatdasiz.\n\n` +
          `Buyruqlar: /navbat /kassa /reyting /tarix /xarajat`,
        { parse_mode: "HTML" },
      );
    }

    const bosh = await sql<{ id: number; ism: string }[]>`
      SELECT id, ism FROM users WHERE telegram_id IS NULL AND faol ORDER BY id
    `;
    if (bosh.length === 0) {
      return ctx.reply("Ro'yxatda bo'sh ism qolmadi. Admin bilan gaplashing.");
    }

    await ctx.reply("Ro'yxatdan o'zingizni tanlang:", {
      reply_markup: ismTanlashKeyboard(bosh),
    });
  });

  bot.callbackQuery(/^men:(\d+)$/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    const band = await kim(ctx.from.id);
    if (band) return ctx.answerCallbackQuery({ text: "Siz allaqachon ro'yxatdasiz." });

    const natija = await sql<{ ism: string }[]>`
      UPDATE users
      SET telegram_id = ${ctx.from.id}, username = ${ctx.from.username ?? null}
      WHERE id = ${userId} AND telegram_id IS NULL
      RETURNING ism
    `;
    if (natija.length === 0) {
      return ctx.answerCallbackQuery({ text: "Bu ismni boshqa kimdir olib bo'lgan.", show_alert: true });
    }

    await ctx.answerCallbackQuery({ text: "Qabul qilindi!" }).catch(() => {});
    await ctx.editMessageText(
      `✅ Xush kelibsiz, <b>${esc(natija[0]!.ism)}</b>!\n\n` +
        `Endi guruhdagi tugmalar siz uchun ishlaydi.`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("navbat", async (ctx) => ctx.reply(await navbatMatni(), { parse_mode: "HTML" }));
  bot.command("kassa", async (ctx) => ctx.reply(await kassaMatni(), { parse_mode: "HTML" }));
  bot.command("reyting", async (ctx) => ctx.reply(await reytingMatni(), { parse_mode: "HTML" }));
  bot.command("tarix", async (ctx) => ctx.reply(await tarixMatni(), { parse_mode: "HTML" }));

  bot.command("id", async (ctx) => {
    await ctx.reply(`Bu chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: "HTML" });
    if (ctx.chat.type !== "private") {
      const u = await kim(ctx.from?.id);
      if (u?.admin) {
        await guruhIdOrnat(ctx.chat.id);
        await ctx.reply("✅ Shu guruh asosiy guruh sifatida saqlandi.");
      }
    }
  });

  bot.command("panel", async (ctx) => {
    const u = await kim(ctx.from?.id);
    if (!u?.admin) return ctx.reply("Bu buyruq faqat admin uchun.");
    if (ctx.chat.type === "private") return ctx.reply("Bu buyruqni guruhda yozing.");

    await guruhIdOrnat(ctx.chat.id);
    const xabar = await ctx.reply(
      [
        "🏠 <b>Uy paneli</b>",
        "",
        "Biror ish qilsangiz — pastdagi tugmani bosing, guruh xabardor bo'ladi.",
        "Tozalash rasmlarini shu guruhga tashlang (kamida " + config.minRasm + " ta).",
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: panelKeyboard() },
    );
    await ctx.api.pinChatMessage(ctx.chat.id, xabar.message_id).catch(() => {});
  });

  bot.callbackQuery("korish:navbat", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await guruhgaChiqar(ctx.api, await navbatMatni());
  });
  bot.callbackQuery("korish:kassa", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await guruhgaChiqar(ctx.api, await kassaMatni());
  });
  bot.callbackQuery("korish:reyting", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await guruhgaChiqar(ctx.api, await reytingMatni());
  });
  bot.callbackQuery("korish:tarix", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await guruhgaChiqar(ctx.api, await tarixMatni());
  });
}

export { navbatMatni, kassaMatni, reytingMatni, tarixMatni };
