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
  tolovKorinishi, tolovMuddatGuruhXabari, tolovMuddatXabari, tolovRoyxatMatni,
  tolovTakrorXabari, tolovTarixi, tolovTarixXulosasi, siklSarlavhasi,
  yigimEslatmaXabari, yigimGuruhElon, yigimKorinishi,
} from "./text.js";

const TALAB = 900_000;

const AVGUST: TolovSikl = {
  id: 1,
  davr: "2026-08-01",
  tur: "oylik",
  nom: null,
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
    kechikkan: false,
    jarima: 0,
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
    qarzdorlar: odamlar.filter((o) => o.qoldiq > 0).sort((a, b) => b.qoldiq - a.qoldiq),
    kechikkanlar: odamlar.filter((o) => o.kechikkan).sort((a, b) => b.qoldiq - a.qoldiq),
    jamiJarima: odamlar.reduce((n, o) => n + o.jarima, 0),
  };
}

const ALI = odam({ userId: 1, ism: "Ali", tasdiqlangan: 900_000 });
const VALI = odam({ userId: 2, ism: "Vali", tasdiqlangan: 700_000 });
const HASAN = odam({ userId: 3, ism: "Hasan", tasdiqlangan: 0 });

test("umumiy ko'rinish raqamlarni beradi — ro'yxatlar alohida tugmalarda", () => {
  const m = tolovDashboardMatni(dashboard([ALI, VALI, HASAN]));

  assert.match(m, /To'liq to'laganlar: <b>1<\/b>/);
  assert.match(m, /Qisman to'laganlar: <b>1<\/b>/);
  assert.match(m, /To'lamaganlar: <b>1<\/b>/);
  assert.ok(m.includes(pul(2_700_000)), "jami talab 3 × 900k");
  assert.ok(m.includes(pul(1_600_000)), "jami tasdiqlangan 900k + 700k");
  assert.ok(m.includes(pul(1_100_000)), "jami qoldiq");
  assert.ok(m.includes(siklOyi(AVGUST)), "qaysi oy ekani ko'rinishi kerak");

  // Umumiy ko'rinish ataylab qisqa: 12 kishilik uyda uchta to'liq ro'yxat
  // bitta xabarga sig'masdi va muhim raqamlar pastga tushib ketardi.
  assert.ok(m.length < 900, `umumiy ko'rinish qisqa bo'lishi kerak, hozir ${m.length}`);
});

test("qarzdorlar ro'yxati eng ko'p qarzdordan boshlanadi", () => {
  const d = dashboard([ALI, VALI, HASAN]);
  const m = tolovRoyxatMatni(d, "qarzdor");

  assert.match(m, /QARZDORLAR/);
  assert.ok(m.includes("Hasan") && m.includes("Vali"), "ikkala qarzdor ham");
  assert.ok(!m.includes("Ali —"), "to'liq to'lagan qarzdorlar ro'yxatiga tushmasin");
  assert.ok(
    m.indexOf("Hasan") < m.indexOf("Vali"),
    "900k qarzdor 200k qarzdordan oldin turishi kerak",
  );
  assert.ok(m.includes(pul(1_100_000)), "ro'yxat bo'yicha jami qoldiq");
});

test("to'laganlar ro'yxatida faqat to'liq to'laganlar", () => {
  const m = tolovRoyxatMatni(dashboard([ALI, VALI, HASAN]), "tolagan");
  assert.match(m, /TO'LIQ TO'LAGANLAR/);
  assert.ok(m.includes("Ali"));
  assert.ok(!m.includes("Hasan"), "to'lamagan bu ro'yxatga tushmasin");
});

test("bo'sh ro'yxat tushunarli xabar beradi", () => {
  const hammaTolagan = dashboard([ALI]);
  assert.match(tolovRoyxatMatni(hammaTolagan, "qarzdor"), /Qarzdor yo'q/);
  assert.match(tolovRoyxatMatni(hammaTolagan, "kechikkan"), /Kechikkan yo'q/);
});

test("kechikkanlar ro'yxati va jami jarima umumiy ko'rinishda chiqadi", () => {
  const kechikkan = odam({
    userId: 7, ism: "Bobur", tasdiqlangan: 400_000, kechikkan: true, jarima: 50_000,
  });
  const d = dashboard([ALI, kechikkan]);

  const umumiy = tolovDashboardMatni(d);
  assert.match(umumiy, /Kechikkanlar: <b>1<\/b>/);
  assert.ok(umumiy.includes(pul(50_000)), "jami jarima");

  const royxat = tolovRoyxatMatni(d, "kechikkan");
  assert.match(royxat, /KECHIKKANLAR/);
  assert.ok(royxat.includes("Bobur"));
  assert.ok(royxat.includes(pul(500_000)), "qoldiq");
  assert.ok(royxat.includes(pul(50_000)), "jarima qatori");
  assert.ok(royxat.includes("⛔️"), "kechikkan belgisi darajanikidan ustun turadi");
});

test("tekshiruvda turgan to'lov ro'yxatda alohida belgilanadi", () => {
  const kutayotgan = odam({
    userId: 4, ism: "Sardor", tasdiqlangan: 0, kutilmoqdaSoni: 1, kutilmoqdaSumma: 900_000,
  });
  const m = tolovRoyxatMatni(dashboard([kutayotgan]), "qarzdor");
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
  const kech = odam({ userId: 5, ism: "Bekzod", tasdiqlangan: 800_000, muddat: surat });
  const m = tolovRoyxatMatni(dashboard([kech]), "qarzdor");
  assert.ok(m.includes(pul(100_000)), "joriy qoldiq");
  assert.ok(m.includes(pul(200_000)), "muddatda yetmagan summa");
  assert.ok(m.includes(pul(20_000)), "jarima");
});

test("tekshiruv kechikkanda ro'yxatda jarima yozilmagani aytiladi", () => {
  const surat: MuddatNatija = {
    talab: TALAB, tasdiqlangan: 0, kutilmoqda: 900_000, qoldiq: 900_000,
    daraja: "tolanmagan", tekshiruvKutilmoqda: true, jarima: 0,
  };
  const m = tolovRoyxatMatni(
    dashboard([odam({ userId: 6, ism: "Jasur", muddat: surat })]),
    "qarzdor",
  );
  assert.match(m, /jarima yozilmadi/);
});

test("foydalanuvchi kartochkasi barcha talab qilingan maydonlarni ko'rsatadi", () => {
  const tarix: TolovTarix[] = [
    {
      id: 2, user_id: 2, sikl_id: 1, kiritgan_summa: "300000", tasdiqlangan_summa: null,
      dalil_id: "x", dalil_turi: "rasm", holat: "kutilmoqda", hal_qildi: null,
      rad_sababi: null, admin_msgs: [], guruh_msg_id: null,
      created_at: new Date("2026-08-14T10:00:00Z"), hal_qilindi: null,
      hal_qildi_ism: null, sikl_davr: "2026-08-01", sikl_tur: "oylik", sikl_nom: null,
    },
    {
      id: 1, user_id: 2, sikl_id: 1, kiritgan_summa: "700000", tasdiqlangan_summa: "700000",
      dalil_id: "y", dalil_turi: "rasm", holat: "tasdiqlandi", hal_qildi: 9,
      rad_sababi: null, admin_msgs: [], guruh_msg_id: null,
      created_at: new Date("2026-08-05T10:00:00Z"),
      hal_qilindi: new Date("2026-08-06T10:00:00Z"),
      hal_qildi_ism: "Sorabek", sikl_davr: "2026-08-01", sikl_tur: "oylik", sikl_nom: null,
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
    hal_qildi_ism: "Sorabek", sikl_davr: davr, sikl_tur: "oylik", sikl_nom: null,
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
    oxirgiEslatmaTs: null,
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

test("kechikkan foydalanuvchi o'z ko'rinishida buni darhol ko'radi", () => {
  const qabul = { ism: "Sorabek", karta: "9860350143875127" };
  const holat = {
    talab: TALAB, tasdiqlangan: 400_000, qoldiq: 500_000, daraja: "qisman" as const,
    kutilmoqdaSoni: 0, kutilmoqdaSumma: 0, kechikkan: true, jarima: 50_000, sikl: AVGUST,
  };
  const m = tolovKorinishi(qabul, holat);
  assert.match(m, /MUDDAT O'TIB KETGAN/);
  assert.ok(m.includes(pul(50_000)), "jarima ko'rsatilsin");
  assert.ok(m.includes(pul(500_000)), "qoldiq");
});

test("kechikmagan foydalanuvchida ogohlantirish qatori chiqmaydi", () => {
  const m = tolovKorinishi(
    { ism: "Sorabek", karta: "9860350143875127" },
    {
      talab: TALAB, tasdiqlangan: 400_000, qoldiq: 500_000, daraja: "qisman" as const,
      kutilmoqdaSoni: 0, kutilmoqdaSumma: 0, kechikkan: false, jarima: 0, sikl: AVGUST,
    },
  );
  assert.ok(!/MUDDAT O'TIB KETGAN/.test(m));
});

test("kechikish xabarida jarima faqat foiz o'rnatilganda chiqadi", () => {
  const n = nomzod();
  assert.match(tolovEslatmaXabari(AVGUST, n, -2, { jarima: 50_000 }), /Jarima/);
  assert.ok(
    !/Jarima/.test(tolovEslatmaXabari(AVGUST, n, -2, { jarima: 0 })),
    "foiz 0 bo'lsa jarima qatori umuman bo'lmasin",
  );
  assert.ok(
    !/Jarima/.test(tolovEslatmaXabari(AVGUST, n, 2, { jarima: 50_000 })),
    "muddat o'tmagan bo'lsa jarima ko'rsatilmasin",
  );
});

test("muddat kunida qolgan soat ko'rsatiladi", () => {
  const n = nomzod();
  assert.match(tolovEslatmaXabari(AVGUST, n, 0, { qolganSoat: 5 }), /<b>5 soat<\/b> qoldi/);
  assert.ok(
    !/soat qoldi/.test(tolovEslatmaXabari(AVGUST, n, 1, { qolganSoat: 5 })),
    "muddat kunidan boshqa kunda soat ko'rsatilmasin",
  );
});

test("takroriy chek xabari mavjud yozuvning holatini aytadi", () => {
  const asos = {
    id: 1, user_id: 2, sikl_id: 1, kiritgan_summa: "300000", dalil_id: "x",
    dalil_turi: "rasm" as const, hal_qildi: null, rad_sababi: null, admin_msgs: [],
    guruh_msg_id: null, created_at: new Date("2026-08-12T10:00:00Z"), hal_qilindi: null,
  };

  const kutilmoqda = tolovTakrorXabari({
    ...asos, tasdiqlangan_summa: null, holat: "kutilmoqda",
  });
  assert.match(kutilmoqda, /allaqachon yuborilgan/);
  assert.match(kutilmoqda, /tekshiruvda/);
  assert.ok(kutilmoqda.includes(pul(300_000)));

  const tasdiqlangan = tolovTakrorXabari({
    ...asos, tasdiqlangan_summa: "300000", holat: "tasdiqlandi",
  });
  assert.match(tasdiqlangan, /allaqachon tasdiqlangan/);
  assert.match(tasdiqlangan, /YANGI chek/, "yangi to'lov qanday qilinishi aytilsin");
});

test("tarix xulosasi oylarni holati bilan ko'rsatadi", () => {
  const sentabr: TolovSikl = { ...AVGUST, id: 2, davr: "2026-09-01", muddat: "2026-09-15" };
  const m = tolovTarixXulosasi([
    { sikl: sentabr, jamiTalab: 2_700_000, jamiTasdiqlangan: 900_000, jamiQoldiq: 1_800_000, odamSoni: 3 },
    {
      sikl: { ...AVGUST, holat: "yakunlandi" },
      jamiTalab: 2_700_000, jamiTasdiqlangan: 2_700_000, jamiQoldiq: 0, odamSoni: 3,
    },
  ]);
  assert.match(m, /Sentabr/);
  assert.match(m, /Avgust/);
  assert.ok(m.includes(pul(1_800_000)), "yetmagan summa");
  assert.ok(m.indexOf("Sentabr") < m.indexOf("Avgust"), "eng yangi oy birinchi");
});

test("bo'sh tarix tushunarli xabar beradi", () => {
  assert.match(tolovTarixXulosasi([]), /Hali oy yopilmagan/);
});

// ---------------------------------------------------------------------------
// PUL YIG'IMI
// ---------------------------------------------------------------------------

const YIGIM: TolovSikl = {
  id: 7,
  davr: null,
  tur: "yigim",
  nom: "Internet puli",
  talab: 30_000,
  muddat: "2026-09-14",
  holat: "ochiq",
  guruh_eslatma: null,
  muddat_hisoblandi: null,
  yakunlandi: null,
  created_at: new Date("2026-09-11T00:00:00Z"),
};

const KARTA = { ism: "Sorabek", karta: "9860350143875127" };

test("sikl sarlavhasi: oylik — oyi, yig'im — nomi", () => {
  assert.equal(siklSarlavhasi(AVGUST), "Avgust oyi");
  assert.match(siklSarlavhasi(YIGIM), /Internet puli/);
  // Yig'imda `davr` yo'q — siklOyi yiqilmasligi kerak.
  assert.equal(siklOyi(YIGIM), "Internet puli");
});

test("guruh e'loni kartani ATAYLAB ko'rsatadi — yig'imning butun ma'nosi shu", () => {
  const m = yigimGuruhElon(YIGIM, KARTA, 12);
  assert.match(m, /9860350143875127/);
  assert.match(m, /Internet puli/);
  assert.ok(m.includes(pul(30_000)));
  // 12 kishi × 30 000 = 360 000
  assert.ok(m.includes(pul(360_000)), "jami summa ko'rinishi kerak");
});

test("a'zoning yig'im ko'rinishi qolgan summani aniq aytadi", () => {
  const m = yigimKorinishi(KARTA, {
    talab: 30_000,
    tasdiqlangan: 10_000,
    qoldiq: 20_000,
    daraja: "qisman",
    kutilmoqdaSoni: 0,
    kutilmoqdaSumma: 0,
    kechikkan: false,
    jarima: 0,
    sikl: YIGIM,
  });
  assert.ok(m.includes(`Qoldi: <b>${pul(20_000)}</b>`));
  assert.match(m, /QISMAN TO'LANGAN/);
});

test("to'liq to'lagan odamga yig'imda 'to'lang' deyilmaydi", () => {
  const m = yigimKorinishi(KARTA, {
    talab: 30_000,
    tasdiqlangan: 30_000,
    qoldiq: 0,
    daraja: "tola",
    kutilmoqdaSoni: 0,
    kutilmoqdaSumma: 0,
    kechikkan: false,
    jarima: 0,
    sikl: YIGIM,
  });
  assert.match(m, /to'liq to'lagansiz/);
  assert.ok(!/chekni tashlang/.test(m));
});

test("eslatma qisqa va kartani takrorlaydi — chastotasi baland", () => {
  const m = yigimEslatmaXabari(
    YIGIM,
    { qoldiq: 30_000, tasdiqlangan: 0, kutilmoqdaSumma: 0 },
    KARTA,
  );
  assert.ok(m.includes(pul(30_000)));
  assert.match(m, /9860350143875127/);
  assert.match(m, /Internet puli/);
});

test("tekshiruvda turgan pul eslatmada alohida ko'rsatiladi", () => {
  const m = yigimEslatmaXabari(
    YIGIM,
    { qoldiq: 30_000, tasdiqlangan: 0, kutilmoqdaSumma: 30_000 },
    KARTA,
  );
  assert.match(m, /tekshiruvda turibdi/);
});

test("yig'im dashboardi 'oyi' demaydi — nomi bilan ko'rinadi", () => {
  const d: TolovDashboard = {
    ...dashboard([]),
    sikl: YIGIM,
    talab: 30_000,
  };
  const m = tolovDashboardMatni(d);
  assert.match(m, /PUL YIG'IMI/);
  assert.match(m, /Internet puli/);
  assert.ok(!/ oyi/.test(m), "yig'imda 'oyi' so'zi bo'lmasligi kerak");
});

test("to'lov tarixida yig'im va oylik to'lov alohida guruhlanadi", () => {
  const yozuv = (
    id: number,
    over: Partial<TolovTarix>,
  ): TolovTarix => ({
    id, user_id: 1, sikl_id: 1, kiritgan_summa: "30000", tasdiqlangan_summa: "30000",
    dalil_id: `d${id}`, dalil_turi: "rasm", holat: "tasdiqlandi", hal_qildi: 9,
    rad_sababi: null, admin_msgs: [], guruh_msg_id: null,
    created_at: new Date("2026-09-11T10:00:00Z"),
    hal_qilindi: new Date("2026-09-11T12:00:00Z"),
    hal_qildi_ism: "Sorabek", sikl_davr: null, sikl_tur: "oylik", sikl_nom: null,
    ...over,
  });

  const m = tolovTarixi([
    yozuv(2, { sikl_tur: "yigim", sikl_nom: "Internet puli", sikl_davr: null }),
    yozuv(1, { sikl_tur: "oylik", sikl_davr: "2026-08-01", kiritgan_summa: "900000" }),
  ]);
  assert.match(m, /INTERNET PULI/);
  assert.match(m, /AVGUST OYI/);
});
