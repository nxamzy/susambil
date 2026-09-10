import {
  sql,
  type Room,
  type Submission,
  type Turn,
  type TurnIshBelgisi,
  type TurnIshlar,
  type User,
} from "../db/index.js";
import { config, RASM_MAX } from "../config.js";
import type { NavbatVazifasi } from "./vazifalar.js";
import { logla } from "./adminlog.js";
import { navbatBalli } from "./rating.js";
import { bugungiSana } from "./vaqt.js";

const KUN_MS = 24 * 60 * 60 * 1000;

/**
 * Navbat vaqt sozlamalari — `config.ts`dagi qiymatlar endi faqat STANDART,
 * haqiqiysi `settings` jadvalidan o'qiladi (`tolov_talab`/`karta` bilan bir
 * xil naqsh).
 *
 * Nima uchun kerak bo'ldi: navbat guruh tasdig'ini kutib 3 kun cho'zilib
 * ketgach, admin uni keyingi xonaga o'tkazsa yangi muddat baribir
 * "hozir + 5 kun" bo'lardi — ya'ni uy jami 8+ kun tozalanmay qolardi va
 * buni kodni tahrirlamasdan qisqartirib bo'lmasdi.
 *
 * ATAYLAB keshlanmaydi (`core/tolov.ts`dagi talab/kartadan farqli): bu
 * qiymat navbat YARATILAYOTGAN paytda o'qiladi va noto'g'ri qiymat butun
 * bir siklning muddatini buzadi. Issiq Vercel instansiyasidagi eskirgan
 * kesh ana shunday xatoga olib kelardi; bitta kichik indeksli so'rov esa
 * arzon.
 */
export type NavbatSozlamalari = {
  /** Har xonaga beriladigan muddat (kun) */
  siklKuni: number;
  /** Majburiy vazifalar muddat tugashiga necha kun qolganda ochiladi */
  majburiyKuni: number;
};

/** "Har doim ochiq" — majburiy vazifalar hech qachon qulflanmasin. */
export const MAJBURIY_DOIM_OCHIQ = 999;

export async function navbatSozlamalari(): Promise<NavbatSozlamalari> {
  const rows = await sql<{ kalit: string; qiymat: string }[]>`
    SELECT kalit, qiymat FROM settings
    WHERE kalit IN ('navbat_sikl_kuni', 'navbat_majburiy_kuni')
  `;
  const ol = (k: string, standart: number) => {
    const xom = Number(rows.find((r) => r.kalit === k)?.qiymat);
    return Number.isFinite(xom) && xom > 0 ? xom : standart;
  };
  return {
    siklKuni: ol("navbat_sikl_kuni", config.siklKuni),
    majburiyKuni: ol("navbat_majburiy_kuni", config.majburiyOchilishKuni),
  };
}

async function sozlamaYoz(kalit: string, qiymat: number): Promise<void> {
  await sql`
    INSERT INTO settings (kalit, qiymat) VALUES (${kalit}, ${String(qiymat)})
    ON CONFLICT (kalit) DO UPDATE SET qiymat = EXCLUDED.qiymat
  `;
}

/**
 * Sikl uzunligi. FAQAT KELGUSI navbatlarga ta'sir qiladi — hozir ketayotgan
 * navbatning muddati o'zgarmaydi (`tolovTalabiniOrnat` bilan bir xil
 * qoida: o'tgan/joriy davrning sharti qayta yozilmaydi). Joriy navbatni
 * qisqartirish uchun `muddatniOzgartir` bor.
 */
export async function siklKuniniOrnat(adminId: number, kun: number): Promise<number> {
  const eski = (await navbatSozlamalari()).siklKuni;
  const yangi = Math.min(30, Math.max(1, Math.round(kun)));
  await sozlamaYoz("navbat_sikl_kuni", yangi);
  await logla(adminId, "navbat_sikl_kuni", "navbat", null, String(eski), String(yangi));
  return yangi;
}

export async function majburiyKuniniOrnat(adminId: number, kun: number): Promise<number> {
  const eski = (await navbatSozlamalari()).majburiyKuni;
  const yangi = Math.min(MAJBURIY_DOIM_OCHIQ, Math.max(1, Math.round(kun)));
  await sozlamaYoz("navbat_majburiy_kuni", yangi);
  await logla(adminId, "navbat_majburiy_kuni", "navbat", null, String(eski), String(yangi));
  return yangi;
}

/**
 * Joriy navbatning muddatini qo'lda o'zgartiradi — "shu paytdan boshlab N
 * kun". Sikl sozlamasidan ALOHIDA: oldingi navbat kechikkani uchun uy uzoq
 * tozalanmay qolgan bo'lsa, admin aynan SHU navbatga kamroq (yoki ko'proq)
 * vaqt beradi, kelgusi sikllar esa o'z uzunligida qolaveradi.
 *
 * `oxirgi_eslatma`/`oxirgi_ping` ATAYLAB tozalanmaydi: eslatma mantig'i
 * (`jobs/reminders.ts`) har safar muddatdan qayta hisoblaydi, shuning uchun
 * muddat uzaytirilsa eslatma o'zidan to'xtaydi, qisqartirilsa o'zidan
 * boshlanadi — qo'shimcha bayroq kerak emas.
 */
export async function muddatniOzgartir(
  adminId: number,
  turnId: number,
  kun: number,
): Promise<Turn | null> {
  const chegaralangan = Math.min(30, Math.max(0, Math.round(kun)));

  // 0 kun = "bugun kechgacha", ya'ni Toshkent bo'yicha shu kunning oxiri —
  // `now() + 0` bo'lsa muddat o'sha soniyadayoq o'tib ketgan bo'lardi va
  // xona hech narsa qilmasdan kechikkan hisoblanardi. +05:00 ofseti
  // `db/seed.ts` dagi bilan bir xil: Toshkentda yoz/qish vaqti yo'q.
  const yangiMuddat =
    chegaralangan === 0
      ? new Date(`${bugungiSana()}T23:59:00+05:00`)
      : new Date(Date.now() + chegaralangan * KUN_MS);

  const [turn] = await sql<Turn[]>`
    UPDATE turns SET muddat = ${yangiMuddat}
    WHERE id = ${turnId} AND holat = 'faol'
    RETURNING *
  `;
  if (!turn) return null;

  await logla(adminId, "navbat_muddati", "navbat", turnId, null, yangiMuddat.toISOString());
  return turn;
}

export type FaolNavbat = {
  turn: Turn;
  room: Room;
  azolar: User[];
};

/** Hozir navbatda turgan xona. Navbat yo'q bo'lsa null. */
export async function faolNavbat(): Promise<FaolNavbat | null> {
  const [turn] = await sql<Turn[]>`
    SELECT * FROM turns WHERE holat = 'faol' ORDER BY id DESC LIMIT 1
  `;
  if (!turn) return null;

  const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${turn.room_id}`;
  if (!room) return null;

  return { turn, room, azolar: await xonaAzolari(turn.room_id) };
}

/**
 * Shu xona hozir navbatda turibdimi — "🧹 Mening navbatim" tugmasini
 * pastki menyuda ko'rsatish/yashirish shu bilan aniqlanadi (bot/keyboards.ts
 * `menyuKeyboard`). Xonasiz odam (`roomId === null`) hech qachon `true`
 * bo'lmaydi.
 */
export async function joriyNavbatchimi(roomId: number | null): Promise<boolean> {
  if (roomId === null) return false;
  const n = await faolNavbat();
  return n?.room.id === roomId;
}

export async function xonaAzolari(roomId: number): Promise<User[]> {
  return sql<User[]>`
    SELECT * FROM users WHERE room_id = ${roomId} AND faol ORDER BY id
  `;
}

/**
 * Navbat tartibi u yoq-bu yoq yuradi — oxiriga yetgach boshiga sakramaydi,
 * orqasiga qaytadi:
 *
 *   1 → 2 → 3 → 4 → 3 → 2 → 1 → 2 → 3 → 4 → ...
 *
 * Yo'nalish alohida saqlanmaydi, oldingi navbatdan aniqlanadi. Shunday
 * qilingani uchun admin /navbatber bilan qo'lda sakratsa ham tartib o'zidan
 * tiklanadi — hech qayerda "eskirgan yo'nalish" qolib ketmaydi.
 */
export async function keyingiXona(hozirgi: Room): Promise<Room> {
  const xonalar = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib`;
  if (xonalar.length === 0) throw new Error("Bazada birorta ham xona yo'q");

  const joy = xonalar.findIndex((x) => x.id === hozirgi.id);
  if (joy === -1) return xonalar[0]!;

  // Oldingi tugagan navbat boshqa xonada bo'lgan — qay tomonga yurayotganimiz
  // shundan bilinadi. Birinchi navbatda hech nima yo'q, oldinga yuramiz.
  const [oldingi] = await sql<{ room_id: number }[]>`
    SELECT room_id FROM turns
    WHERE holat <> 'faol' AND room_id <> ${hozirgi.id}
    ORDER BY id DESC LIMIT 1
  `;
  const oldingiJoy = oldingi ? xonalar.findIndex((x) => x.id === oldingi.room_id) : -1;

  return xonalar[keyingiJoy(joy, oldingiJoy, xonalar.length)]!;
}

/**
 * Yuqoridagi tartibning sof mantiqi — bazasiz testlash uchun ajratilgan.
 *
 * @param joy        hozirgi xonaning tartibdagi o'rni (0 dan)
 * @param oldingiJoy oldingi navbat xonasining o'rni; bilinmasa -1
 * @param soni       jami xonalar soni
 */
/**
 * Kelgusi navbatlar tartibi. Hozirgi navbatdan keyin kim kelishini oldindan
 * ko'rsatish uchun — bazaga tegmasdan, o'sha tartib mantiqi bilan hisoblanadi.
 */
export async function kelgusiTartib(nechta = 3): Promise<{ room: Room; azolar: User[] }[]> {
  const navbat = await faolNavbat();
  if (!navbat) return [];

  const xonalar = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib`;
  if (xonalar.length < 2) return [];

  const [oldingi] = await sql<{ room_id: number }[]>`
    SELECT room_id FROM turns
    WHERE holat <> 'faol' AND room_id <> ${navbat.room.id}
    ORDER BY id DESC LIMIT 1
  `;

  let joy = xonalar.findIndex((x) => x.id === navbat.room.id);
  let oldingiJoy = oldingi ? xonalar.findIndex((x) => x.id === oldingi.room_id) : -1;
  if (joy === -1) return [];

  const natija: { room: Room; azolar: User[] }[] = [];
  for (let i = 0; i < Math.min(nechta, xonalar.length); i++) {
    const keyingi = keyingiJoy(joy, oldingiJoy, xonalar.length);
    oldingiJoy = joy;
    joy = keyingi;
    const room = xonalar[joy]!;
    natija.push({ room, azolar: await xonaAzolari(room.id) });
  }
  return natija;
}

export function keyingiJoy(joy: number, oldingiJoy: number, soni: number): number {
  if (soni <= 1) return 0;
  let yonalish = oldingiJoy === -1 || oldingiJoy < joy ? 1 : -1;
  if (joy + yonalish < 0 || joy + yonalish >= soni) yonalish = -yonalish;
  return joy + yonalish;
}

/** Muddatdan necha kun kechikkani (butun kun, kamida 0). */
export function kechikkanKun(muddat: Date, sana: Date = new Date()): number {
  const farq = sana.getTime() - new Date(muddat).getTime();
  return farq <= 0 ? 0 : Math.ceil(farq / KUN_MS);
}

export type YopishNatijasi = {
  kechikkanKun: number;
  jarima: number;
  /** Xonaning har bir a'zosiga tegadigan ball */
  ballHar: number;
  keyingi: { room: Room; azolar: User[]; muddat: Date };
};

/**
 * Navbatni yopadi va keyingi xonaga o'tkazadi.
 *
 * Ikki kishi 3-tasdiqni bir vaqtda bosishi mumkin, shuning uchun navbat
 * qatori `FOR UPDATE` bilan qulflanadi va holati tranzaksiya ichida qayta
 * tekshiriladi. Allaqachon yopilgan bo'lsa `null` qaytadi — aks holda
 * ikkita keyingi navbat yaralib qolardi.
 *
 * @param hisoblashVaqti Kechikish shu vaqtdan hisoblanadi — navbatchi
 *   "Yakuniy topshirish"ni BOSGAN payt (`submissions.created_at`), guruh/
 *   admin QACHON tasdiqlagani EMAS. Aks holda tasdiqlash kechiksa (masalan
 *   admin kechqurun ko'rib chiqsa), navbatchi o'z vazifasini vaqtida
 *   topshirgan bo'lsa ham jarimalanib qolardi — bu uning aybi emas.
 *   Chaqiruvchida mos submission topilmasa (masalan admin hech kim hech
 *   narsa topshirmagan holda majburan yopsa), standart `new Date()` qoladi.
 */
export async function navbatniYopish(
  turn: Turn,
  room: Room,
  sabab: "tasdiqlandi" | "admin_yopdi" = "tasdiqlandi",
  hisoblashVaqti: Date = new Date(),
): Promise<YopishNatijasi | null> {
  const hozir = new Date();
  const kechikdi = kechikkanKun(turn.muddat, hisoblashVaqti);
  const keyingiRoom = await keyingiXona(room);
  const { siklKuni } = await navbatSozlamalari();
  const yangiMuddat = new Date(hozir.getTime() + siklKuni * KUN_MS);

  const yopildi = await sql.begin(async (tx) => {
    const qulf = await tx<{ id: number }[]>`
      SELECT id FROM turns WHERE id = ${turn.id} AND holat = 'faol' FOR UPDATE
    `;
    if (qulf.length === 0) return false; // boshqa chaqiruv allaqachon yopgan

    await tx`
      UPDATE turns
      SET holat = ${sabab}, tasdiqlandi = ${hozir}, kechikkan_kun = ${kechikdi}
      WHERE id = ${turn.id}
    `;

    await tx`
      INSERT INTO turns (room_id, muddat) VALUES (${keyingiRoom.id}, ${yangiMuddat})
    `;
    return true;
  });

  if (!yopildi) return null;

  const azolar = await xonaAzolari(room.id);
  return {
    kechikkanKun: kechikdi,
    jarima: kechikdi * config.jarimaKunlik,
    ballHar: navbatBalli(azolar.length, kechikdi),
    keyingi: {
      room: keyingiRoom,
      azolar: await xonaAzolari(keyingiRoom.id),
      muddat: yangiMuddat,
    },
  };
}

/**
 * Admin: navbatni yo'qdan boshlaydi — hech qanday navbat ketmayotgan
 * bo'lsagina ishlaydi (aks holda ikkita faol navbat yaralib qolardi).
 * /navbatboshla buyrug'i va Admin Panel'dagi "▶️ Navbatni boshlash"
 * tugmasi shu bir funksiyani ishlatadi, ikkinchi nusxa yo'q.
 */
export async function navbatniBoshlash(): Promise<FaolNavbat | null> {
  if (await faolNavbat()) return null;

  const [birinchi] = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib LIMIT 1`;
  if (!birinchi) return null;

  const { siklKuni } = await navbatSozlamalari();
  const muddat = new Date(Date.now() + siklKuni * KUN_MS);
  await sql`INSERT INTO turns (room_id, muddat) VALUES (${birinchi.id}, ${muddat})`;

  return faolNavbat();
}

/** Navbatni admin qo'lda boshqa xonaga o'tkazadi. */
export async function navbatniOzgartirish(xonaRaqami: number): Promise<FaolNavbat> {
  const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE raqam = ${xonaRaqami}`;
  if (!room) throw new Error(`${xonaRaqami}-xona topilmadi`);

  const { siklKuni } = await navbatSozlamalari();
  const muddat = new Date(Date.now() + siklKuni * KUN_MS);

  await sql.begin(async (tx) => {
    await tx`UPDATE turns SET holat = 'admin_yopdi', tasdiqlandi = now() WHERE holat = 'faol'`;
    await tx`INSERT INTO turns (room_id, muddat) VALUES (${room.id}, ${muddat})`;
  });

  const yangi = await faolNavbat();
  if (!yangi) throw new Error("Yangi navbat yaratilmadi");
  return yangi;
}

/**
 * Bitta vazifaning to'plangan rasmlari — eski ("photo_id", bitta rasm) va
 * yangi ("photo_ids", array) formatni ikkalasini ham tushunadi, shuning
 * uchun deploydan oldin allaqachon belgilangan vazifalar yo'qolib
 * qolmaydi. Yangi yozuvlar hech qachon "photo_id"ni ishlatmaydi.
 */
export function ishRasmlari(belgi: TurnIshBelgisi | undefined): string[] {
  if (!belgi) return [];
  if (belgi.photo_ids) return belgi.photo_ids;
  return belgi.photo_id ? [belgi.photo_id] : [];
}

export type IshBelgilashNatija = {
  turn: Turn;
  /** Joriy martada kerakli (MINIMUM) rasm yig'ilib bo'ldimi. */
  toliq: boolean;
  /**
   * AYNAN shu rasm joriy martani birinchi marta MINIMUM'ga yetkazdimi.
   * Qo'shish atomik bo'lgani uchun butun albom davomida ROSA BIR MARTA
   * `true` — chaqiruvchi jonli xabarda "endi Tugatdim tugmasi bor" holatiga
   * shunga qarab bir marta o'tadi.
   */
  yangiToldi: boolean;
  /** Joriy martada yig'ilgan rasm soni */
  soni: number;
  /** Bir martani yopish uchun kerakli minimum */
  kerak: number;
  /** Shu vazifa navbat davomida hozirgacha necha marta YOPILGAN */
  bajarilgan: number;
  /** Vazifa jami necha marta bajarilishi shart (`takror_soni`) */
  takror: number;
  /**
   * Shu chaqiruvdagi rasm saqlandimi. `false` — faqat QATTIQ chegaraga
   * (`RASM_MAX`) yetilgan holat.
   */
  yozildimi: boolean;
};

/**
 * Bitta vazifaga rasm qo'shadi — YOZIB YUBORMAYDI, YIG'ADI. Nechta rasm
 * kerakligi `navbat_vazifalari.rasm_soni` dan keladi (admin panelidan
 * o'zgartiriladi), bu yerda hech qanday qattiq son yo'q.
 *
 * Bitta SQL bilan atomik qo'shiladi (o'qib-yozish emas) — Telegram albomni
 * bir nechta ALOHIDA yangilanish qilib, ko'pincha bir vaqtda yetkazadi;
 * o'qib-yozish bo'lsa ikkita chaqiruv bir xil eski qiymatni o'qib,
 * bir-birining ustidan yozib yuborardi.
 *
 * `COALESCE` ichidagi `photo_id` bo'limi eski (bitta rasmli) formatdagi
 * yozuvni yangi massivga ko'chiradi — bo'lmasa migratsiyadan oldin
 * belgilangan vazifaga yangi rasm tushganda eskisi yo'qolib ketardi.
 *
 * Faqat 'faol' navbatda ishlaydi; yopilgan navbatga eski callback orqali
 * urinilsa `null` qaytadi.
 */
export async function ishBelgila(
  turnId: number,
  vazifa: NavbatVazifasi,
  userId: number,
  photoId: string,
): Promise<IshBelgilashNatija | null> {
  const kod = vazifa.kod;
  const kerak = vazifa.rasm_soni;

  // `COALESCE(ishlar->kod,'{}') || {yangi kalitlar}` — MERGE, to'liq
  // almashtirish EMAS: aks holda oldingi marta yopilganda yozib qo'yilgan
  // `bajarilgan` va `tarix` keyingi martaning birinchi rasmida o'chib
  // ketardi. `||` faqat `photo_ids`/`user_id`/`vaqt`ни yangilaydi.
  const [yangilangan] = await sql<Turn[]>`
    UPDATE turns
    SET ishlar = jsonb_set(
      ishlar,
      ARRAY[${kod}]::text[],
      COALESCE(ishlar -> ${kod}, '{}'::jsonb) || jsonb_build_object(
        'photo_ids', ${mavjudRasmlar(kod)} || to_jsonb(${photoId}::text),
        'user_id', ${userId}::int,
        'vaqt', now()
      ),
      true
    )
    WHERE id = ${turnId} AND holat = 'faol'
      AND jsonb_array_length(${mavjudRasmlar(kod)}) < ${RASM_MAX}
    RETURNING *
  `;

  if (yangilangan) {
    const belgi = yangilangan.ishlar[kod];
    const soni = ishRasmlari(belgi).length;
    return {
      turn: yangilangan,
      toliq: soni >= kerak,
      yangiToldi: soni === kerak,
      soni,
      kerak,
      bajarilgan: bajarilganMarta(belgi),
      takror: vazifa.takror_soni,
      yozildimi: true,
    };
  }

  // Yozilmadi — navbat yopilganmi yoki qattiq chegaraga yetilganmi.
  const [joriy] = await sql<Turn[]>`SELECT * FROM turns WHERE id = ${turnId} AND holat = 'faol'`;
  if (!joriy) return null;

  const belgi = joriy.ishlar[kod];
  const soni = ishRasmlari(belgi).length;
  return {
    turn: joriy,
    toliq: soni >= kerak,
    yangiToldi: false,
    soni,
    kerak,
    bajarilgan: bajarilganMarta(belgi),
    takror: vazifa.takror_soni,
    yozildimi: false,
  };
}

/**
 * "✅ Tugatdim" — joriy martani yopadi.
 *
 * FAQAT joriy martada kamida `rasm_soni` ta rasm bo'lsa ishlaydi (aks holda
 * `null`). Ilgari bu narsa AVTOMATIK edi (rasm yetdi → vazifa bajarildi),
 * endi ochiq harakat: odam "bitta rasm bilan ketib qolmayapman-ku" deb
 * xotirjam yana rasm qo'sha oladi.
 *
 * Yana marta qolgan bo'lsa: joriy rasmlar `tarix`ga ko'chiriladi,
 * `photo_ids` bo'shatiladi — keyingi marta toza boshlanadi. Oxirgi marta
 * bo'lsa joriy rasmlar o'z joyida qoladi (yakuniy albomga kiradi).
 *
 * `FOR UPDATE` bilan qulflanadi — kech kelgan albom rasmi (`ishBelgila`)
 * shu yopish bilan poygaga tushmasin.
 */
export type MartaYopishNatija = {
  turn: Turn;
  /** Vazifa ENDI to'liq bajarildimi (barcha martalar yopildi) */
  vazifaTugadi: boolean;
  bajarilgan: number;
  takror: number;
};

export async function martaniYop(
  turnId: number,
  vazifa: NavbatVazifasi,
  userId: number,
): Promise<MartaYopishNatija | null> {
  return sql.begin(async (tx) => {
    const [t] = await tx<Turn[]>`
      SELECT * FROM turns WHERE id = ${turnId} AND holat = 'faol' FOR UPDATE
    `;
    if (!t) return null;

    const belgi = t.ishlar[vazifa.kod];
    const joriySoni = ishRasmlari(belgi).length;
    const bajarilgan = bajarilganMarta(belgi);

    // Allaqachon to'liq — hech nima qilmaymiz.
    if (bajarilgan >= vazifa.takror_soni) {
      return { turn: t, vazifaTugadi: true, bajarilgan, takror: vazifa.takror_soni };
    }
    // Hali yetarli rasm yo'q — yopib bo'lmaydi.
    if (joriySoni < vazifa.rasm_soni) return null;

    const yangiBajarilgan = bajarilgan + 1;
    const oxirgi = yangiBajarilgan >= vazifa.takror_soni;

    const yangiBelgi = oxirgi
      ? {
          photo_ids: ishRasmlari(belgi),
          user_id: userId,
          vaqt: new Date().toISOString(),
          bajarilgan: yangiBajarilgan,
          tarix: belgi?.tarix ?? [],
        }
      : {
          photo_ids: [] as string[],
          user_id: userId,
          vaqt: new Date().toISOString(),
          bajarilgan: yangiBajarilgan,
          tarix: [
            ...(belgi?.tarix ?? []),
            {
              photo_ids: ishRasmlari(belgi),
              user_id: belgi?.user_id ?? userId,
              vaqt: belgi?.vaqt ?? new Date().toISOString(),
            },
          ],
        };

    const [yangilangan] = await tx<Turn[]>`
      UPDATE turns
      SET ishlar = jsonb_set(ishlar, ARRAY[${vazifa.kod}]::text[], ${sql.json(yangiBelgi)}, true)
      WHERE id = ${turnId} AND holat = 'faol'
      RETURNING *
    `;
    if (!yangilangan) return null;

    return {
      turn: yangilangan,
      vazifaTugadi: oxirgi,
      bajarilgan: yangiBajarilgan,
      takror: vazifa.takror_soni,
    };
  });
}

/**
 * Vazifadagi hozirgi rasmlar massivi — yangi (`photo_ids`) formatni, u
 * bo'lmasa eski bitta rasmli (`photo_id`) formatni o'qiydi.
 *
 * FUNKSIYA, konstanta emas: postgres.js fragment sifatida inline qilinganda
 * Query obyektini o'zgartiradi, shuning uchun bitta nusxani ikki joyda
 * ishlatib bo'lmaydi (CLAUDE.md dagi qoida).
 */
function mavjudRasmlar(kod: string) {
  return sql`COALESCE(
    ishlar -> ${kod} -> 'photo_ids',
    CASE WHEN jsonb_exists(ishlar -> ${kod}, 'photo_id')
         THEN jsonb_build_array(ishlar -> ${kod} -> 'photo_id')
         ELSE '[]'::jsonb END
  )`;
}

/**
 * Sof funksiyalar — bazasiz testlanadi. Vazifalar ro'yxati ATAYLAB
 * parametr: shunda bu yerda ham, `bot/text.ts`da ham baza chaqiruvi
 * bo'lmaydi, ro'yxatni esa chaqiruvchi bir marta o'qib hammasiga uzatadi.
 */

/** Vazifaning YOPILGAN martalari soni ("✅ Tugatdim" bosilganlar). */
export function bajarilganMarta(belgi: TurnIshBelgisi | undefined): number {
  return belgi?.bajarilgan ?? 0;
}

/**
 * Bitta vazifaning BARCHA rasmlari — joriy marta + `tarix`dagi yopilgan
 * martalar. Yakuniy albom uchun. `ishRasmlari` esa faqat JORIY martani
 * qaytaradi (jonli xabar shu martaning progressini ko'rsatadi).
 */
export function barchaRasmlar(belgi: TurnIshBelgisi | undefined): string[] {
  if (!belgi) return [];
  const oldingi = (belgi.tarix ?? []).flatMap((t) => t.photo_ids ?? []);
  return [...oldingi, ...ishRasmlari(belgi)];
}

/**
 * Vazifa to'liq bajarildimi — kerakli marta yopilgan bo'lsa. Rasm soniga
 * qarab EMAS: rasm yig'ilgani "Tugatdim" bosilganini anglatmaydi.
 */
export function vazifaBajarildimi(belgi: TurnIshBelgisi | undefined, vazifa: NavbatVazifasi): boolean {
  return bajarilganMarta(belgi) >= vazifa.takror_soni;
}

export function barchaIshlarBajarildimi(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): boolean {
  // Bo'sh ro'yxatda `every` `true` qaytaradi — admin hamma vazifani
  // o'chirib qo'ysa navbatni hech narsa qilmasdan yakunlash mumkin bo'lardi.
  if (vazifalar.length === 0) return false;
  return vazifalar.every((v) => vazifaBajarildimi(ishlar[v.kod], v));
}

export function qolganIshlar(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): NavbatVazifasi[] {
  return vazifalar.filter((v) => !vazifaBajarildimi(ishlar[v.kod], v));
}

export function bajarilganIshlarSoni(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): number {
  return vazifalar.length - qolganIshlar(ishlar, vazifalar).length;
}

/**
 * Navbatda yig'ilgan BARCHA rasmlar — avval joriy vazifalar tartibida,
 * keyin ro'yxatdan chiqarilgan (nofaol qilingan) vazifalarniki.
 *
 * Ikkinchi qism muhim: admin navbat o'rtasida "Hammom"ni ikkiga bo'lsa,
 * eski `hammom` kaliti endi hech qaysi faol vazifaga to'g'ri kelmaydi —
 * lekin unga tashlangan rasm ham dalil, guruhga baribir chiqishi kerak.
 */
export function navbatRasmlari(ishlar: TurnIshlar, vazifalar: NavbatVazifasi[]): string[] {
  const kodlar = vazifalar.map((v) => v.kod);
  const qolganKalitlar = Object.keys(ishlar).filter((k) => !kodlar.includes(k));
  // `barchaRasmlar` — har vazifaning HAMMA martalaridagi rasmlar (musor
  // ikki marta tashlangan bo'lsa ikkalasining ham dalili).
  return [...kodlar, ...qolganKalitlar].flatMap((k) => barchaRasmlar(ishlar[k]));
}

/**
 * Navbatning MAJBURIY tozalash vazifalari muddat tugashiga `ochilishKuni`
 * kun (yoki kamroq) qolganda ochiladi. Muddat allaqachon o'tib ketgan
 * bo'lsa ham (kechikkan holat) ochiq hisoblanadi — qulf faqat "hali erta"
 * holatini to'sadi.
 *
 * `ochilishKuni` ATAYLAB parametr: qiymat endi `settings`dan keladi
 * (`navbatSozlamalari`), funksiya esa sof qolishi va bazasiz testlanishi
 * kerak — `bot/text.ts` bilan bir xil qoida.
 */
export function majburiyOchildimi(
  muddat: Date,
  ochilishKuni: number,
  hozir: Date = new Date(),
): boolean {
  return hozir.getTime() >= new Date(muddat).getTime() - ochilishKuni * KUN_MS;
}

/**
 * Shu vazifaning tugmasi HOZIR bosiladimi.
 *
 *  - `oraliq_kun > 0` — vazifa navbat BOSHLANGANIDAN `oraliq_kun` kun
 *    o'tgach ochiladi. Global "oxirgi kun" qulfidan MUSTAQIL: musorni
 *    navbat o'rtasida tashlash kerak, oxirini kutib bo'lmaydi.
 *  - `oraliq_kun = 0` — odatdagidek `majburiyOchildimi` (muddatga
 *    `majburiyKuni` kun qolganda).
 *
 * Sof funksiya, bazasiz testlanadi — `boshlandi`/`muddat` chaqiruvchidan.
 */
export function vazifaOchiqmi(
  turn: { boshlandi: Date; muddat: Date },
  vazifa: NavbatVazifasi,
  majburiyKuni: number,
  hozir: Date = new Date(),
): boolean {
  if (vazifa.oraliq_kun > 0) {
    return hozir.getTime() >= new Date(turn.boshlandi).getTime() + vazifa.oraliq_kun * KUN_MS;
  }
  return majburiyOchildimi(turn.muddat, majburiyKuni, hozir);
}

/** `oraliq_kun` vazifalari uchun: eslatma oynasi ochilganidan beri necha kun. */
export function oraliqKunOtdi(turn: { boshlandi: Date }, oraliqKun: number, hozir: Date = new Date()): number {
  const otgan = hozir.getTime() - new Date(turn.boshlandi).getTime();
  return Math.floor(otgan / KUN_MS) - oraliqKun;
}

/**
 * Shu navbat uchun hali rad etilmagan topshiriq bormi (kutilmoqda yoki
 * tasdiqlangan). Rad etilgan ataylab hisobga kirmaydi — aks holda bir marta
 * rad etilgach xona qaytadan topshira olmay qolardi (eski buferdagi bilan
 * bir xil qoida, `submissions_faol_navbat_uniq` indeksi ham shunga mos).
 */
export async function navbatFaolTopshirigi(turnId: number): Promise<Submission | null> {
  const [sub] = await sql<Submission[]>`
    SELECT * FROM submissions
    WHERE turn_id = ${turnId} AND tur = 'navbat' AND NOT bekor AND holat <> 'rad'
    ORDER BY id DESC LIMIT 1
  `;
  return sub ?? null;
}

/**
 * Barcha vazifalar bajarilgach yakuniy topshiriqni yaratadi — guruh
 * tasdig'iga tayyor. `finalizerUserId` — "✅ Yakuniy topshirish" tugmasini
 * bosgan odam (guruh xabarida shu ko'rsatiladi, xuddi eski "kim yukladi"
 * bilan bir xil rolda).
 */
export async function navbatTopshir(
  turn: Turn,
  finalizerUserId: number,
  vazifalar: NavbatVazifasi[],
): Promise<Submission> {
  const photoIds = navbatRasmlari(turn.ishlar, vazifalar);

  const [sub] = await sql<Submission[]>`
    INSERT INTO submissions (turn_id, user_id, photo_ids, tur, holat)
    VALUES (${turn.id}, ${finalizerUserId}, ${photoIds}, 'navbat', 'kutilmoqda')
    RETURNING *
  `;
  if (!sub) throw new Error("Navbat topshirig'i yaratilmadi");
  return sub;
}

/** Admin: navbatni boshidan boshlaydi — vazifalar tozalanadi, oldingi rad etilgan/kutilmoqda topshiriq bekor qilinadi. */
export async function navbatniQaytaBoshla(turnId: number): Promise<Turn | null> {
  return sql.begin(async (tx) => {
    const [t] = await tx<Turn[]>`
      UPDATE turns SET ishlar = '{}'::jsonb, oxirgi_eslatma = NULL
      WHERE id = ${turnId} AND holat = 'faol'
      RETURNING *
    `;
    if (!t) return null;
    await tx`
      UPDATE submissions SET bekor = TRUE
      WHERE turn_id = ${turnId} AND tur = 'navbat' AND holat = 'kutilmoqda'
    `;
    return t;
  });
}
