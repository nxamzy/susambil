import { test } from "node:test";
import assert from "node:assert/strict";
import type { TurnIshlar } from "../db/index.js";
import {
  keyingiJoy,
  kechikkanKun,
  barchaIshlarBajarildimi,
  qolganIshlar,
  bajarilganIshlarSoni,
} from "./rotation.js";

/** Berilgan joydan boshlab n ta qadam yuradi va bosib o'tilgan o'rinlarni qaytaradi. */
function yurish(boshJoy: number, soni: number, qadam: number): number[] {
  const yol = [boshJoy];
  let joy = boshJoy;
  let oldingi = -1;
  for (let i = 0; i < qadam; i++) {
    const keyingi = keyingiJoy(joy, oldingi, soni);
    oldingi = joy;
    joy = keyingi;
    yol.push(joy);
  }
  return yol;
}

test("tartib oxiriga yetgach boshiga sakramaydi, orqasiga qaytadi", () => {
  // 4 xona, tartib 0..3 → xona raqamlari 1..4
  // Boshi 1-xona (joy 0): 1 2 3 4 3 2 1 2 3 4
  assert.deepEqual(
    yurish(0, 4, 9).map((j) => j + 1),
    [1, 2, 3, 4, 3, 2, 1, 2, 3, 4],
  );
});

test("hozirgi holat: 4-xonadan keyin 3-xona keladi", () => {
  // Bazada faol navbat 4-xonada (joy 3), oldin tugagan navbat yo'q
  assert.equal(keyingiJoy(3, -1, 4), 2);
});

test("oxirgi xonadan boshlansa ham orqaga qaytadi", () => {
  assert.deepEqual(
    yurish(3, 4, 6).map((j) => j + 1),
    [4, 3, 2, 1, 2, 3, 4],
  );
});

test("bir xil o'rin ketma-ket ikki marta kelmaydi", () => {
  const yol = yurish(0, 4, 20);
  for (let i = 1; i < yol.length; i++) {
    assert.notEqual(yol[i], yol[i - 1], `${i}-qadamda xona o'zgarmadi`);
  }
});

test("ikki xonada oddiy almashinuv bo'ladi", () => {
  assert.deepEqual(yurish(0, 2, 4), [0, 1, 0, 1, 0]);
});

test("bitta xona bo'lsa o'zida qoladi", () => {
  assert.equal(keyingiJoy(0, -1, 1), 0);
});

test("kechikkanKun muddatdan oldin nol qaytaradi", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  assert.equal(kechikkanKun(muddat, new Date("2026-08-09T00:00:00Z")), 0);
  assert.equal(kechikkanKun(muddat, new Date("2026-08-10T00:00:00Z")), 0);
});

test("kechikkanKun boshlangan kunni ham to'liq kun deb sanaydi", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  assert.equal(kechikkanKun(muddat, new Date("2026-08-10T00:00:01Z")), 1);
  assert.equal(kechikkanKun(muddat, new Date("2026-08-12T00:00:00Z")), 2);
});

const fakeBelgisi = { photo_id: "x", user_id: 1, vaqt: "2026-08-09T00:00:00Z" } as const;

test("hech qanday vazifa bajarilmagan bo'lsa barchaIshlarBajarildimi=false", () => {
  assert.equal(barchaIshlarBajarildimi({}), false);
});

test("faqat ba'zi vazifalar bajarilgan bo'lsa hali false", () => {
  const ishlar: TurnIshlar = { xona: fakeBelgisi, hammom: fakeBelgisi };
  assert.equal(barchaIshlarBajarildimi(ishlar), false);
  assert.deepEqual(qolganIshlar(ishlar), ["oshxona", "musor"]);
  assert.equal(bajarilganIshlarSoni(ishlar), 2);
});

test("barcha 4 ta vazifa bajarilgach barchaIshlarBajarildimi=true", () => {
  const ishlar: TurnIshlar = {
    xona: fakeBelgisi,
    hammom: fakeBelgisi,
    oshxona: fakeBelgisi,
    musor: fakeBelgisi,
  };
  assert.equal(barchaIshlarBajarildimi(ishlar), true);
  assert.deepEqual(qolganIshlar(ishlar), []);
  assert.equal(bajarilganIshlarSoni(ishlar), 4);
});
