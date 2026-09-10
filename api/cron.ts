import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Bot } from "grammy";
import { config } from "../src/config.js";
import { eslatmalarniTekshir } from "../src/jobs/reminders.js";
import { oylikHisobot } from "../src/jobs/monthly.js";
import { kunQismlari } from "../src/core/vaqt.js";

/**
 * Kunlik/soatlik tetiklovchi. `eslatmalarniTekshir` — barcha eslatmalarning
 * yagona kirish nuqtasi (`jobs/reminders.ts`), bu yerda ikkinchi
 * rejalashtiruvchi yaratilmagan.
 *
 * MUHIM — bu yerda `sql.end()` CHAQIRILMAYDI. Ilgari `finally` blokida
 * `sql.end({ timeout: 5 })` turardi: u har bir invocation'dan keyin
 * `db/index.ts`dagi ULASHMA POOLINI yopardi. Pool esa modul darajasida,
 * ya'ni bitta issiq Vercel instansiyasidagi HAMMA so'rov (shu jumladan ayni
 * paytda ishlayotgan `api/webhook.ts`) uni baham ko'radi — natijada cron
 * ishlagan zahoti ketayotgan boshqa so'rovlar `CONNECTION_ENDED` bilan
 * yiqilardi. Bo'sh ulashmalar `postgres.js` ning o'z `idle_timeout`i bilan
 * yopiladi, qo'lda yopish kerak emas.
 *
 * Yangi `api/*` kirish nuqtasi qo'shsangiz: boshqa parallel invocation'lar
 * hali ishlatayotgan resursni tozalamang.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron so'rovni CRON_SECRET bilan imzolaydi
  const kutilgan = process.env.CRON_SECRET;
  if (kutilgan && req.headers.authorization !== `Bearer ${kutilgan}`) {
    return res.status(401).json({ xato: "ruxsat yo'q" });
  }

  const bot = new Bot(config.botToken);
  await bot.init();

  const bajarildi: string[] = [];
  await eslatmalarniTekshir(bot.api);
  bajarildi.push("eslatmalar");

  if (kunQismlari().kun === 1) {
    await oylikHisobot(bot.api);
    bajarildi.push("oylik hisobot");
  }

  return res.status(200).json({ ok: true, bajarildi });
}
