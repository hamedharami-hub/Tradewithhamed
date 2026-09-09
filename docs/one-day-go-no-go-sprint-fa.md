# برنامه یک‌روزهٔ Go/No-Go برای تبدیل Prototype به پژوهش واقعی

**هدف روز:** در پایان یک روز کاری فشرده، یک زنجیرهٔ کوچک اما واقعی و قابل‌ممیزی برای **یک نماد، یک تایم‌فریم و یک فرضیهٔ معاملاتی** ساخته شود. خروجی روز باید تصمیم شفاف «ادامهٔ پروژه» یا «توقف/بازطراحی» باشد؛ نه یک ادعای زودهنگام دربارهٔ سودآوری یا آمادگی Live.

> **تصمیم معماری روز اول:** فقط `XAUUSD`، فقط دادهٔ تاریخی واقعی، فقط تایم‌فریم `5M`، فقط فرضیهٔ نسخه‌دار `S0 sweep + FVG`، و فقط paper broker داخلی مبتنی بر quote یا bar معتبر. EURUSD، BOS/CHoCH، order block، equilibrium، mean reversion، اتصال عملیاتی Demo و هر قابلیت Live از scope روز اول خارج هستند.

## چرا «همه‌چیز» در یک روز قابل حل نیست

مواردی مانند edge آماری، اعتبارسنجی چندرژیمی، paper trading واقعی، سازگاری cTrader Demo، و پایداری عملیاتی به **زمان مشاهدهٔ مستقل** نیاز دارند. برای نمونه، قاعدهٔ soak هفتادودوساعتهٔ Demo، دادهٔ تاریخی چندساله، و دورهٔ خارج‌نمونه را نمی‌توان با اجرای سریع جایگزین کرد. کوتاه‌کردن این مراحل فقط UI کامل‌تر و اطمینان کاذب تولید می‌کند.

با این حال، یک روز برای حل مهم‌ترین ابهام مناسب است: آیا پروژه می‌تواند روی دادهٔ واقعی، بدون نشت آینده و با هزینه‌های محافظه‌کارانه، یک فرضیهٔ دقیق را به‌صورت بازتولیدپذیر آزمایش کند؟ اگر پاسخ این پرسش منفی باشد، توقف پروژه یا تغییر بنیادی مسیر تصمیم درست و کم‌هزینه است.

## خروجی غیرقابل‌مذاکره در پایان روز

| خروجی | تعریف حداقلی قابل قبول |
|---|---|
| Dataset واقعی | دادهٔ XAUUSD با provider، نماد، timezone=UTC، بازه، row count، checksum SHA-256 کامل و گزارش کیفیت ثبت‌شده |
| Rulebook نسخه‌دار | تعریف دقیق و ماشینی sweep، FVG، entry، stop، target، expiry و cost model؛ بدون اصطلاح مبهم |
| Backtest قابل بازتولید | یک run با dataset hash، Git commit، config، seed، زمان اجرا و trace معامله ثبت‌شده |
| اجرای بدون نشت | سیگنال در close bar `t` ساخته و فقط از نخستین event مجاز `t+1` به بعد قابل fill باشد |
| هزینهٔ محافظه‌کارانه | buy=ask، sell=bid؛ commission، spread و slippage adverse در ورود و خروج ثبت شود |
| گزارش Go/No-Go | تعداد معاملات، expectancy خالص، drawdown bar-level، هزینه‌ها، شکست‌های data quality و وضعیت نتیجه: `INCONCLUSIVE`، `RESEARCH_CONTINUE` یا `STOP` |

## پیش‌نیازهای کاربر پیش از شروع

یک روز تنها زمانی نتیجه‌دار است که این موارد تا آغاز ساعت اول آماده باشند.

| مورد لازم | حداقل مورد قبول | علت |
|---|---|---|
| داده تاریخی | فایل raw معتبر XAUUSD 5M یا tick/bid-ask با حداقل ۶ تا ۱۲ ماه پوشش؛ یا مجوز استفاده از cTrader Demo/Open API برای دریافت آن | بدون دادهٔ واقعی، نتیجه فقط شبیه‌سازی است |
| مشخصات نماد | broker/provider، symbol code و symbol ID، digits، tick size، contract size، min/max/step lots، commission و swap | تبدیل قیمت و هزینه بدون symbol specification قابل اعتماد نیست |
| تقویم و زمان | تایید UTC و جلسه‌های معامله/holidayهای provider | جلوگیری از خطای DST، gap و session bias |
| تصمیم مدل هزینه | استفاده از spread واقعی bid/ask؛ در نبود آن، spread محافظه‌کارانهٔ مکتوب | جلوگیری از PnL خوش‌بینانه |
| محیط Demo، در صورت انتخاب | اطلاعات OAuth Demo و account ID با scope فقط Demo؛ هرگز Live credential نیست | فقط برای بررسی اتصال؛ نه شرط لازم برای بک‌تست روز اول |

اگر دادهٔ واقعی تا ساعت اول در دسترس نباشد، sprint باید همان‌جا به وضعیت **STOP / DATA MISSING** برود. جایگزین‌کردن fixture دستی یا random walk با دادهٔ واقعی ممنوع است.

## برنامهٔ یازده‌ساعتهٔ روز اول

زمان خالص برنامه **۱۱ ساعت** است. یک ساعت باقیمانده برای وقفه، incident، دریافت فایل و تصمیم نهایی نگه داشته می‌شود.

| بازه | مدت | کار اجرایی | معیار خروج |
|---|---:|---|---|
| 00:00–00:30 | ۳۰ دقیقه | Freeze تمام مسیرهای Paper/Demo/Live، برچسب‌گذاری UI با `SIMULATED / RESEARCH ONLY` و ثبت scope | هیچ مسیر سفارش یا گزارش محصول، آمادگی Demo/Live را القا نکند |
| 00:30–02:00 | ۹۰ دقیقه | واردکردن دادهٔ raw، catalog نماد و manifest immutable؛ SHA-256 کامل، row count، min/max timestamp، UTC و source metadata | Dataset v1 ساخته شود یا sprint با `DATA MISSING` متوقف گردد |
| 02:00–04:00 | ۱۲۰ دقیقه | data-quality gate: OHLC، monotonicity، duplicate، seconds/ms، gap، partial bar، bid≤ask و quality report | هیچ bar نامعتبر وارد بک‌تست نشود؛ تمام rejectها trace داشته باشند |
| 04:00–06:00 | ۱۲۰ دقیقه | ساخت execution canonical: event-time، rule `eligible_from > signal_time`، fill side-aware، spread/commission/slippage، stop/target و gap policy | golden-fill testهای buy/sell، same-bar، gap و simultaneous SL/TP PASS شوند |
| 06:00–07:30 | ۹۰ دقیقه | پیاده‌سازی یک detector sweep و یک detector FVG نسخه‌دار؛ اتصال evidence chain و S0 محدود | حداقل fixtureهای مثبت/منفی/مرزی و یک integration test با order غیرتهی وجود داشته باشد |
| 07:30–09:00 | ۹۰ دقیقه | اجرای backtest frozen روی XAUUSD؛ split زمان‌مند ساده train/validation/holdout، بدون optimization گسترده | run manifest و trace کامل signal→order→fill→exit ساخته شود |
| 09:00–10:00 | ۶۰ دقیقه | آزمون sensitivity: هزینهٔ پایه، spread گسترده، slippage adverse و invalid-data block | افزایش هزینه نباید بدون توضیح trace سود خالص را بهتر کند |
| 10:00–11:00 | ۶۰ دقیقه | گزارش نهایی، بازبینی کد، typecheck/lint/test/build، و memo مستقل Go/No-Go | یک artifact بازتولیدپذیر و تصمیم صریح تولید شود |

## تعریف دقیق فرضیهٔ روز اول

روز اول اجازهٔ بازکردن search space ندارد. پارامترها باید پیش از مشاهدهٔ نتیجه freeze شوند.

| جزء | قانون روز اول |
|---|---|
| swing | pivot تأییدشدهٔ ۲ چپ و ۲ راست، فقط پس از بسته‌شدن دو bar سمت راست |
| sell-side sweep | `low[t] < swingLow - penetration` و close bar `t` دوباره بالای swingLow باشد |
| buy-side sweep | قرینهٔ sell-side sweep |
| penetration | `max(1 pip, 0.10 × ATR(14))` |
| bullish FVG | `high[t-2] < low[t]` و اندازهٔ gap حداقل `0.30 × ATR(14)` پس از close bar `t` |
| bearish FVG | قرینهٔ bullish FVG |
| entry | فقط از event بعدی، نه candle سازندهٔ signal؛ در نسخه روز اول marketable limit یا market-on-next-eligible quote با policy واضح |
| stop | extreme sweep به‌علاوه buffer ثابت/ATR نسخه‌دار |
| target | حداقل R:R ثابت و از پیش تصویب‌شده؛ بدون تغییر پس از دیدن نتایج |
| expiry | اگر order تا تعداد bar ثابت پر نشد، cancel شود |
| ممنوعیت | خبر، AI، BOS/OB، mean reversion، optimization و انتخاب پسینی session در روز اول وارد rule نمی‌شوند |

> این قوانین «اثبات edge» نیستند. فقط یک قرارداد حداقلی و بازتولیدپذیر برای حذف ابهام و امکان آزمون هستند.

## دو مسیر عملی برای داده و اجرا

| رویکرد | آنچه در یک روز به‌دست می‌آید | trade-off | هزینه | پیچیدگی |
|---|---|---|---:|---:|
| **A. دادهٔ واقعی + paper broker داخلی — توصیه‌شده** | backtest معتبرتر، execution یکپارچه، گزارش Go/No-Go در همان روز | Demo broker واقعی را اثبات نمی‌کند؛ به فایل داده یا دادهٔ مجاز نیاز دارد | کم تا متوسط، بسته به provider | متوسط |
| **B. اتصال سریع cTrader Demo** | بررسی OAuth، WebSocket و یک چرخهٔ سفارش Demo | داده/بک‌تست/edge را اثبات نمی‌کند؛ خطر گیرکردن در protocol و credential وجود دارد | وابسته به account و provider | بالا |

**تصمیم پیشنهادی:** مسیر A انتخاب شود. مسیر B تنها بعد از عبور data gate و canonical execution ارزش دارد. اتصال سریع Demo در روز اول ممکن است زمان را صرف credential، account mapping و protocol کند، در حالی که هنوز معلوم نیست استراتژی روی دادهٔ معتبر حتی قابل پژوهش هست یا نه.

## معیار تصمیم پایان روز

| وضعیت | معنی | تصمیم بعدی |
|---|---|---|
| `STOP / DATA MISSING` | داده یا specification قابل‌اعتماد به‌دست نیامده است | پروژه برای کار معاملاتی متوقف؛ فقط UI آموزشی باقی بماند |
| `STOP / ENGINE INVALID` | same-bar leakage، fill غیرواقعی، عدم بازتولید، یا data-quality failure باقی مانده است | ابتدا اصلاح موتور؛ هیچ توسعهٔ strategy یا Demo انجام نشود |
| `INCONCLUSIVE` | engine و داده سالم‌اند اما نمونه معامله ناکافی، نتیجه OOS ضعیف یا CI بسیار وسیع است | پروژه فقط به‌عنوان research ادامه یابد؛ strategy و Paper غیرعملیاتی بمانند |
| `RESEARCH_CONTINUE` | engine سالم، manifest کامل، هزینه‌ها محافظه‌کار، OOS اولیه منفی نیست و کیفیت نمونه کافی‌تر است | ورود به sprint بعدی برای walk-forward، detectorهای بیشتر و paper broker داخلی |

هیچ نتیجهٔ یک‌روزه نباید `GO LIVE` تولید کند. حتی در بهترین حالت، نتیجه فقط `RESEARCH_CONTINUE` است.

## مواردی که عمداً به روزهای بعد منتقل می‌شوند

اتصال cTrader Demo واقعی، BOS/CHoCH/order block، equilibrium، mean reversion، چندنمادی، tick-level broker calibration، walk-forward چندfold، PBO/CSCV، paper trading طولانی‌مدت، reconciliation مالی و soak test هفتادودوساعته، همگی کارهای ضروری‌اند اما نمی‌توانند با یک روز فشرده معتبر شوند. این موارد پس از آن انجام می‌شوند که روز اول ثابت کند داده و هستهٔ execution قابلیت ادامه دادن دارند.

## نتیجه

راه درست برای داشتن «پاسخ ابتدایی» این نیست که همهٔ قابلیت‌ها را هم‌زمان اضافه کنیم. راه درست، کاهش دامنه تا یک آزمایش واقعی است که بتواند شکست بخورد. اگر XAUUSD، یک rule frozen و یک execution model محافظه‌کارانه در دادهٔ واقعی حتی به مرحلهٔ `RESEARCH_CONTINUE` نرسند، هزینهٔ ادامه‌دادن پروژه بدون تغییر بنیادی توجیه ندارد.

## References

[1]: https://help.ctrader.com/open-api/symbol-data/ "cTrader Open API: Attain symbol data"

[2]: https://help.ctrader.com/open-api/ "cTrader Open API: Getting started"

[3]: https://help.ctrader.com/open-api/proxies-endpoints/ "cTrader Open API: Proxies and endpoints"

[4]: https://escholarship.org/uc/item/4w1110bb "The probability of backtest overfitting"

[5]: https://www.youtube.com/watch?v=sjq3toGtr0U "3 Backtesting Pitfalls That Ruin Your Trading Strategy"

[6]: https://handbook.fca.org.uk/handbook/COBS/22/5.html "FCA Handbook COBS 22.5: Restrictions on CFDs and other speculative investments"
