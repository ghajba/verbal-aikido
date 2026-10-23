---
title: 'Verbal Aikido: An In-Browser, Privacy-First AI Sparring Agent for Conflict De-escalation'
published: false
description: 'A Serious Game PWA combining WebGPU local LLMs and Bring-Your-Own-AI for endless interactive de-escalation practice.'
tags: hf26challenge, ai, opensource, webdev, pwa
canonical_url: https://ghajba.github.io/verbal-aikido/
cover_image: https://raw.githubusercontent.com/ghajba/verbal-aikido/main/public/icons/icon-512.png
---

_This is a submission for the [Hacktoberfest 2026 Week 3: Open-Source AI Challenge](https://dev.to/challenges/hacktoberfest-week3-2026-10-19)._

---

## 1. What I Built

Most interpersonal and leadership conflicts escalate not because people lack good intentions, but because in the heat of a high-pressure moment, the human nervous system defaults to reactive defense (_"It's not my fault, the requirements were unclear!"_) or counter-attack (_"Why didn't you review the code earlier?!"_).

**[Verbal Aikido: The Empathy Firewall](https://ghajba.github.io/verbal-aikido/)** is an open-source, mobile-first Serious Game Progressive Web App designed to train somatic composure and de-escalation habits under emotional pressure.

While the original version relied on four handcrafted static scenarios, human conversations branch unpredictably. For Week 3 of Hacktoberfest, I built an **incremental, turn-by-turn dynamic AI sparring agent** that provides endless replayability while respecting privacy, performance, and game balance.

### Key Capabilities

- **100% In-Browser & Private (WebLLM + WebGPU):** Run open-weights models (`SmolLM2-1.7B-Instruct`, `Llama-3.2`) directly on the user's GPU using WebLLM in a dedicated Web Worker. Zero text, audio, or game metrics ever leave the client.
- **Bring-Your-Own-AI (BYO-Key):** Direct client-to-endpoint integration for Google Gemini 3.8 Flash, Anthropic Claude 5.5 Sonnet, OpenAI GPT-5-mini, OpenRouter, and local Ollama (`http://localhost:11434`). Keys stay strictly in browser local storage.
- **Strict Psychophysiological Guardrails:** The LLM does not generate freeform fluff. It operates within a strict JSON Schema, outputting NPC emotional state, next verbal provocation, and 3 balanced response cards.
- **Mathematical Delimiters:** Card categories map to deterministic formulas controlling **Partner Escalation ($E$)**, **Player Grounding / Emotional HP ($F$)**, and **Cognitive Breakthrough ($K$)**.
- **Latency Hiding:** While the resolution animations run, the engine pre-fetches the next AI turn in the background. If a network blip or WebGPU crash occurs, an instant deterministic fallback keeps the player in the flow.

---

## 2. Live Demo & Source Code

- 🎮 **Play the Live PWA:** [https://ghajba.github.io/verbal-aikido/](https://ghajba.github.io/verbal-aikido/)
- 💻 **Source Code (GitHub):** [https://github.com/ghajba/verbal-aikido](https://github.com/ghajba/verbal-aikido)
- 📜 **Architecture Blueprint:** See [`Verbalis_Aikido_AI_Architecture.md`](https://github.com/ghajba/verbal-aikido/blob/main/Verbalis_Aikido_AI_Architecture.md) in the repository.

---

## 3. Architecture Deep-Dive

```
┌────────────────────────────────────────────────────────┐
│                   Preact UI + Signals                  │
│       HomeScreen ──> BriefingScreen ──> GameScreen     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                    GameController                      │
│     • Latency hiding pre-fetch during RESOLUTION       │
│     • Mathematical metric recalculation (E, F, K)      │
│     • Fallback node injector if provider errors        │
└──────────────┬────────────────────────────┬────────────┘
               │                            │
               ▼                            ▼
  ┌─────────────────────────┐  ┌─────────────────────────┐
  │   Local WebLLM Worker   │  │   ByoKeyProvider        │
  │   (WebGPU / SmolLM2)    │  │   (Gemini, Claude, GPT) │
  │   100% Offline/Confid.  │  │   Direct CORS Client    │
  └─────────────────────────┘  └─────────────────────────┘
```

### 3.1 Keeping the Bundle Tiny (< 120 KB gzip)

A common pitfall with WebLLM is bloating the main application bundle. To prevent this:

1. All AI worker logic is isolated into `src/ai/worker/webLlmWorker.ts`.
2. Heavy libraries (`@mlc-ai/web-llm`) are imported dynamically via `/* @vite-ignore */`.
3. The initial bundle weighs just **116.13 KB gzip**, passing strict PWA performance budgets with flying colors.

### 3.2 Dynamic Turn Prompting with Guardrails

Every turn passes a structured context object (`AiTurnContext`) containing:

- NPC Archetype (`angry_pm`, `toxic_reviewer`, `angry_customer`)
- Current metrics: $E$ (Escalation), $F$ (Grounding), $K$ (Confusion)
- Conversation history & momentum
- User language (`hu`, `en`, `de`)

The LLM returns strict JSON matching:

```typescript
interface AiGeneratedNode {
  npcReaction: string;
  nextStatement: string;
  nextTone: 'ANGRY' | 'DEFENSIVE' | 'PASSIVE_AGGRESSIVE' | 'CONFUSED' | 'CONSTRUCTIVE';
  cards: [
    { category: 'PACING'; text: string; debriefHint: string },
    { category: 'META_MODEL'; text: string; debriefHint: string },
    { category: 'REFRAMING' | 'DEFENSE' | 'ATTACK'; text: string; debriefHint: string },
  ];
}
```

The engine then binds strict mathematical formulas to each category:

- **Pacing:** $\Delta E = -10, \Delta F = +8, \Delta K = +6$
- **Meta-Model Question:** $\Delta E = -4, \Delta F = +4, \Delta K = +20$
- **Reframing:** $\Delta E = -8, \Delta F = +10, \Delta K = +14$
- **Reactive Defense:** $\Delta E = +12, \Delta F = -8, \Delta K = -2$
- **Counter-Attack:** $\Delta E = +20, \Delta F = -12, \Delta K = -8$

---

## 4. Test Suite & Reliability

Every module is rigorously tested:

- **314 Unit Tests** in Vitest with **99.1% statement coverage** and **95.4% branch coverage**.
- **Playwright E2E Suite** validating mobile touch and keyboard navigation across Chromium and desktop viewports.
- **PWA Manifest & Asset Integrity Audit** verifying offline service worker registration.

```bash
# Run unit tests and coverage
npm test

# Run end-to-end user journeys
npm run test:e2e

# Run PWA bundle size check
npm run test:pwa
```

---

## 5. What's Next

- **Phase 2 (Free-Form Speech/Text):** Allowing users to speak or type their own response, with real-time NLP classification into verbal aikido categories.
- **Custom Archetype Creator:** Letting teams create specialized conflict scenarios (e.g. salary negotiations, incident post-mortems).

Give it a spin at [https://ghajba.github.io/verbal-aikido/](https://ghajba.github.io/verbal-aikido/) and let me know your thoughts in the comments!
