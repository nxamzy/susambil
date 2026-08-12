import postgres from "postgres";
import { config, type Ishonch, type NavbatIshi, type ShikoyatJoyi } from "../config.js";

/** Neon'ning "-pooler" manzili PgBouncer (transaction mode) orqali ishlaydi —
 *  u prepared statement'larni qo'llab-quvvatlamaydi, shuning uchun o'chiramiz. */
const poolerOrqali = config.databaseUrl.includes("-pooler.");

export const sql = postgres(config.databaseUrl, {
  ssl: config.databaseUrl.includes("sslmode=require") ? "require" : undefined,
  max: 5,
  prepare: !poolerOrqali,
  transform: { undefined: null },
});

export type Room = { id: number; raqam: number; tartib: number };

export type User = {
  id: number;
  ism: string;
  telegram_id: string | null;
  username: string | null;
  room_id: number | null;
  admin: boolean;
  faol: boolean;
};

/**
 * Bitta vazifaning holati — rasm kelganda to'ladi, boshqa hech narsa uni
 * o'chirmaydi. `photo_ids` — yig'ilib borayotgan rasmlar (ba'zi vazifalarga
 * bir nechtasi kerak, masalan hammom). `photo_id` — eski format, faqat
 * deploydan oldin allaqachon bitta rasm bilan belgilangan vazifalarni
 * o'qishda orqaga moslik uchun qoldirilgan (`core/rotation.ts` ishRasmlari()
 * ikkalasini ham tushunadi); yangi yozuvlar hech qachon shu maydonni
 * ishlatmaydi.
 */
export type TurnIshBelgisi = {
  photo_ids?: string[];
  /** @deprecated faqat eski yozuvlarni o'qishda ishlatiladi */
  photo_id?: string;
  user_id: number;
  vaqt: string;
};

export type TurnIshlar = Partial<Record<NavbatIshi, TurnIshBelgisi>>;

export type Turn = {
  id: number;
  room_id: number;
  boshlandi: Date;
  muddat: Date;
  tasdiqlandi: Date | null;
  holat: "faol" | "tasdiqlandi" | "admin_yopdi";
  kechikkan_kun: number;
  /** Muddat o'tgach kunda 1 marta yuboriladigan GURUH ogohlantirishi — o'zgarmagan eski maydon. */
  oxirgi_ping: Date | null;
  /** Har bir vazifaning (xona/hammom/oshxona/musor) rasmi va kim bajargani */
  ishlar: TurnIshlar;
  /** "Oxirgi kun" oynasida 5 soatda bir yuboriladigan SHAXSIY eslatmaning oxirgi vaqti */
  oxirgi_eslatma: Date | null;
};

/** Topshiriq turi. Uchalasi ham bir xil tasdiqlash yo'lidan o'tadi. */
export type SubTur = "navbat" | "ish" | "xarajat";

/** kutilmoqda → tasdiqlandi | rad */
export type SubHolat = "kutilmoqda" | "tasdiqlandi" | "rad";

export type Submission = {
  id: number;
  /** Faqat tur='navbat' da to'la, boshqasida null */
  turn_id: number | null;
  user_id: number;
  photo_ids: string[];
  media_group_id: string | null;
  guruh_msg_id: string | null;
  bekor: boolean;
  created_at: Date;
  tur: SubTur;
  /** musor | hammom | oshxona | xona | boshqa — faqat tur='ish' da */
  ish_turi: string | null;
  izoh: string | null;
  /** BIGINT — postgres.js uni matn qilib qaytaradi */
  summa: string | null;
  /** Server hisoblab yozadi; mijozdan hech qachon olinmaydi */
  ball: number;
  holat: SubHolat;
  yopildi: Date | null;
  rad_sababi: string | null;
  rad_qildi: number | null;
};

/**
 * kutilmoqda -> tuzatilmoqda -> tuzatildi | jarima
 *           \-> rad
 *
 * Bitta admin hal qiladi (ko'p kishilik tasdiq emas). "tuzatilmoqda" —
 * admin tasdiqlagan, sababchiga tuzatish uchun imkoniyat berilgan;
 * "jarima" — tuzatilmagan, ball ayirilgan; "tuzatildi" — hal qilingan,
 * ball ayirilmagan.
 */
export type ReportHolat = "kutilmoqda" | "tuzatilmoqda" | "tuzatildi" | "jarima" | "rad";

/** Guruh tugmalari orqali sababchining o'zi bergan javob. */
export type JavobgarJavobi = "tan_oldi" | "rad_etdi";

/**
 * Anonim shikoyat.
 *
 * `reporter_id` HECH QACHON guruhga yoki oddiy a'zoga chiqadigan matnda
 * ishlatilmaydi — faqat admin ko'radigan joylarda (adminga DM, /shikoyatlar).
 *
 * `reported_id` esa buning aksi: aniq yoki gumon qilingan bo'lsa, guruh
 * xabarida ISM sifatida ko'rsatiladi ("gumon" holatida aniq "tasdiqlanmagan"
 * deb belgilab) — maqsad muammoni hal qilish, shuning uchun bu odam kim
 * ekani yashirilmaydi. Faqat "kim shikoyat qildi" (reporter) maxfiy qoladi.
 */
export type Report = {
  id: number;
  reporter_id: number;
  /** Sababchi noma'lum bo'lsa null — admin keyinroq belgilashi mumkin */
  reported_id: number | null;
  ishonch: Ishonch;
  joy: ShikoyatJoyi;
  izoh: string;
  photo_id: string | null;
  media_turi: "rasm" | "video";
  ball: number;
  holat: ReportHolat;
  admin_id: number | null;
  /** Adminning erkin izohi — reporterning izohidan alohida */
  admin_note: string | null;
  /** Sababchining guruh tugmalari orqali bergan javobi (tan oldi/rad etdi) */
  javobgar_javobi: JavobgarJavobi | null;
  /** Sababchining o'z izohi — reporter va adminning izohidan alohida */
  javobgar_izohi: string | null;
  javobgar_javob_vaqti: Date | null;
  /** Admin tasdiqlab, tuzatish uchun imkoniyat bergan payt */
  confirmed_at: Date | null;
  hal_qilindi: Date | null;
  admin_msgs: { chat_id: number; message_id: number }[];
  /** Guruhdagi anonim xabar — qayta yubormasdan shu tahrirlanadi */
  guruh_msg_id: string | null;
  created_at: Date;
};

/** kutilmoqda -> tasdiqlandi | rad — ortga qaytmaydi. */
export type TolovHolat = "kutilmoqda" | "tasdiqlandi" | "rad";

export type TolovDalilTuri = "rasm" | "hujjat";

/**
 * Kvartira to'lovi — har bir yozuv mustaqil tranzaksiya (reports/submissions
 * bilan bir xil falsafa). Odamning joriy holati bu jadvaldan har doim
 * SUM(tasdiqlangan_summa) WHERE holat='tasdiqlandi' bilan hisoblanadi —
 * alohida "jami" ustuni yo'q, shuning uchun ikki marta hisoblanish mumkin
 * emas (`core/tolov.ts`).
 *
 * `kiritgan_summa` — foydalanuvchining o'zi yozgan DA'VO, hisobga
 * qo'shilmaydi. `tasdiqlangan_summa` — admin haqiqiy tekshirib kiritgan
 * miqdor, FAQAT shu haqiqiy hisobga tushadi. Ikkalasi hech qachon bir-birini
 * bosib yozmaydi.
 */
export type Tolov = {
  id: number;
  user_id: number;
  /**
   * Qaysi oylik siklga tegishli. YUBORILGAN sanasi bo'yicha biriktiriladi —
   * tasdiqlangan sanasi bo'yicha emas, aks holda oyning oxirida yuborilgan
   * to'lov admin kechikkani uchun keyingi oyga tushib ketardi.
   * Migratsiyadan oldingi eski yozuvlarda `null` bo'lishi mumkin.
   */
  sikl_id: number | null;
  /** BIGINT — postgres.js uni matn qilib qaytaradi. Foydalanuvchining da'vosi. */
  kiritgan_summa: string;
  /** BIGINT — faqat 'tasdiqlandi' holatida to'ladi, admin tekshirgan haqiqiy summa. */
  tasdiqlangan_summa: string | null;
  dalil_id: string;
  dalil_turi: TolovDalilTuri;
  holat: TolovHolat;
  /** Tasdiqlagan yoki rad etgan admin */
  hal_qildi: number | null;
  rad_sababi: string | null;
  admin_msgs: { chat_id: number; message_id: number }[];
  /** Faqat tasdiqlangandan keyin guruhga yuborilgan e'lon xabari */
  guruh_msg_id: string | null;
  created_at: Date;
  hal_qilindi: Date | null;
};

/** ochiq -> muddat_yetdi -> yakunlandi — ortga qaytmaydi. */
export type SiklHolat = "ochiq" | "muddat_yetdi" | "yakunlandi";

/**
 * Bitta oylik kvartira to'lovi sikli.
 *
 * `davr` va `muddat` DATE ustunlari, lekin bu yerda MATN (`YYYY-MM-DD`) —
 * so'rovlarda `to_char(...)` bilan o'qiladi. Sabab: DATE ustuni JS'da UTC
 * yarim tunidagi `Date` bo'lib qaytadi va uni Toshkent mintaqasida
 * formatlaganda bir kunlik siljish xatosiga yo'l ochiladi. Kalendar sanasi
 * matn bo'lib qolsa bunday xato bo'lishi mumkin emas (`core/vaqt.ts`).
 */
export type TolovSikl = {
  id: number;
  /** Oy boshi — siklning kaliti (`YYYY-MM-01`) */
  davr: string;
  /** Shu oy uchun muzlatilgan talab (so'm) */
  talab: number;
  /** To'lov muddati (`YYYY-MM-15`), kun oxirigacha hisoblanadi */
  muddat: string;
  holat: SiklHolat;
  /** Guruhga oxirgi eslatma yuborilgan kun (`YYYY-MM-DD`) */
  guruh_eslatma: string | null;
  muddat_hisoblandi: Date | null;
  yakunlandi: Date | null;
  created_at: Date;
};

/** Admin harakatlar jurnali — kim, nima, eski/yangi qiymat, qachon. */
export type AdminLog = {
  id: number;
  admin_id: number;
  harakat: string;
  obyekt_turi: string;
  obyekt_id: number | null;
  eski_qiymat: string | null;
  yangi_qiymat: string | null;
  created_at: Date;
};

/** Admin qo'lda kiritgan ball tuzatishi — reyting hisobiga qo'shimcha manba sifatida qo'shiladi. */
export type BallTuzatish = {
  id: number;
  user_id: number;
  ball: number;
  sabab: string | null;
  admin_id: number;
  created_at: Date;
};
