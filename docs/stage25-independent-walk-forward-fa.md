# گزارش Stage 25: Walk-Forward مستقل EURUSD و BTCUSD

## جمع‌بندی اجرایی

در Stage 25 برای دو case که در Stage 24 نیازمند تأیید مستقل بودند، Walk-Forward جداگانه اجرا شد: EURUSD/4H و BTCUSD/D1. برای هر نماد دو مسیر مقایسه شد: baseline با پارامترهای پیش‌فرض و optimized با انتخاب پارامتر فقط از train هر fold. سپس Cost Stress روی همان OOSهای هر fold و با پارامتر منتخب همان fold اجرا شد.

EURUSD/4H در هر دو مسیر OOS منفی ماند و optimized زیان بیشتری نسبت به baseline ایجاد کرد. BTCUSD/D1 در هر دو مسیر OOS مثبت ماند و optimized سود بیشتری داشت، اما معاملات بیشتری ایجاد کرد و سود آن در سناریوی adverse کاهش محسوسی داشت. بنابراین نتیجهٔ Stage 25، **رد optimized برای EURUSD و candidate مشروط برای BTCUSD** است؛ این نتیجه مجوز paper-forward یا live trading نیست.

هیچ live trading، broker write یا cTrader write در این مرحله انجام نشد.

## طراحی آزمایش

| case | train | test | step | fold |
|---|---:|---:|---:|---:|
| EURUSD/4H | 600 | 300 | 300 | 3 |
| BTCUSD/D1 | 1000 | 500 | 500 | 5 |

فضای پارامتر در مسیر optimized برابر بود با Channel در `{34, 55}`، EMA در `{100, 200}`، حد ضرر ATR در `{1.5, 2}` و هدف ATR در `{3, 4}`. در هر fold، این grid فقط روی train اجرا شد. مرز purge برابر `entryExpiryBars` بود.

سناریوهای هزینه شامل BASE، STRESSED با spread دوبرابر، slippage برابر 0.4 pip و commission دوبرابر، و ADVERSE با spread سه‌برابر، slippage برابر 0.5 pip و commission معادل 1.5 برابر بود.

## نتایج OOS تجمیعی

| نماد / تایم‌فریم | مسیر | fold | معاملات OOS | BASE PnL | STRESSED PnL | ADVERSE PnL |
|---|---|---:|---:|---:|---:|---:|
| EURUSD/4H | Baseline | 3 | 26 | -46.85 | -70.97 | -80.35 |
| EURUSD/4H | Optimized | 3 | 35 | -231.05 | -269.21 | -284.05 |
| BTCUSD/D1 | Baseline | 5 | 34 | 212.49 | 178.71 | 145.14 |
| BTCUSD/D1 | Optimized | 5 | 42 | 292.86 | 249.49 | 206.39 |

### EURUSD/4H

Baseline در OOS زیان 46.85 واحدی داشت. انتخاب پارامتر train-only این زیان را به 231.05 واحد افزایش داد و تعداد معاملات را از 26 به 35 رساند. Cost Stress نیز زیان را بیشتر کرد. این شواهد، پارامترهای Stage 23 را برای EURUSD/4H رد می‌کند و نشان می‌دهد optimized در این sample portability ندارد.

### BTCUSD/D1

Baseline در OOS سود 212.49 واحدی داشت. optimized سود را به 292.86 رساند، اما تعداد معاملات از 34 به 42 افزایش یافت. در سناریوی adverse سود optimized به 206.39 کاهش یافت؛ بنابراین بخشی از برتری optimized با هزینه و turnover فرسوده می‌شود، هرچند در این آزمایش همچنان مثبت باقی می‌ماند.

برای BTCUSD کمیسیون در مدل فعلی صفر است. این فرض برای نتیجه‌گیری عملی کافی نیست و باید با commission واقعی صرافی، CFD یا broker و funding cost جایگزین شود.

## تصمیم پژوهشی

| case | تصمیم |
|---|---|
| EURUSD/4H | optimized رد شود؛ baseline نیز برای paper-forward عمومی کافی نیست. |
| BTCUSD/D1 | فقط به‌عنوان candidate پژوهشی مشروط نگه‌داری شود. |
| هر دو case | پیش از هر Paper-Forward، Cost Stress با مدل هزینهٔ منبع واقعی و بازهٔ مستقل لازم است. |

Stage 25 نشان می‌دهد optimized نباید به‌صورت global default در نرم‌افزار فعال شود. انتخاب پارامتر باید وابسته به نماد، تایم‌فریم و regime باقی بماند. حتی برای BTCUSD نیز سود مثبت به‌تنهایی کافی نیست؛ ثبات پارامترهای نزدیک، تعداد کافی معامله، و مدل هزینهٔ صحیح باید بررسی شود.

## محدودیت‌ها

داده‌های مورد استفاده عمومی و broker-match نشده‌اند. Cost Stress فعلی spread، slippage و commission را تغییر می‌دهد، اما funding، gap، نقدشوندگی، تعطیلی بازار و تفاوت quote provider را پوشش نمی‌دهد. تعداد foldها محدود است و confidence interval یا bootstrap در این مرحله محاسبه نشده است.

Walk-Forward baseline در این runner از همان strategy و AI mode مشخص استفاده می‌کند و در optimized فقط پارامترهای rule در train انتخاب می‌شوند. مقایسه برای تصمیم پژوهشی است و به‌عنوان برآورد عملکرد آینده تفسیر نمی‌شود.

## Artifact و بازتولید

Artifact کامل در مسیر `data/runs/stage25-independent-walk-forward.json` ثبت شده است. فرمان بازتولید:

```bash
npm run research:stage25:independent-wf
```

پیش از اجرا `npm run typecheck` موفق شد. در validation دامنه نیز ۲۴ suite و ۱۳۳ check بدون خطا اجرا شدند.

## References

[1]: https://github.com/hamedharami-hub/Tradewithhamed "مخزن پژوهشی Tradewithhamed"
[2]: https://github.com/hamedharami-hub/Tradewithhamed/blob/main/lib/research/walk-forward.ts "ارزیاب Walk-Forward"
[3]: https://github.com/hamedharami-hub/Tradewithhamed/blob/main/lib/research/parameter-optimizer.ts "موتور بهینه‌سازی پارامتر"
