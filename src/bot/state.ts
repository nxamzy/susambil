/**
 * Ko'p qadamli suhbat holati.
 * Serverless muhitda xotira saqlanmagani uchun bazada turadi.
 */
import { GrammyError, type Api } from "grammy";
import { sql } from "../db/index.js";
import { type Ishonch, type ShikoyatJoyi } from "../config.js";

/** Bot yuborgan "rasm tashlang" kabi so'rov — jarayon tugagach o'chiriladi. */
type Sorov = { sorov?: { chatId: number; msgId: number } };

export type Flow = (
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
   * To'lov: qancha to'laganini yozadi, keyin dalil (rasm/PDF) tashlaydi.
   * Ikkalasi ham to'lov yozuvi yaratilgunga qadar — bazaga faqat dalil
   * kelganda birga yoziladi.
   *
   * `siklId` — PUL YIG'IMIGA to'lov bo'lsa o'sha yig'imning id'si; bo'lmasa
   * kvartira puli (joriy oy). Oqim ikkalasiga bir xil, shuning uchun
   * ikkinchi oqim yozilmadi — faqat pul qaysi siklga tushishi farq qiladi.
   */
  | { tur: "tolov"; qadam: "summa"; siklId?: number }
  | { tur: "tolov"; qadam: "dalil"; summa: number; siklId?: number }
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
   * Navbat: "Mening Navbatim" panelida bitta vazifa tugmasi bosildi —
   * o'sha vazifaning rasm(lar)i kutilyapti. `kod` — `navbat_vazifalari.kod`
   * (ilgari qattiq yozilgan union edi, endi vazifalar bazadan keladi).
   */
  | { tur: "navbat_ish"; kod: string; turnId: number }
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
  /**
   * Admin: navbat vazifasini qo'shish/nomini o'zgartirish. Rasm soni
   * alohida qadam EMAS — u tugma bilan tanlanadi (matn qadami faqat nom
   * uchun, aks holda "3" deb yozilgan javob nommi yoki sonmi noaniq bo'lardi).
   */
  | { tur: "vazifa_yangi" }
  | { tur: "vazifa_nom"; vazifaId: number }
  /**
   * Admin: a'zolarga erkin xabar/topshiriq yuborish. Kim olishini avval
   * tugma bilan tanlaydi, keyin matnini yozadi, so'ng ko'rib tasdiqlaydi —
   * yuborilgach ortga qaytarib bo'lmaydi, shuning uchun tasdiq qadami bor.
   */
  | { tur: "admin_xabar"; qadam: "matn"; kim: XabarKimi }
  | { tur: "admin_xabar"; qadam: "tasdiq"; kim: XabarKimi; matn: string }
  /**
   * Admin yangi pul yig'imini boshlayapti: nomi → har kishidan qancha →
   * muddati (tugma) → tasdiq. Tasdiq qadami ATAYLAB bor: "boshlash" bitta
   * bosishda guruhga e'lon va hammaga xabar yuboradi, ortga qaytarib
   * bo'lmaydi (`admin_xabar` bilan bir xil sabab).
   */
  | { tur: "yigim_yangi"; qadam: "nom" }
  | { tur: "yigim_yangi"; qadam: "summa"; nom: string }
  | { tur: "yigim_yangi"; qadam: "kun"; nom: string; talab: number }
  | { tur: "yigim_yangi"; qadam: "tasdiq"; nom: string; talab: number; kun: number }
  /** Admin ochiq yig'imning summasini o'zgartiryapti. */
  | { tur: "yigim_summa"; siklId: number }
  /**
   * "Uyga nima kerak" ro'yxatiga yangi narsa qo'shilyapti. Bu oqim
   * ADMINGA CHEKLANMAGAN — ro'yxat kalta chiqishining sababi aynan
   * hammaning yoza olmasligi edi (`core/narsalar.ts`).
   */
  | { tur: "narsa_yangi" }
  /** Admin ro'yxatdagi narsaning nomini tuzatyapti. */
  | { tur: "narsa_nom"; narsaId: number }
) &
  Sorov;

/**
 * Admin xabari kimga ketadi. `navbatchi` — hozir navbatda turgan xona
 * a'zolari (eng ko'p kerak bo'ladigan holat: "musor to'lib ketdi, bugun
 * tashlab kelinglar"), qolganlari esa umumiy holatlar uchun.
 */
export type XabarKimi =
  | { t: "navbatchi" }
  | { t: "hamma" }
  | { t: "xona"; raqam: number }
  | { t: "odam"; userId: number }
  | { t: "guruh" };

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

/**
 * So'rov xabarini QAYTA YUBORMASDAN tahrirlaydi.
 *
 * Nega kerak: albom bilan tashlangan har bir rasmga alohida javob yozilsa,
 * 9 ta rasm 9–18 ta xabar demakdir — chat to'lib ketadi va Telegram flood
 * chegarasi javoblarni tashlab yubora boshlaydi. Bitta xabarni tahrirlab
 * borish esa `group.ts`dagi `korishXabar()` bilan bir xil falsafa: chatda
 * bir vaqtda bitta jonli xabar turadi.
 *
 * Bir xil matn bilan tahrirlashga urinsa Telegram xato qaytaradi ("message
 * is not modified") — bu normal holat, jimgina o'tkazib yuboriladi.
 * So'rov xabari umuman bo'lmasa (jarayon eski) `false` qaytadi va
 * chaqiruvchi yangi xabar yuboradi.
 */
export async function sorovniTahrirla(
  api: Api,
  holat: Flow | null,
  matn: string,
  extra: object = {},
): Promise<boolean> {
  if (!holat?.sorov) return false;
  try {
    await api.editMessageText(holat.sorov.chatId, holat.sorov.msgId, matn, {
      parse_mode: "HTML",
      ...extra,
    });
    return true;
  } catch (e) {
    // "message is not modified" — matn o'zgarmagan, ya'ni xabar ALLAQACHON
    // to'g'ri holatda. Buni muvaffaqiyatsizlik deb hisoblasak chaqiruvchi
    // yangi xabar yuborardi, ya'ni aynan qochmoqchi bo'lgan xabar toshqini
    // qaytib kelardi.
    if (e instanceof GrammyError && e.description.includes("message is not modified")) {
      return true;
    }
    return false;
  }
}


