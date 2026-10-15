/**
 * KUNLIK MUSOR NAVBATI — har kuni BITTA odam, tasodifiy, tasdiqsiz.
 *
 * NEGA YANGI TIZIM (xona navbati emas): xona navbatidagi musor vazifasi
 * "5 kunlik navbat × 3 rasm × boshqa xonalardan 3 tasdiq" edi. Musor idishi
 * esa har kuni to'ladi, uni xona emas bitta ODAM tashlaydi va boshqalarning
 * tasdig'i hech kimga kerak emas — tasdiq kutish navbatni kunlab osib
 * qo'yardi (`jobs/reminders.ts` `tasdiqEslatmalari` shundan tug'ilgan).
 *
 * Qoidalar (uyning talabi, shu tartibda):
 *  1. Har kuni ertalab (`MUSOR_ERTALAB_SOAT`) bitta odam TASODIFIY tanlanadi.
 *  2. Unga shaxsiy xabar boradi, guruhga "bugun kim" e'lon qilinadi.
 *     "Qilaman" deyish shart emas — navbat o'zi tushadi.
 *  3. O'sha odamga kun davomida IKKI marta eslatiladi (faqat unga).
 *  4. U "✅ Tashladim" bosishi SHART. Boshqalarning tasdig'i kerak emas;
 *     rasm yuborsa bo'ladi, majburiy emas.
 *  5. Bosmagan kun "o'tkazildi" deb SANALIB boriladi (baho yoki jarima
 *     emas — faqat hisob, xuddi `core/faollik.ts` kabi).
 *
 * "Tasodifiy" lekin adolatli: hamma faol a'zo bir martadan navbat
 * olmaguncha raund (`sikl`) tugamaydi, ya'ni kimdir ketma-ket uch kun,
 * boshqasi bir oy tushmay qolmaydi (`musorchiTanla`).
 *
 * Eslatma `jobs/reminders.ts` ichida, qolganlari bilan bir xil intizomda:
 * "hozir kerakmi" HOLATDAN qayta hisoblanadi (`eslatma_soni`,
 * `oxirgi_eslatma`), bir martalik bayroq yo'q — `eslatmalarniTekshir` kuniga
 * ko'p marta, bir vaqtda bir necha joydan chaqiriladi.
 */
import { randomInt } from "node:crypto";
import { sql } from "../db/index.js";
import { MUSOR_ERTALAB_SOAT, MUSOR_ESLATMA_ORALIQ_SOAT, MUSOR_ESLATMA_SOATLARI } from "../config.js";
import { bugungiSana, kunQosh, toshkentSoat } from "./vaqt.js";
import { faollikYoz } from "./faollik.js";

export type MusorHolati = "kutilmoqda" | "bajarildi" | "otkazildi";

export type MusorKuni = {
  id: number;
  /** `YYYY-MM-DD` — Toshkent kalendari (`core/vaqt.ts` intizomi: MATN). */
  sana: string;
  user_id: number;
  sikl: number;
  holat: MusorHolati;
  bajarildi_ts: Date | null;
  rasm_id: string | null;
  guruh_msg_id: number | null;
  elon_ts: Date | null;
  eslatma_soni: number;
  oxirgi_eslatma: Date | null;
  oxirgi_signal: Date | null;
};

/** Qator + navbatchining ismi va Telegram id'si (xabar yuborish uchun). */
export type MusorKuniToliq = MusorKuni & { ism: string; telegram_id: string | null };

// Qayta ishlatiladigan SQL bo'lagi FUNKSIYA — postgres.js Query obyektini
// fragment sifatida ichiga qo'yganda uni o'zgartiradi (CLAUDE.md).
const ustunlar = () => sql`
  m.id, to_char(m.sana, 'YYYY-MM-DD') AS sana, m.user_id, m.sikl, m.holat,
  m.bajarildi_ts, m.rasm_id, m.guruh_msg_id, m.elon_ts, m.eslatma_soni,
  m.oxirgi_eslatma, m.oxirgi_signal, u.ism, u.telegram_id
`;

// ---------------------------------------------------------------------------
// TANLASH — sof funksiya
// ---------------------------------------------------------------------------

export type MusorchiTanlovi = { userId: number; sikl: number };

/**
 * Bugungi navbatchini tanlaydi.
 *
 * Raund (`sikl`) ichida kimdir navbat olgan bo'lsa u qolganlar olmaguncha
 * qaytib tushmaydi; hamma olib bo'lgach yangi raund boshlanadi. Yangi
 * raundning birinchi kunida KECHAGI odam tushmaydi (bittadan ortiq nomzod
 * bo'lsa) — aks holda raund chegarasida ketma-ket ikki kun bir odamga
 * tushib qolishi mumkin edi.
 *
 * Yangi qo'shilgan a'zo raund o'rtasida ham darrov nomzod: unga hali
 * navbat tushmagan. Ketgan (nofaol) a'zo `nomzodlar`da yo'q, ya'ni raundni
 * kutib to'xtatib turmaydi.
 *
 * Sof funksiya: tasodif tashqaridan beriladi, shuning uchun bazasiz va
 * aniq (deterministik) sinaladi.
 */
export function musorchiTanla(p: {
  nomzodlar: readonly number[];
  joriySikl: number;
  siklOdamlari: readonly number[];
  oxirgi: number | null;
  tasodif?: (n: number) => number;
}): MusorchiTanlovi | null {
  if (p.nomzodlar.length === 0) return null;
  const tasodif = p.tasodif ?? ((n: number) => randomInt(n));

  const olgan = new Set(p.siklOdamlari);
  let sikl = p.joriySikl;
  let ichida = p.nomzodlar.filter((id) => !olgan.has(id));

  if (ichida.length === 0) {
    sikl += 1;
    ichida = [...p.nomzodlar];
  }

  if (ichida.length > 1 && p.oxirgi !== null) {
    const boshqalar = ichida.filter((id) => id !== p.oxirgi);
    if (boshqalar.length > 0) ichida = boshqalar;
  }

  const tanlangan = ichida[tasodif(ichida.length)];
  return tanlangan === undefined ? null : { userId: tanlangan, sikl };
}

/**
 * Odamga hozir QAYSI eslatma (1 yoki 2) ketishi kerakligi, kerak bo'lmasa
 * `null`. Sof funksiya.
 *
 *  - faqat bugungi, hali bajarilmagan va e'loni yetkazilgan kun uchun;
 *  - eslatma soatiga (`MUSOR_ESLATMA_SOATLARI`) yetgan bo'lishi kerak;
 *  - e'lon yoki oldingi eslatmadan `oraliqSoat` o'tgan bo'lishi kerak —
 *    bot kech yoqilsa ikkala eslatma bir daqiqada kelib qolmasin.
 */
export function musorEslatmasiKerakmi(p: {
  holat: MusorHolati;
  sana: string;
  bugun: string;
  soat: number;
  eslatmaSoni: number;
  elonTs: number | null;
  oxirgiEslatma: number | null;
  hozir: number;
  soatlar?: readonly number[];
  oraliqSoat?: number;
}): number | null {
  if (p.holat !== "kutilmoqda" || p.sana !== p.bugun) return null;
  if (p.elonTs === null) return null;

  const soatlar = p.soatlar ?? MUSOR_ESLATMA_SOATLARI;
  const keyingi = soatlar[p.eslatmaSoni];
  if (keyingi === undefined) return null;
  if (p.soat < keyingi) return null;

  const oraliq = (p.oraliqSoat ?? MUSOR_ESLATMA_ORALIQ_SOAT) * 3_600_000;
  const oxirgi = Math.max(p.elonTs, p.oxirgiEslatma ?? 0);
  if (p.hozir - oxirgi < oraliq) return null;

  return p.eslatmaSoni + 1;
}

// ---------------------------------------------------------------------------
// O'QISH
// ---------------------------------------------------------------------------

export async function musorniOl(id: number): Promise<MusorKuniToliq | null> {
  const [k] = await sql<MusorKuniToliq[]>`
    SELECT ${ustunlar()} FROM musor_kunlari m JOIN users u ON u.id = m.user_id
    WHERE m.id = ${id}
  `;
  return k ?? null;
}

/** Berilgan kunning navbatchisi (`YYYY-MM-DD`) — yo'q bo'lsa `null`. */
export async function kunniOl(sana: string): Promise<MusorKuniToliq | null> {
  const [k] = await sql<MusorKuniToliq[]>`
    SELECT ${ustunlar()} FROM musor_kunlari m JOIN users u ON u.id = m.user_id
    WHERE m.sana = ${sana}::date
  `;
  return k ?? null;
}

// ---------------------------------------------------------------------------
// TAYINLASH
// ---------------------------------------------------------------------------

export type BugungiMusor = {
  kun: MusorKuniToliq;
  /** Aynan kechagi kun, faqat o'tkazib yuborilgan bo'lsa (e'longa qator qo'shiladi). */
  kechaOtkazilgan: MusorKuniToliq | null;
};

/**
 * Bugungi navbatchi — bo'lmasa tayinlaydi. Ertalabgacha (`MUSOR_ERTALAB_SOAT`)
 * HECH NARSA qilmaydi: kechagi kun o'shanda ham ochiq turadi, ya'ni
 * yarim tundan keyin "Tashladim" bosgan odam o'tkazib yuborgan hisoblanmaydi.
 *
 * Parallel chaqiruvlardan xavfsiz: kun kaliti UNIQUE (`sana`), yutqazgan
 * chaqiruv `ON CONFLICT DO NOTHING` dan keyin g'olibning qatorini o'qiydi.
 *
 * Bosilmagan o'tgan kunlar AYNAN yangi navbatchi tayinlanayotganda
 * "o'tkazildi" ga o'tadi: kun chegarasi — yangi e'lon.
 */
export async function bugungiMusorniTayinla(hozir: Date = new Date()): Promise<BugungiMusor | null> {
  if (toshkentSoat(hozir) < MUSOR_ERTALAB_SOAT) return null;

  const bugun = bugungiSana(hozir);
  const mavjud = await kunniOl(bugun);
  // Kechagi qator faqat e'longa kerak — e'lon ketib bo'lgan bo'lsa ortiqcha so'rov yo'q
  // (bu funksiya har Telegram yangilanishida chaqiriladi).
  if (mavjud) return { kun: mavjud, kechaOtkazilgan: mavjud.elon_ts ? null : await kechaOtkazilgan(bugun) };

  await sql`
    UPDATE musor_kunlari SET holat = 'otkazildi'
    WHERE holat = 'kutilmoqda' AND sana < ${bugun}::date
  `;

  const nomzodlar = await sql<{ id: number }[]>`
    SELECT id FROM users WHERE faol AND telegram_id IS NOT NULL ORDER BY id
  `;
  const [raund] = await sql<{ sikl: number }[]>`
    SELECT COALESCE(MAX(sikl), 1)::int AS sikl FROM musor_kunlari
  `;
  const joriySikl = raund?.sikl ?? 1;
  const olganlar = await sql<{ user_id: number }[]>`
    SELECT user_id FROM musor_kunlari WHERE sikl = ${joriySikl}
  `;
  const [oxirgi] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM musor_kunlari ORDER BY sana DESC LIMIT 1
  `;

  const tanlov = musorchiTanla({
    nomzodlar: nomzodlar.map((n) => n.id),
    joriySikl,
    siklOdamlari: olganlar.map((o) => o.user_id),
    oxirgi: oxirgi?.user_id ?? null,
  });
  if (!tanlov) return null; // hali hech kim botga ulanmagan

  await sql`
    INSERT INTO musor_kunlari (sana, user_id, sikl)
    VALUES (${bugun}::date, ${tanlov.userId}, ${tanlov.sikl})
    ON CONFLICT (sana) DO NOTHING
  `;

  const kun = await kunniOl(bugun);
  return kun ? { kun, kechaOtkazilgan: await kechaOtkazilgan(bugun) } : null;
}

async function kechaOtkazilgan(bugun: string): Promise<MusorKuniToliq | null> {
  const kecha = await kunniOl(kunQosh(bugun, -1));
  return kecha && kecha.holat === "otkazildi" ? kecha : null;
}

// ---------------------------------------------------------------------------
// E'LON VA ESLATMA — egallash (parallel chaqiruv ikki marta yubormasin)
// ---------------------------------------------------------------------------

/**
 * E'lonni yuborish huquqini oladi. `eslatmalarniTekshir` har Telegram
 * yangilanishida ham chaqiriladi (`api/webhook.ts`), ya'ni ikkita chaqiruv
 * bir soniyada e'lonni ikki marta yuborishi mumkin edi. Egallash 2 daqiqa
 * yashaydi: yuboruvchi yiqilib qolsa keyingi chaqiruv qayta urinadi.
 */
export async function elonniEgalla(id: number): Promise<boolean> {
  const r = await sql<{ id: number }[]>`
    UPDATE musor_kunlari SET elon_olindi = now()
    WHERE id = ${id} AND elon_ts IS NULL
      AND (elon_olindi IS NULL OR elon_olindi < now() - interval '2 minutes')
    RETURNING id
  `;
  return r.length > 0;
}

/** E'lon kamida bir joyga (guruh yoki shaxsiy) yetkazildi. */
export async function elonYetdi(id: number, guruhMsgId: number | null): Promise<void> {
  await sql`
    UPDATE musor_kunlari SET elon_ts = now(), guruh_msg_id = ${guruhMsgId}
    WHERE id = ${id}
  `;
}

/** Hech yerga yetmadi — egallashni bo'shatamiz, keyingi chaqiruv qayta urinadi. */
export async function elonniQaytar(id: number): Promise<void> {
  await sql`UPDATE musor_kunlari SET elon_olindi = NULL WHERE id = ${id} AND elon_ts IS NULL`;
}

/**
 * Eslatmani "yuborilyapti" deb belgilaydi. Taqqoslash-va-almashtirish
 * (`eslatma_soni = eski`): ikki chaqiruv bir vaqtda kelsa faqat biri
 * o'tadi, odamga bitta DM ketadi. Yetkazilmasa `eslatmaniQaytar`.
 */
export async function eslatmaniEgalla(id: number, eskiSoni: number): Promise<boolean> {
  const r = await sql<{ id: number }[]>`
    UPDATE musor_kunlari
    SET eslatma_soni = eslatma_soni + 1, oxirgi_eslatma = now()
    WHERE id = ${id} AND eslatma_soni = ${eskiSoni} AND holat = 'kutilmoqda'
    RETURNING id
  `;
  return r.length > 0;
}

export async function eslatmaniQaytar(id: number, eskiSoni: number, eskiOxirgi: Date | null): Promise<void> {
  await sql`
    UPDATE musor_kunlari SET eslatma_soni = ${eskiSoni}, oxirgi_eslatma = ${eskiOxirgi}
    WHERE id = ${id} AND eslatma_soni = ${eskiSoni + 1}
  `;
}

/**
 * "🗑 Musor to'ldi" turtkisi — navbatchiga ko'pi bilan `oraliqSoat`da bir
 * marta. Bir necha kishi ketma-ket bossa ham bitta odam DM bilan
 * bosib ketilmaydi.
 */
export async function turtkiniEgalla(id: number, oraliqSoat: number): Promise<boolean> {
  const r = await sql<{ id: number }[]>`
    UPDATE musor_kunlari SET oxirgi_signal = now()
    WHERE id = ${id} AND holat = 'kutilmoqda'
      AND (oxirgi_signal IS NULL OR oxirgi_signal < now() - (${oraliqSoat} || ' hours')::interval)
    RETURNING id
  `;
  return r.length > 0;
}

// ---------------------------------------------------------------------------
// BAJARISH
// ---------------------------------------------------------------------------

export type BajarishNatija =
  | { ok: true; kun: MusorKuniToliq }
  | { ok: false; sabab: "topilmadi" | "boshqa_odam" | "allaqachon" | "otkazildi" };

/**
 * Navbatchi "✅ Tashladim" bosdi. Faqat O'ZINING kuni va faqat hali
 * ochiq bo'lsa; boshqa hech kimning tasdig'i kerak emas.
 *
 * Kun "otkazildi" ga o'tgach (keyingi e'lon) bosilsa rad etiladi — hisob
 * bir marta yopilgach orqaga o'zgarmaydi.
 */
export async function musorniBajar(id: number, userId: number, rasmId: string | null = null): Promise<BajarishNatija> {
  const k = await musorniOl(id);
  if (!k) return { ok: false, sabab: "topilmadi" };
  if (k.user_id !== userId) return { ok: false, sabab: "boshqa_odam" };
  if (k.holat === "bajarildi") return { ok: false, sabab: "allaqachon" };
  if (k.holat === "otkazildi") return { ok: false, sabab: "otkazildi" };

  const [r] = await sql<{ id: number }[]>`
    UPDATE musor_kunlari
    SET holat = 'bajarildi', bajarildi_ts = now(), rasm_id = COALESCE(${rasmId}, rasm_id)
    WHERE id = ${id} AND user_id = ${userId} AND holat = 'kutilmoqda'
    RETURNING id
  `;
  if (!r) return { ok: false, sabab: "allaqachon" }; // poyga: boshqa chaqiruv oldi

  await faollikYoz(userId, "musor");
  const yangi = await musorniOl(id);
  return yangi ? { ok: true, kun: yangi } : { ok: false, sabab: "topilmadi" };
}

/** Tugma bosilgach rasm kelsa, u shu muddat ichida o'sha kunga biriktiriladi. */
export const RASM_QOSHISH_DAQIQA = 30;

export type MusorRasmNatija = { kun: MusorKuniToliq; yangiBajarildi: boolean };

/**
 * Rasm keldi. Ikki holat, ikkalasi ham bitta qadam:
 *  - odamning ochiq kuni bor → rasm bilan BAJARILADI ("rasm tashlasam
 *    bo'ldi" — tugma bosish shart emas);
 *  - yaqinda tugma bilan bajargan va rasmi yo'q → rasm shu kunga qo'shiladi.
 * Hech biri bo'lmasa `null` — rasm hech nimaga bog'lanmaydi.
 */
export async function musorRasmiKeldi(userId: number, rasmId: string): Promise<MusorRasmNatija | null> {
  const [nomzod] = await sql<{ id: number; holat: MusorHolati }[]>`
    SELECT id, holat FROM musor_kunlari
    WHERE user_id = ${userId}
      AND (holat = 'kutilmoqda'
           OR (holat = 'bajarildi' AND rasm_id IS NULL
               AND bajarildi_ts > now() - (${RASM_QOSHISH_DAQIQA} || ' minutes')::interval))
    ORDER BY sana DESC
    LIMIT 1
  `;
  if (!nomzod) return null;

  if (nomzod.holat === "kutilmoqda") {
    const n = await musorniBajar(nomzod.id, userId, rasmId);
    return n.ok ? { kun: n.kun, yangiBajarildi: true } : null;
  }

  const [r] = await sql<{ id: number }[]>`
    UPDATE musor_kunlari SET rasm_id = ${rasmId}
    WHERE id = ${nomzod.id} AND user_id = ${userId} AND holat = 'bajarildi' AND rasm_id IS NULL
    RETURNING id
  `;
  if (!r) return null;
  const kun = await musorniOl(nomzod.id);
  return kun ? { kun, yangiBajarildi: false } : null;
}

// ---------------------------------------------------------------------------
// HISOB — kim necha marta tushgan, tashlagan, o'tkazgan
// ---------------------------------------------------------------------------

export type MusorHisobi = {
  userId: number;
  ism: string;
  /** Navbat tushgan kunlar jami (bugungi ochiq kun ham) */
  tushgan: number;
  tashlagan: number;
  otkazgan: number;
};

/**
 * Har faol a'zo uchun hisob. REYTING EMAS: ball, o'rin, medal yo'q va
 * tartib ATAYLAB ism bo'yicha — "kim eng ko'p o'tkazdi" jadvali emas, shunchaki
 * sanoq (`core/faollik.ts` bilan bir xil falsafa). Hammasi qatorlardan
 * qayta hisoblanadi, `users` da agregat ustun yo'q.
 */
export async function musorHisobi(): Promise<MusorHisobi[]> {
  const rows = await sql<{ user_id: number; ism: string; tushgan: number; tashlagan: number; otkazgan: number }[]>`
    SELECT u.id AS user_id, u.ism,
           count(m.id)::int AS tushgan,
           count(m.id) FILTER (WHERE m.holat = 'bajarildi')::int AS tashlagan,
           count(m.id) FILTER (WHERE m.holat = 'otkazildi')::int AS otkazgan
    FROM users u
    LEFT JOIN musor_kunlari m ON m.user_id = u.id
    WHERE u.faol
    GROUP BY u.id, u.ism
    ORDER BY u.ism
  `;
  return rows.map((r) => ({
    userId: r.user_id,
    ism: r.ism,
    tushgan: r.tushgan,
    tashlagan: r.tashlagan,
    otkazgan: r.otkazgan,
  }));
}
