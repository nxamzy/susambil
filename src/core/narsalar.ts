/**
 * "Uyga nima kerak" — uyda doimiy tugab turadigan narsalar ro'yxati
 * (bumaga, azelit, musor paketi ...).
 *
 * NEGA BOR: pul yig'imi e'lon qilinganda "nima olamiz" ro'yxati har safar
 * kalta chiqardi — nima tugaganini faqat admin eslardi. Endi ro'yxat
 * bazada turadi va uyda yashovchi HAR KIM tugaganini bir bosishda
 * belgilaydi; admin yig'im boshlaganda tayyor ro'yxatni ko'radi.
 *
 * Tuzilishi `core/vazifalar.ts` bilan ataylab bir xil (tartib, faol,
 * ko'chirish, emoji nomdan ajratiladi) — ikkinchi naqsh o'ylab topilmadi.
 * Ikki farqi bor:
 *
 *   1) `kod` YO'Q. Navbat vazifasining kodi `turns.ishlar` JSONB kaliti
 *      bo'lgani uchun o'zgarmas edi; narsaning esa hech qanday tarixiy
 *      kaliti yo'q — yig'imga uning NOMI nusxalanadi
 *      (`tolov_sikllari.narsalar`), ya'ni keyin nomi o'zgarsa ham eski
 *      e'lon o'z matnida qoladi.
 *
 *   2) Holatni admin emas, HAR KIM o'zgartiradi (`tugadi` belgilash) —
 *      ro'yxatning kaltaligi aynan shundan kelib chiqqan edi. Ro'yxatning
 *      O'ZINI tahrirlash (qo'shish, nom, o'chirish) esa admin qo'lida.
 */
import { sql } from "../db/index.js";
import { logla } from "./adminlog.js";

export type KerakliNarsa = {
  id: number;
  nom: string;
  emoji: string;
  tartib: number;
  faol: boolean;
  /** "Tugadi" deb belgilangan payt; `null` — uyda bor */
  tugadi: Date | null;
  tugadi_kim: number | null;
  /** Oxirgi marta qachon olib kelingani */
  olindi: Date | null;
  created_at: Date;
};

/** Ism bilan — ro'yxatda "kim aytdi" ko'rinsin. */
export type NarsaToliq = KerakliNarsa & { tugadi_ism: string | null };

/** Nom uzunligi — tugma yozuvi ham, e'lon qatori ham sig'sin. */
export const NOM_MAX = 28;

/** Ro'yxatdagi eng ko'p faol narsa — panel cheksiz uzaymasin. */
export const NARSA_MAX = 20;

const ustunlar = () => sql`
  n.*, u.ism AS tugadi_ism
`;

/** Faol narsalar, ko'rsatish tartibida — kerakliligi birinchi turadi. */
export async function faolNarsalar(): Promise<NarsaToliq[]> {
  return sql<NarsaToliq[]>`
    SELECT ${ustunlar()} FROM kerakli_narsalar n
    LEFT JOIN users u ON u.id = n.tugadi_kim
    WHERE n.faol
    ORDER BY (n.tugadi IS NULL), n.tartib, n.id
  `;
}

/** Admin ko'rinishi uchun — ro'yxatdan chiqarilganlari ham, oxirida. */
export async function barchaNarsalar(): Promise<NarsaToliq[]> {
  return sql<NarsaToliq[]>`
    SELECT ${ustunlar()} FROM kerakli_narsalar n
    LEFT JOIN users u ON u.id = n.tugadi_kim
    ORDER BY n.faol DESC, (n.tugadi IS NULL), n.tartib, n.id
  `;
}

/** Hozir kerak bo'lganlari — yig'im e'loniga aynan shular tushadi. */
export async function keraklilar(): Promise<NarsaToliq[]> {
  return sql<NarsaToliq[]>`
    SELECT ${ustunlar()} FROM kerakli_narsalar n
    LEFT JOIN users u ON u.id = n.tugadi_kim
    WHERE n.faol AND n.tugadi IS NOT NULL
    ORDER BY n.tartib, n.id
  `;
}

export async function narsaniOl(id: number): Promise<NarsaToliq | null> {
  const [n] = await sql<NarsaToliq[]>`
    SELECT ${ustunlar()} FROM kerakli_narsalar n
    LEFT JOIN users u ON u.id = n.tugadi_kim
    WHERE n.id = ${id}
  `;
  return n ?? null;
}

/**
 * "Tugadi" deb belgilaydi. Allaqachon belgilangan bo'lsa BIRINCHI
 * belgilagan odam va vaqti saqlanib qoladi (`tugadi IS NULL` sharti) —
 * keyin bosgan odam birinchisining o'rnini egallab olmasin, adminga esa
 * "kim birinchi aytdi" ko'rinsin.
 *
 * @returns yangilangan qator, yoki allaqachon belgilangan bo'lsa `null`
 */
export async function narsaTugadi(id: number, userId: number): Promise<KerakliNarsa | null> {
  const [n] = await sql<KerakliNarsa[]>`
    UPDATE kerakli_narsalar SET tugadi = now(), tugadi_kim = ${userId}
    WHERE id = ${id} AND faol AND tugadi IS NULL
    RETURNING *
  `;
  return n ?? null;
}

/** Belgini olib tashlaydi ("adashib bosdim" yoki "aslida bor ekan"). */
export async function narsaBor(id: number): Promise<KerakliNarsa | null> {
  const [n] = await sql<KerakliNarsa[]>`
    UPDATE kerakli_narsalar SET tugadi = NULL, tugadi_kim = NULL
    WHERE id = ${id} AND tugadi IS NOT NULL
    RETURNING *
  `;
  return n ?? null;
}

/**
 * "Olib kelindi" — belgilangan narsalarni tozalaydi va olingan vaqtini
 * yozadi. Yig'im yakunlanganda avtomatik, yoki admin qo'lda bosganda.
 *
 * Nima olinganini AYTIB qaytaradi: chaqiruvchi guruhga "shular olindi"
 * deb yozadi, ya'ni ro'yxat jimgina tozalanib qolmaydi.
 */
export async function narsalarOlindi(nomlar?: string[]): Promise<KerakliNarsa[]> {
  // `nomlar` berilsa faqat o'shalar tozalanadi — yig'im yakunlanganda
  // AYNAN o'sha yig'imga biriktirilganlari. Yig'im davomida yangi narsa
  // tugagan bo'lsa u ro'yxatda qolishi kerak, u hali olinmagan.
  const filtr = nomlar && nomlar.length > 0 ? nomlar : null;
  return sql<KerakliNarsa[]>`
    UPDATE kerakli_narsalar
    SET tugadi = NULL, tugadi_kim = NULL, olindi = now()
    WHERE faol AND tugadi IS NOT NULL
      AND (${filtr}::text[] IS NULL OR nom = ANY(${filtr}::text[]))
    RETURNING *
  `;
}

/**
 * Nom matnining boshidagi emojini ajratadi — `core/vazifalar.ts`dagi
 * `emojiAjrat` bilan bir xil, faqat standart emoji boshqa. Ataylab nusxa
 * emas: u yerdagisi navbat vazifasiga (🧹), bu yerdagisi xaridga (🛒)
 * tegishli va ikkalasi mustaqil o'zgarishi mumkin.
 */
export function emojiAjrat(xom: string): { emoji: string; nom: string } {
  const m = xom
    .trim()
    .match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
  const nom = (m?.[2] ?? xom).trim().slice(0, NOM_MAX);
  return { emoji: m?.[1] ?? "🛒", nom: nom || xom.trim().slice(0, NOM_MAX) };
}

export type NarsaQoshishNatija =
  | { ok: true; narsa: KerakliNarsa }
  | { ok: false; sabab: "kop" | "nom" | "bor" };

/**
 * Yangi narsa qo'shadi. Ro'yxatni ADMIN emas, istalgan a'zo to'ldirsin
 * degan qoida ataylab: "bumaga tugadi" deyish uchun admin bo'lish shart
 * emas, aks holda ro'yxat yana bir kishining xotirasiga bog'lanib qolardi.
 * Shu sababli `adminId` — "kim qo'shdi", ruxsat tekshiruvi emas.
 *
 * Yangi narsa DARROV "kerak" holatida tug'iladi: odam uni yozayotgan
 * bo'lsa, demak hozir kerak.
 */
export async function narsaQosh(
  userId: number,
  xomNom: string,
): Promise<NarsaQoshishNatija> {
  const { emoji, nom } = emojiAjrat(xomNom);
  if (nom.length < 2) return { ok: false, sabab: "nom" };

  const [sanoq] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM kerakli_narsalar WHERE faol
  `;
  if ((sanoq?.n ?? 0) >= NARSA_MAX) return { ok: false, sabab: "kop" };

  // Ro'yxatda shu nom bor bo'lsa yangisini yasamaymiz — uni "kerak" deb
  // belgilaymiz. Aks holda "Bumaga" ikki marta turib qolardi.
  const [mavjud] = await sql<KerakliNarsa[]>`
    SELECT * FROM kerakli_narsalar WHERE faol AND lower(nom) = lower(${nom})
  `;
  if (mavjud) {
    await narsaTugadi(mavjud.id, userId);
    return { ok: false, sabab: "bor" };
  }

  const [n] = await sql<KerakliNarsa[]>`
    INSERT INTO kerakli_narsalar (nom, emoji, tartib, tugadi, tugadi_kim)
    VALUES (
      ${nom}, ${emoji},
      COALESCE((SELECT max(tartib) + 1 FROM kerakli_narsalar), 0),
      now(), ${userId}
    )
    RETURNING *
  `;
  if (!n) return { ok: false, sabab: "nom" };

  await logla(userId, "narsa_qoshildi", "narsa", n.id, null, `${n.emoji} ${n.nom}`);
  return { ok: true, narsa: n };
}

export async function narsaNominiOzgartir(
  adminId: number,
  id: number,
  xomNom: string,
): Promise<KerakliNarsa | null> {
  const eski = await narsaniOl(id);
  if (!eski) return null;

  const { emoji, nom } = emojiAjrat(xomNom);
  if (nom.length < 2) return null;

  const [n] = await sql<KerakliNarsa[]>`
    UPDATE kerakli_narsalar SET nom = ${nom}, emoji = ${emoji} WHERE id = ${id} RETURNING *
  `;
  if (!n) return null;

  await logla(adminId, "narsa_nomi", "narsa", id, `${eski.emoji} ${eski.nom}`, `${n.emoji} ${n.nom}`);
  return n;
}

/**
 * Ro'yxatdan chiqaradi / qaytaradi. O'chirish YO'Q — eski yig'imlarning
 * `narsalar` massivi nomga tayanadi, lekin ro'yxatning o'zi ham tarix:
 * "bu uyda nimalar olinardi" degan savolga javob beradi.
 */
export async function narsaFaollikni(
  adminId: number,
  id: number,
  faol: boolean,
): Promise<KerakliNarsa | null> {
  const [n] = await sql<KerakliNarsa[]>`
    UPDATE kerakli_narsalar SET faol = ${faol} WHERE id = ${id} RETURNING *
  `;
  if (!n) return null;

  await logla(adminId, faol ? "narsa_yoqildi" : "narsa_ochirildi", "narsa", id, null, n.nom);
  return n;
}
