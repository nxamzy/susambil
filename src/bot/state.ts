/**
 * Ko'p qadamli suhbat holati.
 * Serverless muhitda xotira saqlanmagani uchun bazada turadi.
 */
import type { Api } from "grammy";
import { sql } from "../db/index.js";
import type { IshTuri, Ishonch, NavbatIshi, ShikoyatJoyi } from "../config.js";

/** Bot yuborgan "rasm tashlang" kabi so'rov — jarayon tugagach o'chiriladi. */
type Sorov = { sorov?: { chatId: number; msgId: number } };

export type Flow = (
  /** Izoh talab qiladigan ish turi tanlandi — avval nima qilganini yozadi */
  | { tur: "ish"; ish: IshTuri; qadam: "izoh"; chatId: number }
  /**
   * Qo'shimcha ish belgilandi, endi rasm(lar) kutilyapti. `photoIds` —
   * shu paytgacha yig'ilgan rasmlar (ixtiyoriy, xohlagan sonda tashlash
   * mumkin) — birinchi rasm kelgunga qadar `undefined`.
   */
  | { tur: "ish"; ish: IshTuri; chatId: number; izoh?: string; photoIds?: string[] }
  /** Yangi xarajat: rasm → nomi → summasi */
  | { tur: "xarajat"; qadam: "rasm" }
  | { tur: "xarajat"; qadam: "izoh"; photoId: string }
  | { tur: "xarajat"; qadam: "summa"; photoId: string; izoh: string }
  /** Yangi a'zo ro'yxatdan o'tyapti */
  | { tur: "royxat"; qadam: "ism" }
  | { tur: "royxat"; qadam: "xona"; ism: string }
  /**
   * Anonim shikoyat: izoh → joy → dalil (rasm/video, ixtiyoriy) → sababchi
   * qanchalik aniqmi → (aniq/gumon bo'lsa) kimni tanlash. "Bilmayman"
   * tanlansa to'g'ridan-to'g'ri yuboriladi, alohida qadam kerak emas.
   */
  | { tur: "shikoyat"; qadam: "izoh" }
  | { tur: "shikoyat"; qadam: "joy"; izoh: string }
  | { tur: "shikoyat"; qadam: "dalil"; izoh: string; joy: ShikoyatJoyi }
  | {
      tur: "shikoyat";
      qadam: "javobgar";
      izoh: string;
      joy: ShikoyatJoyi;
      mediaId: string | null;
      mediaTuri: "rasm" | "video" | null;
    }
  | {
      tur: "shikoyat";
      qadam: "kim";
      izoh: string;
      joy: ShikoyatJoyi;
      mediaId: string | null;
      mediaTuri: "rasm" | "video" | null;
      ishonch: Extract<Ishonch, "aniq" | "gumon">;
    }
  /** Admin shikoyatga erkin izoh yozayotganda — reporterning o'z holatidan alohida. */
  | { tur: "shikoyat_izoh"; reportId: number }
  /** Guruhda "💬 Izoh qo'shish" bosgan sababchi — o'z izohini shaxsiy yozadi. */
  | { tur: "javobgar_izoh"; reportId: number }
  /**
   * Kvartira to'lovi: qancha to'laganini yozadi, keyin dalil (rasm/PDF)
   * tashlaydi. Ikkalasi ham to'lov yozuvi yaratilgunga qadar — bazaga
   * faqat dalil kelganda birga yoziladi.
   */
  | { tur: "tolov"; qadam: "summa" }
  | { tur: "tolov"; qadam: "dalil"; summa: number }
  /** Admin "✅ Tasdiqlash" bosgach — haqiqatda qancha kelganini so'raymiz. */
  | { tur: "tolov_tasdiq"; tolovId: number }
  /** Admin "❌ Rad etish" bosgach — sababini so'raymiz. */
  | { tur: "tolov_rad"; tolovId: number }
  /**
   * Admin: to'lovni qo'lda tuzatish — dalilsiz "to'ladi/to'lamadi" deb
   * belgilash. Ikki qadam (summa, keyin sabab) ataylab ALOHIDA: summa
   * matnida bo'shliq/nuqta bo'lsa ("400 000" ko'rinishida — `pul()` xuddi
   * shu formatda ko'rsatadi), bitta qatordagi "ishora+summa+sabab" birga
   * o'qilsa summa xato bo'lib qolar edi (masalan "+400 000 izoh" ->
   * "+400" deb noto'g'ri o'qilardi).
   */
  | { tur: "tolov_tuzat"; qadam: "summa"; userId: number; siklId: number }
  | { tur: "tolov_tuzat"; qadam: "sabab"; userId: number; siklId: number; summa: number }
  /**
   * Navbat: "Mening Navbatim" panelida bitta vazifa (xona/hammom/oshxona/
   * musor) tugmasi bosildi — o'sha vazifaning rasmi kutilyapti.
   */
  | { tur: "navbat_ish"; ish: NavbatIshi; turnId: number }
  /**
   * Admin panel: yangi foydalanuvchi qo'shish — ism yozadi, keyin xonani
   * tugma bilan tanlaydi (shu bosqichda holat allaqachon "xona"da bo'ladi).
   */
  | { tur: "admin_yangi"; qadam: "ism" }
  | { tur: "admin_yangi"; qadam: "xona"; ism: string }
  /** Admin: mavjud foydalanuvchi ismini o'zgartirish. */
  | { tur: "admin_tahrir_ism"; userId: number }
  /** Admin: Telegram ID'ni qo'lda o'zgartirish — yozgach tasdiq so'raladi. */
  | { tur: "admin_tahrir_tgid"; userId: number }
  /** Admin: ball qo'lda tuzatiladi — "+10 sabab" yoki "-5 sabab" shaklida. */
  | { tur: "admin_ball"; userId: number }
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
