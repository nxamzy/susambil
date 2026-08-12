import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type Room, type TolovSikl, type User } from "../db/index.js";
import { config } from "../config.js";
import { faolNavbat, kechikkanKun, navbatFaolTopshirigi } from "../core/rotation.js";
import {
  eslatmaBelgila,
  eslatmaNomzodlari,
  guruhEslatmasiniBelgila,
  joriySikl,
  muddatiOtganSikllar,
  siklMuddatiniHisobla,
  tolovDashboard,
  tolovEslatmasiKerakmi,
  type MuddatSurati,
} from "../core/tolov.js";
import { bugungiSana, kunFarqi } from "../core/vaqt.js";
import { guruhgaYubor, shaxsiy } from "../bot/group.js";
import {
  esc,
  ismlar,
  pul,
  tolovEslatmaXabari,
  tolovGuruhEslatmasi,
  tolovMuddatGuruhXabari,
  tolovMuddatXabari,
} from "../bot/text.js";

const SOAT_MS = 60 * 60_000;
const KUN_MS = 24 * SOAT_MS;

/**
 * Navbatdagi xonaga o'z bot chatidan ochiladigan tugma — "Mening
 * Navbatim" paneli `handlers/navbat.ts` da, bu yerda faqat havola.
 */
function panelTugmasi(): InlineKeyboard {
  return new InlineKeyboard().text("👤 Mening Navbatim", "navbat_panel");
}

/** To'lov eslatmasidan to'g'ridan-to'g'ri to'lov oqimiga o'tish uchun. */
function tolovTugmasi(): InlineKeyboard {
  return new InlineKeyboard().text("💳 To'lov qilish", "tolov_boshla");
}

/**
 * Barcha eslatmalarning YAGONA kirish nuqtasi.
 *
 * ILGARI: bitta chaqiruv "1 kun qolganda" bir marta eslatardi, keyin
 * kuniga bir marta kechikish haqida ogohlantirardi. Bu Vercel Cron kuniga
 * FAQAT BIR MARTA ishga tushgani bilan (Hobby reja cheklovi — pullik
 * rejasiz tez-tez cron ishlatib bo'lmaydi) ishlardi, lekin 5 soatlik
 * chastota so'ralganda buzildi: kunlik chaqiruv bilan hech qachon "har 5
 * soatda" bo'lolmaydi.
 *
 * ILDIZ SABABI TUZATILDI shu tarzda:
 *  1) Bu funksiya endi necha marta chaqirilishidan qat'i nazar xavfsiz —
 *     "hozir kerakmi" ni har safar DB'dagi oxirgi yuborish vaqtidan
 *     hisoblaydi (bitta "yuborildi" bayrog'iga bog'lanib qolmaydi).
 *  2) Tetiklovchi UCHTA joydan keladi (`api/cron.ts` kunlik Vercel
 *     Cron — zaxira, `.github/workflows/eslatma.yml` soatlik GitHub
 *     Actions ping — asosiy, `api/webhook.ts` har bot bilan muloqotda —
 *     qo'shimcha tezlashtiruvchi). Uchtasi ham shu bitta funksiyani
 *     chaqiradi, ikkinchi eslatma tizimi YARATILMAGAN.
 *
 * KVARTIRA TO'LOVI ham shu yerdan yuriladi — o'z rejalashtiruvchisi yo'q,
 * o'sha uchta tetiklovchining ustiga qo'shildi. Ikki bo'lim bir-biridan
 * mustaqil: biri xato bersa, ikkinchisi baribir ishlaydi.
 */
export async function eslatmalarniTekshir(api: Api): Promise<void> {
  await navbatEslatmalari(api).catch((e) => console.error("[eslatma] navbat xatosi:", e));
  await tolovEslatmalari(api).catch((e) => console.error("[eslatma] to'lov xatosi:", e));
}

// ---------------------------------------------------------------------------
// NAVBAT
// ---------------------------------------------------------------------------

/**
 * Ikki bosqich, ikki xil chastota:
 *  - `oxirgi_eslatma` — SHAXSIY eslatma, "oxirgi kun" boshlangandan
 *    (`config.eslatmaKuni`) e'tiboran har `config.eslatmaOraligiSoat`
 *    soatda navbatdagi xona a'zolariga, navbat yakunlanguncha davom etadi
 *    (muddat o'tib ketgan bo'lsa ham to'xtamaydi).
 *  - `oxirgi_ping` — GURUHGA kuniga bir marta, faqat muddat o'tib
 *    ketganda — bu ataylab 5 soatlikdan ALOHIDA: guruh har 5 soatda
 *    bezovta qilinmasin, lekin uy a'zolari umumiy holatdan xabardor bo'lsin.
 */
async function navbatEslatmalari(api: Api): Promise<void> {
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
  const kun = bugungiSana();
  const oxirgi = oxirgiPing ? bugungiSana(new Date(oxirgiPing)) : null;
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

// ---------------------------------------------------------------------------
// KVARTIRA TO'LOVI
// ---------------------------------------------------------------------------

/**
 * Muddati o'tgan sikl suratga olinganda e'lon qilinadimi.
 *
 * Migratsiyadan keyingi birinchi ishga tushishda eski oylarning sikllari
 * ham suratga olinadi (tarix to'lsin uchun) — lekin ular haqida bir necha
 * oydan keyin xabar yuborish mantiqsiz. Shuning uchun faqat yaqinda o'tgan
 * muddat e'lon qilinadi.
 */
const ESLATISH_OYNASI_KUN = 7;

async function tolovEslatmalari(api: Api): Promise<void> {
  const bugun = bugungiSana();

  // 1) Muddati kelgan sikllarni suratga olamiz. Surat bir marta olinadi
  //    (`siklMuddatiniHisobla` qulflab tekshiradi), demak e'lon ham
  //    takrorlanmaydi.
  for (const sikl of await muddatiOtganSikllar(bugun)) {
    const natijalar = await siklMuddatiniHisobla(sikl);
    if (!natijalar) continue;
    if (kunFarqi(sikl.muddat, bugun) > ESLATISH_OYNASI_KUN) continue;

    await muddatNatijasiniElonQil(api, sikl, natijalar);
    // Bugun guruh yakuniy xabarni oldi — pastdagi umumiy eslatma shu kuni
    // takrorlanmasin. Alohida bayroq shart emas, mavjud kunlik guruh
    // qulfining o'zi yetadi.
    await guruhEslatmasiniBelgila(sikl.id, bugun);
  }

  // 2) Joriy sikl bo'yicha eslatmalar. `joriySikl()` yangi oy kelganda
  //    siklni o'zi yaratadi — alohida "oy boshlandi" jarayoni kerak emas.
  const sikl = await joriySikl();
  await shaxsiyTolovEslatmalari(api, sikl, bugun);
  await guruhTolovEslatmasi(api, sikl, bugun);
}

/** Muddat kelganda: har kimga o'z natijasi, guruhga umumiy yakun. */
async function muddatNatijasiniElonQil(
  api: Api,
  sikl: TolovSikl,
  natijalar: MuddatSurati[],
): Promise<void> {
  const odamlar = await sql<User[]>`SELECT * FROM users WHERE faol AND telegram_id IS NOT NULL`;

  for (const n of natijalar) {
    const u = odamlar.find((o) => o.id === n.userId);
    if (!u) continue;
    await shaxsiy(api, u, tolovMuddatXabari(sikl, n), {
      reply_markup: n.qoldiq > 0 ? tolovTugmasi() : undefined,
    });
  }

  await guruhgaYubor(api, tolovMuddatGuruhXabari(sikl, natijalar));
}

/**
 * Qarzi borlarga kuniga bir marta shaxsiy eslatma. To'liq to'lagan odam
 * ro'yxatga umuman tushmaydi — talab: "Fully paid user stops receiving
 * reminders".
 */
async function shaxsiyTolovEslatmalari(
  api: Api,
  sikl: TolovSikl,
  bugun: string,
): Promise<void> {
  // Oyna hali ochilmagan bo'lsa hech kimga kerak emas — bu tekshiruv
  // ataylab so'rovdan OLDIN: bu funksiya har bir Telegram yangilanishida
  // chaqiriladi, oyning ko'p kunida esa hech narsa qilmasligi kerak.
  const qolganKun = kunFarqi(bugun, sikl.muddat);
  if (qolganKun > config.tolovEslatmaKuni) return;

  const nomzodlar = await eslatmaNomzodlari(sikl);

  for (const n of nomzodlar) {
    const kerak = tolovEslatmasiKerakmi({
      qoldiq: n.qoldiq,
      bugun,
      muddat: sikl.muddat,
      oxirgiEslatma: n.oxirgiEslatma,
      eslatmaKuni: config.tolovEslatmaKuni,
    });
    if (!kerak) continue;

    const yetdi = await shaxsiy(api, n.user, tolovEslatmaXabari(sikl, n, qolganKun), {
      reply_markup: tolovTugmasi(),
    });
    // Faqat yetkazilganda belgilaymiz — aks holda bloklangan/o'chirilgan
    // hisob tufayli kun "eslatilgan" bo'lib qolib, tuzatilgach ham qayta
    // urinilmasdi (navbat eslatmasidagi bilan bir xil ehtiyot chorasi).
    if (yetdi) await eslatmaBelgila(sikl.id, n.userId, bugun);
  }
}

/**
 * Guruhga umumiy eslatma. Ataylab kuniga bir martadan ham kam: oyna
 * ochilgan kuni, muddat kuni, va muddatdan keyin qarz qolgan har kuni.
 * Oradagi kunlarda guruh bezovta qilinmaydi — shaxsiy eslatma bor.
 *
 * Guruhga hech qanday chek rasmi, karta yoki shaxsiy dalil chiqmaydi —
 * faqat umumiy summa va muddat (mavjud guruh ko'rinish qoidalari
 * o'zgarmagan).
 */
async function guruhTolovEslatmasi(
  api: Api,
  sikl: TolovSikl,
  bugun: string,
): Promise<void> {
  // Avval faqat SANA shartlari — bularni tekshirish uchun so'rov kerak
  // emas. `qarzdorBor: true` deb qo'yamiz, chunki bu bosqichda haqiqiy
  // javob hali noma'lum; kun to'g'ri kelmasa baribir chiqib ketamiz va
  // dashboard so'rovi umuman bajarilmaydi.
  const kunMos = guruhEslatmasiKerakmi({
    bugun,
    muddat: sikl.muddat,
    oxirgiEslatma: sikl.guruh_eslatma,
    eslatmaKuni: config.tolovEslatmaKuni,
    qarzdorBor: true,
  });
  if (!kunMos) return;

  const d = await tolovDashboard(sikl);
  if (d.odamlar.every((o) => o.qoldiq === 0)) return;

  const yetdi = await guruhgaYubor(api, tolovGuruhEslatmasi(d, kunFarqi(bugun, sikl.muddat)));
  if (yetdi) await guruhEslatmasiniBelgila(sikl.id, bugun);
}

/**
 * Guruhga bugun eslatma yuborilsinmi — sof funksiya, `core/tolov.ts`dagi
 * `tolovEslatmasiKerakmi` bilan bir xil naqsh (bazasiz sinaladi).
 */
export function guruhEslatmasiKerakmi(p: {
  bugun: string;
  muddat: string;
  oxirgiEslatma: string | null;
  eslatmaKuni: number;
  qarzdorBor: boolean;
}): boolean {
  if (!p.qarzdorBor) return false;
  if (p.oxirgiEslatma === p.bugun) return false;

  const qolgan = kunFarqi(p.bugun, p.muddat);
  if (qolgan > p.eslatmaKuni) return false;
  // Oyna ochilgan kun, muddat kuni, va muddatdan keyingi har kun.
  return qolgan === p.eslatmaKuni || qolgan <= 0;
}
