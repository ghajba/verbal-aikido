import type { MetaApp, StorageDriver } from './types';
import { IndexedDbDriver } from './indexeddb';
import { LocalStorageDriver } from './localstorage';
import { MemoryDriver } from './memory';

export * from './types';
export * from './memory';
export * from './localstorage';
export * from './indexeddb';

export interface StorageInitResult {
  driver: StorageDriver;
  volatile: boolean;
}

export interface OpenStorageOptions {
  timeoutMs?: number;
  idbFactory?: IDBFactory;
  storageFactory?: Storage;
}

export async function openStorage(options: OpenStorageOptions = {}): Promise<StorageInitResult> {
  const timeoutMs = options.timeoutMs ?? 1500;
  const idbFactory =
    options.idbFactory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  const storageFactory =
    options.storageFactory ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);

  // 1. Try IndexedDB with timeout (SBE-STO-001, SBE-STO-003)
  if (idbFactory) {
    try {
      const driver = await IndexedDbDriver.open(idbFactory, timeoutMs);
      return { driver, volatile: false };
    } catch {
      // Fall through to LocalStorage
    }
  }

  // 2. Try LocalStorage with probe (SBE-STO-002)
  if (storageFactory) {
    try {
      const probeKey = 'va:probe';
      storageFactory.setItem(probeKey, '1');
      storageFactory.removeItem(probeKey);
      const driver = new LocalStorageDriver(storageFactory);
      return { driver, volatile: false };
    } catch {
      // Fall through to Memory
    }
  }

  // 3. Fall back to in-memory driver (SBE-STO-004)
  const driver = new MemoryDriver();
  return { driver, volatile: true };
}

export async function initMeta(driver: StorageDriver): Promise<MetaApp> {
  const existing = await driver.get<MetaApp>('meta', 'app');
  if (existing) {
    return existing;
  }

  const meta: MetaApp = {
    installId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    onboardingDone: false,
    persona: null,
    dbSchema: 1,
  };

  await driver.put('meta', 'app', meta);
  return meta;
}
