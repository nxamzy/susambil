import type { Bot } from "grammy";
import { sql, type Room, type Turn } from "../../db/index.js";
import { config } from "../../config.js";
import { navbatniYopish } from "../../core/rotation.js";
import { guruhId, kim } from "../group.js";
import { tasdiqKeyboard } from "../keyboards.js";
import { navbatXabari, tasdiqXabari, yopilganXabar } from "../text.js";

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

    const [sub] = await sql<{ id: number; turn_id: number; user_id: number }[]>`
      SELECT id, turn_id, user_id FROM submissions WHERE id = ${submissionId} AND NOT bekor
    `;
    if (!sub) return ctx.answerCallbackQuery({ text: "Topshiriq topilmadi." });

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
      VALUES (${submissionId}, ${u.id})
      ON CONFLICT (submission_id, user_id) DO NOTHING
      RETURNING id
    `;
    if (qoshildi.length === 0) {
      return ctx.answerCallbackQuery({ text: "Siz allaqachon tasdiqlagansiz." });
    }

    const tasdiqlovchilar = await sql<{ ism: string }[]>`
      SELECT u.ism FROM confirmations c
      JOIN users u ON u.id = c.user_id
      WHERE c.submission_id = ${submissionId}
      ORDER BY c.created_at
    `;
    const ismlar = tasdiqlovchilar.map((t) => t.ism);

    const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${turn.room_id}`;
    const [yuklagan] = await sql<{ ism: string }[]>`SELECT ism FROM users WHERE id = ${sub.user_id}`;
    if (!room || !yuklagan) return ctx.answerCallbackQuery({ text: "Ma'lumot topilmadi." });

    // Javob bermaslik ("query too old") quyidagi mantiqni to'xtatmasin —
    // tasdiq allaqachon yozilgan, navbat baribir yopilishi kerak.
    await ctx.answerCallbackQuery({ text: "✅ Tasdiqlandi, rahmat!" }).catch(() => {});

    if (ismlar.length < config.kerakliTasdiq) {
      await ctx
        .editMessageText(tasdiqXabari(room, yuklagan.ism, ismlar, config.kerakliTasdiq), {
          parse_mode: "HTML",
          reply_markup: tasdiqKeyboard(submissionId, ismlar.length, config.kerakliTasdiq),
        })
        .catch(() => {});
      return;
    }

    // Yetarli tasdiq yig'ildi. Ikki kishi baravar bosgan bo'lsa navbatniYopish
    // null qaytaradi — o'shanda hech narsa qilmaymiz.
    const natija = await navbatniYopish(turn, room);
    if (!natija) return;

    await ctx
      .editMessageText(
        yopilganXabar(room, yuklagan.ism, ismlar, natija.kechikkanKun, natija.ballHar),
        { parse_mode: "HTML" },
      )
      .catch(() => {});

    const chatId = await guruhId();
    if (chatId) {
      await ctx.api.sendMessage(
        chatId,
        navbatXabari(natija.keyingi.room, natija.keyingi.azolar, natija.keyingi.muddat),
        { parse_mode: "HTML" },
      );
    }
  });
}
