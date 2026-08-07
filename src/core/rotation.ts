import { sql, type Room, type Turn, type User } from "../db/index.js";
import { config } from "../config.js";

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

/** Tartib bo'yicha keyingi xona (oxiridan boshiga qaytadi). */
export async function keyingiXona(hozirgi: Room): Promise<Room> {
  const [keyingi] = await sql<Room[]>`
    SELECT * FROM rooms WHERE tartib > ${hozirgi.tartib} ORDER BY tartib LIMIT 1
  `;
  if (keyingi) return keyingi;

  const [birinchi] = await sql<Room[]>`SELECT * FROM rooms ORDER BY tartib LIMIT 1`;
  if (!birinchi) throw new Error("Bazada birorta ham xona yo'q");
  return birinchi;
}

/** Muddatdan necha kun kechikkani (butun kun, kamida 0). */
export function kechikkanKun(muddat: Date, sana: Date = new Date()): number {
  const farq = sana.getTime() - new Date(muddat).getTime();
  return farq <= 0 ? 0 : Math.ceil(farq / KUN_MS);
}

export type YopishNatijasi = {
  kechikkanKun: number;
  jarima: number;
  keyingi: { room: Room; azolar: User[]; muddat: Date };
};

/**
 * Navbatni yopadi: kechikish hisoblanadi, jarima kassaga yoziladi,
 * keyingi xonaga navbat o'tadi. Hammasi bitta tranzaksiyada.
 */
export async function navbatniYopish(
  turn: Turn,
  room: Room,
  sabab: "tasdiqlandi" | "admin_yopdi" = "tasdiqlandi",
): Promise<YopishNatijasi> {
  const hozir = new Date();
  const kechikdi = kechikkanKun(turn.muddat, hozir);
  const jarima = kechikdi * config.jarimaKunlik;

  const keyingiRoom = await keyingiXona(room);
  const yangiMuddat = new Date(hozir.getTime() + config.siklKuni * KUN_MS);

  await sql.begin(async (tx) => {
    await tx`
      UPDATE turns
      SET holat = ${sabab}, tasdiqlandi = ${hozir}, kechikkan_kun = ${kechikdi}
      WHERE id = ${turn.id}
    `;

    // Chala qolgan rasmlar keyingi navbatga o'tib ketmasin
    await tx`DELETE FROM pending_photos WHERE turn_id = ${turn.id}`;

    await tx`
      INSERT INTO turns (room_id, muddat) VALUES (${keyingiRoom.id}, ${yangiMuddat})
    `;
  });

  return {
    kechikkanKun: kechikdi,
    jarima,
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
