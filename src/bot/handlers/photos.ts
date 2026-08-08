import type { Bot, Context } from "grammy";
import type { InputMediaPhoto } from "grammy/types";
import { sql, type User } from "../../db/index.js";
import { config, ISH_TURLARI, type IshTuri } from "../../config.js";
import { faolNavbat } from "../../core/rotation.js";
import { rasmQabulQil } from "../../core/photobuffer.js";
import { guruhId, kim } from "../group.js";
import { tasdiqKeyboard, bekorKeyboard } from "../keyboards.js";
import { tasdiqXabari, topshiriqXabari } from "../text.js";
import { topshiriqYarat } from "../../core/topshiriq.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";

/**
 * Rasm uch xil maqsadda kelishi mumkin. Tartib muhim:
 *   1) qo'shimcha ish tasdig'i (tugma bosilgan, rasm kutilyapti)
 *   2) yangi xarajat rasmi — faqat shaxsiy chatda
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
      if ("qadam" in holat && holat.qadam === "izoh") {
        await ctx.reply("✍️ Avval nima qilganingizni yozing.");
        return;
      }
      await sorovniOchir(ctx.api, holat);
      return ishniYakunla(ctx, u, holat.ish, holat.izoh ?? null, eng.file_id);
    }

    // Xarajat oqimi faqat shaxsiy chatda. Aks holda odam botda xarajat
    // boshlab, guruhga tozalash rasmini tashlasa — birinchi rasm xarajatga
    // ketib qolardi.
    if (holat?.tur === "xarajat" && holat.qadam === "rasm" && ctx.chat.type === "private") {
      await sorovniOchir(ctx.api, holat);
      const yangi = { tur: "xarajat", qadam: "izoh", photoId: eng.file_id } as const;
      await holatOrnat(fromId, yangi);
      const xabar = await ctx.reply(
        [
          `✍️ <b>Nima olib keldingiz?</b>`,
          ``,
          `<i>Bir nechta narsa bo'lsa hammasini yozing:</i>`,
          `<code>Fayri, gubka, qop-qog'oz</code>`,
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: bekorKeyboard() },
      );
      await sorovniEslat(fromId, yangi, xabar.chat.id, xabar.message_id);
      return;
    }

    await navbatRasmi(ctx, u, eng.file_id);
  });
}

/**
 * Qo'shimcha ish rasmi keldi. Ilgari shu yerda darrov ball berilardi; endi
 * topshiriq guruhga tasdiqqa chiqadi va ball faqat tasdiqdan keyin beriladi.
 */
async function ishniYakunla(
  ctx: Context,
  u: User,
  ish: IshTuri,
  izoh: string | null,
  photoId: string,
) {
  const t = ISH_TURLARI[ish];
  const sub = await topshiriqYarat(u.id, { tur: "ish", ish, izoh }, [photoId]);
  if (ctx.from) await holatTozala(ctx.from.id);

  await ctx.reply(
    [
      `${t.emoji} <b>Qabul qildim.</b>`,
      ``,
      `Guruhga tasdiqqa qo'ydim — <b>${config.kerakliTasdiq} kishi</b> bosgach`,
      `<b>+${t.ball} ball</b> qo'shiladi.`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );

  const guruh = await guruhId();
  if (!guruh) return;

  const xabar = await ctx.api.sendPhoto(guruh, photoId, {
    caption: topshiriqXabari(sub, u.ism, [], config.kerakliTasdiq),
    parse_mode: "HTML",
    reply_markup: tasdiqKeyboard(sub.id, 0, config.kerakliTasdiq),
  });

  await sql`UPDATE submissions SET guruh_msg_id = ${xabar.message_id} WHERE id = ${sub.id}`;
}

async function navbatRasmi(ctx: Context, u: User, fileId: string) {
  const navbat = await faolNavbat();
  if (!navbat) return;

  if (u.room_id !== navbat.room.id) {
    if (ctx.chat?.type === "private") {
      await ctx.reply(`Hozir navbat ${navbat.room.raqam}-xonada. Rasmingiz hisobga olinmadi.`);
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
    await ctx.reply(`📷 ${natija.soni} ta rasm qabul qilindi — yana <b>${yana} ta</b> kerak.`, {
      parse_mode: "HTML",
    });
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
