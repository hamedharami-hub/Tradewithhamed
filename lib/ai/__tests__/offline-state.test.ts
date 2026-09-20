import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deriveOfflineModelAvailability, type OfflineRuntimeState } from '../offline-ai-contracts';

export interface OfflineStateTestResult { name: string; passed: boolean; details: string }

function state(overrides: Partial<Parameters<typeof deriveOfflineModelAvailability>[0]> = {}) {
  return deriveOfflineModelAvailability({
    modelId: 'model', modelRevision: 'r1', isBuiltIn: false, supported: true, cached: false,
    resident: false, offlineVerified: false, operation: 'IDLE' as OfflineRuntimeState, ...overrides,
  });
}

export async function runOfflineStateTests(): Promise<OfflineStateTestResult[]> {
  const serviceWorker = await readFile(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  return [
    {
      name: '[Offline State] Initial download is explicitly online-required',
      passed: state().state === 'ONLINE_REQUIRED_FOR_DOWNLOAD',
      details: state().reason,
    },
    {
      name: '[Offline State] Cached, loadable, ready, and verified states are distinct',
      passed: state({ cached: true, supported: false }).state === 'CACHED'
        && state({ cached: true }).state === 'LOADABLE'
        && state({ cached: true, resident: true }).state === 'READY'
        && state({ cached: true, resident: true, offlineVerified: true }).state === 'OFFLINE_VERIFIED',
      details: ['CACHED', 'LOADABLE', 'READY', 'OFFLINE_VERIFIED'].join(','),
    },
    {
      name: '[Offline State] Download and runtime errors are explicit',
      passed: state({ operation: 'LOADING' }).state === 'DOWNLOADING' && state({ hasError: true }).state === 'ERROR',
      details: `${state({ operation: 'LOADING' }).state}; ${state({ hasError: true }).state}`,
    },
    {
      name: '[PWA Cache] Service worker versions only its own app-shell cache',
      passed: serviceWorker.includes("APP_SHELL_CACHE_PREFIX = 'hamed-trading-app-shell-'")
        && serviceWorker.includes("APP_SHELL_CACHE_VERSION = 'v5-phase6'")
        && serviceWorker.includes('name.startsWith(APP_SHELL_CACHE_PREFIX)')
        && !serviceWorker.includes('PRESERVED_CACHE_PREFIXES'),
      details: 'app-shell cache has an owned prefix and explicit version',
    },
    {
      name: '[PWA Cache] Service worker does not claim complete offline operation or own cross-origin model caches',
      passed: !serviceWorker.includes('Provides 100% offline functionality')
        && serviceWorker.includes('if (url.origin !== self.location.origin) return;')
        && serviceWorker.includes('GET_OFFLINE_SHELL_STATUS'),
      details: 'cross-origin runtime caching remains provider-owned',
    },
  ];
}
