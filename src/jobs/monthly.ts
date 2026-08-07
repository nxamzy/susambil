import type { Api } from "grammy";
import { config } from "../config.js";
import { oylikYigimYozish, pul } from "../core/kassa.js";
import { guruhgaYubor } from "../bot/group.js";
import { kassaMatni, reytingMatni } from "../bot/handlers/commands.js";

/** Har oyning 1-sanasida: oylik yig'im yoziladi va hisobot e'lon qilinadi. */
export async function oylikHisobot(api: Api): Promise<void> {
  const hozir = new Date();
  const belgi = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", timeZone: "Asia/Tashkent",
  }).format(hozir).slice(0, 7);

  const nechta = await oylikYigimYozish(belgi);
  if (nechta === 0) return; // bu oy allaqachon yozilgan

  await guruhgaYubor(
    api,
    [
      `📅 <b>Yangi oy boshlandi</b>`,
      ``,
      `Har kimga ${pul(config.oylikYigim)} oylik yig'im yozildi (${nechta} kishi).`,
    ].join("\n"),
  );

  await guruhgaYubor(api, await reytingMatni());
  await guruhgaYubor(api, await kassaMatni());
}
