import { webhookCallback } from "grammy";
import { botYarat } from "../src/bot/index.js";

/**
 * Telegram shu manzilga yangilanishlarni yuboradi.
 * Manzilni o'rnatish: npm run webhook:set
 */
const bot = botYarat();

export default webhookCallback(bot, "https", {
  // Telegram javobni 60 soniyagacha kutadi; undan oshsa qayta yuboradi
  timeoutMilliseconds: 55_000,
});
