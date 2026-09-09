# راهنمای جامع استقرار و اجرای مانیتور ۳۰ روزهٔ Paper-Forward روی رایانهٔ همیشه روشن
**پروژهٔ Tradewithhamed — فاز ۸ (Stage 8 Paper-Forward Hardening)**  
*نسخهٔ سند: ۱.۰ — سپتامبر ۲۰۲۶*

---

## ۱. مرزهای ایمنی غیرقابل‌مذاکره (Safety Boundaries)

> [!CAUTION]
> **اصل بنیادین ایمنی سرمایه:**  
> سامانهٔ فاز ۸ به صورت معماری و سیستمی **فقط-خواندنی (Read-Only)** است.  
> فیلد `brokerWrites: false` در تمامی ماژول‌ها، رویدادها، ترانسپورت شبکه و گزارش‌ها به صورت دائمی درج شده است.  
> هرگونه تلاش برای ارسال کد `2106` (`NEW_ORDER_REQ`) یا درخواست‌های دستکاری حساب پیش از خروج از سوکت با خطای قطعی `SAFETY_BLOCKED` متوقف می‌شود.  
> هیچ سفارشی تحت هیچ شرایطی به بروکر cTrader ارسال نمی‌شود و کلیهٔ معاملات در دفترکل مجازی محلی (`Stage8PaperLedger`) ذخیره و شبیه‌سازی می‌گردند.

---

## ۲. نیازمندی‌های سخت‌افزار و سیستم‌عامل رایانهٔ شخصی (Workstation Setup)

برای اینکه آزمایش ۳۰ روزهٔ پیوسته و بدون وقفه اجرا شود، سیستم میزبان باید دارای شرایط زیر باشد:

### ۲.۱. مشخصات سخت‌افزاری پیشنهادی
- **پردازنده:** حداقل ۴ هسته (Intel Core i5 نسل ۸ به بعد یا AMD Ryzen 3000 به بعد).
- **حافظهٔ رم:** حداقل ۸ گیگابایت (۱۶ گیگابایت توصیه می‌شود).
- **فضای ذخیره‌سازی:** حداقل ۱۰ گیگابایت فضای خالی SSD برای لاگ‌های ساختاریافتهٔ JSONL.
- **منبع تغذیه و UPS:** استفاده از محافظ برق و در صورت امکان UPS جهت جلوگیری از ریست ناشی از نوسانات برق.

### ۲.۲. پیکربندی ضد-خواب (Prevent Sleep / Hibernation)

#### الف) در سیستم‌عامل ویندوز (Windows 10 / 11)
۱. باز کردن ترمینال PowerShell در حالت Run as Administrator و اجرای دستورات زیر:
```powershell
# غیرفعال کردن خاموش شدن مانیتور و رفتن به حالت Sleep در حالت اتصال به برق AC
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

# غیرفعال کردن حالت Sleep عمیق کارت شبکه
Get-NetAdapter | ForEach-Object { Disable-NetAdapterPowerManagement -Name $_.Name -ErrorAction SilentlyContinue }
```
۲. **جلوگیری از ریست ناخواستهٔ Windows Update:**
   - رفتن به مسیر `Settings > Windows Update > Advanced options`.
   - تنظیم **Active Hours** روی ۲۴ ساعته یا فعال کردن اعلان پیش از ریستارت.

#### ب) در سیستم‌عامل لینوکس (Ubuntu / Debian)
```bash
# غیرفعال‌سازی حالت‌های تعلیق و هایبرنیت سیستمی
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

---

## ۳. نیازمندی‌های شبکه و اتصال cTrader

۱. **پورت ارتباطی WebSocket:**
   - پورت اتصال رسمی JSON cTrader Open API پورت **۵۰۳۶** است (`demo.ctraderapi.com:5036`).
   - > [!WARNING]
     > پورت ۵۰۳۵ متعلق به ساختار پروتوباف/قدیمی است و در پیش‌پرواز فاز ۸ به صورت خودکار رد (`PORT_5035_DEPRECATED`) می‌شود.
۲. **تنظیمات فایروال:**
   - پورت ۵۰۳۶ خروجی (Outbound TCP/TLS) در فایروال سیستم یا مودم باز باشد.
۳. **پایداری اتصال و Reconnect خودکار:**
   - ترانسپورت `CTraderReadOnlyTransport` دارای الگوریتم Backoff نمایی (از ۵۰۰ میلی‌ثانیه تا ۳۰ ثانیه) تا سقف ۱۰ مرتبه تلاش متوالی است.
   - در صورت قطع موقت اینترنت، سوکت به طور ایمن به حالت `RECONNECTING` رفته و پس از وصل مجدد، اشتراک قیمت‌ها (`SUBSCRIBE_SPOTS_REQ`) را بدون از دست دادن تاریخچهٔ محلی تمدید می‌کند.

---

## ۴. چک‌لیست پیش‌پرواز (Preflight Verification Checklist)

پیش از روشن گذاشتن سیستم برای دورهٔ ۳۰ روزه، گام‌های زیر را به ترتیب اجرا کنید:

### گام اول: ساخت فایل تنظیمات محیطی
فایل الگوی امن را کپی کنید:
```bash
cp .env.paper-forward.example .env.paper-forward
```
مقادیر زیر را در فایل `.env.paper-forward` وارد نمایید (تنها مقادیر دمو):
```env
CTRADER_ENVIRONMENT=demo
CTRADER_GATEWAY_HOST=demo.ctraderapi.com
CTRADER_GATEWAY_PORT=5036
CTRADER_CLIENT_ID=<شناسهٔ کلاینت دمو>
CTRADER_CLIENT_SECRET=<سکرت کلاینت دمو>
CTRADER_ACCESS_TOKEN=<توکن دسترسی دمو>
CTRADER_ACCOUNT_ID=<شماره حساب دمو>
RUN_CTRADER=1
REQUIRE_CTRADER=1
MONITOR_SYMBOL=GBPUSD
MONITOR_TIMEFRAME=5M
MONITOR_ANALYST_PROVIDER=DETERMINISTIC
STAGE8_REPORT_DIR=data/runs/stage8-30d
```

### گام دوم: اجرای ارزیابی سلامت و عدم ارسال سفارش
دستور زیر را اجرا کنید:
```bash
npm run research:ctrader:readonly-check
```
**خروجی مورد انتظار:**
- `forbiddenWriteSignals: 0`
- `readOnlySafe: true`

### گام سوم: اجرای تست‌های دامنه و صحت تایپ‌ها
```bash
npm run typecheck
npm run test:domain
npm run lint
```
همهٔ تست‌ها (۲۱ سوئیت، ۱۲۶ چک) باید پاس شوند و بدون خطا باشند.

---

## ۵. روش‌های استقرار و راه‌اندازی پیوسته ۲۴/۷ (Execution Methods)

### روش ۱: استفاده از PM2 (توصیه اکید برای ویندوز و لینوکس)
ابزار PM2 فرآیند را به صورت خودکار مدیریت کرده و در صورت بروز خطای پیش‌بینی‌نشده آن را فوراً ریستارت می‌کند:

```bash
# ۱. نصب سراسری PM2 (در صورت عدم نصب قبلی)
npm install -g pm2

# ۲. شروع فرآیند مانیتور
pm2 start "npx tsx scripts/run-stage8-paper-forward-monitor.ts" --name "tradewithhamed-stage8"

# ۳. مشاهده لاگ‌های زنده
pm2 logs tradewithhamed-stage8

# ۴. ذخیره وضعیت فرآیند برای بالا آمدن پس از ریست احتمالی
pm2 save
pm2 startup
```

### روش ۲: سرویس Systemd (مخصوص سرور یا سیستم لینوکسی)
ایجاد فایل `/etc/systemd/system/tradewithhamed-stage8.service`:
```ini
[Unit]
Description=Tradewithhamed Stage 8 Paper-Forward Monitor
After=network.target

[Service]
Type=simple
User=hamed
WorkingDirectory=/home/hamed/Tradewithhamed
ExecStart=/usr/bin/npx tsx scripts/run-stage8-paper-forward-monitor.ts
Restart=always
RestartSec=10
EnvironmentFile=/home/hamed/Tradewithhamed/.env.paper-forward

[Install]
WantedBy=multi-user.target
```
فعال‌سازی سرویس:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tradewithhamed-stage8
sudo systemctl start tradewithhamed-stage8
```

---

## ۶. نگهداری لاگ‌ها و بررسی‌های دوره‌ای (Daily Operations)

۱. **محل ذخیره لاگ‌ها:**  
   گزارش‌ها به صورت خطوط مجزای JSONL در مسیر زیر ذخیره می‌شوند:
   `data/runs/stage8-30d/gbpusd-monitor-report.jsonl`
۲. **بازرسی روزانه (Daily Health Check):**  
   روزی یک بار دستور زیر را اجرا کنید تا وضعیت عدم وجود سیگنال‌های سفارش بروکر بررسی شود:
   ```bash
   npm run research:ctrader:readonly-check
   ```
۳. **بررسی اندازه فایل لاگ:**  
   در بازه ۳۰ روزه با تایم‌فریم 5M، حجم فایل لاگ بین ۳۰ تا ۷۰ مگابایت خواهد بود و هیچ فشاری به دیسک وارد نمی‌آورد.

---

## ۷. پایان دورهٔ ۳۰ روزه: تحلیل آماری Bootstrap و ارزیابی ترفیع

پس از سپری شدن دوره یا ثبت معاملات آزمایشی، ارزیابی آماری با الگوریتم Bootstrap (۱۰,۰۰۰ بار نمونه‌برداری مجدد با سید ثابت ۴۲) انجام می‌شود:

```bash
npm run research:stage8:analyze data/runs/stage8-30d/gbpusd-monitor-report.jsonl
```

### قوانین تصمیم‌گیری خروجی تحلیل:
۱. **قانون حجم نمونهٔ ناکافی (`SAMPLE_INSUFFICIENT`):**  
   چنانچه تعداد کل معاملات بسته‌شده کمتر از **۳۰ معامله** باشد:
   - وضعیت: `SAMPLE_INSUFFICIENT`
   - ترفیع به لایو (`readyForProductionPromotion`): `false`
   - دلالت: توان آماری کافی برای نتیجه‌گیری وجود ندارد؛ مانیتورینگ باید ادامه یابد.
۲. **قانون تأیید آماری (`STATISTICALLY_VALIDATED`):**  
   چنانچه تعداد معاملات $\ge 30$ بوده و شروط زیر برقرار باشد:
   - حد پایین بازهٔ اطمینان ۹۵٪ نرخ برد $\ge 0.45$
   - حد پایین بازهٔ اطمینان ۹۵٪ فاکتور سود $\ge 1.10$
   - سود خالص کلی $> 0$
   آنگاه سیستم وارد وضعیت `STATISTICALLY_VALIDATED` شده و گزارش رسمی ترفیع تولید می‌گردد.
