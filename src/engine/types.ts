import type { CardCategory, MetricTriple, Scenario } from '../content/types';

export type Phase =
  | 'ATTACK_INCOMING'
  | 'INTERVENTION_CHOICE'
  | 'RESOLUTION_PHASE'
  | 'OUTCOME_CHECK'
  | 'ENDED';

export type Outcome =
  | 'WIN_BREAKTHROUGH'
  | 'LOSS_RUPTURE'
  | 'LOSS_BURNOUT'
  | 'END_DEESCALATED'
  | 'END_UNRESOLVED';

export interface TurnRecord {
  turnIndex: number; // 0-based
  nodeId: string;
  hand: string[]; // cardIds offered, in display order
  cardId: string; // committed card
  category: CardCategory;
  timedOut: boolean;
  before: MetricTriple;
  after: MetricTriple;
  momentumAfter: number;
  crisisRedirect: boolean;
  decisionMs: number; // visible ms from INTERVENTION_CHOICE entry to commit
}

export interface RunTiming {
  visibleMsTotal: number;
  panicMsTotal: number;
  inPanic: boolean;
  panicEpisodeStartMs: number | null; // on the visible clock
  completedEpisodesMs: number[];
  choiceEnteredAtMs: number | null;
  timerRemainingMs: number | null; // stress timer, null if scenario has none
  lastEventMs: number; // nowMs of the last event processed
}

export interface RunState {
  runId: string; // uuid v4 (crypto.randomUUID)
  scenarioId: string;
  contentVersion: number;
  seed: number; // uint32
  rngState: number; // current mulberry32 state
  phase: Phase;
  turnIndex: number; // number of turns already resolved
  currentNodeId: string;
  pendingNextNodeId: string | null; // set in OUTCOME_CHECK, consumed by CONTINUE
  metrics: MetricTriple;
  momentum: number; // M_eszk, 0..4
  crisisUsed: boolean;
  hand: string[]; // current hand cardIds (empty outside INTERVENTION_CHOICE)
  history: TurnRecord[];
  outcome: Outcome | null;
  timing: RunTiming;
  resumeTimerMs: number | null; // D36: set on resume, consumed by the next REVEAL_DONE
}

export type GameEvent =
  | { type: 'START'; scenario: Scenario; seed: number; runId: string; nowMs: number }
  | { type: 'REVEAL_DONE'; nowMs: number }
  | { type: 'CARD_COMMITTED'; cardId: string; nowMs: number; timedOut?: boolean }
  | { type: 'RESOLUTION_DONE'; nowMs: number }
  | { type: 'CONTINUE'; nowMs: number }
  | { type: 'FINALIZE'; nowMs: number } // OUTCOME_CHECK -> ENDED when outcome != null
  | { type: 'TICK'; nowMs: number } // visible clock tick, drives panic time + timer
  | { type: 'ABANDON'; nowMs: number };

export type { Scenario } from '../content/types';

export type PersistedEvent =
  | {
      type: 'START';
      scenarioId: string;
      contentVersion: number;
      seed?: number;
      runId: string;
      nowMs: number;
    }
  | Exclude<GameEvent, { type: 'START' } | { type: 'TICK' } | { type: 'ABANDON' }>;
