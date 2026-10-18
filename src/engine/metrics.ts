import type { Card, MetricTriple } from '../content/types';
import {
  METRIC_MIN,
  METRIC_MAX,
  MOMENTUM_COEF,
  MOMENTUM_MAX,
  GROUNDING_DRAIN_COEF,
} from './constants';

export interface ApplyCardResult {
  metrics: MetricTriple;
  momentum: number;
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundMetric(x: number): number {
  return Math.round(x * 100) / 100;
}

export function isReactiveCategory(category: Card['category']): boolean {
  return category === 'DEFENSE' || category === 'ATTACK';
}

export function applyCard(
  metrics: MetricTriple,
  momentum: number,
  card: Pick<Card, 'category' | 'delta'>
): ApplyCardResult {
  const isReactive = isReactiveCategory(card.category);
  const nextMomentum = isReactive ? Math.min(MOMENTUM_MAX, momentum + 1) : 0;

  const rawE = metrics.escalation + card.delta.escalation + nextMomentum * MOMENTUM_COEF;
  const rawF = metrics.grounding + card.delta.grounding - metrics.escalation * GROUNDING_DRAIN_COEF;
  const rawK = metrics.confusion + card.delta.confusion;

  const nextE = roundMetric(clamp(METRIC_MIN, METRIC_MAX, rawE));
  const nextF = roundMetric(clamp(METRIC_MIN, METRIC_MAX, rawF));
  const nextK = roundMetric(clamp(METRIC_MIN, METRIC_MAX, rawK));

  return {
    metrics: {
      escalation: nextE,
      grounding: nextF,
      confusion: nextK,
    },
    momentum: nextMomentum,
  };
}
