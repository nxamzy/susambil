/**
 * Admin: a'zolarga erkin xabar/topshiriq yuborish.
 *
 * Nima uchun bor: avtomatik eslatmalar ("navbat eslatmasi", "to'lov
 * muddati") oldindan yozilgan matnlar — ular uydagi kutilmagan holatni
 * ("musor navbatdan oldin to'lib ketdi, bugun tashlab kelinglar")
 * ayta olmaydi. Ilgari yagona imkoniyat `navbat_admin_eslatma` edi, u ham
 * QAT'IY matn yuborardi. Bu yerda admin matnni o'zi yozadi va kimga
 * ketishini tanlaydi.
 *
 * ATAYLAB oddiy e'lon, ikkinchi tasdiqlash tizimi EMAS: xabar hech qanday
 * ball bermaydi va "bajarildi" deb belgilanmaydi. Ish qilinganini
 * ko'rsatish uchun mavjud yo'l o'zgarmagan — a'zo pastdagi ish tugmasini
 * bosadi (masalan "♻️ Musor tashladim"), u guruh tasdig'iga chiqadi va ball
 * o'sha yerdan keladi. Shu sababli bu yerda parallel oqim yaratilmadi.
 *
 * Ko'p qadamli oqim bazadagi `flow_state` orqali (`bot/state.ts`), xuddi
 * qolgan hamma oqim kabi — serverless muhitda xotira saqlanmaydi.
 */
import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type User } from "../../db/index.js";
import { logla } from "../../core/adminlog.js";
import { faolNavbat } from "../../core/rotation.js";
import { guruhgaYubor, kim, shaxsiy } from "../group.js";
import {
  bekorKeyboard,
  xabarKimKeyboard,
  xabarOdamKeyboard,
  xabarTasdiqKeyboard,
  xabarXonaKeyboard,
} from "../keyboards.js";
import {
  adminXabariMatni,
  xabarGuruhMatni,
  xabarKimiNomi,
  xabarNatijaMatni,
  xabarTasdiqMatni,
} from "../text.js";
import {
  holatOl,
  holatOrnat,
  holatTozala,
  sorovniEslat,
  sorovniOchir,
  type XabarKimi,
} from "../state.js";

/** Bitta xabar matnining chegarasi — Telegram 4096 ga sig'sin, sarlavha bilan. */
const MATN_MAX = 2000;

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

/**
 * Xabar kimlarga ketadi. Faqat FAOL a'zolar; botga ulanmaganlar ham
 * ro'yxatga tushadi — ular `shaxsiy()` da "yetmadi" bo'lib hisobotda
 * ko'rinadi, ya'ni admin xabari kimga bormaganini biladi (jimgina tashlab
 * yuborish adminni chalg'itardi).
 */
async function oluvchilar(k: XabarKimi): Promise<User[]> {
  switch (k.t) {
    case "guruh":
      return [];
    case "navbatchi": {
      const n = await faolNavbat();
      return n?.azolar ?? [];
    }
    case "hamma":
      return sql<User[]>`SELECT * FROM users WHERE faol ORDER BY ism`;
    case "xona":
      return sql<User[]>`
        SELECT u.* FROM users u JOIN rooms r ON r.id = u.room_id
        WHERE u.faol AND r.raqam = ${k.raqam} ORDER BY u.ism
      `;
    case "odam":
      return sql<User[]>`SELECT * FROM users WHERE id = ${k.userId} AND faol`;
  }
}

/** Ko'rsatish uchun nom — "navbatdagi xona (3-xona)", "Jamshidbek" va h.k. */
async function kimgaNomi(k: XabarKimi): Promise<string> {
  if (k.t === "navbatchi") {
    const n = await faolNavbat();
    return xabarKimiNomi(k, n ? `${n.room.raqam}-xona` : undefined);
  }
  if (k.t === "odam") {
    const [u] = await sql<{ ism: string }[]>`SELECT ism FROM users WHERE id = ${k.userId}`;
    return xabarKimiNomi(k, u?.ism);
  }
  return xabarKimiNomi(k);
}

/** Kim tanlangach — matnini so'raymiz. */
async function matnniSora(ctx: Context, k: XabarKimi): Promise<void> {
  if (!ctx.from) return;

  const kimga = await kimgaNomi(k);
  const soni = (await oluvchilar(k)).filter((u) => u.telegram_id).length;

  if (k.t !== "guruh" && soni === 0) {
    await ctx.reply(
      `⚠️ <b>${kimga}</b> bo'yicha botga ulangan odam yo'q — xabar hech kimga bormaydi.`,
      { parse_mode: "HTML", reply_markup: xabarKimKeyboard() },
    );
    return;
  }

  const holat = { tur: "admin_xabar", qadam: "matn", kim: k } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(
    [
      `📣 <b>XABAR MATNI</b>`,
      ``,
      `👥 Kimga: <b>${kimga}</b>`,
      ...(k.t === "guruh" ? [] : [`📬 Ulangan: <b>${soni}</b> kishi`]),
      ``,
      `Yubormoqchi bo'lgan matnni yozing:`,
      ``,
      `<i>Masalan: "Musor navbatdan oldin to'lib ketdi — bugun</i>`,
      `<i>tashlab kelinglar."</i>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: bekorKeyboard() },
  );
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/** Matn yozilgach — yuborishdan oldin ko'rsatamiz (ortga qaytarish yo'q). */
export async function xabarMatniKeldi(ctx: Context, k: XabarKimi, xom: string): Promise<void> {
  if (!ctx.from) return;

  const matn = xom.trim().slice(0, MATN_MAX);
  if (matn.length < 3) {
    await ctx.reply("Juda qisqa. Nima demoqchi ekaningizni yozing.");
    return;
  }

  await sorovniOchir(ctx.api, await holatOl(ctx.from.id));

  const kimga = await kimgaNomi(k);
  const soni = (await oluvchilar(k)).filter((u) => u.telegram_id).length;

  const holat = { tur: "admin_xabar", qadam: "tasdiq", kim: k, matn } as const;
  await holatOrnat(ctx.from.id, holat);

  const xabar = await ctx.reply(xabarTasdiqMatni(k, matn, kimga, soni), {
    parse_mode: "HTML",
    reply_markup: xabarTasdiqKeyboard(),
  });
  await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
}

/**
 * Navbatdagi xona a'zosiga panelga o'tish tugmasi qo'yiladi — xabar
 * ko'pincha aynan navbat ishi haqida bo'ladi, odam ikki bosishda
 * vazifasini belgilay olsin. Boshqalarga tugma keraksiz.
 */
async function tugmaKerakmi(): Promise<number | null> {
  const n = await faolNavbat();
  return n?.room.id ?? null;
}

export function register(bot: Bot) {
  bot.callbackQuery("xabar", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await holatTozala(ctx.from.id);
    await ctx.reply(
      [
        `📣 <b>XABAR YUBORISH</b>`,
        ``,
        `A'zolarga o'zingiz yozgan xabarni yuborasiz — masalan`,
        `navbatdan tashqari topshiriq yoki ogohlantirish.`,
        ``,
        `👥 <b>Kimga yuboramiz?</b>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: xabarKimKeyboard() },
    );
  });

  bot.callbackQuery(/^xabar_kim:(navbatchi|hamma|xona|odam|guruh)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const tur = ctx.match[1];

    if (tur === "xona") {
      const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
      await ctx.reply("🚪 <b>Qaysi xonaga?</b>", {
        parse_mode: "HTML",
        reply_markup: xabarXonaKeyboard(xonalar.map((x) => x.raqam)),
      });
      return;
    }

    if (tur === "odam") {
      const odamlar = await sql<{ id: number; ism: string }[]>`
        SELECT id, ism FROM users WHERE faol AND telegram_id IS NOT NULL ORDER BY ism
      `;
      if (odamlar.length === 0) {
        await ctx.reply("Botga ulangan a'zo yo'q.");
        return;
      }
      await ctx.reply("👤 <b>Kimga?</b>", {
        parse_mode: "HTML",
        reply_markup: xabarOdamKeyboard(odamlar),
      });
      return;
    }

    // navbatchi | hamma | guruh — qo'shimcha tanlov kerak emas.
    if (tur === "navbatchi" && !(await faolNavbat())) {
      await ctx.reply("🧹 Hozircha navbat boshlanmagan — navbatchilar yo'q.", {
        reply_markup: xabarKimKeyboard(),
      });
      return;
    }

    await matnniSora(ctx, { t: tur } as XabarKimi);
  });

  bot.callbackQuery(/^xabar_xona:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await matnniSora(ctx, { t: "xona", raqam: Number(ctx.match[1]) });
  });

  bot.callbackQuery(/^xabar_odam:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await matnniSora(ctx, { t: "odam", userId: Number(ctx.match[1]) });
  });

  bot.callbackQuery("xabar_yubor", async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const holat = await holatOl(ctx.from.id);
    if (holat?.tur !== "admin_xabar" || holat.qadam !== "tasdiq") {
      return ctx.answerCallbackQuery({ text: "Jarayon eskirgan. Qaytadan boshlang." }).catch(() => {});
    }

    await ctx.answerCallbackQuery({ text: "📤 Yuborilmoqda..." }).catch(() => {});
    await sorovniOchir(ctx.api, holat);
    await holatTozala(ctx.from.id);

    const kimga = await kimgaNomi(holat.kim);

    if (holat.kim.t === "guruh") {
      const yetdi = await guruhgaYubor(ctx.api, xabarGuruhMatni(admin.ism, holat.matn));
      await ctx.reply(
        yetdi
          ? "✅ <b>Guruhga yuborildi.</b>"
          : "⚠️ <b>Guruhga yuborilmadi</b> — guruh sozlanmagan yoki bot chiqarib yuborilgan.",
        { parse_mode: "HTML" },
      );
      await logla(admin.id, "xabar_yubordi", "xabar", null, null, `guruh: ${holat.matn.slice(0, 200)}`);
      return;
    }

    const navbatXonaId = await tugmaKerakmi();
    const matn = adminXabariMatni(admin.ism, holat.matn);
    const yetdi: string[] = [];
    const yetmadi: string[] = [];

    for (const u of await oluvchilar(holat.kim)) {
      // Navbatdagi xona a'zosiga panel havolasi — xabar ko'pincha aynan
      // navbat ishi haqida bo'ladi.
      const tugma =
        u.room_id !== null && u.room_id === navbatXonaId
          ? { reply_markup: new InlineKeyboard().text("🧹 Mening Navbatim", "navbat_panel") }
          : {};
      if (await shaxsiy(ctx.api, u, matn, tugma)) yetdi.push(u.ism);
      else yetmadi.push(u.ism);
    }

    await ctx.reply(xabarNatijaMatni(kimga, yetdi, yetmadi), { parse_mode: "HTML" });
    await logla(
      admin.id,
      "xabar_yubordi",
      "xabar",
      null,
      null,
      `${kimga} (${yetdi.length} kishi): ${holat.matn.slice(0, 200)}`,
    );
  });
}
