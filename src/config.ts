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

  /** Muddat tugashiga necha kun qolganda eslatilsin */
  eslatmaKuni: 1,

  /** Ishni qabul qilish uchun kerak bo'lgan tasdiqlar soni */
  kerakliTasdiq: 3,

  /** Rasmning minimal soni */
  minRasm: 3,

  /** Kechikkan har bir kun uchun jarima (so'm). Faqat reytingda ko'rsatiladi —
   *  bot pul hisobini yuritmaydi. */
  jarimaKunlik: 10_000,
} as const;

/**
 * Qo'shimcha ish turlari.
 *
 *   tez       — pastdagi doimiy menyuda alohida tugma bo'ladi (eng ko'p
 *               ishlatiladiganlari). Qolganlari "Boshqa ish" ichida turadi,
 *               aks holda menyu uzayib ketardi.
 *   izohShart — nima qilganini yozib berish majburiy
 */
export const ISH_TURLARI = {
  musor: {
    emoji: "♻️", matn: "musorni tashlab keldi", tugma: "Musor tashladim",
    ball: 3, tez: true, izohShart: false,
  },
  hammom: {
    emoji: "🧹", matn: "hammomni tozaladi", tugma: "Hammom tozaladim",
    ball: 15, tez: true, izohShart: false,
  },
  oshxona: {
    emoji: "🍽", matn: "oshxonani tozaladi", tugma: "Oshxona tozaladim",
    ball: 15, tez: true, izohShart: false,
  },
  xona: {
    emoji: "🛏", matn: "o'z xonasini tozaladi", tugma: "O'z xonamni tozaladim",
    ball: 5, tez: true, izohShart: false,
  },
  tamir: {
    emoji: "🔧", matn: "uyda biror narsani ta'mirladi", tugma: "Nimadurni ta'mirladim",
    ball: 10, tez: true, izohShart: true,
  },
  boshqa: {
    emoji: "➕", matn: "boshqa foydali ish qildi", tugma: "Boshqa ish",
    ball: 10, tez: false, izohShart: true,
  },
} as const;

export type IshTuri = keyof typeof ISH_TURLARI;

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
