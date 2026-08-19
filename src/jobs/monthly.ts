import type { Api } from "grammy";
import { sql } from "../db/index.js";
import { guruhgaYubor } from "../bot/group.js";
import { reytingMatni } from "../bot/handlers/commands.js";

/** Har oyning 1-sanasida o'tgan oy hisoboti e'lon qilinadi. */
export async function oylikHisobot(api: Api): Promise<void> {
  const belgi = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Tashkent",
  })
    .format(new Date())
    .slice(0, 7);

  const [bor] = await sql<{ qiymat: string }[]>`
    SELECT qiymat FROM settings WHERE kalit = 'oxirgi_hisobot'
  `;
  if (bor?.qiymat === belgi) return; // bu oy allaqachon e'lon qilingan

  const banner = await guruhgaYubor(api, "📅 <b>Yangi oy boshlandi — o'tgan oy natijalari:</b>");
  const hisobot = await guruhgaYubor(api, await reytingMatni());

  // Faqat ikkalasi ham yetkazilgandan keyin belgilaymiz — aks holda
  // (masalan bot guruhdan chiqarilgan yoki guruh hali sozlanmagan bo'lsa)
  // shu oy hisoboti butunlay yo'qolib qolardi: cron faqat 1-sanada bir
  // marta ishga tushadi (api/cron.ts), demak qayta urinish bo'lmaydi.
  // jobs/reminders.ts'dagi hamma eslatma shu bir qoidaga amal qiladi:
  // "mark sent only after delivery actually succeeded".
  if (banner && hisobot) {
    await sql`
      INSERT INTO settings (kalit, qiymat) VALUES ('oxirgi_hisobot', ${belgi})
      ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
    `;
  }
}
