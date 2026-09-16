# AI Runtime Optimization — Phase 6 Report

**Date:** 2026-09-16  
**Branch:** `ai-runtime-optimization-v1`  
**Scope:** truthful offline/PWA state, app-shell cache ownership/versioning, revision-aware verification, and corrupt-cache handling.

## 1. What was inspected

- Service-worker installation, activation, fetch strategies, cache deletion, and navigation fallback.
- PWA service-worker registration and update behavior.
- WebLLM and LiteRT artifact caches and deletion paths.
- Model lifecycle state shown in the model manager.
- Offline verification records, model revisions, and disconnected inference probe.
- Existing PWA and offline-AI tests.

## 2. Problems addressed

1. The service worker claimed “100% offline functionality” despite network-only APIs, initial model downloads, and LiteRT CDN bootstrap.
2. UI booleans could not distinguish online-required, cached, loadable, resident, or genuinely offline-verified models.
3. Offline-verification records remained accepted after a model artifact revision changed.
4. Service-worker activation guessed model caches by broad substrings and could delete caches it did not own.
5. App-shell cache ownership/version was implicit.
6. Corrupt WebLLM artifacts did not have a targeted cleanup path.
7. There was no service-worker diagnostic response confirming that the root shell was cached.

## 3. Changes made

### Formal offline model state machine

The application now derives one of these states for every model:

- `ONLINE_REQUIRED_FOR_DOWNLOAD`
- `DOWNLOADING`
- `CACHED`
- `LOADABLE`
- `READY`
- `OFFLINE_VERIFIED`
- `ERROR`

The state includes model ID/revision, cache presence, residency, verification status, and a machine-readable reason. `CACHED` specifically means the artifact exists while the runtime is unavailable; `LOADABLE` means the supported cached model can be loaded.

The model manager presents localized labels for these states without removing detailed reasons from tooltips.

### Revision-aware offline verification

`OFFLINE_VERIFIED` is accepted only when:

- the browser was offline during the inference probe;
- inference succeeded from the cached model;
- the stored model revision exactly matches the current catalogue revision.

Stale revision records are removed automatically. An online inference can never create this state. LiteRT remains deliberately ineligible while its runtime bootstrap is CDN-dependent.

### Owned and versioned app-shell cache

The service worker now uses:

```text
hamed-trading-app-shell-v5-phase6
```

Activation deletes only stale caches with the app-owned `hamed-trading-app-shell-` prefix. WebLLM, LiteRT, browser, and unrelated origin caches are not guessed or deleted.

Cross-origin model/runtime requests are explicitly excluded from service-worker caching because integrity and versioning belong to their runtime providers. Same-origin app assets retain network-first navigation and stale-while-revalidate static caching.

### Shell diagnostics and updates

The PWA provider requests a service-worker update during registration and asks for `GET_OFFLINE_SHELL_STATUS`. The worker responds with cache name, version, and whether `/` is cached; the provider exposes this through a local browser event for future diagnostics.

### Corrupt/incomplete cache handling

- LiteRT continues to require exact pinned artifact bytes and revision headers.
- WebLLM load errors matching corruption, checksum, integrity, truncated-stream, or invalid-artifact patterns trigger best-effort deletion of that model cache and removal of its offline-verification record.
- The user receives an explicit message that a re-download is required.

## 4. Files changed

- `lib/ai/offline-ai-contracts.ts`
- `lib/ai/browser-offline-ai.ts`
- `components/trading/offline-ai-manager-modal.tsx`
- `components/pwa-provider.tsx`
- `public/sw.js`
- `lib/ai/__tests__/offline-state.test.ts`

## 5. Tests executed

| Command | Result |
|---|---|
| `npm test` | PASS — 50 suites, 269 checks, 0 failures. |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — production compilation, type validation, static generation, and `ensure-css` completed. |

New tests cover every offline state category, owned app-shell versioning, removal of the false complete-offline claim, cross-origin cache separation, and the shell diagnostic message.

## 6. Remaining known problems

- A true disconnected cold-start test requires a browser: load/install online, cache the shell/model, disable network at browser or OS level, restart, and run inference.
- This container has no Chromium executable, so that hardware/browser workflow remains unverified here.
- Next.js hashed chunks are cached as they are requested; the root fallback does not guarantee that every route was visited before disconnection.
- LiteRT cannot be marked offline verified until its WASM runtime is served and versioned from an offline-capable path.
- WebLLM integrity details are library-owned; the application can react to load corruption but cannot independently hash every opaque library cache entry.

## 7. Commit

The Phase 6 commit SHA is reported with final delivery after the commit is created.

## 8. Phase 7 proposal

Phase 7 will add production diagnostics/benchmarking, exercise failure matrices, run final tests/build, measure runtime/load/TTFT/tokens-per-second/fallback metrics where hardware permits, and produce the final production-readiness report without exposing account or trading data.
