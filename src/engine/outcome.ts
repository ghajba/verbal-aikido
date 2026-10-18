import type { MetricTriple } from '../content/types';
import type { Outcome } from './types';
import { LOSS_ESCALATION, LOSS_GROUNDING, WIN_CONFUSION, MAX_TURNS } from './constants';

export function checkThresholdOutcome(metrics: MetricTriple): Outcome | null {
  // Precedence per D4: E >= 100 > F <= 0 > K >= 80
  if (metrics.escalation >= LOSS_ESCALATION) {
    return 'LOSS_RUPTURE';
  }
  if (metrics.grounding <= LOSS_GROUNDING) {
    return 'LOSS_BURNOUT';
  }
  if (metrics.confusion >= WIN_CONFUSION) {
    return 'WIN_BREAKTHROUGH';
  }
  return null;
}

export function checkTerminalOutcome(metrics: MetricTriple, initialEscalation: number): Outcome {
  // D5: END_DEESCALATED if final E < initial E, otherwise END_UNRESOLVED
  if (metrics.escalation < initialEscalation) {
    return 'END_DEESCALATED';
  }
  return 'END_UNRESOLVED';
}

export function evaluateTurnOutcome(params: {
  metrics: MetricTriple;
  initialEscalation: number;
  nextNodeId: string | null;
  turnIndex: number; // turns resolved including this one
}): Outcome | null {
  // 1. Threshold outcome check
  const thresholdOutcome = checkThresholdOutcome(params.metrics);
  if (thresholdOutcome !== null) {
    return thresholdOutcome;
  }

  // 2. Hard turn limit reached (D12: runtime hard cap MAX_TURNS = 7)
  if (params.turnIndex >= MAX_TURNS) {
    return checkTerminalOutcome(params.metrics, params.initialEscalation);
  }

  // 3. Reached end of graph (terminal card)
  if (params.nextNodeId === null) {
    return checkTerminalOutcome(params.metrics, params.initialEscalation);
  }

  // Game continues
  return null;
}
