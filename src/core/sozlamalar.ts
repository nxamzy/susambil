/**
 * Umumiy sozlamalar — `config.ts`dagi qiymatlar endi faqat STANDART,
 * haqiqiysi `settings` jadvalidan o'qiladi va Admin Panel → "⚙️ Sozlamalar"
 * dan o'zgartiriladi. `core/tolov.ts` talab/karta bilan bir xil naqsh,
 * shunchaki bir joyга yig'ilgan.
 *
 * KESHLANADI: bu qiymatlar deyarli har xabarda o'qiladi (`kerakliTasdiq`),
 * shuning uchun bitta so'rov bilan yig'ib, xotirada saqlaymiz. `Ornat`
 * keshni yangilaydi. Serverless muhitda issiq instansiya keshi biroz
 * eskirishi mumkin, lekin bu qiymatlar navbat/sikl YARATISHDA ishlatilmaydi
 * (`navbatSozlamalari` — o'sha ataylab keshlanmagan), demak eskirgan kesh
 * eng yomoni bitta xabarni bir tasdiq kam/ko'p ko'rsatadi — sikl muddatini
 * buzmaydi.
 */
import { sql } from "../db/index.js";
import { config } from "../config.js";
import { logla } from "./adminlog.js";

export type Sozlamalar = {
  /** Topshiriqni qabul qilish uchun kerakli tasdiqlar soni */
  kerakliTasdiq: number;
  /** Muddatga necha kun qolganda "oxirgi kun" (5 soatlik) eslatma boshlanadi */
  eslatmaKuni: number;
  /** "Oxirgi kun" eslatmasi necha soatda bir qaytariladi */
  eslatmaOraligiSoat: number;
  /** Navbat kechikkan har kun uchun jarima (so'm) — faqat reytingda ko'rsatiladi */
  jarimaKunlik: number;
  /** Kvartira puli oyning shu kunигача yig'ilishi kerak (odatda 15) */
  tolovMuddatKuni: number;
  /** To'lov eslatmasi muddatga necha kun qolganda boshlanadi */
  tolovEslatmaKuni: number;
};

/**
 * `settings` kaliti → `Sozlamalar` maydoni + standart qiymati + ruxsat
 * etilgan oraliq. Admin pickeri ham shu ro'yxatdan quriladi (bir joyda).
 */
export const SOZLAMA_TAVSIF = {
  kerakli_tasdiq: {
    maydon: "kerakliTasdiq",
    nom: "Kerakli tasdiqlar",
    izoh: "Topshiriqni qabul qilish uchun necha kishi ✅ bosishi kerak",
    standart: config.kerakliTasdiq,
    min: 1,
    max: 6,
  },
  eslatma_kuni: {
    maydon: "eslatmaKuni",
    nom: "Oxirgi kun oynasi",
    izoh: "Muddatga necha kun qolganda 5 soatlik eslatma boshlanadi",
    standart: config.eslatmaKuni,
    min: 1,
    max: 5,
  },
  eslatma_oraligi_soat: {
    maydon: "eslatmaOraligiSoat",
    nom: "Eslatma chastotasi",
    izoh: "Navbat eslatmasi necha soatda bir qaytariladi",
    standart: config.eslatmaOraligiSoat,
    min: 1,
    max: 24,
  },
  jarima_kunlik: {
    maydon: "jarimaKunlik",
    nom: "Kunlik jarima (so'm)",
    izoh: "Navbat kechikkan har kun uchun — faqat reytingda ko'rsatiladi",
    standart: config.jarimaKunlik,
    min: 0,
    max: 100_000,
  },
  tolov_muddat_kuni: {
    maydon: "tolovMuddatKuni",
    nom: "To'lov muddati (oyning kuni)",
    izoh: "Kvartira puli oyning shu kunигача yig'ilishi kerak. Faqat KELGUSI oylarga",
    standart: config.tolovMuddatKuni,
    min: 1,
    max: 28,
  },
  tolov_eslatma_kuni: {
    maydon: "tolovEslatmaKuni",
    nom: "To'lov eslatmasi",
    izoh: "To'lov eslatmasi muddatga necha kun qolganda boshlanadi",
    standart: config.tolovEslatmaKuni,
    min: 1,
    max: 10,
  },
} as const;

export type SozlamaKalit = keyof typeof SOZLAMA_TAVSIF;

/** Admin picker qiymatlari — oraliq katta bo'lsa presetlar, kichik bo'lsa hammasi. */
export const SOZLAMA_VARIANT: Record<SozlamaKalit, number[]> = {
  kerakli_tasdiq: [1, 2, 3, 4, 5, 6],
  eslatma_kuni: [1, 2, 3, 4, 5],
  eslatma_oraligi_soat: [1, 2, 3, 4, 5, 6, 8, 12, 24],
  jarima_kunlik: [0, 5_000, 10_000, 15_000, 20_000, 30_000, 50_000],
  tolov_muddat_kuni: [5, 10, 12, 15, 18, 20, 25, 28],
  tolov_eslatma_kuni: [1, 2, 3, 4, 5, 7, 10],
};

let kesh: Sozlamalar | undefined;

function xomdanQiymat(kalit: SozlamaKalit, xom: string | undefined): number {
  const t = SOZLAMA_TAVSIF[kalit];
  const n = Number(xom);
  if (!Number.isFinite(n)) return t.standart;
  return Math.min(t.max, Math.max(t.min, Math.round(n)));
}

/** Barcha umumiy sozlamalar — keshdan yoki bitta so'rov bilan bazadan. */
export async function sozlamalarOl(): Promise<Sozlamalar> {
  if (kesh) return kesh;

  const kalitlar = Object.keys(SOZLAMA_TAVSIF) as SozlamaKalit[];
  const rows = await sql<{ kalit: string; qiymat: string }[]>`
    SELECT kalit, qiymat FROM settings WHERE kalit IN ${sql(kalitlar)}
  `;
  const map = new Map(rows.map((r) => [r.kalit, r.qiymat]));

  const natija = {} as Sozlamalar;
  for (const kalit of kalitlar) {
    const t = SOZLAMA_TAVSIF[kalit];
    (natija as Record<string, number>)[t.maydon] = xomdanQiymat(kalit, map.get(kalit));
  }
  kesh = natija;
  return kesh;
}

/**
 * Bitta sozlamani o'rnatadi. Chegaradan tashqarida bo'lsa qisiladi (bazadagi
 * qiymat har doim to'g'ri oraliqda bo'lishi kafolatlanadi).
 */
export async function sozlamaOrnat(
  adminId: number,
  kalit: SozlamaKalit,
  xomQiymat: number,
): Promise<number> {
  const t = SOZLAMA_TAVSIF[kalit];
  const eski = (await sozlamalarOl())[t.maydon];
  const yangi = Math.min(t.max, Math.max(t.min, Math.round(xomQiymat)));

  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES (${kalit}, ${String(yangi)})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
  await logla(adminId, `sozlama_${kalit}`, "sozlama", null, String(eski), String(yangi));

  kesh = undefined; // keyingi o'qishda bazadan qayta yig'iladi
  return yangi;
}
