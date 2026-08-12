import { InlineKeyboard, Keyboard } from "grammy";
import {
  ISH_TURLARI,
  ISHONCH_DARAJASI,
  NAVBAT_ISHLARI,
  NAVBAT_RASM_SONI,
  SEKIN_ISHLAR,
  SHIKOYAT_JOYLARI,
  TEZ_ISHLAR,
  type Ishonch,
  type IshTuri,
  type ShikoyatJoyi,
} from "../config.js";
import type { TurnIshlar, User } from "../db/index.js";
import type { ReportToliq } from "../core/reports.js";
import type { SiklOdam, TolovDashboard } from "../core/tolov.js";
import { ishRasmlari } from "../core/rotation.js";
import type { FoydalanuvchiToliq } from "../core/users.js";

/** Ish tugmasining yozuvi — inline va doimiy menyuda bir xil bo'lsin. */
export function ishTugmasi(t: IshTuri): string {
  const i = ISH_TURLARI[t];
  return `${i.emoji} ${i.tugma}`;
}

/** Doimiy menyudagi ko'rinish tugmalari. */
export const MENYU = {
  navbat: "📋 Navbat",
  xarajat: "💰 Xarajatlar",
  tolov: "💳 Kvartira to'lovi",
  reyting: "🏆 Reyting",
  profil: "👤 Profil",
  azolar: "👥 A'zolar",
  tarix: "🕘 Tarix",
  tanishtirish: "ℹ️ Qanday ishlaydi?",
} as const;

/** Menyudagi tugmasi yo'q ish turlarini ochadigan tugma. */
export const BOSHQA_ISH = "➕ Boshqa ish";

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

/** Yozuv bo'yicha ish turini topadi (doimiy menyu tugmasi bosilganda). */
export function tugmaIshTuri(matn: string): IshTuri | null {
  for (const t of Object.keys(ISH_TURLARI) as IshTuri[]) {
    if (ishTugmasi(t) === matn) return t;
  }
  return null;
}

/**
 * Shaxsiy chatdagi doimiy tugmalar — yozish maydonining ostida turadi va
 * hech qachon yo'qolmaydi. Guruhda ishlatilmaydi: u yerda tugmalar hammaga
 * ko'rinib, chatni bosib qo'yardi — guruh uchun `panelKeyboard()` bor.
 */
export function menyuKeyboard(isAdmin = false, isDutyUser = false): Keyboard {
  const kb = new Keyboard();
  for (const t of TEZ_ISHLAR) kb.text(ishTugmasi(t)).row();
  kb.text(BOSHQA_ISH).row();
  if (isDutyUser) kb.text(MENING_NAVBATIM_TUGMA).row();
  kb.text(MENYU.navbat).text(MENYU.xarajat).row();
  kb.text(MENYU.tolov).row();
  kb.text(MENYU.reyting).text(MENYU.profil).row();
  kb.text(MENYU.azolar).text(MENYU.tarix).row();
  kb.text(MENYU.tanishtirish).row();
  kb.text(SHIKOYAT_TUGMA);
  if (isAdmin) kb.row().text(ADMIN_PANEL_TUGMA);
  return kb.resized().persistent();
}

/** Menyuda tugmasi yo'q ish turlari. */
export function boshqaIshKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of SEKIN_ISHLAR) kb.text(ishTugmasi(t), `ish:${t}`).row();
  kb.text("✖️ Bekor qilish", "bekor");
  return kb;
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
  for (const t of TEZ_ISHLAR) kb.text(ishTugmasi(t), `ish:${t}`).row();
  kb.text(BOSHQA_ISH, "korish:boshqaish").row();
  kb.text(MENYU.navbat, "korish:navbat");
  kb.text(MENYU.xarajat, "korish:xarajat").row();
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

/**
 * Rasm kutilayotgandagi tugmalar. "Rasmim yo'q" kerak, chunki ba'zi ishning
 * (masalan musor tashlash) rasmini olish qiyin — u holda ish baribir guruh
 * tasdig'iga chiqadi, faqat rasmsiz.
 */
export function rasmKutishKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📷 Rasmim yo'q — shundoq yuboraman", "rasmsiz")
    .row()
    .text("✖️ Bekor qilish", "bekor");
}

/**
 * Kamida bitta rasm kelgandan keyin — yana rasm tashlash mumkin
 * (to'g'ridan-to'g'ri, tugma shart emas) yoki shu bilan yakunlash mumkin.
 * "Rasmim yo'q" bu yerda yo'q — kamida bitta rasm allaqachon bor.
 */
export function ishTugatishKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Tugatdim — yubor", "ish_tugatdi")
    .row()
    .text("✖️ Bekor qilish", "bekor");
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

/** Guruhdan bir bosishda xarajat qo'shish uchun botga havola. */
export function xarajatQoshishKeyboard(botUsername: string): InlineKeyboard {
  return new InlineKeyboard().url(
    "➕ Men ham olib keldim",
    `https://t.me/${botUsername}?start=xarajat`,
  );
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
  const kb = new InlineKeyboard()
    .text(`🔴 Qarzdorlar (${d.qarzdorlar.length})`, "tolov_royxat:qarzdor")
    .row();

  // Kechikkanlar tugmasi faqat kerak bo'lganda — muddat kelmagan oyda u
  // har doim bo'sh bo'lardi va panelni behuda uzaytirardi.
  if (d.kechikkanlar.length > 0) {
    kb.text(`⛔️ Kechikkanlar (${d.kechikkanlar.length})`, "tolov_royxat:kechikkan").row();
  }

  kb.text(`🟢 To'laganlar (${d.tola.length})`, "tolov_royxat:tolagan").row();

  if (d.kutilmoqdaSoni > 0) {
    kb.text(`⏳ Tekshiruvdagilar (${d.kutilmoqdaSoni})`, "tolov_kutilmoqda").row();
  }

  kb.text("📜 Tarix", "tolov_tarix_admin").row();

  if (d.sikl.holat === "muddat_yetdi") {
    kb.text("🔒 Oyni yakunlash", `tolov_yakunla:${d.sikl.id}`).row();
  }
  kb.text("⬅️ Admin panel", "admin_panel");
  return kb;
}

/** Bitta ro'yxat ko'rinishi: har bir odam alohida tugmada + orqaga. */
export function tolovRoyxatKeyboard(odamlar: SiklOdam[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of odamlar) {
    const belgi = o.kechikkan ? "⛔️" : o.qoldiq === 0 ? "🟢" : o.tasdiqlangan > 0 ? "🟡" : "🔴";
    kb.text(`${belgi} ${o.ism} — ${qisqaPul(o.qoldiq)}`, `tolov_user:${o.userId}`).row();
  }
  kb.text("⬅️ To'lovlar", "tolov_dashboard");
  return kb;
}

/** Tugmada to'liq "900 000 so'm" sig'maydi — "900k" ko'rinishida qisqartiramiz. */
function qisqaPul(n: number): string {
  if (n === 0) return "to'liq";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}mln qoldi`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k qoldi`;
  return `${n} qoldi`;
}

/** Bitta odamning to'lov kartochkasidan orqaga qaytish. */
export function tolovFoydalanuvchiKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ To'lovlar ro'yxati", "tolov_dashboard");
}

/**
 * "Mening Navbatim" panelidagi 4 ta vazifa tugmasi — har biri alohida
 * bosiladi (bittalik "Bajardim" emas). Hammasi bajarilganda "Yakuniy
 * topshirish" qo'shiladi; hali kamida bittasi qolgan bo'lsa umuman
 * chiqmaydi — talab qilingan vazifalarsiz yakunlab bo'lmasligi shu bilan
 * kafolatlanadi (server tomonda ham tekshiriladi).
 */
export function vazifaKeyboard(turnId: number, ishlar: TurnIshlar): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of NAVBAT_ISHLARI) {
    const i = ISH_TURLARI[t];
    const kerak = NAVBAT_RASM_SONI[t];
    const soni = ishRasmlari(ishlar[t]).length;
    const bajarildi = soni >= kerak;
    const son = kerak > 1 ? ` (${soni}/${kerak})` : "";
    kb.text(
      bajarildi ? `✅ ${i.nom}${son} — bajarildi` : `${i.emoji} ${i.nom}${son}`,
      `navbat_ish:${turnId}:${t}`,
    ).row();
  }
  if (NAVBAT_ISHLARI.every((t) => ishRasmlari(ishlar[t]).length >= NAVBAT_RASM_SONI[t])) {
    kb.text("📸 Yakuniy topshirish", `navbat_topshir:${turnId}`);
  }
  return kb;
}

/** Admin: joriy navbatni qo'lda boshqarish tugmalari. */
export function navbatAdminKeyboard(turnId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Yakunlangan deb belgilash", `navbat_admin_tugat:${turnId}`)
    .row()
    .text("🔄 Qaytadan boshlash", `navbat_admin_qayta:${turnId}`)
    .row()
    .text("🔔 Hozir eslatish", `navbat_admin_eslatma:${turnId}`)
    .row()
    .text("🔀 Boshqa xonaga o'tkazish", "admin_navbat_xonaga");
}

/** Admin: hali navbat boshlanmagan bo'lsa — boshlash tugmasi. */
export function navbatBoshlashKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("▶️ Navbatni boshlash", "admin_navbat_boshla");
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
    .text("💰 To'lovlar", "admin_link_tolovlar")
    .text("🧹 Navbat", "admin_link_navbat")
    .row()
    .text("🚨 Shikoyatlar", "admin_link_shikoyatlar")
    .row()
    .text("⚠️ Kelishmovchiliklar", "admin_conflicts")
    .text("📜 Tarix", "admin_logs");
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
