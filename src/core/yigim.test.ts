/**
 * Pul yig'imining sof mantig'i: "hozir eslatma kerakmi" va sana arifmetikasi.
 *
 * Bu ikkisi ataylab bazasiz sinaladi — yig'imning butun "bezovta qilish"
 * xatti-harakati shu bitta funksiyada, ya'ni uni buzsak test darrov aytadi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { yigimEslatmasiKerakmi } from "./tolov.js";
import { kunQosh, kunFarqi } from "./vaqt.js";

const SOAT = 3_600_000;
const HOZIR = new Date("2026-09-11T12:00:00Z").getTime();

test("qarzi yo'q odamga eslatma yuborilmaydi — to'lagach o'zi to'xtaydi", () => {
  assert.equal(
    yigimEslatmasiKerakmi({ qoldiq: 0, hozir: HOZIR, oxirgiTs: null, oraliqSoat: 5 }),
    false,
  );
});

test("hali eslatilmagan qarzdorga darrov yuboriladi", () => {
  assert.equal(
    yigimEslatmasiKerakmi({ qoldiq: 30_000, hozir: HOZIR, oxirgiTs: null, oraliqSoat: 5 }),
    true,
  );
});

test("5 soat o'tmaguncha qayta yuborilmaydi, o'tgach yuboriladi", () => {
  const oxirgi = new Date(HOZIR - 4 * SOAT);
  assert.equal(
    yigimEslatmasiKerakmi({ qoldiq: 30_000, hozir: HOZIR, oxirgiTs: oxirgi, oraliqSoat: 5 }),
    false,
  );

  const eski = new Date(HOZIR - 5 * SOAT);
  assert.equal(
    yigimEslatmasiKerakmi({ qoldiq: 30_000, hozir: HOZIR, oxirgiTs: eski, oraliqSoat: 5 }),
    true,
  );
});

test("chastota sozlamadan olinadi — 5 emas, 12 soat bo'lsa ham to'g'ri ishlaydi", () => {
  const olti = new Date(HOZIR - 6 * SOAT);
  assert.equal(
    yigimEslatmasiKerakmi({ qoldiq: 30_000, hozir: HOZIR, oxirgiTs: olti, oraliqSoat: 12 }),
    false,
  );
  assert.equal(
    yigimEslatmasiKerakmi({ qoldiq: 30_000, hozir: HOZIR, oxirgiTs: olti, oraliqSoat: 5 }),
    true,
  );
});

test("eslatma muddatdan MUSTAQIL — muddat o'tsa ham davom etadi", () => {
  // Yig'imda "muddat o'tdi, endi tinch qo'yamiz" degan holat yo'q: pul
  // yig'ilmaguncha eslatma to'xtamaydi. Funksiya muddatni umuman
  // bilmaydi — aynan shuning uchun.
  const eski = new Date(HOZIR - 100 * SOAT);
  assert.equal(
    yigimEslatmasiKerakmi({ qoldiq: 1, hozir: HOZIR, oxirgiTs: eski, oraliqSoat: 5 }),
    true,
  );
});

test("kunQosh oy va yil chegarasidan to'g'ri o'tadi", () => {
  assert.equal(kunQosh("2026-09-11", 3), "2026-09-14");
  assert.equal(kunQosh("2026-09-29", 3), "2026-10-02");
  assert.equal(kunQosh("2026-12-30", 3), "2027-01-02");
  assert.equal(kunQosh("2026-03-01", -1), "2026-02-28");
  assert.equal(kunQosh("2026-09-11", 0), "2026-09-11");
});

test("kunQosh va kunFarqi bir-birining teskarisi", () => {
  for (const n of [0, 1, 3, 7, 30, 365]) {
    assert.equal(kunFarqi("2026-09-11", kunQosh("2026-09-11", n)), n);
  }
});
