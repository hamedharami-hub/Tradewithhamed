import { PersistenceStorage } from '../storage';

export function runPersistenceStorageTests() {
  const state = { symbol: 'GBPUSD' as const, currentStepIndex: 42, accountBalance: 10_000, accountEquity: 9_950 };
  const v2 = PersistenceStorage.validateAndImport(PersistenceStorage.exportState(state));
  const v1 = PersistenceStorage.validateAndImport(JSON.stringify({ schemaVersion: 'v1.0', exportedAt: 1, environment: 'demo', app: 'Hamed Trading Lab', state: { ...state, symbol: 'USDJPY' } }));
  const invalid = PersistenceStorage.validateAndImport(JSON.stringify({ schemaVersion: 'v2.0', app: 'Hamed Trading Lab', backupKind: 'LOCAL_REPLAY_STATE', state: { ...state, symbol: 'BTCUSD' } }));
  return [
    { name: 'Backup v2 round-trip preserves supported symbols', passed: v2.valid && v2.data?.state.symbol === 'GBPUSD', details: 'GBPUSD backup validates and restores.' },
    { name: 'Backup v1 remains import-compatible', passed: v1.valid && v1.migratedFromV1 === true && v1.data?.state.symbol === 'USDJPY', details: 'Legacy v1 backup is accepted with migration notice.' },
    { name: 'Backup rejects unsupported symbols', passed: !invalid.valid, details: invalid.error || 'Unsupported symbol was rejected.' },
  ];
}
