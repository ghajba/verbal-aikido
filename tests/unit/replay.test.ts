import { describe, it, expect } from 'vitest';
import { replay } from '@/engine/replay';
import type { PersistedEvent, Scenario } from '@/engine/types';
import pmScenarioRaw from '../../public/scenarios/scen_angry_pm_deadline_001.json';

const scenario = pmScenarioRaw as unknown as Scenario;

describe('Replay Engine', () => {
  it('throws on empty event log or log not starting with START', () => {
    expect(() => replay(scenario, 42, [])).toThrow('empty event log');
    expect(() => replay(scenario, 42, [{ type: 'REVEAL_DONE', nowMs: 100 } as any])).toThrow(
      'must be START'
    );
  });

  it('SBE-FSM-008: replaying an event log reproduces exact state and history', () => {
    const events: PersistedEvent[] = [
      {
        type: 'START',
        scenarioId: scenario.id,
        contentVersion: scenario.contentVersion,
        seed: 42,
        runId: 'replay-test-run',
        nowMs: 0,
      },
      { type: 'REVEAL_DONE', nowMs: 500 },
      { type: 'CARD_COMMITTED', cardId: 'c_attack_01', nowMs: 1200 },
      { type: 'RESOLUTION_DONE', nowMs: 1780 },
      { type: 'FINALIZE', nowMs: 1780 },
    ];

    const state = replay(scenario, 42, events);
    expect(state.phase).toBe('ENDED');
    expect(state.outcome).toBe('LOSS_RUPTURE');
    expect(state.turnIndex).toBe(1);
    expect(state.history.length).toBe(1);
    expect(state.history[0]?.cardId).toBe('c_attack_01');
    expect(state.metrics.escalation).toBe(100);
  });

  it('uses fallback seed when START event does not specify one', () => {
    const eventsWithoutSeed: PersistedEvent[] = [
      {
        type: 'START',
        scenarioId: scenario.id,
        contentVersion: scenario.contentVersion,
        runId: 'replay-test-no-seed',
        nowMs: 0,
      },
    ];
    const s = replay(scenario, 999, eventsWithoutSeed);
    expect(s.runId).toBe('replay-test-no-seed');
  });
});
