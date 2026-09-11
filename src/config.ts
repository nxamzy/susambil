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

  /**
   * Kvartira puli oyning shu kunigacha to'liq yig'ilgan bo'lishi kerak —
   * uy egasiga aynan shu kuni to'lanadi.
   *
   * Muddat KUN OXIRIGACHA hisoblanadi: 15-kuni kelgan pul ham vaqtida
   * qabul qilinadi, holat esa 16-kuniga o'tganda yakuniy suratga olinadi.
   * Ataylab shunday — "15-gacha to'lang" deyilgan bo'lsa, 15-kuni ertalab
   * to'lagan odamni kechikkan deb belgilash noto'g'ri bo'lardi.
   */
  tolovMuddatKuni: 15,

  /**
   * To'lov ogohlantirishi muddatga shuncha kun qolganda boshlanadi — ya'ni
   * 15-kun muddati uchun oyning 12-kunidan.
   *
   * Kuniga BIR MARTA yuboriladi (navbat eslatmasidagi 5 soatlik chastota bu
   * yerga to'g'ri kelmaydi — pul masalasi kunlik ritmda bo'ladi), lekin
   * xabarning KUCHI har kuni oshib boradi: 3 kun → 2 kun → 1 kun → bugun →
   * kechikdi (`bot/text.ts` `eslatmaShoshilinchligi`). Ya'ni "bezovta
   * qilmaslik" chastotani kamaytirish bilan, "e'tibordan qochmaslik" esa
   * ohangni kuchaytirish bilan hal qilingan.
   *
   * Muddat o'tib ketsa qarzi borlarga davom etadi, to'liq to'laganlarga esa
   * darhol to'xtaydi.
   */
  tolovEslatmaKuni: 3,

  /**
   * Pul yig'imida to'lamaganlarga eslatma necha soatda bir qaytariladi.
   *
   * Navbatning `eslatmaOraligiSoat`idan ATAYLAB alohida sozlama, garchi
   * ikkalasining standarti ham 5 bo'lsa-da: biri tozalash navbatiga, biri
   * pulga tegishli va admin ularni bir-biridan mustaqil sozlay olishi
   * kerak. Oylik kvartira to'lovi esa KUNLIK ritmda qoladi
   * (`tolovEslatmaKuni`) — u yerda muddat oyning aniq kuni, bu yerda esa
   * "yig'ilguncha" degan ochiq oyna.
   */
  yigimEslatmaSoat: 5,

  /** Yangi yig'im boshlanganda standart muddat (bugundan necha kun). */
  yigimMuddatKuni: 3,
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
 * Navbat davomida bajarilishi SHART bo'lgan vazifalar ENDI SHU YERDA EMAS.
 *
 * Ilgari bu yerda `NAVBAT_ISHLARI` (literal union) va `NAVBAT_RASM_SONI`
 * turardi — ya'ni uyda ikkinchi hammom paydo bo'lsa yoki bitta vazifaga
 * kerakli rasm soni o'zgarsa, kodni tahrirlab qayta deploy qilish kerak
 * edi. Endi ular `navbat_vazifalari` jadvalida va admin panelidan
 * boshqariladi (`core/vazifalar.ts`) — xuddi `tolov_talab`/`karta`
 * `settings` jadvaliga ko'chirilgani kabi. Standart to'rttalik ro'yxat
 * `db/schema.sql` ichida bir marta seed qilinadi.
 *
 * `ISH_TURLARI` esa O'ZGARMADI: u — ixtiyoriy qo'shimcha ishlar (ball
 * uchun, istalgan payt), navbat vazifalari bilan bir xil narsa emas.
 * Ikkalasi ilgari nom/emojini baham ko'rardi, aynan shu bog'liqlik ikkita
 * hammom qo'shishga to'sqinlik qilardi — endi navbat vazifasining o'z
 * nomi va emojisi bazada.
 */

/**
 * Bitta MARTA (bitta vazifa topshirig'i yoki qo'shimcha ish) uchun
 * saqlanadigan rasmlarning qattiq chegarasi.
 *
 * Vazifadagi `rasm_soni` — MINIMUM ("shuncha kelmaguncha yopib bo'lmaydi"),
 * bu esa faqat texnik yuqori chegara. Oradagi ortiqcha rasmlar RAD
 * ETILMAYDI: talab "qancha bo'lsa yuborsa bo'ladi, faqat kerakli sondan kam
 * emas". Ilgari 10 edi va `rasm_soni`ning o'zi ham shunga bog'lanardi.
 */
export const RASM_MAX = 20;

/**
 * Admin `rasm_soni`ni tanlaydigan eng katta qiymat — bazadagi CHECK bilan
 * bir xil. `RASM_MAX`dan ATAYLAB alohida: biri "eng kam talab", ikkinchisi
 * "eng ko'p saqlanadi".
 */
export const RASM_SONI_MAX = 10;

/** Vazifa bir navbatda ko'pi bilan shuncha marta takrorlanishi mumkin. */
export const TAKROR_MAX = 10;

/**
 * Vazifaning "oraliq eslatma" boshlanish kuni (navbat boshlanganidan).
 * 0 = o'chiq. Bazadagi CHECK (`oraliq_kun BETWEEN 0 AND 30`) bilan bir xil.
 */
export const ORALIQ_KUN_MAX = 30;

/** Telegram bitta media-guruhga sig'diradigan rasm soni — texnik chegara. */
export const ALBOM_MAX = 10;

/**
 * Guruhga yuboriladigan rasmlarning eng ko'p soni. Vazifalar soni va har
 * biriga kerakli rasm endi admin qo'lida bo'lgani uchun jami rasm ancha
 * ko'p bo'lishi mumkin — guruh cheksiz albom bilan to'lib ketmasin.
 */
export const GURUH_ALBOM_MAX = 30;

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

  /**
   * Muddatda yig'ilmay qolgan summadan olinadigan jarima foizi.
   *
   * STANDART 0 — ya'ni jarima O'CHIQ. Bu ataylab: uyning mavjud jarima
   * qoidalari faqat TOZALASH NAVBATI kechikishini belgilaydi
   * (`jarimaKunlik`), kvartira to'lovi uchun esa hech qanday kelishilgan
   * qoida yo'q. Bot o'zicha moliyaviy qoida o'ylab chiqarmaydi — buning
   * o'rniga muddatda qancha yetmagani adminga ochiq ko'rsatiladi, foizni
   * esa admin `/tolovjarima` bilan o'zi belgilaydi.
   *
   * `jarimaKunlik` bilan bir xil falsafa: bot kassa yuritmaydi, summa
   * faqat ma'lumot uchun ko'rsatiladi.
   */
  jarimaFoiz: 0,
} as const;
