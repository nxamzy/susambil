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
  hisoblaDaraja, jarimaHisobla, kechikkanmi, muddatiOtdimi, muddatNatijasi,
  tolovEslatmasiKerakmi,
} from "./tolov.js";
import { kunOxirigachaSoat } from "./vaqt.js";
import { guruhEslatmasiKerakmi } from "../jobs/reminders.js";
import { config } from "../config.js";

const TALAB = 900_000;

/** Jarimasiz (standart) holat — uy qoidasi jarima belgilamagan. */
function natija(tasdiqlangan: number, kutilmoqda = 0, jarimaFoiz = 0) {
  return muddatNatijasi({ talab: TALAB, tasdiqlangan, kutilmoqda, jarimaFoiz });
}

// ---------------------------------------------------------------------------
// MUDDAT NATIJASI
// ---------------------------------------------------------------------------

test("muddatgacha to'liq to'lagan — qoldiq yo'q, jarima yo'q", () => {
  const n = natija(900_000);
  assert.equal(n.daraja, "tola");
  assert.equal(n.qoldiq, 0);
  assert.equal(n.jarima, 0);
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

test("tekshiruv kutayotgan odamga jarima YOZILMAYDI", () => {
  // Muddatgacha yuborgan, admin hali tekshirmagan — bu odamning aybi emas.
  const n = natija(0, 900_000, 10);
  assert.equal(n.tekshiruvKutilmoqda, true);
  assert.equal(n.jarima, 0);
  assert.equal(n.qoldiq, 900_000, "qoldiq baribir ko'rsatiladi — faqat jarima kechiktiriladi");
});

test("tekshiruv tugagach (rad etilgan) jarima haqiqiy qoldiqdan hisoblanadi", () => {
  // Rad etilgandan keyin kutilmoqda 0 bo'ladi — surat qayta hisoblanadi.
  const n = natija(0, 0, 10);
  assert.equal(n.tekshiruvKutilmoqda, false);
  assert.equal(n.jarima, 90_000);
});

test("jarima YETMAGAN summadan olinadi, butun talabdan emas", () => {
  // 700k to'lagan, 200k yetmagan → jarima 200k dan hisoblanadi.
  const n = natija(700_000, 0, 10);
  assert.equal(n.qoldiq, 200_000);
  assert.equal(n.jarima, 20_000);
  assert.notEqual(n.jarima, 90_000, "to'liq to'lamagandek muomala qilinmasin");
});

test("standart holatda jarima 0 — bot moliyaviy qoida o'ylab chiqarmaydi", () => {
  assert.equal(natija(0).jarima, 0);
  assert.equal(natija(500_000).jarima, 0);
});

test("to'liq to'laganda jarima foizi qo'yilgan bo'lsa ham 0", () => {
  assert.equal(natija(900_000, 0, 25).jarima, 0);
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

function eslatma(over: Partial<Parameters<typeof tolovEslatmasiKerakmi>[0]> = {}) {
  return tolovEslatmasiKerakmi({
    qoldiq: 300_000,
    bugun: "2026-08-12",
    muddat: "2026-08-15",
    oxirgiEslatma: null,
    eslatmaKuni: 5,
    ...over,
  });
}

test("muddat yaqinlashganda qarzi borga eslatma yuboriladi", () => {
  assert.equal(eslatma(), true);
});

test("to'liq to'laganga eslatma YUBORILMAYDI", () => {
  assert.equal(eslatma({ qoldiq: 0 }), false);
});

test("bir kunda ikki marta eslatilmaydi", () => {
  assert.equal(eslatma({ oxirgiEslatma: "2026-08-12" }), false);
  assert.equal(eslatma({ oxirgiEslatma: "2026-08-11" }), true, "kechagi eslatma bugungisini to'smaydi");
});

test("bot qayta ishga tushsa ham bir kunda ikki marta eslatmaydi", () => {
  // Eslatma holati bazada (`tolov_holat.oxirgi_eslatma`), xotirada emas —
  // shuning uchun qayta ishga tushgandan keyingi chaqiruv ham shu qarorni
  // beradi: bugun allaqachon eslatilgan.
  const bazadagiHolat = "2026-08-12";
  assert.equal(eslatma({ oxirgiEslatma: bazadagiHolat }), false);
  assert.equal(eslatma({ oxirgiEslatma: bazadagiHolat }), false);
});

test("oyna ochilmaguncha eslatma yuborilmaydi", () => {
  // 15-avgust muddati, oyna 5 kun oldin (10-avgust) ochiladi.
  assert.equal(eslatma({ bugun: "2026-08-09" }), false);
  assert.equal(eslatma({ bugun: "2026-08-10" }), true, "aynan oyna ochilgan kun kiradi");
});

test("SOZLAMA bo'yicha ogohlantirish 12-kundan boshlanadi (15-kun muddati)", () => {
  // Talab aynan shunday: "reminders must start exactly 3 days before the
  // deadline, meaning from the 12th". Shu sababli sinovda `eslatmaKuni`
  // qo'lda emas, config'dan olinadi — sozlama o'zgarsa test yiqiladi.
  const p = {
    qoldiq: 500_000,
    muddat: "2026-08-15",
    oxirgiEslatma: null,
    eslatmaKuni: config.tolovEslatmaKuni,
  };
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-11" }), false, "11-kuni hali erta");
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-12" }), true, "12-kuni boshlanadi");
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-13" }), true);
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-14" }), true);
  assert.equal(tolovEslatmasiKerakmi({ ...p, bugun: "2026-08-15" }), true, "muddat kuni ham");
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

test("jarima qoldiqdan hisoblanadi, standart foizda 0 chiqadi", () => {
  assert.equal(jarimaHisobla(500_000, 0), 0, "foiz 0 — jarima o'chiq");
  assert.equal(jarimaHisobla(500_000, 10), 50_000);
  assert.equal(jarimaHisobla(0, 10), 0, "qarzi yo'qqa jarima yo'q");
  // Yaxlitlash: 333 333 dan 7% = 23 333.31 → 23 333
  assert.equal(jarimaHisobla(333_333, 7), 23_333);
});

test("jarima muddat suratida ham, joriy holatda ham bir xil hisoblanadi", () => {
  // `muddatNatijasi` ichkarida ham shu funksiyani ishlatadi — ikkita
  // hisob-kitob bo'lib qolmasligi kerak.
  const n = muddatNatijasi({
    talab: TALAB, tasdiqlangan: 400_000, kutilmoqda: 0, jarimaFoiz: 10,
  });
  assert.equal(n.jarima, jarimaHisobla(n.qoldiq, 10));
});

test("kunOxirigachaSoat 1..24 oralig'ida bo'ladi", () => {
  // Toshkent UTC+5: UTC 19:00 → Toshkent 00:00, ya'ni kun endi boshlandi.
  assert.equal(kunOxirigachaSoat(new Date("2026-08-15T19:00:00Z")), 24);
  // UTC 18:00 → Toshkent 23:00, kun tugashiga 1 soat.
  assert.equal(kunOxirigachaSoat(new Date("2026-08-15T18:00:00Z")), 1);
  // UTC 07:00 → Toshkent 12:00, yarim kun qoldi.
  assert.equal(kunOxirigachaSoat(new Date("2026-08-15T07:00:00Z")), 12);
});
