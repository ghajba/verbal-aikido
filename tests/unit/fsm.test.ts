import { describe, it, expect } from 'vitest';
import { gameReducer, firstReactiveCard, isPanic } from '@/engine/fsm';
import type { Scenario } from '@/content/types';
import pmScenarioRaw from '../../public/scenarios/scen_angry_pm_deadline_001.json';

const scenario = pmScenarioRaw as unknown as Scenario;

describe('Game FSM (Reducer)', () => {
  it('START initializes run state and sets initial panic', () => {
    const state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'run-123',
        nowMs: 1000,
      },
      { scenario }
    );

    expect(state.runId).toBe('run-123');
    expect(state.seed).toBe(42);
    expect(state.phase).toBe('ATTACK_INCOMING');
    expect(state.turnIndex).toBe(0);
    expect(state.metrics).toEqual({ escalation: 65, grounding: 100, confusion: 0 });
    expect(state.momentum).toBe(0);
    expect(state.hand).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.outcome).toBeNull();
    expect(state.timing.visibleMsTotal).toBe(0);
    expect(state.timing.inPanic).toBe(false);
  });

  it('REVEAL_DONE transitions to INTERVENTION_CHOICE and draws hand', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'run-123',
        nowMs: 0,
      },
      { scenario }
    );

    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario });
    expect(state.phase).toBe('INTERVENTION_CHOICE');
    expect(state.hand.length).toBe(3);
    expect(state.timing.choiceEnteredAtMs).toBe(500);
  });

  it('CARD_COMMITTED transitions to RESOLUTION_PHASE and records turn', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'run-123',
        nowMs: 0,
      },
      { scenario }
    );

    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario });
    const chosenCard = state.hand[0]!;

    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: chosenCard, nowMs: 1500 },
      { scenario }
    );

    expect(state.phase).toBe('RESOLUTION_PHASE');
    expect(state.turnIndex).toBe(1);
    expect(state.history.length).toBe(1);
    expect(state.history[0]?.cardId).toBe(chosenCard);
    expect(state.history[0]?.decisionMs).toBe(1000);
  });

  it('RESOLUTION_DONE transitions to OUTCOME_CHECK', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'run-123',
        nowMs: 0,
      },
      { scenario }
    );
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario });
    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: state.hand[0]!, nowMs: 1500 },
      { scenario }
    );
    state = gameReducer(state, { type: 'RESOLUTION_DONE', nowMs: 2000 }, { scenario });

    expect(state.phase).toBe('OUTCOME_CHECK');
  });

  it('CONTINUE transitions back to ATTACK_INCOMING when game not ended', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 2,
        runId: 'run-123',
        nowMs: 0,
      },
      { scenario }
    );
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario });
    // commit c_metamodel_01 (does not end run)
    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: 'c_metamodel_01', nowMs: 1500 },
      { scenario }
    );
    state = gameReducer(state, { type: 'RESOLUTION_DONE', nowMs: 2000 }, { scenario });
    expect(state.outcome).toBeNull();

    state = gameReducer(state, { type: 'CONTINUE', nowMs: 2500 }, { scenario });
    expect(state.phase).toBe('ATTACK_INCOMING');
    expect(state.currentNodeId).toBe('step_02_focused');
    expect(state.pendingNextNodeId).toBeNull();
  });

  it('FINALIZE transitions to ENDED when outcome is present', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'run-123',
        nowMs: 0,
      },
      { scenario }
    );
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario });
    // c_attack_01 causes instant LOSS_RUPTURE
    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: 'c_attack_01', nowMs: 1500 },
      { scenario }
    );
    state = gameReducer(state, { type: 'RESOLUTION_DONE', nowMs: 2000 }, { scenario });
    expect(state.outcome).toBe('LOSS_RUPTURE');

    state = gameReducer(state, { type: 'FINALIZE', nowMs: 2100 }, { scenario });
    expect(state.phase).toBe('ENDED');
    expect(state.hand).toEqual([]);
  });

  it('ABANDON transitions to ENDED with outcome null', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'run-123',
        nowMs: 0,
      },
      { scenario }
    );
    state = gameReducer(state, { type: 'ABANDON', nowMs: 500 }, { scenario });
    expect(state.phase).toBe('ENDED');
    expect(state.outcome).toBeNull();
  });

  it('Ground rule: invalid or unknown events return exact same state object', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'run-123',
        nowMs: 0,
      },
      { scenario }
    );

    // CONTINUE while in ATTACK_INCOMING is invalid
    const sameState = gameReducer(state, { type: 'CONTINUE', nowMs: 100 }, { scenario });
    expect(sameState).toBe(state);

    // Completely unknown action type hits reducer default case
    const unknownActionState = (gameReducer as any)(
      state,
      { type: 'TOTALLY_UNKNOWN_ACTION', nowMs: 150 },
      { scenario }
    );
    expect(unknownActionState).toBe(state);

    // Event after ENDED returns same state
    const ended = gameReducer(state, { type: 'ABANDON', nowMs: 200 }, { scenario });
    const afterEnded = gameReducer(ended, { type: 'REVEAL_DONE', nowMs: 300 }, { scenario });
    expect(afterEnded).toBe(ended);
  });

  it('CARD_COMMITTED defaults decisionMs to 0 when choiceEnteredAtMs is null', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'null-timing-run',
        nowMs: 0,
      },
      { scenario }
    );
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 100 }, { scenario });
    // Manually erase choiceEnteredAtMs to test fallback
    const modifiedState = {
      ...state,
      timing: {
        ...state.timing,
        choiceEnteredAtMs: null,
      },
    };
    const cardId = state.hand[0]!;
    const next = gameReducer(
      modifiedState,
      { type: 'CARD_COMMITTED', cardId, nowMs: 200 },
      { scenario }
    );
    expect(next.history[0]?.decisionMs).toBe(0);
  });

  it('firstReactiveCard helper picks first DEFENSE or ATTACK card', () => {
    const node = scenario.nodes[0]!;
    const cardId = firstReactiveCard(
      ['c_pace_01', 'c_defense_01', 'c_metamodel_01'],
      node.availableCards
    );
    expect(cardId).toBe('c_defense_01');

    // fallback when no reactive cards present in hand
    const fallbackId = firstReactiveCard(['c_pace_01', 'c_metamodel_01'], node.availableCards);
    expect(fallbackId).toBe('c_pace_01');

    const emptyId = firstReactiveCard([], node.availableCards);
    expect(emptyId).toBe('');
  });

  it('handles TICK decrements on stress timer during INTERVENTION_CHOICE', () => {
    const timedScenario = { ...scenario, decisionTimeLimitSec: 15 };
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario: timedScenario,
        seed: 42,
        runId: 'timer-run',
        nowMs: 0,
      },
      { scenario: timedScenario }
    );

    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: timedScenario });
    expect(state.timing.timerRemainingMs).toBe(15000);

    state = gameReducer(state, { type: 'TICK', nowMs: 1500 }, { scenario: timedScenario });
    expect(state.timing.timerRemainingMs).toBe(14000);
    expect(state.timing.visibleMsTotal).toBe(1500);
  });

  it('tracks panic entry and exit across transitions', () => {
    // Start in non-panic (E=65, F=100)
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 1,
        runId: 'panic-test',
        nowMs: 0,
      },
      { scenario }
    );
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario });

    // Defense moves E to 96.25 -> ENTERS PANIC
    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: 'c_defense_01', nowMs: 1500 },
      { scenario }
    );
    expect(state.timing.inPanic).toBe(true);
    expect(state.timing.panicEpisodeStartMs).toBe(1500);

    state = gameReducer(state, { type: 'RESOLUTION_DONE', nowMs: 2500 }, { scenario });
    expect(state.timing.panicMsTotal).toBe(1000);

    state = gameReducer(state, { type: 'CONTINUE', nowMs: 3000 }, { scenario });
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 3500 }, { scenario });

    // Pacing moves E to 74.25 (still >= 70, still panic)
    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: 'c_pace_08', nowMs: 4500 },
      { scenario }
    );
    expect(state.timing.inPanic).toBe(true);

    state = gameReducer(state, { type: 'RESOLUTION_DONE', nowMs: 5000 }, { scenario });
    state = gameReducer(state, { type: 'CONTINUE', nowMs: 5500 }, { scenario });
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 6000 }, { scenario });

    // Reframing moves E to 60.25 (E < 70, F=88.23 > 30) -> EXITS PANIC
    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: 'c_reframe_07', nowMs: 7000 },
      { scenario }
    );
    expect(state.timing.inPanic).toBe(false);
    expect(state.timing.panicEpisodeStartMs).toBeNull();
    expect(state.timing.completedEpisodesMs.length).toBe(1);
    expect(state.timing.completedEpisodesMs[0]).toBe(5500); // from 1500ms to 7000ms
  });

  it('rejects events when guards fail and returns exact state', () => {
    let state = gameReducer(
      null,
      {
        type: 'START',
        scenario,
        seed: 42,
        runId: 'guard-run',
        nowMs: 0,
      },
      { scenario }
    );

    // REVEAL_DONE when not in ATTACK_INCOMING
    state = gameReducer(state, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario });
    expect(gameReducer(state, { type: 'REVEAL_DONE', nowMs: 600 }, { scenario })).toBe(state);

    // CARD_COMMITTED with invalid cardId
    expect(
      gameReducer(
        state,
        { type: 'CARD_COMMITTED', cardId: 'non_existent', nowMs: 700 },
        { scenario }
      )
    ).toBe(state);

    // CARD_COMMITTED when not in INTERVENTION_CHOICE
    const choiceState = state;
    state = gameReducer(
      state,
      { type: 'CARD_COMMITTED', cardId: state.hand[0]!, nowMs: 800 },
      { scenario }
    );
    expect(
      gameReducer(
        state,
        { type: 'CARD_COMMITTED', cardId: choiceState.hand[0]!, nowMs: 900 },
        { scenario }
      )
    ).toBe(state);

    // RESOLUTION_DONE when not in RESOLUTION_PHASE
    expect(gameReducer(choiceState, { type: 'RESOLUTION_DONE', nowMs: 900 }, { scenario })).toBe(
      choiceState
    );

    // FINALIZE when not in OUTCOME_CHECK or outcome null
    expect(gameReducer(state, { type: 'FINALIZE', nowMs: 900 }, { scenario })).toBe(state);

    state = gameReducer(state, { type: 'RESOLUTION_DONE', nowMs: 1000 }, { scenario });
    // In OUTCOME_CHECK without outcome, FINALIZE is rejected
    if (!state.outcome) {
      expect(gameReducer(state, { type: 'FINALIZE', nowMs: 1100 }, { scenario })).toBe(state);
    }

    // CONTINUE when in wrong phase
    expect(gameReducer(choiceState, { type: 'CONTINUE', nowMs: 900 }, { scenario })).toBe(
      choiceState
    );
  });

  it('isPanic detects E >= 70 or F <= 30', () => {
    expect(isPanic({ escalation: 70, grounding: 100 })).toBe(true);
    expect(isPanic({ escalation: 69.9, grounding: 100 })).toBe(false);
    expect(isPanic({ escalation: 50, grounding: 30 })).toBe(true);
    expect(isPanic({ escalation: 50, grounding: 30.1 })).toBe(false);
  });
});
