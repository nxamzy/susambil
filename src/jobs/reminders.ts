import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type Room, type User } from "../db/index.js";
import { config } from "../config.js";
import { faolNavbat, kechikkanKun, navbatFaolTopshirigi } from "../core/rotation.js";
import { guruhgaYubor, shaxsiy } from "../bot/group.js";
import { esc, ismlar, pul } from "../bot/text.js";

const SOAT_MS = 60 * 60_000;
const KUN_MS = 24 * SOAT_MS;

/** Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD). */
function bugun(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

/**
 * Navbatdagi xonaga o'z bot chatidan ochiladigan tugma — "Mening
 * Navbatim" paneli `handlers/navbat.ts` da, bu yerda faqat havola.
 */
function panelTugmasi(): InlineKeyboard {
  return new InlineKeyboard().text("👤 Mening Navbatim", "navbat_panel");
}

/**
 * ILGARI: bitta chaqiruv "1 kun qolganda" bir marta eslatardi, keyin
 * kuniga bir marta kechikish haqida ogohlantirardi. Bu Vercel Cron kuniga
 * FAQAT BIR MARTA ishga tushgani bilan (Hobby reja cheklovi — pullik
 * rejasiz tez-tez cron ishlatib bo'lmaydi) ishlardi, lekin 5 soatlik
 * chastota so'ralganda buzildi: kunlik chaqiruv bilan hech qachon "har 5
 * soatda" bo'lolmaydi.
 *
 * ILDIZ SABABI TUZATILDI shu tarzda:
 *  1) Bu funksiya endi necha marta chaqirilishidan qat'i nazar xavfsiz —
 *     "hozir kerakmi" ni har safar DB'dagi `oxirgi_eslatma` vaqtidan
 *     hisoblaydi (bitta "yuborildi" bayrog'iga bog'lanib qolmaydi).
 *  2) Tetiklovchi endi UCHTA joydan keladi (`api/cron.ts` kunlik Vercel
 *     Cron — zaxira, `.github/workflows/eslatma.yml` soatlik GitHub
 *     Actions ping — asosiy, `api/webhook.ts` har bot bilan muloqotda —
 *     qo'shimcha tezlashtiruvchi). Uchtasi ham shu bitta funksiyani
 *     chaqiradi, ikkinchi eslatma tizimi YARATILMAGAN.
 *
 * Ikki bosqich, ikki xil chastota:
 *  - `oxirgi_eslatma` — SHAXSIY eslatma, "oxirgi kun" boshlangandan
 *    (`config.eslatmaKuni`) e'tiboran har `config.eslatmaOraligiSoat`
 *    soatda navbatdagi xona a'zolariga, navbat yakunlanguncha davom etadi
 *    (muddat o'tib ketgan bo'lsa ham to'xtamaydi).
 *  - `oxirgi_ping` — GURUHGA kuniga bir marta, faqat muddat o'tib
 *    ketganda — bu ataylab 5 soatlikdan ALOHIDA: guruh har 5 soatda
 *    bezovta qilinmasin, lekin uy a'zolari umumiy holatdan xabardor bo'lsin.
 */
export async function eslatmalarniTekshir(api: Api): Promise<void> {
  const n = await faolNavbat();
  if (!n) return;

  const { turn, room, azolar } = n;
  const muddat = new Date(turn.muddat);
  const hozir = Date.now();

  // "Oxirgi kun" oynasi hali boshlanmagan — hali erta.
  if (hozir < muddat.getTime() - config.eslatmaKuni * KUN_MS) return;

  // Xona allaqachon (rad etilmagan holda) topshirgan — endi ularning
  // qo'lida emas, bezovta qilishning ma'nosi yo'q. Rad etilgan bo'lsa bu
  // shart `null` qaytaradi, ya'ni eslatma o'zidan o'zi davom etadi.
  if (await navbatFaolTopshirigi(turn.id)) return;

  await beshSoatlikEslatma(api, turn.id, room, azolar, muddat, hozir, turn.oxirgi_eslatma);

  if (hozir > muddat.getTime()) {
    await kunlikOgohlantirish(api, turn.id, room, azolar, muddat, hozir, turn.oxirgi_ping);
  }
}

async function beshSoatlikEslatma(
  api: Api,
  turnId: number,
  room: Room,
  azolar: User[],
  muddat: Date,
  hozir: number,
  oxirgiEslatma: Date | null,
): Promise<void> {
  const oxirgi = oxirgiEslatma ? new Date(oxirgiEslatma).getTime() : null;
  if (oxirgi !== null && hozir - oxirgi < config.eslatmaOraligiSoat * SOAT_MS) return;

  const kechikdi = kechikkanKun(muddat);
  const matn = [
    `🔔 <b>NAVBAT ESLATMASI</b>`,
    ``,
    kechikdi > 0
      ? `Muddat o'tib ketdi — <b>${kechikdi} kun kechikdingiz</b>.`
      : `Bugun navbatingizning oxirgi kuni.`,
    ``,
    `Hali bajarilmagan vazifalaringiz bor. Iltimos, tozalab,`,
    `dalil rasmlarini yuboring.`,
  ].join("\n");

  const natijalar = await Promise.all(
    azolar.map((a) => shaxsiy(api, a, matn, { reply_markup: panelTugmasi() })),
  );
  const birortaYetdi = natijalar.some(Boolean);
  // Hech kimga yetmasa (hammasi bloklagan/ulanmagan) vaqtni yangilamaymiz —
  // aks holda keyingi ${eslatmaOraligiSoat} soat behuda o'tib ketardi va
  // ular ulanganda ham qayta urinilmasdi.
  if (!birortaYetdi) return;

  // Birinchi marta shu oynaga kirganda — guruhga BIR MARTALIK e'lon.
  if (oxirgi === null) {
    await guruhgaYubor(
      api,
      [
        `🔄 <b>JORIY NAVBAT</b>`,
        ``,
        `👤 ${esc(ismlar(azolar))}`,
        `🏠 ${room.raqam}-xona`,
        `📅 Oxirgi kun: ${kechikdi > 0 ? "muddat o'tib ketgan" : "bugun"}`,
      ].join("\n"),
    );
  }

  await sql`UPDATE turns SET oxirgi_eslatma = now() WHERE id = ${turnId}`;
}

async function kunlikOgohlantirish(
  api: Api,
  turnId: number,
  room: Room,
  azolar: User[],
  muddat: Date,
  hozir: number,
  oxirgiPing: Date | null,
): Promise<void> {
  const kun = bugun();
  const oxirgi = oxirgiPing
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(oxirgiPing))
    : null;
  if (oxirgi === kun) return;

  const kechikdi = kechikkanKun(muddat);
  const matn = [
    `🔴 <b>${room.raqam}-xona kechikdi — ${kechikdi} kun</b>`,
    ``,
    `👤 ${esc(ismlar(azolar))}`,
    `💸 Hozircha jarima: <b>${pul(kechikdi * config.jarimaKunlik)}</b>`,
    ``,
    `Har o'tgan kun uchun yana ${pul(config.jarimaKunlik)} qo'shiladi.`,
    `Navbat siz tugatmaguningizcha keyingi xonaga o'tmaydi.`,
  ].join("\n");

  const guruhga = await guruhgaYubor(api, matn);

  // Faqat guruhga yetganda "bugun yuborildi" deb belgilaymiz, aks holda
  // ertaga emas, shu kunning o'zida keyingi chaqiruvda qayta urinilishi kerak.
  if (guruhga) await sql`UPDATE turns SET oxirgi_ping = ${kun}::date WHERE id = ${turnId}`;
}
