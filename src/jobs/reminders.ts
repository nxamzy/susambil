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
import {
  navbatSignallari,
  ochiqSignalKodlari,
  signalEslatildi,
  signalEslatmasiKerakmi,
} from "../core/signal.js";
import { sozlamalarOl } from "../core/sozlamalar.js";
import { tasdiqlovchilar } from "../core/topshiriq.js";
import type { Submission } from "../db/index.js";
import {
  eslatmaNomzodlari,
  eslatmaTsBelgila,
  guruhEslatmasiniBelgila,
  joriySikl,
  muddatiOtganSikllar,
  ochiqYigim,
  siklMuddatiniHisobla,
  tolovDashboard,
  tolovEslatmasiKerakmi,
  tolovQabulQiluvchi,
  yigimEslatmasiKerakmi,
  type MuddatSurati,
} from "../core/tolov.js";
import { bugungiSana, kunFarqi, kunOxirigachaSoat } from "../core/vaqt.js";
import { adminAloqasi } from "../core/users.js";
import { adminlarRoyxati, guruhgaYubor, shaxsiy } from "../bot/group.js";
import {
  hisobotiKutayotganNavbat,
  hisobotniEgalla,
  hisobotniQaytar,
  navbatHisoboti,
  oylikHisobot,
  oylikHisobotDavri,
  oylikHisobotKerakmi,
  oylikHisobotniEgalla,
  oylikHisobotniQaytar,
} from "../core/hisobot.js";
import {
  chekla,
  davomiylik,
  esc,
  ismlar,
  navbatHisobotiMatni,
  oylikHisobotMatni,
  musorSignalEslatmasi,
  oraliqVazifaMatni,
  shikoyatEslatmaXabari,
  tasdiqEslatmaXabari,
  tolovEslatmaXabari,
  tolovGuruhEslatmasi,
  tolovMuddatGuruhXabari,
  tolovMuddatXabari,
  yigimEslatmaXabari,
} from "../bot/text.js";
import { UZR_TUGMA, yigimTolashKeyboard } from "../bot/keyboards.js";

const SOAT_MS = 60 * 60_000;
const KUN_MS = 24 * SOAT_MS;

/**
 * Navbatdagi xonaga o'z bot chatidan ochiladigan tugma — "Mening
 * Navbatim" paneli `handlers/navbat.ts` da, bu yerda faqat havola.
 */
function panelTugmasi(): InlineKeyboard {
  return new InlineKeyboard().text("👤 Mening Navbatim", "navbat_panel");
}

/**
 * To'lov eslatmasidan to'g'ridan-to'g'ri to'lov oqimiga o'tish uchun —
 * va to'lay olmayotgan odam uchun sababini yozish yo'li.
 */
function tolovTugmasi(siklId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("💳 To'lov qilish", "tolov_boshla")
    .row()
    .text(UZR_TUGMA, `uzr:${siklId}`);
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
  await signalEslatmalari(api).catch((e) => console.error("[eslatma] musor signali xatosi:", e));
  await tasdiqEslatmalari(api).catch((e) => console.error("[eslatma] tasdiq xatosi:", e));
  await tolovEslatmalari(api).catch((e) => console.error("[eslatma] to'lov xatosi:", e));
  await yigimEslatmalari(api).catch((e) => console.error("[eslatma] yig'im xatosi:", e));
  await shikoyatEslatmalari(api).catch((e) => console.error("[eslatma] shikoyat xatosi:", e));
  await navbatHisobotlari(api).catch((e) => console.error("[eslatma] navbat hisoboti xatosi:", e));
  await oylikHisobotlar(api).catch((e) => console.error("[eslatma] oylik hisobot xatosi:", e));
}

// ---------------------------------------------------------------------------
// ADMIN HISOBOTLARI
// ---------------------------------------------------------------------------

/** Barcha adminlarga bir xil matn; nechtasiga yetganini qaytaradi. */
async function adminlargaYubor(api: Api, matn: string): Promise<number> {
  const natijalar = await Promise.all((await adminlarRoyxati()).map((a) => shaxsiy(api, a, matn)));
  return natijalar.filter(Boolean).length;
}

/**
 * Har yopilgan navbatning hisoboti adminlarga — BIR MARTA.
 *
 * Navbat to'rt xil yo'l bilan yopiladi (guruh tasdig'i, admin "yakunlandi",
 * admin boshqa xonaga o'tkazishi, /navbatber) — hisobotni har biriga
 * alohida qo'shish o'rniga shu yerda "yopilgan, lekin hisoboti ketmagan"
 * navbat qidiriladi (`turns.hisobot_yuborildi IS NULL`). Webhook eslatma
 * tekshiruvini javobdan KEYIN ishga tushiradi (`api/webhook.ts`), ya'ni
 * navbatni yopgan bosishning o'zidayoq hisobot ketadi.
 *
 * Bir chaqiruvda eng ko'pi uchta — tarmoq uzilib, bir nechtasi to'planib
 * qolgan bo'lsa ham bitta chaqiruv cho'zilib ketmasin.
 */
async function navbatHisobotlari(api: Api): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const turnId = await hisobotiKutayotganNavbat();
    if (!turnId) return;
    if (!(await hisobotniEgalla(turnId))) continue; // boshqa chaqiruv oldi

    const h = await navbatHisoboti(turnId);
    const yetdi = h ? await adminlargaYubor(api, chekla(navbatHisobotiMatni(h))) : 1;
    // Hech bir adminga yetmasa — bo'shatamiz, keyingi chaqiruvda qayta
    // urinadi. Aks holda hisobot jimgina yo'qolardi.
    if (yetdi === 0) {
      await hisobotniQaytar(turnId);
      return;
    }
  }
}

/**
 * Oy boshida o'tgan oyning hisoboti adminlarga — BIR MARTA. Qaysi oy
 * yuborilgani `settings.oylik_hisobot_davr` da; arzon tekshiruv (bitta
 * kichik so'rov) birinchi turadi, chunki bu funksiya har Telegram
 * yangilanishida chaqiriladi.
 */
async function oylikHisobotlar(api: Api): Promise<void> {
  const eski = await oylikHisobotDavri();
  const davr = oylikHisobotKerakmi(eski, bugungiSana().slice(0, 7));
  if (!davr) return;
  if (!(await oylikHisobotniEgalla(davr, eski))) return;

  const yetdi = await adminlargaYubor(api, chekla(oylikHisobotMatni(await oylikHisobot(davr))));
  if (yetdi === 0) await oylikHisobotniQaytar(eski);
}

// ---------------------------------------------------------------------------
// ANONIM SHIKOYAT — haftalik shaxsiy eslatma
// ---------------------------------------------------------------------------

/** Shikoyat eslatmasi necha kunda bir takrorlanadi. */
const SHIKOYAT_ESLATMA_KUN = 7;

/**
 * Har bir a'zoga haftada bir marta "anonim shikoyat bor" deb eslatadi.
 *
 * NEGA KERAK: shikoyat yozish yo'li faqat pastki menyudagi tugmada edi.
 * Uni bosgan odam ham, umuman borligini bilmagan odam ham bor — natijada
 * uydagi norozilik botga emas, oshxonada gapga aylanardi.
 *
 * NEGA DM: guruhga tashlangan "shikoyat yozsangiz bo'ladi" xabari kimdir
 * yozmoqchi ekanini oshkor qiladi. Navbat e'lonidagi bitta qator
 * (`SHIKOYAT_QATORI`) esa hech kimni ko'rsatmaydi — ikkalasi bir-birini
 * to'ldiradi.
 *
 * Idempotent, qolgan eslatmalar bilan bir xil intizomda: "hozir kerakmi"
 * `settings.shikoyat_eslatma_ts` dan qayta hisoblanadi, bayroq yo'q.
 * Arzon tekshiruv birinchi turadi — bu funksiya har Telegram
 * yangilanishida chaqiriladi (`api/webhook.ts` `waitUntil`).
 */
async function shikoyatEslatmalari(api: Api): Promise<void> {
  const [oxirgi] = await sql<{ qiymat: string }[]>`
    SELECT qiymat FROM settings WHERE kalit = 'shikoyat_eslatma_ts'
  `;
  if (oxirgi?.qiymat) {
    const otgan = Date.now() - new Date(oxirgi.qiymat).getTime();
    if (otgan < SHIKOYAT_ESLATMA_KUN * KUN_MS) return;
  }

  const odamlar = await sql<User[]>`SELECT * FROM users WHERE faol`;
  if (odamlar.length === 0) return;

  const matn = shikoyatEslatmaXabari();
  const natijalar = await Promise.all(odamlar.map((o) => shaxsiy(api, o, matn)));

  // Hech kimga yetmagan bo'lsa (bot bloklangan, tarmoq uzilgan) belgilamaymiz —
  // butun hafta o'tkazib yuborilmasin. "Yetkazilgandan keyin belgilash"
  // qoidasi bu faylning hamma eslatmasida bir xil.
  if (!natijalar.some(Boolean)) return;

  await sql`
    INSERT INTO settings (kalit, qiymat)
    VALUES ('shikoyat_eslatma_ts', ${new Date().toISOString()})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
}

// ---------------------------------------------------------------------------
// TASDIQ KUTMOQDA — guruhga eslatma
// ---------------------------------------------------------------------------

/** Topshiriq shuncha soatdan ortiq tasdiqsiz tursa guruhga eslatiladi. */
const TASDIQ_ESLATMA_SOAT = 12;

/**
 * Guruhga tasdiqsiz qolgan navbat topshirig'i haqida eslatma — BIR MARTA.
 *
 * ILDIZ MUAMMO: navbat topshirilgan, lekin boshqa xonalar "✅ Tasdiqlash"
 * bosmasa, navbat yopilmay kunlab osilib qolardi va hech kim hech kimga
 * eslatmasdi.
 *
 * Uchta qattiq shart bor, uchalasi ham amaliyotdagi xatodan kelib chiqqan:
 *
 *  1) FAQAT BIR MARTA (`tasdiq_eslatma IS NULL`). Ilgari har
 *     `TASDIQ_ESLATMA_SOAT` soatda QAYTARILARDI va guruh haftalab bir xil
 *     xabarni ko'rardi — eslatma emas, spam edi. Bir marta aytilgach,
 *     tasdiqlash yoki navbatni qo'lda o'tkazish odamning ishi.
 *
 *  2) FAQAT `tur = 'navbat'`. `ish` va `xarajat` oqimlari olib tashlangan,
 *     lekin ularning eski `kutilmoqda` yozuvlarini yopadigan tugma ham,
 *     buyruq ham qolmagan — ular guruhga abadiy "Qo'shimcha ish
 *     tasdiqlanmadi" deb eslatib turardi.
 *
 *  3) FAQAT navbat HALI FAOL bo'lsa. Admin navbatni qo'lda keyingi xonaga
 *     o'tkazgan bo'lsa (`navbatniBer` → `admin_yopdi`) tasdiqlashning
 *     ma'nosi yo'q. O'sha topshiriqni `navbatniBer` ning o'zi bekor
 *     qiladi; bu shart — ikkinchi himoya.
 */
async function tasdiqEslatmalari(api: Api): Promise<void> {
  const kutayotgan = await sql<(Submission & { xona: number })[]>`
    SELECT s.*, r.raqam AS xona
    FROM submissions s
    JOIN turns t ON t.id = s.turn_id
    JOIN rooms r ON r.id = t.room_id
    WHERE s.holat = 'kutilmoqda' AND NOT s.bekor
      AND s.tur = 'navbat'
      AND t.holat = 'faol'
      AND s.guruh_msg_id IS NOT NULL
      AND s.tasdiq_eslatma IS NULL
      AND s.created_at < now() - (${TASDIQ_ESLATMA_SOAT} || ' hours')::interval
    ORDER BY s.id
  `;
  if (kutayotgan.length === 0) return;

  const { kerakliTasdiq } = await sozlamalarOl();

  for (const sub of kutayotgan) {
    const tasdiqlaganlar = await tasdiqlovchilar(sub.id);
    if (tasdiqlaganlar.length >= kerakliTasdiq) continue; // yetib bo'lgan — yakunla o'zi hal qiladi

    const yetdi = await guruhgaYubor(
      api,
      tasdiqEslatmaXabari(sub.xona, tasdiqlaganlar.length, kerakliTasdiq),
    );

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

  // "🗑 Musor to'ldi" signali ochiq vazifaga o'z eslatmasi boradi
  // (`signalEslatmalari`) — bu yerdan ham yuborilsa bir soatda ikkita DM
  // kelardi.
  const signalKodlari = await ochiqSignalKodlari(turn.id);

  for (const v of vazifalar) {
    if (signalKodlari.has(v.kod)) continue;
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
// "🗑 MUSOR TO'LDI" SIGNALI
// ---------------------------------------------------------------------------

/**
 * Ochiq signal bo'yicha navbatdagi xonaga har `eslatmaOraligiSoat` soatda
 * DM — musor tashlanib, signal yopilguncha ("tashlamaguncha eslataversin").
 *
 * To'xtashi uchun bayroq yo'q: navbatchi "✅ Tugatdim" (yoki vazifa to'liq
 * bo'lsa "🗑 Tashladim") bossa `hal_qilindi` yoziladi va signal bu
 * so'rovga umuman tushmaydi. Faqat JORIY navbatning signali — navbat
 * boshqa xonaga o'tsa eski signal eslatilmaydi (hisobotda "hal qilinmagan"
 * bo'lib qoladi).
 */
async function signalEslatmalari(api: Api): Promise<void> {
  const n = await faolNavbat();
  if (!n) return;

  const ochiqlar = (await navbatSignallari(n.turn.id)).filter((s) => !s.hal_qilindi);
  if (ochiqlar.length === 0) return;

  const { eslatmaOraligiSoat } = await sozlamalarOl();
  const hozir = Date.now();
  const vazifalar = await faolVazifalar();

  for (const s of ochiqlar) {
    const kerak = signalEslatmasiKerakmi({
      yaratildi: s.created_at,
      oxirgiEslatma: s.oxirgi_eslatma,
      hozir,
      oraliqSoat: eslatmaOraligiSoat,
    });
    if (!kerak) continue;

    const v = vazifalar.find((x) => x.kod === s.vazifa_kod);
    if (!v) continue; // vazifa ro'yxatdan chiqarilgan — eslatadigan narsa yo'q

    const matn = musorSignalEslatmasi(v, davomiylik(s.created_at, new Date(hozir)), s.ism);
    const kb = new InlineKeyboard().text("🗑 Tashladim — rasm yuborish", `musor_tashla:${s.id}`);
    const natijalar = await Promise.all(n.azolar.map((a) => shaxsiy(api, a, matn, { reply_markup: kb })));
    if (natijalar.some(Boolean)) await signalEslatildi(s.id);
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
    await kunlikOgohlantirish(api, turn.id, room, azolar, muddat, turn.oxirgi_ping);
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
    ``,
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
      reply_markup: n.qoldiq > 0 ? tolovTugmasi(sikl.id) : undefined,
    });
  }

  await guruhgaYubor(api, tolovMuddatGuruhXabari(sikl, natijalar));
}

/**
 * Qarzi borlarga HAR `tolovEslatmaSoat` SOATDA shaxsiy eslatma.
 *
 * Ilgari KUNIGA BIR MARTA edi va qarzdorlar shunchaki e'tibor bermasdi —
 * endi pul yig'imidagi bilan bir xil chastota. To'liq to'lagan odam
 * ro'yxatga umuman tushmaydi (talab: "Fully paid user stops receiving
 * reminders"), va "to'liq" endi SHAXSIY talabdan hisoblanadi: kelishilgan
 * kam summani to'lagan odam ham eslatma olmaydi.
 *
 * Belgilash `oxirgi_eslatma_ts` (LAHZA) bilan — yig'im bilan bir xil
 * ustun. Bitta (sikl, odam) juftligi faqat bitta turga tegishli bo'lgani
 * uchun ular chalkashmaydi.
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
  const { tolovEslatmaKuni, tolovEslatmaSoat } = await sozlamalarOl();
  if (qolganKun > tolovEslatmaKuni) return;

  const qolganSoat = qolganKun === 0 ? kunOxirigachaSoat() : undefined;
  const hozir = Date.now();

  // Naqd bergan odamda chek yo'q — u botga hech narsa yubora olmaydi va
  // admin tasdiqlamaguncha qarzdor bo'lib turadi. Eslatma kimga yozish
  // kerakligini o'zi aytadi.
  const adminAloqa = await adminAloqasi();

  const nomzodlar = await eslatmaNomzodlari(sikl);

  for (const n of nomzodlar) {
    const kerak = tolovEslatmasiKerakmi({
      qoldiq: n.qoldiq,
      bugun,
      muddat: sikl.muddat,
      oxirgiTs: n.oxirgiEslatmaTs,
      eslatmaKuni: tolovEslatmaKuni,
      oraliqSoat: tolovEslatmaSoat,
      hozir,
      uzrTs: n.oxirgiUzrTs,
    });
    if (!kerak) continue;

    const yetdi = await shaxsiy(
      api,
      n.user,
      tolovEslatmaXabari(sikl, n, qolganKun, { qolganSoat, adminAloqa }),
      { reply_markup: tolovTugmasi(sikl.id) },
    );
    // Faqat yetkazilganda belgilaymiz — aks holda bloklangan/o'chirilgan
    // hisob tufayli oraliq "eslatilgan" bo'lib qolar, tuzatilgach ham qayta
    // urinilmasdi (navbat eslatmasidagi bilan bir xil ehtiyot chorasi).
    if (yetdi) await eslatmaTsBelgila(sikl.id, n.userId);
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
  const adminAloqa = await adminAloqasi();

  for (const n of await eslatmaNomzodlari(yigim)) {
    const kerak = yigimEslatmasiKerakmi({
      qoldiq: n.qoldiq,
      hozir,
      oxirgiTs: n.oxirgiEslatmaTs,
      oraliqSoat: yigimEslatmaSoat,
      uzrTs: n.oxirgiUzrTs,
    });
    if (!kerak) continue;

    const yetdi = await shaxsiy(api, n.user, yigimEslatmaXabari(yigim, n, qabul, adminAloqa), {
      reply_markup: yigimTolashKeyboard(yigim.id),
    });
    // Faqat yetkazilganda belgilaymiz — bloklangan hisob tufayli keyingi
    // 5 soat behuda o'tib ketmasin (navbat/to'lov eslatmalaridagi bilan
    // bir xil ehtiyot chorasi).
    if (yetdi) await eslatmaTsBelgila(yigim.id, n.userId);
  }
}
