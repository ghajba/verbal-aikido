import type { CardCategory, Locale, MetricTriple, Tone } from '../content/types';

export interface AiGeneratedCard {
  category: CardCategory;
  text: string;
  debriefHint: string;
}

export interface AiGeneratedNode {
  npcReaction: string;
  nextStatement: string;
  nextTone: Tone;
  cards: [AiGeneratedCard, AiGeneratedCard, AiGeneratedCard] | AiGeneratedCard[];
}

export interface TurnHistoryEntry {
  turnIndex: number;
  npcStatement: string;
  playerCardText: string;
  playerCategory: CardCategory;
  outcomeTone: Tone;
}

export interface AiTurnContext {
  archetypeId: string;
  npcProfile: {
    name: string;
    role: string;
    coreConflict: string;
    personality: string;
  };
  turnIndex: number;
  currentMetrics: MetricTriple;
  momentum: number;
  history: TurnHistoryEntry[];
  locale: Locale;
}

export interface ArchetypeDefinition {
  id: string;
  name: Record<Locale, string>;
  role: Record<Locale, string>;
  coreConflict: Record<Locale, string>;
  personality: Record<Locale, string>;
  initialStatement: Record<Locale, string>;
  initialTone: Tone;
  initialMetrics: MetricTriple;
}

export type AiProviderId = 'mock' | 'webllm' | 'byokey';
export type ByoServiceId = 'gemini' | 'claude' | 'openai' | 'openrouter' | 'ollama';

export interface AiProviderConfig {
  providerId: AiProviderId;
  byoService?: ByoServiceId;
  apiKey?: string;
  modelName?: string;
  baseUrl?: string;
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generateNextNode(ctx: AiTurnContext): Promise<AiGeneratedNode>;
}
