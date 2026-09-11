import type { Bot, Context } from "grammy";
import { sql } from "../../db/index.js";
import { kim } from "../group.js";
import { esc } from "../text.js";
import { holatOl, holatOrnat, holatTozala, sorovniEslat, sorovniOchir } from "../state.js";
import {
  ADMIN_PANEL_TUGMA,
  MENING_NAVBATIM_TUGMA,
  MENYU,
  menyuKeyboard,
  SHIKOYAT_TUGMA,
  xonaTanlashKeyboard,
} from "../keyboards.js";
import { korinish, panelMatni } from "./commands.js";
import { vazifaPaneliniKorsat } from "./navbat.js";
import { javobgarIzohiSaqlandi, shikoyatBoshla, shikoyatIzohSaqlandi, shikoyatJoySora } from "./reports.js";
import {
  tolovDalilSora,
  tolovRadEtish,
  tolovTasdiqlash,
  tolovTuzatishSababKeldi,
  tolovTuzatishSummaKeldi,
} from "./tolov.js";
import {
  adminBallTuzatishKeldi,
  adminIsmTahrirKeldi,
  adminTgIdTahrirKeldi,
  adminPanelKorsat,
  adminYangiIsmiKeldi,
} from "./adminUsers.js";
import { vazifaNomiKeldi, vazifaYangiNomiKeldi } from "./vazifalar.js";
import { xabarMatniKeldi } from "./xabar.js";
import { yigimNomiKeldi, yigimSummaOzgartirishKeldi, yigimSummasiKeldi } from "./yigim.js";
import { summaTekshir } from "../../core/topshiriq.js";
import { joriyNavbatchimi } from "../../core/rotation.js";

/**
 * Doimiy menyu tugmasi bosilgan bo'lsa bajaradi. Bu tekshiruv jarayon
 * qadamlaridan oldin turadi: menyu har doim ishlashi kerak, aks holda
 * yarim qolgan jarayon odamni qamab qo'yadi.
 */
async function menyuTugmasi(ctx: Context, matn: string): Promise<boolean> {
  if (!ctx.from) return false;

  if (matn === SHIKOYAT_TUGMA) {
    await shikoyatBoshla(ctx);
    return true;
  }

  // Faqat admin bo'lsa ko'rinadi (menyuKeyboard shunday quradi), lekin
  // bu yerda ham tekshiramiz — matn qo'lda yozilib qolsa ham himoyalangan.
  if (matn === ADMIN_PANEL_TUGMA) {
    const admin = await kim(ctx.from.id);
    if (!admin?.admin) return false;
    await adminPanelKorsat(ctx);
    return true;
  }

  // Faqat navbatdagi xona a'zosiga ko'rinadi, lekin haqiqiy tekshiruv
  // vazifaPaneliniKorsat() ICHIDA — u eskirgan/qo'lda yozilgan matnga ham
  // ishonmaydi, har doim `kim().room_id`ni joriy navbat bilan solishtiradi.
  if (matn === MENING_NAVBATIM_TUGMA) {
    await vazifaPaneliniKorsat(ctx);
    return true;
  }

  const nom = (Object.keys(MENYU) as (keyof typeof MENYU)[]).find((k) => MENYU[k] === matn);
  if (!nom) return false;

  if (!(await kim(ctx.from.id))) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return true;
  }
  await korinish(ctx, nom);
  return true;
}

/**
 * Shaxsiy chatdagi oddiy matn. Jarayon ketayotgan bo'lsa — o'sha qadam,
 * bo'lmasa — panel ko'rsatiladi (hech kim buyruq yozib o'tirmasin).
 */
export function register(bot: Bot) {
  bot.on("message:text", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    // Tanilgan buyruqlar yuqoridagi handlerlarda ushlanadi — bu yergacha
    // faqat yo'q buyruq yetib keladi. Jimgina qaytmaymiz: odam menyudan
    // eski buyruqni bosib, javob kelmasa nima bo'lganini bilmaydi.
    if (ctx.message.text.startsWith("/")) {
      await ctx.reply("Bunday buyruq yo'q. /yordam yozing yoki pastdagi tugmalardan foydalaning.");
      return;
    }

    if (await menyuTugmasi(ctx, ctx.message.text.trim())) {
      // Doimiy tugma bosilganda uning yozuvi chatda oddiy xabar bo'lib
      // qolib ketadi ("Hammom tozaladim") — chat toza tursin deb o'chiramiz.
      await ctx.deleteMessage().catch(() => {});
      return;
    }

    const holat = await holatOl(ctx.from.id);

    if (holat?.tur === "royxat" && holat.qadam === "ism") {
      const ism = ctx.message.text.trim().slice(0, 40);
      if (ism.length < 2) return ctx.reply("Ism juda qisqa. Qaytadan yozing.");

      const band = await sql<{ id: number }[]>`
        SELECT id FROM users WHERE lower(ism) = lower(${ism}) AND faol
      `;
      if (band.length > 0) {
        return ctx.reply("Bu ism ro'yxatda bor. Boshqacha yozing (masalan familiyangiz bilan).");
      }

      await sorovniOchir(ctx.api, holat);
      const yangi = { tur: "royxat", qadam: "xona", ism } as const;
      await holatOrnat(ctx.from.id, yangi);

      const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
      const xabar = await ctx.reply(
        `👋 Xush kelibsiz, <b>${esc(ism)}</b>!\n\n🚪 <b>Qaysi xonada turasiz?</b>`,
        { parse_mode: "HTML", reply_markup: xonaTanlashKeyboard(xonalar.map((x) => x.raqam)) },
      );
      await sorovniEslat(ctx.from.id, yangi, xabar.chat.id, xabar.message_id);
      return;
    }

    if (holat?.tur === "shikoyat" && holat.qadam === "izoh") {
      const izoh = ctx.message.text.trim().slice(0, 500);
      if (izoh.length < 5) return ctx.reply("Juda qisqa. Nima bo'lganini birroz batafsil yozing.");
      return shikoyatJoySora(ctx, izoh);
    }

    if (holat?.tur === "shikoyat" && holat.qadam === "dalil") {
      return ctx.reply("📷 Avval rasm/video tashlang (yoki tugmani bosing).");
    }

    if (holat?.tur === "shikoyat") {
      return ctx.reply("👆 Yuqoridagi tugmalardan birini tanlang.");
    }

    if (holat?.tur === "shikoyat_izoh") {
      const izoh = ctx.message.text.trim().slice(0, 500);
      if (izoh.length < 2) return ctx.reply("Juda qisqa. Qaytadan yozing.");
      return shikoyatIzohSaqlandi(ctx, holat.reportId, izoh);
    }

    if (holat?.tur === "javobgar_izoh") {
      const izoh = ctx.message.text.trim().slice(0, 500);
      if (izoh.length < 2) return ctx.reply("Juda qisqa. Qaytadan yozing.");
      return javobgarIzohiSaqlandi(ctx, holat.reportId, izoh);
    }

    if (holat?.tur === "tolov" && holat.qadam === "summa") {
      const summa = summaTekshir(ctx.message.text.trim());
      if (summa === null) return ctx.reply("Faqat musbat raqam yozing, masalan: 400000");
      // `siklId` bor bo'lsa — pul yig'imiga to'lov, yo'q bo'lsa kvartira
      // puli. Oqim ikkalasiga bir xil (`handlers/tolov.ts`).
      return tolovDalilSora(ctx, summa, holat.siklId);
    }

    if (holat?.tur === "tolov" && holat.qadam === "dalil") {
      return ctx.reply("📎 Avval to'lov dalilini (rasm yoki PDF) tashlang.");
    }

    if (holat?.tur === "tolov_tasdiq") {
      return tolovTasdiqlash(ctx, holat.tolovId, ctx.message.text.trim());
    }

    if (holat?.tur === "tolov_rad") {
      return tolovRadEtish(ctx, holat.tolovId, ctx.message.text.trim());
    }

    if (holat?.tur === "tolov_tuzat" && holat.qadam === "summa") {
      return tolovTuzatishSummaKeldi(ctx, holat.userId, holat.siklId, ctx.message.text.trim());
    }

    if (holat?.tur === "tolov_tuzat" && holat.qadam === "sabab") {
      return tolovTuzatishSababKeldi(
        ctx,
        holat.userId,
        holat.siklId,
        holat.summa,
        ctx.message.text.trim(),
      );
    }

    if (holat?.tur === "navbat_ish") {
      return ctx.reply("📷 Avval rasmini tashlang.");
    }

    if (holat?.tur === "admin_yangi" && holat.qadam === "ism") {
      const ism = ctx.message.text.trim().slice(0, 40);
      if (ism.length < 2) return ctx.reply("Juda qisqa. Qaytadan yozing.");
      return adminYangiIsmiKeldi(ctx, ism);
    }

    if (holat?.tur === "admin_yangi" && holat.qadam === "xona") {
      return ctx.reply("👆 Yuqoridagi tugmalardan xonani tanlang.");
    }

    if (holat?.tur === "admin_tahrir_ism") {
      return adminIsmTahrirKeldi(ctx, holat.userId, ctx.message.text.trim());
    }

    if (holat?.tur === "admin_tahrir_tgid") {
      return adminTgIdTahrirKeldi(ctx, holat.userId, ctx.message.text.trim());
    }

    if (holat?.tur === "admin_ball") {
      return adminBallTuzatishKeldi(ctx, holat.userId, ctx.message.text.trim());
    }

    if (holat?.tur === "vazifa_yangi") {
      return vazifaYangiNomiKeldi(ctx, ctx.message.text.trim());
    }

    if (holat?.tur === "vazifa_nom") {
      return vazifaNomiKeldi(ctx, holat.vazifaId, ctx.message.text.trim());
    }

    if (holat?.tur === "admin_xabar" && holat.qadam === "matn") {
      return xabarMatniKeldi(ctx, holat.kim, ctx.message.text);
    }

    if (holat?.tur === "admin_xabar" && holat.qadam === "tasdiq") {
      return ctx.reply("👆 Yuqoridagi tugmalardan birini tanlang (yuborish yoki bekor qilish).");
    }

    if (holat?.tur === "yigim_yangi" && holat.qadam === "nom") {
      const nom = ctx.message.text.trim().slice(0, 80);
      if (nom.length < 2) return ctx.reply("Juda qisqa. Nima uchun yig'ayotganingizni yozing.");
      return yigimNomiKeldi(ctx, nom);
    }

    if (holat?.tur === "yigim_yangi" && holat.qadam === "summa") {
      return yigimSummasiKeldi(ctx, holat.nom, ctx.message.text.trim());
    }

    if (holat?.tur === "yigim_yangi") {
      return ctx.reply("👆 Yuqoridagi tugmalardan birini tanlang.");
    }

    if (holat?.tur === "yigim_summa") {
      return yigimSummaOzgartirishKeldi(ctx, holat.siklId, ctx.message.text.trim());
    }

    const u = await kim(ctx.from.id);
    if (!u) {
      await holatTozala(ctx.from.id);
      return ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    }

    await ctx.reply(await panelMatni(), {
      parse_mode: "HTML",
      reply_markup: menyuKeyboard(u.admin, await joriyNavbatchimi(u.room_id)),
    });
  });
}
