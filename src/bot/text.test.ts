import { test } from "node:test";
import assert from "node:assert/strict";
import { reytingRoyxati } from "./text.js";
import type { OdamBall } from "../core/rating.js";

function odam(over: Partial<OdamBall> & { userId: number; ism: string }): OdamBall {
  return {
    xona: 1, ishlar: {}, ishSoni: 0, xarajat: 0, xarajatSumma: 0, tasdiq: 0,
    navbatSoni: 0, kechikkanKun: 0, navbatBall: 0, ishBall: 0, xarajatBall: 0,
    tasdiqBall: 0, shikoyatBall: 0, shikoyatSoni: 0, tuzatishBall: 0, jami: 0,
    ...over,
  };
}

test("hech kimda ball yo'q bo'lsa bo'sh xabar chiqadi", () => {
  const s = reytingRoyxati([odam({ userId: 1, ism: "Ali" })], null, "avgust").join("\n");
  assert.match(s, /hali ball yig'ilmagan/);
});

test("shikoyat jarimasi bilan manfiy jami ham ro'yxatda ko'rinadi", () => {
  const odamlar = [
    odam({ userId: 1, ism: "Ali", ishBall: 30, jami: 30 }),
    // Jarima ishBall'idan katta — jami manfiy bo'ladi, lekin yashirinmasligi kerak
    odam({ userId: 2, ism: "Vali", ishBall: 10, shikoyatBall: 40, jami: -30 }),
  ];
  const s = reytingRoyxati(odamlar, null, "avgust").join("\n");
  assert.match(s, /Vali/);
  assert.match(s, /-30<\/b> ball/);
  assert.match(s, /🔴 -40/);
});

test("nolli va manfiy ballilar aralash bo'lsa nol alohida qatorda qoladi", () => {
  const odamlar = [
    odam({ userId: 1, ism: "Ali", ishBall: 10, jami: 10 }),
    odam({ userId: 2, ism: "Boy", shikoyatBall: 5, jami: -5 }),
    odam({ userId: 3, ism: "Coy", jami: 0 }),
  ];
  const s = reytingRoyxati(odamlar, null, "avgust").join("\n");
  assert.match(s, /Ali/);
  assert.match(s, /Boy/);
  assert.match(s, /Hali ball yo'q: Coy/);
});

test("ko'rayotgan odam manfiy ball bilan ham o'z o'rnini ko'radi", () => {
  const odamlar = [
    odam({ userId: 1, ism: "Ali", ishBall: 10, jami: 10 }),
    odam({ userId: 2, ism: "Vali", shikoyatBall: 20, jami: -20 }),
  ];
  const s = reytingRoyxati(odamlar, 2, "avgust").join("\n");
  assert.match(s, /Sizning o'rningiz: 2/);
});
