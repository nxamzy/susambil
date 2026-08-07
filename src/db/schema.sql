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
