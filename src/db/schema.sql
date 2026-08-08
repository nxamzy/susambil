-- Kvartira navbat boti — baza sxemasi

CREATE TABLE IF NOT EXISTS rooms (
  id       SERIAL PRIMARY KEY,
  raqam    INT UNIQUE NOT NULL,          -- xona raqami: 1..4
  tartib   INT UNIQUE NOT NULL           -- navbat tartibi
);

CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  ism          TEXT NOT NULL,
  telegram_id  BIGINT UNIQUE,            -- /start bosgandan keyin to'ladi
  username     TEXT,
  room_id      INT REFERENCES rooms(id),
  admin        BOOLEAN NOT NULL DEFAULT FALSE,
  faol         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Navbatlar. Bir vaqtda faqat bitta 'faol' navbat bo'ladi.
CREATE TABLE IF NOT EXISTS turns (
  id            SERIAL PRIMARY KEY,
  room_id       INT NOT NULL REFERENCES rooms(id),
  boshlandi     TIMESTAMPTZ NOT NULL DEFAULT now(),
  muddat        TIMESTAMPTZ NOT NULL,
  tasdiqlandi   TIMESTAMPTZ,
  holat         TEXT NOT NULL DEFAULT 'faol'
                CHECK (holat IN ('faol', 'tasdiqlandi', 'admin_yopdi')),
  kechikkan_kun INT NOT NULL DEFAULT 0,
  eslatildi     BOOLEAN NOT NULL DEFAULT FALSE,   -- 1 kun qolgandagi eslatma
  oxirgi_ping   DATE                              -- muddat o'tgach kunda 1 marta
);

CREATE INDEX IF NOT EXISTS turns_faol_idx ON turns (holat) WHERE holat = 'faol';

-- Topshirilgan ish: rasmlar to'plami
CREATE TABLE IF NOT EXISTS submissions (
  id             SERIAL PRIMARY KEY,
  turn_id        INT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  user_id        INT NOT NULL REFERENCES users(id),
  photo_ids      TEXT[] NOT NULL,
  media_group_id TEXT,
  guruh_msg_id   BIGINT,                 -- guruhdagi tugmali xabar id si
  bekor          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_turn_idx ON submissions (turn_id);

-- Tasdiqlar
CREATE TABLE IF NOT EXISTS confirmations (
  id            SERIAL PRIMARY KEY,
  submission_id INT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, user_id)
);

-- Qo'shimcha ishlar: musor / hammom / oshxona. Rasm bilan tasdiqlanadi.
CREATE TABLE IF NOT EXISTS chores (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  tur         TEXT NOT NULL,
  photo_id    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chores_vaqt_idx ON chores (created_at);

-- Uyga olib kelingan narsalar. Pul hisobi yuritilmaydi — faqat rasm va nomi.
CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  izoh        TEXT NOT NULL,
  photo_id    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_vaqt_idx ON expenses (created_at);

-- Turli sozlamalar (guruh id, oxirgi oylik hisobot sanasi ...)
CREATE TABLE IF NOT EXISTS settings (
  kalit  TEXT PRIMARY KEY,
  qiymat TEXT
);

-- Serverless muhitda xotira saqlanmaydi, shuning uchun quyidagi ikki jadval
-- ilgari xotirada turgan vaqtinchalik holatni saqlaydi.

-- Hali to'plamga yetmagan rasmlar (kamida 3 ta kerak)
CREATE TABLE IF NOT EXISTS pending_photos (
  id             SERIAL PRIMARY KEY,
  turn_id        INT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id        BIGINT NOT NULL,
  media_group_id TEXT,
  file_id        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (turn_id, user_id, file_id)
);

CREATE INDEX IF NOT EXISTS pending_photos_idx ON pending_photos (turn_id, user_id);

-- Ko'p qadamli suhbat holati (xarajat qo'shish, ro'yxatdan o'tish)
CREATE TABLE IF NOT EXISTS flow_state (
  telegram_id BIGINT PRIMARY KEY,
  holat       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- MIGRATSIYA: hamma ish bitta tasdiqlash yo'lidan o'tadi
-- ---------------------------------------------------------------------------
-- Ilgari faqat navbat ishi tasdiqlanardi; qo'shimcha ish va xarajat esa rasm
-- kelishi bilanoq ball berardi. Endi uchalasi ham `submissions` ga tushadi va
-- bir xil `confirmations` orqali tasdiqlanadi — ikkinchi tasdiqlash tizimi
-- yaratilmadi, borisi kengaytirildi.
--
-- Bu fayl bir necha marta ishga tushishi mumkin, shuning uchun har bir qadam
-- qayta bajarilsa ham xato bermaydi.

-- Navbatga bog'liq bo'lmagan topshiriqlar ham bo'ladi
ALTER TABLE submissions ALTER COLUMN turn_id DROP NOT NULL;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tur      TEXT NOT NULL DEFAULT 'navbat';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ish_turi TEXT;    -- musor|hammom|oshxona|xona|boshqa
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS izoh     TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS summa    BIGINT;  -- so'm, faqat xarajatda
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ball     INT NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS holat    TEXT NOT NULL DEFAULT 'kutilmoqda';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS yopildi  TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rad_sababi TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rad_qildi  INT REFERENCES users(id);

-- ADD CONSTRAINT da IF NOT EXISTS yo'q, shuning uchun blok ichida
DO $$ BEGIN
  ALTER TABLE submissions ADD CONSTRAINT submissions_tur_chk
    CHECK (tur IN ('navbat', 'ish', 'xarajat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE submissions ADD CONSTRAINT submissions_holat_chk
    CHECK (holat IN ('kutilmoqda', 'tasdiqlandi', 'rad'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Navbat topshirig'ida turn_id shart, boshqasida esa bo'lmasligi kerak
DO $$ BEGIN
  ALTER TABLE submissions ADD CONSTRAINT submissions_turn_chk
    CHECK ((tur = 'navbat') = (turn_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Summa faqat xarajatda va manfiy bo'lmasin (server tomonda ham tekshiriladi)
DO $$ BEGIN
  ALTER TABLE submissions ADD CONSTRAINT submissions_summa_chk
    CHECK (summa IS NULL OR (tur = 'xarajat' AND summa >= 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS submissions_kutilmoqda_idx
  ON submissions (holat) WHERE holat = 'kutilmoqda';

-- Bitta navbatda bir vaqtda bitta ochiq topshiriq bo'lsin: ikki kishi barobar
-- "Bajardim" bosса ham ikkinchisi qo'shilmaydi.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_faol_navbat_uniq
  ON submissions (turn_id) WHERE tur = 'navbat' AND holat = 'kutilmoqda' AND NOT bekor;

-- Daftar jadvallari endi faqat TASDIQLANGANDAN keyin to'ladi. Ball qatorning
-- o'zida saqlanadi: sozlama keyin o'zgarsa ham eski hisob buzilmaydi va ball
-- mijoz tomonidan emas, server tomonidan yoziladi.
ALTER TABLE chores   ADD COLUMN IF NOT EXISTS ball          INT NOT NULL DEFAULT 0;
ALTER TABLE chores   ADD COLUMN IF NOT EXISTS izoh          TEXT;
ALTER TABLE chores   ADD COLUMN IF NOT EXISTS submission_id INT REFERENCES submissions(id) ON DELETE SET NULL;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ball          INT NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS summa         BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submission_id INT REFERENCES submissions(id) ON DELETE SET NULL;

-- Idempotentlikning asosi: bitta topshiriqdan bitta daftar qatori. Tasdiq
-- ikki marta hisoblansa ham ON CONFLICT DO NOTHING ikkinchisini tashlab
-- yuboradi, ya'ni ball ikki marta berilmaydi. NULL lar takrorlanishi mumkin,
-- shuning uchun eski qatorlar to'sib qo'ymaydi.
CREATE UNIQUE INDEX IF NOT EXISTS chores_submission_uniq   ON chores (submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_submission_uniq ON expenses (submission_id);

-- ---------------------------------------------------------------------------
-- ANONIM SHIKOYAT
-- ---------------------------------------------------------------------------
-- Har qanday a'zo boshqa birovning qoidabuzarligi haqida yozishi mumkin.
-- Ataylab submissions/confirmations dan ALOHIDA: o'sha tizim ko'p kishilik
-- tenglar-tasdiqlashi uchun (kerakliTasdiq kishi bosishi kerak) va yuklagan
-- odam har doim ochiq ko'rsatiladi. Shikoyatda esa bitta admin qaror qiladi
-- va kim yozgani HECH QACHON guruhga yoki oddiy a'zoga chiqmasligi shart —
-- buni umumiy kodga aralashtirish anonimlikni tasodifan buzish xavfini
-- oshirardi, shuning uchun mustaqil jadval va oqim.
CREATE TABLE IF NOT EXISTS reports (
  id          SERIAL PRIMARY KEY,
  reporter_id INT NOT NULL REFERENCES users(id),
  reported_id INT NOT NULL REFERENCES users(id),
  turkum      TEXT NOT NULL,
  izoh        TEXT NOT NULL,
  photo_id    TEXT,
  ball        INT NOT NULL,
  holat       TEXT NOT NULL DEFAULT 'kutilmoqda'
              CHECK (holat IN ('kutilmoqda', 'tasdiqlandi', 'rad')),
  admin_id    INT REFERENCES users(id),
  hal_qilindi TIMESTAMPTZ,
  -- Bir nechta admin bo'lsa, har biriga jo'natilgan xabar shu yerda —
  -- biri hal qilganda qolganlarining nusxasi ham yangilanadi.
  admin_msgs  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS reports_kutilmoqda_idx ON reports (holat) WHERE holat = 'kutilmoqda';
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports (reported_id, holat);
