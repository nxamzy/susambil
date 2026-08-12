import { test } from "node:test";
import assert from "node:assert/strict";
import { bugungiSana, kunFarqi, kunQismlari, oyKunlari, sanaMatni, siklDavri } from "./vaqt.js";

test("kunFarqi oddiy oraliqni to'g'ri sanaydi", () => {
  assert.equal(kunFarqi("2026-08-10", "2026-08-15"), 5);
  assert.equal(kunFarqi("2026-08-15", "2026-08-15"), 0);
});

test("kunFarqi muddat o'tib ketganda manfiy qaytaradi", () => {
  assert.equal(kunFarqi("2026-08-18", "2026-08-15"), -3);
});

test("kunFarqi oy va yil chegarasidan o'tadi", () => {
  assert.equal(kunFarqi("2026-08-28", "2026-09-02"), 5);
  assert.equal(kunFarqi("2026-12-30", "2027-01-02"), 3);
  // 2028 kabisa yili — 29-fevral hisobga olinishi kerak
  assert.equal(kunFarqi("2028-02-28", "2028-03-01"), 2);
});

test("oyKunlari kabisa yilini biladi", () => {
  assert.equal(oyKunlari(2026, 2), 28);
  assert.equal(oyKunlari(2028, 2), 29);
  assert.equal(oyKunlari(2026, 8), 31);
  assert.equal(oyKunlari(2026, 9), 30);
});

test("sanaMatni nol bilan to'ldiradi — leksikografik saralash to'g'ri bo'lsin", () => {
  assert.equal(sanaMatni(2026, 8, 5), "2026-08-05");
  assert.equal(sanaMatni(2026, 12, 15), "2026-12-15");
  // Matn solishtiruvi kalendar tartibiga mos kelishi kerak
  assert.ok(sanaMatni(2026, 8, 9) < sanaMatni(2026, 8, 10));
  assert.ok(sanaMatni(2026, 9, 1) > sanaMatni(2026, 8, 31));
});

test("siklDavri oy boshini va 15-kunni beradi", () => {
  const d = siklDavri(new Date("2026-08-12T10:00:00+05:00"), 15);
  assert.deepEqual(d, { davr: "2026-08-01", muddat: "2026-08-15" });
});

test("har oy ALOHIDA sikl — avgust va sentabr aralashmaydi", () => {
  const avgust = siklDavri(new Date("2026-08-31T23:00:00+05:00"), 15);
  const sentabr = siklDavri(new Date("2026-09-01T01:00:00+05:00"), 15);
  assert.equal(avgust.davr, "2026-08-01");
  assert.equal(sentabr.davr, "2026-09-01");
  assert.notEqual(avgust.davr, sentabr.davr);
});

test("muddatdan keyin yuborilgan to'lov ham O'SHA oyning siklida qoladi", () => {
  // 20-avgust — muddat o'tgan, lekin hali avgust. Yangi sikl ochilmaydi,
  // ya'ni kechikkan to'lov avgust qarzini kamaytiradi.
  const d = siklDavri(new Date("2026-08-20T12:00:00+05:00"), 15);
  assert.equal(d.davr, "2026-08-01");
  assert.equal(d.muddat, "2026-08-15");
});

test("muddat kuni oy uzunligidan oshib ketmaydi", () => {
  // Sozlama 31 bo'lsa ham fevralda 28/29-kundan nariga o'tmaydi
  assert.equal(siklDavri(new Date("2026-02-10T12:00:00+05:00"), 31).muddat, "2026-02-28");
  assert.equal(siklDavri(new Date("2028-02-10T12:00:00+05:00"), 31).muddat, "2028-02-29");
});

test("kun Toshkent mintaqasida hisoblanadi, UTC'da emas", () => {
  // UTC bo'yicha 11-avgust 20:00, Toshkent (+05:00) bo'yicha esa allaqachon
  // 12-avgust 01:00. Sana Toshkent bo'yicha chiqishi shart.
  const kech = new Date("2026-08-11T20:00:00Z");
  assert.equal(bugungiSana(kech), "2026-08-12");
  assert.equal(kunQismlari(kech).kun, 12);
});
