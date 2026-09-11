import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "../config.js";
import * as commands from "./handlers/commands.js";
import * as admin from "./handlers/admin.js";
import * as photos from "./handlers/photos.js";
import * as confirm from "./handlers/confirm.js";
import * as reports from "./handlers/reports.js";
import * as tolov from "./handlers/tolov.js";
import * as yigim from "./handlers/yigim.js";
import * as navbat from "./handlers/navbat.js";
import * as adminUsers from "./handlers/adminUsers.js";
import * as vazifalar from "./handlers/vazifalar.js";
import * as sozlamalar from "./handlers/sozlamalar.js";
import * as xabar from "./handlers/xabar.js";
import * as messages from "./handlers/messages.js";

/** Xatoni qisqa ko'rinishda yozadi — butun ctx ni dump qilmaydi,
 *  chunki unda bot tokeni ham bo'ladi. */
function xatoniYoz(e: unknown): void {
  if (e instanceof GrammyError) {
    console.error(`Telegram xatosi [${e.method}]: ${e.description}`);
  } else if (e instanceof HttpError) {
    console.error("Tarmoq xatosi:", e.message);
  } else if (e instanceof Error) {
    console.error(`${e.name}: ${e.message}`);
  } else {
    console.error("Noma'lum xato:", e);
  }
}

export function botYarat(): Bot {
  const bot = new Bot(config.botToken);

  // MUHIM: webhook rejimida grammY bot.catch ni ishlatmaydi — xato tashqariga
  // chiqsa funksiya 500 qaytaradi va Telegram yangilanishni qayta-qayta
  // yuboraveradi. Shuning uchun hamma handler shu chegara ichida ishlaydi.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (e) {
      xatoniYoz(e);
    }
  });

  // Tartib muhim: buyruqlar va tugmalar avval, umumiy xabar ushlagichlar oxirida
  commands.register(bot);
  admin.register(bot);
  confirm.register(bot);
  reports.register(bot);
  tolov.register(bot);
  yigim.register(bot);
  navbat.register(bot);
  adminUsers.register(bot);
  vazifalar.register(bot);
  sozlamalar.register(bot);
  xabar.register(bot);
  photos.register(bot);
  messages.register(bot);

  // Long polling uchun qo'shimcha to'siq (yuqoridagi chegara o'tkazib
  // yuborgan xatolar shu yerga tushadi)
  bot.catch((err) => xatoniYoz(err.error));

  return bot;
}

/**
 * Telegram menyusidagi buyruqlar ro'yxati. Faqat haqiqatan ro'yxatdan
 * o'tgan va hammaga ishlaydigan buyruqlar turishi kerak — bo'lmasa odam
 * menyudan bosadi-yu, javob kelmaydi. Admin buyruqlari bu yerda yo'q:
 * ular /yordam ichida, faqat adminga ko'rsatiladi.
 */
export async function buyruqlarniOrnat(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: "navbat", description: "Kim navbatda" },
    { command: "reyting", description: "Shu oylik reyting" },
    { command: "tarix", description: "Oxirgi navbatlar" },
    { command: "yigim", description: "Pul yig'imi — holati va to'lash" },
    { command: "yordam", description: "Buyruqlar ro'yxati" },
  ]);
}
