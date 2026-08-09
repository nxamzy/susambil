import type { Bot } from "grammy";
import { sql, type Room, type User } from "../../db/index.js";
import { config } from "../../config.js";
import { faolNavbat, navbatniOzgartirish, xonaAzolari } from "../../core/rotation.js";
import { summaTekshir } from "../../core/topshiriq.js";
import { tolovQabulQiluvchiniOrnat, tolovTalabiniOrnat } from "../../core/tolov.js";
import { kim } from "../group.js";
import { esc, navbatXabari, pul } from "../text.js";
import { azolarMatni } from "./commands.js";
import { kutayotganlarniJonat } from "./reports.js";
import { tolovDashboardKorsat } from "./tolov.js";
import { navbatAdminDashboard } from "./navbat.js";

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
  /**
   * Hammaga ochiq. Ilgari admin bo'lmaganlarga jimgina qaytardi — buyruq esa
   * Telegram menyusida hammaga ko'rinib turardi, natijada bosilsa hech nima
   * bo'lmasdi.
   */
  bot.command("yordam", async (ctx) => {
    const s = [
      "<b>Buyruqlar</b>",
      "",
      "/navbat — kim navbatda",
      "/reyting — shu oylik reyting",
      "/tarix — oxirgi navbatlar",
      "/xarajat — uyga narsa olib kelganingizni yozish",
      "",
      "<i>Aslida buyruq yozish shart emas — hammasi yozish",
      "maydonining ostidagi tugmalarda.</i>",
    ];

    if (await adminmi(ctx)) {
      s.push(
        "",
        "<b>Admin buyruqlari</b>",
        "",
        "/panel — guruhga panel qo'yish va pin qilish",
        "/id — chat ID va guruhni saqlash",
        "/royxat — kim ulangan, kim yo'q",
        "/qosh Ism 2 — odam qo'shish (2 = xona)",
        "/ochir Ism — ro'yxatdan chiqarish",
        "/xona Ism 3 — xonasini o'zgartirish",
        "/ism EskiIsm YangiIsm — ismini o'zgartirish",
        "/qaytabogla Ism — botdan uzish (yangi Telegram hisobiga ulash uchun)",
        "/shikoyatlar — tasdiq kutayotgan shikoyatlar",
        "/navbatber 2 — navbatni 2-xonaga o'tkazish",
        "/navbatboshla — navbat yo'q bo'lsa boshlash",
        "/joriynavbat — joriy navbat holati va boshqaruvi",
        "/tolovlar — kvartira to'lovlari dashboard",
        "/tolovtalab 900000 — har kishidan talab summasini o'zgartirish",
        "/tolovsozla Sorabek 9860350143875127 — qabul qiluvchi/karta",
      );
    }

    await ctx.reply(s.join("\n"), { parse_mode: "HTML" });
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

  // A'zolar ro'yxati endi hammaga ochiq ("👥 A'zolar" tugmasi), shuning
  // uchun /royxat o'sha bilan bir xil matnni ishlatadi — ikkinchi nusxa yo'q.
  bot.command("royxat", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    await ctx.reply(await azolarMatni(), { parse_mode: "HTML" });
  });

  bot.command("ism", async (ctx) => {
    if (!(await adminmi(ctx))) return;

    const matn = ctx.match.trim();
    const boshlik = matn.indexOf(" ");
    if (boshlik === -1) return ctx.reply("Format: /ism EskiIsm YangiIsm");

    const eski = matn.slice(0, boshlik).trim();
    const yangi = matn.slice(boshlik + 1).trim().slice(0, 40);
    if (yangi.length < 2) return ctx.reply("Yangi ism juda qisqa.");

    const u = await odamTop(eski);
    if (!u) return ctx.reply("Bunday odam topilmadi.");

    const band = await sql<{ id: number }[]>`
      SELECT id FROM users WHERE lower(ism) = lower(${yangi}) AND faol AND id <> ${u.id}
    `;
    if (band.length > 0) return ctx.reply("Bu ism band — boshqasini tanlang.");

    await sql`UPDATE users SET ism = ${yangi} WHERE id = ${u.id}`;
    await ctx.reply(`✅ <b>${esc(u.ism)}</b> endi <b>${esc(yangi)}</b> deb ataladi.`, {
      parse_mode: "HTML",
    });
  });

  // DM'dan qochib ketgan yoki eski shikoyatlarni qayta ko'rish uchun —
  // reports.ts'dagi bir xil ko'rinishni ishlatadi, ikkinchi nusxa yo'q.
  bot.command("shikoyatlar", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    await kutayotganlarniJonat(ctx);
  });

  /**
   * Odam telefon/hisob almashtirsa, eski profilini yangi Telegram
   * hisobiga ulash uchun. Identifikatsiya FAQAT telegram_id orqali —
   * yangi hisob avtomatik ravishda BOSHQA odam deb hisoblanadi, admin
   * buni ochiq ravishda "ulash" orqali tasdiqlashi kerak: telegram_id'ni
   * tozalaymiz, keyin odam /start bosib o'z ismini qayta tanlaydi
   * (mavjud "kim men?" oqimi orqali — yangi mexanizm shart emas).
   */
  bot.command("qaytabogla", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const u = await odamTop(ctx.match.trim());
    if (!u) return ctx.reply("Bunday odam topilmadi.");
    if (!u.telegram_id) return ctx.reply(`${esc(u.ism)} hali botga ulanmagan.`);

    await sql`UPDATE users SET telegram_id = NULL, username = NULL WHERE id = ${u.id}`;
    await ctx.reply(
      [
        `✅ <b>${esc(u.ism)}</b> botdan uzildi.`,
        ``,
        `Endi u yangi Telegram hisobidan botga /start bosib,`,
        `ro'yxatdan o'z ismini qayta tanlashi mumkin.`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  // Joriy navbat: vazifalar, dalil, eslatma holati + qo'lda boshqarish
  // tugmalari (navbat.ts'dagi bir xil ko'rinish, ikkinchi nusxa yo'q).
  bot.command("joriynavbat", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    await navbatAdminDashboard(ctx);
  });

  // Kvartira to'lovlari — umumiy ko'rinish + tasdiq kutayotganlar ro'yxati.
  // reports.ts'dagi /shikoyatlar bilan bir xil naqsh, ikkinchi nusxa yo'q.
  bot.command("tolovlar", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    await tolovDashboardKorsat(ctx);
  });

  // Talab summasi va qabul qiluvchi/karta kod ichida emas, settings
  // jadvalida (core/tolov.ts) — shu ikki buyruq bilan admin kodni
  // o'zgartirmasdan yangilay oladi.
  bot.command("tolovtalab", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const summa = summaTekshir(ctx.match.trim());
    if (summa === null) return ctx.reply("Format: /tolovtalab 900000");

    await tolovTalabiniOrnat(summa);
    await ctx.reply(`✅ Endi har kishidan talab: <b>${pul(summa)}</b>`, { parse_mode: "HTML" });
  });

  bot.command("tolovsozla", async (ctx) => {
    if (!(await adminmi(ctx))) return;
    const [ism, karta] = ctx.match.trim().split(/\s+(?=\d+$)/);
    if (!ism || !karta) return ctx.reply("Format: /tolovsozla Sorabek 9860350143875127");

    await tolovQabulQiluvchiniOrnat(ism, karta);
    await ctx.reply(
      [`✅ Qabul qiluvchi: <b>${esc(ism)}</b>`, `💳 Karta: <code>${esc(karta)}</code>`].join("\n"),
      { parse_mode: "HTML" },
    );
  });
}
