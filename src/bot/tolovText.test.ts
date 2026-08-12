/**
 * Oylik to'lov ko'rinishlari. Bu yerda tekshiriladigan asosiy narsa —
 * adminning bir qarashda "kimdan qancha qolgan"ni ko'ra olishi va
 * tekshiruvda turgan odam "to'lamagan" deb belgilanib qolmasligi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TolovSikl, User } from "../db/index.js";
import type {
  EslatmaNomzodi, MuddatNatija, MuddatSurati, SiklOdam, TolovDashboard, TolovTarix,
} from "../core/tolov.js";
import {
  eslatmaShoshilinchligi, pul, sanaQatori, siklOyi, tolovDashboardMatni,
  tolovEslatmaXabari, tolovFoydalanuvchiMatni, tolovGuruhEslatmasi,
  tolovMuddatGuruhXabari, tolovMuddatXabari, tolovTarixi,
} from "./text.js";

const TALAB = 900_000;

const AVGUST: TolovSikl = {
  id: 1,
  davr: "2026-08-01",
  talab: TALAB,
  muddat: "2026-08-15",
  holat: "ochiq",
  guruh_eslatma: null,
  muddat_hisoblandi: null,
  yakunlandi: null,
  created_at: new Date("2026-08-01T00:00:00Z"),
};

function odam(over: Partial<SiklOdam> & { userId: number; ism: string }): SiklOdam {
  const tasdiqlangan = over.tasdiqlangan ?? 0;
  return {
    tasdiqlangan,
    qoldiq: Math.max(0, TALAB - tasdiqlangan),
    kutilmoqdaSumma: 0,
    kutilmoqdaSoni: 0,
    daraja: tasdiqlangan >= TALAB ? "tola" : tasdiqlangan > 0 ? "qisman" : "tolanmagan",
    muddat: null,
    ...over,
  };
}

function dashboard(odamlar: SiklOdam[], sikl = AVGUST): TolovDashboard {
  const jamiTasdiqlangan = odamlar.reduce((n, o) => n + o.tasdiqlangan, 0);
  const jamiTalab = sikl.talab * odamlar.length;
  return {
    sikl,
    talab: sikl.talab,
    jamiTalab,
    jamiTasdiqlangan,
    jamiQoldiq: Math.max(0, jamiTalab - jamiTasdiqlangan),
    kutilmoqdaSoni: odamlar.reduce((n, o) => n + o.kutilmoqdaSoni, 0),
    radSoni: 0,
    odamlar,
    tola: odamlar.filter((o) => o.daraja === "tola"),
    qisman: odamlar.filter((o) => o.daraja === "qisman"),
    tolanmagan: odamlar.filter((o) => o.daraja === "tolanmagan"),
  };
}

const ALI = odam({ userId: 1, ism: "Ali", tasdiqlangan: 900_000 });
const VALI = odam({ userId: 2, ism: "Vali", tasdiqlangan: 700_000 });
const HASAN = odam({ userId: 3, ism: "Hasan", tasdiqlangan: 0 });

test("admin oylik ko'rinishida uch holat ham ajratib ko'rsatiladi", () => {
  const m = tolovDashboardMatni(dashboard([ALI, VALI, HASAN]));

  assert.match(m, /TO'LIQ TO'LAGANLAR \(1\)/);
  assert.match(m, /QISMAN TO'LAGANLAR \(1\)/);
  assert.match(m, /TO'LAMAGANLAR \(1\)/);

  for (const ism of ["Ali", "Vali", "Hasan"]) assert.ok(m.includes(ism), `${ism} ko'rinmadi`);

  assert.ok(m.includes(pul(200_000)), "Valining qoldig'i ko'rsatilishi kerak");
  assert.ok(m.includes(pul(900_000)), "Hasanning qoldig'i ko'rsatilishi kerak");
  assert.ok(m.includes(siklOyi(AVGUST)), "qaysi oy ekani ko'rinishi kerak");
});

test("admin ko'rinishida jami yig'im va yetmagan summa chiqadi", () => {
  const m = tolovDashboardMatni(dashboard([ALI, VALI, HASAN]));
  assert.ok(m.includes(pul(2_700_000)), "jami talab 3 × 900k");
  assert.ok(m.includes(pul(1_600_000)), "jami tasdiqlangan 900k + 700k");
  assert.ok(m.includes(pul(1_100_000)), "jami qoldiq");
});

test("tekshiruvda turgan to'lov admin ko'rinishida alohida belgilanadi", () => {
  const kutayotgan = odam({
    userId: 4, ism: "Sardor", tasdiqlangan: 0, kutilmoqdaSoni: 1, kutilmoqdaSumma: 900_000,
  });
  const m = tolovDashboardMatni(dashboard([kutayotgan]));
  assert.match(m, /tekshiruvda/);
  assert.ok(m.includes(pul(900_000)));
});

test("muddat surati bo'lsa 'muddatda yetmagan' alohida ko'rsatiladi", () => {
  const surat: MuddatNatija = {
    talab: TALAB, tasdiqlangan: 700_000, kutilmoqda: 0, qoldiq: 200_000,
    daraja: "qisman", tekshiruvKutilmoqda: false, jarima: 20_000,
  };
  // Muddatdan keyin yana 100k to'lagan — joriy qoldiq 100k, lekin MUDDATDA
  // 200k yetmagan edi. Ikkalasi ham ko'rinishi kerak.
  const kech = odam({
    userId: 5, ism: "Bekzod", tasdiqlangan: 800_000, muddat: surat,
  });
  const m = tolovDashboardMatni(dashboard([kech]));
  assert.ok(m.includes(pul(100_000)), "joriy qoldiq");
  assert.ok(m.includes(pul(200_000)), "muddatda yetmagan summa");
  assert.ok(m.includes(pul(20_000)), "jarima");
});

test("tekshiruv kechikkanda admin ko'rinishida jarima yozilmagani aytiladi", () => {
  const surat: MuddatNatija = {
    talab: TALAB, tasdiqlangan: 0, kutilmoqda: 900_000, qoldiq: 900_000,
    daraja: "tolanmagan", tekshiruvKutilmoqda: true, jarima: 0,
  };
  const m = tolovDashboardMatni(dashboard([odam({ userId: 6, ism: "Jasur", muddat: surat })]));
  assert.match(m, /jarima yozilmadi/);
});

test("foydalanuvchi kartochkasi barcha talab qilingan maydonlarni ko'rsatadi", () => {
  const tarix: TolovTarix[] = [
    {
      id: 2, user_id: 2, sikl_id: 1, kiritgan_summa: "300000", tasdiqlangan_summa: null,
      dalil_id: "x", dalil_turi: "rasm", holat: "kutilmoqda", hal_qildi: null,
      rad_sababi: null, admin_msgs: [], guruh_msg_id: null,
      created_at: new Date("2026-08-14T10:00:00Z"), hal_qilindi: null,
      hal_qildi_ism: null, sikl_davr: "2026-08-01",
    },
    {
      id: 1, user_id: 2, sikl_id: 1, kiritgan_summa: "700000", tasdiqlangan_summa: "700000",
      dalil_id: "y", dalil_turi: "rasm", holat: "tasdiqlandi", hal_qildi: 9,
      rad_sababi: null, admin_msgs: [], guruh_msg_id: null,
      created_at: new Date("2026-08-05T10:00:00Z"),
      hal_qilindi: new Date("2026-08-06T10:00:00Z"),
      hal_qildi_ism: "Sorabek", sikl_davr: "2026-08-01",
    },
  ];

  const m = tolovFoydalanuvchiMatni(
    AVGUST,
    { ...VALI, kutilmoqdaSoni: 1, kutilmoqdaSumma: 300_000 },
    tarix,
  );

  assert.ok(m.includes("VALI"));
  assert.ok(m.includes(pul(TALAB)), "talab");
  assert.ok(m.includes(pul(700_000)), "tasdiqlangan");
  assert.ok(m.includes(pul(200_000)), "qoldiq");
  assert.ok(m.includes(pul(300_000)), "tekshiruvdagi summa");
  assert.match(m, /MUDDAT NATIJASI/);
  assert.match(m, /TO'LOV TARIXI/);
  assert.match(m, /Muddat hali kelmagan/, "muddat kelmagan bo'lsa shunday deyilsin");
  assert.ok(m.includes("05.08.2026"), "yuborilgan sana");
  assert.ok(m.includes("06.08.2026"), "hal qilingan sana alohida");
});

test("muddat xabari tekshiruvdagi odamni jazolamaydi", () => {
  const m = tolovMuddatXabari(AVGUST, {
    talab: TALAB, tasdiqlangan: 0, kutilmoqda: 900_000, qoldiq: 900_000,
    daraja: "tolanmagan", tekshiruvKutilmoqda: true, jarima: 0,
  });
  assert.match(m, /hech qanday jarima yozilmadi/);
  assert.ok(!/Jarima: <b>/.test(m), "jarima summasi ko'rsatilmasligi kerak");
});

test("muddat xabari to'liq to'laganga minnatdorchilik bildiradi", () => {
  const m = tolovMuddatXabari(AVGUST, {
    talab: TALAB, tasdiqlangan: 900_000, kutilmoqda: 0, qoldiq: 0,
    daraja: "tola", tekshiruvKutilmoqda: false, jarima: 0,
  });
  assert.match(m, /muddatida to'liq tashladingiz/);
});

test("guruh muddat xabarida qarzdorlar va tekshiruvdagilar ajratiladi", () => {
  const natijalar: MuddatSurati[] = [
    {
      userId: 1, ism: "Ali", talab: TALAB, tasdiqlangan: 900_000, kutilmoqda: 0,
      qoldiq: 0, daraja: "tola", tekshiruvKutilmoqda: false, jarima: 0,
    },
    {
      userId: 2, ism: "Vali", talab: TALAB, tasdiqlangan: 700_000, kutilmoqda: 0,
      qoldiq: 200_000, daraja: "qisman", tekshiruvKutilmoqda: false, jarima: 0,
    },
    {
      userId: 3, ism: "Hasan", talab: TALAB, tasdiqlangan: 0, kutilmoqda: 900_000,
      qoldiq: 900_000, daraja: "tolanmagan", tekshiruvKutilmoqda: true, jarima: 0,
    },
  ];

  const m = tolovMuddatGuruhXabari(AVGUST, natijalar);
  assert.match(m, /To'liq to'lamaganlar \(2\)/);
  assert.ok(!m.includes("Ali —"), "to'liq to'lagan qarzdorlar ro'yxatiga tushmasin");
  assert.ok(m.includes("Vali"));
  assert.match(m, /tekshiruv kutilmoqda, jarima yozilmadi/);
  assert.ok(m.includes(pul(1_600_000)), "yig'ilgan jami");
});

test("guruh muddat xabari hamma to'laganda qisqa bo'ladi", () => {
  const m = tolovMuddatGuruhXabari(AVGUST, [
    {
      userId: 1, ism: "Ali", talab: TALAB, tasdiqlangan: 900_000, kutilmoqda: 0,
      qoldiq: 0, daraja: "tola", tekshiruvKutilmoqda: false, jarima: 0,
    },
  ]);
  assert.match(m, /Hamma o'z ulushini muddatida to'liq tashladi/);
  assert.ok(!/To'liq to'lamaganlar/.test(m));
});

test("to'lov tarixi oylar bo'yicha guruhlanadi — eski oy yangisining ostida qolmaydi", () => {
  const yozuv = (id: number, davr: string, summa: string): TolovTarix => ({
    id, user_id: 1, sikl_id: davr === "2026-09-01" ? 2 : 1,
    kiritgan_summa: summa, tasdiqlangan_summa: summa, dalil_id: "x", dalil_turi: "rasm",
    holat: "tasdiqlandi", hal_qildi: 9, rad_sababi: null, admin_msgs: [], guruh_msg_id: null,
    created_at: new Date(`${davr}T10:00:00Z`), hal_qilindi: new Date(`${davr}T12:00:00Z`),
    hal_qildi_ism: "Sorabek", sikl_davr: davr,
  });

  const m = tolovTarixi([yozuv(2, "2026-09-01", "900000"), yozuv(1, "2026-08-01", "900000")]);
  assert.match(m, /SENTABR OYI/);
  assert.match(m, /AVGUST OYI/);
  assert.ok(
    m.indexOf("SENTABR OYI") < m.indexOf("AVGUST OYI"),
    "eng yangi oy birinchi turishi kerak",
  );
});

test("sanaQatori kalendar sanasini mintaqa hisobisiz o'qiydi", () => {
  assert.equal(sanaQatori("2026-08-15"), "15-avgust");
  assert.equal(sanaQatori("2026-01-01"), "1-yanvar");
  assert.equal(sanaQatori("2026-12-31"), "31-dekabr");
});

// ---------------------------------------------------------------------------
// KUCHAYIB BORUVCHI OGOHLANTIRISH
// ---------------------------------------------------------------------------

test("ogohlantirish har kuni kuchayadi: 3 → 2 → 1 → bugun → kechikdi", () => {
  assert.equal(eslatmaShoshilinchligi(3).emoji, "⚠️");
  assert.equal(eslatmaShoshilinchligi(2).emoji, "🚨");
  assert.equal(eslatmaShoshilinchligi(1).emoji, "🔴");
  assert.equal(eslatmaShoshilinchligi(0).emoji, "🚨");
  assert.equal(eslatmaShoshilinchligi(-1).emoji, "⛔️");

  assert.match(eslatmaShoshilinchligi(3).ogohlantirish, /atigi 3 KUN QOLDI/);
  assert.match(eslatmaShoshilinchligi(2).ogohlantirish, /atigi 2 KUN QOLDI/);
  assert.match(eslatmaShoshilinchligi(1).ogohlantirish, /ERTAGA OXIRGI KUN/);
  assert.match(eslatmaShoshilinchligi(0).ogohlantirish, /MUDDAT BUGUN TUGAYDI/);
  assert.match(eslatmaShoshilinchligi(-3).ogohlantirish, /MUDDAT 3 KUN OLDIN TUGAGAN/);
});

test("har bir bosqichning sarlavhasi va chaqirig'i alohida", () => {
  const bosqichlar = [3, 2, 1, 0, -1].map(eslatmaShoshilinchligi);
  const sarlavhalar = new Set(bosqichlar.map((b) => b.sarlavha));
  assert.ok(sarlavhalar.size >= 4, "sarlavha bosqichlar bo'ylab o'zgarishi kerak");
  for (const b of bosqichlar) assert.ok(b.chaqiriq.length > 10);
});

function nomzod(over: Partial<EslatmaNomzodi> = {}): EslatmaNomzodi {
  const tasdiqlangan = over.tasdiqlangan ?? 400_000;
  return {
    userId: 2,
    ism: "Vali",
    user: { id: 2, ism: "Vali", telegram_id: "102" } as User,
    tasdiqlangan,
    qoldiq: TALAB - tasdiqlangan,
    kutilmoqdaSumma: 0,
    oxirgiEslatma: null,
    ...over,
  };
}

test("ogohlantirish joriy tasdiqlangan balans va qoldiqni ko'rsatadi", () => {
  const m = tolovEslatmaXabari(AVGUST, nomzod(), 3);
  assert.match(m, /atigi 3 KUN QOLDI/);
  assert.ok(m.includes("15-avgust"), "muddat sanasi");
  assert.ok(m.includes(pul(900_000)), "talab");
  assert.ok(m.includes(pul(400_000)), "to'langan");
  assert.ok(m.includes(pul(500_000)), "qoldiq");
});

test("tekshiruvdagi to'lov ALOHIDA ko'rsatiladi va hisobga qo'shilmaydi", () => {
  const m = tolovEslatmaXabari(AVGUST, nomzod({ kutilmoqdaSumma: 300_000 }), 2);
  assert.match(m, /Tekshiruvda: /);
  assert.ok(m.includes(pul(300_000)), "tekshiruvdagi summa ko'rinsin");
  assert.match(m, /hisobga qo'shilmagan/);
  assert.ok(
    m.includes(pul(500_000)),
    "qoldiq faqat tasdiqlangandan hisoblanadi — 200 000 emas",
  );
  assert.ok(!m.includes(pul(200_000)), "tekshiruvdagi pul qoldiqni kamaytirmasin");
});

test("tekshiruvi yo'q odamda ortiqcha qator chiqmaydi", () => {
  assert.ok(!/Tekshiruvda/.test(tolovEslatmaXabari(AVGUST, nomzod(), 3)));
});

test("muddat kuni va undan keyin ohang o'zgaradi", () => {
  const bugungi = tolovEslatmaXabari(AVGUST, nomzod(), 0);
  assert.match(bugungi, /MUDDAT BUGUN TUGAYDI/);
  assert.match(bugungi, /BUGUN tashlashingiz shart/);

  const kechikkan = tolovEslatmaXabari(AVGUST, nomzod(), -2);
  assert.match(kechikkan, /MUDDAT 2 KUN OLDIN TUGAGAN/);
  assert.match(kechikkan, /muddati allaqachon o'tgan/);
});

test("guruh eslatmasi ham kuchayadi va shaxsiy ma'lumot chiqarmaydi", () => {
  const d = dashboard([ALI, VALI, HASAN]);
  const m = tolovGuruhEslatmasi(d, 1);
  assert.match(m, /ERTAGA OXIRGI KUN/);
  assert.ok(m.includes(pul(1_600_000)), "yig'ilgan jami");
  assert.ok(m.includes(pul(1_100_000)), "yetmayotgan jami");
  assert.match(m, /2<\/b> kishi/, "qarzdorlar soni");
  assert.ok(!m.includes("9860"), "karta raqami guruhga chiqmasin");
});
