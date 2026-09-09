# گزارش شواهد مبنا و یکپارچگی آرشیوهای انتقالی (مرحلهٔ A)

این سند گزارش رسمی اجرای **مرحلهٔ A (تثبیت و ممیزی مبنا و آرشیوهای انتقالی)** بر اساس برنامهٔ مصوب Hardening و آماده‌سازی PR برای Paper-Forward در Tradewithhamed است.

---

## ۱. تثبیت و انطباق وضعیت مخزن (Git Baseline Pin)

* **شاخهٔ کاری:** `main`
* **کامیت مبنای تثبیت‌شده:** `bf8dbb61d3cb02e44f073a830c5827ab5b23ad6c`
* **عنوان کامیت:** `docs: correct handoff commit reference`
* **ارجاع Handoff:** کامیت `df39976d7a9b21f8eab80fe934bc1f5a60db2dd0`
* **وضعیت شاخه نسبت به Remote:** کاملاً به‌روز و همگام با `origin/main` (بدون هیچ‌گونه drift ناخواسته)
* **وضعیت فایل‌های کاری:** پاک و پایدار (Clean working tree)

---

## ۲. ممیزی و تطبیق فایل‌های انتقالی (Archive Integrity & Checksum)

فایل آرشیو دستاوردهای پژوهشی و مانیفست چک‌سام آن در مسیر مجاز ارزیابی شد:

* **نام فایل آرشیو:** `Tradewithhamed-handoff-artifacts-20260909.tar.gz`
* **اندازهٔ دقیق فایل:** **۳۸٬۴۵۱ بایت** (کاملاً منطبق بر مقدار ثبت‌شده در سند برنامه)
* **الگوریتم رمزنگاری هش:** `SHA-256`
* **هش مانیفست مرجع:**
  ```text
  5c7100a1bd52afa1428882a005dc25c6cfed6fd25c3778305d316445973523a6
  ```
* **نتیجهٔ راستی‌آزمایی هش:** `MATCH (100% VERIFIED)`

---

## ۳. سیاهه و ارزیابی محتوای آرشیو (Artifact Inventory)

پیش از استخراج، ساختار درونی آرشیو با دستور `tar -tzf` ارزیابی شد و دقیقاً با فهرست ۱۲ فایل مورد انتظار در سند `docs/account-handoff-private-artifacts-fa.md` مطابقت کامل داشت:

| ردیف | مسیر فایل استخراج‌شده | حجم (کاراکتر) | کلیدهای اصلی | وضعیت پارس JSON |
|:---:|:---|:---:|:---:|:---:|
| ۱ | `data/datasets/stage1-dataset-quality.json` | ۱۱٬۴۴۴ | ۲ | موفق |
| ۲ | `data/runs/stage3-bootstrap-analysis.json` | ۱۰٬۹۱۹ | ۶ | موفق |
| ۳ | `data/runs/stage7-hybrid-depth-analysis.json` | ۴٬۷۹۰ | ۵ | موفق |
| ۴ | `data/runs/stage7-ctrader-readonly-diagnostics.json` | ۲٬۰۵۶ | ۸ | موفق (پس از هدر CLI) |
| ۵ | `data/runs/stage7-common-gbpusd-15m-2020-2024-all-modes.json` | ۳۸٬۶۱۸ | ۱۰ | موفق |
| ۶ | `data/runs/stage7-common-gbpusd-15m-2020-2024-candidates.json` | ۲۰۰٬۶۲۹ | ۶ | موفق |
| ۷ | `data/runs/stage7-common-gbpusd-1h-2020-2024-all-modes.json` | ۲۲٬۵۵۳ | ۱۰ | موفق |
| ۸ | `data/runs/stage7-common-gbpusd-1h-2020-2024-candidates.json` | ۱۲۸٬۲۱۴ | ۶ | موفق |
| ۹ | `data/runs/stage5-provider-benchmark.json` | ۲۵٬۶۹۵ | ۸ | موفق |
| ۱۰ | `data/runs/stage3-gbpusd-provider-benchmark.json` | ۸٬۹۶۶ | ۱۰ | موفق |
| ۱۱ | `data/runs/stage3-eurusd-provider-benchmark-v2.json` | ۸٬۵۹۸ | ۱۰ | موفق |
| ۱۲ | `data/runs/stage3-xauusd-provider-benchmark-v2.json` | ۸٬۶۱۱ | ۱۰ | موفق |

تمام این فایل‌ها در مسیر `data/` استخراج شدند که بر اساس قوانین `.gitignore`، به‌صورت محلی نادیده گرفته می‌شوند و هرگز وارد مخزن نمی‌شوند.

---

## ۴. ممیزی امنیتی و نشت اطلاعات محرمانه (Secret Scan)

کلیه فایل‌های JSON استخراج‌شده با عبارات باقاعدهٔ حساس به الگوهای محرمانه (`password`, `client_secret`, `access_token`, `private_key`, `api_key`, `bearer tokens`) اسکن شدند.
* **نتیجهٔ بررسی نشت سکرت:** **منفی (هیچ سکرت، توکن یا اعتباری در آرشیوها وجود ندارد).**
* **سیاست ایزولاسیون:** هیچ فایلی از داده‌های حجیم ۱.۲۳ گیگابایتی یا کلیدهای محیطی در مخزن بارگذاری نخواهد شد.

---

## ۵. نتیجهٔ نهایی و شرط عبور مرحلهٔ A

شرایط عبور مرحلهٔ A بر اساس چک‌لیست برنامه:
1. `[x]` قفل شدن Git به کامیت دقیق `bf8dbb61d3cb02e44f073a830c5827ab5b23ad6c`
2. `[x]` تطابق ۱۰۰٪ هش آرشیو انتقالی (۳۸٬۴۵۱ بایت و چک‌سام SHA-256)
3. `[x]` تطابق کامل سیاههٔ ۱۲ فایل گزارش و صحت اسکیما
4. `[x]` تأیید عدم نشت Secret و قرارگیری امن در مسیرهای Ignored

**وضعیت:** **مرحلهٔ A به‌طور کامل پاس شد و پروژه آمادهٔ اجرای مرحلهٔ B (اجرای آزمون‌های مبنای پایه) است.**
