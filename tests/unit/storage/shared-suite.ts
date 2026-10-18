import { describe, it, expect, beforeEach } from 'vitest';
import type { RunSummary, ScenarioProgress, StorageDriver, StoreName } from '@/storage/types';

export function runSharedStorageSuite(
  driverName: string,
  createDriver: () => Promise<StorageDriver>
) {
  describe(`StorageDriver shared suite: ${driverName}`, () => {
    let driver: StorageDriver;

    beforeEach(async () => {
      driver = await createDriver();
    });

    it('SBE-STO-006: puts, gets, counts, and deletes records in stores', async () => {
      const stores: StoreName[] = ['meta', 'settings', 'progress', 'currentRun'];
      for (const store of stores) {
        expect(await driver.count(store)).toBe(0);
        await driver.put(store, 'testKey', { hello: 'world' });
        expect(await driver.count(store)).toBe(1);

        const retrieved = await driver.get<{ hello: string }>(store, 'testKey');
        expect(retrieved).toEqual({ hello: 'world' });

        const all = await driver.getAll<{ hello: string }>(store);
        expect(all.length).toBe(1);
        expect(all[0]).toEqual({ hello: 'world' });

        await driver.delete(store, 'testKey');
        expect(await driver.count(store)).toBe(0);
        expect(await driver.get(store, 'testKey')).toBeUndefined();
      }
    });

    it('appends and reads analyticsQueue batches', async () => {
      await driver.append('analyticsQueue', { event: 1 });
      await driver.append('analyticsQueue', { event: 2 });
      await driver.append('analyticsQueue', { event: 3 });

      expect(await driver.count('analyticsQueue')).toBe(3);

      const batch = await driver.takeBatch<{ event: number }>('analyticsQueue', 2);
      expect(batch.keys.length).toBe(2);
      expect(batch.values).toEqual([{ event: 1 }, { event: 2 }]);

      await driver.deleteKeys('analyticsQueue', batch.keys);
      expect(await driver.count('analyticsQueue')).toBe(1);

      const remaining = await driver.takeBatch<{ event: number }>('analyticsQueue', 10);
      expect(remaining.values).toEqual([{ event: 3 }]);
    });

    it('SBE-PER-012: finishRun is idempotent and ordered on every driver', async () => {
      // Put an active current run first
      await driver.put('currentRun', 'active', { runId: 'run-gld-002', step: 1 });
      expect(await driver.get('currentRun', 'active')).toBeDefined();

      const summary: RunSummary = {
        runId: 'run-gld-002',
        scenarioId: 'scen_angry_pm_deadline_001',
        contentVersion: 1,
        startedAt: '2026-10-18T08:00:00.000Z',
        endedAt: '2026-10-18T08:02:00.000Z',
        outcome: 'LOSS_RUPTURE',
        turns: 1,
        finalMetrics: { escalation: 100, grounding: 68.75, confusion: 0 },
        panicSec: 0,
        rtoSec: null,
        unrecoveredPanic: false,
        categoryCounts: {
          PACING: 0,
          META_MODEL: 0,
          REFRAMING: 0,
          DEFENSE: 0,
          ATTACK: 1,
        },
        constructiveCount: 0,
        reactiveCount: 1,
        timedOutCount: 0,
        history: [],
      };

      const progress1: ScenarioProgress = {
        scenarioId: 'scen_angry_pm_deadline_001',
        completedCount: 1,
        winCount: 0,
        bestOutcome: 'LOSS_RUPTURE',
        bestRtoSec: null,
        lastRtoSec: null,
        lastPlayedAt: '2026-10-18T08:02:00.000Z',
      };

      // First finishRun
      await driver.finishRun(summary, progress1);

      // Check currentRun is deleted
      expect(await driver.get('currentRun', 'active')).toBeUndefined();

      // Check runs holds exactly one summary with that runId
      const storedSummary = await driver.get<RunSummary>('runs', 'run-gld-002');
      expect(storedSummary).toBeDefined();
      expect(storedSummary?.runId).toBe('run-gld-002');
      expect(await driver.count('runs')).toBe(1);

      // Check progress
      const storedProgress1 = await driver.get<ScenarioProgress>(
        'progress',
        'scen_angry_pm_deadline_001'
      );
      expect(storedProgress1?.completedCount).toBe(1);

      // Second finishRun with the SAME summary but different progress data
      const modifiedProgress: ScenarioProgress = {
        ...progress1,
        completedCount: 999, // Should NOT be applied because it's duplicate!
      };

      await driver.finishRun(summary, modifiedProgress);

      // Verify idempotency: progress.completedCount is still 1
      const storedProgress2 = await driver.get<ScenarioProgress>(
        'progress',
        'scen_angry_pm_deadline_001'
      );
      expect(storedProgress2?.completedCount).toBe(1);
      expect(await driver.count('runs')).toBe(1);
    });

    it('SBE-PER-010: Only the last 50 runs are kept and oldest by endedAt is dropped', async () => {
      // Store 50 runs with increasing endedAt dates
      for (let i = 1; i <= 50; i++) {
        const sum: RunSummary = {
          runId: `run-${i.toString().padStart(3, '0')}`,
          scenarioId: 'scen_01',
          contentVersion: 1,
          startedAt: `2026-10-18T00:00:00.${i.toString().padStart(3, '0')}Z`,
          endedAt: `2026-10-18T01:00:00.${i.toString().padStart(3, '0')}Z`,
          outcome: 'WIN_BREAKTHROUGH',
          turns: 3,
          finalMetrics: { escalation: 20, grounding: 80, confusion: 80 },
          panicSec: 0,
          rtoSec: null,
          unrecoveredPanic: false,
          categoryCounts: { PACING: 2, META_MODEL: 1, REFRAMING: 0, DEFENSE: 0, ATTACK: 0 },
          constructiveCount: 3,
          reactiveCount: 0,
          timedOutCount: 0,
          history: [],
        };
        const prog: ScenarioProgress = {
          scenarioId: 'scen_01',
          completedCount: i,
          winCount: i,
          bestOutcome: 'WIN_BREAKTHROUGH',
          bestRtoSec: null,
          lastRtoSec: null,
          lastPlayedAt: sum.endedAt,
        };
        await driver.finishRun(sum, prog);
      }

      expect(await driver.count('runs')).toBe(50);
      expect(await driver.get('runs', 'run-001')).toBeDefined();

      // Add 51st run with newest endedAt
      const run51: RunSummary = {
        runId: 'run-051',
        scenarioId: 'scen_01',
        contentVersion: 1,
        startedAt: '2026-10-18T02:00:00.000Z',
        endedAt: '2026-10-18T02:05:00.000Z',
        outcome: 'WIN_BREAKTHROUGH',
        turns: 3,
        finalMetrics: { escalation: 20, grounding: 80, confusion: 80 },
        panicSec: 0,
        rtoSec: null,
        unrecoveredPanic: false,
        categoryCounts: { PACING: 2, META_MODEL: 1, REFRAMING: 0, DEFENSE: 0, ATTACK: 0 },
        constructiveCount: 3,
        reactiveCount: 0,
        timedOutCount: 0,
        history: [],
      };
      const prog51: ScenarioProgress = {
        scenarioId: 'scen_01',
        completedCount: 51,
        winCount: 51,
        bestOutcome: 'WIN_BREAKTHROUGH',
        bestRtoSec: null,
        lastRtoSec: null,
        lastPlayedAt: run51.endedAt,
      };

      await driver.finishRun(run51, prog51);

      expect(await driver.count('runs')).toBe(50);
      // run-001 had oldest endedAt, so it must be pruned
      expect(await driver.get('runs', 'run-001')).toBeUndefined();
      // run-051 must be present
      expect(await driver.get('runs', 'run-051')).toBeDefined();
    });
  });
}
