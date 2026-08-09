/**
 * Admin harakatlar jurnali — sezgir o'zgarishlarni kim/nima/eski-yangi
 * qiymat/qachon deb yozib boradi (talab: "All sensitive admin changes
 * should be logged"). Faqat yozish/o'qish, hech qanday harakatni
 * to'xtatmaydi yoki bloklamaydi — sof audit trail.
 */
import { sql, type AdminLog } from "../db/index.js";

export async function logla(
  adminId: number,
  harakat: string,
  obyektTuri: string,
  obyektId: number | null,
  eskiQiymat: string | null,
  yangiQiymat: string | null,
): Promise<void> {
  await sql`
    INSERT INTO admin_log (admin_id, harakat, obyekt_turi, obyekt_id, eski_qiymat, yangi_qiymat)
    VALUES (${adminId}, ${harakat}, ${obyektTuri}, ${obyektId}, ${eskiQiymat}, ${yangiQiymat})
  `;
}

export type AdminLogToliq = AdminLog & { admin_ism: string };

/** Oxirgi o'zgarishlar — admin panelidagi "O'zgarishlar tarixi" uchun. */
export async function oxirgiLoglar(limit = 20): Promise<AdminLogToliq[]> {
  return sql<AdminLogToliq[]>`
    SELECT l.*, u.ism AS admin_ism
    FROM admin_log l JOIN users u ON u.id = l.admin_id
    ORDER BY l.id DESC LIMIT ${limit}
  `;
}

/** Bitta foydalanuvchiga tegishli o'zgarishlar — User Details ko'rinishida. */
export async function foydalanuvchiLoglari(userId: number, limit = 10): Promise<AdminLogToliq[]> {
  return sql<AdminLogToliq[]>`
    SELECT l.*, u.ism AS admin_ism
    FROM admin_log l JOIN users u ON u.id = l.admin_id
    WHERE l.obyekt_turi = 'user' AND l.obyekt_id = ${userId}
    ORDER BY l.id DESC LIMIT ${limit}
  `;
}
