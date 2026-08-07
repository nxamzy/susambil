import type { Api } from "grammy";
import { sql } from "../db/index.js";
import { config } from "../config.js";
import { faolNavbat, kechikkanKun } from "../core/rotation.js";
import { pul } from "../core/kassa.js";
import { guruhgaYubor, shaxsiy } from "../bot/group.js";
import { esc, ismlar, sana } from "../bot/text.js";

const KUN_MS = 86_400_000;

/** Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD). */
function bugun(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

/**
 * Har soatda ishlaydi:
 *  - muddat tugashiga 1 kun qolganda bir marta eslatadi
 *  - muddat o'tgan bo'lsa kuniga bir marta ogohlantiradi
 */
export async function eslatmalarniTekshir(api: Api): Promise<void> {
  const n = await faolNavbat();
  if (!n) return;

  const { turn, room, azolar } = n;
  const muddat = new Date(turn.muddat);
  const hozir = Date.now();

  // 1) Muddatgacha 1 kun qoldi
  if (!turn.eslatildi && hozir >= muddat.getTime() - config.eslatmaKuni * KUN_MS && hozir < muddat.getTime()) {
    const matn = [
      `⏰ <b>Eslatma: ${room.raqam}-xona</b>`,
      ``,
      `👤 ${esc(ismlar(azolar))}`,
      `📅 Muddat ertaga tugaydi — ${sana(muddat)}`,
      ``,
      `Kechiksangiz har kun uchun ${pul(config.jarimaKunlik)} jarima yoziladi.`,
      `Tozalagach shu guruhga ${config.minRasm} ta rasm tashlang.`,
    ].join("\n");

    await guruhgaYubor(api, matn);
    for (const a of azolar) await shaxsiy(api, a, matn);

    await sql`UPDATE turns SET eslatildi = TRUE WHERE id = ${turn.id}`;
    return;
  }

  // 2) Muddat o'tdi — kuniga bir marta
  if (hozir > muddat.getTime()) {
    const kun = bugun();
    const oxirgi = turn.oxirgi_ping
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(turn.oxirgi_ping))
      : null;
    if (oxirgi === kun) return;

    const kechikdi = kechikkanKun(muddat);
    const matn = [
      `🔴 <b>${room.raqam}-xona kechikdi — ${kechikdi} kun</b>`,
      ``,
      `👤 ${esc(ismlar(azolar))}`,
      `💸 Hozircha jarima: <b>${pul(kechikdi * config.jarimaKunlik)}</b>`,
      ``,
      `Har o'tgan kun uchun yana ${pul(config.jarimaKunlik)} qo'shiladi.`,
      `Navbat siz tugatmaguningizcha keyingi xonaga o'tmaydi.`,
    ].join("\n");

    await guruhgaYubor(api, matn);
    for (const a of azolar) await shaxsiy(api, a, matn);

    await sql`UPDATE turns SET oxirgi_ping = ${kun}::date WHERE id = ${turn.id}`;
  }
}
