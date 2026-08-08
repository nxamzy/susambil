/**
 * Ko'p qadamli suhbat holati.
 * Serverless muhitda xotira saqlanmagani uchun bazada turadi.
 */
import type { Api } from "grammy";
import { sql } from "../db/index.js";
import type { IshTuri, ShikoyatTurkumi } from "../config.js";

/** Bot yuborgan "rasm tashlang" kabi so'rov — jarayon tugagach o'chiriladi. */
type Sorov = { sorov?: { chatId: number; msgId: number } };

export type Flow = (
  /** Izoh talab qiladigan ish turi tanlandi — avval nima qilganini yozadi */
  | { tur: "ish"; ish: IshTuri; qadam: "izoh"; chatId: number }
  /** Qo'shimcha ish belgilandi, endi rasm kutilyapti */
  | { tur: "ish"; ish: IshTuri; chatId: number; izoh?: string }
  /** Yangi xarajat: rasm → nomi → summasi */
  | { tur: "xarajat"; qadam: "rasm" }
  | { tur: "xarajat"; qadam: "izoh"; photoId: string }
  | { tur: "xarajat"; qadam: "summa"; photoId: string; izoh: string }
  /** Yangi a'zo ro'yxatdan o'tyapti */
  | { tur: "royxat"; qadam: "ism" }
  | { tur: "royxat"; qadam: "xona"; ism: string }
  /** Anonim shikoyat: kim → turkum → izoh → rasm */
  | { tur: "shikoyat"; qadam: "kim" }
  | { tur: "shikoyat"; qadam: "turkum"; reportedId: number }
  | { tur: "shikoyat"; qadam: "izoh"; reportedId: number; turkum: ShikoyatTurkumi }
  | { tur: "shikoyat"; qadam: "rasm"; reportedId: number; turkum: ShikoyatTurkumi; izoh: string }
) &
  Sorov;

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

/** Jarayon tugadi — botning so'rov xabarini o'chiramiz, chat toza qolsin. */
export async function sorovniOchir(api: Api, holat: Flow | null): Promise<void> {
  if (!holat?.sorov) return;
  await api.deleteMessage(holat.sorov.chatId, holat.sorov.msgId).catch(() => {});
}

/** So'rov xabari yuborilgach uning id sini holatga yozib qo'yamiz. */
export async function sorovniEslat(
  telegramId: number,
  holat: Flow,
  chatId: number,
  msgId: number,
): Promise<void> {
  await holatOrnat(telegramId, { ...holat, sorov: { chatId, msgId } });
}
