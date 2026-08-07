import { sql, type User } from "../db/index.js";
import { config } from "../config.js";

export type Balans = {
  user_id: number;
  ism: string;
  xona: number | null;
  balans: number; // + kassa unga qarzdor, − u kassaga qarzdor
};

export async function balanslar(): Promise<Balans[]> {
  return sql<Balans[]>`
    SELECT u.id AS user_id,
           u.ism,
           r.raqam AS xona,
           COALESCE(SUM(k.summa), 0)::int AS balans
    FROM users u
    LEFT JOIN rooms r ON r.id = u.room_id
    LEFT JOIN kassa_entries k ON k.user_id = u.id
    WHERE u.faol
    GROUP BY u.id, u.ism, r.raqam
    ORDER BY r.raqam NULLS LAST, u.ism
  `;
}

/**
 * Xarajat: odam pul sarfladi. O'zi kredit oladi, summa hamma faol
 * a'zolar o'rtasida teng bo'linib, har kimga qarz yoziladi.
 */
export async function xarajatQoshish(
  userId: number,
  summa: number,
  izoh: string,
  photoId: string | null,
): Promise<{ expenseId: number; ulush: number }> {
  return sql.begin(async (tx) => {
    const [xarajat] = await tx<{ id: number }[]>`
      INSERT INTO expenses (user_id, summa, izoh, photo_id)
      VALUES (${userId}, ${summa}, ${izoh}, ${photoId})
      RETURNING id
    `;
    if (!xarajat) throw new Error("Xarajat yozilmadi");

    await tx`
      INSERT INTO kassa_entries (user_id, summa, tur, ref_id, izoh)
      VALUES (${userId}, ${summa}, 'xarajat', ${xarajat.id}, ${izoh})
    `;

    let ulush = 0;
    if (config.xarajatBolinadi) {
      const azolar = await tx<User[]>`SELECT * FROM users WHERE faol`;
      if (azolar.length > 0) {
        ulush = Math.round(summa / azolar.length);
        for (const a of azolar) {
          await tx`
            INSERT INTO kassa_entries (user_id, summa, tur, ref_id, izoh)
            VALUES (${a.id}, ${-ulush}, 'ulush', ${xarajat.id}, ${izoh})
          `;
        }
      }
    }

    return { expenseId: xarajat.id, ulush };
  });
}

/** Admin: kimdir kassaga pul topshirdi. */
export async function tolovQoshish(userId: number, summa: number, izoh = "to'lov"): Promise<void> {
  await sql`
    INSERT INTO kassa_entries (user_id, summa, tur, izoh)
    VALUES (${userId}, ${summa}, 'tolov', ${izoh})
  `;
}

/** Oylik yig'im — har oyning 1-sanasida bir marta yoziladi. */
export async function oylikYigimYozish(oyBelgisi: string): Promise<number> {
  const [bor] = await sql<{ qiymat: string }[]>`
    SELECT qiymat FROM settings WHERE kalit = 'oxirgi_yigim'
  `;
  if (bor?.qiymat === oyBelgisi) return 0;

  const azolar = await sql<User[]>`SELECT * FROM users WHERE faol`;
  await sql.begin(async (tx) => {
    for (const a of azolar) {
      await tx`
        INSERT INTO kassa_entries (user_id, summa, tur, izoh)
        VALUES (${a.id}, ${-config.oylikYigim}, 'yigim', ${`${oyBelgisi} oylik yig'im`})
      `;
    }
    await tx`
      INSERT INTO settings (kalit, qiymat) VALUES ('oxirgi_yigim', ${oyBelgisi})
      ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
    `;
  });
  return azolar.length;
}

export function pul(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
}
