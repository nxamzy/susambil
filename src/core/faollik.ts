/**
 * Faollik hisoblagichi — "kim botda ko'proq harakat qilyapti".
 *
 * BU REYTING EMAS. Olib tashlangan ball tizimi baho qo'yardi: navbatga 60,
 * kechikkanga −10, xona a'zolari soniga bo'linardi, medallar bilan
 * chiqardi. Bu esa faqat SANAYDI — xuddi xonaga kim ko'p kirib
 * chiqayotganini bilish kabi. Har harakat AYNAN BITTA, qaysi harakat
 * ekanidan qat'i nazar: navbat topshirish ham 1, bumaga tugaganini
 * belgilash ham 1.
 *
 * Buni kod emas, TUZILMA kafolatlaydi: `faollik` jadvalida `ball` ustuni
 * yo'q, ya'ni vazn qo'yadigan joy umuman mavjud emas (`db/schema.sql`
 * dagi izohga qarang).
 *
 * "Agregat ustun saqlanmaydi" qoidasi bu yerda ham amal qiladi: `users` da
 * hech qanday `faollik` ustuni yo'q, jami har safar qatorlardan
 * hisoblanadi — ikki marta sanash strukturaviy jihatdan imkonsiz.
 */
import { sql } from "../db/index.js";

/**
 * Sanaladigan harakatlar.
 *
 * Menyu ko'rish, ro'yxat ochish, panelga qaytish ATAYLAB yo'q: ular
 * "nimadur qildi" emas, "botni ochdi" degani. Bo'lmasa bekorga tugma
 * bosib o'tirgan odam birinchi o'ringa chiqib qolardi.
 *
 * Bazadagi `tur` bundan kengroq bo'lishi mumkin — eski tarixdan
 * ko'chirilgan qatorlarda 'ish' va 'xarajat' ham bor. U faqat yorliq,
 * sanashda ishlatilmaydi.
 */
export type FaollikTuri =
  /** Navbatni yakuniy topshirdi */
  | "navbat"
  /** Boshqa xonaning ishini tasdiqladi */
  | "tasdiq"
  /** Navbat vazifasida "✅ Tugatdim" bosdi */
  | "vazifa"
  /** To'lov yoki chek yubordi */
  | "tolov"
  /** "Uyga kerak" ro'yxatida narsa tugaganini belgiladi */
  | "narsa"
  /** Ro'yxatga yangi narsa qo'shdi */
  | "narsa_qosh"
  /** Anonim shikoyat yozdi */
  | "shikoyat"
  /** "🗑 Musor to'ldi" deb navbatchiga xabar berdi (faqat YANGI signal) */
  | "signal";

/**
 * Bitta harakatni yozadi.
 *
 * HECH QACHON XATO TASHLAMAYDI. Hisoblagich — yordamchi ma'lumot, asosiy
 * ish emas: bazaga yozish uddasidan chiqmasa navbat topshirish yoki to'lov
 * tasdiqlash shu sababli yiqilmasligi kerak. Shuning uchun chaqiruvchilar
 * `await` qilsa ham xavfsiz.
 */
export async function faollikYoz(userId: number, tur: FaollikTuri): Promise<void> {
  try {
    await sql`INSERT INTO faollik (user_id, tur) VALUES (${userId}, ${tur})`;
  } catch (e) {
    console.error("[faollik] yozib bo'lmadi:", e instanceof Error ? e.message : e);
  }
}

export type OdamFaollik = {
  userId: number;
  ism: string;
  /** Shu oydagi harakatlar soni */
  oy: number;
  /** Butun vaqt davomida */
  jami: number;
};

/**
 * Hamma faol a'zo — harakati yo'qlari ham (0 bilan). Ular ro'yxatdan
 * tushib qolmasligi kerak: "kim faol emas" degan savol ham xuddi
 * "kim faol" kabi javob talab qiladi.
 *
 * Ikkala raqam BITTA so'rovda: `FILTER` bilan shu oydagisi, `count(*)`
 * bilan jami.
 *
 * @param oyBoshi `YYYY-MM-DD` — shu oyning birinchi kuni. Kalendar savoli
 *   matn bilan uzatiladi (`core/vaqt.ts` intizomi): `Date` obyekti
 *   mintaqa siljishi tufayli bir kunlik xato berishi mumkin edi.
 */
export async function faollikRoyxati(oyBoshi: string): Promise<OdamFaollik[]> {
  const rows = await sql<{ user_id: number; ism: string; oy: number; jami: number }[]>`
    SELECT u.id AS user_id, u.ism,
           count(f.id) FILTER (
             WHERE (f.created_at AT TIME ZONE 'Asia/Tashkent')::date >= ${oyBoshi}::date
           )::int AS oy,
           count(f.id)::int AS jami
    FROM users u
    LEFT JOIN faollik f ON f.user_id = u.id
    WHERE u.faol
    GROUP BY u.id, u.ism
    ORDER BY oy DESC, jami DESC, u.ism
  `;
  return rows.map((r) => ({ userId: r.user_id, ism: r.ism, oy: r.oy, jami: r.jami }));
}

/**
 * O'rinlarni hisoblaydi — TENG sonlilar bir xil o'rinni oladi.
 *
 * Sof funksiya, bazasiz sinaladi. Teng holatni ataylab qo'llab-quvvatlaydi:
 * uyda ikki kishi bir xil 7 tadan harakat qilgan bo'lsa, birini 3-, ikkinchisini
 * 4-o'rin deb ko'rsatish ularning farqi bordek taassurot berardi.
 */
export function orinlar(royxat: OdamFaollik[]): Map<number, number> {
  const m = new Map<number, number>();
  let orin = 0;
  let oldingi: number | null = null;
  for (const [i, o] of royxat.entries()) {
    if (oldingi === null || o.oy !== oldingi) {
      orin = i + 1;
      oldingi = o.oy;
    }
    m.set(o.userId, orin);
  }
  return m;
}
