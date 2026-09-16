# AI Runtime Optimization — Phase 2 Report

**Date:** 2026-09-16  
**Branch:** `ai-runtime-optimization-v1`  
**Scope:** runtime abstraction and truthful provenance only; model catalogue optimization remains Phase 3.

## 1. What was inspected

- Phase 1 audit findings AI-01, AI-02, AI-05, and AI-16.
- Every direct `BrowserOfflineAIManager` consumer in agent, advisory, UI, and browser-harness code.
- Existing advisory contracts, model/runtime catalogue, WebLLM and LiteRT lifecycle APIs.
- Synchronous and asynchronous Analyst/Critic and four-agent council paths.
- AI safety tests, Agent Council tests, and the domain test runner.

## 2. Problems addressed

1. Business/agent code depended directly on the WebLLM/LiteRT manager.
2. `source: WEBLLM_WEBGPU` could describe an intended runtime even when inference never ran.
3. There was no runtime-neutral provider contract or explicit model-to-runtime router.
4. Deterministic advisory calculation lived inside the browser runtime manager.
5. The synchronous council returned deterministic templates decorated with neural engine metadata.
6. The domain test runner completed all checks but remained alive because imported modules retained handles.

## 3. Architecture implemented

```text
Agent / Advisory business logic
             │
             ▼
      AIRuntimeRouter
             │ explicit model.runtime mapping
      ┌──────┼───────────┬────────────────┐
      ▼      ▼           ▼                ▼
  WebLLM  LiteRT-Web  Deterministic  Chrome Built-in
  adapter   adapter      provider      unavailable provider
      │      │
      └── BrowserOfflineAIManager compatibility facade
```

The router chooses a provider from the model's declared `runtime`; it never infers compatibility from the model family or manufacturer. Chrome built-in AI is represented truthfully as unavailable. WebLLM and LiteRT remain separate providers even though their lifecycle implementation is temporarily hosted by the existing browser manager.

## 4. Important changes and rationale

### Runtime-neutral contracts

`runtime-contracts.ts` defines capabilities, health, request/response, provider lifecycle, and typed runtime errors. This is the stable boundary future web or native providers can implement without changing agent business logic.

### Explicit router and providers

`runtime-router.ts` maps each catalogue runtime to exactly one provider. Unsupported models, missing providers, non-resident models, and generation failures return fail-closed advisory results instead of claiming inference.

`runtime-providers.ts` contains WebLLM, LiteRT-Web, deterministic, and explicitly unsupported Chrome adapters. The browser adapters preserve the existing, functioning download/cache/worker implementation rather than rewriting it in Phase 2.

### Mandatory provenance

Every structured advisory now includes:

```ts
{
  provider,
  runtime,
  requestedModelId,
  executedModelId,
  inferenceExecuted,
  fallbackUsed,
  fallbackReason,
}
```

Actual WebLLM/LiteRT and online generation set `inferenceExecuted: true`. Deterministic output and unavailable/runtime-error results set it to false. A missing or non-resident neural model therefore cannot be represented as successful inference.

### Deterministic extraction

The pure deterministic advisory function moved to `deterministic-advisory.ts`. `BrowserOfflineAIManager.buildDeterministicAdvisory()` remains as a compatibility facade, while the deterministic provider can execute without depending on WebLLM APIs.

### Business-logic migration

The WebLLM agent adapter, agentic reviewer, and advisory provider now request generation through the router. Model-management UI and browser harnesses continue to use the manager facade for detailed download/cache controls; migrating those lifecycle controls is intentionally incremental.

### Truthful synchronous council

When a neural engine is selected in the synchronous council, the relevant review is now `NEUTRAL`, has zero confidence/latency, and carries `NEURAL_ASYNC_REQUIRED`. It no longer emits a deterministic approval decorated as neural inference. The trading gate remains fail closed.

### Test runner completion

The domain test runner now exits explicitly after all awaited suites complete. This fixes the Phase 1 baseline condition where 254 successful checks were printed but the process never terminated.

## 5. Files changed

- `lib/ai/runtime-contracts.ts`
- `lib/ai/runtime-providers.ts`
- `lib/ai/runtime-router.ts`
- `lib/ai/deterministic-advisory.ts`
- `lib/ai/offline-ai-contracts.ts`
- `lib/ai/browser-offline-ai.ts`
- `lib/ai/webllm-agent-adapter.ts`
- `lib/ai/advisory-provider.ts`
- `lib/ai/agentic-reviewer.ts`
- `lib/core/multi-agent-orchestrator.ts`
- `lib/ai/__tests__/runtime-router.test.ts`
- `lib/ai/__tests__/agentic-review.test.ts`
- `lib/core/__tests__/multi-agent-council.test.ts`
- `scripts/run-domain-tests.ts`

## 6. Tests executed

| Command | Result |
|---|---|
| `npm test` | PASS — 49 suites, 257 checks, 0 failures; process exits normally. |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — Next.js production build, static generation, and `ensure-css` completed. |

Focused router tests cover declared-runtime routing, invalid model IDs, non-resident/runtime failure, fail-closed behavior, and explicit non-execution provenance.

## 7. Remaining known problems

- Model catalogue validity, 14B entries, device tiers, and automatic recommendations remain Phase 3.
- Generation timeout, deeper cancellation, OOM recovery, and smaller-model fallback remain Phase 4.
- The four-agent async path cannot currently run two different large resident models simultaneously; sequential switching policy remains Phase 4/5.
- Model management UI still calls the compatibility manager for download/cache details; it does not bypass the router for agent generation.
- LiteRT WASM remains CDN-dependent and not offline verified; this remains Phase 6.
- Browser/WebGPU hardware inference was not run in this environment.

## 8. Commit

The Phase 2 commit SHA is reported with the final delivery after the commit is created.

## 9. Phase 3 proposal

Phase 3 will validate and simplify the model catalogue against the installed WebLLM registry, remove or disable invalid IDs, separate model definitions from runtime compatibility, introduce practical FAST/BALANCED/DEEP tiers, and add evidence-based capability/recommendation logic. It must not begin until this Phase 2 report is reviewed.
