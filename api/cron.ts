import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Bot } from "grammy";
import { config } from "../src/config.js";
import { eslatmalarniTekshir } from "../src/jobs/reminders.js";
import { oylikHisobot } from "../src/jobs/monthly.js";
import { sql } from "../src/db/index.js";
import { kunQismlari } from "../src/core/vaqt.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron so'rovni CRON_SECRET bilan imzolaydi
  const kutilgan = process.env.CRON_SECRET;
  if (kutilgan && req.headers.authorization !== `Bearer ${kutilgan}`) {
    return res.status(401).json({ xato: "ruxsat yo'q" });
  }

  const bot = new Bot(config.botToken);
  await bot.init();

  const bajarildi: string[] = [];
  try {
    await eslatmalarniTekshir(bot.api);
    bajarildi.push("eslatmalar");

    if (kunQismlari().kun === 1) {
      await oylikHisobot(bot.api);
      bajarildi.push("oylik hisobot");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  return res.status(200).json({ ok: true, bajarildi });
}
