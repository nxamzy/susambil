import cron from "node-cron";
import { botYarat, buyruqlarniOrnat } from "./bot/index.js";
import { eslatmalarniTekshir } from "./jobs/reminders.js";
import { sql } from "./db/index.js";

const bot = botYarat();
const TZ = "Asia/Tashkent";

// Har soatda: muddat eslatmasi va kechikish ogohlantirishi
cron.schedule("0 * * * *", () => {
  eslatmalarniTekshir(bot.api).catch((e) => console.error("eslatma xatosi:", e));
}, { timezone: TZ });

async function toxtat(signal: string) {
  console.log(`\n${signal} — to'xtatilyapti...`);
  await bot.stop();
  await sql.end();
  process.exit(0);
}
process.once("SIGINT", () => void toxtat("SIGINT"));
process.once("SIGTERM", () => void toxtat("SIGTERM"));

await buyruqlarniOrnat(bot);

console.log("🤖 Bot ishga tushdi");
void eslatmalarniTekshir(bot.api).catch(() => {});

await bot.start({
  onStart: (me) => console.log(`   @${me.username} sifatida ulandi`),
  allowed_updates: ["message", "callback_query", "my_chat_member"],
});
