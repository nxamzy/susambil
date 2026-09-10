/**
 * Ko'p qadamli suhbat holati.
 * Serverless muhitda xotira saqlanmagani uchun bazada turadi.
 */
import { GrammyError, type Api } from "grammy";
import { sql } from "../db/index.js";
import { RASM_MAX, type IshTuri, type Ishonch, type ShikoyatJoyi } from "../config.js";

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

/**
 * Qo'shimcha ish oqimida rasmni ATOMIK qo'shadi va yangi ro'yxatni
 * qaytaradi.
 *
 * Ilgari bu `holat.photoIds` ni o'qib, massivga qo'shib, qaytadan yozardi —
 * albomdagi rasmlar bir vaqtda kelgani uchun ikkita chaqiruv bir xil eski
 * ro'yxatni o'qib, bir-birining ustidan yozib yuborardi va rasm yo'qolardi
 * (`core/rotation.ts` `ishBelgila` bilan aynan bir xil muammo, aynan bir
 * xil yechim).
 *
 * `null` — jarayon eskirgan/boshqa turga o'zgargan; bo'sh bo'lmagan
 * massiv — qo'shildi (yoki chegara tufayli o'zgarmadi).
 */
export async function ishRasminiQosh(
  telegramId: number,
  fileId: string,
): Promise<string[] | null> {
  const [r] = await sql<{ holat: Flow }[]>`
    UPDATE flow_state
    SET holat = jsonb_set(
          holat, '{photoIds}',
          COALESCE(holat -> 'photoIds', '[]'::jsonb) || to_jsonb(${fileId}::text), true),
        updated_at = now()
    WHERE telegram_id = ${telegramId}
      AND holat ->> 'tur' = 'ish'
      AND NOT jsonb_exists(holat, 'qadam')
      AND jsonb_array_length(COALESCE(holat -> 'photoIds', '[]'::jsonb)) < ${RASM_MAX}
      AND updated_at > now() - (${MUDDAT_DAQIQA} || ' minutes')::interval
    RETURNING holat
  `;
  if (r) return (r.holat as { photoIds?: string[] }).photoIds ?? [];

  // Yozilmadi — chegaraga yetilgan yoki jarayon boshqa turga o'tgan.
  const joriy = await holatOl(telegramId);
  if (joriy?.tur !== "ish" || "qadam" in joriy) return null;
  return joriy.photoIds ?? [];
}

/**
 * So'rov xabarini ATOMIK yozadi — holatning qolgan qismiga tegmasdan.
 *
 * `sorovniEslat` butun holatni qaytadan yozadi; albom bilan bir vaqtda
 * kelayotgan rasmlar orasida bu yangi qo'shilgan `photoIds`ni eski nusxa
 * bilan bosib yuborishi mumkin (aynan shu poyga rasm yo'qolishiga sabab
 * bo'lgan). Bu yerda faqat `sorov` maydoni o'zgaradi.
 */
export async function sorovniYoz(
  telegramId: number,
  chatId: number,
  msgId: number,
): Promise<void> {
  await sql`
    UPDATE flow_state
    SET holat = jsonb_set(holat, '{sorov}', ${sql.json({ chatId, msgId })}, true)
    WHERE telegram_id = ${telegramId}
  `;
}
