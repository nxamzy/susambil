/**
 * Xarajat kiritish jarayonidagi holat.
 * Serverless muhitda xotira saqlanmagani uchun bazada turadi.
 */
import { sql } from "../db/index.js";

export type XarajatHolat =
  | { qadam: "summa" }
  | { qadam: "izoh"; summa: number }
  | { qadam: "rasm"; summa: number; izoh: string };

/** Shuncha vaqtdan keyin chala qolgan jarayon bekor bo'ladi. */
const MUDDAT_DAQIQA = 15;

export async function xarajatHolati(telegramId: number): Promise<XarajatHolat | null> {
  const [r] = await sql<{ holat: XarajatHolat }[]>`
    SELECT holat FROM flow_state
    WHERE telegram_id = ${telegramId}
      AND updated_at > now() - (${MUDDAT_DAQIQA} || ' minutes')::interval
  `;
  return r?.holat ?? null;
}

export async function xarajatOrnat(telegramId: number, holat: XarajatHolat): Promise<void> {
  await sql`
    INSERT INTO flow_state (telegram_id, holat, updated_at)
    VALUES (${telegramId}, ${sql.json(holat)}, now())
    ON CONFLICT (telegram_id)
    DO UPDATE SET holat = EXCLUDED.holat, updated_at = now()
  `;
}

export async function xarajatTozala(telegramId: number): Promise<void> {
  await sql`DELETE FROM flow_state WHERE telegram_id = ${telegramId}`;
}
