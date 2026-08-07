/**
 * Ko'p qadamli suhbat holati.
 * Serverless muhitda xotira saqlanmagani uchun bazada turadi.
 */
import { sql } from "../db/index.js";
import type { IshTuri } from "../config.js";

export type Flow =
  /** Qo'shimcha ish belgilandi, endi rasm kutilyapti */
  | { tur: "ish"; ish: IshTuri; chatId: number }
  /** Yangi xarajat: avval rasm, keyin nomi */
  | { tur: "xarajat"; qadam: "rasm" }
  | { tur: "xarajat"; qadam: "izoh"; photoId: string }
  /** Yangi a'zo ro'yxatdan o'tyapti */
  | { tur: "royxat"; qadam: "ism" }
  | { tur: "royxat"; qadam: "xona"; ism: string };

/** Chala qolgan jarayon shuncha daqiqadan keyin bekor bo'ladi. */
const MUDDAT_DAQIQA = 15;

export async function holatOl(telegramId: number): Promise<Flow | null> {
  const [r] = await sql<{ holat: Flow }[]>`
    SELECT holat FROM flow_state
    WHERE telegram_id = ${telegramId}
      AND updated_at > now() - (${MUDDAT_DAQIQA} || ' minutes')::interval
  `;
  return r?.holat ?? null;
}

export async function holatOrnat(telegramId: number, holat: Flow): Promise<void> {
  await sql`
    INSERT INTO flow_state (telegram_id, holat, updated_at)
    VALUES (${telegramId}, ${sql.json(holat)}, now())
    ON CONFLICT (telegram_id)
    DO UPDATE SET holat = EXCLUDED.holat, updated_at = now()
  `;
}

export async function holatTozala(telegramId: number): Promise<void> {
  await sql`DELETE FROM flow_state WHERE telegram_id = ${telegramId}`;
}
