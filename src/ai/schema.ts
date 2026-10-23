import type { CardCategory, Tone } from '../content/types';
import type { AiGeneratedCard, AiGeneratedNode } from './types';

export const VALID_TONES: readonly Tone[] = [
  'CALM',
  'TENSE',
  'ANGRY',
  'FURIOUS',
  'SARCASTIC',
  'COLD',
] as const;

export const VALID_CATEGORIES: readonly CardCategory[] = [
  'PACING',
  'META_MODEL',
  'REFRAMING',
  'DEFENSE',
  'ATTACK',
] as const;

export const AI_NODE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  name: 'AiGeneratedNode',
  type: 'object',
  required: ['npcReaction', 'nextStatement', 'nextTone', 'cards'],
  additionalProperties: false,
  properties: {
    npcReaction: {
      type: 'string',
      description: 'NPC immediate reaction to the player previous response.',
    },
    nextStatement: {
      type: 'string',
      description: 'The next attacking or continuing statement spoken by the NPC.',
    },
    nextTone: {
      type: 'string',
      enum: ['CALM', 'TENSE', 'ANGRY', 'FURIOUS', 'SARCASTIC', 'COLD'],
      description: 'The emotional tone of the NPC statement.',
    },
    cards: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      description: 'Available verbal aikido response cards for the player hand.',
      items: {
        type: 'object',
        required: ['category', 'text', 'debriefHint'],
        additionalProperties: false,
        properties: {
          category: {
            type: 'string',
            enum: ['PACING', 'META_MODEL', 'REFRAMING', 'DEFENSE', 'ATTACK'],
            description: 'Aikido or reactive category of the response card.',
          },
          text: {
            type: 'string',
            description: 'The spoken phrase the player would say.',
          },
          debriefHint: {
            type: 'string',
            description: 'Short coaching rationale on why this technique helps or escalates.',
          },
        },
      },
    },
  },
} as const;

export function validateAiNode(raw: unknown): AiGeneratedNode {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI generation result is not an object');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.npcReaction !== 'string' || !obj.npcReaction.trim()) {
    throw new Error('Missing or empty npcReaction in AI output');
  }

  if (typeof obj.nextStatement !== 'string' || !obj.nextStatement.trim()) {
    throw new Error('Missing or empty nextStatement in AI output');
  }

  const rawTone = String(obj.nextTone || '').toUpperCase();
  const nextTone: Tone = VALID_TONES.includes(rawTone as Tone) ? (rawTone as Tone) : 'TENSE';

  if (!Array.isArray(obj.cards) || obj.cards.length < 3) {
    throw new Error(
      `AI output must contain at least 3 cards, got ${Array.isArray(obj.cards) ? obj.cards.length : 0}`
    );
  }

  const validatedCards: AiGeneratedCard[] = [];

  for (let i = 0; i < obj.cards.length; i++) {
    const rawCard = obj.cards[i];
    if (!rawCard || typeof rawCard !== 'object') {
      continue;
    }
    const cardObj = rawCard as Record<string, unknown>;
    const rawCategory = String(cardObj.category || '').toUpperCase();
    const category: CardCategory = VALID_CATEGORIES.includes(rawCategory as CardCategory)
      ? (rawCategory as CardCategory)
      : 'DEFENSE';

    const text = typeof cardObj.text === 'string' ? cardObj.text.trim() : '';
    const debriefHint = typeof cardObj.debriefHint === 'string' ? cardObj.debriefHint.trim() : '';

    if (!text) {
      continue;
    }

    validatedCards.push({
      category,
      text,
      debriefHint: debriefHint || text,
    });
  }

  if (validatedCards.length < 3) {
    throw new Error(`Could not extract at least 3 valid cards from AI output`);
  }

  return {
    npcReaction: obj.npcReaction.trim(),
    nextStatement: obj.nextStatement.trim(),
    nextTone,
    cards: validatedCards,
  };
}
