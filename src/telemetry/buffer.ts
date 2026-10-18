import type { CardCategory, Locale } from '../content/types';
import type { Outcome } from '../engine/types';
import type { StorageDriver, TelemetryEvent, TelemetryName } from '../storage/types';

export interface CardPlayedParams {
  runId: string;
  scenarioId: string;
  turn: number; // 1-based (turnIndex + 1)
  nodeId: string;
  cardId: string;
  category: CardCategory;
  timedOut?: boolean;
  decisionMs: number;
  E: number;
  F: number;
  K: number;
}

export interface ScenarioEndParams {
  runId: string;
  scenarioId: string;
  outcome: Outcome;
  turns: number;
  panicSec: number;
  rtoSec: number | null;
  constructive: number;
  reactive: number;
  locale: Locale;
}

export interface ScenarioStartParams {
  runId: string;
  scenarioId: string;
  difficulty: string;
  seed: number;
  locale: Locale;
}

export class TelemetryBuffer {
  private driver: StorageDriver;
  private appVersion: string;

  constructor(driver: StorageDriver, appVersion: string = '1.0.0') {
    this.driver = driver;
    this.appVersion = appVersion;
  }

  async record(
    name: TelemetryName,
    props: Record<string, string | number | boolean | null>,
    extra?: { runId?: string; scenarioId?: string }
  ): Promise<TelemetryEvent> {
    const event: TelemetryEvent = {
      eventId: crypto.randomUUID(),
      name,
      ts: new Date().toISOString(),
      appVersion: this.appVersion,
      runId: extra?.runId,
      scenarioId: extra?.scenarioId,
      props,
    };

    await this.driver.append('analyticsQueue', event);
    return event;
  }

  async recordCardPlayed(params: CardPlayedParams): Promise<TelemetryEvent> {
    return this.record(
      'card_played',
      {
        turn: params.turn,
        nodeId: params.nodeId,
        cardId: params.cardId,
        category: params.category,
        timedOut: params.timedOut ?? false,
        decisionMs: params.decisionMs,
        E: params.E,
        F: params.F,
        K: params.K,
      },
      { runId: params.runId, scenarioId: params.scenarioId }
    );
  }

  async recordScenarioEnd(params: ScenarioEndParams): Promise<TelemetryEvent> {
    return this.record(
      'scenario_end',
      {
        outcome: params.outcome,
        turns: params.turns,
        panicSec: params.panicSec,
        rtoSec: params.rtoSec,
        constructive: params.constructive,
        reactive: params.reactive,
        locale: params.locale,
      },
      { runId: params.runId, scenarioId: params.scenarioId }
    );
  }

  async recordScenarioStart(params: ScenarioStartParams): Promise<TelemetryEvent> {
    return this.record(
      'scenario_start',
      {
        difficulty: params.difficulty,
        seed: params.seed,
        resumed: false,
        locale: params.locale,
      },
      { runId: params.runId, scenarioId: params.scenarioId }
    );
  }
}
