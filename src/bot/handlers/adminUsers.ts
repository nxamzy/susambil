/**
 * Admin panel — foydalanuvchilarni qo'lda boshqarish.
 *
 * Root cause context: Sorabek/Diyorbek muammosi kod xatosi emas edi —
 * `kim()` (group.ts) har doim `telegram_id` orqali ishlagan va DB'dagi
 * UNIQUE constraint ikkita odamni bitta hisobga bog'lashni jismonan
 * imkonsiz qiladi. Muammo RO'YXATDAN O'TISHDA edi: odam ro'yxatdan o'z
 * ismini tanlaganda ("men:<id>" tugmasi) hech qanday tasdiq so'ralmasdi —
 * Sorabek shoshilib "Diyorbek"ni bosib qo'ygan. Buni ikki tomondan
 * tuzatdik: (1) endi tanlashda "Siz ISMmisiz?" tasdig'i so'raladi
 * (bot/handlers/commands.ts), (2) admin endi BU YERDA — kod
 * o'zgartirmasdan — har qanday shunga o'xshash xatoni to'g'irlay oladi:
 * ismni, Telegram ID'ni, xonani o'zgartirish, faolsizlantirish yoki
 * butunlay o'chirish.
 *
 * Barcha yozuvchi amallar `core/users.ts` orqali — u yerda har biri
 * `admin_log`ga yoziladi, bu yerda takrorlanmaydi.
 */
import type { Bot, Context } from "grammy";
import { sql, type Room, type User } from "../../db/index.js";
import {
  adminHuquqiniOzgartir,
  ballTuzat,
  faollikniOzgartir,
  foydalanuvchiQoshish,
  foydalanuvchiTarixiBormi,
  foydalanuvchiToliqOl,
  foydalanuvchilarRoyxati,
  foydalanuvchiniOchirish,
  ismniOzgartir,
  takrorlanganFaolIsmlar,
  telegramIdOzgartir,
  xonaniOzgartir,
} from "../../core/users.js";
import { ballTuzatishTarixi } from "../../core/rating.js";
import { foydalanuvchiLoglari, oxirgiLoglar } from "../../core/adminlog.js";
import { foydalanuvchiTolovHolati } from "../../core/tolov.js";
import { guruhAzosimi, kim } from "../group.js";
import {
  adminHuquqTasdiqKeyboard,
  adminPanelKeyboard,
  adminXonaOzgartirKeyboard,
  adminYangiXonaKeyboard,
  bekorKeyboard,
  faollikTasdiqKeyboard,
  foydalanuvchiDetalKeyboard,
  foydalanuvchilarKeyboard,
  ochirishTasdiqKeyboard,
  telegramIdTasdiqKeyboard,
} from "../keyboards.js";
import {
  adminLogMatni,
  adminPanelMatni,
  esc,
  foydalanuvchiDetalMatni,
  foydalanuvchiFaollikTasdiqMatni,
  foydalanuvchiOchirishTasdiqMatni,
  foydalanuvchiTugmaYozuvi,
  foydalanuvchilarRoyxatiMatni,
  takroriyIsmlarMatni,
  telegramIdTasdiqMatni,
} from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import { tolovDashboardKorsat } from "./tolov.js";
import { navbatAdminDashboard } from "./navbat.js";
import { kutayotganlarniJonat } from "./reports.js";

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

export async function adminPanelKorsat(ctx: Context): Promise<void> {
  await ctx.reply(adminPanelMatni(), { parse_mode: "HTML", reply_markup: adminPanelKeyboard() });
}

async function foydalanuvchilarKorsat(ctx: Context): Promise<void> {
  const royxat = await foydalanuvchilarRoyxati();
  await ctx.reply(foydalanuvchilarRoyxatiMatni(royxat), {
    parse_mode: "HTML",
    reply_markup: foydalanuvchilarKeyboard(royxat, foydalanuvchiTugmaYozuvi),
  });
}

async function foydalanuvchiDetalKorsat(ctx: Context, userId: number): Promise<void> {
  const u = await foydalanuvchiToliqOl(userId);
  if (!u) {
    await ctx.reply("Bu foydalanuvchi topilmadi.");
    return;
  }

  const guruhHolat = u.telegram_id ? await guruhAzosimi(ctx.api, Number(u.telegram_id)) : null;
  const tolov = await foydalanuvchiTolovHolati(u.id);
  const tuzatishlar = await ballTuzatishTarixi(u.id, 5);
  const loglar = await foydalanuvchiLoglari(u.id, 5);
  const tarixiBor = await foydalanuvchiTarixiBormi(u.id);

  await ctx.reply(foydalanuvchiDetalMatni(u, guruhHolat, tolov, tuzatishlar, loglar), {
    parse_mode: "HTML",
    reply_markup: foydalanuvchiDetalKeyboard(u, !tarixiBor),
  });
}

export function register(bot: Bot) {
  bot.callbackQuery("admin_panel", async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    await adminPanelKorsat(ctx);
  });

  // Mavjud bo'limlarga havolalar — ikkinchi nusxa yaratilmagan, xuddi o'sha
  // /tolovlar, /joriynavbat, /shikoyatlar buyruqlari chaqiradigan funksiyalar.
  bot.callbackQuery("admin_link_tolovlar", async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    await tolovDashboardKorsat(ctx);
  });
  bot.callbackQuery("admin_link_navbat", async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    await navbatAdminDashboard(ctx);
  });
  bot.callbackQuery("admin_link_shikoyatlar", async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    await kutayotganlarniJonat(ctx);
  });

  bot.callbackQuery("admin_users", async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    await foydalanuvchilarKorsat(ctx);
  });

  bot.callbackQuery(/^admin_user:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery("admin_conflicts", async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    const royxat = await takrorlanganFaolIsmlar();
    await ctx.reply(takroriyIsmlarMatni(royxat), { parse_mode: "HTML" });
  });

  bot.callbackQuery("admin_logs", async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});
    const loglar = await oxirgiLoglar(20);
    await ctx.reply(adminLogMatni(loglar), { parse_mode: "HTML" });
  });

  // --- Yangi foydalanuvchi qo'shish ---
  bot.callbackQuery("admin_add", async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "admin_yangi", qadam: "ism" } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply("✍️ Yangi foydalanuvchining ismini yozing:", {
      reply_markup: bekorKeyboard(),
    });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery(/^admin_add_room:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });

    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "admin_yangi" || holat.qadam !== "xona") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." });
    }

    const raqam = Number(ctx.match[1]);
    let roomId: number | null = null;
    if (raqam > 0) {
      const [room] = await sql<Room[]>`SELECT id FROM rooms WHERE raqam = ${raqam}`;
      if (!room) return ctx.answerCallbackQuery({ text: "Bunday xona yo'q." });
      roomId = room.id;
    }

    await ctx.answerCallbackQuery().catch(() => {});
    await sorovniOchir(ctx.api, holat);
    await holatTozala(ctx.from.id);

    const yangi = await foydalanuvchiQoshish(holat.ism, roomId, admin.id);
    await ctx.reply(`✅ <b>${esc(yangi.ism)}</b> qo'shildi — hali botga ulanmagan.`, {
      parse_mode: "HTML",
    });
    await foydalanuvchiDetalKorsat(ctx, yangi.id);
  });

  // --- Ismni tahrirlash ---
  bot.callbackQuery(/^admin_edit_name:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    const userId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "admin_tahrir_ism", userId } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply("✍️ Yangi ismni yozing:", { reply_markup: bekorKeyboard() });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  // --- Telegram ID tahrirlash ---
  bot.callbackQuery(/^admin_edit_tgid:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    const userId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "admin_tahrir_tgid", userId } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply(
      [
        `📱 <b>Yangi Telegram ID'ni yozing</b>`,
        ``,
        `<i>Raqam bilan. Ulanishni butunlay uzish uchun</i> <code>0</code> <i>yozing.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  bot.callbackQuery(/^admin_tgid_ok:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });

    const userId = Number(ctx.match[1]);
    const raw = Number(ctx.match[2]);
    const yangi = raw === 0 ? null : raw;

    const natija = await telegramIdOzgartir(userId, yangi, admin.id);
    if ("xato" in natija) {
      return ctx.answerCallbackQuery({
        text: natija.xato === "band" ? "Bu Telegram ID boshqa odamda band." : "Foydalanuvchi topilmadi.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({ text: "✅ O'zgartirildi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, userId);
  });

  bot.callbackQuery(/^admin_tgid_yoq:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery({ text: "Bekor qilindi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, Number(ctx.match[1]));
  });

  // --- Xonani tahrirlash ---
  bot.callbackQuery(/^admin_edit_room:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    const userId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery().catch(() => {});

    const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
    await ctx.reply("🏠 Yangi xonani tanlang:", {
      reply_markup: adminXonaOzgartirKeyboard(userId, xonalar.map((x) => x.raqam)),
    });
  });

  bot.callbackQuery(/^admin_room_set:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });

    const userId = Number(ctx.match[1]);
    const raqam = Number(ctx.match[2]);
    const [room] = await sql<Room[]>`SELECT id FROM rooms WHERE raqam = ${raqam}`;
    if (!room) return ctx.answerCallbackQuery({ text: "Bunday xona yo'q." });

    const yangi = await xonaniOzgartir(userId, room.id, admin.id);
    if (!yangi) return ctx.answerCallbackQuery({ text: "Foydalanuvchi topilmadi." });

    await ctx.answerCallbackQuery({ text: "✅ Xona o'zgartirildi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, userId);
  });

  // --- Admin huquqi ---
  bot.callbackQuery(/^admin_toggle_admin:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    const userId = Number(ctx.match[1]);
    const u = await foydalanuvchiToliqOl(userId);
    if (!u) return ctx.answerCallbackQuery({ text: "Topilmadi." });

    await ctx.answerCallbackQuery().catch(() => {});
    const yangiQiymat = !u.admin;
    await ctx.reply(
      yangiQiymat
        ? `👑 <b>${esc(u.ism)}</b>ga admin huquqi berilsinmi?`
        : `👑 <b>${esc(u.ism)}</b>dan admin huquqi olinsinmi?`,
      { parse_mode: "HTML", reply_markup: adminHuquqTasdiqKeyboard(userId, yangiQiymat) },
    );
  });

  bot.callbackQuery(/^admin_admin_ok:(\d+):([01])$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });

    const userId = Number(ctx.match[1]);
    const yangiQiymat = ctx.match[2] === "1";
    const yangi = await adminHuquqiniOzgartir(userId, yangiQiymat, admin.id);
    if (!yangi) return ctx.answerCallbackQuery({ text: "Topilmadi." });

    await ctx.answerCallbackQuery({ text: "✅ O'zgartirildi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, userId);
  });

  bot.callbackQuery(/^admin_admin_yoq:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery({ text: "Bekor qilindi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, Number(ctx.match[1]));
  });

  // --- Faollik (deaktivatsiya / qayta faollashtirish) ---
  bot.callbackQuery(/^admin_toggle_faol:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    const userId = Number(ctx.match[1]);
    const u = await foydalanuvchiToliqOl(userId);
    if (!u) return ctx.answerCallbackQuery({ text: "Topilmadi." });

    await ctx.answerCallbackQuery().catch(() => {});
    const yangiFaol = !u.faol;
    await ctx.reply(foydalanuvchiFaollikTasdiqMatni(u, yangiFaol), {
      parse_mode: "HTML",
      reply_markup: faollikTasdiqKeyboard(userId, yangiFaol),
    });
  });

  bot.callbackQuery(/^admin_faollik_ok:(\d+):([01])$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });

    const userId = Number(ctx.match[1]);
    const yangiFaol = ctx.match[2] === "1";
    const yangi = await faollikniOzgartir(userId, yangiFaol, admin.id);
    if (!yangi) return ctx.answerCallbackQuery({ text: "Topilmadi." });

    await ctx.answerCallbackQuery({ text: "✅ O'zgartirildi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, userId);
  });

  bot.callbackQuery(/^admin_faollik_yoq:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery({ text: "Bekor qilindi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, Number(ctx.match[1]));
  });

  // --- Butunlay o'chirish ---
  bot.callbackQuery(/^admin_delete:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    const userId = Number(ctx.match[1]);
    const u = await foydalanuvchiToliqOl(userId);
    if (!u) return ctx.answerCallbackQuery({ text: "Topilmadi." });

    if (await foydalanuvchiTarixiBormi(userId)) {
      return ctx.answerCallbackQuery({
        text: "Bu odamning tarixi bor — faqat faolsizlantirish mumkin.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(foydalanuvchiOchirishTasdiqMatni(u), {
      parse_mode: "HTML",
      reply_markup: ochirishTasdiqKeyboard(userId),
    });
  });

  bot.callbackQuery(/^admin_delete_ok:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });

    const userId = Number(ctx.match[1]);
    const natija = await foydalanuvchiniOchirish(userId, admin.id);
    if (!natija.ok) {
      return ctx.answerCallbackQuery({
        text: natija.sabab === "tarixi_bor" ? "Tarixi bor — o'chirib bo'lmadi." : "Topilmadi.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({ text: "🗑 O'chirildi." }).catch(() => {});
    await ctx.reply("🗑 Foydalanuvchi butunlay o'chirildi.");
    await foydalanuvchilarKorsat(ctx);
  });

  bot.callbackQuery(/^admin_delete_yoq:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    await ctx.answerCallbackQuery({ text: "Bekor qilindi." }).catch(() => {});
    await foydalanuvchiDetalKorsat(ctx, Number(ctx.match[1]));
  });

  // --- Ball tuzatish ---
  bot.callbackQuery(/^admin_ball:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q." });
    const userId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery().catch(() => {});

    const holat = { tur: "admin_ball", userId } as const;
    await holatOrnat(ctx.from.id, holat);
    const xabar = await ctx.reply(
      [
        `⭐ <b>Ball tuzatish</b>`,
        ``,
        `Miqdorni va sababini yozing, masalan:`,
        `<code>+15 boshqa ish uchun</code>`,
        `<code>-10 xato yozilgan edi</code>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: bekorKeyboard() },
    );
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });
}

/** Matn qadamlari — messages.ts'dan chaqiriladi. */

export async function adminYangiIsmiKeldi(ctx: Context, ism: string): Promise<void> {
  if (!ctx.from) return;
  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const holat = { tur: "admin_yangi", qadam: "xona", ism } as const;
  await holatOrnat(ctx.from.id, holat);

  const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
  const xabar = await ctx.reply("🏠 Qaysi xonaga qo'shamiz?", {
    reply_markup: adminYangiXonaKeyboard(xonalar.map((x) => x.raqam)),
  });
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

export async function adminIsmTahrirKeldi(ctx: Context, userId: number, yangiIsm: string): Promise<void> {
  if (!ctx.from) return;
  const admin = await kim(ctx.from.id);
  if (!admin?.admin) return;

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const natija = await ismniOzgartir(userId, yangiIsm, admin.id);
  if ("xato" in natija) {
    await ctx.reply(natija.xato === "band" ? "Bu ism band yoki juda qisqa." : "Foydalanuvchi topilmadi.");
    return;
  }

  await ctx.reply(`✅ Ism <b>${esc(natija.ism)}</b>ga o'zgartirildi.`, { parse_mode: "HTML" });
  await foydalanuvchiDetalKorsat(ctx, userId);
}

export async function adminTgIdTahrirKeldi(ctx: Context, userId: number, xom: string): Promise<void> {
  if (!ctx.from) return;
  const admin = await kim(ctx.from.id);
  if (!admin?.admin) return;

  const raqam = Number(xom.trim().replace(/\D/g, ""));
  if (!Number.isFinite(raqam) || xom.trim() === "") {
    await ctx.reply("Faqat raqam yozing. Uzish uchun: 0");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  const u = await foydalanuvchiToliqOl(userId);
  if (!u) {
    await ctx.reply("Foydalanuvchi topilmadi.");
    return;
  }

  const yangi = raqam === 0 ? null : raqam;
  await ctx.reply(telegramIdTasdiqMatni(u, yangi), {
    parse_mode: "HTML",
    reply_markup: telegramIdTasdiqKeyboard(userId, yangi),
  });
}

export async function adminBallTuzatishKeldi(ctx: Context, userId: number, xom: string): Promise<void> {
  if (!ctx.from) return;
  const admin = await kim(ctx.from.id);
  if (!admin?.admin) return;

  const mos = xom.trim().match(/^([+-]?\d+)\s*(.*)$/);
  if (!mos) {
    await ctx.reply("Format: +15 sabab yoki -10 sabab");
    return;
  }
  const ball = Number(mos[1]);
  const sabab = (mos[2] ?? "").trim();
  if (ball === 0) {
    await ctx.reply("Ball 0 bo'lishi mumkin emas.");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
  await holatTozala(ctx.from.id);

  await ballTuzat(userId, ball, sabab, admin.id);
  await ctx.reply(`✅ ${ball > 0 ? "+" : ""}${ball} ball qo'shildi.`);
  await foydalanuvchiDetalKorsat(ctx, userId);
}
