/**
 * Admin uchun qo'lda foydalanuvchi boshqaruvi — baza mantig'i.
 *
 * MUHIM: identifikatsiya har doim `users.id` (va u orqali `telegram_id`)
 * bilan bo'ladi, hech qachon ism bilan emas — bu yerdagi funksiyalar ham
 * shu qoidani buzmaydi: `ismniOzgartir` faqat KO'RSATISH uchun matnni
 * o'zgartiradi, hech qanday joyda ism identifikator sifatida ishlatilmaydi.
 *
 * Har bir sezgir o'zgarish `core/adminlog.ts` orqali jurnalga yoziladi —
 * bu yerda ataylab har funksiyaning ichida, chaqiruvchida emas, shuning
 * uchun birorta chaqiruvchi buni "unutib qoldirishi" mumkin emas.
 */
import { sql, type Room, type User } from "../db/index.js";
import { logla } from "./adminlog.js";

export type FoydalanuvchiToliq = User & {
  xona_raqami: number | null;
  jami_ball: number;
};

/** Hammasi — faol va nofaol, xona bo'yicha guruhlangan. */
export async function foydalanuvchilarRoyxati(): Promise<(User & { xona_raqami: number | null })[]> {
  return sql<(User & { xona_raqami: number | null })[]>`
    SELECT u.*, r.raqam AS xona_raqami
    FROM users u LEFT JOIN rooms r ON r.id = u.room_id
    ORDER BY u.faol DESC, r.raqam NULLS LAST, u.ism
  `;
}

/**
 * Bitta odamning butun tarixidagi jami balli — `core/rating.ts`dagi
 * `reyting()` bilan bir xil manbalarni yig'adi (faqat u faol foydalanuvchi
 * uchun joriy oy kesimida ishlaydi; bu yerda esa nofaol bo'lsa ham,
 * BUTUN tarix bo'yicha — admin ko'rinishida shu kerak).
 */
export async function foydalanuvchiBalliOl(userId: number): Promise<number> {
  const [r] = await sql<{ jami: number }[]>`
    SELECT (
      COALESCE((SELECT sum(ball) FROM chores WHERE user_id = ${userId}), 0) +
      COALESCE((SELECT sum(ball) FROM expenses WHERE user_id = ${userId}), 0) +
      COALESCE((SELECT count(*) FROM confirmations WHERE user_id = ${userId}), 0) +
      COALESCE((SELECT sum(rp.ball) FROM reports rp
                WHERE rp.reported_id = ${userId} AND rp.holat = 'jarima') * -1, 0) +
      COALESCE((SELECT sum(ball) FROM ball_tuzatish WHERE user_id = ${userId}), 0)
    )::int AS jami
  `;
  return r?.jami ?? 0;
}

export async function foydalanuvchiToliqOl(id: number): Promise<FoydalanuvchiToliq | null> {
  const [u] = await sql<(User & { xona_raqami: number | null })[]>`
    SELECT u.*, r.raqam AS xona_raqami
    FROM users u LEFT JOIN rooms r ON r.id = u.room_id
    WHERE u.id = ${id}
  `;
  if (!u) return null;
  const ball = await foydalanuvchiBalliOl(id);
  return { ...u, jami_ball: ball };
}

/** Yangi foydalanuvchi — telegram_id har doim NULL boshlanadi ("ULANMAGAN"), /qosh bilan bir xil naqsh. */
export async function foydalanuvchiQoshish(
  ism: string,
  roomId: number | null,
  adminId: number,
): Promise<User> {
  const [u] = await sql<User[]>`
    INSERT INTO users (ism, room_id) VALUES (${ism.trim().slice(0, 40)}, ${roomId})
    RETURNING *
  `;
  if (!u) throw new Error("Foydalanuvchi yaratilmadi");
  await logla(adminId, "foydalanuvchi_qoshildi", "user", u.id, null, u.ism);
  return u;
}

export type TahrirXato = "band" | "topilmadi";

/** Ismni o'zgartirish — faqat KO'RSATISH matni, hech qanday identifikatorga ta'sir qilmaydi. */
export async function ismniOzgartir(
  id: number,
  yangiIsm: string,
  adminId: number,
): Promise<User | { xato: TahrirXato }> {
  const toza = yangiIsm.trim().slice(0, 40);
  if (toza.length < 2) return { xato: "band" };

  const band = await sql<{ id: number }[]>`
    SELECT id FROM users WHERE lower(ism) = lower(${toza}) AND faol AND id <> ${id}
  `;
  if (band.length > 0) return { xato: "band" };

  const [eski] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  if (!eski) return { xato: "topilmadi" };

  const [yangi] = await sql<User[]>`UPDATE users SET ism = ${toza} WHERE id = ${id} RETURNING *`;
  if (!yangi) return { xato: "topilmadi" };

  await logla(adminId, "ism_ozgartirildi", "user", id, eski.ism, toza);
  return yangi;
}

/**
 * Telegram ID'ni QO'LDA o'zgartirish — eng sezgir amal, chunki shu odamning
 * BUTUN tarixi (to'lov/navbat/ball/shikoyat) shu raqamga bog'lanadi. `null`
 * uzish uchun (xuddi /qaytabogla kabi), raqam esa boshqa faol foydalanuvchida
 * band bo'lmasa qo'yiladi — DB'dagi UNIQUE constraint'ga ishonib qolmasdan
 * oldindan tekshiramiz, aniq "band" javobi uchun.
 */
export async function telegramIdOzgartir(
  id: number,
  yangiTelegramId: number | null,
  adminId: number,
): Promise<User | { xato: TahrirXato }> {
  const [eski] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  if (!eski) return { xato: "topilmadi" };

  if (yangiTelegramId !== null) {
    const band = await sql<{ id: number }[]>`
      SELECT id FROM users WHERE telegram_id = ${yangiTelegramId} AND id <> ${id}
    `;
    if (band.length > 0) return { xato: "band" };
  }

  const [yangi] = await sql<User[]>`
    UPDATE users SET telegram_id = ${yangiTelegramId}, username = NULL WHERE id = ${id} RETURNING *
  `;
  if (!yangi) return { xato: "topilmadi" };

  await logla(
    adminId,
    "telegram_id_ozgartirildi",
    "user",
    id,
    eski.telegram_id,
    yangiTelegramId === null ? null : String(yangiTelegramId),
  );
  return yangi;
}

export async function xonaniOzgartir(id: number, roomId: number, adminId: number): Promise<User | null> {
  const [eski] = await sql<(User & { xona_raqami: number | null })[]>`
    SELECT u.*, r.raqam AS xona_raqami FROM users u LEFT JOIN rooms r ON r.id = u.room_id
    WHERE u.id = ${id}
  `;
  if (!eski) return null;

  const [yangi] = await sql<User[]>`UPDATE users SET room_id = ${roomId} WHERE id = ${id} RETURNING *`;
  if (!yangi) return null;

  const [room] = await sql<Room[]>`SELECT raqam FROM rooms WHERE id = ${roomId}`;
  await logla(
    adminId,
    "xona_ozgartirildi",
    "user",
    id,
    eski.xona_raqami ? String(eski.xona_raqami) : null,
    room ? String(room.raqam) : null,
  );
  return yangi;
}

export async function adminHuquqiniOzgartir(
  id: number,
  admin: boolean,
  adminId: number,
): Promise<User | null> {
  const [eski] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  if (!eski) return null;

  const [yangi] = await sql<User[]>`UPDATE users SET admin = ${admin} WHERE id = ${id} RETURNING *`;
  if (!yangi) return null;

  await logla(adminId, "admin_huquqi_ozgartirildi", "user", id, String(eski.admin), String(admin));
  return yangi;
}

/** Faollik: `faol=FALSE` — xuddi mavjud /ochir bilan bir xil, endi tugma + jurnal bilan. */
export async function faollikniOzgartir(
  id: number,
  faol: boolean,
  adminId: number,
): Promise<User | null> {
  const [eski] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  if (!eski) return null;

  const [yangi] = await sql<User[]>`UPDATE users SET faol = ${faol} WHERE id = ${id} RETURNING *`;
  if (!yangi) return null;

  await logla(
    adminId,
    faol ? "qayta_faollashtirildi" : "faolsizlantirildi",
    "user",
    id,
    String(eski.faol),
    String(faol),
  );
  return yangi;
}

/**
 * Shu odamga bog'liq har qanday tarixiy yozuv bormi — bo'lsa "Butunlay
 * o'chirish" taqiqlanadi (FK constraint baribir rad etardi, lekin bu
 * yerda oldindan aniq sabab bilan tekshiramiz).
 */
export async function foydalanuvchiTarixiBormi(userId: number): Promise<boolean> {
  const [r] = await sql<{ bor: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM submissions WHERE user_id = ${userId} OR rad_qildi = ${userId}
      UNION ALL
      SELECT 1 FROM confirmations WHERE user_id = ${userId}
      UNION ALL
      SELECT 1 FROM chores WHERE user_id = ${userId}
      UNION ALL
      SELECT 1 FROM expenses WHERE user_id = ${userId}
      UNION ALL
      SELECT 1 FROM reports WHERE reporter_id = ${userId} OR reported_id = ${userId} OR admin_id = ${userId}
      UNION ALL
      SELECT 1 FROM tolovlar WHERE user_id = ${userId} OR hal_qildi = ${userId}
      UNION ALL
      SELECT 1 FROM admin_log WHERE admin_id = ${userId}
      UNION ALL
      SELECT 1 FROM ball_tuzatish WHERE user_id = ${userId} OR admin_id = ${userId}
      UNION ALL
      SELECT 1 FROM tolov_tuzatish WHERE user_id = ${userId} OR admin_id = ${userId}
    ) AS bor
  `;
  return r?.bor ?? false;
}

export type OchirishNatija = { ok: true } | { ok: false; sabab: "topilmadi" | "tarixi_bor" };

/** Butunlay o'chirish — FAQAT hech qanday tarixiy yozuv bo'lmasa (placeholder/hech ishlatilmagan hisob). */
export async function foydalanuvchiniOchirish(id: number, adminId: number): Promise<OchirishNatija> {
  const [u] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  if (!u) return { ok: false, sabab: "topilmadi" };

  if (await foydalanuvchiTarixiBormi(id)) return { ok: false, sabab: "tarixi_bor" };

  await logla(adminId, "butunlay_ochirildi", "user", id, u.ism, null);
  await sql`DELETE FROM users WHERE id = ${id}`;
  return { ok: true };
}

/**
 * Bir xil ismli, ikkalasi ham FAOL foydalanuvchilar — nazariy jihatdan
 * yaratishda oldi olinadi (`odamTop`/ismniOzgartir shu tekshiruvni
 * qiladi), lekin admin panelida ko'rinib tursin — eski yozuvlar yoki
 * tashqi (masalan to'g'ridan-to'g'ri SQL) o'zgarishlar natijasida paydo
 * bo'lgan holatlarni ushlab qolish uchun.
 */
export async function takrorlanganFaolIsmlar(): Promise<{ ism: string; soni: number }[]> {
  const r = await sql<{ ism: string; soni: number }[]>`
    SELECT lower(ism) AS ism, count(*)::int AS soni
    FROM users WHERE faol GROUP BY lower(ism) HAVING count(*) > 1
  `;
  return r;
}

/** Ball qo'lda tuzatiladi — mavjud reyting hisobiga qo'shimcha manba sifatida (core/rating.ts). */
export async function ballTuzat(
  userId: number,
  ball: number,
  sabab: string,
  adminId: number,
): Promise<void> {
  await sql`
    INSERT INTO ball_tuzatish (user_id, ball, sabab, admin_id)
    VALUES (${userId}, ${ball}, ${sabab.trim().slice(0, 300) || null}, ${adminId})
  `;
  await logla(adminId, "ball_tuzatildi", "user", userId, null, `${ball > 0 ? "+" : ""}${ball}: ${sabab}`);
}
