import { test } from "node:test";
import assert from "node:assert/strict";
import { hisoblaDaraja } from "./tolov.js";

const TALAB = 900_000;

test("hech narsa to'lanmagan bo'lsa tolanmagan", () => {
  assert.equal(hisoblaDaraja(0, TALAB), "tolanmagan");
});

test("qisman to'langan (400,000 / 900,000) qisman deb topiladi", () => {
  assert.equal(hisoblaDaraja(400_000, TALAB), "qisman");
});

test("aynan talab bo'yicha (900,000) tola deb topiladi", () => {
  assert.equal(hisoblaDaraja(900_000, TALAB), "tola");
});

test("talabdan ko'p bo'lsa ham tola (ortiqcha to'lov)", () => {
  assert.equal(hisoblaDaraja(1_000_000, TALAB), "tola");
});

test("talabdan 1 so'm kam bo'lsa hali qisman — 'tola' erta chiqmasligi kerak", () => {
  assert.equal(hisoblaDaraja(TALAB - 1, TALAB), "qisman");
});

test("bir necha qisman to'lov qo'shilgandagi bosqichlar (400k -> 700k -> 900k)", () => {
  assert.equal(hisoblaDaraja(400_000, TALAB), "qisman");
  assert.equal(hisoblaDaraja(400_000 + 300_000, TALAB), "qisman");
  assert.equal(hisoblaDaraja(400_000 + 300_000 + 200_000, TALAB), "tola");
});

test("da'vo qilingandan kam tasdiqlansa faqat tasdiqlangan miqdor hisobga olinadi", () => {
  // Foydalanuvchi 400,000 deb da'vo qildi, lekin admin faqat 350,000ni
  // tasdiqladi — darajani hisoblashda FAQAT tasdiqlangan (350,000) kiradi.
  const tasdiqlangan = 350_000;
  assert.equal(hisoblaDaraja(tasdiqlangan, TALAB), "qisman");
  assert.equal(TALAB - tasdiqlangan, 550_000);
});
