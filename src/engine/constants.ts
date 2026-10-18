import type { CardCategory, Tone } from '@/content/types';

export const METRIC_MIN = 0;
export const METRIC_MAX = 100;
export const LOSS_ESCALATION = 100; // E >= this
export const LOSS_GROUNDING = 0; // F <= this
export const WIN_CONFUSION = 80; // K >= this
export const CRISIS_ESCALATION = 80; // E > this (strict)
export const MOMENTUM_COEF = 1.25;
export const MOMENTUM_MAX = 4;
export const GROUNDING_DRAIN_COEF = 0.05;
export const MAX_TURNS = 7;
export const HAND_SIZE = 3;
export const PANIC_ESCALATION = 70; // E >= this
export const PANIC_GROUNDING = 30; // F <= this
export const INPUT_LOCK_MS = 400;
export const CARD_FLY_MS = 180;
export const METER_TWEEN_MS = 400;

export const REVEAL_MS_PER_CHAR: Record<Tone, number> = {
  CALM: 28,
  TENSE: 22,
  ANGRY: 16,
  FURIOUS: 12,
  SARCASTIC: 26,
  COLD: 30,
};
export const REVEAL_MAX_MS = 1800;

export const CONSTRUCTIVE: CardCategory[] = ['PACING', 'META_MODEL', 'REFRAMING'];
export const REACTIVE: CardCategory[] = ['DEFENSE', 'ATTACK'];
export const GUARANTEE_CONSTRUCTIVE: CardCategory[] = ['PACING', 'META_MODEL'];
export const GUARANTEE_REACTIVE: CardCategory[] = ['DEFENSE', 'ATTACK'];

export interface GuideRange {
  min: number;
  max: number;
}

export interface CategoryMetricRanges {
  escalation: GuideRange;
  grounding: GuideRange;
  confusion: GuideRange;
}

export const CATEGORY_GUIDE_RANGES: Record<CardCategory, CategoryMetricRanges> = {
  PACING: {
    escalation: { min: -25, max: -15 },
    grounding: { min: 5, max: 10 },
    confusion: { min: 5, max: 10 },
  },
  META_MODEL: {
    escalation: { min: -5, max: 5 },
    grounding: { min: -5, max: 0 },
    confusion: { min: 25, max: 35 },
  },
  REFRAMING: {
    escalation: { min: -20, max: -10 },
    grounding: { min: 10, max: 15 },
    confusion: { min: 15, max: 25 },
  },
  DEFENSE: {
    escalation: { min: 15, max: 25 },
    grounding: { min: -20, max: -15 },
    confusion: { min: 0, max: 0 },
  },
  ATTACK: {
    escalation: { min: 30, max: 45 },
    grounding: { min: -35, max: -25 },
    confusion: { min: -30, max: -20 },
  },
};
