# Stage 14: شورای AI آفلاین برای GBPUSD/4H

## دامنه

این مرحله روی یک candidate ثابت از روش `TREND_BREAKOUT_55_EMA200_V1` در `GBPUSD/4H` اجرا شد. هدف، مقایسهٔ مجوز advisory شورای AI با کنترل‌های قطعی بود؛ AI اجازهٔ تغییر پارامتر، ساخت candidate جدید یا اجرای broker ندارد.

## نتایج smoke

| حالت | نتیجه |
|---|---|
| candidate معتبر با evidence و RR=2 | `PAPER_TRADE` advisory-only |
| candidate بدون evidence | `NO_TRADE` و fail-closed |
| broker write | اجرا نشد |
| live trading | اجرا نشد |
| AI آنلاین | استفاده نشد |

شورای موجود شامل نقش‌های Scanner، Analyst، Critic و Judge است. Judge در صورت اختلاف، evidence ناقص، خروجی نامعتبر یا ریسک سخت، تصمیم را رد می‌کند. در این اجرا engineهای قطعی/آفلاین استفاده شدند و مدل WebGPU مقیم لازم نبود.

## اعتبارسنجی

`typecheck` موفق شد. Domain smoke با ۲۳ suite، ۱۳۰ check و صفر failure موفق شد. تست‌های agentic review، offline AI safety، gateway read-only و paper-forward ledger نیز موفق بودند.

## تفسیر

این مرحله سلامت معماری AI و fail-closed را تأیید می‌کند، اما هنوز مقایسهٔ آماری AI روی تمام معاملات تاریخی نیست. برای چنین مقایسه‌ای باید candidateهای هر کندل با evidence کامل تولید و قبل از اجرای دوبارهٔ engine، از فیلتر AI آفلاین عبور داده شوند. این کار مرحلهٔ جداگانه و پرهزینه‌تری است و فقط در صورت نیاز تصمیم‌گیری انجام می‌شود.

## مراحل باقی‌مانده تا Paper-Forward محلی

با فرض ادامهٔ مسیر فقط‌خواندنی، **۳ مرحلهٔ اصلی** باقی مانده است:

1. مقایسهٔ معامله‌به‌معاملهٔ AI OFF و AI آفلاین روی candidateهای تاریخی ثابت GBPUSD/4H؛
2. تعیین معیار پذیرش و ثبت تصمیم نهایی candidate پس از مقایسه؛
3. اجرای Paper-Forward محلی read-only و گزارش‌گیری، بدون broker write.

پس از این سه مرحله، فقط در صورت داشتن credential و تأیید جداگانهٔ محیط Demo می‌توان Gate دادهٔ broker-match را بررسی کرد؛ آن Gate برای ادامهٔ پژوهش اجباری نیست و Live Trading خارج از دامنهٔ فعلی است.
