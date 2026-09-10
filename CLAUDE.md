# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

**Everything in this codebase is in Uzbek (Latin script)** — identifiers, function names,
comments, DB table/column names, commit messages, and user-facing strings. Match it. Do not
introduce English identifiers or comments; `tolov` (payment), `navbat` (duty rotation),
`xarajat` (expense), `topshiriq` (submission), `tasdiq` (confirmation), `jarima` (penalty),
`muddat` (deadline), `holat` (state), `sikl` (cycle), `ball` (points) are the core vocabulary.

Comments explain *why*, often naming the root cause of a past bug. Keep that density and style.

## Commands

```bash
npm run dev              # long polling, watch mode
npm test                 # node:test via tsx — pure functions only, no DB needed
npm run typecheck        # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run build            # tsc -p tsconfig.build.json + copy schema.sql to dist/

npm run db:setup         # apply src/db/schema.sql (idempotent, re-runnable)
npm run db:seed          # names/rooms from src/db/seed.ts

npm run webhook:set -- https://<project>.vercel.app
npm run webhook:info
npm run webhook:delete   # required before `npm run dev` — polling and webhook conflict
npm run commands:set     # push Telegram command menu
```

Run one test file: `node --import tsx --test src/core/tolov.test.ts`
Run one test by name: `node --import tsx --test --test-name-pattern "qisman" src/core/*.test.ts`

`.env` needs `BOT_TOKEN` and `DATABASE_URL` (Neon Postgres); `config.ts` throws at import
without them, so every test and script requires a valid `.env`.

## Two runtimes, one bot

`botYarat()` (`src/bot/index.ts`) builds the grammY bot for both:

- **Vercel (production)** — `api/webhook.ts` receives updates, `api/cron.ts` runs daily
  (Hobby plan allows only one cron/day).
- **Long polling** — `src/index.ts` with `node-cron`, used locally and for Docker/Fly.

Handler registration order in `botYarat()` matters: commands and callbacks first, the
catch-all `messages.register(bot)` last.

**grammY's `bot.catch` does not fire in webhook mode.** The real error boundary is the
`bot.use` middleware wrapper inside `botYarat()`. An uncaught error would return 500 and make
Telegram redeliver the update forever. Never let a handler throw past that wrapper.

## Navbat vazifalari bazadan keladi, koddan emas

`config.ts` ichida ilgari `NAVBAT_ISHLARI` (literal union) va
`NAVBAT_RASM_SONI` turardi. Ular olib tashlandi: ro'yxat endi
`navbat_vazifalari` jadvalida, `core/vazifalar.ts` orqali o'qiladi va admin
panelidan (`bot/handlers/vazifalar.ts`, "⚙️ Vazifalar") boshqariladi — xuddi
`tolov_talab`/`karta` `settings`ga ko'chirilgani kabi. Standart to'rttalik
`db/schema.sql` oxirida bir marta seed qilinadi.

Sabab konkret edi: uyda ikkita hammom bor, `NavbatIshi` esa literal union
bo'lgani uchun beshinchi vazifani kodni tahrirlamasdan qo'shib bo'lmasdi.

Ikkita qoida, ikkalasi ham "tarix yo'qolmaydi" falsafasidan:

- **`kod` yaratilgach o'zgarmaydi.** U — `turns.ishlar` JSONB kaliti va
  tugma callback'i (`navbat_ish:<turnId>:<kod>`). Nomi o'zgarsa ham o'sha
  navbatda tashlangan rasmlar joyida qoladi; deploydan oldin chatda osilib
  qolgan eski tugma ham ishlayveradi.
- **Vazifa o'chirilmaydi, `faol = false` bo'ladi.** O'chirilsa eski
  navbatlardagi kalitlar nimaga tegishli ekani bilinmay qolardi. Ro'yxatdan
  chiqarilgan vazifaning rasmlari `navbatRasmlari()` orqali baribir guruhga
  chiqadi — admin navbat o'rtasida "Hammom"ni ikkiga bo'lsa ham dalil
  yo'qolmaydi.

`bot/text.ts` va `bot/keyboards.ts` hamon sof: vazifalar ro'yxati ularga
PARAMETR sifatida beriladi, ular o'zi bazaga murojaat qilmaydi. Shu sababli
`core/rotation.ts`dagi `barchaIshlarBajarildimi`/`qolganIshlar`/
`bajarilganIshlarSoni` ham ikkinchi argument (`vazifalar`) oladi va bazasiz
testlanaveradi.

## Vazifa "bajarildi" = "✅ Tugatdim" bosilgan, rasm soni EMAS

Ilgari navbat vazifasi kerakli rasm yig'ilishi bilan AVTOMATIK bajarilgan
bo'lardi. Endi `turns.ishlar[kod].bajarilgan` (yopilgan martalar soni)
faqat odam ochiq **"✅ Tugatdim"** bosganda oshadi (`martaniYop`). Vazifa
`bajarilgan >= takror_soni` bo'lganda tugaydi.

Sabab: "bitta rasm bilan ketib qolmasin" — rasm avtomatik yopsa, odam
"yana rasm qo'shsam bo'ladimi?" deb ikkilanadi. Endi jonli xabar ochiq
so'raydi ("Yana rasm yuborasizmi, yoki tugatasizmi?") va faqat tugma
bosilganda yopiladi. `barchaIshlarBajarildimi` / `vazifaKeyboard`ning
"Yakuniy topshirish" sharti ham shu — rasm tashlab qo'yib tugmani
bosmasa, navbat topshirilmaydi (panelda `🟡 3/3 — tasdiqlang` deb turadi).

## Umumiy sozlamalar `settings` jadvalida (`core/sozlamalar.ts`)

`config.ts`dagi `kerakliTasdiq`, `eslatmaKuni`, `eslatmaOraligiSoat`,
`jarimaKunlik`, `tolovMuddatKuni`, `tolovEslatmaKuni` endi faqat STANDART.
Haqiqiysi `settings` jadvalidan, `sozlamalarOl()` (KESHLI — deyarli har
xabarda o'qiladi) orqali. Admin Panel → "⚙️ Sozlamalar".

`SOZLAMA_TAVSIF` — kalit → maydon/nom/izoh/standart/min/max, bir joyda;
admin pickeri (`SOZLAMA_VARIANT`) va validatsiya shundan. `sozlamaOrnat`
keshni bo'shatadi va `admin_log`ga yozadi.

Kesh ATAYLAB: `navbatSozlamalari` (sikl/majburiy kun) uchun kesh yo'q edi,
chunki u navbat YARATISHDA ishlatiladi; bular esa faqat ko'rsatish/eslatma
gating uchun — eskirgan kesh eng yomoni bitta xabarni bir tasdiq kam/ko'p
ko'rsatadi, sikl muddatini buzmaydi. `tolov_muddat_kuni` faqat KELGUSI
sikllarga ta'sir qiladi (`tolov_talab` bilan bir xil "davom etayotgan
davr qayta yozilmaydi" qoidasi).

`bot/text.ts` sof qoladi: `tanishtirish`/`navbatAdminPaneli` `Sozlamalar`ni
PARAMETR sifatida oladi, chaqiruvchi `await sozlamalarOl()` qilib uzatadi.

## Tasdiq kutmoqda — guruhga eslatma

Navbat topshirilib, hech kim "✅ Tasdiqlash" bosmasa navbat yopilmay
kunlab osilib qolardi. `jobs/reminders.ts` `tasdiqEslatmalari`: topshiriq
`TASDIQ_ESLATMA_SOAT` (12) soatdan ortiq `kutilmoqda` holatida tursa,
guruhga qisqa eslatma (yetarli tasdiq yig'ilguncha yoki rad etilguncha,
har 12 soatda). `submissions.tasdiq_eslatma` — oxirgi vaqt; `oxirgi_ping`
bilan bir xil "holatdan qayta hisoblash" intizomi, yopilgan topshiriq
shartga tushmaydi.

## Navbatdan tashqari "ball beruvchi tozalash" — olib tashlandi

`ISH_TURLARI` bottom-menu tugmalari ("Musor tashladim" va h.k.),
`handlers/chores.ts`, `state.ts`dagi `{tur:"ish"}` Flow, `photos.ts`dagi
ish-rasm oqimi va tanishtirishdagi bo'lim OLIB TASHLANDI — hech kim o'z
ixtiyori bilan qilmasdi, hammasi navbatda bo'lardi.

`chores` jadvali, `submissions.tur='ish'` CHECK, `core/rating.ts`dagi
`chores.ball` yig'indisi va `confirm.ts`dagi `tur==='ish'` shoxi QOLADI —
"tarix hech qachon o'chmaydi" qoidasi. Eski tasdiqlangan yozuvlar reyting
totaliga qo'shilaveradi, Reyting/Profil ekranida "eski" deb belgilanadi.
Xarajat ("uyga narsa olib keldim") — alohida, tegilmagan.

## `oraliq_kun` — navbat o'rtasida bajariladigan vazifa + o'z eslatmasi

`navbat_vazifalari.oraliq_kun` (standart 0 = o'chiq). `> 0` bo'lsa:

- Vazifa navbat BOSHLANGANIDAN `oraliq_kun` kun o'tgach ochiladi —
  global "oxirgi kun" qulfidan MUSTAQIL (`core/rotation.ts`
  `vazifaOchiqmi`). Musorni navbat oxirini kutmasdan tashlash kerak.
  Panel/callback shu bo'yicha har vazifani alohida tekshiradi; ochilmagan
  vazifa panelda 🔒, tugmasi yo'q.
- `jobs/reminders.ts` `oraliqVazifaEslatmalari` — o'sha kundan boshlab,
  vazifa BIRINCHI marta bajarilgunicha (`bajarilganMarta >= 1`), xona
  a'zolariga har `config.eslatmaOraligiSoat` (5) soatda DM. "Oxirgi kun"
  eslatmasidan (`navbatEslatmalari`) ATAYLAB alohida funksiya — u
  muddatga yaqin, bu navbat o'rtasida ishlaydi.

Xonaning istalgan a'zosi "✅ Tugatdim" bossa `bajarilgan` 1 ga yetadi va
keyingi tekshiruvda `continue` bo'ladi — eslatma o'zidan to'xtaydi,
alohida bayroq yo'q (`turns.oxirgi_ping` bilan bir xil "holatdan qayta
hisoblash" intizomi). Har vazifaning oxirgi eslatma vaqti
`turns.oraliq_eslatma` JSONB da `{ "<kod>": "<ISO ts>" }`.

Musor: `db/schema.sql` `musor_oraliq_seed` bayrog'i bilan BIR MARTA
`oraliq_kun = 3` qo'yadi.

## `takror_soni` — bir navbatda bir necha marta bajariladigan vazifa

`navbat_vazifalari.takror_soni` (standart 1) = vazifa navbat davomida necha
marta bajarilishi shart. Musor = 2 (idish 5 kunlik navbatda odatda bir
marta to'lib qoladi). `db/schema.sql` musorni `settings`dagi
`musor_takror_seed` bayrog'i bilan BIR MARTA 3 rasm × 2 marta qilib
qo'yadi — keyin admin `⚙️ Vazifalar` dan o'zgartiradi, `db:setup` ustidan
yozmaydi.

Har "marta" o'z rasmlari bilan alohida yopiladi. Yopilgan martaning
rasmlari `turns.ishlar[kod].tarix[]` ichiga ko'chiriladi, `photo_ids`
bo'shatiladi — keyingi marta toza boshlanadi. `ishRasmlari(belgi)` faqat
JORIY martani qaytaradi (jonli progress uchun), `barchaRasmlar(belgi)` esa
`tarix` + joriy (yakuniy albom uchun). `navbatRasmlari` `barchaRasmlar`ni
ishlatadi — musorning ikkala tashlash dalili ham guruhga chiqadi.

`ishBelgila`ning `jsonb_set` endi TO'LIQ ALMASHTIRMAYDI, MERGE qiladi
(`COALESCE(ishlar->kod,'{}') || jsonb_build_object(...)`): aks holda
oldingi marta yopilganda yozilgan `bajarilgan`/`tarix` keyingi martaning
birinchi rasmida o'chib ketardi.

## Rasm chegarasi: `rasm_soni` minimum, `RASM_MAX` texnik shift

`rasm_soni` (1..`RASM_SONI_MAX`=10) — bir martani yopish uchun eng kam
rasm. `RASM_MAX` (20) — bitta martada saqlanadigan eng ko'p rasm, sof
texnik chegara. "Qancha bo'lsa yuborsa bo'ladi, faqat kerakli sondan kam
emas" — shu ikkisi. Jonli xabar `min(100, soni/rasm_soni*100)` foizini
ko'rsatib boradi.

## Rasm yo'qolishi: uchta sabab, uchta qoida

"9 ta rasm tashlasam 5 tasi tushyapti" — Telegram albomni bir nechta
ALOHIDA yangilanish qilib, ko'pincha bir vaqtda yetkazgani uchun. Uchta
mustaqil sabab bor edi, uchalasi ham tuzatilgan; yangi kod yozganda
uchalasini ham buzmang:

1. **Kerakli sondan ortiq rasm rad etilmaydi.** `rasm_soni` — MINIMUM
   ("shuncha kelsa bajarilgan"), maksimum esa `config.RASM_MAX` (10).
   Ilgari `ishBelgila` dagi `jsonb_array_length(...) < kerak` sharti
   ortiqchasini ataylab tashlab yuborardi: musorga bitta rasm yetarli
   bo'lgani uchun albomdagi 3 tadan 2 tasi yo'qolardi.

2. **Vazifa to'lgach `flow_state` TOZALANMAYDI.** Ilgari `holatTozala()`
   chaqirilardi va albomning qolgan rasmlari hech qanday holatga tushmay,
   mutlaqo jimgina yo'qolardi. Endi holat turaveradi — keyingi rasm ham shu
   vazifaga tushadi, boshqa vazifa tugmasi bosilsa holat o'zidan almashadi,
   hech nima bosilmasa 15 daqiqada eskiradi. Holat faqat yakuniy
   topshirishda, "✖️ Bekor qilish"da yoki navbat yopilganda tozalanadi.

3. **Har rasmga yangi xabar YOZILMAYDI.** Bitta "jonli" xabar tahrirlanib
   boradi (`state.ts` `sorovniTahrirla`) — 9 ta rasm ilgari 18 ta xabar
   tug'dirardi va Telegram flood chegarasi ularni tashlay boshlardi. Panel
   esa faqat OXIRGI vazifa to'lganda bir marta qayta chiziladi:
   `ishBelgila` atomik bo'lgani uchun `yangiToldi` butun albom davomida
   rosa bir marta `true` bo'ladi.

Qo'shimcha ish oqimida (`handlers/photos.ts`) xuddi shu poyga bor edi —
rasmlar `flow_state` ichida o'qib-yozish bilan yig'ilardi. U ham atomik
qilindi (`state.ts` `ishRasminiQosh`), va `sorov`ni yozish uchun butun
holatni bosib yozmaydigan `sorovniYoz` ishlatiladi.

Guruhga yuborishda `.slice(0, 10)` o'rniga `group.ts` `albomYubor()` —
rasm 10 tadan ko'p bo'lsa bir nechta albomga bo'linadi (`GURUH_ALBOM_MAX`
gacha). Ilgari 10 tadan ortig'i bazada qolsa ham tasdiqlovchiga
ko'rinmasdi.

## Navbat vaqti ham sozlamada: sikl uzunligi va joriy muddat

`config.siklKuni` (5) va `config.majburiyOchilishKuni` (1) endi faqat
STANDART qiymat — haqiqiysi `settings` jadvalidan (`navbat_sikl_kuni`,
`navbat_majburiy_kuni`) `core/rotation.ts` `navbatSozlamalari()` orqali
o'qiladi va Admin Panel → 🧹 Navbat → ⚙️ Navbat sozlamalari'dan
o'zgartiriladi.

Sabab: navbat guruh tasdig'ini kutib 3 kun cho'zilib ketgach, admin uni
keyingi xonaga o'tkazsa yangi muddat baribir `now + 5 kun` bo'lardi — uy
jami ikki sikl (8+ kun) tozalanmay qolardi va buni kodni tahrirlamasdan
qisqartirib bo'lmasdi.

Ikkita ALOHIDA boshqaruv, ataylab aralashtirilmagan:

- **Sikl uzunligi** (`siklKuniniOrnat`) — faqat KELGUSI navbatlarga.
  `tolovTalabiniOrnat` bilan bir xil qoida: davom etayotgan davrning sharti
  qayta yozilmaydi.
- **Joriy navbat muddati** (`muddatniOzgartir`) — faqat SHU navbatga,
  "bugundan boshlab N kun". `0` = bugun kechgacha (Toshkent bo'yicha
  23:59); `now() + 0` bo'lsa muddat o'sha soniyada o'tib ketardi.

`navbatSozlamalari()` ATAYLAB keshlanmaydi. `core/tolov.ts`dagi
talab/kartadan farqli o'laroq bu qiymat navbat YARATILAYOTGAN paytda
o'qiladi — issiq Vercel instansiyasidagi eskirgan kesh butun bir siklning
muddatini buzardi, bitta indeksli so'rov esa arzon.

`majburiyOchildimi(muddat, ochilishKuni, hozir?)` sof qoldi — qiymat
parametr sifatida beriladi, xuddi `bot/text.ts`ga vazifalar ro'yxati
berilgani kabi. `MAJBURIY_DOIM_OCHIQ` (999) — "hech qachon qulflanmasin".

Muddat o'zgarishi JIMGINA bo'lmaydi: guruhga e'lon chiqadi va navbatdagi
xona a'zolariga DM ketadi — muddat jarima soatining boshlanishi, uni
bildirmasdan surish adolatsiz bo'lardi.

## Admin xabari — e'lon, ikkinchi tasdiqlash tizimi emas

`bot/handlers/xabar.ts`: admin o'zi yozgan matnni navbatdagi xonaga /
hammaga / bitta xonaga / bitta odamga / guruhga yuboradi. Avtomatik
eslatmalar qat'iy matnli, uydagi kutilmagan holatni ("musor navbatdan
oldin to'lib ketdi") ayta olmaydi — shuning uchun bor.

ATAYLAB hech qanday "bajarildi" holati, ball yoki tasdiq yo'q. Ish
qilinganini ko'rsatish yo'li o'zgarmagan: a'zo mavjud ish tugmasini bosadi
("♻️ Musor tashladim"), u `submissions`ga tushadi va guruh tasdiqlaydi.
Yangi topshiriq turi qo'shishdan oldin shu yo'lni kengaytirish mumkinmi
degan savolga javob bering — parallel oqim yaratmang.

Yetmagan odamlar hisobotda ISM bilan ko'rsatiladi: `shaxsiy()` bloklangan
hisobni ham `false` qaytaradi, "yuborildi" deb qo'yish adminni
chalg'itardi.

## Vercel: never `sql.end()` inside a request handler

`db/index.ts`'s `sql` is one connection pool at module scope, shared by *every* invocation on a
warm instance. `api/webhook.ts` already treated it that way; `api/cron.ts` did not — it called
`sql.end({ timeout: 5 })` in a `finally`, written back when the project still assumed one
connection per request. In production that closed the shared pool out from under other requests
still in flight on the same instance, producing a `CONNECTION_ENDED` cascade. Fixed by deleting
the call and leaning on `postgres.js`'s own `idle_timeout`.

If you add a new `api/*.ts` entry point, do not add cleanup that tears down a resource other
concurrent invocations might still be using.

## Layering

| Layer | Rule |
|---|---|
| `src/core/*` | SQL + business logic. **No grammY imports.** |
| `src/bot/text.ts` | Every user-facing string. Pure functions, no DB, no `ctx`. |
| `src/bot/keyboards.ts` | Every button and callback-data string. |
| `src/bot/handlers/*` | Telegram wiring only — call core, render via text.ts, reply. |
| `src/jobs/*` | Scheduled work; takes `Api`, calls core + `bot/group.ts`. |

Messages are HTML (`parse_mode: "HTML"`). Escape user-supplied text with `esc()`, format
money with `pul()`, and pass long output through `chekla()` (Telegram's 4096-char cap).

## No in-memory state

Serverless functions do not persist memory between invocations. Anything that must survive a
restart lives in Postgres:

- `flow_state` — multi-step conversations (`src/bot/state.ts`, `Flow` union type). Add a new
  step by extending `Flow` and dispatching in `handlers/messages.ts`.
- `pending_photos` — album buffering; Telegram delivers album photos as separate concurrent
  updates, so the row is locked `FOR UPDATE` to stop one album creating two submissions.
- reminder timestamps — see below.

## Reminders: one entry point, three triggers

`eslatmalarniTekshir(api)` in `src/jobs/reminders.ts` is the **only** reminder entry point.
It is called from three places: `api/cron.ts` (daily Vercel cron), `.github/workflows/eslatma.yml`
(hourly ping — the real guarantee), and `api/webhook.ts` inside `waitUntil()` (accelerator).

Because of that it may run many times a day, so it must be **idempotent**: it decides "is this
due now?" by comparing the current Tashkent date/time against a timestamp stored in the DB
(`turns.oxirgi_eslatma`, `turns.oxirgi_ping`, `tolov_holat.oxirgi_eslatma`,
`tolov_sikllari.guruh_eslatma`) — never from a one-shot boolean flag. Mark "sent" only after
delivery actually succeeded, otherwise a blocked account burns the whole day's slot.

**Do not add a second scheduler.** New periodic work goes inside `eslatmalarniTekshir`. Guard
expensive queries behind a cheap date check first — this function runs on every Telegram update.

## Ledger philosophy: no aggregate columns

There is no `users.ball` and no `tolovlar.jami_tolangan`. Totals are always recomputed from
historical rows (`core/rating.ts` sums `chores`/`expenses`/`turns`/`reports`/`ball_tuzatish`;
`core/tolov.ts` sums `tolovlar` within one cycle). Double-counting is therefore structurally
impossible.

The complement: **points are frozen onto the ledger row when it is confirmed**
(`chores.ball`, `expenses.ball`), so editing `BALLAR` in config never rewrites past results.
Same idea for `tolov_sikllari.talab` — each month copies the requirement at creation time.

Concurrency is handled the same way everywhere: `FOR UPDATE` inside `sql.begin`, plus a
`UNIQUE` index and `ON CONFLICT DO NOTHING` so a replayed write is a no-op.

## One submission pipeline

`navbat` (duty), `ish` (chore) and `xarajat` (purchase) are all rows in `submissions`,
confirmed through the same `confirmations` table and the same `core/topshiriq.ts` functions.
Confirmation requires `config.kerakliTasdiq` people and never the submitter; the extra
"not from the same room" rule applies to duty work only and lives in the navbat branch of
`handlers/confirm.ts`. Points come from config server-side — the client only ever sends the
*type* of work, never a score.

Closing a duty submission also advances the rotation, which is why `tasdiqla()` deliberately
stops short of it and `confirm.ts` finishes the job.

Do not add a parallel approval flow. Extend this one.

## Apartment payment (`core/tolov.ts`)

The most intricate module; read its header comment before changing it.

- **Monthly cycles** (`tolov_sikllari`, one row per calendar month). A payment is bound to a
  cycle by its **submission** date, never its verification date.
- **Claim vs verified**: `kiritgan_summa` is what the user typed and never counts;
  `tasdiqlangan_summa` is what the admin verified and is the only thing summed.
- **Deadline** is the 15th, evaluated at *end of day*; the snapshot runs on the 16th and is
  stored per (cycle, user) in `tolov_holat`, so later payments do not rewrite what was
  actually missing at the deadline.
- **Verification delay is never the user's fault**: someone who submitted before the deadline
  but is still awaiting review gets `tekshiruvKutilmoqda` and no penalty; confirming or
  rejecting recomputes their snapshot.
- **Penalty defaults to 0% (off)** — the house rules never defined one, so the bot exposes the
  shortfall to the admin instead of inventing a financial rule. Admin sets it with `/tolovjarima`.

## Time is always Asia/Tashkent

Use `src/core/vaqt.ts`. Calendar questions ("is today the 15th?", "how many days left?") are
answered with `YYYY-MM-DD` **strings**, not `Date` objects — string comparison sorts correctly
and cannot drift by a day across timezones. Read `DATE` columns with `to_char(col,'YYYY-MM-DD')`;
postgres.js otherwise returns them as UTC-midnight `Date`s, which is a day-shift trap.

`BIGINT` comes back from postgres.js as a **string** — always `Number(...)` it at the boundary.

Reusable SQL fragments must be **functions** returning `sql\`...\``, not shared constants;
postgres.js mutates a Query object when it inlines it as a fragment.

## Schema migrations

`src/db/schema.sql` is a single append-only, re-runnable file executed in one shot by
`db:setup` (`sql.unsafe(schema).simple()` — a multi-statement simple query runs in one implicit
transaction, so a syntax error rolls everything back). Add changes by appending idempotent
statements (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`) with a comment explaining the
migration. Never edit earlier statements — production has already run them.

## Testing

`npm test` covers **pure functions only** (no DB, no network). When adding logic, extract the
decision into a pure function in `core/` and test that: `hisoblaDaraja`, `muddatNatijasi`,
`tolovEslatmasiKerakmi`, `navbatBalli`, `keyingiJoy`, and the `text.ts` renderers are all
shaped this way deliberately.

There is no DB test harness. Verifying SQL requires pointing `DATABASE_URL` at a scratch
database — never run write-path checks against the production Neon database.

## Privacy rules that are easy to break

- Payment card numbers and receipt images go **only** to the payer and to admin DMs. The group
  sees name, amount and status — nothing else.
- Anonymous complaints (`reports`): the *reporter* is never revealed to the group or to
  ordinary members, only to admins. The accused person *is* named in the group by design.
- Never log `ctx` — it contains the bot token (`xatoniYoz` in `bot/index.ts` exists for this).
