import { test } from "node:test";
import assert from "node:assert/strict";
import { signalEslatmasiKerakmi } from "./signal.js";

const SOAT = 3_600_000;
const T0 = new Date("2026-09-22T10:00:00+05:00");

test("signal eslatmasi: oxirgi DM'dan oraliq o'tmaguncha kerak emas", () => {
  const p = { yaratildi: T0, oxirgiEslatma: T0, oraliqSoat: 5 };
  assert.equal(signalEslatmasiKerakmi({ ...p, hozir: T0.getTime() + 4 * SOAT }), false);
  assert.equal(signalEslatmasiKerakmi({ ...p, hozir: T0.getTime() + 5 * SOAT }), true);
});

test("signal eslatmasi: birinchi DM hech kimga yetmagan bo'lsa yaratilgan vaqtdan hisoblanadi", () => {
  const p = { yaratildi: T0, oxirgiEslatma: null, oraliqSoat: 5 };
  assert.equal(signalEslatmasiKerakmi({ ...p, hozir: T0.getTime() + SOAT }), false);
  assert.equal(signalEslatmasiKerakmi({ ...p, hozir: T0.getTime() + 6 * SOAT }), true);
});
