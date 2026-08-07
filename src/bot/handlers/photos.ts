import type { Bot } from "grammy";
import type { InputMediaPhoto } from "grammy/types";
import { sql } from "../../db/index.js";
import { config } from "../../config.js";
import { faolNavbat } from "../../core/rotation.js";
import { rasmQabulQil } from "../../core/photobuffer.js";
import { guruhId, kim } from "../group.js";
import { tasdiqKeyboard } from "../keyboards.js";
import { tasdiqXabari } from "../text.js";
import { xarajatHolati } from "../state.js";

export function register(bot: Bot) {
  bot.on("message:photo", async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) return next();

    // Xarajat kiritish jarayonida bo'lsa — bu rasm o'sha yerga tegishli
    if (ctx.chat.type === "private" && (await xarajatHolati(fromId))) return next();

    const u = await kim(fromId);
    if (!u) {
      if (ctx.chat.type === "private") {
        await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
      }
      return;
    }

    const navbat = await faolNavbat();
    if (!navbat) return;

    if (u.room_id !== navbat.room.id) {
      if (ctx.chat.type === "private") {
        await ctx.reply(
          `Hozir navbat ${navbat.room.raqam}-xonada. Sizning rasmingiz hisobga olinmadi.`,
        );
      }
      return;
    }

    const eng = ctx.message.photo.at(-1);
    if (!eng) return;

    const natija = await rasmQabulQil(
      navbat.turn.id,
      u.id,
      ctx.chat.id,
      eng.file_id,
      ctx.message.media_group_id ?? null,
    );

    if (natija.holat === "kutilyapti") {
      const yana = natija.kerak - natija.soni;
      await ctx.reply(
        `📷 ${u.ism}: ${natija.soni} ta rasm qabul qilindi, yana ${yana} ta kerak.`,
      );
      return;
    }

    if (natija.holat !== "topshirildi") return;

    const chatId = await guruhId();
    if (!chatId) return;

    const media: InputMediaPhoto[] = natija.photoIds
      .slice(0, 10)
      .map((file_id) => ({ type: "photo", media: file_id }));

    await ctx.api.sendMediaGroup(chatId, media);

    const xabar = await ctx.api.sendMessage(
      chatId,
      tasdiqXabari(navbat.room, u.ism, [], config.kerakliTasdiq),
      {
        parse_mode: "HTML",
        reply_markup: tasdiqKeyboard(natija.submissionId, 0, config.kerakliTasdiq),
      },
    );

    await sql`
      UPDATE submissions SET guruh_msg_id = ${xabar.message_id}
      WHERE id = ${natija.submissionId}
    `;
  });
}
