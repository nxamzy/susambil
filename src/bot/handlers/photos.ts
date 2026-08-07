import type { Bot, Api } from "grammy";
import type { InputMediaPhoto } from "grammy/types";
import { sql, type Room, type User } from "../../db/index.js";
import { config } from "../../config.js";
import { faolNavbat } from "../../core/rotation.js";
import { guruhId, kim } from "../group.js";
import { tasdiqKeyboard } from "../keyboards.js";
import { tasdiqXabari } from "../text.js";
import { xarajatHolati } from "../state.js";

/** Bir necha rasm ketma-ket kelganda ularni bitta to'plamga yig'ish oynasi (ms). */
const BUFER_MS = 8_000;
/** Yetmagan rasmlar shuncha vaqt kutib turadi. */
const KUTISH_MS = 10 * 60_000;

type Bufer = { rasmlar: string[]; timer: NodeJS.Timeout; chatId: number };
const buferlar = new Map<number, Bufer>();

type Kutayotgan = { rasmlar: string[]; vaqt: number };
const kutayotgan = new Map<number, Kutayotgan>();

function kalitTozala(userId: number) {
  const k = kutayotgan.get(userId);
  if (k && Date.now() - k.vaqt > KUTISH_MS) kutayotgan.delete(userId);
}

export function register(bot: Bot) {
  bot.on("message:photo", async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) return next();

    // Xarajat kiritish jarayonida bo'lsa — bu rasm o'sha yerga tegishli
    if (ctx.chat.type === "private" && xarajatHolati(fromId)) return next();

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

    kalitTozala(u.id);
    const rejalash = () =>
      setTimeout(() => void yakunla(ctx.api, u, navbat.room, navbat.turn.id), BUFER_MS);

    const mavjud = buferlar.get(u.id);
    if (mavjud) {
      clearTimeout(mavjud.timer);
      mavjud.rasmlar.push(eng.file_id);
      mavjud.chatId = ctx.chat.id;
      mavjud.timer = rejalash();
    } else {
      buferlar.set(u.id, {
        rasmlar: [eng.file_id],
        chatId: ctx.chat.id,
        timer: rejalash(),
      });
    }
  });
}

async function yakunla(api: Api, u: User, room: Room, turnId: number) {
  const bufer = buferlar.get(u.id);
  buferlar.delete(u.id);
  if (!bufer) return;

  const oldingi = kutayotgan.get(u.id)?.rasmlar ?? [];
  const hammasi = [...oldingi, ...bufer.rasmlar];

  if (hammasi.length < config.minRasm) {
    kutayotgan.set(u.id, { rasmlar: hammasi, vaqt: Date.now() });
    const yana = config.minRasm - hammasi.length;
    // Javobni odam rasm tashlagan joyga yozamiz
    await api.sendMessage(
      bufer.chatId,
      `📷 ${u.ism}: ${hammasi.length} ta rasm qabul qilindi, yana ${yana} ta kerak.`,
    ).catch(() => {});
    return;
  }

  kutayotgan.delete(u.id);

  // Navbat oradan o'zgarib ketmaganini tekshiramiz
  const [turn] = await sql<{ id: number; holat: string }[]>`
    SELECT id, holat FROM turns WHERE id = ${turnId}
  `;
  if (!turn || turn.holat !== "faol") return;

  const [sub] = await sql<{ id: number }[]>`
    INSERT INTO submissions (turn_id, user_id, photo_ids)
    VALUES (${turnId}, ${u.id}, ${hammasi})
    RETURNING id
  `;
  if (!sub) return;

  const chatId = await guruhId();
  if (!chatId) return;

  const media: InputMediaPhoto[] = hammasi
    .slice(0, 10)
    .map((file_id) => ({ type: "photo", media: file_id }));

  await api.sendMediaGroup(chatId, media);

  const xabar = await api.sendMessage(
    chatId,
    tasdiqXabari(room, u.ism, [], config.kerakliTasdiq),
    { parse_mode: "HTML", reply_markup: tasdiqKeyboard(sub.id, 0, config.kerakliTasdiq) },
  );

  await sql`UPDATE submissions SET guruh_msg_id = ${xabar.message_id} WHERE id = ${sub.id}`;
}
