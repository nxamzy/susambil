/**
 * Navbat — shaxsiy vazifa paneli.
 *
 * Navbatdagi xonaning har bir a'zosi botda "👤 Mening Navbatim"ni ochsa
 * (yoki shaxsiy chatdagi "📋 Navbat" tugmasi/`/navbat` orqali) o'z
 * xonasining 4 ta vazifasini (xona/hammom/oshxona/musor) alohida-alohida,
 * har biriga rasm bilan, belgilaydi. Holat `turns.ishlar`da saqlanadi —
 * bot qayta ishga tushsa ham yo'qolmaydi.
 *
 * Boshqa xonadagi odam shu ko'rinishni ochsa — faqat umumiy ma'lumot
 * (`boshqaXonaMatni`), hech qanday tugma yo'q. Har bir harakat serverda
 * `kim(ctx.from.id)` orqali aniqlangan `room_id` bilan tekshiriladi.
 *
 * Hammasi bajarilgach "📸 Yakuniy topshirish" mavjud tasdiqlash oqimiga
 * (bot/handlers/confirm.ts, `tasdiqXabari`/`tasdiqKeyboard`) ulanadi —
 * ikkinchi tasdiqlash tizimi yaratilmagan.
 */
import type { Api, Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { sql, type Room, type Turn, type User } from "../../db/index.js";
import { config } from "../../config.js";
import { sozlamalarOl } from "../../core/sozlamalar.js";
import {
  barchaIshlarBajarildimi,
  faolNavbat,
  bajarilganMarta,
  ishBelgila,
  majburiyOchildimi,
  martaniYop,
  oraliqKunOtdi,
  vazifaOchiqmi,
  navbatFaolTopshirigi,
  navbatniBoshlash,
  navbatniOzgartirish,
  navbatniQaytaBoshla,
  navbatniYopish,
  navbatSozlamalari,
  navbatTopshir,
  ishRasmlari,
  majburiyKuniniOrnat,
  muddatniOzgartir,
  MAJBURIY_DOIM_OCHIQ,
  siklKuniniOrnat,
  type NavbatSozlamalari,
} from "../../core/rotation.js";
import { faolVazifaKodBoyicha, faolVazifalar, type NavbatVazifasi } from "../../core/vazifalar.js";
import { tasdiqlovchilar } from "../../core/topshiriq.js";
import { albomYubor, guruhgaYubor, guruhId, kim, shaxsiy } from "../group.js";
import {
  menyuKeyboard,
  navbatAdminKeyboard,
  navbatBoshlashKeyboard,
  navbatMuddatKeyboard,
  navbatSozlamaKeyboard,
  navbatXonagaOtkazishKeyboard,
  majburiyKuniKeyboard,
  siklKuniKeyboard,
  tasdiqKeyboard,
  vazifaKeyboard,
} from "../keyboards.js";
import {
  boshqaXonaMatni,
  esc,
  majburiyQulfMatni,
  muddatOzgardiGuruhXabari,
  navbatAdminPaneli,
  navbatMuddatMatni,
  navbatSozlamalariMatni,
  navbatXabari,
  tasdiqXabari,
  vazifaPaneli,
  vazifaRasmMatni,
  vazifaRasmToldiMatni,
  type VazifaHolati,
} from "../text.js";
import {
  holatOl,
  holatOrnat,
  holatTozala,
  sorovniEslat,
  sorovniOchir,
  sorovniTahrirla,
  type Flow,
} from "../state.js";

/**
 * Panelni chizish uchun kerak bo'ladigan ikkala ro'yxat — vazifalar va vaqt
 * sozlamalari. Ikkalasi ham endi bazadan keladi, `bot/text.ts` esa sof
 * qolishi kerak, shuning uchun bir marta o'qib hamma renderga uzatiladi.
 */
export type NavbatKonteksti = { vazifalar: NavbatVazifasi[]; sozlamalar: NavbatSozlamalari };

async function konteksOl(): Promise<NavbatKonteksti> {
  const [vazifalar, sozlamalar] = await Promise.all([faolVazifalar(), navbatSozlamalari()]);
  return { vazifalar, sozlamalar };
}

/**
 * Rasm kutilayotgandagi JONLI xabar klaviaturasi: vazifa tugmalari + bekor.
 *
 * Vazifa tugmalari ataylab shu yerda — odam bir vazifani tugatgach
 * keyingisiga shu xabardan o'tadi va panel qayta chizilmaydi (albom bilan
 * tashlanganda har rasmga panel yuborish Telegram flood chegarasiga urilardi).
 *
 * "✖️ Bekor qilish" ham shart: vazifa to'lgach holat ATAYLAB tozalanmaydi
 * (albomning kechikkan rasmlari yo'qolmasin uchun), demak odamga uni ochiq
 * to'xtatish yo'li kerak — aks holda keyingi 15 daqiqada tasodifan
 * tashlangan rasm ham shu vazifaga tushib ketardi.
 */
function rasmKlaviaturasi(
  turnId: number,
  ishlar: Turn["ishlar"],
  vazifalar: NavbatVazifasi[],
  joriyKod: string,
  soni: number,
  kerak: number,
): InlineKeyboard {
  const kb = vazifaKeyboard(turnId, ishlar, vazifalar);
  // "✅ Tugatdim" faqat kerakli rasm yig'ilgach chiqadi — shu bosilmaguncha
  // vazifa/marta yopilmaydi ("bitta rasm bilan ketib qolmaydi").
  if (soni >= kerak) kb.row().text("✅ Tugatdim", `navbat_tugat:${turnId}:${joriyKod}`);
  kb.row().text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Joriy navbat uchun ko'rinish holati — kutilmoqda/rad/faol. */
async function vazifaHolatiniAniqla(turn: Turn): Promise<VazifaHolati> {
  const faolSub = await navbatFaolTopshirigi(turn.id);
  if (faolSub) {
    const ismlar = await tasdiqlovchilar(faolSub.id);
    return { tur: "kutilmoqda", tasdiqlovchilar: ismlar, kerak: (await sozlamalarOl()).kerakliTasdiq };
  }

  const [oxirgiRad] = await sql<{ rad_sababi: string | null }[]>`
    SELECT rad_sababi FROM submissions
    WHERE turn_id = ${turn.id} AND tur = 'navbat' AND holat = 'rad'
    ORDER BY id DESC LIMIT 1
  `;
  if (oxirgiRad) return { tur: "rad", sabab: oxirgiRad.rad_sababi };

  return { tur: "faol" };
}

/**
 * Majburiy vazifalar (xona/hammom/oshxona/musor) muddat tugashiga
 * `config.majburiyOchilishKuni` kun qolmaguncha ko'rsatilmaydi — shu
 * paytgacha bu yerda faqat qulf xabari chiqadi. Ixtiyoriy tozalash
 * (bottom menyudagi tez ish tugmalari) bundan butunlay mustaqil — ular
 * bu tekshiruvga umuman tegishli emas.
 */
async function panelniYubor(
  ctx: Context,
  turn: Turn,
  room: Room,
  kontekst?: NavbatKonteksti,
): Promise<void> {
  const { vazifalar, sozlamalar } = kontekst ?? (await konteksOl());

  // Har vazifa alohida: `oraliq_kun` vazifasi (musor) navbat o'rtasida
  // ochiladi, qolganlari "oxirgi kun" qulfi bilan.
  const ochiqKodlar = new Set(
    vazifalar.filter((v) => vazifaOchiqmi(turn, v, sozlamalar.majburiyKuni)).map((v) => v.kod),
  );

  // Birorta vazifa ham ochilmagan bo'lsa — faqat qulf xabari.
  if (ochiqKodlar.size === 0) {
    await ctx.reply(majburiyQulfMatni(room, turn.muddat, sozlamalar.majburiyKuni), {
      parse_mode: "HTML",
    });
    return;
  }

  const status = await vazifaHolatiniAniqla(turn);
  const matn = vazifaPaneli(room, turn, status, vazifalar, ochiqKodlar);
  const kb =
    status.tur === "faol"
      ? vazifaKeyboard(turn.id, turn.ishlar, vazifalar, ochiqKodlar)
      : new InlineKeyboard();
  await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
}

/**
 * Asosiy kirish nuqtasi — FAQAT shaxsiy chatda chaqiriladi (guruh panelida
 * hech qachon, chunki bu yerdagi tugmalar faqat aynan shu xonaga tegishli
 * bo'lishi shart, boshqa a'zolar ularni bosa olmasligi kerak).
 */
export async function vazifaPaneliniKorsat(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) {
    await ctx.reply("Avval /start bosib ro'yxatdan o'ting.");
    return;
  }

  const n = await faolNavbat();
  if (!n) {
    await ctx.reply("🧹 Hozircha navbat boshlanmagan.");
    return;
  }

  if (u.room_id !== n.room.id) {
    await ctx.reply(boshqaXonaMatni(n.room, n.azolar, n.turn.muddat), { parse_mode: "HTML" });
    return;
  }

  await panelniYubor(ctx, n.turn, n.room);
}

/**
 * Vazifa rasmi kelgach chaqiriladi — photos.ts'dan.
 *
 * UCHTA QOIDA, uchalasi ham "albom bilan tashlangan rasm yo'qolmasin"
 * degan bitta ildizdan (ilgari 9 ta rasmdan 5 tasi yetib borardi):
 *
 *  1) Rasm ATOMIK qo'shiladi (`ishBelgila`) va kerakli sondan ORTIG'I HAM
 *     saqlanadi. Ilgari `kerak` ga yetgach qolganlari ataylab tashlanardi:
 *     musorga bitta rasm yetarli bo'lgani uchun albomdagi 3 tadan 2 tasi
 *     yo'qolardi.
 *
 *  2) Vazifa to'lgach holat ATAYLAB TOZALANMAYDI. Ilgari `holatTozala()`
 *     chaqirilardi va albomning qolgan rasmlari hech qanday holatga
 *     tushmay, mutlaqo jimgina yo'qolardi — ayni "5 tasi tushdi"ning
 *     sababi. Endi holat turaveradi: keyingi rasm ham shu vazifaga tushadi,
 *     boshqa vazifa tugmasi bosilsa holat o'zidan almashadi, hech nima
 *     bosilmasa 15 daqiqada o'zi eskiradi.
 *
 *  3) Har rasmga YANGI xabar yozilmaydi — bitta "jonli" xabar tahrirlanib
 *     boradi (`sorovniTahrirla`). 9 ta rasm ilgari 18 ta xabar tug'dirardi
 *     va Telegram flood chegarasi ularni tashlab yubora boshlardi.
 */
export async function vazifaRasmiKeldi(
  ctx: Context,
  kod: string,
  turnId: number,
  fileId: string,
): Promise<void> {
  if (!ctx.from) return;
  const u = await kim(ctx.from.id);
  if (!u) return;

  const vazifa = await faolVazifaKodBoyicha(kod);
  if (!vazifa) {
    // Admin vazifani ro'yxatdan chiqargan, tugmasi esa chatda osilib
    // qolgan. Rasm hech qayerga yozilmaydi, lekin odam nima bo'lganini
    // bilishi kerak — jimgina yutib yuborish aynan tuzatayotgan xatomiz.
    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    await holatTozala(ctx.from.id);
    await ctx.reply("Bu vazifa ro'yxatdan chiqarilgan. Paneldan qaytadan tanlang.");
    const n = await faolNavbat();
    if (n) await panelniYubor(ctx, n.turn, n.room);
    return;
  }

  const natija = await ishBelgila(turnId, vazifa, u.id, fileId);
  if (!natija) {
    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    await holatTozala(ctx.from.id);
    await ctx.reply("Bu navbat allaqachon yopilgan.");
    return;
  }

  const kontekst = await konteksOl();
  const { vazifalar } = kontekst;

  // Jarayon davom etadi — `sorov` (jonli xabar) saqlanib qoladi, `updated_at`
  // esa yangilanadi: odam rasmlarni sekin tashlasa ham holat eskirmasin.
  const oldingi = await holatOl(ctx.from.id);
  const sorov = oldingi?.sorov;
  const holat: Flow = { tur: "navbat_ish", kod, turnId, ...(sorov ? { sorov } : {}) };
  await holatOrnat(ctx.from.id, holat);

  const matn = natija.yozildimi
    ? vazifaRasmMatni(vazifa, natija.soni, natija.bajarilgan)
    : vazifaRasmToldiMatni(vazifa);
  const kb = rasmKlaviaturasi(
    turnId,
    natija.turn.ishlar,
    vazifalar,
    kod,
    natija.soni,
    natija.kerak,
  );

  // Jonli xabar yo'q bo'lsa (jarayon eskirgan yoki xabar o'chirilgan) —
  // yangisini yuboramiz va uni jonli xabar qilib belgilaymiz. Panel bu
  // yerda QAYTA CHIZILMAYDI — rasm yig'ilishi hali vazifani bajarmaydi,
  // panel faqat "✅ Tugatdim" bosilganda yangilanadi (navbat_tugat handleri).
  if (!(await sorovniTahrirla(ctx.api, holat, matn, { reply_markup: kb }))) {
    const xabar = await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  }
}

async function faqatAdmin(ctx: Context): Promise<User | null> {
  const admin = await kim(ctx.from?.id);
  return admin?.admin ? admin : null;
}

/** /joriynavbat admin buyrug'i va Admin Panel → Navbat havolasi uchun. */
export async function navbatAdminDashboard(ctx: Context): Promise<void> {
  const n = await faolNavbat();
  if (!n) {
    await ctx.reply("🧹 Hozircha navbat boshlanmagan.", {
      reply_markup: navbatBoshlashKeyboard(),
    });
    return;
  }
  const { vazifalar, sozlamalar } = await konteksOl();
  const status = await vazifaHolatiniAniqla(n.turn);
  const { eslatmaOraligiSoat } = await sozlamalarOl();
  await ctx.reply(
    navbatAdminPaneli(n.room, n.turn, n.azolar, status, vazifalar, sozlamalar, eslatmaOraligiSoat),
    { parse_mode: "HTML", reply_markup: navbatAdminKeyboard(n.turn.id) },
  );
}

/**
 * Navbat yangi xonaga o'tganda (avtomatik 3-tasdiqdan yoki har qanday admin
 * harakatidan keyin) yangi a'zolarga DM — bitta joyda, to'rtta chaqiruvchi
 * (confirm.ts avtomatik yopilish, va shu fayldagi uchta admin harakati)
 * bir xil funksiyani ishlatadi, ikkinchi nusxa yaratilmagan.
 *
 * `reply_markup` shu bilan birga qabul qiluvchining pastki menyusini ham
 * yangilaydi — "🧹 Mening navbatim" endi ko'rinadi. Bu shart, chunki
 * Telegram'ning doimiy klaviaturasi FAQAT bot o'sha chatga yangi xabar
 * yuborganda yangilanadi — boshqa hech qanday "push" usuli yo'q.
 */
export async function navbatKelganiniXabarQil(api: Api, room: Room, azolar: User[]): Promise<void> {
  const { majburiyKuni } = await navbatSozlamalari();
  const oraliq = (await faolVazifalar()).filter((v) => v.oraliq_kun > 0);

  const qatorlar = [
    `🧹 <b>NAVBAT SIZGA KELDI</b>`,
    ``,
    `🏠 ${room.raqam}-xona`,
    ``,
    `👇 Pastdagi <b>"🧹 Mening navbatim"</b> tugmasi orqali kuzatib boring.`,
    ``,
    `<i>Majburiy xona tozalash muddat tugashiga ${majburiyKuni} kun</i>`,
    `<i>qolganda ochiladi — shu paytgacha ixtiyoriy tozalash tugmalaridan</i>`,
    `<i>foydalanishingiz mumkin.</i>`,
  ];
  for (const v of oraliq) {
    qatorlar.push(
      ``,
      `<i>${esc(v.emoji)} ${esc(v.nom)} navbatning ${v.oraliq_kun}-kunidan ochiladi —</i>`,
      `<i>bajarilmasa har 5 soatda eslatib turaman.</i>`,
    );
  }
  const matn = qatorlar.join("\n");

  for (const a of azolar) {
    await shaxsiy(api, a, matn, { reply_markup: menyuKeyboard(a.admin, true) });
  }
}

export function register(bot: Bot) {
  bot.callbackQuery("navbat_panel", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await vazifaPaneliniKorsat(ctx);
  });

  // Kalit sifatida `kod` ishlatiladi, `id` emas — kod hech qachon
  // o'zgarmagani uchun deploydan oldin chatda osilib qolgan eski tugma
  // (`navbat_ish:12:hammom`) ham xuddi shu handler'ga tushadi.
  bot.callbackQuery(/^navbat_ish:(\d+):([A-Za-z0-9_]+)$/, async (ctx) => {
    const turnId = Number(ctx.match[1]);
    const kod = ctx.match[2] as string;

    const u = await kim(ctx.from.id);
    if (!u) return ctx.answerCallbackQuery({ text: "Siz ro'yxatda yo'qsiz." });

    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId || u.room_id !== n.room.id) {
      return ctx.answerCallbackQuery({ text: "Bu sizning navbatingiz emas.", show_alert: true });
    }

    const { vazifalar, sozlamalar } = await konteksOl();
    const vazifa = await faolVazifaKodBoyicha(kod);
    if (!vazifa) {
      return ctx.answerCallbackQuery({
        text: "Bu vazifa ro'yxatdan chiqarilgan.",
        show_alert: true,
      });
    }

    // Backend tomonda ham tekshiramiz — eski (keshlangan) tugma hali
    // ko'rinib tursa ham. `oraliq_kun` vazifasi navbat o'rtasida,
    // qolganlari "oxirgi kun" qulfi bilan ochiladi.
    if (!vazifaOchiqmi(n.turn, vazifa, sozlamalar.majburiyKuni)) {
      return ctx.answerCallbackQuery({
        text:
          vazifa.oraliq_kun > 0
            ? `Bu vazifa navbat boshlanganiga ${vazifa.oraliq_kun} kun bo'lgach ochiladi.`
            : `Majburiy tozalash hali ochilmagan — navbatingiz tugashiga ${sozlamalar.majburiyKuni} kun qolganda ochiladi.`,
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery({ text: "📷 Rasmni shu yerga tashlang." }).catch(() => {});

    const holat = { tur: "navbat_ish", kod, turnId } as const;
    await holatOrnat(ctx.from.id, holat);

    // Shu vazifada/martada allaqachon rasm bo'lishi mumkin (odam qaytib
    // kelgan) — "0 dan boshlaymiz" deb emas, joriy sanoqdan boshlaymiz.
    const belgi = n.turn.ishlar[kod];
    const soni = ishRasmlari(belgi).length;
    const bajarilgan = bajarilganMarta(belgi);

    // Bu xabar keyin har kelgan rasmda TAHRIRLANADI, qayta yuborilmaydi —
    // shuning uchun unga vazifa tugmalari ham qo'yiladi: odam bir vazifani
    // tugatgach keyingisiga shu yerdan o'tadi, panel qayta chizilmaydi.
    const xabar = await ctx.reply(vazifaRasmMatni(vazifa, soni, bajarilgan), {
      parse_mode: "HTML",
      reply_markup: rasmKlaviaturasi(turnId, n.turn.ishlar, vazifalar, kod, soni, vazifa.rasm_soni),
    });
    await sorovniEslat(ctx.from.id, holat, xabar.chat.id, xabar.message_id);
  });

  // -------------------------------------------------------------------------
  // "✅ TUGATDIM" — joriy martani yopish
  // -------------------------------------------------------------------------
  // Ilgari rasm yig'ilishi bilan vazifa AVTOMATIK bajarilgan bo'lardi.
  // Endi ochiq harakat: "bitta rasm bilan ketib qolmaydi", odam xotirjam
  // yana rasm qo'sha oladi va o'zi tugatadi. Musor kabi `takror_soni > 1`
  // vazifada har "Tugatdim" bitta martani yopadi, keyingisi navbat davomida
  // (masalan ertaga) bajariladi.
  bot.callbackQuery(/^navbat_tugat:(\d+):([A-Za-z0-9_]+)$/, async (ctx) => {
    const turnId = Number(ctx.match[1]);
    const kod = ctx.match[2] as string;

    const u = await kim(ctx.from.id);
    if (!u) return ctx.answerCallbackQuery({ text: "Siz ro'yxatda yo'qsiz." });

    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId || u.room_id !== n.room.id) {
      return ctx.answerCallbackQuery({ text: "Bu sizning navbatingiz emas.", show_alert: true });
    }

    const vazifa = await faolVazifaKodBoyicha(kod);
    if (!vazifa) {
      return ctx.answerCallbackQuery({ text: "Bu vazifa ro'yxatdan chiqarilgan.", show_alert: true });
    }

    const natija = await martaniYop(turnId, vazifa, u.id);
    if (!natija) {
      return ctx.answerCallbackQuery({
        text: `Hali yetarli rasm yo'q — kamida ${vazifa.rasm_soni} ta kerak.`,
        show_alert: true,
      });
    }

    await ctx
      .answerCallbackQuery({
        text: natija.vazifaTugadi
          ? "✅ Vazifa bajarildi"
          : `✅ ${natija.bajarilgan}/${natija.takror} marta bajarildi`,
      })
      .catch(() => {});

    // Jarayon tugadi — jonli "rasm tashlang" xabarini o'chiramiz.
    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    await holatTozala(ctx.from.id);

    const kontekst = await konteksOl();
    await panelniYubor(ctx, natija.turn, n.room, kontekst);

    if (!natija.vazifaTugadi) {
      await ctx.reply(
        [
          `🔁 <b>${esc(vazifa.nom)}</b> — ${natija.bajarilgan}/${natija.takror} marta bajarildi.`,
          `<i>Qolgan ${natija.takror - natija.bajarilgan} martasini navbat davomida bajaring —</i>`,
          `<i>paneldan yana shu tugmani bosib, yangi rasm tashlaysiz.</i>`,
        ].join("\n"),
        { parse_mode: "HTML" },
      );
    }
  });

  bot.callbackQuery(/^navbat_topshir:(\d+)$/, async (ctx) => {
    const turnId = Number(ctx.match[1]);
    const u = await kim(ctx.from.id);
    if (!u) return ctx.answerCallbackQuery({ text: "Siz ro'yxatda yo'qsiz." });

    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId || u.room_id !== n.room.id) {
      return ctx.answerCallbackQuery({ text: "Bu sizning navbatingiz emas.", show_alert: true });
    }
    const kontekst = await konteksOl();
    const { vazifalar } = kontekst;
    if (!barchaIshlarBajarildimi(n.turn.ishlar, vazifalar)) {
      return ctx.answerCallbackQuery({ text: "Hali barcha vazifalar bajarilmagan.", show_alert: true });
    }
    if (await navbatFaolTopshirigi(turnId)) {
      return ctx.answerCallbackQuery({ text: "Allaqachon topshirilgan." });
    }

    await ctx.answerCallbackQuery({ text: "✅ Topshirildi!" }).catch(() => {});

    const sub = await navbatTopshir(n.turn, u.id, vazifalar);
    // Jarayon tugadi — jonli "rasm tashlang" xabari endi kerak emas.
    await sorovniOchir(ctx.api, await holatOl(ctx.from.id));
    await holatTozala(ctx.from.id);
    await panelniYubor(ctx, n.turn, n.room, kontekst);

    // Guruhga xuddi eski (rasm-to'plash) mexanizmi bilan bir xil xabar —
    // ikkinchi tasdiqlash tizimi yaratilmagan, faqat tetiklovchisi boshqa.
    const chatId = await guruhId();
    if (!chatId) return;

    // Rasm 10 tadan ko'p bo'lishi endi normal holat (vazifalar soni ham,
    // har biriga kerakli rasm ham admin qo'lida) — `albomYubor` ularni
    // bo'lib yuboradi, ilgarigi `.slice(0, 10)` esa ortiqchasini guruhga
    // umuman chiqarmasdi.
    await albomYubor(ctx.api, chatId, sub.photo_ids);

    const { kerakliTasdiq: kerak } = await sozlamalarOl();
    const xabar = await ctx.api.sendMessage(
      chatId,
      tasdiqXabari(n.room, u.ism, [], kerak),
      { parse_mode: "HTML", reply_markup: tasdiqKeyboard(sub.id, 0, kerak) },
    );
    await sql`UPDATE submissions SET guruh_msg_id = ${xabar.message_id} WHERE id = ${sub.id}`;
  });

  bot.callbackQuery(/^navbat_admin_tugat:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const [turn] = await sql<Turn[]>`SELECT * FROM turns WHERE id = ${turnId} AND holat = 'faol'`;
    if (!turn) return ctx.answerCallbackQuery({ text: "Bu navbat allaqachon yopilgan." });
    const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${turn.room_id}`;
    if (!room) return ctx.answerCallbackQuery({ text: "Xona topilmadi." });

    // Xona allaqachon topshirgan, faqat 3-tasdiq kutilayotgan bo'lsa — o'sha
    // topshirilgan vaqtdan hisoblaymiz (admin qachon tugatgani emas). Hech
    // narsa topshirilmagan bo'lsa (admin haqiqatan majburan yopyapti),
    // navbatniYopish o'zining standart `new Date()`sini ishlatadi.
    const mavjudTopshiriq = await navbatFaolTopshirigi(turnId);
    const natija = await navbatniYopish(
      turn,
      room,
      "admin_yopdi",
      mavjudTopshiriq ? mavjudTopshiriq.created_at : undefined,
    );
    if (!natija) return ctx.answerCallbackQuery({ text: "Bu navbat allaqachon yopilgan." });

    await ctx.answerCallbackQuery({ text: "✅ Yakunlandi." }).catch(() => {});
    await ctx.reply(`✅ ${room.raqam}-xona navbati admin tomonidan yakunlandi.`);

    const chatId = await guruhId();
    if (chatId) {
      await ctx.api.sendMessage(
        chatId,
        navbatXabari(natija.keyingi.room, natija.keyingi.azolar, natija.keyingi.muddat),
        { parse_mode: "HTML" },
      );
    }
    await navbatKelganiniXabarQil(ctx.api, natija.keyingi.room, natija.keyingi.azolar);

    // Yangi navbat panelini darrov ko'rsatamiz: oldingisi kechikkan bo'lsa
    // admin aynan shu yerdan "📅 Muddatni o'zgartirish" bilan yangi
    // navbatni qisqartiradi (aks holda uy jami ikki sikl tozalanmay
    // qolardi).
    await navbatAdminDashboard(ctx);
  });

  bot.callbackQuery(/^navbat_admin_qayta:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const yangi = await navbatniQaytaBoshla(turnId);
    if (!yangi) return ctx.answerCallbackQuery({ text: "Navbat topilmadi yoki allaqachon yopilgan." });

    await ctx.answerCallbackQuery({ text: "🔄 Qayta boshlandi." }).catch(() => {});
    await ctx.reply("🔄 Vazifalar tozalandi, xona qaytadan boshlaydi.");
  });

  bot.callbackQuery(/^navbat_admin_eslatma:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId) {
      return ctx.answerCallbackQuery({ text: "Bu navbat endi faol emas." }).catch(() => {});
    }

    await ctx.answerCallbackQuery({ text: "🔔 Yuborildi." }).catch(() => {});

    // Qo'lda yuborilgan eslatma AVTOMATIK 5 soatlik jadvalga tegmaydi —
    // `oxirgi_eslatma` ataylab o'zgartirilmaydi, aks holda admin bosgani
    // navbatdagi avtomatik eslatmani kechiktirib yoki tezlashtirib
    // yuborardi.
    const matn = [
      `🔔 <b>ESLATMA</b>`,
      ``,
      `Hali bajarilmagan vazifalaringiz bor. Iltimos, tozalab,`,
      `dalil rasmlarini yuboring.`,
    ].join("\n");
    for (const a of n.azolar) {
      await shaxsiy(ctx.api, a, matn, { reply_markup: new InlineKeyboard().text("👤 Mening Navbatim", "navbat_panel") });
    }
  });

  // Hali hech qanday navbat ketmayotganda Admin Panel'dan boshlash —
  // /navbatboshla bilan bir xil funksiyani ishlatadi, ikkinchi nusxa yo'q.
  bot.callbackQuery("admin_navbat_boshla", async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const yangi = await navbatniBoshlash();
    if (!yangi) {
      return ctx
        .answerCallbackQuery({ text: "Navbat allaqachon ketyapti yoki bazada xona yo'q.", show_alert: true })
        .catch(() => {});
    }

    await ctx.answerCallbackQuery({ text: "▶️ Boshlandi." }).catch(() => {});
    await navbatAdminDashboard(ctx);
    await navbatKelganiniXabarQil(ctx.api, yangi.room, yangi.azolar);
  });

  // Eski /navbatber buyrug'ining Admin Panel'dagi o'rni — xona raqamini
  // qo'lda yozish shart emas, ro'yxatdan tugma bilan tanlanadi.
  bot.callbackQuery("admin_navbat_xonaga", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});

    const xonalar = await sql<{ raqam: number }[]>`SELECT raqam FROM rooms ORDER BY raqam`;
    await ctx.reply("🔀 Navbatni qaysi xonaga o'tkazamiz?", {
      reply_markup: navbatXonagaOtkazishKeyboard(xonalar.map((x) => x.raqam)),
    });
  });

  bot.callbackQuery(/^admin_navbat_xona:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const raqam = Number(ctx.match[1]);
    const yangi = await navbatniOzgartirish(raqam);

    await ctx.answerCallbackQuery({ text: `✅ ${raqam}-xonaga o'tkazildi.` }).catch(() => {});
    await ctx.reply(navbatXabari(yangi.room, yangi.azolar, yangi.turn.muddat), { parse_mode: "HTML" });
    await navbatKelganiniXabarQil(ctx.api, yangi.room, yangi.azolar);
    await navbatAdminDashboard(ctx);
  });

  // -------------------------------------------------------------------------
  // MUDDAT VA VAQT SOZLAMALARI
  // -------------------------------------------------------------------------
  //
  // Nima uchun bor: navbat guruh tasdig'ini kutib cho'zilib ketsa (masalan
  // hech kim "✅ Tasdiqlayman" bosmasa), admin uni keyingi xonaga
  // o'tkazganda yangi muddat baribir "hozir + sikl" bo'lardi — uy jami ikki
  // sikl tozalanmay qolardi. `siklKuni` esa `config.ts`da qattiq yozilgan
  // edi, ya'ni buni kodni tahrirlamasdan tuzatib bo'lmasdi.

  bot.callbackQuery(/^navbat_muddat:(\d+)$/, async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const n = await faolNavbat();
    if (!n || n.turn.id !== turnId) {
      return ctx.answerCallbackQuery({ text: "Bu navbat endi faol emas." }).catch(() => {});
    }

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(navbatMuddatMatni(n.room, n.turn, await navbatSozlamalari()), {
      parse_mode: "HTML",
      reply_markup: navbatMuddatKeyboard(turnId),
    });
  });

  bot.callbackQuery(/^navbat_muddat_set:(\d+):(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }

    const turnId = Number(ctx.match[1]);
    const kun = Number(ctx.match[2]);

    const turn = await muddatniOzgartir(admin.id, turnId, kun);
    if (!turn) {
      return ctx.answerCallbackQuery({ text: "Bu navbat endi faol emas." }).catch(() => {});
    }

    await ctx.answerCallbackQuery({ text: "✅ Muddat o'zgartirildi." }).catch(() => {});

    const n = await faolNavbat();
    if (!n) return;

    // Muddat — jarima soatining boshlanishi, shuning uchun o'zgarishi
    // JIMGINA bo'lmasligi kerak: guruh ham, navbatdagi xona ham bilishi
    // shart. Guruhga e'lon + xonaga panel havolasi bilan DM.
    await guruhgaYubor(ctx.api, muddatOzgardiGuruhXabari(n.room, turn.muddat, admin.ism));
    for (const a of n.azolar) {
      await shaxsiy(ctx.api, a, muddatOzgardiGuruhXabari(n.room, turn.muddat, admin.ism), {
        reply_markup: new InlineKeyboard().text("👤 Mening Navbatim", "navbat_panel"),
      });
    }

    await navbatAdminDashboard(ctx);
  });

  bot.callbackQuery("navbat_sozlama", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(navbatSozlamalariMatni(await navbatSozlamalari()), {
      parse_mode: "HTML",
      reply_markup: navbatSozlamaKeyboard(),
    });
  });

  bot.callbackQuery("navbat_sikl", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const s = await navbatSozlamalari();
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      [
        `🔁 <b>SIKL UZUNLIGI</b>`,
        ``,
        `Hozirgisi: <b>${s.siklKuni} kun</b>`,
        ``,
        `Har xonaga necha kun berilsin?`,
        ``,
        `<i>Faqat KELGUSI navbatlarga ta'sir qiladi — hozir ketayotgani</i>`,
        `<i>o'z muddatida qoladi ("📅 Muddatni o'zgartirish" bilan sozlanadi).</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: siklKuniKeyboard() },
    );
  });

  bot.callbackQuery(/^navbat_sikl_set:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const kun = await siklKuniniOrnat(admin.id, Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: `✅ ${kun} kun` }).catch(() => {});
    await ctx.reply(navbatSozlamalariMatni(await navbatSozlamalari()), {
      parse_mode: "HTML",
      reply_markup: navbatSozlamaKeyboard(),
    });
  });

  bot.callbackQuery("navbat_majburiy", async (ctx) => {
    if (!(await faqatAdmin(ctx))) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const s = await navbatSozlamalari();
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      [
        `🔓 <b>MAJBURIY VAZIFA OCHILISHI</b>`,
        ``,
        `Hozirgisi: <b>${s.majburiyKuni >= MAJBURIY_DOIM_OCHIQ ? "har doim ochiq" : `muddatga ${s.majburiyKuni} kun qolganda`}</b>`,
        ``,
        `"Mening Navbatim"dagi vazifa tugmalari qachon ochilsin?`,
        ``,
        `<i>Sikl qisqartirilsa buni ham qisqartirish kerak — aks holda</i>`,
        `<i>vazifalar navbat boshlanishidan oldinroq ochilib qolardi.</i>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: majburiyKuniKeyboard() },
    );
  });

  bot.callbackQuery(/^navbat_majburiy_set:(\d+)$/, async (ctx) => {
    const admin = await faqatAdmin(ctx);
    if (!admin) {
      return ctx.answerCallbackQuery({ text: "Sizda ruxsat yo'q.", show_alert: true }).catch(() => {});
    }
    const kun = await majburiyKuniniOrnat(admin.id, Number(ctx.match[1]));
    await ctx
      .answerCallbackQuery({ text: kun >= MAJBURIY_DOIM_OCHIQ ? "✅ Har doim ochiq" : `✅ ${kun} kun` })
      .catch(() => {});
    await ctx.reply(navbatSozlamalariMatni(await navbatSozlamalari()), {
      parse_mode: "HTML",
      reply_markup: navbatSozlamaKeyboard(),
    });
  });
}
