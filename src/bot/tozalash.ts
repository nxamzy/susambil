/**
 * Shaxsiy chatni TOZA tutish — endi kerak bo'lmagan bot xabarlari o'chadi.
 *
 * MUAMMO: chat bo'limdan bo'limga o'tilgan sari to'lib ketardi. `korishXabar`
 * (`group.ts`) faqat menyudagi sakkizta ko'rinishni almashtirardi; "Mening
 * navbatim", admin panel, "Musor to'ldi", buyruqlar javobi va inline
 * tugmalardan kelgan har xabar esa chatda qolib ketardi. Har handlerga
 * alohida "eskisini o'chir" yozish o'rniga — bitta middleware:
 *
 *  1. Shaxsiy chatdagi HAR yangilanishda bot SHU chatga yuborgan xabarlar
 *     API transformer orqali yoziladi (`ekran` ro'yxati). Handler hech narsa
 *     bilmaydi — keyin qo'shiladigan handler ham o'zidan qamraladi.
 *  2. Odam BOSHQA BO'LIMGA o'tsa (pastki menyu tugmasi yoki buyruq —
 *     `bolimTugmasimi`) oldingi bo'limning hamma xabari o'chadi, yangisi
 *     qoladi: "eskisi o'chib, yangisi kelsin".
 *
 * Nima O'CHMAYDI:
 *  - fon xabarlari (eslatma, e'lon) — ular `bot.api` dan ketadi, bu
 *    transformerdan o'tmaydi. O'z turidagi KEYINGI xabar kelganda almashadi
 *    (`eslatmaniAlmashtir`);
 *  - boshqalarga xabar (`shaxsiy()`, adminlarga chek/shikoyat) — `tozalanmasin`
 *    ichida yuboriladi. Aks holda to'lov qilgan ADMINning o'z chatiga kelgan
 *    "tasdiqlash" so'rovi u menyuni bosishi bilan yo'qolardi;
 *  - pastki menyuni olib yurgan xabar — faqat YANGISI yuborilgach eskisi
 *    o'chadi (`menyu`), menyu bir lahza ham yo'qolmasin;
 *  - tirik jarayonning so'rov xabari (`flow_state.sorov`) — u tugaganda
 *    `sorovniOchir` o'zi o'chiradi;
 *  - odamning o'z rasmlari va matnlari — faqat buyruq yozuvi o'chadi
 *    (menyu tugmasi yozuvini `messages.ts` darrov o'chiradi).
 *
 * Telegram 48 soatdan eski xabarni o'chirmaydi — `deleteMessages` ularni jim
 * o'tkazib yuboradi, ro'yxat esa baribir bo'shaydi.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Api, Context, MiddlewareFn } from "grammy";
import { sql } from "../db/index.js";
import { bolimTugmasimi } from "./keyboards.js";
import { holatOl } from "./state.js";

/** Bitta ro'yxatda eslab qolinadigan eng ko'p xabar — undan eskisi baribir 48 soatdan o'tgan bo'ladi. */
const ESLAB_MAX = 100;

/** `deleteMessages` bir chaqiruvda shuncha id oladi (Telegram cheklovi). */
const OCHIRISH_BOLAK = 100;

/** Natijasi yangi xabar bo'lgan Bot API usullari. */
const YUBORISH = new Set([
  "sendMessage", "sendPhoto", "sendDocument", "sendVideo", "sendAnimation", "sendAudio",
  "sendVoice", "sendSticker", "sendMediaGroup", "sendLocation", "sendContact", "sendPoll",
  "copyMessage", "forwardMessage",
]);

/**
 * `shaxsiy(..., almashtir)` turlari: bir tur ichida odamning chatida faqat
 * OXIRGI eslatma turadi. Turlar ataylab alohida — to'lov eslatmasi musor
 * eslatmasini o'chirib yubormasin.
 */
export const ESLATMA = {
  musor: "musor",
  tolov: "tolov",
  yigim: "yigim",
  navbat: "navbat",
  oraliq: "oraliq",
  signal: "signal",
} as const;

const yozmaslik = new AsyncLocalStorage<true>();

/**
 * `fn` ichida yuborilgan xabarlar `ekran`ga YOZILMAYDI, ya'ni bo'lim
 * almashganda o'chmaydi. Bu — bildirishnomalar uchun: ular javob emas,
 * odamga (yoki adminga) yetkazilgan yangilik.
 */
export function tozalanmasin<T>(fn: () => Promise<T>): Promise<T> {
  return yozmaslik.run(true, fn);
}

/** Pastki menyuni o'rnatadigan yoki olib tashlaydigan xabar. */
function menyuXabarimi(payload: Record<string, unknown>): boolean {
  const rm = payload.reply_markup;
  return typeof rm === "object" && rm !== null && ("keyboard" in rm || "remove_keyboard" in rm);
}

async function ochir(api: Api, chatId: number, idlar: number[]): Promise<void> {
  for (let i = 0; i < idlar.length; i += OCHIRISH_BOLAK) {
    await api.deleteMessages(chatId, idlar.slice(i, i + OCHIRISH_BOLAK)).catch(() => {});
  }
}

/** Ro'yxatni ATOMIK oladi va bo'shatadi — parallel yangilanish bir xabarni ikki marta o'chirmasin. */
async function ol(chatId: number, kalit: string): Promise<number[]> {
  const [r] = await sql<{ xabarlar: number[] }[]>`
    DELETE FROM bot_xabarlari WHERE chat_id = ${chatId} AND kalit = ${kalit}
    RETURNING xabarlar
  `;
  return r?.xabarlar ?? [];
}

/** Ro'yxat oxiriga qo'shadi (o'qib-yozmasdan — parallel yangilanishlar bir-birini yemasin). */
async function qosh(chatId: number, kalit: string, idlar: number[]): Promise<void> {
  if (idlar.length === 0) return;
  await sql`
    INSERT INTO bot_xabarlari (chat_id, kalit, xabarlar)
    VALUES (${chatId}, ${kalit}, ${idlar}::int[])
    ON CONFLICT (chat_id, kalit) DO UPDATE SET
      xabarlar = (bot_xabarlari.xabarlar || EXCLUDED.xabarlar)[
        greatest(1, cardinality(bot_xabarlari.xabarlar) + cardinality(EXCLUDED.xabarlar) - ${ESLAB_MAX - 1}):
      ],
      yangilandi = now()
  `;
}

/**
 * Bir turdagi eslatmaning eskisini o'chiradi, yangisini eslab qoladi —
 * chatda har turdan bitta, eng oxirgisi turadi. Har 5 soatlik to'lov
 * eslatmasi ilgari ustma-ust yig'ilib borardi. HECH QACHON xato tashlamaydi:
 * eslatma allaqachon yetkazilgan, tozalash — qo'shimcha.
 */
export async function eslatmaniAlmashtir(api: Api, chatId: number, tur: string, msgId: number): Promise<void> {
  try {
    const kalit = `eslatma:${tur}`;
    const eski = await ol(chatId, kalit);
    await qosh(chatId, kalit, [msgId]);
    await ochir(api, chatId, eski.filter((id) => id !== msgId));
  } catch (e) {
    console.error("[tozalash] eslatma almashtirilmadi:", e instanceof Error ? e.message : e);
  }
}

/** `botYarat()` dagi xato chegarasidan KEYIN, hamma handlerdan OLDIN ulanadi. */
export function chatTozalash(): MiddlewareFn<Context> {
  return async (ctx, next) => {
    if (ctx.chat?.type !== "private") return next();
    const chatId = ctx.chat.id;
    const ekran: number[] = [];
    const menyu: number[] = [];

    ctx.api.config.use(async (prev, method, payload, signal) => {
      const javob = await prev(method, payload, signal);
      const p = payload as Record<string, unknown>;
      if (javob.ok && YUBORISH.has(method) && Number(p.chat_id) === chatId && !yozmaslik.getStore()) {
        const natija: unknown = javob.result;
        const joy = menyuXabarimi(p) ? menyu : ekran;
        for (const m of Array.isArray(natija) ? natija : [natija]) {
          const id = (m as { message_id?: unknown } | null)?.message_id;
          if (typeof id === "number") joy.push(id);
        }
      }
      return javob;
    });

    const matn = ctx.message?.text;
    const almashdi = matn !== undefined && bolimTugmasimi(matn);
    if (ctx.message && matn?.startsWith("/")) ekran.push(ctx.message.message_id);

    // Oldingi bo'lim AVVAL olinadi: shu yangilanish va undan keyin kelganlar
    // yangi bo'limga tegishli, ular o'chirilmasin.
    const eski = almashdi ? await ol(chatId, "ekran").catch(() => [] as number[]) : [];

    try {
      await next();
    } finally {
      await saqla(ctx.api, chatId, ekran, menyu, eski).catch((e) =>
        console.error("[tozalash] chat tozalanmadi:", e instanceof Error ? e.message : e),
      );
    }
  };
}

async function saqla(api: Api, chatId: number, ekran: number[], menyu: number[], eski: number[]): Promise<void> {
  // Pastki menyu: yangisi chiqqandagina eskisi o'chadi — oxirgisi qoladi.
  const oxirgiMenyu = menyu.at(-1);
  if (oxirgiMenyu !== undefined) {
    const eskiMenyu = await ol(chatId, "menyu");
    await qosh(chatId, "menyu", [oxirgiMenyu]);
    await ochir(api, chatId, [...eskiMenyu, ...menyu.slice(0, -1)]);
  }

  await qosh(chatId, "ekran", ekran);
  if (eski.length === 0) return;

  // Shaxsiy chatda chat id = Telegram user id (`flow_state.telegram_id`).
  const sorov = (await holatOl(chatId))?.sorov?.msgId;
  await qosh(chatId, "ekran", eski.filter((id) => id === sorov));
  await ochir(api, chatId, eski.filter((id) => id !== sorov));
}
