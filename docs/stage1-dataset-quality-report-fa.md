# Stage 1 Dataset Quality Report

Generated: 2026-09-09T01:59:44.177Z

| File | Provider | Symbol | TF | Status | Start UTC | End UTC | Bars | Rejected | Duplicates | Gaps |
|---|---|---|---|---|---|---|---:|---:|---:|---:|
| data/datasets/eurusd-yahoo-1d-10y.dataset.json | Yahoo Finance | EURUSD | D1 | PARTIAL | 2016-09-08T23:00:00.000Z | 2026-09-08T23:00:00.000Z | 2534 | 67 | 0 | 0 |
| data/datasets/eurusd-yahoo-5m-1mo.dataset.json | Yahoo Finance | EURUSD | 5M | PARTIAL | 2026-08-09T23:00:00.000Z | 2026-09-08T23:35:00.000Z | 6272 | 1 | 0 | 0 |
| data/datasets/eurusd-yahoo-5m-60d.dataset.json | Yahoo Finance | EURUSD | 5M | PARTIAL | 2026-07-12T23:00:00.000Z | 2026-09-08T23:50:00.000Z | 11956 | 1 | 0 | 1 |
| data/datasets/gc-f-yahoo-1d-10y.dataset.json | Yahoo Finance | GC=F | D1 | READY | 2016-09-08T04:00:00.000Z | 2026-09-08T23:27:10.000Z | 2512 | 0 | 0 | 0 |
| data/datasets/histdata-eurusd-1m-2024.dataset.json | HistData | EURUSD | 1M | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T21:58:00.000Z | 372379 | 0 | 0 | 316 |
| data/datasets/histdata-gbpusd-1m-2024.dataset.json | HistData | GBPUSD | 1M | PARTIAL | 2024-01-01T22:00:00.000Z | 2024-12-31T21:58:00.000Z | 372047 | 60 | 60 | 386 |
| data/datasets/histdata-usdjpy-1m-2024.dataset.json | HistData | USDJPY | 1M | PARTIAL | 2024-01-01T22:00:00.000Z | 2024-12-31T21:58:00.000Z | 372023 | 60 | 60 | 290 |
| data/datasets/histdata-xauusd-1m-2024.dataset.json | HistData | XAUUSD | 1M | PARTIAL | 2024-01-01T23:00:00.000Z | 2024-12-31T21:57:00.000Z | 355592 | 60 | 60 | 215 |
| data/datasets/histdata/histdata-eurusd-15m-2024.dataset.json | HistData-aggregated | EURUSD | 15M | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T21:30:00.000Z | 24969 | 0 | 0 | 5 |
| data/datasets/histdata/histdata-eurusd-1h-2024.dataset.json | HistData-aggregated | EURUSD | 1H | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T20:00:00.000Z | 6242 | 0 | 0 | 2 |
| data/datasets/histdata/histdata-eurusd-5m-2024.dataset.json | HistData-aggregated | EURUSD | 5M | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T21:50:00.000Z | 74887 | 0 | 0 | 10 |
| data/datasets/histdata/histdata-gbpusd-15m-2024.dataset.json | HistData-aggregated | GBPUSD | 15M | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T21:30:00.000Z | 24967 | 0 | 0 | 8 |
| data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json | HistData-aggregated | GBPUSD | 1H | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T20:00:00.000Z | 6242 | 0 | 0 | 1 |
| data/datasets/histdata/histdata-gbpusd-5m-2024.dataset.json | HistData-aggregated | GBPUSD | 5M | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T21:50:00.000Z | 74875 | 0 | 0 | 17 |
| data/datasets/histdata/histdata-usdjpy-15m-2024.dataset.json | HistData-aggregated | USDJPY | 15M | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T21:30:00.000Z | 24906 | 0 | 0 | 9 |
| data/datasets/histdata/histdata-usdjpy-1h-2024.dataset.json | HistData-aggregated | USDJPY | 1H | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T20:00:00.000Z | 6226 | 0 | 0 | 4 |
| data/datasets/histdata/histdata-usdjpy-5m-2024.dataset.json | HistData-aggregated | USDJPY | 5M | READY | 2024-01-01T22:00:00.000Z | 2024-12-31T21:50:00.000Z | 74698 | 0 | 0 | 14 |
| data/datasets/histdata/histdata-xauusd-15m-2024.dataset.json | HistData-aggregated | XAUUSD | 15M | READY | 2024-01-01T23:00:00.000Z | 2024-12-31T21:30:00.000Z | 23712 | 0 | 0 | 208 |
| data/datasets/histdata/histdata-xauusd-1h-2024.dataset.json | HistData-aggregated | XAUUSD | 1H | READY | 2024-01-01T23:00:00.000Z | 2024-12-31T20:00:00.000Z | 5932 | 0 | 0 | 8 |
| data/datasets/histdata/histdata-xauusd-5m-2024.dataset.json | HistData-aggregated | XAUUSD | 5M | READY | 2024-01-01T23:00:00.000Z | 2024-12-31T21:50:00.000Z | 71132 | 0 | 0 | 209 |

## Interpretation

- `READY` means no rejected bars remained after the repository validator; it does not mean the provider is identical to a broker feed.
- `PARTIAL` means the raw source contained duplicate or invalid records and the rejected records were excluded rather than silently accepted.
- Gaps are reported for research review; weekend gaps are excluded from the non-weekend gap count.
