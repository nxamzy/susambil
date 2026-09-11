import { InlineKeyboard, Keyboard } from "grammy";
import {
  ISH_TURLARI,
  ISHONCH_DARAJASI,
  ORALIQ_KUN_MAX,
  RASM_SONI_MAX,
  TAKROR_MAX,
  SHIKOYAT_JOYLARI,
  type Ishonch,
  type ShikoyatJoyi,
} from "../config.js";
import type { TurnIshlar, User } from "../db/index.js";
import type { ReportToliq } from "../core/reports.js";
import type { SiklOdam, TolovDashboard } from "../core/tolov.js";
import { bajarilganMarta, ishRasmlari, MAJBURIY_DOIM_OCHIQ, vazifaBajarildimi } from "../core/rotation.js";
import type { NavbatVazifasi } from "../core/vazifalar.js";
import type { NarsaToliq } from "../core/narsalar.js";
import type { FoydalanuvchiToliq } from "../core/users.js";

/** Doimiy menyudagi ko'rinish tugmalari. */
export const MENYU = {
  navbat: "📋 Navbat",
  yigim: "💰 Pul yig'imi",
  tolov: "💳 Kvartira to'lovi",
  reyting: "🏆 Reyting",
  profil: "👤 Profil",
  azolar: "👥 A'zolar",
  tarix: "🕘 Tarix",
  tanishtirish: "ℹ️ Qanday ishlaydi?",
} as const;

/** Menyudagi tugmasi yo'q ish turlarini ochadigan tugma. */
/**
 * Anonim shikoyat tugmasi. Ataylab faqat shaxsiy chatdagi doimiy menyuda —
 * guruh paneliga qo'shilmagan, chunki bu yerdagi butun oqim (izoh, kim
 * ekani) shaxsiy suhbatda o'tishi shart.
 */
export const SHIKOYAT_TUGMA = "🔒 Anonim shikoyat";

/**
 * Doimiy menyudagi admin panel tugmasi. Ataylab `MENYU`ga qo'shilmagan —
 * u hammaga bir xil ko'rinadi, bu esa faqat admin bo'lsa `menyuKeyboard`
 * chaqirilganda qo'shiladi (xuddi SHIKOYAT_TUGMA kabi maxsus holat).
 */
export const ADMIN_PANEL_TUGMA = "👑 Admin Panel";

/**
 * Doimiy menyudagi "joriy navbatdaman" tugmasi. Xuddi ADMIN_PANEL_TUGMA
 * kabi shartli — faqat navbat hozir turgan xonaning a'zolariga ko'rinadi,
 * navbat keyingi xonaga o'tsa avtomatik ko'chib o'tadi (`menyuKeyboard`
 * har safar joriy holatdan qayta hisoblanadi). "📋 Navbat" (hammaga ochiq,
 * faqat o'qish uchun umumiy holat) bilan almashtirilmaydi — ikkalasi ham
 * bir xil `vazifaPaneliniKorsat()`ga olib boradi, faqat bittasi hamma
 * uchun, bittasi faqat navbatdagi uchun ko'rinadi.
 */
export const MENING_NAVBATIM_TUGMA = "🧹 Mening navbatim";

/**
 * Shaxsiy chatdagi doimiy tugmalar — yozish maydonining ostida turadi va
 * hech qachon yo'qolmaydi. Guruhda ishlatilmaydi: u yerda tugmalar hammaga
 * ko'rinib, chatni bosib qo'yardi — guruh uchun `panelKeyboard()` bor.
 */
export function menyuKeyboard(isAdmin = false, isDutyUser = false): Keyboard {
  const kb = new Keyboard();
  if (isDutyUser) kb.text(MENING_NAVBATIM_TUGMA).row();
  kb.text(MENYU.navbat).text(MENYU.yigim).row();
  kb.text(MENYU.tolov).row();
  kb.text(MENYU.reyting).text(MENYU.profil).row();
  kb.text(MENYU.azolar).text(MENYU.tarix).row();
  kb.text(MENYU.tanishtirish).row();
  kb.text(SHIKOYAT_TUGMA);
  if (isAdmin) kb.row().text(ADMIN_PANEL_TUGMA);
  return kb.resized().persistent();
}

/**
 * Guruhdagi tasdiqlash tugmalari. Rad etish ham shu yerda — ilgari ishni
 * qaytarishning yo'li yo'q edi.
 */
export function tasdiqKeyboard(submissionId: number, soni: number, kerak: number): InlineKeyboard {
  const qoldi = Math.max(0, kerak - soni);
  const matn =
    qoldi === 0 ? "✅ Tasdiqlandi" : `✅ Tasdiqlayman  ·  yana ${qoldi} kishi kerak`;
  return new InlineKeyboard()
    .text(matn, `tasdiq:${submissionId}`)
    .row()
    .text("✖️ Rad etish", `rad:${submissionId}`);
}

/** Guruhga pin qilinadigan (va botda ham chiqadigan) asosiy panel. */
export function panelKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(MENYU.navbat, "korish:navbat");
  kb.text(MENYU.yigim, "korish:yigim").row();
  kb.text(MENYU.reyting, "korish:reyting");
  kb.text(MENYU.profil, "korish:profil").row();
  kb.text(MENYU.azolar, "korish:azolar");
  kb.text(MENYU.tarix, "korish:tarix").row();
  kb.text("ℹ️ Bu bot qanday ishlaydi?", "korish:tanishtirish");
  return kb;
}

export function bekorKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✖️ Bekor qilish", "bekor");
}

export function ismTanlashKeyboard(odamlar: { id: number; ism: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(`👤 ${o.ism}`, `men:${o.id}`).row();
  kb.text("➕ Men yangi a'zoman", "yangiazo");
  return kb;
}

export function xonaTanlashKeyboard(raqamlar: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of raqamlar) kb.text(`🚪 ${r}-xona`, `yangixona:${r}`);
  kb.row().text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Tanishtirishdan keyin panelga qaytish. */
export function panelgaKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🏠 Panelga qaytish", "korish:panel");
}

/** Shikoyat: uyning qaysi joyiga tegishli. */
export function shikoyatJoyKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const j of Object.keys(SHIKOYAT_JOYLARI) as ShikoyatJoyi[]) {
    const i = SHIKOYAT_JOYLARI[j];
    kb.text(`${i.emoji} ${i.nom}`, `shikoyat_joy:${j}`).row();
  }
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/**
 * Shikoyat: dalil (rasm yoki video) so'ralganda. Callback nomi
 * ("shikoyat_dalilsiz") ish oqimidagi "rasmsiz" bilan atayin bir xil emas —
 * ular ikki xil holatni (`Flow.tur`) tekshiradi, bitta nom ishlatilsa xato
 * oqimga tushib qolardi.
 */
export function shikoyatDalilKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📷 Dalilim yo'q — shundoq yuboraman", "shikoyat_dalilsiz")
    .row()
    .text("✖️ Bekor qilish", "bekor");
}

/** Shikoyat: sababchi qanchalik aniq ekanini tanlash. */
export function ishonchKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const d of Object.keys(ISHONCH_DARAJASI) as Ishonch[]) {
    const i = ISHONCH_DARAJASI[d];
    kb.text(`${i.emoji} ${i.nom}`, `shikoyat_ishonch:${d}`).row();
  }
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Shikoyat: "aniq"/"gumon" tanlangach kimni tanlash — bitta qatorda bitta odam. */
export function shikoyatKimKeyboard(odamlar: { id: number; ism: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(`👤 ${o.ism}`, `shikoyat_kim:${o.id}`).row();
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/**
 * Adminga yuboriladigan shikoyat xabaridagi boshlang'ich harakatlar —
 * "kutilmoqda" holatida ko'rinadi. Tasdiqlansa `shikoyatTekshiruvKeyboard`
 * bilan, rad/hal qilinsa bo'sh klaviatura bilan almashadi.
 *
 * @param guruhgaYetmadi guruhga yuborish muvaffaqiyatsiz bo'lgan bo'lsa
 *   qayta urinish tugmasi qo'shiladi
 */
export function shikoyatAdminKeyboard(reportId: number, guruhgaYetmadi: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✅ Tasdiqlash", `shikoyat_tasdiq:${reportId}`)
    .text("➖ Rad etish", `shikoyat_rad:${reportId}`)
    .row()
    .text("👤 Boshqa odam", `shikoyat_qayta:${reportId}`)
    .text("✏️ Izoh qo'shish", `shikoyat_izoh:${reportId}`);
  if (guruhgaYetmadi) kb.row().text("🔁 Guruhga qayta yuborish", `shikoyat_guruh_qayta:${reportId}`);
  return kb;
}

/**
 * "tuzatilmoqda" holatidagi qayta tekshiruv tugmalari — sababchiga
 * imkoniyat berilgandan keyin admin qaytib ko'radi.
 */
export function shikoyatTekshiruvKeyboard(reportId: number, guruhgaYetmadi: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✅ Tuzatildi", `shikoyat_tuzatildi:${reportId}`)
    .text("❌ Tuzatilmadi", `shikoyat_tuzatilmadi:${reportId}`);
  if (guruhgaYetmadi) kb.row().text("🔁 Guruhga qayta yuborish", `shikoyat_guruh_qayta:${reportId}`);
  return kb;
}

/** Admin "👤 Boshqa odam" bosganda — hammani ko'rsatadi, o'zini chetlab o'tirmaydi. */
export function shikoyatQaytaKeyboard(
  reportId: number,
  odamlar: { id: number; ism: string }[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(`👤 ${o.ism}`, `shikoyat_belgila:${reportId}:${o.id}`).row();
  kb.text("❓ Hech kim (noma'lum)", `shikoyat_notanilgan:${reportId}`).row();
  kb.text("⬅️ Bekor qilish", `shikoyat_qayta_bekor:${reportId}`);
  return kb;
}

/**
 * Guruh xabaridagi sababchining o'z tugmalari — faqat aynan shu odamga
 * tegishli (handler'da `reported_id` bilan solishtirib tekshiriladi).
 *
 * Sababchi hali ma'lum bo'lmasa ("noma'lum") yoki shikoyat allaqachon
 * yopilgan bo'lsa (tuzatildi/jarima/rad) — tugma yo'q, `null` qaytadi.
 * "Tan oldi"/"Rad etdi" faqat javob berilmagunча ko'rinadi, lekin izoh
 * qo'shish har doim ochiq qoladi — javobdan keyin ham fikr qo'shish mumkin.
 */
export function shikoyatGuruhKeyboard(r: ReportToliq): InlineKeyboard | null {
  if (!r.reported_id) return null;
  if (r.holat !== "kutilmoqda" && r.holat !== "tuzatilmoqda") return null;

  const kb = new InlineKeyboard();
  if (!r.javobgar_javobi) {
    kb.text("🙋 Men qildim", `shikoyat_javobgar_ha:${r.id}`)
      .text("❌ Men qilmadim", `shikoyat_javobgar_yoq:${r.id}`)
      .row();
  }
  kb.text("💬 Izoh qo'shish", `shikoyat_javobgar_izoh:${r.id}`);
  return kb;
}

/** "💳 Kvartira to'lovi" ko'rinishidagi asosiy tugmalar. */
export function tolovKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("💳 To'lov qilish", "tolov_boshla")
    .row()
    .text("📊 Mening to'lovlarim tarixi", "tolov_tarix");
}

/** Adminga yuboriladigan tekshiruv xabaridagi tugmalar — faqat 'kutilmoqda'da ko'rinadi. */
export function tolovAdminKeyboard(tolovId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Tasdiqlash", `tolov_tasdiq:${tolovId}`)
    .text("❌ Rad etish", `tolov_rad:${tolovId}`);
}

/**
 * Oylik to'lov dashboardi — har bir odam alohida tugmada (foydalanuvchilar
 * ro'yxatidagi bilan bir xil naqsh: matnda umumiy holat, tugmada tafsilot).
 *
 * "Siklni yakunlash" faqat muddat kelgan, lekin hali yopilmagan oyda
 * ko'rinadi — ochiq oyni yakunlash mumkin emas.
 */
export function tolovDashboardKeyboard(d: TolovDashboard): InlineKeyboard {
  // Yig'im ham xuddi shu dashboardni ishlatadi (bitta kod, ikki tur) —
  // faqat callback prefiksi boshqa, shunda "orqaga" tugmasi o'z paneliga
  // qaytadi va oylik to'lov bilan aralashib ketmaydi.
  const p = d.sikl.tur === "yigim" ? "yigim" : "tolov";

  const kb = new InlineKeyboard()
    .text(`🔴 Qarzdorlar (${d.qarzdorlar.length})`, `${p}_royxat:qarzdor`)
    .row();

  // Kechikkanlar tugmasi faqat kerak bo'lganda — muddat kelmagan oyda u
  // har doim bo'sh bo'lardi va panelni behuda uzaytirardi.
  if (d.kechikkanlar.length > 0) {
    kb.text(`⛔️ Kechikkanlar (${d.kechikkanlar.length})`, `${p}_royxat:kechikkan`).row();
  }

  kb.text(`🟢 To'laganlar (${d.tola.length})`, `${p}_royxat:tolagan`).row();

  if (d.kutilmoqdaSoni > 0) {
    kb.text(`⏳ Tekshiruvdagilar (${d.kutilmoqdaSoni})`, "tolov_kutilmoqda").row();
  }

  if (d.sikl.tur === "yigim") {
    kb.text("✏️ Summa", `yigim_summa:${d.sikl.id}`)
      .text("📅 Muddat", `yigim_muddat:${d.sikl.id}`)
      .row();
    kb.text("📣 Hammaga eslatma", `yigim_turtki:${d.sikl.id}`).row();
    kb.text("🛒 Uyga nima kerak", "narsalar").row();
    kb.text("📜 Yig'imlar tarixi", "yigim_tarix").row();
    if (d.sikl.holat === "ochiq") {
      kb.text("🔒 Yig'imni yakunlash", `yigim_yakunla:${d.sikl.id}`).row();
    }
  } else {
    kb.text("📜 Tarix", "tolov_tarix_admin").row();
    if (d.sikl.holat === "muddat_yetdi") {
      kb.text("🔒 Oyni yakunlash", `tolov_yakunla:${d.sikl.id}`).row();
    }
  }

  kb.text("⬅️ Admin panel", "admin_panel");
  return kb;
}

/** Bitta ro'yxat ko'rinishi: har bir odam alohida tugmada + orqaga. */
export function tolovRoyxatKeyboard(odamlar: SiklOdam[], yigim = false): InlineKeyboard {
  const p = yigim ? "yigim" : "tolov";
  const kb = new InlineKeyboard();
  for (const o of odamlar) {
    const belgi = o.kechikkan ? "⛔️" : o.qoldiq === 0 ? "🟢" : o.tasdiqlangan > 0 ? "🟡" : "🔴";
    kb.text(`${belgi} ${o.ism} — ${qisqaPul(o.qoldiq)}`, `${p}_user:${o.userId}`).row();
  }
  kb.text(yigim ? "⬅️ Yig'im" : "⬅️ To'lovlar", `${p}_dashboard`);
  return kb;
}

/** Tugmada to'liq "900 000 so'm" sig'maydi — "900k" ko'rinishida qisqartiramiz. */
function qisqaPul(n: number): string {
  if (n === 0) return "to'liq";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}mln qoldi`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k qoldi`;
  return `${n} qoldi`;
}

/** Bitta odamning to'lov kartochkasi: qo'lda tuzatish + orqaga qaytish. */
export function tolovFoydalanuvchiKeyboard(userId: number, yigim = false): InlineKeyboard {
  const p = yigim ? "yigim" : "tolov";
  return new InlineKeyboard()
    .text(yigim ? "✏️ To'ladi/to'lamadi" : "✏️ To'lovni tuzatish", `${p}_tuzat:${userId}`)
    .row()
    .text(yigim ? "⬅️ Yig'im" : "⬅️ To'lovlar ro'yxati", `${p}_dashboard`);
}

/**
 * "Mening Navbatim" panelidagi 4 ta vazifa tugmasi — har biri alohida
 * bosiladi (bittalik "Bajardim" emas). Hammasi bajarilganda "Yakuniy
 * topshirish" qo'shiladi; hali kamida bittasi qolgan bo'lsa umuman
 * chiqmaydi — talab qilingan vazifalarsiz yakunlab bo'lmasligi shu bilan
 * kafolatlanadi (server tomonda ham tekshiriladi).
 */
export function vazifaKeyboard(
  turnId: number,
  ishlar: TurnIshlar,
  vazifalar: NavbatVazifasi[],
  ochiqKodlar?: Set<string>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const v of vazifalar) {
    // Hali ochilmagan vazifaning tugmasi umuman chiqmaydi (panelda 🔒).
    if (ochiqKodlar && !ochiqKodlar.has(v.kod)) continue;
    const belgi = ishlar[v.kod];
    const bajarilgan = bajarilganMarta(belgi);
    const soni = ishRasmlari(belgi).length;
    const tugadi = bajarilgan >= v.takror_soni;
    const marta = v.takror_soni > 1 ? ` ${bajarilgan}/${v.takror_soni} marta` : "";

    // Callback'da `kod` ishlatiladi, `id` emas: kod hech qachon o'zgarmaydi,
    // shuning uchun deploydan oldin chatda osilib qolgan eski tugma ham
    // (masalan `navbat_ish:12:hammom`) ishlayveradi.
    let yozuv: string;
    if (tugadi) {
      yozuv = `✅ ${v.nom}${marta} — bajarildi`;
    } else if (soni >= v.rasm_soni) {
      // Rasm yetarli, lekin "Tugatdim" bosilmagan — bu holatni ajratib
      // ko'rsatamiz, aks holda odam "bajardim-ku" deb o'ylab qoladi.
      yozuv = `🟡 ${v.nom}${marta} · ${soni}/${v.rasm_soni} — tasdiqlang`;
    } else {
      const son = soni > 0 ? ` · ${soni}/${v.rasm_soni}` : "";
      yozuv = `${v.emoji} ${v.nom}${marta}${son}`;
    }
    kb.text(yozuv, `navbat_ish:${turnId}:${v.kod}`).row();
  }
  if (vazifalar.length > 0 && vazifalar.every((v) => vazifaBajarildimi(ishlar[v.kod], v))) {
    kb.text("📸 Yakuniy topshirish", `navbat_topshir:${turnId}`);
  }
  return kb;
}

/** Admin: joriy navbatni qo'lda boshqarish tugmalari. */
export function navbatAdminKeyboard(turnId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Yakunlangan deb belgilash", `navbat_admin_tugat:${turnId}`)
    .row()
    .text("📅 Muddatni o'zgartirish", `navbat_muddat:${turnId}`)
    .row()
    .text("🔄 Qaytadan boshlash", `navbat_admin_qayta:${turnId}`)
    .text("🔔 Hozir eslatish", `navbat_admin_eslatma:${turnId}`)
    .row()
    .text("🔀 Boshqa xonaga o'tkazish", "admin_navbat_xonaga")
    .row()
    .text("⚙️ Navbat sozlamalari", "navbat_sozlama");
}

/** Admin: hali navbat boshlanmagan bo'lsa — boshlash tugmasi. */
export function navbatBoshlashKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("▶️ Navbatni boshlash", "admin_navbat_boshla")
    .row()
    .text("⚙️ Navbat sozlamalari", "navbat_sozlama");
}

/**
 * Joriy navbatga necha kun berilishi. Qiymat "SHU PAYTDAN boshlab N kun" —
 * kalendar sanasi emas: admin bunga eng ko'p oldingi navbat kechikkanda
 * murojaat qiladi ("uy allaqachon 8 kun tozalanmagan, bularga 2 kun bering"),
 * o'shanda aniq sana emas, "qancha vaqt qoldi" muhim.
 */
export function navbatMuddatKeyboard(turnId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text("⚡️ Bugun (bugun kechgacha)", `navbat_muddat_set:${turnId}:0`).row();
  for (const [i, kun] of [1, 2, 3, 4, 5, 7, 10].entries()) {
    kb.text(`${kun} kun`, `navbat_muddat_set:${turnId}:${kun}`);
    if (i % 4 === 3) kb.row();
  }
  kb.row().text("⬅️ Orqaga", "admin_link_navbat");
  return kb;
}

/** Admin: navbatning vaqt sozlamalari. */
export function navbatSozlamaKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔁 Sikl uzunligi", "navbat_sikl")
    .row()
    .text("🔓 Majburiy vazifa ochilishi", "navbat_majburiy")
    .row()
    .text("⚙️ Vazifalar ro'yxati", "vazifalar")
    .row()
    .text("⬅️ Navbat", "admin_link_navbat");
}

/** Kelgusi navbatlarning standart uzunligi. */
export function siklKuniKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [i, kun] of [1, 2, 3, 4, 5, 6, 7, 10, 14].entries()) {
    kb.text(`${kun} kun`, `navbat_sikl_set:${kun}`);
    if (i % 3 === 2) kb.row();
  }
  kb.row().text("⬅️ Orqaga", "navbat_sozlama");
  return kb;
}

/** Majburiy vazifalar muddat tugashiga necha kun qolganda ochilsin. */
export function majburiyKuniKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [i, kun] of [1, 2, 3, 4, 5].entries()) {
    kb.text(`${kun} kun`, `navbat_majburiy_set:${kun}`);
    if (i % 3 === 2) kb.row();
  }
  kb.row().text("♾ Har doim ochiq", `navbat_majburiy_set:${MAJBURIY_DOIM_OCHIQ}`).row();
  kb.text("⬅️ Orqaga", "navbat_sozlama");
  return kb;
}

/** Admin: navbatni qo'lda qaysi xonaga o'tkazishni tanlash (eski /navbatber). */
export function navbatXonagaOtkazishKeyboard(xonalar: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of xonalar) kb.text(`🚪 ${r}-xona`, `admin_navbat_xona:${r}`).row();
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Admin panelining bosh menyusi — mavjud bo'limlarga havolalar, ikkinchi nusxa yaratilmaydi. */
export function adminPanelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👥 Foydalanuvchilar", "admin_users")
    .row()
    .text("💳 Kvartira to'lovi", "admin_link_tolovlar")
    .text("🧹 Navbat", "admin_link_navbat")
    .row()
    .text("💰 Pul yig'ish", "yigim_dashboard")
    .text("🛒 Uyga kerak", "narsalar")
    .row()
    .text("🚨 Shikoyatlar", "admin_link_shikoyatlar")
    .row()
    .text("📣 Xabar yuborish", "xabar")
    .text("⚙️ Vazifalar", "vazifalar")
    .row()
    .text("⚙️ Sozlamalar", "sozlamalar")
    .text("📜 Tarix", "admin_logs")
    .row()
    .text("⚠️ Kelishmovchiliklar", "admin_conflicts");
}

/** Har bir foydalanuvchi — bitta qatorda bitta tugma, holat matnda ko'rinadi. */
export function foydalanuvchilarKeyboard(
  royxat: (User & { xona_raqami: number | null })[],
  yozuv: (u: User & { xona_raqami: number | null }) => string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const u of royxat) kb.text(yozuv(u), `admin_user:${u.id}`).row();
  kb.text("➕ Yangi foydalanuvchi", "admin_add").row();
  kb.text("⬅️ Admin panel", "admin_panel");
  return kb;
}

/** Foydalanuvchi tafsilotidagi harakatlar — mavjud holatga qarab moslashadi. */
export function foydalanuvchiDetalKeyboard(
  u: FoydalanuvchiToliq,
  ochirishMumkin: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✏️ Ism", `admin_edit_name:${u.id}`)
    .text("📱 Telegram ID", `admin_edit_tgid:${u.id}`)
    .row()
    .text("🏠 Xona", `admin_edit_room:${u.id}`)
    .text(u.admin ? "👑 Admin — o'chirish" : "👑 Admin qilish", `admin_toggle_admin:${u.id}`)
    .row()
    .text("⭐ Ball tuzatish", `admin_ball:${u.id}`)
    .row();

  // Eski /qaytabogla buyrug'ining bir bosishlik, ID asosidagi o'rnini
  // bosuvchisi — ism yozish shart emas, faqat ulangan bo'lsa ko'rinadi.
  if (u.telegram_id) {
    kb.text("🔓 Botdan uzish (qayta bog'lash uchun)", `admin_qaytabogla:${u.id}`).row();
  }

  kb.text(
    u.faol ? "🚫 Faolsizlantirish" : "✅ Qayta faollashtirish",
    `admin_toggle_faol:${u.id}`,
  ).row();

  if (ochirishMumkin) kb.text("⚠️ Butunlay o'chirish", `admin_delete:${u.id}`).row();
  kb.text("⬅️ Ro'yxatga qaytish", "admin_users");
  return kb;
}

/** Xona tanlash — yangi foydalanuvchi qo'shishda. */
export function adminYangiXonaKeyboard(xonalar: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of xonalar) kb.text(`🚪 ${r}-xona`, `admin_add_room:${r}`).row();
  kb.text("➖ Xonasiz qoldirish", "admin_add_room:0").row();
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Xona tanlash — mavjud foydalanuvchining xonasini o'zgartirishda. */
export function adminXonaOzgartirKeyboard(userId: number, xonalar: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of xonalar) kb.text(`🚪 ${r}-xona`, `admin_room_set:${userId}:${r}`).row();
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
}

export function telegramIdTasdiqKeyboard(userId: number, yangi: number | null): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Ha, o'zgartir", `admin_tgid_ok:${userId}:${yangi ?? 0}`)
    .text("❌ Yo'q", `admin_tgid_yoq:${userId}`);
}

export function adminHuquqTasdiqKeyboard(userId: number, yangiQiymat: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Ha", `admin_admin_ok:${userId}:${yangiQiymat ? 1 : 0}`)
    .text("❌ Yo'q", `admin_admin_yoq:${userId}`);
}

export function faollikTasdiqKeyboard(userId: number, yangiFaol: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Ha", `admin_faollik_ok:${userId}:${yangiFaol ? 1 : 0}`)
    .text("❌ Yo'q", `admin_faollik_yoq:${userId}`);
}

export function ochirishTasdiqKeyboard(userId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚠️ Ha, butunlay o'chir", `admin_delete_ok:${userId}`)
    .text("❌ Yo'q", `admin_delete_yoq:${userId}`);
}

// ---------------------------------------------------------------------------
// NAVBAT VAZIFALARINI SOZLASH (admin)
// ---------------------------------------------------------------------------

/** Vazifalar ro'yxati — har biri alohida tugmada, holati yozuvida. */
export function vazifalarKeyboard(vazifalar: NavbatVazifasi[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const v of vazifalar) {
    const belgi = v.faol ? v.emoji : "⛔️";
    kb.text(`${belgi} ${v.nom} · ${v.rasm_soni} rasm`, `vazifa:${v.id}`).row();
  }
  kb.text("➕ Yangi vazifa", "vazifa_yangi").row();
  kb.text("⬅️ Admin panel", "admin_panel");
  return kb;
}

/**
 * Bitta vazifa kartochkasi. ⬆️/⬇️ faqat ko'chirish mumkin bo'lganda
 * ko'rinadi — bosilsa hech nima qilmaydigan tugma chalg'itadi.
 */
export function vazifaDetalKeyboard(
  v: NavbatVazifasi,
  yuqoriBor: boolean,
  pastBor: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✏️ Nomi", `vazifa_nom:${v.id}`)
    .text("📷 Rasm soni", `vazifa_rasm:${v.id}`)
    .row()
    .text("🔁 Necha marta", `vazifa_takror:${v.id}`)
    .text("🕐 Oraliq eslatma", `vazifa_oraliq:${v.id}`)
    .row();

  if (yuqoriBor) kb.text("⬆️ Yuqoriga", `vazifa_kochir:${v.id}:yuqori`);
  if (pastBor) kb.text("⬇️ Pastga", `vazifa_kochir:${v.id}:past`);
  if (yuqoriBor || pastBor) kb.row();

  kb.text(
    v.faol ? "⛔️ Ro'yxatdan chiqarish" : "✅ Ro'yxatga qaytarish",
    `vazifa_faol:${v.id}:${v.faol ? 0 : 1}`,
  ).row();
  kb.text("⬅️ Vazifalar", "vazifalar");
  return kb;
}

/** Rasm sonini tanlash (eng kam talab) — matn yozish o'rniga tugma. */
export function vazifaRasmSoniKeyboard(vazifaId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let n = 1; n <= RASM_SONI_MAX; n++) {
    kb.text(String(n), `vazifa_rasm_set:${vazifaId}:${n}`);
    if (n % 5 === 0) kb.row();
  }
  kb.text("⬅️ Orqaga", `vazifa:${vazifaId}`);
  return kb;
}

/** Yangi vazifa qo'shilgach rasm sonini darrov so'raymiz. */
export function yangiVazifaRasmKeyboard(vazifaId: number): InlineKeyboard {
  return vazifaRasmSoniKeyboard(vazifaId);
}

/** Vazifa navbat davomida necha marta bajarilishini tanlash. */
export function vazifaTakrorSoniKeyboard(vazifaId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let n = 1; n <= TAKROR_MAX; n++) {
    kb.text(String(n), `vazifa_takror_set:${vazifaId}:${n}`);
    if (n % 5 === 0) kb.row();
  }
  kb.text("⬅️ Orqaga", `vazifa:${vazifaId}`);
  return kb;
}

/**
 * Oraliq eslatma boshlanish kunini tanlash. 0 = o'chiq; 1..7 va 10, 14 —
 * navbat boshlanganidan shuncha kun o'tgach eslatma ishga tushadi.
 */
export function vazifaOraliqKuniKeyboard(vazifaId: number): InlineKeyboard {
  const kb = new InlineKeyboard().text("O'chiq", `vazifa_oraliq_set:${vazifaId}:0`).row();
  const kunlar = [1, 2, 3, 4, 5, 6, 7, 10, 14].filter((k) => k <= ORALIQ_KUN_MAX);
  for (const [i, k] of kunlar.entries()) {
    kb.text(`${k}-kun`, `vazifa_oraliq_set:${vazifaId}:${k}`);
    if (i % 4 === 3) kb.row();
  }
  kb.row().text("⬅️ Orqaga", `vazifa:${vazifaId}`);
  return kb;
}

// ---------------------------------------------------------------------------
// ADMIN XABARI
// ---------------------------------------------------------------------------

/** Xabar kimga ketishini tanlash. */
export function xabarKimKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🧹 Navbatdagi xonaga", "xabar_kim:navbatchi")
    .row()
    .text("👥 Hamma a'zoga", "xabar_kim:hamma")
    .row()
    .text("🚪 Bitta xonaga", "xabar_kim:xona")
    .text("👤 Bitta odamga", "xabar_kim:odam")
    .row()
    .text("📢 Guruh chatiga", "xabar_kim:guruh")
    .row()
    .text("⬅️ Admin panel", "admin_panel");
}

export function xabarXonaKeyboard(xonalar: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of xonalar) kb.text(`🚪 ${r}-xona`, `xabar_xona:${r}`).row();
  kb.text("⬅️ Orqaga", "xabar");
  return kb;
}

export function xabarOdamKeyboard(odamlar: { id: number; ism: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) kb.text(`👤 ${o.ism}`, `xabar_odam:${o.id}`).row();
  kb.text("⬅️ Orqaga", "xabar");
  return kb;
}

/** Yuborishdan oldingi oxirgi tasdiq — yuborilgach ortga yo'l yo'q. */
export function xabarTasdiqKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📤 Ha, yubor", "xabar_yubor")
    .row()
    .text("✖️ Bekor qilish", "bekor");
}

// ---------------------------------------------------------------------------
// PUL YIG'IMI
// ---------------------------------------------------------------------------

/** A'zoning "💰 Pul yig'imi" ko'rinishi — ochiq yig'im bor bo'lganda. */
export function yigimKeyboard(toliqTolagan: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (!toliqTolagan) kb.text("💰 To'ladim — chek yuborish", "yigim_tolash").row();
  kb.text("🛒 Uyga nima kerak", "narsalar").row();
  kb.text("📊 Mening to'lovlarim tarixi", "tolov_tarix");
  return kb;
}

/** Ochiq yig'im yo'q. Adminga "boshlash" tugmasi, a'zoga hech narsa. */
export function yigimYoqKeyboard(admin: boolean): InlineKeyboard {
  const kb = new InlineKeyboard().text("🛒 Uyga nima kerak", "narsalar").row();
  if (!admin) return kb;
  return kb
    .text("➕ Yangi yig'im boshlash", "yigim_yangi")
    .row()
    .text("📜 Yig'imlar tarixi", "yigim_tarix")
    .row()
    .text("⬅️ Admin panel", "admin_panel");
}

/**
 * Yig'im muddati — "bugundan necha kun". `navbatMuddatKeyboard` bilan bir
 * xil naqsh: 0 = bugun kechgacha (muddat KUN OXIRIGACHA hisoblanadi,
 * shuning uchun 0 "allaqachon o'tib ketgan" degani emas).
 */
export function yigimKunKeyboard(prefiks: string): InlineKeyboard {
  const kb = new InlineKeyboard().text("⚡️ Bugun kechgacha", `${prefiks}:0`).row();
  for (const [i, k] of [1, 2, 3, 4, 5, 7, 10, 14].entries()) {
    kb.text(`${k} kun`, `${prefiks}:${k}`);
    if (i % 4 === 3) kb.row();
  }
  kb.row().text("✖️ Bekor qilish", "bekor");
  return kb;
}

/** Yuborishdan oldingi oxirgi tasdiq — e'lon ketgach ortga yo'l yo'q. */
export function yigimBoshlashKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚀 Ha, boshlash", "yigim_boshla")
    .row()
    .text("✖️ Bekor qilish", "bekor");
}

/** Yig'imni yopishdan oldingi tasdiq. */
export function yigimYakunlashKeyboard(siklId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔒 Ha, yakunlash", `yigim_yakunla_ok:${siklId}`)
    .row()
    .text("⬅️ Orqaga", "yigim_dashboard");
}

/** Eslatmadan to'g'ridan-to'g'ri chek yuborishga o'tish uchun. */
export function yigimTolashKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("💰 To'ladim — chek yuborish", "yigim_tolash");
}

// ---------------------------------------------------------------------------
// "UYGA NIMA KERAK" RO'YXATI
// ---------------------------------------------------------------------------

/**
 * Ro'yxat tugmalari. Har narsa bitta tugma: bosilsa holati almashadi
 * ("tugadi" ↔ "bor"). Ataylab bitta bosish — ro'yxat kalta chiqishining
 * sababi aynan ishqalanish edi, ikki qadamli tasdiq uni yana kaltalashtirardi.
 */
export function narsalarKeyboard(narsalar: NarsaToliq[], admin: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const n of narsalar.filter((x) => x.faol)) {
    const belgi = n.tugadi ? "🔴" : "🟢";
    kb.text(`${belgi} ${n.emoji} ${n.nom}`, `narsa_belgi:${n.id}`).row();
  }

  kb.text("➕ Ro'yxatga qo'shish", "narsa_yangi").row();

  if (admin) {
    if (narsalar.some((n) => n.faol && n.tugadi)) {
      kb.text("✅ Olindi — ro'yxatni tozalash", "narsa_olindi").row();
    }
    kb.text("⚙️ Ro'yxatni tahrirlash", "narsa_tahrir").row();
  }
  kb.text("⬅️ Pul yig'imi", "yigim_korinish");
  return kb;
}

/** Admin: tahrir rejimi — har narsa o'z kartochkasiga olib boradi. */
export function narsalarTahrirKeyboard(narsalar: NarsaToliq[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const n of narsalar) {
    const belgi = n.faol ? (n.tugadi ? "🔴" : "🟢") : "⛔️";
    kb.text(`${belgi} ${n.emoji} ${n.nom}`, `narsa:${n.id}`).row();
  }
  kb.text("➕ Yangi narsa", "narsa_yangi").row();
  kb.text("⬅️ Ro'yxat", "narsalar");
  return kb;
}

/** Bitta narsaning kartochkasi. */
export function narsaDetalKeyboard(n: NarsaToliq): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✏️ Nomi", `narsa_nom:${n.id}`)
    .text(n.tugadi ? "🟢 Bor deb belgilash" : "🔴 Tugadi", `narsa_belgi:${n.id}`)
    .row();
  kb.text(
    n.faol ? "⛔️ Ro'yxatdan chiqarish" : "✅ Ro'yxatga qaytarish",
    `narsa_faol:${n.id}:${n.faol ? 0 : 1}`,
  ).row();
  kb.text("⬅️ Orqaga", "narsa_tahrir");
  return kb;
}

/** Yig'im ekranidan ro'yxatga o'tish — eng ko'p kerak bo'ladigan yo'l. */
export function narsalarTugmasi(): InlineKeyboard {
  return new InlineKeyboard().text("🛒 Uyga nima kerak", "narsalar");
}
