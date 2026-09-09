# گزارش کامل تنظیمات هوش مصنوعی آفلاین، APIها و Domain Smoke Test

**Repository:** `hamedharami-hub/Tradewithhamed`

**Branch:** `feat/stage8-readonly-hardening`

**Commit فعلی پیش از این گزارش:** `63a6422b8a1ed80578b5e1141408902ff459d8bb`

**Pull Request:** [PR #1](https://github.com/hamedharami-hub/Tradewithhamed/pull/1)

## خلاصهٔ امنیتی

برنامه در حالت پیش‌فرض به هیچ API آنلاین نیاز ندارد. مسیر `DETERMINISTIC` با TypeScript و قواعد قطعی بازار کار می‌کند و می‌تواند بدون کلید، دانلود مدل یا اتصال خارجی candidate را ارزیابی کند. مدل‌های WebLLM آفلاین در مرورگر و روی WebGPU اجرا می‌شوند؛ دانلود اولیهٔ مدل ممکن است به اینترنت نیاز داشته باشد، اما پس از دریافت و verify شدن، inference در مرورگر انجام می‌شود.

هیچ کلید واقعی، مقدار credential یا token در این گزارش، repository یا log تست‌ها چاپ نمی‌شود. تست‌های provider فقط وضعیت `configured/unconfigured` و نام متغیرهای missing را بررسی می‌کنند.

## معماری AI

| لایه | نوع | پیش‌فرض | نیاز به API key | محیط اجرا | نقش |
|---|---|---|---|---|---|
| Deterministic Scanner/Analyst/Critic | قطعی و آفلاین | فعال | ندارد | Node یا Browser | تشخیص ساختار، evidence و کنترل ریسک |
| WebLLM/WebGPU | مدل عصبی محلی | اختیاری | ندارد | Browser + GPU/WebGPU | advisory پس از resident شدن مدل |
| Gemini Nano | مدل داخلی Chrome | اختیاری/آزمایشی | ندارد | Chrome با `window.ai.languageModel` | inference on-device |
| OpenAI-compatible | آنلاین | غیرفعال تا زمان تنظیم | `OPENAI_API_KEY` | Node/server | advisory-only |
| Gemini API | آنلاین | غیرفعال تا زمان تنظیم | `GEMINI_API_KEY` | Node/server | advisory-only |
| xAI/Grok | آنلاین | غیرفعال تا زمان تنظیم | `XAI_API_KEY` | Node/server | advisory-only |
| Hybrid | ترکیبی | فقط با provider آنلاین فعال | متغیر | Node/server | مقایسهٔ deterministic با online |

`TRADE` از AI آنلاین یا آفلاین هرگز مجوز broker execution نیست. خروجی‌ها در قرارداد `StructuredCandidateAdvisory` دارای `advisoryOnly: true` هستند و مسیر Stage 8 به دفترکل local-only متصل است.

## تنظیمات پیش‌فرض چندعامل

تنظیم پیش‌فرض `DEFAULT_MULTI_AGENT_CONFIG` این است:

| نقش | Engine پیش‌فرض | ماهیت |
|---|---|---|
| Scanner | `s0-deterministic-scanner` | deterministic |
| Analyst | `s0-rule-analyst` | deterministic |
| Critic | `deep-critic-strict` | deterministic |
| Judge | `strict-consensus-fail-closed` | deterministic/fail-closed |

بنابراین حتی بدون API key، pipeline اصلی کار می‌کند. Engineهای WebLLM مانند Llama، Phi، Qwen و DeepSeek فقط وقتی استفاده می‌شوند که در مرورگر مدل مربوطه load و resident شده باشد؛ در غیر این صورت نتیجه `REVIEW_REQUIRED` یا `BLOCKED` است و دانلود خودکار پنهان انجام نمی‌شود.

## Registry مدل‌های آفلاین

Registry فعلی شامل این artifactهاست:

| مدل | شناسهٔ داخلی | runtime | حجم تقریبی دانلود | وضعیت |
|---|---|---|---:|---|
| S0 Deterministic | `s0-deterministic` | Core TypeScript | ۰ MB | built-in، پیش‌فرض |
| Deep Critic Strict | `deep-critic-strict` | Core TypeScript | ۰ MB | built-in |
| Gemini Nano | `chrome-gemini-nano` | Chrome Built-in | ۰ MB اضافه | experimental |
| Phi-4-mini | `phi-4-mini-instruct-mlc` | WebLLM-WebGPU | ۲۱۵۰ MB | local، non-built-in |
| DeepSeek-R1 7B | `deepseek-r1-distill-qwen-7b-mlc` | WebLLM-WebGPU | ۴۲۵۰ MB | local |
| DeepSeek-R1 14B | `deepseek-r1-distill-qwen-14b-mlc` | WebLLM-WebGPU | ۷۹۰۰ MB | experimental/heavy |
| Llama 3.2 3B | `llama-3.2-3b-instruct-mlc` | WebLLM-WebGPU | ۱۸۵۰ MB | local |
| Qwen2.5 7B | `qwen2.5-7b-instruct-mlc` | WebLLM-WebGPU | ۴۱۵۰ MB | local |
| Qwen2.5 14B | `qwen2.5-14b-instruct-mlc` | WebLLM-WebGPU | ۸۱۰۰ MB | experimental/heavy |
| SmolLM2 360M | `smollm2-360m-mlc` | WebLLM-WebGPU | ۲۲۰ MB | smoke/low-resource |
| Qwen3.5 0.8B/2B/4B | `qwen3.5-*-mlc` | WebLLM-WebGPU | registry-dependent | local/experimental |
| Qwen3 1.7B | `qwen3-1.7b-mlc` | WebLLM-WebGPU | registry-dependent | local |

مرجع کد registry: `lib/ai/browser-offline-ai.ts`. نگاشت نقش‌ها به مدل‌ها در `lib/ai/webllm-agent-adapter.ts` قرار دارد.

## کلیدها و endpointهای API

فایل نمونهٔ environment در `.env.example` قرار دارد. مقدارهای واقعی باید فقط در secret manager یا shell میزبان قرار گیرند.

### OpenAI-compatible

```bash
export OPENAI_API_KEY='کلید واقعی فقط در محیط اجرا'
export OPENAI_API_BASE='https://api.openai.com/v1'
export TRADING_OPENAI_MODEL='gpt-5-mini'
```

در این repository نام legacy `ONLINE` برای این مسیر استفاده می‌شود. اگر `OPENAI_API_KEY` یا `OPENAI_API_BASE` وجود نداشته باشد، provider با `ONLINE_PROVIDER_NOT_CONFIGURED` به‌صورت fail-closed متوقف می‌شود.

### Gemini API

```bash
export GEMINI_API_KEY='کلید واقعی فقط در محیط اجرا'
export GEMINI_API_BASE='https://generativelanguage.googleapis.com/v1beta/openai'
export TRADING_GEMINI_MODEL='gemini-2.5-flash'
```

اجرای این مسیر با `MONITOR_ANALYST_PROVIDER=GEMINI` انجام می‌شود. نبود `GEMINI_API_KEY` باعث fallback به OpenAI یا provider دیگر نمی‌شود.

### xAI / Grok

API گروک اکنون به‌صورت provider مستقل `XAI` اضافه شده و از endpoint سازگار با OpenAI استفاده می‌کند:

```bash
export XAI_API_KEY='کلید واقعی فقط در محیط اجرا'
export XAI_API_BASE='https://api.x.ai/v1'
export TRADING_XAI_MODEL='grok-4'
export MONITOR_ANALYST_PROVIDER='XAI'
```

درخواست به مسیر `${XAI_API_BASE}/chat/completions` ارسال می‌شود. خروجی فقط در صورتی advisory معتبر محسوب می‌شود که JSON ساختاریافته باشد، evidence IDها متعلق به candidate باشند، confidence حداقل ۰٫۶ باشد و risk flag خالی بماند. حتی در این وضعیت، خروجی hard authority نیست و broker write انجام نمی‌دهد.

### وضعیت providerها بدون کلید

| provider | نتیجه بدون کلید |
|---|---|
| `DETERMINISTIC` | فعال |
| `WEBLLM` در Node | `BLOCKED: WEBLLM_BROWSER_RUNTIME_REQUIRED` |
| `ONLINE` | `BLOCKED: ONLINE_PROVIDER_NOT_CONFIGURED` |
| `GEMINI` | `BLOCKED: GEMINI_PROVIDER_NOT_CONFIGURED` |
| `XAI` | `BLOCKED: XAI_PROVIDER_NOT_CONFIGURED` |
| `HYBRID` بدون Online | `BLOCKED` چون بخش آنلاین فعال نیست |

## نحوهٔ اجرای Domain Smoke Test

Runner اصلی در `scripts/run-domain-tests.ts` قرار دارد و suiteها را به‌ترتیب import و اجرا می‌کند. هر suite یک تابع `run...` export می‌کند و نتیجهٔ هر check باید `passed: true` یا `pass: true` داشته باشد. در پایان، اگر failure بیشتر از صفر باشد process با exit code 1 متوقف می‌شود.

دستور کامل:

```bash
npm ci
npm run typecheck
npm run lint
npm run test:domain
```

برای اجرای فقط smoke مربوط به AI و provider:

```bash
npm run test:domain
```

و در خروجی suite زیر را جست‌وجو کنید:

```text
[PASS] ../lib/ai/__tests__/offline-ai-safety.test: 6/6
```

این suite موارد زیر را بررسی می‌کند:

| check | هدف |
|---|---|
| Missing evidence | بدون sweep/FVG/context خروجی نباید `TRADE` شود |
| Complete deterministic evidence | advisory قطعی معتبر ولی همچنان advisory-only بماند |
| Unsupported WebLLM artifact | مدل پشتیبانی‌نشده قبل از load رد شود |
| Server runtime | Node ادعای resident بودن مدل مرورگر نکند |
| Synchronous neural profile | inference عصبی sync به‌جای جعل نتیجه fail-closed شود |
| Online provider opt-in | OpenAI/Gemini/xAI بدون key unconfigured بمانند |

Suiteهای اضافه‌شدهٔ Stage 8 نیز شامل allowlist cTrader، دفترکل Paper-Forward و تحلیل Bootstrap هستند.

## خروجی اجرای اخیر

آخرین اجرای محلی این وضعیت را ثبت کرد:

```text
[PASS] 22 suite
checks: 123
failures: 0
```

جزئیات suiteهای مهم:

```text
[PASS] ../lib/gateway/__tests__/readonly-ctrader.test: 8/8
[PASS] ../lib/ai/__tests__/offline-ai-safety.test: 6/6
[PASS] ../lib/research/__tests__/paper-forward-ledger.test: 5/5
[PASS] ../lib/research/__tests__/stage8-analysis.test: 4/4
Suites: 22; checks: 123; failures: 0
```

همچنین `npm run typecheck` و `npm run lint` بدون خطا تمام شدند. smoke بدون credential برای monitor Stage 8 با `BLOCKED` و `brokerWrites:false` پایان یافت؛ بنابراین در این بررسی هیچ API خارجی یا broker endpoint فراخوانی نشد.

## هماهنگی با GitHub

وضعیت فعلی:

- Branch: `feat/stage8-readonly-hardening`
- Commit: `63a6422b8a1ed80578b5e1141408902ff459d8bb`
- Branch با `origin/feat/stage8-readonly-hardening` همگام است.
- PR باز و clean است: [PR #1](https://github.com/hamedharami-hub/Tradewithhamed/pull/1)
- artifactهای `data/` به‌دلیل ignored بودن commit نشده‌اند.
- هیچ secret یا API key واقعی commit نشده است.

پس از اضافه شدن این گزارش، commit جدید ساخته و به همان branch/PR push می‌شود. اجرای ۳۰روزه و هر نوع Live Trading همچنان انجام نشده است.

## محدودیت‌ها و توصیهٔ عملی

قبل از فعال‌سازی provider آنلاین، ابتدا با `DETERMINISTIC` baseline را اجرا کنید. سپس هر provider آنلاین را در یک run مستقل، با report جداگانه و timestampدار اجرا کنید. از قرار دادن چند کلید در یک فایل Git، چاپ environment، یا استفاده از provider آنلاین به‌عنوان مجوز سفارش خودداری شود.
