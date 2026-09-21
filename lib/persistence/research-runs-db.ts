// lib/persistence/research-runs-db.ts
// ذخیره‌سازی تکرارپذیر ران‌های پژوهشی در IndexedDB – کاملاً آفلاین
// نسخه‌گذاری اسکیما، پاک‌سازی LRU، واردات/صادرات JSON

import { ResearchRun } from '../contracts/research-run';

const DB_NAME = 'TradeResearchDB';
const STORE_NAME = 'research_runs';
const SCHEMA_VERSION = 1;
const MAX_STORED_RUNS = 20;

// ──────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'runId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('symbol', 'symbol', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/** ذخیره یک ران جدید. اگر از حد مجاز گذشت، قدیمی‌ترین را حذف می‌کند. */
export async function saveRun(run: ResearchRun): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const putReq = store.put(run);
    putReq.onsuccess = () => {
      // LRU cleanup: if over limit, delete oldest
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result <= MAX_STORED_RUNS) {
          db.close();
          resolve();
          return;
        }
        const idx = store.index('createdAt');
        const cursor = idx.openCursor(null, 'next');
        let deleted = 0;
        const toDelete = countReq.result - MAX_STORED_RUNS;
        cursor.onsuccess = (e) => {
          const c = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!c || deleted >= toDelete) {
            db.close();
            resolve();
            return;
          }
          c.delete();
          deleted++;
          c.continue();
        };
        cursor.onerror = () => {
          db.close();
          reject(cursor.error);
        };
      };
      countReq.onerror = () => {
        db.close();
        reject(countReq.error);
      };
    };
    putReq.onerror = () => {
      db.close();
      reject(putReq.error);
    };
  });
}

/** بازیابی همه ران‌ها، مرتب بر اساس createdAt نزولی (جدیدترین اول) */
export async function getAllRuns(): Promise<ResearchRun[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const idx = tx(db, 'readonly').index('createdAt');
    const req = idx.getAll();
    req.onsuccess = () => {
      const runs = (req.result as ResearchRun[]).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      db.close();
      resolve(runs);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** بازیابی یک ران با شناسه مشخص */
export async function getRunById(runId: string): Promise<ResearchRun | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(runId);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as ResearchRun | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** حذف یک ران */
export async function deleteRun(runId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(runId);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** حذف همه ران‌ها */
export async function clearAllRuns(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').clear();
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** صادرات همه ران‌ها به JSON */
export async function exportRunsAsJson(): Promise<string> {
  const runs = await getAllRuns();
  return JSON.stringify(
    { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), runs },
    null,
    2
  );
}

/** واردات ران‌ها از JSON صادرشده – اعتبارسنجی می‌کند */
export async function importRunsFromJson(jsonText: string): Promise<{ imported: number; skipped: number }> {
  let parsed: { schemaVersion?: number; runs?: unknown[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('فرمت JSON نامعتبر است.');
  }

  if (!Array.isArray(parsed.runs)) {
    throw new Error('فایل واردشده فاقد آرایه runs است.');
  }

  const schemaVersion = parsed.schemaVersion ?? 0;
  if (schemaVersion > SCHEMA_VERSION) {
    throw new Error(`نسخه اسکیما (${schemaVersion}) از نسخه پشتیبانی‌شده (${SCHEMA_VERSION}) جدیدتر است.`);
  }

  let imported = 0;
  let skipped = 0;

  for (const item of parsed.runs) {
    const run = item as ResearchRun;
    if (!run.runId || !run.createdAt || !run.status) {
      skipped++;
      continue;
    }
    try {
      await saveRun(run);
      imported++;
    } catch {
      skipped++;
    }
  }

  return { imported, skipped };
}
