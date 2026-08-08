/**
 * Telegram menyusidagi buyruqlar ro'yxatini yangilaydi.
 *
 *   npm run commands:set
 *
 * Alohida skript kerak, chunki `buyruqlarniOrnat` faqat `src/index.ts` da —
 * ya'ni long polling rejimida — chaqiriladi. Vercel'da bot webhook orqali
 * ishlaydi va u fayl umuman ishga tushmaydi, shuning uchun ro'yxat deploydan
 * keyin o'z-o'zidan yangilanmaydi.
 */
import { botYarat, buyruqlarniOrnat } from "../bot/index.js";

await buyruqlarniOrnat(botYarat());
console.log("✅ Buyruqlar ro'yxati yangilandi");
process.exit(0);
