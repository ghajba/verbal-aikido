import { describe, expect, it } from 'vitest';
import { ARCHETYPES, buildTurnPrompt } from '../../../src/ai/prompts';
import { validateAiNode } from '../../../src/ai/schema';
import type { AiTurnContext } from '../../../src/ai/types';

describe('AI Schema and Validation', () => {
  it('validates a complete, correctly formatted AI node', () => {
    const raw = {
      npcReaction: 'Péter meglepődik, de még tartja a haragot.',
      nextStatement: 'Jó, de mi lesz a holnapi demóval?',
      nextTone: 'ANGRY',
      cards: [
        {
          category: 'PACING',
          text: 'Látom, hogy mekkora a feszültség a demó miatt.',
          debriefHint: 'Az érzelem elismerése csökkenti az eszkalációt.',
        },
        {
          category: 'META_MODEL',
          text: 'Pontosan melyik funkció blokkolja a demót?',
          debriefHint: 'A konkrétumok tisztázása kizökkenti az általánosításból.',
        },
        {
          category: 'DEFENSE',
          text: 'Nem én tehetek róla, a másik csapat hibázott.',
          debriefHint: 'A magyarázkodás felbőszíti az ellenfelet.',
        },
      ],
    };

    const validated = validateAiNode(raw);
    expect(validated.npcReaction).toBe('Péter meglepődik, de még tartja a haragot.');
    expect(validated.nextStatement).toBe('Jó, de mi lesz a holnapi demóval?');
    expect(validated.nextTone).toBe('ANGRY');
    expect(validated.cards).toHaveLength(3);
    expect(validated.cards[0]?.category).toBe('PACING');
    expect(validated.cards[1]?.category).toBe('META_MODEL');
    expect(validated.cards[2]?.category).toBe('DEFENSE');
  });

  it('falls back to TENSE tone when tone is unknown, invalid or undefined', () => {
    const rawUnknown = {
      npcReaction: 'Reakció',
      nextStatement: 'Mondat',
      nextTone: 'UNKNOWN_EMOTION',
      cards: [
        { category: 'PACING', text: 'Kártya 1', debriefHint: 'Hint 1' },
        { category: 'REFRAMING', text: 'Kártya 2', debriefHint: 'Hint 2' },
        { category: 'ATTACK', text: 'Kártya 3', debriefHint: 'Hint 3' },
      ],
    };

    expect(validateAiNode(rawUnknown).nextTone).toBe('TENSE');

    const rawUndefinedTone = {
      npcReaction: 'Reakció',
      nextStatement: 'Mondat',
      cards: [
        { category: 'PACING', text: 'Kártya 1', debriefHint: 'Hint 1' },
        { category: 'REFRAMING', text: 'Kártya 2', debriefHint: 'Hint 2' },
        { category: 'ATTACK', text: 'Kártya 3', debriefHint: 'Hint 3' },
      ],
    };

    expect(validateAiNode(rawUndefinedTone).nextTone).toBe('TENSE');
  });

  it('falls back to DEFENSE category when category is unknown or undefined', () => {
    const raw = {
      npcReaction: 'Reakció',
      nextStatement: 'Mondat',
      nextTone: 'CALM',
      cards: [
        { category: 'INVALID_CATEGORY', text: 'Kártya 1', debriefHint: 'Hint 1' },
        { text: 'Kártya 2', debriefHint: 'Hint 2' }, // category undefined
        { category: 'REFRAMING', text: 'Kártya 3', debriefHint: 'Hint 3' },
      ],
    };

    const validated = validateAiNode(raw);
    expect(validated.cards[0]?.category).toBe('DEFENSE');
    expect(validated.cards[1]?.category).toBe('DEFENSE');
  });

  it('falls back to card text when debriefHint is empty, non-string or undefined', () => {
    const raw = {
      npcReaction: 'Reakció',
      nextStatement: 'Mondat',
      nextTone: 'CALM',
      cards: [
        { category: 'PACING', text: 'Kártya 1', debriefHint: '' },
        { category: 'PACING', text: 'Kártya 2', debriefHint: 123 },
        { category: 'PACING', text: 'Kártya 3' },
      ],
    };

    const validated = validateAiNode(raw);
    expect(validated.cards[0]?.debriefHint).toBe('Kártya 1');
    expect(validated.cards[1]?.debriefHint).toBe('Kártya 2');
    expect(validated.cards[2]?.debriefHint).toBe('Kártya 3');
  });

  it('skips non-object or malformed items in cards array', () => {
    const raw = {
      npcReaction: 'Reakció',
      nextStatement: 'Mondat',
      nextTone: 'CALM',
      cards: [
        null,
        'string-card',
        42,
        { category: 'PACING', text: 'Valid K1' },
        { category: 'META_MODEL', text: 999 }, // non-string text skipped
        { category: 'REFRAMING', text: 'Valid K2' },
        { category: 'ATTACK', text: 'Valid K3' },
      ],
    };

    const validated = validateAiNode(raw);
    expect(validated.cards).toHaveLength(3);
    expect(validated.cards[0]?.text).toBe('Valid K1');
    expect(validated.cards[1]?.text).toBe('Valid K2');
    expect(validated.cards[2]?.text).toBe('Valid K3');
  });

  it('throws an error if input is not an object or empty', () => {
    expect(() => validateAiNode(null)).toThrow('AI generation result is not an object');
    expect(() => validateAiNode('not-an-object')).toThrow('AI generation result is not an object');
  });

  it('throws an error if npcReaction or nextStatement is missing, empty or non-string', () => {
    expect(() =>
      validateAiNode({
        npcReaction: '',
        nextStatement: 'Mondat',
        cards: [],
      })
    ).toThrow('Missing or empty npcReaction');

    expect(() =>
      validateAiNode({
        npcReaction: 123,
        nextStatement: 'Mondat',
        cards: [],
      })
    ).toThrow('Missing or empty npcReaction');

    expect(() =>
      validateAiNode({
        npcReaction: 'Reakció',
        nextStatement: '   ',
        cards: [],
      })
    ).toThrow('Missing or empty nextStatement');

    expect(() =>
      validateAiNode({
        npcReaction: 'Reakció',
        nextStatement: null,
        cards: [],
      })
    ).toThrow('Missing or empty nextStatement');
  });

  it('throws an error if cards is not an array or fewer than 3 valid cards are provided', () => {
    expect(() =>
      validateAiNode({
        npcReaction: 'Reakció',
        nextStatement: 'Mondat',
        cards: 'not-an-array',
      })
    ).toThrow('AI output must contain at least 3 cards, got 0');

    expect(() =>
      validateAiNode({
        npcReaction: 'Reakció',
        nextStatement: 'Mondat',
        cards: [{ category: 'PACING', text: 'Egy kártya', debriefHint: 'H' }],
      })
    ).toThrow('AI output must contain at least 3 cards, got 1');

    expect(() =>
      validateAiNode({
        npcReaction: 'Reakció',
        nextStatement: 'Mondat',
        cards: [
          { category: 'PACING', text: 'K1', debriefHint: 'H' },
          { category: 'DEFENSE', text: '', debriefHint: 'H' }, // empty text
          { category: 'ATTACK', text: 'K3', debriefHint: 'H' },
        ],
      })
    ).toThrow('Could not extract at least 3 valid cards');
  });
});

describe('AI Archetypes and Prompts', () => {
  it('defines the standard three archetypes with full localization', () => {
    expect(ARCHETYPES.angry_pm).toBeDefined();
    expect(ARCHETYPES.toxic_reviewer).toBeDefined();
    expect(ARCHETYPES.angry_customer).toBeDefined();

    for (const archetype of Object.values(ARCHETYPES)) {
      expect(archetype.name.hu).toBeTruthy();
      expect(archetype.name.en).toBeTruthy();
      expect(archetype.name.de).toBeTruthy();
      expect(archetype.initialStatement.hu).toBeTruthy();
      expect(archetype.initialMetrics.escalation).toBeGreaterThan(0);
      expect(archetype.initialMetrics.grounding).toBe(100);
    }
  });

  it('builds localized prompts for all supported locales and unknown fallback', () => {
    const baseContext: AiTurnContext = {
      archetypeId: 'angry_pm',
      npcProfile: {
        name: 'Kovács Péter',
        role: 'Projektmenedzser',
        coreConflict: 'Késés a release-ben',
        personality: 'Feszült és türelmetlen',
      },
      turnIndex: 0,
      currentMetrics: { escalation: 65, grounding: 100, confusion: 0 },
      momentum: 0,
      history: [],
      locale: 'hu',
    };

    const huPrompt = buildTurnPrompt(baseContext);
    expect(huPrompt.systemPrompt).toContain('Verbális Aikidó');
    expect(huPrompt.userPrompt).toContain('No prior turns.');
    expect(huPrompt.userPrompt).toContain('Kovács Péter');

    const enPrompt = buildTurnPrompt({ ...baseContext, locale: 'en' });
    expect(enPrompt.systemPrompt).toContain('Verbal Aikido');

    const dePrompt = buildTurnPrompt({ ...baseContext, locale: 'de' });
    expect(dePrompt.systemPrompt).toContain('Verbales Aikido');

    // Unknown locale falls back to Hungarian
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fallbackPrompt = buildTurnPrompt({ ...baseContext, locale: 'fr' as any });
    expect(fallbackPrompt.systemPrompt).toContain('Verbális Aikidó');
  });

  it('formats conversation history correctly in the user prompt', () => {
    const contextWithHistory: AiTurnContext = {
      archetypeId: 'angry_pm',
      npcProfile: {
        name: 'Kovács Péter',
        role: 'PM',
        coreConflict: 'Release deadline',
        personality: 'Angry',
      },
      turnIndex: 1,
      currentMetrics: { escalation: 55, grounding: 105, confusion: 10 },
      momentum: 0,
      history: [
        {
          turnIndex: 0,
          npcStatement: 'Hogy képzeltétek ezt?!',
          playerCardText: 'Látom, hogy nagy rajtad a nyomás.',
          playerCategory: 'PACING',
          outcomeTone: 'TENSE',
        },
      ],
      locale: 'hu',
    };

    const prompt = buildTurnPrompt(contextWithHistory);
    expect(prompt.userPrompt).toContain('Turn 1: NPC said: "Hogy képzeltétek ezt?!"');
    expect(prompt.userPrompt).toContain(
      'Player played [PACING]: "Látom, hogy nagy rajtad a nyomás."'
    );
  });
});
