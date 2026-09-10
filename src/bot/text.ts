import type { Report, Room, SubTur, Tolov, Turn, TurnIshlar, User } from "../db/index.js";
import {
  config, ISH_TURLARI, BALLAR, ISHONCH_DARAJASI, RASM_MAX, SHIKOYAT_JOYLARI,
  type IshTuri, type Ishonch, type ShikoyatJoyi,
} from "../config.js";
import { orinlarniHisobla, type OdamBall } from "../core/rating.js";
import { bajarilganMarta, ishRasmlari, vazifaBajarildimi } from "../core/rotation.js";
import type { NavbatVazifasi } from "../core/vazifalar.js";
import { MAJBURIY_DOIM_OCHIQ, type NavbatSozlamalari } from "../core/rotation.js";
import type { Sozlamalar } from "../core/sozlamalar.js";
import type { XabarKimi } from "./state.js";
import type { ReportToliq } from "../core/reports.js";
import type {
  EslatmaNomzodi, MuddatNatija, MuddatSurati, SiklOdam, SiklXulosa,
  TolovDashboard, TolovDaraja, TolovHolatMalumoti, TolovTarix, TolovToliq,
} from "../core/tolov.js";
import type { TolovSikl } from "../db/index.js";
import { OYLAR, bugungiSana, kunFarqi, sanadanOyNomi } from "../core/vaqt.js";
import type { FoydalanuvchiToliq } from "../core/users.js";
import type { AdminLogToliq } from "../core/adminlog.js";
import type { AzolikHolati } from "./group.js";

const TZ = "Asia/Tashkent";

export const AJRATGICH = "━━━━━━━━━━━━━━━━━";

export function pul(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
}

/**
 * Telegram xabari 4096 belgidan oshmasligi kerak. Qatorlar chegarasidan
 * kesamiz — o'rtadan kessak HTML tegi ochiq qolib, xabar umuman
 * yuborilmasdi.
 */
export function chekla(matn: string, chegara = 3900): string {
  if (matn.length <= chegara) return matn;
  const kesilgan = matn.slice(0, chegara);
  const oxirgiQator = kesilgan.lastIndexOf("\n");
  return (oxirgiQator > 0 ? kesilgan.slice(0, oxirgiQator) : kesilgan) + "\n\n<i>…davomi bor</i>";
}

const KUNLAR: Record<string, string> = {
  Sunday: "yakshanba", Monday: "dushanba", Tuesday: "seshanba", Wednesday: "chorshanba",
  Thursday: "payshanba", Friday: "juma", Saturday: "shanba",
};

function qismlar(d: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    day: "numeric", month: "numeric", year: "numeric", weekday: "long", timeZone: TZ,
  }).formatToParts(d);
  const ol = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    kun: Number(ol("day")),
    oy: Number(ol("month")),
    yil: Number(ol("year")),
    haftaKuni: KUNLAR[ol("weekday")] ?? "",
  };
}

export function sana(d: Date | string): string {
  const { kun, oy, haftaKuni } = qismlar(new Date(d));
  const bosh = haftaKuni.charAt(0).toUpperCase() + haftaKuni.slice(1);
  return `${bosh}, ${kun}-${OYLAR[oy - 1]}`;
}

export function qisqaSana(d: Date | string): string {
  const { kun, oy, yil } = qismlar(new Date(d));
  return `${String(kun).padStart(2, "0")}.${String(oy).padStart(2, "0")}.${yil}`;
}

/**
 * `YYYY-MM-DD` kalendar sanasini "15-avgust" ko'rinishida yozadi.
 *
 * `sana()`dan farqi: u `Date` lahzasini Toshkent mintaqasiga o'giradi, bu
 * esa allaqachon toza kalendar sanasi bo'lgan matnni shundayligicha
 * o'qiydi — mintaqa hisobini ikki marta qo'llash bir kunlik siljish
 * berardi (`core/vaqt.ts`).
 */
export function sanaQatori(iso: string): string {
  const kun = Number(iso.split("-")[2]);
  return `${kun}-${sanadanOyNomi(iso)}`;
}

export function ismlar(azolar: User[]): string {
  return azolar.map((a) => a.ism).join(", ") || "—";
}

export function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}

/** Muddatgacha qolgan kun. Manfiy — kechikkan. */
export function qolganKun(muddat: Date | string): number {
  return Math.ceil((new Date(muddat).getTime() - Date.now()) / 86_400_000);
}

/** Muddat holati: emoji + matn. */
export function muddatHolati(muddat: Date | string): string {
  const q = qolganKun(muddat);
  if (q > 1) return `⏳ ${q} kun qoldi`;
  if (q === 1) return "⏰ Ertaga oxirgi kun!";
  if (q === 0) return "⚠️ <b>Bugun oxirgi kun!</b>";
  return `🔴 <b>${Math.abs(q)} kun kechikdi</b>`;
}

export function navbatXabari(room: Room, azolar: User[], muddat: Date): string {
  return [
    `🧹 <b>NAVBAT — ${room.raqam}-XONA</b>`,
    AJRATGICH,
    ``,
    `👥 ${esc(ismlar(azolar))}`,
    `📅 Muddat: <b>${sana(muddat)}</b>`,
    `${muddatHolati(muddat)}`,
    ``,
    AJRATGICH,
    `👤 Vazifalar ro'yxati botdagi "👤 Mening Navbatim"da —`,
    `   har biriga alohida rasm bilan belgilanadi.`,
    `✅ Boshqa xonalardan <b>${config.kerakliTasdiq} kishi</b> tasdiqlasa,`,
    `   navbat keyingi xonaga o'tadi.`,
  ].join("\n");
}

export function tasdiqXabari(
  room: Room,
  kim: string,
  tasdiqlovchilar: string[],
  kerak: number,
): string {
  const qator = tasdiqlovchilar.length
    ? tasdiqlovchilar.map((n) => `   ✅ ${esc(n)}`).join("\n")
    : "   <i>hali hech kim bosmagan</i>";

  const bolmalar = "🟩".repeat(tasdiqlovchilar.length) + "⬜️".repeat(Math.max(0, kerak - tasdiqlovchilar.length));

  return [
    `📸 <b>${room.raqam}-XONA ISHNI TOPSHIRDI</b>`,
    AJRATGICH,
    ``,
    `🙋 Yuklagan: <b>${esc(kim)}</b>`,
    ``,
    `${bolmalar}  ${tasdiqlovchilar.length}/${kerak}`,
    qator,
    ``,
    `👇 <i>Boshqa xonadagilar tugmani bossin</i>`,
  ].join("\n");
}

/**
 * Reyting jadvali. Sof funksiya — bazaga tegmaydi, shuning uchun testda
 * to'g'ridan-to'g'ri tekshiriladi.
 *
 * @param menId ko'rayotgan odam (o'zini ajratib ko'rsatish uchun), yo'q bo'lsa null
 */
export function reytingRoyxati(
  odamlar: OdamBall[],
  menId: number | null,
  oy: string,
): string[] {
  const saralangan = [...odamlar].sort(
    (a, b) => b.jami - a.jami || a.ism.localeCompare(b.ism),
  );
  const orinlar = orinlarniHisobla(saralangan);
  // Chiziq shkalasi uchun — shikoyat jarimasi jamini manfiy qilishi mumkin,
  // eng past 0 desak "aslida yetakchi" 0 yoki manfiy bo'lganda nolga bo'lish
  // xatosi (Infinity/NaN) chiqmaydi.
  const eng = Math.max(saralangan[0]?.jami ?? 0, 0);

  const s: string[] = [`🏆 <b>REYTING — ${oy.toUpperCase()}</b>`, AJRATGICH];

  if (saralangan.every((o) => o.jami === 0)) {
    s.push(``, `🤷 <i>Shu oyda hali ball yig'ilmagan.</i>`);
    return s;
  }

  // Jarima tufayli manfiy bo'lganlar ham ro'yxatda ko'rinishi kerak —
  // aks holda eng ko'p jarima olgan odam butunlay yashirinib qolardi.
  for (const o of saralangan.filter((x) => x.jami !== 0)) {
    const orin = orinlar.get(o.userId)!;
    const belgi = ["🥇", "🥈", "🥉"][orin - 1] ?? `<b>${orin}.</b>`;

    // Yetakchiga nisbatan uzunlik — kim qanchalik orqada qolgani ko'rinsin
    const uzun = o.jami <= 0 ? 0 : Math.max(1, Math.round((o.jami / Math.max(eng, 1)) * 10));
    const chiziq = "▰".repeat(uzun) + "▱".repeat(10 - uzun);

    s.push(
      ``,
      `${belgi} ${menId === o.userId ? `<b>${esc(o.ism)}</b> 👈` : esc(o.ism)} — <b>${o.jami}</b> ball`,
      `<code>${chiziq}</code>`,
    );

    const qism: string[] = [];
    if (o.navbatBall) qism.push(`🧹 ${o.navbatBall}`);
    if (o.ishBall) qism.push(`♻️ ${o.ishBall}`);
    if (o.xarajatBall) qism.push(`💰 ${o.xarajatBall}`);
    if (o.tasdiqBall) qism.push(`✅ ${o.tasdiqBall}`);
    if (o.shikoyatBall) qism.push(`🔴 -${o.shikoyatBall}`);
    if (qism.length) s.push(`<i>${qism.join("  ·  ")}</i>`);
  }

  // Ball yig'maganlar — ro'yxatni cho'zmasdan, bitta qatorda
  const nol = saralangan.filter((o) => o.jami === 0);
  if (nol.length > 0) {
    s.push(``, `▫️ <i>Hali ball yo'q: ${nol.map((o) => esc(o.ism)).join(", ")}</i>`);
  }

  if (menId !== null) {
    const meniki = saralangan.find((o) => o.userId === menId);
    const orin = orinlar.get(menId);
    if (meniki && orin) {
      s.push(
        ``,
        AJRATGICH,
        `📊 <b>Sizning o'rningiz: ${orin}</b> / ${saralangan.length}`,
        `🏅 Ballingiz: <b>${meniki.jami}</b>`,
      );
      // Oldindagiga yetish uchun qancha kerakligi — eng qiziq raqam
      const oldinda = saralangan.filter((o) => o.jami > meniki.jami).at(-1);
      if (oldinda) {
        s.push(`⬆️ ${esc(oldinda.ism)} dan <b>${oldinda.jami - meniki.jami}</b> ball orqadasiz`);
      } else if (saralangan.length > 1 && meniki.jami > 0) {
        s.push(`👑 <b>Siz yetakchisiz!</b>`);
      }
    }
  }

  return s;
}

/** Tasdiq progressi — navbat va qo'shimcha ishda bir xil ko'rinsin. */
function bolmalar(soni: number, kerak: number): string {
  return "🟩".repeat(Math.min(soni, kerak)) + "⬜️".repeat(Math.max(0, kerak - soni));
}

function vazifaQatori(v: NavbatVazifasi, ishlar: TurnIshlar, ochiq = true): string {
  const belgi = ishlar[v.kod];
  const bajarilgan = bajarilganMarta(belgi);
  const tugadi = bajarilgan >= v.takror_soni;
  const soni = ishRasmlari(belgi).length;

  // "2 marta" kabi vazifalarda nechinchi marta ekani ko'rinadi.
  const marta = v.takror_soni > 1 ? ` — ${bajarilgan}/${v.takror_soni} marta` : "";

  // Joriy marta holati: rasm yig'ilyapti, lekin hali "✅ Tugatdim" bosilmagan.
  let joriy = "";
  if (!tugadi && soni > 0) {
    joriy =
      soni >= v.rasm_soni
        ? `  ·  🟡 ${soni}/${v.rasm_soni} rasm — "Tugatdim" bosing`
        : `  ·  ${soni}/${v.rasm_soni} rasm`;
  }

  // Hali ochilmagan vazifa — tugmasi yo'q, 🔒 bilan belgilanadi.
  const belgisi = tugadi ? "✅" : !ochiq ? "🔒" : "☐";
  const qulf = !tugadi && !ochiq ? `  ·  <i>hali ochilmagan</i>` : "";
  return `${belgisi} ${esc(v.emoji)} ${esc(v.nom)}${marta}${joriy}${qulf}`;
}

/**
 * "Mening Navbatim" panelidagi joriy holat — bitta vaqtda faqat bittasi
 * to'g'ri: hali davom etmoqda, guruh tasdig'ini kutmoqda, yoki oxirgi
 * topshiriq rad etilgan (qaytadan yuborish mumkin).
 */
export type VazifaHolati =
  | { tur: "faol" }
  | { tur: "kutilmoqda"; tasdiqlovchilar: string[]; kerak: number }
  | { tur: "rad"; sabab: string | null };

/**
 * Navbatdagi xonaning shaxsiy vazifa paneli — FAQAT o'sha xona a'zolariga
 * ko'rinadi (handler serverda `room_id` ni tekshiradi). Har vazifa alohida
 * qatorda, holati bazadagi `turns.ishlar`dan to'g'ridan-to'g'ri o'qiladi —
 * bot qayta ishga tushsa ham yo'qolmaydi.
 */
export function vazifaPaneli(
  room: Room,
  turn: Turn,
  status: VazifaHolati,
  vazifalar: NavbatVazifasi[],
  ochiqKodlar?: Set<string>,
): string {
  const ishlar = turn.ishlar;
  const bajarilgan = vazifalar.filter((v) => vazifaBajarildimi(ishlar[v.kod], v)).length;
  const qoldi = vazifalar.length - bajarilgan;
  const ochiqmi = (v: NavbatVazifasi) => !ochiqKodlar || ochiqKodlar.has(v.kod);

  const s = [
    `👤 <b>MENING NAVBATIM</b>`,
    AJRATGICH,
    ``,
    `🏠 Xona: <b>${room.raqam}-xona</b>`,
    `📅 Muddat: <b>${sana(turn.muddat)}</b>`,
    `${muddatHolati(turn.muddat)}`,
    ``,
    `<b>Vazifalar:</b>`,
    ...vazifalar.map((v) => `   ${vazifaQatori(v, ishlar, ochiqmi(v))}`),
    ``,
    `🟢 Bajarilgan: <b>${bajarilgan}</b>   🔴 Qoldi: <b>${qoldi}</b>`,
  ];

  if (status.tur === "rad") {
    s.push(``, `❌ <b>Oldingi topshiriq rad etildi.</b>`);
    if (status.sabab) s.push(`✏️ Sabab: ${esc(status.sabab)}`);
    s.push(
      `<i>Kerak bo'lsa vazifa rasmini qaytadan tashlab,</i>`,
      `<i>yakuniy topshirishni qayta bosing.</i>`,
    );
  } else if (status.tur === "kutilmoqda") {
    s.push(
      ``,
      `⏳ <b>Topshirilgan — guruh tasdig'ini kutmoqda.</b>`,
      `${bolmalar(status.tasdiqlovchilar.length, status.kerak)}  ${status.tasdiqlovchilar.length}/${status.kerak}`,
    );
  } else if (qoldi > 0) {
    s.push(``, `⚠️ <b>${qoldi} ta vazifa qoldi.</b>`);
  } else {
    s.push(``, `✅ <b>Barcha vazifalar bajarildi!</b>`, `👇 Pastdagi tugma bilan yakuniy topshiring.`);
  }

  return s.join("\n");
}

/**
 * "Mening Navbatim" ochilganda, lekin majburiy tozalash muddat tugashiga
 * hali `config.majburiyOchilishKuni` kundan ko'p qolgan bo'lsa — vazifa
 * ro'yxati/tugmalar o'rniga shu ko'rsatiladi. Ixtiyoriy tozalash tugmalari
 * (bottom menyu) bundan mustaqil — ular shu holatda ham ishlayveradi.
 */
export function majburiyQulfMatni(room: Room, muddat: Date, majburiyKuni: number): string {
  return [
    `👤 <b>MENING NAVBATIM</b>`,
    AJRATGICH,
    ``,
    `🏠 Xona: <b>${room.raqam}-xona</b>`,
    `📅 Muddat: <b>${sana(muddat)}</b>`,
    `${muddatHolati(muddat)}`,
    ``,
    `🕐 <b>Majburiy xona tozalash hali ochilmagan.</b>`,
    ``,
    `Xonani majburiy tozalash imkoniyati navbatingiz tugashiga`,
    `<b>${majburiyKuni} kun</b> qolganda ochiladi.`,
    ``,
    `<i>Shu paytgacha pastdagi ixtiyoriy tozalash tugmalaridan</i>`,
    `<i>xohlagancha foydalanishingiz mumkin — ular bu majburiy</i>`,
    `<i>vazifadan alohida, istalgan payt ball beradi.</i>`,
  ].join("\n");
}

/** Navbatda bo'lmagan odam "Navbat" bo'limini ochsa — faqat umumiy ma'lumot, boshqaning tugmalari yo'q. */
export function boshqaXonaMatni(room: Room, azolar: User[], muddat: Date): string {
  return [
    `ℹ️ <b>Siz hozir navbatda emassiz.</b>`,
    AJRATGICH,
    ``,
    `👤 Joriy navbat: <b>${room.raqam}-xona</b>`,
    `👥 ${esc(ismlar(azolar))}`,
    `📅 Muddat: <b>${sana(muddat)}</b>`,
    `${muddatHolati(muddat)}`,
  ].join("\n");
}

/**
 * Admin uchun joriy navbat dashboard'i — vazifalar, dalil, eslatma holati.
 * Real vaqtda qayta hisoblanadi, alohida "admin ko'rinishi" jadvali yo'q.
 */
export function navbatAdminPaneli(
  room: Room,
  turn: Turn,
  azolar: User[],
  status: VazifaHolati,
  vazifalar: NavbatVazifasi[],
  sozlamalar: NavbatSozlamalari,
  eslatmaOraligiSoat: number = config.eslatmaOraligiSoat,
): string {
  const ishlar = turn.ishlar;
  const bajarilgan = vazifalar.filter((v) => vazifaBajarildimi(ishlar[v.kod], v)).length;

  const s = [
    `🛠 <b>JORIY NAVBAT — ADMIN</b>`,
    AJRATGICH,
    ``,
    `🏠 Xona: <b>${room.raqam}-xona</b>`,
    `👥 ${esc(ismlar(azolar))}`,
    `📅 Boshlandi: ${sana(turn.boshlandi)}`,
    `📅 Muddat: ${sana(turn.muddat)}`,
    `${muddatHolati(turn.muddat)}`,
    ``,
    `<b>Vazifalar (${bajarilgan}/${vazifalar.length}):</b>`,
    ...vazifalar.map((v) => `   ${vazifaQatori(v, ishlar)}`),
  ];

  if (status.tur === "kutilmoqda") {
    s.push(``, `📤 Holat: <b>Topshirilgan</b> — ${status.tasdiqlovchilar.length}/${status.kerak} tasdiq`);
  } else if (status.tur === "rad") {
    s.push(``, `📤 Holat: <b>Rad etilgan</b>${status.sabab ? ` — ${esc(status.sabab)}` : ""}`);
  } else {
    s.push(``, `📤 Holat: <b>Davom etmoqda</b>`);
  }

  s.push(
    ``,
    `⏳ Bu navbatga qolgan vaqt: <b>${qolganKun(turn.muddat)} kun</b>`,
    `🔁 Sikl uzunligi (kelgusi navbatlar): <b>${sozlamalar.siklKuni} kun</b>`,
  );

  s.push(``, `🔔 Oxirgi shaxsiy eslatma: ${turn.oxirgi_eslatma ? sana(turn.oxirgi_eslatma) : "hali yuborilmagan"}`);
  if (turn.oxirgi_eslatma) {
    const keyingi = new Date(new Date(turn.oxirgi_eslatma).getTime() + eslatmaOraligiSoat * 3_600_000);
    s.push(`⏭ Keyingi eslatma taxminan: ${sana(keyingi)}`);
  }

  return s.join("\n");
}

/**
 * Qo'shimcha ish yoki xarajat guruhda tasdiq kutayotgandagi xabar.
 * Rasm ostiga sarlavha (caption) bo'lib tushadi.
 */
export function topshiriqXabari(
  sub: { tur: SubTur; ish_turi: string | null; izoh: string | null; summa: string | null; ball: number },
  kim: string,
  tasdiqlovchilar: string[],
  kerak: number,
): string {
  const t = sub.ish_turi && sub.ish_turi in ISH_TURLARI
    ? ISH_TURLARI[sub.ish_turi as IshTuri]
    : null;

  const sarlavha =
    sub.tur === "xarajat"
      ? `🛒 <b>UYGA OLIB KELDI</b>`
      : `${t?.emoji ?? "🧹"} <b>QO'SHIMCHA ISH</b>`;

  const s = [sarlavha, AJRATGICH, ``, `🙋 <b>${esc(kim)}</b>`];

  if (sub.tur === "xarajat") {
    s.push(`📦 ${esc(sub.izoh ?? "—")}`);
    if (sub.summa) s.push(`💰 ${pul(Number(sub.summa))}`);
  } else {
    s.push(`🧹 ${esc(t?.matn ?? "ish qildi")}`);
    if (sub.izoh) s.push(`📝 ${esc(sub.izoh)}`);
  }

  s.push(
    ``,
    `🏅 <b>+${sub.ball} ball</b> — tasdiqdan keyin`,
    ``,
    `${bolmalar(tasdiqlovchilar.length, kerak)}  ${tasdiqlovchilar.length}/${kerak}`,
    tasdiqlovchilar.length
      ? tasdiqlovchilar.map((n) => `   ✅ ${esc(n)}`).join("\n")
      : "   <i>hali hech kim bosmagan</i>",
    ``,
    `👇 <i>O'zidan boshqa har kim tasdiqlashi mumkin</i>`,
  );
  return s.join("\n");
}

/** Qo'shimcha ish/xarajat tasdiqlangandan keyingi xabar. */
export function topshiriqYopildi(
  sub: { tur: SubTur; ish_turi: string | null; izoh: string | null; summa: string | null; ball: number },
  kim: string,
  tasdiqlovchilar: string[],
): string {
  const t = sub.ish_turi && sub.ish_turi in ISH_TURLARI
    ? ISH_TURLARI[sub.ish_turi as IshTuri]
    : null;

  const s = [
    `✅ <b>TASDIQLANDI</b>`,
    AJRATGICH,
    ``,
    `🙋 <b>${esc(kim)}</b> — ${esc(sub.tur === "xarajat" ? (sub.izoh ?? "olib keldi") : (t?.matn ?? "ish qildi"))}`,
  ];
  if (sub.tur === "xarajat" && sub.summa) s.push(`💰 ${pul(Number(sub.summa))}`);
  s.push(
    `✅ Tasdiqlagan: ${tasdiqlovchilar.map(esc).join(", ")}`,
    ``,
    `🏅 <b>+${sub.ball} ball</b>`,
  );
  return s.join("\n");
}

/** Rad etilgan topshiriq. */
export function topshiriqRad(kim: string, radQilgan: string, sabab: string | null): string {
  const s = [
    `✖️ <b>RAD ETILDI</b>`,
    AJRATGICH,
    ``,
    `🙋 <b>${esc(kim)}</b> ning ishi qabul qilinmadi.`,
    `👤 Rad etgan: ${esc(radQilgan)}`,
  ];
  if (sabab) s.push(``, `📝 Sabab: ${esc(sabab)}`);
  s.push(``, `<i>Ball berilmadi. Qaytadan topshirish mumkin.</i>`);
  return s.join("\n");
}

export function yopilganXabar(
  room: Room,
  kim: string,
  tasdiqlovchilar: string[],
  kechikkan: number,
  ballHar: number,
): string {
  const s = [
    `🎉 <b>${room.raqam}-XONA ISHI QABUL QILINDI</b>`,
    AJRATGICH,
    ``,
    `🙋 Yuklagan: <b>${esc(kim)}</b>`,
    `✅ Tasdiqlagan: ${tasdiqlovchilar.map(esc).join(", ")}`,
    ``,
  ];
  if (kechikkan > 0) {
    s.push(
      `🔴 <b>${kechikkan} kun kechikdi</b>`,
      `💸 Jarima: ${pul(kechikkan * config.jarimaKunlik)}`,
      `🏅 Har a'zoga: <b>+${ballHar} ball</b>`,
    );
  } else {
    s.push(`⏱ <b>Vaqtida bajarildi!</b>`, `🏅 Har a'zoga: <b>+${ballHar} ball</b>`);
  }
  return s.join("\n");
}

function ishonchDarajasi(kod: string): (typeof ISHONCH_DARAJASI)[Ishonch] {
  return kod in ISHONCH_DARAJASI
    ? ISHONCH_DARAJASI[kod as Ishonch]
    : ISHONCH_DARAJASI.nomalum;
}

function shikoyatJoyi(kod: string): (typeof SHIKOYAT_JOYLARI)[ShikoyatJoyi] {
  return kod in SHIKOYAT_JOYLARI
    ? SHIKOYAT_JOYLARI[kod as ShikoyatJoyi]
    : SHIKOYAT_JOYLARI.boshqa;
}

function shikoyatHolatNomi(h: Report["holat"]): string {
  return {
    kutilmoqda: "🕐 Kutilmoqda",
    tuzatilmoqda: "⚠️ Tuzatish kutilmoqda",
    tuzatildi: "✅ Hal qilindi",
    jarima: "➖ Tuzatilmadi (ball ayirildi)",
    rad: "❌ Rad etildi",
  }[h];
}

/**
 * Adminga DM qilinadigan to'liq shikoyat kartasi — bosqichlar davomida
 * qayta-qayta shu funksiya bilan tahrirlanadi (yaratilganda, tasdiqlanganda,
 * tekshirilganda). Reporter va sababchi ismi shu yerda ko'rinadi, chunki bu
 * xabar hech qachon guruhga yoki oddiy a'zoga yuborilmaydi — faqat admin
 * telegram_id siga.
 */
export function shikoyatAdminXabari(r: ReportToliq): string {
  const daraja = ishonchDarajasi(r.ishonch);
  const joy = shikoyatJoyi(r.joy);
  const s = [
    `🔒 <b>ANONIM SHIKOYAT</b>`,
    AJRATGICH,
    ``,
    `🕵️ Kim yozdi: <b>${esc(r.reporter_ism)}</b>`,
    `${daraja.emoji} ${daraja.nom}${r.reported_ism ? `: <b>${esc(r.reported_ism)}</b>` : ""}`,
    `${joy.emoji} Joyi: ${joy.nom}`,
    ``,
    `📝 ${esc(r.izoh)}`,
  ];
  if (r.photo_id) s.push(`${r.media_turi === "video" ? "🎥" : "📸"} Dalil biriktirilgan.`);
  s.push(`📅 ${sana(r.created_at)}`, ``, `📊 Holat: ${shikoyatHolatNomi(r.holat)}`);
  if (r.confirmed_at) s.push(`   ↳ Tasdiqlangan: ${sana(r.confirmed_at)}`);
  if (r.hal_qilindi) s.push(`   ↳ Yopilgan: ${sana(r.hal_qilindi)}`);
  if (r.admin_note) s.push(``, `✏️ Sizning izohingiz: ${esc(r.admin_note)}`);
  if (r.javobgar_javobi === "tan_oldi") s.push(``, `🙋 Sababchining javobi: <b>Tan oldi</b>`);
  else if (r.javobgar_javobi === "rad_etdi") s.push(``, `🙅 Sababchining javobi: <b>Rad etdi</b>`);
  if (r.javobgar_izohi) s.push(`💬 Sababchining izohi: ${esc(r.javobgar_izohi)}`);

  if (r.holat === "kutilmoqda") {
    s.push(
      ``,
      r.reported_id
        ? `Tasdiqlasangiz <b>${esc(r.reported_ism ?? "")}</b>ga tuzatish uchun imkoniyat beriladi.`
        : `<i>Sababchi noma'lum. Kerak bo'lsa "👤 Boshqa odam" bilan belgilang.</i>`,
    );
  } else if (r.holat === "tuzatilmoqda") {
    s.push(
      ``,
      r.reported_id
        ? `Tuzatilmasa <b>${esc(r.reported_ism ?? "")}</b>dan <b>-${r.ball} ball</b> ayiriladi.`
        : `<i>Sababchi noma'lum — tuzatilmasa ham ball ayirilmaydi.</i>`,
    );
  }
  if (!r.guruh_msg_id) {
    s.push(
      ``,
      `⚠️ <b>Guruhga yuborib bo'lmadi!</b> Guruh sozlanganini (/id)`,
      `tekshiring yoki pastdagi tugma bilan qayta urining.`,
    );
  }
  s.push(``, `<i>Bu xabar faqat sizga (admin) yuborilgan.</i>`);
  return s.join("\n");
}

/** Sababchiga (bo'lsa) — tuzatish uchun so'rov. Reporter kim ekani ko'rsatilmaydi. */
export function shikoyatTuzatishSorovi(r: ReportToliq): string {
  const joy = shikoyatJoyi(r.joy);
  return [
    `⚠️ <b>ILTIMOS, HAL QILING</b>`,
    AJRATGICH,
    ``,
    `${joy.emoji} ${joy.nom}`,
    `📝 ${esc(r.izoh)}`,
    ``,
    `Tez orada hal qilinmasa, ball ayirilishi mumkin.`,
  ].join("\n");
}

/** Ball ayirilgan odamga shaxsiy xabar — reporter kim ekani ko'rsatilmaydi. */
export function shikoyatJarimaXabari(r: ReportToliq, adminIsm: string): string {
  const joy = shikoyatJoyi(r.joy);
  const s = [
    `➖ <b>BALL AYIRILDI</b>`,
    AJRATGICH,
    ``,
    `${joy.emoji} ${joy.nom}`,
    `📝 ${esc(r.izoh)}`,
    `🔻 <b>-${r.ball} ball</b>`,
    ``,
    `👮 Ko'rib chiqqan: ${esc(adminIsm)}`,
  ];
  if (r.admin_note) s.push(`✏️ ${esc(r.admin_note)}`);
  return s.join("\n");
}

/**
 * Guruh xabarida "kim javobgar" qatori. Reporter HECH QACHON bu yerda (yoki
 * boshqa guruhga chiqadigan joyda) ko'rsatilmaydi — faqat sababchi: aniq
 * bo'lsa ismi bilan, gumon bo'lsa aniq "tasdiqlanmagan" belgisi bilan,
 * hech kim bilmasa "Noma'lum".
 */
function javobgarQatori(r: ReportToliq): string {
  if (!r.reported_id) return `👤 Sababchi: <b>Noma'lum</b>`;
  if (r.ishonch === "gumon") {
    return `👤 Gumon qilinuvchi: <b>${esc(r.reported_ism ?? "")}</b> <i>(tasdiqlanmagan)</i>`;
  }
  return `👤 Sababchi: <b>${esc(r.reported_ism ?? "")}</b>`;
}

/**
 * Guruhga chiqadigan yagona xabar — qayta yuborilmaydi, holat o'zgargan
 * sayin shu tahrirlanadi. Reporter HECH QACHON ko'rsatilmaydi — buni yozgan
 * kim ekani faqat adminga ma'lum. Sababchi esa buning aksi: aniq yoki gumon
 * qilingan bo'lsa ISM bilan ko'rsatiladi (maqsad — muammoni hal qilish),
 * gumon bo'lsa aniq "tasdiqlanmagan" deb belgilanadi, hali tan olish/rad
 * etish sababchining o'zi bosadigan tugmalar orqali keladi va faqat
 * "tan oldi" holati shu yerda ko'rsatiladi (rad etish va izoh — admin-only).
 */
export function shikoyatGuruhXabari(r: ReportToliq): string {
  const joy = shikoyatJoyi(r.joy);
  const s = [
    `🚨 <b>ANONIM SHIKOYAT</b>`,
    AJRATGICH,
    ``,
    `${joy.emoji} Joyi: ${joy.nom}`,
    ``,
    `📝 ${esc(r.izoh)}`,
  ];
  if (r.photo_id) s.push(``, `${r.media_turi === "video" ? "🎥 Video" : "📸 Rasm"} dalil biriktirilgan.`);
  s.push(``, javobgarQatori(r));
  if (r.javobgar_javobi === "tan_oldi") {
    s.push(``, `🙋 <b>${esc(r.reported_ism ?? "")}</b> mas'uliyatni tan oldi.`);
  }
  s.push(``);
  switch (r.holat) {
    case "kutilmoqda":
      s.push(`⚠️ Iltimos, hal qilib bering.`);
      break;
    case "tuzatilmoqda":
      s.push(`⚠️ Tasdiqlandi — tez orada hal qilinishi kerak.`);
      break;
    case "tuzatildi":
      s.push(`✅ Hal qilindi.`);
      break;
    case "jarima":
      s.push(`➖ Hal qilinmadi.`);
      break;
    case "rad":
      s.push(`ℹ️ Ko'rib chiqildi.`);
      break;
  }
  return s.join("\n");
}

/** Botning tanishtiruvi — "Qanday ishlaydi?" tugmasi shuni chiqaradi. */
export function tanishtirish(vazifalar: NavbatVazifasi[], siklKuni: number, s0: Sozlamalar): string {
  const yarim = Math.round(BALLAR.navbatXona / 2);
  const chorak = Math.round(BALLAR.navbatXona / 4);

  return [
    `ℹ️ <b>SUSAMBIL — QANDAY ISHLAYDI</b>`,
    AJRATGICH,
    ``,
    `Bu bot uyimizdagi tozalash navbatini yuritadi`,
    `va kim qancha ish qilganini hisoblab boradi.`,
    ``,
    `<b>🧹 TOZALASH NAVBATI</b>`,
    AJRATGICH,
    `Navbat har <b>${siklKuni} kunda</b> bir xonadan`,
    `ikkinchisiga o'tadi:`,
    `   1-xona ➡️ 2-xona ➡️ 3-xona ➡️ 4-xona ➡️ ...`,
    ``,
    `Navbatingiz kelganda shaxsiy "👤 Mening Navbatim" paneli`,
    `ochiladi — har vazifaning o'z tugmasi va rasmi bilan:`,
    ...vazifalar.map((v) => {
      const q = [];
      if (v.rasm_soni > 1) q.push(`kamida ${v.rasm_soni} rasm`);
      if (v.takror_soni > 1) q.push(`${v.takror_soni} marta`);
      return `   ${esc(v.emoji)} ${esc(v.nom)}` + (q.length ? ` — ${q.join(", ")}` : "");
    }),
    ``,
    `Har vazifaga rasm tashlaysiz — <b>xohlagancha ko'p</b>, faqat`,
    `kerakli sondan kam emas. Bot foizini ko'rsatib boradi.`,
    `Rasmni yakunlash uchun <b>"✅ Tugatdim"</b> bosasiz —`,
    `shu bosilmaguncha bitta rasm bilan tugab qolmaydi.`,
    ``,
    `Hamma vazifa bajarilgach "📸 Yakuniy topshirish" tugmasi chiqadi:`,
    `   ✅ Boshqa xonadan <b>${s0.kerakliTasdiq} kishi</b> tasdiqlasa,`,
    `   navbat keyingi xonaga o'tadi.`,
    ``,
    `⚠️ <b>${s0.kerakliTasdiq} kishi tasdiqlamaguncha navbat o'tmaydi.</b>`,
    `⏰ Oxirgi kun boshlanganda har ${s0.eslatmaOraligiSoat} soatda eslataman —`,
    `   navbatni tugatmaguningizcha to'xtamaydi.`,
    `🔴 Kechiksangiz har kun ball kamayadi.`,
    ``,
    `<b>💰 UYGA NARSA OLIB KELISH</b>`,
    AJRATGICH,
    `Falga, gubka, qop-qog'oz olib kelsangiz —`,
    `rasmga olib botga tashlang, nomini va qancha`,
    `pul ketganini yozing.`,
    `   <b>+${BALLAR.xarajat} ball</b>`,
    ``,
    `<i>Pul summasi ballga ta'sir qilmaydi — u alohida</i>`,
    `<i>hisoblanadi va "Xarajatlar" bo'limida ko'rinadi.</i>`,
    ``,
    `<b>🏅 BALL QANDAY HISOBLANADI</b>`,
    AJRATGICH,
    `O'lchov: taxminan <b>2 daqiqa ish = 1 ball</b>.`,
    ``,
    `Tozalash navbati uchun <b>${BALLAR.navbatXona} ball</b> XONAGA`,
    `beriladi va a'zolar soniga bo'linadi:`,
    ``,
    `   👤👤 2 kishilik xona → har biriga <b>${yarim}</b>`,
    `   👤👤👤👤 4 kishilik xona → har biriga <b>${chorak}</b>`,
    ``,
    `🤔 <i>Nega bo'linadi?</i> Chunki 2 kishilik xona`,
    `bir xil ishni kam odam bilan bajaradi — demak`,
    `har biriga ko'proq tegishi adolatli.`,
    ``,
    `   ⏱ Vaqtida tugatsa <b>+${BALLAR.vaqtidaBonus}</b>`,
    `   🔴 Kechiksa har kun <b>−${BALLAR.kechikishJarima}</b>`,
    `   ✅ Boshqaning ishini tasdiqlasa <b>+${BALLAR.tasdiq}</b>`,
    ``,
    `<b>🔒 ANONIM SHIKOYAT</b>`,
    AJRATGICH,
    `Uyda nimadir noto'g'ri ketdimi (tozalanmagan,`,
    `nimadir singan)? "Anonim shikoyat" tugmasidan`,
    `yozib qo'yasiz — sababchisi kim ekanini bilmasangiz`,
    `ham bo'ladi.`,
    ``,
    `<i>Kim yozganini FAQAT admin biladi — bu hech qachon</i>`,
    `<i>guruhga chiqmaydi. Sababchi esa buning aksi: aniq</i>`,
    `<i>yoki gumon qilingan bo'lsa ismi guruhda ko'rinadi</i>`,
    `<i>(gumon bo'lsa "tasdiqlanmagan" deb belgilanib) —</i>`,
    `<i>maqsad muammoni hal qilish.</i>`,
    ``,
    `Sababchi guruhdagi tugmalar orqali "Men qildim" /`,
    `"Men qilmadim" deb javob berishi mumkin — bu faqat`,
    `ma'lumot, admin baribir mustaqil qaror qiladi.`,
    ``,
    `Admin tasdiqlasa, sababchiga tuzatish uchun`,
    `imkoniyat beriladi. Tuzatilmasa undan`,
    `<b>-${BALLAR.shikoyatJarima} ball</b> ayiriladi.`,
    ``,
    `<b>💳 KVARTIRA TO'LOVI</b>`,
    AJRATGICH,
    `Kvartira puli har oyning <b>${s0.tolovMuddatKuni}-kuni</b> to'lanadi,`,
    `demak o'z ulushingizni shu kungacha tashlab bo'lishingiz`,
    `kerak. Har oy alohida hisoblanadi — o'tgan oy to'lovi`,
    `yangi oyga o'tmaydi.`,
    ``,
    `"💳 Kvartira to'lovi" tugmasidan qancha to'laganingizni`,
    `yozib, dalil (chek rasmi yoki PDF) tashlaysiz.`,
    ``,
    `To'lov avval "kutilmoqda" holatida turadi — admin`,
    `haqiqatda qancha kelganini tekshirib tasdiqlagach`,
    `hisobingizga qo'shiladi. Bir necha marta qisman`,
    `to'lasangiz ham bo'ladi, hammasi qo'shib boriladi.`,
    ``,
    `Muddatga <b>${s0.tolovEslatmaKuni} kun</b> qolganda bot kuniga bir marta`,
    `eslatib turadi. To'lig'i tushgach eslatma o'z-o'zidan`,
    `to'xtaydi.`,
    ``,
    `<i>Muddatgacha yuborgan to'lovingiz keyinroq tasdiqlansa</i>`,
    `<i>ham vaqtida hisoblanadi — tekshiruv kechikkani uchun</i>`,
    `<i>siz javobgar emassiz.</i>`,
    ``,
    `<i>Kim qancha to'lagani guruhga ko'rinadi (faqat</i>`,
    `<i>tasdiqlangandan keyin) — lekin karta va chek</i>`,
    `<i>rasmi hech qachon chiqmaydi.</i>`,
    ``,
    AJRATGICH,
    `💬 Botga hech qanday buyruq yozish shart emas —`,
    `istalgan narsa yozsangiz panel chiqadi.`,
  ].join("\n");
}

/** To'lov darajasining emoji va nomi — hamma joyda shu bir xil belgi ishlatiladi. */
export function tolovDarajaBelgisi(daraja: TolovDaraja): { emoji: string; nom: string } {
  return {
    tolanmagan: { emoji: "🔴", nom: "TO'LANMAGAN" },
    qisman: { emoji: "🟡", nom: "QISMAN TO'LANGAN" },
    tola: { emoji: "🟢", nom: "TO'LIQ TO'LANGAN" },
  }[daraja];
}

/** Sikl oyining nomi — "Avgust". */
export function siklOyi(sikl: TolovSikl): string {
  const nom = sanadanOyNomi(sikl.davr);
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/**
 * "📅 Muddat: 15-avgust (3 kun qoldi)" qatori. Muddat KUN OXIRIGACHA
 * hisoblangani uchun 0 — "bugun oxirgi kun", manfiy — o'tib ketgan.
 */
export function muddatQatori(sikl: TolovSikl): string {
  const qolgan = kunFarqi(bugungiSana(), sikl.muddat);
  const izoh =
    qolgan > 0
      ? `${qolgan} kun qoldi`
      : qolgan === 0
        ? "bugun oxirgi kun"
        : `${-qolgan} kun o'tib ketdi`;
  return `📅 Muddat: <b>${sanaQatori(sikl.muddat)}</b> — ${izoh}`;
}

/** "⏳ 1 ta to'lovingiz tekshirilmoqda (300 000 so'm)" — hisobga qo'shilmagani ta'kidlanadi. */
function kutilmoqdaQatorlari(soni: number, summa: number): string[] {
  if (soni <= 0) return [];
  return [
    ``,
    `⏳ <b>${soni} ta to'lovingiz tekshirilmoqda</b>`,
    `   ${pul(summa)} — hali hisobga qo'shilmagan.`,
  ];
}

/**
 * "💳 Kvartira to'lovi" ko'rinishi — talab, qabul qiluvchi va foydalanuvchining
 * SHU OYDAGI holati. Faqat TASDIQLANGAN summalar hisobga kiradi — buni
 * `foydalanuvchiTolovHolati` (core/tolov.ts) hisoblab beradi, bu yerda faqat
 * ko'rinish.
 */
export function tolovKorinishi(qabul: { ism: string; karta: string }, h: TolovHolatMalumoti): string {
  const daraja = tolovDarajaBelgisi(h.daraja);
  const s = [
    `🏠 <b>KVARTIRA TO'LOVI</b>`,
    AJRATGICH,
    `<i>${siklOyi(h.sikl)} oyi</i>`,
    ``,
    muddatQatori(h.sikl),
    ``,
    `💰 Talab: <b>${pul(h.talab)}</b>`,
    ``,
    `💳 Qabul qiluvchi: <b>${esc(qabul.ism)}</b>`,
    `💳 Karta: <code>${esc(qabul.karta)}</code>`,
    ``,
    AJRATGICH,
    `💵 To'landi: <b>${pul(h.tasdiqlangan)}</b>`,
    `📉 Qoldi: <b>${pul(h.qoldiq)}</b>`,
    ``,
    `Holat: ${daraja.emoji} <b>${daraja.nom}</b>`,
  ];

  // Kechikish PULNING emas, VAQTNING holati — shuning uchun darajadan
  // alohida qator bo'lib chiqadi (`core/tolov.ts` `kechikkanmi`).
  if (h.kechikkan) {
    s.push(``, `⛔️ <b>MUDDAT O'TIB KETGAN</b>`);
    if (h.jarima > 0) s.push(`💸 Jarima: <b>${pul(h.jarima)}</b>`);
  }

  // "DO NOT say Paid or Completed" — qisman holatda buni aniq ta'kidlaymiz.
  if (h.daraja === "qisman") {
    s.push(``, `⚠️ Siz ${pul(h.tasdiqlangan)} to'ladingiz.`, `${pul(h.qoldiq)} qoldi.`);
  } else if (h.daraja === "tola") {
    s.push(``, `✅ ${siklOyi(h.sikl)} oyi to'lovingiz to'liq amalga oshirilgan.`);
  }

  s.push(...kutilmoqdaQatorlari(h.kutilmoqdaSoni, h.kutilmoqdaSumma));

  if (h.daraja !== "tola") {
    s.push(
      ``,
      `<i>Bir yo'la to'lash shart emas — qulay bo'lganicha</i>`,
      `<i>bo'lib-bo'lib tashlasangiz ham bo'ladi, hammasi</i>`,
      `<i>qo'shib boriladi.</i>`,
    );
  }

  return s.join("\n");
}

export type Shoshilinchlik = {
  /** Sarlavhadagi belgi — har kuni kuchayadi */
  emoji: string;
  sarlavha: string;
  /** "Muddatgacha atigi 3 KUN QOLDI!" kabi asosiy ogohlantirish qatori */
  ogohlantirish: string;
  /** Xabar oxiridagi chaqiriq */
  chaqiriq: string;
};

/**
 * Muddatgacha qolgan kunga qarab ogohlantirishning kuchi.
 *
 * Talab ikki tomonlama edi: "do not spam" va ayni paytda "impossible to
 * easily miss". Ikkalasi bir-biriga zid emas — CHASTOTA past (kuniga bir
 * marta), OHANG esa har kuni kuchayadi. Shuning uchun bu yerda faqat
 * so'z tanlanadi, yuborish qarori `core/tolov.ts`da qoladi.
 *
 * Sof funksiya: `qolganKun` tashqaridan beriladi, ichkarida `Date.now()`
 * chaqirilmaydi — shu sababli har bir bosqichni aniq sinash mumkin.
 */
export function eslatmaShoshilinchligi(qolganKun: number): Shoshilinchlik {
  if (qolganKun < 0) {
    const kech = -qolganKun;
    return {
      emoji: "⛔️",
      sarlavha: "MUDDAT O'TIB KETDI",
      ogohlantirish: `⛔️ <b>MUDDAT ${kech} KUN OLDIN TUGAGAN!</b>`,
      chaqiriq: "Qarzingiz hamon yopilmagan. Iltimos, bugunoq tashlang.",
    };
  }
  if (qolganKun === 0) {
    return {
      emoji: "🚨",
      sarlavha: "OXIRGI KUN — KVARTIRA TO'LOVI",
      ogohlantirish: "🚨 <b>MUDDAT BUGUN TUGAYDI!</b>",
      chaqiriq: "Qolgan summani BUGUN tashlashingiz shart.",
    };
  }
  if (qolganKun === 1) {
    return {
      emoji: "🔴",
      sarlavha: "SHOSHILINCH — KVARTIRA TO'LOVI",
      ogohlantirish: "🔴 <b>ERTAGA OXIRGI KUN — ATIGI 1 KUN QOLDI!</b>",
      chaqiriq: "Kechiktirmang — qolgan summani bugun-ertaga tashlang.",
    };
  }
  return {
    emoji: qolganKun <= 2 ? "🚨" : "⚠️",
    sarlavha: "KVARTIRA TO'LOVI OGOHLANTIRISHI",
    ogohlantirish: `${qolganKun <= 2 ? "🚨" : "⚠️"} <b>Muddatgacha atigi ${qolganKun} KUN QOLDI!</b>`,
    chaqiriq: "Qolgan summani imkon qadar tezroq tashlang.",
  };
}

/**
 * Muddatga yaqinlashganda qarzi borlarga yuboriladigan shaxsiy
 * ogohlantirish. To'liq to'laganlarga umuman yuborilmaydi
 * (`jobs/reminders.ts`).
 *
 * Ko'rsatiladigan qoldiq har doim TASDIQLANGAN summadan hisoblanadi.
 * Tekshiruvda turgan to'lov alohida qator bo'lib chiqadi va hisobga
 * qo'shilmagani ochiq aytiladi — aks holda odam "to'ladim-ku" deb
 * o'ylab, qolgan pulni tashlamay qo'yardi.
 */
export function tolovEslatmaXabari(
  sikl: TolovSikl,
  n: EslatmaNomzodi,
  qolganKun: number,
  qoshimcha: { jarima?: number; qolganSoat?: number } = {},
): string {
  const sh = eslatmaShoshilinchligi(qolganKun);
  const s = [
    `${sh.emoji} <b>${sh.sarlavha}</b>`,
    AJRATGICH,
    ``,
    sh.ogohlantirish,
  ];

  // Muddat kunida kun emas, SOAT muhim — "bugun" degani odamni ertalab ham,
  // kechqurun ham bir xil xotirjam qoldiradi.
  if (qolganKun === 0 && qoshimcha.qolganSoat !== undefined && qoshimcha.qolganSoat > 0) {
    s.push(`⏰ Kun oxirigacha <b>${qoshimcha.qolganSoat} soat</b> qoldi.`);
  }

  s.push(
    ``,
    `📅 Muddat: <b>${sanaQatori(sikl.muddat)}</b>`,
    `💰 Talab: <b>${pul(sikl.talab)}</b>`,
    `✅ To'langan: <b>${pul(n.tasdiqlangan)}</b>`,
    `❗️ Qoldi: <b>${pul(n.qoldiq)}</b>`,
  );

  // Jarima faqat muddat o'tgandan keyin va faqat uy kelishib foizni
  // o'rnatgan bo'lsa chiqadi — bot o'zicha summa o'ylab chiqarmaydi.
  if (qolganKun < 0 && (qoshimcha.jarima ?? 0) > 0) {
    s.push(`💸 Jarima: <b>${pul(qoshimcha.jarima!)}</b>`);
  }

  if (n.kutilmoqdaSumma > 0) {
    s.push(
      ``,
      `⏳ <b>Tekshiruvda: ${pul(n.kutilmoqdaSumma)}</b>`,
      `<i>Hali tasdiqlanmagan, shuning uchun yuqoridagi</i>`,
      `<i>hisobga qo'shilmagan. Tasdiqlangach qoldiq kamayadi.</i>`,
    );
  }

  s.push(
    ``,
    qolganKun > 0
      ? `<b>${sanaQatori(sikl.muddat)}gacha to'lovni yakunlashingiz shart.</b>`
      : qolganKun === 0
        ? `<b>Bugun — ${sanaQatori(sikl.muddat)} — oxirgi kun.</b>`
        : `<b>To'lov muddati allaqachon o'tgan.</b>`,
    ``,
    sh.chaqiriq,
  );
  return s.join("\n");
}

/**
 * Guruhga umumiy eslatma. Hech qanday chek, karta yoki shaxsiy dalil
 * chiqmaydi — faqat umumiy yig'im holati va muddat.
 */
export function tolovGuruhEslatmasi(d: TolovDashboard, qolganKun: number): string {
  const qarzdor = d.odamlar.filter((o) => o.qoldiq > 0).length;
  const sh = eslatmaShoshilinchligi(qolganKun);
  return [
    `${sh.emoji} <b>KVARTIRA TO'LOVI — ${siklOyi(d.sikl).toUpperCase()}</b>`,
    AJRATGICH,
    ``,
    sh.ogohlantirish,
    ``,
    `📅 Muddat: <b>${sanaQatori(d.sikl.muddat)}</b>`,
    `💵 Yig'ildi: <b>${pul(d.jamiTasdiqlangan)}</b> / ${pul(d.jamiTalab)}`,
    `📉 Yetmayapti: <b>${pul(d.jamiQoldiq)}</b>`,
    `👥 Hali to'lamaganlar: <b>${qarzdor}</b> kishi`,
    ``,
    `Har kim <b>${pul(d.talab)}</b> tashlashi kerak.`,
    `Bir yo'la emas, bo'lib-bo'lib tashlasa ham bo'ladi —`,
    `muhimi, muddatgacha to'lig'i yig'ilsin.`,
    ``,
    `<i>O'z holatingizni "💳 Kvartira to'lovi" bo'limidan ko'rasiz.</i>`,
  ].join("\n");
}

/** Muddat kelganda har kimga o'z yakuniy natijasi. */
export function tolovMuddatXabari(sikl: TolovSikl, n: MuddatNatija): string {
  const daraja = tolovDarajaBelgisi(n.daraja);
  const s = [
    `📅 <b>${siklOyi(sikl).toUpperCase()} OYI — MUDDAT TUGADI</b>`,
    AJRATGICH,
    ``,
    `📅 Muddat edi: <b>${sanaQatori(sikl.muddat)}</b>`,
    ``,
    `💰 Talab: <b>${pul(n.talab)}</b>`,
    `✅ To'langan: <b>${pul(n.tasdiqlangan)}</b>`,
    `📉 Yetmagan: <b>${pul(n.qoldiq)}</b>`,
    ``,
    `Holat: ${daraja.emoji} <b>${daraja.nom}</b>`,
  ];

  if (n.tekshiruvKutilmoqda) {
    // Talab: "Do not punish the user for Sorabek's verification delay."
    s.push(
      ``,
      `⏳ <b>Muddatgacha yuborgan ${pul(n.kutilmoqda)} to'lovingiz</b>`,
      `<b>hali tekshirilmagan</b> — shuning uchun bu holat`,
      `yakuniy emas va sizga hech qanday jarima yozilmadi.`,
      `Tasdiqlangach natija o'z-o'zidan yangilanadi.`,
    );
  } else if (n.qoldiq > 0) {
    s.push(``, `Qolgan ${pul(n.qoldiq)}ni imkon qadar tezroq tashlang.`);
    if (n.jarima > 0) s.push(`💸 Jarima: <b>${pul(n.jarima)}</b>`);
  } else {
    s.push(``, `✅ Rahmat — o'z ulushingizni muddatida to'liq tashladingiz.`);
  }

  return s.join("\n");
}

/**
 * Muddat kelganda guruhga umumiy yakun. Ismlar ko'rsatiladi (uyda kim
 * qolganini hamma biladi), lekin chek/karta hech qachon chiqmaydi.
 */
export function tolovMuddatGuruhXabari(sikl: TolovSikl, natijalar: MuddatSurati[]): string {
  const yigildi = natijalar.reduce((n, o) => n + o.tasdiqlangan, 0);
  const talab = natijalar.reduce((n, o) => n + o.talab, 0);

  const qarzdorlar = natijalar.filter((n) => n.qoldiq > 0);
  const s = [
    `📅 <b>${siklOyi(sikl).toUpperCase()} OYI — TO'LOV MUDDATI TUGADI</b>`,
    AJRATGICH,
    ``,
    `📅 Muddat: <b>${sanaQatori(sikl.muddat)}</b>`,
    `💵 Yig'ildi: <b>${pul(yigildi)}</b> / ${pul(talab)}`,
    `📉 Yetmadi: <b>${pul(Math.max(0, talab - yigildi))}</b>`,
    ``,
  ];

  if (qarzdorlar.length === 0) {
    s.push(`🟢 <b>Hamma o'z ulushini muddatida to'liq tashladi.</b>`);
    return s.join("\n");
  }

  s.push(`⚠️ <b>To'liq to'lamaganlar (${qarzdorlar.length})</b>`);
  for (const n of qarzdorlar) {
    const belgi = n.tekshiruvKutilmoqda ? "⏳" : tolovDarajaBelgisi(n.daraja).emoji;
    s.push(`   ${belgi} ${esc(n.ism)} — qoldi <b>${pul(n.qoldiq)}</b>`);
    if (n.tekshiruvKutilmoqda) s.push(`      <i>tekshiruv kutilmoqda, jarima yozilmadi</i>`);
  }

  return s.join("\n");
}

/**
 * Xuddi shu chek ikkinchi marta yuborilganda. Xato emas — odam ko'pincha
 * "yetib bordimi?" deb qayta yuboradi, shuning uchun ohang xotirjam va
 * mavjud yozuvning holati ko'rsatiladi.
 */
export function tolovTakrorXabari(avvalgi: Tolov): string {
  const s = [
    `⏳ <b>Bu chek allaqachon yuborilgan</b>`,
    AJRATGICH,
    ``,
    `💵 Kiritilgan summa: <b>${pul(Number(avvalgi.kiritgan_summa))}</b>`,
    `📅 Yuborilgan: ${qisqaSana(avvalgi.created_at)}`,
    ``,
  ];

  if (avvalgi.holat === "tasdiqlandi") {
    s.push(
      `✅ U allaqachon tasdiqlangan — <b>${pul(Number(avvalgi.tasdiqlangan_summa))}</b>`,
      `hisobingizga qo'shilgan.`,
      ``,
      `<i>Yangi to'lov qilgan bo'lsangiz, YANGI chek rasmini yuboring.</i>`,
    );
  } else {
    s.push(
      `Hozircha tekshiruvda turibdi — ikkinchi marta`,
      `yuborish shart emas, hisobga baribir bir marta qo'shiladi.`,
    );
  }
  return s.join("\n");
}

/** Yangi to'lov yuborilgandan keyin foydalanuvchiga darhol chiqadigan tasdiq. */
export function tolovYuborildiXabari(kiritganSumma: number): string {
  return [
    `✅ <b>Qabul qildim.</b>`,
    AJRATGICH,
    ``,
    `💵 Siz kiritgan summa: <b>${pul(kiritganSumma)}</b>`,
    ``,
    `Admin tekshirib tasdiqlagach hisobingizga qo'shiladi.`,
    `Holatini "💳 Kvartira to'lovi" bo'limidan kuzatasiz.`,
  ].join("\n");
}

/**
 * Adminga yuboriladigan tekshiruv xabari. `joriyTasdiqlangan` — shu odamning
 * BU to'lovdan oldingi jami tasdiqlangan summasi (faqat 'kutilmoqda'
 * holatida ko'rsatiladi, "agar to'liq tasdiqlansa qancha bo'ladi" degan
 * proyeksiya uchun).
 */
export function tolovAdminXabari(t: TolovToliq, joriyTasdiqlangan: number): string {
  const kiritgan = Number(t.kiritgan_summa);
  const s = [
    `💰 <b>YANGI KVARTIRA TO'LOVI</b>`,
    AJRATGICH,
    ``,
    `👤 Kim: <b>${esc(t.ism)}</b>`,
    `💵 O'zi yozgan summa: <b>${pul(kiritgan)}</b>`,
    `📎 ${t.dalil_turi === "hujjat" ? "PDF hujjat" : "Rasm"} dalil biriktirilgan`,
  ];

  if (t.holat === "kutilmoqda") {
    const keyingi = joriyTasdiqlangan + kiritgan;
    s.push(
      ``,
      `📊 Joriy tasdiqlangan jami: <b>${pul(joriyTasdiqlangan)}</b>`,
      `📊 Agar to'liq tasdiqlansa: <b>${pul(keyingi)}</b>`,
      ``,
      `Holat: ⏳ <b>Tasdiq kutilmoqda</b>`,
    );
  } else if (t.holat === "tasdiqlandi") {
    s.push(
      ``,
      `✅ Tasdiqlangan summa: <b>${pul(Number(t.tasdiqlangan_summa))}</b>`,
      t.hal_qilindi ? `📅 ${sana(t.hal_qilindi)}` : ``,
    );
  } else {
    s.push(``, `❌ Rad etildi.`);
    if (t.rad_sababi) s.push(`✏️ Sabab: ${esc(t.rad_sababi)}`);
  }

  s.push(``, `<i>Bu xabar faqat sizga (admin) yuborilgan.</i>`);
  return s.join("\n");
}

/**
 * Guruhga chiqadigan e'lon — FAQAT admin tasdiqlagandan keyin yuboriladi.
 * Karta, chek rasmi va boshqa bank ma'lumotlari hech qachon bu yerda
 * ko'rsatilmaydi — faqat kim, qancha va joriy holat.
 */
export function tolovGuruhXabari(ism: string, h: TolovHolatMalumoti): string {
  const daraja = tolovDarajaBelgisi(h.daraja);
  const s = [
    `💰 <b>KVARTIRA TO'LOVI</b>`,
    AJRATGICH,
    `<i>${siklOyi(h.sikl)} oyi</i>`,
    ``,
    `👤 ${esc(ism)}`,
    `💵 To'landi: <b>${pul(h.tasdiqlangan)}</b> / ${pul(h.talab)}`,
  ];
  if (h.daraja !== "tola") s.push(`📉 Qoldi: <b>${pul(h.qoldiq)}</b>`);
  s.push(``, `Holat: ${daraja.emoji} <b>${daraja.nom}</b>`);
  return s.join("\n");
}

/** Admin tasdiqlagach foydalanuvchiga yuboriladigan shaxsiy DM. */
export function tolovTasdiqXabari(
  qabulIsm: string,
  tasdiqlanganSumma: number,
  h: TolovHolatMalumoti,
): string {
  const daraja = tolovDarajaBelgisi(h.daraja);
  const s = [
    `🔔 <b>To'lov tasdiqlandi</b>`,
    AJRATGICH,
    ``,
    `${esc(qabulIsm)} to'lovingizni tasdiqladi.`,
    ``,
    `✅ Tasdiqlangan summa: <b>${pul(tasdiqlanganSumma)}</b>`,
    ``,
    `<i>${siklOyi(h.sikl)} oyi bo'yicha:</i>`,
    `💵 Jami to'langan: <b>${pul(h.tasdiqlangan)}</b> / ${pul(h.talab)}`,
  ];
  if (h.daraja !== "tola") s.push(`📉 Qoldi: <b>${pul(h.qoldiq)}</b>`, muddatQatori(h.sikl));
  s.push(``, `Holat: ${daraja.emoji} <b>${daraja.nom}</b>`);
  if (h.daraja === "tola") {
    s.push(``, `✅ ${siklOyi(h.sikl)} oyi to'lovingiz to'liq amalga oshirilgan.`);
  }
  return s.join("\n");
}

/** Admin rad etgach foydalanuvchiga yuboriladigan shaxsiy DM. */
export function tolovRadXabari(sabab: string): string {
  return [
    `❌ <b>To'lov rad etildi</b>`,
    AJRATGICH,
    ``,
    `Yuborgan to'lov dalilingizni tasdiqlab bo'lmadi.`,
    ``,
    `✏️ Sabab: ${esc(sabab)}`,
    ``,
    `Iltimos, to'g'ri to'lov dalilini qayta yuboring.`,
  ].join("\n");
}

/**
 * "📊 Mening to'lovlarim" — har bir yozuv mustaqil ko'rsatiladi, ustma-ust
 * yozilmagan, va OY BO'YICHA guruhlanadi: o'tgan oylar tarixi joyida
 * turadi, yangi oyning to'lovi ularning ustiga yozilmaydi.
 *
 * Har yozuvda ikki sana ham ko'rsatiladi — "yuborilgan" va "hal qilingan".
 * Ular ataylab alohida: to'lov yuborilgan kun bo'yicha hisobga olinadi,
 * admin tekshirishni kechiktirsa odam bundan zarar ko'rmaydi.
 */
export function tolovTarixi(payments: TolovTarix[]): string {
  if (payments.length === 0) {
    return [
      `📊 <b>MENING TO'LOVLARIM</b>`,
      AJRATGICH,
      ``,
      `🤷 <i>Hali to'lov yubormagansiz.</i>`,
    ].join("\n");
  }

  const s = [`📊 <b>MENING TO'LOVLARIM</b>`, AJRATGICH];
  let oxirgiDavr: string | null | undefined;

  payments.forEach((p, i) => {
    if (p.sikl_davr !== oxirgiDavr) {
      oxirgiDavr = p.sikl_davr;
      const nom = p.sikl_davr ? sanadanOyNomi(p.sikl_davr) : null;
      s.push(``, `📅 <b>${nom ? nom.toUpperCase() + " OYI" : "OYI BELGILANMAGAN"}</b>`);
    }

    s.push(``, `<b>${i + 1}.</b> ${pul(Number(p.kiritgan_summa))}`);
    if (p.holat === "tasdiqlandi") {
      s.push(`   ✅ Tasdiqlandi — <b>${pul(Number(p.tasdiqlangan_summa))}</b>`);
      if (p.hal_qildi_ism) s.push(`   👮 Tekshirdi: ${esc(p.hal_qildi_ism)}`);
    } else if (p.holat === "rad") {
      s.push(`   ❌ Rad etildi${p.rad_sababi ? `: ${esc(p.rad_sababi)}` : ""}`);
    } else {
      s.push(`   ⏳ Tekshirilmoqda`);
    }
    s.push(`   📅 Yuborilgan: ${qisqaSana(p.created_at)}`);
    if (p.hal_qilindi) s.push(`   📅 Hal qilingan: ${qisqaSana(p.hal_qilindi)}`);
  });

  return s.join("\n");
}

/** Sikl holatining odam o'qiydigan nomi. */
export function siklHolatBelgisi(sikl: TolovSikl): string {
  return {
    ochiq: "🟢 OCHIQ — to'lov qabul qilinmoqda",
    muddat_yetdi: "🟠 MUDDAT YETDI — yakuniy holat olindi",
    yakunlandi: "⚫️ YAKUNLANDI",
  }[sikl.holat];
}

/** Bitta odamning dashboarddagi qatori — muddat surati bo'lsa u ham ko'rinadi. */
function siklOdamQatori(o: SiklOdam, talab: number): string[] {
  const belgi = o.kechikkan ? { emoji: "⛔️" } : tolovDarajaBelgisi(o.daraja);
  const s = [`   ${belgi.emoji} ${esc(o.ism)} — ${pul(o.tasdiqlangan)} / ${pul(talab)}`];
  if (o.qoldiq > 0) s.push(`      📉 qoldi <b>${pul(o.qoldiq)}</b>`);
  if (o.jarima > 0) s.push(`      💸 jarima <b>${pul(o.jarima)}</b>`);
  if (o.kutilmoqdaSoni > 0) {
    s.push(`      ⏳ ${o.kutilmoqdaSoni} ta tekshiruvda (${pul(o.kutilmoqdaSumma)})`);
  }
  if (o.muddat?.tekshiruvKutilmoqda) {
    s.push(`      ⚖️ muddatda tekshiruvda edi — jarima yozilmadi`);
  } else if (o.muddat && o.muddat.qoldiq > 0) {
    s.push(
      `      ⚖️ muddatda yetmagan: <b>${pul(o.muddat.qoldiq)}</b>` +
        (o.muddat.jarima > 0 ? ` · jarima ${pul(o.muddat.jarima)}` : ``),
    );
  }
  return s;
}

/**
 * Admin/Sorabek uchun oylik ko'rinish — shu oyda kim qancha to'lagan,
 * kimdan qancha qolgan, muddatda nima bo'lgan.
 */
export function tolovDashboardMatni(d: TolovDashboard): string {
  const s = [
    `📊 <b>KVARTIRA TO'LOVLARI</b>`,
    AJRATGICH,
    `<i>${siklOyi(d.sikl)} oyi · ${siklHolatBelgisi(d.sikl)}</i>`,
    ``,
    muddatQatori(d.sikl),
    ``,
    `💰 Har kishidan talab: <b>${pul(d.talab)}</b>`,
    `📊 Jami talab: <b>${pul(d.jamiTalab)}</b>`,
    `💵 Jami tasdiqlangan: <b>${pul(d.jamiTasdiqlangan)}</b>`,
    `📉 Jami qoldiq: <b>${pul(d.jamiQoldiq)}</b>`,
    ``,
    `⏳ Tasdiq kutilmoqda: <b>${d.kutilmoqdaSoni}</b>`,
    `❌ Rad etilgan: <b>${d.radSoni}</b>`,
  ];

  if (d.kechikkanlar.length > 0) {
    s.push(``, `⛔️ Kechikkanlar: <b>${d.kechikkanlar.length}</b> kishi`);
    if (d.jamiJarima > 0) s.push(`💸 Jami jarima: <b>${pul(d.jamiJarima)}</b>`);
  }

  s.push(
    ``,
    AJRATGICH,
    `🟢 To'liq to'laganlar: <b>${d.tola.length}</b>`,
    `🟡 Qisman to'laganlar: <b>${d.qisman.length}</b>`,
    `🔴 To'lamaganlar: <b>${d.tolanmagan.length}</b>`,
    ``,
    `<i>Ro'yxatlar pastdagi tugmalarda.</i>`,
  );
  return s.join("\n");
}

/** Admin dashboardidagi ro'yxat turlari. */
export type TolovRoyxatTuri = "qarzdor" | "kechikkan" | "tolagan";

/**
 * Bitta ro'yxat ko'rinishi. Umumiy dashboard ataylab qisqa qoldirilgan —
 * 12 kishilik uyda uchta to'liq ro'yxat bitta xabarga sig'masdi va eng
 * muhim raqamlar pastga tushib ketardi. Endi har biri alohida tugmada.
 */
export function tolovRoyxatMatni(d: TolovDashboard, tur: TolovRoyxatTuri): string {
  const bolimlar = {
    qarzdor: {
      sarlavha: "🔴 <b>QARZDORLAR</b>",
      odamlar: d.qarzdorlar,
      bosh: "🎉 <i>Qarzdor yo'q — hamma to'lagan.</i>",
    },
    kechikkan: {
      sarlavha: "⛔️ <b>KECHIKKANLAR</b>",
      odamlar: d.kechikkanlar,
      bosh: "✅ <i>Kechikkan yo'q.</i>",
    },
    tolagan: {
      sarlavha: "🟢 <b>TO'LIQ TO'LAGANLAR</b>",
      odamlar: d.tola,
      bosh: "🤷 <i>Hali hech kim to'liq to'lamagan.</i>",
    },
  }[tur];

  const s = [
    bolimlar.sarlavha,
    AJRATGICH,
    `<i>${siklOyi(d.sikl)} oyi · ${bolimlar.odamlar.length} kishi</i>`,
    ``,
    muddatQatori(d.sikl),
    ``,
  ];

  if (bolimlar.odamlar.length === 0) {
    s.push(bolimlar.bosh);
    return s.join("\n");
  }

  s.push(...bolimlar.odamlar.flatMap((o) => siklOdamQatori(o, d.talab)));

  const jami = bolimlar.odamlar.reduce((n, o) => n + o.qoldiq, 0);
  if (jami > 0) s.push(``, AJRATGICH, `📉 Shu ro'yxat bo'yicha qoldiq: <b>${pul(jami)}</b>`);

  s.push(``, `<i>Batafsili uchun odamning tugmasini bosing.</i>`);
  return s.join("\n");
}

/** Oxirgi oylarning qisqa xulosasi — "📜 Tarix" tugmasi. */
export function tolovTarixXulosasi(xulosalar: SiklXulosa[]): string {
  if (xulosalar.length === 0) {
    return [`📜 <b>TO'LOV TARIXI</b>`, AJRATGICH, ``, `🤷 <i>Hali oy yopilmagan.</i>`].join("\n");
  }

  const s = [`📜 <b>TO'LOV TARIXI</b>`, AJRATGICH, ``];
  for (const x of xulosalar) {
    const belgi = x.jamiQoldiq === 0 ? "✅" : x.sikl.holat === "ochiq" ? "🟡" : "🔴";
    s.push(
      `${belgi} <b>${siklOyi(x.sikl)}</b> — ${siklHolatBelgisi(x.sikl).split(" ")[0]}`,
      `   💵 ${pul(x.jamiTasdiqlangan)} / ${pul(x.jamiTalab)}`,
    );
    if (x.jamiQoldiq > 0) s.push(`   📉 Yetmagan: <b>${pul(x.jamiQoldiq)}</b>`);
    s.push(``);
  }
  return s.join("\n");
}

/**
 * Admin bitta odamni ochganda ko'radigan to'liq to'lov kartochkasi:
 * talab, tasdiqlangan, qoldiq, tekshiruvdagilar, muddat natijasi, jarima
 * holati va butun to'lov tarixi.
 */
export function tolovFoydalanuvchiMatni(
  sikl: TolovSikl,
  o: SiklOdam,
  tarix: TolovTarix[],
  tuzatishlar: { summa: number; sabab: string | null; admin_ism: string; created_at: Date }[] = [],
): string {
  const daraja = tolovDarajaBelgisi(o.daraja);
  const s = [
    `👤 <b>${esc(o.ism).toUpperCase()}</b>`,
    AJRATGICH,
    `<i>${siklOyi(sikl)} oyi · ${siklHolatBelgisi(sikl)}</i>`,
    ``,
    muddatQatori(sikl),
    ``,
    `💰 Talab: <b>${pul(sikl.talab)}</b>`,
    `✅ Tasdiqlangan: <b>${pul(o.tasdiqlangan)}</b>`,
    `📉 Qoldiq: <b>${pul(o.qoldiq)}</b>`,
    `Holat: ${daraja.emoji} <b>${daraja.nom}</b>`,
  ];

  s.push(
    ``,
    o.kutilmoqdaSoni > 0
      ? `⏳ Tekshiruvda: <b>${o.kutilmoqdaSoni} ta</b> · ${pul(o.kutilmoqdaSumma)}`
      : `⏳ Tekshiruvda: <i>yo'q</i>`,
  );

  s.push(``, AJRATGICH, `⚖️ <b>MUDDAT NATIJASI</b>`);
  if (!o.muddat) {
    s.push(`   <i>Muddat hali kelmagan — natija o'shanda yoziladi.</i>`);
  } else if (o.muddat.tekshiruvKutilmoqda) {
    s.push(
      `   Muddatda tasdiqlangan: <b>${pul(o.muddat.tasdiqlangan)}</b>`,
      `   Muddatda tekshiruvda: <b>${pul(o.muddat.kutilmoqda)}</b>`,
      `   ⏳ <i>Odam muddatgacha yuborgan, tekshiruv kechikkan —</i>`,
      `   <i>shuning uchun jarima yozilmadi.</i>`,
    );
  } else {
    s.push(
      `   Muddatda tasdiqlangan: <b>${pul(o.muddat.tasdiqlangan)}</b>`,
      `   Muddatda yetmagan: <b>${pul(o.muddat.qoldiq)}</b>`,
      o.muddat.jarima > 0
        ? `   💸 Jarima: <b>${pul(o.muddat.jarima)}</b>`
        : `   💸 Jarima: <i>yo'q (foiz 0 — /tolovjarima bilan o'rnatiladi)</i>`,
    );
  }

  if (tuzatishlar.length > 0) {
    s.push(``, AJRATGICH, `✏️ <b>QO'LDA TUZATISHLAR</b> (${siklOyi(sikl)})`);
    for (const t of tuzatishlar.slice(0, 5)) {
      s.push(
        `   ${t.summa > 0 ? "+" : ""}${pul(t.summa)} — ${esc(t.sabab ?? "sababsiz")}`,
        `      👮 ${esc(t.admin_ism)}, ${qisqaSana(t.created_at)}`,
      );
    }
  }

  s.push(``, AJRATGICH, `📜 <b>TO'LOV TARIXI</b>`);
  if (tarix.length === 0) {
    s.push(`   🤷 <i>Hali to'lov yubormagan.</i>`);
    return s.join("\n");
  }

  for (const p of tarix) {
    const holat =
      p.holat === "tasdiqlandi"
        ? `✅ ${pul(Number(p.tasdiqlangan_summa))}`
        : p.holat === "rad"
          ? `❌ rad`
          : `⏳ kutilmoqda`;
    s.push(
      `   ${holat} · da'vo ${pul(Number(p.kiritgan_summa))}`,
      `      📅 yuborilgan ${qisqaSana(p.created_at)}` +
        (p.hal_qilindi ? ` · hal ${qisqaSana(p.hal_qilindi)}` : ``),
    );
  }

  return s.join("\n");
}

/** Admin panelining bosh sahifasi. */
export function adminPanelMatni(): string {
  return [
    `👑 <b>ADMIN PANEL</b>`,
    AJRATGICH,
    ``,
    `Bazadagi ma'lumotlarni to'g'ridan-to'g'ri shu yerdan`,
    `boshqarasiz — kod o'zgartirish shart emas.`,
  ].join("\n");
}

/** "👥 Foydalanuvchilar" ro'yxati sarlavhasi — har bir odam alohida tugmada. */
export function foydalanuvchilarRoyxatiMatni(
  royxat: (User & { xona_raqami: number | null })[],
): string {
  const faol = royxat.filter((u) => u.faol).length;
  const ulangan = royxat.filter((u) => u.faol && u.telegram_id).length;
  return [
    `👥 <b>FOYDALANUVCHILAR</b>`,
    AJRATGICH,
    ``,
    `Jami: <b>${royxat.length}</b> · Faol: <b>${faol}</b> · Ulangan: <b>${ulangan}</b>`,
    ``,
    `Birontasini tanlang:`,
  ].join("\n");
}

/** Foydalanuvchi ro'yxatidagi bitta tugma yozuvi — holat bir qarashda ko'rinsin. */
export function foydalanuvchiTugmaYozuvi(u: User & { xona_raqami: number | null }): string {
  const holat = !u.faol ? "🚫" : u.telegram_id ? "✅" : "⏳";
  const xona = u.xona_raqami ? ` · ${u.xona_raqami}-xona` : "";
  return `${holat} ${u.ism}${xona}${u.admin ? " 👑" : ""}`;
}

/**
 * To'liq foydalanuvchi profili — admin bu yerdan barcha muhim ma'lumotni
 * bir qarashda ko'radi (talab: "User Details"). Guruh holati faqat
 * ulangan (`telegram_id` bor) bo'lsa tekshiriladi — aks holda
 * `getChatMember` chaqirishning ma'nosi yo'q.
 */
export function foydalanuvchiDetalMatni(
  u: FoydalanuvchiToliq,
  guruhHolat: AzolikHolati | null,
  tolov: TolovHolatMalumoti,
  tuzatishlar: { ball: number; sabab: string | null; admin_ism: string; created_at: Date }[],
  loglar: AdminLogToliq[],
): string {
  const guruhMatni: Record<AzolikHolati, string> = {
    azo: "✅ A'zo",
    azo_emas: "❌ A'zo emas",
    guruh_yoq: "➖ Guruh hali sozlanmagan",
  };

  const s = [
    `👤 <b>${esc(u.ism).toUpperCase()}</b>`,
    AJRATGICH,
    ``,
    `🆔 Baza ID: <code>${u.id}</code>`,
    `📱 Telegram ID: ${u.telegram_id ? `<code>${esc(u.telegram_id)}</code>` : "❌ <b>ULANMAGAN</b>"}`,
    `🔖 Username: ${u.username ? `@${esc(u.username)}` : "—"}`,
  ];
  if (u.telegram_id) s.push(`👥 Guruh holati: ${guruhHolat ? guruhMatni[guruhHolat] : "—"}`);
  s.push(
    `🏠 Xona: ${u.xona_raqami ? `${u.xona_raqami}-xona` : "—"}`,
    `👑 Admin: ${u.admin ? "Ha" : "Yo'q"}`,
    `📊 Holat: ${u.faol ? "✅ Faol" : "🚫 Faolsizlantirilgan"}`,
    ``,
    AJRATGICH,
    `🏅 Jami ball (butun tarix): <b>${u.jami_ball}</b>`,
    `💳 Kvartira to'lovi (${siklOyi(tolov.sikl)}): ` +
      `<b>${pul(tolov.tasdiqlangan)}</b> / ${pul(tolov.talab)}`,
  );
  if (tolov.qoldiq > 0) s.push(`   📉 Qoldi: <b>${pul(tolov.qoldiq)}</b> · ${muddatQatori(tolov.sikl)}`);
  if (tolov.kutilmoqdaSoni > 0) {
    s.push(`   ⏳ Tekshiruvda: ${tolov.kutilmoqdaSoni} ta · ${pul(tolov.kutilmoqdaSumma)}`);
  }

  if (tuzatishlar.length > 0) {
    s.push(``, `<b>Oxirgi ball tuzatishlari:</b>`);
    for (const t of tuzatishlar.slice(0, 5)) {
      s.push(
        `   ${t.ball > 0 ? "+" : ""}${t.ball} — ${esc(t.sabab ?? "sababsiz")} (${esc(t.admin_ism)}, ${qisqaSana(t.created_at)})`,
      );
    }
  }

  if (loglar.length > 0) {
    s.push(``, `<b>Oxirgi o'zgarishlar:</b>`);
    for (const l of loglar.slice(0, 5)) {
      s.push(`   ${esc(l.harakat)} — ${esc(l.admin_ism)}, ${qisqaSana(l.created_at)}`);
    }
  }

  return s.join("\n");
}

/** Telegram ID o'zgartirishdan oldingi ogohlantirish — eng sezgir amal. */
export function telegramIdTasdiqMatni(u: User, yangi: number | null): string {
  return [
    `⚠️ <b>TELEGRAM ID'NI O'ZGARTIRISH</b>`,
    AJRATGICH,
    ``,
    `👤 ${esc(u.ism)}`,
    `Eski: ${u.telegram_id ? `<code>${esc(u.telegram_id)}</code>` : "❌ ulanmagan"}`,
    `Yangi: ${yangi !== null ? `<code>${yangi}</code>` : "❌ uzish (ulanmagan holatga qaytarish)"}`,
    ``,
    `Bu odamning BUTUN tarixi (to'lov, navbat, ball, shikoyat)`,
    `shu Telegram hisobiga bog'lanadi. Xato bo'lsa boshqa`,
    `odamning ma'lumotlarini ochib qo'yishi mumkin.`,
    ``,
    `Aniq to'g'ri ekaniga ishonchingiz komilmi?`,
  ].join("\n");
}

export function foydalanuvchiOchirishTasdiqMatni(u: User): string {
  return [
    `⚠️ <b>BUTUNLAY O'CHIRISH?</b>`,
    AJRATGICH,
    ``,
    `👤 ${esc(u.ism)}`,
    ``,
    `Bu qaytarib bo'lmaydigan amal. Faqat hech qanday tarixi`,
    `(navbat, to'lov, ball, shikoyat) yo'q bo'lsa ishlaydi.`,
  ].join("\n");
}

export function foydalanuvchiFaollikTasdiqMatni(u: User, faol: boolean): string {
  return faol
    ? [`✅ <b>${esc(u.ism)}</b>ni qayta faollashtirasizmi?`].join("\n")
    : [
        `⚠️ <b>${esc(u.ism)}</b>ni faolsizlantirasizmi?`,
        ``,
        `Tarixi (to'lov, navbat, ball) saqlanib qoladi — faqat`,
        `ro'yxatlarda, navbatda va reytingda ko'rinmay qoladi.`,
      ].join("\n");
}

/** Bir xil nomli, ikkalasi ham FAOL foydalanuvchilar — nazariy jihatdan bo'lmasligi kerak. */
export function takroriyIsmlarMatni(royxat: { ism: string; soni: number }[]): string {
  if (royxat.length === 0) {
    return [
      `✅ <b>KELISHMOVCHILIK YO'Q</b>`,
      AJRATGICH,
      ``,
      `Bir xil nomli faol foydalanuvchilar topilmadi.`,
    ].join("\n");
  }
  const s = [`⚠️ <b>KELISHMOVCHILIKLAR</b>`, AJRATGICH, ``];
  for (const r of royxat) {
    s.push(`👤 <b>${esc(r.ism)}</b> — ${r.soni} ta faol yozuv bilan.`);
  }
  s.push(``, `<i>Har birini alohida ochib, kerakli birini faolsizlantiring.</i>`);
  return s.join("\n");
}

/** So'nggi admin o'zgarishlari — umumiy jurnal. */
export function adminLogMatni(loglar: AdminLogToliq[]): string {
  if (loglar.length === 0) {
    return [`📜 <b>O'ZGARISHLAR TARIXI</b>`, AJRATGICH, ``, `🤷 <i>Hali hech narsa yo'q.</i>`].join("\n");
  }
  const s = [`📜 <b>O'ZGARISHLAR TARIXI</b>`, AJRATGICH, ``];
  for (const l of loglar) {
    s.push(`▫️ ${esc(l.harakat)} (#${l.obyekt_id ?? "—"}) — ${esc(l.admin_ism)}`);
    if (l.eski_qiymat || l.yangi_qiymat) {
      s.push(`   ${esc(l.eski_qiymat ?? "—")} → ${esc(l.yangi_qiymat ?? "—")}`);
    }
    s.push(`   📅 ${qisqaSana(l.created_at)}`);
  }
  return s.join("\n");
}

// ---------------------------------------------------------------------------
// NAVBAT VAZIFALARINI SOZLASH (admin)
// ---------------------------------------------------------------------------

/**
 * "Mening Navbatim" panelida rasm kutilayotgandagi JONLI xabar.
 *
 * Bu matn yangi xabar sifatida yuborilmaydi — mavjud so'rov xabari
 * tahrirlanadi (`state.ts` `sorovniTahrirla`). Sabab: albom bilan
 * tashlangan har rasmga alohida javob yozilsa 9 ta rasm 18 ta xabar
 * demakdir; Telegram flood chegarasi javoblarni tashlab yubora boshlaydi
 * va odam nechta rasm tushganini umuman bilmay qoladi.
 */
export function vazifaRasmMatni(v: NavbatVazifasi, soni: number, bajarilgan = 0): string {
  const s = [`${esc(v.emoji)} <b>${esc(v.nom)}</b>`];

  // "2 marta" vazifada nechinchi martadaligini eslatib turamiz.
  if (v.takror_soni > 1) {
    s.push(`<i>${bajarilgan}/${v.takror_soni} marta bajarilgan — hozir ${bajarilgan + 1}-martasi</i>`);
  }
  s.push(AJRATGICH, ``);

  if (soni === 0) {
    s.push(
      `📷 <b>Kamida ${v.rasm_soni} ta rasm</b> kerak.`,
      `<i>Birdaniga tashlasangiz ham bo'ladi. Xohlagancha ko'p —</i>`,
      `<i>cheklov yo'q, faqat ${v.rasm_soni} tadan kam emas.</i>`,
    );
    return s.join("\n");
  }

  // Foiz — "rasmni nechtaligi ko'rinib tursin". Minimumga yetgach 100% da
  // to'xtaydi (ortiqcha rasm 100%+ ko'rinmasin, "yetdi" degan ma'no yo'qolmasin).
  const foiz = Math.min(100, Math.round((soni / v.rasm_soni) * 100));
  s.push(`${bolmalar(soni, v.rasm_soni)}  <b>${soni}/${v.rasm_soni}</b>  ·  <b>${foiz}%</b>`);
  s.push(``);

  if (soni < v.rasm_soni) {
    s.push(
      `📷 Yana kamida <b>${v.rasm_soni - soni} ta</b> rasm kerak — shu yerga tashlang.`,
    );
  } else {
    s.push(
      `✅ <b>Yetarli rasm yig'ildi.</b>`,
      ``,
      `Yana rasm yuborasizmi, yoki tugatasizmi?`,
      `<i>Ko'proq dalil — yaxshiroq (${RASM_MAX} tagacha). "✅ Tugatdim"</i>`,
      `<i>bosilganda ${v.takror_soni > 1 ? "shu marta" : "vazifa"} yopiladi.</i>`,
    );
  }

  return s.join("\n");
}

/**
 * `oraliq_kun` vazifasi (musor) uchun xona a'zolariga boradigan eslatma DM.
 * Xonaning istalgan a'zosi belgilashi mumkin — belgilangач keyingi tekshiruvda
 * shart o'zi yolg'on bo'ladi va eslatma to'xtaydi (alohida "o'chirish" yo'q).
 */
export function oraliqVazifaMatni(v: NavbatVazifasi, otganKun: number): string {
  return [
    `${esc(v.emoji)} <b>${esc(v.nom).toUpperCase()} ESLATMASI</b>`,
    AJRATGICH,
    ``,
    `Navbatingiz boshlanganiga <b>${otganKun} kun</b> bo'ldi —`,
    `<b>${esc(v.nom)}</b>ni bajarib, "👤 Mening Navbatim" panelidan`,
    `rasmini yuboring.`,
    ``,
    `<i>Xonadan istalgan a'zo belgilashi mumkin — belgilangач</i>`,
    `<i>bu eslatma o'zi to'xtaydi.</i>`,
  ].join("\n");
}

/** Vazifaga qattiq chegara (`RASM_MAX`) tufayli sig'may qolgan rasm haqida. */
export function vazifaRasmToldiMatni(v: NavbatVazifasi): string {
  return [
    `📷 <b>${esc(v.nom)}</b> — bu martada ${RASM_MAX} ta rasm yig'ildi, eng ko'p miqdor.`,
    ``,
    `<i>Yangi rasm qo'shilmadi, lekin avvalgilari joyida turibdi.</i>`,
  ].join("\n");
}

/** Admin: navbat vazifalari ro'yxati. */
export function vazifalarMatni(vazifalar: NavbatVazifasi[]): string {
  const faol = vazifalar.filter((v) => v.faol);
  const nofaol = vazifalar.filter((v) => !v.faol);

  const s = [
    `⚙️ <b>NAVBAT VAZIFALARI</b>`,
    AJRATGICH,
    ``,
    `Navbatdagi xona SHULARNI bajarishi shart. Ro'yxat va har`,
    `biriga kerakli rasm soni shu yerdan boshqariladi — kod`,
    `o'zgartirish shart emas.`,
    ``,
  ];

  if (faol.length === 0) {
    s.push(`⚠️ <b>Birorta faol vazifa yo'q</b> — navbatni yakunlab bo'lmaydi.`);
  } else {
    s.push(`<b>Faol (${faol.length}):</b>`);
    for (const [i, v] of faol.entries()) {
      const marta = v.takror_soni > 1 ? `, <b>${v.takror_soni}</b> marta` : "";
      const oraliq = v.oraliq_kun > 0 ? `, 🕐 ${v.oraliq_kun}-kundan eslatma` : "";
      s.push(`   ${i + 1}. ${esc(v.emoji)} ${esc(v.nom)} — <b>${v.rasm_soni}</b> rasm${marta}${oraliq}`);
    }
  }

  if (nofaol.length > 0) {
    s.push(``, `<b>O'chirilgan (${nofaol.length}):</b>`);
    for (const v of nofaol) s.push(`   ⛔️ ${esc(v.emoji)} ${esc(v.nom)}`);
  }

  s.push(
    ``,
    `<i>Ikkita hammom bo'lsa: "Hammom"ni "1-hammom" deb qayta nomlab,</i>`,
    `<i>yangisiga "2-hammom" deb qo'shing. Musor kabi navbat davomida</i>`,
    `<i>bir necha marta bajariladigan ish uchun "necha marta"ni oshiring.</i>`,
  );
  return s.join("\n");
}

/** Admin: bitta vazifa kartochkasi. */
export function vazifaDetalMatni(v: NavbatVazifasi): string {
  return [
    `${esc(v.emoji)} <b>${esc(v.nom)}</b>`,
    AJRATGICH,
    ``,
    `📷 Kerakli rasm (bir marta): <b>${v.rasm_soni}</b> ta (eng kam)`,
    `🔁 Navbat davomida: <b>${v.takror_soni}</b> marta`,
    v.oraliq_kun > 0
      ? `🕐 Oraliq eslatma: navbatning <b>${v.oraliq_kun}-kunidan</b> (har 5 soatda, 1-marta bajarilgunicha)`
      : `🕐 Oraliq eslatma: <b>o'chiq</b> (navbat oxirida ochiladi)`,
    `🔢 Tartib: <b>${v.tartib}</b>`,
    `${v.faol ? "🟢 Faol — panelda ko'rinadi" : "⛔️ O'chirilgan — panelda ko'rinmaydi"}`,
    ``,
    `<i>Ichki kalit: <code>${esc(v.kod)}</code> — o'zgarmaydi, shu sababli</i>`,
    `<i>nomini o'zgartirsangiz ham eski navbatlardagi rasmlar</i>`,
    `<i>yo'qolmaydi.</i>`,
    ``,
    `<i>Vazifa butunlay o'chirilmaydi, faqat ro'yxatdan chiqariladi —</i>`,
    `<i>aks holda eski navbatlardagi rasmlar nimaga tegishli ekani</i>`,
    `<i>bilinmay qolardi.</i>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// ADMIN XABARI (a'zolarga topshiriq/eslatma)
// ---------------------------------------------------------------------------

/** Kimga ketishini odam tilida — tasdiq va natija xabarlarida bir xil. */
export function xabarKimiNomi(k: XabarKimi, qoshimcha?: string): string {
  switch (k.t) {
    case "navbatchi":
      return qoshimcha ? `navbatdagi xona (${qoshimcha})` : "navbatdagi xona";
    case "hamma":
      return "hamma a'zo";
    case "xona":
      return `${k.raqam}-xona`;
    case "odam":
      return qoshimcha ?? "bitta a'zo";
    case "guruh":
      return "guruh chati";
  }
}

/** Admin xabar matnini yozgach — yuborishdan oldingi ko'rinish. */
export function xabarTasdiqMatni(k: XabarKimi, matn: string, kimga: string, soni: number): string {
  const s = [
    `📣 <b>XABARNI YUBORAMIZMI?</b>`,
    AJRATGICH,
    ``,
    `👥 Kimga: <b>${esc(kimga)}</b>`,
  ];

  if (k.t !== "guruh") {
    s.push(
      soni > 0
        ? `📬 Botga ulangan: <b>${soni}</b> kishi`
        : `⚠️ <b>Botga ulangan odam yo'q</b> — xabar hech kimga bormaydi.`,
    );
  }

  s.push(``, AJRATGICH, ``, esc(matn), ``, AJRATGICH, ``, `<i>Yuborilgach ortga qaytarib bo'lmaydi.</i>`);
  return s.join("\n");
}

/**
 * A'zoga boradigan xabarning o'zi. Kim yuborgani ochiq ko'rsatiladi —
 * anonim shikoyatdan farqli o'laroq bu ochiq topshiriq, javobgarligi
 * bo'lishi kerak.
 */
export function adminXabariMatni(adminIsm: string, matn: string): string {
  return [
    `📣 <b>ADMINDAN XABAR</b>`,
    AJRATGICH,
    ``,
    esc(matn),
    ``,
    AJRATGICH,
    `<i>— ${esc(adminIsm)} (admin)</i>`,
  ].join("\n");
}

/** Guruhga boradigan ko'rinish — DM bilan bir xil, faqat sarlavhasi boshqa. */
export function xabarGuruhMatni(adminIsm: string, matn: string): string {
  return [
    `📣 <b>E'LON</b>`,
    AJRATGICH,
    ``,
    esc(matn),
    ``,
    AJRATGICH,
    `<i>— ${esc(adminIsm)} (admin)</i>`,
  ].join("\n");
}

/**
 * Yuborilgandan keyingi hisobot. Yetmaganlar ATAYLAB ism bilan
 * ko'rsatiladi: "yuborildi" deb qo'yib, aslida yetmagani adminni
 * chalg'itardi (`shaxsiy()` bloklangan hisobni ham `false` qaytaradi).
 */
export function xabarNatijaMatni(kimga: string, yetdi: string[], yetmadi: string[]): string {
  const s = [
    `✅ <b>XABAR YUBORILDI</b>`,
    AJRATGICH,
    ``,
    `👥 Kimga: <b>${esc(kimga)}</b>`,
    `📬 Yetkazildi: <b>${yetdi.length}</b>`,
  ];

  if (yetdi.length > 0) s.push(`   ${esc(yetdi.join(", "))}`);

  if (yetmadi.length > 0) {
    s.push(
      ``,
      `⚠️ <b>Yetmadi (${yetmadi.length}):</b>`,
      `   ${esc(yetmadi.join(", "))}`,
      ``,
      `<i>Sabab: botga ulanmagan yoki botni bloklagan.</i>`,
    );
  }

  return s.join("\n");
}

// ---------------------------------------------------------------------------
// NAVBAT VAQT SOZLAMALARI (admin)
// ---------------------------------------------------------------------------

/** Majburiy ochilish qiymatini odam tilida. */
function majburiyQiymati(kun: number): string {
  return kun >= MAJBURIY_DOIM_OCHIQ ? "har doim ochiq" : `muddatga ${kun} kun qolganda`;
}

/**
 * Admin: navbatning vaqt sozlamalari.
 *
 * Ikkala qiymat ham `settings` jadvalida — ilgari `config.ts`da qattiq
 * yozilgan edi, ya'ni sikl uzunligini o'zgartirish uchun deploy kerak
 * bo'lardi.
 */
export function navbatSozlamalariMatni(s: NavbatSozlamalari): string {
  return [
    `⚙️ <b>NAVBAT SOZLAMALARI</b>`,
    AJRATGICH,
    ``,
    `🔁 Sikl uzunligi: <b>${s.siklKuni} kun</b>`,
    `<i>Har xonaga shuncha kun beriladi. O'zgartirish faqat KELGUSI</i>`,
    `<i>navbatlarga ta'sir qiladi — hozir ketayotgani o'z muddatida</i>`,
    `<i>qoladi (uni "📅 Muddatni o'zgartirish" bilan sozlaysiz).</i>`,
    ``,
    `🔓 Majburiy vazifa ochilishi: <b>${majburiyQiymati(s.majburiyKuni)}</b>`,
    `<i>Shu paytgacha "Mening Navbatim"da vazifa tugmalari</i>`,
    `<i>ko'rinmaydi — ixtiyoriy tozalash esa har doim ishlaydi.</i>`,
  ].join("\n");
}

/**
 * Admin: joriy navbatga necha kun berilishini so'raymiz.
 *
 * Nima uchun sikl sozlamasidan alohida: oldingi navbat guruh tasdig'ini
 * kutib cho'zilib ketsa, uy allaqachon uzoq tozalanmagan bo'ladi — bunday
 * paytda keyingi xonaga to'liq sikl berish uyni yana shuncha kunga
 * qoldiradi. Bu tugma aynan SHU navbatni qisqartiradi (yoki uzaytiradi),
 * kelgusi sikllar o'z uzunligida qolaveradi.
 */
export function navbatMuddatMatni(room: Room, turn: Turn, s: NavbatSozlamalari): string {
  const qoldi = qolganKun(turn.muddat);
  return [
    `📅 <b>MUDDATNI O'ZGARTIRISH</b>`,
    AJRATGICH,
    ``,
    `🏠 Navbatda: <b>${room.raqam}-xona</b>`,
    `📅 Hozirgi muddat: <b>${sana(turn.muddat)}</b>`,
    `${muddatHolati(turn.muddat)}`,
    qoldi >= 0 ? `⏳ Qolgan: <b>${qoldi} kun</b>` : `🔴 Kechikkan: <b>${-qoldi} kun</b>`,
    ``,
    `<b>Bu navbatga bugundan boshlab necha kun beriladi?</b>`,
    ``,
    `<i>Faqat shu navbatga tegishli — kelgusi navbatlar baribir</i>`,
    `<i>${s.siklKuni} kunlik bo'lib qolaveradi.</i>`,
  ].join("\n");
}

/** Muddat o'zgartirilgach guruhga chiqadigan xabar — hech kim kutmasin. */
export function muddatOzgardiGuruhXabari(room: Room, muddat: Date, adminIsm: string): string {
  return [
    `📅 <b>NAVBAT MUDDATI O'ZGARDI</b>`,
    AJRATGICH,
    ``,
    `🏠 ${room.raqam}-xona`,
    `📅 Yangi muddat: <b>${sana(muddat)}</b>`,
    `${muddatHolati(muddat)}`,
    ``,
    `<i>— ${esc(adminIsm)} (admin)</i>`,
  ].join("\n");
}
