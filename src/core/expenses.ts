/**
 * Xarajat daftari. Qatorlar bu yerga faqat guruh tasdig'idan keyin tushadi —
 * yozuvchi yagona joy `core/topshiriq.ts` dagi `yakunla()`. Shuning uchun bu
 * faylda `INSERT` yo'q, faqat o'qish.
 */
import { sql } from "../db/index.js";

export type Xarajat = {
  id: number;
  ism: string;
  izoh: string;
  photo_id: string | null;
  /** BIGINT — postgres.js matn qilib qaytaradi; bo'lmasligi ham mumkin */
  summa: string | null;
  created_at: Date;
};

/** Oxirgi olib kelingan narsalar. */
export async function oxirgiXarajatlar(limit = 10): Promise<Xarajat[]> {
  return sql<Xarajat[]>`
    SELECT e.id, u.ism, e.izoh, e.photo_id, e.summa, e.created_at
    FROM expenses e JOIN users u ON u.id = e.user_id
    ORDER BY e.id DESC LIMIT ${limit}
  `;
}

/** Kim necha marta olib kelgan va qancha pul sarflagan. */
export async function xarajatReytingi(
  dan: Date | null = null,
): Promise<{ ism: string; soni: number; summa: number }[]> {
  const r = await sql<{ ism: string; soni: number; summa: string }[]>`
    SELECT u.ism,
           count(e.id)::int AS soni,
           COALESCE(sum(e.summa), 0)::bigint AS summa
    FROM users u JOIN expenses e ON e.user_id = u.id
    WHERE u.faol AND (${dan}::timestamptz IS NULL OR e.created_at >= ${dan})
    GROUP BY u.ism
    ORDER BY soni DESC, u.ism
  `;
  return r.map((x) => ({ ism: x.ism, soni: x.soni, summa: Number(x.summa) }));
}

/** Shu davrdagi umumiy sarf. */
export async function jamiXarajat(dan: Date | null = null): Promise<number> {
  const [r] = await sql<{ summa: string }[]>`
    SELECT COALESCE(sum(summa), 0)::bigint AS summa FROM expenses
    WHERE (${dan}::timestamptz IS NULL OR created_at >= ${dan})
  `;
  return Number(r?.summa ?? 0);
}
