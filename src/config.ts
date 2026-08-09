import "dotenv/config";

function talab(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`.env faylida ${nom} yo'q`);
  return v;
}

export const config = {
  botToken: talab("BOT_TOKEN"),
  databaseUrl: talab("DATABASE_URL"),
  groupChatId: process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : null,

  /** Har xonaga beriladigan muddat (kun) */
  siklKuni: 5,

  /**
   * Muddat tugashiga necha kun qolganda "oxirgi kun" oynasi boshlanadi —
   * shu paytdan e'tiboran `eslatmaOraligiSoat` har necha soatda navbatdagi
   * xonaga shaxsiy eslatma boradi (jobs/reminders.ts), navbat
   * yakunlanguncha davom etadi.
   */
  eslatmaKuni: 1,

  /** "Oxirgi kun" oynasida shaxsiy eslatma necha soatda bir qaytarilsin. */
  eslatmaOraligiSoat: 5,

  /** Ishni qabul qilish uchun kerak bo'lgan tasdiqlar soni */
  kerakliTasdiq: 3,

  /** Kechikkan har bir kun uchun jarima (so'm). Faqat reytingda ko'rsatiladi —
   *  bot pul hisobini yuritmaydi. */
  jarimaKunlik: 10_000,

  /**
   * Navbatdagi MAJBURIY xona tozalash vazifalari ("🧹 Mening navbatim" ichida)
   * muddat tugashiga necha kun qolganda ochiladi. Shu paytgacha xona a'zosi
   * botni ishlatishi mumkin (masalan ixtiyoriy tozalash tugmalari orqali),
   * lekin majburiy navbat vazifalarini boshlay olmaydi.
   */
  majburiyOchilishKuni: 1,
} as const;

/**
 * Qo'shimcha ish turlari.
 *
 *   nom       — qisqa nom, ro'yxat/checklist ko'rinishlarida ishlatiladi
 *   tez       — pastdagi doimiy menyuda alohida tugma bo'ladi (eng ko'p
 *               ishlatiladiganlari). Qolganlari "Boshqa ish" ichida turadi,
 *               aks holda menyu uzayib ketardi.
 *   izohShart — nima qilganini yozib berish majburiy
 */
export const ISH_TURLARI = {
  musor: {
    nom: "Musor", emoji: "♻️", matn: "musorni tashlab keldi", tugma: "Musor tashladim",
    ball: 3, tez: true, izohShart: false,
  },
  hammom: {
    nom: "Hammom", emoji: "🧹", matn: "hammomni tozaladi", tugma: "Hammom tozaladim",
    ball: 15, tez: true, izohShart: false,
  },
  oshxona: {
    nom: "Oshxona", emoji: "🍽", matn: "oshxonani tozaladi", tugma: "Oshxona tozaladim",
    ball: 15, tez: true, izohShart: false,
  },
  xona: {
    nom: "Xona", emoji: "🛏", matn: "o'z xonasini tozaladi", tugma: "O'z xonamni tozaladim",
    ball: 5, tez: true, izohShart: false,
  },
  tamir: {
    nom: "Ta'mirlash", emoji: "🔧", matn: "uyda biror narsani ta'mirladi", tugma: "Nimadurni ta'mirladim",
    ball: 10, tez: true, izohShart: true,
  },
  boshqa: {
    nom: "Boshqa", emoji: "➕", matn: "boshqa foydali ish qildi", tugma: "Boshqa ish",
    ball: 10, tez: false, izohShart: true,
  },
} as const;

export type IshTuri = keyof typeof ISH_TURLARI;

/**
 * Navbat davomida bajarilishi SHART bo'lgan vazifalar — har biriga alohida
 * tugma va rasm. `ISH_TURLARI`dan farqli: bular istalgan payt qo'shimcha
 * ball uchun emas, aynan shu navbatni yakunlash uchun MAJBURIY. Nomlari
 * ataylab `ISH_TURLARI` bilan bir xil — emoji/nom ikkinchi marta
 * yozilmaydi, o'sha yerdan olinadi.
 */
export const NAVBAT_ISHLARI = ["xona", "hammom", "oshxona", "musor"] as const;
export type NavbatIshi = (typeof NAVBAT_ISHLARI)[number];

/**
 * Har bir majburiy vazifa uchun nechta dalil rasmi kerakligi. Standart 1 —
 * hammom kattaroq ish bo'lgani uchun 3 ta (turli burchak) talab qilinadi.
 * Rasm soni shu yerdan olinadi, hech qayerda qattiq yozilgan "3" yo'q.
 */
export const NAVBAT_RASM_SONI: Record<NavbatIshi, number> = {
  xona: 1,
  hammom: 3,
  oshxona: 1,
  musor: 1,
};

/** Pastdagi doimiy menyuda tugmasi bor turlar. */
export const TEZ_ISHLAR = (Object.keys(ISH_TURLARI) as IshTuri[]).filter(
  (t) => ISH_TURLARI[t].tez,
);

/** "Boshqa ish" ro'yxatida chiqadiganlar. */
export const SEKIN_ISHLAR = (Object.keys(ISH_TURLARI) as IshTuri[]).filter(
  (t) => !ISH_TURLARI[t].tez,
);

/**
 * Ball tizimi. O'lchov: taxminan 2 daqiqa ish = 1 ball.
 *
 *   musor tashlash   ~5 daqiqa   →  3 ball
 *   oshxona/hammom   ~30 daqiqa  → 15 ball
 *   butun kvartira   ~2 soat     → 60 ball (XONAGA beriladi)
 *
 * Navbat balli xona a'zolari soniga bo'linadi: 2 kishilik xona bir xil
 * ishni kam odam bilan bajaradi, demak har biriga ko'proq tegadi.
 *   2 kishilik xona → 30 ball, 3 kishilik → 20, 4 kishilik → 15
 *
 * Xarajat balli tozalashdan biroz yuqori — chunki pul ham ketadi.
 */
export const BALLAR = {
  /** Bitta navbat uchun xonaga beriladigan umumiy ball */
  navbatXona: 60,
  /** Muddatdan oldin tugatgan har bir a'zoga qo'shimcha */
  vaqtidaBonus: 10,
  /** Kechikkan har kun uchun har bir a'zodan ayiriladi */
  kechikishJarima: 10,
  /** Uyga narsa olib kelgani uchun */
  xarajat: 10,
  /** Boshqa xonaning ishini tasdiqlagani uchun */
  tasdiq: 1,
  /**
   * Sababchi tuzatish uchun berilgan imkoniyatdan foydalanmasa (admin
   * "Tuzatilmadi" deb belgilasa) ayiriladigan ball.
   */
  shikoyatJarima: 20,
} as const;

/**
 * Anonim shikoyat yozilganda kim sabab bo'lgani qanchalik aniqligi.
 * Reporter o'zi qanchalik ishonchli ekanini belgilaydi, admin esa buni
 * ko'rib chiqib kerak bo'lsa o'zgartiradi.
 */
export const ISHONCH_DARAJASI = {
  aniq: { emoji: "✅", nom: "Aniq bilaman" },
  gumon: { emoji: "🤔", nom: "Gumonim bor" },
  nomalum: { emoji: "❓", nom: "Bilmayman" },
} as const;

export type Ishonch = keyof typeof ISHONCH_DARAJASI;

/** Uyning qaysi joyiga tegishli — shikoyat yozilganda va guruh xabarida ko'rsatiladi. */
export const SHIKOYAT_JOYLARI = {
  oshxona: { emoji: "🍽", nom: "Oshxona" },
  hammom: { emoji: "🚿", nom: "Hammom" },
  umumiy: { emoji: "🛋", nom: "Umumiy joy" },
  xona: { emoji: "🛏", nom: "Xonalardan biri" },
  boshqa: { emoji: "📍", nom: "Boshqa" },
} as const;

export type ShikoyatJoyi = keyof typeof SHIKOYAT_JOYLARI;

/**
 * Kvartira to'lovi — standart qiymatlar. Haqiqiy qiymat har doim
 * `settings` jadvalidan o'qiladi (`core/tolov.ts`), bu yerdagi faqat hali
 * hech kim o'zgartirmagan holatdagi standart — xuddi `guruhId()` .env
 * bilan settings orasidagi naqsh kabi.
 */
export const TOLOV_STD = {
  /** Har kishidan talab qilinadigan summa (so'm) */
  talab: 900_000,
  qabulQiluvchi: "Sorabek",
  karta: "9860350143875127",
} as const;
