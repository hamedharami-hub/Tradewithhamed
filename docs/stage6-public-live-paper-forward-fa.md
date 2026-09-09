# مرحلهٔ ششم: Paper-Forward با دادهٔ زندهٔ عمومی

## روش اجرا

Paper-Forward روی دادهٔ فعلی GBPUSD از endpoint عمومی Yahoo Finance Chart API اجرا شد. این اجرا فقط‌خواندنی بود و هیچ credential، token، endpoint سفارش یا مسیر cTrader در آن استفاده نشد.

```bash
npm run research:paper:public-live
```

پارامترهای اجرا:

- نماد: GBPUSD
- منبع: `GBPUSD=X`
- بازهٔ دریافت: ۵ روز اخیر
- فاصلهٔ داده: ۵ دقیقه
- تعداد کندل بستهٔ واردشده: ۱۲۰۸
- استراتژی: `S0_SWEEP_FVG`
- AI mode: `DETERMINISTIC_COUNCIL`
- محیط: `PAPER_REPLAY`
- broker writes: `false`

آخرین کندل بستهٔ دریافت‌شده در زمان اجرا: `2026-09-09T05:04:29.000Z`.

## عملکرد مشاهده‌شده

| معیار | نتیجه |
|---|---:|
| Signals | 9 |
| معاملات شبیه‌سازی‌شده | 9 |
| معاملات برنده | 2 |
| معاملات بازنده | 7 |
| Win rate | 22.2% |
| Net PnL | -297.85 |
| Profit Factor | 0.13 |
| Expectancy | -33.09 |
| Max Drawdown | 3.08% |
| Commission | 51.42 |
| Slippage | 3.6 pips |
| End equity | 9,702.15 |
| Rejected bars | 0 |

## تفسیر

این snapshot زندهٔ اخیر برای `S0_SWEEP_FVG` نتیجهٔ منفی دارد و با PF برابر ۰٫۱۳ برای فعال‌سازی Strategy مناسب نیست. این نتیجه مهم است، چون نشان می‌دهد Paper-Forward اکنون می‌تواند ضعف یک Rule را روی دادهٔ جدید و خارج از dataset تاریخی آشکار کند.

این عدد هنوز آزمون آماری پایدار نیست؛ فقط ۹ معامله دارد و Yahoo Finance ممکن است delay یا rate-limit داشته باشد. بنابراین نباید از آن نتیجه گرفت که عملکرد بلندمدت Strategy دقیقاً همین خواهد بود. با این حال، برای Go/No-Go اولیه نتیجه فعلاً **No-Go برای این تنظیم در این snapshot** است.

## مرز ایمنی

- `brokerWrites=false`
- `brokerExecution=DISABLED`
- هیچ سفارش cTrader یا بروکر ارسال نشد.
- فقط کندل‌های بسته وارد موتور شدند.
- کندل‌های تکراری یا خارج از ترتیب رد می‌شوند.
- خروجی در مسیر زیر ذخیره شد:

```text
data/runs/paper-forward/gbpusd-yahoo-live-v1.json
```

## محدودیت منبع

Yahoo Finance برای Paper-Forward پژوهشی و smoke test مناسب است، اما quote دقیق broker نیست. برای نتیجهٔ معتبرتر باید همین runner با feed دمو cTrader یا broker history اجرا شود. مرحلهٔ بعدی اعتبارسنجی، تکرار حداقل ۳۰ تا ۹۰ روزه با دادهٔ واقعی و ثبت daily report، session breakdown و drift است.
