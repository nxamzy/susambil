import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { webhookCallback } from "grammy";
import { botYarat } from "../src/bot/index.js";
import { eslatmalarniTekshir } from "../src/jobs/reminders.js";

/**
 * Telegram shu manzilga yangilanishlarni yuboradi.
 * Manzilni o'rnatish: npm run webhook:set
 */
const bot = botYarat();

const handleUpdate = webhookCallback(bot, "https", {
  // Telegram javobni 60 soniyagacha kutadi; undan oshsa qayta yuboradi
  timeoutMilliseconds: 55_000,
});

/**
 * Vercel Cron (`/api/cron`) Hobby rejada kuniga FAQAT bir marta ishga
 * tushadi — 5 soatlik navbat eslatmasi uchun bu yetarli emas. Shuning
 * uchun har bir kelgan yangilanishda ham eslatmalarni tekshiramiz: guruh
 * qanchalik faol bo'lsa, eslatma shunchalik tez-tez (deyarli real vaqtda)
 * yuboriladi. Asosiy kafolatlangan tetiklovchi — soatlik GitHub Actions
 * ping (`.github/workflows/eslatma.yml`); bu yerdagi tekshiruv qo'shimcha
 * tezlashtiruvchi, ikkinchi eslatma tizimi emas — bir xil
 * `eslatmalarniTekshir` funksiyasi, DB-driven va necha marta chaqirilsa
 * ham xavfsiz.
 *
 * MUHIM: `handleUpdate` javobni yuborgach (res.end()) Vercel funksiya
 * bajarilishini SHU YERDA tugagan deb hisoblab, keyingi kodni to'xtatib
 * qo'yishi mumkin — oddiy `await` bunga kafolat bermaydi. Shuning uchun
 * eslatma tekshiruvi `waitUntil()` ichida — bu Vercel'ga javob
 * yuborilgandan keyin ham shu ishni oxirigacha bajarishni aytadi.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleUpdate(req, res);
  waitUntil(
    eslatmalarniTekshir(bot.api).catch((e) => console.error("[webhook] eslatma tekshiruvi xatosi:", e)),
  );
}
