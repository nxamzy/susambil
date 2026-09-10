import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type Room, type Submission, type Turn, type User } from "../../db/index.js";
import { sozlamalarOl } from "../../core/sozlamalar.js";
import { navbatniYopish } from "../../core/rotation.js";
import { radEt, tasdiqla, tasdiqlovchilar } from "../../core/topshiriq.js";
import { guruhId, kim, shaxsiy } from "../group.js";
import { tasdiqKeyboard } from "../keyboards.js";
import { navbatKelganiniXabarQil } from "./navbat.js";
import {
  navbatXabari,
  tasdiqXabari,
  topshiriqRad,
  topshiriqXabari,
  topshiriqYopildi,
  yopilganXabar,
} from "../text.js";

/**
 * Guruhdagi xabarni yangilaydi. Navbat topshirig'i oddiy xabar, qo'shimcha
 * ish esa rasm bo'lib keladi — rasmning matni caption, shuning uchun ikki
 * xil usul kerak.
 */
async function xabarniYangila(
  ctx: Context,
  matn: string,
  tugma?: InlineKeyboard,
): Promise<void> {
  const qoshimcha = { parse_mode: "HTML" as const, ...(tugma ? { reply_markup: tugma } : {}) };
  const rasmmi = Boolean(ctx.callbackQuery?.message?.photo);

  if (rasmmi) {
    await ctx.editMessageCaption({ caption: matn, ...qoshimcha }).catch(() => {});
  } else {
    await ctx.editMessageText(matn, qoshimcha).catch(() => {});
  }
}

export function register(bot: Bot) {
  bot.callbackQuery(/^tasdiq:(\d+)$/, async (ctx) => {
    const submissionId = Number(ctx.match[1]);

    const u = await kim(ctx.from.id);
    if (!u) {
      return ctx.answerCallbackQuery({
        text: "Siz ro'yxatda yo'qsiz. Botga /start yozing.",
        show_alert: true,
      });
    }

    const [sub] = await sql<Submission[]>`
      SELECT * FROM submissions WHERE id = ${submissionId} AND NOT bekor
    `;
    if (!sub) return ctx.answerCallbackQuery({ text: "Topshiriq topilmadi." });

    return sub.tur === "navbat"
      ? navbatniTasdiqla(ctx, u, sub)
      : topshiriqniTasdiqla(ctx, u, sub);
  });

  bot.callbackQuery(/^rad:(\d+)$/, async (ctx) => {
    const submissionId = Number(ctx.match[1]);

    const u = await kim(ctx.from.id);
    if (!u) {
      return ctx.answerCallbackQuery({
        text: "Siz ro'yxatda yo'qsiz. Botga /start yozing.",
        show_alert: true,
      });
    }

    const [sub] = await sql<Submission[]>`
      SELECT * FROM submissions WHERE id = ${submissionId} AND NOT bekor
    `;
    if (!sub) return ctx.answerCallbackQuery({ text: "Topshiriq topilmadi." });
    if (sub.holat !== "kutilmoqda") {
      return ctx.answerCallbackQuery({ text: "Bu ish allaqachon yopilgan." });
    }
    if (sub.user_id === u.id) {
      return ctx.answerCallbackQuery({
        text: "O'z ishingizni o'zingiz rad eta olmaysiz.",
        show_alert: true,
      });
    }

    const yopildi = await radEt(submissionId, u, null);
    if (!yopildi) return ctx.answerCallbackQuery({ text: "Ulgurmadingiz — allaqachon yopilgan." });

    await ctx.answerCallbackQuery({ text: "Rad etildi." }).catch(() => {});

    const [egasi] = await sql<User[]>`SELECT * FROM users WHERE id = ${sub.user_id}`;
    await xabarniYangila(ctx, topshiriqRad(egasi?.ism ?? "—", u.ism, null));
    if (egasi) {
      await shaxsiy(
        ctx.api,
        egasi,
        `✖️ <b>Ishingiz rad etildi</b>\n\n👤 ${u.ism} qabul qilmadi.\n\n<i>Ball berilmadi. Qaytadan topshirsangiz bo'ladi.</i>`,
      );
    }
  });
}

/** Qo'shimcha ish va xarajat — umumiy yo'l. */
async function topshiriqniTasdiqla(ctx: Context, u: User, sub: Submission) {
  const natija = await tasdiqla(sub.id, u);

  if (natija.holat === "xato") {
    const matn = {
      topilmadi: "Topshiriq topilmadi.",
      yopilgan: "Bu ish allaqachon yopilgan.",
      ozi: "O'z ishingizni o'zingiz tasdiqlay olmaysiz.",
      takror: "Siz allaqachon tasdiqlagansiz.",
      oz_xonasi: "O'z xonangizning ishini tasdiqlay olmaysiz.",
    }[natija.sabab];
    return ctx.answerCallbackQuery({ text: matn, show_alert: true });
  }

  await ctx.answerCallbackQuery({ text: "✅ Tasdiqlandi, rahmat!" }).catch(() => {});

  const [egasi] = await sql<User[]>`SELECT * FROM users WHERE id = ${sub.user_id}`;
  const ism = egasi?.ism ?? "—";

  if (natija.holat === "yetmadi") {
    await xabarniYangila(
      ctx,
      topshiriqXabari(sub, ism, natija.ismlar, natija.kerak),
      tasdiqKeyboard(sub.id, natija.ismlar.length, natija.kerak),
    );
    return;
  }

  await xabarniYangila(ctx, topshiriqYopildi(natija.sub, ism, natija.ismlar));
  if (egasi) {
    await shaxsiy(
      ctx.api,
      egasi,
      `✅ <b>Ishingiz tasdiqlandi!</b>\n\n✅ ${natija.ismlar.join(", ")}\n\n🏅 <b>+${natija.sub.ball} ball</b>`,
    );
  }
}

/**
 * Navbat topshirig'i. Bu yerda tasdiq navbatni ham surishi kerak, shuning
 * uchun alohida — `navbatniYopish` tranzaksiya ichida navbatni almashtiradi.
 */
async function navbatniTasdiqla(ctx: Context, u: User, sub: Submission) {
  const [turn] = await sql<Turn[]>`SELECT * FROM turns WHERE id = ${sub.turn_id}`;
  if (!turn || turn.holat !== "faol") {
    return ctx.answerCallbackQuery({ text: "Bu navbat allaqachon yopilgan." });
  }

  if (u.room_id === turn.room_id) {
    return ctx.answerCallbackQuery({
      text: "O'z xonangizning ishini o'zingiz tasdiqlay olmaysiz.",
      show_alert: true,
    });
  }

  const qoshildi = await sql`
    INSERT INTO confirmations (submission_id, user_id)
    VALUES (${sub.id}, ${u.id})
    ON CONFLICT (submission_id, user_id) DO NOTHING
    RETURNING id
  `;
  if (qoshildi.length === 0) {
    return ctx.answerCallbackQuery({ text: "Siz allaqachon tasdiqlagansiz." });
  }

  const ismlar = await tasdiqlovchilar(sub.id);

  const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${turn.room_id}`;
  const [yuklagan] = await sql<{ ism: string }[]>`SELECT ism FROM users WHERE id = ${sub.user_id}`;
  if (!room || !yuklagan) return ctx.answerCallbackQuery({ text: "Ma'lumot topilmadi." });

  // Javob bermaslik ("query too old") quyidagi mantiqni to'xtatmasin —
  // tasdiq allaqachon yozilgan, navbat baribir yopilishi kerak.
  await ctx.answerCallbackQuery({ text: "✅ Tasdiqlandi, rahmat!" }).catch(() => {});

  const { kerakliTasdiq } = await sozlamalarOl();
  if (ismlar.length < kerakliTasdiq) {
    await xabarniYangila(
      ctx,
      tasdiqXabari(room, yuklagan.ism, ismlar, kerakliTasdiq),
      tasdiqKeyboard(sub.id, ismlar.length, kerakliTasdiq),
    );
    return;
  }

  // Yetarli tasdiq yig'ildi. Ikki kishi baravar bosgan bo'lsa navbatniYopish
  // null qaytaradi — o'shanda hech narsa qilmaymiz.
  //
  // MUHIM: kechikish `sub.created_at` — navbatchi "Yakuniy topshirish"ni
  // BOSGAN payt — asosida hisoblanadi, hozirgi (3-tasdiq kelgan) vaqt
  // asosida EMAS. Guruh a'zolari tasdiqlashni kechiktirsa ham navbatchi
  // buning uchun jarimalanmasligi kerak.
  const natija = await navbatniYopish(turn, room, "tasdiqlandi", sub.created_at);
  if (!natija) return;

  await sql`
    UPDATE submissions SET holat = 'tasdiqlandi', yopildi = now() WHERE id = ${sub.id}
  `;

  await xabarniYangila(
    ctx,
    yopilganXabar(room, yuklagan.ism, ismlar, natija.kechikkanKun, natija.ballHar),
  );

  const chatId = await guruhId();
  if (chatId) {
    await ctx.api.sendMessage(
      chatId,
      navbatXabari(natija.keyingi.room, natija.keyingi.azolar, natija.keyingi.muddat),
      { parse_mode: "HTML" },
    );
  }

  // Keyingi xonaga shaxsiy xabar — guruhni hamma ham o'qiyvermaydi. Bir xil
  // funksiya navbat.ts'dagi admin harakatlari bilan baham ko'riladi
  // (ikkinchi nusxa yaratilmagan) — shu bilan birga ularning pastki
  // menyusini ham yangilaydi, "🧹 Mening navbatim" endi ko'rinadi.
  await navbatKelganiniXabarQil(ctx.api, natija.keyingi.room, natija.keyingi.azolar);
}
