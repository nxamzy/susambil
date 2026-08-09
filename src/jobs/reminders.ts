import type { Api } from "grammy";
import { sql } from "../db/index.js";
import { config } from "../config.js";
import { faolNavbat, kechikkanKun } from "../core/rotation.js";
import { guruhgaYubor, shaxsiy } from "../bot/group.js";
import { esc, ismlar, pul, sana } from "../bot/text.js";

const KUN_MS = 86_400_000;

/** Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD). */
function bugun(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

/**
 * Vercel Cron orqali kuniga bir marta ishga tushadi (vercel.json:
 * "0 4 * * *" — 09:00 Toshkent). Bu degani: agar biror sabab bilan
 * (Telegram vaqtinchalik ishlamasa, guruh sozlanmagan bo'lsa) shu
 * kunlik chaqiruvda yuborish muvaffaqiyatsiz bo'lsa, keyingi urinish
 * FAQAT ERTAGA bo'ladi — shuning uchun pastdagi ikkala blok ham
 * "yuborildi" belgisini FAQAT haqiqatan yetkazilganda qo'yadi
 * (`guruhga` natijasini tekshirib), aks holda muvaffaqiyatsizlik
 * abadiy o'tkazib yuborilgan bo'lib qolardi.
 *
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

    const guruhga = await guruhgaYubor(api, matn);
    for (const a of azolar) await shaxsiy(api, a, matn);

    // Faqat asosiy kanal (guruh) ga yetgandagina "yuborildi" deb
    // belgilaymiz. Aks holda bir martalik muvaffaqiyatsizlik shu
    // eslatmani butunlay o'tkazib yuborardi — bu tekshiruv faqat
    // "muddatgacha 1 kun qolgan" tor oynada ishlaydi, keyingi chaqiruvda
    // odatda bu shart allaqachon yolg'on bo'lib qoladi (muddat o'tib
    // ketgani uchun 2-blokka tushadi). eslatildi=FALSE qolsa, oyna hali
    // ochiq ekan, keyingi chaqiruv qayta urinadi.
    if (guruhga) await sql`UPDATE turns SET eslatildi = TRUE WHERE id = ${turn.id}`;
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

    const guruhga = await guruhgaYubor(api, matn);
    for (const a of azolar) await shaxsiy(api, a, matn);

    // Xuddi yuqoridagi kabi — faqat guruhga yetganda "bugun yuborildi"
    // deb belgilaymiz, aks holda ertaga emas, shu kunning o'zida keyingi
    // chaqiruvda qayta urinilishi kerak.
    if (guruhga) await sql`UPDATE turns SET oxirgi_ping = ${kun}::date WHERE id = ${turn.id}`;
  }
}
