import type { Report, Room, SubTur, User } from "../db/index.js";
import {
  config, ISH_TURLARI, BALLAR, ISHONCH_DARAJASI, SHIKOYAT_JOYLARI,
  type IshTuri, type Ishonch, type ShikoyatJoyi,
} from "../config.js";
import { orinlarniHisobla, type OdamBall } from "../core/rating.js";
import type { ReportToliq } from "../core/reports.js";

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
 * Guruhga chiqadigan yagona xabar — qayta yuborilmaydi, holat
 * o'zgargan sayin shu tahrirlanadi. Reporter HAM, sababchi HAM hech
 * qachon ko'rsatilmaydi — faqat joyi, tavsif va joriy holat.
 */
export function shikoyatGuruhXabari(r: ReportToliq): string {
  const joy = shikoyatJoyi(r.joy);
  const s = [
    `🚨 <b>ANONIM SHIKOYAT</b>`,
    AJRATGICH,
    ``,
    `${joy.emoji} ${joy.nom}`,
    ``,
    `📝 ${esc(r.izoh)}`,
  ];
  if (r.photo_id) s.push(``, `${r.media_turi === "video" ? "🎥 Video" : "📸 Rasm"} dalil biriktirilgan.`);
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
    `Navbatda bo'lmasangiz ham ball yig'sangiz bo'ladi.`,
    ``,
    `Tugmani bosasiz ➡️ rasm tashlaysiz ➡️ guruh`,
    `tasdiqlaydi ➡️ ball qo'shiladi.`,
    ``,
    ...(Object.keys(ISH_TURLARI) as IshTuri[]).map(
      (t) => `   ${ISH_TURLARI[t].emoji} ${ISH_TURLARI[t].tugma} — <b>${ISH_TURLARI[t].ball} ball</b>`,
    ),
    ``,
    `⚠️ <b>Rasmsiz va tasdiqsiz ball berilmaydi.</b>`,
    `<i>Tasdiq kutayotgan ish reytingga qo'shilmaydi —</i>`,
    `<i>uni "Profil" bo'limida ko'rasiz.</i>`,
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
    `<i>Kim yozganini FAQAT admin biladi. Guruhga faqat</i>`,
    `<i>joyi va nima bo'lgani ketadi — hech kimning ismi</i>`,
    `<i>(sizniki ham, sababchiniki ham) chiqmaydi.</i>`,
    ``,
    `Admin tasdiqlasa, sababchiga tuzatish uchun`,
    `imkoniyat beriladi. Tuzatilmasa undan`,
    `<b>-${BALLAR.shikoyatJarima} ball</b> ayiriladi.`,
    ``,
    AJRATGICH,
    `💬 Botga hech qanday buyruq yozish shart emas —`,
    `istalgan narsa yozsangiz panel chiqadi.`,
  ].join("\n");
}
