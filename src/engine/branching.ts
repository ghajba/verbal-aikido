import type { MetricTriple, Scenario, ScenarioNode } from '../content/types';
import type { Outcome } from './types';
import { CRISIS_ESCALATION } from './constants';

export function findCrisisEntryNode(scenario: Scenario): ScenarioNode | null {
  return (
    scenario.nodes.find((n) => n.branch === 'crisis' && n.nodeId.endsWith('_escalated_crisis')) ||
    null
  );
}

export function resolveNextNode(params: {
  scenario: Scenario;
  currentNode: ScenarioNode;
  cardNextNodeId: string | null;
  metrics: MetricTriple;
  crisisUsed: boolean;
  outcome: Outcome | null;
}): { nextNodeId: string | null; crisisRedirect: boolean } {
  if (params.outcome !== null) {
    return { nextNodeId: null, crisisRedirect: false };
  }

  const isMain = params.currentNode.branch !== 'crisis';
  if (params.metrics.escalation > CRISIS_ESCALATION && isMain && !params.crisisUsed) {
    const crisisEntry = findCrisisEntryNode(params.scenario);
    if (crisisEntry) {
      return { nextNodeId: crisisEntry.nodeId, crisisRedirect: true };
    }
  }

  return { nextNodeId: params.cardNextNodeId, crisisRedirect: false };
}
