import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kunlikMusorEslatma,
  kunlikMusorGuruh,
  kunlikMusorShaxsiy,
  musorDavri,
  musorHisobiMatni,
} from "./text.js";

const SANA = "2026-10-16";
const bugun = { ism: "Ali", sana: SANA };
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

test("e'lon: navbatchi belgilanadi, sana ko'rinadi, muddat va ayblov yo'q", () => {
  const m = kunlikMusorGuruh({ ism: "Ali", telegram_id: "12345" }, SANA);
  assert.match(m, /tg:\/\/user\?id=12345/);
  assert.match(m, /16-oktabrdan/);
  assert.match(m, /Tashladim/);
  assert.doesNotMatch(m, /hisobga yozildi|o'tkazdi|tashlamadi/);
});

test("e'lon: Tashladim bosilmaguncha navbat o'tmasligi aytiladi", () => {
  assert.match(kunlikMusorGuruh({ ism: "Ali", telegram_id: null }, SANA), /Bosmaguncha navbat keyingi odamga o'tmaydi/);
  assert.match(kunlikMusorShaxsiy(SANA), /Bosmaguningizcha navbat keyingi odamga o'tmaydi/);
});

test("shaxsiy xabar: tugma matni, rasm shart emasligi va eslatma qachon boshlanishi", () => {
  const m = kunlikMusorShaxsiy(SANA);
  assert.match(m, /Tashladim/);
  assert.match(m, /shart emas/); // rasm shart emas
  assert.match(m, /2-kundan boshlab har kuni eslatib turaman/);
  // Eski "o'tkazib yuborilgan deb sanaladi" va "oxirgi kuni" qoidalari yo'q.
  assert.doesNotMatch(m, /o'tkazib yuborilgan|Oxirgi kuni/);
});

test("eslatma: navbat o'tmasligini aytadi, 3-kundan qattiqroq", () => {
  const ikki = kunlikMusorEslatma(2);
  assert.match(ikki, /\(2-kun\)/);
  assert.match(ikki, /keyingi odamga o'tadi/);
  assert.doesNotMatch(ikki, /^⚠️/);
  const besh = kunlikMusorEslatma(5);
  assert.match(besh, /^⚠️/);
  assert.match(besh, /5-KUN/);
  assert.match(besh, /5 kundan beri sizda/);
  assert.match(besh, /keyingi odamga o'tmaydi/);
  // Hisobga yozish bilan qo'rqitish yo'q.
  assert.doesNotMatch(ikki + besh, /hisobga yoziladi|OXIRGI/);
});

test("davr: tayinlangan kunda va keyingi kunlarda", () => {
  assert.equal(musorDavri("2026-10-16"), "16-oktabrdan");
  assert.equal(musorDavri("2026-10-16", "2026-10-16"), "16-oktabrdan");
  assert.equal(musorDavri("2026-10-16", "2026-10-17"), "16-oktabrdan · 2-kun");
  assert.equal(musorDavri("2026-10-31", "2026-11-03"), "31-oktabrdan · 4-kun");
  assert.equal(musorDavri("2026-12-30", "2027-01-02"), "30-dekabrdan · 4-kun");
});

test("hisob: joriy navbat kimdaligi, sanasi va tashlamagani ko'rinadi", () => {
  const m = musorHisobiMatni(bugun, royxat, "2026-10-18");
  assert.match(m, /Navbatchi: <b>Ali<\/b> — ⏳ hali tashlamadi/);
  assert.match(m, /16-oktabrdan · 3-kun/);
  assert.match(musorHisobiMatni(null, royxat), /hali tayinlanmagan/);
});

test("hisob: navbat qanday o'tishi aytiladi, muddat so'zi yo'q", () => {
  const m = musorHisobiMatni(bugun, royxat);
  assert.match(m, /Tashladim.*bosilgach navbat/s);
  assert.doesNotMatch(m, /Har \d+ kunda/);
});
