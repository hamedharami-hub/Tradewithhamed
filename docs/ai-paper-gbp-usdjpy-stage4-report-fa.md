# گزارش اجرای AI چهارعاملی، Paper-Forward و عیب‌یابی GBPUSD/USDJPY

## خلاصهٔ اجرایی

چهار محور درخواست اجرا شد:

1. مسیر چهار نقش آفلاین روی candidateها فعال و قابل اجرا شد.
2. مقایسهٔ واقعی با حالت بدون AI روی دادهٔ GBPUSD و USDJPY انجام شد.
3. Worker محیط Paper-Forward لایو با منبع read-only cTrader ساخته شد؛ اما به‌دلیل نبودن credentials در محیط فعلی، fail-closed ماند و هیچ دادهٔ ساختگی را به‌عنوان live گزارش نکرد.
4. خطای اساسی PnL در USDJPY پیدا و اصلاح شد.

## چهار Agent

زنجیرهٔ اجرا به شکل زیر است:

| نقش | موتور فعلی | نوع |
|---|---|---|
| Scanner | `s0-deterministic-scanner` | قطعی و آفلاین |
| Analyst | `s0-rule-analyst` | قطعی و آفلاین |
| Critic | `deep-critic-strict` | قطعی و آفلاین |
| Judge | `strict-consensus-fail-closed` | قطعی و آفلاین |

Agentها روی candidateهایی اجرا شدند که ابتدا Rule Base آن‌ها را تولید کرده بود. بنابراین AI در این معماری **تولیدکنندهٔ سیگنال اولیه نیست؛ تأییدکننده، منتقد و veto‌کننده است**.

همچنین یک ناسازگاری پیدا شد: deterministic advisory حداقل RR برابر ۲٫۵ می‌خواست، اما Rule Engine با RR برابر ۲ کار می‌کرد. این باعث می‌شد همهٔ candidateها reject شوند. آستانه به ۲ اصلاح شد تا قرارداد Rule و AI یکسان باشد.

## مقایسهٔ AI با بدون AI

### GBPUSD، 1H، سال ۲۰۲۴

| معیار | بدون AI | چهار Agent آفلاین | تغییر |
|---|---:|---:|---:|
| Candidate بررسی‌شده | 66 | 66 | — |
| Candidate تأییدشده | — | 66 | — |
| معاملات | 61 | 61 | 0 |
| Win rate | 36.1% | 36.1% | 0 |
| Net PnL | -193.75 | -193.75 | 0 |
| Profit Factor | 0.83 | 0.83 | 0 |
| Max Drawdown | 2.78% | 2.78% | 0 |

### USDJPY، 1H، سال ۲۰۲۴، پس از اصلاح PnL

| معیار | بدون AI | چهار Agent آفلاین | تغییر |
|---|---:|---:|---:|
| Candidate بررسی‌شده | 58 | 58 | — |
| Candidate تأییدشده | — | 58 | — |
| معاملات | 51 | 51 | 0 |
| Win rate | 29.4% | 29.4% | 0 |
| Net PnL | -200.09 | -200.09 | 0 |
| Profit Factor | 0.78 | 0.78 | 0 |
| Max Drawdown | 3.53% | 3.53% | 0 |

### تفسیر نتیجهٔ AI

در وضعیت فعلی، چهار Agent deterministic تمام candidateهای معتبر را تأیید کردند؛ بنابراین **تأثیر اندازه‌گیری‌شدهٔ AI برابر صفر است**. این به معنی بی‌فایده‌بودن معماری نیست، بلکه نشان می‌دهد چهار نقش فعلی بیشتر یک validator سخت‌قید هستند و هنوز قدرت تفکیک کافی ندارند.

برای اینکه AI واقعاً روی نتیجه اثر بگذارد، مرحلهٔ بعد باید یکی از این موارد را اضافه کند:

- Analyst و Critic عصبی WebGPU با مدل واقعاً مقیم و verified در مرورگر؛
- promptهای نقش‌محور که از شواهد کافی استفاده کنند و صرفاً Rule Base را تکرار نکنند؛
- threshold مستقل برای confidence؛
- ثبت ablation جداگانهٔ Scanner، Analyst، Critic و Judge؛
- مقایسهٔ `OFF`، `DETERMINISTIC_COUNCIL` و `AGENTIC_OFFLINE` با candidateهای یکسان.

در Node و batch runner، مدل WebGPU مرورگر قابل اجرا نیست؛ بنابراین نتیجهٔ فعلی صادقانه فقط مربوط به **چهار نقش قطعی آفلاین** است، نه یک مدل زبانی عصبی واقعی.

## Paper-Forward زنده، بدون اجرای بروکری

Worker جدید در این مسیر ساخته شد:

```bash
npm run research:live-paper
```

ویژگی‌های ایمنی:

- منبع دادهٔ مورد انتظار: cTrader Demo به‌صورت read-only؛
- هیچ مسیر `submitOrder` یا broker write در worker وجود ندارد؛
- quoteها به کندل‌های بستهٔ یک‌دقیقه‌ای تبدیل می‌شوند؛
- فقط کندل بسته وارد Paper-Forward می‌شود؛
- برای candidateها مسیر چهار Agent فراخوانی می‌شود؛
- در صورت نبودن credentials، worker fail-closed می‌شود.

در اجرای واقعی فعلی، worker شروع نشد چون این متغیرها تنظیم نشده‌اند:

- `CTRADER_ACCESS_TOKEN`
- `CTRADER_ACCOUNT_ID`
- `CTRADER_CLIENT_ID`

این رفتار عمدی و ایمن است. فید فعلی داخل `live-market-feed.ts` که با Random Walk کار می‌کند **دادهٔ واقعی نیست** و به‌هیچ‌عنوان به‌عنوان live paper نتیجه‌گیری نشده است.

پس از تنظیم credentials، نمونهٔ اجرا:

```bash
CTRADER_ENVIRONMENT=demo \
PAPER_SYMBOLS=GBPUSD,USDJPY \
PAPER_TIMEFRAME=1M \
npm run research:live-paper
```

## تحلیل GBPUSD در سشن لندن و نیویورک

در Walk-Forward قبلی GBPUSD، بخش OOS بر اساس سشن چنین بود:

| سشن | معاملات | Net PnL | PF | Win rate |
|---|---:|---:|---:|---:|
| London | 22 | 263.26 | 1.99 | 54.5% |
| New York | 16 | 149.42 | 1.70 | 50.0% |
| Asia | 22 | -235.11 | 0.53 | 27.3% |
| Off-hours | 18 | -217.97 | 0.44 | 22.2% |

دلایل محتمل موفقیت نسبی London و New York:

1. **نقدشوندگی بیشتر:** اجرای stop و target در این سشن‌ها معمولاً با spread کمتر و رفتار منظم‌تر همراه است.
2. **هم‌پوشانی لندن و نیویورک:** ورود جریان نقدینگی آمریکا می‌تواند شکست ساختار و بازگشت به FVG را معتبرتر کند.
3. **کیفیت بهتر حرکت‌های directional:** Ruleهای BOS و Sweep/FVG در حرکت‌های جهت‌دار عملکرد مناسب‌تری از بازار کم‌حجم Asia دارند.
4. **هزینهٔ نسبی کمتر:** در Asia و Off-hours، spread و noise می‌توانند edge کوچک Rule را از بین ببرند.
5. **هشدار آماری:** این نتیجه هنوز اثبات علی نیست؛ تعداد معاملات محدود است و باید در dataset مستقل و Paper-Forward تکرار شود.

نتیجهٔ عملی: برای آزمایش بعدی GBPUSD، می‌توان یک variant با فیلتر London/New York ساخت، اما فقط در قالب ablation و بدون حذف دائمی سایر سشن‌ها.

## عیب‌یابی USDJPY

### مشکل اصلی

در PnL قبلی، اختلاف قیمت USDJPY مستقیماً در contract size ضرب می‌شد و به‌عنوان USD ثبت می‌شد؛ درحالی‌که نتیجهٔ این ضرب در JPY است. این باعث شد:

- سود و زیان تقریباً به‌اندازهٔ نرخ USDJPY بیش‌برآورد شود؛
- سود Train غیرواقعی بسیار بزرگ شود؛
- OOS زیان‌های چندبرابری و Max Drawdown بالاتر از ۱۰۰٪ تولید کند؛
- نتیجهٔ قبلی برای تصمیم‌گیری کاملاً نامعتبر باشد.

### اصلاح انجام‌شده

برای USDJPY اکنون:

```text
PnL USD = PnL JPY / USDJPY conversion price
```

این تبدیل در سه مسیر اعمال شد:

- realized PnL هنگام خروج؛
- cash settlement؛
- unrealized PnL در candle و quote updates.

همچنین پس از صفرشدن equity، سفارش جدید دیگر پذیرفته نمی‌شود.

### نتیجه پس از اصلاح

| معیار USDJPY | قبل از اصلاح | بعد از اصلاح |
|---|---:|---:|
| Net PnL | -24,481.80 | -200.09 |
| Max Drawdown | 276.4% | 3.53% |
| End Equity | -14,481.80 | 9,799.91 |
| Profit Factor | 0.82 | 0.78 |

نتیجهٔ بعد از اصلاح از نظر اندازهٔ ریسک منطقی‌تر است. بااین‌حال خود Rule در USDJPY هنوز سودآور نیست و PF برابر ۰٫۷۸ دارد؛ بنابراین اصلاح حسابداری به معنی اصلاح Strategy نیست.

## وضعیت نهایی

| بخش | وضعیت |
|---|---|
| چهار Agent روی candidateها | فعال و قابل اجرا |
| مقایسه با بدون AI | انجام شد |
| اثر فعلی Agent قطعی | صفر؛ همه candidateهای معتبر تأیید شدند |
| Paper-Forward بدون broker execution | Worker آماده و fail-closed |
| Paper-Forward با دادهٔ live واقعی | منتظر credentials cTrader |
| GBPUSD session analysis | انجام شد |
| USDJPY scaling/PnL | اصلاح شد |
| تست‌ها | ۱۹ suite، ۱۰۴ check، صفر خطا |

## فایل‌های خروجی

- مقایسه GBPUSD: `data/runs/agent-ablation/gbpusd-1h-2024-agent-vs-off-v2.json`
- مقایسه USDJPY: `data/runs/agent-ablation/usdjpy-1h-2024-agent-vs-off-v3.json`
- گزارش کامل Walk-Forward: `docs/stage3-walk-forward-oos-report-fa.md`
