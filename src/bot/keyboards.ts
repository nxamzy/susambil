import { InlineKeyboard, Keyboard } from "grammy";
import {
  ISH_TURLARI,
  ISHONCH_DARAJASI,
  SEKIN_ISHLAR,
  TEZ_ISHLAR,
  type Ishonch,
  type IshTuri,
} from "../config.js";

/** Ish tugmasining yozuvi — inline va doimiy menyuda bir xil bo'lsin. */
export function ishTugmasi(t: IshTuri): string {
  const i = ISH_TURLARI[t];
  return `${i.emoji} ${i.tugma}`;
}

/** Doimiy menyudagi ko'rinish tugmalari. */
export const MENYU = {
  navbat: "📋 Navbat",
  xarajat: "💰 Xarajatlar",
  reyting: "🏆 Reyting",
  profil: "👤 Profil",
  azolar: "👥 A'zolar",
  tarix: "🕘 Tarix",
  tanishtirish: "ℹ️ Qanday ishlaydi?",
} as const;

/** Menyudagi tugmasi yo'q ish turlarini ochadigan tugma. */
export const BOSHQA_ISH = "➕ Boshqa ish";

/**
 * Muammo yozib qo'yish tugmasi. Ataylab faqat shaxsiy chatdagi doimiy
 * menyuda — guruh paneliga qo'shilmagan, chunki bu yerdagi butun oqim
 * (izoh, kim ekani) shaxsiy suhbatda o'tishi shart.
 */
export const MUAMMO_TUGMA = "📝 Muammo yozish";

/** Yozuv bo'yicha ish turini topadi (doimiy menyu tugmasi bosilganda). */
export function tugmaIshTuri(matn: string): IshTuri | null {
  for (const t of Object.keys(ISH_TURLARI) as IshTuri[]) {
    if (ishTugmasi(t) === matn) return t;
  }
  return null;
}

/**
 * Shaxsiy chatdagi doimiy tugmalar — yozish maydonining ostida turadi va
 * hech qachon yo'qolmaydi. Guruhda ishlatilmaydi: u yerda tugmalar hammaga
 * ko'rinib, chatni bosib qo'yardi — guruh uchun `panelKeyboard()` bor.
 */
export function menyuKeyboard(): Keyboard {
  const kb = new Keyboard();
  for (const t of TEZ_ISHLAR) kb.text(ishTugmasi(t)).row();
  kb.text(BOSHQA_ISH).row();
  kb.text(MENYU.navbat).text(MENYU.xarajat).row();
  kb.text(MENYU.reyting).text(MENYU.profil).row();
  kb.text(MENYU.azolar).text(MENYU.tarix).row();
  kb.text(MENYU.tanishtirish).row();
  kb.text(MUAMMO_TUGMA);
  return kb.resized().persistent();
}

/** Menyuda tugmasi yo'q ish turlari. */
export function boshqaIshKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of SEKIN_ISHLAR) kb.text(ishTugmasi(t), `ish:${t}`).row();
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/**
 * Guruhdagi tasdiqlash tugmalari. Rad etish ham shu yerda — ilgari ishni
 * qaytarishning yo'li yo'q edi.
 */
export function tasdiqKeyboard(submissionId: number, soni: number, kerak: number): InlineKeyboard {
  const qoldi = Math.max(0, kerak - soni);
  const matn =
    qoldi === 0 ? "✅ Tasdiqlandi" : `✅ Tasdiqlayman  ·  yana ${qoldi} kishi kerak`;
  return new InlineKeyboard()
    .text(matn, `tasdiq:${submissionId}`)
    .row()
    .text("✖️ Rad etish", `rad:${submissionId}`);
}

/** Guruhga pin qilinadigan (va botda ham chiqadigan) asosiy panel. */
export function panelKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of TEZ_ISHLAR) kb.text(ishTugmasi(t), `ish:${t}`).row();
  kb.text(BOSHQA_ISH, "korish:boshqaish").row();
  kb.text(MENYU.navbat, "korish:navbat");
  kb.text(MENYU.xarajat, "korish:xarajat").row();
  kb.text(MENYU.reyting, "korish:reyting");
  kb.text(MENYU.profil, "korish:profil").row();
  kb.text(MENYU.azolar, "korish:azolar");
  kb.text(MENYU.tarix, "korish:tarix").row();
  kb.text("ℹ️ Bu bot qanday ishlaydi?", "korish:tanishtirish");
  return kb;
}

export function bekorKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✖️ Bekor qilish", "bekor");
}

/**
 * Rasm kutilayotgandagi tugmalar. "Rasmim yo'q" kerak, chunki ba'zi ishning
 * (masalan musor tashlash) rasmini olish qiyin — u holda ish baribir guruh
 * tasdig'iga chiqadi, faqat rasmsiz.
 */
export function rasmKutishKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📷 Rasmim yo'q — shundoq yuboraman", "rasmsiz")
    .row()
    .text("✖️ Bekor qilish", "bekor");
}

export function ismTanlashKeyboard(odamlar: { id: number; ism: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(`👤 ${o.ism}`, `men:${o.id}`).row();
  kb.text("➕ Men yangi a'zoman", "yangiazo");
  return kb;
}

export function xonaTanlashKeyboard(raqamlar: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of raqamlar) kb.text(`🚪 ${r}-xona`, `yangixona:${r}`);
  kb.row().text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Guruhdan bir bosishda xarajat qo'shish uchun botga havola. */
export function xarajatQoshishKeyboard(botUsername: string): InlineKeyboard {
  return new InlineKeyboard().url(
    "➕ Men ham olib keldim",
    `https://t.me/${botUsername}?start=xarajat`,
  );
}

/** Tanishtirishdan keyin panelga qaytish. */
export function panelgaKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🏠 Panelga qaytish", "korish:panel");
}

/** Muammo: sababchi qanchalik aniq ekanini tanlash. */
export function ishonchKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const d of Object.keys(ISHONCH_DARAJASI) as Ishonch[]) {
    const i = ISHONCH_DARAJASI[d];
    kb.text(`${i.emoji} ${i.nom}`, `muammo_ishonch:${d}`).row();
  }
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Muammo: "aniq"/"gumon" tanlangach kimni tanlash — bitta qatorda bitta odam. */
export function muammoKimKeyboard(odamlar: { id: number; ism: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(`👤 ${o.ism}`, `muammo_kim:${o.id}`).row();
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/**
 * Muammo: rasm so'ralganda. Callback nomi ("muammo_rasmsiz") ish
 * oqimidagi "rasmsiz" bilan atayin bir xil emas — ular ikki xil holatni
 * (`Flow.tur`) tekshiradi, bitta nom ishlatilsa xato oqimga tushib qolardi.
 */
export function muammoRasmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📷 Rasmim yo'q — shundoq yuboraman", "muammo_rasmsiz")
    .row()
    .text("✖️ Bekor qilish", "bekor");
}

/**
 * Adminga yuboriladigan muammo xabaridagi harakatlar. To'rttasi ham hali
 * hal qilinmagan holatda ko'rinadi; qaror chiqqach panelniYangila() bularni
 * bo'sh klaviatura bilan almashtiradi.
 */
export function muammoAdminKeyboard(reportId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Tasdiqlash", `muammo_tasdiq:${reportId}`)
    .text("➖ Rad etish", `muammo_rad:${reportId}`)
    .row()
    .text("👤 Boshqa odam", `muammo_qayta:${reportId}`)
    .text("✏️ Izoh qo'shish", `muammo_izoh:${reportId}`);
}

/** Admin "👤 Boshqa odam" bosganda — hammani ko'rsatadi, o'zini chetlab o'tirmaydi. */
export function muammoQaytaKeyboard(
  reportId: number,
  odamlar: { id: number; ism: string }[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(`👤 ${o.ism}`, `muammo_belgila:${reportId}:${o.id}`).row();
  kb.text("❓ Hech kim (noma'lum)", `muammo_notanilgan:${reportId}`).row();
  kb.text("⬅️ Bekor qilish", `muammo_qayta_bekor:${reportId}`);
  return kb;
}
