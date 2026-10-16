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
  bugungiMusorniTayinla,
  navbatniOl,
  musorHisobi,
  musorniBajar,
  musorRasmiKeldi,
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
  kunlikMusorTurtki,
  kunlikMusorTurtkiJavobi,
  musorHisobiMatni,
} from "../text.js";

/**
 * Navbatchi tashlagach guruhdagi ertalabgi e'lon xabarini yangilaydi:
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

    await ctx.answerCallbackQuery({ text: "✅ Rahmat! Belgilandi." }).catch(() => {});
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    await guruhniYangila(ctx.api, n.kun);
  });

  bot.command("musor", async (ctx) => {
    const joriy = await navbatniOl(bugungiSana());
    await ctx.reply(musorHisobiMatni(joriy, await musorHisobi()), { parse_mode: "HTML" });
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

  const b = await bugungiMusorniTayinla();
  if (!b) {
    return javob(kunlikMusorTurtkiJavobi("ertalabgacha"), "Yangi navbatchi hali tayinlanmagan.");
  }
  const kun = b.kun;

  if (kun.holat === "bajarildi") {
    return javob(kunlikMusorTurtkiJavobi("bajarilgan", kun.ism), `Bu navbatda musorni ${kun.ism} allaqachon tashlagan.`);
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
function navbatchiUser(k: MusorKuniToliq): User {
  return { id: k.user_id, ism: k.ism, telegram_id: k.telegram_id, username: null, room_id: null, admin: false, faol: true };
}
