import { describe, it, expect } from 'vitest';
import {
  calculatePanicSec,
  calculateRtoSec,
  getDominantCategory,
  buildRunSummary,
} from '@/engine/stats';
import type { RunState } from '@/engine/types';

describe('Stats & Summary calculation', () => {
  it('calculatePanicSec rounds to 1 decimal correctly', () => {
    expect(calculatePanicSec(4567)).toBe(4.6);
    expect(calculatePanicSec(1234)).toBe(1.2);
    expect(calculatePanicSec(0)).toBe(0);
  });

  it('calculateRtoSec calculates mean and rounds to 1 decimal, or returns null if empty', () => {
    expect(calculateRtoSec([])).toBeNull();
    // [3000, 5000] -> mean = 4000ms -> 4.0s
    expect(calculateRtoSec([3000, 5000])).toBe(4);
    // [3200, 4100] -> mean = 3650ms -> 3.7s
    expect(calculateRtoSec([3200, 4100])).toBe(3.7);
  });

  it('getDominantCategory breaks ties using strict order: PACING, META_MODEL, REFRAMING, DEFENSE, ATTACK', () => {
    expect(
      getDominantCategory({
        PACING: 2,
        META_MODEL: 2,
        REFRAMING: 1,
        DEFENSE: 0,
        ATTACK: 0,
      })
    ).toBe('PACING');

    expect(
      getDominantCategory({
        PACING: 1,
        META_MODEL: 3,
        REFRAMING: 3,
        DEFENSE: 0,
        ATTACK: 0,
      })
    ).toBe('META_MODEL');

    expect(
      getDominantCategory({
        PACING: 0,
        META_MODEL: 0,
        REFRAMING: 0,
        DEFENSE: 2,
        ATTACK: 2,
      })
    ).toBe('DEFENSE');
  });

  it('buildRunSummary throws if state has no outcome', () => {
    const state = { outcome: null } as unknown as RunState;
    expect(() => buildRunSummary(state, 'start', 'end')).toThrow();
  });

  it('buildRunSummary compiles complete statistics', () => {
    const mockState: RunState = {
      runId: 'r-1',
      scenarioId: 'scen-1',
      contentVersion: 1,
      seed: 42,
      rngState: 42,
      phase: 'ENDED',
      turnIndex: 2,
      currentNodeId: 'node_2',
      pendingNextNodeId: null,
      metrics: { escalation: 40, grounding: 95, confusion: 85 },
      momentum: 0,
      crisisUsed: false,
      hand: [],
      outcome: 'WIN_BREAKTHROUGH',
      resumeTimerMs: null,
      timing: {
        visibleMsTotal: 8000,
        panicMsTotal: 2500,
        inPanic: false,
        panicEpisodeStartMs: null,
        completedEpisodesMs: [2500],
        choiceEnteredAtMs: null,
        timerRemainingMs: null,
        lastEventMs: 8000,
      },
      history: [
        {
          turnIndex: 0,
          nodeId: 'node_1',
          hand: ['c1', 'c2', 'c3'],
          cardId: 'c1',
          category: 'PACING',
          timedOut: false,
          before: { escalation: 65, grounding: 100, confusion: 0 },
          after: { escalation: 45, grounding: 100, confusion: 10 },
          momentumAfter: 0,
          crisisRedirect: false,
          decisionMs: 1200,
        },
        {
          turnIndex: 1,
          nodeId: 'node_2',
          hand: ['c4', 'c5', 'c6'],
          cardId: 'c4',
          category: 'META_MODEL',
          timedOut: true,
          before: { escalation: 45, grounding: 100, confusion: 10 },
          after: { escalation: 40, grounding: 95, confusion: 85 },
          momentumAfter: 0,
          crisisRedirect: false,
          decisionMs: 15000,
        },
      ],
    };

    const summary = buildRunSummary(mockState, '2026-10-18T08:00:00Z', '2026-10-18T08:00:08Z');
    expect(summary.outcome).toBe('WIN_BREAKTHROUGH');
    expect(summary.turns).toBe(2);
    expect(summary.panicSec).toBe(2.5);
    expect(summary.rtoSec).toBe(2.5);
    expect(summary.unrecoveredPanic).toBe(false);
    expect(summary.constructiveCount).toBe(2);
    expect(summary.reactiveCount).toBe(0);
    expect(summary.timedOutCount).toBe(1);
    expect(summary.categoryCounts.PACING).toBe(1);
    expect(summary.categoryCounts.META_MODEL).toBe(1);
  });
});
