/**
 * Boshlang'ich ma'lumot: xonalar, odamlar va birinchi navbat.
 *
 * Hozir 4-xona navbatda, muddati — yakshanba (9-avgust 2026).
 * Keyingi navbatlar config.siklKuni (5 kun) bo'yicha yuradi.
 */
import { sql } from "./index.js";

const XONALAR: Record<number, string[]> = {
  1: ["Soibjon", "Diyoraka", "Sorabek"],
  2: ["Mirzoxid", "Baxtiyor", "Akbar", "Jaxongir"],
  3: ["Jamshidbek", "Nizomaka"],
  4: ["Diyorbek", "Yaxyobek"],
};

/** Navbat aylanish tartibi */
const TARTIB = [1, 2, 3, 4];

/** Kim admin (ism aynan mos kelishi kerak) */
const ADMINLAR = ["Jamshidbek"];

/** Hozir navbatda turgan xona va uning muddati */
const HOZIRGI_XONA = 4;
const HOZIRGI_MUDDAT = new Date("2026-08-09T23:59:00+05:00"); // yakshanba

const bor = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM rooms`;
if ((bor[0]?.n ?? 0) > 0) {
  console.log("⚠️  Baza allaqachon to'ldirilgan.");
  await sql.end();
  process.exit(0);
}

for (const [i, raqam] of TARTIB.entries()) {
  await sql`INSERT INTO rooms (raqam, tartib) VALUES (${raqam}, ${i})`;
}

for (const [raqamStr, ismlar] of Object.entries(XONALAR)) {
  const raqam = Number(raqamStr);
  const [room] = await sql<{ id: number }[]>`SELECT id FROM rooms WHERE raqam = ${raqam}`;
  if (!room) throw new Error(`${raqam}-xona topilmadi`);
  for (const ism of ismlar) {
    await sql`
      INSERT INTO users (ism, room_id, admin)
      VALUES (${ism}, ${room.id}, ${ADMINLAR.includes(ism)})
    `;
  }
}

const [hozirgi] = await sql<{ id: number }[]>`SELECT id FROM rooms WHERE raqam = ${HOZIRGI_XONA}`;
if (!hozirgi) throw new Error("Boshlang'ich xona topilmadi");

await sql`INSERT INTO turns (room_id, muddat) VALUES (${hozirgi.id}, ${HOZIRGI_MUDDAT})`;

const sanoq = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
console.log(`✅ ${TARTIB.length} xona, ${sanoq[0]?.n ?? 0} odam qo'shildi`);
console.log(`✅ Navbat: ${HOZIRGI_XONA}-xona, muddat ${HOZIRGI_MUDDAT.toISOString()}`);
console.log(`\nYangi a'zolar botda "Men yangi a'zoman" tugmasi orqali qo'shiladi.`);

await sql.end();
