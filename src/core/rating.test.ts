import { test } from "node:test";
import assert from "node:assert/strict";
import { navbatBalli, orinlarniHisobla } from "./rating.js";
import { BALLAR } from "../config.js";

test("teng ball teng o'rin oladi, keyingisi sakraydi", () => {
  const o = orinlarniHisobla([
    { userId: 1, jami: 540 },
    { userId: 2, jami: 540 },
    { userId: 3, jami: 470 },
    { userId: 4, jami: 470 },
    { userId: 5, jami: 100 },
  ]);
  assert.equal(o.get(1), 1);
  assert.equal(o.get(2), 1);
  assert.equal(o.get(3), 3);
  assert.equal(o.get(4), 3);
  assert.equal(o.get(5), 5);
});

test("hamma teng bo'lsa hamma birinchi", () => {
  const o = orinlarniHisobla([
    { userId: 1, jami: 0 },
    { userId: 2, jami: 0 },
    { userId: 3, jami: 0 },
  ]);
  assert.deepEqual([o.get(1), o.get(2), o.get(3)], [1, 1, 1]);
});

test("bo'sh ro'yxat yiqilmaydi", () => {
  assert.equal(orinlarniHisobla([]).size, 0);
});

test("xona balli a'zolar soniga bo'linadi", () => {
  // 60 ball xonaga; 2 kishilik xonada har biriga 30 + vaqtida bonus
  assert.equal(navbatBalli(2, 0), BALLAR.navbatXona / 2 + BALLAR.vaqtidaBonus);
  assert.equal(navbatBalli(4, 0), BALLAR.navbatXona / 4 + BALLAR.vaqtidaBonus);
});

test("kam kishilik xona ko'proq ball oladi", () => {
  assert.ok(navbatBalli(2, 0) > navbatBalli(4, 0));
});

test("kechikkan har kun uchun ball kamayadi", () => {
  const vaqtida = navbatBalli(2, 0);
  const birKun = navbatBalli(2, 1);
  assert.ok(birKun < vaqtida);
  // Vaqtida bonus ketadi va jarima qo'shiladi
  assert.equal(birKun, BALLAR.navbatXona / 2 - BALLAR.kechikishJarima);
});

test("ball hech qachon manfiy bo'lmaydi", () => {
  assert.equal(navbatBalli(4, 1000), 0);
  assert.ok(navbatBalli(1, 999) >= 0);
});

test("a'zosiz xona nolga bo'linib ketmaydi", () => {
  assert.ok(Number.isFinite(navbatBalli(0, 0)));
  assert.equal(navbatBalli(0, 0), BALLAR.navbatXona + BALLAR.vaqtidaBonus);
});
