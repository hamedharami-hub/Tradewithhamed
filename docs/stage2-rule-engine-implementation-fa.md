# اجرای مرحلهٔ دوم: Rule Base و Strategy Engine

## وضعیت

مرحلهٔ دوم از نظر کد اجرایی و validation تکمیل شد. Ruleهای قبلی audit شدند، سه variant جدید اضافه شد و یک bug مهم در position sizing نماد USDJPY کشف و اصلاح شد.

## Ruleهای فعال

| Variant | منطق |
|---|---|
| `S0_SWEEP_ONLY` | sweep نقدینگی روی swing تاییدشده و reclaim |
| `S0_SWEEP_FVG` | sweep به‌همراه FVG معتبر |
| `BOS_ORDER_BLOCK_V1` | شکست بسته‌شدن از swing تاییدشده، با order-block قبلی و stop محافظتی |
| `FVG_EQUILIBRIUM_V1` | تشکیل FVG در گذشته و بازگشت کندل جدید به midpoint/equilibrium |
| `MEAN_REVERSION_V1` | z-score بازگشت به میانگین با آمار فقط از کندل‌های پیشین |

## کنترل‌های صحت

- Swing فقط بعد از دو کندل confirmation استفاده می‌شود.
- Candidate در همان کندل بسته‌شدهٔ trigger ساخته می‌شود.
- اجرای سفارش از کندل بعدی شروع می‌شود.
- FVG Equilibrium فقط FVGهایی را استفاده می‌کند که قبل از trigger تشکیل شده‌اند.
- BOS فقط در اولین عبور از سطح بررسی می‌شود و روی هر کندل تکرار نمی‌شود.
- evidence ID برای sweep، swing، BOS و FVG ثبت می‌شود.
- candidate فاقد risk مثبت تولید نمی‌شود.
- rule version در شناسه و rationale ثبت می‌شود.

## اصلاح مهم USDJPY

در نسخهٔ قبلی، SymbolId فقط EURUSD و XAUUSD داشت. همچنین position sizing فرض می‌کرد quote currency همیشه USD است. نتیجه برای USDJPY این بود که حجم سفارش به صفر round می‌شد و backtest به‌صورت اشتباه `NO_TRADES` گزارش می‌کرد.

اکنون:

- GBPUSD و USDJPY به SymbolId و SYMBOL_SPECS اضافه شده‌اند.
- برای USDJPY، ریسک JPY با قیمت ورود به account USD تبدیل می‌شود.
- بعد از اصلاح، بک‌تست USDJPY به‌جای صفر معامله، معاملات واقعی و قابل بررسی تولید کرد.

## نتایج اولیهٔ 1H سال ۲۰۲۴

این نتایج فقط baseline هستند و به‌هیچ‌وجه اثبات سودآوری نیستند:

- EURUSD: S0 + FVG با فیلتر قطعی حدود `+213.85` و profit factor حدود `1.30` داشت.
- GBPUSD: S0 + FVG با فیلتر قطعی حدود `+37.73` و profit factor حدود `1.04` داشت.
- XAUUSD: BOS/Order Block بدون AI حدود `+188.37` و با فیلتر قطعی حدود `+164.97` داشت.
- USDJPY پس از اصلاح position sizing دوباره معاملات معتبر تولید کرد؛ در نسخهٔ قبلی صفر معامله به دلیل bug حجم بود، نه نبود سیگنال.

در بخش بزرگی از ترکیب‌های 5M، نتایج منفی بودند. این موضوع مفید است، چون نشان می‌دهد سیستم اکنون به‌جای تولید ادعاهای مبهم، واقعاً ضعف سبک‌ها را نشان می‌دهد. قبل از هر Paper-Forward باید cost model، spread broker و holdout بررسی شود.

## Validation

- TypeScript: موفق
- ESLint: موفق
- Domain suites: موفق
- تعداد suiteها: ۱۸
- تعداد checkها: ۱۰۱
- failure: صفر

## نتیجهٔ حرفه‌ای

Rule Base اکنون از نظر ساختار برای ورود به مرحلهٔ سوم آماده است، اما نتیجهٔ baseline فعلی نشان می‌دهد هیچ سبک نباید به‌صورت پیش‌فرض فعال و سودآور فرض شود. مرحلهٔ بعد باید روی walk-forward، holdout، هزینهٔ واقعی و segment analysis متمرکز شود.
