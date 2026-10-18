export type Locale = 'hu' | 'en' | 'de';
export const LOCALES: Locale[] = ['hu', 'en', 'de'];
export type LocalizedText = Record<Locale, string>; // all three keys required, non-empty

export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type CardCategory = 'PACING' | 'META_MODEL' | 'REFRAMING' | 'DEFENSE' | 'ATTACK';
export type Tone = 'CALM' | 'TENSE' | 'ANGRY' | 'FURIOUS' | 'SARCASTIC' | 'COLD';
export type Branch = 'main' | 'crisis';
export type PersonaId = 'P1_MANAGER' | 'P2_FRONTLINE';

export interface MetricTriple {
  escalation: number; // E
  grounding: number; // F
  confusion: number; // K
}

export interface Card {
  cardId: string; // unique within the scenario, /^c_[a-z0-9_]+$/
  category: CardCategory;
  text: LocalizedText; // may contain {npc_name}, {trigger_word}, other declared vars
  delta: MetricTriple; // integers, each in [-50, 50]; language-neutral
  npcReaction: LocalizedText; // interpolated
  nextNodeId: string | null; // null = terminal after this card
  debriefHint?: LocalizedText; // coaching note shown in turn-by-turn debrief
}

export interface ScenarioNode {
  nodeId: string; // unique, /^[a-z0-9_]+$/
  branch?: Branch; // default "main"
  tone: Tone;
  npcStatement: LocalizedText;
  variables?: Record<string, LocalizedText>; // overrides scenario variables for this node
  availableCards: Card[]; // pool, length >= 3
}

export interface Scenario {
  $schema: string; // "https://aikido-game.internal/schemas/v1/scenario.json"
  schemaVersion: '1.0';
  id: string; // /^scen_[a-z0-9_]+$/, equals file name without .json
  contentVersion: number; // integer >= 1, bump on any content change in any locale
  title: LocalizedText;
  summary: LocalizedText; // 1-2 sentences for the scenario list
  briefing: LocalizedText; // situation description shown before start
  difficulty: Difficulty;
  personas: PersonaId[]; // >= 1
  npc: { name: LocalizedText; role: LocalizedText }; // name localized for name order
  variables: Record<string, LocalizedText>; // e.g. { "trigger_word": { "hu": "határidő", ... } }
  decisionTimeLimitSec?: number; // D15
  initialState: MetricTriple;
  startNodeId: string;
  nodes: ScenarioNode[];
}

export interface CatalogEntry {
  id: string;
  file: string; // relative to /scenarios/
  contentVersion: number;
  title: LocalizedText;
  summary: LocalizedText;
  difficulty: Difficulty;
  personas: PersonaId[];
  order: number; // display order inside same persona/difficulty group
}

export interface Catalog {
  schemaVersion: '1.0';
  scenarios: CatalogEntry[];
}
