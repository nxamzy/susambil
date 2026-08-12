/**
 * Toshkent vaqti bo'yicha kalendar hisob-kitoblari.
 *
 * Ilgari bir xil "bugungi sana"/"oy nomi" mantig'i uch joyda alohida
 * yozilgan edi (`jobs/reminders.ts`, `api/cron.ts`, `bot/handlers/commands.ts`)
 * — endi hammasi shu yerdan oladi, to'rtinchi nusxa yaratilmadi.
 *
 * Hamma narsa `YYYY-MM-DD` MATNI bilan ishlaydi, `Date` obyekti bilan emas.
 * Sabab: kalendar savoli ("bugun 15-kunmi?", "muddatga necha kun qoldi?")
 * vaqt mintaqasiga bog'liq, `Date` esa har doim UTC lahza — ikkalasini
 * aralashtirish klassik bir kunlik xatolik manbai. `YYYY-MM-DD` matni esa
 * leksikografik tarzda ham to'g'ri saralanadi, ya'ni `<`/`>` solishtirish
 * xavfsiz.
 */
const TZ = "Asia/Tashkent";

export const OYLAR = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

export type KunQismlari = { yil: number; oy: number; kun: number };

/** Toshkent vaqti bo'yicha sana qismlari. */
export function kunQismlari(d: Date = new Date()): KunQismlari {
  const p = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ,
  }).formatToParts(d);
  const ol = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { yil: ol("year"), oy: ol("month"), kun: ol("day") };
}

/** `YYYY-MM-DD` ko'rinishidagi sana matni. */
export function sanaMatni(yil: number, oy: number, kun: number): string {
  return `${yil}-${String(oy).padStart(2, "0")}-${String(kun).padStart(2, "0")}`;
}

/** Toshkent vaqti bo'yicha bugungi sana (`YYYY-MM-DD`). */
export function bugungiSana(d: Date = new Date()): string {
  const { yil, oy, kun } = kunQismlari(d);
  return sanaMatni(yil, oy, kun);
}

/**
 * Toshkent bo'yicha kun oxirigacha necha soat qolgan (1..24).
 *
 * Muddat kun OXIRIGACHA hisoblangani uchun muddat kunida "bugun" degani
 * yetarli emas — ertalab ham, kechqurun ham bir xil eshitiladi. Soat esa
 * haqiqiy shoshilinchlikni ko'rsatadi.
 */
export function kunOxirigachaSoat(d: Date = new Date()): number {
  const soat = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(d),
  );
  return 24 - soat;
}

/** Shu oyda nechta kun bor — muddat kuni oy uzunligidan oshib ketmasligi uchun. */
export function oyKunlari(yil: number, oy: number): number {
  return new Date(Date.UTC(yil, oy, 0)).getUTCDate();
}

function sanaLahzasi(iso: string): number {
  const [yil, oy, kun] = iso.split("-").map(Number);
  return Date.UTC(yil ?? 1970, (oy ?? 1) - 1, kun ?? 1);
}

/**
 * Ikki sana orasidagi kun farqi (`gacha` − `dan`). Musbat — `gacha` keyinroq.
 * Ikkalasi ham toza kalendar sanasi bo'lgani uchun yoz/qish vaqti yoki
 * mintaqa siljishi natijaga ta'sir qilmaydi.
 */
export function kunFarqi(dan: string, gacha: string): number {
  return Math.round((sanaLahzasi(gacha) - sanaLahzasi(dan)) / 86_400_000);
}

/** Oy nomi (1–12). Chegaradan tashqarida bo'lsa bo'sh satr. */
export function oyNomi(oy: number): string {
  return OYLAR[oy - 1] ?? "";
}

/** Sanadagi oyning nomi — `YYYY-MM-DD` matnidan. */
export function sanadanOyNomi(iso: string): string {
  return oyNomi(Number(iso.split("-")[1]));
}

export type SiklDavri = {
  /** Sikl kaliti — oyning birinchi kuni (`YYYY-MM-01`). */
  davr: string;
  /** To'lov muddati — o'sha oyning `muddatKuni`-kuni. */
  muddat: string;
};

/**
 * Berilgan lahza qaysi oylik to'lov sikliga tegishli va o'sha siklning
 * muddati qachon. Sikl har doim KALENDAR OYI: 1-kundan oxirigacha yuborilgan
 * to'lovlar shu oyning hisobiga tushadi, muddat esa oyning `muddatKuni`-kuni
 * (odatda 15-kun) — kvartira puli aynan o'sha kuni to'lanadi.
 */
export function siklDavri(d: Date, muddatKuni: number): SiklDavri {
  const { yil, oy } = kunQismlari(d);
  const kun = Math.min(Math.max(1, muddatKuni), oyKunlari(yil, oy));
  return { davr: sanaMatni(yil, oy, 1), muddat: sanaMatni(yil, oy, kun) };
}
