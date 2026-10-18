import { describe, it, expect } from 'vitest';
import * as C from '@/engine/constants';

describe('Engine Constants', () => {
  it('defines boundary and victory/loss thresholds', () => {
    expect(C.METRIC_MIN).toBe(0);
    expect(C.METRIC_MAX).toBe(100);
    expect(C.LOSS_ESCALATION).toBe(100);
    expect(C.LOSS_GROUNDING).toBe(0);
    expect(C.WIN_CONFUSION).toBe(80);
    expect(C.CRISIS_ESCALATION).toBe(80);
  });

  it('defines game mechanics rules', () => {
    expect(C.MOMENTUM_COEF).toBe(1.25);
    expect(C.MOMENTUM_MAX).toBe(4);
    expect(C.GROUNDING_DRAIN_COEF).toBe(0.05);
    expect(C.MAX_TURNS).toBe(7);
    expect(C.HAND_SIZE).toBe(3);
  });

  it('defines category groupings', () => {
    expect(C.CONSTRUCTIVE).toEqual(['PACING', 'META_MODEL', 'REFRAMING']);
    expect(C.REACTIVE).toEqual(['DEFENSE', 'ATTACK']);
    expect(C.GUARANTEE_CONSTRUCTIVE).toEqual(['PACING', 'META_MODEL']);
    expect(C.GUARANTEE_REACTIVE).toEqual(['DEFENSE', 'ATTACK']);
  });

  it('defines category guideline ranges', () => {
    expect(C.CATEGORY_GUIDE_RANGES.PACING.escalation).toEqual({ min: -25, max: -15 });
    expect(C.CATEGORY_GUIDE_RANGES.ATTACK.escalation).toEqual({ min: 30, max: 45 });
  });

  it('defines reveal timings', () => {
    expect(C.REVEAL_MAX_MS).toBe(1800);
    expect(C.REVEAL_MS_PER_CHAR.CALM).toBe(28);
  });

  it('defines swipe gesture thresholds and timings', () => {
    expect(C.SWIPE_COMMIT_DY).toBe(-60);
    expect(C.SWIPE_COMMIT_VELOCITY).toBe(0.6);
    expect(C.SWIPE_VELOCITY_WINDOW_MS).toBe(80);
    expect(C.SWIPE_MAX_DX).toBe(50);
    expect(C.SWIPE_SPRING_BACK_MS).toBe(150);
    expect(C.SWIPE_HORIZONTAL_FACTOR).toBe(0.2);
  });
});
