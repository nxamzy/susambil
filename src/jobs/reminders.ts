import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type Room, type TolovSikl, type User } from "../db/index.js";
// config: standart qiymatlar core/sozlamalar.ts orqali (kesh)
import {
  bajarilganMarta,
  faolNavbat,
  kechikkanKun,
  navbatFaolTopshirigi,
  oraliqKunOtdi,
} from "../core/rotation.js";
import { faolVazifalar } from "../core/vazifalar.js";
import { sozlamalarOl } from "../core/sozlamalar.js";
import { tasdiqlovchilar } from "../core/topshiriq.js";
import type { Submission } from "../db/index.js";
import {
  eslatmaBelgila,
  eslatmaNomzodlari,
  eslatmaTsBelgila,
  guruhEslatmasiniBelgila,
  jarimaHisobla,
  joriySikl,
  muddatiOtganSikllar,
  ochiqYigim,
  siklMuddatiniHisobla,
  tolovDashboard,
  tolovEslatmasiKerakmi,
  tolovJarimaFoizi,
  tolovQabulQiluvchi,
  yigimEslatmasiKerakmi,
  type MuddatSurati,
} from "../core/tolov.js";
import { bugungiSana, kunFarqi, kunOxirigachaSoat } from "../core/vaqt.js";
import { guruhgaYubor, shaxsiy } from "../bot/group.js";
import {
  esc,
  ismlar,
  oraliqVazifaMatni,
  pul,
  tolovEslatmaXabari,
  tolovGuruhEslatmasi,
  tolovMuddatGuruhXabari,
  tolovMuddatXabari,
  yigimEslatmaXabari,
} from "../bot/text.js";
import { yigimTolashKeyboard } from "../bot/keyboards.js";

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
  await oraliqVazifaEslatmalari(api).catch((e) => console.error("[eslatma] oraliq vazifa xatosi:", e));
  await tasdiqEslatmalari(api).catch((e) => console.error("[eslatma] tasdiq xatosi:", e));
  await tolovEslatmalari(api).catch((e) => console.error("[eslatma] to'lov xatosi:", e));
  await yigimEslatmalari(api).catch((e) => console.error("[eslatma] yig'im xatosi:", e));
}

// ---------------------------------------------------------------------------
// TASDIQ KUTMOQDA — guruhga eslatma
// ---------------------------------------------------------------------------

/** Topshiriq shuncha soatdan ortiq tasdiqsiz tursa guruhga eslatiladi. */
const TASDIQ_ESLATMA_SOAT = 12;

/**
 * Guruhga tasdiqsiz qolgan topshiriqlar haqida eslatma.
 *
 * ILDIZ MUAMMO: navbat topshirilgan, lekin boshqa xonalar "✅ Tasdiqlash"
 * bosmasa — navbat yopilmay kunlab osilib qolardi va hech kim hech kimga
 * eslatmasdi. Endi topshiriq `TASDIQ_ESLATMA_SOAT` soatdan ortiq
 * kutilmoqda holatida tursa, guruhga qisqa eslatma boradi (yetarli
 * tasdiq yig'ilguncha yoki rad etilguncha, har `TASDIQ_ESLATMA_SOAT` soatda).
 *
 * `oxirgi_ping` bilan bir xil intizom: "hozir kerakmi" har safar
 * `submissions.tasdiq_eslatma` vaqtidan qayta hisoblanadi — necha marta
 * chaqirilsa ham xavfsiz. Yopilgan (tasdiqlandi/rad) topshiriq shartga
 * tushmaydi, demak eslatma o'zidan to'xtaydi.
 */
async function tasdiqEslatmalari(api: Api): Promise<void> {
  const kutayotgan = await sql<Submission[]>`
    SELECT * FROM submissions
    WHERE holat = 'kutilmoqda' AND NOT bekor
      AND guruh_msg_id IS NOT NULL
      AND created_at < now() - (${TASDIQ_ESLATMA_SOAT} || ' hours')::interval
      AND (tasdiq_eslatma IS NULL
           OR tasdiq_eslatma < now() - (${TASDIQ_ESLATMA_SOAT} || ' hours')::interval)
    ORDER BY id
  `;
  if (kutayotgan.length === 0) return;

  const { kerakliTasdiq } = await sozlamalarOl();

  for (const sub of kutayotgan) {
    const ismlar = await tasdiqlovchilar(sub.id);
    if (ismlar.length >= kerakliTasdiq) continue; // yetib bo'lgan — yakunla o'zi hal qiladi

    const kim =
      sub.tur === "navbat"
        ? "Navbatdagi xona"
        : sub.tur === "xarajat"
          ? "Xarajat"
          : "Qo'shimcha ish";

    const yetdi = await guruhgaYubor(api, [
      `⏳ <b>TASDIQ KUTILMOQDA</b>`,
      ``,
      `${esc(kim)} topshirgan ish hali tasdiqlanmadi —`,
      `<b>${ismlar.length}/${kerakliTasdiq}</b> tasdiq.`,
      ``,
      `Yuqoridagi xabardan <b>✅ Tasdiqlash</b> bosing —`,
      `navbat shu bilan keyingi xonaga o'tadi.`,
    ].join("\n"));

    if (yetdi) {
      await sql`UPDATE submissions SET tasdiq_eslatma = now() WHERE id = ${sub.id}`;
    }
  }
}

// ---------------------------------------------------------------------------
// ORALIQ VAZIFA ESLATMASI (musor)
// ---------------------------------------------------------------------------

/**
 * `oraliq_kun > 0` vazifalar (musor) uchun — navbat BOSHLANGANIDAN
 * `oraliq_kun` kun o'tgach, vazifa BIRINCHI marta bajarilgunicha, xona
 * a'zolariga har `config.eslatmaOraligiSoat` (5) soatda shaxsiy eslatma.
 *
 * "Oxirgi kun" eslatmasidan (`navbatEslatmalari`) ATAYLAB ALOHIDA: u
 * muddatga yaqin ishga tushadi, bu esa navbat o'rtasida — musor idishi
 * to'lganda.
 *
 * Xonaning istalgan a'zosi "✅ Tugatdim" bossa `bajarilgan` 1 ga yetadi va
 * keyingi tekshiruvda `continue` bo'ladi — eslatma o'zidan to'xtaydi,
 * alohida "o'chirish" bayrog'i kerak emas (`turns.oxirgi_ping` bilan bir xil
 * "holatdan qayta hisoblash" intizomi).
 *
 * Har vazifaning oxirgi eslatma vaqti `turns.oraliq_eslatma` JSONB da
 * `{ "<kod>": "<ts>" }` — necha marta chaqirilsa ham xavfsiz.
 */
async function oraliqVazifaEslatmalari(api: Api): Promise<void> {
  const n = await faolNavbat();
  if (!n) return;

  const { turn, azolar } = n;

  // Topshirilgan bo'lsa (tasdiq kutmoqda) — hamma vazifa bajarilgan, kerak emas.
  if (await navbatFaolTopshirigi(turn.id)) return;

  const vazifalar = (await faolVazifalar()).filter((v) => v.oraliq_kun > 0);
  if (vazifalar.length === 0) return;

  const hozir = new Date();
  const oxirgiMap = turn.oraliq_eslatma ?? {};
  const { eslatmaOraligiSoat } = await sozlamalarOl();

  for (const v of vazifalar) {
    // 1-marta bajarilgan bo'lsa — bu vazifa uchun eslatma tugadi.
    if (bajarilganMarta(turn.ishlar[v.kod]) >= 1) continue;
    // Oraliq oynasi hali ochilmagan (navbat boshlanganiga oraliq_kun kun yo'q).
    if (oraliqKunOtdi(turn, v.oraliq_kun, hozir) < 0) continue;
    // Oxirgi eslatmadan `eslatmaOraligiSoat` soat o'tmagan.
    const oxirgiXom = oxirgiMap[v.kod];
    const oxirgi = oxirgiXom ? new Date(oxirgiXom).getTime() : null;
    if (oxirgi !== null && hozir.getTime() - oxirgi < eslatmaOraligiSoat * SOAT_MS) continue;

    const otganKun = v.oraliq_kun + oraliqKunOtdi(turn, v.oraliq_kun, hozir);
    const matn = oraliqVazifaMatni(v, otganKun);
    const natijalar = await Promise.all(
      azolar.map((a) => shaxsiy(api, a, matn, { reply_markup: panelTugmasi() })),
    );
    // Hech kimga yetmasa vaqtni yozmaymiz — ular ulanganda qayta urinilsin
    // (navbat/to'lov eslatmalaridagi bilan bir xil ehtiyot chorasi).
    if (!natijalar.some(Boolean)) continue;

    await sql`
      UPDATE turns
      SET oraliq_eslatma = jsonb_set(
        COALESCE(oraliq_eslatma, '{}'::jsonb),
        ARRAY[${v.kod}]::text[],
        to_jsonb(now()),
        true
      )
      WHERE id = ${turn.id}
    `;
  }
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
  const { eslatmaKuni } = await sozlamalarOl();

  // "Oxirgi kun" oynasi hali boshlanmagan — hali erta.
  if (hozir < muddat.getTime() - eslatmaKuni * KUN_MS) return;

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
  const { eslatmaOraligiSoat } = await sozlamalarOl();
  if (oxirgi !== null && hozir - oxirgi < eslatmaOraligiSoat * SOAT_MS) return;

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

  const { jarimaKunlik } = await sozlamalarOl();
  const kechikdi = kechikkanKun(muddat);
  const matn = [
    `🔴 <b>${room.raqam}-xona kechikdi — ${kechikdi} kun</b>`,
    ``,
    `👤 ${esc(ismlar(azolar))}`,
    `💸 Hozircha jarima: <b>${pul(kechikdi * jarimaKunlik)}</b>`,
    ``,
    `Har o'tgan kun uchun yana ${pul(jarimaKunlik)} qo'shiladi.`,
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
  const { tolovEslatmaKuni } = await sozlamalarOl();
  if (qolganKun > tolovEslatmaKuni) return;

  // Jarima faqat muddat o'tgandan keyingi xabarda kerak. Foiz standart
  // holatda 0 — u holda xabarda jarima qatori umuman chiqmaydi.
  const jarimaFoiz = qolganKun < 0 ? await tolovJarimaFoizi() : 0;
  const qolganSoat = qolganKun === 0 ? kunOxirigachaSoat() : undefined;

  const nomzodlar = await eslatmaNomzodlari(sikl);

  for (const n of nomzodlar) {
    const kerak = tolovEslatmasiKerakmi({
      qoldiq: n.qoldiq,
      bugun,
      muddat: sikl.muddat,
      oxirgiEslatma: n.oxirgiEslatma,
      eslatmaKuni: tolovEslatmaKuni,
    });
    if (!kerak) continue;

    const yetdi = await shaxsiy(
      api,
      n.user,
      tolovEslatmaXabari(sikl, n, qolganKun, {
        jarima: jarimaHisobla(n.qoldiq, jarimaFoiz),
        qolganSoat,
      }),
      { reply_markup: tolovTugmasi() },
    );
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
    eslatmaKuni: (await sozlamalarOl()).tolovEslatmaKuni,
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

// ---------------------------------------------------------------------------
// PUL YIG'IMI
// ---------------------------------------------------------------------------

/**
 * Ochiq yig'imga hali to'lamaganlarga har `yigimEslatmaSoat` (5) soatda
 * shaxsiy eslatma — to'langunicha.
 *
 * Oylik to'lov eslatmasidan (`shaxsiyTolovEslatmalari`) ATAYLAB alohida
 * funksiya, garchi ikkalasi ham `eslatmaNomzodlari`ni ishlatsa-da:
 *
 *  - u KUNIGA bir marta va faqat muddatga yaqinlashganda boshlanadi
 *    (`tolovEslatmaKuni` oynasi), bu esa yig'im ochilishi bilanoq va
 *    SOATLIK — talab aynan shunday edi ("kim bermagan bo'lsa har 5 soatda
 *    eslatma kelib tursin");
 *  - u muddat surati/jarima bilan bog'liq, yig'imda esa bular yo'q.
 *
 * To'xtashi uchun alohida bayroq kerak emas: qarzi qolmagan odam
 * `yigimEslatmasiKerakmi`dan o'tmaydi, ya'ni to'lovi tasdiqlangan zahoti
 * eslatma O'ZIDAN to'xtaydi (`turns.oxirgi_ping` bilan bir xil "holatdan
 * qayta hisoblash" intizomi). Yig'im yopilsa `ochiqYigim()` `null` qaytaradi
 * va butun bo'lim jim bo'ladi.
 */
async function yigimEslatmalari(api: Api): Promise<void> {
  const yigim = await ochiqYigim();
  if (!yigim) return;

  const { yigimEslatmaSoat } = await sozlamalarOl();
  const hozir = Date.now();
  const qabul = await tolovQabulQiluvchi();

  for (const n of await eslatmaNomzodlari(yigim)) {
    const kerak = yigimEslatmasiKerakmi({
      qoldiq: n.qoldiq,
      hozir,
      oxirgiTs: n.oxirgiEslatmaTs,
      oraliqSoat: yigimEslatmaSoat,
    });
    if (!kerak) continue;

    const yetdi = await shaxsiy(api, n.user, yigimEslatmaXabari(yigim, n, qabul), {
      reply_markup: yigimTolashKeyboard(),
    });
    // Faqat yetkazilganda belgilaymiz — bloklangan hisob tufayli keyingi
    // 5 soat behuda o'tib ketmasin (navbat/to'lov eslatmalaridagi bilan
    // bir xil ehtiyot chorasi).
    if (yetdi) await eslatmaTsBelgila(yigim.id, n.userId);
  }
}
