/**
 * "Uyga nima kerak" ro'yxatining sof mantig'i: ko'p qatorli kiritishni
 * qatorlarga ajratish va emoji ajratish. Bularning ikkalasi ham
 * `narsalarQosh` (bazali) funksiyaning tayanchi — bazasiz sinaladi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emojiAjrat, NOM_MAX, qatorlarniAjrat } from "./narsalar.js";

test("har qator alohida narsa — admin bir yo'lda ro'yxat yozadi", () => {
  const matn = "Bumaga\nHammom uchun azelit\nOshxona uchun azelit";
  assert.deepEqual(qatorlarniAjrat(matn), [
    "Bumaga",
    "Hammom uchun azelit",
    "Oshxona uchun azelit",
  ]);
});

test("raqamlangan ro'yxat (1. 2. 3.) belgisi tashlab yuboriladi", () => {
  const matn = "1. Bumaga\n2. Hammom uchun azelit\n3) Oshxona uchun azelit";
  assert.deepEqual(qatorlarniAjrat(matn), [
    "Bumaga",
    "Hammom uchun azelit",
    "Oshxona uchun azelit",
  ]);
});

test("chiziqcha/nuqta belgisi ham tashlanadi", () => {
  const matn = "- Gubka\n• Sovun";
  assert.deepEqual(qatorlarniAjrat(matn), ["Gubka", "Sovun"]);
});

test("bo'sh qatorlar va ortiqcha bo'shliqlar e'tiborga olinmaydi", () => {
  const matn = "Bumaga\n\n   \nGubka  ";
  assert.deepEqual(qatorlarniAjrat(matn), ["Bumaga", "Gubka"]);
});

test("bitta qatorli kiritish ham ishlaydi — eski oqim buzilmaydi", () => {
  assert.deepEqual(qatorlarniAjrat("Bumaga"), ["Bumaga"]);
});

test("emoji bilan yozilgan qator ham to'g'ri ajratiladi", () => {
  assert.deepEqual(emojiAjrat("🧴 Shampun"), { emoji: "🧴", nom: "Shampun" });
});

test("juda uzun nom chegaraga tushiriladi", () => {
  assert.equal(emojiAjrat("a".repeat(100)).nom.length, NOM_MAX);
});
