import { test } from "node:test";
import assert from "node:assert/strict";
import { takrorlanganmi, TAKROR_MS } from "./reports.js";

test("yaqinda yozilgan shikoyat takroriy deb topiladi", () => {
  const hozir = new Date("2026-08-08T12:00:00Z");
  const besh_daqiqa_oldin = new Date(hozir.getTime() - 5 * 60_000);
  assert.equal(takrorlanganmi(besh_daqiqa_oldin, hozir), true);
});

test("muddat o'tgan bo'lsa takroriy emas", () => {
  const hozir = new Date("2026-08-08T12:00:00Z");
  const yarim_soat_oldin = new Date(hozir.getTime() - TAKROR_MS - 1);
  assert.equal(takrorlanganmi(yarim_soat_oldin, hozir), false);
});

test("aynan chegarada takroriy emas (qat'iy kamroq shart)", () => {
  const hozir = new Date("2026-08-08T12:00:00Z");
  const chegarada = new Date(hozir.getTime() - TAKROR_MS);
  assert.equal(takrorlanganmi(chegarada, hozir), false);
});
