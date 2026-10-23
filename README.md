# Verbal Aikido: The Empathy Firewall

> A mobile-first, micro-interaction Serious Game Progressive Web App (PWA) conditioning de-escalation and assertive communication.

🎮 **Live Demo:** [Play Verbal Aikido on GitHub Pages](https://ghajba.github.io/verbal-aikido/)

🌐 **Languages:** [English](README.md) | [Magyar](README.hu.md) | [Deutsch](README.de.md)

[![Play Game](https://img.shields.io/badge/Play-Live%20Demo-brightgreen?logo=googlechrome&logoColor=white)](https://ghajba.github.io/verbal-aikido/)
[![CI Pipeline](https://github.com/ghajba/verbal-aikido/actions/workflows/ci.yml/badge.svg)](https://github.com/ghajba/verbal-aikido/actions/workflows/ci.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=github-sponsors)](https://github.com/sponsors/ghajba)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: 24 LTS](https://img.shields.io/badge/Node-24%20LTS-green.svg)](.nvmrc)

---

## 1. Overview & Value Proposition

**Verbal Aikido: The Empathy Firewall** is a gamified psychophysiological simulation designed to condition de-escalation communication in workplace and personal interactions. Unlike traditional passive training, the application trains the player to respond to verbal aggression or emotional manipulation without succumbing to reactive defense or aggressive counter-attacks. Instead, players practice assertive somatic grounding and hypnosystemic questioning techniques (pacing, emotional validation, meta-model clarification, reframing) to steer heated conflicts toward constructive outcomes.

### Target Personas

- **P1: Stressed Leader / Project Manager (30–45 yrs):** Handles tight deadlines, angry stakeholders, and reactive team members while keeping meetings structured and composed.
- **P2: Frontline Customer Care Specialist (22–35 yrs):** Handles real-time complaints with agitated customers, de-escalating incidents without experiencing personal mental burnout.

---

## 2. Gameplay & Mathematical Model

The game simulates discrete turn-based interactions (3–7 micro-attacks per scenario). Each turn presents the player with a hand of 3 cards drawn with guaranteed balance (at least one constructive card and at least one reactive trap).

### Dynamic Metrics

- **Partner Escalation Level ($E \in [0, 100]$):** Starting level: 40–70. If it reaches 100: **Rupture / Loss**.
- **Player Grounding / Emotional HP ($F \in [0, 100]$):** Starting level: 100. If it reaches 0: **Burnout Freeze / Loss**.
- **Cognitive Confusion / Trance Index ($K \in [0, 100]$):** Starting level: 0. If it reaches 80: **Cognitive Breakthrough / Victory**.
- **Escalation Momentum ($M_{eszk} \in [0, 4]$):** Consecutive reactive cards amplify escalation accumulation.

### Card Categories

1. **PACING:** Emotional validation without necessarily agreeing ($\Delta E < 0, \Delta F > 0, \Delta K > 0$).
2. **META_MODEL:** Precision questions resolving deletions, distortions, and generalizations ($\Delta K \gg 0$).
3. **REFRAMING:** Aligning around a higher shared intent and constructive forward goals.
4. **DEFENSE:** Excuse-making and justifying (reactive trap).
5. **ATTACK:** Counter-accusation and personal attacks (reactive trap).

---

## 3. System Architecture & Tech Stack

The application is built on a 100% client-side, offline-first PWA architecture:

- **UI & Reactivity:** [Preact](https://preactjs.com/) 10.x & [`@preact/signals`](https://github.com/preactjs/signals) (zero-overhead fine-grained reactive state).
- **Type Safety:** TypeScript 5.x (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Build Tool:** [Vite](https://vite.dev/) with `vite-plugin-pwa` (Workbox Service Worker).
- **Persistence:** IndexedDB with transparent LocalStorage fallback.
- **Sensory Feedback:**
  - Synthesized **Web Audio API** (clean sine waves generated dynamically; zero external sound assets).
  - W3C **Vibration API** for mobile haptics (silent graceful fallback on desktop/iOS).
- **Deterministic Pure Engine:** Seeded `mulberry32` PRNG for complete determinism, instant replayability, and verifiable unit tests.

---

## 4. Dynamic AI Sparring (DEV.to Open-Source AI Challenge 2026)

To overcome the finite replayability of static decision trees, **Verbal Aikido** introduces a hybrid turn-by-turn AI sparring agent:

- **100% In-Browser & Private (WebLLM + WebGPU):** Run local LLMs (`SmolLM2-1.7B-Instruct`, `Llama-3.2`) entirely inside the browser using WebGPU. No audio, text, or metrics ever leave the client. Ideal for practicing sensitive, confidential organizational conflicts.
- **Bring-Your-Own-AI (BYO-Key):** Direct client-to-API connectivity for modern cloud models:
  - Google Gemini 3.8 Flash
  - Anthropic Claude 5.5 Sonnet
  - OpenAI GPT-5-mini
  - OpenRouter & local Ollama (`http://localhost:11434`)
    All API keys reside exclusively in the player's local device storage.
- **Strict Psychological & Mathematical Guardrails:** LLM outputs are validated against a strict JSON schema (`src/ai/schema.ts`). Card categories map to deterministic mathematical deltas ($\Delta E, \Delta F, \Delta K$), preserving game balance and proven NLP coaching principles.
- **Latency Hiding & Fallback Resilience:** The game engine pre-fetches the next AI turn during resolution animations. If WebGPU or network connectivity fails, the engine instantly supplies a deterministic fallback node without interrupting gameplay.
- **Multilingual (i18n):** English (primary codebase & documentation), Hungarian, and German with runtime language switching and inline localized JSON scenarios.
- **Testing:** [Vitest](https://vitest.dev/) (unit tests with engine coverage gates) & [Playwright](https://playwright.dev/) (E2E, desktop, mobile, a11y, and PWA checks).

---

## 4. Repository Layout

```
verbal-aikido/
├── .github/
│   ├── workflows/ci.yml         # GitHub Actions pipeline (validate, unit, build, e2e, pwa, deploy)
│   └── FUNDING.yml              # GitHub Sponsors configuration
├── schemas/                     # JSON Schemas (scenario.schema.json, catalog.schema.json)
├── scripts/                     # Scenario validator and CI gate scripts
├── public/
│   ├── scenarios/               # Localized scenario JSON files and catalog
│   ├── icons/                   # PWA icons
│   └── favicon.svg              # Aikido swirl SVG master icon
├── src/
│   ├── app/                     # Controller (GameController, Router, Settings, Clock)
│   ├── engine/                  # Pure, deterministic game engine (FSM, metrics, RNG, hand)
│   ├── content/                 # Scenario models and catalog loader
│   ├── storage/                 # IndexedDB & LocalStorage drivers
│   ├── telemetry/               # Offline event buffer and optional sync stub
│   ├── feedback/                # Web Audio synthesizer and Vibration haptics
│   ├── ui/                      # Preact screens, components, hooks, and responsive styles
│   └── i18n/                    # English, Hungarian, German string tables
└── tests/
    ├── spec/                    # Gherkin specification feature files (@SBE IDs)
    ├── unit/                    # Vitest unit tests
    └── e2e/                     # Playwright multi-browser test suite
```

---

## 5. Built-in Scenarios (v1.0)

1. `scen_angry_pm_deadline_001`: **The Blown Sprint & The Furious Project Manager** (P1, Intermediate)
2. `scen_stakeholder_scope_002`: **Scope Creep on Monday Morning** (P1, Beginner)
3. `scen_customer_refund_003`: **The Missing Refund Complaint** (P2, Intermediate)
4. `scen_customer_gaslight_004`: **"I Never Said That!"** (P2, Advanced, 15s stress timer)

---

## 6. Getting Started & Development

### Prerequisites

- **Node.js**: `24.x LTS` (see [`.nvmrc`](.nvmrc))
- **npm**: `10.x` or newer

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

### Scenario Validation

```bash
npm run validate:scenarios
```

### Running Tests

```bash
# Run unit tests with code coverage
npm test

# Run Playwright E2E tests
npm run test:e2e

# Run PWA and offline verification
npm run test:pwa
```

### Production Build & Bundle Size Gate

```bash
npm run build
```

---

## 7. Support & Sponsorship

If you find this serious game, its architecture, or its training techniques valuable, you can support its ongoing development:

👉 **[Sponsor on GitHub](https://github.com/sponsors/ghajba)** 💖

---

## 8. License

Distributed under the [MIT License](LICENSE).
