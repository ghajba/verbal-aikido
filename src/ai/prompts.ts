import type { Locale } from '../content/types';
import type { AiTurnContext, ArchetypeDefinition } from './types';

export const ARCHETYPES: Record<string, ArchetypeDefinition> = {
  angry_pm: {
    id: 'angry_pm',
    name: {
      hu: 'Kovács Péter',
      en: 'Peter Smith',
      de: 'Peter Meier',
    },
    role: {
      hu: 'Stresszelt Projektmenedzser',
      en: 'Stressed Project Manager',
      de: 'Gestresster Projektleiter',
    },
    coreConflict: {
      hu: 'A release holnap esedékes, a vezetőség számonkéri a csúszást, és fél a felelősségre vonástól.',
      en: 'Release is due tomorrow, executive leadership demands answers, and he fears taking the blame.',
      de: 'Der Release ist morgen fällig, die Geschäftsführung macht Druck und er fürchtet die Verantwortung.',
    },
    personality: {
      hu: 'Követelőző, közvetlen, feszült, a számonkérést azonnali visszatámadásként éli meg.',
      en: 'Demanding, impatient, stressed, perceives any hesitation as personal obstruction.',
      de: 'Fordernd, ungeduldig, gestresst, empfindet Zögern als persönliche Sabotage.',
    },
    initialStatement: {
      hu: 'Nem érdekel a magyarázkodás! A demó holnap reggel kilenckor lesz, és még mindig tele van hibával a rendszer! Hogy képzeltétek ezt?!',
      en: 'I do not care about excuses! The demo is tomorrow at 9 AM and the system is still riddled with bugs! What were you thinking?!',
      de: 'Ausreden interessieren mich nicht! Die Demo ist morgen früh um neun und das System ist voller Fehler! Was habt ihr euch gedacht?!',
    },
    initialTone: 'ANGRY',
    initialMetrics: { escalation: 65, grounding: 100, confusion: 0 },
  },

  toxic_reviewer: {
    id: 'toxic_reviewer',
    name: {
      hu: 'Nagy Zoltán',
      en: 'Alex Drake',
      de: 'Stefan Bauer',
    },
    role: {
      hu: 'Senior Fejlesztő / Code Reviewer',
      en: 'Senior Developer / Code Reviewer',
      de: 'Senior Entwickler / Code Reviewer',
    },
    coreConflict: {
      hu: 'A pull requestet apró formai és stilisztikai hibák miatt blokkolja flegma, lekezelő stílusban.',
      en: 'Blocking the pull request over pedantic formatting and style preferences in a condescending manner.',
      de: 'Blockiert den Pull Request wegen kleinlicher Formatierungen in herablassendem Ton.',
    },
    personality: {
      hu: 'Passzív-agresszív, szarkasztikus, szakmai fölényét fitogtatja.',
      en: 'Passive-aggressive, sarcastic, asserts technical superiority.',
      de: 'Passiv-agressiv, sarkastisch, stellt fachliche Überlegenheit zur Schau.',
    },
    initialStatement: {
      hu: 'Hát ez a kód... inkább nem is mondok semmit. Komolyan azt hitted, hogy ezt a szemetet átengedem productionbe? Tanulj meg előbb tesztet írni.',
      en: 'Well, this code... I would rather not say anything. Did you seriously think I would let this garbage pass to production? Learn to write tests first.',
      de: 'Also dieser Code... dazu sage ich lieber nichts. Dachtest du ernsthaft, ich lasse diesen Müll in die Produktion? Lerne erst mal Tests schreiben.',
    },
    initialTone: 'SARCASTIC',
    initialMetrics: { escalation: 55, grounding: 100, confusion: 0 },
  },

  angry_customer: {
    id: 'angry_customer',
    name: {
      hu: 'Tóth Andrea',
      en: 'Sarah Jenkins',
      de: 'Andrea Schneider',
    },
    role: {
      hu: 'Felindult Ügyfél',
      en: 'Enraged Key Customer',
      de: 'Aufgebrachte Kundin',
    },
    coreConflict: {
      hu: 'A megrendelt szolgáltatás hibásan indult el, az ügyfélszolgálat elakadt, és perrel fenyegetőzik.',
      en: 'Purchased service had severe outages, front desk support stalled, and she threatens legal action.',
      de: 'Gebuchte Dienstleistung hatte schwere Ausfälle, Support war unzureichend und sie droht mit Anwalt.',
    },
    personality: {
      hu: 'Érzelmileg felindult, kiabál, azonnali garanciát és felelőst követel.',
      en: 'Emotionally inflamed, demanding, requires immediate compensation and escalation.',
      de: 'Emotional aufgebracht, lautstark, verlangt sofortige Entschädigung und Konsequenzen.',
    },
    initialStatement: {
      hu: 'Azonnal hívja az igazgatót! Hetek óta csak hitegetnek, a pénzemet levonták, de semmit sem kaptam! Ez közönséges csalás, beperelem a cégüket!',
      en: 'Get your manager on the phone right now! You have been giving me the runaround for weeks, took my money and delivered nothing! This is outright fraud!',
      de: 'Holen Sie sofort Ihren Vorgesetzten an den Apparat! Seit Wochen werde ich nur vertröstet, mein Geld wurde abgebucht, aber nichts geliefert! Das ist Betrug!',
    },
    initialTone: 'FURIOUS',
    initialMetrics: { escalation: 75, grounding: 100, confusion: 0 },
  },
};

const SYSTEM_PROMPTS: Record<Locale, string> = {
  hu: `Te a "Verbális Aikidó: The Empathy Firewall" játék interaktív pszichológiai és narratív motorja vagy.
A feladatod egy munkahelyi vagy ügyfélkapcsolati vitapartner (NPC) valós idejű reakciójának és következő mondatának generálása, valamint 3 darab verbális aikidó válaszkártya előállítása a játékos számára.

A VERBÁLIS AIKIDÓ ALAPSZABÁLYAI:
1. NPC TÓNUSA ÉS REAKCIÓJA:
   - Ha a játékos PACING vagy REFRAMING kártyát játszott: az NPC feszültsége némileg enyhül, elbizonytalanodik vagy konstruktívabbá válik, de nem adja meg magát azonnal.
   - Ha a játékos META_MODEL kérdést tett fel: az NPC megakad, kénytelen a tényekre és konkrétumokra gondolni (Trance / Kognitív megakadás).
   - Ha a játékos DEFENSE vagy ATTACK csapdát játszott (visszatámadás, mentegetőzés): az NPC azonnal felcsattan, még agresszívabb vagy számonkérőbb lesz.

2. A 3 GENERÁLT KÁRTYA SZIGORÚ SZABÁLYAI (pontosan 3 kártya kell):
   - 1. kártya: [PACING] -> Érzelmi validálás és jelenlét, EGYETÉRTÉS NÉLKÜL. (pl. "Látom rajtad, hogy mekkora a feszültség...", "Hallom, hogy ez a határidő neked kulcsfontosságú...")
   - 2. kártya: [META_MODEL vagy REFRAMING] -> Meta-modell: tisztázó kérdés a törlésre, torzításra vagy általánosításra (pl. "Pontosan mi az a funkció, ami nélkül nem indulhat el a demó?") VAGY Reframing: a magasabb közös szándék beemelése.
   - 3. kártya: [DEFENSE vagy ATTACK] (Reaktív csapda) -> Magyarázkodás, felelősség áthárítása, vagy személyeskedő visszatámadás (pl. "Miért mindig rajtam kéred számon?", "Nem tehetek róla, ha a másik csapat késett!").

3. KIMENETI FORMÁTUM:
   - Szigorúan JSON formátum a megadott séma szerint (npcReaction, nextStatement, nextTone, cards).
   - A nyelv kizárólag magyar legyen.`,

  en: `You are the interactive psychological narrative engine for the serious game "Verbal Aikido: The Empathy Firewall".
Your task is to generate the real-time reaction and next statement of a conflicted NPC sparring partner, and provide 3 distinct verbal aikido response cards for the player hand.

VERBAL AIKIDO RULES:
1. NPC REACTION AND TONE:
   - If player used PACING or REFRAMING: NPC tension softens slightly, reflects, or becomes more grounded, but does not surrender completely.
   - If player used META_MODEL: NPC cognitive trace disrupts generalization, forcing focus on specific facts.
   - If player fell into DEFENSE or ATTACK traps: NPC escalates, counter-attacks, becomes louder or more sarcastic.

2. THE 3 GENERATED CARDS (exactly 3 cards):
   - Card 1: [PACING] -> Emotional validation without agreeing to false blame. (e.g., "I hear how critical this milestone is for you...")
   - Card 2: [META_MODEL or REFRAMING] -> Meta-model precision question targeting generalizations OR Reframing to common positive intent.
   - Card 3: [DEFENSE or ATTACK] (Reactive trap) -> Defensiveness, passing blame, or counter-accusation.

3. OUTPUT FORMAT:
   - Strict JSON matching the schema (npcReaction, nextStatement, nextTone, cards).
   - Language must strictly be English.`,

  de: `Du bist die interaktive psychologische Narrative-Engine des Serious Games "Verbales Aikido: The Empathy Firewall".
Deine Aufgabe ist es, die Echtzeit-Reaktion und die nächste Aussage eines Konfliktpartners (NPC) zu generieren und 3 verbale Aikido-Antwortkarten für den Spieler bereitzustellen.

REGELN DES VERBALEN AIKIDO:
1. NPC REAKTION:
   - Konstruktive Spielerzüge (PACING, REFRAMING) deeskalieren die Spannung schrittweise.
   - META_MODEL hinterfragt Verallgemeinerungen und fordert Fakten ein.
   - Reaktive Fallen (DEFENSE, ATTACK) provozieren sofortige Eskalation.

2. DIE 3 ANTWORTKARTEN (genau 3 Karten):
   - Karte 1: [PACING] -> Emotionale Validierung ohne Schuldeingeständnis.
   - Karte 2: [META_MODEL oder REFRAMING] -> Klärende Frage nach Fakten ODER gemeinsame Absicht hervorheben.
   - Karte 3: [DEFENSE oder ATTACK] -> Rechtfertigung, Schuldabwälzung oder Gegenangriff.

3. FORMAT:
   - Reines JSON gemäß Schema (npcReaction, nextStatement, nextTone, cards).
   - Sprache muss Deutsch sein.`,
};

export function buildTurnPrompt(ctx: AiTurnContext): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = SYSTEM_PROMPTS[ctx.locale] || SYSTEM_PROMPTS.hu;

  const historyLines =
    ctx.history.length === 0
      ? 'No prior turns.'
      : ctx.history
          .map(
            (h) =>
              `Turn ${h.turnIndex + 1}: NPC said: "${h.npcStatement}" -> Player played [${h.playerCategory}]: "${h.playerCardText}" (Resulting NPC tone: ${h.outcomeTone})`
          )
          .join('\n');

  const userPrompt = `
CURRENT SCENARIO CONTEXT:
- NPC Name: ${ctx.npcProfile.name}
- NPC Role: ${ctx.npcProfile.role}
- Core Conflict: ${ctx.npcProfile.coreConflict}
- Personality: ${ctx.npcProfile.personality}
- Language: ${ctx.locale}
- Turn index: ${ctx.turnIndex + 1}
- Current Metrics: Escalation=${ctx.currentMetrics.escalation}/100, Grounding=${ctx.currentMetrics.grounding}/100, Confusion=${ctx.currentMetrics.confusion}/100, Momentum=${ctx.momentum}

CONVERSATION HISTORY:
${historyLines}

TASK:
Generate the NPC immediate reaction, their next statement, their next emotional tone, and 3 fresh response cards for the player hand according to Verbal Aikido rules. Return pure JSON.
`.trim();

  return {
    systemPrompt,
    userPrompt,
  };
}
