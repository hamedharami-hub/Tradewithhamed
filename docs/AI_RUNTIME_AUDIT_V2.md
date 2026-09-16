# AI Runtime Audit V2 — Phase 1

**Audit date:** 2026-09-16  
**Branch:** `ai-runtime-optimization-v1`  
**Scope:** repository-wide static audit plus baseline test/lint/typecheck/build execution  
**Phase boundary:** this document records findings only. No Phase 2–7 runtime refactor is included.

## 1. Executive summary

The repository has real browser inference paths for WebLLM/WebGPU and an experimental LiteRT-LM Web path. It also has meaningful fail-closed safeguards: browser LLM output is advisory, synchronous neural selections cannot approve an order, deterministic risk sizing remains separate, and offline verification requires `navigator.onLine === false` before it is recorded.

The current design is nevertheless not yet a runtime-neutral architecture. UI, agent adapters, model management, cache handling, and generation all depend directly on the static `BrowserOfflineAIManager`. Provenance is insufficient to distinguish successful inference from an unsupported, unmapped, non-resident, or fallback result. The synchronous four-agent council is the most serious truthfulness problem: it computes deterministic template results even when an engine is labelled `NEURAL_WEBGPU`, then returns the neural engine name/type and synthetic latency. Trading remains blocked in that case, so this is currently a **metadata/UX integrity defect rather than a direct execution bypass**.

The installed WebLLM package is `0.2.84`. Nine configured WebLLM IDs are present in that package's `prebuiltAppConfig`; two configured 14B IDs are absent and are correctly rejected at runtime, but remain advertised in the catalogue and Agent Council UI. Chrome built-in AI is a placeholder. LiteRT-LM Web performs real inference when successfully loaded, but its WASM runtime is fetched from jsDelivr and the code deliberately does not mark it offline verified.

### Overall risk assessment

| Area | Assessment | Why |
|---|---|---|
| Deterministic trading/risk boundary | **PARTIAL / medium residual risk** | The principal paths are separated and fail closed, but advisory provenance is incomplete and deterministic council outputs can wear neural labels. |
| WebLLM browser inference | **REAL** | Uses the official Web Worker handler and `CreateWebWorkerMLCEngine`, with direct `CreateMLCEngine` fallback, streaming completions, and registry checks. |
| LiteRT-LM Web inference | **REAL but experimental** | Downloads a pinned `.litertlm`, creates an engine, and streams a conversation; runtime bootstrap remains online-dependent and browser/device behavior is unverified here. |
| Chrome built-in AI | **PLACEHOLDER** | Listed in the catalogue, but support is hard-coded false and generation throws `CHROME_PROMPT_API_UNIMPLEMENTED`. |
| Four-agent synchronous “neural” council | **BROKEN metadata / deterministic execution** | Neural selections change labels/confidence but do not invoke a model. The final trading gate blocks these selections, preventing silent order approval. |
| Async analyst/critic agent path | **REAL/PARTIAL** | Calls the resident local model, but only analyst and critic infer; scanner and judge remain deterministic. Provenance cannot explicitly state whether inference executed. |
| Offline/PWA behavior | **PARTIAL** | App shell and model caches exist; WebLLM has a manual disconnected probe. Service-worker versioning is manual and LiteRT runtime is not offline-complete. |
| Local RAG | **REAL deterministic retrieval** | In-memory weighted lexical/vector-like retrieval over bundled and journal chunks; it is not embedding-model RAG and is not persisted as a vector database. |

## 2. Method and inspected surface

The audit inspected:

- `package.json`, lockfile, installed package versions, and the installed WebLLM prebuilt registry;
- all files under `lib/ai/`, including contracts and tests;
- `lib/core/analyst-critic.ts`, `lib/core/multi-agent-orchestrator.ts`, agent contracts, and council tests;
- model-manager, model-selector, AI Hub, council, benchmark, and main-page integration UI;
- `public/sw.js`, `components/pwa-provider.tsx`, and the PWA manifest;
- `lib/core/local-rag-engine.ts`, its UI and tests;
- browser WebGPU harnesses and AI-related research scripts;
- repository-wide occurrences of WebLLM, MLCEngine, WebGPU, LiteRT, model families/IDs, cache operations, offline verification, Chrome built-in AI, and Agent Council calls.

No model weights were downloaded and no claim of hardware inference was made during this audit. The current environment cannot establish Pixel, Snapdragon, WebGPU, OOM, cache-corruption, or disconnected-browser behavior.

## 3. Current dependency map

```text
UI
├─ OfflineAIManagerModal / OfflineAISelectorModal
│  └─ BrowserOfflineAIManager (catalogue + lifecycle + caches + generation)
├─ app/page.tsx shadow analysis
│  └─ AnalystCriticPipeline
│     └─ webllm-agent-adapter
│        └─ BrowserOfflineAIManager
├─ MultiAgentOrchestratorModal
│  └─ MultiAgentOrchestrator (synchronous deterministic implementation)
└─ browser benchmark/harness
   └─ reviewCandidateWithFourAgents
      ├─ deterministic scanner and judge
      └─ BrowserOfflineAIManager for analyst/critic

BrowserOfflineAIManager
├─ WebLLM provider (real)
│  ├─ WebWorkerMLCEngineHandler
│  ├─ CreateWebWorkerMLCEngine
│  └─ CreateMLCEngine fallback
├─ LiteRT-LM Web provider (real, experimental)
│  ├─ CacheStorage pinned artifact
│  ├─ jsDelivr WASM bootstrap
│  └─ Engine.create / streaming conversation
├─ deterministic advisory helper
└─ Chrome built-in provider (placeholder)

Local RAG
└─ independent deterministic in-memory retrieval; no LLM runtime dependency
```

There is no `AIRuntimeProvider`-like boundary today. The static manager combines catalogue policy, capability detection, storage, downloading, runtime construction, lifecycle state, generation, output parsing, and deterministic advisory logic.

## 4. Runtime and feature classification

### 4.1 WebLLM/WebGPU — **REAL, with lifecycle gaps**

Evidence:

- The worker instantiates `WebWorkerMLCEngineHandler` and forwards messages.
- The manager checks `prebuiltAppConfig.model_list`, probes WebGPU, chooses the q4f32 variant when shader-f16 is absent, terminates failed workers, and uses a direct engine only if worker construction fails.
- Text generation calls streaming `chat.completions.create` and consumes actual deltas.
- A single manager-owned resident engine policy exists, and switching calls `disposeActiveEngine()` first.

Gaps:

- There is no generation timeout.
- `AbortController` is checked between streamed chunks but is not passed into WebLLM generation; cancellation responsiveness depends on receiving another chunk.
- There is no automatic OOM classification/recovery or smaller-model retry.
- Public contracts do not report load time, actual token count/tokens-per-second, observed memory, fallback, or inference execution.
- Worker failure silently changes topology to a main-thread engine (a console warning is the only provenance).
- The model's user-facing “download size” and “estimated VRAM” are handwritten catalogue values rather than registry-derived or observed measurements.

### 4.2 LiteRT-LM Web — **REAL/PARTIAL and correctly experimental**

Evidence:

- A pinned Gemma artifact URL and exact byte count are used.
- Download is streamed into a named CacheStorage cache; custom size/revision headers reject stale/truncated entries.
- The code creates an actual LiteRT engine and streams an actual conversation.
- Download cancellation is supported before engine creation; cleanup attempts cancel/delete/unload.
- UI and verification logic explicitly say the path is experimental and do not grant `OFFLINE_VERIFIED`.

Gaps:

- WASM loads from `https://cdn.jsdelivr.net/.../wasm`; the service worker only caches same-origin basic responses, so the path is not proven offline-complete.
- Cache integrity is byte-count/revision based, not cryptographic hash based.
- `any` is used across the LiteRT adapter boundary, making API drift hard to detect.
- Engine creation cannot be safely cancelled after the artifact is cached.
- No automated browser test exercises this provider.
- “WebGPU available + CacheStorage available” is only a coarse support predicate; it does not prove that the device can allocate or run the model.

### 4.3 Chrome built-in / `window.ai` — **PLACEHOLDER**

The catalogue describes Gemini Nano and hardware execution, but `isModelSupported()` always returns false for `Chrome-Builtin`, download readiness says it is unimplemented, and advisory evaluation throws `CHROME_PROMPT_API_UNIMPLEMENTED`. It must remain disabled or be moved behind an explicit capability provider. The current description also makes an unverifiable NPU/GPU claim.

### 4.4 Deterministic advisory — **REAL**

`buildDeterministicAdvisory()` validates price, structural evidence, risk/reward, news, and spread using testable TypeScript. It identifies its source as `DETERMINISTIC` and marks the result advisory-only. The deterministic risk calculator and order validation remain outside LLM generation.

### 4.5 Async analyst/critic pipeline — **REAL/PARTIAL**

`runShadowPipelineAsync()` maps a profile to a model-backed engine and reaches `evaluateCandidateAdvisory()`. A successful resident model therefore performs real generation. It always returns `passed: false`, including when the model says `TRADE`, preserving advisory-only behavior.

Limitations:

- A single inference result is transformed into both analyst and critic-shaped records in this pipeline; it is not two independent model calls.
- `StructuredCandidateAdvisory` lacks `inferenceExecuted`, `fallbackUsed`, and `fallbackReason`.
- Unsupported/unmapped/non-resident responses can still carry `source: WEBLLM_WEBGPU` even though no WebLLM inference occurred.
- Generated advisory `evidenceIds` are discarded and replaced with `[]` by `evaluateCandidateAdvisory()`, which normally prevents the judge from approving but loses useful grounded provenance.

### 4.6 Four-agent review (`reviewCandidateWithFourAgents`) — **PARTIAL**

The scanner is a deterministic evidence-presence check. Analyst and critic each perform real inference only if their configured mapped model is currently resident; otherwise they return explicit review-required flags. The judge is deterministic and fail closed. Because there is a single-active-model policy, a configuration that assigns different neural models to analyst and critic cannot execute both in one review without an explicit sequential load strategy; one or both will be non-resident.

### 4.7 Synchronous `MultiAgentOrchestrator` — **BROKEN truthfulness, fail-closed for neural configurations**

This path never imports or invokes a neural runtime. `runScannerAgent`, `runAnalystAgent`, and `runCriticAgent` compute deterministic/template results for every engine. For neural analyst/critic choices, engine type only changes hard-coded confidence or explanatory text. Returned records nevertheless contain the selected neural engine ID/name/type and its configured latency.

Mitigating fact: `evaluateCandidate()` detects any selected `NEURAL_WEBGPU` engine and forces `isApprovedForTrading` false. It explicitly says neural execution has not occurred. This prevents a direct silent trading authorization, but the individual agent cards and an existing test labelled “14B & Dense Engine Pipeline Execution” can mislead users and maintainers into believing inference happened.

### 4.8 Local RAG — **REAL deterministic retrieval, not neural semantic embeddings**

`LocalRAGEngine` tokenizes text, applies bilingual/domain boosts and weighted similarity over in-memory maps. Base content is bundled and journal chunks are registered in memory. It is useful deterministic retrieval, but terms such as “semantic/vector RAG” should not imply an embedding model, IndexedDB vector store, or LLM call.

## 5. Installed runtime and model registry audit

Installed versions resolved from `node_modules`:

| Package | Installed version |
|---|---:|
| Next.js | `16.3.4` |
| `@mlc-ai/web-llm` | `0.2.84` |
| `@litert-lm/core` | `0.17.0` |

The comparison below uses the runtime-exported `prebuiltAppConfig.model_list` from the installed `@mlc-ai/web-llm`, not names inferred from documentation.

| Application model ID | Runtime | Registry/custom status | Classification |
|---|---|---|---|
| `phi-4-mini-instruct-mlc` | WebLLM | `Phi-4-mini-instruct-q4f16_1-MLC` present | **REAL / supported** |
| `deepseek-r1-distill-qwen-7b-mlc` | WebLLM | 7B q4f16 present | **REAL / supported** |
| `deepseek-r1-distill-qwen-14b-mlc` | WebLLM | absent; no custom `appConfig` entry | **BROKEN catalogue entry** |
| `llama-3.2-3b-instruct-mlc` | WebLLM | present | **REAL / supported** |
| `qwen2.5-7b-instruct-mlc` | WebLLM | present | **REAL / supported** |
| `qwen2.5-14b-instruct-mlc` | WebLLM | absent; no custom `appConfig` entry | **BROKEN catalogue entry** |
| `smollm2-360m-mlc` | WebLLM | present | **REAL / supported** |
| `qwen3.5-0.8b-mlc` | WebLLM | present | **REAL / supported** |
| `qwen3.5-2b-mlc` | WebLLM | present | **REAL / supported** |
| `qwen3.5-4b-mlc` | WebLLM | present | **REAL / supported** |
| `qwen3-1.7b-mlc` | WebLLM | present | **REAL / supported** |
| `gemma-4-e4b-litert` | LiteRT-LM Web | pinned custom LiteRT artifact; not a WebLLM ID | **REAL / experimental / device-unverified** |
| `chrome-gemini-nano` | Chrome built-in | no implementation | **PLACEHOLDER** |
| deterministic entries | TypeScript | built in | **REAL** |

The application runtime guards prevent the missing 14B IDs from loading, which is good. The defect is that they remain available in catalogue/agent choice copy and are described as viable on 16 GB mobile hardware. There is no evidence in this repository that their advertised sizes, compatibility, or Pixel performance were measured.

## 6. Safety-boundary audit

### Confirmed safeguards

1. Position sizing is computed through deterministic risk code before order submission.
2. Neural shadow analysis is asynchronous and its result is not used as the order quantity.
3. `StructuredCandidateAdvisory` is marked `advisoryOnly: true`.
4. Generated JSON is parsed fail closed; malformed output becomes `REVIEW_REQUIRED`.
5. The synchronous council blocks trading whenever any selected engine is neural but unexecuted.
6. The async shadow pipeline never returns `passed: true` solely because an LLM recommends a trade.
7. The dedicated research scripts explicitly distinguish simulated/blocked WebLLM results from measured browser runs.

### Residual concerns

- Names such as “مجوز ورود” and “مجوز ارسال سفارش” appear in deterministic council presentation. Even when technically deterministic, UI copy should distinguish a strategy gate from broker/execution authorization.
- Provenance is too weak for downstream code to enforce “inference really occurred.” `source` identifies an intended source, not necessarily executed work.
- Tests assert that a neural-labelled configuration was “executed” merely by checking returned engine IDs. This institutionalizes misleading metadata.
- Online advisory providers share the same output contract and are advisory-only, but no unified provenance/fallback contract spans online, WebLLM, LiteRT, and deterministic providers.

No evidence was found that an LLM directly computes lot size, mutates SL/TP, bypasses broker constraints, or writes an order. The main Phase 2 requirement is therefore to preserve the current deterministic boundary while making provenance enforceable.

## 7. PWA, cache, and offline audit

### What exists

- A service worker pre-caches the root document, manifest, and icons.
- Navigation is network-first with cached-root fallback; other GET assets use stale-while-revalidate.
- `/api/` is network-only.
- Model-like caches are preserved during service-worker activation.
- WebLLM uses its library cache APIs; LiteRT uses a dedicated CacheStorage.
- WebLLM offline verification requires the browser to report offline, verifies a cached model, runs an inference probe, and records the model revision.

### Problems

1. **High — false global claim:** the service-worker header claims “100% offline functionality,” while APIs are network-only, first downloads require network, LiteRT runtime uses a CDN, and only a small shell list is explicitly pre-cached.
2. **Medium — manual cache versioning:** `CACHE_NAME` is a fixed manually bumped string. There is no build hash or manifest-driven invalidation.
3. **Medium — broad cache preservation:** substring matching (`model`, `webllm`, etc.) can preserve unrelated/stale caches indefinitely.
4. **Medium — offline verification is a user-operated probe:** `navigator.onLine === false` plus successful inference is meaningful, but it does not prevent all network interfaces or record a runtime/library fingerprint. A stale record is not rejected when the current catalogue revision changes; `isOfflineVerified()` only checks the boolean field and does not compare `modelRevision`.
5. **Medium — state vocabulary is split:** lifecycle states and manager runtime states do not directly model `ONLINE_REQUIRED_FOR_DOWNLOAD`, `CACHED`, `LOADABLE`, or the difference between artifact-ready and runtime-ready.
6. **Low — app-shell completeness unverified:** Next hashed chunks are fetched dynamically and cached opportunistically. A fresh offline launch after only installation was not tested in this environment.

## 8. Findings and recommended fixes

| ID | Severity | Finding | Affected files | Recommended Phase |
|---|---|---|---|---|
| AI-01 | **High** | Synchronous council returns deterministic/template reviews decorated with neural engine metadata. Trading is blocked, but UI/tests can claim neural work occurred. | `lib/core/multi-agent-orchestrator.ts`, `components/trading/multi-agent-orchestrator-modal.tsx`, `lib/core/__tests__/multi-agent-council.test.ts` | 2 and 5 |
| AI-02 | **High** | Provenance cannot say whether inference executed or fallback occurred; failure records may still say `WEBLLM_WEBGPU`. | `lib/ai/offline-ai-contracts.ts`, adapters/providers/reviewers | 2 and 5 |
| AI-03 | **High** | Two advertised 14B WebLLM IDs are absent from installed registry and have no custom config. | `lib/ai/browser-offline-ai.ts`, `lib/contracts/multi-agent-system.ts`, model/council UI | 3 |
| AI-04 | **High** | Service worker claims 100% offline although the whole product and LiteRT runtime are not verified offline. | `public/sw.js`, related UI copy | 6 |
| AI-05 | **Medium** | Static manager conflates runtime routing, catalogue, lifecycle, caching, generation, parsing, and deterministic logic. | `lib/ai/browser-offline-ai.ts` and all direct consumers | 2 |
| AI-06 | **Medium** | A one-resident-model policy conflicts with councils configured to use different neural analyst and critic models. | `lib/ai/agentic-reviewer.ts`, adapter, manager, council UI | 4 and 5 |
| AI-07 | **Medium** | WebLLM generation lacks a timeout and cancellation is cooperative between chunks rather than passed to the engine. | `lib/ai/browser-offline-ai.ts` | 4 |
| AI-08 | **Medium** | No OOM classification, recovery, or smaller compatible model fallback exists. | manager/model catalogue | 3 and 4 |
| AI-09 | **Medium** | Offline verification records are not invalidated by a catalogue revision mismatch. | `lib/ai/browser-offline-ai.ts`, contracts | 6 |
| AI-10 | **Medium** | Chrome built-in entry makes hardware/NPU claims despite being unimplemented. | catalogue and model UI | 3 |
| AI-11 | **Medium** | Handwritten size/VRAM/device claims are presented precisely without measured-vs-estimated provenance. | catalogue/model UI | 3 and 7 |
| AI-12 | **Medium** | LiteRT cache integrity checks byte count and revision only; runtime bootstrap remains CDN-dependent. | `lib/ai/browser-offline-ai.ts`, service worker | 4 and 6 |
| AI-13 | **Medium** | Model-generated evidence IDs are not preserved in structured local advisory output. | `lib/ai/browser-offline-ai.ts`, agent judge | 5 |
| AI-14 | **Medium** | Existing tests are predominantly deterministic and do not cover routing, invalid IDs, OOM, cancellation, corrupt cache, provenance, or offline state transitions. | AI/core tests and test runner | 7 |
| AI-15 | **Low** | Local RAG terminology can imply neural embeddings, although implementation is deterministic weighted retrieval. | RAG engine/UI/docs | 5/UX |
| AI-16 | **Low** | Worker-to-direct-engine fallback is only logged, not surfaced in diagnostics/provenance. | `lib/ai/browser-offline-ai.ts` | 2 and 7 |

## 9. Baseline verification

The baseline commands were started before any repository file changed. Detailed results are recorded below; browser/WebGPU inference was not run because this environment does not establish a supported GPU browser and model weights were intentionally not downloaded during an audit-only phase.

| Command | Result | Baseline interpretation |
|---|---|---|
| `npm test` | **Functional checks pass, process does not exit** | Output reports 48 suites, 254 checks, 0 failures, then remains alive until the audit timeout. This is a pre-existing open-handle/test-runner defect. |
| `npm run lint` | **PASS** | Repository-wide ESLint completed with exit code 0. |
| `npm run typecheck` | **PASS** | TypeScript no-emit completed with exit code 0. |
| `npm run build` | **PASS** | Next.js 16 webpack production build compiled, type-checked, generated all 15 static pages, and completed `ensure-css`. |

## 10. Phase 2 entry criteria and proposed direction

Phase 2 should not rewrite the application. It should introduce a narrow runtime-neutral boundary and migrate callers incrementally:

1. Define request/response, capabilities, health, lifecycle, and explicit provenance contracts.
2. Make provenance mandatory: `provider`, `runtime`, `requestedModelId`, `executedModelId`, `inferenceExecuted`, `fallbackUsed`, `fallbackReason`, timing, and advisory-only status.
3. Wrap the current WebLLM and LiteRT implementations behind providers without changing deterministic trading calculations.
4. Implement a deterministic provider explicitly rather than embedding deterministic advisory logic in the browser model manager.
5. Add a router that rejects unsupported runtime/model combinations and never infers runtime from manufacturer/family.
6. Preserve a compatibility facade temporarily so UI migration can be incremental.
7. Change the synchronous council to label its results deterministic/not-executed, or route it through an async orchestrator; do not allow selected neural names to decorate deterministic output.

Phase 2 must retain the rule that no provider response can bypass deterministic price, position sizing, SL/TP, account/risk, broker, or execution validation.

## 11. Known limitations of this audit

- Registry compatibility means “present in the installed WebLLM registry,” not “successfully ran on every target device.”
- LiteRT artifact existence and API shape were inspected locally; a 2.97 GB download and hardware inference were not performed.
- Pixel 9 Pro Fold and Windows-on-Snapdragon performance, browser storage quotas, NPU access, OOM behavior, and thermal behavior remain **UNVERIFIED**.
- Network-restricted GitHub access in this environment does not affect local source inspection, but prevents comparing the branch to a freshly fetched remote.
- A true offline PWA test requires a real browser workflow: install/load once, cache selected models, disable network at the browser/OS level, restart, and verify shell plus inference.
