import { test } from "node:test";
import assert from "node:assert/strict";
import { guruhdanUshlanadimi, takrorlanganmi, TAKROR_MS } from "./reports.js";
import { SHAXSIY_KORIB_CHIQUVCHI_ID } from "../config.js";

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

test("Jamshidbek haqidagi kutilayotgan shikoyat guruhdan ushlanadi", () => {
  const r = { reported_id: SHAXSIY_KORIB_CHIQUVCHI_ID, guruh_msg_id: null, holat: "kutilmoqda" } as const;
  assert.equal(guruhdanUshlanadimi(r), true);
});

test("rad etilgan bo'lsa ham guruhga chiqmaydi", () => {
  const r = { reported_id: SHAXSIY_KORIB_CHIQUVCHI_ID, guruh_msg_id: null, holat: "rad" } as const;
  assert.equal(guruhdanUshlanadimi(r), true);
});

test("tasdiqlangach guruhga chiqadi", () => {
  const r = { reported_id: SHAXSIY_KORIB_CHIQUVCHI_ID, guruh_msg_id: null, holat: "tuzatilmoqda" } as const;
  assert.equal(guruhdanUshlanadimi(r), false);
});

test("guruhga allaqachon chiqqan xabar ushlanmaydi (tahrirlanaveradi)", () => {
  const r = { reported_id: SHAXSIY_KORIB_CHIQUVCHI_ID, guruh_msg_id: "1232", holat: "kutilmoqda" } as const;
  assert.equal(guruhdanUshlanadimi(r), false);
});

test("boshqalar va noma'lum sababchi haqidagi shikoyat ushlanmaydi", () => {
  assert.equal(guruhdanUshlanadimi({ reported_id: SHAXSIY_KORIB_CHIQUVCHI_ID + 1, guruh_msg_id: null, holat: "kutilmoqda" }), false);
  assert.equal(guruhdanUshlanadimi({ reported_id: null, guruh_msg_id: null, holat: "kutilmoqda" }), false);
});
