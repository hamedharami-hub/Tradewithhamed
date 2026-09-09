# مرحلهٔ چهارم: مقایسهٔ سه حالت روی GBPUSD

## داده و روش

- نماد: GBPUSD
- تایم‌فریم: 1H
- Dataset: HistData aggregated 2024
- سشن‌های مجاز: London و New York بر اساس UTC
- Strategy: `S0_SWEEP_FVG`
- سرمایهٔ اولیه: 10,000
- هزینه‌ها: همان cost model مشترک پروژه
- مقایسه: candidate و دادهٔ یکسان در هر حالت

## نتایج اجراشده

| معیار | OFF | DETERMINISTIC_COUNCIL | تغییر شورای قطعی نسبت به OFF |
|---|---:|---:|---:|
| Signals | 39 | 39 | 0 |
| Submitted orders | 39 | 30 | -9 |
| معاملات بسته | 39 | 30 | -9 |
| Win rate | 41.0% | 53.3% | +12.3pp |
| Net PnL | 51.22 | 282.70 | +231.48 |
| Profit Factor | 1.08 | 1.68 | +0.60 |
| Expectancy | 1.31 | 9.42 | +8.11 |
| Max Drawdown | 1.66% | 0.87% | -0.79pp |

شورای قطعی ۹ معامله را فیلتر کرده و در این نمونهٔ تاریخی نتیجهٔ بهتری داده است. این نتیجه هنوز اثبات edge پایدار نیست، چون یک نماد، یک سال و یک Rule بررسی شده است و باید با Walk-Forward مستقل تکرار شود.

## HYBRID_WEBGPU

حالت `HYBRID_WEBGPU` در batch اجرا نشد. این تصمیم عمدی است؛ چون WebGPU فقط وقتی معتبر است که:

1. مرورگر دارای WebGPU باشد؛
2. مدل در WebLLM registry پشتیبانی شود؛
3. artifact مدل در CacheStorage دانلود شده باشد؛
4. مدل در VRAM resident باشد؛
5. مدل در حالت قطع شبکه offline-verified شده باشد؛
6. trace خروجی شامل `source=WEBLLM_WEBGPU` و `residentModelId` باشد.

اجرای batch بدون این شرایط، نتیجه‌ای مصنوعی تولید می‌کرد. بنابراین برای HYBRID فعلاً وضعیت `NOT_EXECUTED_IN_BATCH` ثبت شده است، نه صفر و نه نتیجهٔ حدسی.

## اجرای واقعی Hybrid در مرورگر

در مرورگر باید Analyst و Critic به مدل عصبی انتخاب‌شده متصل شوند، درحالی‌که Scanner و Judge قطعی باقی بمانند. سپس candidateهای یکسان با evidence packet یکسان وارد هر سه حالت شوند:

- OFF
- DETERMINISTIC_COUNCIL
- HYBRID_WEBGPU

برای هر candidate باید این موارد ذخیره شود:

- مدل و revision؛
- confidence Analyst؛
- confidence Critic؛
- risk flags؛
- evidence IDs؛
- latency؛
- Judge decision؛
- verdict نهایی.

## نتیجهٔ فعلی

در این مرحله، تنها مقایسهٔ معتبر اجراشده OFF در برابر شورای قطعی است. شورای قطعی در این نمونه بهتر بود، اما این بهبود هنوز باید در OOS، چند سال، چند نماد و Paper-Forward تأیید شود. مقایسهٔ واقعی مدل عصبی، مرحلهٔ بعدی و وابسته به اجرای مرورگر با مدل resident است.
