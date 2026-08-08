import { test } from "node:test";
import assert from "node:assert/strict";
import { summaTekshir, topshiriqBalli, SUMMA_CHEGARA } from "./topshiriq.js";
import { ISH_TURLARI, BALLAR } from "../config.js";

test("summa oddiy raqamdan o'qiladi", () => {
  assert.equal(summaTekshir("120000"), 120_000);
  assert.equal(summaTekshir(120_000), 120_000);
});

test("bo'sh joy, nuqta va so'm yozuvi tozalanadi", () => {
  assert.equal(summaTekshir("120 000"), 120_000);
  assert.equal(summaTekshir("120.000 so'm"), 120_000);
  assert.equal(summaTekshir("120,000"), 120_000);
});

test("noto'g'ri summa qabul qilinmaydi", () => {
  assert.equal(summaTekshir("bekor"), null);
  assert.equal(summaTekshir(""), null);
  assert.equal(summaTekshir(null), null);
  assert.equal(summaTekshir(undefined), null);
  assert.equal(summaTekshir("0"), null);
});

test("manfiy summa o'tmaydi", () => {
  // Minus belgisi tozalanadi, ya'ni manfiy qiymat hosil bo'lmaydi
  assert.equal(summaTekshir(-500), null);
  assert.equal(summaTekshir("-500"), 500);
});

test("juda katta summa chegaraga tushiriladi", () => {
  assert.equal(summaTekshir("999999999999"), SUMMA_CHEGARA);
});

test("kasr son butunlashtiriladi", () => {
  assert.equal(summaTekshir(1500.9), 1500);
});

test("ball faqat sozlamadan olinadi, tashqaridan emas", () => {
  for (const tur of Object.keys(ISH_TURLARI) as (keyof typeof ISH_TURLARI)[]) {
    assert.equal(topshiriqBalli({ tur: "ish", ish: tur }), ISH_TURLARI[tur].ball);
  }
});

test("xarajat balli summaga bog'liq emas", () => {
  const kichik = topshiriqBalli({ tur: "xarajat", izoh: "gubka", summa: 5_000 });
  const katta = topshiriqBalli({ tur: "xarajat", izoh: "changyutgich", summa: 5_000_000 });
  assert.equal(kichik, BALLAR.xarajat);
  assert.equal(katta, BALLAR.xarajat);
});
