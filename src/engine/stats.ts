import type { CardCategory, MetricTriple } from '../content/types';
import type { Outcome, RunState, TurnRecord } from './types';

export interface RunSummary {
  runId: string;
  scenarioId: string;
  contentVersion: number;
  startedAt: string;
  endedAt: string;
  outcome: Outcome;
  turns: number;
  finalMetrics: MetricTriple;
  panicSec: number; // 1 decimal
  rtoSec: number | null;
  unrecoveredPanic: boolean;
  categoryCounts: Record<CardCategory, number>;
  constructiveCount: number;
  reactiveCount: number;
  timedOutCount: number;
  history: TurnRecord[];
}

export function calculatePanicSec(panicMsTotal: number): number {
  return Math.round(panicMsTotal / 100) / 10;
}

export function calculateRtoSec(completedEpisodesMs: readonly number[]): number | null {
  if (completedEpisodesMs.length === 0) {
    return null;
  }
  const sum = completedEpisodesMs.reduce((acc, curr) => acc + curr, 0);
  const mean = sum / completedEpisodesMs.length;
  return Math.round(mean / 100) / 10;
}

const TIE_BREAK_ORDER: readonly CardCategory[] = [
  'PACING',
  'META_MODEL',
  'REFRAMING',
  'DEFENSE',
  'ATTACK',
];

export function getDominantCategory(counts: Record<CardCategory, number>): CardCategory {
  let maxCount = -1;
  let dominant: CardCategory = 'PACING';

  for (const cat of TIE_BREAK_ORDER) {
    const c = counts[cat] || 0;
    if (c > maxCount) {
      maxCount = c;
      dominant = cat;
    }
  }

  return dominant;
}

export function buildRunSummary(state: RunState, startedAt: string, endedAt: string): RunSummary {
  if (!state.outcome) {
    throw new Error('Cannot build RunSummary for run without outcome');
  }

  const categoryCounts: Record<CardCategory, number> = {
    PACING: 0,
    META_MODEL: 0,
    REFRAMING: 0,
    DEFENSE: 0,
    ATTACK: 0,
  };

  let timedOutCount = 0;
  for (const record of state.history) {
    categoryCounts[record.category] = (categoryCounts[record.category] || 0) + 1;
    if (record.timedOut) {
      timedOutCount++;
    }
  }

  const constructiveCount =
    categoryCounts.PACING + categoryCounts.META_MODEL + categoryCounts.REFRAMING;
  const reactiveCount = categoryCounts.DEFENSE + categoryCounts.ATTACK;

  const panicSec = calculatePanicSec(state.timing.panicMsTotal);
  const rtoSec = calculateRtoSec(state.timing.completedEpisodesMs);
  const unrecoveredPanic = state.timing.panicEpisodeStartMs !== null;

  return {
    runId: state.runId,
    scenarioId: state.scenarioId,
    contentVersion: state.contentVersion,
    startedAt,
    endedAt,
    outcome: state.outcome,
    turns: state.turnIndex,
    finalMetrics: { ...state.metrics },
    panicSec,
    rtoSec,
    unrecoveredPanic,
    categoryCounts,
    constructiveCount,
    reactiveCount,
    timedOutCount,
    history: [...state.history],
  };
}
