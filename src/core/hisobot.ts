/**
 * Admin hisobotlari — "butun jarayon" bir xabarda: har navbat yopilgach
 * (kim nima qildi, qachon topshirdi, kim tasdiqladi, necha kun kechikdi,
 * musor signallari) va har oy boshida (navbatlar, kvartira puli, yig'imlar,
 * shikoyatlar, "to'lay olmayman" sabablari).
 *
 * NEGA KERAK: bu ma'lumotning hammasi bazada bor edi, lekin tarqoq —
 * admin uni bilish uchun "🕘 Tarix", "💳 To'lovlar", "🚨 Shikoyatlar"ni
 * birma-bir ochib, o'zi yig'ishi kerak edi. Hisobot hech narsani yangidan
 * HISOBLAMAYDI va hech narsa YOZMAYDI — faqat mavjud yozuvlarni bir joyga
 * to'playdi ("agregat ustun saqlanmaydi" qoidasi).
 *
 * BAHO EMAS. Olib tashlangan reyting tizimi bilan chalkashtirmang: bu yerda
 * ball, o'rin, "eng yaxshi xona" yo'q — faqat fakt: bajarildimi, qachon,
 * necha kun kechikdi. Matni `bot/text.ts` da, bu fayl sof ma'lumot.
 */
import { sql, type Room, type Turn, type User } from "../db/index.js";
import { barchaRasmlar, bajarilganMarta } from "./rotation.js";
import { barchaVazifalar, type NavbatVazifasi } from "./vazifalar.js";
import { navbatSignallari, type SignalToliq } from "./signal.js";
import { siklniDavrBoyichaOl, siklniOl, tolovDashboard, type TolovDashboard } from "./tolov.js";
import type { TurnIshlar } from "../db/index.js";

// ---------------------------------------------------------------------------
// NAVBAT HISOBOTI
// ---------------------------------------------------------------------------

export type VazifaXulosasi = {
  kod: string;
  nom: string;
  emoji: string;
  /** Yopilgan martalar ("✅ Tugatdim") */
  bajarilgan: number;
  /** Kerakli martalar (`takror_soni`); ro'yxatdan chiqarilgan vazifada 1 */
  takror: number;
  /** Rasm yuborgan / yopgan odamlar — takrorlanmasdan, tartib bo'yicha */
  userIds: number[];
  rasm: number;
};

/**
 * Har vazifa bo'yicha xulosa — sof funksiya, bazasiz testlanadi.
 *
 * Joriy faol vazifalar tartibida, keyin shu navbatda rasm tashlangan,
 * lekin keyin ro'yxatdan chiqarilgan vazifalar (`navbatRasmlari` bilan bir
 * xil qoida: dalil yo'qolmasin). Ular uchun nom — kodning o'zi.
 */
export function vazifaXulosasi(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): VazifaXulosasi[] {
  const natija: VazifaXulosasi[] = vazifalar.map((v) => bittaXulosa(v.kod, v.nom, v.emoji, v.takror_soni, ishlar));
  for (const kod of Object.keys(ishlar)) {
    if (vazifalar.some((v) => v.kod === kod)) continue;
    natija.push(bittaXulosa(kod, kod, "▫️", 1, ishlar));
  }
  return natija;
}

function bittaXulosa(kod: string, nom: string, emoji: string, takror: number, ishlar: TurnIshlar): VazifaXulosasi {
  const belgi = ishlar[kod];
  const userIds: number[] = [];
  for (const t of belgi?.tarix ?? []) if (!userIds.includes(t.user_id)) userIds.push(t.user_id);
  if (belgi && !userIds.includes(belgi.user_id)) userIds.push(belgi.user_id);
  return {
    kod,
    nom,
    emoji,
    bajarilgan: bajarilganMarta(belgi),
    takror,
    userIds,
    rasm: barchaRasmlar(belgi).length,
  };
}

export type NavbatHisoboti = {
  turn: Turn;
  room: Room;
  azolar: string[];
  vazifalar: (VazifaXulosasi & { bajaruvchilar: string[] })[];
  /** Oxirgi (bekor qilinmagan) yakuniy topshiriq */
  topshiriq: { ism: string; vaqt: Date; rasm: number } | null;
  tasdiqlovchilar: string[];
  radlar: { sabab: string | null; kim: string | null }[];
  signallar: SignalToliq[];
  /** Shu navbatdan keyin boshlangan navbatning xonasi */
  keyingiXona: number | null;
};

/** Bitta (yopilgan yoki faol) navbatning to'liq hisoboti. */
export async function navbatHisoboti(turnId: number): Promise<NavbatHisoboti | null> {
  const [turn] = await sql<Turn[]>`SELECT * FROM turns WHERE id = ${turnId}`;
  if (!turn) return null;
  const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${turn.room_id}`;
  if (!room) return null;

  // Xona a'zolari HOZIRGI tarkib bo'yicha — `users` da a'zolik tarixi
  // saqlanmaydi. Kim nima qilgani esa pastda `ishlar` dan, aniq.
  const azolar = await sql<User[]>`
    SELECT * FROM users WHERE room_id = ${room.id} AND faol ORDER BY id
  `;

  // Faol vazifalar + shu navbatda rasm tashlangan, keyin ro'yxatdan
  // chiqarilganlari — ular ham o'z nomi bilan ko'rinsin.
  const ishlar = turn.ishlar ?? {};
  const vazifalar = (await barchaVazifalar()).filter((v) => v.faol || ishlar[v.kod]);
  const xulosa = vazifaXulosasi(ishlar, vazifalar);
  const idlar = [...new Set(xulosa.flatMap((x) => x.userIds))];
  const ismlar = idlar.length
    ? await sql<{ id: number; ism: string }[]>`SELECT id, ism FROM users WHERE id = ANY(${idlar})`
    : [];
  const ismi = (id: number) => ismlar.find((i) => i.id === id)?.ism ?? `#${id}`;

  const [sub] = await sql<{ id: number; ism: string; created_at: Date; rasm: number }[]>`
    SELECT s.id, u.ism, s.created_at, COALESCE(array_length(s.photo_ids, 1), 0) AS rasm
    FROM submissions s JOIN users u ON u.id = s.user_id
    WHERE s.turn_id = ${turn.id} AND s.tur = 'navbat' AND NOT s.bekor AND s.holat <> 'rad'
    ORDER BY s.id DESC LIMIT 1
  `;
  const tasdiqlovchilar = sub
    ? (
        await sql<{ ism: string }[]>`
          SELECT u.ism FROM confirmations c JOIN users u ON u.id = c.user_id
          WHERE c.submission_id = ${sub.id} ORDER BY c.created_at
        `
      ).map((r) => r.ism)
    : [];

  const radlar = await sql<{ sabab: string | null; kim: string | null }[]>`
    SELECT s.rad_sababi AS sabab, u.ism AS kim
    FROM submissions s LEFT JOIN users u ON u.id = s.rad_qildi
    WHERE s.turn_id = ${turn.id} AND s.tur = 'navbat' AND s.holat = 'rad'
    ORDER BY s.id
  `;

  const [keyingi] = await sql<{ raqam: number }[]>`
    SELECT r.raqam FROM turns t JOIN rooms r ON r.id = t.room_id
    WHERE t.id > ${turn.id} ORDER BY t.id LIMIT 1
  `;

  return {
    turn,
    room,
    azolar: azolar.map((a) => a.ism),
    vazifalar: xulosa.map((x) => ({ ...x, bajaruvchilar: x.userIds.map(ismi) })),
    topshiriq: sub ? { ism: sub.ism, vaqt: sub.created_at, rasm: sub.rasm } : null,
    tasdiqlovchilar,
    radlar,
    signallar: await navbatSignallari(turn.id),
    keyingiXona: keyingi?.raqam ?? null,
  };
}

/** Hisoboti hali adminlarga ketmagan eng eski yopilgan navbat. */
export async function hisobotiKutayotganNavbat(): Promise<number | null> {
  const [t] = await sql<{ id: number }[]>`
    SELECT id FROM turns
    WHERE holat <> 'faol' AND hisobot_yuborildi IS NULL
    ORDER BY id LIMIT 1
  `;
  return t?.id ?? null;
}

/**
 * Navbatni "hisoboti yuborilmoqda" deb EGALLAYDI. `eslatmalarniTekshir`
 * bir vaqtda bir necha joydan chaqiriladi (webhook, cron) — egallamasdan
 * yuborilsa adminlar bir hisobotni ikki marta olardi. Hech kimga yetmasa
 * chaqiruvchi `hisobotniQaytar` bilan bo'shatadi: keyingi chaqiruvda
 * qayta urinadi ("yetkazilgandan keyin belgilash" qoidasining egallash
 * shakli).
 */
export async function hisobotniEgalla(turnId: number): Promise<boolean> {
  const r = await sql`
    UPDATE turns SET hisobot_yuborildi = now()
    WHERE id = ${turnId} AND hisobot_yuborildi IS NULL
    RETURNING id
  `;
  return r.length > 0;
}

export async function hisobotniQaytar(turnId: number): Promise<void> {
  await sql`UPDATE turns SET hisobot_yuborildi = NULL WHERE id = ${turnId}`;
}

/** Oxirgi yopilgan navbat — admin "📋 Oxirgi navbat" ni bosganda. */
export async function oxirgiYopilganNavbat(): Promise<number | null> {
  const [t] = await sql<{ id: number }[]>`
    SELECT id FROM turns WHERE holat <> 'faol' ORDER BY id DESC LIMIT 1
  `;
  return t?.id ?? null;
}

// ---------------------------------------------------------------------------
// OYLIK HISOBOT
// ---------------------------------------------------------------------------

/**
 * Shuncha soatdan qisqa navbat — navbat emas, admin uni darrov boshqa
 * xonaga o'tkazgan (27-avgustda bot 1-xonadan keyin 2-xonani tanlagan,
 * admin bir daqiqada 4-xonaga o'tkazgan). Ular oylik sanoqqa kirmaydi,
 * ro'yxatda "o'tkazildi" bo'lib turadi.
 */
export const QISQA_NAVBAT_SOAT = 1;

export type OyNavbati = {
  xona: number;
  boshlandi: Date;
  tasdiqlandi: Date;
  holat: Turn["holat"];
  kechikkanKun: number;
  topshirdi: string | null;
  /** `QISQA_NAVBAT_SOAT` dan qisqa — darrov boshqa xonaga o'tkazilgan */
  otkazildi: boolean;
};

export type XonaXulosasi = {
  xona: number;
  soni: number;
  kechikkan: number;
  kechikkanKun: number;
  /** Yakuniy topshiriqsiz yopilgan (admin yopgan/o'tkazgan) navbatlar */
  topshirilmagan: number;
};

/** Xonalar bo'yicha sanoq — sof funksiya. O'tkazilgan (qisqa) navbat sanalmaydi. */
export function xonaXulosasi(navbatlar: OyNavbati[]): XonaXulosasi[] {
  const map = new Map<number, XonaXulosasi>();
  for (const n of navbatlar) {
    if (n.otkazildi) continue;
    const x = map.get(n.xona) ?? { xona: n.xona, soni: 0, kechikkan: 0, kechikkanKun: 0, topshirilmagan: 0 };
    x.soni++;
    if (n.topshirdi === null) x.topshirilmagan++;
    if (n.kechikkanKun > 0) {
      x.kechikkan++;
      x.kechikkanKun += n.kechikkanKun;
    }
    map.set(n.xona, x);
  }
  return [...map.values()].sort((a, b) => a.xona - b.xona);
}

export type OylikHisobot = {
  /** `YYYY-MM` */
  davr: string;
  navbatlar: OyNavbati[];
  xonalar: XonaXulosasi[];
  signal: { jami: number; hal: number; ortachaSoat: number | null };
  /** Shu oyning kvartira puli sikli (bo'lmasa `null`) */
  oylik: TolovDashboard | null;
  /** Shu oyda boshlangan yoki yakunlangan yig'imlar */
  yigimlar: TolovDashboard[];
  shikoyat: { jami: number; holatlar: Record<string, number> };
  uzrlar: { ism: string; soni: number }[];
  faollik: number;
};

/**
 * Oy chegaralari Toshkent vaqti bo'yicha (`+05:00`, yoz/qish vaqti yo'q —
 * `db/seed.ts` bilan bir xil). Sof funksiya.
 */
export function oyOraligi(davr: string): { bosh: string; oxir: string } {
  const [yil, oy] = davr.split("-").map(Number) as [number, number];
  const keyingiYil = oy === 12 ? yil + 1 : yil;
  const keyingiOy = oy === 12 ? 1 : oy + 1;
  return {
    bosh: `${yil}-${String(oy).padStart(2, "0")}-01T00:00:00+05:00`,
    oxir: `${keyingiYil}-${String(keyingiOy).padStart(2, "0")}-01T00:00:00+05:00`,
  };
}

/** `YYYY-MM` dan oldingi oy — sof funksiya. */
export function oldingiOy(davr: string): string {
  const [yil, oy] = davr.split("-").map(Number) as [number, number];
  return oy === 1 ? `${yil - 1}-12` : `${yil}-${String(oy - 1).padStart(2, "0")}`;
}

export async function oylikHisobot(davr: string): Promise<OylikHisobot> {
  const { bosh, oxir } = oyOraligi(davr);

  const turnlar = await sql<
    { xona: number; boshlandi: Date; tasdiqlandi: Date; holat: Turn["holat"]; kechikkan_kun: number; topshirdi: string | null }[]
  >`
    SELECT r.raqam AS xona, t.boshlandi, t.tasdiqlandi, t.holat, t.kechikkan_kun,
           (SELECT u.ism FROM submissions s JOIN users u ON u.id = s.user_id
             WHERE s.turn_id = t.id AND s.tur = 'navbat' AND NOT s.bekor AND s.holat <> 'rad'
             ORDER BY s.id DESC LIMIT 1) AS topshirdi
    FROM turns t JOIN rooms r ON r.id = t.room_id
    WHERE t.holat <> 'faol'
      AND t.tasdiqlandi >= ${bosh}::timestamptz AND t.tasdiqlandi < ${oxir}::timestamptz
    ORDER BY t.id
  `;
  const navbatlar: OyNavbati[] = turnlar.map((t) => ({
    xona: t.xona,
    boshlandi: t.boshlandi,
    tasdiqlandi: t.tasdiqlandi,
    holat: t.holat,
    kechikkanKun: t.kechikkan_kun,
    topshirdi: t.topshirdi,
    otkazildi:
      new Date(t.tasdiqlandi).getTime() - new Date(t.boshlandi).getTime() < QISQA_NAVBAT_SOAT * 3_600_000,
  }));

  const [sig] = await sql<{ jami: number; hal: number; ortacha: number | null }[]>`
    SELECT count(*)::int AS jami,
           count(hal_qilindi)::int AS hal,
           (avg(EXTRACT(EPOCH FROM (hal_qilindi - created_at))) FILTER (WHERE hal_qilindi IS NOT NULL) / 3600)::float AS ortacha
    FROM navbat_signallari
    WHERE created_at >= ${bosh}::timestamptz AND created_at < ${oxir}::timestamptz
  `;

  const oylikSikl = await siklniDavrBoyichaOl(`${davr}-01`);
  const yigimIdlar = await sql<{ id: number }[]>`
    SELECT id FROM tolov_sikllari
    WHERE tur = 'yigim'
      AND ((created_at >= ${bosh}::timestamptz AND created_at < ${oxir}::timestamptz)
        OR (yakunlandi >= ${bosh}::timestamptz AND yakunlandi < ${oxir}::timestamptz))
    ORDER BY id
  `;
  const yigimlar: TolovDashboard[] = [];
  for (const { id } of yigimIdlar) {
    const sikl = await siklniOl(id);
    if (sikl) yigimlar.push(await tolovDashboard(sikl));
  }

  const shikoyatlar = await sql<{ holat: string; soni: number }[]>`
    SELECT holat, count(*)::int AS soni FROM reports
    WHERE created_at >= ${bosh}::timestamptz AND created_at < ${oxir}::timestamptz
    GROUP BY holat
  `;

  const uzrlar = await sql<{ ism: string; soni: number }[]>`
    SELECT u.ism, count(*)::int AS soni
    FROM tolov_uzrlari z JOIN users u ON u.id = z.user_id
    WHERE z.created_at >= ${bosh}::timestamptz AND z.created_at < ${oxir}::timestamptz
    GROUP BY u.ism ORDER BY count(*) DESC, u.ism
  `;

  const [faol] = await sql<{ soni: number }[]>`
    SELECT count(*)::int AS soni FROM faollik
    WHERE created_at >= ${bosh}::timestamptz AND created_at < ${oxir}::timestamptz
  `;

  return {
    davr,
    navbatlar,
    xonalar: xonaXulosasi(navbatlar),
    signal: { jami: sig?.jami ?? 0, hal: sig?.hal ?? 0, ortachaSoat: sig?.ortacha ?? null },
    oylik: oylikSikl ? await tolovDashboard(oylikSikl) : null,
    yigimlar,
    shikoyat: {
      jami: shikoyatlar.reduce((n, r) => n + r.soni, 0),
      holatlar: Object.fromEntries(shikoyatlar.map((r) => [r.holat, r.soni])),
    },
    uzrlar,
    faollik: faol?.soni ?? 0,
  };
}

/**
 * Oylik hisobot navbati: oxirgi yuborilgan oy (`settings.oylik_hisobot_davr`)
 * o'tgan oydan oldin bo'lsa — o'tgan oy uchun yuborish kerak. Sof funksiya.
 */
export function oylikHisobotKerakmi(oxirgiYuborilgan: string | null, joriyOy: string): string | null {
  const kerakli = oldingiOy(joriyOy);
  if (oxirgiYuborilgan && oxirgiYuborilgan >= kerakli) return null;
  return kerakli;
}

/**
 * Oylik hisobotni egallaydi — navbat hisobotidagi bilan bir xil sabab
 * (bir necha parallel chaqiruv). `true` — shu chaqiruv yuboradi.
 */
export async function oylikHisobotniEgalla(davr: string, eski: string | null): Promise<boolean> {
  const r = eski
    ? await sql`UPDATE settings SET qiymat = ${davr} WHERE kalit = 'oylik_hisobot_davr' AND qiymat = ${eski} RETURNING kalit`
    : await sql`INSERT INTO settings (kalit, qiymat) VALUES ('oylik_hisobot_davr', ${davr}) ON CONFLICT (kalit) DO NOTHING RETURNING kalit`;
  return r.length > 0;
}

export async function oylikHisobotniQaytar(eski: string | null): Promise<void> {
  if (eski) await sql`UPDATE settings SET qiymat = ${eski} WHERE kalit = 'oylik_hisobot_davr'`;
  else await sql`DELETE FROM settings WHERE kalit = 'oylik_hisobot_davr'`;
}

export async function oylikHisobotDavri(): Promise<string | null> {
  const [r] = await sql<{ qiymat: string }[]>`SELECT qiymat FROM settings WHERE kalit = 'oylik_hisobot_davr'`;
  return r?.qiymat ?? null;
}
