# Susambil — uy navbat boti

Kvartira tozalash navbatini boshqaradigan Telegram bot. Asosiy g'oya —
**hech kim hech nima ochmasligi va buyruq yozmasligi kerak**: hamma narsa
guruhdagi panel tugmalarida.

## Tozalash navbati

```
Navbat boshlanadi (5 kun muddat)
        ↓
Muddatga 1 kun qolganda → guruhga + shaxsiy eslatma
        ↓
Xona a'zosi guruhga ≥3 rasm tashlaydi
        ↓
Bot rasmlarni albom qilib qo'yadi + "✅ Tasdiqlayman (0/3)" tugmasi
        ↓
Boshqa xonalardan 3 kishi bosadi
        ↓
Navbat yopiladi → ball beriladi → keyingi xona e'lon qilinadi
```

Tasdiqlanmaguncha navbat **keyingi xonaga o'tmaydi**. Muddat o'tsa, bot
kuniga bir marta guruhga eslatib turadi.

## Qo'shimcha ishlar

Panelda uch tugma: **musor**, **hammom**, **oshxona**. Bosilganda bot
rasm so'raydi. Rasm kelgach ish yoziladi, guruhga xabar chiqadi va ball
qo'shiladi. Rasmsiz ball berilmaydi.

## Ball tizimi

O'lchov: **taxminan 2 daqiqa ish = 1 ball**.

| Ish | Ball | Izoh |
|---|---|---|
| 🧹 Tozalash navbati | **60 ball xonaga** | a'zolar soniga bo'linadi |
| ⏱ Vaqtida tugatish | +10 | har a'zoga |
| 🔴 Kechikish | −10 | har kun, har a'zodan |
| 🚿 Hammom | 15 | rasm bilan |
| 🍽 Oshxona | 15 | rasm bilan |
| ♻️ Musor | 3 | rasm bilan |
| 🛒 Uyga narsa olib kelish | 20 | rasm + nomi |
| ✅ Boshqaning ishini tasdiqlash | 1 | |

Navbat balli xona a'zolari soniga bo'linadi, chunki **2 kishilik xona bir
xil ishni kam odam bilan bajaradi**:

| Xona | Navbat balli (har a'zoga) | Vaqtida bo'lsa |
|---|---|---|
| 2 kishilik | 30 | 40 |
| 3 kishilik | 20 | 30 |
| 4 kishilik | 15 | 25 |

Kechikish balni kamaytiradi, lekin manfiyga tushmaydi (kamida 0).

Ball hech qayerda saqlanmaydi — har safar hodisalardan hisoblanadi.
Demak formulani `src/config.ts` da o'zgartirsangiz, butun tarix qayta
hisoblanadi.

## Kvartira to'lovi — oylik yig'im

Kvartira puli har oyning **15-kuni** to'lanadi, demak shu kungacha hamma o'z
ulushini (standart **900 000 so'm**) tashlab bo'lishi kerak.

```
Oy boshlanadi → sikl ochiladi (talab MUZLATILADI)
        ↓
Kim qancha imkoni bo'lsa shuncha tashlaydi (bir necha marta bo'lsa ham)
        ↓
Har to'lov: da'vo + chek → Sorabek haqiqiy summani tekshiradi
        ↓
Faqat TASDIQLANGAN summa hisobga qo'shiladi
        ↓
Muddatga 5 kun qolganda → kuniga bir marta shaxsiy eslatma
        ↓
15-kun oxiri → yakuniy holat suratga olinadi
        ↓
Yangi oy → yangi sikl (eski oy tarixi o'z joyida qoladi)
```

**Bir yo'la to'lash shart emas.** 900 000 so'mni 100k + 200k + 300k + 300k
qilib tashlasa ham bo'ladi — hammasi qo'shib boriladi. To'lig'i tushgach
eslatma o'z-o'zidan to'xtaydi.

### Nima uchun sikl kerak edi

Ilgari holat butun tarix bo'yicha `SUM(...)` bilan hisoblanardi. Birinchi oy
to'g'ri ishlardi, ikkinchi oyda buzilardi: avgustda to'langan 900 000
sentabrda ham "to'liq to'langan" bo'lib turaverar va botdan hech kimdan
qayta pul so'ralmasdi. Endi har oy alohida sikl (`tolov_sikllari`), to'lov
esa **yuborilgan sanasi** bo'yicha o'z oyiga biriktiriladi.

### Tekshiruv kechiksa odam javobgar emas

Bu qoida butun tizim bo'ylab saqlanadi:

| Sana | Nima bo'ldi |
|---|---|
| 14-avgust | Odam to'lovni **yubordi** |
| 16-avgust | Sorabek **tasdiqladi** |

To'lov avgust hisobiga tushadi va muddatida yuborilgan deb qabul qilinadi.
Muddat kelganda hali tekshirilmagan to'lovi bor odamga **jarima
yozilmaydi** — surat "tekshiruv kutilmoqda" deb belgilanadi va tasdiq
kelgach o'z-o'zidan qayta hisoblanadi.

Tekshirilmagan to'lov hech qachon "to'langan" deb ko'rsatilmaydi — qoldiq
faqat tasdiqlangan summadan hisoblanadi.

### Jarima

**Standart holatda o'chiq (0%).** Uyning mavjud jarima qoidalari faqat
tozalash navbatiga tegishli, kvartira to'lovi uchun kelishuv yo'q edi —
shuning uchun bot o'zicha moliyaviy qoida o'ylab chiqarmaydi. Muddatda
kimdan qancha yetmagani adminga ochiq ko'rsatiladi, foizni esa uy a'zolari
kelishib, admin `/tolovjarima 5` bilan kiritadi. Jarima **yetmagan
summadan** hisoblanadi, butun talabdan emas.

### Sikl holatlari

| Holat | Ma'nosi |
|---|---|
| `ochiq` | To'lov qabul qilinmoqda |
| `muddat_yetdi` | 15-kun o'tdi, yakuniy holat suratga olindi (to'lov hamon qabul qilinadi) |
| `yakunlandi` | Oy yopildi — admin tugmasi bilan yoki yangi oy ochilganda avtomatik |

Hech qanday tarix o'chirilmaydi: eski sikl, uning to'lovlari va muddat
surati bazada qoladi.

### Admin

`/tolovlar` (yoki 👑 Admin Panel → 💰 To'lovlar) — shu oylik ko'rinish:
jami yig'im, kim to'liq/qisman/umuman to'lamagan, kimning to'lovi
tekshiruvda. Har bir odamning tugmasi bosilsa: talab, tasdiqlangan, qoldiq,
tekshiruvdagilar, muddat natijasi, jarima holati va butun to'lov tarixi.

## Qoidalar (`src/config.ts`)

| Sozlama | Qiymat |
|---|---|
| Bir xonaga muddat | 5 kun |
| Eslatma | muddatga 1 kun qolganda |
| Kerakli tasdiq | 3 kishi (faqat boshqa xonalardan) |
| Minimal rasm | 3 ta |
| Kechikish jarimasi | kuniga 10 000 so'm — faqat reytingda ko'rsatiladi |
| Kvartira to'lovi muddati | oyning 15-kuni (kun oxirigacha) |
| To'lov eslatmasi | muddatga 5 kun qolganda, kuniga 1 marta |
| To'lov jarimasi | 0% — o'chiq, `/tolovjarima` bilan yoqiladi |

To'lov summasi, qabul qiluvchi va jarima foizi kodda emas, `settings`
jadvalida — `/tolovtalab`, `/tolovsozla`, `/tolovjarima` bilan
o'zgartiriladi. `/tolovtalab` faqat **kelgusi** oylarga ta'sir qiladi:
har bir sikl o'z talabini ochilganda muzlatib oladi.

> Bot pul hisobini yuritmaydi. Jarima summasi reytingda ma'lumot uchun
> chiqadi, kassa yo'q.

## O'rnatish

### 1. Telegram bot

[@BotFather](https://t.me/BotFather):

```
/newbot           → token
/setprivacy       → Disable
```

⚠️ **`/setprivacy → Disable` majburiy** — aks holda bot guruhdagi
rasmlarni ko'rmaydi.

### 2. Baza va sozlash

```bash
cp .env.example .env      # BOT_TOKEN va DATABASE_URL to'ldiriladi
npm install
npm run db:setup
npm run db:seed
```

Ismlar va xonalar `src/db/seed.ts` da.

`db:setup` migratsiyalarni ham bajaradi va bir necha marta ishga tushirilsa
ham xavfsiz. Kvartira to'lovi sikllari shu yerda paydo bo'ladi: mavjud
to'lovlar **yuborilgan oyi** bo'yicha o'z sikliga biriktiriladi, hech qanday
yozuv o'chirilmaydi.

### 3. Guruhga ulash

1. Botni guruhga qo'shing va **admin** qiling (xabar pin qilishi kerak)
2. Guruhda `/id` → bot guruhni eslab qoladi
3. Guruhda `/panel` → panel chiqadi va pin bo'ladi

### 4. Odamlar

Har kim botga shaxsiy `/start` yozib ro'yxatdan ismini tanlaydi.
Ismi ro'yxatda bo'lmasa — **"➕ Men yangi a'zoman"** tugmasi: ismini
yozadi, xonasini tanlaydi, tamom.

Kim ulanganini ko'rish: `/royxat` (admin).

## Foydalanish

Oddiy a'zolar uchun **buyruq kerak emas** — panel tugmalari yetarli.
Botga har qanday xabar yozilsa ham panel chiqadi.

| Tugma | Nima qiladi |
|---|---|
| ♻️ 🚿 🍽 | rasm so'raydi, ball qo'shadi, guruhga xabar beradi |
| 📋 Navbat kimda? | hozirgi va keyingi xona, muddat |
| 🛒 Xarajat | kim nima olib kelgani + yangi qo'shish tugmasi |
| 🏆 Reyting | ball, xonalar intizomi, qo'shimcha ishlar, xarajatlar |
| 🕘 Tarix | oxirgi navbatlar: kim yuklagan, necha rasm, kim tasdiqlagan |

Admin buyruqlari: `/yordam` (faqat adminga ko'rinadi).

| Buyruq | Vazifasi |
|---|---|
| `/panel` | guruhga panel qo'yish |
| `/royxat` | kim ulangan |
| `/qosh Ism 2` | odam qo'shish |
| `/ochir Ism` | ro'yxatdan chiqarish |
| `/xona Ism 3` | xonasini o'zgartirish |
| `/navbatber 2` | navbatni qo'lda o'tkazish |
| `/navbatboshla` | navbat yo'q bo'lsa boshlash |
| `/tolovlar` | shu oylik to'lov ko'rinishi + tekshiruv kutayotganlar |
| `/tolovtalab 900000` | har kishidan talab (kelgusi oylardan boshlab) |
| `/tolovsozla Ism Karta` | qabul qiluvchi va karta |
| `/tolovjarima 0` | muddatda yetmagan summadan jarima foizi |

## Deploy — Vercel

Bot **webhook** rejimida: Telegram `/api/webhook` ga yuboradi, eslatmalar
`/api/cron` orqali kuniga bir marta (04:00 UTC = 09:00 Toshkent).

```bash
vercel link --yes
vercel env add BOT_TOKEN production
vercel env add DATABASE_URL production
vercel env add CRON_SECRET production     # openssl rand -hex 24
vercel deploy --prod
npm run webhook:set -- https://<loyiha>.vercel.app
```

Tekshirish: `npm run webhook:info`

### Serverless uchun nima o'zgacha

Funksiya doim ishlab turmaydi, shuning uchun xotiradagi holat bazaga
ko'chirilgan:

- `pending_photos` — 3 taga yetmagan rasmlar. Albom rasmlari alohida va
  bir vaqtda keladi, shuning uchun navbat qatori `FOR UPDATE` bilan
  qulflanadi — aks holda bitta albomdan ikkita topshiriq yaralardi.
- `flow_state` — ko'p qadamli suhbat (rasm kutish, xarajat, ro'yxatdan o'tish).

> grammY'da `bot.catch` faqat long polling uchun ishlaydi. Webhook
> rejimida xato tashqariga chiqsa funksiya 500 qaytaradi va Telegram
> yangilanishni qayta-qayta yuboradi. Shuning uchun `botYarat()` ichida
> barcha handler'lar xato chegarasi ichiga olingan.

### Lokal ishlab chiqish

```bash
npm run webhook:delete   # long polling va webhook birga ishlamaydi
npm run dev
npm run webhook:set -- https://<loyiha>.vercel.app
```

`Dockerfile` ham bor — Fly.io / Railway / VPS uchun. U holda long polling
ishlaydi va `node-cron` eslatmalarni har soatda tekshiradi.

## Tuzilishi

```
src/
├── config.ts              qoidalar va ball jadvali
├── db/
│   ├── schema.sql         jadvallar
│   ├── setup.ts / seed.ts
├── core/
│   ├── rotation.ts        navbat dvigateli, kechikish
│   ├── photobuffer.ts     rasm to'plash (FOR UPDATE qulf)
│   ├── rating.ts          ball hisobi va reyting
│   ├── expenses.ts        olib kelinganlar
│   ├── tolov.ts           kvartira to'lovi: oylik sikl, muddat, jarima
│   └── vaqt.ts            Toshkent kalendar hisobi (sof funksiyalar)
├── bot/
│   ├── handlers/
│   │   ├── commands.ts    panel, ko'rinishlar, ro'yxatdan o'tish
│   │   ├── photos.ts      rasm dispetcheri (ish / xarajat / navbat)
│   │   ├── messages.ts    matn dispetcheri, panel qaytishi
│   │   ├── chores.ts      qo'shimcha ish tugmalari
│   │   ├── expense.ts     xarajat oqimi
│   │   ├── confirm.ts     tasdiqlash
│   │   ├── tolov.ts       to'lov oqimi, tekshiruv, admin ko'rinishi
│   │   └── admin.ts       admin buyruqlari
│   ├── keyboards.ts / text.ts / group.ts / state.ts
├── jobs/
│   ├── reminders.ts       BARCHA eslatmalar: navbat + kvartira to'lovi
│   └── monthly.ts         oylik hisobot
└── index.ts               long polling (lokal / Docker)
api/
├── webhook.ts             Telegram yangilanishlari (Vercel)
└── cron.ts                kunlik vazifalar (Vercel Cron)
```
