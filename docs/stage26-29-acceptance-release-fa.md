# گزارش مراحل 26 تا 29: Acceptance، Paper-Forward read-only و Release

## وضعیت اجرایی

پس از Stage 25، چهار مرحلهٔ نهایی برنامه اجرا شد: Acceptance Gate و Stability Selection، اتصال وضعیت پذیرش به Research Desk، ساخت artifact تاریخی Paper-Forward read-only و release hardening. هیچ سفارش واقعی، broker write، تغییر حساب یا Live Trading در این مراحل انجام نشد.

## Stage 26 — Acceptance Gate

Acceptance Gate با معیارهای صریح ساخته شد:

- حداقل ۳۰ معاملهٔ OOS؛
- سود خالص OOS مثبت؛
- Profit Factor حداقل 1.05؛
- افت سرمایه حداکثر ۸٪؛
- حداقل دو سناریوی Cost Stress مثبت؛
- ثبات حداقل ۶۰٪ foldها؛
- محدود بودن شکاف train/OOS.

نتیجهٔ اجرای gate روی artifactهای Stage 24 و Stage 25:

| Candidate | وضعیت | امتیاز | تصمیم |
|---|---|---:|---|
| EURUSD/4H optimized | `REJECTED` | 10/100 | OOS منفی و Cost Stress منفی |
| BTCUSD/D1 optimized | `PAPER_FORWARD_ELIGIBLE` | 100/100 | فقط برای replay تاریخی read-only |
| GBPUSD/4H transferred | `REJECTED` | 86/100 | WF مستقل و ثبات fold کافی موجود نیست |
| USDJPY/4H transferred | `REJECTED` | 86/100 | WF مستقل و ثبات fold کافی موجود نیست |

`PAPER_FORWARD_ELIGIBLE` به معنی مجاز بودن برای Paper-Forward تاریخی read-only است، نه مجوز معاملهٔ زنده یا broker write.

## Stage 27 — Research Desk

Research Desk اکنون پس از اجرای Optimize + WF، کارت فارسی Acceptance Gate را نمایش می‌دهد. این کارت شامل وضعیت candidate، امتیاز، OOS PnL، تعداد معاملات، سناریوهای stress مثبت، ثبات fold و دلیل تصمیم است. هشدار UI صریحاً اعلام می‌کند که نتیجه فقط پژوهشی است و مجوز معاملهٔ زنده نیست.

در مسیر مرورگر، Cost Stress کامل artifactمحور جایگزین نشده است؛ بنابراین نتیجهٔ UI محلی باید به‌عنوان gate مقدماتی تفسیر شود. gate کامل Stage 26 از artifactهای مستقل و سناریوهای stress استفاده می‌کند.

## Stage 28 — Paper-Forward تاریخی read-only

فقط BTCUSD/D1 که gate آن را eligible اعلام کرد، به artifact Paper-Forward تاریخی وارد شد. پنج رخداد خلاصهٔ fold تولید شد. هر رخداد شامل پنجرهٔ train، پنجرهٔ OOS، پارامتر منتخب، PnL فرضی، Profit Factor، افت سرمایه و پرچم‌های زیر است:

- `hypothetical: true`
- `brokerWrites: false`
- `orderSubmitted: false`
- `decision: READ_ONLY_REPLAY_SUMMARY`

این artifact خلاصهٔ replay تاریخی OOS است و feed زنده یا سفارش فرضی جدیدی به broker ارسال نمی‌کند.

## Stage 29 — Release Hardening

validation نهایی شامل typecheck، domain tests، build تولیدی و بررسی وجود artifactهاست. suite دامنه اکنون ۲۵ suite و ۱۳۶ check دارد و همهٔ checkها موفق هستند. آخرین build تولیدی باید بدون خطای TypeScript یا compile پایان یابد و شاخهٔ Git پس از commit clean باقی بماند.

## وضعیت پایان برنامه

نسخهٔ فعلی برای این کارها آماده است:

- Backtest و Replay؛
- OOS و Walk-Forward؛
- Parameter Optimization کنترل‌شده؛
- Cost Stress؛
- Acceptance Gate؛
- Paper-Forward تاریخی read-only برای candidateهای مجاز.

این موارد هنوز خارج از محدوده هستند:

- Live Trading؛
- broker write؛
- promotion استراتژی؛
- ادعای سودآوری آینده؛
- استفاده از BTCUSD با مدل هزینهٔ broker-specific تأییدنشده.

## Artifactها

- `data/runs/stage26-acceptance-gate.json`
- `data/runs/stage28-historical-paper-forward-readonly.json`
- `docs/stage26-29-acceptance-release-fa.md`

فرمان‌های بازتولید:

```bash
npm run research:stage26:acceptance-gate
npm run research:stage28:paper-forward-readonly
npm run typecheck
npm run test:domain
npm run build
```
