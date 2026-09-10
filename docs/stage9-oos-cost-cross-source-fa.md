# Stage 9: اعتبارسنجی خارج از نمونه، هزینه و منبع مستقل

**تاریخ اجرا:** ۱۰ سپتامبر ۲۰۲۶
**وضعیت:** تکمیل‌شده برای غربال D1؛ مسیر intraday و Paper-Forward هنوز آغاز نشده است.
**دامنهٔ ایمنی:** فقط دادهٔ تاریخی، Backtest محلی و فایل‌های محلی. هیچ broker write، سفارش زنده، اتصال معامله یا Paper-Forward اجرا نشد.

## نتیجهٔ تصمیم

اعتبارسنجی امروز سه سطح مستقل داشت. ابتدا نامزدهای برتر ماتریس D1 با Walk-Forward ثابت بررسی شدند. سپس فقط نامزدهای عبورکرده تحت سناریوهای هزینهٔ افزایش‌یافته و شدید اجرا شدند. در نهایت USDJPY/FVG روی یک منبع تاریخی مستقل از Yahoo Finance، یعنی HistData، دوباره آزمایش شد. نتیجه نشان می‌دهد که **USDJPY/FVG Equilibrium** تنها نامزدی است که در این سطح برای دریافت دادهٔ مطابق منبع اجرای نهایی ارزش ادامه‌دادن دارد.

BTCUSD/Breakout در غربال اولیهٔ بلندمدت جذاب بود، اما در Walk-Forward فقط ۱۳ معاملهٔ OOS و یک fold سودده از چهار fold داشت. بنابراین با وجود PF تجمعی 1.31، طبق gate کمّی رد نشده اما **متوقف** است. XAUUSD/S0 نیز از آزمون آماری و هزینه عبور کرد، ولی دادهٔ آن `GC=F` است. این قرارداد آتی COMEX یک proxy ساختاری است و نه quote یک بروکر XAUUSD؛ بنابراین نمی‌تواند به Paper-Forward یا تصمیم اجرایی ارتقا یابد.

> **اصل تصمیم:** نتیجهٔ in-sample یا PF بالا به‌تنهایی برای ارتقا کافی نیست. ارتقا فقط زمانی مجاز است که تعداد معاملات OOS، پایداری foldها، افت سرمایه، مقاومت هزینه و هم‌خوانی منبع داده با محیط اجرا هم‌زمان برقرار باشند.

## سطح ۱: Walk-Forward با پارامترهای ثابت

پارامترهای Breakout، FVG و S0 پس از ماتریس اولیه تغییر نکردند. هر fold شامل یک train window، فاصلهٔ purge برابر پنج bar و یک OOS window بود. انتخاب مجدد بر اساس OOS انجام نشد.

| نامزد | منبع و پوشش | fold | معاملهٔ OOS | fold سودده | PF OOS | سود خالص OOS | Max DD OOS | gate |
|---|---|---:|---:|---:|---:|---:|---:|---|
| BTCUSD / Breakout 55–EMA200 / بدون AI | Yahoo Finance D1، ۲۰۱۶–۲۰۲۶ | 4 | 13 | 1 از 4 | 1.31 | 41.84 | 1.02% | `HOLD_FOR_MORE_DATA_OR_RULE_REVIEW` |
| USDJPY / FVG Equilibrium / بدون AI | Yahoo Finance D1، ۲۰۱۶–۲۰۲۶ | 4 | 112 | 4 از 4 | 1.95 | 703.67 | 0.81% | `PROMOTE_TO_COST_STRESS` |
| XAUUSD / S0 Sweep / بدون AI | GC=F proxy D1، ۲۰۱۶–۲۰۲۶ | 4 | 90 | 4 از 4 | 1.60 | 546.98 | 1.18% | فقط پژوهشی؛ نیازمند quote هم‌منبع |

قانون این gate شامل حداقل ۳۰ معاملهٔ بسته‌شدهٔ OOS، PF تجمعی حداقل 1.10، حداقل نیمی از foldهای سودده و Max DD حداکثر 12% بود. BTCUSD شرط تعداد و پایداری fold را پاس نکرد. USDJPY و XAUUSD از نظر آماری عبور کردند، اما فقط USDJPY بدون caveat proxy به مرحلهٔ بعد وارد شد.

## سطح ۲: سناریوهای هزینهٔ بدبینانه

برای USDJPY و XAUUSD، spread، slippage و commission با قاعدهٔ ثابت افزایش یافت. در سناریوی Elevated، spread دو برابر، slippage برابر 0.8 pip و commission برابر 1.25 برابر پایه شد. در سناریوی Severe، spread سه برابر، slippage برابر 1.5 pip و commission برابر 1.5 برابر پایه شد. این تغییرات **سیگنال یا پارامتر استراتژی را بازبهینه‌سازی نکردند**.

| نامزد | سناریو | معاملهٔ OOS | PF | سود خالص OOS | Max DD OOS | نتیجه |
|---|---|---:|---:|---:|---:|---|
| USDJPY / FVG | پایه | 112 | 1.95 | 703.67 | 0.81% | عبور |
| USDJPY / FVG | Elevated | 112 | 1.84 | 649.99 | 0.90% | عبور |
| USDJPY / FVG | Severe | 112 | 1.73 | 591.21 | 1.02% | عبور؛ به بررسی دادهٔ مطابق منبع نهایی ارتقا یافت |
| XAUUSD / S0 | پایه | 90 | 1.60 | 546.98 | 1.18% | عبور آماری |
| XAUUSD / S0 | Elevated | 90 | 1.55 | 509.84 | 1.20% | عبور آماری |
| XAUUSD / S0 | Severe | 90 | 1.49 | 469.70 | 1.23% | فقط پژوهشی؛ منبع GC=F proxy است |

قانون stress این بود که سناریوی Elevated حداقل ۳۰ معامله و PF حداقل 1.05 داشته باشد و سناریوی Severe PF حداقل 1.00 و Max DD حداکثر 12% داشته باشد. USDJPY از تمام آستانه‌ها عبور کرد. XAUUSD نیز از آستانه‌های آماری عبور کرد، اما محدودیت منبع باعث می‌شود این نتیجه به‌تنهایی مجوز اقدام بعدی نباشد.

## سطح ۳: بررسی مجدد با منبع مستقل برای USDJPY

دادهٔ M1 عمومی USDJPY از HistData برای سال‌های ۲۰۲۰ تا ۲۰۲۴ دریافت، timestamp آن از EST ثابت به UTC تبدیل، و به D1 با bucketهای کامل تجمیع شد. این فایل از Yahoo Finance جداست. همان `FVG_EQUILIBRIUM_V1`، همان حالت `OFF` و همان هزینهٔ پایه روی این دیتاست اعمال شد. هیچ پارامتری بر اساس نتیجهٔ HistData تغییر نکرد.

| معیار | نتیجه |
|---|---:|
| پوشش مستقل | ۲۰۲۰–۲۰۲۴ |
| تعداد fold | 4 |
| fold سودده | 3 از 4 |
| معاملات OOS بسته‌شده | 60 |
| Win rate OOS | 41.7% |
| سود خالص OOS | 329.27 |
| PF OOS | 1.45 |
| Max DD OOS | 1.14% |

این آزمون یک **تأیید مستقل نسبی** فراهم می‌کند، نه اثبات قابلیت اجرای بروکری. HistData دادهٔ bid و زمان EST ثابت دارد. quote، spread، rollover، DST، commission و کیفیت fill یک broker مشخص ممکن است متفاوت باشند. بنابراین نامزد USDJPY فقط به مرحلهٔ «دادهٔ مطابق منبع نهایی» ارتقا می‌یابد.

## وضعیت سبک‌ها پس از Stage 9

| روش | وضعیت | دلیل |
|---|---|---|
| USDJPY / FVG Equilibrium | **نامزد اصلی ادامه** | OOS 10ساله، stress شدید و بررسی مستقل HistData همگی مثبت بودند. |
| XAUUSD / S0 Sweep | پژوهشی، متوقف در ارتقا | آمار مثبت است، اما GC=F proxy جایگزین quote بروکر نیست. |
| BTCUSD / Breakout 55–EMA200 | Hold | تعداد OOS و ثبات fold برای ارتقا کافی نیست. |
| EURUSD / S0+FVG | Hold | edge اولیه مرزی بود؛ نیازی به آزمایش بیشتر امروز ندارد. |
| GBPUSD / BOS و Mean Reversion | Hold | edge اولیه ضعیف یا نمونهٔ کم داشت. |
| سایر سبک‌ها | Hold | هیچ شاهد جدیدی برای افزایش دامنهٔ آن‌ها وجود ندارد. |

## پنج gate باقیمانده تا پایان مسیر فعلی

| شماره | gate بعدی | وضعیت ورودی | خروجی لازم | وابستگی |
|---:|---|---|---|---|
| 1 | دادهٔ M1/M5 و D1 مطابق broker یا execution source برای USDJPY | نامزد USDJPY/FVG تأیید نسبی شده است | manifest کیفیت، timezone، spread و session هم‌خوان | دسترسی read-only به داده یا CSV کاربر |
| 2 | Walk-Forward و stress هزینه روی دادهٔ هم‌منبع | پس از Gate 1 | PF/تعداد معامله/DD مطابق آستانه‌های Stage 9 | دیتاست Gate 1 |
| 3 | کالیبراسیون AI برای review تک‌ستاپ | قواعد deterministic تثبیت شده‌اند | ارزیابی کیفیت AI در مقابل baseline، بدون دستکاری Backtest گروهی | WebLLM واقعی یا کلید provider اختیاری |
| 4 | replay بسته و Paper Ticket محلی | Gate 1 و 2 مثبت | گزارش تصمیم، evidence و fail-closed برای هر ticket | دادهٔ هم‌منبع و رابط محلی |
| 5 | Paper-Forward read-only سی‌روزه و پذیرش نهایی | همهٔ gateهای قبل موفق باشند | گزارش ۳۰روزه، تحلیل Stage 8 و تصمیم go/no-go پژوهشی | میزبان همیشه‌روشن و credential read-only Demo |

پس از این پنج gate، پروژه به یک **پذیرش پژوهشی نهایی** می‌رسد. این پذیرش نیز مجوز Live Trading نیست. هر پیشنهاد یا تغییر به سمت broker write نیازمند تصمیم و اجازهٔ جداگانه خواهد بود.

## Artifactها و بازتولید

artifactهای خام محلی و ignored هستند تا دادهٔ حجیم و نتایج محیطی به repository افزوده نشود:

| artifact | توضیح |
|---|---|
| `data/runs/bundled-shortlist-walk-forward-20260910.json` | نتایج کامل OOS برای BTCUSD، USDJPY و XAUUSD |
| `data/runs/bundled-oos-cost-stress-20260910.json` | نتایج سناریوی هزینه برای USDJPY و XAUUSD |
| `data/runs/usdjpy-histdata-d1-2020-2024-fvg-walk-forward-20260910.json` | Walk-Forward مستقل USDJPY با HistData |
| `data/datasets/histdata/multi-year/` | دادهٔ M1 و تجمیع‌های USDJPY، ۲۰۲۰–۲۰۲۴؛ فایل‌های محلی و ignored |

فرمان‌های بازتولید به‌ترتیب زیرند:

```bash
HISTDATA_PAIRS=USDJPY bash scripts/download-histdata-range.sh 2020 2024
npx tsx scripts/merge-histdata-years.ts 2020 2021 2022 2023 2024
npx tsx scripts/run-bundled-shortlist-walk-forward.ts
npx tsx scripts/run-bundled-oos-cost-stress.ts
npx tsx scripts/run-walk-forward.ts --dataset data/datasets/histdata/multi-year/histdata-usdjpy-d1-2020-2024.dataset.json --output data/runs/usdjpy-histdata-d1-2020-2024-fvg-walk-forward-20260910.json --variant FVG_EQUILIBRIUM_V1 --ai-mode OFF --train-bars 700 --test-bars 180 --step-bars 180 --purge-bars 5
```

## منابع

[1]: https://finance.yahoo.com/ "Yahoo Finance"
[2]: https://www.histdata.com/ "HistData Historical Market Data"
[3]: https://help.ctrader.com/open-api/ "cTrader Open API Documentation"

> **افشای پژوهشی:** مبنای نتایج، OHLCV روزانه، ورود کندل بعدی، هزینه‌های شبیه‌سازی‌شده و حساب اولیهٔ 10,000 واحدی است. زمان داده‌ها تا ۱۰ سپتامبر ۲۰۲۶ است. Yahoo Finance و HistData منابع عمومی با تفاوت روش‌شناسی و کیفیت هستند. این گزارش صرفاً تحلیل پژوهشی است و توصیهٔ شخصی سرمایه‌گذاری نیست.
