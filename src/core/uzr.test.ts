/**
 * "🙁 To'lay olmayapman" — sabab yozilgach eslatma bir kun to'xtab turadi,
 * keyin o'z jadvaliga qaytadi (qarz o'z-o'zidan yo'qolmaydi).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tolovEslatmasiKerakmi, UZR_TINIM_SOAT, uzrTinimidami, yigimEslatmasiKerakmi } from "./tolov.js";

const SOAT = 3_600_000;
const HOZIR = new Date("2026-09-22T12:00:00+05:00").getTime();

test("uzrTinimidami: sabab yo'q bo'lsa tinim yo'q", () => {
  assert.equal(uzrTinimidami(null, HOZIR), false);
  assert.equal(uzrTinimidami(undefined, HOZIR), false);
});

test("uzrTinimidami: tinim UZR_TINIM_SOAT davom etadi", () => {
  assert.equal(uzrTinimidami(new Date(HOZIR - (UZR_TINIM_SOAT - 1) * SOAT), HOZIR), true);
  assert.equal(uzrTinimidami(new Date(HOZIR - UZR_TINIM_SOAT * SOAT), HOZIR), false);
});

test("yig'im eslatmasi sabab yozilgach to'xtaydi, tinimdan keyin qaytadi", () => {
  const p = { qoldiq: 20_000, hozir: HOZIR, oxirgiTs: null, oraliqSoat: 5 };
  assert.equal(yigimEslatmasiKerakmi(p), true);
  assert.equal(yigimEslatmasiKerakmi({ ...p, uzrTs: new Date(HOZIR - 2 * SOAT) }), false);
  assert.equal(yigimEslatmasiKerakmi({ ...p, uzrTs: new Date(HOZIR - 30 * SOAT) }), true);
});

test("kvartira to'lovi eslatmasi ham sababdan keyin to'xtaydi", () => {
  const p = {
    qoldiq: 300_000,
    bugun: "2026-09-12",
    muddat: "2026-09-14",
    oxirgiTs: null,
    eslatmaKuni: 3,
    oraliqSoat: 5,
    hozir: HOZIR,
  };
  assert.equal(tolovEslatmasiKerakmi(p), true);
  assert.equal(tolovEslatmasiKerakmi({ ...p, uzrTs: new Date(HOZIR - SOAT) }), false);
});
