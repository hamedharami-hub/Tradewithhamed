# AI Runtime Optimization — Phase 7 Production Readiness Report

**Date:** 2026-09-16  
**Branch:** `ai-runtime-optimization-v1`  
**Scope:** privacy-safe runtime diagnostics, benchmark telemetry, failure-matrix verification, and final production checks.

## 1. What was inspected

- Existing WebLLM/LiteRT load and streaming measurements.
- Runtime router success, failure, cancellation, timeout, invalid-model, and OOM fallback paths.
- Model-manager hardware, cache, runtime, and offline-state UI.
- Service-worker app-shell diagnostic event.
- Full domain test runner, lint, typecheck, production build, and available browser tooling.

## 2. Problems addressed

1. TTFT and generation rate were visible only in the latest test result and were not available in a bounded diagnostic history.
2. Model load duration was not reported in an advanced diagnostic view.
3. Router fallbacks had truthful provenance but no common performance record.
4. Browser, platform, WebGPU, connectivity, selected/resident model, runtime state, and app-shell cache status were not combined in one support snapshot.
5. A help paragraph overstated cache presence as guaranteed offline operation.
6. Diagnostic requirements needed an explicit privacy boundary so prompts, evidence, prices, symbols, and account data could never enter the report shape.

## 3. Implementation

### Privacy-safe bounded diagnostics

`runtime-diagnostics.ts` defines a metadata-only snapshot and retains at most 20 in-memory metrics. It records operation kind, runtime/model identifier, success, duration, TTFT, chunk rate, and explicit fallback metadata. It does not accept prompt, evidence, symbol, price, position, order, or account fields and does not persist metrics to storage.

The browser is reduced to a family label and platform string rather than storing the full user-agent. The snapshot also reports WebGPU availability, online/offline state, selected/resident model, runtime lifecycle state, and the service worker's app-shell cache result.

### Router and benchmark integration

Every router result—real neural execution, deterministic advisory, unavailable result, or cached OOM fallback—now emits a diagnostic metric from its already-truthful provenance. Fallback use and reason therefore remain visible without inspecting generated content.

The model manager records load duration and local-test latency/TTFT/chunk rate. An Advanced Diagnostics panel shows current capability/runtime state and the bounded metric table. The panel is opt-in and avoids normal-interface overload.

### Offline copy correction

The guide now states that cache presence alone is insufficient. `OFFLINE_VERIFIED` still requires a successful disconnected probe against the current artifact revision.

## 4. Failure matrix

| Scenario | Expected behavior | Automated coverage |
|---|---|---|
| WebGPU unavailable | Capability unavailable; deterministic path remains usable | Existing safety/router tests |
| Invalid model ID | Fail closed with `MODEL_NOT_CONFIGURED` | Router test |
| Model not resident | Fail closed with `MODEL_NOT_RESIDENT` | Router test |
| Download/cache failure | Explicit load failure; no false readiness | Offline state/safety tests |
| Corrupt cache | Remove affected model cache and verification; require re-download | Static/runtime policy plus Phase 6 implementation |
| OOM-like generation failure | Try only a smaller already-cached compatible model; record fallback | Router test |
| Cancellation | Fail closed; do not model-fallback | Router test |
| Timeout | Fail closed; do not model-fallback | Router test |
| Deterministic advisory | Truthful deterministic provenance; no neural claim | Agent/council tests |
| Offline state transitions | Distinct download/cache/load/ready/verified/error states | Offline state test |
| Diagnostic privacy/bounds | Metadata-only shape; maximum 20 metrics | New diagnostics test |

## 5. Production validation

| Command | Result |
|---|---|
| `npm test` | PASS — 51 suites, 273 checks, 0 failures |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## 6. Hardware/browser verification status

The code-level production gate passes, but actual model performance cannot be fabricated from this container. No Chromium executable or WebGPU adapter is available here, so Pixel 9 Pro Fold and Windows-on-Snapdragon measurements remain **UNVERIFIED ON TARGET HARDWARE**.

Before production promotion, run the Advanced Diagnostics panel on each target with a cached FAST and BALANCED model and record:

1. cold and warm load time;
2. TTFT and chunk rate;
3. generation latency and cancellation response;
4. offline cold restart and `OFFLINE_VERIFIED` result;
5. memory/device-loss behavior and explicit cached fallback;
6. app-shell cache status after service-worker update.

No NPU use may be claimed: the browser path remains WebLLM/LiteRT over WebGPU unless runtime evidence proves otherwise.

## 7. Remaining known limitations

- The displayed streaming rate is `chunks/s`, not tokenizer-derived tokens/s; the unit is deliberately explicit.
- Metrics are intentionally tab-memory-only and reset on reload.
- LiteRT remains experimental and cannot be offline verified while its runtime bootstrap is CDN-dependent.
- Browser cold-start, GPU memory pressure, and real throughput require physical target hardware.
- Phase completion does not authorize merging to `main` or enabling automated execution; trading risk and broker controls remain deterministic.

## 8. Release decision

**Code readiness: PASS. Target-hardware performance certification: PENDING.** The branch is suitable for review and device validation, but production claims about offline reliability or performance must wait for the target-device checklist above.
