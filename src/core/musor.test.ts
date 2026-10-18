import { test } from "node:test";
import assert from "node:assert/strict";
import { musorchiTanla, musorEslatmasiKerakmi } from "./musor.js";

/** Tasodifni aniq qilamiz: har doim ro'yxatning birinchi/oxirgisi. */
const birinchi = () => 0;
const oxirgisi = (n: number) => n - 1;

test("musorchi: nomzod yo'q bo'lsa hech kim tanlanmaydi", () => {
  assert.equal(musorchiTanla({ nomzodlar: [], joriySikl: 1, siklOdamlari: [], oxirgi: null }), null);
});

test("musorchi: raundda navbat olganlar qaytib tushmaydi", () => {
  const t = musorchiTanla({
    nomzodlar: [1, 2, 3, 4],
    joriySikl: 1,
    siklOdamlari: [1, 3],
    oxirgi: 3,
    tasodif: birinchi,
  });
  assert.deepEqual(t, { userId: 2, sikl: 1 });
});

test("musorchi: hamma navbat olgach yangi raund boshlanadi", () => {
  const t = musorchiTanla({
    nomzodlar: [1, 2, 3],
    joriySikl: 4,
    siklOdamlari: [1, 2, 3],
    oxirgi: 2,
    tasodif: birinchi,
  });
  assert.equal(t?.sikl, 5);
});

test("musorchi: yangi raundning birinchi kunida kechagi odam tushmaydi", () => {
  // Kechagi odam (3) ro'yxatda oxirida — tasodif oxirgisini tanlasa ham unga tushmasligi kerak.
  const t = musorchiTanla({
    nomzodlar: [1, 2, 3],
    joriySikl: 1,
    siklOdamlari: [1, 2, 3],
    oxirgi: 3,
    tasodif: oxirgisi,
  });
  assert.notEqual(t?.userId, 3);
  assert.equal(t?.sikl, 2);
});

test("musorchi: bitta odam bo'lsa har kuni o'sha (takror taqiqi uni bloklamaydi)", () => {
  const t = musorchiTanla({ nomzodlar: [7], joriySikl: 1, siklOdamlari: [7], oxirgi: 7, tasodif: birinchi });
  assert.deepEqual(t, { userId: 7, sikl: 2 });
});

test("musorchi: raund o'rtasida qo'shilgan a'zo darrov nomzod", () => {
  const t = musorchiTanla({
    nomzodlar: [1, 2, 9],
    joriySikl: 1,
    siklOdamlari: [1, 2],
    oxirgi: 2,
    tasodif: birinchi,
  });
  assert.deepEqual(t, { userId: 9, sikl: 1 });
});

test("musorchi: ketgan (nofaol) a'zo raundni to'xtatib turmaydi", () => {
  // 5 raundda edi, lekin endi nomzodlar ichida yo'q — qolganlar tugatgan bo'lsa raund yopiladi.
  const t = musorchiTanla({
    nomzodlar: [1, 2],
    joriySikl: 3,
    siklOdamlari: [1, 2, 5],
    oxirgi: 2,
    tasodif: birinchi,
  });
  assert.equal(t?.sikl, 4);
});

test("musorchi: uzoq muddatda adolat — har raundda hamma AYNAN bir martadan", () => {
  const nomzodlar = [10, 20, 30, 40, 50];
  const kunlar: { userId: number; sikl: number }[] = [];
  let oxirgi: number | null = null;
  let joriySikl = 1;

  for (let kun = 0; kun < nomzodlar.length * 12; kun++) {
    const bu = musorchiTanla({
      nomzodlar,
      joriySikl,
      siklOdamlari: kunlar.filter((k) => k.sikl === joriySikl).map((k) => k.userId),
      oxirgi,
    });
    assert.ok(bu);
    kunlar.push(bu);
    joriySikl = bu.sikl;
    oxirgi = bu.userId;
  }

  // Har to'liq raundda har odam aynan bir marta.
  for (let r = 1; r <= 12; r++) {
    const raund = kunlar.filter((k) => k.sikl === r).map((k) => k.userId).sort((a, b) => a - b);
    assert.deepEqual(raund, nomzodlar, `raund ${r}`);
  }
  // Ketma-ket ikki kun bir odam tushmagan.
  for (let i = 1; i < kunlar.length; i++) {
    assert.notEqual(kunlar[i]!.userId, kunlar[i - 1]!.userId);
  }
});

// ---------------------------------------------------------------------------

const SOAT = 3_600_000;
// Navbat 15-oktabrda tayinlangan: 15-kun = 1-kun, 16-kun = 2-kun.
const SANA = "2026-10-15";
const asos = {
  holat: "kutilmoqda" as const,
  sana: SANA,
  elonTs: new Date("2026-10-15T08:00:00+05:00").getTime(),
  oxirgiEslatma: null,
  soatlar: [8, 14, 20],
  oraliqSoat: 3,
};
const vaqt = (kun: string, s: number) => new Date(`${kun}T${String(s).padStart(2, "0")}:05:00+05:00`).getTime();
/** `kun` sanasi, `s` soatda: eslatma tekshiruviga beriladigan bugun/soat/hozir. */
const payt = (kun: string, s: number) => ({ bugun: kun, soat: s, hozir: vaqt(kun, s) });

test("eslatma: 1-kun kun bo'yi jim — idish hali to'lmagan", () => {
  for (const s of [8, 14, 20, 23]) {
    assert.equal(musorEslatmasiKerakmi({ ...asos, ...payt("2026-10-15", s) }), null);
  }
});

test("eslatma: 2-kun ertalab 8:00 dan boshlanadi, undan oldin yo'q", () => {
  assert.equal(musorEslatmasiKerakmi({ ...asos, ...payt("2026-10-16", 7) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...asos, ...payt("2026-10-16", 8) }), 2);
});

test("eslatma: 2-kun 8:00, 14:00, 20:00 da bittadan, oralarida yo'q", () => {
  const sakkiz = { ...asos, oxirgiEslatma: vaqt("2026-10-16", 8) };
  assert.equal(musorEslatmasiKerakmi({ ...sakkiz, ...payt("2026-10-16", 13) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...sakkiz, ...payt("2026-10-16", 14) }), 2);
  const ongTort = { ...asos, oxirgiEslatma: vaqt("2026-10-16", 14) };
  assert.equal(musorEslatmasiKerakmi({ ...ongTort, ...payt("2026-10-16", 19) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...ongTort, ...payt("2026-10-16", 20) }), 2);
});

test("eslatma: kun tugagach to'xtamaydi — navbat o'tmagan, ertasiga ham davom etadi", () => {
  const kecha = { ...asos, oxirgiEslatma: vaqt("2026-10-16", 20) };
  // Tunda hali erta: bugungi birinchi soat (8:00) kelmagan.
  assert.equal(musorEslatmasiKerakmi({ ...kecha, ...payt("2026-10-17", 3) }), null);
  // 3-kun ertalab yana, kun raqami bilan.
  assert.equal(musorEslatmasiKerakmi({ ...kecha, ...payt("2026-10-17", 8) }), 3);
  // Bir hafta o'tsa ham.
  assert.equal(musorEslatmasiKerakmi({ ...kecha, ...payt("2026-10-22", 8) }), 8);
});

test("eslatma: bir soat uchun bitta — oxirgisi shu soatdan keyin ketgan bo'lsa qaytarilmaydi", () => {
  const p = { ...asos, oxirgiEslatma: vaqt("2026-10-16", 8) };
  assert.equal(musorEslatmasiKerakmi({ ...p, ...payt("2026-10-16", 8) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...p, ...payt("2026-10-16", 11) }), null);
});

test("eslatma: bajarilgan yoki o'tkazilgan navbatga ketmaydi", () => {
  for (const holat of ["bajarildi", "otkazildi"] as const) {
    assert.equal(musorEslatmasiKerakmi({ ...asos, holat, ...payt("2026-10-16", 21) }), null);
  }
});

test("eslatma: e'lon yetkazilmagan bo'lsa avval e'lon", () => {
  assert.equal(musorEslatmasiKerakmi({ ...asos, elonTs: null, ...payt("2026-10-16", 21) }), null);
});

test("eslatma: bot soatlab o'chiq turib yoqilsa o'tgan soatlar uchun BITTA xabar", () => {
  // 2-kun 21:00 da bot yoqildi: 8, 14, 20 uchala soat o'tgan — bitta eslatma, uchta emas.
  const birinchi = musorEslatmasiKerakmi({ ...asos, ...payt("2026-10-16", 21) });
  assert.equal(birinchi, 2);
  const keyin = { ...asos, oxirgiEslatma: vaqt("2026-10-16", 21) };
  assert.equal(musorEslatmasiKerakmi({ ...keyin, ...payt("2026-10-16", 23) }), null);
});

test("eslatma: e'londan keyin oraliq o'tmaguncha ketmaydi", () => {
  // Navbat kech e'lon qilindi: 2-kun ertalab 8:05 da e'longa atigi 5 daqiqa bo'ldi.
  const elon = new Date("2026-10-16T08:00:00+05:00").getTime();
  const p = { ...asos, elonTs: elon, ...payt("2026-10-16", 8), hozir: elon + 5 * 60_000 };
  assert.equal(musorEslatmasiKerakmi(p), null);
  assert.equal(musorEslatmasiKerakmi({ ...p, hozir: elon + 3 * SOAT }), 2);
});

test("eslatma: boshlash kuni sozlanadi", () => {
  assert.equal(musorEslatmasiKerakmi({ ...asos, boshlashKuni: 3, ...payt("2026-10-16", 21) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...asos, boshlashKuni: 3, ...payt("2026-10-17", 9) }), 3);
});
