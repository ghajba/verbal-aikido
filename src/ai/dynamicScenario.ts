import type {
  Card,
  CardCategory,
  Locale,
  LocalizedText,
  MetricTriple,
  Scenario,
  ScenarioNode,
} from '../content/types';
import type { AiGeneratedCard, AiGeneratedNode, ArchetypeDefinition } from './types';

export const CATEGORY_DELTAS: Record<CardCategory, MetricTriple> = {
  PACING: { escalation: -10, grounding: 8, confusion: 6 },
  META_MODEL: { escalation: -4, grounding: 4, confusion: 20 },
  REFRAMING: { escalation: -8, grounding: 10, confusion: 14 },
  DEFENSE: { escalation: 12, grounding: -8, confusion: -2 },
  ATTACK: { escalation: 20, grounding: -12, confusion: -8 },
};

function toLocalized(text: string, currentLocale: Locale): LocalizedText {
  return {
    hu: currentLocale === 'hu' ? text : text,
    en: currentLocale === 'en' ? text : text,
    de: currentLocale === 'de' ? text : text,
  };
}

export class DynamicScenarioManager {
  static createInitialScenario(archetype: ArchetypeDefinition, _locale: Locale): Scenario {
    const startNodeId = 'node_turn_0';
    const nextNodeId = 'node_turn_1';

    const starterCards: Card[] = [
      {
        cardId: 'c_start_pacing_0',
        category: 'PACING',
        text: {
          hu: 'Látom rajtad, hogy mekkora a feszültség a helyzet miatt.',
          en: 'I can see how much stress this situation is putting on you.',
          de: 'Ich sehe, wie sehr dich diese Situation unter Druck setzt.',
        },
        delta: CATEGORY_DELTAS.PACING,
        npcReaction: {
          hu: 'Az indulat egy pillanatra megtorpan.',
          en: 'The anger pauses for a brief moment.',
          de: 'Die Wut stockt für einen kurzen Moment.',
        },
        nextNodeId,
        debriefHint: {
          hu: 'A feszültség elismerése csökkenti az eszkalációt.',
          en: 'Acknowledging emotion lowers escalation.',
          de: 'Das Anerkennen von Gefühlen senkt die Eskalation.',
        },
      },
      {
        cardId: 'c_start_meta_0',
        category: 'META_MODEL',
        text: {
          hu: 'Pontosan melyik pont az, amit most azonnal tisztáznunk kell?',
          en: 'Which exact item do we need to clarify right now?',
          de: 'Welcher Punkt muss jetzt sofort geklärt werden?',
        },
        delta: CATEGORY_DELTAS.META_MODEL,
        npcReaction: {
          hu: 'A partner kénytelen a konkrétumokra gondolni.',
          en: 'Partner is forced to reflect on specific facts.',
          de: 'Partner muss über konkrete Fakten nachdenken.',
        },
        nextNodeId,
        debriefHint: {
          hu: 'A fókuszált kérdés kizökkenti a partnert a vádaskodásból.',
          en: 'Focused questions break general accusations.',
          de: 'Gezielte Fragen stoppen pauschale Anschuldigungen.',
        },
      },
      {
        cardId: 'c_start_defense_0',
        category: 'DEFENSE',
        text: {
          hu: 'Miért mindig engem támadsz, amikor probléma van?',
          en: 'Why do you always blame me whenever there is an issue?',
          de: 'Warum greifst du immer mich an, wenn es Probleme gibt?',
        },
        delta: CATEGORY_DELTAS.DEFENSE,
        npcReaction: {
          hu: 'A partner még hangosabban vág vissza.',
          en: 'Partner snaps back even louder.',
          de: 'Partner reagiert noch lauter.',
        },
        nextNodeId,
        debriefHint: {
          hu: 'A visszatámadás azonnali eszkalációt vált ki.',
          en: 'Defensiveness triggers immediate escalation.',
          de: 'Verteidigung führt zu sofortiger Eskalation.',
        },
      },
    ];

    const initialNode: ScenarioNode = {
      nodeId: startNodeId,
      branch: 'main',
      tone: archetype.initialTone,
      npcStatement: archetype.initialStatement,
      availableCards: starterCards,
    };

    return {
      $schema: 'https://aikido-game.internal/schemas/v1/scenario.json',
      schemaVersion: '1.0',
      id: `scen_dynamic_${archetype.id}`,
      contentVersion: 1,
      title: archetype.role,
      summary: archetype.coreConflict,
      briefing: archetype.coreConflict,
      difficulty: 'INTERMEDIATE',
      personas: ['P1_MANAGER'],
      npc: {
        name: archetype.name,
        role: archetype.role,
      },
      variables: {},
      initialState: { ...archetype.initialMetrics },
      startNodeId,
      nodes: [initialNode],
    };
  }

  static appendGeneratedNode(
    scenario: Scenario,
    generatedNode: AiGeneratedNode,
    turnIndex: number,
    locale: Locale
  ): ScenarioNode {
    const currentNodeId = `node_turn_${turnIndex}`;
    const nextNodeId = `node_turn_${turnIndex + 1}`;

    const cards: Card[] = generatedNode.cards.map((aiCard: AiGeneratedCard, idx: number) => {
      const delta = CATEGORY_DELTAS[aiCard.category] || CATEGORY_DELTAS.DEFENSE;
      return {
        cardId: `c_${currentNodeId}_${idx}`,
        category: aiCard.category,
        text: toLocalized(aiCard.text, locale),
        delta,
        npcReaction: toLocalized(generatedNode.npcReaction, locale),
        nextNodeId,
        debriefHint: toLocalized(aiCard.debriefHint, locale),
      };
    });

    const node: ScenarioNode = {
      nodeId: currentNodeId,
      branch: 'main',
      tone: generatedNode.nextTone,
      npcStatement: toLocalized(generatedNode.nextStatement, locale),
      availableCards: cards,
    };

    // Replace if node with this ID already exists, otherwise push
    const existingIdx = scenario.nodes.findIndex((n) => n.nodeId === currentNodeId);
    if (existingIdx >= 0) {
      scenario.nodes[existingIdx] = node;
    } else {
      scenario.nodes.push(node);
    }

    return node;
  }

  static createFallbackNode(
    scenario: Scenario,
    turnIndex: number,
    locale: Locale
  ): ScenarioNode {
    const fallbackNode: AiGeneratedNode = {
      npcReaction:
        locale === 'en'
          ? 'Partner pauses, holding their breath.'
          : locale === 'de'
            ? 'Partner hält kurz inne und atmet tief durch.'
            : 'A partner megáll egy pillanatra, mély levegőt vesz.',
      nextStatement:
        locale === 'en'
          ? 'We still need to resolve this now. What is your proposal?'
          : locale === 'de'
            ? 'Wir müssen das jetzt trotzdem klären. Was ist dein Vorschlag?'
            : 'Ezt akkor is meg kell most oldanunk. Mi a javaslatod?',
      nextTone: 'TENSE',
      cards: [
        {
          category: 'PACING',
          text:
            locale === 'en'
              ? 'I hear your urgency and I am ready to solve this.'
              : locale === 'de'
                ? 'Ich höre die Dringlichkeit und bin bereit zur Lösung.'
                : 'Hallom a sürgősséget, és kész vagyok a megoldásra.',
          debriefHint:
            locale === 'en'
              ? 'Validating urgency keeps communication open.'
              : locale === 'de'
                ? 'Dringlichkeit anerkennen hält das Gespräch offen.'
                : 'A sürgősség elismerése nyitva tartja a kommunikációt.',
        },
        {
          category: 'META_MODEL',
          text:
            locale === 'en'
              ? 'What is the most critical item we can finalize today?'
              : locale === 'de'
                ? 'Was ist der wichtigste Punkt, den wir heute festlegen können?'
                : 'Mi a legfontosabb pont, amit ma le tudunk zárni?',
          debriefHint:
            locale === 'en'
              ? 'Clarifying items directs energy to concrete steps.'
              : locale === 'de'
                ? 'Punkte klären lenkt Energie auf konkrete Schritte.'
                : 'A pontok tisztázása a konkrét lépésekre tereli az energiát.',
        },
        {
          category: 'ATTACK',
          text:
            locale === 'en'
              ? 'Stop pressuring me when I am doing my best!'
              : locale === 'de'
                ? 'Hör auf, mich unter Druck zu setzen, ich tue mein Bestes!'
                : 'Ne helyezz rám nyomást, amikor mindent megteszek!',
          debriefHint:
            locale === 'en'
              ? 'Counter-accusations re-escalate tension.'
              : locale === 'de'
                ? 'Gegenangriffe lassen die Spannung wieder steigen.'
                : 'A visszatámadás újra felkorbácsolja az indulatokat.',
        },
      ],
    };

    return this.appendGeneratedNode(scenario, fallbackNode, turnIndex, locale);
  }
}
