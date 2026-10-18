import { signal, type Signal } from '@preact/signals';
import type { CardCategory, Scenario } from '../content/types';
import { INPUT_LOCK_MS, REVEAL_MAX_MS, REVEAL_MS_PER_CHAR } from '../engine/constants';
import { firstReactiveCard, gameReducer } from '../engine/fsm';
import { replay } from '../engine/replay';
import { buildRunSummary, calculateRtoSec } from '../engine/stats';
import type { GameEvent, Outcome, PersistedEvent, RunState } from '../engine/types';
import type { PersistedRun, ScenarioProgress, StorageDriver } from '../storage/types';
import type { TelemetryBuffer } from '../telemetry/buffer';
import { VisibleClock } from './clock';

export type HapticPattern = 'TAP' | 'VALIDATION' | 'BREAKTHROUGH' | 'DAMAGE';
export type AudioEvent =
  | 'CONSTRUCTIVE'
  | 'INQUIRY'
  | 'REACTIVE'
  | 'WIN'
  | 'LOSS'
  | 'TIMER_WARN'
  | 'TONE_CUE';

export interface ControllerDependencies {
  storage: StorageDriver;
  telemetry?: TelemetryBuffer;
  clock?: VisibleClock;
  fastReveal?: boolean;
  haptics?: (pattern: HapticPattern) => void;
  audio?: (event: AudioEvent) => void;
  announce?: (text: string, assertive?: boolean) => void;
  onNavigate?: (screen: 'home' | 'game' | 'debrief', payload?: string) => void;
}

export class GameController {
  readonly runState: Signal<RunState | null> = signal<RunState | null>(null);
  readonly isTransitioning: Signal<boolean> = signal<boolean>(false);

  private deps: ControllerDependencies;
  private clock: VisibleClock;
  private scenario: Scenario | null = null;
  private persistedEvents: PersistedEvent[] = [];
  private tickIntervalId: number | null = null;
  private revealTimeoutId: number | null = null;
  private resolutionTimeoutId: number | null = null;
  private inputLockTimeoutId: number | null = null;
  private outcomeFinalizeTimeoutId: number | null = null;
  private timerWarnFired: boolean = false;
  private revealStartMs: number = 0;
  private revealDurationMs: number = 0;
  private resolutionStartMs: number = 0;
  private resolutionDurationMs: number = 0;
  private runStartedAt: string = new Date().toISOString();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(deps: ControllerDependencies) {
    this.deps = deps;
    this.clock = deps.clock ?? new VisibleClock();

    // Listen to clock state changes (freeze/pause and resume)
    this.clock.onStateChange((paused) => {
      if (paused) {
        this.handleFreeze();
      } else {
        this.handleUnfreeze();
      }
    });
  }

  getClock(): VisibleClock {
    return this.clock;
  }

  getScenario(): Scenario | null {
    return this.scenario;
  }

  private executeSerialized(op: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(op, op);
    this.writeQueue = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  async start(
    scenario: Scenario,
    seed: number = crypto.getRandomValues(new Uint32Array(1))[0]!,
    runId: string = crypto.randomUUID()
  ): Promise<void> {
    this.clearAllTimers();
    this.scenario = scenario;
    this.persistedEvents = [];
    this.timerWarnFired = false;
    this.runStartedAt = new Date().toISOString();

    // Reset clock for new run
    this.clock.reset(0);

    const startEvent: GameEvent = {
      type: 'START',
      scenario,
      seed,
      runId,
      nowMs: this.clock.now(),
    };

    await this.dispatch(startEvent);
  }

  async commitCard(cardId: string): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase !== 'INTERVENTION_CHOICE') {
      return;
    }
    if (!state.hand.includes(cardId)) {
      return;
    }

    await this.dispatch({
      type: 'CARD_COMMITTED',
      cardId,
      nowMs: this.clock.now(),
      timedOut: false,
    });
  }

  async continueNext(): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase !== 'OUTCOME_CHECK' || state.outcome !== null) {
      return;
    }

    await this.dispatch({
      type: 'CONTINUE',
      nowMs: this.clock.now(),
    });
  }

  async skipReveal(): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase !== 'ATTACK_INCOMING') {
      return;
    }

    if (this.revealTimeoutId) {
      clearTimeout(this.revealTimeoutId);
      this.revealTimeoutId = null;
    }

    await this.dispatch({
      type: 'REVEAL_DONE',
      nowMs: this.clock.now(),
    });
  }

  async abandon(): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase === 'ENDED') {
      return;
    }

    await this.dispatch({
      type: 'ABANDON',
      nowMs: this.clock.now(),
    });
  }

  async suspend(): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase === 'ENDED') {
      return;
    }

    // Final TICK before freezing per D42, D43
    await this.dispatch({
      type: 'TICK',
      nowMs: this.clock.now(),
    });

    this.clock.pause();
    this.clearAllTimers();
    await this.saveCurrentRun();

    this.deps.onNavigate?.('home');
  }

  async resume(scenario: Scenario, persisted: PersistedRun): Promise<boolean> {
    if (persisted.contentVersion !== scenario.contentVersion) {
      // Discard older content version run per SBE-PER-007
      await this.deps.storage.delete('currentRun', 'active');
      if (this.deps.telemetry) {
        await this.deps.telemetry.record('resume_discarded', {
          reason: 'content_version_mismatch',
        });
      }
      return false;
    }

    this.clearAllTimers();
    this.scenario = scenario;
    this.timerWarnFired = false;
    this.runStartedAt = persisted.startedAt;

    // Filter events to normalize phase per Section 12.5:
    // If state was in ATTACK_INCOMING or INTERVENTION_CHOICE: restart at ATTACK_INCOMING of the node
    let replayEvents = [...persisted.events];
    const lastEvent = replayEvents[replayEvents.length - 1];

    if (lastEvent?.type === 'REVEAL_DONE') {
      replayEvents.pop(); // drop trailing reveal done to restart at ATTACK_INCOMING
    }

    // Replay state
    let state = replay(scenario, persisted.seed, replayEvents);

    // Restore timing snapshot
    state = {
      ...state,
      timing: {
        ...persisted.timing,
        lastEventMs: persisted.timing.visibleMsTotal,
      },
      resumeTimerMs:
        state.phase === 'INTERVENTION_CHOICE' || persisted.timing.timerRemainingMs !== null
          ? persisted.timing.timerRemainingMs
          : null,
    };

    // Rebuild clock at restored visibleMsTotal
    this.clock.destroy();
    this.clock = new VisibleClock(undefined, state.timing.visibleMsTotal);

    this.persistedEvents = replayEvents;
    this.runState.value = state;

    if (this.deps.telemetry) {
      await this.deps.telemetry.record('run_resumed', {
        phase: state.phase,
      });
    }

    // Phase normalization follow-ups
    if (state.phase === 'RESOLUTION_PHASE') {
      // Choice already committed: complete resolution
      await this.dispatch({
        type: 'RESOLUTION_DONE',
        nowMs: this.clock.now(),
      });
    } else if (state.phase === 'ATTACK_INCOMING') {
      await this.armRevealTimer();
      this.startTickLoop();
    }

    return true;
  }

  private async dispatch(event: GameEvent): Promise<void> {
    if (!this.scenario) return;

    const prevState = this.runState.value;
    const nextState = gameReducer(prevState, event, {
      scenario: this.scenario,
    });

    if (nextState === prevState) {
      return; // Ignored / locked transition
    }

    this.runState.value = nextState;

    // Log to persisted events (TICK and internal events are not persisted)
    if (event.type !== 'TICK') {
      if (event.type === 'START') {
        this.persistedEvents.push({
          type: 'START',
          scenarioId: event.scenario.id,
          contentVersion: event.scenario.contentVersion,
          seed: event.seed,
          runId: event.runId,
          nowMs: event.nowMs,
        });
      } else if (event.type !== 'ABANDON') {
        this.persistedEvents.push(event as PersistedEvent);
      }
    }

    // Run phase-entry side effects
    await this.handlePhaseEntry(prevState, nextState, event);
  }

  private async handlePhaseEntry(
    prev: RunState | null,
    next: RunState,
    event: GameEvent
  ): Promise<void> {
    if (prev?.phase !== next.phase || event.type === 'START') {
      switch (next.phase) {
        case 'ATTACK_INCOMING': {
          await this.saveCurrentRun();
          this.deps.audio?.('TONE_CUE');
          const node = this.scenario?.nodes.find((n) => n.nodeId === next.currentNodeId);
          if (node) {
            this.deps.announce?.(node.npcStatement.hu, false);
          }
          this.startTickLoop();
          await this.armRevealTimer();
          break;
        }

        case 'INTERVENTION_CHOICE': {
          await this.saveCurrentRun();
          this.isTransitioning.value = false;
          this.timerWarnFired = false;
          this.startTickLoop();

          // If timer restored with 0: immediate expiry per D35, SBE-TMR-009
          if (next.timing.timerRemainingMs === 0) {
            await this.handleStressTimerExpiry();
          }
          break;
        }

        case 'RESOLUTION_PHASE': {
          await this.saveCurrentRun();
          this.isTransitioning.value = true;

          // Input lock timer (400 ms)
          if (this.inputLockTimeoutId) clearTimeout(this.inputLockTimeoutId);
          this.inputLockTimeoutId = window.setTimeout(() => {
            if (this.runState.value?.phase !== 'RESOLUTION_PHASE') {
              this.isTransitioning.value = false;
            }
          }, INPUT_LOCK_MS);

          // Audio and Haptic feedback based on played card
          const lastTurn = next.history[next.history.length - 1];
          if (lastTurn && prev) {
            const deltaE = next.metrics.escalation - prev.metrics.escalation;
            this.triggerCardFeedback(lastTurn.category, deltaE);

            // Telemetry card_played event
            if (this.deps.telemetry) {
              await this.deps.telemetry.recordCardPlayed({
                runId: next.runId,
                scenarioId: next.scenarioId,
                turn: next.turnIndex,
                nodeId: prev.currentNodeId,
                cardId: lastTurn.cardId,
                category: lastTurn.category,
                timedOut: lastTurn.timedOut,
                decisionMs: lastTurn.decisionMs,
                E: next.metrics.escalation,
                F: next.metrics.grounding,
                K: next.metrics.confusion,
              });
            }
          }

          // Resolution timer (580 ms)
          const resDuration = this.deps.fastReveal ? 0 : 580;
          this.resolutionStartMs = this.clock.now();
          this.resolutionDurationMs = resDuration;
          if (this.resolutionTimeoutId) clearTimeout(this.resolutionTimeoutId);
          this.resolutionTimeoutId = window.setTimeout(async () => {
            await this.dispatch({
              type: 'RESOLUTION_DONE',
              nowMs: this.clock.now(),
            });
          }, resDuration);
          break;
        }

        case 'OUTCOME_CHECK': {
          await this.saveCurrentRun();
          this.isTransitioning.value = false;

          // If outcome reached: dispatch FINALIZE immediately
          if (next.outcome !== null) {
            this.outcomeFinalizeTimeoutId = window.setTimeout(async () => {
              await this.dispatch({
                type: 'FINALIZE',
                nowMs: this.clock.now(),
              });
            }, 0);
          }
          break;
        }

        case 'ENDED': {
          this.clearAllTimers();
          this.isTransitioning.value = false;

          if (next.outcome !== null) {
            // Normal end: build summary and finishRun
            const endedAt = new Date().toISOString();
            const summary = buildRunSummary(next, this.runStartedAt, endedAt);
            const progress: ScenarioProgress = {
              scenarioId: next.scenarioId,
              completedCount: 1,
              winCount: next.outcome.startsWith('WIN') ? 1 : 0,
              bestOutcome: next.outcome,
              bestRtoSec: calculateRtoSec(next.timing.completedEpisodesMs),
              lastRtoSec: calculateRtoSec(next.timing.completedEpisodesMs),
              lastPlayedAt: summary.endedAt,
            };

            await this.deps.storage.finishRun(summary, progress);

            // Telemetry scenario_end
            if (this.deps.telemetry) {
              await this.deps.telemetry.recordScenarioEnd({
                runId: next.runId,
                scenarioId: next.scenarioId,
                outcome: next.outcome,
                turns: next.turnIndex,
                panicSec: summary.panicSec,
                rtoSec: summary.rtoSec,
                constructive: summary.constructiveCount,
                reactive: summary.reactiveCount,
                locale: 'hu',
              });
            }

            // Outcome audio and haptics (300 ms after resolution)
            window.setTimeout(() => {
              this.triggerOutcomeFeedback(next.outcome!);
            }, 300);

            this.deps.announce?.(`Játék vége: ${next.outcome}`, true);
            this.deps.onNavigate?.('debrief', next.runId);
          } else {
            // Abandoned
            await this.deps.storage.delete('currentRun', 'active');
            if (this.deps.telemetry) {
              await this.deps.telemetry.record('scenario_abandon', {
                turn: next.turnIndex,
              });
            }
            this.deps.onNavigate?.('home');
          }
          break;
        }
      }
    }
  }

  private triggerCardFeedback(category: CardCategory, deltaE: number): void {
    if (category === 'PACING' || category === 'REFRAMING') {
      this.deps.haptics?.(deltaE <= 0 ? 'VALIDATION' : 'TAP');
      this.deps.audio?.('CONSTRUCTIVE');
    } else if (category === 'META_MODEL') {
      this.deps.haptics?.(deltaE <= 0 ? 'VALIDATION' : 'TAP');
      this.deps.audio?.('INQUIRY');
    } else {
      this.deps.haptics?.('DAMAGE');
      this.deps.audio?.('REACTIVE');
    }
  }

  private triggerOutcomeFeedback(outcome: Outcome): void {
    if (outcome.startsWith('WIN')) {
      this.deps.haptics?.('BREAKTHROUGH');
      this.deps.audio?.('WIN');
    } else if (outcome.startsWith('LOSS')) {
      this.deps.haptics?.('DAMAGE');
      this.deps.audio?.('LOSS');
    }
  }

  private async armRevealTimer(remainingOverrideMs?: number): Promise<void> {
    const state = this.runState.value;
    if (!state || !this.scenario) return;

    if (this.revealTimeoutId) {
      clearTimeout(this.revealTimeoutId);
      this.revealTimeoutId = null;
    }

    if (this.deps.fastReveal) {
      await this.dispatch({
        type: 'REVEAL_DONE',
        nowMs: this.clock.now(),
      });
      return;
    }

    const node = this.scenario.nodes.find((n) => n.nodeId === state.currentNodeId);
    if (!node) return;

    const totalDuration = Math.min(
      node.npcStatement.hu.length * REVEAL_MS_PER_CHAR[node.tone],
      REVEAL_MAX_MS
    );

    let durationMs: number;
    if (remainingOverrideMs !== undefined) {
      durationMs = remainingOverrideMs;
    } else {
      this.revealStartMs = this.clock.now();
      this.revealDurationMs = totalDuration;
      durationMs = totalDuration;
    }

    if (durationMs <= 0) {
      await this.dispatch({
        type: 'REVEAL_DONE',
        nowMs: this.clock.now(),
      });
      return;
    }

    this.revealTimeoutId = window.setTimeout(async () => {
      await this.dispatch({
        type: 'REVEAL_DONE',
        nowMs: this.clock.now(),
      });
    }, durationMs);
  }

  private startTickLoop(): void {
    if (this.tickIntervalId !== null) return;

    this.tickIntervalId = window.setInterval(async () => {
      const state = this.runState.value;
      if (!state || state.phase === 'ENDED') {
        this.clearTickLoop();
        return;
      }

      await this.dispatch({
        type: 'TICK',
        nowMs: this.clock.now(),
      });

      // Post-TICK check for stress timer
      const currentState = this.runState.value;
      if (currentState?.phase === 'INTERVENTION_CHOICE') {
        const remaining = currentState.timing.timerRemainingMs;
        if (remaining !== null) {
          // 5-second warning
          if (remaining <= 5000 && !this.timerWarnFired && remaining > 0) {
            this.timerWarnFired = true;
            this.deps.audio?.('TIMER_WARN');
            this.deps.haptics?.('TAP');
            this.deps.announce?.('timer.fiveSeconds', true);
          }

          // Expiry
          if (remaining === 0) {
            await this.handleStressTimerExpiry();
          }
        }
      }
    }, 250);
  }

  private async handleStressTimerExpiry(): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase !== 'INTERVENTION_CHOICE') return;

    const node = this.scenario?.nodes.find((n) => n.nodeId === state.currentNodeId);
    if (!node) return;

    const reactiveCardId = firstReactiveCard(state.hand, node.availableCards);
    if (!reactiveCardId) return;

    this.deps.announce?.('timer.expired', true);

    await this.dispatch({
      type: 'CARD_COMMITTED',
      cardId: reactiveCardId,
      nowMs: this.clock.now(),
      timedOut: true,
    });
  }

  private clearTickLoop(): void {
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
  }

  private clearAllTimers(): void {
    this.clearTickLoop();
    if (this.revealTimeoutId !== null) {
      clearTimeout(this.revealTimeoutId);
      this.revealTimeoutId = null;
    }
    if (this.resolutionTimeoutId !== null) {
      clearTimeout(this.resolutionTimeoutId);
      this.resolutionTimeoutId = null;
    }
    if (this.inputLockTimeoutId !== null) {
      clearTimeout(this.inputLockTimeoutId);
      this.inputLockTimeoutId = null;
    }
    if (this.outcomeFinalizeTimeoutId !== null) {
      clearTimeout(this.outcomeFinalizeTimeoutId);
      this.outcomeFinalizeTimeoutId = null;
    }
  }

  private async handleFreeze(): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase === 'ENDED') return;

    this.clearAllTimers();

    // Send final TICK before freezing per D43 (if in INTERVENTION_CHOICE)
    if (state.phase === 'INTERVENTION_CHOICE') {
      await this.dispatch({
        type: 'TICK',
        nowMs: this.clock.now(),
      });
    }

    if (!this.clock.isPaused()) {
      this.handleUnfreeze();
      return;
    }

    await this.saveCurrentRun();
  }

  private handleUnfreeze(): void {
    const state = this.runState.value;
    if (!state || state.phase === 'ENDED') return;

    if (state.phase === 'ATTACK_INCOMING') {
      const elapsed = Math.max(0, this.clock.now() - this.revealStartMs);
      const remaining = Math.max(0, this.revealDurationMs - elapsed);
      this.armRevealTimer(remaining);
      this.startTickLoop();
    } else if (state.phase === 'INTERVENTION_CHOICE') {
      this.startTickLoop();
    } else if (state.phase === 'RESOLUTION_PHASE') {
      const elapsed = Math.max(0, this.clock.now() - this.resolutionStartMs);
      const remaining = Math.max(0, this.resolutionDurationMs - elapsed);
      this.resolutionTimeoutId = window.setTimeout(async () => {
        await this.dispatch({
          type: 'RESOLUTION_DONE',
          nowMs: this.clock.now(),
        });
      }, remaining);
    }
  }

  private async saveCurrentRun(): Promise<void> {
    const state = this.runState.value;
    if (!state || state.phase === 'ENDED') return;

    return this.executeSerialized(async () => {
      const persisted: PersistedRun = {
        runId: state.runId,
        scenarioId: state.scenarioId,
        contentVersion: state.contentVersion,
        seed: state.seed,
        startedAt: this.runStartedAt,
        events: this.persistedEvents,
        timing: state.timing,
        savedAt: new Date().toISOString(),
      };
      await this.deps.storage.put('currentRun', 'active', persisted);
    });
  }

  destroy(): void {
    this.clearAllTimers();
    this.clock.destroy();
  }
}
