import type { Room, User } from "../db/index.js";
import { pul } from "../core/kassa.js";

const TZ = "Asia/Tashkent";

const OYLAR = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

const KUNLAR: Record<string, string> = {
  Sunday: "yakshanba", Monday: "dushanba", Tuesday: "seshanba", Wednesday: "chorshanba",
  Thursday: "payshanba", Friday: "juma", Saturday: "shanba",
};

/** Toshkent vaqti bo'yicha kun/oy/yil/hafta kunini ajratib beradi. */
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
  return `${kun}-${OYLAR[oy - 1]}, ${haftaKuni}`;
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

/** Muddatgacha necha kun qolgani (butun kun). Manfiy — kechikkan. */
export function qolganKun(muddat: Date | string): number {
  const farq = new Date(muddat).getTime() - Date.now();
  return Math.ceil(farq / (24 * 60 * 60 * 1000));
}

export function navbatXabari(room: Room, azolar: User[], muddat: Date): string {
  const qoldi = qolganKun(muddat);
  const holat =
    qoldi > 0 ? `⏳ ${qoldi} kun qoldi`
    : qoldi === 0 ? "⚠️ Bugun oxirgi kun!"
    : `🔴 ${Math.abs(qoldi)} kun kechikdi`;

  return [
    `🧹 <b>Navbat: ${room.raqam}-xona</b>`,
    ``,
    `👤 ${esc(ismlar(azolar))}`,
    `📅 Muddat: ${sana(muddat)}`,
    `${holat}`,
    ``,
    `Tozalagach shu guruhga <b>kamida 3 ta rasm</b> tashlang.`,
    `Boshqa xonalardan 3 kishi tasdiqlasa — navbat keyingi xonaga o'tadi.`,
  ].join("\n");
}

export function tasdiqXabari(
  room: Room,
  kim: string,
  tasdiqlovchilar: string[],
  kerak: number,
): string {
  const qator = tasdiqlovchilar.length
    ? tasdiqlovchilar.map((n) => `✅ ${esc(n)}`).join("\n")
    : "<i>hali hech kim tasdiqlagani yo'q</i>";

  return [
    `🧾 <b>${room.raqam}-xona ishni topshirdi</b>`,
    `Yuklagan: ${esc(kim)}`,
    ``,
    `Tasdiqlaganlar (${tasdiqlovchilar.length}/${kerak}):`,
    qator,
    ``,
    `<i>Boshqa xonalardagilar tugmani bosadi.</i>`,
  ].join("\n");
}

export function yopilganXabar(
  room: Room,
  kim: string,
  tasdiqlovchilar: string[],
  kechikkan: number,
  jarima: number,
): string {
  const satrlar = [
    `✅ <b>${room.raqam}-xona ishi qabul qilindi</b>`,
    `Yuklagan: ${esc(kim)}`,
    `Tasdiqlaganlar: ${tasdiqlovchilar.map(esc).join(", ")}`,
  ];
  if (kechikkan > 0) {
    satrlar.push(``, `🔴 ${kechikkan} kun kechikdi — jarima ${pul(jarima)}`);
  } else {
    satrlar.push(``, `🎉 Vaqtida bajarildi, jarima yo'q`);
  }
  return satrlar.join("\n");
}
