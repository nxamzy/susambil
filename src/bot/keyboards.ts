import { InlineKeyboard } from "grammy";
import { ISH_TURLARI, type IshTuri } from "../config.js";

export function tasdiqKeyboard(submissionId: number, soni: number, kerak: number): InlineKeyboard {
  return new InlineKeyboard().text(
    `✅ Tasdiqlayman (${soni}/${kerak})`,
    `tasdiq:${submissionId}`,
  );
}

/** Guruhga pin qilinadigan doimiy panel — hamma shu yerdan bosadi. */
export function panelKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  const turlar = Object.keys(ISH_TURLARI) as IshTuri[];
  for (const t of turlar) {
    kb.text(`${ISH_TURLARI[t].emoji} ${ISH_TURLARI[t].tugma}`, `ish:${t}`).row();
  }
  kb.text("📋 Navbat kimda?", "korish:navbat");
  kb.text("💰 Kassa", "korish:kassa").row();
  kb.text("🏆 Reyting", "korish:reyting");
  kb.text("🕘 Tarix", "korish:tarix");
  return kb;
}

export function ismTanlashKeyboard(
  odamlar: { id: number; ism: string }[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(o.ism, `men:${o.id}`).row();
  return kb;
}
