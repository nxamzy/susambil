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
  bajarilganMarta,
  barchaRasmlar,
  vazifaBajarildimi,
  vazifaOchiqmi,
  oraliqKunOtdi,
  MAJBURIY_DOIM_OCHIQ,
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

const T = "2026-08-09T00:00:00Z";

/** Eski (bitta `photo_id`) formatli belgi — orqaga moslik testi uchun. */
const fakeBelgisi = { photo_id: "x", user_id: 1, vaqt: T } as const;

/**
 * Vazifalar ro'yxati bazadan keladi — testlarda parametr sifatida beriladi.
 * `takror` standart 1 (oddiy vazifa); musor kabi takrorlanadigan ish uchun
 * ochiq beriladi.
 */
function vazifa(
  kod: string,
  rasmSoni: number,
  tartib: number,
  takror = 1,
  oraliq = 0,
): NavbatVazifasi {
  return {
    id: tartib + 1, kod, nom: kod, emoji: "🧹",
    rasm_soni: rasmSoni, takror_soni: takror, oraliq_kun: oraliq, tartib, faol: true,
  };
}

/** Standart to'rttalik — `db/schema.sql` seed qiladigan ro'yxat (musor 3 rasm × 2 marta). */
const STANDART: NavbatVazifasi[] = [
  vazifa("xona", 1, 0),
  vazifa("hammom", 3, 1),
  vazifa("oshxona", 1, 2),
  vazifa("musor", 3, 3, 2),
];

/** Ikkita hammomli uy — admin ro'yxatni shunday o'zgartirgan holat. */
const IKKI_HAMMOM: NavbatVazifasi[] = [
  vazifa("xona", 1, 0),
  vazifa("hammom", 3, 1),
  vazifa("hammom_2", 3, 2),
  vazifa("oshxona", 1, 3),
  vazifa("musor", 3, 4, 2),
];

/** Rasm(lar) yig'ilgan, lekin hali "✅ Tugatdim" bosilmagan belgi. */
function yigilgan(...ids: string[]): TurnIshBelgisi {
  return { photo_ids: ids, user_id: 1, vaqt: T };
}

/** `marta` marta yopilgan (Tugatdim bosilgan) belgi. */
function yopilgan(marta = 1, ids: string[] = ["a"]): TurnIshBelgisi {
  return { photo_ids: ids, user_id: 1, vaqt: T, bajarilgan: marta };
}

test("faqat rasm yig'ilgan, lekin marta yopilmagan bo'lsa vazifa BAJARILMAGAN", () => {
  // Ilgari rasm yig'ilishi bilan avtomatik "bajarildi" bo'lardi. Endi
  // "✅ Tugatdim" bosilishi shart.
  const ishlar: TurnIshlar = {
    xona: yigilgan("a"),
    hammom: yigilgan("a", "b", "c"),
    oshxona: yigilgan("a"),
    musor: yigilgan("a", "b", "c"),
  };
  assert.equal(barchaIshlarBajarildimi(ishlar, STANDART), false);
  assert.equal(bajarilganIshlarSoni(ishlar, STANDART), 0);
});

test("har vazifa yopilgach (musor 2 marta) barchaIshlarBajarildimi=true", () => {
  const ishlar: TurnIshlar = {
    xona: yopilgan(1),
    hammom: yopilgan(1, ["a", "b", "c"]),
    oshxona: yopilgan(1),
    musor: yopilgan(2, ["x", "y", "z"]),
  };
  assert.equal(barchaIshlarBajarildimi(ishlar, STANDART), true);
  assert.deepEqual(qolganIshlar(ishlar, STANDART), []);
  assert.equal(bajarilganIshlarSoni(ishlar, STANDART), 4);
});

test("musor 1/2 marta bajarilgan bo'lsa hali qoladi", () => {
  const ishlar: TurnIshlar = {
    xona: yopilgan(1),
    hammom: yopilgan(1, ["a", "b", "c"]),
    oshxona: yopilgan(1),
    musor: yopilgan(1, ["x", "y", "z"]),
  };
  assert.equal(barchaIshlarBajarildimi(ishlar, STANDART), false);
  assert.deepEqual(qolganIshlar(ishlar, STANDART).map((v) => v.kod), ["musor"]);
  assert.equal(bajarilganIshlarSoni(ishlar, STANDART), 3);
});

test("bajarilganMarta va vazifaBajarildimi", () => {
  assert.equal(bajarilganMarta(undefined), 0);
  assert.equal(bajarilganMarta(yigilgan("a", "b", "c")), 0); // rasm bor, lekin marta yopilmagan
  assert.equal(bajarilganMarta(yopilgan(2)), 2);

  const mus = vazifa("musor", 3, 0, 2);
  assert.equal(vazifaBajarildimi(yopilgan(1), mus), false);
  assert.equal(vazifaBajarildimi(yopilgan(2), mus), true);
  assert.equal(vazifaBajarildimi(yopilgan(3), mus), true); // ortiqcha marta ham "bajarilgan"
});

test("barchaRasmlar joriy marta + tarixdagi martalarni qo'shadi; ishRasmlari faqat joriy", () => {
  const belgi: TurnIshBelgisi = {
    photo_ids: ["d", "e", "f"], user_id: 1, vaqt: T, bajarilgan: 1,
    tarix: [{ photo_ids: ["a", "b", "c"], user_id: 1, vaqt: T }],
  };
  assert.deepEqual(barchaRasmlar(belgi), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(ishRasmlari(belgi), ["d", "e", "f"]);
  assert.deepEqual(barchaRasmlar(undefined), []);
});

test("navbatRasmlari musorning IKKALA martasidagi rasmlarni ham yig'adi", () => {
  const ishlar: TurnIshlar = {
    xona: yopilgan(1, ["x"]),
    musor: {
      photo_ids: ["m4", "m5", "m6"], user_id: 1, vaqt: T, bajarilgan: 2,
      tarix: [{ photo_ids: ["m1", "m2", "m3"], user_id: 1, vaqt: T }],
    },
  };
  const vz = [vazifa("xona", 1, 0), vazifa("musor", 3, 1, 2)];
  assert.deepEqual(navbatRasmlari(ishlar, vz), ["x", "m1", "m2", "m3", "m4", "m5", "m6"]);
});

test("ikkita hammom alohida vazifa — biri yopilsa ikkinchisi hali qoladi", () => {
  const ishlar: TurnIshlar = {
    xona: yopilgan(1),
    hammom: yopilgan(1, ["a", "b", "c"]),
    oshxona: yopilgan(1),
    musor: yopilgan(2, ["x", "y", "z"]),
  };
  assert.equal(barchaIshlarBajarildimi(ishlar, IKKI_HAMMOM), false);
  assert.deepEqual(qolganIshlar(ishlar, IKKI_HAMMOM).map((v) => v.kod), ["hammom_2"]);

  ishlar["hammom_2"] = yopilgan(1, ["d", "e", "f"]);
  assert.equal(barchaIshlarBajarildimi(ishlar, IKKI_HAMMOM), true);
});

test("bo'sh vazifalar ro'yxatida navbatni yakunlab bo'lmaydi", () => {
  assert.equal(barchaIshlarBajarildimi({ xona: yopilgan(1) }, []), false);
});

test("navbatRasmlari ro'yxatdan chiqarilgan vazifaning rasmlarini ham oladi", () => {
  const ishlar: TurnIshlar = { xona: yopilgan(1, ["x"]), hammom: yopilgan(1, ["a", "b", "c"]) };
  const faqatXona = [vazifa("xona", 1, 0)];
  assert.deepEqual(navbatRasmlari(ishlar, faqatXona), ["x", "a", "b", "c"]);
});

test("ishRasmlari eski (photo_id) va yangi (photo_ids) formatni ikkalasini ham o'qiydi", () => {
  assert.deepEqual(ishRasmlari(undefined), []);
  assert.deepEqual(ishRasmlari(fakeBelgisi), ["x"]);
  assert.deepEqual(ishRasmlari(yigilgan("a", "b", "c")), ["a", "b", "c"]);
});

test("majburiyOchildimi: muddatgacha 2 kun qolganda hali yopiq (ochilish 1 kun)", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  const ikkiKunOldin = new Date("2026-08-08T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, 1, ikkiKunOldin), false);
});

test("majburiyOchildimi: aynan 1 kun qolganda ochiladi", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  const birKunOldin = new Date("2026-08-09T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, 1, birKunOldin), true);
});

test("majburiyOchildimi: muddat allaqachon o'tib ketgan bo'lsa ham ochiq", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  const kechikkan = new Date("2026-08-15T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, 1, kechikkan), true);
});

test("majburiyOchildimi: ochilish kuni sozlanadi — 3 kun qolganda ham ochiq", () => {
  // Admin sikl uzunligini qisqartirsa (masalan 2 kun), majburiy vazifalar
  // ham erta ochilishi kerak — shuning uchun qiymat sozlamadan keladi.
  const muddat = new Date("2026-08-10T00:00:00Z");
  const uchKunOldin = new Date("2026-08-07T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, 1, uchKunOldin), false);
  assert.equal(majburiyOchildimi(muddat, 3, uchKunOldin), true);
});

test("majburiyOchildimi: MAJBURIY_DOIM_OCHIQ bilan har doim ochiq", () => {
  const muddat = new Date("2026-08-10T00:00:00Z");
  const juda_erta = new Date("2026-01-01T00:00:00Z");
  assert.equal(majburiyOchildimi(muddat, MAJBURIY_DOIM_OCHIQ, juda_erta), true);
});

test("vazifaOchiqmi: oraliq_kun=0 vazifa odatdagi 'oxirgi kun' qulfi bilan", () => {
  const turn = {
    boshlandi: new Date("2026-08-05T00:00:00Z"),
    muddat: new Date("2026-08-10T00:00:00Z"),
  };
  const xona = vazifa("xona", 1, 0); // oraliq_kun = 0
  assert.equal(vazifaOchiqmi(turn, xona, 1, new Date("2026-08-08T00:00:00Z")), false); // 2 kun qoldi
  assert.equal(vazifaOchiqmi(turn, xona, 1, new Date("2026-08-09T00:00:00Z")), true); // 1 kun qoldi
});

test("vazifaOchiqmi: oraliq_kun>0 vazifa navbat boshlanganidan hisoblanadi, muddatdan emas", () => {
  const turn = {
    boshlandi: new Date("2026-08-05T00:00:00Z"),
    muddat: new Date("2026-08-10T00:00:00Z"),
  };
  const musor = vazifa("musor", 3, 3, 2, 3); // 3-kundan ochiladi
  // Navbat boshlanganiga 2 kun — hali yopiq (majburiyKuni=1 bo'lsa ham).
  assert.equal(vazifaOchiqmi(turn, musor, 1, new Date("2026-08-07T00:00:00Z")), false);
  // 3 kun bo'ldi — ochildi (muddatga hali 2 kun bor bo'lsa ham).
  assert.equal(vazifaOchiqmi(turn, musor, 1, new Date("2026-08-08T00:00:00Z")), true);
});

test("oraliqKunOtdi: oraliq oynasi ochilganidan beri necha kun", () => {
  const turn = { boshlandi: new Date("2026-08-05T00:00:00Z") };
  assert.equal(oraliqKunOtdi(turn, 3, new Date("2026-08-07T12:00:00Z")), -1); // 2.5 kun -> floor 2, -3 = -1
  assert.equal(oraliqKunOtdi(turn, 3, new Date("2026-08-08T00:00:00Z")), 0); // aynan 3-kun
  assert.equal(oraliqKunOtdi(turn, 3, new Date("2026-08-10T00:00:00Z")), 2); // 5-kun
});
