import { test } from "node:test";
import assert from "node:assert/strict";
import type { TurnIshBelgisi, TurnIshlar } from "../db/index.js";
import type { NavbatVazifasi } from "./vazifalar.js";
import {
  keyingiJoy,
  kechikkanKun,
  barchaIshlarBajarildimi,
  qolganIshlar,
  bajarilganIshlarSoni,
  ishRasmlari,
  majburiyOchildimi,
  navbatRasmlari,
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

/** 1-rasmli vazifa uchun — eski (bitta `photo_id`) format ham qo'llab-quvvatlanadi. */
const fakeBelgisi = { photo_id: "x", user_id: 1, vaqt: "2026-08-09T00:00:00Z" } as const;

/**
 * Vazifalar ro'yxati endi bazadan keladi, shuning uchun testlarda ham
 * parametr sifatida beriladi — sof funksiyalar hech qanday global ro'yxatga
 * bog'lanmagan.
 */
function vazifa(kod: string, rasmSoni: number, tartib: number): NavbatVazifasi {
  return { id: tartib + 1, kod, nom: kod, emoji: "🧹", rasm_soni: rasmSoni, tartib, faol: true };
}

/** Standart to'rttalik — `db/schema.sql` seed qiladigan ro'yxatning o'zi. */
const STANDART: NavbatVazifasi[] = [
  vazifa("xona", 1, 0),
  vazifa("hammom", 3, 1),
  vazifa("oshxona", 1, 2),
  vazifa("musor", 1, 3),
];

/** Ikkita hammomli uy — admin ro'yxatni shunday o'zgartirgan holat. */
const IKKI_HAMMOM: NavbatVazifasi[] = [
  vazifa("xona", 1, 0),
  vazifa("hammom", 3, 1),
  vazifa("hammom_2", 3, 2),
  vazifa("oshxona", 1, 3),
  vazifa("musor", 1, 4),
];

function rasmlar(...ids: string[]): TurnIshBelgisi {
  return { photo_ids: ids, user_id: 1, vaqt: "2026-08-09T00:00:00Z" };
}

/** Hammom uchun to'liq — 3 ta rasm bilan. */
function hammomToliq(): TurnIshBelgisi {
  return rasmlar("a", "b", "c");
}

test("hech qanday vazifa bajarilmagan bo'lsa barchaIshlarBajarildimi=false", () => {
  assert.equal(barchaIshlarBajarildimi({}, STANDART), false);
});

test("faqat ba'zi vazifalar bajarilgan bo'lsa hali false", () => {
  const ishlar: TurnIshlar = { xona: fakeBelgisi, hammom: hammomToliq() };
  assert.equal(barchaIshlarBajarildimi(ishlar, STANDART), false);
  assert.deepEqual(qolganIshlar(ishlar, STANDART).map((v) => v.kod), ["oshxona", "musor"]);
  assert.equal(bajarilganIshlarSoni(ishlar, STANDART), 2);
});

test("hammom kerakli sondan kam rasm bilan hali bajarilgan hisoblanmaydi (1/3)", () => {
  const ishlar: TurnIshlar = {
    xona: fakeBelgisi,
    hammom: rasmlar("a"),
    oshxona: fakeBelgisi,
    musor: fakeBelgisi,
  };
  assert.equal(barchaIshlarBajarildimi(ishlar, STANDART), false);
  assert.deepEqual(qolganIshlar(ishlar, STANDART).map((v) => v.kod), ["hammom"]);
  assert.equal(bajarilganIshlarSoni(ishlar, STANDART), 3);
});

test("barcha vazifalar (hammom kerakli 3 rasm bilan) bajarilgach barchaIshlarBajarildimi=true", () => {
  const ishlar: TurnIshlar = {
    xona: fakeBelgisi,
    hammom: hammomToliq(),
    oshxona: fakeBelgisi,
    musor: fakeBelgisi,
  };
  assert.equal(barchaIshlarBajarildimi(ishlar, STANDART), true);
  assert.deepEqual(qolganIshlar(ishlar, STANDART), []);
  assert.equal(bajarilganIshlarSoni(ishlar, STANDART), 4);
});

test("kerakidan ORTIQ rasm ham bajarilgan hisoblanadi — rasm_soni minimum", () => {
  // Ilgari ortiqcha rasm umuman saqlanmasdi (albom bilan tashlanganida
  // yo'qolardi); endi saqlanadi va vazifani buzmaydi.
  const ishlar: TurnIshlar = { musor: rasmlar("a", "b", "c") };
  assert.equal(qolganIshlar(ishlar, [vazifa("musor", 1, 0)]).length, 0);
  assert.equal(barchaIshlarBajarildimi(ishlar, [vazifa("musor", 1, 0)]), true);
});

test("ikkita hammom alohida vazifa — biri to'lsa ikkinchisi hali qoladi", () => {
  const ishlar: TurnIshlar = {
    xona: fakeBelgisi,
    hammom: hammomToliq(),
    oshxona: fakeBelgisi,
    musor: fakeBelgisi,
  };
  assert.equal(barchaIshlarBajarildimi(ishlar, IKKI_HAMMOM), false);
  assert.deepEqual(qolganIshlar(ishlar, IKKI_HAMMOM).map((v) => v.kod), ["hammom_2"]);

  ishlar["hammom_2"] = rasmlar("d", "e", "f");
  assert.equal(barchaIshlarBajarildimi(ishlar, IKKI_HAMMOM), true);
});

test("bo'sh vazifalar ro'yxatida navbatni yakunlab bo'lmaydi", () => {
  // `every` bo'sh massivda `true` qaytaradi — admin hamma vazifani
  // o'chirib qo'ysa hech narsa qilmasdan topshirish mumkin bo'lardi.
  assert.equal(barchaIshlarBajarildimi({ xona: fakeBelgisi }, []), false);
});

test("navbatRasmlari ro'yxatdan chiqarilgan vazifaning rasmlarini ham oladi", () => {
  // Admin navbat o'rtasida "hammom"ni ikkiga bo'lsa, eski kalit hech qaysi
  // faol vazifaga to'g'ri kelmaydi — lekin u ham dalil, yo'qolmasligi kerak.
  const ishlar: TurnIshlar = { xona: fakeBelgisi, hammom: hammomToliq() };
  const faqatXona = [vazifa("xona", 1, 0)];
  assert.deepEqual(navbatRasmlari(ishlar, faqatXona), ["x", "a", "b", "c"]);
});

test("ishRasmlari eski (photo_id) va yangi (photo_ids) formatni ikkalasini ham o'qiydi", () => {
  assert.deepEqual(ishRasmlari(undefined), []);
  assert.deepEqual(ishRasmlari(fakeBelgisi), ["x"]);
  assert.deepEqual(ishRasmlari(hammomToliq()), ["a", "b", "c"]);
});

test("majburiyOchildimi: muddatgacha 2 kun qolganda hali yopiq", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  const ikkiKunOldin = new Date("2026-08-08T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, ikkiKunOldin), false);
});

test("majburiyOchildimi: aynan 1 kun qolganda ochiladi", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  const birKunOldin = new Date("2026-08-09T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, birKunOldin), true);
});

test("majburiyOchildimi: muddat allaqachon o'tib ketgan bo'lsa ham ochiq", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  const kechikkan = new Date("2026-08-15T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, kechikkan), true);
});
