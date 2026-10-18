import type { RunSummary, ScenarioProgress, StorageDriver, StoreName } from './types';

const PREFIX = 'va:';

interface QueuedEventItem<T = unknown> {
  key: string;
  value: T;
}

export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'localstorage' as const;

  private storage: Storage;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(storage: Storage = window.localStorage) {
    this.storage = storage;
  }

  private resolveKey(store: StoreName, key: string): string {
    switch (store) {
      case 'meta':
        return `${PREFIX}meta:${key}`;
      case 'settings':
        return `${PREFIX}settings:${key}`;
      case 'progress':
        return `${PREFIX}progress:${key}`;
      case 'currentRun':
        return `${PREFIX}currentRun:${key}`;
      case 'runs':
        return `${PREFIX}runs`;
      case 'analyticsQueue':
        return `${PREFIX}analyticsQueue`;
    }
  }

  private executeSerialized<T>(op: () => T | Promise<T>): Promise<T> {
    const next = this.writeQueue.then(op, op);
    this.writeQueue = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  private safeSetItem(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch (err: unknown) {
      if (this.isQuotaExceeded(err)) {
        // SBE-STO-005: drop analytics first and retry
        this.storage.removeItem(`${PREFIX}analyticsQueue`);
        try {
          this.storage.setItem(key, value);
          return;
        } catch (retryErr) {
          if (this.isQuotaExceeded(retryErr)) {
            // Drop oldest runs and retry once more
            const runsRaw = this.storage.getItem(`${PREFIX}runs`);
            if (runsRaw) {
              try {
                const runs = JSON.parse(runsRaw) as RunSummary[];
                if (runs.length > 10) {
                  runs.sort(
                    (a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime()
                  );
                  const keep = runs.slice(Math.floor(runs.length / 2));
                  this.storage.setItem(`${PREFIX}runs`, JSON.stringify(keep));
                } else {
                  this.storage.removeItem(`${PREFIX}runs`);
                }
              } catch {
                this.storage.removeItem(`${PREFIX}runs`);
              }
            }
            this.storage.setItem(key, value);
            return;
          }
          throw retryErr;
        }
      }
      throw err;
    }
  }

  private isQuotaExceeded(err: unknown): boolean {
    return (
      err instanceof DOMException &&
      (err.code === 22 ||
        err.code === 1014 ||
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    );
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    if (store === 'runs') {
      const raw = this.storage.getItem(`${PREFIX}runs`);
      if (!raw) return undefined;
      const runs = JSON.parse(raw) as RunSummary[];
      const found = runs.find((r) => r.runId === key);
      return (found as T) ?? undefined;
    }

    if (store === 'analyticsQueue') {
      const raw = this.storage.getItem(`${PREFIX}analyticsQueue`);
      if (!raw) return undefined;
      const list = JSON.parse(raw) as QueuedEventItem<T>[];
      const found = list.find((item) => item.key === key);
      return found ? found.value : undefined;
    }

    const fullKey = this.resolveKey(store, key);
    const raw = this.storage.getItem(fullKey);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    return this.executeSerialized(() => {
      if (store === 'runs') {
        const raw = this.storage.getItem(`${PREFIX}runs`);
        const runs = raw ? (JSON.parse(raw) as RunSummary[]) : [];
        const index = runs.findIndex((r) => r.runId === key);
        const item = value as unknown as RunSummary;
        if (index >= 0) {
          runs[index] = item;
        } else {
          runs.push(item);
        }
        if (runs.length > 50) {
          runs.sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
          while (runs.length > 50) runs.shift();
        }
        this.safeSetItem(`${PREFIX}runs`, JSON.stringify(runs));
        return;
      }

      const fullKey = this.resolveKey(store, key);
      this.safeSetItem(fullKey, JSON.stringify(value));
    });
  }

  async delete(store: StoreName, key: string): Promise<void> {
    return this.executeSerialized(() => {
      if (store === 'runs') {
        const raw = this.storage.getItem(`${PREFIX}runs`);
        if (!raw) return;
        const runs = JSON.parse(raw) as RunSummary[];
        const filtered = runs.filter((r) => r.runId !== key);
        this.safeSetItem(`${PREFIX}runs`, JSON.stringify(filtered));
        return;
      }
      const fullKey = this.resolveKey(store, key);
      this.storage.removeItem(fullKey);
    });
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    if (store === 'runs') {
      const raw = this.storage.getItem(`${PREFIX}runs`);
      return raw ? (JSON.parse(raw) as T[]) : [];
    }

    if (store === 'analyticsQueue') {
      const raw = this.storage.getItem(`${PREFIX}analyticsQueue`);
      if (!raw) return [];
      const list = JSON.parse(raw) as QueuedEventItem<T>[];
      return list.map((item) => item.value);
    }

    const prefix = `${PREFIX}${store}:`;
    const results: T[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(prefix)) {
        const raw = this.storage.getItem(k);
        if (raw !== null) {
          try {
            results.push(JSON.parse(raw) as T);
          } catch {
            // ignore malformed
          }
        }
      }
    }
    return results;
  }

  async append<T>(_store: 'analyticsQueue', value: T): Promise<void> {
    return this.executeSerialized(() => {
      const raw = this.storage.getItem(`${PREFIX}analyticsQueue`);
      const queue = raw ? (JSON.parse(raw) as QueuedEventItem<T>[]) : [];
      // Cap at 500 in LocalStorage per Section 12.3
      if (queue.length >= 500) {
        queue.shift();
      }
      const item: QueuedEventItem<T> = {
        key: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        value,
      };
      queue.push(item);
      this.safeSetItem(`${PREFIX}analyticsQueue`, JSON.stringify(queue));
    });
  }

  async takeBatch<T>(
    _store: 'analyticsQueue',
    max: number
  ): Promise<{ keys: string[]; values: T[] }> {
    const raw = this.storage.getItem(`${PREFIX}analyticsQueue`);
    if (!raw) return { keys: [], values: [] };
    const queue = JSON.parse(raw) as QueuedEventItem<T>[];
    const batch = queue.slice(0, max);
    return {
      keys: batch.map((b) => b.key),
      values: batch.map((b) => b.value),
    };
  }

  async deleteKeys(_store: 'analyticsQueue', keys: string[]): Promise<void> {
    return this.executeSerialized(() => {
      const raw = this.storage.getItem(`${PREFIX}analyticsQueue`);
      if (!raw) return;
      const keySet = new Set(keys);
      const queue = JSON.parse(raw) as QueuedEventItem[];
      const remaining = queue.filter((item) => !keySet.has(item.key));
      this.safeSetItem(`${PREFIX}analyticsQueue`, JSON.stringify(remaining));
    });
  }

  async finishRun(summary: RunSummary, progress: ScenarioProgress): Promise<void> {
    return this.executeSerialized(() => {
      // 1. Process runs
      const rawRuns = this.storage.getItem(`${PREFIX}runs`);
      const runs = rawRuns ? (JSON.parse(rawRuns) as RunSummary[]) : [];
      const isDuplicate = runs.some((r) => r.runId === summary.runId);

      if (!isDuplicate) {
        runs.push(summary);
      } else {
        const index = runs.findIndex((r) => r.runId === summary.runId);
        if (index >= 0) runs[index] = summary;
      }

      if (runs.length > 50) {
        runs.sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
        while (runs.length > 50) runs.shift();
      }
      this.safeSetItem(`${PREFIX}runs`, JSON.stringify(runs));

      // 2. Update progress only if not duplicate (idempotent: SBE-PER-012)
      if (!isDuplicate) {
        this.safeSetItem(`${PREFIX}progress:${progress.scenarioId}`, JSON.stringify(progress));
      }

      // 3. Delete currentRun last
      this.storage.removeItem(`${PREFIX}currentRun:active`);
    });
  }

  async count(store: StoreName): Promise<number> {
    if (store === 'runs') {
      const raw = this.storage.getItem(`${PREFIX}runs`);
      return raw ? (JSON.parse(raw) as RunSummary[]).length : 0;
    }
    if (store === 'analyticsQueue') {
      const raw = this.storage.getItem(`${PREFIX}analyticsQueue`);
      return raw ? (JSON.parse(raw) as QueuedEventItem[]).length : 0;
    }
    const prefix = `${PREFIX}${store}:`;
    let cnt = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(prefix)) cnt++;
    }
    return cnt;
  }
}
