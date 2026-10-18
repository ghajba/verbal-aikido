import { describe, it, expect } from 'vitest';
import { gameReducer, firstReactiveCard } from '@/engine/fsm';
import type { RunState } from '@/engine/types';
import type { Scenario } from '@/content/types';

import scen1Raw from '../../public/scenarios/scen_angry_pm_deadline_001.json';
import scen2Raw from '../../public/scenarios/scen_stakeholder_scope_002.json';
import scen3Raw from '../../public/scenarios/scen_customer_refund_003.json';
import scen4Raw from '../../public/scenarios/scen_customer_gaslight_004.json';

const scen1 = scen1Raw as unknown as Scenario;
const scen2 = scen2Raw as unknown as Scenario;
const scen3 = scen3Raw as unknown as Scenario;
const scen4 = scen4Raw as unknown as Scenario;

function playStep(
  state: RunState,
  scenario: Scenario,
  cardId: string,
  nowMs: number,
  timedOut = false
): RunState {
  let s = gameReducer(state, { type: 'CARD_COMMITTED', cardId, nowMs, timedOut }, { scenario });
  s = gameReducer(s, { type: 'RESOLUTION_DONE', nowMs: nowMs + 580 }, { scenario });
  if (s.outcome) {
    s = gameReducer(s, { type: 'FINALIZE', nowMs: nowMs + 580 }, { scenario });
  } else {
    s = gameReducer(s, { type: 'CONTINUE', nowMs: nowMs + 600 }, { scenario });
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: nowMs + 800 }, { scenario });
  }
  return s;
}

describe('Golden Playthroughs (Section 28.8)', () => {
  it('SBE-GLD-001: Three meta-model questions win the angry PM scenario', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen1,
        seed: 2,
        runId: 'gld-1',
        nowMs: 0,
      },
      { scenario: scen1 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen1 });
    expect(s.hand).toEqual(['c_metamodel_01', 'c_pace_01', 'c_defense_01']);

    s = playStep(s, scen1, 'c_metamodel_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 60, grounding: 94.75, confusion: 30 });
    expect(s.currentNodeId).toBe('step_02_focused');
    expect(s.hand).toEqual(['c_defense_03', 'c_metamodel_03', 'c_reframe_03']);

    s = playStep(s, scen1, 'c_metamodel_03', 2000);
    expect(s.history[1]?.after).toEqual({ escalation: 55, grounding: 88.75, confusion: 62 });
    expect(s.currentNodeId).toBe('step_03_plan');
    expect(s.hand).toEqual(['c_metamodel_05', 'c_defense_05', 'c_pace_05']);

    s = playStep(s, scen1, 'c_metamodel_05', 3000);
    expect(s.metrics).toEqual({ escalation: 52, grounding: 84, confusion: 92 });
    expect(s.outcome).toBe('WIN_BREAKTHROUGH');
    expect(s.turnIndex).toBe(3);
    expect(s.phase).toBe('ENDED');
  });

  it('SBE-GLD-002: A counterattack on turn one ruptures the conversation', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen1,
        seed: 42,
        runId: 'gld-2',
        nowMs: 0,
      },
      { scenario: scen1 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen1 });
    expect(s.hand).toEqual(['c_defense_01', 'c_metamodel_01', 'c_attack_01']);

    s = playStep(s, scen1, 'c_attack_01', 1000);
    expect(s.metrics).toEqual({ escalation: 100, grounding: 68.75, confusion: 0 });
    expect(s.momentum).toBe(1);
    expect(s.outcome).toBe('LOSS_RUPTURE');
    expect(s.turnIndex).toBe(1);
  });

  it('SBE-GLD-003: Defense triggers crisis branch, pacing and reframing recover it', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen1,
        seed: 1,
        runId: 'gld-3',
        nowMs: 0,
      },
      { scenario: scen1 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen1 });
    expect(s.hand).toEqual(['c_metamodel_01', 'c_defense_01', 'c_reframe_01']);

    s = playStep(s, scen1, 'c_defense_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 96.25, grounding: 76.75, confusion: 0 });
    expect(s.history[0]?.crisisRedirect).toBe(true);
    expect(s.currentNodeId).toBe('pm_escalated_crisis');
    expect(s.hand).toEqual(['c_pace_08', 'c_defense_07', 'c_attack_06']);

    s = playStep(s, scen1, 'c_pace_08', 2000);
    expect(s.history[1]?.after).toEqual({ escalation: 74.25, grounding: 79.94, confusion: 10 });
    expect(s.currentNodeId).toBe('pm_crisis_02');
    expect(s.hand).toEqual(['c_reframe_07', 'c_pace_09', 'c_defense_08']);

    s = playStep(s, scen1, 'c_reframe_07', 3000);
    expect(s.metrics).toEqual({ escalation: 60.25, grounding: 88.23, confusion: 32 });
    expect(s.outcome).toBe('END_DEESCALATED');
    expect(s.turnIndex).toBe(3);
  });

  it('SBE-GLD-004: Pure pacing de-escalates stakeholder but does not win', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen2,
        seed: 7,
        runId: 'gld-4',
        nowMs: 0,
      },
      { scenario: scen2 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen2 });
    expect(s.hand).toEqual(['c_s2_pace_01', 'c_s2_def_01', 'c_s2_att_01']);

    s = playStep(s, scen2, 'c_s2_pace_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 27, grounding: 100, confusion: 8 });

    s = playStep(s, scen2, 'c_s2_pace_02', 2000);
    expect(s.history[1]?.after).toEqual({ escalation: 11, grounding: 100, confusion: 15 });

    s = playStep(s, scen2, 'c_s2_pace_04', 3000);
    expect(s.history[2]?.after).toEqual({ escalation: 0, grounding: 100, confusion: 21 });

    s = playStep(s, scen2, 'c_s2_pace_05', 4000);
    expect(s.metrics).toEqual({ escalation: 0, grounding: 100, confusion: 28 });
    expect(s.outcome).toBe('END_DEESCALATED');
    expect(s.turnIndex).toBe(4);
  });

  it('SBE-GLD-005: A final jab leaves the stakeholder situation unresolved', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen2,
        seed: 42,
        runId: 'gld-5',
        nowMs: 0,
      },
      { scenario: scen2 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen2 });
    expect(s.hand).toEqual(['c_s2_def_01', 'c_s2_meta_01', 'c_s2_att_01']);

    s = playStep(s, scen2, 'c_s2_def_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 64.25, grounding: 81.75, confusion: 0 });
    expect(s.currentNodeId).toBe('s2_02_push');

    s = playStep(s, scen2, 'c_s2_reframe_03', 2000);
    expect(s.history[1]?.after).toEqual({ escalation: 52.25, grounding: 88.54, confusion: 17 });

    s = playStep(s, scen2, 'c_s2_pace_04', 3000);
    expect(s.history[2]?.after).toEqual({ escalation: 37.25, grounding: 92.93, confusion: 23 });

    s = playStep(s, scen2, 'c_s2_att_04', 4000);
    expect(s.metrics).toEqual({ escalation: 69.5, grounding: 66.07, confusion: 3 });
    expect(s.outcome).toBe('END_UNRESOLVED');
    expect(s.turnIndex).toBe(4);
  });

  it('SBE-GLD-006: Two defensive answers in a row break the refund call', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen3,
        seed: 42,
        runId: 'gld-6',
        nowMs: 0,
      },
      { scenario: scen3 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen3 });
    expect(s.hand).toEqual(['c_r_def_01', 'c_r_meta_01', 'c_r_att_01']);

    s = playStep(s, scen3, 'c_r_def_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 81.25, grounding: 80, confusion: 0 });
    expect(s.currentNodeId).toBe('refund_escalated_crisis');

    s = playStep(s, scen3, 'c_r_def_06', 2000);
    expect(s.metrics).toEqual({ escalation: 100, grounding: 57.94, confusion: 0 });
    expect(s.momentum).toBe(2);
    expect(s.outcome).toBe('LOSS_RUPTURE');
    expect(s.turnIndex).toBe(2);
  });

  it('SBE-GLD-007: Running out of time plays the first reactive card', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen4,
        seed: 42,
        runId: 'gld-7',
        nowMs: 0,
      },
      { scenario: scen4 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen4 });
    expect(s.hand).toEqual(['c_g_def_01', 'c_g_meta_01', 'c_g_att_01']);

    const reactiveCard = firstReactiveCard(s.hand, scen4.nodes[0]!.availableCards);
    expect(reactiveCard).toBe('c_g_def_01');

    s = playStep(s, scen4, reactiveCard, 15500, true);
    expect(s.history[0]?.timedOut).toBe(true);
    expect(s.history[0]?.after).toEqual({ escalation: 93.25, grounding: 78.5, confusion: 0 });
    expect(s.currentNodeId).toBe('gaslight_escalated_crisis');
  });

  it('SBE-GLD-008: Meta-model questions win the gaslighting call', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen4,
        seed: 2,
        runId: 'gld-8',
        nowMs: 0,
      },
      { scenario: scen4 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen4 });
    expect(s.hand).toEqual(['c_g_meta_01', 'c_g_pace_01', 'c_g_def_01']);

    s = playStep(s, scen4, 'c_g_meta_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 68, grounding: 93.5, confusion: 30 });

    s = playStep(s, scen4, 'c_g_meta_02', 2000);
    expect(s.history[1]?.after).toEqual({ escalation: 65, grounding: 88.1, confusion: 61 });

    s = playStep(s, scen4, 'c_g_meta_04', 3000);
    expect(s.metrics).toEqual({ escalation: 61, grounding: 82.85, confusion: 91 });
    expect(s.outcome).toBe('WIN_BREAKTHROUGH');
    expect(s.turnIndex).toBe(3);
  });

  it('SBE-GLD-009: A mixed constructive path wins the refund call on turn four', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen3,
        seed: 4,
        runId: 'gld-9',
        nowMs: 0,
      },
      { scenario: scen3 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen3 });
    expect(s.hand).toEqual(['c_r_def_01', 'c_r_pace_01', 'c_r_meta_01']);

    s = playStep(s, scen3, 'c_r_pace_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 40, grounding: 100, confusion: 8 });

    s = playStep(s, scen3, 'c_r_meta_02', 2000);
    expect(s.history[1]?.after).toEqual({ escalation: 37, grounding: 96, confusion: 38 });

    s = playStep(s, scen3, 'c_r_reframe_03', 3000);
    expect(s.history[2]?.after).toEqual({ escalation: 21, grounding: 100, confusion: 59 });

    s = playStep(s, scen3, 'c_r_meta_06', 4000);
    expect(s.metrics).toEqual({ escalation: 16, grounding: 98.95, confusion: 87 });
    expect(s.outcome).toBe('WIN_BREAKTHROUGH');
    expect(s.turnIndex).toBe(4);
  });

  it('SBE-GLD-010: Defense then sarcasm ruptures the PM conversation', () => {
    let s = gameReducer(
      null,
      {
        type: 'START',
        scenario: scen1,
        seed: 1,
        runId: 'gld-10',
        nowMs: 0,
      },
      { scenario: scen1 }
    );
    s = gameReducer(s, { type: 'REVEAL_DONE', nowMs: 500 }, { scenario: scen1 });

    s = playStep(s, scen1, 'c_reframe_01', 1000);
    expect(s.history[0]?.after).toEqual({ escalation: 50, grounding: 100, confusion: 18 });

    s = playStep(s, scen1, 'c_defense_02', 2000);
    expect(s.history[1]?.after).toEqual({ escalation: 69.25, grounding: 81.5, confusion: 18 });
    expect(s.currentNodeId).toBe('step_03_cold');

    s = playStep(s, scen1, 'c_attack_05', 3000);
    expect(s.metrics).toEqual({ escalation: 100, grounding: 52.04, confusion: 0 });
    expect(s.momentum).toBe(2);
    expect(s.outcome).toBe('LOSS_RUPTURE');
    expect(s.turnIndex).toBe(3);
  });
});
