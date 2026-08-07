import { sql } from "../db/index.js";
import { config } from "../config.js";

export type BuferNatija =
  | { holat: "kutilyapti"; soni: number; kerak: number }
  | { holat: "qoshildi"; submissionId: number }
  | { holat: "topshirildi"; submissionId: number; photoIds: string[] }
  | { holat: "eskirgan" };

/**
 * Rasmni qabul qiladi va yetarli bo'lsa topshiriq yaratadi.
 *
 * Serverless muhitda bir albomning rasmlari alohida (va bir vaqtda) keladi,
 * shuning uchun butun amal navbat qatorini `FOR UPDATE` bilan qulflab
 * bajariladi — ikkita chaqiruv baravar topshiriq yaratib qo'ymaydi.
 */
export async function rasmQabulQil(
  turnId: number,
  userId: number,
  chatId: number,
  fileId: string,
  mediaGroupId: string | null,
): Promise<BuferNatija> {
  return sql.begin(async (tx) => {
    const [turn] = await tx<{ id: number; holat: string }[]>`
      SELECT id, holat FROM turns WHERE id = ${turnId} FOR UPDATE
    `;
    if (!turn || turn.holat !== "faol") return { holat: "eskirgan" as const };

    // Shu navbat uchun topshiriq allaqachon bormi?
    const [mavjud] = await tx<{ id: number; media_group_id: string | null }[]>`
      SELECT id, media_group_id FROM submissions
      WHERE turn_id = ${turnId} AND NOT bekor
      ORDER BY id DESC LIMIT 1
    `;

    if (mavjud) {
      // O'sha albomning qolgan rasmlari — mavjud topshiriqqa qo'shamiz
      const oshaAlbom =
        mediaGroupId !== null && mavjud.media_group_id === mediaGroupId;
      if (oshaAlbom) {
        await tx`
          UPDATE submissions
          SET photo_ids = array_append(photo_ids, ${fileId})
          WHERE id = ${mavjud.id} AND NOT (${fileId} = ANY(photo_ids))
        `;
        return { holat: "qoshildi" as const, submissionId: mavjud.id };
      }
      // Boshqa rasmlar — topshiriq allaqachon berilgan, e'tiborsiz qoldiramiz
      return { holat: "qoshildi" as const, submissionId: mavjud.id };
    }

    await tx`
      INSERT INTO pending_photos (turn_id, user_id, chat_id, media_group_id, file_id)
      VALUES (${turnId}, ${userId}, ${chatId}, ${mediaGroupId}, ${fileId})
      ON CONFLICT (turn_id, user_id, file_id) DO NOTHING
    `;

    const kutayotgan = await tx<{ file_id: string }[]>`
      SELECT file_id FROM pending_photos
      WHERE turn_id = ${turnId} AND user_id = ${userId}
      ORDER BY id
    `;

    if (kutayotgan.length < config.minRasm) {
      return {
        holat: "kutilyapti" as const,
        soni: kutayotgan.length,
        kerak: config.minRasm,
      };
    }

    const photoIds = kutayotgan.map((r) => r.file_id);
    const [sub] = await tx<{ id: number }[]>`
      INSERT INTO submissions (turn_id, user_id, photo_ids, media_group_id)
      VALUES (${turnId}, ${userId}, ${photoIds}, ${mediaGroupId})
      RETURNING id
    `;
    if (!sub) return { holat: "eskirgan" as const };

    await tx`
      DELETE FROM pending_photos WHERE turn_id = ${turnId} AND user_id = ${userId}
    `;

    return { holat: "topshirildi" as const, submissionId: sub.id, photoIds };
  });
}

/** Navbat yopilganda qolgan chala rasmlarni tozalaydi. */
export async function buferniTozala(turnId: number): Promise<void> {
  await sql`DELETE FROM pending_photos WHERE turn_id = ${turnId}`;
}
