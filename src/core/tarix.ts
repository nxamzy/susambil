/**
 * Navbat tarixi — "oxirgi navbatlar kim tomonidan, qachon topshirilgan".
 *
 * Ilgari `core/rating.ts` ichida turardi. Reyting va ball tizimi olib
 * tashlanganda tarix u bilan birga ketmasligi kerak edi: ball "kim
 * yaxshiroq" degan baholash, tarix esa oddiy yozuv — "navbat bo'ldimi,
 * kim topshirdi, kim tasdiqladi". Uydagilar aynan shunga qaraydi.
 *
 * Sof o'qish: hech qanday hisob-kitob yo'q, shuning uchun bu yerda ham
 * jami/yig'indi ustun yo'q ("agregat ustun saqlanmaydi" qoidasi).
 */
import { sql } from "../db/index.js";

export type TarixYozuvi = {
  turn_id: number;
  xona: number;
  boshlandi: Date;
  muddat: Date;
  tasdiqlandi: Date | null;
  kechikkan_kun: number;
  holat: string;
  topshirdi: string | null;
  rasm_soni: number;
  tasdiqlovchilar: string[];
};

export async function tarix(limit = 10, offset = 0): Promise<TarixYozuvi[]> {
  return sql<TarixYozuvi[]>`
    SELECT t.id AS turn_id,
           r.raqam AS xona,
           t.boshlandi,
           t.muddat,
           t.tasdiqlandi,
           t.kechikkan_kun,
           t.holat,
           su.ism AS topshirdi,
           COALESCE(array_length(s.photo_ids, 1), 0) AS rasm_soni,
           COALESCE(
             (SELECT array_agg(cu.ism ORDER BY cf.created_at)
                FROM confirmations cf JOIN users cu ON cu.id = cf.user_id
               WHERE cf.submission_id = s.id),
             ARRAY[]::text[]
           ) AS tasdiqlovchilar
    FROM turns t
    JOIN rooms r ON r.id = t.room_id
    LEFT JOIN LATERAL (
      SELECT * FROM submissions WHERE turn_id = t.id AND NOT bekor
      ORDER BY id DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN users su ON su.id = s.user_id
    WHERE t.holat <> 'faol'
    ORDER BY t.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
