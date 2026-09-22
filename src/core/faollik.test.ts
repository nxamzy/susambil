/**
 * Faollik hisoblagichining sof qismi.
 *
 * Bazaga tegadigan `faollikRoyxati`/`faollikYoz` bu yerda sinalmaydi
 * (loyihada DB test harness yo'q) — o'rin hisobi esa sof funksiya va
 * ayni shu sababli `core/` ga ajratilgan.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { orinlar, type OdamFaollik } from "./faollik.js";
import { faollikMatni } from "../bot/text.js";

function odam(ism: string, oy: number, jami = oy): OdamFaollik {
  return { userId: ism.charCodeAt(0), ism, oy, jami };
}

test("o'rinlar tartib bo'yicha beriladi", () => {
  const r = [odam("Ali", 10), odam("Vali", 7), odam("Bobur", 3)];
  const o = orinlar(r);
  assert.equal(o.get(odam("Ali", 0).userId), 1);
  assert.equal(o.get(odam("Vali", 0).userId), 2);
  assert.equal(o.get(odam("Bobur", 0).userId), 3);
});

test("TENG sonlilar bir xil o'rinni oladi", () => {
  // Ikki kishi 7 tadan qilgan bo'lsa birini 2-, ikkinchisini 3-o'rin deb
  // ko'rsatish ular orasida farq bordek taassurot berardi.
  const r = [odam("Ali", 10), odam("Vali", 7), odam("Bobur", 7), odam("Soib", 2)];
  const o = orinlar(r);
  assert.equal(o.get(odam("Vali", 0).userId), 2);
  assert.equal(o.get(odam("Bobur", 0).userId), 2);
  assert.equal(o.get(odam("Soib", 0).userId), 4, "keyingisi 3 emas, 4-o'rin");
});

test("hamma nol bo'lsa hammasi 1-o'rin", () => {
  const r = [odam("Ali", 0), odam("Vali", 0)];
  const o = orinlar(r);
  assert.equal(o.get(odam("Ali", 0).userId), 1);
  assert.equal(o.get(odam("Vali", 0).userId), 1);
});

test("bo'sh ro'yxatda tushunarli xabar chiqadi", () => {
  const r = [odam("Ali", 0, 0), odam("Vali", 0, 0)];
  const m = faollikMatni(r, orinlar(r), null, "sentabr");
  assert.match(m, /hech kim hech nima qilmagan/);
});

test("faollik ro'yxati REYTINGGA o'xshamaydi — medal ham, ball ham yo'q", () => {
  // Olib tashlangan ball jadvalida 🥇🥈🥉, "ball" so'zi va yetakchiga
  // nisbatan chiziq bor edi. Ular qaytib kelmasligi kerak.
  const r = [odam("Ali", 10, 40), odam("Vali", 7, 12)];
  const m = faollikMatni(r, orinlar(r), null, "sentabr");
  assert.ok(!/🥇|🥈|🥉/.test(m), "medal bo'lmasin");
  assert.ok(!/ball/i.test(m), "'ball' so'zi bo'lmasin");
  assert.ok(!/▰|▱/.test(m), "taqqoslash chizig'i bo'lmasin");
});

test("ikkala raqam ham ko'rinadi — shu oy va jami", () => {
  const r = [odam("Ali", 3, 40)];
  const m = faollikMatni(r, orinlar(r), null, "sentabr");
  assert.match(m, /SENTABR/);
  assert.ok(m.includes("3"), "shu oydagisi");
  assert.ok(m.includes("40"), "jami");
});

test("ko'rayotgan odam o'z qatorini va o'rnini ko'radi", () => {
  const r = [odam("Ali", 10), odam("Vali", 7)];
  const m = faollikMatni(r, orinlar(r), odam("Vali", 0).userId, "sentabr");
  assert.match(m, /👈/);
  assert.match(m, /2-o'rin/);
});

test("uzun ism ustunni buzmaydi", () => {
  const r = [odam("Jamshidbekmuhammad", 5)];
  const m = faollikMatni(r, orinlar(r), null, "sentabr");
  assert.match(m, /Jamshidbek…/);
});
