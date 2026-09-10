# Stage 17: Preflight پایش read-only سی‌روزه

## نتیجهٔ preflight

`typecheck` موفق شد، اما preflight cTrader به‌درستی fail-closed متوقف شد؛ زیرا در این نشست هیچ connector یا credential مربوط به cTrader وجود ندارد.

| کنترل | وضعیت |
|---|---|
| Demo environment | رد |
| Read-only run flag | رد |
| Read-only require flag | رد |
| Live enable disabled | صحیح |
| Fixed JSON endpoint | صحیح |
| Credentials present | رد |
| Forbidden write signals | ۰ |
| Connection ready | خیر |
| Read-only safe | خیر؛ اجرا مسدود شد |

هیچ اتصال cTrader برقرار نشد و هیچ broker write یا live trading انجام نشد.

## علت توقف

برای اجرای واقعی پایش سی‌روزه به credential و endpoint Demo read-only نیاز است. وضعیت فعلی `configured=false` است و preflight دلیل زیر را ثبت کرد:

`CTRADER_READ_ONLY_PREFLIGHT_FAILED:demoEnvironment,readOnlyRunFlag,readOnlyRequireFlag,credentialsPresent`

## مسیر ادامه

پس از فراهم‌شدن credential، اجرای مجاز باید فقط با این قیود آغاز شود:

- محیط Demo؛
- پورت JSON ثابت read-only؛
- `RUN_CTRADER=true`؛
- `REQUIRE_CTRADER=true`؛
- `CTRADER_LIVE_ENABLE` خاموش یا false؛
- نماد `GBPUSD` و تایم‌فریم `4H`؛
- `MONITOR_ANALYST_PROVIDER=DETERMINISTIC` یا advisory آفلاین؛
- خروجی JSONL روزانه؛
- توقف خودکار در صورت هر write signal یا هر نقض preflight.

تا زمانی که این مقادیر امن و credentialها فراهم نشوند، فقط replay تاریخی Stage 16 معتبر است و اجرای live read-only شروع نمی‌شود.

## وضعیت مراحل

توسعه، اعتبارسنجی و replay تاریخی تکمیل شده‌اند. برای اجرای عملیاتی سی‌روزه هنوز دو مرحله باقی است:

1. فراهم‌کردن و preflight موفق credential/endpoint Demo read-only؛
2. اجرای پایش دوره‌ای و تحلیل پایان دوره.

این Gate اختیاری و وابسته به credential خارجی است؛ Live Trading و broker write همچنان خارج از دامنه هستند.
