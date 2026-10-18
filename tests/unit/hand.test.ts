import { describe, it, expect } from 'vitest';
import { drawHand } from '@/engine/hand';
import type { Card } from '@/content/types';

describe('Hand Drawing Engine', () => {
  const samplePool6: Card[] = [
    {
      cardId: 'c_pace_01',
      category: 'PACING',
      text: { hu: 'P1', en: 'P1', de: 'P1' },
      delta: { escalation: -20, grounding: 8, confusion: 10 },
      npcReaction: { hu: 'R1', en: 'R1', de: 'R1' },
      nextNodeId: null,
    },
    {
      cardId: 'c_metamodel_01',
      category: 'META_MODEL',
      text: { hu: 'M1', en: 'M1', de: 'M1' },
      delta: { escalation: -5, grounding: -2, confusion: 30 },
      npcReaction: { hu: 'R2', en: 'R2', de: 'R2' },
      nextNodeId: null,
    },
    {
      cardId: 'c_reframe_01',
      category: 'REFRAMING',
      text: { hu: 'RF1', en: 'RF1', de: 'RF1' },
      delta: { escalation: -15, grounding: 10, confusion: 20 },
      npcReaction: { hu: 'R3', en: 'R3', de: 'R3' },
      nextNodeId: null,
    },
    {
      cardId: 'c_defense_01',
      category: 'DEFENSE',
      text: { hu: 'D1', en: 'D1', de: 'D1' },
      delta: { escalation: 20, grounding: -15, confusion: 0 },
      npcReaction: { hu: 'R4', en: 'R4', de: 'R4' },
      nextNodeId: null,
    },
    {
      cardId: 'c_attack_01',
      category: 'ATTACK',
      text: { hu: 'A1', en: 'A1', de: 'A1' },
      delta: { escalation: 35, grounding: -30, confusion: -20 },
      npcReaction: { hu: 'R5', en: 'R5', de: 'R5' },
      nextNodeId: null,
    },
    {
      cardId: 'c_defense_02',
      category: 'DEFENSE',
      text: { hu: 'D2', en: 'D2', de: 'D2' },
      delta: { escalation: 18, grounding: -16, confusion: 0 },
      npcReaction: { hu: 'R6', en: 'R6', de: 'R6' },
      nextNodeId: null,
    },
  ];

  it('SBE-HND-*: guarantees constructive and reactive card over 10,000 seeds', () => {
    const cardMap = new Map(samplePool6.map((c) => [c.cardId, c]));
    const occurrences = new Map<string, number>();

    let s = 12345;
    for (let i = 0; i < 10000; i++) {
      const [hand, nextS] = drawHand(samplePool6, s);
      expect(hand.length).toBe(3);
      expect(new Set(hand).size).toBe(3); // no duplicates

      const cats = hand.map((id) => cardMap.get(id)!.category);
      const hasConstructive = cats.some((cat) => cat === 'PACING' || cat === 'META_MODEL');
      const hasReactive = cats.some((cat) => cat === 'DEFENSE' || cat === 'ATTACK');

      expect(hasConstructive).toBe(true);
      expect(hasReactive).toBe(true);

      for (const id of hand) {
        occurrences.set(id, (occurrences.get(id) || 0) + 1);
      }
      s = nextS;
    }

    // Every card in pool appears at least once
    for (const c of samplePool6) {
      expect(occurrences.get(c.cardId)).toBeGreaterThan(0);
    }
  });

  it('draws all 3 cards if pool length is 3', () => {
    const pool3 = samplePool6.slice(0, 3);
    const [hand] = drawHand(pool3, 42);
    expect(hand.length).toBe(3);
    expect(hand.sort()).toEqual(pool3.map((c) => c.cardId).sort());
  });

  it('is deterministic: same seed and pool produce identical hand', () => {
    const [hand1, s1] = drawHand(samplePool6, 999);
    const [hand2, s2] = drawHand(samplePool6, 999);
    expect(hand1).toEqual(hand2);
    expect(s1).toBe(s2);
  });
});
