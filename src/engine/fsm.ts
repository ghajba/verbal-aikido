import type { Card, Scenario } from '../content/types';
import type { GameEvent, RunState, TurnRecord } from './types';
import { PANIC_ESCALATION, PANIC_GROUNDING } from './constants';
import { applyCard, isReactiveCategory } from './metrics';
import { drawHand } from './hand';
import { evaluateTurnOutcome } from './outcome';
import { resolveNextNode } from './branching';

export function isPanic(metrics: { escalation: number; grounding: number }): boolean {
  return metrics.escalation >= PANIC_ESCALATION || metrics.grounding <= PANIC_GROUNDING;
}

export function firstReactiveCard(
  handCardIds: readonly string[],
  availableCards: readonly Card[]
): string {
  const cardMap = new Map(availableCards.map((c) => [c.cardId, c]));
  for (const id of handCardIds) {
    const card = cardMap.get(id);
    if (card && isReactiveCategory(card.category)) {
      return id;
    }
  }
  return handCardIds[0] || '';
}

export interface ReducerContext {
  scenario: Scenario;
}

export function gameReducer(
  state: RunState | null,
  event: GameEvent,
  ctx: ReducerContext
): RunState {
  // 1. Initial START event
  if (event.type === 'START') {
    const { scenario, seed, runId, nowMs } = event;
    const initialPanic = isPanic(scenario.initialState);

    return {
      runId,
      scenarioId: scenario.id,
      contentVersion: scenario.contentVersion,
      seed,
      rngState: seed,
      phase: 'ATTACK_INCOMING',
      turnIndex: 0,
      currentNodeId: scenario.startNodeId,
      pendingNextNodeId: null,
      metrics: { ...scenario.initialState },
      momentum: 0,
      crisisUsed: false,
      hand: [],
      history: [],
      outcome: null,
      resumeTimerMs: null,
      timing: {
        visibleMsTotal: 0,
        panicMsTotal: 0,
        inPanic: initialPanic,
        panicEpisodeStartMs: initialPanic ? nowMs : null,
        completedEpisodesMs: [],
        choiceEnteredAtMs: null,
        timerRemainingMs: null,
        lastEventMs: nowMs,
      },
    };
  }

  // If state is not initialized or game already ENDED, ignore events (return same object)
  if (!state || state.phase === 'ENDED') {
    return state!;
  }

  // 2. Timing accounting on every event that carries nowMs
  const nowMs = event.nowMs;
  const deltaMs = Math.max(0, nowMs - state.timing.lastEventMs);
  let nextPanicMsTotal = state.timing.panicMsTotal;
  if (state.timing.inPanic) {
    nextPanicMsTotal += deltaMs;
  }
  const nextVisibleMsTotal = state.timing.visibleMsTotal + deltaMs;

  const nextTiming = {
    ...state.timing,
    visibleMsTotal: nextVisibleMsTotal,
    panicMsTotal: nextPanicMsTotal,
    lastEventMs: nowMs,
  };

  const scenario = ctx.scenario;
  const currentNode = scenario.nodes.find((n) => n.nodeId === state.currentNodeId);

  // 3. Event handling by phase
  switch (event.type) {
    case 'TICK': {
      let timerRemainingMs = nextTiming.timerRemainingMs;
      if (state.phase === 'INTERVENTION_CHOICE' && timerRemainingMs !== null) {
        timerRemainingMs = Math.max(0, timerRemainingMs - deltaMs);
      }
      return {
        ...state,
        timing: {
          ...nextTiming,
          timerRemainingMs,
        },
      };
    }

    case 'REVEAL_DONE': {
      if (state.phase !== 'ATTACK_INCOMING' || !currentNode) {
        return state;
      }

      const [hand, nextRng] = drawHand(currentNode.availableCards, state.rngState);
      const timerLimitSec = scenario.decisionTimeLimitSec;
      const initialTimer = state.resumeTimerMs ?? (timerLimitSec ? timerLimitSec * 1000 : null);

      return {
        ...state,
        phase: 'INTERVENTION_CHOICE',
        hand,
        rngState: nextRng,
        resumeTimerMs: null,
        timing: {
          ...nextTiming,
          choiceEnteredAtMs: nowMs,
          timerRemainingMs: initialTimer,
        },
      };
    }

    case 'CARD_COMMITTED': {
      if (state.phase !== 'INTERVENTION_CHOICE' || !currentNode) {
        return state;
      }
      const card = currentNode.availableCards.find((c) => c.cardId === event.cardId);
      if (!card || !state.hand.includes(card.cardId)) {
        return state;
      }

      const applyRes = applyCard(state.metrics, state.momentum, card);
      const decisionMs =
        state.timing.choiceEnteredAtMs !== null
          ? Math.max(0, nowMs - state.timing.choiceEnteredAtMs)
          : 0;

      const nextTurnIndex = state.turnIndex + 1;
      const outcome = evaluateTurnOutcome({
        metrics: applyRes.metrics,
        initialEscalation: scenario.initialState.escalation,
        nextNodeId: card.nextNodeId,
        turnIndex: nextTurnIndex,
      });

      const branchRes = resolveNextNode({
        scenario,
        currentNode,
        cardNextNodeId: card.nextNodeId,
        metrics: applyRes.metrics,
        crisisUsed: state.crisisUsed,
        outcome,
      });

      const turnRecord: TurnRecord = {
        turnIndex: state.turnIndex,
        nodeId: state.currentNodeId,
        hand: [...state.hand],
        cardId: card.cardId,
        category: card.category,
        timedOut: Boolean(event.timedOut),
        before: { ...state.metrics },
        after: { ...applyRes.metrics },
        momentumAfter: applyRes.momentum,
        crisisRedirect: branchRes.crisisRedirect,
        decisionMs,
      };

      // Panic transition check after applyCard
      const nowInPanic = isPanic(applyRes.metrics);
      let panicEpisodeStartMs = nextTiming.panicEpisodeStartMs;
      const completedEpisodesMs = [...nextTiming.completedEpisodesMs];

      if (!nextTiming.inPanic && nowInPanic) {
        panicEpisodeStartMs = nowMs;
      } else if (nextTiming.inPanic && !nowInPanic) {
        if (panicEpisodeStartMs !== null) {
          completedEpisodesMs.push(Math.max(0, nowMs - panicEpisodeStartMs));
        }
        panicEpisodeStartMs = null;
      }

      return {
        ...state,
        phase: 'RESOLUTION_PHASE',
        turnIndex: nextTurnIndex,
        metrics: applyRes.metrics,
        momentum: applyRes.momentum,
        crisisUsed: state.crisisUsed || branchRes.crisisRedirect,
        pendingNextNodeId: branchRes.nextNodeId,
        outcome,
        history: [...state.history, turnRecord],
        timing: {
          ...nextTiming,
          inPanic: nowInPanic,
          panicEpisodeStartMs,
          completedEpisodesMs,
          choiceEnteredAtMs: null,
          timerRemainingMs: null,
        },
      };
    }

    case 'RESOLUTION_DONE': {
      if (state.phase !== 'RESOLUTION_PHASE') {
        return state;
      }

      return {
        ...state,
        phase: 'OUTCOME_CHECK',
        timing: nextTiming,
      };
    }

    case 'FINALIZE': {
      if (state.phase !== 'OUTCOME_CHECK' || state.outcome === null) {
        return state;
      }

      return {
        ...state,
        phase: 'ENDED',
        hand: [],
        timing: nextTiming,
      };
    }

    case 'CONTINUE': {
      if (state.phase !== 'OUTCOME_CHECK' || state.outcome !== null || !state.pendingNextNodeId) {
        return state;
      }

      return {
        ...state,
        phase: 'ATTACK_INCOMING',
        currentNodeId: state.pendingNextNodeId,
        pendingNextNodeId: null,
        hand: [],
        timing: nextTiming,
      };
    }

    case 'ABANDON': {
      return {
        ...state,
        phase: 'ENDED',
        outcome: null,
        timing: nextTiming,
      };
    }

    default:
      return state;
  }
}
