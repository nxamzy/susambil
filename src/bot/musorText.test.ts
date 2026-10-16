import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kunlikMusorEslatma,
  kunlikMusorGuruh,
  kunlikMusorShaxsiy,
  musorDavri,
  musorHisobiMatni,
} from "./text.js";

const davr = { sana: "2026-10-16", tugash: "2026-10-17" };
const bugun = { ism: "Ali", holat: "kutilmoqda" as const, bajarildi_ts: null, ...davr };
const royxat = [
  { ism: "Ali", tushgan: 3, tashlagan: 2, otkazgan: 1 },
  { ism: "Vali", tushgan: 2, tashlagan: 2, otkazgan: 0 },
  { ism: "Sami", tushgan: 0, tashlagan: 0, otkazgan: 0 },
];

test("hisob: ism va uchta raqam ko'rinadi, navbat tushmaganlar alohida", () => {
  const m = musorHisobiMatni(bugun, royxat);
  assert.match(m, /Ali — 3 · 2 · 1/);
  assert.match(m, /Vali — 2 · 2 · 0/);
  assert.match(m, /Hali navbat tushmagan: Sami/);
});

test("hisob REYTING EMAS: medal, ball, o'rin, jarima so'zlari yo'q", () => {
  const m = musorHisobiMatni(bugun, royxat);
  assert.doesNotMatch(m, /🥇|🥈|🥉|ball|o'rin|jarima|reyting/i);
});

test("hisob: tartib ism bo'yicha beriladi — o'tkazgan birinchi o'ringa chiqarilmaydi", () => {
  const m = musorHisobiMatni(bugun, royxat);
  assert.ok(m.indexOf("Ali —") < m.indexOf("Vali —"));
});

test("hisob: ism HTML'dan tozalanadi", () => {
  const m = musorHisobiMatni({ ...bugun, ism: "<b>X</b>" }, [{ ism: "<i>Y</i>", tushgan: 1, tashlagan: 1, otkazgan: 0 }]);
  assert.doesNotMatch(m, /<b>X<\/b>|<i>Y<\/i>/);
});

test("e'lon: navbatchi belgilanadi va oldingi o'tkazilgan navbat aytiladi", () => {
  const m = kunlikMusorGuruh({ ism: "Ali", telegram_id: "12345" }, { ism: "Vali" }, davr);
  assert.match(m, /tg:\/\/user\?id=12345/);
  assert.match(m, /Vali/);
  assert.match(m, /hisobga yozildi/);
  assert.match(m, /16–17-oktabr · 2 kun/);
});

test("e'lon: oldingisi o'tkazilmagan bo'lsa qator chiqmaydi", () => {
  assert.doesNotMatch(kunlikMusorGuruh({ ism: "Ali", telegram_id: null }, null, davr), /hisobga yozildi/);
});

test("shaxsiy xabar va eslatma: tugma matni va majburiylik aytilgan", () => {
  assert.match(kunlikMusorShaxsiy(davr), /Tashladim/);
  assert.match(kunlikMusorShaxsiy(davr), /shart emas/); // rasm shart emas
  assert.match(kunlikMusorEslatma(3, 3), /OXIRGI/);
  assert.doesNotMatch(kunlikMusorEslatma(1, 3), /OXIRGI/);
  assert.doesNotMatch(kunlikMusorEslatma(2, 3), /OXIRGI/);
});

test("shaxsiy xabar: ikki kunlik navbatda eslatma qachon boshlanishi aytiladi", () => {
  assert.match(kunlikMusorShaxsiy(davr), /Oxirgi kuni \(17-oktabr\) ertalabdan/);
  assert.doesNotMatch(kunlikMusorShaxsiy({ sana: "2026-10-16", tugash: "2026-10-16" }), /Oxirgi kuni/);
});

test("davr: bir oy ichida, oy chegarasida va eski bir kunlik navbat", () => {
  assert.equal(musorDavri(davr), "16–17-oktabr · 2 kun");
  assert.equal(musorDavri({ sana: "2026-10-31", tugash: "2026-11-01" }), "31-oktabr – 1-noyabr · 2 kun");
  assert.equal(musorDavri({ sana: "2026-12-31", tugash: "2027-01-01" }), "31-dekabr – 1-yanvar · 2 kun");
  assert.equal(musorDavri({ sana: "2026-10-16", tugash: "2026-10-16" }), "16-oktabr");
});

test("hisob: joriy navbatning davri ko'rinadi", () => {
  assert.match(musorHisobiMatni(bugun, royxat), /16–17-oktabr · 2 kun/);
  assert.match(musorHisobiMatni(null, royxat), /hali tayinlanmagan/);
});
