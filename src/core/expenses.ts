import { sql } from "../db/index.js";

export type Xarajat = {
  id: number;
  ism: string;
  izoh: string;
  photo_id: string | null;
  created_at: Date;
};

export async function xarajatQoshish(
  userId: number,
  izoh: string,
  photoId: string | null,
): Promise<number> {
  const [r] = await sql<{ id: number }[]>`
    INSERT INTO expenses (user_id, izoh, photo_id)
    VALUES (${userId}, ${izoh}, ${photoId})
    RETURNING id
  `;
  return r?.id ?? 0;
}

/** Oxirgi olib kelingan narsalar. */
export async function oxirgiXarajatlar(limit = 10): Promise<Xarajat[]> {
  return sql<Xarajat[]>`
    SELECT e.id, u.ism, e.izoh, e.photo_id, e.created_at
    FROM expenses e JOIN users u ON u.id = e.user_id
    ORDER BY e.id DESC LIMIT ${limit}
  `;
}

/** Kim necha marta olib kelgan. */
export async function xarajatReytingi(
  dan: Date | null = null,
): Promise<{ ism: string; soni: number }[]> {
  return sql<{ ism: string; soni: number }[]>`
    SELECT u.ism, count(e.id)::int AS soni
    FROM users u JOIN expenses e ON e.user_id = u.id
    WHERE u.faol AND (${dan}::timestamptz IS NULL OR e.created_at >= ${dan})
    GROUP BY u.ism
    ORDER BY soni DESC, u.ism
  `;
}
