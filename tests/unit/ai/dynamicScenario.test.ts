import { describe, expect, it } from 'vitest';
import { CATEGORY_DELTAS, DynamicScenarioManager } from '../../../src/ai/dynamicScenario';
import { ARCHETYPES } from '../../../src/ai/prompts';
import { MockAiProvider } from '../../../src/ai/providers/mockProvider';
import type { AiGeneratedNode } from '../../../src/ai/types';
import { GameController } from '../../../src/app/gameController';
import { MemoryDriver } from '../../../src/storage/memory';

describe('DynamicScenarioManager', () => {
  it('creates an initial scenario from an archetype definition', () => {
    const scenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.angry_pm!, 'hu');

    expect(scenario.id).toBe('scen_dynamic_angry_pm');
    expect(scenario.startNodeId).toBe('node_turn_0');
    expect(scenario.nodes).toHaveLength(1);

    const startNode = scenario.nodes[0]!;
    expect(startNode.nodeId).toBe('node_turn_0');
    expect(startNode.tone).toBe('ANGRY');
    expect(startNode.availableCards).toHaveLength(3);
    expect(startNode.availableCards[0]?.category).toBe('PACING');
    expect(startNode.availableCards[0]?.delta).toEqual(CATEGORY_DELTAS.PACING);
    expect(startNode.availableCards[0]?.nextNodeId).toBe('node_turn_1');
  });

  it('appends an AI generated node and calculates deltas for all categories', () => {
    const scenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.angry_pm!, 'hu');

    const generatedNode: AiGeneratedNode = {
      npcReaction: 'Péter elgondolkodik.',
      nextStatement: 'Rendben, mi a következő lépés?',
      nextTone: 'TENSE',
      cards: [
        { category: 'PACING', text: 'Pacing card', debriefHint: 'H1' },
        { category: 'META_MODEL', text: 'Meta card', debriefHint: 'H2' },
        { category: 'REFRAMING', text: 'Reframing card', debriefHint: 'H3' },
        { category: 'DEFENSE', text: 'Defense card', debriefHint: 'H4' },
        { category: 'ATTACK', text: 'Attack card', debriefHint: 'H5' },
        // Unknown category fallback
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { category: 'UNKNOWN' as any, text: 'Unknown category card', debriefHint: 'H6' },
      ],
    };

    const node1 = DynamicScenarioManager.appendGeneratedNode(scenario, generatedNode, 1, 'hu');
    expect(scenario.nodes).toHaveLength(2);
    expect(node1.nodeId).toBe('node_turn_1');
    expect(node1.availableCards).toHaveLength(6);
    expect(node1.availableCards[0]?.delta).toEqual(CATEGORY_DELTAS.PACING);
    expect(node1.availableCards[1]?.delta).toEqual(CATEGORY_DELTAS.META_MODEL);
    expect(node1.availableCards[2]?.delta).toEqual(CATEGORY_DELTAS.REFRAMING);
    expect(node1.availableCards[3]?.delta).toEqual(CATEGORY_DELTAS.DEFENSE);
    expect(node1.availableCards[4]?.delta).toEqual(CATEGORY_DELTAS.ATTACK);
    expect(node1.availableCards[5]?.delta).toEqual(CATEGORY_DELTAS.DEFENSE);

    // Updating existing node replaces it
    const updated = DynamicScenarioManager.appendGeneratedNode(scenario, generatedNode, 1, 'hu');
    expect(scenario.nodes).toHaveLength(2);
    expect(updated.nodeId).toBe('node_turn_1');
  });

  it('creates localized fallback nodes on demand', () => {
    const scenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.toxic_reviewer!, 'en');
    const fallbackNode = DynamicScenarioManager.createFallbackNode(scenario, 1, 'en');

    expect(fallbackNode.nodeId).toBe('node_turn_1');
    expect(fallbackNode.npcStatement.en).toContain('We still need to resolve this');
    expect(fallbackNode.availableCards).toHaveLength(3);

    const deScenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.toxic_reviewer!, 'de');
    const deFallback = DynamicScenarioManager.createFallbackNode(deScenario, 1, 'de');
    expect(deFallback.npcStatement.de).toContain('Wir müssen das jetzt trotzdem klären');

    const huScenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.toxic_reviewer!, 'hu');
    const huFallback = DynamicScenarioManager.createFallbackNode(huScenario, 1, 'hu');
    expect(huFallback.npcStatement.hu).toContain('Ezt akkor is meg kell most oldanunk');
  });
});

describe('GameController AI Integration', () => {
  it('pre-fetches and connects dynamic AI turns seamlessly', async () => {
    const storage = new MemoryDriver();
    const mockAi = new MockAiProvider({ delayMs: 5 });
    const controller = new GameController({
      storage,
      fastReveal: false,
      aiProvider: mockAi,
      locale: 'hu',
    });

    expect(controller.getAiProvider()).toBe(mockAi);
    expect(controller.getLocale()).toBe('hu');

    const scenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.angry_pm!, 'hu');
    await controller.start(scenario);

    // Initial state: node_turn_0
    expect(controller.runState.value?.phase).toBe('ATTACK_INCOMING');
    await controller.skipReveal();
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    const hand = controller.runState.value?.hand || [];
    expect(hand).toHaveLength(3);

    // Commit first card -> triggers triggerAiPrefetch
    await controller.commitCard(hand[0]!);
    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');

    // Wait until resolution is complete
    await new Promise((resolve) => setTimeout(resolve, 1550));
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    // Continue to next turn -> resolveAiPrefetch appends node_turn_1 and FSM transitions
    await controller.continueNext();

    expect(controller.runState.value?.currentNodeId).toBe('node_turn_1');
    expect(controller.runState.value?.turnIndex).toBe(1);
    expect(scenario.nodes.some((n) => n.nodeId === 'node_turn_1')).toBe(true);
  });

  it('falls back to fallback node when AI generation fails', async () => {
    const storage = new MemoryDriver();
    const failingAi = new MockAiProvider({ shouldFail: true });
    const controller = new GameController({
      storage,
      fastReveal: false,
      aiProvider: failingAi,
      locale: 'hu',
    });

    const scenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.angry_pm!, 'hu');
    await controller.start(scenario);
    await controller.skipReveal();

    const hand = controller.runState.value?.hand || [];
    await controller.commitCard(hand[0]!);

    await new Promise((resolve) => setTimeout(resolve, 1550));
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    // continueNext should catch failure and create fallback node
    await controller.continueNext();

    expect(controller.runState.value?.currentNodeId).toBe('node_turn_1');
    const node1 = scenario.nodes.find((n) => n.nodeId === 'node_turn_1');
    expect(node1).toBeDefined();
    expect(node1?.npcStatement.hu).toContain('Ezt akkor is meg kell most oldanunk');
  });

  it('handles early exits when resolving prefetch without pending task or scenario', async () => {
    const storage = new MemoryDriver();
    const controller = new GameController({ storage });

    // Calling resolveAiPrefetch with no scenario
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (controller as any).resolveAiPrefetch(1);

    const scenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.angry_pm!, 'hu');
    await controller.start(scenario);
    // Calling resolveAiPrefetch with no prefetchTask
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (controller as any).resolveAiPrefetch(1);
  });

  it('handles triggerAiPrefetch early return when cardId is unknown', async () => {
    const storage = new MemoryDriver();
    const mockAi = new MockAiProvider();
    const controller = new GameController({
      storage,
      aiProvider: mockAi,
      locale: 'hu',
    });

    const scenario = DynamicScenarioManager.createInitialScenario(ARCHETYPES.angry_pm!, 'hu');
    await controller.start(scenario);

    // Call triggerAiPrefetch with unknown cardId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (controller as any).triggerAiPrefetch(controller.runState.value!, 'c_unknown_card');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((controller as any).prefetchTask).toBeNull();
  });

  it('allows updating aiProvider and locale dynamically', () => {
    const storage = new MemoryDriver();
    const controller = new GameController({ storage });

    expect(controller.getAiProvider()).toBeNull();
    const provider = new MockAiProvider();
    controller.setAiProvider(provider);
    expect(controller.getAiProvider()).toBe(provider);

    controller.setLocale('de');
    expect(controller.getLocale()).toBe('de');
  });
});
