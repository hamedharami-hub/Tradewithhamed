# گزارش Stage 24: Robustness، Portability و Cost Stress

## جمع‌بندی اجرایی

در Stage 24 پارامتر منتخب Stage 23 بدون بهینه‌سازی مجدد روی چهار case مستقل آزمایش شد: EURUSD/4H، GBPUSD/4H، USDJPY/4H و BTCUSD/D1. برای هر case دو نسخه با سه سناریوی هزینه اجرا شد: baseline با پارامترهای پیش‌فرض و optimized با پارامترهای منتقل‌شدهٔ Stage 23.

نتیجه نشان می‌دهد پارامترهای منتقل‌شده روی GBPUSD/4H و USDJPY/4H در این sample بهتر از baseline بوده‌اند، اما روی EURUSD/4H بدتر شده‌اند. روی BTCUSD/D1 سود خالص optimized در سناریوی پایه بالاتر است، ولی تعداد معاملات و افت سرمایه نیز افزایش یافته و Profit Factor کاهش یافته است. این الگو به معنی edge عمومی نیست؛ بلکه نشان می‌دهد **انتقال پارامتر بین نمادها به تأیید مستقل نیاز دارد**.

هیچ live trading، broker write یا cTrader write در این مرحله اجرا نشد.

## طراحی آزمایش

| مؤلفه | مقدار |
|---|---|
| strategy | `TREND_BREAKOUT_55_EMA200_V1` |
| AI mode | `OFF` |
| نسخهٔ baseline | `DEFAULT_RULE_PARAMETERS` |
| نسخهٔ optimized | Channel 34، EMA 200، SL 1.5 ATR، TP 4 ATR |
| سناریوها | BASE، STRESSED، ADVERSE |
| نمادها | EURUSD، GBPUSD، USDJPY، BTCUSD |
| تایم‌فریم‌ها | 4H برای ارزها، D1 برای BTCUSD |
| تعداد خروجی‌ها | ۲۴ گزارش |

پارامترهای optimized از Stage 23 روی GBPUSD/4H منتقل شده‌اند. آن‌ها در Stage 24 برای هر نماد دوباره انتخاب نشده‌اند؛ بنابراین این آزمایش portability و sensitivity است، نه Walk-Forward اختصاصی هر نماد.

## نتایج سناریوی BASE

| نماد / تایم‌فریم | نسخه | معاملات | Net Profit | PF | Max DD |
|---|---|---:|---:|---:|---:|
| EURUSD/4H | Baseline | 39 | -157.48 | 0.76 | 1.96% |
| EURUSD/4H | Optimized | 50 | -292.96 | 0.70 | 3.75% |
| GBPUSD/4H | Baseline | 40 | 78.48 | 1.14 | 2.36% |
| GBPUSD/4H | Optimized | 45 | 246.44 | 1.35 | 1.36% |
| USDJPY/4H | Baseline | 41 | 296.56 | 1.62 | 1.77% |
| USDJPY/4H | Optimized | 47 | 400.00 | 1.59 | 1.60% |
| BTCUSD/D1 | Baseline | 65 | 767.09 | 2.21 | 1.33% |
| BTCUSD/D1 | Optimized | 83 | 921.34 | 1.86 | 2.00% |

EURUSD هر دو نسخه در سناریوی پایه زیان‌ده هستند و نسخهٔ optimized زیان و افت سرمایهٔ بیشتری دارد. GBPUSD بهترین بهبود هم‌زمان در سود و Profit Factor را نشان می‌دهد. USDJPY سود بالاتری دارد، اما Profit Factor کمی پایین‌تر است؛ بنابراین افزایش سود ناشی از افزایش تعداد معاملات است و به‌تنهایی برتری کیفیت را ثابت نمی‌کند. BTCUSD سود خالص بالاتر دارد، ولی کاهش Profit Factor و افزایش Max Drawdown هشدار می‌دهد که سود بیشتر با exposure بیشتر به‌دست آمده است.

## Cost Stress

سناریوی `STRESSED` اسپرد دو برابر، slippage برابر 0.4 pip و commission دو برابر را اعمال می‌کند. سناریوی `ADVERSE` اسپرد سه برابر، slippage برابر 0.5 pip و commission معادل 1.5 برابر را اعمال می‌کند.

| نماد / نسخه | BASE PnL | STRESSED PnL | ADVERSE PnL | نتیجهٔ کیفی |
|---|---:|---:|---:|---|
| EURUSD Baseline | -157.48 | -194.92 | -209.48 | از ابتدا شکننده و زیان‌ده |
| EURUSD Optimized | -292.96 | -359.02 | -384.71 | انتقال پارامتر نامناسب در این sample |
| GBPUSD Baseline | 78.48 | 42.84 | 25.02 | سود با هزینهٔ بالا تقریباً فرسوده می‌شود |
| GBPUSD Optimized | 246.44 | 192.32 | 165.26 | نسبتاً مقاوم‌تر، اما نه اثبات‌شده |
| USDJPY Baseline | 296.56 | 274.44 | 267.38 | افت هزینه‌ای محدودتر در این sample |
| USDJPY Optimized | 400.00 | 364.15 | 352.73 | مقاوم در این سناریوها، با PF کاهشی |
| BTCUSD Baseline | 767.09 | 592.21 | 418.05 | حساس به slippage و turnover |
| BTCUSD Optimized | 921.34 | 657.70 | 395.20 | در adverse عملاً برتری حذف می‌شود |

در این مدل، BTCUSD کمیسیون صفر دارد؛ بنابراین نتیجهٔ آن به فرض هزینهٔ داده‌شده و slippage حساس است و نباید به broker واقعی تعمیم داده شود. برای BTCUSD به مدل هزینهٔ اختصاصی شامل spread واقعی، commission صرافی یا CFD و funding نیاز است.

## تفسیر و تصمیم پژوهشی

پارامترهای Stage 23 فعلاً نباید به‌صورت global default جایگزین شوند. شواهد فعلی از یک استفادهٔ محدودتر پشتیبانی می‌کند: پارامترها می‌توانند به‌عنوان candidate پژوهشی در GBPUSD/4H و USDJPY/4H بررسی شوند، اما برای EURUSD رد شده‌اند و برای BTCUSD نیازمند مدل هزینه و Walk-Forward اختصاصی هستند.

نتیجهٔ Stage 24 برای فعال‌سازی paper-forward عمومی کافی نیست. شرط مناسب برای گام بعدی، اجرای Walk-Forward اختصاصی هر نماد با انتخاب train-only، Cost Stress در OOS و حداقل تعداد معاملات مستقل است. سپس باید stability را در چند بازهٔ زمانی و با پارامترهای نزدیک به هم بررسی کرد، نه فقط بهترین نقطهٔ grid را.

## محدودیت‌ها

داده‌ها عمومی و broker-match نشده‌اند. Cost Stress فقط spread، slippage و commission را تغییر می‌دهد و اثر اخبار، gap، نقدشوندگی، funding و تفاوت quote provider را مدل نمی‌کند. همچنین این ماتریس در هر case از کل بازه استفاده می‌کند و جایگزین Walk-Forward کامل نیست.

مقایسهٔ optimized با baseline در Stage 24، آزمون portability است. بهینه‌سازی مستقل برای EURUSD، USDJPY و BTCUSD عمداً در این مرحله انجام نشد تا دادهٔ OOS برای انتخاب دوباره مصرف نشود.

## Artifact و بازتولید

Artifact ماتریس در مسیر `data/runs/stage24-robustness-matrix.json` ثبت شده است. اجرای آن با فرمان زیر انجام می‌شود:

```bash
npm run research:stage24:robustness
```

تایپ‌چک پیش از اجرا موفق شد و runner تعداد ۲۴ گزارش را تولید کرد.

## References

[1]: https://github.com/hamedharami-hub/Tradewithhamed "مخزن پژوهشی Tradewithhamed"
[2]: https://github.com/hamedharami-hub/Tradewithhamed/blob/main/lib/research/parameter-optimizer.ts "موتور بهینه‌سازی پارامتر"
[3]: https://github.com/hamedharami-hub/Tradewithhamed/blob/main/lib/research/experiment-engine.ts "موتور اجرای آزمایش پژوهشی"
