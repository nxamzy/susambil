import type { Bot } from "grammy";
import { sql, type Room, type User } from "../../db/index.js";
import { config } from "../../config.js";
import { faolNavbat, navbatniOzgartirish, xonaAzolari } from "../../core/rotation.js";
import { kim } from "../group.js";
import { esc, ismlar, navbatXabari } from "../text.js";

async function adminmi(ctx: { from?: { id: number } }): Promise<User | null> {
  const u = await kim(ctx.from?.id);
  return u?.admin ? u : null;
}

async function odamTop(ism: string): Promise<User | null> {
  const [u] = await sql<User[]>`
    SELECT * FROM users WHERE lower(ism) = lower(${ism}) AND faol LIMIT 1
  `;
  return u ?? null;
}

export function register(bot: Bot) {
  /** Faqat admin uchun — boshqalar panel bilan ishlaydi, buyruq yozmaydi. */
  bot.command("yordam", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    await ctx.reply(
      [
        "<b>Admin buyruqlari</b>",
        "",
        "/panel — guruhga panel qo'yish va pin qilish",
        "/id — chat ID va guruhni saqlash",
        "/royxat — kim ulangan, kim yo'q",
        "/qosh Ism 2 — odam qo'shish (2 = xona)",
        "/ochir Ism — ro'yxatdan chiqarish",
        "/xona Ism 3 — xonasini o'zgartirish",
        "/navbatber 2 — navbatni 2-xonaga o'tkazish",
        "/navbatboshla — navbat yo'q bo'lsa boshlash",
        "",
        "<i>Oddiy a'zolar uchun buyruq kerak emas — hammasi panel tugmalarida.</i>",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("qosh", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const [ism, xonaStr] = ctx.match.trim().split(/\s+(?=\d+$)/);
    const xona = Number(xonaStr);
    if (!ism || !Number.isInteger(xona)) return ctx.reply("Format: /qosh Ism 2");

    const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE raqam = ${xona}`;
    if (!room) return ctx.reply(`${xona}-xona topilmadi.`);

    await sql`INSERT INTO users (ism, room_id) VALUES (${ism}, ${room.id})`;
    await ctx.reply(`✅ ${esc(ism)} — ${xona}-xonaga qo'shildi. Endi botga /start yozsin.`, {
      parse_mode: "HTML",
    });
  });

  bot.command("ochir", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const u = await odamTop(ctx.match.trim());
    if (!u) return ctx.reply("Bunday odam topilmadi.");
    await sql`UPDATE users SET faol = FALSE WHERE id = ${u.id}`;
    await ctx.reply(`✅ ${esc(u.ism)} ro'yxatdan chiqarildi.`, { parse_mode: "HTML" });
  });

  bot.command("xona", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const [ism, xonaStr] = ctx.match.trim().split(/\s+(?=\d+$)/);
    const xona = Number(xonaStr);
    if (!ism || !Number.isInteger(xona)) return ctx.reply("Format: /xona Ism 3");

    const u = await odamTop(ism);
    if (!u) return ctx.reply("Bunday odam topilmadi.");
    const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE raqam = ${xona}`;
    if (!room) return ctx.reply(`${xona}-xona topilmadi.`);

    await sql`UPDATE users SET room_id = ${room.id} WHERE id = ${u.id}`;
    await ctx.reply(`✅ ${esc(u.ism)} endi ${xona}-xonada.`, { parse_mode: "HTML" });
  });

  bot.command("navbatber", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const xona = Number(ctx.match.trim());
    if (!Number.isInteger(xona)) return ctx.reply("Format: /navbatber 2");

    const yangi = await navbatniOzgartirish(xona);
    await ctx.reply(navbatXabari(yangi.room, yangi.azolar, yangi.turn.muddat), {
      parse_mode: "HTML",
    });
  });

  bot.command("navbatboshla", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    if (await faolNavbat()) return ctx.reply("Navbat allaqachon ketyapti.");

    const [birinchi] = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib LIMIT 1`;
    if (!birinchi) return ctx.reply("Bazada xona yo'q.");

    const muddat = new Date(Date.now() + config.siklKuni * 86_400_000);
    await sql`INSERT INTO turns (room_id, muddat) VALUES (${birinchi.id}, ${muddat})`;

    await ctx.reply(navbatXabari(birinchi, await xonaAzolari(birinchi.id), muddat), {
      parse_mode: "HTML",
    });
  });

  bot.command("royxat", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const rooms = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib`;
    const satrlar = ["<b>Ro'yxat</b>", ""];
    for (const r of rooms) {
      const azolar = await xonaAzolari(r.id);
      const belgi = azolar.map((a) => (a.telegram_id ? "✅" : "⏳")).join("");
      satrlar.push(`<b>${r.raqam}-xona</b> ${belgi}\n   ${esc(ismlar(azolar))}`);
    }
    satrlar.push("", "<i>✅ = botga ulangan, ⏳ = hali /start bosmagan</i>");
    await ctx.reply(satrlar.join("\n"), { parse_mode: "HTML" });
  });
}
