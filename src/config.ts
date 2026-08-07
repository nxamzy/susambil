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

  /** Kechikkan har bir kun uchun jarima (so'm). Jarima XONAGA yoziladi va
   *  xona a'zolari o'rtasida teng bo'linadi. */
  jarimaKunlik: 10_000,

  /** Oylik yig'im (har oyning 1-sanasida har bir odamga yoziladi) */
  oylikYigim: 10_000,

  /** Xarajat qilgan odamning puli hammaga teng bo'linadimi */
  xarajatBolinadi: true,
} as const;

export const ISH_TURLARI = {
  musor: { emoji: "♻️", matn: "musorni tashlab keldi", tugma: "Musor tashladim" },
  hammom: { emoji: "🚿", matn: "hammomni tozaladi", tugma: "Hammom tozaladim" },
  oshxona: { emoji: "🍽", matn: "oshxonani tozaladi", tugma: "Oshxona tozaladim" },
} as const;

export type IshTuri = keyof typeof ISH_TURLARI;
