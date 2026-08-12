/**
 * Oylik to'lov sikli — muddat natijasi va eslatma qarorlari.
 *
 * Ikkalasi ham ATAYLAB sof funksiya qilib ajratilgan (`core/tolov.ts`):
 * bazaga bog'liq bo'lmagani uchun eng nozik qoidalar — qisman to'lov,
 * tekshiruv kechikishi, jarima — shu yerda to'g'ridan-to'g'ri sinaladi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hisoblaDaraja, muddatNatijasi, tolovEslatmasiKerakmi } from "./tolov.js";
import { guruhEslatmasiKerakmi } from "../jobs/reminders.js";

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
