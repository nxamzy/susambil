import { test } from "node:test";
import assert from "node:assert/strict";
import { navbatBalli } from "./rating.js";
import { BALLAR } from "../config.js";

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
