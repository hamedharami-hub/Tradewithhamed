# AI Runtime Optimization — Phase 5 Report

**Date:** 2026-09-16  
**Branch:** `ai-runtime-optimization-v1`  
**Scope:** Agent Council real execution, role-level provenance, sequential cached neural roles, and evidence validation.

## 1. What was inspected

- Synchronous `MultiAgentOrchestrator` and asynchronous `reviewCandidateWithFourAgents` paths.
- Scanner, Analyst, Critic, and Judge contracts and prompts.
- Engine-to-model mappings and resident-model behavior.
- Legacy `AnalystCriticPipeline` shadow results and UI rendering.
- Model JSON parsing, evidence IDs, deterministic hard gates, and council judgment.
- Agent tests and browser WebGPU harness usage.

## 2. Problems addressed

1. The async scanner was always a deterministic boolean even when a neural scanner engine was configured.
2. Scanner and Judge results lacked the same explicit provenance available on Analyst/Critic advisories.
3. Different cached neural models could not execute sequentially under the single-resident-model policy.
4. Council output did not summarize how many neural roles were requested versus actually executed.
5. Local model `evidenceIds` were discarded during JSON parsing.
6. The deterministic Judge did not reject evidence IDs invented by a model.
7. The legacy shadow pipeline represented one neural advisory as both Analyst and Critic model output.
8. User-facing shadow analysis did not show executed model, runtime, or fallback status.

## 3. Changes made

### Role-level execution truth

The asynchronous council now gives every role an auditable execution record:

- Scanner includes a complete `StructuredCandidateAdvisory` with provenance.
- Analyst and Critic retain their structured provenance.
- Judge declares deterministic provenance and never claims neural execution.
- `executionSummary` reports neural roles requested, neural roles executed, and roles that used fallback.

When a neural role cannot execute, its advisory remains `REVIEW_REQUIRED`, `inferenceExecuted` remains false, and the council cannot produce `PAPER_TRADE` from that role.

### Real neural scanner path

If the configured scanner is neural, it now goes through the same Runtime Router and model inference path as Analyst/Critic. The deterministic structural scanner remains a mandatory hard gate. A neural scanner can only add an advisory confirmation; it cannot create missing structural evidence or bypass deterministic rules.

The scanner prompt schema now uses the canonical `TRADE | NO_TRADE | REVIEW_REQUIRED` verdict set, eliminating the incompatible `APPROVE` value.

### Sequential cache-only neural roles

Before each requested neural role, the council may switch to its model only if that complete model is already cached. This preserves the single-heavy-model policy:

```text
cached scanner model → inference → unload/switch
cached analyst model → inference → unload/switch
cached critic model  → inference
```

No role downloads a model silently. Sequential loading can be disabled through `AgenticReviewOptions`. Timeouts and AbortSignals propagate to every role.

### Evidence preservation and validation

The local structured parser now preserves up to 12 model-returned `evidenceIds`. The deterministic Judge compares those IDs with the candidate packet and rejects unknown IDs with `UNKNOWN_EVIDENCE_ID`. Rule-provenance IDs with the explicit `RULE-` prefix remain allowed.

This means an LLM cannot obtain approval by inventing a supporting evidence identifier.

### Legacy shadow pipeline and UX

The single neural advisory in `AnalystCriticPipeline` is now represented as one neural Analyst result followed by a deterministic post-advisory validator, not two independent neural calls. Its provenance is exposed to the setup card, which displays:

- runtime;
- actually executed model or “not executed”;
- inference execution status;
- fallback occurrence/reason.

## 4. Safety properties retained

- Deterministic structural evidence remains mandatory before scanner approval.
- Deterministic risk/reward and hard flags remain Judge inputs.
- Missing, non-resident, cancelled, timed-out, or invalid model output remains fail closed.
- Neural roles remain advisory-only and cannot authorize broker execution.
- No price, position sizing, SL/TP, account-risk, or broker validation logic was moved into an LLM.

## 5. Files changed

- `lib/ai/agentic-review-contracts.ts`
- `lib/ai/agentic-reviewer.ts`
- `lib/ai/browser-offline-ai.ts`
- `lib/ai/runtime-router.ts`
- `lib/core/analyst-critic.ts`
- `components/trading/setup-analysis-card.tsx`
- `lib/ai/__tests__/agentic-review.test.ts`

## 6. Tests executed

| Command | Result |
|---|---|
| `npm test` | PASS — 49 suites, 264 checks, 0 failures. |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — production compilation, type validation, static generation, and `ensure-css` completed. |

New checks cover provenance for all four roles, requested-but-unexecuted neural roles, fail-closed final decisions, and rejection of model-invented evidence IDs.

## 7. Remaining known problems

- Real multi-model sequential inference still requires the selected artifacts and WebGPU hardware; Node tests validate policy/provenance rather than GPU execution.
- Sequential model switching can be slow and should be benchmarked on target hardware in Phase 7.
- A neural Judge is intentionally not offered; final safety judgment remains deterministic.
- LiteRT still cannot be offline verified because its WASM bootstrap is CDN-dependent.
- Complete PWA/cache state hardening remains Phase 6.

## 8. Commit

The Phase 5 commit SHA is reported with final delivery after the commit is created.

## 9. Phase 6 proposal

Phase 6 will formalize the offline state machine, service-worker/cache versioning, revision-aware offline verification, app-shell startup tests, corrupt/incomplete cache handling, and truthful online-required/downloaded/cached/loadable/ready/offline-verified UI states.
