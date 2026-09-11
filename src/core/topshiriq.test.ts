import { test } from "node:test";
import assert from "node:assert/strict";
import { summaTekshir, SUMMA_CHEGARA } from "./topshiriq.js";

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
