# گزارش آماده‌سازی Stage 8: Hardening مسیر Paper-Forward read-only

**تاریخ:** ۹ سپتامبر ۲۰۲۶

**commit مبنا:** `bf8dbb61d3cb02e44f073a830c5827ab5b23ad6c`
**وضعیت:** آمادهٔ validation محلی و PR؛ monitor سی‌روزه هنوز شروع نشده است.

## بررسی انتقال و artifactها

archive انتقالی `Tradewithhamed-handoff-artifacts-20260909.tar.gz` با SHA-256 زیر تأیید شد:

```text
5c7100a1bd52afa1428882a005dc25c6cfed6fd25c3778305d316445973523a6
```

manifest انتقال مسیر مطلق ماشین قبلی را ثبت کرده بود. بنابراین `sha256sum --check` در workspace جدید فقط به‌خاطر نبود آن مسیر شکست می‌خورد، درحالی‌که hash مستقیم archive دقیقاً با manifest برابر است. archive در `data/` که توسط Git نادیده گرفته می‌شود استخراج شد و شامل ۱۲ artifact گزارش کوچک است؛ dataset حجیم در آن وجود ندارد و دانلود یا benchmark مجدد انجام نشده است.

| بررسی | نتیجه |
|---|---|
| فهرست archive | ۱۲ artifact مطابق فهرست handoff |
| JSON parse | ۱۱ فایل JSON معتبر |
| artifact نامعتبر | `data/runs/stage7-ctrader-readonly-diagnostics.json` در واقع خروجی ترکیبی command/log است، نه JSON خالص؛ فقط به‌عنوان شاهد انتقال نگهداری شد و به‌عنوان ورودی تحلیلی استفاده نمی‌شود |
| dataset حجیم | منتقل یا بازسازی نشد |
| benchmark سنگین | اجرا نشد |

## تغییرات hardening

PR مسیر مستقلی به نام `research:monitor:stage8:readonly` ایجاد می‌کند. این مسیر از gateway عمومیِ دارای متدهای write استفاده نمی‌کند. transport اختصاصی فقط پیام‌های authentication، account list، symbol discovery، heartbeat و subscription قیمت را allowlist می‌کند. `NEW_ORDER_REQUEST` (`2106`) و هر payload ناشناخته قبل از I/O شبکه مسدود می‌شوند.

اجرای واقعی فقط با `CTRADER_ENVIRONMENT=demo`، `RUN_CTRADER=1`، `REQUIRE_CTRADER=1`، `CTRADER_LIVE_ENABLE=false`، host `demo.ctraderapi.com`، port JSON `5036`، credentialهای کامل و OAuth view-only مجاز است. cTrader، محیط Demo و Live را جدا می‌کند و JSON را فقط روی `5036` می‌پذیرد. [1]

`BTCUSD` به `SymbolId` و metadata پژوهشی اضافه شد، اما monitor آن را فقط پس از symbol discovery حساب Demo subscribe می‌کند. نبود BTCUSD به `SYMBOL_UNAVAILABLE`/`unavailable` تبدیل می‌شود و ID ثابت ندارد.

دفترکل جدید Stage 8 کاملاً local-only است. positionهای فرضی با candle بستهٔ بعدی باز می‌شوند، با SL/TP/expiry بسته می‌شوند، برای برخورد هم‌زمان SL/TP سیاست بدبینانه دارند و PnL/commission/drawdown را ثبت می‌کنند. این دفترکل هیچ import یا API برای broker execution ندارد.

## معیارهای validation

نوع‌های TypeScript و test suiteهای domain قبل از hardening در وضعیت ۱۹ suite، ۱۰۵ check و صفر failure بودند. hardening suiteهای جداگانه برای preflight، allowlist، symbol discovery، دفترکل، Bootstrap analysis و provider opt-in اضافه می‌کند. نتیجهٔ نهایی validation در PR ثبت می‌شود.

## References

[1]: https://help.ctrader.com/open-api/proxies-endpoints/ "cTrader Open API: Proxies and endpoints"
