# گزارش ممیزی عمیقِ روش‌های معاملاتی و معماری AI

**پروژه:** Tradewithhamed
**مخاطب:** مالک پروژه
**نوع بررسی:** ممیزی ایستا و مبتنی بر شواهدِ طراحی، پیاده‌سازی و آمادگی پژوهشی
**نسخهٔ مخزنِ مشاهده‌شده:** `9338c8f`
**تاریخ گزارش:** ۱۰ سپتامبر ۲۰۲۶
**دامنه:** کد تغییر نکرده است؛ هیچ بک‌تست، benchmark، اتصال زنده یا آزمایش سودآوری در این ممیزی اجرا نشده است.

> **نتیجهٔ اجرایی:** Tradewithhamed در وضعیت فعلی برای **تولید فرضیه، replay محلی، تحلیل OHLCV و ثبت Paper Ticket با نظارت انسانی** قابل استفاده است؛ اما برای معاملهٔ زنده، ادعای مزیت آماری، شبیه‌سازی واقع‌گرایانهٔ سفارش passive/limit، یا تصمیم‌گیری دربارهٔ BTCUSD **آماده نیست**. روش‌های trend، mean reversion، S0/SMC و swing باید صرفاً «کاندیدای پژوهشی» باشند. معماری AI نیز باید به لایهٔ advisoryِ مقید به شواهد تنزل نام‌گذاری شود، نه منبع alpha یا مجوز معامله.

## نتیجهٔ اجرایی و تصمیم مالک

تصمیم عملی پیشنهادی برای پروژه، **ادامهٔ توسعهٔ پژوهشی بدون Live Trading** است. عناصر مفید فعلی—محاسبهٔ ATR ویلدر، سیگنال‌سازی پس از بسته‌شدن کندل، پیوت‌های تأییدشده، ثبت intent و سیاست بدبینانه برای ابهام SL/TP—حفظ شوند. با این حال، این نقاط قوت نمی‌توانند شکاف‌های P0 در واحدهای BTC/USDJPY، دادهٔ اجرایی، مدل fill، هزینه، هم‌ترازی تایم‌فریم و حاکمیت AI را جبران کنند.

مهم‌ترین قید تصمیم این است که **BTCUSD از هر گزارش عملکرد، benchmark و نتیجهٔ تصمیم‌گیری مسدود شود** تا زمانی که واحدهای قیمت/تیک، contract size، PnL، margin، spread، fee، funding و دادهٔ همان venue به‌صورت آزمون‌شده یکپارچه شوند. EURUSD و GBPUSD نیز فقط می‌توانند در پژوهش bar-close با سناریوی هزینهٔ محافظه‌کارانه باقی بمانند. نبود شواهد مستقیم برای مجموعه‌قواعد فعلی در M5/M15، به‌ویژه پس از هزینه، به معنی رد ابدی فرضیه‌ها نیست؛ به معنی آن است که هیچ‌کدام هنوز حق عنوان «تأییدشده» یا «قابل‌اجرا» ندارند.

| محور تصمیم | حکم | دلیل ممیزی | اقدام مالک |
|---|---|---|---|
| اجرای زنده یا ارسال خودکار سفارش | **تعلیق کامل** | دادهٔ executable، مدل صف/fill، هزینهٔ venue-specific، کنترل latency و دروازهٔ ریسک یکپارچه نیست. | هیچ broker write، live routing یا auto-execution ساخته یا فعال نشود. |
| پژوهش bar-close روی FX | **مجازِ مشروط** | منطق کندل‌بسته و بعضی safeguardها وجود دارد؛ ولی هزینه و اعتبارسنجی ناقص‌اند. | فقط replay/Paper، با برچسب «فرضیهٔ آموزشی» و OOS سخت‌گیرانه. |
| BTCUSD / کریپتو | **مسدود از تصمیم‌گیری** | واحدهای اجرایی نادرست و تاریخچه/fee/funding/venue لازم ناقص است. | تا عبور از تست‌های instrument-specific، از dashboard و گزارش تصمیم حذف شود. |
| Trend/channel و swing | **حفظ به‌عنوان baseline پژوهشی** | ریشهٔ مفهومی معتبر دارند، اما انتقال به M15/M5 ثابت نشده است. | پارامترها و اجرای سفارش را از پیش ثبت و با OOS آزمون کنید. |
| Mean reversion و scalp | **اصلاح اساسی / عدم اجرای عملی** | OHLC پنج‌دقیقه‌ای جانشین microstructure نیست و stop کوچک به هزینه حساس است. | نام‌گذاری را اصلاح و تا دادهٔ quote/order-flow فقط replay آموزشی نگه دارید. |
| S0/SMC/ICT | **تعلیق برچسب‌های FVG/OB؛ حفظ proxy پیوت** | کد sweep/reclaim پیوت دارد، نه FVG/MSS/BOS/OB کامل. | آن را `Pivot Sweep/Reclaim Proxy` بنامید و featureهای ادعاشده را یا پیاده‌سازی/آزمون یا پنهان کنید. |
| طبقه‌بند رژیم و MTF | **اصلاح پیش از اتکا** | proxyهای نادرست، سیاست‌های متناقض و نبود MTF واقعی وجود دارد. | `NO_TRADE` پیش‌فرض، HTF بسته‌شده، تقویم خبری و hard gate بسازید. |
| LLM و چهار نقش عامل | **حفظ به‌صورت advisoryِ مقید** | UI و قراردادها وجود دارند، اما چهار رأی مستقل و کالیبره اجرا نمی‌شوند. | LLM فقط خلاصه/نقد evidence باشد؛ kernel تصمیم و ریسک قطعی و fail-closed بماند. |

## روش، حدود نتیجه و رتبه‌بندی شواهد

این گزارش یافته‌های مستقلِ ارائه‌شده، خوانش ایستای مسیرهای کد گزارش‌شده و منابع بیرونی را تفکیک می‌کند. نتیجهٔ «پیاده‌سازی» دربارهٔ رفتار طراحی‌شدهٔ فایل‌ها است، نه نتیجهٔ اجرای end-to-end. نتیجهٔ «شواهد» دربارهٔ قابلیت تعمیم یک سبک است، نه پیش‌بینی بازده آتی. هیچ جدول یا عبارت این سند نباید به منزلهٔ توصیهٔ سرمایه‌گذاری شخصی یا تضمین عملکرد تعبیر شود.

| سطح منبع | کارکرد مجاز در این ممیزی | نمونه | محدودیت |
|---|---|---|---|
| **پژوهش همتا‌داوری‌شده / دانشگاهی** | پشتیبانی از سازوکار، محدودیت روش و فرضیهٔ قابل‌آزمون | مومنتوم سری‌زمانی، هزینهٔ معامله، data-snooping، latency | بازار، دوره، فرکانس و هزینهٔ مطالعه ممکن است با محصول متفاوت باشد. |
| **منبع primary / نهادی / venue** | تعریف semantics داده، fee، funding، ساعات و کنترل‌های اجرایی | Binance، Coinbase، OANDA، CME، IOSCO، NIST | قانون/مستندات venue، اثبات‌کنندهٔ alpha یا fill آتی نیست. |
| **منبع practitioner / آموزشی** | تعریف اصطلاح، تولید فرضیه و تشخیص ریسک عملی | قواعد Turtle، آموزش ICT، Bookmap | شاهد آماری مستقل برای سودآوری نیست. |
| **Forum** | فقط نشان‌دادن نگرانی‌های اجرایی یا تجربهٔ موردی | ForexFactory دربارهٔ spread و false breakout | فاقد کنترل نمونه، تعریف ثابت و قابلیت تعمیم؛ **هرگز مبنای تأیید استراتژی نیست**. |

پژوهش مومنتوم سری‌زمانی بر قراردادهای آتی نقدشونده، تداوم بازده را عمدتاً در افق‌های یک تا دوازده ماه گزارش می‌کند؛ بنابراین از اصلِ فرضیهٔ trend-following متنوع پشتیبانی می‌شود، اما نه از قانون ۵۵ کندلی روی یک نماد در M15. [1] مطالعهٔ بلندمدت Hurst، Ooi و Pedersen نیز از trend-following با تنوع بازار، افق‌های چندگانه، هدف نوسان و کسر هزینه بهره می‌برد؛ این تفاوت‌های طراحی باید در تفسیر محصول حفظ شوند. [2] مرور Park و Irwin دربارهٔ قواعد تحلیل تکنیکال نیز به‌صراحت مسئلهٔ data-snooping و برآورد هزینه را مانع نتیجه‌گیری کلی می‌داند. [3]

## تطبیق سبک‌های معاملاتی: شواهد، پیاده‌سازی و تصمیم

| سبک / نام فعلی | وضعیت شواهد مستقل | وضعیت پیاده‌سازی مشاهده‌شده | تصمیم | شرط خروج از وضعیت فعلی |
|---|---|---|---|---|
| **Channel / TSMOM trend breakout** | شواهد قوی‌تر برای trend-following کند، چندبازاری و volatility-scaled است؛ شواهد مستقیم برای 55/EMA200/ATR20 در M15 تک‌نماد وجود ندارد. [1] [2] | کانال از ۵۵ کندل قبلی و بدون look-ahead ساخته می‌شود؛ اما Turtle تاریخی ۵۵ **روز** بود، نه ۵۵ کندل M15. ورود واقعی limit-pullback است، نه breakout در open بعدی. | **حفظ به‌عنوان baseline؛ اصلاح اجباری** | جداسازی نسخهٔ market/stop breakout از limit pullback، هزینهٔ نمادمحور، OOS و حساسیت پنجره‌ها. |
| **EMA200 + ATR20/2ATR + TP4ATR** | ATR برای مقیاس‌کردن نوسان و stop تطبیقی مناسب است، اما غیرجهتی است؛ TP ثابت 4ATR از Turtle نتیجه نمی‌شود. [4] | EMA فقط جهت شیب را می‌سنجد، نه موقعیت قیمت؛ warm-up ۲۰۰ کندلی با ۲۴۰ کندل شکننده است. ATR20/2ATR هم‌ریشه با Turtle است؛ TP4ATR فرضیهٔ مستقل است. | **حفظ ATR؛ اصلاح EMA/خروج** | warm-up/carry-forward، فیلترهای شفاف، مقایسه با trailing/channel/time exit و انتخاب صرفاً OOS. |
| **Mean reversion، Bollinger 20/2** | بازگشت کوتاه‌مدت ممکن است با bid–ask bounce اشتباه شود؛ 20/2 convention است نه اثبات edge در FX/crypto M5. [5] [6] | پنجرهٔ اصلی trigger را در آمار می‌گنجاند؛ rejection تقریباً همیشه برقرار است؛ R:R خام 0.8 هزینه را پوشش نمی‌دهد. | **اصلاح اساسی؛ صرفاً پژوهشی** | band پیش از trigger، reclaim واقعی، trend/news/session gate، bid/ask و آزمون خالص از هزینه. |
| **Scalp M1/M5 / microstructure scalp** | اطلاعات order flow می‌تواند اطلاعاتی باشد، اما OHLC جانشین order flow نیست؛ بازار FX و کریپتو به venue/نقدشوندگی حساس‌اند. [7] [8] | تنها خروجی 5M دارد؛ depth، trades، imbalance، bid/ask، session و volume مؤثر را مصرف نمی‌کند. stop=0.25 ATR بدون cost gate است. | **تعلیق ادعای microstructure و اجرای عملی** | دادهٔ quote/L2/trade همان venue، شبیه‌ساز maker/taker، fill/latency و cost-to-risk gate. |
| **S0 / ICT / SMC** | اصطلاحات FVG/MSS/OB عموماً قراردادهای آموزشی‌اند؛ شواهد مستقیمی برای پیوند آن‌ها به اقدام نهادی یا مزیت پایدار یافت نشده است. [9] [10] | S0 عملاً sweep/reclaim پیوت تأییدشده است. candles15M استفاده نمی‌شود؛ FVG، MSS/BOS، session sweep و OB محاسبه نمی‌شوند؛ با این حال برچسب FVG داده می‌شود. | **حفظ proxy؛ تعلیق برچسب‌های ادعایی** | specification نسخه‌دار هر feature، پیاده‌سازی واقعی یا حذف نام‌ها، baseline تصادفی و OOS هزینه‌دار. |
| **Swing / macro continuation** | مومنتوم بلندمدت، نه EMA9/21 یا تداوم یک کندل H1، پشتوانهٔ مستقیم دارد. [1] [2] | پیوت تأییدشده بدون look-ahead نکتهٔ مثبت است؛ اما HH/HL یا LL/LH، pullback و HTF واقعی محاسبه نمی‌شوند. | **حفظ به‌عنوان baseline ساختاری؛ اصلاح** | تعریف کمی ساختار، HTF بسته‌شده و entry timeframe مستقل. |
| **MTF confirmation** | تحلیل چندبازه یک فرضیهٔ آزمون‌پذیر است؛ شواهد عمومی برای هر نسبت timeframe یا هر فیلتر وجود ندارد. [11] | یک آرایهٔ Candle با برچسب‌های ثابت 5M/15M/1H استفاده می‌شود؛ رشتهٔ `'1H'` resampling نیست. | **اصلاح قبل از نمایش به‌عنوان MTF** | feed/resample جدا، timestamp آخرین HTF بسته، forward-fill زمان‌مجاز و تست leakage. |
| **Market regime / HIGH_VOL_NEWS** | روش‌های آماریِ رژیم و دادهٔ تقویم می‌توانند معتبر باشند؛ ATR به‌تنهایی علت خبر را تعیین نمی‌کند. [12] [13] [14] | `adxTrendStrength`، ADX نیست؛ `volumeZScore` z-score نیست؛ ATR baseline کل slice است؛ spike به‌اشتباه NEWS نامیده می‌شود؛ blocked style حذف قطعی نمی‌شود. | **اصلاح P0 برای policy** | برچسب‌های جدا برای volatility/news/liquidity، ADX واقعی یا نام proxy، تقویم و hard gate fail-closed. |

### ۱. Channel/TSMOM و breakout: حفظ فرضیه، نه نتیجه

در `multi-style-engine.ts`، جداکردن `history = candles.slice(0,-1)` و ساخت کانال از ۵۵ کندل پیشین، از استفاده از high/low کندل سیگنال در مرز کانال جلوگیری می‌کند. این طراحی از نگاه‌به‌آینده اجتناب می‌کند و باید حفظ شود. اما هم‌نامی آن با Turtle نباید به هم‌ارزی تاریخی تبدیل شود: قواعد Turtle شکست Donchian بیست و پنجاه‌وپنج **روزه**، N/ATR بیست‌روزه و stop برابر 2N را توصیف می‌کنند. [15] تبدیل ۵۵ روز به ۵۵ کندل M15، افق را به ۱۳ ساعت و ۴۵ دقیقه کاهش می‌دهد و نیازمند شواهد تجربی مستقل است.

مدل فعلی، سیگنال را پس از close کندل می‌سازد و `LIMIT` را در close همان کندل ثبت می‌کند. بنابراین در کندل بعد فقط اگر قیمت به close قبلی بازگردد، سفارش پر می‌شود. این **pullback limit بعد از شکست** است؛ ورود breakout با market/stop در اولین قیمت قابل‌دسترسیِ کندل بعد نیست. در ادامه‌حرکت‌ها و gapها ممکن است معامله‌ای رخ ندهد و در حرکت بازگشتی، adverse selection متفاوت باشد. این دو محصول باید دو استراتژی، دو گزارش fill-rate و دو ادعای جداگانه باشند.

برای FX درون‌روزی، شواهد موجود هشدار می‌دهند که اجزای پیش‌بینی‌پذیر می‌توانند پس از هزینه و محدودیت ساعات فعال، بازده مازاد مثبت نداشته باشند. [16] در نتیجه، کانال ۵۵ باید به‌عنوان family محدود و ازپیش‌ثبت‌شدهٔ پنجره‌های 20/40/55/80 نگه داشته شود؛ نه عدد ممتاز و از پیش تأییدشده. EMA200 نیز در پیاده‌سازی فعلی صرفاً جهت شیب را بررسی می‌کند. فیلتر موقعیت قیمت نسبت به EMA، شیب نرمال‌شده با ATR و «بدون EMA» باید baselineهای جداگانه باشند.

### ۲. Mean reversion و scalp: نام‌گذاری فعلی بیش‌ازحد ادعایی است

Roll نشان می‌دهد بخشی از بازگشت بسیار کوتاه‌مدت قیمت معامله‌شده می‌تواند ناشی از bid–ask bounce باشد؛ از این رو مشاهدهٔ reversal پیش از هزینه، معادل alpha قابل معامله نیست. [5] Hartmann نیز رابطهٔ نقدشوندگی، حجم و spread را در بازار FX نشان می‌دهد و نتیجه می‌گیرد که «نوسان/حجم بالا» به‌تنهایی شرط مناسب اسکالپ نیست. [6] مطالعات جریان سفارش مشتریان FX، ارزش اطلاعاتی order flow واقعی را بررسی کرده‌اند، اما این داده با OHLC یکسان نیست. [7]

`evaluateScalp` فقط یک الگوی OHLC پنج‌دقیقه‌ای بر مبنای sweep نسبت به کندل پیشین، close جهت‌دار، ATR(7)، stop=0.25ATR و هدف 1.5R می‌سازد. هیچ مسیر M1 یا دادهٔ microstructure ندارد. کامنت close در یک‌سوم بالایی/پایینی را وعده می‌دهد، ولی شرط آن وجود ندارد. در نتیجه نام درست محصول **«فرضیهٔ reversal مبتنی بر OHLC در 5M»** است، نه microstructure scalp. تا وقتی spread، commission و slippage نسبت به stop و هدف hard-gate نشده‌اند، stop کوچک به‌طور ساختاری در معرض حذف‌شدن expectancy ناخالص به‌وسیلهٔ هزینه قرار دارد.

در mean reversion، محاسبهٔ باند 20/2 با convention رایج هم‌راستاست، اما ورود کندل extreme به همان پنجره، شدت z-score را کاهش می‌دهد. شرط rejection فعلی—`close > low` یا `close < high`—برای اغلب کندل‌ها بدیهی است. نسخهٔ پژوهشی تمیزتر باید آمار ۲۰ close **پیش از trigger**، برگشت close به داخل band یا تأیید کندل بعدی، حداقل فاصلهٔ قابل معامله، و فیلتر روند/خبر/session را الزام کند. هیچ forum یا راهنمای Bollinger نباید جایگزین این آزمایش شود.

برای کریپتو، fragmentation صرافی‌ها و محدودیت‌های آربیتراژ مانع تعمیم یک قانون از یک venue به venue دیگر هستند. [8] بنابراین هر نتیجه باید به exchange، نوع قرارداد، tier حساب، maker/taker، زمان funding و کیفیت order book مقید باشد.

### ۳. S0، ICT و SMC: یک proxy ارزشمند اما نه تعبیر نهادی

در `s0-engine.ts`، شرط خرید `current.low < swingLow` و `current.close > swingLow` و شرط متقارن فروش، همراه با پیوتی که دو کندل بعد تأیید می‌شود، یک تعریف قابل‌کدنویسی از **Pivot Sweep/Reclaim Proxy** می‌سازد. حفظ این proxy برای آزمون تاریخی مفید است. با این حال، OHLC نشان نمی‌دهد چه کسی سفارش resting داشته، آیا یک نهاد عمداً سطح را sweep کرده، یا چه میزان نقدینگی در سطح وجود داشته است. مطالعهٔ Osler امکان خوشه‌شدن stop-loss و حرکت‌های خودتقویت‌شونده را بررسی می‌کند، ولی خودِ cascadeهای بزرگ را به دلیل محدودیت داده مستقیماً مشاهده نمی‌کند. [17]

فاصلهٔ محصول با متن قراردادها روشن است. `candles15M` در S0 استفاده نمی‌شود و `evaluateSlice` همان داده را برای دو ورودی می‌فرستد. FVG سه‌کندلی، range سشن آسیا/لندن، timezone، MSS/BOS، Order Block، ورود Limit در 50% FVG و روند 1H/4H محاسبه نشده‌اند. برچسب `FVG + Liquidity Sweep` در `MultiStyleEngine` بنابراین با محتوای واقعی سیگنال هم‌خوان نیست. نام‌های `S0_SWEEP_FVG`، `BOS_ORDER_BLOCK` و `EQUILIBRIUM_DISCOUNT` در قرارداد، featureهای اجرایی یا evidenceهای محاسبه‌شده نیستند.

هر feature آینده باید پیش از آزمون تعریف نسخه‌دار داشته باشد. برای نمونه، FVG صعودی باید به‌صراحت با `high[t-2] < low[t]`، تنها پس از close `t`، حداقل اندازه بر حسب tick/ATR، محدودهٔ zone، midpoint، نخستین touch، fill، invalidation و expiry تعریف شود. MSS/BOS نیز باید major/minor swing، ساختار پیشین، شکست با close، buffer و timeframe مستقل داشته باشد. بدون این تعریف‌ها، دو بک‌تست از یک نام به نتایج متفاوت می‌رسند. کاربرد Reality Check یا روش‌های هم‌خانواده برای مجموعهٔ قواعد انتخاب‌شده، پاسخ مناسب به انتخاب پسینی است. [18]

### ۴. Swing، MTF و رژیم: جهت مفهومی مناسب، اجرای ناکافی

EMA یک شاخص جهت روندِ ذاتاً تأخیری است و ATR یک سنجهٔ غیرجهتی نوسان است؛ هیچ‌یک علت خبر یا دوام حرکت را اثبات نمی‌کند. [19] [4] بنابراین استفاده از EMA/ATR به‌عنوان feature پژوهشی معقول است، اما نسبت‌دادن confidence بالا یا علت خبر فقط از این دو، معقول نیست.

در `market-regime-classifier.ts`، EMA9/EMA21 با کمتر از ۲۱ کندل شروع می‌شود و EMA21 در آن بخش warm-up کامل ندارد. `adxTrendStrength` در واقع شمارش جهت closeها است و نه ADX ویلدر مبتنی بر +DI/−DI. `atrRatio` میانگین کل ATRهای slice را می‌گیرد، نه baseline ثابت ۵۰تایی. `compressionRatio` از `2σ/mean` closeها با آستانهٔ ثابت 0.35% استفاده می‌کند؛ volume وارد شرط compression نیست و `volumeZScore` نیز بر انحراف معیار تقسیم نمی‌شود. نام‌گذاری دقیق این متغیرها به `trendScoreProxy`، `relativeAtrProxy` و `relativeVolumeProxy` تا پیاده‌سازی درست، از قطعیت کاذب جلوگیری می‌کند.

برچسب `HIGH_VOL_NEWS` باید به سه برچسب مجزا تفکیک شود: `VOLATILITY_SPIKE` که فقط از OHLC/ATR نتیجه می‌گیرد؛ `SCHEDULED_HIGH_IMPACT_NEWS` که فقط از تقویم timestamped نتیجه می‌گیرد؛ و `LIQUIDITY_STRESS` که به bid/ask، spread و در صورت امکان depth متکی است. تقویم‌های اقتصادی می‌توانند زمان، کشور و اثر مورد انتظار رویداد را عرضه کنند، اما رویداد زمان‌بندی‌نشده را به‌طور کامل پوشش نمی‌دهند. [13] شواهد FX نیز نشان می‌دهند اخبار می‌توانند نوسان و پرش قیمت ایجاد کنند، که دلیل نیاز به این تفکیک است. [14]

MTF واقعی هنوز وجود ندارد. `MultiStyleEngine.evaluate` یک آرایهٔ Candle می‌گیرد و فقط آن را با برچسب‌های 5M، 15M و 1H به سبک‌ها معرفی می‌کند. فراخوانی `detectSwingPoints(candles, '1H')` داده را به H1 تبدیل نمی‌کند. برای MTF بدون leakage، D1/H4 بسته‌شده باید bias، H1 بسته‌شده باید regime/structure و M5/M15 باید trigger را تامین کند؛ timestamp آخرین کندل HTF بسته‌شده باید به LTF forward-fill شود. در هر تعارض یا دادهٔ ناکافی، حکم صحیح `NO_TRADE` است، نه پیشنهاد پیش‌فرض scalp/mean reversion.

### ۵. کیفیت اجرای کوتاه‌افق و واحدهای نماد: مانع P0

در `market.ts`، BTCUSD دارای `contractSize=1`، `pipSize=1` و spread معمول 50 است. ولی `event-driven-engine.ts` برای همهٔ نمادهای غیرطلا، `pipVal=0.0001` و `contractSize=100000` استفاده می‌کند. این ناسازگاری برای BTCUSD بنیادین است و USDJPY نیز با `pipSize=0.01` ناسازگار می‌شود. `ResearchLab` نیز به جای `SYMBOL_SPECS[symbol]` از spread ثابت 1.5 و commission ثابت 6 استفاده می‌کند. نتیجه: PnL، spread/slippage، margin، MAE/MFE و هر backtest BTCUSD قابل تفسیر نیست.

مستندات venueها توضیح می‌دهند که بازسازی دفتر سفارش به snapshot، diff و کنترل sequence نیاز دارد؛ OHLCV عمق، صف، fill ratio یا قیمت عبور از سطح را بازسازی نمی‌کند. [20] [21] کارمزد maker/taker و tier حساب نیز بخشی از semantics venue است و می‌تواند برای یک سفارش partially matched ترکیبی باشد. [22] در قرارداد perpetual، funding رویدادی notional-محور است و باید به ledger اضافه شود. [23] FX نیز ساعات، توقف‌های روزانه، DST، تعطیلات و اجرای stop در نرخ prevailing دارد. [24]

موتور event-driven از نظر ساختاری چند نکتهٔ خوب دارد: tickهای bid/ask را می‌پذیرد، market buy/sell را به ask/bid می‌زند، کمیسیون ثبت می‌کند و `ResearchLab` سفارش را پس از کندل سیگنال در کندل بعدی پردازش می‌کند. با وجود این، مسیر candle برای limit order صرف لمس low/high را به fill کامل در قیمت limit تبدیل می‌کند. queue، حجم معامله‌شده، latency، partial/missed fill، cancel race و impact وجود ندارد. مسیر tick نیز پوزیشن را mark-to-market می‌کند اما SL/TP را اجرا نمی‌کند. سیاست بدبینانهٔ SL/TP هم‌زمان، ترتیب علّی entry و extrema را حل نمی‌کند.

`runStressTests` مقدار `additionalSlippagePips` را گزارش می‌کند، ولی آن را به `runBacktest` یا engine تزریق نمی‌کند. پس stress test لغزش اضافی را واقعاً اعمال نمی‌کند. در نتیجه، عبارت‌هایی مانند «robust» یا «stress-tested» باید تا اصلاح این مسیرها حذف شوند.

## ممیزی جداگانهٔ معماری AI و چندعاملی

### حکم AI

**LLM آفلاین/مرورگری و نقش‌های چندعاملی باید advisory، evidence-bound و قابل رد باشند؛ نه predictive alpha، نه consensus مستقل و نه مرجع مجوز معامله.** استانداردها و نهادهای ناظر بر حاکمیت، مسئولیت مشخص، اعتبارسنجی مستقل، effective challenge، آزمون پیش از استقرار، پایش مستمر و کنترل اتکای بیش‌ازحد به GenAI تأکید دارند. [25] [26] [27] [28] Structured Outputs تنها انطباق ساختاری با schema را تضمین می‌کند؛ صحت، grounding یا کیفیت اقتصادی پاسخ را تضمین نمی‌کند. [29]

| مؤلفهٔ AI | شواهد کد / وضعیت | ریسک | تصمیم معماری |
|---|---|---|---|
| **ResearchDesk UI** | `enabledRoles` و `modelId` عمدتاً state محلی‌اند؛ `handleCreatePaperTicket` هیچ provider یا `reviewCandidateWithFourAgents` را فراخوانی نمی‌کند. | کاربر ممکن است نمایش چهار نقش را review واقعی تلقی کند. | نقش‌های غیرفعال را «نمایش نقش» بنامید یا به workflow canonical متصل کنید. |
| **چهار agent** | scanner عمدتاً rule/boolean است؛ analyst و critic ممکن است مدل/قاعده باشند؛ judge policy قطعی است؛ در orchestrator confidenceهای ثابت و متن‌های قالبی دیده می‌شود. | توافق ظاهری به‌جای استقلال، confidence کاذب و automation bias. | scanner factual و deterministic؛ analyst/critic مستقل و evidence-bound؛ judge فقط kernel policy قطعی. |
| **Evidence packet** | `isClosedCandle` و `noLookahead` همیشه true و `missingFields` خالی ساخته می‌شوند؛ WebLLM evidenceIdهای تولیدی را حفظ نمی‌کند. | hallucination و provenance جعلی. | evidence immutable با hash، source/version، timestamp، fieldهای unknown واقعی و validator runtime. |
| **Confidence / alphaConsensus** | confidenceهای ثابت یا خودگزارش‌شده کالیبره نشده‌اند؛ Brier/ECE/reliability وجود ندارد. | عدد confidence به‌اشتباه احتمال موفقیت تلقی می‌شود. | تا کالیبراسیون OOS، confidence را «درجهٔ کامل‌بودن evidence» بنامید، نه احتمال. |
| **Model/prompt governance** | نگاشت engine ناقص است؛ artifact/prompt/output/override journal کامل و immutable دیده نمی‌شود. | بازتولیدناپذیری، drift و تغییر بی‌اثر‌سنجی‌شده. | model card، inventory، hash، version، changelog، champion–challenger و sign-off مستقل. |
| **مرورگر** | browser برای replay، visualization و Paper Ticket مناسب‌تر از اجرای پایدار است. | throttling tab، reconnect، زمان‌بندی، secret و lifecycle برای اجرا قابل اتکا نیستند. | مرورگر read-only + تأیید انسانی؛ feed/secret/monitoring/kill-switch فقط در سرور امن. |

پژوهش multi-agent debate ممکن است در بعضی تکالیف استدلالی یا factual خطا را کاهش دهد، اما این نتیجه به predictive alpha معاملاتی تعمیم خودکار ندارد. [30] LLM-as-a-judge در معرض بایاس position، verbosity و self-enhancement است. [31] افزون بر آن، confidence زبانی، احتمال کالیبره‌شدهٔ صحت نیست و به اعتبارسنجی جداگانه نیاز دارد. [32] بنابراین اجماع متنی چهار نقش، نه یک ensemble پیش‌بینی‌کننده و نه مجوز ریسک است.

### معماری هدفِ حداقلی و قابل ممیزی

مسیر canonical باید پس از ساخت candidate و پیش از ایجاد Paper Ticket فراخوانی شود. scanner قطعی تنها منبع facts باشد و packet غیرقابل تغییرِ آن شامل hash کندل‌های دیده‌شده، source/dataset version، symbol، venue، timeframe واقعی، isClosedCandle محاسبه‌شده، عدم‌قطعیت داده، spread و news-status با منبع یا `UNKNOWN` باشد. analyst و critic باید در pass اول مستقل و با rubric متفاوت تنها به همان ledger ارجاع دهند. critic باید falsifier یا counterfactual با evidenceId معتبر بدهد. گفت‌وگو، اگر باقی می‌ماند، یک دور و فقط پس از اثبات بهبود در evaluation نسبت به baseline بدون debate باشد.

judge نباید یک LLM باشد. policy kernel قطعی باید freshness، evidence completeness، risk caps، symbol block، data quality، style prohibition، no-lookahead و unknownهای بحرانی را fail-closed اعمال کند. هر claim بدون evidenceId، هر schema/range inconsistency، یا هر دادهٔ `UNKNOWN` برای تصمیم پرریسک باید به `REVIEW_REQUIRED` یا `NO_TRADE` منتهی شود. تأیید انسانی باید پس از مشاهدهٔ packet و review، با نام، زمان، دلیل و override ثبت شود؛ این تأیید حتی در آینده نباید به‌تنهایی مجوز live routing باشد.

## نقشهٔ راه اولویت‌بندی‌شده، بدون Live Trading

این نقشهٔ راه عمداً به Paper/Replay/Shadow محدود است. تکمیل مرحلهٔ بعدی تنها پس از پذیرش معیارهای مرحلهٔ قبل امکان‌پذیر است؛ هیچ مرحله‌ای مجوز Live Trading نیست.

| اولویت | بازهٔ پیشنهادی | خروجی | معیار پذیرش | اثر تصمیم |
|---|---:|---|---|---|
| **P0 — توقف ادعا و مهار دامنه** | هفتهٔ ۱ | feature flags برای `RESEARCH_ONLY`، block BTCUSD/USDJPY، حذف واژه‌های Confirmed/alpha/microstructure/FVG کاذب، no-live policy | هیچ مسیر UI/API برای live write وجود نداشته باشد؛ همهٔ نتایج برچسب data-quality و research-only داشته باشند. | جلوگیری از تصمیم بر مبنای نتایج نامعتبر. |
| **P0 — قرارداد نماد و هزینه** | هفتهٔ ۱ تا ۲ | `InstrumentSpec` واحد برای pip/tick, contract size, quote/base currency, lot, fee, spread, funding/swap, venue | unit test برای EURUSD، GBPUSD، USDJPY، XAUUSD و BTCUSD؛ PnL/margin/slippage فقط از spec بگذرد. | رفع مانع بنیادی تفسیر نتایج. |
| **P0 — هم‌ترازی signal/execution و stress** | هفتهٔ ۲ تا ۳ | تمایز breakout-market/stop و pullback-limit؛ اعمال واقعی slippage/spread/fee/funding در سناریوها | هر scenario پارامترها را به fill و ledger تزریق کند؛ test نشان دهد خروجی با تغییر cost تغییر می‌کند. | جلوگیری از گزارش robustness اسمی. |
| **P1 — داده و lineage پژوهشی** | هفتهٔ ۳ تا ۵ | dataset catalog با venue، timezone، source hash، gaps، duplicate/order checks، session/funding calendar | BTC فقط با دادهٔ venue مشخص؛ FX با bid/ask تاریخی همان broker یا برچسب محدودیت؛ gap policy گزارش‌شده. | قابل‌بازتولیدشدن آزمایش‌ها. |
| **P1 — regime و MTF واقعی** | هفتهٔ ۴ تا ۶ | HTF/LTF جدا یا resample زمان‌مجاز، `VOLATILITY_SPIKE`/`NEWS`/`LIQUIDITY_STRESS` جدا، hard-block واحد | تست leakage، تطابق policy در engine و ResearchLab، `NO_TRADE` برای history ناکافی. | کاهش سیگنال‌های کاذب و تناقض policy. |
| **P1 — اصلاح specification سبک‌ها** | هفتهٔ ۵ تا ۷ | نسخهٔ ثبت‌شدهٔ channel، MR، S0 proxy، FVG/MSS/OB در صورت پیاده‌سازی واقعی، timeout/fill/exit | هر style یک entry، exit، invalidation، TTL، cost model و baseline مشخص داشته باشد. | جلوگیری از تغییر تعریف پس از دیدن نتیجه. |
| **P1 — Evidence-bound AI** | هفتهٔ ۶ تا ۸ | workflow canonical، evidence ledger، runtime validation، audit journal، UI صادقانه | Paper Ticket بدون scanner/analyst/critic/judge policy واقعی ایجاد نشود؛ unknownها fail-closed باشند. | کاهش automation bias و قابلیت ممیزی. |
| **P2 — اجرای پژوهش اعتبارسنجی** | هفتهٔ ۸ تا ۱۲ | آزمایش‌های تعریف‌شده در بخش بعد، گزارش reproducible OOS و failure analysis | نتایج شامل هزینه، fill، confidence calibration، trial log و عدم‌قطعیت باشد؛ بدون نتیجه‌گیری سوددهی. | تصمیم داده‌محور دربارهٔ حفظ/حذف فرضیه‌ها. |
| **P2 — Shadow / Paper observation** | پس از P0/P1 | گزارش رفتار سیگنال و اختلاف forecast/fill بدون سفارش واقعی | latency، quote freshness، reject، fill ratio و slippage مشاهده‌شده ثبت شود؛ هیچ order واقعی ارسال نشود. | کالیبراسیون شبیه‌ساز نسبت به مشاهدهٔ غیرعملیاتی. |

## آزمایش‌های لازم پیش از هر ادعای کارایی

### پروتکل مشترک و دروازه‌های روش‌شناسی

هر سبک باید پیش از مشاهدهٔ نتایج، در یک specification versioned قفل شود: universe، symbol، venue، قرارداد، timeframe واقعی، ویژگی‌ها، پارامترهای مجاز، rule ورود/خروج، earliest eligible execution، expiry، قوانین هزینه و metricهای اصلی. داده به train، validation و test زمانیِ دست‌نخورده تقسیم شود. طول embargo/purge باید حداقل با lookback و holding period متناسب باشد. پارامتر فقط در train انتخاب، در validation قفل، و فقط یک‌بار در test ارزیابی شود. انتخاب از میان چند قانون باید با ثبت همهٔ trialها و کنترل multiple testing همراه باشد؛ روش CSCV/PBO دقیقاً برای سنجش خطر بیش‌برازش بک‌تست پیشنهاد شده است. [33]

هیچ نتیجه‌ای نباید صرفاً با profit factor، Sharpe یا نمونهٔ محدود گزارش شود. گزارش استاندارد باید سود/زیان **خالص از هزینهٔ واقعی یا سناریوی محافظه‌کارانه**، تعداد معامله، turnover، نرخ fill، signed slippage، MAE/MFE، average holding period، drawdown، exposure، distribution ماهانه، confidence interval/blocked bootstrap و شکست به تفکیک symbol، venue، session، regime، خبر، long/short و spread quantile را نشان دهد. اگر داده یا مدل لازم وجود ندارد، ستون باید `UNKNOWN` باشد؛ نه صفر یا مقدار ساختگی.

| آزمایش | پرسش دقیق | طراحی حداقلی | معیار رد/عدم تصمیم |
|---|---|---|---|
| **A. صحت واحدهای ابزار** | آیا tick/pip، contract، PnL، margin و fee در همهٔ نمادها درست است؟ | golden tests با مثال‌های دستی برای EURUSD، USDJPY، XAUUSD، BTC spot/perp؛ property tests برای علامت PnL و تبدیل ارز | هر ناسازگاری واحد یا اختلاف با ledger مرجع، آن نماد را block می‌کند. |
| **B. شبیه‌سازی هزینه و fill** | آیا نتیجه به spread/fee/slippage/latency وابسته است؟ | سناریوهای P50/P95/P99 هزینه؛ market و limit جدا؛ برای limit نرخ no/partial fill و adverse selection | اگر scenarioها واقعاً به engine تزریق نشوند یا دادهٔ queue ندارید، limit فقط optimistic upper bound است. |
| **C. Channel trend** | آیا 20/40/55/80 و فیلترهای EMA پس از هزینه در OOS پایدارند؟ | family ازپیش‌ثبت‌شده؛ breakout-market/stop و pullback-limit جدا؛ exitهای 4ATR/channel/trailing/time جدا | برندهٔ train یا validation به‌تنهایی انتخاب نیست؛ ناپایداری بین session/regime نتیجه را research-only نگه می‌دارد. |
| **D. Mean reversion** | آیا reclaim باند پیش از trigger، پس از هزینه و خارج از trend/news، از baseline ساده متمایز است؟ | Bollinger 20/2 و پنجره‌های محدود همسایه؛ quote-aware entry؛ range/trend/news split؛ baseline تصادفی هم‌فاصله | اگر اثر با bid/ask یا هزینه ناپدید شود، ادعای reversal قابل معامله رد می‌شود. |
| **E. Scalp / microstructure** | آیا signal با quote/order-flow واقعی و fill قابل حصول ارتباط دارد؟ | همان venue، trade+L2/L3 یا حداقل bid/ask tick، sequence، feed/decision/order/fill timestamps | بدون این داده، تنها «OHLC reversal hypothesis» قابل گزارش است؛ واژهٔ microstructure ممنوع است. |
| **F. S0 proxy و ICT features** | آیا Pivot Sweep/Reclaim و هر FVG/MSS/OB تعریف‌شده، از baseline ساده جداست؟ | feature specification، نخستین touch، زمان فعال‌سازی، data resolution پایین‌تر از TF سیگنال، Reality Check/SPA | FVG/OB بدون feature واقعی یا با fill همان close، آزمون نامعتبر است. |
| **G. رژیم و MTF** | آیا classifier و HTF اطلاعات افزوده و بدون leakage دارند؟ | HTF بسته‌شده، ablation بدون regime/بدون MTF، calibration confusion matrix، test در regimeهای جدا | اگر performance با حذف برچسب‌ها تغییر معنادار ندارد یا leakage وجود دارد، feature به‌عنوان control باقی نمی‌ماند. |
| **H. AI advisory** | آیا AI نسبت به baseline policy-only در تشخیص missing evidence یا rejection بهتر است؟ | corpus دارای label انسانی و label outcome مستقل؛ analyst/critic مستقل؛ Brier/ECE، false approval/rejection، abstain rate | هیچ معیار مالی به LLM نسبت داده نشود؛ نبود calibration یا audit trail، AI را UI-only نگه می‌دارد. |
| **I. Shadow/Paper observation** | آیا مدل هزینه با مشاهدهٔ market data هم‌خوان است؟ | بدون سفارش واقعی؛ ثبت quote freshness، signal time، theoretical fill، actual subsequent quotes، latency | تفاوت systematic میان مدل و مشاهده، کالیبراسیون مجدد و توقف ادعا را الزام می‌کند. |

### قواعد حل زمان و داده برای هر بک‌تست

سیگنال bar-close باید فقط پس از بسته‌شدن کامل کندل ساخته شود و earliest eligible execution در bar/tick بعدی باشد. اگر دادهٔ پایین‌تر از timeframe سیگنال ندارید، ترتیب لمس entry، SL و TP نباید به‌عنوان واقعیت معرفی شود. برای limit، لمس OHLC حداکثر سقف خوش‌بینانهٔ امکان fill است؛ base case نیازمند bid/ask و، برای passive execution، صف و حجم معامله‌شده است. پژوهش latency در دفتر سفارش نشان می‌دهد مزیت مشاهدهٔ top-of-book با latency افزایش‌یافته به‌سرعت کاهش می‌یابد؛ بنابراین یک slippage ثابت جای زنجیرهٔ timestampهای feed تا fill را نمی‌گیرد. [34]

برای FX، spread مؤثر، commission، slippage، reject/last-look، rollover/swap، session و تعطیلات باید لحاظ شوند. FX Global Code بر شفافیت venue، عوامل اجرا و fee/commission تأکید می‌کند. [35] برای کریپتو، maker/taker، tier، spread/order book، partial fill، funding و زمان‌های funding باید در ledger باشد. این الزامات به معنای لزوم ساخت execution engine زنده نیستند؛ برای این مرحله، کافی است مدل پژوهشی با محدودیت صادقانه، سناریوهای بدبینانه و برچسب `UNKNOWN` طراحی شود.

## چیزهایی که باید حفظ، اصلاح یا حذف/تعلیق شوند

| وضعیت | اقلام | توضیح اجرایی |
|---|---|---|
| **حفظ** | `history = candles.slice(0,-1)` در channel، ATR ویلدر، پیوت با تأیید دو کندل، ساخت signal پس از close، intent و سیاست بدبینانهٔ SL/TP هم‌زمان | این‌ها foundationهای مناسب پژوهش‌اند، مشروط به آزمون‌های واحد و هزینهٔ واقعی. |
| **اصلاح فوری** | `SYMBOL_SPECS` سرتاسری، BTC/USDJPY units، stress slippage، breakout در برابر pullback، warm-up EMA، MTF، regime names/features، hard-block styles، expiry هماهنگ، cost gate | بدون این‌ها گزارش عملکرد می‌تواند به‌طور ساختاری گمراه‌کننده باشد. |
| **تعلیق یا تغییرنام** | BTCUSD benchmark، microstructure scalp، `HIGH_VOL_NEWS` مبتنی بر ATR، FVG/OB/MSS نامحقق، `CONFIRMED`، `alphaConsensusScore` و هر confidence به‌عنوان probability | این‌ها یا داده/feature لازم را ندارند یا بیش از محتوای واقعی سیستم ادعا می‌کنند. |
| **آزمایشی باقی بماند** | 55-channel، EMA200 slope، TP4ATR، Bollinger 20/2، S0 Pivot Sweep/Reclaim، swing continuation، ترکیب چندبازه | تنها زیر specification از پیش قفل‌شده و به‌عنوان hypothesis در ResearchLab/Paper قابل ارزیابی‌اند. |

## نتیجه‌گیری

Tradewithhamed یک هستهٔ نویدبخش برای **پژوهش منظم** دارد، نه یک سامانهٔ آمادهٔ معامله. بهترین مسیر، کوچک‌کردن ادعاها و بزرگ‌کردن کیفیت آزمایش است: ابتدا واحدهای نماد و هزینه، سپس داده و هم‌ترازی زمانی، بعد specification و OOS، و در نهایت AI advisory با evidence ledger و حاکمیت. Trend و ساختار پیوت را می‌توان به‌عنوان baselineهای قابل آزمون نگه داشت؛ mean reversion و scalp باید تا دادهٔ اجرایی، quote و کنترل هزینه در سطح فرضیه بمانند؛ ICT/SMC باید یا به featureهای صریح تبدیل یا با نام proxy نمایش داده شوند.

> **تصمیم نهایی پیشنهادی:** پروژه در حالت `RESEARCH_ONLY / PAPER_ONLY` ادامه یابد. هیچ ادعای سوددهی، مزیت آماری، آمادگی اجرای کوتاه‌افق یا استقلال چهارعامل AI منتشر نشود تا همهٔ آزمایش‌های ضروری با دادهٔ مشخص، هزینهٔ اعمال‌شده، OOS قفل‌شده و گزارش قابل‌بازتولید تکمیل شوند.

## منابع

[1]: https://w4.stern.nyu.edu/facdir/lpederse/papers/TimeSeriesMomentum.pdf "Time Series Momentum"
[2]: https://fairmodel.econ.yale.edu/ec439/hurst.pdf "A Century of Evidence on Trend-Following Investing"
[3]: https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-6419.2007.00519.x "What Do We Know About the Profitability of Technical Analysis?"
[4]: https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr "Average True Range (ATR)"
[5]: https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1984.tb03897.x "A Simple Implicit Measure of the Effective Bid-Ask Spread in an Efficient Market"
[6]: https://www.sciencedirect.com/science/article/pii/S0378426698001150 "Trading Volumes and Transaction Costs in the Foreign Exchange Market"
[7]: https://www.bis.org/publications/working-paper-405-information-flows-foreign-exchange-markets-dissecting-customer-currency-trades.pdf "Information Flows in Foreign Exchange Markets: Dissecting Customer Currency Trades"
[8]: https://dspace.mit.edu/entities/publication/7f91bfb5-ba77-4d0e-9c79-ec75e104e6cc "Trading and Arbitrage in Cryptocurrency Markets"
[9]: https://www.tradezella.com/learning-items/key-ict-concepts "Key ICT Concepts"
[10]: https://www.thinkmarkets.com/en/trading-academy/technical-analysis/ict-trading-strategy-smart-money-for-inner-circle-traders/ "ICT Trading Strategy: Smart Money for Inner Circle Traders"
[11]: https://dl.acm.org/doi/10.1145/2739482.2764885 "A Multi-Timeframe Trend Following Trading System"
[12]: https://developers.lseg.com/en/article-catalog/article/market-regime-detection "Market Regime Detection"
[13]: https://www.cmegroup.com/education/events/economic-releases-calendar "Economic Releases Calendar"
[14]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3843854 "The Effects of News on Foreign Exchange Markets"
[15]: https://www.tradingblox.com/originalturtles/originalturtlerules.pdf "The Original Turtle Trading Rules"
[16]: https://files.stlouisfed.org/files/htdocs/wp/1999/99-016.pdf "Technical Analysis in the Foreign Exchange Market: A Layman's Guide"
[17]: https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.pdf "Currency Orders and Exchange Rate Dynamics: An Explanation for the Predictive Success of Technical Analysis"
[18]: https://onlinelibrary.wiley.com/doi/abs/10.1111/0022-1082.00163 "Data-Snooping, Technical Trading Rule Performance, and the Bootstrap"
[19]: https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ema "Exponential Moving Average (EMA)"
[20]: https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/How-to-manage-a-local-order-book-correctly "How to Manage a Local Order Book Correctly"
[21]: https://docs.cdp.coinbase.com/exchange/websocket-feed/channels "WebSocket Feed Channels"
[22]: https://help.coinbase.com/en/exchange/trading-and-funding/exchange-fees "Exchange Fees"
[23]: https://www.binance.com/en/support/faq/what-are-funding-rates-360033525031 "Introduction to Binance Futures Funding Rates"
[24]: https://www.oanda.com/us-en/trading/hours-of-operation/ "Hours of Operation"
[25]: https://www.iosco.org/library/pubdocs/pdf/IOSCOPD684.pdf "The Use of Artificial Intelligence and Machine Learning by Market Intermediaries and Asset Managers"
[26]: https://www.iosco.org/library/pubdocs/pdf/IOSCOPD788.pdf "Artificial Intelligence in Capital Markets: Use Cases, Risks, and Challenges"
[27]: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf "Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile"
[28]: https://www.federalreserve.gov/supervisionreg/srletters/sr1107a1.pdf "Supervisory Guidance on Model Risk Management"
[29]: https://developers.openai.com/api/docs/guides/structured-outputs "Structured Model Outputs"
[30]: https://arxiv.org/abs/2305.14325 "Improving Factuality and Reasoning in Language Models through Multiagent Debate"
[31]: https://arxiv.org/abs/2306.05685 "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"
[32]: https://aclanthology.org/2021.tacl-1.57/ "How Can We Know When Language Models Know? On the Calibration of Language Models for Question Answering"
[33]: https://escholarship.org/uc/item/4w1110bb "The Probability of Backtest Overfitting"
[34]: https://www.tandfonline.com/doi/abs/10.1080/14697688.2016.1151926 "Reducing Transaction Costs with Low-Latency Trading Algorithms"
[35]: https://www.globalfxc.org/docs/fx_global.pdf "Global Foreign Exchange Code"

### منابع practitioner/forum با وزن استنباطی پایین

منابع زیر تنها برای نشان‌دادن ریسک‌های عملی، زبان رایج و فرضیه‌سازی حفظ شده‌اند و در حکم این گزارش نقش اثبات‌کننده ندارند.

[36]: https://www.forexfactory.com/thread/171552-donchian-channel-and-other-breakout-methods?page=3 "Donchian Channel and Other Breakout Methods"
[37]: https://www.forexfactory.com/thread/528551-the-spread-and-profit "The Spread and Profit"
[38]: https://www.forexfactory.com/thread/480175-do-scalpers-make-money-in-the-long-run?page=2 "Do Scalpers Make Money in the Long Run?"
[39]: https://bookmap.com/blog/multi-time-frame-analysis-a-guide-for-traders "Multi-Time Frame Analysis: A Guide for Traders"
[40]: https://webllm.mlc.ai/ "WebLLM: High-Performance In-Browser LLM Inference Engine"
