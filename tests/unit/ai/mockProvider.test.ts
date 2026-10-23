import { describe, expect, it } from 'vitest';
import { MockAiProvider } from '../../../src/ai/providers/mockProvider';
import type { AiTurnContext } from '../../../src/ai/types';

describe('MockAiProvider', () => {
  const baseContext: AiTurnContext = {
    archetypeId: 'angry_pm',
    npcProfile: {
      name: 'Kovács Péter',
      role: 'PM',
      coreConflict: 'Release deadline',
      personality: 'Angry',
    },
    turnIndex: 0,
    currentMetrics: { escalation: 65, grounding: 100, confusion: 0 },
    momentum: 0,
    history: [],
    locale: 'hu',
  };

  it('is always available', async () => {
    const provider = new MockAiProvider();
    expect(provider.id).toBe('mock');
    expect(provider.name).toBe('Mock Deterministic AI');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('generates a default reactive Hungarian node on turn 1', async () => {
    const provider = new MockAiProvider();
    const node = await provider.generateNextNode(baseContext);

    expect(node.npcReaction).toContain('Kovács Péter');
    expect(node.nextStatement).toContain('1. körben');
    expect(node.nextTone).toBe('ANGRY');
    expect(node.cards).toHaveLength(3);
    expect(node.cards.some((c) => c.category === 'PACING')).toBe(true);
    expect(node.cards.some((c) => c.category === 'META_MODEL')).toBe(true);
    expect(node.cards.some((c) => c.category === 'ATTACK')).toBe(true);
  });

  it('reacts constructively when previous player move was PACING or REFRAMING', async () => {
    const provider = new MockAiProvider();
    const context: AiTurnContext = {
      ...baseContext,
      turnIndex: 1,
      history: [
        {
          turnIndex: 0,
          npcStatement: 'Első támadás',
          playerCardText: 'Értem a helyzetet',
          playerCategory: 'PACING',
          outcomeTone: 'TENSE',
        },
      ],
    };

    const node = await provider.generateNextNode(context);
    expect(node.npcReaction).toContain('vállai kissé leereszkednek');
    expect(node.nextTone).toBe('TENSE');
    expect(node.cards.some((c) => c.category === 'REFRAMING')).toBe(true);
  });

  it('reacts with cognitive reflection when previous player move was META_MODEL', async () => {
    const provider = new MockAiProvider();
    const context: AiTurnContext = {
      ...baseContext,
      turnIndex: 1,
      history: [
        {
          turnIndex: 0,
          npcStatement: 'Első támadás',
          playerCardText: 'Pontosan mi hiányzik?',
          playerCategory: 'META_MODEL',
          outcomeTone: 'CALM',
        },
      ],
    };

    const node = await provider.generateNextNode(context);
    expect(node.npcReaction).toContain('megakad a kérdésen');
    expect(node.nextTone).toBe('CALM');
    expect(node.nextStatement).toContain('bejelentkezési modul');
  });

  it('generates English responses when locale is en', async () => {
    const provider = new MockAiProvider();
    const nodeDefault = await provider.generateNextNode({ ...baseContext, locale: 'en' });
    expect(nodeDefault.npcReaction).toContain('raises their voice');
    expect(nodeDefault.nextStatement).toContain('turn 1');

    const nodeConstructive = await provider.generateNextNode({
      ...baseContext,
      locale: 'en',
      history: [
        {
          turnIndex: 0,
          npcStatement: 'Attack',
          playerCardText: 'Pacing card',
          playerCategory: 'REFRAMING',
          outcomeTone: 'TENSE',
        },
      ],
    });
    expect(nodeConstructive.npcReaction).toContain('shoulders drop slightly');

    const nodeMeta = await provider.generateNextNode({
      ...baseContext,
      locale: 'en',
      history: [
        {
          turnIndex: 0,
          npcStatement: 'Attack',
          playerCardText: 'Meta card',
          playerCategory: 'META_MODEL',
          outcomeTone: 'CALM',
        },
      ],
    });
    expect(nodeMeta.npcReaction).toContain('caught off guard');
  });

  it('generates German responses when locale is de', async () => {
    const provider = new MockAiProvider();
    const nodeDefault = await provider.generateNextNode({ ...baseContext, locale: 'de' });
    expect(nodeDefault.npcReaction).toContain('schlägt mit der Hand');
    expect(nodeDefault.nextStatement).toContain('Runde 1');

    const nodeConstructive = await provider.generateNextNode({
      ...baseContext,
      locale: 'de',
      history: [
        {
          turnIndex: 0,
          npcStatement: 'Attack',
          playerCardText: 'Pacing card',
          playerCategory: 'PACING',
          outcomeTone: 'TENSE',
        },
      ],
    });
    expect(nodeConstructive.npcReaction).toContain('senkt die Schultern');

    const nodeMeta = await provider.generateNextNode({
      ...baseContext,
      locale: 'de',
      history: [
        {
          turnIndex: 0,
          npcStatement: 'Attack',
          playerCardText: 'Meta card',
          playerCategory: 'META_MODEL',
          outcomeTone: 'CALM',
        },
      ],
    });
    expect(nodeMeta.npcReaction).toContain('stutzt kurz');
  });

  it('supports configurable delay and error injection', async () => {
    const provider = new MockAiProvider({ delayMs: 15 });
    const start = performance.now();
    await provider.generateNextNode(baseContext);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(10);

    provider.setDelay(0);
    provider.setShouldFail(true);
    await expect(provider.generateNextNode(baseContext)).rejects.toThrow(
      'MockAiProvider intentional failure'
    );
  });
});
