# اتصال چهار Agent آفلاین به Paper-Forward

## پاسخ به سؤال چهارمین سیستم

سیستم چهارم حذف نشده است. چهار نقش رسمی برنامه این‌ها هستند:

1. **Scanner:** کشف یا تأیید شواهد ساختاری؛ در نسخهٔ فعلی بهتر است deterministic بماند.
2. **Analyst:** بررسی context، جهت روند، هم‌راستایی تایم‌فریم‌ها و عدم‌قطعیت؛ این بهترین محل برای مدل زبانی آفلاین است.
3. **Critic:** جستجوی فعالانه برای تناقض، معاملهٔ دیرهنگام، R:R ضعیف، رژیم نامناسب و ریسک پنهان؛ این نقش دومین محل مناسب برای مدل آفلاین است.
4. **Judge / Risk Guardian:** داوری نهایی، اعمال fail-closed و قیدهای ریسک؛ این نقش عمداً deterministic باقی می‌ماند و نباید توسط مدل زبانی آزاد شود.

در نتیجه تعداد چهار نقش برای نسخهٔ اولیه مناسب است. زیادکردن agentها بدون دادهٔ ارزیابی‌شده فقط latency، اختلاف و هزینه را بیشتر می‌کند. بعداً می‌توان یک **Regime Specialist** یا **Data-Quality Auditor** اضافه کرد، اما نه قبل از اینکه اثر Analyst و Critic به‌صورت جداگانه اندازه‌گیری شود.

## چیزی که اضافه شد

قرارداد `AgentEvidencePacket` اکنون candidate، ruleهای لازم، context بازار و کنترل‌های data-quality را یکجا به agent می‌دهد. هر prompt با نسخهٔ `agent-prompts-v1` ساخته می‌شود و صریحاً به مدل می‌گوید:

- فقط از فیلدهای packet استفاده کند.
- واقعیت یا evidence مفقود را اختراع نکند.
- کندل بسته و قاعدهٔ no-lookahead را رعایت کند.
- در ابهام `REVIEW_REQUIRED` یا `NO_TRADE` برگرداند.
- هرگز مجوز معاملهٔ live صادر نکند.
- فقط JSON ساخت‌یافته برگرداند.

فایل‌های اصلی:

- `lib/ai/agentic-review-contracts.ts`
- `lib/ai/agentic-reviewer.ts`
- `lib/ai/browser-offline-ai.ts`

## مسیر جدید paper-forward

در حالت `AGENTIC_OFFLINE`، جریان به‌صورت زیر است:

```text
Closed Candle
  ↓
Deterministic Strategy Candidate
  ↓
Scanner structural gate
  ↓
Offline Analyst advisory
  ↓
Offline Critic advisory
  ↓
Deterministic Judge / Risk Guardian
  ↓
Approved candidate IDs only
  ↓
PAPER_REPLAY execution
```

Paper-forward هر candidate را فقط یک‌بار review می‌کند، شناسهٔ آن را cache می‌کند و فقط candidateهایی را وارد شبیه‌ساز می‌کند که خروجی نهایی آن‌ها `PAPER_TRADE` باشد. هیچ سفارش broker یا live ایجاد نمی‌شود.

برای شروع agentic paper-forward:

```json
{ "action": "start", "symbol": "EURUSD", "timeframe": "5M", "agentic": true }
```

برای هر کندل بسته:

```json
{
  "action": "ingest",
  "symbol": "EURUSD",
  "timeframe": "5M",
  "agentic": true,
  "candle": {
    "timestamp": 1788912000000,
    "open": 1.10,
    "high": 1.101,
    "low": 1.099,
    "close": 1.1005,
    "volume": 100,
    "isClosed": true
  }
}
```

## محدودیت فعال‌سازی مدل عصبی

اگر configuration روی engineهای deterministic باشد، چهار نقش اجرا می‌شوند اما Analyst و Critic از advisory قطعی استفاده می‌کنند. برای استفادهٔ واقعی از Qwen، Phi یا DeepSeek باید:

1. مدل WebLLM در مرورگر دانلود و در WebGPU بارگذاری شود.
2. مدل `READY` و resident باشد.
3. `analystEngineId` و `criticEngineId` به engineهای `NEURAL_WEBGPU` نگاشت شوند.
4. اگر مدل resident نباشد، خروجی `REVIEW_REQUIRED` می‌شود و Judge paper trade را متوقف می‌کند.

این fail-closed است و intentional است؛ برنامه نباید نبودن مدل را با پاسخ ساختگی جایگزین کند.

## چیزی که هنوز نباید ادعا شود

این تغییر به‌تنهایی ثابت نمی‌کند که AI سودآور است. برای اندازه‌گیری اثر AI باید سه آزمایش همسان اجرا شود:

| آزمایش | مسیر |
|---|---|
| Control | Rule Base → Paper Replay |
| Deterministic council | Rule Base → فیلترهای قطعی → Paper Replay |
| Agentic offline | Rule Base → Analyst → Critic → Judge → Paper Replay |

در هر سه آزمایش باید dataset، spread، slippage، commission، risk، seed و holdout یکسان باشد. معیار اثر واقعی شامل Profit Factor، Expectancy، Max Drawdown، precision تأییدهای AI، تعداد setupهای ردشده و عملکرد holdout است.

## اعتبارسنجی این تغییر

- `npm run typecheck` موفق
- `npm test` موفق: **18 suite / 99 check / 0 failure**
- تست جدید: وجود چهار نقش، تفاوت promptها، veto منتقد توسط Judge و خروجی advisory-only
