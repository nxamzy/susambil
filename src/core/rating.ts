import { sql } from "../db/index.js";
import { config } from "../config.js";

export type OdamReyting = {
  user_id: number;
  ism: string;
  xona: number | null;
  musor: number;
  hammom: number;
  oshxona: number;
  topshirgan: number;   // necha marta tozalash rasmini yuklagan
  tasdiqlagan: number;  // boshqalarnikini necha marta tasdiqlagan
};

export type XonaReyting = {
  xona: number;
  navbat: number;
  kechikkan: number;
  kechikkan_kun: number;
  jarima: number;
};

/** @param dan - shu sanadan keyingi ma'lumot (null bo'lsa — butun tarix) */
export async function odamReytingi(dan: Date | null = null): Promise<OdamReyting[]> {
  return sql<OdamReyting[]>`
    SELECT u.id AS user_id,
           u.ism,
           r.raqam AS xona,
           COUNT(*) FILTER (WHERE c.tur = 'musor')::int   AS musor,
           COUNT(*) FILTER (WHERE c.tur = 'hammom')::int  AS hammom,
           COUNT(*) FILTER (WHERE c.tur = 'oshxona')::int AS oshxona,
           (SELECT COUNT(*) FROM submissions s
             WHERE s.user_id = u.id AND NOT s.bekor
               AND (${dan}::timestamptz IS NULL OR s.created_at >= ${dan}))::int AS topshirgan,
           (SELECT COUNT(*) FROM confirmations cf
             WHERE cf.user_id = u.id
               AND (${dan}::timestamptz IS NULL OR cf.created_at >= ${dan}))::int AS tasdiqlagan
    FROM users u
    LEFT JOIN rooms r ON r.id = u.room_id
    LEFT JOIN chores c ON c.user_id = u.id
      AND (${dan}::timestamptz IS NULL OR c.created_at >= ${dan})
    WHERE u.faol
    GROUP BY u.id, u.ism, r.raqam
    ORDER BY r.raqam NULLS LAST, u.ism
  `;
}

export async function xonaReytingi(dan: Date | null = null): Promise<XonaReyting[]> {
  return sql<XonaReyting[]>`
    SELECT r.raqam AS xona,
           COUNT(t.id) FILTER (WHERE t.holat = 'tasdiqlandi')::int AS navbat,
           COUNT(t.id) FILTER (WHERE t.kechikkan_kun > 0)::int     AS kechikkan,
           COALESCE(SUM(t.kechikkan_kun), 0)::int                  AS kechikkan_kun,
           COALESCE(SUM(t.kechikkan_kun), 0)::int * ${config.jarimaKunlik} AS jarima
    FROM rooms r
    LEFT JOIN turns t ON t.room_id = r.id
      AND t.holat <> 'faol'
      AND (${dan}::timestamptz IS NULL OR t.boshlandi >= ${dan})
    GROUP BY r.raqam
    ORDER BY r.raqam
  `;
}

export type TarixYozuvi = {
  turn_id: number;
  xona: number;
  boshlandi: Date;
  muddat: Date;
  tasdiqlandi: Date | null;
  kechikkan_kun: number;
  holat: string;
  topshirdi: string | null;
  rasm_soni: number;
  tasdiqlovchilar: string[];
};

export async function tarix(limit = 20, offset = 0): Promise<TarixYozuvi[]> {
  return sql<TarixYozuvi[]>`
    SELECT t.id AS turn_id,
           r.raqam AS xona,
           t.boshlandi,
           t.muddat,
           t.tasdiqlandi,
           t.kechikkan_kun,
           t.holat,
           su.ism AS topshirdi,
           COALESCE(array_length(s.photo_ids, 1), 0) AS rasm_soni,
           COALESCE(
             (SELECT array_agg(cu.ism ORDER BY cf.created_at)
                FROM confirmations cf JOIN users cu ON cu.id = cf.user_id
               WHERE cf.submission_id = s.id),
             ARRAY[]::text[]
           ) AS tasdiqlovchilar
    FROM turns t
    JOIN rooms r ON r.id = t.room_id
    LEFT JOIN LATERAL (
      SELECT * FROM submissions WHERE turn_id = t.id AND NOT bekor
      ORDER BY id DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN users su ON su.id = s.user_id
    WHERE t.holat <> 'faol'
    ORDER BY t.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
