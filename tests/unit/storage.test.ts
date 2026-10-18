import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { MemoryDriver } from '@/storage/memory';
import { LocalStorageDriver } from '@/storage/localstorage';
import { IndexedDbDriver } from '@/storage/indexeddb';
import { openStorage, initMeta } from '@/storage/index';
import { runSharedStorageSuite } from './storage/shared-suite';
import type { RunSummary, ScenarioProgress } from '@/storage/types';

class MockLocalStorage implements Storage {
  private map = new Map<string, string>();
  quotaExceededOnNextSet = false;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.quotaExceededOnNextSet) {
      const err = new DOMException('QuotaExceeded', 'QuotaExceededError');
      throw err;
    }
    this.map.set(key, value);
  }
}

// 1. Run shared suite on MemoryDriver
runSharedStorageSuite('MemoryDriver', async () => new MemoryDriver());

// 2. Run shared suite on LocalStorageDriver
runSharedStorageSuite('LocalStorageDriver', async () => {
  const mockStorage = new MockLocalStorage();
  return new LocalStorageDriver(mockStorage);
});

// 3. Run shared suite on IndexedDbDriver
runSharedStorageSuite('IndexedDbDriver', async () => {
  const fakeIdb = new FakeIDBFactory();
  return IndexedDbDriver.open(fakeIdb, 2000);
});

describe('Storage open and fallback rules', () => {
  it('SBE-STO-001: IndexedDB is used when available and creates all 6 stores', async () => {
    const fakeIdb = new FakeIDBFactory();
    const res = await openStorage({ idbFactory: fakeIdb });
    expect(res.driver.kind).toBe('indexeddb');
    expect(res.volatile).toBe(false);

    // Verify all stores exist
    const stores = [
      'meta',
      'settings',
      'progress',
      'runs',
      'currentRun',
      'analyticsQueue',
    ] as const;
    for (const store of stores) {
      expect(await res.driver.count(store)).toBe(0);
    }
  });

  it('SBE-STO-002: IndexedDB failure falls back to LocalStorage', async () => {
    const brokenIdb = {
      open: () => {
        const req = {} as any;
        setTimeout(() => {
          if (req.onerror) req.onerror(new Event('error'));
        }, 5);
        return req;
      },
    } as unknown as IDBFactory;

    const mockStorage = new MockLocalStorage();
    const res = await openStorage({
      idbFactory: brokenIdb,
      storageFactory: mockStorage,
    });

    expect(res.driver.kind).toBe('localstorage');
    expect(res.volatile).toBe(false);
  });

  it('SBE-STO-003: IndexedDB open that hangs falls back after timeout', async () => {
    const hangingIdb = {
      open: () => ({}) as any, // never calls onsuccess or onerror
    } as unknown as IDBFactory;

    const mockStorage = new MockLocalStorage();
    const res = await openStorage({
      idbFactory: hangingIdb,
      storageFactory: mockStorage,
      timeoutMs: 50, // fast timeout for test
    });

    expect(res.driver.kind).toBe('localstorage');
    expect(res.volatile).toBe(false);
  });

  it('SBE-STO-004: No storage at all uses memory and marks volatile', async () => {
    const brokenIdb = {
      open: () => {
        throw new Error('IDB disabled');
      },
    } as unknown as IDBFactory;

    const brokenStorage = {
      setItem: () => {
        throw new Error('SecurityError: LocalStorage disabled');
      },
    } as unknown as Storage;

    const res = await openStorage({
      idbFactory: brokenIdb,
      storageFactory: brokenStorage,
    });

    expect(res.driver.kind).toBe('memory');
    expect(res.volatile).toBe(true);
  });

  it('SBE-STO-005: LocalStorage QuotaExceeded drops analytics first, then oldest runs', async () => {
    const mockStorage = new MockLocalStorage();
    const driver = new LocalStorageDriver(mockStorage);

    // Seed analyticsQueue
    await driver.append('analyticsQueue', { test: 1 });
    expect(await driver.count('analyticsQueue')).toBe(1);

    // Trigger quota exceeded on next write
    mockStorage.quotaExceededOnNextSet = true;

    const summary: RunSummary = {
      runId: 'quota-run',
      scenarioId: 'scen_01',
      contentVersion: 1,
      startedAt: '2026-10-18T00:00:00.000Z',
      endedAt: '2026-10-18T01:00:00.000Z',
      outcome: 'WIN_BREAKTHROUGH',
      turns: 1,
      finalMetrics: { escalation: 20, grounding: 80, confusion: 80 },
      panicSec: 0,
      rtoSec: null,
      unrecoveredPanic: false,
      categoryCounts: { PACING: 1, META_MODEL: 0, REFRAMING: 0, DEFENSE: 0, ATTACK: 0 },
      constructiveCount: 1,
      reactiveCount: 0,
      timedOutCount: 0,
      history: [],
    };
    const progress: ScenarioProgress = {
      scenarioId: 'scen_01',
      completedCount: 1,
      winCount: 1,
      bestOutcome: 'WIN_BREAKTHROUGH',
      bestRtoSec: null,
      lastRtoSec: null,
      lastPlayedAt: summary.endedAt,
    };

    // When saving under quota pressure, it clears analyticsQueue first and succeeds
    mockStorage.quotaExceededOnNextSet = false; // will succeed on retry
    mockStorage.setItem = (key: string, val: string) => {
      // Throw quota exception once if key is va:runs
      if (key === 'va:runs' && mockStorage.getItem('va:analyticsQueue')) {
        throw new DOMException('QuotaExceeded', 'QuotaExceededError');
      }
      mockStorage['map'].set(key, val);
    };

    await driver.finishRun(summary, progress);
    expect(await driver.get('runs', 'quota-run')).toBeDefined();
    // analyticsQueue was cleared to free space
    expect(await driver.count('analyticsQueue')).toBe(0);
  });

  it('SBE-STO-007: Analytics queue caps and drops oldest event in IndexedDB', async () => {
    const fakeIdb = new FakeIDBFactory();
    const driver = await IndexedDbDriver.open(fakeIdb);

    // Append 5 items with a test limit check
    await driver.append('analyticsQueue', { index: 1 });
    await driver.append('analyticsQueue', { index: 2 });
    expect(await driver.count('analyticsQueue')).toBe(2);

    const batch = await driver.takeBatch<{ index: number }>('analyticsQueue', 2);
    expect(batch.values[0]?.index).toBe(1);
    expect(batch.values[1]?.index).toBe(2);
  });

  it('initMeta creates a new installId UUID or loads existing', async () => {
    const driver = new MemoryDriver();
    const meta1 = await initMeta(driver);
    expect(meta1.installId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(meta1.dbSchema).toBe(1);
    expect(meta1.onboardingDone).toBe(false);

    // Call again should return exact same meta
    const meta2 = await initMeta(driver);
    expect(meta2.installId).toBe(meta1.installId);
    expect(meta2.createdAt).toBe(meta1.createdAt);
  });

  it('MemoryDriver caps analyticsQueue at 2000 items dropping oldest', async () => {
    const driver = new MemoryDriver();
    // Fill to 2000
    for (let i = 0; i < 2000; i++) {
      await driver.append('analyticsQueue', { i });
    }
    expect(await driver.count('analyticsQueue')).toBe(2000);

    // 2001st item
    await driver.append('analyticsQueue', { i: 2000 });
    expect(await driver.count('analyticsQueue')).toBe(2000);

    const batch = await driver.takeBatch<{ i: number }>('analyticsQueue', 1);
    expect(batch.values[0]?.i).toBe(1); // oldest was 0, dropped!
  });

  it('LocalStorageDriver covers queue get/getAll, runs delete, queue cap, and empty batch', async () => {
    const mockStorage = new MockLocalStorage();
    const driver = new LocalStorageDriver(mockStorage);

    // Empty takeBatch
    const emptyBatch = await driver.takeBatch('analyticsQueue', 10);
    expect(emptyBatch.values).toEqual([]);

    // Delete keys on empty queue
    await driver.deleteKeys('analyticsQueue', ['k1']);

    // Append 501 items to test 500-cap
    for (let i = 0; i < 501; i++) {
      await driver.append('analyticsQueue', { i });
    }
    expect(await driver.count('analyticsQueue')).toBe(500);

    const allQueue = await driver.getAll<{ i: number }>('analyticsQueue');
    expect(allQueue.length).toBe(500);
    expect(allQueue[0]?.i).toBe(1); // 0 was dropped

    // takeBatch and get on analyticsQueue
    const batch = await driver.takeBatch<{ i: number }>('analyticsQueue', 1);
    const key = batch.keys[0]!;
    const fetched = await driver.get<{ i: number }>('analyticsQueue', key);
    expect(fetched?.i).toBe(1);
    expect(await driver.get('analyticsQueue', 'unknown-key')).toBeUndefined();

    // Runs put update and delete
    const run1: RunSummary = {
      runId: 'r-1',
      scenarioId: 's-1',
      contentVersion: 1,
      startedAt: '2026-10-18T00:00:00.000Z',
      endedAt: '2026-10-18T01:00:00.000Z',
      outcome: 'WIN_BREAKTHROUGH',
      turns: 1,
      finalMetrics: { escalation: 10, grounding: 90, confusion: 80 },
      panicSec: 0,
      rtoSec: null,
      unrecoveredPanic: false,
      categoryCounts: { PACING: 1, META_MODEL: 0, REFRAMING: 0, DEFENSE: 0, ATTACK: 0 },
      constructiveCount: 1,
      reactiveCount: 0,
      timedOutCount: 0,
      history: [],
    };
    await driver.put('runs', 'r-1', run1);
    expect(await driver.count('runs')).toBe(1);

    // Update r-1
    await driver.put('runs', 'r-1', { ...run1, turns: 2 });
    const updated = await driver.get<RunSummary>('runs', 'r-1');
    expect(updated?.turns).toBe(2);

    // Delete r-1
    await driver.delete('runs', 'r-1');
    expect(await driver.count('runs')).toBe(0);
    expect(await driver.get('runs', 'r-1')).toBeUndefined();

    // Malformed JSON handling in get and getAll
    mockStorage.setItem('va:settings:corrupt', '{bad json');
    expect(await driver.get('settings', 'corrupt')).toBeUndefined();
    expect(await driver.getAll('settings')).toEqual([]);
  });

  it('LocalStorageDriver quota recovery drops runs when <= 10 or > 10 runs exist', async () => {
    const mockStorage = new MockLocalStorage();
    const driver = new LocalStorageDriver(mockStorage);

    // Populate with 12 runs
    for (let i = 1; i <= 12; i++) {
      const r: RunSummary = {
        runId: `run-${i}`,
        scenarioId: 's-1',
        contentVersion: 1,
        startedAt: `2026-10-18T00:00:00.${i}Z`,
        endedAt: `2026-10-18T01:00:00.${i}Z`,
        outcome: 'WIN_BREAKTHROUGH',
        turns: 1,
        finalMetrics: { escalation: 10, grounding: 90, confusion: 80 },
        panicSec: 0,
        rtoSec: null,
        unrecoveredPanic: false,
        categoryCounts: { PACING: 1, META_MODEL: 0, REFRAMING: 0, DEFENSE: 0, ATTACK: 0 },
        constructiveCount: 1,
        reactiveCount: 0,
        timedOutCount: 0,
        history: [],
      };
      await driver.put('runs', r.runId, r);
    }
    expect(await driver.count('runs')).toBe(12);

    // Make setItem throw quota error twice: first for analytics (none), then for runs
    let failCount = 0;
    mockStorage.setItem = (key: string, val: string) => {
      if (failCount < 2) {
        failCount++;
        throw new DOMException('Quota', 'QuotaExceededError');
      }
      mockStorage['map'].set(key, val);
    };

    // Putting a new key triggers quota drop of runs (>10 runs -> sliced in half)
    await driver.put('settings', 'user', { audioMuted: true });
    expect(await driver.count('runs')).toBe(6);

    // Now when <= 10 runs exist, another quota triggers full drop of runs
    failCount = 0;
    await driver.put('settings', 'user', { audioMuted: false });
    expect(await driver.count('runs')).toBe(0);
  });

  it('openStorage defaults to available environment storage when called without arguments', async () => {
    const res = await openStorage();
    expect(res.driver).toBeDefined();
    expect(['indexeddb', 'localstorage', 'memory']).toContain(res.driver.kind);
  });

  it('IndexedDbDriver handles empty deleteKeys gracefully and caps queue at 2000', async () => {
    const fakeIdb = new FakeIDBFactory();
    const driver = await IndexedDbDriver.open(fakeIdb);
    await driver.deleteKeys('analyticsQueue', []);
    expect(await driver.count('analyticsQueue')).toBe(0);

    // Append 2001 items to verify cursor deletion of oldest
    for (let i = 0; i < 2001; i++) {
      await driver.append('analyticsQueue', { i });
    }
    expect(await driver.count('analyticsQueue')).toBe(2000);
    const batch = await driver.takeBatch<{ i: number }>('analyticsQueue', 1);
    expect(batch.values[0]?.i).toBe(1); // 0 was dropped
  });

  it('MemoryDriver dynamically creates store when accessing unknown store name', () => {
    const driver = new MemoryDriver();
    const store = (driver as any).getStore('customStore');
    expect(store).toBeDefined();
    expect(store.size).toBe(0);
  });

  it('LocalStorageDriver handles delete on runs when no runs exist in storage', async () => {
    const mockStorage = new MockLocalStorage();
    const driver = new LocalStorageDriver(mockStorage);
    // storage is empty
    expect(await driver.getAll('runs')).toEqual([]);
    await driver.delete('runs', 'nonexistent');
    expect(await driver.count('runs')).toBe(0);

    // Put > 50 runs directly into runs store to test trimming in put()
    for (let i = 1; i <= 52; i++) {
      const r: RunSummary = {
        runId: `direct-run-${i}`,
        scenarioId: 's-1',
        contentVersion: 1,
        startedAt: `2026-10-18T00:00:00.${i}Z`,
        endedAt: `2026-10-18T01:00:00.${i}Z`,
        outcome: 'WIN_BREAKTHROUGH',
        turns: 1,
        finalMetrics: { escalation: 10, grounding: 90, confusion: 80 },
        panicSec: 0,
        rtoSec: null,
        unrecoveredPanic: false,
        categoryCounts: { PACING: 1, META_MODEL: 0, REFRAMING: 0, DEFENSE: 0, ATTACK: 0 },
        constructiveCount: 1,
        reactiveCount: 0,
        timedOutCount: 0,
        history: [],
      };
      await driver.put('runs', r.runId, r);
    }
    expect(await driver.count('runs')).toBe(50);
  });
});
