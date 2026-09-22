/**
 * Oylik to'lov sikli — muddat natijasi va eslatma qarorlari.
 *
 * Ikkalasi ham ATAYLAB sof funksiya qilib ajratilgan (`core/tolov.ts`):
 * bazaga bog'liq bo'lmagani uchun eng nozik qoidalar — qisman to'lov,
 * tekshiruv kechikishi, jarima — shu yerda to'g'ridan-to'g'ri sinaladi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amaldagiTalab, hisoblaDaraja, kechikkanmi, muddatiOtdimi, muddatNatijasi,
  tolovEslatmasiKerakmi,
} from "./tolov.js";
import { kunOxirigachaSoat } from "./vaqt.js";
import { guruhEslatmasiKerakmi } from "../jobs/reminders.js";
import { config } from "../config.js";

const TALAB = 900_000;

function natija(tasdiqlangan: number, kutilmoqda = 0) {
  return muddatNatijasi({ talab: TALAB, tasdiqlangan, kutilmoqda });
}

// ---------------------------------------------------------------------------
// MUDDAT NATIJASI
// ---------------------------------------------------------------------------

test("muddatgacha to'liq to'lagan — qoldiq yo'q", () => {
  const n = natija(900_000);
  assert.equal(n.daraja, "tola");
  assert.equal(n.qoldiq, 0);
  assert.equal(n.tekshiruvKutilmoqda, false);
});

test("qisman to'lagan — qolgani aniq ko'rsatiladi", () => {
  const n = natija(500_000);
  assert.equal(n.daraja, "qisman");
  assert.equal(n.qoldiq, 400_000);
});

test("bir necha qisman to'lov qo'shiladi, oxirgisi ustiga yozilmaydi", () => {
  // 100k + 200k + 300k + 300k = 900k
  const jami = 100_000 + 200_000 + 300_000 + 300_000;
  assert.equal(jami, 900_000);
  assert.equal(natija(jami).daraja, "tola");
  assert.equal(natija(jami).qoldiq, 0);

  // 200k + 100k + 150k = 450k → 450k qoladi
  const chala = 200_000 + 100_000 + 150_000;
  assert.equal(natija(chala).qoldiq, 450_000);
  assert.equal(natija(chala).daraja, "qisman");
});

test("umuman to'lamagan — to'liq talab qoldiq bo'lib qoladi", () => {
  const n = natija(0);
  assert.equal(n.daraja, "tolanmagan");
  assert.equal(n.qoldiq, TALAB);
});

test("tekshirilmagan to'lov qoldiqni KAMAYTIRMAYDI", () => {
  // 400k tasdiqlangan, yana 300k da'vo tekshiruvda. Qoldiq faqat
  // tasdiqlangandan hisoblanadi — 500k, 200k emas.
  const n = natija(400_000, 300_000);
  assert.equal(n.tasdiqlangan, 400_000);
  assert.equal(n.qoldiq, 500_000);
  assert.equal(n.daraja, "qisman");
});

test("tekshiruv kutayotgan odam YAKUNIY deb belgilanmaydi", () => {
  // Muddatgacha yuborgan, admin hali tekshirmagan — bu odamning aybi emas.
  const n = natija(0, 900_000);
  assert.equal(n.tekshiruvKutilmoqda, true);
  assert.equal(n.qoldiq, 900_000, "qoldiq baribir ko'rsatiladi");
});

test("tekshiruv tugagach (rad etilgan) bayroq tushadi", () => {
  // Rad etilgandan keyin kutilmoqda 0 bo'ladi — surat qayta hisoblanadi.
  const n = natija(0, 0);
  assert.equal(n.tekshiruvKutilmoqda, false);
  assert.equal(n.qoldiq, 900_000);
});

test("qoldiq YETMAGAN summadan hisoblanadi, butun talabdan emas", () => {
  const n = natija(700_000, 0);
  assert.equal(n.qoldiq, 200_000);
});

test("da'vodan kam tasdiqlansa faqat tasdiqlangani hisobga olinadi", () => {
  // Odam 400k deb yozdi, Sorabek 350k kelganini ko'rdi → 350k kiradi.
  const n = natija(350_000);
  assert.equal(n.tasdiqlangan, 350_000);
  assert.equal(n.qoldiq, 550_000);
  assert.equal(hisoblaDaraja(350_000, TALAB), "qisman");
});

// ---------------------------------------------------------------------------
// SHAXSIY ESLATMA
// ---------------------------------------------------------------------------

const HOZIR = new Date("2026-08-12T09:00:00+05:00").getTime();
const SOAT = 3_600_000;

function eslatma(over: Partial<Parameters<typeof tolovEslatmasiKerakmi>[0]> = {}) {
  return tolovEslatmasiKerakmi({
    qoldiq: 300_000,
    bugun: "2026-08-12",
    muddat: "2026-08-15",
    oxirgiTs: null,
    eslatmaKuni: 5,
    oraliqSoat: 5,
    hozir: HOZIR,
    ...over,
  });
}

test("muddat yaqinlashganda qarzi borga eslatma yuboriladi", () => {
  assert.equal(eslatma(), true);
});

test("to'liq to'laganga eslatma YUBORILMAYDI", () => {
  assert.equal(eslatma({ qoldiq: 0 }), false);
});

test("oraliq o'tmaguncha qayta eslatilmaydi", () => {
  assert.equal(eslatma({ oxirgiTs: new Date(HOZIR - 4 * SOAT) }), false, "4 soat — hali erta");
  assert.equal(eslatma({ oxirgiTs: new Date(HOZIR - 5 * SOAT) }), true, "5 soat — vaqti keldi");
  assert.equal(eslatma({ oxirgiTs: new Date(HOZIR - 9 * SOAT) }), true);
});

test("bot qayta ishga tushsa ham oraliq saqlanadi", () => {
  // Eslatma holati bazada (`tolov_holat.oxirgi_eslatma_ts`), xotirada emas —
  // shuning uchun qayta ishga tushgandan keyingi chaqiruv ham shu qarorni
  // beradi: hali 5 soat o'tmagan.
  const bazadagiHolat = new Date(HOZIR - 2 * SOAT);
  assert.equal(eslatma({ oxirgiTs: bazadagiHolat }), false);
  assert.equal(eslatma({ oxirgiTs: bazadagiHolat }), false);
});

test("oraliq sozlamasi hurmat qilinadi", () => {
  const uchSoat = { oxirgiTs: new Date(HOZIR - 4 * SOAT), oraliqSoat: 3 };
  assert.equal(eslatma(uchSoat), true, "3 soatlik oraliqda 4 soat yetarli");
  assert.equal(eslatma({ ...uchSoat, oraliqSoat: 12 }), false, "12 soatlik oraliqda hali erta");
});

test("oyna ochilmaguncha eslatma yuborilmaydi", () => {
  // 15-avgust muddati, oyna 5 kun oldin (10-avgust) ochiladi.
  assert.equal(eslatma({ bugun: "2026-08-09" }), false);
  assert.equal(eslatma({ bugun: "2026-08-10" }), true, "aynan oyna ochilgan kun kiradi");
});

test("SOZLAMA bo'yicha ogohlantirish 11-kundan boshlanadi (14-kun muddati)", () => {
  // Talab aynan shunday: ogohlantirish muddatdan 3 kun oldin boshlanadi.
  // Shu sababli sinovda `eslatmaKuni` qo'lda emas, config'dan olinadi —
  // sozlama o'zgarsa test yiqiladi.
  const p = {
    qoldiq: 500_000,
    muddat: "2026-08-14",
    oxirgiTs: null,
    eslatmaKuni: config.tolovEslatmaKuni,
    oraliqSoat: config.tolovEslatmaSoat,
    hozir: HOZIR,
  };
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-10" }), false, "10-kuni hali erta");
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-11" }), true, "11-kuni boshlanadi");
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-12" }), true);
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-13" }), true);
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-14" }), true, "muddat kuni ham");
});

test("muddat o'tib ketsa ham qarzdorga eslatma davom etadi", () => {
  assert.equal(eslatma({ bugun: "2026-08-16" }), true);
  assert.equal(eslatma({ bugun: "2026-08-25" }), true);
});

test("muddat o'tgan bo'lsa ham to'liq to'lagan odam eslatma olmaydi", () => {
  assert.equal(eslatma({ bugun: "2026-08-25", qoldiq: 0 }), false);
});

// ---------------------------------------------------------------------------
// GURUH ESLATMASI
// ---------------------------------------------------------------------------

function guruh(over: Partial<Parameters<typeof guruhEslatmasiKerakmi>[0]> = {}) {
  return guruhEslatmasiKerakmi({
    bugun: "2026-08-10",
    muddat: "2026-08-15",
    oxirgiEslatma: null,
    eslatmaKuni: 5,
    qarzdorBor: true,
    ...over,
  });
}

test("guruhga oyna ochilgan kuni bir marta e'lon qilinadi", () => {
  assert.equal(guruh(), true);
});

test("guruh oradagi kunlarda bezovta qilinmaydi", () => {
  // 11–14-avgust: shaxsiy eslatma boradi, guruhga esa yo'q.
  assert.equal(guruh({ bugun: "2026-08-11" }), false);
  assert.equal(guruh({ bugun: "2026-08-14" }), false);
});

test("guruhga muddat kuni va undan keyingi har kuni e'lon qilinadi", () => {
  assert.equal(guruh({ bugun: "2026-08-15" }), true);
  assert.equal(guruh({ bugun: "2026-08-16" }), true);
  assert.equal(guruh({ bugun: "2026-08-20" }), true);
});

test("hamma to'lagan bo'lsa guruhga eslatma yuborilmaydi", () => {
  assert.equal(guruh({ qarzdorBor: false }), false);
  assert.equal(guruh({ bugun: "2026-08-20", qarzdorBor: false }), false);
});

test("guruhga ham kuniga bir marta", () => {
  assert.equal(guruh({ bugun: "2026-08-15", oxirgiEslatma: "2026-08-15" }), false);
  assert.equal(guruh({ bugun: "2026-08-15", oxirgiEslatma: "2026-08-10" }), true);
});

// ---------------------------------------------------------------------------
// KECHIKISH VA JARIMA
// ---------------------------------------------------------------------------

test("muddat kunining o'zi hali o'tgan hisoblanmaydi", () => {
  // Muddat kun OXIRIGACHA — 15-kuni to'lagan odam kechikkan emas.
  assert.equal(muddatiOtdimi("2026-08-15", "2026-08-14"), false);
  assert.equal(muddatiOtdimi("2026-08-15", "2026-08-15"), false);
  assert.equal(muddatiOtdimi("2026-08-15", "2026-08-16"), true);
});

test("kechikish PUL va VAQT holatlarining kesishmasi", () => {
  // Qarzi bor + muddat o'tgan → kechikkan
  assert.equal(kechikkanmi(500_000, "2026-08-15", "2026-08-16"), true);
  // Qarzi bor, lekin muddat hali o'tmagan → kechikkan emas
  assert.equal(kechikkanmi(500_000, "2026-08-15", "2026-08-15"), false);
  // Muddat o'tgan, lekin qarzi yo'q → kechikkan emas
  assert.equal(kechikkanmi(0, "2026-08-15", "2026-08-20"), false);
});

test("kunOxirigachaSoat 1..24 oralig'ida bo'ladi", () => {
  // Toshkent UTC+5: UTC 19:00 → Toshkent 00:00, ya'ni kun endi boshlandi.
  assert.equal(kunOxirigachaSoat(new Date("2026-08-15T19:00:00Z")), 24);
  // UTC 18:00 → Toshkent 23:00, kun tugashiga 1 soat.
  assert.equal(kunOxirigachaSoat(new Date("2026-08-15T18:00:00Z")), 1);
  // UTC 07:00 → Toshkent 12:00, yarim kun qoldi.
  assert.equal(kunOxirigachaSoat(new Date("2026-08-15T07:00:00Z")), 12);
});

// ---------------------------------------------------------------------------
// SHAXSIY TALAB
// ---------------------------------------------------------------------------

test("shaxsiy talab qo'yilmagan bo'lsa siklning umumiy talabi amal qiladi", () => {
  assert.equal(amaldagiTalab(900_000, null), 900_000);
  assert.equal(amaldagiTalab(900_000, undefined as unknown as null), 900_000);
});

test("shaxsiy talab qo'yilgan bo'lsa O'SHA amal qiladi", () => {
  // 20 kun turib chiqib ketadigan odam: kelishuv 600 000.
  assert.equal(amaldagiTalab(900_000, 600_000), 600_000);
  // postgres.js BIGINT'ni MATN qilib qaytaradi — raqamga o'girilishi shart,
  // aks holda `900000 - "600000"` emas, string solishtiruv chiqardi.
  assert.equal(amaldagiTalab(900_000, "600000"), 600_000);
});

test("kelishilgan kam summani to'lagan odam TO'LIQ to'lagan hisoblanadi", () => {
  const talab = amaldagiTalab(900_000, "600000");
  assert.equal(hisoblaDaraja(600_000, talab), "tola");
  assert.equal(muddatNatijasi({ talab, tasdiqlangan: 600_000, kutilmoqda: 0 }).qoldiq, 0);
  // Va demak unga eslatma ham bormaydi — `tolovEslatmasiKerakmi` qarzga qaraydi.
  assert.equal(
    tolovEslatmasiKerakmi({
      qoldiq: 0,
      bugun: "2026-08-12",
      muddat: "2026-08-14",
      oxirgiTs: null,
      eslatmaKuni: 5,
      oraliqSoat: 5,
      hozir: HOZIR,
    }),
    false,
  );
});

test("shaxsiy talab umumiysidan KATTA ham bo'la oladi", () => {
  // Chegirma emas, shunchaki "boshqacha" — mehmon olib kelgan odam ko'proq
  // to'lashi kerak bo'lishi mumkin. Kod hech qanday yo'nalish o'ylamaydi.
  const talab = amaldagiTalab(900_000, 1_200_000);
  assert.equal(hisoblaDaraja(900_000, talab), "qisman");
  assert.equal(muddatNatijasi({ talab, tasdiqlangan: 900_000, kutilmoqda: 0 }).qoldiq, 300_000);
});
