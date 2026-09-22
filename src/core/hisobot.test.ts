import { test } from "node:test";
import assert from "node:assert/strict";
import type { TurnIshlar } from "../db/index.js";
import type { NavbatVazifasi } from "./vazifalar.js";
import {
  oldingiOy,
  oyOraligi,
  oylikHisobotKerakmi,
  vazifaXulosasi,
  xonaXulosasi,
  type OyNavbati,
} from "./hisobot.js";

function vazifa(kod: string, takror = 1): NavbatVazifasi {
  return { id: 1, kod, nom: kod, emoji: "🧹", rasm_soni: 1, takror_soni: takror, oraliq_kun: 0, tartib: 0, faol: true };
}

test("vazifaXulosasi: har marta kim qilgani va jami rasm", () => {
  const ishlar: TurnIshlar = {
    musor: {
      photo_ids: ["c"],
      user_id: 2,
      vaqt: "2026-09-21T10:00:00Z",
      bajarilgan: 2,
      tarix: [{ photo_ids: ["a", "b"], user_id: 1, vaqt: "2026-09-19T10:00:00Z" }],
    },
  };
  const [xona, musor] = vazifaXulosasi(ishlar, [vazifa("xona"), vazifa("musor", 2)]);
  assert.deepEqual(xona, { kod: "xona", nom: "xona", emoji: "🧹", bajarilgan: 0, takror: 1, userIds: [], rasm: 0 });
  assert.equal(musor!.bajarilgan, 2);
  assert.deepEqual(musor!.userIds, [1, 2]);
  assert.equal(musor!.rasm, 3);
});

test("vazifaXulosasi: ro'yxatdan chiqarilgan vazifaning dalili ham ko'rinadi", () => {
  const ishlar: TurnIshlar = { eski: { photo_ids: ["x"], user_id: 5, vaqt: "2026-09-20T10:00:00Z" } };
  const r = vazifaXulosasi(ishlar, [vazifa("xona")]);
  assert.equal(r.length, 2);
  assert.equal(r[1]!.kod, "eski");
  assert.equal(r[1]!.rasm, 1);
});

function navbat(xona: number, kechikkanKun = 0, otkazildi = false, topshirdi: string | null = "Ali"): OyNavbati {
  const d = new Date("2026-09-10T10:00:00Z");
  return { xona, boshlandi: d, tasdiqlandi: d, holat: "tasdiqlandi", kechikkanKun, topshirdi, otkazildi };
}

test("xonaXulosasi: darrov o'tkazilgan navbat sanalmaydi", () => {
  const r = xonaXulosasi([navbat(2), navbat(2, 0, true), navbat(1, 2), navbat(1, 1)]);
  assert.deepEqual(r, [
    { xona: 1, soni: 2, kechikkan: 2, kechikkanKun: 3, topshirilmagan: 0 },
    { xona: 2, soni: 1, kechikkan: 0, kechikkanKun: 0, topshirilmagan: 0 },
  ]);
});

test("xonaXulosasi: topshiriqsiz yopilgan navbat alohida sanaladi", () => {
  const [x] = xonaXulosasi([navbat(2), navbat(2, 0, false, null)]);
  assert.equal(x!.soni, 2);
  assert.equal(x!.topshirilmagan, 1);
});

test("oyOraligi: Toshkent oyi, dekabrdan keyin yangi yil", () => {
  assert.deepEqual(oyOraligi("2026-09"), {
    bosh: "2026-09-01T00:00:00+05:00",
    oxir: "2026-10-01T00:00:00+05:00",
  });
  assert.equal(oyOraligi("2026-12").oxir, "2027-01-01T00:00:00+05:00");
});

test("oldingiOy: yanvardan oldingisi o'tgan yilning dekabri", () => {
  assert.equal(oldingiOy("2026-09"), "2026-08");
  assert.equal(oldingiOy("2027-01"), "2026-12");
});

test("oylikHisobotKerakmi: o'tgan oy yuborilmagan bo'lsagina", () => {
  assert.equal(oylikHisobotKerakmi("2026-08", "2026-09"), null);
  assert.equal(oylikHisobotKerakmi("2026-08", "2026-10"), "2026-09");
  assert.equal(oylikHisobotKerakmi(null, "2026-10"), "2026-09");
  // Bir necha oy o'tib ketgan bo'lsa ham faqat eng oxirgisi — eski oylar
  // haqida kechikkan hisobot yog'dirilmaydi.
  assert.equal(oylikHisobotKerakmi("2026-05", "2026-10"), "2026-09");
});
