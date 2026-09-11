/**
 * "Uyga nima kerak" ro'yxatining ko'rinishi va emoji ajratish.
 *
 * Asosiy tekshiriladigan narsa — ro'yxat KALTA CHIQMASLIGI uchun qo'yilgan
 * ikki qaror: kerakligi tepada turadi (admin bir qarashda ko'radi) va
 * "kim aytdi" yozilib boradi (anonim belgi ishonchsiz bo'lardi).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { NarsaToliq } from "../core/narsalar.js";
import { emojiAjrat, NOM_MAX } from "../core/narsalar.js";
import { narsalarMatni, narsaDetalMatni, narsaTugadiAdminga } from "./text.js";

function narsa(over: Partial<NarsaToliq> & { id: number; nom: string }): NarsaToliq {
  return {
    emoji: "🛒",
    tartib: 0,
    faol: true,
    tugadi: null,
    tugadi_kim: null,
    tugadi_ism: null,
    olindi: null,
    created_at: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

const RO_YXAT: NarsaToliq[] = [
  narsa({ id: 1, nom: "Bumaga", emoji: "🧻", tugadi: new Date("2026-09-10T08:00:00Z"), tugadi_ism: "Vali" }),
  narsa({ id: 2, nom: "Hammom uchun azelit", emoji: "🚿" }),
  narsa({ id: 3, nom: "Oshxona uchun azelit", emoji: "🍽", tugadi: new Date("2026-09-11T08:00:00Z"), tugadi_ism: "Sora" }),
  narsa({ id: 4, nom: "Musor paketi", emoji: "🗑" }),
];

test("tugaganlari tepada, kim aytgani bilan", () => {
  const m = narsalarMatni(RO_YXAT, false);
  assert.match(m, /TUGAGAN — 2 ta/);
  assert.match(m, /Bumaga/);
  assert.match(m, /Vali/);
  assert.match(m, /Sora/);
  assert.ok(m.indexOf("TUGAGAN") < m.indexOf("BOR"), "kerakligi birinchi turishi kerak");
});

test("hammasi bor bo'lsa ro'yxat bo'sh emas, tinch xabar chiqadi", () => {
  const m = narsalarMatni(RO_YXAT.map((n) => ({ ...n, tugadi: null, tugadi_ism: null })), false);
  assert.match(m, /Hozircha hammasi bor/);
  assert.ok(!/TUGAGAN/.test(m));
});

test("ro'yxatdan chiqarilganlar faqat adminga ko'rinadi", () => {
  const bilan = [...RO_YXAT, narsa({ id: 9, nom: "Eski narsa", faol: false })];
  assert.match(narsalarMatni(bilan, true), /RO'YXATDAN CHIQARILGAN/);
  assert.ok(!/RO'YXATDAN CHIQARILGAN/.test(narsalarMatni(bilan, false)));
});

test("adminga ketadigan xabarda nechta narsa kutayotgani aytiladi", () => {
  const m = narsaTugadiAdminga({ emoji: "🧻", nom: "Bumaga" }, "Vali", 3);
  assert.match(m, /Bumaga/);
  assert.match(m, /Vali/);
  assert.match(m, /3 ta/);
});

test("kartochka olingan sanani ko'rsatadi, bor bo'lsa yashil", () => {
  const m = narsaDetalMatni(narsa({ id: 1, nom: "Gubka", olindi: new Date("2026-08-20T00:00:00Z") }));
  assert.match(m, /Uyda bor/);
  assert.match(m, /Oxirgi marta olingan/);
});

test("emoji nomdan ajratiladi, yo'q bo'lsa standart xarid emojisi", () => {
  assert.deepEqual(emojiAjrat("🧴 Shampun"), { emoji: "🧴", nom: "Shampun" });
  assert.deepEqual(emojiAjrat("Bumaga"), { emoji: "🛒", nom: "Bumaga" });
  // Navbat vazifasidagi standart 🧹 dan ataylab boshqa — bu xarid ro'yxati.
  assert.equal(emojiAjrat("Azelit").emoji, "🛒");
});

test("juda uzun nom chegaraga tushiriladi", () => {
  const uzun = "a".repeat(100);
  assert.equal(emojiAjrat(uzun).nom.length, NOM_MAX);
});
