import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_PANEL_TUGMA,
  bolimTugmasimi,
  MENING_NAVBATIM_TUGMA,
  MENYU,
  MUSOR_TUGMA,
  SHIKOYAT_TUGMA,
} from "./keyboards.js";

test("bo'lim: pastki menyuning har bir tugmasi — boshqa bo'limga o'tish", () => {
  for (const t of [...Object.values(MENYU), SHIKOYAT_TUGMA, ADMIN_PANEL_TUGMA, MENING_NAVBATIM_TUGMA, MUSOR_TUGMA]) {
    assert.ok(bolimTugmasimi(t), t);
  }
});

test("bo'lim: buyruq ham bo'lim almashishi", () => {
  assert.ok(bolimTugmasimi("/start"));
  assert.ok(bolimTugmasimi("/musor"));
});

test("bo'lim: jarayonga yozilgan oddiy matn bo'lim emas — eski xabarlar o'chmaydi", () => {
  for (const t of ["400000", "Bumaga tugadi", "Ali", "📋 Navbatlar"]) {
    assert.equal(bolimTugmasimi(t), false, t);
  }
});
