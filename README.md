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
Navbat yopiladi → keyingi xona e'lon qilinadi
```

Tasdiqlanmaguncha navbat **keyingi xonaga o'tmaydi**. Muddat o'tsa, bot
kuniga bir marta guruhga eslatib turadi.

### Vazifalar ro'yxati

Navbatda nima bajarilishi shartligi va har biriga nechta rasm kerakligi
bazada turadi — admin **👑 Admin Panel → ⚙️ Vazifalar** (yoki `/vazifalar`)
orqali o'zgartiradi, kod tahrir qilinmaydi. Standart ro'yxat: xona,
hammom (3 rasm), oshxona, musor.

Ikkita hammom bo'lsa: "Hammom"ni "1-hammom" deb qayta nomlab, "➕ Yangi
vazifa" bilan "🚿 2-hammom" qo'shiladi. Nomini o'zgartirish eski
navbatlardagi rasmlarni buzmaydi, vazifa esa butunlay o'chirilmaydi —
faqat ro'yxatdan chiqariladi.

**Rasm soni** — minimum: shuncha rasm kelmaguncha martani yopib bo'lmaydi,
ortig'i esa rad etilmaydi (20 tagacha). Bot foizini ("2/3 · 67%")
ko'rsatib boradi.

**Necha marta** — vazifa navbat davomida necha marta bajarilishi shart.
Musor standart holatda **2 marta** (idish 5 kunlik navbatda bir marta
to'lib qoladi). Har marta o'z rasmlari bilan alohida "✅ Tugatdim" bilan
yopiladi; ikkala martaning ham dalili yakuniy albomga chiqadi.

Vazifa rasm soni yetgani bilan avtomatik "bajarildi" bo'lmaydi — odam
**"✅ Tugatdim"** bosishi shart. Shu bosilmaguncha panelda `🟡 3/3 —
tasdiqlang` deb turadi va "Yakuniy topshirish" chiqmaydi.

**Oraliq eslatma** — vazifa navbat oxirini kutmasdan, o'rtasida
bajarilishi kerak bo'lsa. Musor standart holatda **navbatning 2-kunidan**
ochiladi va bajarilmasa xona a'zolariga **har 5 soatda** DM boradi —
birinchi marta bajarilgunicha. Xonadan **kim bo'lsa ham** "✅ Tugatdim"
bossa eslatma o'zi to'xtaydi. ⚙️ Vazifalar → 🕐 Oraliq eslatma dan
boshqariladi (0 = o'chiq).

### 🗑 Musor to'ldi

Musor kutilmaganda to'lsa, uydagi **har kim** pastki menyudagi (yoki guruh
panelidagi) **"🗑 Musor to'ldi"** tugmasini bosadi:

```
Kimdir "🗑 Musor to'ldi" bosadi
        ↓
Navbatdagi xonaga DM (kim aytgani bilan) + guruhga bitta qator
        ↓
Musor vazifasi darrov ochiladi (2-kunni kutmaydi)
        ↓
Tashlanmaguncha har 5 soatda DM takrorlanadi
        ↓
Navbatchi rasm + "✅ Tugatdim" → guruhga "✅ Musor tashlandi", aytgan odamga DM
```

Ikkinchi odam bossa yangi xabar ketmaydi — "allaqachon xabar berilgan"
deb ko'rsatiladi. Musor vazifasi navbatda allaqachon to'liq bajarilgan
bo'lsa (ikkala marta ham), navbatchi DM'dagi "🗑 Tashladim" bilan rasmsiz
yopadi. Admin ham **🧹 Navbat** panelidan shu tugmani bosishi mumkin.

### Navbat tartibi

Navbat **aylanma** yuradi: `4 → 3 → 2 → 1 → 4 → ...` — har xona bir
aylanishda aynan bir marta. (Ilgari "borib-qaytish" edi:
1 → 2 → 3 → 4 → 3 → 2 → 1 → 2, ya'ni 1-xonadan keyin yana 2-xona kelardi
va o'rtadagi xonalar navbatni ikki barobar ko'p olardi.)

Tartib **👑 Admin Panel → 🧹 Navbat → ⚙️ Navbat sozlamalari → 🔢 Navbat
tartibi** dan ko'rinadi va o'zgartiriladi — xona raqamlarini yozish kifoya
(`4 3 2 1`). O'zgarish guruhga e'lon qilinadi. Admin navbatni qo'lda boshqa
xonaga o'tkazsa, keyingisi o'sha xonadan hisoblanadi.

### Navbat vaqti

**👑 Admin Panel → 🧹 Navbat → ⚙️ Navbat sozlamalari**:

- **🔢 Navbat tartibi** — xonalar qaysi ketma-ketlikda navbat oladi.
- **🔁 Sikl uzunligi** — har xonaga necha kun beriladi (standart 5). Faqat
  kelgusi navbatlarga ta'sir qiladi.
- **🔓 Majburiy vazifa ochilishi** — vazifa tugmalari muddatga necha kun
  qolganda ochiladi (standart 1), yoki "har doim ochiq".

Joriy navbatni alohida qisqartirish/uzaytirish: **🧹 Navbat → 📅 Muddatni
o'zgartirish**. Oldingi navbat tasdiq kutib cho'zilib ketgan bo'lsa shu
kerak bo'ladi — keyingi xonaga to'liq 5 kun berish uyni yana shuncha
kunga tozalanmay qoldirardi. O'zgarish guruhga e'lon qilinadi va
navbatdagi xonaga xabar boradi.

## Umumiy sozlamalar

**👑 Admin Panel → ⚙️ Sozlamalar** — kod o'zgartirmasdan:

- **Kerakli tasdiqlar** — topshiriqni qabul qilish uchun necha kishi ✅ bosishi kerak (standart 3)
- **Eslatma chastotasi / oxirgi kun oynasi** — navbat eslatmasi qachon boshlanadi va necha soatda qaytariladi
- **To'lov muddati / eslatmasi** — oyning qaysi kuni, qachondan va necha soatda bir eslatiladi

## Tasdiq kutmoqda eslatmasi

Navbat topshirilib, 12 soatdan ortiq hech kim tasdiqlamasa — guruhga qisqa
eslatma boradi:

```
⏳ Tasdiq kerak
🧹 3-xona navbatni topshirdi
✅ 2/3 — yuqoridagi xabardan tasdiqlang
```

**Bir marta**, takrorlanmaydi. Va faqat navbat hali faol bo'lsa — admin uni
qo'lda keyingi xonaga o'tkazgan bo'lsa eslatma umuman ketmaydi.

## Adminning erkin xabari

**👑 Admin Panel → 📣 Xabar yuborish** (yoki `/xabar`) — admin o'zi yozgan
xabarni navbatdagi xonaga, bitta xonaga, bitta odamga, hammaga yoki guruh
chatiga yuboradi. Masalan: *"Musor navbatdan oldin to'lib ketdi — bugun
tashlab kelinglar."* Yuborilgach kimga yetgani va kimga yetmagani
ko'rsatiladi.

## Faollik — kim botni ishlatyapti

Botda nimadir qilinsa **1** sanaladi. Navbat topshirish ham 1, bumaga
tugaganini belgilash ham 1 — hech qanday vazn yo'q.

| Sanaladi | Sanalmaydi |
|---|---|
| navbat topshirish | menyu ochish |
| boshqaning ishini tasdiqlash | ro'yxat ko'rish |
| vazifada "✅ Tugatdim" | panelga qaytish |
| to'lov / chek yuborish | |
| "tugadi" belgilash | |
| ro'yxatga narsa qo'shish | |
| anonim shikoyat yozish | |

```
📊 FAOLLIK — SENTABR
━━━━━━━━━━━━━━━━━

             sentabr  jami
Jamshidbek         5    20
Sorabek            5    10
Nizombek           4     7 👈
Akbar              2    10
Asilbek            0     0
```

**Bu reyting emas.** Eski ball tizimi baho qo'yardi — navbatga 60, kechikkanga
−10, medallar bilan. Bu esa faqat sanaydi, xuddi xonaga kim ko'p kirib
chiqayotganini bilish kabi. Buni kod emas, bazaning o'zi kafolatlaydi:
`faollik` jadvalida `ball` ustuni yo'q, ya'ni vazn qo'yadigan joy mavjud
emas.

Ikkita raqam: **shu oy** va **jami**. Harakati yo'q odam ham ro'yxatda
qoladi — "kim faol emas" ham javob talab qiladigan savol. Teng sonlilar
bir xil o'rinni oladi.

Eski tarix (`submissions`, `confirmations`, `tolovlar`, `reports`) birinchi
ishga tushishda ko'chiriladi, shuning uchun ro'yxat noldan emas, haqiqiy
raqamlardan boshlanadi.

## Kvartira to'lovi — oylik yig'im

Kvartira puli har oyning **14-kuni** to'lanadi, demak shu kungacha hamma o'z
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
11-kundan → HAR 5 SOATDA shaxsiy ogohlantirish (ohangi kuchayib boradi)
        ↓
14-kun oxiri → yakuniy holat suratga olinadi
        ↓
Yangi oy → yangi sikl (eski oy tarixi o'z joyida qoladi)
```

**Bir yo'la to'lash shart emas.** 900 000 so'mni 100k + 200k + 300k + 300k
qilib tashlasa ham bo'ladi — hammasi qo'shib boriladi. To'lig'i tushgach
eslatma o'z-o'zidan to'xtaydi.

### Ogohlantirish 12-kundan boshlanadi

Kuniga **bir marta** yuboriladi — lekin xabarning ohangi har kuni kuchayadi.
Chastota past, e'tibor talab kuchli:

| Kun | Belgi | Xabar |
|---|---|---|
| 11-kun | ⚠️ | Muddatgacha atigi 3 KUN QOLDI! |
| 12-kun | 🚨 | Muddatgacha atigi 2 KUN QOLDI! |
| 13-kun | 🔴 | ERTAGA OXIRGI KUN — ATIGI 1 KUN QOLDI! |
| 14-kun | 🚨 | MUDDAT BUGUN TUGAYDI! |
| keyin | ⛔️ | MUDDAT N KUN OLDIN TUGAGAN! |

Har bir xabarda odamning **joriy tasdiqlangan** balansi va qoldig'i turadi.
Tekshiruvda turgan to'lov alohida `⏳ Tekshiruvda` qatori bo'lib chiqadi va
hisobga qo'shilmagani ochiq aytiladi — aks holda odam "to'ladim-ku" deb
o'ylab, qolgan pulni tashlamay qo'yardi.

To'lig'i tasdiqlangan odam ro'yxatdan butunlay chiqadi va boshqa
ogohlantirish olmaydi. "Qachon eslatilgan" fakti bazada
(`tolov_holat.oxirgi_eslatma_ts`), shuning uchun bot qayta ishga tushsa ham
oraliq saqlanadi.

Chastota **👑 Admin Panel → ⚙️ Sozlamalar → To'lov eslatmasi (soat)** dan
o'zgartiriladi (standart 5 soat).

### 🙁 To'lay olmayapman

Kvartira puli ham, yig'im ham: eslatmada va "💳 / 💰" ko'rinishida
**"🙁 To'lay olmayapman"** tugmasi bor. Odam sababini yozadi (*"maoshim
25-da tushadi"*) — u **faqat adminlarga** boradi (kartochkaga o'tish tugmasi
bilan), guruhga hech qachon chiqmaydi. Shu odamga eslatma **24 soat**
to'xtab turadi, keyin yana o'z jadvaliga qaytadi — qarz o'z-o'zidan
yo'qolmaydi.

Admin ko'rinishlarida oxirgi sabab qarzdor qatori ostida `💬 «...»` bo'lib
turadi, kartochkada esa hammasi. Kelishilgan bo'lsa admin "🧾 Shaxsiy summa"
qo'yadi.

### Naqd bergan bo'lsangiz

Naqd pulda chek yo'q — botga yuboradigan dalil ham yo'q. Shuning uchun har
eslatmaning oxirida turadi:

```
💵 Naqd berganmisiz?
Admin hali tasdiqlamagan bo'lsa @admin ga yozing —
u belgilagach eslatma o'zi to'xtaydi.
```

Admin odamning kartochkasidan **"✏️ To'lovni tuzatish"** bilan `+600000`
deb belgilaydi (sabab: *naqd qo'lma-qo'l oldim*) — eslatma o'zi to'xtaydi.

### Shaxsiy summa — hamma bir xil to'lamaydi

20 kun turib chiqib ketadigan odam 900 000 emas, kelishilgan 600 000
to'laydi. Ilgari bunday odam abadiy "qisman to'lagan" bo'lib qolar,
qarzdorlar ro'yxatidan tushmas va har 5 soatda eslatma olardi.

**👑 Admin Panel → 💳 To'lovlar → odamni tanlang → 🧾 Shaxsiy summa**:

```
Umumiy talab: 900 000 so'm
Bu odamdan shu siklda qancha talab qilinsin?
> 600000
```

600 000 to'lagach u **to'liq to'lagan** bo'ladi: qarzdorlar ro'yxatidan
chiqadi, eslatma to'xtaydi, dashboardda `🧾` bilan belgilanadi. Olib
tashlash uchun `-` yoziladi.

Faqat **shu oy** uchun — keyingi oy yana umumiy talabdan boshlanadi, ya'ni
bir marta kelishilgan chegirma jimgina abadiylashib qolmaydi.

> **"To'lovni tuzatish" bilan chalkashtirmang.** U odam TO'LAGAN pulni
> yozadi, "Shaxsiy summa" esa undan TALAB qilinadigani. Yetmagan 300 000 ni
> "to'ladi" deb yozish osonroq ko'rinadi, lekin u odam to'lamagan pulni
> tarixga kiritib, hisobotni yolg'onlashtiradi.

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
Muddat kelganda hali tekshirilmagan to'lovi bor odamning holati **yakuniy
deb belgilanmaydi** — surat "tekshiruv kutilmoqda" deb qo'yiladi va tasdiq
kelgach o'z-o'zidan qayta hisoblanadi.

Tekshirilmagan to'lov hech qachon "to'langan" deb ko'rsatilmaydi — qoldiq
faqat tasdiqlangan summadan hisoblanadi.

### Sikl holatlari

| Holat | Ma'nosi |
|---|---|
| `ochiq` | To'lov qabul qilinmoqda |
| `muddat_yetdi` | 14-kun o'tdi, yakuniy holat suratga olindi (to'lov hamon qabul qilinadi) |
| `yakunlandi` | Oy yopildi — admin tugmasi bilan yoki yangi oy ochilganda avtomatik |

Hech qanday tarix o'chirilmaydi: eski sikl, uning to'lovlari va muddat
surati bazada qoladi.

### Kechikish

Muddat o'tgan va qarzi qolgan odam **kechikkan** deb belgilanadi. Bu daraja
(to'liq/qisman/to'lanmagan) bilan almashtirilmaydi — daraja PULNING, kechikish
esa VAQTNING holati, ikkalasi mustaqil o'zgaradi. Muddatdan keyin to'lagan
odam bir vaqtning o'zida "to'liq to'lagan" va "kechikmagan" bo'lib qoladi.

Kechikish o'z ko'rinishida ham (⛔️ MUDDAT O'TIB KETGAN), admin panelida ham
alohida ro'yxatda chiqadi. Pul jarimasi YO'Q — bot faqat yetmagan summani
ko'rsatadi.

### Takroriy chek

Xuddi shu chek shu oyda ikkinchi marta yuborilsa yangi yozuv **yaratilmaydi** —
aks holda bitta pul ikki marta hisobga tushib, qarzni ikki barobar kamaytirib
yuborardi. Foydalanuvchi mavjud yozuvning holatini ko'radi. Rad etilgan chek
bundan mustasno: xatoni tuzatib qayta yuborish mumkin.

Qattiq kafolat bazadagi `tolovlar_dalil_uniq` qisman indeksida, ya'ni ikki
so'rov bir vaqtda kelsa ham ikkita yozuv paydo bo'lmaydi.

### Admin

`/tolovlar` (yoki 👑 Admin Panel → 💰 To'lovlar) — umumiy raqamlar, so'ng
alohida tugmalar:

| Tugma | Nima ko'rsatadi |
|---|---|
| 🔴 Qarzdorlar | qarzi borlar, eng ko'p qarzdordan boshlab |
| ⛔️ Kechikkanlar | muddat o'tgani holda qarzi qolganlar (faqat bor bo'lsa) |
| 🟢 To'laganlar | shu oyni to'liq yopganlar |
| ⏳ Tekshiruvdagilar | chek rasmi + tasdiqlash/rad tugmalari |
| 📜 Tarix | oxirgi oylarning qisqa xulosasi |
| 🔒 Oyni yakunlash | faqat muddat kelgan, hali yopilmagan oyda |

Umumiy ko'rinish ataylab qisqa: 12 kishilik uyda uchta to'liq ro'yxat bitta
xabarga sig'masdi va muhim raqamlar pastga tushib ketardi.

Har bir odamning tugmasi bosilsa: talab, tasdiqlangan, qoldiq,
tekshiruvdagilar, muddat natijasi, o'zi yozgan sabablar va butun to'lov tarixi.

Ochiq yig'im panelida qo'shimcha: **🛒 Ro'yxat** — savdo ro'yxatini qaytadan
yozish (joriy ro'yxat nusxalash uchun ko'rsatiladi, yozilgani eskisining
o'rniga tushadi va guruhga to'liq ro'yxat chiqadi), **📝 Nomi** — yig'im
nomini tuzatish. Uzun qator kesilmaydi, rad etiladi.

## Admin hisobotlari

Bot adminlarga o'zi yuboradi (baho emas — ball, o'rin yo'q, faqat fakt):

- **Har navbat yopilgach** — xona, sanalar, muddat va necha kun kechikkani,
  har vazifani kim qilgani va nechta rasm, kim topshirgani, kim tasdiqlagani,
  rad etilganlar, "🗑 Musor to'ldi" signallari (kim aytdi, kim necha soatda
  tashladi yoki hal qilinmadi).
- **Har oy boshida** — o'tgan oy: xonalar bo'yicha navbatlar (kechikkan,
  topshirilmasdan yopilgan), musor signallari, kvartira puli (kim qarzdor,
  muddatda kim yetkazmadi), yig'imlar, "to'lay olmayapman" yozganlar,
  shikoyatlar, botdagi harakatlar soni.

Qo'lda: **👑 Admin Panel → 📊 Hisobotlar** (yoki `/hisobot`) — oxirgi navbat,
joriy navbat, shu oy, o'tgan oy.

## Qoidalar (`src/config.ts`)

| Sozlama | Qiymat |
|---|---|
| Bir xonaga muddat | 5 kun |
| Eslatma | muddatga 1 kun qolganda |
| Kerakli tasdiq | 3 kishi (faqat boshqa xonalardan) |
| Minimal rasm | 3 ta |
| Kvartira to'lovi muddati | oyning 14-kuni (kun oxirigacha) |
| To'lov ogohlantirishi | muddatga 3 kun qolganda (11-kundan), har 5 soatda |

To'lov summasi va qabul qiluvchi kodda emas, `settings` jadvalida —
`/tolovtalab`, `/tolovsozla` bilan o'zgartiriladi. `/tolovtalab` faqat
**kelgusi** oylarga ta'sir qiladi: har bir sikl o'z talabini ochilganda
muzlatib oladi.

> Bot pul hisobini yuritmaydi va jarima yozmaydi — faqat kimdan qancha
> yetmaganini ko'rsatadi.

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
| 📋 Navbat | hozirgi va keyingi xona, muddat |
| 🗑 Musor to'ldi | navbatdagi xonaga xabar — tashlanmaguncha eslatiladi |
| 📊 Faollik | kim botda ko'proq harakat qilyapti |
| 💰 Pul yig'imi | ochiq yig'im holati va "To'ladim" tugmasi |
| 💳 Kvartira to'lovi | o'z holati, to'lash, tarix |
| 👤 Profil | xonasi, navbat statistikasi, tasdiq kutayotgan ishlari |
| 🛒 Uyga nima kerak | tugaganini belgilash, yangisini qo'shish |
| 🕘 Tarix | oxirgi navbatlar: kim yuklagan, necha rasm, kim tasdiqlagan |
| 🔒 Anonim shikoyat | ismsiz shikoyat (`/shikoyat` ham) |
| ℹ️ Qanday ishlaydi? | hamma tugma bitta rasmda (`/qollanma`), batafsil matn |

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
| `/hisobot` | navbat va oylik hisobotlar |
| `/qollanma` | (guruhda) qo'llanma rasmini joylab pin qilish |

### Qo'llanma rasmi

"ℹ️ Qanday ishlaydi?" bosilganda bot `public/qollanma.png` ni yuboradi
(Vercel uni `https://<loyiha>.vercel.app/qollanma.png` da beradi). Manbasi —
`public/qollanma.html`; tugma nomlari `src/bot/keyboards.ts` dagi bilan
bir xil bo'lishi shart. O'zgartirgach:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --hide-scrollbars --window-size=1080,1920 \
  --screenshot=public/qollanma.png "file://$PWD/public/qollanma.html"
```

va `src/config.ts` dagi `qollanmaRasm` URL'idagi `?v=` ni oshiring —
Telegram bir URL'ni keshlab qoladi. Boshqa manzil kerak bo'lsa: `.env` da
`QOLLANMA_URL`.

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
├── config.ts              qoidalar va standart qiymatlar
├── db/
│   ├── schema.sql         jadvallar
│   ├── setup.ts / seed.ts
├── core/
│   ├── rotation.ts        navbat dvigateli, kechikish
│   ├── photobuffer.ts     rasm to'plash (FOR UPDATE qulf)
│   ├── tarix.ts           oxirgi navbatlar ro'yxati
│   ├── signal.ts          "🗑 Musor to'ldi" signali
│   ├── hisobot.ts         admin hisobotlari (navbat, oylik) — sof ma'lumot
│   ├── narsalar.ts        "uyga nima kerak" ro'yxati
│   ├── tolov.ts           kvartira to'lovi va pul yig'imi: sikl, muddat
│   └── vaqt.ts            Toshkent kalendar hisobi (sof funksiyalar)
├── bot/
│   ├── handlers/
│   │   ├── commands.ts    panel, ko'rinishlar, ro'yxatdan o'tish
│   │   ├── photos.ts      rasm dispetcheri (ish / xarajat / navbat)
│   │   ├── messages.ts    matn dispetcheri, panel qaytishi
│   │   ├── confirm.ts     tasdiqlash
│   │   ├── navbat.ts      vazifa paneli, musor signali, navbat sozlamalari
│   │   ├── hisobot.ts     📊 Hisobotlar (qo'lda ochish)
│   │   ├── tolov.ts       to'lov oqimi, tekshiruv, admin ko'rinishi
│   │   └── admin.ts       admin buyruqlari
│   ├── keyboards.ts / text.ts / group.ts / state.ts
├── jobs/
│   └── reminders.ts       BARCHA eslatmalar va avtomatik hisobotlar
└── index.ts               long polling (lokal / Docker)
api/
├── webhook.ts             Telegram yangilanishlari (Vercel)
└── cron.ts                kunlik vazifalar (Vercel Cron)
```
