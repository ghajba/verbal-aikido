import type { CardCategory, Locale, MetricTriple } from '../content/types';
import type { Outcome, PersistedEvent, RunTiming, TurnRecord } from '../engine/types';

export type StoreName = 'meta' | 'settings' | 'progress' | 'runs' | 'currentRun' | 'analyticsQueue';

export interface MetaApp {
  installId: string;
  createdAt: string;
  onboardingDone: boolean;
  persona: string | null;
  dbSchema: 1;
}

export interface Settings {
  audioMuted: boolean; // default false
  hapticIntensity: 'OFF' | 'LOW' | 'HIGH'; // default 'HIGH'
  reducedMotion: 'system' | 'on' | 'off'; // default 'system'
  locale: Locale | 'auto'; // default 'auto' (D29)
}

export interface ScenarioProgress {
  scenarioId: string;
  completedCount: number; // runs that reached ENDED with an outcome
  winCount: number;
  bestOutcome: Outcome | null; // WIN > DEESCALATED > UNRESOLVED > BURNOUT > RUPTURE
  bestRtoSec: number | null;
  lastRtoSec: number | null;
  lastPlayedAt: string; // ISO
}

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
  history: TurnRecord[]; // for debrief replay and sparkline
}

export interface PersistedRun {
  runId: string;
  scenarioId: string;
  contentVersion: number;
  seed: number;
  startedAt: string;
  events: PersistedEvent[]; // Section 6.2; START holds scenarioId + seed only
  timing: RunTiming; // snapshot of latest timing
  savedAt: string;
}

export type TelemetryName =
  | 'app_open'
  | 'onboarding_done'
  | 'scenario_start'
  | 'run_resumed'
  | 'resume_discarded'
  | 'card_played'
  | 'crisis_redirect'
  | 'scenario_end'
  | 'scenario_abandon'
  | 'settings_changed'
  | 'content_error'
  | 'sw_update_applied';

export interface TelemetryEvent {
  eventId: string; // uuid
  name: TelemetryName;
  ts: string; // ISO wall time
  appVersion: string; // package version
  runId?: string;
  scenarioId?: string;
  props: Record<string, string | number | boolean | null>;
}

export interface StorageDriver {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  append<T>(store: 'analyticsQueue', value: T): Promise<void>;
  takeBatch<T>(store: 'analyticsQueue', max: number): Promise<{ keys: string[]; values: T[] }>;
  deleteKeys(store: 'analyticsQueue', keys: string[]): Promise<void>;
  // D38: write summary, update progress, prune runs to 50, delete currentRun.
  // IndexedDB: one readwrite transaction over runs, progress, currentRun.
  // LocalStorage / memory: runs, then progress, then delete currentRun last.
  // Idempotent: if runs already holds summary.runId, progress is not touched again.
  finishRun(summary: RunSummary, progress: ScenarioProgress): Promise<void>;
  count(store: StoreName): Promise<number>;
}
