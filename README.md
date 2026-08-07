# Uy navbat boti

Kvartira tozalash navbatini boshqaradigan Telegram bot. Asosiy g'oya —
**hech kim hech nima ochmasligi kerak**: hamma narsa guruh ichida, xabar
tagidagi tugmalar orqali bo'ladi.

## Qanday ishlaydi

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
Navbat yopiladi → kechikkan bo'lsa jarima → keyingi xona e'lon qilinadi
```

Tasdiqlanmaguncha navbat **keyingi xonaga o'tmaydi**. Muddat o'tsa,
bot kuniga bir marta guruhga eslatib turadi va jarima o'sib boradi.

## Qoidalar (`src/config.ts` da o'zgartiriladi)

| Sozlama | Qiymat |
|---|---|
| Bir xonaga beriladigan muddat | 5 kun |
| Eslatma | muddat tugashiga 1 kun qolganda |
| Kerakli tasdiq | 3 kishi (faqat boshqa xonalardan) |
| Minimal rasm | 3 ta |
| Kechikish jarimasi | kuniga 10 000 so'm — xonaga yoziladi, a'zolar o'rtasida bo'linadi |
| Oylik yig'im | har oyning 1-sanasida har kimga 10 000 so'm |

> Kechikish butun kun bilan hisoblanadi: muddatdan 1 soat o'tsa ham 1 kun deb yoziladi.

## O'rnatish

### 1. Telegram bot yaratish

[@BotFather](https://t.me/BotFather) ga yozing:

```
/newbot           → nom va username beriladi, token olasiz
/setprivacy       → botni tanlang → Disable
```

⚠️ **`/setprivacy → Disable` majburiy.** Aks holda bot guruhdagi
rasmlarni umuman ko'rmaydi va hech narsa ishlamaydi.

### 2. Baza

[neon.com](https://neon.com) da bepul Postgres oching, ulanish satrini
(`postgresql://...`) nusxalang.

### 3. Sozlash

```bash
cp .env.example .env
```

`.env` ni to'ldiring:

```
BOT_TOKEN=BotFather bergan token
DATABASE_URL=Neon bergan satr
GROUP_CHAT_ID=          # hozircha bo'sh qoldiring
```

### 4. Jadvallar va boshlang'ich ma'lumot

```bash
npm install
npm run db:setup    # jadvallarni yaratadi
npm run db:seed     # 4 xona, 12 odam, birinchi navbat
```

Ismlar va xonalar `src/db/seed.ts` da. Kerak bo'lsa avval o'sha faylni tahrirlang.

### 5. Ishga tushirish

```bash
npm run dev     # ishlab chiqish (o'zgarishni o'zi oladi)
npm start       # oddiy ishga tushirish
```

### 6. Guruhga ulash

1. Botni guruhga qo'shing va **admin** qiling (xabar pin qilishi kerak)
2. Guruhda `/id` yozing — bot chat ID ni aytadi va o'zi saqlab qo'yadi
3. Guruhda `/panel` yozing (admin) — doimiy tugmalar paneli chiqadi va pin bo'ladi

### 7. Odamlarni ulash

Har bir odam botga **shaxsiy** yozib `/start` bosadi va ro'yxatdan o'z
ismini tanlaydi. Shundan keyin guruhdagi tugmalar u uchun ishlaydi.

Kim ulanganini ko'rish: `/royxat` (admin).

## Buyruqlar

| Buyruq | Kim uchun |
|---|---|
| `/navbat` | kim navbatda, kim keyingi |
| `/kassa` | kim qancha qarzdor |
| `/reyting` | shu oylik reyting |
| `/tarix` | oxirgi 10 navbat, rasm soni, tasdiqlovchilar |
| `/xarajat` | xarajat qo'shish (shaxsiy yozing) |
| `/yordam` | buyruqlar ro'yxati |

Admin uchun qo'shimcha:

| Buyruq | Vazifasi |
|---|---|
| `/panel` | guruhga panel qo'yish |
| `/royxat` | kim ulangan, kim yo'q |
| `/qosh Ism 2` | odam qo'shish (2 = xona raqami) |
| `/ochir Ism` | ro'yxatdan chiqarish |
| `/xona Ism 3` | xonasini o'zgartirish |
| `/navbatber 2` | navbatni qo'lda 2-xonaga o'tkazish |
| `/navbatboshla` | navbat yo'q bo'lsa boshlash |
| `/tolov Ism 50000` | kassaga to'lov yozish |

## Kassa qanday hisoblanadi

Har bir odamning balansi `kassa_entries` jadvalidagi yozuvlar yig'indisi:

- **Jarima** — xona kechikkanda, summa a'zolar o'rtasida bo'linadi (minus)
- **Oylik yig'im** — har oyning 1-sanasida (minus)
- **Ulush** — kimdir xarajat qilganda, hammadan teng ulush (minus)
- **Xarajat** — pul sarflagan odamga to'liq summa (plus)
- **To'lov** — admin yozadi (plus)

`🔴 manfiy` = kassaga qarzdor · `🟢 musbat` = kassadan olishi kerak

## Deploy

Bot uzluksiz ishlashi kerak (eslatmalar cron orqali yuboriladi), shuning
uchun serverless emas, doimiy jarayon kerak:

- **Railway** yoki **Render** — repo ulanadi, `npm start`, .env o'zgaruvchilari qo'yiladi
- **Fly.io** — `fly launch`, `fly secrets set ...`
- Oddiy VPS — `pm2 start "npm start" --name uy-bot`

## Tuzilishi

```
src/
├── config.ts              qoidalar: 5 kun, 3 tasdiq, 10 000 jarima
├── db/
│   ├── schema.sql         jadvallar
│   ├── setup.ts           jadvallarni yaratish
│   └── seed.ts            xonalar, odamlar, birinchi navbat
├── core/
│   ├── rotation.ts        navbat dvigateli, kechikish, jarima
│   ├── kassa.ts           balans, xarajat, to'lov
│   └── rating.ts          reyting va tarix so'rovlari
├── bot/
│   ├── handlers/          buyruqlar, rasm, tasdiq, qo'shimcha ish, xarajat, admin
│   ├── keyboards.ts       tugmalar
│   ├── text.ts            xabar matnlari, sana formati
│   └── group.ts           guruh id, shaxsiy xabar
├── jobs/
│   ├── reminders.ts       har soatda: eslatma va kechikish ogohlantirishi
│   └── monthly.ts         har oy 1-sanasi: yig'im + hisobot
└── index.ts               ishga tushirish + cron
```
