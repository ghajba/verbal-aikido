import type { RunSummary, ScenarioProgress, StorageDriver, StoreName } from './types';

export const DB_NAME = 'verbalis-aikido';
export const DB_VERSION = 1;

export class IndexedDbDriver implements StorageDriver {
  readonly kind = 'indexeddb' as const;

  private db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(
    idbFactory: IDBFactory = window.indexedDB,
    timeoutMs: number = 1500
  ): Promise<IndexedDbDriver> {
    return new Promise<IndexedDbDriver>((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`IndexedDB open timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const req = idbFactory.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = req.result;
        const oldVersion = e.oldVersion;

        if (oldVersion < 1) {
          // Version 1 schema per Section 12.2
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta');
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings');
          }
          if (!db.objectStoreNames.contains('progress')) {
            db.createObjectStore('progress');
          }
          if (!db.objectStoreNames.contains('runs')) {
            const runsStore = db.createObjectStore('runs', { keyPath: 'runId' });
            runsStore.createIndex('byScenario', 'scenarioId', { unique: false });
          }
          if (!db.objectStoreNames.contains('currentRun')) {
            db.createObjectStore('currentRun');
          }
          if (!db.objectStoreNames.contains('analyticsQueue')) {
            db.createObjectStore('analyticsQueue', { autoIncrement: true });
          }
        }
      };

      req.onsuccess = () => {
        clearTimeout(timer);
        if (!timedOut) {
          resolve(new IndexedDbDriver(req.result));
        }
      };

      req.onerror = () => {
        clearTimeout(timer);
        if (!timedOut) {
          reject(req.error || new Error('Failed to open IndexedDB'));
        }
      };

      req.onblocked = () => {
        clearTimeout(timer);
        if (!timedOut) {
          reject(new Error('IndexedDB database open blocked'));
        }
      };
    });
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const objStore = tx.objectStore(store);
      const req = objStore.get(key);

      req.onsuccess = () => {
        resolve(req.result !== undefined ? (req.result as T) : undefined);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const objStore = tx.objectStore(store);

      let req: IDBRequest;
      if (store === 'runs') {
        req = objStore.put(value);
      } else {
        req = objStore.put(value, key);
      }

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(store: StoreName, key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const objStore = tx.objectStore(store);
      const req = objStore.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const objStore = tx.objectStore(store);
      const req = objStore.getAll();

      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async append<T>(_store: 'analyticsQueue', value: T): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction('analyticsQueue', 'readwrite');
      const objStore = tx.objectStore('analyticsQueue');

      const countReq = objStore.count();
      countReq.onsuccess = () => {
        if (countReq.result >= 2000) {
          // Drop oldest event (SBE-STO-007)
          const cursorReq = objStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              cursor.delete();
            }
            const addReq = objStore.add(value);
            addReq.onsuccess = () => resolve();
            addReq.onerror = () => reject(addReq.error);
          };
          cursorReq.onerror = () => reject(cursorReq.error);
        } else {
          const addReq = objStore.add(value);
          addReq.onsuccess = () => resolve();
          addReq.onerror = () => reject(addReq.error);
        }
      };
      countReq.onerror = () => reject(countReq.error);
    });
  }

  async takeBatch<T>(
    _store: 'analyticsQueue',
    max: number
  ): Promise<{ keys: string[]; values: T[] }> {
    return new Promise<{ keys: string[]; values: T[] }>((resolve, reject) => {
      const tx = this.db.transaction('analyticsQueue', 'readonly');
      const objStore = tx.objectStore('analyticsQueue');
      const keys: string[] = [];
      const values: T[] = [];

      const req = objStore.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && keys.length < max) {
          keys.push(String(cursor.key));
          values.push(cursor.value as T);
          cursor.continue();
        } else {
          resolve({ keys, values });
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteKeys(_store: 'analyticsQueue', keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction('analyticsQueue', 'readwrite');
      const objStore = tx.objectStore('analyticsQueue');

      for (const k of keys) {
        // IDB autoIncrement keys can be numbers
        const num = Number(k);
        const idbKey = !Number.isNaN(num) ? num : k;
        objStore.delete(idbKey);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async finishRun(summary: RunSummary, progress: ScenarioProgress): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // D38: One readwrite transaction covering runs, progress, currentRun
      const tx = this.db.transaction(['runs', 'progress', 'currentRun'], 'readwrite');
      const runsStore = tx.objectStore('runs');
      const progressStore = tx.objectStore('progress');
      const currentRunStore = tx.objectStore('currentRun');

      const checkReq = runsStore.get(summary.runId);

      checkReq.onsuccess = () => {
        const isDuplicate = checkReq.result !== undefined;

        // 1. Put summary in runs
        runsStore.put(summary);

        // 2. Put progress only if not duplicate
        if (!isDuplicate) {
          progressStore.put(progress, progress.scenarioId);
        }

        // 3. Trim runs to 50
        const allRunsReq = runsStore.getAll();
        allRunsReq.onsuccess = () => {
          const runs = allRunsReq.result as RunSummary[];
          if (runs.length > 50) {
            runs.sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
            const toDelete = runs.length - 50;
            for (let i = 0; i < toDelete; i++) {
              runsStore.delete(runs[i]!.runId);
            }
          }
        };

        // 4. Delete currentRun 'active'
        currentRunStore.delete('active');
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async count(store: StoreName): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const objStore = tx.objectStore(store);
      const req = objStore.count();

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}
