import type { Bot, Context } from "grammy";
import type { InputMediaPhoto } from "grammy/types";
import { sql, type User } from "../../db/index.js";
import { config, ISH_TURLARI, type IshTuri } from "../../config.js";
import { faolNavbat } from "../../core/rotation.js";
import { rasmQabulQil } from "../../core/photobuffer.js";
import { guruhId, kim } from "../group.js";
import { tasdiqKeyboard, bekorKeyboard } from "../keyboards.js";
import { tasdiqXabari, esc } from "../text.js";
import { holatOl, holatOrnat, holatTozala } from "../state.js";

/**
 * Rasm uch xil maqsadda kelishi mumkin. Tartib muhim:
 *   1) qo'shimcha ish tasdig'i (tugma bosilgan, rasm kutilyapti)
 *   2) yangi xarajat rasmi
 *   3) navbatdagi xonaning tozalash rasmi
 */
export function register(bot: Bot) {
  bot.on("message:photo", async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId) return;

    const eng = ctx.message.photo.at(-1);
    if (!eng) return;

    const u = await kim(fromId);
    if (!u) {
      if (ctx.chat.type === "private") {
        await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
      }
      return;
    }

    const holat = await holatOl(fromId);

    if (holat?.tur === "ish") {
      return ishniYakunla(ctx, u, holat.ish, eng.file_id);
    }

    if (holat?.tur === "xarajat" && holat.qadam === "rasm") {
      await holatOrnat(fromId, { tur: "xarajat", qadam: "izoh", photoId: eng.file_id });
      await ctx.reply(
        "✍️ Nima olib keldingiz?\n\n" +
          "<i>Bir nechta narsa bo'lsa hammasini yozing, masalan:</i>\n" +
          "<code>Fayri, gubka, qop-qog'oz</code>",
        { parse_mode: "HTML", reply_markup: bekorKeyboard() },
      );
      return;
    }

    await navbatRasmi(ctx, u, eng.file_id);
  });
}

async function ishniYakunla(ctx: Context, u: User, ish: IshTuri, photoId: string) {
  const t = ISH_TURLARI[ish];
  await sql`INSERT INTO chores (user_id, tur, photo_id) VALUES (${u.id}, ${ish}, ${photoId})`;
  if (ctx.from) await holatTozala(ctx.from.id);

  const matn =
    `${t.emoji} <b>${esc(u.ism)}</b> ${t.matn}.\n\n` + `🏅 <b>+${t.ball} ball</b>`;

  const guruh = await guruhId();
  const guruhdaYuborilgan = ctx.chat?.id === guruh;

  if (guruhdaYuborilgan) {
    // Rasm allaqachon guruhda ko'rinib turibdi — qayta yubormaymiz
    await ctx.reply(matn, { parse_mode: "HTML" });
  } else {
    await ctx.reply(`${t.emoji} Yozib qo'ydim — <b>+${t.ball} ball</b>`, { parse_mode: "HTML" });
    if (guruh) {
      await ctx.api.sendPhoto(guruh, photoId, { caption: matn, parse_mode: "HTML" });
    }
  }
}

async function navbatRasmi(ctx: Context, u: User, fileId: string) {
  const navbat = await faolNavbat();
  if (!navbat) return;

  if (u.room_id !== navbat.room.id) {
    if (ctx.chat?.type === "private") {
      await ctx.reply(
        `Hozir navbat ${navbat.room.raqam}-xonada. Rasmingiz hisobga olinmadi.`,
      );
    }
    return;
  }

  const natija = await rasmQabulQil(
    navbat.turn.id,
    u.id,
    ctx.chat!.id,
    fileId,
    ctx.message?.media_group_id ?? null,
  );

  if (natija.holat === "kutilyapti") {
    const yana = natija.kerak - natija.soni;
    await ctx.reply(`📷 ${natija.soni} ta rasm qabul qilindi, yana ${yana} ta kerak.`);
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
}
