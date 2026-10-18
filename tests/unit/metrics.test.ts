import { describe, it, expect } from 'vitest';
import { applyCard, roundMetric, isReactiveCategory } from '@/engine/metrics';
import type { Card } from '@/content/types';

describe('Metrics Engine', () => {
  const initialMetrics = { escalation: 65, grounding: 100, confusion: 0 };

  it('Section 8.3: Vector 1 (c_pace_01)', () => {
    const card: Pick<Card, 'category' | 'delta'> = {
      category: 'PACING',
      delta: { escalation: -20, grounding: 8, confusion: 10 },
    };
    const res = applyCard(initialMetrics, 0, card);
    expect(res.momentum).toBe(0);
    expect(res.metrics.escalation).toBe(45);
    expect(res.metrics.grounding).toBe(100); // clamped from 104.75
    expect(res.metrics.confusion).toBe(10);
  });

  it('Section 8.3: Vector 2 (c_metamodel_01)', () => {
    const card: Pick<Card, 'category' | 'delta'> = {
      category: 'META_MODEL',
      delta: { escalation: -5, grounding: -2, confusion: 30 },
    };
    const res = applyCard(initialMetrics, 0, card);
    expect(res.momentum).toBe(0);
    expect(res.metrics.escalation).toBe(60);
    expect(res.metrics.grounding).toBe(94.75);
    expect(res.metrics.confusion).toBe(30);
  });

  it('Section 8.3: Vector 3 (c_defense_01)', () => {
    const card: Pick<Card, 'category' | 'delta'> = {
      category: 'DEFENSE',
      delta: { escalation: 30, grounding: -20, confusion: -10 },
    };
    const res = applyCard(initialMetrics, 0, card);
    expect(res.momentum).toBe(1);
    expect(res.metrics.escalation).toBe(96.25);
    expect(res.metrics.grounding).toBe(76.75);
    expect(res.metrics.confusion).toBe(0); // clamped from -10
  });

  it('Section 8.3: Second turn defense (loss rupture)', () => {
    const afterFirstDefense = { escalation: 96.25, grounding: 76.75, confusion: 0 };
    const secondDefense: Pick<Card, 'category' | 'delta'> = {
      category: 'DEFENSE',
      delta: { escalation: 20, grounding: -15, confusion: 0 },
    };
    const res = applyCard(afterFirstDefense, 1, secondDefense);
    expect(res.momentum).toBe(2);
    expect(res.metrics.escalation).toBe(100); // clamped from 118.75
    expect(res.metrics.confusion).toBe(0);
  });

  it('SBE-MOM-*: momentum caps at 4 on consecutive reactive cards', () => {
    let momentum = 0;
    let m = { ...initialMetrics };
    const attackCard: Pick<Card, 'category' | 'delta'> = {
      category: 'ATTACK',
      delta: { escalation: 0, grounding: 0, confusion: 0 },
    };

    for (let i = 1; i <= 6; i++) {
      const res = applyCard(m, momentum, attackCard);
      momentum = res.momentum;
      m = res.metrics;
      if (i <= 4) {
        expect(momentum).toBe(i);
      } else {
        expect(momentum).toBe(4);
      }
    }
  });

  it('SBE-MOM-*: constructive card resets momentum to 0', () => {
    const pacingCard: Pick<Card, 'category' | 'delta'> = {
      category: 'PACING',
      delta: { escalation: 0, grounding: 0, confusion: 0 },
    };
    const res = applyCard(initialMetrics, 3, pacingCard);
    expect(res.momentum).toBe(0);
  });

  it('rounds correctly with IEEE doubles (e.g. 79.9375 -> 79.94)', () => {
    expect(roundMetric(79.9375)).toBe(79.94);
    expect(roundMetric(79.932)).toBe(79.93);
  });

  it('correctly identifies reactive categories', () => {
    expect(isReactiveCategory('DEFENSE')).toBe(true);
    expect(isReactiveCategory('ATTACK')).toBe(true);
    expect(isReactiveCategory('PACING')).toBe(false);
    expect(isReactiveCategory('META_MODEL')).toBe(false);
    expect(isReactiveCategory('REFRAMING')).toBe(false);
  });
});
