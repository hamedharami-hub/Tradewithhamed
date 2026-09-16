# AI Runtime Optimization — Phase 4 Report

**Date:** 2026-09-16  
**Branch:** `ai-runtime-optimization-v1`  
**Scope:** model lifecycle, generation timeout/cancellation, error classification, cached fallback, and cleanup hardening.

## 1. What was inspected

- WebLLM worker/direct-engine load, generation, abort, unload, and error paths.
- LiteRT artifact download cancellation, engine creation, streaming conversation, and deletion paths.
- Runtime Router error handling and Phase 2 provenance behavior.
- Single-resident-model enforcement and cached-model detection.
- Existing timeout, cancellation, OOM-like, fallback, and stale-engine test coverage.

## 2. Problems addressed

1. WebLLM and LiteRT generation had no hard deadline.
2. WebLLM cancellation was checked only after another stream chunk arrived, so a stalled iterator could remain pending.
3. External callers could not supply an `AbortSignal` through the runtime-neutral request.
4. Provider failures were collapsed into a generic runtime error, preventing safe OOM-specific policy.
5. No smaller-model recovery path existed.
6. Cached fallback loading could be rejected by free-storage checks even though it required no new download.
7. Fallback provenance did not identify requested versus actually executed model.

## 3. Changes made

### Generation deadline and cancellation

`AIRequest` now accepts `signal`, `timeoutMs`, and `allowFallback`. WebLLM and LiteRT use a 45-second default generation deadline, constrained to at least one second when overridden.

Streaming reads race against both the deadline and an AbortSignal. Timeout and cancellation therefore settle even when the model stream stops producing chunks. Both paths still run their existing `finally` cleanup and release the manager operation lock.

### Typed runtime error classification

The browser providers classify failures into:

- `GENERATION_TIMEOUT`;
- `GENERATION_CANCELLED`;
- `OUT_OF_MEMORY` (including allocation/device-loss patterns);
- `RUNTIME_GENERATION_FAILED`.

Cancellation and timeout always fail closed and never trigger an automatic model switch.

### Cached smaller-model fallback

An OOM may trigger a smaller WebLLM candidate only when all of the following hold:

- fallback was not explicitly disabled;
- the candidate uses the same WebLLM runtime;
- it is smaller than the requested model;
- it is not experimental;
- its complete artifact is already cached;
- it can load and generate successfully.

No fallback path downloads a model silently. Candidates are attempted from closest-smaller to smallest. If none succeeds, the original OOM returns `REVIEW_REQUIRED`.

A successful fallback records:

- original `requestedModelId`;
- actual `executedModelId`;
- `fallbackUsed: true`;
- `fallbackReason: OUT_OF_MEMORY`;
- actual inference status and latency from the fallback response.

### Lifecycle and cleanup

- Existing single-resident-model switching remains enforced through `disposeActiveEngine()` before another engine becomes resident.
- Cached fallback loading uses an explicit cache-only entry point.
- Download-readiness checks no longer require spare download quota when the complete artifact is already cached.
- WebLLM workers, engines, LiteRT conversations, LiteRT engines, and the global LiteRT runtime continue through centralized best-effort cleanup.

## 4. Files changed

- `lib/ai/runtime-contracts.ts`
- `lib/ai/runtime-providers.ts`
- `lib/ai/runtime-router.ts`
- `lib/ai/browser-offline-ai.ts`
- `lib/ai/__tests__/runtime-router.test.ts`

## 5. Tests executed

| Command | Result |
|---|---|
| `npm test` | PASS — 49 suites, 261 checks, 0 failures. |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — production compilation, type validation, static generation, and `ensure-css` completed. |

Focused tests cover OOM-like failure, smaller cached fallback, requested/executed model provenance, cancellation without fallback, and timeout without fallback.

## 6. Remaining known problems

- Browser APIs and the WebLLM public stream API do not guarantee immediate GPU-kernel interruption; cancellation stops application-level waiting and rejects the result, while final device reclamation remains runtime-controlled.
- OOM detection uses known browser/runtime error patterns and should be expanded with measured device failures in Phase 7.
- LiteRT engine creation remains non-cancellable after artifact completion because the upstream operation does not expose a safe cancellation contract.
- The async Agent Council still requires a Phase 5 policy for sequentially loading different analyst and critic models.
- Real GPU/Pixel/Snapdragon lifecycle stress testing remains outstanding.

## 7. Commit

The Phase 4 commit SHA is reported with final delivery after the commit is created.

## 8. Phase 5 proposal

Phase 5 will make Agent Council execution/provenance complete: trace each role, distinguish deterministic and neural roles in the result contract, support explicit sequential execution policy where appropriate, preserve fail-closed judgment, and ensure every displayed runtime/model corresponds to inference that actually occurred.
