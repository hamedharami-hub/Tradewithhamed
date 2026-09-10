# گزارش Stage 23: بهینه‌سازی پارامتر و Walk-Forward

## جمع‌بندی اجرایی

در Stage 23 یک مسیر پژوهشی صریح برای بهینه‌سازی `RuleParameters` و انتخاب پارامتر در هر fold از Walk-Forward پیاده‌سازی شد. این مسیر فقط روی دادهٔ train هر fold اجرا می‌شود و پارامتر منتخب را پیش از اجرای OOS به پیکربندی آزمون منتقل می‌کند. هیچ مسیر live trading، broker write یا دسترسی نوشتاری به cTrader در این تغییرات اضافه نشده است.

نتیجهٔ benchmark محدود روی GBPUSD/4H نشان داد که اجرای فنی سالم است، اما پایداری اقتصادی هنوز اثبات نشده است. از سه fold، یک fold نتیجهٔ OOS مثبت و دو fold نتیجهٔ OOS منفی داشتند. بنابراین این خروجی برای ادامهٔ تحقیق مناسب است، نه برای نتیجه‌گیری سودآوری یا فعال‌سازی معامله.

## تغییرات فنی

| بخش | تغییر | کنترل پژوهشی |
|---|---|---|
| قرارداد experiment | افزودن `ruleParameters?: Partial<RuleParameters>` | پارامترها در config صریح و قابل ثبت هستند. |
| موتور experiment | عبور دادن پارامترهای config به `evaluateResearchStrategy` | پارامترهای optimizer در همهٔ signalها یکسان اعمال می‌شوند. |
| optimizer | افزودن `ParameterOptimizer` با روش‌های GRID و RANDOM | روش random با seed تکرارپذیر است و سقف ارزیابی دارد. |
| امتیازدهی | پشتیبانی از Net Profit، Expectancy، Profit Factor و Calmar-like | حداقل تعداد معامله قبل از انتخاب اعمال می‌شود. |
| Walk-Forward | اجرای optimizer روی train هر fold و انتقال best به OOS | OOS در زمان انتخاب پارامتر دیده نمی‌شود. |
| رابط کاربری | افزودن کنترل فارسی `Optimize + WF` و جدول foldها | پارامتر انتخابی، Train PnL و OOS PnL قابل مشاهده است. |
| validation | افزودن suite مستقل و runner benchmark محدود | مسیر optimizer بدون benchmark سنگین قابل تست است. |

## منطق جلوگیری از نگاه به آینده

در هر fold، داده به سه ناحیه تقسیم می‌شود: train، فاصلهٔ purge و OOS. optimizer فقط `trainData` را دریافت می‌کند. خروجی `best.parameters` سپس در config اجرای OOS قرار می‌گیرد. `evaluationStartTime` نیز شروع OOS را مشخص می‌کند؛ بنابراین کندل‌های قبل از آن فقط برای warmup و محاسبهٔ شاخص‌های تاریخی در دسترس موتور هستند و معاملهٔ ارزیابی‌شده پیش از مرز OOS ثبت نمی‌شود.

در اجرای signal، کانال Donchian از تاریخچهٔ قبل از کندل جاری ساخته می‌شود و موتور اجرای سفارش را در کندل بعدی شبیه‌سازی می‌کند. این قرارداد با الزامات قبلی پروژه دربارهٔ next-candle fill، slippage بدبینانه و commission model حفظ شده است.

## benchmark محدود GBPUSD/4H

| شاخص | مقدار |
|---|---:|
| تعداد کندل | ۱٬۶۱۵ |
| روش | Grid |
| تعداد حالت‌های ارزیابی | ۸ |
| نماد و تایم‌فریم | GBPUSD / 4H |
| strategy | `TREND_BREAKOUT_55_EMA200_V1` |
| AI mode | `OFF` |
| تعداد fold | ۳ |
| تعداد معاملات OOS | ۲۹ |

| Fold | پارامتر منتخب train | Train PnL | OOS PnL | معاملات OOS |
|---:|---|---:|---:|---:|
| ۱ | Channel 34، EMA 200، SL 2، TP 3 | 4.56 | -33.58 | 11 |
| ۲ | Channel 34، EMA 200، SL 1.5، TP 4 | 159.18 | 202.76 | 9 |
| ۳ | Channel 34، EMA 200، SL 1.5، TP 4 | 361.20 | -54.83 | 9 |

این benchmark نشان می‌دهد که موتور توانسته است پارامتر را از train انتخاب و به OOS منتقل کند، اما اختلاف train و OOS در fold سوم و زیان fold اول نشانهٔ ریسک overfitting و ناپایداری regime است. از این داده نمی‌توان نتیجه گرفت که Channel 34 بهتر از Channel 55 است؛ فضای جست‌وجو محدود بوده و مقایسهٔ آن با baseline و دوره‌های مستقل بیشتری لازم است.

## تست‌ها و build

در validation دامنه، ۲۴ suite و ۱۳۳ check با موفقیت اجرا شدند. suite جدید سه مورد را کنترل می‌کند: کامل بودن Cartesian product در grid، تکرارپذیری random search با seed یکسان و محدود شدن optimizer به کندل‌های train.

`npm run typecheck` موفق شد. build تولیدی نیز compilation، TypeScript، جمع‌آوری page data و تولید صفحات static را با موفقیت پشت سر گذاشت؛ artifact نهایی build پس از پایان مرحلهٔ trace در همان workspace تولید می‌شود.

## محدودیت‌های باقی‌مانده

پیاده‌سازی فعلی در هر اجرای Walk-Forward optimizer را برای یک variant و یک AI mode مشخص اجرا می‌کند. انتخاب چند variant همچنان در baseline انجام می‌شود، اما برای مقایسهٔ منصفانهٔ کامل باید در مرحلهٔ بعد برای هر variant فضای پارامتر مستقل و بودجهٔ محاسباتی مستقل تعریف شود.

Calmar-like در این مرحله یک امتیاز پژوهشی ساده بر مبنای `netProfit / maxDrawdownPercent` است و جایگزین معیارهای سالانه‌سازی‌شده، confidence interval، bootstrap و آزمون واقع‌گرایی هزینه نیست. حداقل تعداد معامله نیز فقط یک guard انتخاب است و تضمین معناداری آماری محسوب نمی‌شود.

UI فعلی اجرای تعاملی را عمداً به grid هشت‌حالته محدود کرده است تا مرورگر قفل نشود. اجرای جست‌وجوی بزرگ باید خارج از مسیر تعاملی، با artifact قابل بازتولید و سقف زمان و حافظه انجام شود.

## وضعیت تحویل

Artifact benchmark در مسیر `data/runs/stage23-limited-gbpusd-4h.json` ثبت شده است. runner آن با فرمان `npm run research:stage23:limited` قابل تکرار است. هیچ benchmark سنگین یا paper/live process جدیدی در این مرحله اجرا نشده است.

## References

[1]: https://github.com/hamedharami-hub/Tradewithhamed "مخزن پژوهشی Tradewithhamed"
[2]: https://github.com/hamedharami-hub/Tradewithhamed/blob/main/lib/research/parameter-optimizer.ts "موتور بهینه‌سازی پارامتر"
[3]: https://github.com/hamedharami-hub/Tradewithhamed/blob/main/lib/research/walk-forward.ts "ارزیاب Walk-Forward"
