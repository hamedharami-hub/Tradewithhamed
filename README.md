# Hamed Trading Lab (نسخه ۴.۰)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhamedharami-hub%2FTradewithhamed)
[![CI & Deployment Quality Gates](https://github.com/hamedharami-hub/Tradewithhamed/actions/workflows/deploy.yml/badge.svg)](https://github.com/hamedharami-hub/Tradewithhamed/actions/workflows/deploy.yml)

سامانه شخصی، مستقل و فارسی برای تحلیل چندتایم‌فریمه، مدیریت ریسک قطعی، بازپخش کندل به کندل (Replay)، ژورنال خودکار W5، هوش مصنوعی آفلاین WebLLM و معامله آزمایشی (Demo) در بازار طلا (XAUUSD) و فارکس (EURUSD).

پروژه به صورت یک **Web App / PWA تمام‌پشته** بر پایه React، Next.js 16 App Router و زبان TypeScript طراحی شده و برای اجرا در مرورگرهای ویندوز (شامل پردازنده‌های ARM64 Snapdragon X Plus) و گوشی‌های همراه (نظیر Pixel 9 Pro Fold) کاملاً واکنش‌گرا و بهینه‌سازی شده است.

---

## ۱. وضعیت جاری پروژه

- **بسته تکمیل‌شده:** `B1` — آزمایشگاه وب و شبیه‌ساز آفلاین
- **محیط اجرایی:** مرورگرهای Windows و Android (PWA)
- **وضعیت اتصال بروکر:** **بدون اتصال بروکر** (کاملاً آفلاین، متکی بر Fixtures پایدار)
- **برچسب کلیه داده‌ها:** `SYNTHETIC / FIXTURE / SIMULATION`
- **حالت معاملاتی:** `DEMO ONLY` (بدون هرگونه اکانت لایو، بدون معاملات خودکار و بدون بایننس)

---

## ۲. ساختار پروژه و تفکیک لایه‌ها (Separation of Concerns)

کدها طوری معماری شده‌اند که منطق تجاری و محاسبات ریاضی کاملاً از فریم‌ورک‌های رابط کاربری، DOM و سرور تفکیک شده باشند:

```text
├── lib/
│   ├── contracts/             # قراردادها، تایپ‌ها و اسکیماهای مشترک بازار، ریسک، سفارش‌ها و ژورنال
│   │   ├── market.ts          # تایپ کندل‌ها، نمادها و متادیتای طلا و یورو
│   │   ├── features.ts        # ساختارهای ATR, Swings, FVG, Sweeps
│   │   ├── strategy.ts        # قراردادهای کاندیدای معامله S0
│   │   ├── risk.ts            # ورودی و خروجی پیش‌نمایش کنترل ریسک
│   │   ├── orders.ts          # ماشین وضعیت سفارش‌ها و پوزیشن‌ها
│   │   └── journal.ts         # ساختار رکوردهای ژورنال و ردپای حسابرسی
│   ├── core/                  # هسته محاسباتی مستقل (Pure TypeScript)
│   │   ├── atr.ts             # فرمول Wilder ATR(14) بدون سوگیری
│   │   ├── swings.ts          # کشف سقف و کف پیوت با تضمین عدم نگاه به آینده
│   │   ├── s0-engine.ts       # ارزیابی استراتژی سوییپ نقدینگی و پرایس‌اکشن
│   │   ├── risk-calculator.ts # محاسبه قطعی حجم، رعایت سقف ۰٫۲۵٪ و کسر کارمزد
│   │   ├── simulated-broker.ts# شبیه‌ساز اجرای سفارش و مدیریت پوزیشن (Paper Trading)
│   │   └── __tests__/         # آزمون‌های مستقل واحد برای صحت هسته
│   ├── replay/                # موتور بازپخش گام‌به‌گام و داده‌های ساختگی
│   │   ├── fixtures/          # کندل‌های نمونه هماهنگ XAUUSD و EURUSD
│   │   └── replay-engine.ts   # کنترل بازپخش کندل‌های بسته (Closed-Candle Replay)
│   └── persistence/
│       └── storage.ts         # ذخیره محلی و Export/Import با اعتبارسنجی اسکیما
├── components/
│   ├── chart/                 # نمودار کندل‌استیک فارسی با نشانگرهای Swings, FVG و خطوط ستاپ
│   ├── replay/                # کنترل‌های بازپخش (Play, Pause, Step, Speed, Reset)
│   ├── trading/               # کارت‌های بررسی کاندیدای معامله و جدول ژورنال
│   └── export-import/         # پنجره پشتیبان‌گیری و بازیابی داده‌ها
├── app/                       # صفحات و روت‌های Next.js App Router (RTL)
├── docs/                      # پرونده وضعیت پروژه، تصمیم‌ها و شواهد
└── .env.example               # الگوی متغیرهای محیطی بدون مقادیر محرمانه
```

---

## ۳. پیش‌نیازها و راه‌اندازی محلی

### پیش‌نیازها
- **Node.js:** نسخه `20.x` یا بالاتر
- **مدیر بسته:** `npm` یا `pnpm` یا `bun`

### مراحل نصب و اجرا
۱. دریافت مخزن و نصب وابستگی‌ها:
```bash
npm install
# یا در صورت استفاده از pnpm:
# pnpm install --frozen-lockfile
```

۲. تنظیم متغیرهای محیطی:
```bash
cp .env.example .env.local
```

۳. اجرای سرور توسعه محلی:
```bash
npm run dev
```
برنامه در آدرس `http://localhost:3000` به صورت پیش‌فرض در دسترس خواهد بود.

۴. بررسی استاتیک کد و قوانین لینت:
```bash
npm run lint
```

۵. کامپایل و ساخت نسخه نهایی پروداکشن:
```bash
npm run build
```

۶. اجرای نسخه پروداکشن:
```bash
npm run start
```

---

## ۴. قابلیت‌های تاییدشده بسته B1

1. **واسط کاربری واکنش‌گرا و فارسی (RTL):** کاملاً سازگار با ابعاد دسکتاپ و ابعاد نمایشگرهای تاشو (Pixel 9 Pro Fold) بدون بیرون‌زدگی عناصر.
2. **موتور بازپخش کندل‌های بسته (Closed-Candle):** جلوگیری از ورود ناقص داده‌ها با امکان گام‌به‌گام، توقف و تغییر سرعت.
3. **جلوگیری از بایاس نگاه به آینده (Look-ahead bias):** یک پیوت سقف یا کف تا زمانی که ۲ کندل راست آن بسته نشده باشد برای هیچ بخشی از استراتژی مجاز و مرئی نیست.
4. **کنترل ریسک قطعی (Deterministic Risk):** تخصیص حداکثر ۰٫۲۵٪ دارایی برای هر پوزیشن با گرد کردن محافظه‌کارانه حجم به پله مجاز بروکر.
5. **ژورنال محلی و شبیه‌ساز پوزیشن:** ثبت سفارش‌های لیمیت، پر شدن با برخورد قیمت و محاسبه سود/زیان خروج در SL/TP.
6. **پشتیبان‌گیری امن (Export/Import JSON):** استخراج وضعیت و بازیابی با اعتبارسنجی دقیق نسخه اسکیما (`v1.0`).

---

## ۵. محدودیت‌ها و مرزهای امنیتی فعلی

- **عدم ذخیره Secret در کلاینت:** هیچ کلید اختصاصی یا رمز بروکر در کلاینت یا localStorage ذخیره نمی‌شود.
- **توقف با بسته شدن مرورگر:** به عنوان یک PWA تحت وب، در صورت بسته‌شدن تب یا قفل عمیق گوشی، اجرای ورودهای جدید متوقف می‌شود. اجرای پس‌زمینه بدون وقفه به فازهای بومی آینده (Native Android) موکول شده است.
- **بازارها:** صرفاً طلا و یورو در محیط cTrader Demo مجاز هستند؛ هیچ اتصال یا پشتیبانی از کریپتو/بایننس یا حساب‌های Real وجود ندارد.

---

## ۶. راهنمای راه‌اندازی و استقرار وب‌سایت آنلاین (Cloud Deployment)

### روش ۱: استقرار ۱-کلیکی و خودکار روی Vercel (پیشنهادی)
سریع‌ترین و پایدارترین شیوه برای داشتن وب‌سایت زنده و رایگان این پروژه:
1. روی نشان زیر کلیک کنید یا وارد پنل [Vercel](https://vercel.com) شوید:
   
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhamedharami-hub%2FTradewithhamed)

2. با حساب کاربری گیت‌هاب لاگین کرده و مخزن `Tradewithhamed` را انتخاب کنید.
3. دکمه **Deploy** را بزنید. فایل `vercel.json` موجود در پروژه به صورت خودکار تمام هدرهای امنیتی و کش بهینه داده‌ها را تنظیم می‌کند.
4. آدرس دامنه شما (مانند `https://tradewithhamed.vercel.app`) آماده استفاده روی کلیه دیوایس‌ها خواهد بود.

### روش ۲: استقرار روی Google Firebase App Hosting
این پروژه حاوی فایل تنظیمات `apphosting.yaml` برای استقرار رسمی سرورلس در زیرساخت گوگل است:
```bash
npm install -g firebase-tools
firebase login
firebase apphosting:backends:create --project YOUR_PROJECT_ID
```

### روش ۳: ساخت کانتینر Docker
با توجه به خروجی `standalone` در Next.js، می‌توانید برنامه را با داکر کانتینرایز کرده و روی هر سرور ابری (Google Cloud Run، AWS، DigitalOcean یا سرور اختصاصی) اجرا کنید:
```bash
docker build -t tradewithhamed:latest .
docker run -p 3000:3000 tradewithhamed:latest
```

