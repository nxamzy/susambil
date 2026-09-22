import { test } from "node:test";
import assert from "node:assert/strict";
import type { Room, TolovSikl, Turn } from "../db/index.js";
import type { NavbatHisoboti, OylikHisobot } from "../core/hisobot.js";
import type { NavbatVazifasi } from "../core/vazifalar.js";
import {
  davomiylik,
  musorSignalNavbatchiga,
  navbatHisobotiMatni,
  oylikHisobotMatni,
  qisqartir,
  tartibQatori,
  uzrAdminga,
  yigimEslatmaXabari,
  yigimRoyxatOzgardiGuruh,
  yigimRoyxatSorovi,
} from "./text.js";

const ROOM: Room = { id: 3, raqam: 3, tartib: 1 };

function turn(over: Partial<Turn> = {}): Turn {
  return {
    id: 8,
    room_id: 3,
    boshlandi: new Date("2026-09-02T06:37:00Z"),
    muddat: new Date("2026-09-07T06:37:00Z"),
    tasdiqlandi: new Date("2026-09-10T08:43:00Z"),
    holat: "tasdiqlandi",
    kechikkan_kun: 1,
    oxirgi_ping: null,
    ishlar: {},
    oxirgi_eslatma: null,
    oraliq_eslatma: {},
    ...over,
  };
}

function hisobot(over: Partial<NavbatHisoboti> = {}): NavbatHisoboti {
  return {
    turn: turn(),
    room: ROOM,
    azolar: ["Jamshidbek", "Nizomaka"],
    vazifalar: [
      { kod: "xona", nom: "Xona", emoji: "🛏", bajarilgan: 1, takror: 1, userIds: [1], rasm: 1, bajaruvchilar: ["Jamshidbek"] },
      { kod: "musor", nom: "Musor", emoji: "♻️", bajarilgan: 1, takror: 2, userIds: [2], rasm: 3, bajaruvchilar: ["Nizomaka"] },
      { kod: "oshxona", nom: "Oshxona", emoji: "🍽", bajarilgan: 0, takror: 1, userIds: [], rasm: 0, bajaruvchilar: [] },
    ],
    topshiriq: { ism: "Jamshidbek", vaqt: new Date("2026-09-09T15:10:00Z"), rasm: 7 },
    tasdiqlovchilar: ["Ali", "Vali", "Soib"],
    radlar: [],
    signallar: [],
    keyingiXona: 2,
    ...over,
  };
}

test("navbat hisoboti: kechikish, har vazifa kim tomonidan, tasdiqlovchilar", () => {
  const m = navbatHisobotiMatni(hisobot());
  assert.match(m, /NAVBAT HISOBOTI — 3-xona/);
  assert.match(m, /1 kun kechikdi/);
  assert.match(m, /✅ 🛏 Xona — Jamshidbek · 1 rasm/);
  assert.match(m, /🟡 ♻️ Musor 1\/2 — Nizomaka · 3 rasm/);
  assert.match(m, /❌ 🍽 Oshxona — bajarilmagan/);
  assert.match(m, /Tasdiqlaganlar: Ali, Vali, Soib/);
  assert.match(m, /Keyingi: 2-xona/);
});

test("navbat hisoboti baho emas — ball, o'rin, medal yo'q", () => {
  const m = navbatHisobotiMatni(hisobot());
  assert.doesNotMatch(m, /ball|o'rin|🥇|🥈|🥉/i);
});

test("navbat hisoboti: musor signali hal qilingan va qilinmagani", () => {
  const signal = (hal: boolean) => ({
    id: 1, turn_id: 8, vazifa_kod: "musor", user_id: 5, ism: "Ali",
    created_at: new Date("2026-09-04T05:00:00Z"), oxirgi_eslatma: null,
    hal_qilindi: hal ? new Date("2026-09-04T07:00:00Z") : null,
    hal_qildi: hal ? 2 : null, hal_ism: hal ? "Nizomaka" : null,
  });
  const m = navbatHisobotiMatni(hisobot({ signallar: [signal(true), signal(false)] }));
  assert.match(m, /2 marta xabar berildi — 1 tasi tashlandi/);
  assert.match(m, /Nizomaka 2 soatda tashladi/);
  assert.match(m, /hal qilinmagan/);
});

test("navbat hisoboti: admin o'tkazgan, topshiriqsiz navbat", () => {
  const m = navbatHisobotiMatni(hisobot({ turn: turn({ holat: "admin_yopdi", kechikkan_kun: 0 }), topshiriq: null, tasdiqlovchilar: [] }));
  assert.match(m, /Admin yopdi yoki boshqa xonaga o'tkazdi/);
  assert.match(m, /Yakuniy topshiriq bo'lmagan/);
  // Topshiriqsiz yopilgan navbat "vaqtida" deb ko'rsatilmaydi.
  assert.doesNotMatch(m, /vaqtida/);
});

const YIGIM: TolovSikl = {
  id: 3, davr: null, tur: "yigim", nom: "Savdo ro'yxati 🛒",
  narsalar: ["Bumaga", "Hammom uchun azelit", "<Idish> & suyuqlik"],
  talab: 20_000, muddat: "2026-09-14", holat: "ochiq", guruh_eslatma: null,
  muddat_hisoblandi: null, yakunlandi: null, created_at: new Date("2026-09-11T07:19:00Z"),
};

test("oylik hisobot: xonalar, o'tkazilgan navbat, yig'im va sabablar", () => {
  const h: OylikHisobot = {
    davr: "2026-09",
    navbatlar: [],
    xonalar: [
      { xona: 1, soni: 1, kechikkan: 1, kechikkanKun: 2, topshirilmagan: 0 },
      { xona: 4, soni: 1, kechikkan: 0, kechikkanKun: 0, topshirilmagan: 0 },
      { xona: 2, soni: 1, kechikkan: 0, kechikkanKun: 0, topshirilmagan: 1 },
    ],
    signal: { jami: 3, hal: 2, ortachaSoat: 2.46 },
    oylik: null,
    yigimlar: [],
    shikoyat: { jami: 0, holatlar: {} },
    uzrlar: [{ ism: "Ali", soni: 2 }],
    faollik: 124,
  };
  h.navbatlar = [
    { xona: 1, boshlandi: new Date(), tasdiqlandi: new Date(), holat: "admin_yopdi", kechikkanKun: 2, topshirdi: null, otkazildi: false },
    { xona: 4, boshlandi: new Date(), tasdiqlandi: new Date(), holat: "tasdiqlandi", kechikkanKun: 0, topshirdi: null, otkazildi: false },
    { xona: 2, boshlandi: new Date(), tasdiqlandi: new Date(), holat: "admin_yopdi", kechikkanKun: 0, topshirdi: null, otkazildi: true },
  ];
  const m = oylikHisobotMatni(h);
  assert.match(m, /SENTABR OYI HISOBOTI/);
  assert.match(m, /NAVBAT<\/b> — 2 ta/);
  assert.match(m, /2-xona — 1 marta · 1 tasi topshirilmasdan yopildi/);
  assert.match(m, /4-xona — 1 marta · ✅ vaqtida/);
  assert.match(m, /1-xona — 1 marta · 1 tasi kechikdi \(jami 2 kun\)/);
  assert.match(m, /1 ta navbat darrov boshqa xonaga o'tkazilgan — sanalmadi/);
  assert.match(m, /Musor to'ldi: 3 marta · 2 tasi tashlandi · o'rtacha 2.5 soatda/);
  assert.match(m, /Ali \(2\)/);
  assert.doesNotMatch(m, /ball|🥇/i);
});

test("tartibQatori aylanmani ko'rsatadi: oxirida yana birinchisi", () => {
  assert.equal(tartibQatori([4, 3, 2, 1]), "4 → 3 → 2 → 1 → 4");
  assert.equal(tartibQatori([]), "—");
});

test("yig'im ro'yxati: to'liq chiqadi va HTML xavfsiz", () => {
  const m = yigimRoyxatOzgardiGuruh(YIGIM);
  assert.match(m, /1\. Bumaga/);
  assert.match(m, /3\. &lt;Idish&gt; &amp; suyuqlik/);
  const s = yigimRoyxatSorovi(YIGIM);
  assert.match(s, /<code>Bumaga\nHammom uchun azelit\n&lt;Idish&gt; &amp; suyuqlik<\/code>/);
});

test("foydalanuvchi yozgan matnlar escape qilinadi", () => {
  const v: NavbatVazifasi = { id: 4, kod: "musor", nom: "Musor", emoji: "♻️", rasm_soni: 3, takror_soni: 2, oraliq_kun: 2, tartib: 4, faol: true };
  assert.match(musorSignalNavbatchiga(v, "<b>Ali</b>"), /&lt;b&gt;Ali&lt;\/b&gt;/);
  assert.match(uzrAdminga("Vali", YIGIM, 20_000, "maosh <25>-da"), /maosh &lt;25&gt;-da/);
});

test("davomiylik va qisqartir", () => {
  const d = new Date("2026-09-01T00:00:00Z");
  assert.equal(davomiylik(d, new Date(d.getTime() + 3 * 3_600_000)), "3 soat");
  assert.equal(davomiylik(d, new Date(d.getTime() + 25 * 60_000)), "25 daqiqa");
  assert.equal(davomiylik(d, d), "1 daqiqa");
  assert.equal(davomiylik(d, new Date(d.getTime() + 29 * 3_600_000)), "1 kun 5 soat");
  assert.equal(davomiylik(d, new Date(d.getTime() + 8 * 86_400_000)), "8 kun");
  assert.equal(qisqartir("a  b\nc", 10), "a b c");
  assert.equal(qisqartir("0123456789ABC", 6), "01234…");
});

test("yig'im eslatmasi savdo ro'yxatini to'liq ko'rsatadi", () => {
  const m = yigimEslatmaXabari(
    YIGIM,
    { qoldiq: 20_000, tasdiqlangan: 0, kutilmoqdaSumma: 0, talab: 20_000 },
    { ism: "Sorabek", karta: "9860" },
  );
  assert.match(m, /1\. Bumaga\n   2\. Hammom uchun azelit\n   3\. &lt;Idish&gt; &amp; suyuqlik/);
});
