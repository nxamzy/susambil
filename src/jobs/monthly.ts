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

  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES ('oxirgi_hisobot', ${belgi})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;

  await guruhgaYubor(api, "📅 <b>Yangi oy boshlandi — o'tgan oy natijalari:</b>");
  await guruhgaYubor(api, await reytingMatni());
}
