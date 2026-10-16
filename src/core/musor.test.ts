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
const BUGUN = "2026-10-15";
const asos = {
  holat: "kutilmoqda" as const,
  tugash: BUGUN,
  bugun: BUGUN,
  eslatmaSoni: 0,
  elonTs: new Date("2026-10-15T08:00:00+05:00").getTime(),
  oxirgiEslatma: null,
  soatlar: [15, 20],
  oraliqSoat: 3,
};
const soat = (s: number) => new Date(`2026-10-15T${String(s).padStart(2, "0")}:05:00+05:00`).getTime();

test("eslatma: soatiga yetmaguncha kerak emas", () => {
  assert.equal(musorEslatmasiKerakmi({ ...asos, soat: 14, hozir: soat(14) }), null);
});

test("eslatma: birinchi eslatma 15:00 dan keyin", () => {
  assert.equal(musorEslatmasiKerakmi({ ...asos, soat: 15, hozir: soat(15) }), 1);
});

test("eslatma: ikkinchi eslatma 20:00 dan keyin, undan oldin yo'q", () => {
  const p = { ...asos, eslatmaSoni: 1, oxirgiEslatma: soat(15) };
  assert.equal(musorEslatmasiKerakmi({ ...p, soat: 18, hozir: soat(18) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...p, soat: 20, hozir: soat(20) }), 2);
});

test("eslatma: ikkitadan ko'p bo'lmaydi", () => {
  const p = { ...asos, eslatmaSoni: 2, oxirgiEslatma: soat(20) };
  assert.equal(musorEslatmasiKerakmi({ ...p, soat: 23, hozir: soat(23) }), null);
});

test("eslatma: bajarilgan yoki o'tkazilgan kunga ketmaydi", () => {
  for (const holat of ["bajarildi", "otkazildi"] as const) {
    assert.equal(musorEslatmasiKerakmi({ ...asos, holat, soat: 21, hozir: soat(21) }), null);
  }
});

test("eslatma: navbatning oxirgi kunidan boshqa kunda ketmaydi", () => {
  // Navbat ertaga tugaydi (bugun 1-kun) — idish hali to'lmagan.
  assert.equal(musorEslatmasiKerakmi({ ...asos, tugash: "2026-10-16", soat: 21, hozir: soat(21) }), null);
  // Navbat kecha tugagan, yangisi ertalab hali tayinlanmagan — eskisiga ham ketmaydi.
  assert.equal(musorEslatmasiKerakmi({ ...asos, tugash: "2026-10-14", soat: 21, hozir: soat(21) }), null);
});

test("eslatma: 2 kunlik navbat — 1-kun jim, 2-kun ertalabdan boshlanadi", () => {
  const ikkiKun = {
    holat: "kutilmoqda" as const,
    tugash: "2026-10-16",
    eslatmaSoni: 0,
    elonTs: new Date("2026-10-15T08:00:00+05:00").getTime(),
    oxirgiEslatma: null,
    soatlar: [8, 14, 20],
    oraliqSoat: 3,
  };
  const vaqt = (kun: string, s: number) => new Date(`${kun}T${String(s).padStart(2, "0")}:05:00+05:00`).getTime();

  // 1-kun kun bo'yi — hech narsa.
  for (const s of [8, 14, 20, 23]) {
    assert.equal(musorEslatmasiKerakmi({ ...ikkiKun, bugun: "2026-10-15", soat: s, hozir: vaqt("2026-10-15", s) }), null);
  }
  // 2-kun tunda hali erta, ertalab 8:00 da birinchisi.
  assert.equal(musorEslatmasiKerakmi({ ...ikkiKun, bugun: "2026-10-16", soat: 7, hozir: vaqt("2026-10-16", 7) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...ikkiKun, bugun: "2026-10-16", soat: 8, hozir: vaqt("2026-10-16", 8) }), 1);
  // Keyin 14:00 va 20:00, uchinchisi oxirgi.
  const ikkinchi = { ...ikkiKun, bugun: "2026-10-16", eslatmaSoni: 1, oxirgiEslatma: vaqt("2026-10-16", 8) };
  assert.equal(musorEslatmasiKerakmi({ ...ikkinchi, soat: 13, hozir: vaqt("2026-10-16", 13) }), null);
  assert.equal(musorEslatmasiKerakmi({ ...ikkinchi, soat: 14, hozir: vaqt("2026-10-16", 14) }), 2);
  const uchinchi = { ...ikkinchi, eslatmaSoni: 2, oxirgiEslatma: vaqt("2026-10-16", 14) };
  assert.equal(musorEslatmasiKerakmi({ ...uchinchi, soat: 20, hozir: vaqt("2026-10-16", 20) }), 3);
  const tugadi = { ...uchinchi, eslatmaSoni: 3, oxirgiEslatma: vaqt("2026-10-16", 20) };
  assert.equal(musorEslatmasiKerakmi({ ...tugadi, soat: 23, hozir: vaqt("2026-10-16", 23) }), null);
});

test("eslatma: e'lon yetkazilmagan bo'lsa avval e'lon", () => {
  assert.equal(musorEslatmasiKerakmi({ ...asos, elonTs: null, soat: 21, hozir: soat(21) }), null);
});

test("eslatma: bot kech yoqilsa ikkala eslatma bir zumda ketmaydi", () => {
  // E'lon 20:30 da chiqdi: 15:00 va 20:00 soatlari o'tgan, lekin e'londan 3 soat o'tmagan.
  const elon = new Date("2026-10-15T20:30:00+05:00").getTime();
  const p = { ...asos, elonTs: elon, soat: 20, hozir: elon + 5 * 60_000 };
  assert.equal(musorEslatmasiKerakmi(p), null);
  // Birinchisi ketgach ikkinchisi darrov emas, oraliqdan keyin:
  const keyin = { ...p, eslatmaSoni: 1, oxirgiEslatma: p.hozir, hozir: p.hozir + SOAT, soat: 21 };
  assert.equal(musorEslatmasiKerakmi(keyin), null);
});
