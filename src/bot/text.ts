import type { Room, User } from "../db/index.js";
import { config, ISH_TURLARI, BALLAR } from "../config.js";

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

const OYLAR = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

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
    `📷 Tozalagach guruhga <b>${config.minRasm} ta rasm</b> tashlang.`,
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

/** Botning tanishtiruvi — "Qanday ishlaydi?" tugmasi shuni chiqaradi. */
export function tanishtirish(): string {
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
    `Navbat har <b>${config.siklKuni} kunda</b> bir xonadan`,
    `ikkinchisiga o'tadi:`,
    `   1-xona ➡️ 2-xona ➡️ 3-xona ➡️ 4-xona ➡️ ...`,
    ``,
    `Navbatingiz kelganda:`,
    `   1️⃣ Kvartirani tozalaysiz`,
    `   2️⃣ Guruhga <b>${config.minRasm} ta rasm</b> tashlaysiz`,
    `   3️⃣ Boshqa xonadan <b>${config.kerakliTasdiq} kishi</b> ✅ bosadi`,
    `   4️⃣ Navbat keyingi xonaga o'tadi`,
    ``,
    `⚠️ <b>${config.kerakliTasdiq} kishi tasdiqlamaguncha navbat o'tmaydi.</b>`,
    `⏰ Muddatga 1 kun qolganda eslataman.`,
    `🔴 Kechiksangiz har kun ball kamayadi.`,
    ``,
    `<b>♻️ QO'SHIMCHA ISHLAR</b>`,
    AJRATGICH,
    `Paneldan tugmani bosasiz ➡️ rasm tashlaysiz`,
    `➡️ ball olasiz. Rasmsiz ball berilmaydi.`,
    ``,
    `   ${ISH_TURLARI.musor.emoji} Musor tashlash — <b>${ISH_TURLARI.musor.ball} ball</b>`,
    `   ${ISH_TURLARI.hammom.emoji} Hammom tozalash — <b>${ISH_TURLARI.hammom.ball} ball</b>`,
    `   ${ISH_TURLARI.oshxona.emoji} Oshxona tozalash — <b>${ISH_TURLARI.oshxona.ball} ball</b>`,
    ``,
    `<b>🛒 UYGA NARSA OLIB KELISH</b>`,
    AJRATGICH,
    `Fayri, gubka, qop-qog'oz olib kelsangiz —`,
    `rasmga olib botga tashlang va nomini yozing.`,
    `   <b>+${BALLAR.xarajat} ball</b>`,
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
    AJRATGICH,
    `💬 Botga hech qanday buyruq yozish shart emas —`,
    `istalgan narsa yozsangiz panel chiqadi.`,
  ].join("\n");
}
