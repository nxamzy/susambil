import { sql, type Room, type Submission, type Turn, type TurnIshlar, type User } from "../db/index.js";
import { config, NAVBAT_ISHLARI, type NavbatIshi } from "../config.js";
import { navbatBalli } from "./rating.js";

const KUN_MS = 24 * 60 * 60 * 1000;

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
 */
export async function navbatniYopish(
  turn: Turn,
  room: Room,
  sabab: "tasdiqlandi" | "admin_yopdi" = "tasdiqlandi",
): Promise<YopishNatijasi | null> {
  const hozir = new Date();
  const kechikdi = kechikkanKun(turn.muddat, hozir);
  const keyingiRoom = await keyingiXona(room);
  const yangiMuddat = new Date(hozir.getTime() + config.siklKuni * KUN_MS);

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

/** Navbatni admin qo'lda boshqa xonaga o'tkazadi. */
export async function navbatniOzgartirish(xonaRaqami: number): Promise<FaolNavbat> {
  const [room] = await sql<Room[]>`SELECT * FROM rooms WHERE raqam = ${xonaRaqami}`;
  if (!room) throw new Error(`${xonaRaqami}-xona topilmadi`);

  const muddat = new Date(Date.now() + config.siklKuni * KUN_MS);

  await sql.begin(async (tx) => {
    await tx`UPDATE turns SET holat = 'admin_yopdi', tasdiqlandi = now() WHERE holat = 'faol'`;
    await tx`INSERT INTO turns (room_id, muddat) VALUES (${room.id}, ${muddat})`;
  });

  const yangi = await faolNavbat();
  if (!yangi) throw new Error("Yangi navbat yaratilmadi");
  return yangi;
}

/**
 * Bitta vazifani (xona/hammom/oshxona/musor) rasm bilan belgilaydi.
 * Faqat 'faol' navbatda ishlaydi — yopilgan navbatga qo'lda callback orqali
 * urinilsa jimgina `null` qaytadi.
 *
 * Qayta bosilsa (rasmni almashtirish) ustidan yozadi — muammo emas, chunki
 * `jsonb_set` shu kalitning o'zini yangilaydi, boshqalariga tegmaydi.
 */
export async function ishBelgila(
  turnId: number,
  ish: NavbatIshi,
  userId: number,
  photoId: string,
): Promise<Turn | null> {
  const qiymat = { photo_id: photoId, user_id: userId, vaqt: new Date().toISOString() };
  const [t] = await sql<Turn[]>`
    UPDATE turns
    SET ishlar = jsonb_set(ishlar, ARRAY[${ish}]::text[], ${sql.json(qiymat)}, true)
    WHERE id = ${turnId} AND holat = 'faol'
    RETURNING *
  `;
  return t ?? null;
}

/** Sof funksiyalar — bazasiz testlanadi. */
export function barchaIshlarBajarildimi(ishlar: TurnIshlar): boolean {
  return NAVBAT_ISHLARI.every((k) => ishlar[k] !== undefined);
}

export function qolganIshlar(ishlar: TurnIshlar): NavbatIshi[] {
  return NAVBAT_ISHLARI.filter((k) => ishlar[k] === undefined);
}

export function bajarilganIshlarSoni(ishlar: TurnIshlar): number {
  return NAVBAT_ISHLARI.length - qolganIshlar(ishlar).length;
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
export async function navbatTopshir(turn: Turn, finalizerUserId: number): Promise<Submission> {
  const photoIds = NAVBAT_ISHLARI.map((k) => turn.ishlar[k]?.photo_id).filter(
    (id): id is string => Boolean(id),
  );

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
