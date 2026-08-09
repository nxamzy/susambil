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
-- Har qanday a'zo boshqa birovning (yoki noma'lum sababchining)
-- qoidabuzarligi haqida yozishi mumkin. Kim sabab bo'lgani noaniq bo'lishi
-- ham mumkin (masalan biror narsa sinib qolgan bo'lsa hech kim bilmasligi
-- mumkin) — shuning uchun reported_id ixtiyoriy. Ataylab
-- submissions/confirmations dan ALOHIDA: o'sha tizim ko'p kishilik
-- tenglar-tasdiqlashi uchun va yuklagan odam har doim ochiq ko'rsatiladi.
-- Bu yerda esa bitta admin ko'rib chiqadi va kim yozgani (reporter) HAM,
-- kim ayblangani (sababchi) HAM guruhga yoki oddiy a'zoga hech qachon
-- chiqmasligi shart — faqat admin ikkalasini ham ko'radi.
--
-- Hayot sikli: kutilmoqda -> tuzatilmoqda -> tuzatildi | jarima
--                        \-> rad
CREATE TABLE IF NOT EXISTS reports (
  id           SERIAL PRIMARY KEY,
  reporter_id  INT NOT NULL REFERENCES users(id),
  -- Sababchi noma'lum bo'lsa NULL. Admin keyinroq belgilashi ham mumkin.
  reported_id  INT REFERENCES users(id),
  -- Reporter sababchi haqida qanchalik ishonchli ekani: aniq | gumon | nomalum
  ishonch      TEXT NOT NULL DEFAULT 'nomalum'
               CHECK (ishonch IN ('aniq', 'gumon', 'nomalum')),
  -- Uyning qaysi joyiga tegishli: oshxona | hammom | umumiy | xona | boshqa
  joy          TEXT NOT NULL DEFAULT 'boshqa',
  izoh         TEXT NOT NULL,
  photo_id     TEXT,
  media_turi   TEXT NOT NULL DEFAULT 'rasm' CHECK (media_turi IN ('rasm', 'video')),
  ball         INT NOT NULL,
  -- kutilmoqda -> tuzatilmoqda -> tuzatildi | jarima
  --           \-> rad
  -- "jarima" ustidagi holatning o'zi ball qachon berilganini bildiradi —
  -- rating.ts'da qo'shimcha shart yozish shart emas.
  holat        TEXT NOT NULL DEFAULT 'kutilmoqda'
               CHECK (holat IN ('kutilmoqda', 'tuzatilmoqda', 'tuzatildi', 'jarima', 'rad')),
  admin_id     INT REFERENCES users(id),
  -- Admin qo'shgan erkin izoh — reporterning izohidan alohida.
  admin_note   TEXT,
  -- Sababchining o'zi guruhdagi tugmalar orqali bergan javobi va izohi —
  -- reporterning va adminning izohidan alohida.
  javobgar_javobi      TEXT CHECK (javobgar_javobi IN ('tan_oldi', 'rad_etdi')),
  javobgar_izohi       TEXT,
  javobgar_javob_vaqti TIMESTAMPTZ,
  -- Admin tasdiqlab, tuzatish uchun imkoniyat bergan payt.
  confirmed_at TIMESTAMPTZ,
  hal_qilindi  TIMESTAMPTZ,
  -- Bir nechta admin bo'lsa, har biriga jo'natilgan xabar shu yerda —
  -- biri hal qilganda yoki sababchini o'zgartirganda qolganlar ham ko'rsin.
  admin_msgs   JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Guruhdagi anonim xabar — qayta yubormasdan shuni tahrirlab boramiz.
  guruh_msg_id BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- reported_id NULL bo'lsa <> solishtirishi NULL qaytaradi, CHECK buni
  -- "o'tdi" deb hisoblaydi — demak noma'lum holat bemalol qoladi.
  CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS reports_kutilmoqda_idx ON reports (holat) WHERE holat = 'kutilmoqda';
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports (reported_id, holat);

-- MIGRATSIYA: birinchi versiyada "shikoyat" deb atalgan edi (turkum ustuni,
-- reported_id majburiy). Jadval hali bo'sh bo'lgani uchun to'g'ridan-to'g'ri
-- o'zgartiramiz — ikkinchi jadval yaratilmaydi.
ALTER TABLE reports ALTER COLUMN reported_id DROP NOT NULL;
ALTER TABLE reports DROP COLUMN IF EXISTS turkum;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ishonch TEXT NOT NULL DEFAULT 'nomalum';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_note TEXT;

DO $$ BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_ishonch_chk
    CHECK (ishonch IN ('aniq', 'gumon', 'nomalum'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MIGRATSIYA 2: "muammo" (ayblovsiz) versiyasidan "anonim shikoyat" +
-- tuzatish/tekshiruv oqimiga qaytish. Jadval hamon bo'sh.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS joy TEXT NOT NULL DEFAULT 'boshqa';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS media_turi TEXT NOT NULL DEFAULT 'rasm';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS guruh_msg_id BIGINT;

DO $$ BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_media_turi_chk
    CHECK (media_turi IN ('rasm', 'video'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- holat CHECK'ini yangi 5 bosqichli ro'yxatga almashtiramiz. Nomi Postgres
-- konvensiyasi bo'yicha <jadval>_<ustun>_check — bazadan tasdiqlangan.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_holat_check;
DO $$ BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_holat_check
    CHECK (holat IN ('kutilmoqda', 'tuzatilmoqda', 'tuzatildi', 'jarima', 'rad'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MIGRATSIYA 3: guruh xabari endi interaktiv — sababchi "Men qildim/
-- qilmadim/izoh" tugmalari bilan javob beradi. Javob va izoh reporter/admin
-- izohidan ALOHIDA saqlanadi (uchtasi ham turli kishidan keladi).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS javobgar_javobi TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS javobgar_izohi TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS javobgar_javob_vaqti TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_javobgar_javobi_chk
    CHECK (javobgar_javobi IS NULL OR javobgar_javobi IN ('tan_oldi', 'rad_etdi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
