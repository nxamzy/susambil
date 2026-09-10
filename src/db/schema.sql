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

-- ---------------------------------------------------------------------------
-- KVARTIRA TO'LOVI
-- ---------------------------------------------------------------------------
-- Har bir to'lov MUSTAQIL yozuv — bitta "paid_amount" ustunini qayta yozib
-- turmaymiz (shikoyat/submissions bilan bir xil falsafa). Odamning joriy
-- holati har doim SHU jadvaldan SUM(...) WHERE holat='tasdiqlandi' bilan
-- hisoblanadi, hech qanday alohida "jami" ustuni saqlanmaydi — shu bois
-- ikki marta tasdiqlash yoki hisoblashning chalkashishi mumkin emas.
--
-- Foydalanuvchi o'zi yozgan summa ("kiritgan_summa") faqat DA'VO — haqiqiy
-- hisobga faqat admin tekshirib tasdiqlagan "tasdiqlangan_summa" qo'shiladi,
-- va bu ikkalasi har doim ALOHIDA saqlanadi (biri ustiga yozilmaydi).
--
-- Hayot sikli: kutilmoqda -> tasdiqlandi | rad  (ortga qaytmaydi)
CREATE TABLE IF NOT EXISTS tolovlar (
  id                 SERIAL PRIMARY KEY,
  user_id            INT NOT NULL REFERENCES users(id),
  -- Foydalanuvchi o'zi yozgan summa — bu faqat DA'VO, hisobga qo'shilmaydi.
  kiritgan_summa     BIGINT NOT NULL CHECK (kiritgan_summa > 0),
  -- Admin haqiqatda qancha kelganini tekshirib kiritgan summa — FAQAT
  -- 'tasdiqlandi' holatida to'ladi, boshqa hech qayerda o'zgarmaydi.
  tasdiqlangan_summa BIGINT CHECK (tasdiqlangan_summa IS NULL OR tasdiqlangan_summa > 0),
  dalil_id           TEXT NOT NULL,
  dalil_turi         TEXT NOT NULL CHECK (dalil_turi IN ('rasm', 'hujjat')),
  holat              TEXT NOT NULL DEFAULT 'kutilmoqda'
                      CHECK (holat IN ('kutilmoqda', 'tasdiqlandi', 'rad')),
  -- Kim tasdiqladi/rad etdi (admin) — reports.admin_id bilan bir xil naqsh.
  hal_qildi          INT REFERENCES users(id),
  rad_sababi         TEXT,
  -- Bir nechta admin bo'lsa, har biriga yuborilgan DM xabar id'lari shu
  -- yerda — biri hal qilganda qolganlarning nusxasi ham yangilanadi
  -- (reports.admin_msgs bilan bir xil naqsh).
  admin_msgs         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Faqat tasdiqlangandan keyin guruhga yuborilgan e'lon xabari.
  guruh_msg_id       BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  hal_qilindi        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tolovlar_kutilmoqda_idx ON tolovlar (holat) WHERE holat = 'kutilmoqda';
CREATE INDEX IF NOT EXISTS tolovlar_user_idx ON tolovlar (user_id);
-- Faqat tasdiqlangan to'lovlar hisobga qo'shiladi — bu indeks aynan shu
-- yig'indini (core/tolov.ts) tezlashtiradi.
CREATE INDEX IF NOT EXISTS tolovlar_tasdiqlandi_idx ON tolovlar (user_id) WHERE holat = 'tasdiqlandi';

-- ---------------------------------------------------------------------------
-- OYLIK TO'LOV SIKLI VA 15-KUN MUDDATI
-- ---------------------------------------------------------------------------
-- ILDIZ MUAMMO: yuqoridagi `tolovlar` jadvali oyni umuman bilmasdi —
-- foydalanuvchining holati BUTUN TARIX bo'yicha SUM(...) bilan
-- hisoblanardi. Bu birinchi oy ishlaydi, ikkinchi oyda esa buziladi:
-- avgustda to'langan 900 000 sentabrda ham "to'liq to'langan" bo'lib
-- ko'rinaverardi va hech kimdan hech qachon qayta pul so'ralmasdi.
--
-- Yechim: har oy uchun BITTA sikl yozuvi. To'lovlar shu siklga
-- biriktiriladi, hisob esa har doim sikl ichida yuritiladi. Eski oylar
-- o'chirilmaydi va qayta yozilmaydi — ular shunchaki o'z siklida qoladi.
--
-- Sikl = KALENDAR OYI. Muddat = o'sha oyning 15-kuni (config.tolovMuddatKuni)
-- — kvartira puli aynan o'sha kuni to'lanadi, demak shu kungacha hamma o'z
-- ulushini tashlab bo'lishi kerak.
--
-- `talab` ATAYLAB shu yerda nusxalanadi (settings'dan har safar o'qilmaydi):
-- admin kelasi oy summani oshirsa, o'tgan oylarning tarixi o'zgarmasligi
-- kerak — aks holda yopilgan oy birdan "kam to'langan" bo'lib qolardi.
--
-- Hayot sikli: ochiq -> muddat_yetdi -> yakunlandi  (ortga qaytmaydi)
CREATE TABLE IF NOT EXISTS tolov_sikllari (
  id                SERIAL PRIMARY KEY,
  -- Oyning birinchi kuni (Toshkent) — siklning yagona kaliti.
  davr              DATE NOT NULL UNIQUE,
  -- Shu oy uchun MUZLATILGAN talab (har kishidan), so'm.
  talab             BIGINT NOT NULL CHECK (talab > 0),
  -- Shu oyning to'lov muddati (odatda 15-kun). Muddat KUN OXIRIGACHA
  -- hisoblanadi: 15-kuni to'langan pul ham vaqtida deb qabul qilinadi.
  muddat            DATE NOT NULL,
  holat             TEXT NOT NULL DEFAULT 'ochiq'
                     CHECK (holat IN ('ochiq', 'muddat_yetdi', 'yakunlandi')),
  -- Guruhga kuniga bir marta eslatma (turns.oxirgi_ping bilan bir xil naqsh).
  guruh_eslatma     DATE,
  -- Muddat kelib, har bir a'zoning holati suratga olingan payt.
  muddat_hisoblandi TIMESTAMPTZ,
  yakunlandi        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tolov_sikllari_ochiq_idx ON tolov_sikllari (muddat) WHERE holat = 'ochiq';

-- To'lov qaysi oyga tegishli. YUBORILGAN sanasi bo'yicha biriktiriladi,
-- tasdiqlangan sanasi bo'yicha EMAS: 14-avgustda yuborilgan, 16-avgustda
-- tasdiqlangan to'lov baribir AVGUST hisobiga tushishi kerak (admin
-- kechikkani uchun odam jazolanmaydi).
ALTER TABLE tolovlar ADD COLUMN IF NOT EXISTS sikl_id INT REFERENCES tolov_sikllari(id);
CREATE INDEX IF NOT EXISTS tolovlar_sikl_idx ON tolovlar (sikl_id, user_id);

-- Har bir (sikl, odam) juftligi uchun ikki xil holat:
--
--   1) ESLATMA holati — `oxirgi_eslatma`. Bazada turadi, ya'ni bot yoki
--      server qayta ishga tushsa ham "bugun eslatilgan" fakti yo'qolmaydi
--      va odam bir kunda ikki marta bezovta qilinmaydi.
--
--   2) MUDDAT SURATI — muddat kelgan paytdagi holat. Nima uchun saqlanadi:
--      jarima/hisob "muddatda qancha yetmagan edi" degan savolga javob
--      berishi kerak, keyinroq to'langan pul esa bu javobni o'zgartirmasligi
--      kerak. Ustunlar muddat kelgunga qadar NULL turadi.
--
-- `muddat_kutilmoqda` — muddatgacha yuborilgan, lekin hali admin
-- tekshirmagan to'lovlarning da'vo summasi. Nolga teng bo'lmasa, odam
-- "to'lamagan" deb hisoblanmaydi va jarima YOZILMAYDI: u o'z ishini
-- bajargan, faqat tekshiruv kechikkan (talab: "Do not punish the user for
-- Sorabek's verification delay").
CREATE TABLE IF NOT EXISTS tolov_holat (
  sikl_id             INT NOT NULL REFERENCES tolov_sikllari(id) ON DELETE CASCADE,
  user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oxirgi_eslatma      DATE,
  muddat_talab        BIGINT,
  muddat_tasdiqlangan BIGINT,
  muddat_kutilmoqda   BIGINT,
  muddat_qoldiq       BIGINT,
  muddat_daraja       TEXT CHECK (muddat_daraja IS NULL
                        OR muddat_daraja IN ('tolanmagan', 'qisman', 'tola')),
  -- Jarima summasi. Standart qoida YO'Q (foiz = 0) — uy qoidasi buni
  -- belgilamagan, shuning uchun bot o'zidan moliyaviy qoida O'YLAB
  -- CHIQARMAYDI. Admin `/tolovjarima` bilan foizni o'rnatsa hisoblanadi.
  muddat_jarima       BIGINT,
  muddat_vaqti        TIMESTAMPTZ,
  PRIMARY KEY (sikl_id, user_id)
);

-- MIGRATSIYA: mavjud to'lovlarni o'z oyining sikliga biriktiramiz. Hech
-- qanday yozuv o'chirilmaydi yoki ko'chirilmaydi — faqat qaysi oyga
-- tegishli ekani yoziladi. Sikl hali bo'lmasa yaratiladi, talab esa
-- settings'dagi joriy qiymatdan (bo'lmasa 900 000 — config.TOLOV_STD.talab
-- bilan bir xil standart) olinadi.
INSERT INTO tolov_sikllari (davr, talab, muddat)
SELECT DISTINCT
       date_trunc('month', t.created_at AT TIME ZONE 'Asia/Tashkent')::date,
       COALESCE((SELECT qiymat::bigint FROM settings WHERE kalit = 'tolov_talab'), 900000),
       (date_trunc('month', t.created_at AT TIME ZONE 'Asia/Tashkent')::date + 14)
  FROM tolovlar t
 WHERE t.sikl_id IS NULL
ON CONFLICT (davr) DO NOTHING;

UPDATE tolovlar t
   SET sikl_id = s.id
  FROM tolov_sikllari s
 WHERE t.sikl_id IS NULL
   AND s.davr = date_trunc('month', t.created_at AT TIME ZONE 'Asia/Tashkent')::date;

-- Bitta chek shu oyda bir marta. Foydalanuvchi xuddi shu rasmni ikki marta
-- yuborsa (tasodifan yoki ataylab) ikkinchi yozuv YARATILMAYDI — aks holda
-- bitta pul ikki marta hisobga tushib, qarzni ikki barobar kamaytirib
-- yuborishi mumkin edi.
--
-- `holat <> 'rad'` sharti ataylab: rad etilgan chek xato bo'lgan, uni
-- tuzatib qayta yuborishga yo'l ochiq qolishi kerak.
--
-- Foydalanuvchiga tushunarli xabar `core/tolov.ts` `avvalgiDalil()` orqali
-- beriladi; bu indeks esa poyga holatiga qarshi qattiq kafolat.
CREATE UNIQUE INDEX IF NOT EXISTS tolovlar_dalil_uniq
  ON tolovlar (sikl_id, user_id, dalil_id) WHERE holat <> 'rad';

-- ---------------------------------------------------------------------------
-- MIGRATSIYA: navbat — interaktiv shaxsiy panel + ishonchli eslatma
-- ---------------------------------------------------------------------------
-- Ilgari navbat "kamida N ta rasm tashla" degan yagona to'plam edi — qaysi
-- ish qilingani alohida kuzatilmasdi. Endi har bir vazifa (xona/hammom/
-- oshxona/musor) o'z rasmi va holati bilan ALOHIDA saqlanadi, shuning
-- uchun bot restart bo'lsa ham "kim nima qilib bo'lgani" yo'qolmaydi.
--
-- `eslatildi`/`oxirgi_ping` ustunlari BAZADA qoladi (hech narsa
-- o'chirilmaydi), lekin kod endi ulardan foydalanmaydi — o'rniga:
--   - `oxirgi_eslatma`: har 5 soatda bir marta yuboriladigan SHAXSIY
--     eslatmaning oxirgi vaqti (`jobs/reminders.ts`). Bu ustun NULL'dan
--     birinchi marta to'lganda bir martalik "oxirgi kun boshlandi" guruh
--     e'loni ham yuboriladi — alohida bayroq shart emas.
--   - `oxirgi_ping` eski ma'nosida QOLADI: muddat o'tib ketganda kuniga
--     bir marta yuboriladigan GURUH ogohlantirishi, 5 soatlik shaxsiy
--     eslatmadan ataylab alohida (guruh har 5 soatda bezovta qilinmasin).
ALTER TABLE turns ADD COLUMN IF NOT EXISTS ishlar JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE turns ADD COLUMN IF NOT EXISTS oxirgi_eslatma TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- ADMIN: qo'lda ma'lumot boshqaruvi + o'zgarishlar jurnali
-- ---------------------------------------------------------------------------
-- Admin botdan tashqarida (kod o'zgartirmasdan) foydalanuvchi ma'lumotini
-- to'g'irlashi kerak bo'lganda (masalan noto'g'ri Telegram hisobiga
-- ulanib qolgan bo'lsa) shu ikki jadval orqali ishlaydi:
--
--   admin_log     — har bir sezgir o'zgarish: kim, nima, eski/yangi qiymat,
--                    qachon (core/adminlog.ts). Hech qanday amal buni
--                    chetlab o'tmaydi — core/users.ts'dagi har bir yozuvchi
--                    funksiya shu yerga ham yozadi.
--   ball_tuzatish — reyting hisob-kitobi har doim TARIXIY yozuvlardan
--                   (chores/expenses/turns/reports) yig'iladi, users'da
--                   alohida "ball" ustuni yo'q. Admin qo'lda tuzatish
--                   kiritsa, bu ham xuddi o'sha yig'indiga bitta qo'shimcha
--                   manba sifatida qo'shiladi (core/rating.ts) — mavjud
--                   hisoblash mexanizmi buzilmaydi, faqat kengaytiriladi.
CREATE TABLE IF NOT EXISTS admin_log (
  id           SERIAL PRIMARY KEY,
  admin_id     INT NOT NULL REFERENCES users(id),
  harakat      TEXT NOT NULL,
  obyekt_turi  TEXT NOT NULL,
  obyekt_id    INT,
  eski_qiymat  TEXT,
  yangi_qiymat TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_log_vaqt_idx ON admin_log (created_at DESC);

CREATE TABLE IF NOT EXISTS ball_tuzatish (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  ball       INT NOT NULL,
  sabab      TEXT,
  admin_id   INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ball_tuzatish_user_idx ON ball_tuzatish (user_id);

-- ---------------------------------------------------------------------------
-- TO'LOV QO'LDA TUZATISH
-- ---------------------------------------------------------------------------
-- ball_tuzatish bilan bir xil falsafa (yuqorida): to'lov holati doim
-- `tolovlar`dan SUM(...) bilan hisoblanadi (core/tolov.ts), bu jadval esa
-- shunga qo'shiladigan QO'SHIMCHA manba — mavjud hisoblash buzilmaydi.
--
-- Nega kerak: `tolovlar`ga yozuv FAQAT foydalanuvchi dalil (chek) yuborsa
-- tug'iladi. Lekin pul ba'zan naqd/qo'lma-qo'l beriladi (dalil yo'q) yoki
-- xato tasdiqlangan/hisoblangan summani orqaga qaytarish kerak bo'ladi —
-- soxta dalil o'ylab topish o'rniga admin buni to'g'ridan-to'g'ri shu yerga
-- yozadi (talab: admin har qanday odamni "to'ladi/to'lamadi" deb bemalol
-- o'zgartira olishi kerak, dalilga qaramasdan).
--
-- `summa` MUSBAT (to'lov qildi deb belgilash, hisobga qo'shiladi) yoki
-- MANFIY (aslida to'lamagan/xato hisoblangan edi deb ayirish) bo'ladi, hech
-- qachon 0 emas. `sikl_id` MAJBURIY: qaysi OYGA tegishli ekani aniq
-- bo'lmasa oylik sikl mantig'i (yuqoridagi "OYLIK TO'LOV SIKLI" bo'limi)
-- buziladi.
CREATE TABLE IF NOT EXISTS tolov_tuzatish (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  sikl_id    INT NOT NULL REFERENCES tolov_sikllari(id),
  summa      BIGINT NOT NULL CHECK (summa <> 0),
  sabab      TEXT,
  admin_id   INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tolov_tuzatish_sikl_idx ON tolov_tuzatish (sikl_id, user_id);

-- ---------------------------------------------------------------------------
-- NAVBAT VAZIFALARI: kod ichidagi ro'yxatdan bazaga
-- ---------------------------------------------------------------------------
-- ILDIZ MUAMMO: "Mening Navbatim" panelidagi majburiy vazifalar ro'yxati
-- (`config.ts` NAVBAT_ISHLARI) va har biriga kerakli rasm soni
-- (NAVBAT_RASM_SONI) KODDA qattiq yozilgan edi. Uyda ikkinchi hammom paydo
-- bo'lsa yoki rasm soni o'zgarsa — har safar kod tahriri va deploy kerak
-- bo'lardi. Bu `tolov_talab`/`karta` bilan bir xil holat edi, ular esa
-- allaqachon `settings` jadvaliga ko'chirilgan; shu naqsh davom ettirildi.
--
-- `kod` — `turns.ishlar` JSONB kaliti va tugma callback'i. YARATILGACH HECH
-- QACHON o'zgarmaydi: nomi o'zgartirilsa ham eski navbatlardagi rasmlar shu
-- kalit ostida turaveradi. Shuning uchun vazifa O'CHIRILMAYDI ham — faqat
-- `faol = false` qilinadi (chores/expenses'dagi "tarix yo'qolmaydi" qoidasi).
--
-- `rasm_soni` endi MINIMUM: shuncha rasm kelgach vazifa bajarilgan
-- hisoblanadi, lekin undan ortig'i ham RAD ETILMAYDI, qo'shilaveradi
-- (`config.RASM_MAX` gacha). Ilgari ortiqcha rasm ataylab tashlab
-- yuborilardi — albom bilan tashlangan rasmlarning yo'qolishiga aynan shu
-- sabab bo'lgan.
CREATE TABLE IF NOT EXISTS navbat_vazifalari (
  id         SERIAL PRIMARY KEY,
  kod        TEXT UNIQUE NOT NULL,
  nom        TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '🧹',
  rasm_soni  INT NOT NULL DEFAULT 1 CHECK (rasm_soni BETWEEN 1 AND 10),
  tartib     INT NOT NULL DEFAULT 0,
  faol       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS navbat_vazifalari_faol_idx
  ON navbat_vazifalari (tartib) WHERE faol;

-- Kodda turgan ro'yxatning AYNAN o'zi — kalitlar (`xona`/`hammom`/
-- `oshxona`/`musor`) bir xil qoldirilgani uchun hozir ketayotgan navbatning
-- `turns.ishlar` ichidagi rasmlari joyida qoladi, hech narsa ko'chirilmaydi.
INSERT INTO navbat_vazifalari (kod, nom, emoji, rasm_soni, tartib) VALUES
  ('xona',    'Xona',    '🛏',  1, 0),
  ('hammom',  'Hammom',  '🚿', 3, 1),
  ('oshxona', 'Oshxona', '🍽',  1, 2),
  ('musor',   'Musor',   '♻️', 1, 3)
ON CONFLICT (kod) DO NOTHING;

-- ---------------------------------------------------------------------------
-- BIR NAVBATDA BIR NECHA MARTA BAJARILADIGAN VAZIFA
-- ---------------------------------------------------------------------------
-- Musor idishi 5 kunlik navbat davomida bir marta emas, odatda ikki marta
-- to'ladi — ya'ni "musor tashlash" bitta topshiriq emas, takrorlanadigan
-- ish. Ilgari har bir vazifa navbatda ATIGI BIR MARTA bajarilardi, shuning
-- uchun "musorni ikki marta tashla" degan qoidani umuman ifodalab bo'lmasdi.
--
--   rasm_soni   — BIR MARTALIK topshiriq uchun kerakli eng kam rasm
--   takror_soni — shu vazifa navbat davomida necha marta bajarilishi shart
--
-- Har "marta" o'z rasmlari bilan ALOHIDA yopiladi ("✅ Tugatdim"), yopilgan
-- martaning rasmlari `turns.ishlar[kod].tarix` ichiga ko'chiriladi va
-- yakuniy albomga baribir chiqadi — hech qanday dalil yo'qolmaydi.
ALTER TABLE navbat_vazifalari
  ADD COLUMN IF NOT EXISTS takror_soni INT NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE navbat_vazifalari ADD CONSTRAINT navbat_vazifalari_takror_chk
    CHECK (takror_soni BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Musorning boshlang'ich qiymati: navbat davomida 2 marta, har safar 3 ta
-- rasm. BIR MARTA qo'yiladi va boshqa hech qachon qaytarilmaydi — admin
-- keyin bu qiymatlarni o'zgartirsa, `db:setup` uni ortga surib yubormasligi
-- kerak. Shu sababli oddiy UPDATE emas, `settings`dagi bayroq bilan
-- qulflangan blok.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE kalit = 'musor_takror_seed') THEN
    UPDATE navbat_vazifalari SET takror_soni = 2, rasm_soni = 3 WHERE kod = 'musor';
    INSERT INTO settings (kalit, qiymat) VALUES ('musor_takror_seed', '1')
      ON CONFLICT (kalit) DO NOTHING;
  END IF;
END $$;
