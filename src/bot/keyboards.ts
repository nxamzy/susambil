import { InlineKeyboard } from "grammy";
import { ISH_TURLARI, type IshTuri } from "../config.js";

export function tasdiqKeyboard(submissionId: number, soni: number, kerak: number): InlineKeyboard {
  return new InlineKeyboard().text(
    `✅ Tasdiqlayman (${soni}/${kerak})`,
    `tasdiq:${submissionId}`,
  );
}

/** Guruhga pin qilinadigan (va botda ham chiqadigan) asosiy panel. */
export function panelKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of Object.keys(ISH_TURLARI) as IshTuri[]) {
    kb.text(`${ISH_TURLARI[t].emoji} ${ISH_TURLARI[t].tugma}`, `ish:${t}`).row();
  }
  kb.text("📋 Navbat kimda?", "korish:navbat");
  kb.text("🛒 Xarajat", "korish:xarajat").row();
  kb.text("🏆 Reyting", "korish:reyting");
  kb.text("🕘 Tarix", "korish:tarix");
  return kb;
}

export function bekorKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✖️ Bekor qilish", "bekor");
}

export function ismTanlashKeyboard(odamlar: { id: number; ism: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(o.ism, `men:${o.id}`).row();
  kb.text("➕ Men yangi a'zoman", "yangiazo");
  return kb;
}

export function xonaTanlashKeyboard(raqamlar: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of raqamlar) kb.text(`${r}-xona`, `yangixona:${r}`);
  kb.row().text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Botga o'tkazadigan havola — guruhdan bir bosishda xarajat qo'shish uchun. */
export function xarajatQoshishKeyboard(botUsername: string): InlineKeyboard {
  return new InlineKeyboard().url(
    "➕ Men ham olib keldim",
    `https://t.me/${botUsername}?start=xarajat`,
  );
}
