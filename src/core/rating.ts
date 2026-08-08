import { sql } from "../db/index.js";
import { config, ISH_TURLARI, BALLAR, type IshTuri } from "../config.js";

export type OdamBall = {
  userId: number;
  ism: string;
  xona: number | null;
  /** Har bir ish turidan nechtadan qilgani */
  ishlar: Partial<Record<IshTuri, number>>;
  ishSoni: number;
  xarajat: number;
  /** Uyga sarflagan puli (so'm) — ball bilan aralashtirilmaydi */
  xarajatSumma: number;
  tasdiq: number;
  navbatSoni: number;
  kechikkanKun: number;
  navbatBall: number;
  ishBall: number;
  xarajatBall: number;
  tasdiqBall: number;
  jami: number;
};

export type XonaHolat = {
  xona: number;
  azoSoni: number;
  navbat: number;
  kechikkan: number;
  kechikkanKun: number;
  jarima: number;
};

type Qator = {
  user_id: number;
  ism: string;
  xona: number | null;
  room_id: number | null;
  azo_soni: number;
  ish_ball: number;
  ish_soni: number;
  xarajat: number;
  xarajat_ball: number;
  xarajat_summa: string;
  tasdiq: number;
};

/**
 * Bitta navbat uchun bir a'zoga tegadigan ball.
 * Xona balli a'zolar soniga bo'linadi, so'ng vaqtida/kechikkani hisobga olinadi.
 */
export function navbatBalli(azoSoni: number, kechikkanKun: number): number {
  const asos = Math.round(BALLAR.navbatXona / Math.max(1, azoSoni));
  const tuzatish =
    kechikkanKun === 0
      ? BALLAR.vaqtidaBonus
      : -BALLAR.kechikishJarima * kechikkanKun;
  return Math.max(0, asos + tuzatish);
}

/** @param dan — shu sanadan keyingi ma'lumot (null bo'lsa butun tarix) */
export async function reyting(dan: Date | null = null): Promise<OdamBall[]> {
  // Ball daftar qatorining o'zidan olinadi (chores.ball / expenses.ball).
  // Qator esa faqat TASDIQLANGANDAN keyin paydo bo'ladi — shuning uchun
  // kutib turgan va rad etilgan ishlar reytingga tushmaydi.
  const qatorlar = await sql<Qator[]>`
    SELECT u.id AS user_id,
           u.ism,
           r.raqam AS xona,
           u.room_id,
           (SELECT count(*)::int FROM users x WHERE x.room_id = u.room_id AND x.faol) AS azo_soni,
           COALESCE((SELECT sum(c.ball) FROM chores c WHERE c.user_id = u.id
              AND (${dan}::timestamptz IS NULL OR c.created_at >= ${dan})), 0)::int AS ish_ball,
           (SELECT count(*)::int FROM chores c WHERE c.user_id = u.id
              AND (${dan}::timestamptz IS NULL OR c.created_at >= ${dan})) AS ish_soni,
           (SELECT count(*)::int FROM expenses e WHERE e.user_id = u.id
              AND (${dan}::timestamptz IS NULL OR e.created_at >= ${dan})) AS xarajat,
           COALESCE((SELECT sum(e.ball) FROM expenses e WHERE e.user_id = u.id
              AND (${dan}::timestamptz IS NULL OR e.created_at >= ${dan})), 0)::int AS xarajat_ball,
           COALESCE((SELECT sum(e.summa) FROM expenses e WHERE e.user_id = u.id
              AND (${dan}::timestamptz IS NULL OR e.created_at >= ${dan})), 0)::bigint AS xarajat_summa,
           (SELECT count(*)::int FROM confirmations cf WHERE cf.user_id = u.id
              AND (${dan}::timestamptz IS NULL OR cf.created_at >= ${dan})) AS tasdiq
    FROM users u
    LEFT JOIN rooms r ON r.id = u.room_id
    WHERE u.faol
    ORDER BY r.raqam NULLS LAST, u.ism
  `;

  // Ish turlari bo'yicha sanoq — alohida, chunki turlar ro'yxati o'sib boradi
  const turlar = await sql<{ user_id: number; tur: IshTuri; n: number }[]>`
    SELECT user_id, tur, count(*)::int AS n FROM chores
    WHERE (${dan}::timestamptz IS NULL OR created_at >= ${dan})
    GROUP BY user_id, tur
  `;

  const navbatlar = await sql<{ room_id: number; kechikkan_kun: number }[]>`
    SELECT room_id, kechikkan_kun FROM turns
    WHERE holat = 'tasdiqlandi'
      AND (${dan}::timestamptz IS NULL OR boshlandi >= ${dan})
  `;

  return qatorlar.map((q) => {
    const oz = navbatlar.filter((n) => n.room_id === q.room_id);
    const navbatBall = oz.reduce(
      (s, n) => s + navbatBalli(q.azo_soni, n.kechikkan_kun),
      0,
    );
    const tasdiqBall = q.tasdiq * BALLAR.tasdiq;

    const ishlar: Partial<Record<IshTuri, number>> = {};
    for (const t of turlar) {
      if (t.user_id === q.user_id && t.tur in ISH_TURLARI) ishlar[t.tur] = t.n;
    }

    return {
      userId: q.user_id,
      ism: q.ism,
      xona: q.xona,
      ishlar,
      ishSoni: q.ish_soni,
      xarajat: q.xarajat,
      xarajatSumma: Number(q.xarajat_summa),
      tasdiq: q.tasdiq,
      navbatSoni: oz.length,
      kechikkanKun: oz.reduce((s, n) => s + n.kechikkan_kun, 0),
      navbatBall,
      ishBall: q.ish_ball,
      xarajatBall: q.xarajat_ball,
      tasdiqBall,
      jami: navbatBall + q.ish_ball + q.xarajat_ball + tasdiqBall,
    };
  });
}

export async function xonaHolati(dan: Date | null = null): Promise<XonaHolat[]> {
  const r = await sql<
    { xona: number; azo_soni: number; navbat: number; kechikkan: number; kechikkan_kun: number }[]
  >`
    SELECT r.raqam AS xona,
           (SELECT count(*)::int FROM users u WHERE u.room_id = r.id AND u.faol) AS azo_soni,
           count(t.id) FILTER (WHERE t.holat = 'tasdiqlandi')::int AS navbat,
           count(t.id) FILTER (WHERE t.kechikkan_kun > 0)::int     AS kechikkan,
           COALESCE(SUM(t.kechikkan_kun), 0)::int                  AS kechikkan_kun
    FROM rooms r
    LEFT JOIN turns t ON t.room_id = r.id AND t.holat = 'tasdiqlandi'
      AND (${dan}::timestamptz IS NULL OR t.boshlandi >= ${dan})
    GROUP BY r.raqam, r.id
    ORDER BY r.raqam
  `;
  return r.map((x) => ({
    xona: x.xona,
    azoSoni: x.azo_soni,
    navbat: x.navbat,
    kechikkan: x.kechikkan,
    kechikkanKun: x.kechikkan_kun,
    jarima: x.kechikkan_kun * config.jarimaKunlik,
  }));
}

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

/** Qo'shimcha ish tarixi (rasm bilan). */
export async function ishTarixi(limit = 15): Promise<
  { ism: string; tur: IshTuri; created_at: Date }[]
> {
  return sql`
    SELECT u.ism, c.tur, c.created_at
    FROM chores c JOIN users u ON u.id = c.user_id
    ORDER BY c.id DESC LIMIT ${limit}
  `;
}
