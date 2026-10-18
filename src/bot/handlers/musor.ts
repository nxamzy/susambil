/**
 * Musor navbati — Telegram tomoni (`core/musor.ts` mantig'i).
 *
 * Bu yerda faqat ulash: tugma, `/musor`, rasm va "🗑 Musor to'ldi". Qaror
 * `core/musor.ts` da, matnlar `bot/text.ts` da, eslatma va ertalabki e'lon
 * `jobs/reminders.ts` da.
 */
import type { Api, Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { User } from "../../db/index.js";
import { MUSOR_TURTKI_ORALIQ_SOAT } from "../../config.js";
import {
  elonniEgalla,
  elonniQaytar,
  elonYetdi,
  joriyMusorniTayinla,
  musorHisobi,
  musorniBajar,
  musorRasmiKeldi,
  ochiqNavbatniOl,
  turtkiniEgalla,
  type MusorKuniToliq,
} from "../../core/musor.js";
import { bugungiSana } from "../../core/vaqt.js";
import { guruhId, guruhgaYubor, kim, shaxsiy } from "../group.js";
import { musorTashladimKeyboard } from "../keyboards.js";
import { ESLATMA } from "../tozalash.js";
import {
  esc,
  kunlikMusorBajarildiGuruh,
  kunlikMusorGuruh,
  kunlikMusorShaxsiy,
  kunlikMusorTurtki,
  kunlikMusorTurtkiJavobi,
  musorHisobiMatni,
} from "../text.js";

/**
 * Navbatchi tashlagach guruhdagi o'z e'loni xabarini yangilaydi:
 * yangi xabar yozilmaydi (guruh to'lib ketmasin), eski xabar o'zgaradi va
 * tugma olinadi. Tahrirlab bo'lmasa (xabar o'chirilgan yoki e'lon hech
 * qachon guruhga chiqmagan) bitta yangi qator yuboriladi.
 */
async function guruhniYangila(api: Api, kun: MusorKuniToliq): Promise<void> {
  const matn = kunlikMusorBajarildiGuruh(kun, kun.bajarildi_ts ?? new Date(), kun.rasm_id !== null);
  const chat = await guruhId();
  if (chat && kun.guruh_msg_id) {
    const tahrir = await api
      .editMessageText(chat, kun.guruh_msg_id, matn, { parse_mode: "HTML" })
      .then(() => true)
      .catch(() => false);
    if (tahrir) return;
  }
  await guruhgaYubor(api, matn);
}

/** Ixtiyoriy rasm — guruhga e'longa javob sifatida chiqadi. */
async function rasmniGuruhga(api: Api, kun: MusorKuniToliq): Promise<void> {
  const chat = await guruhId();
  if (!chat || !kun.rasm_id) return;
  await api
    .sendPhoto(chat, kun.rasm_id, {
      caption: `📸 ${kun.ism} musorni tashlagani rasmi`,
      ...(kun.guruh_msg_id ? { reply_parameters: { message_id: kun.guruh_msg_id } } : {}),
    })
    .catch((e) => console.error("[musor] rasm guruhga yuborilmadi:", e instanceof Error ? e.message : e));
}

/**
 * Yangi navbatchining e'loni: guruhga "navbat kimda" + o'ziga DM, ikkalasida
 * ham "✅ Tashladim". "Tashladim" bosilganda DARROV (`register`) va yetmagan
 * e'lonni qayta urinish uchun `jobs/reminders.ts` dan chaqiriladi.
 *
 * `elonniEgalla` — bir vaqtda ikki joydan (tugma va eslatma tekshiruvi)
 * kelsa e'lon ikki marta ketmasin. Kamida bir joyga yetgach `elon_ts`
 * qo'yiladi; hech yerga yetmasa egallash bo'shatiladi va keyingi chaqiruv
 * qayta urinadi.
 *
 * @returns e'lon kamida bir joyga yetdi (yoki oldin yetgan edi)
 */
export async function navbatniElonQil(api: Api, kun: MusorKuniToliq): Promise<boolean> {
  if (kun.elon_ts) return true;
  if (!(await elonniEgalla(kun.id))) return false;

  const kb = musorTashladimKeyboard(kun.id);
  const [guruh, shaxsan] = await Promise.all([
    guruhgaYubor(api, kunlikMusorGuruh(kun, kun.sana), { reply_markup: kb }),
    shaxsiy(api, navbatchiUser(kun), kunlikMusorShaxsiy(kun.sana), { reply_markup: kb }, ESLATMA.musor),
  ]);
  if (guruh || shaxsan) {
    await elonYetdi(kun.id, guruh?.message_id ?? null);
    return true;
  }
  await elonniQaytar(kun.id);
  return false;
}

export function register(bot: Bot) {
  /**
   * "✅ Tashladim" — navbatchining shaxsiy xabarida ham, guruh e'lonida ham
   * bir xil tugma. Guruhdagi tugmani faqat o'sha navbatchi bosa oladi:
   * boshqa hech kim tasdiqlay olmaydi (va kerak ham emas).
   */
  bot.callbackQuery(/^musor_qildim:(\d+)$/, async (ctx) => {
    const u = await kim(ctx.from.id);
    if (!u) return ctx.answerCallbackQuery({ text: "Avval botga /start bosing.", show_alert: true });

    const n = await musorniBajar(Number(ctx.match[1]), u.id);
    if (!n.ok) {
      const matn =
        n.sabab === "boshqa_odam"
          ? "Bu musor navbati sizniki emas."
          : n.sabab === "allaqachon"
            ? "✅ Allaqachon tashlangan deb belgilangan."
            : n.sabab === "otkazildi"
              ? "Bu navbat o'tib ketgan — o'tkazib yuborilgan deb hisoblandi."
              : "Bu navbat topilmadi.";
      return ctx.answerCallbackQuery({ text: matn, show_alert: true });
    }

    await ctx
      .answerCallbackQuery({ text: n.keyingi ? `✅ Rahmat! Navbat ${n.keyingi.ism} ga o'tdi.` : "✅ Rahmat! Belgilandi." })
      .catch(() => {});
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    await guruhniYangila(ctx.api, n.kun);
    // Navbat shu zahoti keyingi odamga o'tadi — e'lon kutmasdan, hozir.
    if (n.keyingi) await navbatniElonQil(ctx.api, n.keyingi);
  });

  bot.command("musor", async (ctx) => {
    const joriy = await ochiqNavbatniOl();
    await ctx.reply(musorHisobiMatni(joriy, await musorHisobi(), bugungiSana()), { parse_mode: "HTML" });
  });
}

/**
 * Shaxsiy chatda kelgan rasm — navbatchining ochiq kuni bo'lsa rasm bilan
 * bajariladi ("tugma bosish shart emas"), yaqinda tugma bosgan bo'lsa
 * rasm shu kunga qo'shiladi. Aks holda jim — rasm hech nimaga bog'lanmaydi.
 */
export async function rasmKeldi(ctx: Context, u: User, fileId: string): Promise<void> {
  const n = await musorRasmiKeldi(u.id, fileId);
  if (!n) return;

  await ctx.reply(
    n.yangiBajarildi
      ? "✅ Musor tashlandi deb belgilandi, rasm guruhga yuborildi. Rahmat!"
      : "📸 Rasm guruhga yuborildi. Rahmat!",
  );
  if (n.yangiBajarildi) await guruhniYangila(ctx.api, n.kun);
  await rasmniGuruhga(ctx.api, n.kun);
  if (n.keyingi) await navbatniElonQil(ctx.api, n.keyingi);
}

/**
 * "🗑 Musor to'ldi" — endi joriy musor navbatchisiga turtki. Xona navbati
 * emas: kim tashlashi bugun ma'lum (`musor_kunlari`), shuning uchun xabar
 * bevosita o'sha odamga boradi. Eslatib turish `jobs/reminders.ts` da,
 * navbatning oxirgi kunidagi eslatmalar bilan.
 *
 * @returns javob ko'rsatildi (har doim `true`; eski signal yo'liga
 *          tushishning keragi yo'q)
 */
export async function musorToldi(ctx: Context, u: User): Promise<void> {
  const javob = async (html: string, alert: string) => {
    // Guruh panelidagi tugma — alert (guruh to'lib ketmasin), shaxsiyda — xabar.
    if (ctx.callbackQuery && ctx.chat?.type !== "private") {
      await ctx.answerCallbackQuery({ text: alert, show_alert: true }).catch(() => {});
      return;
    }
    if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(html, { parse_mode: "HTML" });
  };

  const kun = await joriyMusorniTayinla();
  if (!kun) {
    return javob(kunlikMusorTurtkiJavobi("ertalabgacha"), "Yangi navbatchi hali tayinlanmagan.");
  }

  if (kun.user_id === u.id) {
    return javob(kunlikMusorTurtkiJavobi("sizda"), "Musor navbati sizda — tashlab, «✅ Tashladim» ni bosing.");
  }
  if (!(await turtkiniEgalla(kun.id, MUSOR_TURTKI_ORALIQ_SOAT))) {
    return javob(kunlikMusorTurtkiJavobi("yaqinda", kun.ism), `${kun.ism} ga yaqinda eslatilgan — biroz kuting.`);
  }

  const yetdi = await shaxsiy(
    ctx.api,
    navbatchiUser(kun),
    kunlikMusorTurtki(u.ism),
    { reply_markup: musorTashladimKeyboard(kun.id) },
    ESLATMA.musor,
  );
  // Yetmasa ham javob "yuborildi" deyilmaydi: yolg'on va'da bermaymiz.
  return javob(
    yetdi
      ? kunlikMusorTurtkiJavobi("yuborildi", kun.ism)
      : `⚠️ <b>${esc(kun.ism)}</b> ga xabar yetmadi (botni ochmagan bo'lishi mumkin). Guruhda ayting.`,
    yetdi ? `✅ ${kun.ism} ga xabar yuborildi.` : `${kun.ism} ga xabar yetmadi — guruhda ayting.`,
  );
}

/** `shaxsiy()` faqat `telegram_id` va log uchun `id`/`ism` ni o'qiydi — kun qatorining o'zi yetadi. */
export function navbatchiUser(k: MusorKuniToliq): User {
  return { id: k.user_id, ism: k.ism, telegram_id: k.telegram_id, username: null, room_id: null, admin: false, faol: true };
}
