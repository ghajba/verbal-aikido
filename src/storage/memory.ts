import type { RunSummary, ScenarioProgress, StorageDriver, StoreName } from './types';

export class MemoryDriver implements StorageDriver {
  readonly kind = 'memory' as const;

  private stores = new Map<StoreName, Map<string, unknown>>();
  private queueNextId = 1;

  constructor() {
    this.stores.set('meta', new Map());
    this.stores.set('settings', new Map());
    this.stores.set('progress', new Map());
    this.stores.set('runs', new Map());
    this.stores.set('currentRun', new Map());
    this.stores.set('analyticsQueue', new Map());
  }

  private getStore(store: StoreName): Map<string, unknown> {
    let map = this.stores.get(store);
    if (!map) {
      map = new Map();
      this.stores.set(store, map);
    }
    return map;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const val = this.getStore(store).get(key);
    if (val === undefined) return undefined;
    return JSON.parse(JSON.stringify(val)) as T;
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    const clone = JSON.parse(JSON.stringify(value));
    this.getStore(store).set(key, clone);
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.getStore(store).delete(key);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const map = this.getStore(store);
    return Array.from(map.values()).map((v) => JSON.parse(JSON.stringify(v)) as T);
  }

  async append<T>(store: 'analyticsQueue', value: T): Promise<void> {
    const map = this.getStore(store);
    // Analytics queue cap 2000
    if (map.size >= 2000) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) {
        map.delete(firstKey);
      }
    }
    const key = String(this.queueNextId++);
    const clone = JSON.parse(JSON.stringify(value));
    map.set(key, clone);
  }

  async takeBatch<T>(
    store: 'analyticsQueue',
    max: number
  ): Promise<{ keys: string[]; values: T[] }> {
    const map = this.getStore(store);
    const keys: string[] = [];
    const values: T[] = [];
    for (const [k, v] of map.entries()) {
      if (keys.length >= max) break;
      keys.push(k);
      values.push(JSON.parse(JSON.stringify(v)) as T);
    }
    return { keys, values };
  }

  async deleteKeys(store: 'analyticsQueue', keys: string[]): Promise<void> {
    const map = this.getStore(store);
    for (const k of keys) {
      map.delete(k);
    }
  }

  async finishRun(summary: RunSummary, progress: ScenarioProgress): Promise<void> {
    const runsMap = this.getStore('runs');
    const isDuplicate = runsMap.has(summary.runId);

    // 1. Write summary into runs
    runsMap.set(summary.runId, JSON.parse(JSON.stringify(summary)));

    // 2. Update progress only if not duplicate (idempotent: SBE-PER-012)
    if (!isDuplicate) {
      this.getStore('progress').set(progress.scenarioId, JSON.parse(JSON.stringify(progress)));
    }

    // 3. Prune runs to 50 by endedAt ascending
    if (runsMap.size > 50) {
      const all = Array.from(runsMap.entries()) as [string, RunSummary][];
      all.sort((a, b) => new Date(a[1].endedAt).getTime() - new Date(b[1].endedAt).getTime());
      const toDeleteCount = all.length - 50;
      for (let i = 0; i < toDeleteCount; i++) {
        runsMap.delete(all[i]![0]);
      }
    }

    // 4. Delete currentRun last
    this.getStore('currentRun').delete('active');
  }

  async count(store: StoreName): Promise<number> {
    return this.getStore(store).size;
  }
}
