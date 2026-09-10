/**
 * Navbat vazifalari — "🧹 Mening Navbatim" panelidagi MAJBURIY ishlar.
 *
 * Ilgari bu ro'yxat `config.ts` ichida literal union edi
 * (`NAVBAT_ISHLARI`/`NAVBAT_RASM_SONI`), ya'ni uyda ikkinchi hammom paydo
 * bo'lsa kod tahriri va deploy kerak bo'lardi. Endi bazada
 * (`navbat_vazifalari`) va admin panelidan boshqariladi — `core/tolov.ts`
 * talab/karta sozlamalarini `settings`ga ko'chirgani bilan bir xil naqsh.
 *
 * IKKI QOIDA, ikkalasi ham "tarix yo'qolmaydi" falsafasidan:
 *
 *   1) `kod` yaratilgach HECH QACHON o'zgarmaydi. U — `turns.ishlar` JSONB
 *      kaliti: nomini "Hammom" dan "1-hammom" ga o'zgartirsa ham, o'sha
 *      navbatda allaqachon tashlangan rasmlar joyida qoladi.
 *
 *   2) Vazifa O'CHIRILMAYDI, faqat `faol = false` bo'ladi. O'chirilsa
 *      eski navbatlardagi `ishlar` kalitlari nimaga tegishli ekani
 *      bilinmay qolardi (`chores`/`expenses`dagi soft-delete bilan bir xil).
 *
 * Har bir yozuvchi amal `core/adminlog.ts` orqali jurnalga tushadi —
 * ataylab shu yerda, chaqiruvchida emas, `core/users.ts` bilan bir xil:
 * shunda birorta chaqiruvchi buni "unutib qoldirishi" mumkin emas.
 */
import { sql } from "../db/index.js";
import { logla } from "./adminlog.js";

export type NavbatVazifasi = {
  id: number;
  /** `turns.ishlar` JSONB kaliti va tugma callback'i — o'zgarmas */
  kod: string;
  nom: string;
  emoji: string;
  /** MINIMUM: shuncha rasm kelgach vazifa bajarilgan hisoblanadi */
  rasm_soni: number;
  tartib: number;
  faol: boolean;
};

/** Nom uzunligi chegarasi — tugma yozuvi ham, panel qatori ham sig'sin. */
export const NOM_MAX = 24;

/**
 * `kod` uzunligi chegarasi. Telegram callback_data 64 baytdan oshmasligi
 * kerak, eng uzun ko'rinishi `navbat_ish:<turnId>:<kod>` — turn id o'sib
 * borsa ham 24 belgilik kod xavfsiz zaxira qoldiradi.
 */
const KOD_MAX = 24;

/** Vazifa ro'yxatida ko'rinadigan eng ko'p vazifa — panel cheksiz uzaymasin. */
export const VAZIFA_MAX = 12;

/** Faol vazifalar, ko'rsatish tartibida. Panel/tugma/matn hammasi shundan. */
export async function faolVazifalar(): Promise<NavbatVazifasi[]> {
  return sql<NavbatVazifasi[]>`
    SELECT * FROM navbat_vazifalari WHERE faol ORDER BY tartib, id
  `;
}

/** Admin ko'rinishi uchun — nofaollari ham, ro'yxat oxirida. */
export async function barchaVazifalar(): Promise<NavbatVazifasi[]> {
  return sql<NavbatVazifasi[]>`
    SELECT * FROM navbat_vazifalari ORDER BY faol DESC, tartib, id
  `;
}

export async function vazifaOl(id: number): Promise<NavbatVazifasi | null> {
  const [v] = await sql<NavbatVazifasi[]>`SELECT * FROM navbat_vazifalari WHERE id = ${id}`;
  return v ?? null;
}

/**
 * Kod bo'yicha topadi. Faqat FAOL vazifa qaytadi: nofaollashtirilgan
 * vazifaning eski tugmasi chatda osilib qolgan bo'lsa ham unga yangi rasm
 * tushmasligi kerak.
 */
export async function faolVazifaKodBoyicha(kod: string): Promise<NavbatVazifasi | null> {
  const [v] = await sql<NavbatVazifasi[]>`
    SELECT * FROM navbat_vazifalari WHERE kod = ${kod} AND faol
  `;
  return v ?? null;
}

/**
 * Nomdan barqaror kod yasaydi. O'zbek lotinchasi allaqachon ASCII
 * (`o'`/`g'` apostrofi tashlanadi), boshqa alifbo tushib qolsa `vazifa`
 * qolib ketadi — takrorlanish `kodBand` bilan hal qilinadi.
 */
function kodYasa(nom: string): string {
  const toza = nom
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, KOD_MAX - 3);
  return toza || "vazifa";
}

/** Band bo'lsa `_2`, `_3` ... qo'shib boradi. Nofaollari ham band sanaladi. */
async function bandBolmaganKod(asos: string): Promise<string> {
  const olingan = await sql<{ kod: string }[]>`
    SELECT kod FROM navbat_vazifalari WHERE kod = ${asos} OR kod LIKE ${asos + "\\_%"}
  `;
  const band = new Set(olingan.map((r) => r.kod));
  if (!band.has(asos)) return asos;
  for (let i = 2; i < 100; i++) {
    const nomzod = `${asos}_${i}`;
    if (!band.has(nomzod)) return nomzod;
  }
  // Amalda yetib bo'lmaydigan holat, lekin `kod` UNIQUE bo'lgani uchun
  // "hech qachon" degan taxminga tayanmaymiz.
  return `${asos}_${Date.now().toString(36).slice(-4)}`;
}

/**
 * Nom matnining boshidagi emojini ajratib oladi — admin "🚿 Katta hammom"
 * deb yozsa alohida "emoji tanlang" qadami kerak bo'lmaydi. Emoji
 * yozilmasa standart 🧹 qoladi.
 */
export function emojiAjrat(xom: string): { emoji: string; nom: string } {
  const m = xom
    .trim()
    .match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
  const nom = (m?.[2] ?? xom).trim().slice(0, NOM_MAX);
  return { emoji: m?.[1] ?? "🧹", nom: nom || xom.trim().slice(0, NOM_MAX) };
}

export type QoshishNatija =
  | { ok: true; vazifa: NavbatVazifasi }
  | { ok: false; sabab: "kop" | "nom" };

/**
 * Yangi vazifa qo'shadi — masalan ikkinchi hammom. `tartib` ro'yxat
 * oxiriga qo'yiladi; admin keyin ⬆️/⬇️ bilan ko'chiradi.
 */
export async function vazifaQoshish(
  adminId: number,
  xomNom: string,
  rasmSoni = 1,
): Promise<QoshishNatija> {
  const { emoji, nom } = emojiAjrat(xomNom);
  if (nom.length < 2) return { ok: false, sabab: "nom" };

  const [sanoq] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM navbat_vazifalari WHERE faol
  `;
  if ((sanoq?.n ?? 0) >= VAZIFA_MAX) return { ok: false, sabab: "kop" };

  const kod = await bandBolmaganKod(kodYasa(nom));
  const [v] = await sql<NavbatVazifasi[]>`
    INSERT INTO navbat_vazifalari (kod, nom, emoji, rasm_soni, tartib)
    VALUES (
      ${kod}, ${nom}, ${emoji}, ${chegarala(rasmSoni)},
      COALESCE((SELECT max(tartib) + 1 FROM navbat_vazifalari), 0)
    )
    RETURNING *
  `;
  if (!v) return { ok: false, sabab: "nom" };

  await logla(adminId, "vazifa_qoshildi", "vazifa", v.id, null, `${v.emoji} ${v.nom} · ${v.rasm_soni} rasm`);
  return { ok: true, vazifa: v };
}

/** Rasm soni har doim 1..RASM_MAX oralig'ida (CHECK bilan ham qo'llanadi). */
function chegarala(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)));
}

/**
 * Nomni (va boshida emoji bo'lsa emojini) o'zgartiradi. `kod` ATAYLAB
 * tegilmaydi — yuqoridagi 1-qoida.
 */
export async function vazifaNominiOzgartir(
  adminId: number,
  id: number,
  xomNom: string,
): Promise<NavbatVazifasi | null> {
  const eski = await vazifaOl(id);
  if (!eski) return null;

  const { emoji, nom } = emojiAjrat(xomNom);
  if (nom.length < 2) return null;

  const [v] = await sql<NavbatVazifasi[]>`
    UPDATE navbat_vazifalari SET nom = ${nom}, emoji = ${emoji} WHERE id = ${id} RETURNING *
  `;
  if (!v) return null;

  await logla(adminId, "vazifa_nomi", "vazifa", id, `${eski.emoji} ${eski.nom}`, `${v.emoji} ${v.nom}`);
  return v;
}

export async function vazifaRasmSoniniOrnat(
  adminId: number,
  id: number,
  soni: number,
): Promise<NavbatVazifasi | null> {
  const eski = await vazifaOl(id);
  if (!eski) return null;

  const [v] = await sql<NavbatVazifasi[]>`
    UPDATE navbat_vazifalari SET rasm_soni = ${chegarala(soni)} WHERE id = ${id} RETURNING *
  `;
  if (!v) return null;

  await logla(adminId, "vazifa_rasm_soni", "vazifa", id, String(eski.rasm_soni), String(v.rasm_soni));
  return v;
}

/**
 * Faollikni almashtiradi. O'chirish o'rniga shu — nofaol vazifa panelda
 * ko'rinmaydi, yakunlash uchun ham talab qilinmaydi, lekin eski
 * navbatlardagi rasmlari o'z kaliti ostida qolaveradi.
 */
export async function vazifaFaollikni(
  adminId: number,
  id: number,
  faol: boolean,
): Promise<NavbatVazifasi | null> {
  const [v] = await sql<NavbatVazifasi[]>`
    UPDATE navbat_vazifalari SET faol = ${faol} WHERE id = ${id} RETURNING *
  `;
  if (!v) return null;

  await logla(adminId, faol ? "vazifa_yoqildi" : "vazifa_ochirildi", "vazifa", id, null, v.nom);
  return v;
}

/**
 * Ro'yxatda bir pog'ona yuqori/pastga ko'chiradi — qo'shni bilan `tartib`
 * almashadi. Bitta tranzaksiyada, chunki oraliq holatda ikki vazifa bir xil
 * tartibda qolib ketishi mumkin.
 */
export async function vazifaKochir(
  adminId: number,
  id: number,
  yonalish: "yuqori" | "past",
): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [v] = await tx<NavbatVazifasi[]>`
      SELECT * FROM navbat_vazifalari WHERE id = ${id} FOR UPDATE
    `;
    if (!v) return false;

    const [qoshni] = yonalish === "yuqori"
      ? await tx<NavbatVazifasi[]>`
          SELECT * FROM navbat_vazifalari
          WHERE faol AND (tartib, id) < (${v.tartib}, ${v.id})
          ORDER BY tartib DESC, id DESC LIMIT 1 FOR UPDATE
        `
      : await tx<NavbatVazifasi[]>`
          SELECT * FROM navbat_vazifalari
          WHERE faol AND (tartib, id) > (${v.tartib}, ${v.id})
          ORDER BY tartib, id LIMIT 1 FOR UPDATE
        `;
    if (!qoshni) return false;

    // Ikkalasi bir xil `tartib`da bo'lsa (seed yoki eski qatorlar) almashish
    // hech nimani o'zgartirmasdi — shuning uchun aniq farqli qiymat beramiz.
    const [a, b] = v.tartib === qoshni.tartib
      ? yonalish === "yuqori"
        ? [qoshni.tartib - 1, qoshni.tartib]
        : [qoshni.tartib + 1, qoshni.tartib]
      : [qoshni.tartib, v.tartib];

    await tx`UPDATE navbat_vazifalari SET tartib = ${a} WHERE id = ${v.id}`;
    await tx`UPDATE navbat_vazifalari SET tartib = ${b} WHERE id = ${qoshni.id}`;

    await logla(adminId, "vazifa_tartibi", "vazifa", id, String(v.tartib), String(a));
    return true;
  });
}
