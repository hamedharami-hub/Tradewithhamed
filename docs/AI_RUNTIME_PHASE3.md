# AI Runtime Optimization — Phase 3 Report

**Date:** 2026-09-16  
**Branch:** `ai-runtime-optimization-v1`  
**Scope:** verified model catalogue, practical tiers, browser capability recommendation, and truthful model-management UX.

## 1. What was inspected

- Every model and agent ID in the application catalogue and agent-engine mappings.
- The installed `@mlc-ai/web-llm` `0.2.84` `prebuiltAppConfig.model_list` used in Phase 1.
- Model manager filters, size labels, device copy, WebGPU capability probe, cache checks, and manual selection flow.
- Chrome built-in, NPU, “100% offline,” Pixel, Snapdragon, and 14B claims.
- Phase 2 runtime routing and provider compatibility boundaries.

## 2. Problems discovered and resolved

1. `DeepSeek-R1-Distill-Qwen-14B-q4f16_1-MLC` and `Qwen2.5-14B-Instruct-q4f16_1-MLC` were absent from the installed registry but still appeared in model and Agent Council choices.
2. Chrome built-in Agent choices were selectable even though the provider is explicitly unimplemented.
3. Existing density labels were marketing-oriented and did not provide the requested practical FAST/BALANCED/DEEP selection model.
4. Download and runtime-memory numbers were displayed without distinguishing pinned artifact size from estimates.
5. The UI made unverified NPU, device, and complete-offline claims.
6. Capability probing existed but did not produce an actionable automatic recommendation.

## 3. Changes made

### Registry-backed catalogue

- Removed both invalid 14B WebLLM model records.
- Removed their analyst/critic engine mappings and Agent Council choices.
- Removed Chrome built-in scanner/analyst/critic choices until a real Prompt API provider exists.
- Kept the Chrome model definition visible as an unsupported future runtime, with copy that does not claim NPU/GPU execution.

No functioning model was removed. Current WebLLM entries remain guarded by the installed runtime registry in `isModelSupported()`.

### Model definition versus runtime compatibility

Each model now exposes explicit `compatibleRuntimes[]` independent of its family name. The selected `runtime` remains the current execution choice, while compatibility records what provider is technically declared for the artifact. Gemma remains LiteRT-Web only; it is not inferred to be WebLLM-compatible merely because of its family.

### Practical tiers

- **FAST:** Qwen3.5 0.8B and SmolLM2 360M.
- **BALANCED:** Qwen3 1.7B, Qwen3.5 2B, Llama 3.2 3B, and Phi-4 Mini.
- **DEEP:** Qwen3.5 4B, Qwen2.5 7B, DeepSeek-R1 7B, and experimental Gemma LiteRT.
- **BUILT_IN:** deterministic and unavailable browser-built-in entries.

The UI now filters by these operational tiers rather than promoting nonexistent 14B models.

### Size provenance

Catalogue records distinguish:

- estimated download size;
- pinned LiteRT artifact size;
- estimated runtime memory;
- not-applicable runtime memory.

The UI labels estimates explicitly. No VRAM number is presented as a hardware guarantee.

### Capability-based recommendation

`recommendModel()` considers:

- WebGPU availability;
- requested tier;
- model presence in the installed WebLLM registry;
- browser storage quota/usage;
- estimated download footprint plus headroom;
- whether the model is already cached;
- conservative fallback from DEEP to BALANCED/FAST and finally deterministic.

Automatic recommendation never loads or selects a model silently. The model manager explains why a model was recommended and provides an explicit “select recommendation” action, preserving manual selection.

### Truthful device/runtime UX

- PWA acceleration is described as WebGPU, not NPU.
- Lack of WebGPU is described as deterministic-only, not a fictional neural CPU fallback.
- Initial download and on-device verification requirements are stated.
- Pixel and Snapdragon names are treated as target devices, not proof of memory allocation or runtime compatibility.

## 4. Files changed

- `lib/ai/browser-offline-ai.ts`
- `lib/ai/webllm-agent-adapter.ts`
- `lib/contracts/multi-agent-system.ts`
- `components/trading/offline-ai-manager-modal.tsx`
- `components/trading/multi-agent-orchestrator-modal.tsx`
- `lib/ai/__tests__/offline-ai-safety.test.ts`
- `lib/core/__tests__/multi-agent-council.test.ts`

## 5. Tests executed

| Command | Result |
|---|---|
| `npm test` | PASS — 49 suites, 258 checks, 0 failures. |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — production compilation, type validation, static generation, and `ensure-css` completed. |

Tests now assert that invalid 14B IDs are absent, tier/compatibility metadata is complete, and a runtime without WebGPU recommends the deterministic provider.

## 6. Remaining known problems

- Browser model sizes other than the pinned LiteRT artifact remain catalogue estimates; measured sizes should be collected by the Phase 7 diagnostics facility.
- Browser APIs do not expose reliable total VRAM. Recommendation therefore uses storage and compatibility signals and does not claim guaranteed allocation success.
- Real Pixel 9 Pro Fold and Windows-on-Snapdragon runs remain unverified.
- LiteRT-Web remains experimental and online-dependent for initial WASM bootstrap.
- Generation timeout, OOM recovery, model switching, and automatic smaller-model fallback remain Phase 4.

## 7. Commit

The Phase 3 commit SHA is reported with final delivery after the commit is created.

## 8. Phase 4 proposal

Phase 4 will harden lifecycle management: generation timeout, AbortController integration where supported, OOM/error classification, safe smaller-model fallback, stale worker cleanup, progress/cancellation behavior, and enforcement of the single-heavy-model policy. It must preserve explicit provenance and must not silently substitute a fallback model.
