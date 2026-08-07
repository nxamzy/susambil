/**
 * Telegram webhook manzilini boshqarish.
 *
 *   npm run webhook:set https://susambil.vercel.app
 *   npm run webhook:info
 *   npm run webhook:delete        (lokal long polling uchun kerak)
 */
import { config } from "../config.js";

const API = `https://api.telegram.org/bot${config.botToken}`;

async function chaqir(usul: string, tana?: object) {
  const javob = await fetch(`${API}/${usul}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tana ?? {}),
  });
  return javob.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>;
}

const amal = process.argv[2];

if (amal === "set") {
  const asos = (process.argv[3] ?? process.env.WEBHOOK_URL ?? "").replace(/\/$/, "");
  if (!asos) {
    console.error("Manzil kerak. Masalan: npm run webhook:set https://susambil.vercel.app");
    process.exit(1);
  }
  const url = `${asos}/api/webhook`;
  const r = await chaqir("setWebhook", {
    url,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log(r.ok ? `✅ Webhook o'rnatildi: ${url}` : `❌ ${r.description}`);
} else if (amal === "delete") {
  const r = await chaqir("deleteWebhook", { drop_pending_updates: true });
  console.log(r.ok ? "✅ Webhook o'chirildi (endi long polling ishlaydi)" : `❌ ${r.description}`);
} else {
  const r = await chaqir("getWebhookInfo");
  console.log(JSON.stringify(r.result, null, 2));
}
