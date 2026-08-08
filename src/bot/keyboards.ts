import { InlineKeyboard, Keyboard } from "grammy";
import { ISH_TURLARI, type IshTuri } from "../config.js";

/** Ish tugmasining yozuvi — inline va doimiy menyuda bir xil bo'lsin. */
export function ishTugmasi(t: IshTuri): string {
  const i = ISH_TURLARI[t];
  return `${i.emoji} ${i.tugma}`;
}

/** Doimiy menyudagi ko'rinish tugmalari. */
export const MENYU = {
  navbat: "📋 Navbat kimda?",
  xarajat: "🛒 Xarajat",
  reyting: "🏆 Reyting",
  tarix: "🕘 Tarix",
  tanishtirish: "ℹ️ Qanday ishlaydi?",
} as const;

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
  for (const t of Object.keys(ISH_TURLARI) as IshTuri[]) kb.text(ishTugmasi(t)).row();
  kb.text(MENYU.navbat).text(MENYU.xarajat).row();
  kb.text(MENYU.reyting).text(MENYU.tarix).row();
  kb.text(MENYU.tanishtirish);
  return kb.resized().persistent();
}

export function tasdiqKeyboard(submissionId: number, soni: number, kerak: number): InlineKeyboard {
  const qoldi = Math.max(0, kerak - soni);
  const matn =
    qoldi === 0
      ? "✅ Tasdiqlandi"
      : `✅ Tasdiqlayman  ·  yana ${qoldi} kishi kerak`;
  return new InlineKeyboard().text(matn, `tasdiq:${submissionId}`);
}

/** Guruhga pin qilinadigan (va botda ham chiqadigan) asosiy panel. */
export function panelKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of Object.keys(ISH_TURLARI) as IshTuri[]) kb.text(ishTugmasi(t), `ish:${t}`).row();
  kb.text("📋 Navbat kimda?", "korish:navbat");
  kb.text("🛒 Xarajat", "korish:xarajat").row();
  kb.text("🏆 Reyting", "korish:reyting");
  kb.text("🕘 Tarix", "korish:tarix").row();
  kb.text("ℹ️ Bu bot qanday ishlaydi?", "korish:tanishtirish");
  return kb;
}

export function bekorKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✖️ Bekor qilish", "bekor");
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
