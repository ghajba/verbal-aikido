import type { AiGeneratedNode, AiProvider, AiTurnContext } from '../types';

export interface MockAiProviderOptions {
  delayMs?: number;
  shouldFail?: boolean;
}

export class MockAiProvider implements AiProvider {
  readonly id = 'mock' as const;
  readonly name = 'Mock Deterministic AI';

  private delayMs: number;
  private shouldFail: boolean;

  constructor(options: MockAiProviderOptions = {}) {
    this.delayMs = options.delayMs ?? 0;
    this.shouldFail = options.shouldFail ?? false;
  }

  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateNextNode(ctx: AiTurnContext): Promise<AiGeneratedNode> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      throw new Error('MockAiProvider intentional failure');
    }

    const lastMove = ctx.history[ctx.history.length - 1];
    const isConstructive =
      lastMove && (lastMove.playerCategory === 'PACING' || lastMove.playerCategory === 'REFRAMING');
    const isMeta = lastMove && lastMove.playerCategory === 'META_MODEL';

    if (ctx.locale === 'en') {
      return this.generateEnglishNode(ctx, isConstructive, isMeta);
    }
    if (ctx.locale === 'de') {
      return this.generateGermanNode(ctx, isConstructive, isMeta);
    }
    return this.generateHungarianNode(ctx, isConstructive, isMeta);
  }

  private generateHungarianNode(
    ctx: AiTurnContext,
    isConstructive?: boolean,
    isMeta?: boolean
  ): AiGeneratedNode {
    const turn = ctx.turnIndex + 1;

    if (isConstructive) {
      return {
        npcReaction: `${ctx.npcProfile.name} vállai kissé leereszkednek, hangja halkabbá válik.`,
        nextStatement: `Jó, látom, hogy te is próbálod egyben tartani a dolgokat, de akkor mi a konkrét terv a ${turn}. körre?`,
        nextTone: 'TENSE',
        cards: [
          {
            category: 'PACING',
            text: 'Megértem, hogy most azonnali garanciára van szükséged.',
            debriefHint: 'A feszültség további csillapítása érzelmi jelenléttel.',
          },
          {
            category: 'REFRAMING',
            text: 'A közös célunk, hogy ma stabil demót adjunk át a vezetőségnek.',
            debriefHint: 'A magasabb közös szándék beemelése összefogásra ösztönöz.',
          },
          {
            category: 'DEFENSE',
            text: 'Nem mondhatod, hogy nem dolgoztunk éjjel-nappal a feladaton!',
            debriefHint: 'A sértett mentegetőzés újra felbosszantja a partnert.',
          },
        ],
      };
    }

    if (isMeta) {
      return {
        npcReaction: `${ctx.npcProfile.name} megakad a kérdésen, tekintetét elfordítja és elgondolkodik.`,
        nextStatement:
          'Hát... elsősorban a bejelentkezési modul és az adatbázis-szinkronizáció hiányzik.',
        nextTone: 'CALM',
        cards: [
          {
            category: 'META_MODEL',
            text: 'Pontosan kinek van most hozzáférése a szinkronizációs logokhoz?',
            debriefHint: 'A pontos adatok felé terelés növeli a kognitív kontrollt.',
          },
          {
            category: 'PACING',
            text: 'Világos, ez a két pont valóban kritikus az induláshoz.',
            debriefHint: 'A tények validálása fenntartja a konstruktív légkört.',
          },
          {
            category: 'ATTACK',
            text: 'Akkor miért az egész rendszert szidod, ha csak két apróság hiányzik?',
            debriefHint: 'A számonkérés azonnal tönkreteszi a megszerzett fókuszt.',
          },
        ],
      };
    }

    // Default / Reactive reaction
    return {
      npcReaction: `${ctx.npcProfile.name} felcsattan és az asztalra csap.`,
      nextStatement: `Ezzel nem vagyunk előrébb! Nem tűröm a mellébeszélést a ${turn}. körben sem!`,
      nextTone: 'ANGRY',
      cards: [
        {
          category: 'PACING',
          text: 'Hallom a dühödet, és látom, hogy mekkora a tét számodra.',
          debriefHint: 'Az érzelmi elismerés megállítja a verbális lavinát.',
        },
        {
          category: 'META_MODEL',
          text: 'Mi az az egyetlen legfontosabb pont, amit ha ma megoldunk, megnyugodhatsz?',
          debriefHint: 'A fókusz szűkítése kizökkenti a partnert az elárasztottságból.',
        },
        {
          category: 'ATTACK',
          text: 'Ha te is ennyi energiát fektetnél a megoldásba a kiabálás helyett, már kész lennénk.',
          debriefHint: 'A visszatámadás garantált eszkalációs szakadást okoz.',
        },
      ],
    };
  }

  private generateEnglishNode(
    ctx: AiTurnContext,
    isConstructive?: boolean,
    isMeta?: boolean
  ): AiGeneratedNode {
    const turn = ctx.turnIndex + 1;

    if (isConstructive) {
      return {
        npcReaction: `${ctx.npcProfile.name} shoulders drop slightly, lowering their voice.`,
        nextStatement: `Fine, I see you are trying to keep things together, but what is our concrete plan for turn ${turn}?`,
        nextTone: 'TENSE',
        cards: [
          {
            category: 'PACING',
            text: 'I understand you need immediate certainty right now.',
            debriefHint: 'Further soothing tension with presence.',
          },
          {
            category: 'REFRAMING',
            text: 'Our shared goal is delivering a rock-solid demo to leadership today.',
            debriefHint: 'Invoking higher shared intent creates partnership.',
          },
          {
            category: 'DEFENSE',
            text: 'You cannot claim we have not been working around the clock!',
            debriefHint: 'Defensiveness reignites the conflict.',
          },
        ],
      };
    }

    if (isMeta) {
      return {
        npcReaction: `${ctx.npcProfile.name} pauses, caught off guard by the question, and looks away to reflect.`,
        nextStatement: 'Well... specifically the auth module and database sync are stalled.',
        nextTone: 'CALM',
        cards: [
          {
            category: 'META_MODEL',
            text: 'Who specifically has write access to the sync logs right now?',
            debriefHint: 'Directing toward precise facts deepens cognitive focus.',
          },
          {
            category: 'PACING',
            text: 'Understood, those two parts are genuinely critical for launch.',
            debriefHint: 'Validating real facts sustains collaboration.',
          },
          {
            category: 'ATTACK',
            text: 'Then why blame the entire system when it is just two small tasks?',
            debriefHint: 'Counter-attacking shatters cognitive rapport.',
          },
        ],
      };
    }

    return {
      npcReaction: `${ctx.npcProfile.name} snaps and raises their voice.`,
      nextStatement: `That does not solve anything! I will not tolerate excuses in turn ${turn}!`,
      nextTone: 'ANGRY',
      cards: [
        {
          category: 'PACING',
          text: 'I hear your frustration, and I see how high the stakes are for you.',
          debriefHint: 'Validating strong emotion halts verbal escalation.',
        },
        {
          category: 'META_MODEL',
          text: 'What is the single most urgent blocker we need resolved today?',
          debriefHint: 'Narrowing focus breaks through emotional flooding.',
        },
        {
          category: 'ATTACK',
          text: 'If you spent as much energy solving problems as you do shouting, we would be done.',
          debriefHint: 'Counter-attacking triggers an immediate rupture.',
        },
      ],
    };
  }

  private generateGermanNode(
    ctx: AiTurnContext,
    isConstructive?: boolean,
    isMeta?: boolean
  ): AiGeneratedNode {
    const turn = ctx.turnIndex + 1;

    if (isConstructive) {
      return {
        npcReaction: `${ctx.npcProfile.name} senkt die Schultern ein wenig, die Stimme wird ruhiger.`,
        nextStatement: `Gut, ich sehe, dass du dich bemühst, aber was ist der konkrete Plan für Runde ${turn}?`,
        nextTone: 'TENSE',
        cards: [
          {
            category: 'PACING',
            text: 'Ich verstehe, dass du jetzt sofortige Gewissheit brauchst.',
            debriefHint: 'Emotionale Präsenz beruhigt die Lage weiter.',
          },
          {
            category: 'REFRAMING',
            text: 'Unser gemeinsames Ziel ist eine fehlerfreie Demo für die Geschäftsleitung.',
            debriefHint: 'Die gemeinsame Absicht stärkt das Teamgefühl.',
          },
          {
            category: 'DEFENSE',
            text: 'Du kannst nicht behaupten, dass wir nicht rund um die Uhr gearbeitet hätten!',
            debriefHint: 'Rechtfertigung facht den Konflikt wieder an.',
          },
        ],
      };
    }

    if (isMeta) {
      return {
        npcReaction: `${ctx.npcProfile.name} stutzt kurz, überlegt und blickt nachdenklich zur Seite.`,
        nextStatement: 'Nun ja... vor allem das Login-Modul und der DB-Sync hängen fest.',
        nextTone: 'CALM',
        cards: [
          {
            category: 'META_MODEL',
            text: 'Wer genau hat im Moment Zugriff auf die Sync-Logs?',
            debriefHint: 'Faktenbezug vertieft die konstruktive Klärung.',
          },
          {
            category: 'PACING',
            text: 'Verstanden, diese beiden Punkte sind in der Tat entscheidend.',
            debriefHint: 'Bestätigung von Fakten erhält den Dialog aufrecht.',
          },
          {
            category: 'ATTACK',
            text: 'Warum machst du dann so ein Drama, wenn es nur um zwei Kleinigkeiten geht?',
            debriefHint: 'Gegenangriff zerstört den erreichten Fortschritt.',
          },
        ],
      };
    }

    return {
      npcReaction: `${ctx.npcProfile.name} wird laut und schlägt mit der Hand auf den Tisch.`,
      nextStatement: `Das hilft uns überhaupt nicht weiter! Ich dulde keine Ausreden in Runde ${turn}!`,
      nextTone: 'ANGRY',
      cards: [
        {
          category: 'PACING',
          text: 'Ich höre deine Frustration und sehe, wie viel für dich auf dem Spiel steht.',
          debriefHint: 'Validierung starker Gefühle stoppt die Eskalation.',
        },
        {
          category: 'META_MODEL',
          text: 'Was ist der eine kritische Punkt, den wir heute zuerst lösen müssen?',
          debriefHint: 'Eingrenzen des Problems befreit aus der Überforderung.',
        },
        {
          category: 'ATTACK',
          text: 'Wenn du so viel Energie in Lösungen stecken würdest wie ins Schreien, wären wir längst fertig.',
          debriefHint: 'Gegenangriff führt zum sofortigen Bruch.',
        },
      ],
    };
  }
}
