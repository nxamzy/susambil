/**
 * Boshlang'ich ma'lumot: xonalar, odamlar va birinchi navbat.
 * Bugun (7-avgust 2026, juma) 4-xona navbatda — shuni hisobga oladi.
 */
import { sql } from "./index.js";
import { config } from "../config.js";

const XONALAR: Record<number, string[]> = {
  1: ["Soibjon", "Diyoraka", "Sorabek", "Diyor akani o'rtog'i"],
  2: ["Mirzoxid", "Baxtiyor", "Akbar", "Jaxongir"],
  3: ["Jamshidbek", "Nizomaka"],
  4: ["Diyorbek", "Yaxyobek"],
};

/** Navbat aylanish tartibi. Hozir 4-xona ishlayapti, keyin 1 → 2 → 3 → 4 ... */
const TARTIB = [1, 2, 3, 4];

/** Kim admin (ism aynan mos kelishi kerak) */
const ADMINLAR = ["Jamshidbek"];

/** Hozir navbatda turgan xona */
const HOZIRGI_XONA = 4;

const bor = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM rooms`;
if ((bor[0]?.n ?? 0) > 0) {
  console.log("⚠️  Baza allaqachon to'ldirilgan. Qaytadan to'ldirish uchun jadvallarni tozalang.");
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

// Birinchi navbat — bugundan boshlanadi
const [hozirgi] = await sql<{ id: number }[]>`SELECT id FROM rooms WHERE raqam = ${HOZIRGI_XONA}`;
if (!hozirgi) throw new Error("Boshlang'ich xona topilmadi");

const muddat = new Date();
muddat.setDate(muddat.getDate() + config.siklKuni);

await sql`
  INSERT INTO turns (room_id, muddat)
  VALUES (${hozirgi.id}, ${muddat})
`;

const sanoq = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
console.log(`✅ ${Object.keys(XONALAR).length} xona, ${sanoq[0]?.n ?? 0} odam qo'shildi`);
console.log(`✅ Birinchi navbat: ${HOZIRGI_XONA}-xona, muddat ${muddat.toLocaleDateString("uz-UZ")}`);
console.log(`\nEndi har bir odam botga /start yozib, ro'yxatdan o'z ismini tanlaydi.`);

await sql.end();
