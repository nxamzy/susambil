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

export const ISH_TURLARI = {
  musor: { emoji: "♻️", matn: "musorni tashlab keldi", tugma: "Musor tashladim", ball: 3 },
  hammom: { emoji: "🚿", matn: "hammomni tozaladi", tugma: "Hammom tozaladim", ball: 15 },
  oshxona: { emoji: "🍽", matn: "oshxonani tozaladi", tugma: "Oshxona tozaladim", ball: 15 },
} as const;

export type IshTuri = keyof typeof ISH_TURLARI;

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
  xarajat: 20,
  /** Boshqa xonaning ishini tasdiqlagani uchun */
  tasdiq: 1,
} as const;
