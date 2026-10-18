import { describe, it, expect } from 'vitest';
import { checkThresholdOutcome, checkTerminalOutcome, evaluateTurnOutcome } from '@/engine/outcome';
import { resolveNextNode } from '@/engine/branching';
import type { Scenario, ScenarioNode } from '@/content/types';

describe('Outcome & Branching Engine', () => {
  it('D4: Precedence of outcomes when multiple thresholds met', () => {
    // E >= 100 beats F <= 0
    expect(checkThresholdOutcome({ escalation: 100, grounding: 0, confusion: 85 })).toBe(
      'LOSS_RUPTURE'
    );

    // F <= 0 beats K >= 80
    expect(checkThresholdOutcome({ escalation: 50, grounding: 0, confusion: 80 })).toBe(
      'LOSS_BURNOUT'
    );

    // K >= 80 wins if E < 100 and F > 0
    expect(checkThresholdOutcome({ escalation: 75, grounding: 20, confusion: 80 })).toBe(
      'WIN_BREAKTHROUGH'
    );
  });

  it('D5: Terminal outcome compares final E against initial E', () => {
    expect(checkTerminalOutcome({ escalation: 40, grounding: 80, confusion: 50 }, 65)).toBe(
      'END_DEESCALATED'
    );
    expect(checkTerminalOutcome({ escalation: 65, grounding: 80, confusion: 50 }, 65)).toBe(
      'END_UNRESOLVED'
    );
    expect(checkTerminalOutcome({ escalation: 70, grounding: 80, confusion: 50 }, 65)).toBe(
      'END_UNRESOLVED'
    );
  });

  it('D12: Caps at 7 turns ending with terminal outcome', () => {
    const outcome = evaluateTurnOutcome({
      metrics: { escalation: 55, grounding: 80, confusion: 40 },
      initialEscalation: 65,
      nextNodeId: 'some_next_step',
      turnIndex: 7,
    });
    expect(outcome).toBe('END_DEESCALATED');
  });

  it('D11: Crisis redirect triggers when E > 80 (strict) from main branch', () => {
    const mockScenario = {
      nodes: [
        { nodeId: 'step_main_01', branch: 'main', availableCards: [] },
        { nodeId: 'crisis_entry_escalated_crisis', branch: 'crisis', availableCards: [] },
      ],
    } as unknown as Scenario;

    const mainNode = mockScenario.nodes[0] as ScenarioNode;

    // At E = 80 exactly: NO redirect
    const res80 = resolveNextNode({
      scenario: mockScenario,
      currentNode: mainNode,
      cardNextNodeId: 'step_main_02',
      metrics: { escalation: 80, grounding: 50, confusion: 10 },
      crisisUsed: false,
      outcome: null,
    });
    expect(res80.crisisRedirect).toBe(false);
    expect(res80.nextNodeId).toBe('step_main_02');

    // At E = 80.01: YES redirect
    const res8001 = resolveNextNode({
      scenario: mockScenario,
      currentNode: mainNode,
      cardNextNodeId: 'step_main_02',
      metrics: { escalation: 80.01, grounding: 50, confusion: 10 },
      crisisUsed: false,
      outcome: null,
    });
    expect(res8001.crisisRedirect).toBe(true);
    expect(res8001.nextNodeId).toBe('crisis_entry_escalated_crisis');

    // If crisis already used: NO redirect
    const resAlreadyUsed = resolveNextNode({
      scenario: mockScenario,
      currentNode: mainNode,
      cardNextNodeId: 'step_main_02',
      metrics: { escalation: 90, grounding: 50, confusion: 10 },
      crisisUsed: true,
      outcome: null,
    });
    expect(resAlreadyUsed.crisisRedirect).toBe(false);
    expect(resAlreadyUsed.nextNodeId).toBe('step_main_02');

    // If outcome is already non-null: returns null nextNodeId
    const resOutcome = resolveNextNode({
      scenario: mockScenario,
      currentNode: mainNode,
      cardNextNodeId: 'step_main_02',
      metrics: { escalation: 90, grounding: 50, confusion: 10 },
      crisisUsed: false,
      outcome: 'LOSS_RUPTURE',
    });
    expect(resOutcome.nextNodeId).toBeNull();
    expect(resOutcome.crisisRedirect).toBe(false);

    // If no crisis entry node exists in scenario: returns cardNextNodeId without redirect
    const emptyScenario = { nodes: [] } as unknown as Scenario;
    const resNoCrisisNode = resolveNextNode({
      scenario: emptyScenario,
      currentNode: mainNode,
      cardNextNodeId: 'step_main_02',
      metrics: { escalation: 85, grounding: 50, confusion: 10 },
      crisisUsed: false,
      outcome: null,
    });
    expect(resNoCrisisNode.crisisRedirect).toBe(false);
    expect(resNoCrisisNode.nextNodeId).toBe('step_main_02');
  });
});
