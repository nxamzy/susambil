import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "../config.js";
import * as commands from "./handlers/commands.js";
import * as admin from "./handlers/admin.js";
import * as expense from "./handlers/expense.js";
import * as photos from "./handlers/photos.js";
import * as confirm from "./handlers/confirm.js";
import * as chores from "./handlers/chores.js";

export function botYarat(): Bot {
  const bot = new Bot(config.botToken);

  // Tartib muhim: buyruqlar avval, keyin umumiy xabar ushlagichlar
  commands.register(bot);
  admin.register(bot);
  expense.register(bot);
  photos.register(bot);
  confirm.register(bot);
  chores.register(bot);

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error("Telegram xatosi:", e.description);
    else if (e instanceof HttpError) console.error("Tarmoq xatosi:", e);
    else console.error("Xato:", e);
  });

  return bot;
}

export async function buyruqlarniOrnat(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: "navbat", description: "Kim navbatda" },
    { command: "kassa", description: "Kim qancha qarzdor" },
    { command: "reyting", description: "Shu oylik reyting" },
    { command: "tarix", description: "Oxirgi navbatlar" },
    { command: "xarajat", description: "Xarajat qo'shish" },
    { command: "yordam", description: "Buyruqlar ro'yxati" },
  ]);
}
