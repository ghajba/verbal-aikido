# Verbális Aikidó: The Empathy Firewall - Architecture and Implementation Specification

| Key | Value |
|---|---|
| Source document | `Verbalis_Aikido_PRD.pdf` (PRD v1.0.0 RC, 2026-10-13, approved for development) |
| This document | Architecture v1.0, 2026-10-14 |
| Audience | The developer or developer agent implementing the full solution |
| Product languages | Hungarian, English, German (all player-facing text, switchable at runtime). Code, identifiers, commits and this document: English |

This document turns the PRD into a complete build specification. Wherever the PRD is silent, vague or self-contradicting I made a decision and wrote it down in [Section 2](#2-decision-log-prd-gaps-and-how-they-are-resolved). The implementer should not need to ask anything: if something is not covered here, follow the closest existing rule and the "Ground rules" in Section 1.

## Table of contents

1. [Ground rules for the implementer](#1-ground-rules-for-the-implementer)
2. [Decision log: PRD gaps and how they are resolved](#2-decision-log-prd-gaps-and-how-they-are-resolved)
3. [Technology stack](#3-technology-stack)
4. [System architecture](#4-system-architecture)
5. [Repository and folder layout](#5-repository-and-folder-layout)
6. [Domain model and TypeScript types](#6-domain-model-and-typescript-types)
7. [Scenario JSON format, JSON Schema and validator](#7-scenario-json-format-json-schema-and-validator)
8. [Game engine: math model](#8-game-engine-math-model)
9. [Game engine: finite state machine](#9-game-engine-finite-state-machine)
10. [Hand drawing, branching and text interpolation](#10-hand-drawing-branching-and-text-interpolation)
11. [Timing, panic zone, RTO and the stress timer](#11-timing-panic-zone-rto-and-the-stress-timer)
12. [Persistence layer](#12-persistence-layer)
13. [Telemetry and the future sync endpoint](#13-telemetry-and-the-future-sync-endpoint)
14. [Haptics engine](#14-haptics-engine)
15. [Audio engine](#15-audio-engine)
16. [UI: screens, layout and interaction](#16-ui-screens-layout-and-interaction)
17. [Animation and rendering rules](#17-animation-and-rendering-rules)
18. [Accessibility](#18-accessibility)
19. [PWA, service worker and offline](#19-pwa-service-worker-and-offline)
20. [Performance budgets](#20-performance-budgets)
21. [Edge cases](#21-edge-cases)
22. [Content: scenario catalog](#22-content-scenario-catalog)
23. [UI string table (HU / EN / DE)](#23-ui-string-table-hu--en--de)
24. [Testing strategy](#24-testing-strategy)
25. [Build, CI and deployment](#25-build-ci-and-deployment)
26. [Implementation order](#26-implementation-order)
27. [Definition of Done checklist](#27-definition-of-done-checklist)
28. [Specification by example (Gherkin)](#28-specification-by-example-gherkin)

---

## 1. Ground rules for the implementer

1. Everything runs in the browser. No backend, no login, no third-party analytics, no CDN at runtime. The app must be fully playable in airplane mode after the first load.
2. No dialogue, card text, card delta value or scenario-specific number is allowed in TypeScript code. All of it lives in `public/scenarios/*.json`. No player-facing UI string is allowed in components either: every UI string comes from `src/i18n/` through `t()` (Section 23), in all three locales. Game-model constants (coefficients, thresholds, timings) live in exactly one file: `src/engine/constants.ts`.
3. The game engine (`src/engine/`) is pure TypeScript with no DOM, no `window`, no `Date.now()`, no `Math.random()`. Time and randomness are injected. This is what makes the engine deterministic, testable and replayable.
4. UI never mutates game state directly. UI dispatches events to the FSM, renders the state it gets back.
5. Every browser capability (Vibration, Web Audio, IndexedDB, `visibilitychange`, Wake Lock is NOT used) is feature-detected and degrades to a silent no-op. Nothing may throw to the user because a capability is missing.
6. Keep runtime dependencies to the list in Section 3. Adding a runtime dependency needs a measured bundle impact under the budget in Section 20.
7. Comments only for a non-obvious *why*. Names carry the *what*.

---

## 2. Decision log: PRD gaps and how they are resolved

The PRD leaves several points open. These are binding decisions for v1.

| # | PRD point | Problem | Decision |
|---|---|---|---|
| D1 | `M_eszk` momentum multiplier (§5) | Named, never defined. | `M_eszk` is an integer **escalation momentum** in `[0, 4]`. It counts consecutive reactive cards (`DEFENSE`, `ATTACK`). Playing a reactive card: `M = min(4, M + 1)`. Playing any constructive card (`PACING`, `META_MODEL`, `REFRAMING`): `M = 0`. The formula uses the **updated** `M` of the current turn. First reactive card therefore adds `+1.25` E, the fourth in a row adds `+5`. Starts at 0. |
| D2 | Order of evaluation of formulas | `F_next` uses `E_curr`. | All three formulas use the values from **before** the turn (`E_curr`, `F_curr`, `K_curr`). Compute all three, then assign. |
| D3 | Fractional values | `M × 1.25` and `E × 0.05` produce decimals. | Metrics are stored as numbers rounded to 2 decimals after each turn (`Math.round(x * 100) / 100`). Thresholds compare against the stored value. UI shows `Math.round(value)`. |
| D4 | Several end conditions in the same turn | Not specified. | Precedence: `E >= 100` LOSS_RUPTURE, else `F <= 0` LOSS_BURNOUT, else `K >= 80` WIN_BREAKTHROUGH. Losing conditions win over the win condition. |
| D5 | Scenario ends without hitting any threshold | Graph can reach a node with no next node. | Terminal outcome: `END_DEESCALATED` if final `E < initial E`, otherwise `END_UNRESOLVED`. Both count as "completed", neither counts as a win. |
| D6 | "3 randomly drawn cards" (§4) vs. per-node `availableCards` (§7) | The JSON example shows exactly 3 cards per node. | `availableCards` is the node's **card pool**, minimum 3 cards. Each turn 3 cards are drawn from the pool following the guarantee in D7. A pool of exactly 3 is shown in full, in shuffled order. |
| D7 | Draw guarantee "PACING/METAMODEL" and "DEFENSE/ATTACK" (§8.2) | `REFRAMING` is not mentioned. | Hand must contain ≥1 card from `{PACING, META_MODEL}` and ≥1 from `{DEFENSE, ATTACK}`. Third card drawn uniformly from the rest of the pool (any category, including `REFRAMING`). Validator rejects pools that cannot satisfy this. For statistics `REFRAMING` counts as constructive. |
| D8 | Category names | §6 table uses Hungarian names, §7 JSON uses `PACING`, `META_MODEL`, `DEFENSE`, §8 uses `ATTACK`. | Enum: `PACING`, `META_MODEL`, `REFRAMING`, `DEFENSE`, `ATTACK`. |
| D9 | "Deterministic FSM" vs. random draws | Contradiction if `Math.random()` is used. | Seeded PRNG (`mulberry32`). Seed is created once per run with `crypto.getRandomValues` and stored with the run. Same seed + same choices = same game. Used for resume and E2E tests. |
| D10 | Delta ranges in §6 vs. sample card `c_defense_01` (escalation `+30`, confusion `-10`, both outside the DEFENSE range) | The PRD's own example breaks its matrix. DoD §15.3 requires the validator to pass all samples "without error". | Category ranges are **authoring guidelines**. A delta outside its category range produces a validator **warning**, not an error. CI fails only on errors. The sample card is kept unchanged. |
| D11 | `_escalated_crisis` branch (§8.1) | Naming and placement unclear. | Every scenario must contain exactly one node whose `nodeId` ends with `_escalated_crisis` and has `"branch": "crisis"`. After a turn, if the run did not end and `E > 80` (strict) and the current node is a `main` branch node, the next node is forced to the crisis entry node, overriding the card's `nextNodeId`. Redirect happens at most once per run (crisis nodes never redirect). |
| D12 | "3 to 7 micro-attacks per situation" (§4) | No enforcement mechanism. | Runtime hard cap `MAX_TURNS = 7`: after the 7th resolved turn the run ends with the terminal outcome rule (D5). Validator: every path through the `main` branch from `startNodeId` to a terminal has 3 to 7 nodes; the crisis subgraph has depth 1 to 3. |
| D13 | Initial state values | PRD: E 40 to 70, F always 100, K always 0. | Validator enforces `escalation ∈ [40,70]`, `grounding == 100`, `confusion == 0`. |
| D14 | "Text + intonation" in ATTACK_INCOMING (§4), no audio files allowed | TTS voices for Hungarian are not reliably offline. | No speech synthesis in v1. Intonation is a per-node `tone` field (`CALM`, `TENSE`, `ANGRY`, `FURIOUS`, `SARCASTIC`, `COLD`) that drives (a) text reveal speed, (b) the NPC bubble style, (c) a short synthesized "tone cue" (Section 15). |
| D15 | Stress countdown "if there is one" (§14) | Optional, no spec. | Optional per scenario: `decisionTimeLimitSec` (integer 5 to 60, or absent). Absent = no timer. When it expires the engine auto-plays the first reactive card in the displayed hand ("freeze reaction"), logged with `timedOut: true`. Only ADVANCED sample scenarios use it. The timer freezes on `visibilitychange` hidden. |
| D16 | "Panic zone seconds" (FR-05), "RTO values" (§9) | Not defined. | Panic zone: `E >= 70 OR F <= 30` (evaluated on the state after each resolution, and on the initial state). Panic time counts visible wall-clock time while in panic zone. RTO (Recovery Time Objective) of a run = mean duration in seconds of panic episodes that ended (left the zone) before the run ended; `null` if none. Details in Section 11. |
| D17 | "Preferred card style" (FR-05) | Not defined. | Debrief shows count per category, constructive vs. reactive ratio, and the dominant category (highest count; ties broken by order `PACING, META_MODEL, REFRAMING, DEFENSE, ATTACK`). Each category has a localized style label and coaching tip in the string table. |
| D18 | Tap vs. swipe (FR-01) | "On button press and swipe-up". | Tap on a card **selects** it (enlarged preview + confirm button). Confirm button **or** swipe-up on any card **commits** it. Keyboard: `1`/`2`/`3` select, `Enter` commits. Commit animation to drop zone takes 180 ms (budget < 200 ms). |
| D19 | Haptic intensity setting (§9) | Vibration API has no amplitude. | Setting `hapticIntensity: "OFF" | "LOW" | "HIGH"`. LOW multiplies vibration segment durations by 0.5 (minimum 10 ms), pause segments unchanged. HIGH uses PRD patterns as-is. Default `HIGH`. |
| D20 | Which haptic pattern fires when (§11) | Mapping not fixed. | Table in Section 14. |
| D21 | `{npc_name}`, `{trigger_word}` sources (§8.3) | Not in the JSON example. | Scenario has `npc.name` and `variables` (string map, must include `trigger_word` if used). A node may override variables with `variables`. Section 10.3. |
| D22 | "Lighthouse PWA audit > 95" (§15.2, DoD item 2) | Lighthouse 12+ has no PWA category. Pinning an old Lighthouse (11.x through `@lhci/cli` 0.13.x) against a current Chrome is fragile: it breaks whenever Chrome changes the protocol it relies on, and nobody fixes old Lighthouse releases. | PO decision 2026-10-14: Lighthouse is dropped completely. No `@lhci/cli`, no `lighthouserc` file, no `lighthouse` CI job. What the PRD wanted the four audit scores to prove is proven by own pass/fail checks instead. **PWA:** the CI job `pwa` (Section 24.3) runs the manifest check, Chrome's own installability check (`Page.getInstallabilityErrors` returns an empty list), the service worker control and scope check, precache completeness, a full offline run and the update flow, all against the built `dist`; plus the manual PWA rows of the device checklist (Section 24.4). **Performance:** bundle gate (SBE-PRF-001), CDP-throttled start-time check `startup.spec.ts` ≤ 1200 ms (SBE-PRF-002), `memory.spec.ts`. **Accessibility:** `@axe-core/playwright` on every screen (SBE-A11-001) and the contrast check (SBE-A11-008). **Best practices:** meta CSP without violations (SBE-SEC-003), no console errors in a full run (SBE-PRF-003), HTTPS by GitHub Pages. This replaces the fallback clause of D40 and the score threshold of D41. |
| D23 | Resume after reload (§14) | "Save the last completed decision node". | The run is persisted as an event log (seed + choices). Resume replays the log through the pure engine and lands on `ATTACK_INCOMING` of the current node. Saved on every FSM transition. Section 12.4. |
| D24 | `$schema` URL `https://aikido-game.internal/...` | Not resolvable offline. | Used as the JSON Schema `$id` only. The schema file is local: `schemas/scenario.schema.json`. Nothing fetches the URL. |
| D25 | UI framework | Not specified; bundle < 350 KB gz. | Preact + `@preact/signals`. Section 3. |
| D26 | CI system | Not specified. | GitHub Actions, because the code lives in the game's own public GitHub repository and deploys to GitHub Pages (D45). Jobs are plain `npm run` scripts. Decided 2026-10-14. |
| D27 | Persona use (§2) | Personas describe the audience only. | Scenarios carry a `personas` tag array (`P1_MANAGER`, `P2_FRONTLINE`). First launch asks the player to pick a role (skippable); the scenario list sorts matching scenarios first. |
| D28 | Language | PRD is Hungarian only. Product decision (2026-10-14): multilingual. | Supported locales: `hu`, `en`, `de`. All UI strings and all scenario content exist in all three; a missing translation is a build error, never a runtime fallback. UI strings: `src/i18n/{hu,en,de}.ts`. Scenario text: inline localized objects `{ "hu": …, "en": …, "de": … }` in the one scenario file (D30). No i18n library (Section 23). |
| D29 | Initial locale | Not specified. | Order: saved setting (if not `"auto"`) > first entry of `navigator.languages` whose primary subtag, compared case-insensitively, is `hu`, `en` or `de` (`de-AT` maps to `de`, `EN-gb` to `en`) > `en`. The onboarding screen shows the detected language preselected and lets the player change it. Settings has a language selector with `auto`. |
| D30 | Where translations live | Separate files per locale would duplicate the graph and the delta values and let them drift. | One scenario file, structure and numbers once, every player-facing field is a `LocalizedText` object with exactly the keys `hu`, `en`, `de`. Validator enforces completeness (E018) and identical placeholders across locales (E019). |
| D31 | Forms of address | Hungarian and German distinguish informal and formal "you". | The game always addresses the player informally (HU "te", DE "du"). Inside dialogue: colleagues (P1 scenarios) use informal address both ways; in customer scenarios (P2) the player addresses the customer formally (HU "Ön", DE "Sie") and the customer addresses the player formally too. |
| D32 | Locale switch during a run | Not specified. | Allowed only from Settings, which is not reachable from the Game screen; a saved run resumes in the new locale. Run state is language-neutral (ids and numbers only), so nothing has to be migrated. Telemetry carries `locale`. |
| D33 | Manifest name | A web app manifest has one name, it cannot follow the runtime locale. | Manifest uses the English name "Verbal Aikido: The Empathy Firewall", short name "Verbal Aikido". In-app title follows the locale (`app.name`). |
| D34 | Exact random algorithm | "Fisher-Yates using int" leaves the iteration order open, so two correct implementations could produce different hands. | Pinned in Section 10.1/10.2 with golden values. Hands for a given seed are part of the spec (Section 28) and must match exactly. |
| D35 | Stress-timer expiry must survive replay (review A1, 2026-10-14) | The reducer played the timed-out card on a TICK, and TICKs are not logged, so a reload lost the card. | TICK only counts the timer down and stops at 0. When `timerRemainingMs` reaches 0 the controller dispatches `CARD_COMMITTED { cardId: firstReactiveCard(hand), timedOut: true }`, which is logged and replayed like any commit. `firstReactiveCard` is a pure engine helper. |
| D36 | Reload must not reset the stress timer (review A2) | Resume restarts at ATTACK_INCOMING and `REVEAL_DONE` set the timer back to the full limit. | `timerRemainingMs` is part of the persisted timing snapshot. On resume the controller sets `RunState.resumeTimerMs` from it; the next `REVEAL_DONE` uses `resumeTimerMs` instead of the full limit and clears it. A restored value ≤ 0 makes the controller time out immediately after the reveal. |
| D37 | Giving up (review A3) | ENDED entry actions and ABANDON contradicted each other. | ABANDON: delete `currentRun`, no `RunSummary`, no progress change, no end haptics or sound, telemetry `scenario_abandon`, navigate Home. The ENDED entry actions of 9.1 run only when `outcome != null`. Abandoned runs never appear in Stats. |
| D38 | Atomic end-of-run write (review A4) | The driver interface had no multi-store write. | `StorageDriver.finishRun(summary, progress)`, Section 12.1. Idempotent per `runId`, so a crash between steps can never count a run twice. |
| D39 | Validator error mapping and catalog (review A5) | A missing locale produced E001 and E018; fixture folders without a catalog produced E016 everywhere. | Schema errors located inside a `localizedText` value are reported only as E018. A folder without `catalog.json` is an E016 error by default; the flag `--no-catalog` skips catalog checks and is used only for test fixture folders. |
| D40 | Toolchain versions (review A6) | Node 20 is end-of-life since April 2026; the listed tool majors are outdated. | Node 24 LTS. All tools: current stable major at project start, pinned exactly (no `^`/`~`) in `package.json`; `.nvmrc` holds the exact Node version; the Playwright CI image tag equals the pinned Playwright version. PWA and audit gates: D22. |
| D41 | Audit score threshold (review A7) | PRD says "> 95", the spec had ≥ 0.95. | Superseded by D22 (2026-10-14): there are no audit scores any more. Each of the four areas has its own pass/fail check, listed in D22. |
| D42 | Leaving the Game screen with "continue later" (review A9) | Clock behaviour unspecified. | Treated like the page becoming hidden: send a final TICK, freeze the visible clock, clear timers, save. Panic time and the stress timer do not run while the player is away. |
| D43 | Exact timer value at freeze (review A10) | TICKs every 250 ms made the frozen value depend on timing luck. | The controller dispatches a TICK with the current visible-clock value immediately before every freeze: `visibilitychange` hidden, `pagehide`, leaving the Game screen. |
| D44 | Bottom zone height (review A11) | 260 px vs 200 px. | `min-height: 260px`; `@media (orientation: landscape)` → `200px`. A laptop window is landscape too, so the same rule applies there (D46). |
| D45 | Hosting and headers (review A8) | Header support depends on the host. | Decided 2026-10-14: **GitHub Pages**, free. One public repository per game; this game has exactly one repository and one deployment. All three languages (HU/EN/DE) ship in the same app and the same deployment and are switched at runtime (D28, D32); there is no per-language repository, build or URL. GitHub Pages cannot set custom HTTP headers, so the CSP ships only as `<meta http-equiv="Content-Security-Policy">` in `index.html` and caching is left to GitHub's defaults plus the service worker. `vite preview` sends no extra headers, so CI tests exactly what production serves. Details and accepted trade-offs in Section 25.3. |
| D46 | Desktop and laptop browsers (PO, 2026-10-14) | The PRD says "mobile PWA", but the PO wants the game to run on computers too; the PRD already names desktop browsers for the haptics fallback (§13). | First-class targets: current Chrome, Edge and Firefox on Windows laptops of different resolutions, with mouse and keyboard. Same single layout: on viewports wider than 600 px the app is a centred column, `max-width: 520px`, full height (`100dvh`); the rest of the window shows the page background. 520 px gives each of the three cards about 160 px, which at the 10 pt cap of the card text clamp is about 20 characters per line, so a 160-character card (W103) fits in about 8 lines, and German text has some room; a wider column only spreads the cards apart without making text larger, because the font is capped. Mouse uses the existing Pointer Events: click selects, the confirm button commits, and an upward mouse drag commits with the same thresholds as a swipe (16.3). The drag works but is never needed, because click + confirm and `1`/`2`/`3` + `Enter` do the same. The keyboard plays a whole scenario, including starting it and continuing (Section 18). Key hints (`1`, `2`, `3`, `Enter`, `Esc`, `Space`) are shown on cards and buttons only when `(hover: hover) and (pointer: fine)`. No vibration on desktop: the existing silent fallback applies (14.3). Installable as a desktop PWA in Chrome and Edge; Firefox has no install and runs in a tab, offline still works there after the first load. A laptop window is landscape, so the D44 landscape rule applies; at 1366×768 with 150 % scaling the CSS viewport is about 910×420, the bottom zone gets its 200 px minimum and the upper zone scrolls, as in a phone's landscape tab. |
| D47 | Test devices and iOS (PO, 2026-10-14) | The PRD DoD (§15.4) asks for a physical test on low-end Android (Chrome) and iOS (Safari). No Mac and no iPhone are available. | Physical tests run on: a low-end Android phone (Chrome), another Android phone (Chrome), an Android tablet (Chrome, both orientations) and Windows laptops (Chrome, Edge, Firefox; at least 1366×768 and 1920×1080 with 125–150 % scaling), Section 24.4. iOS and iPadOS Safari stay supported on a best-effort basis: the cheap iOS-specific measures stay in the spec (`pagehide` freeze, `webkitAudioContext`, audio unlock on first input, `apple-touch-icon`, safe-area padding, silent vibration fallback), and the Playwright WebKit project (iPhone SE descriptor) is the automated proxy. **iOS is not verified on a device.** This gap is recorded in the DoD (Section 27, item 4) and in every device test record. Screen reader checks use TalkBack on Android and NVDA (or Narrator) on Windows. |

---

## 3. Technology stack

| Concern | Choice | Version policy | Why |
|---|---|---|---|
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` | 5.x | PRD requires type-safe scenarios. |
| UI | Preact | 10.x | ~4 KB gz, React-like, fits budget. |
| State | `@preact/signals` | 1.x | Fine-grained updates, no re-render of the card row when a meter animates. |
| Build | Vite | current stable major, exact pin (D40) | Fast, good Preact preset (`@preact/preset-vite`). |
| PWA / SW | `vite-plugin-pwa` (Workbox `generateSW`) | current stable, exact pin (D40) | PRD names Workbox. |
| IndexedDB | Own thin wrapper (~80 lines) | n/a | Avoids dependency, API surface is tiny. |
| Schema validation (CI / dev only) | `ajv` + `ajv-formats` | 8.x | Not shipped to the client. |
| Unit tests | Vitest + `fake-indexeddb` + `@testing-library/preact` | current stable, exact pins (D40) | Same config as Vite; Testing Library for `@component` specs. |
| E2E | Playwright (`@playwright/test`) + `@axe-core/playwright` | current stable, exact pins (D40) | PRD DoD §15.1; axe for SBE-A11-001; the PWA checks of the `pwa` job use Playwright Chromium and the Chrome DevTools Protocol (D22). |
| Localization | Own `t()` helper + `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.PluralRules` not needed (no plural strings) | built into browsers | No i18n library needed for 3 static locales; keeps bundle small. |
| Lint/format | ESLint (typescript-eslint) + Prettier | latest | |
| Node | 24 LTS | `.nvmrc` = exact version, e.g. `24.x.y` | Node 20 is end-of-life (D40). |

Runtime dependencies are **only** `preact` and `@preact/signals`. Everything else is a devDependency. No web fonts (system font stack), no icon fonts (inline SVG), no CSS framework.

---

## 4. System architecture

### 4.1 Layers

The PRD defines three blocks: UI/PWA shell, FSM + metric engine, persistence + telemetry. They map to this structure:

```
+--------------------------------------------------------------------------------+
| UI / PWA SHELL  (src/ui, src/app)                                              |
|  Screens (Preact)   Gesture handler   Meter tweens   aria-live announcer       |
|        |  dispatch(GameEvent)               ^  state signal                    |
+--------|------------------------------------|----------------------------------+
         v                                    |
+--------------------------------------------------------------------------------+
| GAME CONTROLLER  (src/app/gameController.ts)                                   |
|  Owns the run. Glues engine + clock + rng + side effects.                      |
|  - feeds events into the pure engine                                           |
|  - schedules timed transitions (reveal, resolution, timer)                     |
|  - calls effects: haptics, audio, persistence, telemetry, announcer            |
+---------|-------------------------|-------------------------|------------------+
          v                         v                         v
+--------------------+  +------------------------+  +---------------------------+
| ENGINE (pure)      |  | FEEDBACK               |  | PERSISTENCE & TELEMETRY   |
| src/engine         |  | src/feedback           |  | src/storage, src/telemetry|
|  fsm.ts reducer    |  |  haptics.ts            |  |  StorageDriver (IDB|LS)   |
|  metrics.ts        |  |  audio.ts              |  |  repositories             |
|  hand.ts (draw)    |  |                        |  |  event buffer + sync stub |
|  branching.ts      |  +------------------------+  +---------------------------+
|  interpolate.ts    |                                        ^
|  rng.ts            |  +------------------------+            |
|  outcome.ts        |  | CONTENT                |------------+
+--------------------+  | src/content            |  scenarios fetched from
                        |  catalog loader        |  /scenarios/*.json (precached)
                        +------------------------+
```

### 4.2 Data flow of one turn

1. Controller enters `ATTACK_INCOMING` for node N. UI shows the NPC statement (interpolated), plays tone cue, announces it via aria-live. Persistence saves the run.
2. After the text reveal finishes (or the player taps to skip) the controller dispatches `REVEAL_DONE`. Engine draws the hand with the run's PRNG, moves to `INTERVENTION_CHOICE`. Optional stress timer starts.
3. Player commits a card. Controller dispatches `CARD_COMMITTED{cardId}`. Input lock goes on (400 ms minimum). Engine computes new metrics, momentum, and moves to `RESOLUTION_PHASE`. Controller fires haptics + audio, UI animates card fly (180 ms) and meters (400 ms), shows NPC reaction.
4. Engine immediately computes the outcome (`OUTCOME_CHECK` is a synchronous step inside the reducer, but it is a real, observable state for persistence and tests). Result: `ENDED` or "next node".
5. If not ended, UI shows "Tovább" (Continue). Tap dispatches `CONTINUE`, engine moves to `ATTACK_INCOMING` of the next node. If ended, UI routes to the Debrief screen, run summary is written, current run cleared.

### 4.3 Module dependency rules

- `engine` imports nothing outside `engine` and `content/types.ts`.
- `feedback`, `storage`, `telemetry` import nothing from `ui`.
- `ui` may import from everything except it must not call `engine` reducers directly (only via controller).
- Enforce with ESLint `no-restricted-imports` per folder.

---

## 5. Repository and folder layout

```
verbalis-aikido/
  .github/
    workflows/
      ci.yml                     validate, unit, build, e2e, pwa, deploy (Section 25.2)
  .nvmrc
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  playwright.config.ts
  schemas/
    scenario.schema.json          JSON Schema draft 2020-12 (Section 7.2)
    catalog.schema.json
  scripts/
    validate-scenarios.ts         CLI validator, run in CI (Section 7.4)
    check-spec-coverage.ts        every @SBE id from Section 28 has a test (Section 24.5)
    check-bundle-size.ts          gzip size gate (Section 20) + precache completeness (Section 24.3)
    check-manifest.ts             manifest and icon check on dist (Section 24.3)
  public/
    scenarios/
      catalog.json                index of scenario files
      scen_angry_pm_deadline_001.json
      scen_stakeholder_scope_002.json
      scen_customer_refund_003.json
      scen_customer_gaslight_004.json
    icons/
      icon-192.png  icon-512.png  icon-maskable-512.png  apple-touch-icon-180.png
    favicon.svg
  src/
    main.tsx                      bootstraps app, registers SW
    app/
      App.tsx                     router (screen signal), top-level providers
      router.ts                   screen enum + navigation signal
      gameController.ts           orchestrates a run (Section 9.5)
      clock.ts                    VisibleClock (pausable on visibilitychange)
      settings.ts                 settings signal + persistence binding
    engine/
      constants.ts                ALL model constants (Section 8.4)
      types.ts                    RunState, GameEvent, Phase, Outcome
      rng.ts                      mulberry32 + helpers
      metrics.ts                  applyCard()
      hand.ts                     drawHand()
      branching.ts                resolveNextNode()
      outcome.ts                  checkOutcome()
      interpolate.ts              interpolate()
      fsm.ts                      reducer(state, event, ctx) => state
      replay.ts                   replay(scenario, seed, choices) => state
      stats.ts                    run summary, panic/RTO calculation
    content/
      types.ts                    Scenario, ScenarioNode, Card, ... (Section 6)
      catalogLoader.ts            fetch + light runtime guard + cache in memory
    storage/
      driver.ts                   StorageDriver interface
      indexedDbDriver.ts
      localStorageDriver.ts
      openStorage.ts              picks driver with fallback
      repositories.ts             settings, progress, runs, currentRun, analytics
    telemetry/
      events.ts                   event type definitions
      telemetry.ts                track(), buffer to storage
      sync.ts                     flush() to REST endpoint, disabled unless configured
    feedback/
      haptics.ts
      audio.ts
    ui/
      screens/
        HomeScreen.tsx
        OnboardingScreen.tsx
        BriefingScreen.tsx
        GameScreen.tsx
        DebriefScreen.tsx
        SettingsScreen.tsx
        StatsScreen.tsx
        HowToPlayScreen.tsx
      components/
        MeterBar.tsx
        NpcBubble.tsx
        CardHand.tsx
        Card.tsx
        CardPreview.tsx
        DropZone.tsx
        TimerRing.tsx
        Sparkline.tsx            inline SVG E/F/K timeline
        ResumeDialog.tsx
        UpdateToast.tsx
        LiveRegion.tsx
      keyHints.ts                key labels for desktop key hints (D46), not translated
      hooks/
        useSwipeUp.ts
        useTween.ts
        useInputLock.ts
      styles/
        tokens.css               colors, spacing, z-index, durations
        base.css
        game.css
    i18n/
      hu.ts                      Hungarian UI strings, reference key set (Section 23)
      en.ts                      English, typed as Record<keyof typeof hu, string>
      de.ts                      German, same type
      locale.ts                  Locale type, detectLocale(), current locale signal, t(), fmtNumber(), pick()
  tests/
    spec/                        Section 28 as .feature files, one per feature (source of truth for test titles)
    unit/                        vitest, mirrors src/
    e2e/
      features/                  Gherkin .feature files (documentation + traceability)
      fr01-card-swipe.spec.ts
      fr02-meters.spec.ts
      fr03-haptics.spec.ts
      fr04-audio.spec.ts
      fr05-debrief.spec.ts
      offline.spec.ts
      resume.spec.ts
      a11y.spec.ts
      memory.spec.ts
      visibility.spec.ts
      startup.spec.ts            CDP-throttled start time (Section 20)
      desktop.spec.ts            @desktop scenarios (D46)
      pwa.spec.ts                installability, SW scope, offline, update flow (Section 24.3)
      helpers/
        stubs.ts                 navigator.vibrate + AudioContext recorders
    fixtures/
      scenarios/                 minimal scenarios for tests (valid + invalid)
```

---

## 6. Domain model and TypeScript types

These types are the contract. File: `src/content/types.ts` (content) and `src/engine/types.ts` (runtime).

### 6.1 Content types

```ts
export type Locale = "hu" | "en" | "de";
export const LOCALES: Locale[] = ["hu", "en", "de"];
export type LocalizedText = Record<Locale, string>; // all three keys required, non-empty

export type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type CardCategory = "PACING" | "META_MODEL" | "REFRAMING" | "DEFENSE" | "ATTACK";
export type Tone = "CALM" | "TENSE" | "ANGRY" | "FURIOUS" | "SARCASTIC" | "COLD";
export type Branch = "main" | "crisis";
export type PersonaId = "P1_MANAGER" | "P2_FRONTLINE";

export interface MetricTriple {
  escalation: number; // E
  grounding: number;  // F
  confusion: number;  // K
}

export interface Card {
  cardId: string;              // unique within the scenario, /^c_[a-z0-9_]+$/
  category: CardCategory;
  text: LocalizedText;         // may contain {npc_name}, {trigger_word}, other declared vars
  delta: MetricTriple;         // integers, each in [-50, 50]; language-neutral
  npcReaction: LocalizedText;  // interpolated
  nextNodeId: string | null;   // null = terminal after this card
  debriefHint?: LocalizedText; // coaching note shown in turn-by-turn debrief
}

export interface ScenarioNode {
  nodeId: string;              // unique, /^[a-z0-9_]+$/
  branch?: Branch;             // default "main"
  tone: Tone;
  npcStatement: LocalizedText;
  variables?: Record<string, LocalizedText>; // overrides scenario variables for this node
  availableCards: Card[];      // pool, length >= 3
}

export interface Scenario {
  $schema: string;             // "https://aikido-game.internal/schemas/v1/scenario.json"
  schemaVersion: "1.0";
  id: string;                  // /^scen_[a-z0-9_]+$/, equals file name without .json
  contentVersion: number;      // integer >= 1, bump on any content change in any locale
  title: LocalizedText;
  summary: LocalizedText;      // 1-2 sentences for the scenario list
  briefing: LocalizedText;     // situation description shown before start
  difficulty: Difficulty;
  personas: PersonaId[];       // >= 1
  npc: { name: LocalizedText; role: LocalizedText }; // name localized for name order (HU "Nagy Erika", EN/DE "Erika Nagy")
  variables: Record<string, LocalizedText>;          // e.g. { "trigger_word": { "hu": "határidő", "en": "deadline", "de": "Deadline" } }
  decisionTimeLimitSec?: number; // D15
  initialState: MetricTriple;
  startNodeId: string;
  nodes: ScenarioNode[];
}

export interface CatalogEntry {
  id: string;
  file: string;                // relative to /scenarios/
  contentVersion: number;
  title: LocalizedText;
  summary: LocalizedText;
  difficulty: Difficulty;
  personas: PersonaId[];
  order: number;               // display order inside same persona/difficulty group
}

export interface Catalog {
  schemaVersion: "1.0";
  scenarios: CatalogEntry[];
}
```

Note: the PRD sample has no `schemaVersion`, `contentVersion`, `summary`, `briefing`, `personas`, `npc`, `variables`, `startNodeId`, `tone`, and its texts are plain Hungarian strings. These are additions required by this architecture. The sample scenario in Section 22.2 is the PRD sample extended with these fields and localized.

UI code never reads a `LocalizedText` directly. It calls `pick(text, locale)` from `src/i18n/locale.ts`, then `interpolate()` (Section 10.3). Both are pure and unit-tested.

### 6.2 Runtime types

```ts
export type Phase =
  | "ATTACK_INCOMING"
  | "INTERVENTION_CHOICE"
  | "RESOLUTION_PHASE"
  | "OUTCOME_CHECK"
  | "ENDED";

export type Outcome =
  | "WIN_BREAKTHROUGH"
  | "LOSS_RUPTURE"
  | "LOSS_BURNOUT"
  | "END_DEESCALATED"
  | "END_UNRESOLVED";

export interface TurnRecord {
  turnIndex: number;         // 0-based
  nodeId: string;
  hand: string[];            // cardIds offered, in display order
  cardId: string;            // committed card
  category: CardCategory;
  timedOut: boolean;
  before: MetricTriple;
  after: MetricTriple;
  momentumAfter: number;
  crisisRedirect: boolean;
  decisionMs: number;        // visible ms from INTERVENTION_CHOICE entry to commit
}

export interface RunState {
  runId: string;             // uuid v4 (crypto.randomUUID)
  scenarioId: string;
  contentVersion: number;
  seed: number;              // uint32
  rngState: number;          // current mulberry32 state
  phase: Phase;
  turnIndex: number;         // number of turns already resolved
  currentNodeId: string;
  pendingNextNodeId: string | null; // set in OUTCOME_CHECK, consumed by CONTINUE
  metrics: MetricTriple;
  momentum: number;          // M_eszk, 0..4
  crisisUsed: boolean;
  hand: string[];            // current hand cardIds (empty outside INTERVENTION_CHOICE)
  history: TurnRecord[];
  outcome: Outcome | null;
  timing: RunTiming;         // Section 11
  resumeTimerMs: number | null; // D36: set on resume, consumed by the next REVEAL_DONE
}

export interface RunTiming {
  visibleMsTotal: number;
  panicMsTotal: number;
  inPanic: boolean;
  panicEpisodeStartMs: number | null; // on the visible clock
  completedEpisodesMs: number[];
  choiceEnteredAtMs: number | null;
  timerRemainingMs: number | null;    // stress timer, null if scenario has none
  lastEventMs: number;                // nowMs of the last event processed (Section 11.2)
}

export type GameEvent =
  | { type: "START"; scenario: Scenario; seed: number; runId: string; nowMs: number }
  | { type: "REVEAL_DONE"; nowMs: number }
  | { type: "CARD_COMMITTED"; cardId: string; nowMs: number; timedOut?: boolean }
  | { type: "RESOLUTION_DONE"; nowMs: number }
  | { type: "CONTINUE"; nowMs: number }
  | { type: "FINALIZE"; nowMs: number }   // OUTCOME_CHECK -> ENDED when outcome != null (Section 9.2)
  | { type: "TICK"; nowMs: number }       // visible clock tick, drives panic time + timer
  | { type: "ABANDON"; nowMs: number };

// What is stored in PersistedRun.events: START carries ids, not the Scenario object.
export type PersistedEvent =
  | { type: "START"; scenarioId: string; contentVersion: number; seed: number; runId: string; nowMs: number }
  | Exclude<GameEvent, { type: "START" } | { type: "TICK" } | { type: "ABANDON" }>;
```

`nowMs` is always the **visible clock** value (Section 11.1), never wall time.

---

## 7. Scenario JSON format, JSON Schema and validator

### 7.1 Files

- `public/scenarios/catalog.json`: the index, validated against `schemas/catalog.schema.json`.
- `public/scenarios/<id>.json`: one scenario per file, validated against `schemas/scenario.schema.json`.
- File name must equal `id` + `.json`. Catalog entry fields (`title`, `summary`, `difficulty`, `personas`, `contentVersion`) must equal the scenario file values (validator checks it).

### 7.2 JSON Schema (`schemas/scenario.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aikido-game.internal/schemas/v1/scenario.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["$schema", "schemaVersion", "id", "contentVersion", "title", "summary", "briefing",
               "difficulty", "personas", "npc", "variables", "initialState", "startNodeId", "nodes"],
  "properties": {
    "$schema": { "const": "https://aikido-game.internal/schemas/v1/scenario.json" },
    "schemaVersion": { "const": "1.0" },
    "id": { "type": "string", "pattern": "^scen_[a-z0-9_]+$" },
    "contentVersion": { "type": "integer", "minimum": 1 },
    "title": { "$ref": "#/$defs/localizedText" },
    "summary": { "$ref": "#/$defs/localizedText" },
    "briefing": { "$ref": "#/$defs/localizedText" },
    "difficulty": { "enum": ["BEGINNER", "INTERMEDIATE", "ADVANCED"] },
    "personas": {
      "type": "array", "minItems": 1, "uniqueItems": true,
      "items": { "enum": ["P1_MANAGER", "P2_FRONTLINE"] }
    },
    "npc": {
      "type": "object", "additionalProperties": false, "required": ["name", "role"],
      "properties": {
        "name": { "$ref": "#/$defs/localizedText" },
        "role": { "$ref": "#/$defs/localizedText" }
      }
    },
    "variables": {
      "type": "object",
      "propertyNames": { "pattern": "^[a-z][a-z0-9_]*$" },
      "additionalProperties": { "$ref": "#/$defs/localizedText" }
    },
    "decisionTimeLimitSec": { "type": "integer", "minimum": 5, "maximum": 60 },
    "initialState": { "$ref": "#/$defs/metricTriple" },
    "startNodeId": { "$ref": "#/$defs/nodeId" },
    "nodes": { "type": "array", "minItems": 4, "items": { "$ref": "#/$defs/node" } }
  },
  "$defs": {
    "localizedText": {
      "type": "object", "additionalProperties": false, "required": ["hu", "en", "de"],
      "properties": {
        "hu": { "type": "string", "minLength": 1 },
        "en": { "type": "string", "minLength": 1 },
        "de": { "type": "string", "minLength": 1 }
      }
    },
    "nodeId": { "type": "string", "pattern": "^[a-z0-9_]+$", "maxLength": 64 },
    "metricTriple": {
      "type": "object", "additionalProperties": false,
      "required": ["escalation", "grounding", "confusion"],
      "properties": {
        "escalation": { "type": "integer", "minimum": -100, "maximum": 100 },
        "grounding": { "type": "integer", "minimum": -100, "maximum": 100 },
        "confusion": { "type": "integer", "minimum": -100, "maximum": 100 }
      }
    },
    "card": {
      "type": "object", "additionalProperties": false,
      "required": ["cardId", "category", "text", "delta", "npcReaction", "nextNodeId"],
      "properties": {
        "cardId": { "type": "string", "pattern": "^c_[a-z0-9_]+$" },
        "category": { "enum": ["PACING", "META_MODEL", "REFRAMING", "DEFENSE", "ATTACK"] },
        "text": { "$ref": "#/$defs/localizedText" },
        "delta": { "$ref": "#/$defs/metricTriple" },
        "npcReaction": { "$ref": "#/$defs/localizedText" },
        "nextNodeId": { "oneOf": [{ "$ref": "#/$defs/nodeId" }, { "type": "null" }] },
        "debriefHint": { "$ref": "#/$defs/localizedText" }
      }
    },
    "node": {
      "type": "object", "additionalProperties": false,
      "required": ["nodeId", "tone", "npcStatement", "availableCards"],
      "properties": {
        "nodeId": { "$ref": "#/$defs/nodeId" },
        "branch": { "enum": ["main", "crisis"], "default": "main" },
        "tone": { "enum": ["CALM", "TENSE", "ANGRY", "FURIOUS", "SARCASTIC", "COLD"] },
        "npcStatement": { "$ref": "#/$defs/localizedText" },
        "variables": {
          "type": "object",
          "propertyNames": { "pattern": "^[a-z][a-z0-9_]*$" },
          "additionalProperties": { "$ref": "#/$defs/localizedText" }
        },
        "availableCards": { "type": "array", "minItems": 3, "maxItems": 8, "items": { "$ref": "#/$defs/card" } }
      }
    }
  }
}
```

Length limits are not in the schema because they apply per locale; the validator checks them (E020). `schemas/catalog.schema.json` describes `Catalog` from Section 6.1 the same way (`title`, `summary` as `localizedText`) (`additionalProperties: false`, all fields required, same patterns/enums, `order` integer ≥ 0, `file` pattern `^scen_[a-z0-9_]+\.json$`).

### 7.3 Semantic rules (validator, beyond the schema)

Errors (exit code 1):

| Code | Rule |
|---|---|
| E001 | File fails JSON Schema. Print the ajv error path. Errors whose instance path lies inside a `localizedText` value (missing, extra or empty locale key) are not reported as E001 but as E018 (D39). |
| E002 | `id` != file name stem. |
| E003 | Duplicate `nodeId` in scenario. |
| E004 | Duplicate `cardId` in scenario. |
| E005 | `startNodeId` does not exist, or is a crisis node. |
| E006 | `nextNodeId` refers to a missing node. |
| E007 | A `main` card points into a crisis node, or a crisis card points into a `main` node. (Crisis is reachable only by redirect.) |
| E008 | Not exactly one node with `nodeId` ending `_escalated_crisis` and `branch: "crisis"`. Every other crisis node must be reachable from that entry. |
| E009 | Cycle in the node graph. |
| E010 | Unreachable `main` node (not reachable from `startNodeId`). |
| E011 | Main-branch path length (nodes visited from start to terminal) outside `[3, 7]`. Enumerate all paths (graphs are small). |
| E012 | Crisis subgraph depth outside `[1, 3]`. |
| E013 | Card pool cannot satisfy the draw guarantee (no `PACING`/`META_MODEL`, or no `DEFENSE`/`ATTACK`). |
| E014 | `initialState.escalation` outside `[40, 70]`, or `grounding != 100`, or `confusion != 0`. |
| E015 | Text uses `{var}` that is not defined in `variables` (scenario or node) and is not `npc_name`. |
| E016 | `catalog.json` missing in the validated folder, catalog entry missing for a scenario file, catalog references a missing file, or catalog fields differ from the scenario. Skipped only with `--no-catalog` (test fixtures, D39). |
| E017 | Node with every card's `nextNodeId == null` is fine (terminal). A node that is the target of nothing and is not start/crisis entry: covered by E010. A crisis node must have at least one path to a terminal (null). |
| E018 | A `LocalizedText` lacks one of `hu`, `en`, `de`, has an extra key, or has an empty / whitespace-only value. (Schema catches most of it; the validator repeats it with a readable path, e.g. `nodes[2].availableCards[1].text.de`.) |
| E019 | The set of `{placeholders}` differs between the locales of the same field (e.g. `hu` uses `{trigger_word}`, `de` does not). |
| E020 | Length limit exceeded in any locale: `title` 3..80, `summary` 10..200, `briefing` 20..600, `npc.name` 1..40, `npc.role` 1..60, variable value 1..60, `npcStatement` 3..280, card `text` 3..220, `npcReaction` 1..280, `debriefHint` 1..240. Message names the locale. |

Warnings (printed, exit code 0):

| Code | Rule |
|---|---|
| W101 | Card delta outside its category range (table below). Shows card id, field, value, range. |
| W102 | Pool has fewer than 2 constructive cards (weak decision variety). |
| W103 | Card `text` longer than 160 chars in any locale (readability on iPhone SE). Message names the locale. |
| W104 | `decisionTimeLimitSec` set on a non-ADVANCED scenario. |
| W105 | Identical text in two locales of the same field (likely an untranslated copy). Ignored for `npc.name`. |

Category guideline ranges (from PRD §6). Range `a..b` means inclusive between min(a,b) and max(a,b):

| Category | ΔE | ΔF | ΔK |
|---|---|---|---|
| PACING | -25..-15 | +5..+10 | +5..+10 |
| META_MODEL | -5..+5 | -5..0 | +25..+35 |
| REFRAMING | -20..-10 | +10..+15 | +15..+25 |
| DEFENSE | +15..+25 | -20..-15 | 0..0 |
| ATTACK | +30..+45 | -35..-25 | -30..-20 |

These ranges live in `src/engine/constants.ts` as `CATEGORY_GUIDE_RANGES` and are imported by the validator script, so there is one source.

### 7.4 Validator CLI

- `npm run validate:scenarios` runs `tsx scripts/validate-scenarios.ts public/scenarios`.
- `--no-catalog` disables E016; only test fixture folders use it. The production folder is always validated with the catalog.
- Output: one line per finding `<file>: <code> <message>`, then a summary line `N files, X errors, Y warnings`.
- Exit 1 if any error. Used in CI stage `validate` and as a `predev`/`prebuild` hook so a broken scenario never ships.
- Also run against `tests/fixtures/scenarios/invalid/*.json` in unit tests: each invalid fixture is named after the code it must trigger (`E009-cycle.json`) and the test asserts that code appears.

### 7.5 Runtime loading

`catalogLoader.ts`:

1. `fetch("/scenarios/catalog.json")` (served from SW precache when offline).
2. Scenario files are fetched lazily when the player opens a briefing, then cached in a `Map` for the session.
3. Runtime guard (no ajv in bundle): check `schemaVersion === "1.0"`, `id` matches, `nodes` is a non-empty array, `startNodeId` exists. On failure show the error screen string `errors.scenarioLoad` and send telemetry `content_error`. CI validation makes this path practically unreachable.
4. Base URL: use `import.meta.env.BASE_URL` as prefix so deployment under a sub-path works.

---

## 8. Game engine: math model

### 8.1 Variables

| Symbol | Field | Range | Start | End condition |
|---|---|---|---|---|
| E | `escalation` | [0, 100] | scenario, 40 to 70 | `E >= 100`: LOSS_RUPTURE |
| F | `grounding` | [0, 100] | 100 | `F <= 0`: LOSS_BURNOUT |
| K | `confusion` | [0, 100] | 0 | `K >= 80`: WIN_BREAKTHROUGH |
| M | `momentum` | integer [0, 4] | 0 | none |

### 8.2 Turn formula (`metrics.ts`)

```
applyCard(metrics, momentum, card):
  isReactive = card.category in {DEFENSE, ATTACK}
  M' = isReactive ? min(MOMENTUM_MAX, momentum + 1) : 0
  E' = clamp(0, 100, E + card.delta.escalation + M' * MOMENTUM_COEF)        // MOMENTUM_COEF = 1.25
  F' = clamp(0, 100, F + card.delta.grounding - E * GROUNDING_DRAIN_COEF)   // 0.05, uses E before the turn
  K' = clamp(0, 100, K + card.delta.confusion)
  round each to 2 decimals: r(x) = Math.round(x * 100) / 100
  return { metrics: {E', F', K'}, momentum: M' }
```

Evaluate exactly in this order with IEEE doubles: `E + dE + M' * 1.25`, `F + dF - E * 0.05` (left to right), clamp, then `r()`. Golden values in Section 28 depend on it (e.g. `79.9375` must round to `79.94`).

### 8.3 Worked examples (use as unit test vectors)

Start: E=65, F=100, K=0, M=0.

| Card | ΔE, ΔF, ΔK | M' | E' | F' | K' |
|---|---|---|---|---|---|
| c_pace_01 | -20, +8, +10 | 0 | 65-20+0 = **45** | 100+8-3.25 = 104.75, clamp **100** | **10** |
| c_metamodel_01 | -5, -2, +30 | 0 | **60** | 100-2-3.25 = **94.75** | **30** |
| c_defense_01 | +30, -20, -10 | 1 | 65+30+1.25 = **96.25** | 100-20-3.25 = **76.75** | clamp(-10) = **0** |

Second turn after c_defense_01, another DEFENSE card (+20, -15, 0): M'=2, E' = 96.25+20+2.5 = 118.75, clamp **100**, LOSS_RUPTURE.

Outcome check after the first defense: E = 96.25 > 80, current node is main, not ended: crisis redirect.

### 8.4 `constants.ts` (complete list)

```ts
export const METRIC_MIN = 0;
export const METRIC_MAX = 100;
export const LOSS_ESCALATION = 100;     // E >= this
export const LOSS_GROUNDING = 0;        // F <= this
export const WIN_CONFUSION = 80;        // K >= this
export const CRISIS_ESCALATION = 80;    // E > this (strict)
export const MOMENTUM_COEF = 1.25;
export const MOMENTUM_MAX = 4;
export const GROUNDING_DRAIN_COEF = 0.05;
export const MAX_TURNS = 7;
export const HAND_SIZE = 3;
export const PANIC_ESCALATION = 70;     // E >= this
export const PANIC_GROUNDING = 30;      // F <= this
export const INPUT_LOCK_MS = 400;
export const CARD_FLY_MS = 180;
export const METER_TWEEN_MS = 400;
export const REVEAL_MS_PER_CHAR: Record<Tone, number> = {
  CALM: 28, TENSE: 22, ANGRY: 16, FURIOUS: 12, SARCASTIC: 26, COLD: 30,
};
export const REVEAL_MAX_MS = 1800;
export const CONSTRUCTIVE: CardCategory[] = ["PACING", "META_MODEL", "REFRAMING"];
export const REACTIVE: CardCategory[] = ["DEFENSE", "ATTACK"];
export const GUARANTEE_CONSTRUCTIVE: CardCategory[] = ["PACING", "META_MODEL"];
export const GUARANTEE_REACTIVE: CardCategory[] = ["DEFENSE", "ATTACK"];
export const CATEGORY_GUIDE_RANGES = { /* table in 7.3 */ };
```

---

## 9. Game engine: finite state machine

### 9.1 States

PRD states plus the terminal state:

| Phase | Meaning | Enter actions (controller side effects) | Leaves on |
|---|---|---|---|
| ATTACK_INCOMING | NPC speaks current node statement | save run, tone cue audio, aria-live polite, start text reveal | `REVEAL_DONE` |
| INTERVENTION_CHOICE | 3 cards in hand | save run, enable input, start stress timer if configured | `CARD_COMMITTED` |
| RESOLUTION_PHASE | metrics recomputed, NPC reaction shown | save run, input lock, haptic + audio, card fly + meter tween, announce reaction and metric deltas | `RESOLUTION_DONE` (controller fires it after `max(CARD_FLY_MS + METER_TWEEN_MS, INPUT_LOCK_MS)` = 580 ms) |
| OUTCOME_CHECK | decide end / next node | save run; if not ended show "Tovább" button | `CONTINUE` (not ended) or automatic to ENDED |
| ENDED | run over | if `outcome != null`: `finishRun()` (summary + progress + clear current run, D38), telemetry `scenario_end`, outcome haptic + audio, aria-live assertive, navigate to Debrief. If abandoned (`outcome == null`): delete current run, telemetry `scenario_abandon`, navigate Home, nothing else (D37) | none |

### 9.2 Transition table (reducer contract)

| From | Event | Guard | To | Reducer work |
|---|---|---|---|---|
| (none) | START | scenario valid | ATTACK_INCOMING | init RunState: metrics = initialState, momentum 0, rngState = seed, currentNodeId = startNodeId, timing zeroed, evaluate panic on initial state |
| ATTACK_INCOMING | REVEAL_DONE | | INTERVENTION_CHOICE | `hand = drawHand(node, rng)`; `choiceEnteredAtMs = nowMs`; `timerRemainingMs = resumeTimerMs ?? limit*1000` (null without a limit); `resumeTimerMs = null` (D36) |
| INTERVENTION_CHOICE | CARD_COMMITTED | `cardId ∈ hand` | RESOLUTION_PHASE | `applyCard`, push TurnRecord, `turnIndex++`, `hand = []`, update panic tracking at `nowMs` |
| RESOLUTION_PHASE | RESOLUTION_DONE | | OUTCOME_CHECK | `checkOutcome` + `resolveNextNode`; store `outcome` or `pendingNextNodeId` |
| OUTCOME_CHECK | FINALIZE (dispatched by controller right after persisting) | outcome != null | ENDED | close any open panic episode as "unrecovered" (not added to completed list) |
| OUTCOME_CHECK | CONTINUE | outcome == null | ATTACK_INCOMING | `currentNodeId = pendingNextNodeId` |
| any but ENDED | TICK | | same | accumulate `visibleMsTotal`, `panicMsTotal`; in INTERVENTION_CHOICE also `timerRemainingMs = max(0, timerRemainingMs - (nowMs - lastEventMs))`. A TICK never commits a card (D35). |
| any but ENDED | ABANDON | | ENDED | `outcome = null`, flagged abandoned; side effects per D37 |

Any event not in this table for the current phase is **ignored** (returns the same state object). This is the global input lock at engine level: a double tap sends a second `CARD_COMMITTED` while in RESOLUTION_PHASE, it is ignored.

"Immediate" transition in OUTCOME_CHECK: the reducer, when handling `RESOLUTION_DONE`, returns the OUTCOME_CHECK state. The controller persists it, then if `outcome != null` dispatches an internal `FINALIZE` event (add `{ type: "FINALIZE"; nowMs }` to `GameEvent`) to move to ENDED. This keeps OUTCOME_CHECK observable as the PRD wants.

### 9.3 Outcome and next node (`outcome.ts`, `branching.ts`)

Both functions are pure and return values; the reducer applies them.

```
checkOutcome(state, scenario, lastCard) -> { outcome, nextNodeId, crisisRedirect }:
  if E >= 100: return { outcome: LOSS_RUPTURE }
  if F <= 0:   return { outcome: LOSS_BURNOUT }
  if K >= 80:  return { outcome: WIN_BREAKTHROUGH }
  if turnIndex >= MAX_TURNS:                       // checked before redirect (Section 21)
      return { outcome: terminalOutcome(state) }
  { nextNodeId, crisisRedirect } = resolveNextNode(state, scenario, lastCard)
  if nextNodeId == null:
      return { outcome: terminalOutcome(state) }
  return { outcome: null, nextNodeId, crisisRedirect }

terminalOutcome(state):
  return E < initialState.escalation ? END_DEESCALATED : END_UNRESOLVED

resolveNextNode(state, scenario, lastCard) -> { nextNodeId, crisisRedirect }:
  node = current node
  if E > 80 and (node.branch ?? "main") == "main" and not state.crisisUsed:
      return { nextNodeId: crisis entry node id, crisisRedirect: true }
  return { nextNodeId: lastCard.nextNodeId, crisisRedirect: false }
```

Reducer on `RESOLUTION_DONE`: set `outcome`, `pendingNextNodeId`; if `crisisRedirect` set `crisisUsed = true` and `history[last].crisisRedirect = true`.

Note: a redirect overrides a card whose `nextNodeId` is `null` too. Escalation above 80 at a would-be terminal sends the player into the crisis branch instead of ending.

### 9.4 Engine purity

- `reducer(state, event, ctx)` where `ctx = { scenario }`. Returns a new object (never mutates).
- RNG state lives in `RunState.rngState`. `rng.ts` exposes `next(state): [value, newState]` so the reducer stays pure.
- `replay(scenario, seed, events)` folds events through the reducer. Used by resume and by unit tests.

### 9.5 Game controller (`src/app/gameController.ts`)

Responsibilities, in this order of importance:

1. Holds `runState` as a Preact signal. Only writer of that signal.
2. `start(scenarioId)`: load scenario, `seed` from `crypto.getRandomValues(new Uint32Array(1))[0]` (or from URL `?seed=` if present, see Section 24.4), `runId = crypto.randomUUID()`, dispatch START.
3. Dispatch wrapper: `dispatch(event)` -> `next = reducer(state, event, ctx)`; if `next === state` stop; else set signal, append the event to the persisted event log (only `START` params, `REVEAL_DONE`, `CARD_COMMITTED`, `RESOLUTION_DONE`, `CONTINUE`, `FINALIZE`; TICKs are not logged, timing snapshot is saved instead), then run phase-entry side effects from 9.1.
4. Owns timers: reveal timer, resolution timer, a 250 ms `TICK` interval driven by the visible clock. All timers are cleared and re-armed on pause/resume (Section 11). Before every freeze (`visibilitychange` hidden, `pagehide`, leaving the Game screen) it dispatches one TICK with the current clock value, then freezes and saves (D42, D43).
4a. Stress-timer expiry: after any TICK, if phase is INTERVENTION_CHOICE and `timerRemainingMs === 0`, dispatch `CARD_COMMITTED { cardId: firstReactiveCard(state.hand), timedOut: true, nowMs }` (D35). The commit is logged like every other commit, so replay reproduces it.
5. Owns the `isTransitioning` signal (PRD §14): true from `CARD_COMMITTED` until `INPUT_LOCK_MS` elapsed **and** phase is no longer RESOLUTION_PHASE. UI uses it to set `pointer-events: none` and `aria-busy="true"` on the hand.
6. `abandon()`: dispatches ABANDON after the player confirms leaving (D37).
7. `suspend()`: "continue later" from the leave dialog; final TICK, freeze, save, navigate Home (D42).

---

## 10. Hand drawing, branching and text interpolation

### 10.1 PRNG (`rng.ts`)

mulberry32, uint32 state:

```
next(s):
  s = (s + 0x6D2B79F5) >>> 0
  t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, s]
```

Helpers (each returns the new state):

```
int(s, n):           [v, s] = next(s); return [Math.floor(v * n), s]
shuffle(s, array):   a = copy of array
                     for i from a.length - 1 down to 1:
                       [j, s] = int(s, i + 1)
                       swap a[i], a[j]
                     return [a, s]
```

The state starts at `seed` (START does not consume a value). Golden values, seed 1: `0.6270739406, 0.0027357212, 0.5274470400, 0.9810509675, 0.9683778982`; seed 42: `0.6011037519, 0.4482905590, 0.8524657935, 0.6697340414, 0.1748138987` (10 decimals).

### 10.2 Draw algorithm (`hand.ts`)

```
drawHand(pool, rngState):
  if pool.length == 3: hand = shuffle(pool); return
  A = pool filtered category in {PACING, META_MODEL}   (keep pool order)
  B = pool filtered category in {DEFENSE, ATTACK}     (keep pool order)
  a = A[int(|A|)]                                     (1st rng call)
  b = B[int(|B|)]                                     (2nd rng call)
  rest = pool minus {a, b}                            (keep pool order)
  c = rest[int(|rest|)]                               (3rd rng call)
  hand = shuffle([a, b, c])                           (2 more rng calls)
  return hand (cardIds), new rngState
```

A draw from a pool of 4 or more consumes exactly 5 rng values, a pool of 3 consumes 2. The hand is drawn on `REVEAL_DONE`, never earlier, so replay reproduces it. Even for a 3-card pool the guarantee holds because the validator (E013) enforces it. Unit test: for 10 000 seeds on a 6-card pool, every hand has one card from A and one from B, no duplicates, and each card appears at least once.

### 10.3 Interpolation (`interpolate.ts`)

- Syntax `{name}`, name matches `[a-z][a-z0-9_]*`.
- Locale first: the template is `pick(field, locale)`, variable values are `pick(variable, locale)` for the same locale. A German sentence is never filled with a Hungarian variable.
- Lookup order: node `variables`, scenario `variables`, built-in `npc_name` = `pick(scenario.npc.name, locale)`.
- Grammar: variables are inserted as-is, no inflection. Authors write each locale's sentence so the variable fits (e.g. German uses "wegen der {trigger_word}" with a feminine noun as the value). E019 guarantees every locale uses the same variables.
- Unknown name: leave the literal `{name}` in place (validator E015 prevents this in shipped content).
- Applied to `npcStatement`, card `text`, `npcReaction`, `debriefHint`, `briefing`.
- No HTML. Rendered as text nodes only (Preact escapes by default). Never use `dangerouslySetInnerHTML`.

---

## 11. Timing, panic zone, RTO and the stress timer

### 11.1 Visible clock (`src/app/clock.ts`)

- `VisibleClock` wraps `performance.now()` and accumulates only while `document.visibilityState === "visible"`.
- On `visibilitychange` to hidden: freeze (store accumulated value), clear controller timers, save run. To visible: resume, re-arm timers with their remaining durations.
- Also freeze on `pagehide`, resume on `pageshow` (iOS Safari reliability).
- All `nowMs` values in events come from this clock, relative to run start. For resumed runs the clock starts from the saved `visibleMsTotal`.

### 11.2 Panic zone

- `isPanic(m) = m.escalation >= 70 || m.grounding <= 30`.
- Evaluated after START (initial state) and after every `applyCard`.
- Accounting happens at the start of handling **every** event that carries `nowMs` (TICK and all phase events, in every phase except ENDED): `if (inPanic) panicMsTotal += nowMs - lastEventMs; visibleMsTotal = nowMs; lastEventMs = nowMs`. Only then the event's own state change runs and panic is re-evaluated.
- Episode tracking: entering panic sets `panicEpisodeStartMs = nowMs`. Leaving panic pushes `nowMs - panicEpisodeStartMs` to `completedEpisodesMs` and clears the start.
- The controller dispatches `FINALIZE` with the same `nowMs` as the `RESOLUTION_DONE` it follows, so the panic total at the end is deterministic.
- `panicSec` = `Math.round(panicMsTotal / 100) / 10` (one decimal).

### 11.3 RTO

- Run RTO (seconds) = `Math.round(mean(completedEpisodesMs) / 100) / 10`, `null` if no completed episodes.
- An episode still open at run end is "unrecovered": counted in panic seconds, not in RTO. Debrief shows `debrief.unrecovered` if such an episode existed.
- Persisted per scenario: `bestRtoSec` (minimum non-null across runs) and `lastRtoSec`.

### 11.4 Stress timer

- Only if `scenario.decisionTimeLimitSec` is set.
- Starts on entering INTERVENTION_CHOICE, decremented by TICKs (visible time only, so it is frozen while hidden, PRD §14).
- UI: circular ring (`TimerRing`) in the top-right of the card zone, `aria-hidden` except at 5 s remaining when the live region says `timer.fiveSeconds`.
- The timer keeps running while the card preview is open. Preview is part of deciding.
- At 0: the controller commits the first reactive card in display order with `timedOut: true` (D15, D35).
- Survives reloads: the remaining time is restored, never reset (D36).

---

## 12. Persistence layer

### 12.1 Driver interface

```ts
export interface StorageDriver {
  readonly kind: "indexeddb" | "localstorage" | "memory";
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  append<T>(store: "analyticsQueue", value: T): Promise<void>;      // auto key
  takeBatch<T>(store: "analyticsQueue", max: number): Promise<{ keys: string[]; values: T[] }>;
  deleteKeys(store: "analyticsQueue", keys: string[]): Promise<void>;
  // D38: write summary, update progress, prune runs to 50, delete currentRun.
  // IndexedDB: one readwrite transaction over runs, progress, currentRun.
  // LocalStorage / memory: runs, then progress, then delete currentRun last.
  // Idempotent: if runs already holds summary.runId, progress is not touched again.
  finishRun(summary: RunSummary, progress: ScenarioProgress): Promise<void>;
  count(store: StoreName): Promise<number>;
}
export type StoreName = "meta" | "settings" | "progress" | "runs" | "currentRun" | "analyticsQueue";
```

`openStorage()` tries IndexedDB (open with 1500 ms timeout). On error or timeout, it tries LocalStorage (test write/remove of `va:probe`). If that also fails, uses an in-memory driver and the Settings screen shows `settings.storageVolatile`.

### 12.2 IndexedDB schema

Database `verbalis-aikido`, version `1`.

| Store | keyPath / key | Value type | Notes |
|---|---|---|---|
| `meta` | out-of-line key | `{ installId: string, createdAt: string, onboardingDone: boolean, persona: PersonaId \| null, dbSchema: 1 }` key `"app"` | `installId` = random uuid, used as anonymous `clientId` |
| `settings` | out-of-line key `"user"` | `Settings` | |
| `progress` | out-of-line key = scenarioId | `ScenarioProgress` | |
| `runs` | keyPath `runId` | `RunSummary` | index `byScenario` on `scenarioId`. Keep last 50 runs total, delete oldest beyond. |
| `currentRun` | out-of-line key `"active"` | `PersistedRun` | at most one |
| `analyticsQueue` | autoIncrement | `TelemetryEvent` | cap 2000 rows, drop oldest when full |

Upgrades: `onupgradeneeded` switch on `oldVersion` with fall-through cases. Version 1 creates everything.

### 12.3 LocalStorage fallback layout

Keys prefixed `va:`. `va:meta:app`, `va:settings:user`, `va:progress:<scenarioId>`, `va:runs` (JSON array, max 50), `va:currentRun:active`, `va:analyticsQueue` (JSON array, cap 500 because of the 5 MB quota). All values JSON. Catch `QuotaExceededError`: drop analytics queue first, then oldest runs, then retry once.

### 12.4 Persisted shapes

```ts
export interface Settings {
  audioMuted: boolean;                       // default false
  hapticIntensity: "OFF" | "LOW" | "HIGH";   // default "HIGH"
  reducedMotion: "system" | "on" | "off";    // default "system"
  locale: Locale | "auto";                   // default "auto" (D29)
}

export interface ScenarioProgress {
  scenarioId: string;
  completedCount: number;          // runs that reached ENDED with an outcome
  winCount: number;
  bestOutcome: Outcome | null;     // order: WIN > DEESCALATED > UNRESOLVED > BURNOUT > RUPTURE
  bestRtoSec: number | null;
  lastRtoSec: number | null;
  lastPlayedAt: string;            // ISO
}

export interface RunSummary {
  runId: string;
  scenarioId: string;
  contentVersion: number;
  startedAt: string;
  endedAt: string;
  outcome: Outcome;
  turns: number;
  finalMetrics: MetricTriple;
  panicSec: number;                // 1 decimal
  rtoSec: number | null;
  unrecoveredPanic: boolean;
  categoryCounts: Record<CardCategory, number>;
  constructiveCount: number;
  reactiveCount: number;
  timedOutCount: number;
  history: TurnRecord[];           // for debrief replay and sparkline
}

export interface PersistedRun {
  runId: string;
  scenarioId: string;
  contentVersion: number;
  seed: number;
  startedAt: string;
  events: PersistedEvent[];        // Section 6.2; START holds scenarioId + seed only
  timing: RunTiming;               // snapshot of the latest timing
  savedAt: string;
}
```

Global stats (Stats screen) are derived from `runs` + `progress`: total constructive vs reactive ratio = sum of counts across `runs`. No separate aggregate store. (`runs` capped at 50, so the ratio covers the last 50 runs; label it as such.)

### 12.5 Save points and resume

- Save `currentRun` on **every** FSM transition (PRD §14), awaited but non-blocking for UI (fire and forget with error logging). Also on `visibilitychange` hidden and `pagehide`.
- Writes are serialized through a single promise chain so an older write never lands after a newer one.
- On app start, if `currentRun` exists:
  - If `contentVersion` differs from the current scenario: discard silently, telemetry `resume_discarded`.
  - Else show `ResumeDialog` (`resume.title` / `resume.continue` / `resume.restart`).
  - Resume: rebuild by replaying `events`. Then normalize the phase:
    - ATTACK_INCOMING or INTERVENTION_CHOICE: restart at ATTACK_INCOMING of the same node. The hand will be the same anyway because the RNG state at that node is reproduced by replay and the REVEAL_DONE is not replayed (drop trailing REVEAL_DONE).
    - RESOLUTION_PHASE: dispatch RESOLUTION_DONE (the choice was already committed, it is not undone).
    - OUTCOME_CHECK: show the NPC reaction and the "Tovább" button (or FINALIZE if outcome set).
  - Restore `timing` from the snapshot (TICKs are not in the log). If the run was in INTERVENTION_CHOICE, set `resumeTimerMs = timing.timerRemainingMs` (D36).
- `ENDED` with an outcome: `finishRun()` (D38). Abandoned: delete `currentRun` only (D37).

---

## 13. Telemetry and the future sync endpoint

### 13.1 Principles

- Offline-first event buffer in `analyticsQueue`. No network calls unless `VITE_SYNC_ENDPOINT` is set at build time. Default build: empty. The guard is the first statement inside `flush()`: `if (!import.meta.env.VITE_SYNC_ENDPOINT) return;` (a top-level `return` is not valid in an ES module). Vite replaces the constant at build time, so the request code becomes dead code and is removed.
- No PII. `clientId` = `meta.installId` (random uuid). No free text from the user exists anyway.
- Settings has no telemetry toggle in v1 because nothing leaves the device. If sync is enabled in a future build, a consent toggle must be added (out of scope).

### 13.2 Event envelope

```ts
export interface TelemetryEvent {
  eventId: string;          // uuid
  name: TelemetryName;
  ts: string;               // ISO wall time (for analytics only, never for game logic)
  appVersion: string;       // from package.json via define
  runId?: string;
  scenarioId?: string;
  props: Record<string, string | number | boolean | null>;
}
```

### 13.3 Event catalog

| name | when | props |
|---|---|---|
| `app_open` | app boot | `storage`: driver kind, `standalone`: display-mode standalone, `online`, `locale`, `localeSource` (`setting` / `browser` / `fallback`) |
| `onboarding_done` | persona chosen or skipped | `persona` |
| `scenario_start` | START | `difficulty`, `seed`, `resumed: false`, `locale` |
| `run_resumed` | resume accepted | `phase` |
| `resume_discarded` | contentVersion mismatch or "Új kezdés" | `reason` |
| `card_played` | CARD_COMMITTED | `turn` (1-based: `turnIndex + 1`), `nodeId`, `cardId`, `category`, `timedOut`, `decisionMs`, `E`, `F`, `K` (after) |
| `crisis_redirect` | redirect | `turn`, `E` |
| `scenario_end` | ENDED | `outcome`, `turns`, `panicSec`, `rtoSec`, `constructive`, `reactive`, `locale` |
| `scenario_abandon` | ABANDON | `turn` |
| `settings_changed` | any setting | `key`, `value` |
| `content_error` | load guard failed | `scenarioId`, `reason` |
| `sw_update_applied` | user accepted update | `from`, `to` |

### 13.4 Sync contract (prepared, disabled)

```
POST {VITE_SYNC_ENDPOINT}/v1/events:batch
Content-Type: application/json

{
  "clientId": "6f1c2a9e-3b4d-4c8e-9f10-2a7b5c3d1e00",
  "appVersion": "1.0.0",
  "sentAt": "2026-10-14T10:00:00.000Z",
  "events": [ TelemetryEvent, ... ]     // max 100
}

202 Accepted  { "accepted": 100 }
4xx           drop the batch (log), do not retry
5xx/network   keep the batch, retry with backoff 30s, 2m, 10m, then on next app_open
```

`sync.ts` exposes `flush(): Promise<void>`: called on `app_open`, on `online` event, and after `scenario_end`, only when sync is enabled. Uses `takeBatch(100)`, deletes keys only after 202. `navigator.sendBeacon` is not used (needs no response handling we rely on).

---

## 14. Haptics engine

### 14.1 API (`src/feedback/haptics.ts`)

```ts
export type HapticPattern = "TAP" | "VALIDATION" | "BREAKTHROUGH" | "DAMAGE";
export function haptic(p: HapticPattern): void;
export function setHapticIntensity(i: "OFF" | "LOW" | "HIGH"): void;
```

Patterns (PRD §11):

| Pattern | Vibrate array (ms) |
|---|---|
| TAP | `[15]` |
| VALIDATION | `[30, 50, 30]` |
| BREAKTHROUGH | `[60, 40, 100]` |
| DAMAGE | `[120, 50, 120]` |

LOW intensity: even indexes (vibration) × 0.5, rounded, min 10. Odd indexes (pauses) unchanged.

### 14.2 Mapping (D20)

| Trigger | Pattern |
|---|---|
| Card selected (tap) or swipe commit started | TAP |
| Resolution with constructive card (`PACING`, `META_MODEL`, `REFRAMING`) and `E' <= E` | VALIDATION |
| Resolution with constructive card and `E' > E` (possible with a META_MODEL card of ΔE > 0) | TAP |
| Resolution with reactive card | DAMAGE |
| Run ends WIN_BREAKTHROUGH | BREAKTHROUGH (fired after the resolution pattern, 300 ms later) |
| Run ends LOSS_* | DAMAGE (300 ms after resolution pattern) |
| END_DEESCALATED / END_UNRESOLVED | none extra |
| Stress timer at 5 s left | TAP |

### 14.3 Safety

```
if intensity == OFF -> return
if typeof navigator === "undefined" or typeof navigator.vibrate !== "function" -> return
try { navigator.vibrate(pattern) } catch { /* no-op, PRD §11 */ }
```

No logging spam: a missing API is checked once at module init and cached. iOS Safari has no `navigator.vibrate`, so it is a silent no-op there. The `reducedMotion` setting does not affect haptics; haptics have their own setting.

---

## 15. Audio engine

### 15.1 API (`src/feedback/audio.ts`)

```ts
export type Sound =
  | "CARD_TAP" | "CONSTRUCTIVE" | "INQUIRY" | "REACTIVE"
  | "WIN" | "LOSS" | "NEUTRAL_END" | "TIMER_WARN"
  | `TONE_${Tone}`;
export function unlockAudio(): void;   // call from first user gesture
export function play(s: Sound): void;
export function setMuted(m: boolean): void;
```

### 15.2 Implementation rules

- One lazily created `AudioContext` (`window.AudioContext ?? window.webkitAudioContext`). If missing, every call is a no-op.
- `unlockAudio()` is called on the first `pointerdown`/`keydown` anywhere (listener with `{ once: true }`), creates the context and calls `resume()`. Before unlock, `play` is a no-op (no queueing).
- Only `OscillatorNode` with `type = "sine"` (PRD FR-04: pure sine). One master `GainNode` at 0.15.
- Envelope per note: gain from 0 to note gain in 10 ms (linear), hold, then `exponentialRampToValueAtTime(0.0001, end)` over the last 60 ms. Stop the oscillator at `end + 0.02`. Disconnect on `ended` to keep memory flat (NFR-03).
- If `ctx.state === "suspended"` when playing (iOS after background), call `ctx.resume()` and skip this sound.
- Muted: return early. Mute is also implied when `ctx` is missing.

### 15.3 Sound table

Frequencies in Hz. Notes play sequentially unless "together".

| Sound | Notes (freq / duration ms / gain) | Used when |
|---|---|---|
| CARD_TAP | 880 / 40 / 0.5 | card select |
| CONSTRUCTIVE | 523.25 / 110 / 0.8, then 659.25 / 160 / 0.8 | resolution with PACING or REFRAMING |
| INQUIRY | 659.25 / 90 / 0.7, then 783.99 / 90 / 0.7, then 659.25 / 120 / 0.6 | resolution with META_MODEL |
| REACTIVE | 233.08 / 220 / 0.9, then 196.00 / 280 / 0.9 | resolution with DEFENSE or ATTACK |
| WIN | 523.25, 659.25, 783.99, 1046.5 / 100 each / 0.8 | WIN_BREAKTHROUGH |
| LOSS | 196.00, 164.81, 130.81 / 200 each / 0.9 | LOSS_* |
| NEUTRAL_END | 440 / 200 / 0.6 then 440 / 200 / 0.4 | END_* |
| TIMER_WARN | 1046.5 / 50 / 0.4 | 5 s left |
| TONE_CALM | 261.63 / 180 / 0.3 | ATTACK_INCOMING by node tone |
| TONE_TENSE | 293.66 and 311.13 together / 220 / 0.25 each | |
| TONE_ANGRY | 220 and 233.08 together / 260 / 0.3 each | |
| TONE_FURIOUS | 196 and 207.65 together / 320 / 0.35 each | |
| TONE_SARCASTIC | 392 / 80 / 0.3 then 349.23 / 160 / 0.3 | |
| TONE_COLD | 174.61 / 300 / 0.25 | |

"Together" notes of slightly detuned sines create beating, which reads as tension without leaving the sine-only rule.

---

## 16. UI: screens, layout and interaction

### 16.1 Navigation

No router library. `router.ts` exports `screen` signal of type:

```ts
type Screen =
  | { name: "home" } | { name: "onboarding" } | { name: "howto" }
  | { name: "briefing"; scenarioId: string }
  | { name: "game" } | { name: "debrief"; runId: string }
  | { name: "settings" } | { name: "stats" };
```

Browser back: push a history entry on each navigation (`history.pushState({screen})`), handle `popstate`. Back from `game` opens the leave-confirm dialog instead of leaving.

Boot order: open storage, load settings and meta, load catalog, check `currentRun`, then render: onboarding if `!onboardingDone`, else home (with ResumeDialog on top if a run exists).

### 16.2 Screens

**Onboarding** (first launch only), two steps:
1. Language: three large buttons with endonyms "Magyar", "English", "Deutsch" (`language.hu/en/de`), the detected locale (D29) preselected, plus `common.next`. Choosing a language switches the UI immediately and stores `settings.locale`.
2. Role: title, 2-sentence intro (`onboarding.intro`), two persona buttons (`persona.P1_MANAGER`, `persona.P2_FRONTLINE`), `onboarding.skip`. Then HowTo.

**HowTo**: 4 short panels, swipe or `common.next`: (1) meters E/F/K and what ends the game, (2) the 5 card styles, (3) how to play a card (tap+confirm or swipe up), (4) panic zone and debrief. Reachable from Home later.

**Home**: header with app name and settings/stats icons. Scenario list grouped by difficulty, persona-matching scenarios first within each group. Each item: title, summary, difficulty chip, persona chips, best outcome badge, best RTO. Tap opens Briefing.

**Briefing**: title, NPC name + role, briefing text (interpolated), difficulty, timer notice if `decisionTimeLimitSec`, start button in the bottom 40%.

**Game** (portrait layout, height = 100dvh):

```
+--------------------------------------+  top
| [x]  Scenario title       turn 2/≤7  |  header 48px
| E Eszkaláció  [#########-----]  65   |  meters block
| F Földelés    [##############] 100   |  (MeterBar x3)
| K Megakadás   [#-------------]  10   |
+--------------------------------------+
|  NPC name (role)                     |
|  +--------------------------------+  |  NpcBubble, aria-live polite
|  | "Már megint képtelen voltál..."|  |  tone styles the border
|  +--------------------------------+  |
|            (npc reaction bubble)     |  shown in RESOLUTION / OUTCOME
+--------------------------------------+  <- 60% line
|  [ drop zone ]          (timer ring) |  bottom 40%: all decision UI
|  +--------+ +--------+ +--------+    |
|  | card 1 | | card 2 | | card 3 |    |  CardHand
|  +--------+ +--------+ +--------+    |
|  [        Alkalmazom / Tovább     ]  |  primary button
+--------------------------------------+  padding-bottom: env(safe-area-inset-bottom, 16px)
```

- The bottom zone is `position: fixed; bottom: 0; height: 40dvh`, `min-height: 260px`, and `200px` under `@media (orientation: landscape)` (D44). The upper zone scrolls if content overflows.
- Card width: `(min(100vw, 520px) - 2*12px - 2*8px) / 3`. Card shows category icon + colour stripe at top, text below with `font-size: clamp(8pt, 2.5vw, 10pt); overflow-y: auto` (PRD §14).
- **Desktop and laptops (D46):** above 600 px viewport width the whole app is a centred column, `max-width: 520px`, `height: 100dvh`; the rest of the window shows the page background. The fixed bottom zone takes the column width (`width: min(100vw, 520px); left: 0; right: 0; margin-inline: auto`). Resizing the window during a run only reflows the layout; it does not pause the run.
- Key hints (D46): only under `@media (hover: hover) and (pointer: fine)`, each card shows its key (`1`, `2`, `3`) in a small corner label, the apply button shows `Enter`, the cancel button `Esc` and the continue button `Space`. The labels come from `src/ui/keyHints.ts`, are not translated (key names) and are `aria-hidden="true"`.
- Category labels and colours are shown (training goal is recognizing styles). Colour is never the only signal: icon + label too.
- Tap a card: it becomes selected (raised 8px, outline) and `CardPreview` overlays the card row with the full text at 16px, category name, and buttons "Alkalmazom" (commit) and "Mégse" (cancel). Swipe-up on the preview also commits.
- After commit: card flies into the drop zone (180 ms), other two fade out (180 ms). NPC reaction appears. Meters tween. Primary button becomes "Tovább".
- Leaving (`[x]` or browser back): confirm dialog `game.leaveConfirm` with three buttons: `game.later` (navigate home, run stays in `currentRun` for resume), `game.giveUp` (dispatch ABANDON, run cleared, no progress update) and `common.cancel` (close dialog).

**Debrief** (FR-05):

1. Outcome headline (string per outcome) + short explanation.
2. Big numbers: panic zone seconds (`debrief.panicSec`), the RTO line (`debrief.rto`) only when `rtoSec` is not null, `debrief.noPanic` instead of both when the run never entered the panic zone, `debrief.unrecovered` when an episode was still open at the end, and the number of turns.
3. Card style: horizontal bar per category (counts), constructive vs reactive ratio as "X% konstruktív", dominant style label + coaching tip.
4. Timeline: `Sparkline` inline SVG, 3 polylines E/F/K over turns (turn 0 = initial state), with the panic thresholds as dashed lines. Includes a visually hidden table with the same data for screen readers.
5. Turn list: for each turn, NPC statement (short), played card text, category, deltas, `debriefHint` if present.
6. Buttons: `debrief.retry` (restart same scenario), `debrief.toList`.

**Stats**: per scenario progress rows, overall constructive/reactive ratio over the last 50 runs, total panic seconds, average RTO.

**Settings**: language (`settings.language`: radio group `auto` + the three endonyms; changing it re-renders the whole app at once), audio mute toggle, haptic intensity (3 radio buttons; disabled with note when `navigator.vibrate` missing), reduced motion (system/on/off), `settings.clearRun`, `settings.clearAll` (confirm; clears all stores, keeps nothing, locale falls back to `auto`), storage kind info, app version.

### 16.3 Gesture handling (`useSwipeUp.ts`)

- Pointer Events only (`pointerdown/move/up/cancel`), `setPointerCapture` on down.
- Touch-action rules (PRD §12 and §14 both hold):
  - Card root and its category header/stripe: `touch-action: none` (the browser must not scroll or zoom, so pointer events arrive for the swipe; `none` also prevents double-tap zoom, which is what `manipulation` is required for).
  - Card inner text container: `touch-action: pan-y manipulation` only when its content overflows (class `is-scrollable` set by a `ResizeObserver`), otherwise it inherits `none`.
  - All `<button>` elements outside cards: `touch-action: manipulation`.
  - Drag starts only if `pointerdown` happened on the card root/header, or on a text container that is not `is-scrollable`. A drag that starts inside a scrollable text container is the browser's scroll, not a swipe.
- Commit if `dy <= -60px` or upward velocity ≥ 0.6 px/ms over the last 80 ms, and `|dx| < 50px`.
- While dragging, card follows finger with `transform: translate3d(dx*0.2, dy, 0)`. On release without commit, spring back with 150 ms ease-out.
- Ignored while `isTransitioning` is true.
- Mouse (D46): the same Pointer Events handle it. A click is a tap (select); an upward drag with the button held commits with the same thresholds. `setPointerCapture` keeps delivering `pointerup` when the button is released outside the window; a `lostpointercapture` without `pointerup` counts as a cancelled drag (spring back). The drag is optional on desktop: click + confirm and the keyboard (Section 18) cover every action.

### 16.4 Localization rules in the UI

- `locale` signal in `src/i18n/locale.ts`; every component reads strings through `t(key, vars)` and content through `pick()`. Changing the signal re-renders; no reload.
- `document.documentElement.lang` is set to the active locale on boot and on every change.
- Numbers: `fmtNumber(value, locale, digits)` uses `Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })`. Decimal separator is `,` for `hu` and `de`, `.` for `en` (e.g. panic seconds `4,6` / `4.6`). Meter values are integers and need no formatting.
- Dates (Stats "last played"): `Intl.DateTimeFormat(locale, { dateStyle: "medium" })`.
- German strings are up to ~30% longer: no fixed widths on buttons or labels, buttons may wrap to two lines, meter labels truncate with ellipsis but keep the full text in `aria-label`.
- No string concatenation to build sentences; every sentence is one key with placeholders.
- Category, difficulty, persona and outcome labels are keyed by the enum value (`category.PACING`), never by display text.

### 16.5 Input lock

- `isTransitioning` from the controller (Section 9.5) disables the hand and primary button for at least 400 ms after commit.
- The "Tovább" button also ignores taps for 250 ms after it appears (prevents accidental double tap from the commit).

---

## 17. Animation and rendering rules

- Animate only `transform` and `opacity` (NFR-03). Meter bars: inner fill element with `transform: scaleX(value/100)`, `transform-origin: left`, `transition: transform 400ms linear` (FR-02 requires linear easing).
- Meter number: `useTween` with `requestAnimationFrame`, linear interpolation over 400 ms, displays `Math.round`. One rAF loop for all three meters.
- Card fly: CSS class toggles `transition: transform 180ms ease-out, opacity 180ms`. Compute target translate from drop zone rect once at commit (`getBoundingClientRect`, single layout read).
- `will-change: transform` only on the card being dragged/flown, removed after.
- Reduced motion (`prefers-reduced-motion: reduce` or setting "on"): durations become 0 ms for fly and reveal (text appears at once), meters still update but with 0 ms tween; FR-02 E2E runs with reduced motion off.
- Text reveal (ATTACK_INCOMING): reveal by characters using a single `textContent` update per frame (not per-char spans). Duration `min(len * REVEAL_MS_PER_CHAR[tone], REVEAL_MAX_MS)`. Tap anywhere in the upper zone skips. The aria-live region receives the full text at once at the start (screen readers should not hear partial text).
- Meter colours: E bar shifts to the danger token when `E >= 70`; F bar when `F <= 30`. K bar uses the accent token, pulses once (opacity) when crossing 50.
- No canvas, no WebGL. The "60 FPS render engine" in the PRD is satisfied by compositor-only CSS animations.

---

## 18. Accessibility

WCAG 2.1 AA (NFR-04):

- Colour tokens (in `tokens.css`) chosen with ≥ 4.5:1 for text, ≥ 3:1 for UI component boundaries. Required check: `@axe-core/playwright` in `a11y.spec.ts` on every screen, zero violations of `wcag2a`, `wcag2aa`.
- Two token sets: default (dark navy UI, matches `theme_color`) and a light set under `@media (prefers-color-scheme: light)`. Both must pass contrast. No manual theme switch in v1.
- `LiveRegion` component renders two visually hidden regions: `aria-live="polite"` (NPC statement, NPC reaction, meter change summary from `meter.announce`, e.g. EN "Escalation is now 45 (was 65).") and `aria-live="assertive"` (outcome, timer 5 s warning).
- Meters: `role="meter"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow`, `aria-label` from the string table. Updated with the final value (not each tween frame).
- Cards are `<button>` elements with `aria-describedby` pointing at the category label. Hand container `role="group"` with `aria-label={t("game.hand")}`, `aria-busy` while transitioning.
- Keyboard: all actions reachable. Keys `1`,`2`,`3` select, `Enter` commits, `Escape` cancels preview, `Space` on "Tovább". `Tab` and `Enter` reach everything on the other screens (Home list, Briefing start, Debrief buttons, Settings, dialogs), so a whole scenario can be played without a mouse (D46, SBE-CRD-011). Visible focus ring (2px, token colour, `:focus-visible`).
- Focus management: on entering INTERVENTION_CHOICE focus moves to the hand group; on OUTCOME_CHECK focus moves to "Tovább"; on Debrief focus to the headline (`tabindex="-1"`).
- Touch targets ≥ 44×44 CSS px (cards are bigger; buttons min-height 48px).
- `<html lang>` always equals the active locale (Section 16.4), so screen readers pick the right voice. Static `index.html` ships with `lang="en"` and is corrected before first render.
- Text can be zoomed to 200% without loss: upper zone scrolls; card preview shows full text at a readable size, so the clamp(8pt..10pt) small card text is not the only way to read a card.

---

## 19. PWA, service worker and offline

### 19.1 Manifest (`vite-plugin-pwa` `manifest` option)

```json
{
  "name": "Verbal Aikido: The Empathy Firewall",
  "short_name": "Verbal Aikido",
  "description": "De-escalation communication training game (HU / EN / DE)",
  "lang": "en",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0F172A",
  "theme_color": "#0F172A",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

The same manifest serves the desktop install in Chrome and Edge (D46); desktop browsers ignore `orientation`. Firefox on desktop has no install and runs the app in a tab.

Icon design: dark navy background, a simple white circle split by a curved line (aikido / yin-yang hint), no text. Provide an SVG master in `public/favicon.svg` and export PNGs. `index.html` also needs `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (required for `env(safe-area-inset-*)`), `apple-touch-icon`, `apple-mobile-web-app-capable`, `theme-color`.

### 19.2 Workbox config

```ts
VitePWA({
  registerType: "prompt",
  injectRegister: null,               // registered manually in main.tsx
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest}"],  // includes scenarios/*.json
    navigateFallback: "index.html",
    cleanupOutdatedCaches: true,
    runtimeCaching: [{
      urlPattern: ({ url }) => url.pathname.includes("/scenarios/"),
      handler: "CacheFirst",
      options: { cacheName: "scenarios", expiration: { maxEntries: 100 } }
    }]
  }
})
```

Everything is precached at install (precache is cache-first by nature, PRD NFR-02). The runtime rule only matters for scenario files added later outside the precache manifest.

### 19.3 Update flow

- `registerSW({ onNeedRefresh })` from `virtual:pwa-register`. `onNeedRefresh` shows `UpdateToast` ("Új verzió érhető el" / "Frissítés").
- Do not show the toast during the Game screen; queue it until Home/Debrief.
- "Frissítés": `updateSW(true)` (skipWaiting + reload). The current run is safe because it is persisted; if content version changed, resume discards it (Section 12.5).

### 19.4 Offline guarantee

After the first successful load, with network disabled: app boots, catalog and all scenarios load, every scenario is playable end to end. E2E `offline.spec.ts` proves it (Section 24).

---

## 20. Performance budgets

| Item | Budget | Gate |
|---|---|---|
| Initial JS + CSS + HTML, gzip (excludes icons and scenario JSON) | < 350 KB (target < 60 KB) | `scripts/check-bundle-size.ts` fails CI |
| Single scenario JSON gzip | < 20 KB | validator warning above 20 KB |
| Start time, cold first load, Chromium with CDP throttling (150 ms RTT, 1.6 Mbps down, 750 Kbps up, CPU 4× slower) | < 1.2 s | `startup.spec.ts` (SBE-PRF-002): time from navigation start to the `app-interactive` performance mark, median of 3 fresh contexts ≤ 1200 ms |
| Animations | 60 FPS, compositor only | manual check with DevTools on low-end Android + review rule in Section 17 |
| JS heap | < 45 MB after 10 consecutive runs | Playwright `memory.spec.ts` using CDP `Performance.getMetrics` `JSHeapUsedSize` on Chromium |

`app-interactive` is a `performance.mark` set once, when the first screen (Onboarding or Home with its scenario list) has rendered and its handlers are attached. `startup.spec.ts` follows the `memory.spec.ts` style: Chromium only, CDP session from `context.newCDPSession(page)`, `Network.emulateNetworkConditions` and `Emulation.setCPUThrottlingRate { rate: 4 }`, service worker blocked so every run is a real first load.

Memory rules: one `AudioContext`, disconnect nodes on `ended`; clear all intervals/timeouts on screen unmount; scenario cache is a `Map` limited to 4 entries (LRU by insertion); `runs` store capped at 50.

---

## 21. Edge cases

PRD §14 plus the ones I found while designing:

| Case | Behaviour | Where |
|---|---|---|
| Reload or quit mid-turn | Run saved on every transition; ResumeDialog at next start; replay restores exact state | 12.5 |
| Double tap / fast taps | Engine ignores events invalid for the phase; UI `isTransitioning` lock ≥ 400 ms | 9.2, 16.5 |
| iPhone SE 375×667 | Card text clamp + in-card vertical scroll; preview shows full text; bottom zone min 260 px | 16.2 |
| Phone locks / app backgrounded | Visible clock freezes, timers cleared, stress timer frozen, run saved | 11.1 |
| Vibration unsupported (desktop, iOS) | Silent no-op, haptic setting disabled with note | 14.3 |
| AudioContext unsupported or suspended | Silent no-op; resume attempt on next play | 15.2 |
| IndexedDB unavailable (private mode, blocked) | LocalStorage fallback; then memory with a notice | 12.1 |
| Storage quota exceeded | Drop analytics, then oldest runs, retry once | 12.3 |
| Scenario content updated while a run is saved | `contentVersion` mismatch, saved run discarded | 12.5 |
| Two tabs open | Both work on the same DB. Last write wins for `currentRun`. Acceptable for v1; no BroadcastChannel locking. | n/a |
| Landscape on phone | Manifest locks portrait in standalone mode. In browser tab landscape: show the same layout with the bottom zone min-height 200 px and upper zone scrolling. No blocker overlay. | 16.2 |
| Swipe on text that needs scrolling | Drag only starts outside the scrollable text area or when text does not overflow | 16.3 |
| Stress timer runs out during preview | Preview closes, auto-commit of first reactive card, announcement `timer.expired` | 11.4 |
| Crisis threshold hit on turn 7 | MAX_TURNS wins: run ends (END_*), no redirect | 9.3 (`turnIndex >= MAX_TURNS` check happens in checkOutcome before redirect is used) |
| Crisis redirect when the crisis entry would exceed 7 turns | Cannot happen: cap ends the run first | D12 |
| Clock skew / device time change | Game logic uses `performance.now()`-based visible clock only | 11.1 |
| Desktop window wider than 600 px, any size | Centred column, `max-width: 520px`, full height; the bottom 40% rule holds inside the column | 16.2, D46 |
| Laptop with 125–150 % display scaling (CSS viewport about 910×420 at 1366×768) | Landscape rule: bottom zone 200 px, upper zone scrolls, no horizontal scroll | 16.2, D44, D46 |
| Window resized during a run | Layout reflows, run keeps going; drop-zone rect is read at commit time, so the fly target is always current | 16.2, 17 |
| Mouse drag up on a card | Commits like a swipe; released outside the window: pointer capture still delivers `pointerup`; `lostpointercapture` cancels and springs back | 16.3, D46 |
| Mouse wheel over a long card text | Scrolls the text (it is `overflow-y: auto`), never commits | 16.3 |
| Desktop install in Firefox | Not available; the app runs in a tab and is offline-capable after the first load | 19.1, D46 |
| iOS / iPadOS Safari | Best effort: cheap iOS measures stay, WebKit E2E project is the proxy, not verified on a device | D47 |

Implementation note for the "turn 7" row: in `checkOutcome` evaluate `turnIndex >= MAX_TURNS` before calling `resolveNextNode` so the redirect flag is not set on a final turn.

---

## 22. Content: scenario catalog

### 22.1 Required scenarios for v1

DoD §15.3 talks about "all sample situations". v1 ships these four. Writing rules for all content:

- Every player-facing field exists in Hungarian, English and German (D30). Write the Hungarian original first, then translate meaning, not words: an English or German reader must feel the same tension and the same temptation of the reactive card.
- Forms of address follow D31: the player is always "te" / "du"; colleagues talk informally; customers and the player talk formally ("Ön" / "Sie"). English needs no distinction.
- NPC speaks naturally in every locale (no textbook phrasing). Insert variables only where the sentence works with the variable's value in that locale without inflection.
- Card text ≤ 160 characters in every locale (W103). NPC statement ≤ 200 characters preferred. German is the longest; check it first.
- Every node has 4 to 6 cards: at least 1 PACING, 1 META_MODEL, 1 REFRAMING if it fits the moment, 1 DEFENSE, 1 ATTACK. Deltas inside the guideline ranges unless there is a reason (warning is fine).
- Constructive cards should feel plausible, reactive cards should feel tempting (that is the training value): a reactive card must sound like what a stressed person would really say.
- Each card has `debriefHint` explaining in one sentence why it works or backfires.
- Main branch: 4 to 6 nodes deep on the typical path. Crisis branch: 2 nodes (entry + one follow-up) then terminal.
- Use `{npc_name}` at least once and `{trigger_word}` at least once per scenario.

| id | Title (hu) | Persona | Difficulty | Initial E | Timer | NPC | trigger_word (hu / en / de) | Brief |
|---|---|---|---|---|---|---|---|---|
| `scen_angry_pm_deadline_001` | A Bedőlt Sprint és a Dühös Projektmenedzser | P1 | INTERMEDIATE | 65 | none | Dóra (`npc.name`), projektmenedzser | határidő / deadline / Deadline | PRD sample. PM blames you for a late module in front of the team. Authored in 22.2. |
| `scen_stakeholder_scope_002` | A Scope-Kúszás Hétfő Reggel | P1 | BEGINNER | 45 | none | Tamás (`npc.name`), üzleti stakeholder | prioritás / priority / Priorität | Stakeholder demands two new features in the current sprint "because the CEO promised it". Teaches meta-model and reframing to a shared goal. Authored in 22.3. |
| `scen_customer_refund_003` | A Visszatérített Pénz, Ami Nem Jött Meg | P2 | INTERMEDIATE | 60 | none | Nagy Erika (hu) / Erika Nagy (en, de), ügyfél | visszatérítés / refund / Rückerstattung | Customer on the phone, refund late 3 weeks, threatens to post a review. Teaches pacing and validation without promising what you can't. Formal "Ön" address. Authored in 22.4. |
| `scen_customer_gaslight_004` | „Ezt Sosem Mondtam!” | P2 | ADVANCED | 70 | 15 s | Horváth Gábor (hu) / Gábor Horváth (en, de), kulcsügyfél, beszerzési vezető | szerződés / contract / Vertrag | Key account denies an agreement, accuses you of lying, uses sarcasm and manipulation. Stress timer. Teaches staying grounded (F) and meta-model under pressure. Formal "Ön" address. Authored in 22.5. |

### 22.2 Fully authored reference scenario

This is the PRD sample, extended to a complete, valid graph. Implement it verbatim as `public/scenarios/scen_angry_pm_deadline_001.json`.

All four v1 scenarios are fully authored and translated in this document (22.2 to 22.5). Copy each JSON block verbatim into its file; the implementer writes no dialogue and no translation. `LocalizedText` objects and `delta` objects are printed on one line each to keep the blocks readable; any JSON formatting is fine in the real files. I checked every scenario against the semantic rules in 7.3 including E018 to E020: 0 errors in all four, and the only warnings are the two W101 on `c_defense_01` that come from the PRD sample itself (D10). The writing rules above apply to scenarios added after v1.

`npc.name` is what `{npc_name}` renders, per locale. P1 scenarios use an informal first name; P2 scenarios use the full name in the locale's name order. English and German texts were written by me and still need the native-speaker review listed in the DoD (Section 27, item 13).

Graph:

```
step_01 --pace--------> step_02_calmed ----> step_03_plan ----> step_04_commit -> (end)
        --metamodel---> step_02_focused ---> step_03_plan
        --reframe-----> step_02_calmed
        --defense-----> step_02_escalated -> step_03_plan / step_03_cold -> step_04_commit
        --attack------> step_02_escalated
crisis: pm_escalated_crisis -> pm_crisis_02 -> (end)
```

```json
{
  "$schema": "https://aikido-game.internal/schemas/v1/scenario.json",
  "schemaVersion": "1.0",
  "id": "scen_angry_pm_deadline_001",
  "contentVersion": 1,
  "title": {"hu": "A Bedőlt Sprint és a Dühös Projektmenedzser", "en": "The Failed Sprint and the Angry Project Manager", "de": "Der gescheiterte Sprint und die wütende Projektmanagerin"},
  "summary": {"hu": "A projektmenedzser a csapat előtt téged hibáztat a csúszásért. Tartsd meg a hidegvéred, és tereld a beszélgetést megoldás felé.", "en": "The project manager blames you for the delay in front of the team. Keep your cool and steer the conversation towards a solution.", "de": "Die Projektmanagerin gibt dir vor dem Team die Schuld an der Verzögerung. Bleib ruhig und lenke das Gespräch in Richtung Lösung."},
  "briefing": {"hu": "Sprint review, csütörtök délután. A modulod két napot csúszott, mert a specifikáció is késve érkezett. {npc_name} a csapat előtt fordul feléd, és láthatóan a {trigger_word} miatti nyomás beszél belőle.", "en": "Sprint review, Thursday afternoon. Your module is two days late because the specification also arrived late. {npc_name} turns to you in front of the team, and it is clearly the pressure of the {trigger_word} talking.", "de": "Sprint-Review, Donnerstagnachmittag. Dein Modul ist zwei Tage zu spät, weil auch die Spezifikation verspätet kam. {npc_name} wendet sich vor dem ganzen Team an dich, und man merkt: Hier spricht der Druck der {trigger_word}."},
  "difficulty": "INTERMEDIATE",
  "personas": ["P1_MANAGER"],
  "npc": {
    "name": {"hu": "Dóra", "en": "Dóra", "de": "Dóra"},
    "role": {"hu": "projektmenedzser", "en": "project manager", "de": "Projektmanagerin"}
  },
  "variables": {
    "trigger_word": {"hu": "határidő", "en": "deadline", "de": "Deadline"}
  },
  "initialState": {"escalation": 65, "grounding": 100, "confusion": 0},
  "startNodeId": "step_01",
  "nodes": [
    {
      "nodeId": "step_01",
      "tone": "ANGRY",
      "npcStatement": {"hu": "Már megint képtelen voltál időben leadni a modult! Mindent nekem kell megoldanom helyetted?!", "en": "You failed to deliver the module on time again! Do I have to fix everything for you?!", "de": "Schon wieder hast du das Modul nicht rechtzeitig geliefert! Muss ich denn alles für dich erledigen?!"},
      "availableCards": [
        {
          "cardId": "c_pace_01",
          "category": "PACING",
          "text": {"hu": "Látom rajtad, hogy rettenetesen feszült vagy a csúszás és a {trigger_word} miatt.", "en": "I can see you're really stressed about the delay and the {trigger_word}.", "de": "Ich sehe, dass dich die Verzögerung und die {trigger_word} total unter Druck setzen."},
          "delta": {"escalation": -20, "grounding": 8, "confusion": 10},
          "npcReaction": {"hu": "Hát persze hogy feszült vagyok, az egész ügyfél erre vár!", "en": "Of course I'm stressed, the whole client is waiting for this!", "de": "Natürlich stehe ich unter Druck, der ganze Kunde wartet darauf!"},
          "nextNodeId": "step_02_calmed",
          "debriefHint": {"hu": "Az érzelem kimondása egyetértés nélkül csökkenti a nyomást.", "en": "Naming the emotion without agreeing takes pressure out of the situation.", "de": "Das Gefühl zu benennen, ohne zuzustimmen, nimmt Druck aus der Situation."}
        },
        {
          "cardId": "c_metamodel_01",
          "category": "META_MODEL",
          "text": {"hu": "Mit értesz pontosan az alatt, hogy 'mindent neked kell megoldanod'?", "en": "What exactly do you mean by 'I have to fix everything'?", "de": "Was genau meinst du mit 'ich muss alles erledigen'?"},
          "delta": {"escalation": -5, "grounding": -2, "confusion": 30},
          "npcReaction": {"hu": "Hát... konkrétan ezt a két API integrációt ma délután.", "en": "Well... specifically these two API integrations this afternoon.", "de": "Na ja... konkret diese zwei API-Integrationen heute Nachmittag."},
          "nextNodeId": "step_02_focused",
          "debriefHint": {"hu": "Az általánosítás („mindent”) megkérdezése konkrétumra szűkíti a vitát.", "en": "Questioning the generalization (\"everything\") narrows the argument down to specifics.", "de": "Die Verallgemeinerung („alles“) zu hinterfragen, bringt den Streit auf Konkretes."}
        },
        {
          "cardId": "c_reframe_01",
          "category": "REFRAMING",
          "text": {"hu": "Mindketten azt akarjuk, hogy az ügyfél péntekre működő rendszert kapjon. Nézzük meg, mi kell ehhez.", "en": "We both want the client to have a working system by Friday. Let's look at what that takes.", "de": "Wir wollen beide, dass der Kunde bis Freitag ein funktionierendes System hat. Schauen wir, was es dafür braucht."},
          "delta": {"escalation": -15, "grounding": 12, "confusion": 18},
          "npcReaction": {"hu": "Jó... de akkor most tényleg nézzük meg, mert nincs időnk.", "en": "Okay... but then let's really look at it, we have no time.", "de": "Okay... aber dann schauen wir uns das jetzt wirklich an, wir haben keine Zeit."},
          "nextNodeId": "step_02_calmed",
          "debriefHint": {"hu": "A közös cél behozása áthelyezi a fókuszt a hibáztatásról a megoldásra.", "en": "Bringing in the shared goal moves the focus from blame to solution.", "de": "Das gemeinsame Ziel verschiebt den Fokus von der Schuld zur Lösung."}
        },
        {
          "cardId": "c_defense_01",
          "category": "DEFENSE",
          "text": {"hu": "Nem az én hibám, te adtad át a specifikációt két nap késéssel!", "en": "It's not my fault, you handed over the specification two days late!", "de": "Das ist nicht meine Schuld, du hast die Spezifikation zwei Tage zu spät übergeben!"},
          "delta": {"escalation": 30, "grounding": -20, "confusion": -10},
          "npcReaction": {"hu": "Még te vádaskodsz?! Az én időmet pazarlod!", "en": "Now you're accusing me?! You're wasting my time!", "de": "Jetzt beschuldigst du auch noch mich?! Du verschwendest meine Zeit!"},
          "nextNodeId": "step_02_escalated",
          "debriefHint": {"hu": "Igaz lehet, de most magyarázkodásnak hangzik, és a partner védekezni kezd.", "en": "It may be true, but right now it sounds like an excuse and puts your partner on the defensive.", "de": "Es mag stimmen, aber jetzt klingt es nach Rechtfertigung, und dein Gegenüber geht in die Verteidigung."}
        },
        {
          "cardId": "c_attack_01",
          "category": "ATTACK",
          "text": {"hu": "Ha te rendesen szerveznéd a projektet, nem tartanánk itt.", "en": "If you organized the project properly, we wouldn't be here.", "de": "Wenn du das Projekt ordentlich organisieren würdest, wären wir nicht hier."},
          "delta": {"escalation": 38, "grounding": -28, "confusion": -22},
          "npcReaction": {"hu": "Ezt most komolyan a csapat előtt mondod?!", "en": "Are you seriously saying that in front of the team?!", "de": "Sagst du das gerade ernsthaft vor dem ganzen Team?!"},
          "nextNodeId": "step_02_escalated",
          "debriefHint": {"hu": "A visszatámadás személyes síkra viszi a konfliktust, és mindkét felet kimeríti.", "en": "Hitting back makes the conflict personal and drains both sides.", "de": "Zurückschlagen macht den Konflikt persönlich und erschöpft beide Seiten."}
        }
      ]
    },
    {
      "nodeId": "step_02_calmed",
      "tone": "TENSE",
      "npcStatement": {"hu": "Az ügyfél reggel már kétszer hívott. Nem tudom, mit mondjak neki.", "en": "The client has already called twice this morning. I don't know what to tell them.", "de": "Der Kunde hat heute Morgen schon zweimal angerufen. Ich weiß nicht, was ich ihm sagen soll."},
      "availableCards": [
        {
          "cardId": "c_pace_02",
          "category": "PACING",
          "text": {"hu": "Értem, kellemetlen úgy felvenni a telefont, hogy nincs jó híred.", "en": "I get it, it's awful to pick up the phone when you have no good news.", "de": "Verstehe, es ist unangenehm, ans Telefon zu gehen, wenn man keine guten Nachrichten hat."},
          "delta": {"escalation": -18, "grounding": 6, "confusion": 8},
          "npcReaction": {"hu": "Pontosan. Mindig én kapom a frontot.", "en": "Exactly. I always take the heat.", "de": "Genau. Ich muss immer den Kopf hinhalten."},
          "nextNodeId": "step_03_plan",
          "debriefHint": {"hu": "A helyzet nehézségének elismerése bizalmat épít.", "en": "Acknowledging how hard the situation is builds trust.", "de": "Anzuerkennen, wie schwierig die Lage ist, schafft Vertrauen."}
        },
        {
          "cardId": "c_metamodel_02",
          "category": "META_MODEL",
          "text": {"hu": "Mit kérdezett konkrétan az ügyfél?", "en": "What exactly did the client ask?", "de": "Was genau hat der Kunde gefragt?"},
          "delta": {"escalation": -4, "grounding": -1, "confusion": 28},
          "npcReaction": {"hu": "Azt, hogy a fizetési modul mikor mehet tesztbe.", "en": "When the payment module can go into testing.", "de": "Wann das Zahlungsmodul in den Test gehen kann."},
          "nextNodeId": "step_03_plan",
          "debriefHint": {"hu": "A konkrét kérdés információt hoz, nem érzelmet.", "en": "A concrete question brings information, not emotion.", "de": "Eine konkrete Frage bringt Informationen statt Emotionen."}
        },
        {
          "cardId": "c_reframe_02",
          "category": "REFRAMING",
          "text": {"hu": "Ha ma este adunk neki egy reális dátumot, az többet ér, mint egy újabb ígéret.", "en": "If we give them a realistic date tonight, that's worth more than another promise.", "de": "Wenn wir ihm heute Abend ein realistisches Datum geben, ist das mehr wert als ein weiteres Versprechen."},
          "delta": {"escalation": -12, "grounding": 10, "confusion": 20},
          "npcReaction": {"hu": "Hm. Egy reális dátum... az talán megnyugtatná.", "en": "Hm. A realistic date... that might calm them down.", "de": "Hm. Ein realistisches Datum... das würde ihn vielleicht beruhigen."},
          "nextNodeId": "step_03_plan",
          "debriefHint": {"hu": "A probléma átkeretezése lehetőséggé cselekvést indít.", "en": "Reframing the problem as an opportunity triggers action.", "de": "Das Problem als Chance umzudeuten, setzt Handlung in Gang."}
        },
        {
          "cardId": "c_defense_02",
          "category": "DEFENSE",
          "text": {"hu": "Én szóltam múlt héten, hogy ez nem fog beleférni.", "en": "I told you last week this wouldn't fit.", "de": "Ich habe letzte Woche gesagt, dass das nicht reinpasst."},
          "delta": {"escalation": 18, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "Szóltál, persze. Az nem megoldás.", "en": "Sure, you told me. That's not a solution.", "de": "Klar, hast du gesagt. Das ist keine Lösung."},
          "nextNodeId": "step_03_cold",
          "debriefHint": {"hu": "A „megmondtam” igazolni akar, nem megoldani.", "en": "\"I told you so\" wants to be right, not to solve anything.", "de": "„Hab ich doch gesagt“ will Recht haben, nicht lösen."}
        },
        {
          "cardId": "c_attack_02",
          "category": "ATTACK",
          "text": {"hu": "Akkor mondd meg neki az igazat: rosszul tervezted a sprintet.", "en": "Then tell them the truth: you planned the sprint badly.", "de": "Dann sag ihm doch die Wahrheit: Du hast den Sprint schlecht geplant."},
          "delta": {"escalation": 35, "grounding": -27, "confusion": -20},
          "npcReaction": {"hu": "Na, ebből elég.", "en": "Right, that's enough.", "de": "So, jetzt reicht's."},
          "nextNodeId": "step_03_cold",
          "debriefHint": {"hu": "A hibáztatás most a partner önértékelését támadja.", "en": "Blame now attacks your partner's self-esteem.", "de": "Schuldzuweisung greift jetzt das Selbstwertgefühl deines Gegenübers an."}
        }
      ]
    },
    {
      "nodeId": "step_02_focused",
      "tone": "TENSE",
      "npcStatement": {"hu": "És ha ma délután nem lesz kész, akkor holnap megint én magyarázkodom a {trigger_word} miatt.", "en": "And if it's not done this afternoon, tomorrow I'll be the one explaining myself about the {trigger_word} again.", "de": "Und wenn es heute Nachmittag nicht fertig ist, muss ich mich morgen wieder wegen der {trigger_word} rechtfertigen."},
      "availableCards": [
        {
          "cardId": "c_pace_03",
          "category": "PACING",
          "text": {"hu": "Értem, nem akarsz megint te lenni az, aki magyarázkodik.", "en": "I understand, you don't want to be the one explaining yourself again.", "de": "Verstehe, du willst nicht wieder diejenige sein, die sich rechtfertigen muss."},
          "delta": {"escalation": -16, "grounding": 7, "confusion": 9},
          "npcReaction": {"hu": "Hát nem. Elegem van belőle.", "en": "No, I don't. I'm fed up with it.", "de": "Nein, will ich nicht. Ich habe die Nase voll."},
          "nextNodeId": "step_03_plan",
          "debriefHint": {"hu": "A partner saját szavainak visszatükrözése a pacing alapja.", "en": "Mirroring your partner's own words is the basis of pacing.", "de": "Die eigenen Worte des Gegenübers zu spiegeln, ist die Grundlage von Pacing."}
        },
        {
          "cardId": "c_metamodel_03",
          "category": "META_MODEL",
          "text": {"hu": "A két integrációból melyik kell az ügyfélnek holnap reggelre?", "en": "Which of the two integrations does the client need by tomorrow morning?", "de": "Welche der beiden Integrationen braucht der Kunde bis morgen früh?"},
          "delta": {"escalation": -5, "grounding": -3, "confusion": 32},
          "npcReaction": {"hu": "Igazából... csak a számlázási. A másik ráér jövő hétig.", "en": "Actually... only the billing one. The other can wait until next week.", "de": "Eigentlich... nur die Abrechnung. Die andere hat bis nächste Woche Zeit."},
          "nextNodeId": "step_03_plan",
          "debriefHint": {"hu": "A rejtett prioritás kiderül, a nyomás felére csökken.", "en": "The hidden priority comes out and the pressure halves.", "de": "Die versteckte Priorität kommt ans Licht, der Druck halbiert sich."}
        },
        {
          "cardId": "c_reframe_03",
          "category": "REFRAMING",
          "text": {"hu": "Akkor holnap ne magyarázkodj, hanem mutass egy tervet. Abban segítek.", "en": "Then tomorrow don't explain yourself, show a plan. I'll help you with that.", "de": "Dann rechtfertige dich morgen nicht, sondern zeig einen Plan. Dabei helfe ich dir."},
          "delta": {"escalation": -14, "grounding": 11, "confusion": 17},
          "npcReaction": {"hu": "Egy terv... oké, az jobban hangzik.", "en": "A plan... okay, that sounds better.", "de": "Ein Plan... okay, das klingt besser."},
          "nextNodeId": "step_03_plan",
          "debriefHint": {"hu": "A félelmet felváltja egy kontrollálható cél.", "en": "Fear is replaced by a goal you can control.", "de": "Die Angst wird durch ein kontrollierbares Ziel ersetzt."}
        },
        {
          "cardId": "c_defense_03",
          "category": "DEFENSE",
          "text": {"hu": "Ma délután nem fér bele, más feladatom is van.", "en": "It won't fit this afternoon, I have other tasks too.", "de": "Heute Nachmittag geht das nicht, ich habe auch andere Aufgaben."},
          "delta": {"escalation": 20, "grounding": -15, "confusion": 0},
          "npcReaction": {"hu": "Mindenkinek van más feladata!", "en": "Everyone has other tasks!", "de": "Jeder hat andere Aufgaben!"},
          "nextNodeId": "step_03_cold",
          "debriefHint": {"hu": "A határ jogos, de indoklás és alternatíva nélkül elutasításnak hat.", "en": "The boundary is fair, but without a reason or an alternative it sounds like a refusal.", "de": "Die Grenze ist berechtigt, wirkt aber ohne Begründung und Alternative wie eine Absage."}
        },
        {
          "cardId": "c_attack_03",
          "category": "ATTACK",
          "text": {"hu": "Akkor csináld meg te, ha ennyire sürgős.", "en": "Then do it yourself if it's that urgent.", "de": "Dann mach's doch selbst, wenn es so dringend ist."},
          "delta": {"escalation": 40, "grounding": -30, "confusion": -25},
          "npcReaction": {"hu": "Ezt most nem hallottam.", "en": "I didn't just hear that.", "de": "Das habe ich jetzt nicht gehört."},
          "nextNodeId": "step_03_cold",
          "debriefHint": {"hu": "A provokáció bezárja a párbeszédet.", "en": "Provocation shuts the dialogue down.", "de": "Provokation beendet den Dialog."}
        }
      ]
    },
    {
      "nodeId": "step_02_escalated",
      "tone": "FURIOUS",
      "npcStatement": {"hu": "Tudod mit? Mindig ez van veled. Mindig van egy kifogásod!", "en": "You know what? It's always like this with you. You always have an excuse!", "de": "Weißt du was? Mit dir ist es immer dasselbe. Du hast immer eine Ausrede!"},
      "availableCards": [
        {
          "cardId": "c_pace_04",
          "category": "PACING",
          "text": {"hu": "Hallom, hogy nagyon eleged van ebből. Igazad van, ez így nem jó egyikünknek sem.", "en": "I hear that you're really fed up with this. You're right, this isn't good for either of us.", "de": "Ich höre, dass du die Nase gestrichen voll hast. Du hast recht, so ist das für keinen von uns gut."},
          "delta": {"escalation": -22, "grounding": 6, "confusion": 8},
          "npcReaction": {"hu": "...Hát nem. Tényleg nem jó.", "en": "...No. It really isn't good.", "de": "...Nein. Wirklich nicht gut."},
          "nextNodeId": "step_03_plan",
          "debriefHint": {"hu": "A nyílt elismerés még csúcson lévő dühnél is megtöri a lendületet.", "en": "Open acknowledgement breaks the momentum even at peak anger.", "de": "Offene Anerkennung bricht selbst auf dem Höhepunkt der Wut den Schwung."}
        },
        {
          "cardId": "c_metamodel_04",
          "category": "META_MODEL",
          "text": {"hu": "Mikor volt pontosan az, amikor 'mindig' kifogásom volt?", "en": "When exactly did I 'always' have an excuse?", "de": "Wann genau hatte ich 'immer' eine Ausrede?"},
          "delta": {"escalation": 4, "grounding": -4, "confusion": 26},
          "npcReaction": {"hu": "Hát... a múlt hónapban is. Meg most.", "en": "Well... last month too. And now.", "de": "Na ja... letzten Monat auch. Und jetzt."},
          "nextNodeId": "step_03_cold",
          "debriefHint": {"hu": "A „mindig” megkérdezése jó irány, de dühös partnernél előbb validálj.", "en": "Questioning \"always\" is the right direction, but validate an angry partner first.", "de": "„Immer“ zu hinterfragen ist die richtige Richtung, aber bei Wut zuerst validieren."}
        },
        {
          "cardId": "c_defense_04",
          "category": "DEFENSE",
          "text": {"hu": "Ez nem kifogás, hanem tény. Nézd meg a jegyeket.", "en": "It's not an excuse, it's a fact. Look at the tickets.", "de": "Das ist keine Ausrede, das ist ein Fakt. Schau dir die Tickets an."},
          "delta": {"escalation": 22, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "A jegyeid nem fognak az ügyfélnek magyarázkodni!", "en": "Your tickets won't explain anything to the client!", "de": "Deine Tickets werden dem Kunden nichts erklären!"},
          "nextNodeId": "step_03_cold",
          "debriefHint": {"hu": "Tényekkel győzködni dühös embert ritkán működik.", "en": "Arguing with facts rarely works with an angry person.", "de": "Mit Fakten zu argumentieren funktioniert bei einem wütenden Menschen selten."}
        },
        {
          "cardId": "c_attack_04",
          "category": "ATTACK",
          "text": {"hu": "Neked meg mindig valaki más a hibás.", "en": "And with you it's always someone else's fault.", "de": "Und bei dir ist immer jemand anderes schuld."},
          "delta": {"escalation": 42, "grounding": -32, "confusion": -28},
          "npcReaction": {"hu": "Most komolyan ezt csináljuk?!", "en": "Are we seriously doing this now?!", "de": "Machen wir das jetzt wirklich?!"},
          "nextNodeId": "step_03_cold",
          "debriefHint": {"hu": "Tükörvád: ugyanazt a mintát adod vissza, amit kaptál.", "en": "Mirror accusation: you hand back the same pattern you received.", "de": "Spiegelvorwurf: Du gibst genau das Muster zurück, das du bekommen hast."}
        }
      ]
    },
    {
      "nodeId": "step_03_plan",
      "tone": "TENSE",
      "npcStatement": {"hu": "Jó. Akkor mit mondjak az ügyfélnek, mikorra lesz meg?", "en": "Fine. So what do I tell the client, when will it be done?", "de": "Gut. Was sage ich also dem Kunden, wann ist es fertig?"},
      "availableCards": [
        {
          "cardId": "c_pace_05",
          "category": "PACING",
          "text": {"hu": "Értem, hogy egy biztos számot szeretnél, amit nyugodtan kimondhatsz.", "en": "I understand you want a reliable number you can say with confidence.", "de": "Ich verstehe, du willst eine sichere Zahl, die du ruhig aussprechen kannst."},
          "delta": {"escalation": -15, "grounding": 6, "confusion": 6},
          "npcReaction": {"hu": "Igen, pont erre van szükségem.", "en": "Yes, that's exactly what I need.", "de": "Ja, genau das brauche ich."},
          "nextNodeId": "step_04_commit",
          "debriefHint": {"hu": "A partner valódi igényének kimondása előkészíti a megállapodást.", "en": "Naming your partner's real need prepares the agreement.", "de": "Das echte Bedürfnis des Gegenübers zu benennen, bereitet die Einigung vor."}
        },
        {
          "cardId": "c_metamodel_05",
          "category": "META_MODEL",
          "text": {"hu": "Mi az a minimum, amit holnap reggel működve kell látnia az ügyfélnek?", "en": "What's the minimum the client needs to see working tomorrow morning?", "de": "Was muss der Kunde morgen früh mindestens funktionierend sehen?"},
          "delta": {"escalation": -3, "grounding": -2, "confusion": 30},
          "npcReaction": {"hu": "Hogy a számla generálódjon. A többi mehet később.", "en": "That invoices get generated. The rest can come later.", "de": "Dass die Rechnungen erstellt werden. Der Rest kann später kommen."},
          "nextNodeId": "step_04_commit",
          "debriefHint": {"hu": "A minimum rákérdezése a reális megoldás felé vezet.", "en": "Asking for the minimum leads to a realistic solution.", "de": "Nach dem Minimum zu fragen, führt zu einer realistischen Lösung."}
        },
        {
          "cardId": "c_reframe_04",
          "category": "REFRAMING",
          "text": {"hu": "Mondjuk neki azt, hogy holnapra a legfontosabb rész kész, és a többire pontos ütemtervet kap.", "en": "Let's tell them the most important part will be done tomorrow, and they'll get an exact schedule for the rest.", "de": "Sagen wir ihm, dass der wichtigste Teil morgen fertig ist und er für den Rest einen genauen Zeitplan bekommt."},
          "delta": {"escalation": -15, "grounding": 12, "confusion": 20},
          "npcReaction": {"hu": "Ez... ezt el tudom adni.", "en": "That... that I can sell.", "de": "Das... das kann ich verkaufen."},
          "nextNodeId": "step_04_commit",
          "debriefHint": {"hu": "A részleges szállítás pozitív keretben sikerként hangzik.", "en": "Partial delivery framed positively sounds like success.", "de": "Eine Teillieferung, positiv gerahmt, klingt nach Erfolg."}
        },
        {
          "cardId": "c_defense_05",
          "category": "DEFENSE",
          "text": {"hu": "Nem tudom, ezt nem én döntöm el.", "en": "I don't know, that's not my decision.", "de": "Weiß ich nicht, das entscheide nicht ich."},
          "delta": {"escalation": 16, "grounding": -15, "confusion": 0},
          "npcReaction": {"hu": "Akkor ki dönti el, ha nem te?", "en": "Then whose is it, if not yours?", "de": "Wer denn sonst, wenn nicht du?"},
          "nextNodeId": "step_04_commit",
          "debriefHint": {"hu": "A felelősség áttolása tehetetlenségnek hat.", "en": "Shifting responsibility comes across as helplessness.", "de": "Verantwortung abzuschieben wirkt hilflos."}
        }
      ]
    },
    {
      "nodeId": "step_03_cold",
      "tone": "COLD",
      "npcStatement": {"hu": "Rendben. Akkor ezt majd a vezetőséggel beszéljük meg, nem veled.", "en": "Fine. Then I'll discuss this with management, not with you.", "de": "Gut. Dann bespreche ich das mit der Geschäftsleitung, nicht mit dir."},
      "availableCards": [
        {
          "cardId": "c_pace_06",
          "category": "PACING",
          "text": {"hu": "Értem, hogy most nem bízol bennem. Ezt meg tudom érteni.", "en": "I understand you don't trust me right now. I can understand that.", "de": "Ich verstehe, dass du mir gerade nicht vertraust. Das kann ich nachvollziehen."},
          "delta": {"escalation": -18, "grounding": 7, "confusion": 10},
          "npcReaction": {"hu": "...Nem erről van szó. Csak fáradt vagyok.", "en": "...That's not it. I'm just tired.", "de": "...Darum geht es nicht. Ich bin einfach müde."},
          "nextNodeId": "step_04_commit",
          "debriefHint": {"hu": "A hideg visszahúzódást is lehet validálni, és ez újranyitja a kaput.", "en": "Even cold withdrawal can be validated, and that reopens the door.", "de": "Auch kühlen Rückzug kann man validieren, und das öffnet die Tür wieder."}
        },
        {
          "cardId": "c_metamodel_06",
          "category": "META_MODEL",
          "text": {"hu": "Mit szeretnél, mi történjen a vezetőséggel való beszélgetés után?", "en": "What would you like to happen after the conversation with management?", "de": "Was soll nach dem Gespräch mit der Geschäftsleitung passieren?"},
          "delta": {"escalation": -2, "grounding": -1, "confusion": 27},
          "npcReaction": {"hu": "Hogy végre legyen egy tiszta terv.", "en": "That we finally have a clear plan.", "de": "Dass es endlich einen klaren Plan gibt."},
          "nextNodeId": "step_04_commit",
          "debriefHint": {"hu": "A fenyegetés mögötti szándék rákérdezése a valódi célt hozza felszínre.", "en": "Asking about the intent behind the threat brings the real goal to the surface.", "de": "Nach der Absicht hinter der Drohung zu fragen, bringt das eigentliche Ziel ans Licht."}
        },
        {
          "cardId": "c_reframe_05",
          "category": "REFRAMING",
          "text": {"hu": "Vigyünk a vezetőség elé együtt egy kész tervet, akkor nem panaszkodni megyünk, hanem megoldást mutatni.", "en": "Let's take a finished plan to management together. Then we're not going there to complain, but to show a solution.", "de": "Legen wir der Geschäftsleitung gemeinsam einen fertigen Plan vor. Dann beschweren wir uns nicht, sondern zeigen eine Lösung."},
          "delta": {"escalation": -13, "grounding": 11, "confusion": 19},
          "npcReaction": {"hu": "Együtt? Hm. Ez talán jobb.", "en": "Together? Hm. That might be better.", "de": "Gemeinsam? Hm. Das wäre vielleicht besser."},
          "nextNodeId": "step_04_commit",
          "debriefHint": {"hu": "A fenyegetés közös lehetőséggé alakul.", "en": "The threat turns into a shared opportunity.", "de": "Aus der Drohung wird eine gemeinsame Chance."}
        },
        {
          "cardId": "c_attack_05",
          "category": "ATTACK",
          "text": {"hu": "Csak nyugodtan, menj, árulkodj.", "en": "Go ahead, go and tell on me.", "de": "Nur zu, geh petzen."},
          "delta": {"escalation": 36, "grounding": -26, "confusion": -21},
          "npcReaction": {"hu": "Pontosan ezt fogom tenni.", "en": "That's exactly what I'll do.", "de": "Genau das werde ich tun."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A gúny lezárja a beszélgetést, a konfliktus magasabb szintre kerül.", "en": "Sarcasm closes the conversation and the conflict moves up a level.", "de": "Spott beendet das Gespräch, und der Konflikt landet eine Ebene höher."}
        }
      ]
    },
    {
      "nodeId": "step_04_commit",
      "tone": "CALM",
      "npcStatement": {"hu": "Figyelj, nem vagyok az ellenséged. Csak tudnom kell, hogy számíthatok rád.", "en": "Listen, I'm not your enemy. I just need to know I can count on you.", "de": "Hör zu, ich bin nicht deine Feindin. Ich muss nur wissen, dass ich mich auf dich verlassen kann."},
      "availableCards": [
        {
          "cardId": "c_pace_07",
          "category": "PACING",
          "text": {"hu": "Értem. Fontos neked, hogy ne egyedül vidd a terhet.", "en": "I understand. It matters to you not to carry the load alone.", "de": "Verstehe. Dir ist wichtig, die Last nicht allein zu tragen."},
          "delta": {"escalation": -15, "grounding": 8, "confusion": 8},
          "npcReaction": {"hu": "Igen. Köszönöm, hogy ezt kimondtad.", "en": "Yes. Thank you for saying that.", "de": "Ja. Danke, dass du das aussprichst."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A záró validálás megerősíti a kapcsolatot.", "en": "A closing validation strengthens the relationship.", "de": "Eine abschließende Validierung stärkt die Beziehung."}
        },
        {
          "cardId": "c_metamodel_07",
          "category": "META_MODEL",
          "text": {"hu": "Mit jelentene neked konkrétan, hogy számíthatsz rám?", "en": "What would 'counting on me' mean to you, concretely?", "de": "Was würde es für dich konkret bedeuten, dich auf mich verlassen zu können?"},
          "delta": {"escalation": -5, "grounding": 0, "confusion": 30},
          "npcReaction": {"hu": "Hogy szólsz előre, ha csúszik valami. Ennyi.", "en": "That you tell me in advance when something slips. That's all.", "de": "Dass du vorher Bescheid sagst, wenn etwas rutscht. Das ist alles."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A homályos elvárás konkrét, betartható megállapodássá válik.", "en": "A vague expectation becomes a concrete, keepable agreement.", "de": "Aus einer vagen Erwartung wird eine konkrete, einhaltbare Vereinbarung."}
        },
        {
          "cardId": "c_reframe_06",
          "category": "REFRAMING",
          "text": {"hu": "Számíthatsz. Legyen ez az első sprint, ahol hétfőn közösen nézzük át a kockázatokat.", "en": "You can. Let's make this the first sprint where we go through the risks together on Monday.", "de": "Kannst du. Machen wir das zum ersten Sprint, in dem wir montags gemeinsam die Risiken durchgehen."},
          "delta": {"escalation": -12, "grounding": 12, "confusion": 18},
          "npcReaction": {"hu": "Ez jó ötlet. Hétfő tíz óra?", "en": "Good idea. Monday at ten?", "de": "Gute Idee. Montag um zehn?"},
          "nextNodeId": null,
          "debriefHint": {"hu": "A konfliktusból közös rutin születik.", "en": "A shared routine is born out of the conflict.", "de": "Aus dem Konflikt entsteht eine gemeinsame Routine."}
        },
        {
          "cardId": "c_defense_06",
          "category": "DEFENSE",
          "text": {"hu": "Eddig is számíthattál, csak nem vetted észre.", "en": "You could always count on me, you just didn't notice.", "de": "Du konntest dich immer auf mich verlassen, du hast es nur nicht bemerkt."},
          "delta": {"escalation": 17, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "Hát, ez most nem esett jól.", "en": "Well, that didn't feel good.", "de": "Hm, das tat jetzt nicht gut."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A sértettség a végén is visszanyithatja a konfliktust.", "en": "Hurt pride can reopen the conflict even at the end.", "de": "Gekränktheit kann den Konflikt auch am Ende wieder aufreißen."}
        }
      ]
    },
    {
      "nodeId": "pm_escalated_crisis",
      "branch": "crisis",
      "tone": "FURIOUS",
      "npcStatement": {"hu": "Elég! Nem érdekel a magyarázat! Holnaptól mást teszek a projektre!", "en": "Enough! I don't care about explanations! From tomorrow someone else is on this project!", "de": "Schluss! Erklärungen interessieren mich nicht! Ab morgen setze ich jemand anderen auf das Projekt!"},
      "availableCards": [
        {
          "cardId": "c_pace_08",
          "category": "PACING",
          "text": {"hu": "Látom, hogy most nagyon dühös vagy, és teljesen érthető, hogy így érzel.", "en": "I can see you're really angry right now, and it's completely understandable that you feel this way.", "de": "Ich sehe, dass du gerade richtig wütend bist, und es ist völlig verständlich, dass du so fühlst."},
          "delta": {"escalation": -22, "grounding": 8, "confusion": 10},
          "npcReaction": {"hu": "...Igen. Dühös vagyok.", "en": "...Yes. I'm angry.", "de": "...Ja. Ich bin wütend."},
          "nextNodeId": "pm_crisis_02",
          "debriefHint": {"hu": "Krízisben a legrövidebb út a lenyugváshoz az érzelem elismerése.", "en": "In a crisis, acknowledging the emotion is the shortest path to calm.", "de": "In der Krise ist das Anerkennen der Emotion der kürzeste Weg zur Beruhigung."}
        },
        {
          "cardId": "c_metamodel_08",
          "category": "META_MODEL",
          "text": {"hu": "Mi az, ami most a legjobban aggaszt?", "en": "What worries you most right now?", "de": "Was macht dir gerade am meisten Sorgen?"},
          "delta": {"escalation": -5, "grounding": -3, "confusion": 28},
          "npcReaction": {"hu": "Hogy elveszítjük az ügyfelet.", "en": "That we lose the client.", "de": "Dass wir den Kunden verlieren."},
          "nextNodeId": "pm_crisis_02",
          "debriefHint": {"hu": "A félelem megnevezése kiveszi a dühből az élt.", "en": "Naming the fear takes the edge off the anger.", "de": "Die Angst zu benennen, nimmt der Wut die Schärfe."}
        },
        {
          "cardId": "c_defense_07",
          "category": "DEFENSE",
          "text": {"hu": "Ez nem fair, én dolgoztam a legtöbbet ezen.", "en": "That's not fair, I worked the most on this.", "de": "Das ist nicht fair, ich habe am meisten daran gearbeitet."},
          "delta": {"escalation": 20, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "A fair most senkit nem érdekel.", "en": "Nobody cares about fair right now.", "de": "Fair interessiert gerade niemanden."},
          "nextNodeId": "pm_crisis_02",
          "debriefHint": {"hu": "Krízisben az igazságérzet védelme olaj a tűzre.", "en": "In a crisis, defending your sense of justice is fuel on the fire.", "de": "In der Krise ist die Verteidigung des eigenen Gerechtigkeitsgefühls Öl ins Feuer."}
        },
        {
          "cardId": "c_attack_06",
          "category": "ATTACK",
          "text": {"hu": "Tegyél csak, úgysem bírnád nélkülem.", "en": "Go ahead, you couldn't manage without me anyway.", "de": "Nur zu, ohne mich schaffst du das sowieso nicht."},
          "delta": {"escalation": 44, "grounding": -34, "confusion": -28},
          "npcReaction": {"hu": "Majd meglátjuk.", "en": "We'll see about that.", "de": "Das werden wir ja sehen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A dac itt szakításhoz vezet.", "en": "Defiance here leads to a rupture.", "de": "Trotz führt hier zum Bruch."}
        }
      ]
    },
    {
      "nodeId": "pm_crisis_02",
      "branch": "crisis",
      "tone": "TENSE",
      "npcStatement": {"hu": "Jó. Akkor mondd meg, miért kéne még bíznom benned.", "en": "Fine. Then tell me why I should still trust you.", "de": "Gut. Dann sag mir, warum ich dir noch vertrauen sollte."},
      "availableCards": [
        {
          "cardId": "c_pace_09",
          "category": "PACING",
          "text": {"hu": "Értem, hogy a bizalmad most megrendült. Ezt nem szavakkal akarom visszanyerni.", "en": "I understand your trust is shaken right now. I don't want to win it back with words.", "de": "Ich verstehe, dass dein Vertrauen gerade erschüttert ist. Ich will es nicht mit Worten zurückgewinnen."},
          "delta": {"escalation": -18, "grounding": 7, "confusion": 9},
          "npcReaction": {"hu": "Akkor mivel?", "en": "Then with what?", "de": "Womit dann?"},
          "nextNodeId": null,
          "debriefHint": {"hu": "A megrendült bizalom kimondása őszinteséget jelez.", "en": "Naming the shaken trust signals honesty.", "de": "Das erschütterte Vertrauen auszusprechen, signalisiert Ehrlichkeit."}
        },
        {
          "cardId": "c_reframe_07",
          "category": "REFRAMING",
          "text": {"hu": "Ne bízz bennem vakon. Holnap tízre ott lesz a működő számlázás, és abból dönts.", "en": "Don't trust me blindly. Tomorrow at ten the billing will be working, decide based on that.", "de": "Vertrau mir nicht blind. Morgen um zehn läuft die Abrechnung, entscheide danach."},
          "delta": {"escalation": -14, "grounding": 12, "confusion": 22},
          "npcReaction": {"hu": "Rendben. Holnap tíz. Meglátjuk.", "en": "Fine. Tomorrow at ten. We'll see.", "de": "Gut. Morgen um zehn. Wir werden sehen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A bizalom kérdését mérhető tetté alakítod.", "en": "You turn the question of trust into a measurable action.", "de": "Du verwandelst die Vertrauensfrage in eine messbare Handlung."}
        },
        {
          "cardId": "c_metamodel_09",
          "category": "META_MODEL",
          "text": {"hu": "Mi kellene ahhoz, hogy újra bízni tudj bennem?", "en": "What would it take for you to trust me again?", "de": "Was bräuchte es, damit du mir wieder vertrauen kannst?"},
          "delta": {"escalation": -4, "grounding": -2, "confusion": 30},
          "npcReaction": {"hu": "Egy működő számlázás holnap reggelre.", "en": "Working billing by tomorrow morning.", "de": "Eine funktionierende Abrechnung bis morgen früh."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A feltétel kimondatása a partnerrel közös mércét teremt.", "en": "Letting your partner state the condition creates a shared yardstick.", "de": "Wenn das Gegenüber die Bedingung selbst nennt, entsteht ein gemeinsamer Maßstab."}
        },
        {
          "cardId": "c_defense_08",
          "category": "DEFENSE",
          "text": {"hu": "Mert eddig is mindig leszállítottam, csak most csúsztunk.", "en": "Because I've always delivered so far, we only slipped this time.", "de": "Weil ich bisher immer geliefert habe, nur diesmal sind wir gerutscht."},
          "delta": {"escalation": 18, "grounding": -15, "confusion": 0},
          "npcReaction": {"hu": "A „csak most” az ügyfélnek nem számít.", "en": "\"Only this time\" doesn't matter to the client.", "de": "„Nur diesmal“ zählt für den Kunden nicht."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A múltra hivatkozás most nem válasz a jelen aggodalmára.", "en": "Pointing to the past doesn't answer today's worry.", "de": "Der Verweis auf die Vergangenheit beantwortet nicht die heutige Sorge."}
        }
      ]
    }
  ]
}
```

Path check for the validator: shortest main path `step_01 > step_02_escalated > step_03_cold` + card `c_attack_05` (null) = 3 nodes. Longest: `step_01 > step_02_* > step_03_* > step_04_commit` = 4 nodes. Crisis depth 2. All E013 constraints hold. `c_defense_01` produces W101 warnings, by design (D10).

### 22.3 Scenario `scen_stakeholder_scope_002`

P1, BEGINNER, initial E 45, no timer. File: `public/scenarios/scen_stakeholder_scope_002.json`.

Graph:

```
s2_01 --pace/metamodel/reframe--> s2_02_open --any--> s2_03_options --any--> s2_04_close -> (end)
      --defense/attack----------> s2_02_push --any--> s2_03_options
crisis: scope_escalated_crisis -> scope_crisis_02 -> (end)   (c_s2_att_05 ends directly)
Main path length: always 4 nodes.
```

```json
{
  "$schema": "https://aikido-game.internal/schemas/v1/scenario.json",
  "schemaVersion": "1.0",
  "id": "scen_stakeholder_scope_002",
  "contentVersion": 1,
  "title": {"hu": "A Scope-Kúszás Hétfő Reggel", "en": "Scope Creep on a Monday Morning", "de": "Scope Creep am Montagmorgen"},
  "summary": {"hu": "Egy üzleti stakeholder két új funkciót akar a futó sprintbe, mert a vezérigazgató már megígérte. Mondj nemet úgy, hogy szövetséges maradj.", "en": "A business stakeholder wants two new features in the running sprint because the CEO has already promised them. Say no and stay an ally.", "de": "Ein Business-Stakeholder will zwei neue Features im laufenden Sprint, weil der CEO sie schon versprochen hat. Sag Nein und bleib trotzdem Verbündeter."},
  "briefing": {"hu": "Hétfő reggel, kilenc óra. {npc_name} egy kinyomtatott e-maillel érkezik a csapatszobába. A vezérigazgató a partnereknek már bejelentette a két új funkciót, és most minden a {trigger_word} körül forog. A sprint tele van.", "en": "Monday morning, nine o'clock. {npc_name} walks into the team room with a printed e-mail. The CEO has already announced the two new features to the partners, and now it is all about {trigger_word}. The sprint is full.", "de": "Montagmorgen, neun Uhr. {npc_name} kommt mit einer ausgedruckten E-Mail in den Teamraum. Der CEO hat den Partnern die zwei neuen Features bereits angekündigt, und jetzt dreht sich alles um die {trigger_word}. Der Sprint ist voll."},
  "difficulty": "BEGINNER",
  "personas": ["P1_MANAGER"],
  "npc": {
    "name": {"hu": "Tamás", "en": "Tamás", "de": "Tamás"},
    "role": {"hu": "üzleti stakeholder", "en": "business stakeholder", "de": "Business-Stakeholder"}
  },
  "variables": {
    "trigger_word": {"hu": "prioritás", "en": "priority", "de": "Priorität"}
  },
  "initialState": {"escalation": 45, "grounding": 100, "confusion": 0},
  "startNodeId": "s2_01",
  "nodes": [
    {
      "nodeId": "s2_01",
      "tone": "TENSE",
      "npcStatement": {"hu": "Ezt a két funkciót még ebbe a sprintbe be kell tenni. A vezérigazgató már megígérte a partnereknek, nincs mit megbeszélni.", "en": "These two features have to go into this sprint. The CEO already promised them to the partners, there's nothing to discuss.", "de": "Diese zwei Features müssen noch in diesen Sprint. Der CEO hat sie den Partnern schon versprochen, da gibt es nichts zu diskutieren."},
      "availableCards": [
        {
          "cardId": "c_s2_pace_01",
          "category": "PACING",
          "text": {"hu": "Értem, kellemetlen helyzetbe kerültél, hogy ez a fejed fölött lett kimondva.", "en": "I understand, it put you in an awkward spot that this was announced over your head.", "de": "Verstehe, das bringt dich in eine blöde Lage, dass das über deinen Kopf hinweg angekündigt wurde."},
          "delta": {"escalation": -18, "grounding": 7, "confusion": 8},
          "npcReaction": {"hu": "Pontosan. Senki nem kérdezett meg.", "en": "Exactly. Nobody asked me.", "de": "Genau. Mich hat keiner gefragt."},
          "nextNodeId": "s2_02_open",
          "debriefHint": {"hu": "Ha elismered a nyomást, amiben a partner van, nem ellenfélként kezel.", "en": "If you acknowledge the pressure your partner is under, they stop treating you as an opponent.", "de": "Wenn du den Druck anerkennst, unter dem dein Gegenüber steht, behandelt er dich nicht als Gegner."}
        },
        {
          "cardId": "c_s2_meta_01",
          "category": "META_MODEL",
          "text": {"hu": "Pontosan mit ígért meg a vezérigazgató, és milyen dátumra?", "en": "What exactly did the CEO promise, and for what date?", "de": "Was genau hat der CEO versprochen, und für welches Datum?"},
          "delta": {"escalation": -4, "grounding": -2, "confusion": 30},
          "npcReaction": {"hu": "Hát... azt mondta, „hamarosan”. Dátumot nem mondott.", "en": "Well... he said \"soon\". He didn't give a date.", "de": "Na ja... er hat „bald“ gesagt. Ein Datum hat er nicht genannt."},
          "nextNodeId": "s2_02_open",
          "debriefHint": {"hu": "Az „ígérte” mögött gyakran nincs konkrét határidő. Rákérdezni olcsó, és sokat hoz.", "en": "There is often no concrete deadline behind \"promised\". Asking is cheap and yields a lot.", "de": "Hinter „versprochen“ steckt oft keine konkrete Frist. Nachfragen kostet wenig und bringt viel."}
        },
        {
          "cardId": "c_s2_reframe_01",
          "category": "REFRAMING",
          "text": {"hu": "Mindketten azt szeretnénk, hogy a partnerek működő funkciót kapjanak, ne félkészet. Nézzük meg, mi fér bele biztonsággal.", "en": "We both want the partners to get a working feature, not a half-finished one. Let's see what fits safely.", "de": "Wir wollen beide, dass die Partner ein funktionierendes Feature bekommen, kein halbfertiges. Schauen wir, was sicher reinpasst."},
          "delta": {"escalation": -14, "grounding": 11, "confusion": 18},
          "npcReaction": {"hu": "Félkészet tényleg nem akarok mutatni nekik.", "en": "I really don't want to show them something half-finished.", "de": "Halbfertiges will ich ihnen wirklich nicht zeigen."},
          "nextNodeId": "s2_02_open",
          "debriefHint": {"hu": "A közös cél behozása a „ki enged” kérdés helyett a minőségre tereli a vitát.", "en": "Bringing in the shared goal turns the argument from \"who gives in\" to quality.", "de": "Das gemeinsame Ziel lenkt den Streit von „wer gibt nach“ auf die Qualität."}
        },
        {
          "cardId": "c_s2_def_01",
          "category": "DEFENSE",
          "text": {"hu": "A sprint már le van zárva, ezt nem lehet csak úgy módosítani.", "en": "The sprint is already locked, we can't just change it.", "de": "Der Sprint ist schon fixiert, den kann man nicht einfach ändern."},
          "delta": {"escalation": 18, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "A folyamatod engem nem érdekel, a vezérigazgatót sem fogja.", "en": "I don't care about your process, and neither will the CEO.", "de": "Dein Prozess interessiert mich nicht, und den CEO auch nicht."},
          "nextNodeId": "s2_02_push",
          "debriefHint": {"hu": "A szabályra hivatkozás bürokratikusnak hat, a partner falnak érzi.", "en": "Pointing to the rules sounds bureaucratic, your partner feels they hit a wall.", "de": "Der Verweis auf Regeln wirkt bürokratisch, dein Gegenüber läuft gegen eine Wand."}
        },
        {
          "cardId": "c_s2_att_01",
          "category": "ATTACK",
          "text": {"hu": "Talán a vezérigazgató megkérdezhetne minket, mielőtt ígérget.", "en": "Maybe the CEO could ask us before making promises.", "de": "Vielleicht könnte der CEO uns fragen, bevor er etwas verspricht."},
          "delta": {"escalation": 34, "grounding": -27, "confusion": -22},
          "npcReaction": {"hu": "Ezt most nekem mondod? Szólj neki te!", "en": "You're telling me that? Tell him yourself!", "de": "Das sagst du mir? Sag's ihm doch selbst!"},
          "nextNodeId": "s2_02_push",
          "debriefHint": {"hu": "A felettes kritizálása az üzenet hozóját szorítja védekezésbe.", "en": "Criticizing the boss puts the messenger on the defensive.", "de": "Kritik am Chef drängt den Überbringer der Nachricht in die Defensive."}
        }
      ]
    },
    {
      "nodeId": "s2_02_open",
      "tone": "CALM",
      "npcStatement": {"hu": "Jó, de valamit akkor is mutatnom kell nekik a hónap végén. Mit tudunk tenni?", "en": "Fine, but I still need to show them something at the end of the month. What can we do?", "de": "Okay, aber ich muss ihnen Ende des Monats trotzdem etwas zeigen. Was können wir tun?"},
      "availableCards": [
        {
          "cardId": "c_s2_pace_02",
          "category": "PACING",
          "text": {"hu": "Érthető, hogy kézzelfogható eredménnyel szeretnél előállni.", "en": "It makes sense that you want to show up with something tangible.", "de": "Verständlich, dass du mit etwas Greifbarem auftreten willst."},
          "delta": {"escalation": -16, "grounding": 6, "confusion": 7},
          "npcReaction": {"hu": "Igen, különben én maradok szégyenben.", "en": "Yes, otherwise I'm the one who looks bad.", "de": "Ja, sonst stehe ich blamiert da."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "Az igény kimondása után a partner nyitottabb a részletekre.", "en": "Once the need is named, your partner is more open to details.", "de": "Wenn das Bedürfnis ausgesprochen ist, ist das Gegenüber offener für Details."}
        },
        {
          "cardId": "c_s2_meta_02",
          "category": "META_MODEL",
          "text": {"hu": "Ha csak egy {trigger_word} lehet: melyik funkció nélkül nem tudnak továbblépni a partnerek?", "en": "If there can be only one {trigger_word}: which feature can the partners not move forward without?", "de": "Wenn es nur eine {trigger_word} geben kann: Ohne welches Feature kommen die Partner nicht weiter?"},
          "delta": {"escalation": -3, "grounding": -1, "confusion": 32},
          "npcReaction": {"hu": "Igazából csak az exportálás. A másik csak szép lenne.", "en": "Actually just the export. The other one would just be nice.", "de": "Eigentlich nur der Export. Das andere wäre nur nett."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A prioritás tisztázása gyakran felére csökkenti a kérést.", "en": "Clarifying the priority often cuts the request in half.", "de": "Die Priorität zu klären, halbiert oft die Anfrage."}
        },
        {
          "cardId": "c_s2_reframe_02",
          "category": "REFRAMING",
          "text": {"hu": "Mi lenne, ha a hónap végén egy működő demót mutatnál, mellé pedig egy pontos ütemtervet?", "en": "What if you showed a working demo at the end of the month, plus an exact roadmap?", "de": "Wie wäre es, wenn du Ende des Monats eine funktionierende Demo zeigst und dazu einen genauen Zeitplan?"},
          "delta": {"escalation": -12, "grounding": 12, "confusion": 20},
          "npcReaction": {"hu": "Demó és ütemterv... az profibb, mint egy félkész funkció.", "en": "Demo and roadmap... that's more professional than a half-finished feature.", "de": "Demo und Zeitplan... das ist professioneller als ein halbfertiges Feature."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A „nem” helyett egy jobb „igen” kínálása megőrzi a partner arcát.", "en": "Offering a better \"yes\" instead of a \"no\" lets your partner save face.", "de": "Ein besseres „Ja“ statt eines „Nein“ lässt dein Gegenüber das Gesicht wahren."}
        },
        {
          "cardId": "c_s2_def_02",
          "category": "DEFENSE",
          "text": {"hu": "Nem tudok csodát tenni, a csapat már így is túlórázik.", "en": "I can't work miracles, the team is already doing overtime.", "de": "Ich kann keine Wunder vollbringen, das Team macht schon Überstunden."},
          "delta": {"escalation": 17, "grounding": -17, "confusion": 0},
          "npcReaction": {"hu": "Mindenki túlórázik, ez nem érv.", "en": "Everyone's doing overtime, that's not an argument.", "de": "Alle machen Überstunden, das ist kein Argument."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A panasz lehet igaz, de a partner nem kap belőle megoldást.", "en": "The complaint may be true, but your partner gets no solution from it.", "de": "Die Klage mag stimmen, aber dein Gegenüber bekommt daraus keine Lösung."}
        },
        {
          "cardId": "c_s2_att_02",
          "category": "ATTACK",
          "text": {"hu": "Mutass, amit akarsz, az a te gondod.", "en": "Show whatever you want, that's your problem.", "de": "Zeig, was du willst, das ist dein Problem."},
          "delta": {"escalation": 36, "grounding": -28, "confusion": -24},
          "npcReaction": {"hu": "Remek. Akkor ezt majd a vezérigazgatóval beszélem meg.", "en": "Great. Then I'll discuss this with the CEO.", "de": "Super. Dann bespreche ich das eben mit dem CEO."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A felelősség eldobása lezárja az együttműködést.", "en": "Throwing away responsibility shuts down cooperation.", "de": "Verantwortung wegzuwerfen beendet die Zusammenarbeit."}
        }
      ]
    },
    {
      "nodeId": "s2_02_push",
      "tone": "ANGRY",
      "npcStatement": {"hu": "Nem érted? Ez nem kérés volt. Ha nem lesz kész, a te csapatod fogja megszívni.", "en": "Don't you get it? That wasn't a request. If it's not done, your team will pay for it.", "de": "Verstehst du nicht? Das war keine Bitte. Wenn es nicht fertig wird, bekommt dein Team die Quittung."},
      "availableCards": [
        {
          "cardId": "c_s2_pace_03",
          "category": "PACING",
          "text": {"hu": "Hallom, hogy komoly nyomás alatt vagy, és ezt most nekünk adod tovább. Érthető.", "en": "I hear you're under serious pressure, and now you're passing it on to us. That's understandable.", "de": "Ich höre, dass du unter großem Druck stehst und ihn jetzt an uns weitergibst. Verständlich."},
          "delta": {"escalation": -20, "grounding": 8, "confusion": 9},
          "npcReaction": {"hu": "...Jó, igen. Nagy a nyomás.", "en": "...Okay, yes. The pressure is huge.", "de": "...Okay, ja. Der Druck ist riesig."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A nyomás láthatóvá tétele kiveszi a fenyegetésből az élt.", "en": "Making the pressure visible takes the edge off the threat.", "de": "Den Druck sichtbar zu machen, nimmt der Drohung die Schärfe."}
        },
        {
          "cardId": "c_s2_meta_03",
          "category": "META_MODEL",
          "text": {"hu": "Mit jelent pontosan, hogy „megszívjuk”? Mi történne konkrétan?", "en": "What exactly does \"pay for it\" mean? What would actually happen?", "de": "Was heißt konkret „die Quittung bekommen“? Was würde tatsächlich passieren?"},
          "delta": {"escalation": 3, "grounding": -4, "confusion": 27},
          "npcReaction": {"hu": "Hát... rossz fényben tűnnénk fel a negyedéves áttekintőn.", "en": "Well... we'd look bad at the quarterly review.", "de": "Na ja... wir stünden beim Quartalsreview schlecht da."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A fenyegetés konkretizálása működik, de dühös partnernél előbb validálj.", "en": "Making the threat concrete works, but validate an angry partner first.", "de": "Die Drohung zu konkretisieren funktioniert, aber bei Wut zuerst validieren."}
        },
        {
          "cardId": "c_s2_reframe_03",
          "category": "REFRAMING",
          "text": {"hu": "Pont azért szeretném jól csinálni, hogy a negyedéves áttekintőn mindkettőnk jól nézzen ki.", "en": "That's exactly why I want to do it right, so we both look good at the quarterly review.", "de": "Genau deshalb will ich es richtig machen, damit wir beide beim Quartalsreview gut dastehen."},
          "delta": {"escalation": -12, "grounding": 10, "confusion": 17},
          "npcReaction": {"hu": "Hm. Ebben van valami.", "en": "Hm. There's something to that.", "de": "Hm. Da ist was dran."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A fenyegetésből közös érdek lesz.", "en": "The threat becomes a shared interest.", "de": "Aus der Drohung wird ein gemeinsames Interesse."}
        },
        {
          "cardId": "c_s2_def_03",
          "category": "DEFENSE",
          "text": {"hu": "Nem fenyegetőzhetsz, nem te vagy a vezetőm.", "en": "You can't threaten me, you're not my manager.", "de": "Du kannst mir nicht drohen, du bist nicht mein Vorgesetzter."},
          "delta": {"escalation": 22, "grounding": -19, "confusion": 0},
          "npcReaction": {"hu": "Nem fenyegetőzöm, csak elmondom, mi lesz.", "en": "I'm not threatening, I'm just telling you what will happen.", "de": "Ich drohe nicht, ich sage nur, was passieren wird."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A hierarchiára hivatkozás hatalmi harcot nyit.", "en": "Pointing to hierarchy opens a power struggle.", "de": "Der Verweis auf die Hierarchie eröffnet einen Machtkampf."}
        },
        {
          "cardId": "c_s2_att_03",
          "category": "ATTACK",
          "text": {"hu": "Akkor talán neked kéne megtanulni nemet mondani.", "en": "Then maybe you should learn to say no.", "de": "Dann solltest vielleicht du lernen, Nein zu sagen."},
          "delta": {"escalation": 40, "grounding": -30, "confusion": -26},
          "npcReaction": {"hu": "Na, ezt nem hiszem el.", "en": "I can't believe this.", "de": "Das glaube ich jetzt nicht."},
          "nextNodeId": "s2_03_options",
          "debriefHint": {"hu": "A kioktatás személyes sértésként érkezik.", "en": "Lecturing lands as a personal insult.", "de": "Belehrung kommt als persönliche Kränkung an."}
        }
      ]
    },
    {
      "nodeId": "s2_03_options",
      "tone": "TENSE",
      "npcStatement": {"hu": "Oké. És mi az, amit biztosan meg tudtok csinálni a hónap végéig?", "en": "Okay. And what can you definitely deliver by the end of the month?", "de": "Okay. Und was könnt ihr bis Ende des Monats sicher liefern?"},
      "availableCards": [
        {
          "cardId": "c_s2_pace_04",
          "category": "PACING",
          "text": {"hu": "Értem, most olyan ígéret kell neked, amire tényleg építeni tudsz.", "en": "I understand, you need a promise you can actually build on.", "de": "Verstehe, du brauchst jetzt ein Versprechen, auf das du wirklich bauen kannst."},
          "delta": {"escalation": -15, "grounding": 7, "confusion": 6},
          "npcReaction": {"hu": "Igen. Még egy üres ígéret nem kell.", "en": "Yes. I don't need another empty promise.", "de": "Ja. Noch ein leeres Versprechen brauche ich nicht."},
          "nextNodeId": "s2_04_close",
          "debriefHint": {"hu": "A megbízhatóság igényének kimondása előkészíti a vállalást.", "en": "Naming the need for reliability prepares the commitment.", "de": "Das Bedürfnis nach Verlässlichkeit zu benennen, bereitet die Zusage vor."}
        },
        {
          "cardId": "c_s2_meta_04",
          "category": "META_MODEL",
          "text": {"hu": "Ha az exportálás kész lesz, mi kell még ahhoz, hogy a partnerek elégedettek legyenek?", "en": "If the export is done, what else do the partners need to be satisfied?", "de": "Wenn der Export fertig ist, was brauchen die Partner noch, um zufrieden zu sein?"},
          "delta": {"escalation": -5, "grounding": -2, "confusion": 30},
          "npcReaction": {"hu": "Igazából egy rövid bemutató, hogyan kell használni.", "en": "Actually a short demo of how to use it.", "de": "Eigentlich eine kurze Vorführung, wie man ihn benutzt."},
          "nextNodeId": "s2_04_close",
          "debriefHint": {"hu": "A siker kritériumának tisztázása kicsi, teljesíthető célt ad.", "en": "Clarifying the success criterion gives a small, achievable goal.", "de": "Das Erfolgskriterium zu klären, ergibt ein kleines, erreichbares Ziel."}
        },
        {
          "cardId": "c_s2_reframe_04",
          "category": "REFRAMING",
          "text": {"hu": "Az exportálás belefér, ha cserébe kiveszünk egy kisebb feladatot. Így a sprint is megmarad, és te is tudsz mit mutatni.", "en": "The export fits if we take out a smaller task in exchange. The sprint stays intact and you have something to show.", "de": "Der Export passt rein, wenn wir dafür eine kleinere Aufgabe rausnehmen. So bleibt der Sprint stabil und du hast etwas zu zeigen."},
          "delta": {"escalation": -15, "grounding": 13, "confusion": 22},
          "npcReaction": {"hu": "Csere... ez korrekt.", "en": "A swap... that's fair.", "de": "Ein Tausch... das ist fair."},
          "nextNodeId": "s2_04_close",
          "debriefHint": {"hu": "A csereajánlat nemet mond a túlterhelésre, igent a partnerre.", "en": "A trade-off says no to overload and yes to your partner.", "de": "Ein Tauschangebot sagt Nein zur Überlastung und Ja zum Gegenüber."}
        },
        {
          "cardId": "c_s2_def_04",
          "category": "DEFENSE",
          "text": {"hu": "Ezt most nem tudom megmondani, előbb a csapattal kell beszélnem.", "en": "I can't tell you right now, I have to talk to the team first.", "de": "Das kann ich jetzt nicht sagen, ich muss erst mit dem Team sprechen."},
          "delta": {"escalation": 15, "grounding": -15, "confusion": 0},
          "npcReaction": {"hu": "Mindig ez van, sosem tudsz semmit megmondani.", "en": "It's always like this, you can never tell me anything.", "de": "Immer dasselbe, du kannst nie etwas sagen."},
          "nextNodeId": "s2_04_close",
          "debriefHint": {"hu": "A halogatás bizonytalanságot sugall, akkor is, ha jogos.", "en": "Stalling signals uncertainty, even when it's justified.", "de": "Hinhalten signalisiert Unsicherheit, auch wenn es berechtigt ist."}
        }
      ]
    },
    {
      "nodeId": "s2_04_close",
      "tone": "CALM",
      "npcStatement": {"hu": "Rendben. Akkor ezt viszem a vezérigazgatónak. Remélem, nem fogok csalódni.", "en": "Alright. I'll take this to the CEO then. I hope I won't be disappointed.", "de": "In Ordnung. Dann bringe ich das so zum CEO. Ich hoffe, ich werde nicht enttäuscht."},
      "availableCards": [
        {
          "cardId": "c_s2_pace_05",
          "category": "PACING",
          "text": {"hu": "Érthető, hogy aggódsz. Azt kapod, amiben megállapodtunk.", "en": "It's understandable that you're worried. You'll get what we agreed on.", "de": "Verständlich, dass du dir Sorgen machst. Du bekommst, was wir vereinbart haben."},
          "delta": {"escalation": -15, "grounding": 8, "confusion": 7},
          "npcReaction": {"hu": "Jó. Köszi, hogy végig meghallgattál.", "en": "Good. Thanks for hearing me out.", "de": "Gut. Danke, dass du mir zugehört hast."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A záró validálás megerősíti a megállapodást.", "en": "A closing validation reinforces the agreement.", "de": "Eine abschließende Validierung festigt die Vereinbarung."}
        },
        {
          "cardId": "c_s2_meta_05",
          "category": "META_MODEL",
          "text": {"hu": "Mi segítene abban, hogy ne kelljen aggódnod a következő két hétben?", "en": "What would help you not to worry over the next two weeks?", "de": "Was würde dir helfen, dir in den nächsten zwei Wochen keine Sorgen zu machen?"},
          "delta": {"escalation": -4, "grounding": 0, "confusion": 29},
          "npcReaction": {"hu": "Egy rövid heti státusz e-mail. Ennyi.", "en": "A short weekly status e-mail. That's all.", "de": "Eine kurze wöchentliche Status-Mail. Mehr nicht."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A homályos aggodalomból konkrét, olcsó vállalás lesz.", "en": "A vague worry becomes a concrete, cheap commitment.", "de": "Aus einer vagen Sorge wird eine konkrete, günstige Zusage."}
        },
        {
          "cardId": "c_s2_reframe_05",
          "category": "REFRAMING",
          "text": {"hu": "Szerintem ez jó példa lesz arra, hogyan dolgozunk együtt gyorsan változó igényekkel.", "en": "I think this will be a good example of how we work together on fast-changing requirements.", "de": "Ich glaube, das wird ein gutes Beispiel dafür, wie wir bei schnell wechselnden Anforderungen zusammenarbeiten."},
          "delta": {"escalation": -12, "grounding": 11, "confusion": 16},
          "npcReaction": {"hu": "Tényleg. Ezt el is mondom neki.", "en": "True. I'll tell him that too.", "de": "Stimmt. Das sage ich ihm auch."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A konfliktus sikertörténetként keretezve erősíti a kapcsolatot.", "en": "Framing the conflict as a success story strengthens the relationship.", "de": "Den Konflikt als Erfolgsgeschichte zu rahmen, stärkt die Beziehung."}
        },
        {
          "cardId": "c_s2_att_04",
          "category": "ATTACK",
          "text": {"hu": "Ha csalódsz, az nem miattunk lesz.", "en": "If you're disappointed, it won't be because of us.", "de": "Wenn du enttäuscht wirst, dann nicht wegen uns."},
          "delta": {"escalation": 31, "grounding": -25, "confusion": -20},
          "npcReaction": {"hu": "Na tessék. Pont ettől féltem.", "en": "There we go. That's exactly what I was afraid of.", "de": "Na bitte. Genau davor hatte ich Angst."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Az utolsó szúrás lerombolja, amit addig felépítettél.", "en": "A final jab destroys what you had built up.", "de": "Der letzte Seitenhieb zerstört, was du aufgebaut hast."}
        }
      ]
    },
    {
      "nodeId": "scope_escalated_crisis",
      "branch": "crisis",
      "tone": "FURIOUS",
      "npcStatement": {"hu": "Tudod mit? Most felhívom a vezérigazgatót, és elmondom neki, hogy ti blokkoljátok az egészet!", "en": "You know what? I'm calling the CEO right now and telling him you're blocking the whole thing!", "de": "Weißt du was? Ich rufe jetzt den CEO an und sage ihm, dass ihr das Ganze blockiert!"},
      "availableCards": [
        {
          "cardId": "c_s2_pace_06",
          "category": "PACING",
          "text": {"hu": "Látom, hogy teljesen kiakadtál, és ez érthető ekkora nyomás alatt.", "en": "I can see you're completely fed up, and that's understandable under this much pressure.", "de": "Ich sehe, dass du völlig am Limit bist, und das ist bei so viel Druck verständlich."},
          "delta": {"escalation": -22, "grounding": 8, "confusion": 10},
          "npcReaction": {"hu": "...Igen. Kiakadtam.", "en": "...Yes. I've lost it.", "de": "...Ja. Ich bin am Limit."},
          "nextNodeId": "scope_crisis_02",
          "debriefHint": {"hu": "Krízisben a legrövidebb út a lenyugváshoz az érzelem elismerése.", "en": "In a crisis, acknowledging the emotion is the shortest path to calm.", "de": "In der Krise ist das Anerkennen der Emotion der kürzeste Weg zur Beruhigung."}
        },
        {
          "cardId": "c_s2_meta_06",
          "category": "META_MODEL",
          "text": {"hu": "Mit szeretnél, hogy a vezérigazgató tegyen a hívás után?", "en": "What would you like the CEO to do after the call?", "de": "Was soll der CEO nach dem Anruf tun?"},
          "delta": {"escalation": -3, "grounding": -3, "confusion": 30},
          "npcReaction": {"hu": "...Hogy valaki végre megoldja.", "en": "...That someone finally solves it.", "de": "...Dass endlich jemand das löst."},
          "nextNodeId": "scope_crisis_02",
          "debriefHint": {"hu": "A fenyegetés mögötti cél rákérdezése visszahozza a megoldás felé.", "en": "Asking about the goal behind the threat brings you back to the solution.", "de": "Nach dem Ziel hinter der Drohung zu fragen, führt zurück zur Lösung."}
        },
        {
          "cardId": "c_s2_def_05",
          "category": "DEFENSE",
          "text": {"hu": "Nem mi blokkolunk, hanem a lehetetlen kérés.", "en": "We're not blocking anything, the impossible request is.", "de": "Nicht wir blockieren, sondern die unmögliche Anforderung."},
          "delta": {"escalation": 20, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "Ezt majd elmagyarázod neki te.", "en": "Then you can explain that to him yourself.", "de": "Das kannst du ihm dann selbst erklären."},
          "nextNodeId": "scope_crisis_02",
          "debriefHint": {"hu": "Krízisben a felelősség visszadobása tovább szítja a dühöt.", "en": "In a crisis, throwing the responsibility back fuels the anger.", "de": "In der Krise heizt das Zurückwerfen der Verantwortung die Wut an."}
        },
        {
          "cardId": "c_s2_att_05",
          "category": "ATTACK",
          "text": {"hu": "Hívd csak, legalább megtudja, milyen a kommunikációd.", "en": "Go ahead and call, at least he'll find out how you communicate.", "de": "Ruf ihn ruhig an, dann erfährt er wenigstens, wie du kommunizierst."},
          "delta": {"escalation": 43, "grounding": -33, "confusion": -28},
          "npcReaction": {"hu": "Már tárcsázom is.", "en": "I'm dialing already.", "de": "Ich wähle schon."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A dac itt szakításhoz vezet.", "en": "Defiance here leads to a rupture.", "de": "Trotz führt hier zum Bruch."}
        }
      ]
    },
    {
      "nodeId": "scope_crisis_02",
      "branch": "crisis",
      "tone": "TENSE",
      "npcStatement": {"hu": "Jó, nem hívom fel. De akkor most mondj valamit, ami működik.", "en": "Fine, I won't call him. But then tell me something that works.", "de": "Gut, ich rufe ihn nicht an. Aber dann sag mir jetzt etwas, das funktioniert."},
      "availableCards": [
        {
          "cardId": "c_s2_pace_07",
          "category": "PACING",
          "text": {"hu": "Értem. Most megoldás kell, nem még egy vita.", "en": "I understand. What you need now is a solution, not another argument.", "de": "Verstehe. Jetzt brauchst du eine Lösung, keinen weiteren Streit."},
          "delta": {"escalation": -17, "grounding": 7, "confusion": 8},
          "npcReaction": {"hu": "Pontosan.", "en": "Exactly.", "de": "Genau."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Rövid, tiszta tükrözés: a partner érzi, hogy érted.", "en": "Short, clear mirroring: your partner feels understood.", "de": "Kurzes, klares Spiegeln: Dein Gegenüber fühlt sich verstanden."}
        },
        {
          "cardId": "c_s2_reframe_06",
          "category": "REFRAMING",
          "text": {"hu": "Üljünk le tíz percre ketten, és rakjuk össze, mi kerül a hónap végi bemutatóra.", "en": "Let's sit down for ten minutes, just the two of us, and put together what goes into the end-of-month demo.", "de": "Setzen wir uns zehn Minuten zu zweit hin und stellen zusammen, was in die Demo Ende des Monats kommt."},
          "delta": {"escalation": -14, "grounding": 13, "confusion": 21},
          "npcReaction": {"hu": "Tíz perc. Rendben, menjünk.", "en": "Ten minutes. Okay, let's go.", "de": "Zehn Minuten. Okay, gehen wir."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A vitát közös, időkorlátos munkává alakítod.", "en": "You turn the argument into shared, time-boxed work.", "de": "Du verwandelst den Streit in gemeinsame, zeitlich begrenzte Arbeit."}
        },
        {
          "cardId": "c_s2_meta_07",
          "category": "META_MODEL",
          "text": {"hu": "Mi az az egy dolog, ami nélkül nem mehetsz be hozzá?", "en": "What's the one thing you can't walk into his office without?", "de": "Was ist das eine, ohne das du nicht zu ihm gehen kannst?"},
          "delta": {"escalation": -5, "grounding": -2, "confusion": 31},
          "npcReaction": {"hu": "Az exportálás. Azzal már tudok valamit mondani.", "en": "The export. With that I can say something.", "de": "Der Export. Damit kann ich schon etwas sagen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A minimum kérdése krízisben is gyorsan fókuszt ad.", "en": "Asking for the minimum gives focus quickly, even in a crisis.", "de": "Die Frage nach dem Minimum schafft auch in der Krise schnell Fokus."}
        },
        {
          "cardId": "c_s2_def_06",
          "category": "DEFENSE",
          "text": {"hu": "Én végig próbáltam mondani, csak nem hallgattál meg.", "en": "I tried to tell you all along, you just didn't listen.", "de": "Ich habe die ganze Zeit versucht, es dir zu sagen, du hast nur nicht zugehört."},
          "delta": {"escalation": 16, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "Most is ezt csinálod.", "en": "You're doing it again right now.", "de": "Genau das machst du jetzt wieder."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Az önigazolás itt elveszi az esélyt a megegyezéstől.", "en": "Self-justification costs you the chance of agreement here.", "de": "Selbstrechtfertigung kostet dich hier die Chance auf Einigung."}
        }
      ]
    }
  ]
}
```

### 22.4 Scenario `scen_customer_refund_003`

P2, INTERMEDIATE, initial E 60, no timer. Phone call. File: `public/scenarios/scen_customer_refund_003.json`.

Graph:

```
r_01 --pace/metamodel/reframe--> r_02_heard --pace/meta/reframe/defense--> r_03_status --any--> r_04_close -> (end)
                                            --attack-----------------------> r_03_review
     --defense/attack----------> r_02_angry --pace/metamodel--> r_03_status
                                            --defense/attack--> r_03_review --constructive--> r_04_close
                                                                            --c_r_att_04----> (end)
crisis: refund_escalated_crisis -> refund_crisis_02 -> (end)   (c_r_att_05 ends directly)
Main path length: 3 to 4 nodes.
```

```json
{
  "$schema": "https://aikido-game.internal/schemas/v1/scenario.json",
  "schemaVersion": "1.0",
  "id": "scen_customer_refund_003",
  "contentVersion": 1,
  "title": {"hu": "A Visszatérített Pénz, Ami Nem Jött Meg", "en": "The Refund That Never Arrived", "de": "Die Rückerstattung, die nie ankam"},
  "summary": {"hu": "Egy ügyfél három hete várja a pénzét, és most azzal fenyeget, hogy mindenhol rossz értékelést ír. Csillapítsd le ígérgetés nélkül.", "en": "A customer has been waiting three weeks for her money and now threatens to post bad reviews everywhere. Calm her down without empty promises.", "de": "Eine Kundin wartet seit drei Wochen auf ihr Geld und droht, überall schlechte Bewertungen zu schreiben. Beruhige sie ohne leere Versprechen."},
  "briefing": {"hu": "Ügyfélszolgálat, péntek délután négy óra. A rendszer jelzi, hogy {npc_name} már harmadszor hív ugyanazzal az üggyel. A {trigger_word} három hete függőben van, és a pénzügyi osztály ma már nem érhető el.", "en": "Customer service, Friday, four in the afternoon. The system shows that {npc_name} is calling about the same case for the third time. The {trigger_word} has been pending for three weeks, and the finance department can no longer be reached today.", "de": "Kundenservice, Freitag, 16 Uhr. Das System zeigt an, dass {npc_name} zum dritten Mal wegen desselben Falls anruft. Die {trigger_word} ist seit drei Wochen offen, und die Finanzabteilung ist heute nicht mehr erreichbar."},
  "difficulty": "INTERMEDIATE",
  "personas": ["P2_FRONTLINE"],
  "npc": {
    "name": {"hu": "Nagy Erika", "en": "Erika Nagy", "de": "Erika Nagy"},
    "role": {"hu": "ügyfél", "en": "customer", "de": "Kundin"}
  },
  "variables": {
    "trigger_word": {"hu": "visszatérítés", "en": "refund", "de": "Rückerstattung"}
  },
  "initialState": {"escalation": 60, "grounding": 100, "confusion": 0},
  "startNodeId": "r_01",
  "nodes": [
    {
      "nodeId": "r_01",
      "tone": "ANGRY",
      "npcStatement": {"hu": "Három hete várok a pénzemre! Háromszor hívtam, és mindig azt mondják, intézik. Ez nevetséges!", "en": "I've been waiting three weeks for my money! I've called three times and every time they say it's being handled. This is ridiculous!", "de": "Ich warte seit drei Wochen auf mein Geld! Dreimal habe ich angerufen, und jedes Mal heißt es, man kümmert sich. Das ist lächerlich!"},
      "availableCards": [
        {
          "cardId": "c_r_pace_01",
          "category": "PACING",
          "text": {"hu": "Teljesen érthető, hogy elege van. Három hét és három hívás után én is dühös lennék.", "en": "It's completely understandable that you've had enough. After three weeks and three calls I'd be angry too.", "de": "Es ist völlig verständlich, dass Sie genug haben. Nach drei Wochen und drei Anrufen wäre ich auch wütend."},
          "delta": {"escalation": -20, "grounding": 8, "confusion": 8},
          "npcReaction": {"hu": "Na végre valaki, aki ezt kimondja.", "en": "Finally someone who says it.", "de": "Endlich sagt das mal jemand."},
          "nextNodeId": "r_02_heard",
          "debriefHint": {"hu": "Az érzelem validálása egyetértés nélkül azonnal csökkenti a feszültséget.", "en": "Validating the emotion without agreeing immediately lowers the tension.", "de": "Die Emotion zu validieren, ohne zuzustimmen, senkt sofort die Spannung."}
        },
        {
          "cardId": "c_r_meta_01",
          "category": "META_MODEL",
          "text": {"hu": "Kérem, segítsen: pontosan mit mondtak Önnek az előző hívásoknál?", "en": "Please help me: what exactly were you told on the previous calls?", "de": "Bitte helfen Sie mir: Was genau wurde Ihnen bei den bisherigen Anrufen gesagt?"},
          "delta": {"escalation": -2, "grounding": -3, "confusion": 28},
          "npcReaction": {"hu": "Hogy egy héten belül megérkezik. Kétszer is ezt mondták!", "en": "That it would arrive within a week. They told me that twice!", "de": "Dass es innerhalb einer Woche ankommt. Das wurde mir zweimal gesagt!"},
          "nextNodeId": "r_02_heard",
          "debriefHint": {"hu": "A konkrétumok kérése megmutatja, hol tört meg a bizalom.", "en": "Asking for specifics shows where the trust broke.", "de": "Nach Details zu fragen zeigt, wo das Vertrauen gebrochen ist."}
        },
        {
          "cardId": "c_r_reframe_01",
          "category": "REFRAMING",
          "text": {"hu": "Az a célom, hogy ez legyen az utolsó hívása ebben az ügyben. Nézzük meg együtt, hol akadt el.", "en": "My goal is for this to be your last call about this case. Let's look together at where it got stuck.", "de": "Mein Ziel ist, dass das Ihr letzter Anruf in dieser Sache ist. Schauen wir gemeinsam, wo es hängt."},
          "delta": {"escalation": -15, "grounding": 12, "confusion": 19},
          "npcReaction": {"hu": "Hát, azt nagyon szeretném.", "en": "Well, I'd really like that.", "de": "Na, das wünsche ich mir sehr."},
          "nextNodeId": "r_02_heard",
          "debriefHint": {"hu": "A közös cél kimondása szövetségessé tesz a partner szemében.", "en": "Stating the shared goal makes you an ally in your partner's eyes.", "de": "Das gemeinsame Ziel auszusprechen, macht dich in den Augen des Gegenübers zum Verbündeten."}
        },
        {
          "cardId": "c_r_def_01",
          "category": "DEFENSE",
          "text": {"hu": "Kérem, nem én intézem a visszatérítéseket, ez a pénzügy hatásköre.", "en": "Please understand, I don't handle refunds, that's finance's job.", "de": "Bitte verstehen Sie, ich bearbeite keine Rückerstattungen, das macht die Finanzabteilung."},
          "delta": {"escalation": 20, "grounding": -17, "confusion": 0},
          "npcReaction": {"hu": "Engem nem érdekel, ki intézi! Maga vette fel a telefont!", "en": "I don't care who handles it! You picked up the phone!", "de": "Mir ist egal, wer das bearbeitet! Sie sind ans Telefon gegangen!"},
          "nextNodeId": "r_02_angry",
          "debriefHint": {"hu": "A hatáskörre hivatkozás az ügyfél fülében hárításnak hangzik.", "en": "Pointing to responsibilities sounds like deflection to the customer.", "de": "Der Verweis auf Zuständigkeiten klingt für die Kundin nach Abwimmeln."}
        },
        {
          "cardId": "c_r_att_01",
          "category": "ATTACK",
          "text": {"hu": "Ha nem kiabálna, gyorsabban tudnánk haladni.", "en": "If you stopped shouting, we could make faster progress.", "de": "Wenn Sie nicht so schreien würden, kämen wir schneller voran."},
          "delta": {"escalation": 37, "grounding": -29, "confusion": -24},
          "npcReaction": {"hu": "Hogy beszél velem?! Kérem a felettesét!", "en": "How dare you talk to me like that?! I want your supervisor!", "de": "Wie reden Sie mit mir?! Ich will Ihren Vorgesetzten sprechen!"},
          "nextNodeId": "r_02_angry",
          "debriefHint": {"hu": "A partner viselkedésének kritizálása dühös helyzetben olaj a tűzre.", "en": "Criticizing your partner's behavior while they are angry is fuel on the fire.", "de": "Das Verhalten des Gegenübers in einem wütenden Moment zu kritisieren, ist Öl ins Feuer."}
        }
      ]
    },
    {
      "nodeId": "r_02_heard",
      "tone": "TENSE",
      "npcStatement": {"hu": "Én nem akarok semmi különlegeset. Csak a pénzemet, amit kifizettem egy hibás termékért.", "en": "I don't want anything special. Just my money, which I paid for a faulty product.", "de": "Ich will nichts Besonderes. Nur mein Geld, das ich für ein defektes Produkt bezahlt habe."},
      "availableCards": [
        {
          "cardId": "c_r_pace_02",
          "category": "PACING",
          "text": {"hu": "Értem. Kifizetett valamit, ami nem működött, és a pénzét sem kapta vissza. Ez kétszeres bosszúság.", "en": "I understand. You paid for something that didn't work and haven't got your money back either. That's twice as annoying.", "de": "Verstehe. Sie haben für etwas bezahlt, das nicht funktioniert hat, und Ihr Geld nicht zurückbekommen. Das ist doppelt ärgerlich."},
          "delta": {"escalation": -17, "grounding": 7, "confusion": 7},
          "npcReaction": {"hu": "Pontosan erről van szó.", "en": "That's exactly the point.", "de": "Genau darum geht es."},
          "nextNodeId": "r_03_status",
          "debriefHint": {"hu": "A partner helyzetének pontos összefoglalása megmutatja, hogy figyeltél.", "en": "Summarizing your partner's situation precisely shows you were listening.", "de": "Die Lage des Gegenübers genau zusammenzufassen zeigt, dass du zugehört hast."}
        },
        {
          "cardId": "c_r_meta_02",
          "category": "META_MODEL",
          "text": {"hu": "Mikor küldte vissza a terméket, és kapott róla visszaigazolást?", "en": "When did you send the product back, and did you get a confirmation?", "de": "Wann haben Sie das Produkt zurückgeschickt, und haben Sie eine Bestätigung bekommen?"},
          "delta": {"escalation": -3, "grounding": -2, "confusion": 30},
          "npcReaction": {"hu": "Huszadikán. Igen, itt az e-mail, benne a szám is.", "en": "On the twentieth. Yes, here's the e-mail, with the number in it.", "de": "Am Zwanzigsten. Ja, hier ist die E-Mail, mit der Nummer drin."},
          "nextNodeId": "r_03_status",
          "debriefHint": {"hu": "A tények összegyűjtése a vádakról a megoldásra tereli a figyelmet.", "en": "Collecting the facts moves attention from accusations to the solution.", "de": "Fakten zu sammeln lenkt die Aufmerksamkeit von Vorwürfen zur Lösung."}
        },
        {
          "cardId": "c_r_reframe_02",
          "category": "REFRAMING",
          "text": {"hu": "Akkor most az a dolgunk, hogy pontosan lássuk, mikor érkezik meg. Megnézem Önnel együtt.", "en": "Then our job now is to see exactly when it will arrive. I'll check it with you.", "de": "Dann ist es jetzt unsere Aufgabe, genau zu sehen, wann es ankommt. Ich schaue mit Ihnen nach."},
          "delta": {"escalation": -13, "grounding": 11, "confusion": 18},
          "npcReaction": {"hu": "Rendben, nézzük.", "en": "Alright, let's look.", "de": "In Ordnung, schauen wir."},
          "nextNodeId": "r_03_status",
          "debriefHint": {"hu": "A panaszból közös feladat lesz.", "en": "The complaint becomes a shared task.", "de": "Aus der Beschwerde wird eine gemeinsame Aufgabe."}
        },
        {
          "cardId": "c_r_def_02",
          "category": "DEFENSE",
          "text": {"hu": "A visszatérítés átfutási ideje akár harminc nap is lehet, ez benne van a feltételekben.", "en": "Refunds can take up to thirty days, that's in the terms and conditions.", "de": "Rückerstattungen können bis zu dreißig Tage dauern, das steht in den AGB."},
          "delta": {"escalation": 17, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "Ne a feltételekkel jöjjön, három hete hitegetnek!", "en": "Don't give me the terms, you've been stringing me along for three weeks!", "de": "Kommen Sie mir nicht mit den AGB, Sie vertrösten mich seit drei Wochen!"},
          "nextNodeId": "r_03_status",
          "debriefHint": {"hu": "A szabályzat idézése igaz, de érzelmileg elutasításként hat.", "en": "Quoting the policy is correct but emotionally lands as a rejection.", "de": "Die Richtlinie zu zitieren ist korrekt, kommt emotional aber als Ablehnung an."}
        },
        {
          "cardId": "c_r_att_02",
          "category": "ATTACK",
          "text": {"hu": "Ezt a hibás terméket is Ön választotta, nem?", "en": "You chose this faulty product yourself, didn't you?", "de": "Dieses defekte Produkt haben Sie doch selbst ausgesucht, oder?"},
          "delta": {"escalation": 42, "grounding": -32, "confusion": -28},
          "npcReaction": {"hu": "Ez hihetetlen. Most már tényleg írok mindenhová.", "en": "Unbelievable. Now I'm really going to write everywhere.", "de": "Unglaublich. Jetzt schreibe ich wirklich überall."},
          "nextNodeId": "r_03_review",
          "debriefHint": {"hu": "Az ügyfél hibáztatása a legrövidebb út a nyilvános panaszhoz.", "en": "Blaming the customer is the shortest path to a public complaint.", "de": "Der Kundin die Schuld zu geben, ist der kürzeste Weg zur öffentlichen Beschwerde."}
        }
      ]
    },
    {
      "nodeId": "r_02_angry",
      "tone": "FURIOUS",
      "npcStatement": {"hu": "Mindig ez van! Mindenki tolja a felelősséget a másikra, és senki nem csinál semmit!", "en": "It's always the same! Everyone passes the buck and nobody does anything!", "de": "Es ist immer dasselbe! Jeder schiebt die Verantwortung weiter, und keiner tut etwas!"},
      "availableCards": [
        {
          "cardId": "c_r_pace_03",
          "category": "PACING",
          "text": {"hu": "Igaza van, ez így nagyon frusztráló. Most nem tolom tovább: én foglalkozom vele.", "en": "You're right, this is very frustrating. I won't pass it on now: I'll handle it.", "de": "Sie haben recht, das ist sehr frustrierend. Ich schiebe es jetzt nicht weiter: Ich kümmere mich darum."},
          "delta": {"escalation": -23, "grounding": 9, "confusion": 9},
          "npcReaction": {"hu": "...Jó. Akkor foglalkozzon vele.", "en": "...Fine. Then handle it.", "de": "...Gut. Dann kümmern Sie sich darum."},
          "nextNodeId": "r_03_status",
          "debriefHint": {"hu": "A felelősség átvállalása pontosan arra válaszol, amit a partner hiányol.", "en": "Taking responsibility answers exactly what your partner is missing.", "de": "Verantwortung zu übernehmen beantwortet genau das, was dem Gegenüber fehlt."}
        },
        {
          "cardId": "c_r_meta_03",
          "category": "META_MODEL",
          "text": {"hu": "Kik voltak azok, akik eddig nem csináltak semmit? Szeretném látni, hol akadt el.", "en": "Who were the people who didn't do anything? I'd like to see where it got stuck.", "de": "Wer waren die, die nichts getan haben? Ich möchte sehen, wo es hängen geblieben ist."},
          "delta": {"escalation": 4, "grounding": -5, "confusion": 26},
          "npcReaction": {"hu": "A múlt héten egy Péter nevű kolléga. Azt mondta, sürgeti.", "en": "Last week a colleague called Peter. He said he'd chase it.", "de": "Letzte Woche ein Kollege namens Peter. Er sagte, er hakt nach."},
          "nextNodeId": "r_03_status",
          "debriefHint": {"hu": "A „senki” megkérdezése konkrét nyomot ad, de dühös partnernél előbb validálj.", "en": "Asking about \"nobody\" gives you a concrete lead, but validate an angry partner first.", "de": "Nach dem „keiner“ zu fragen, liefert eine konkrete Spur, aber bei Wut zuerst validieren."}
        },
        {
          "cardId": "c_r_def_03",
          "category": "DEFENSE",
          "text": {"hu": "Én most hallok erről először, nem tudhatom, mi történt korábban.", "en": "This is the first I've heard of it, I can't know what happened before.", "de": "Ich höre davon zum ersten Mal, ich kann nicht wissen, was vorher passiert ist."},
          "delta": {"escalation": 21, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "Akkor minek veszik fel a telefont?!", "en": "Then why do you even answer the phone?!", "de": "Wozu gehen Sie dann überhaupt ans Telefon?!"},
          "nextNodeId": "r_03_review",
          "debriefHint": {"hu": "Pont azt teszed, amit a partner kifogásol: tovább tolod a felelősséget.", "en": "You're doing exactly what your partner objects to: passing the buck.", "de": "Du machst genau das, was dein Gegenüber kritisiert: Verantwortung weiterschieben."}
        },
        {
          "cardId": "c_r_att_03",
          "category": "ATTACK",
          "text": {"hu": "Ha így folytatja, le kell tennem a telefont.", "en": "If you carry on like this, I'll have to hang up.", "de": "Wenn Sie so weitermachen, muss ich auflegen."},
          "delta": {"escalation": 38, "grounding": -30, "confusion": -25},
          "npcReaction": {"hu": "Csak tegye le! Akkor tudom, mit írjak!", "en": "Go ahead and hang up! Then I'll know what to write!", "de": "Legen Sie ruhig auf! Dann weiß ich, was ich schreibe!"},
          "nextNodeId": "r_03_review",
          "debriefHint": {"hu": "A fenyegetés a kontroll elvesztésének jele, és a partner is így érzékeli.", "en": "A threat is a sign of losing control, and your partner perceives it that way.", "de": "Eine Drohung ist ein Zeichen von Kontrollverlust, und so kommt sie auch an."}
        }
      ]
    },
    {
      "nodeId": "r_03_status",
      "tone": "TENSE",
      "npcStatement": {"hu": "És most? Mikor kapom meg végre a pénzemet?", "en": "And now? When do I finally get my money?", "de": "Und jetzt? Wann bekomme ich endlich mein Geld?"},
      "availableCards": [
        {
          "cardId": "c_r_pace_04",
          "category": "PACING",
          "text": {"hu": "Értem, most egy konkrét választ szeretne, nem még egy „intézzük”-öt.", "en": "I understand, now you want a concrete answer, not another \"we're on it\".", "de": "Verstehe, jetzt möchten Sie eine konkrete Antwort und nicht noch ein „wir kümmern uns“."},
          "delta": {"escalation": -15, "grounding": 7, "confusion": 6},
          "npcReaction": {"hu": "Igen. Pontosan azt.", "en": "Yes. Exactly that.", "de": "Ja. Genau das."},
          "nextNodeId": "r_04_close",
          "debriefHint": {"hu": "A partner ki nem mondott elvárásának kimondása bizalmat épít.", "en": "Naming your partner's unspoken expectation builds trust.", "de": "Die unausgesprochene Erwartung des Gegenübers zu benennen, schafft Vertrauen."}
        },
        {
          "cardId": "c_r_meta_04",
          "category": "META_MODEL",
          "text": {"hu": "Mi lenne most fontosabb Önnek: a pontos dátum, vagy egy írásos visszaigazolás addig is?", "en": "What matters more to you now: the exact date, or a written confirmation in the meantime?", "de": "Was ist Ihnen jetzt wichtiger: das genaue Datum oder bis dahin eine schriftliche Bestätigung?"},
          "delta": {"escalation": -4, "grounding": -1, "confusion": 29},
          "npcReaction": {"hu": "Az írásos visszaigazolás. Abban legalább megbízom.", "en": "The written confirmation. At least I trust that.", "de": "Die schriftliche Bestätigung. Der traue ich wenigstens."},
          "nextNodeId": "r_04_close",
          "debriefHint": {"hu": "A választás felkínálása visszaadja az ügyfélnek a kontroll érzését.", "en": "Offering a choice gives the customer back a sense of control.", "de": "Eine Wahl anzubieten gibt der Kundin das Gefühl von Kontrolle zurück."}
        },
        {
          "cardId": "c_r_reframe_03",
          "category": "REFRAMING",
          "text": {"hu": "Még ma sürgősként továbbítom a pénzügynek, és hétfő délig e-mailben megírom a pontos dátumot.", "en": "I'll forward it to finance as urgent today, and by Monday noon I'll e-mail you the exact date.", "de": "Ich leite es heute noch dringend an die Finanzabteilung weiter und maile Ihnen bis Montagmittag das genaue Datum."},
          "delta": {"escalation": -16, "grounding": 12, "confusion": 21},
          "npcReaction": {"hu": "Hétfő délig. Rendben, ezt felírom.", "en": "Monday noon. Alright, I'm writing that down.", "de": "Montagmittag. In Ordnung, das notiere ich mir."},
          "nextNodeId": "r_04_close",
          "debriefHint": {"hu": "Olyat vállalsz, amit te magad tudsz teljesíteni, nem a pénzügy nevében ígérsz.", "en": "You commit to what you can deliver yourself, not on behalf of finance.", "de": "Du sagst zu, was du selbst einhalten kannst, nicht im Namen der Finanzabteilung."}
        },
        {
          "cardId": "c_r_def_04",
          "category": "DEFENSE",
          "text": {"hu": "Én csak továbbítani tudom, a dátumot nem én határozom meg.", "en": "I can only forward it, I don't set the date.", "de": "Ich kann es nur weiterleiten, das Datum lege nicht ich fest."},
          "delta": {"escalation": 16, "grounding": -15, "confusion": 0},
          "npcReaction": {"hu": "Már megint ugyanaz a mese.", "en": "Same old story again.", "de": "Schon wieder die alte Leier."},
          "nextNodeId": "r_04_close",
          "debriefHint": {"hu": "Igaz, de csak azt mondod el, mit nem tudsz, azt nem, mit igen.", "en": "True, but you only say what you can't do, not what you can.", "de": "Stimmt, aber du sagst nur, was du nicht kannst, nicht, was du kannst."}
        }
      ]
    },
    {
      "nodeId": "r_03_review",
      "tone": "COLD",
      "npcStatement": {"hu": "Tudja mit? Ma este minden értékelő oldalon megírom, hogy maguk csalók.", "en": "You know what? Tonight I'll write on every review site that you're crooks.", "de": "Wissen Sie was? Heute Abend schreibe ich auf jedem Bewertungsportal, dass Sie Betrüger sind."},
      "availableCards": [
        {
          "cardId": "c_r_pace_05",
          "category": "PACING",
          "text": {"hu": "Megértem, hogy ennyi várakozás után úgy érzi, csak így hallgatják meg.", "en": "I understand that after this much waiting you feel this is the only way to be heard.", "de": "Ich verstehe, dass Sie nach so langem Warten das Gefühl haben, nur so gehört zu werden."},
          "delta": {"escalation": -19, "grounding": 7, "confusion": 9},
          "npcReaction": {"hu": "...Hát, eddig így volt.", "en": "...Well, so far it has been.", "de": "...Na ja, bisher war es so."},
          "nextNodeId": "r_04_close",
          "debriefHint": {"hu": "A fenyegetés mögötti érzés validálása lefegyverzi a fenyegetést.", "en": "Validating the feeling behind the threat disarms the threat.", "de": "Das Gefühl hinter der Drohung zu validieren, entschärft die Drohung."}
        },
        {
          "cardId": "c_r_meta_05",
          "category": "META_MODEL",
          "text": {"hu": "Minek kellene ma megtörténnie ahhoz, hogy ne érezze szükségét az értékelésnek?", "en": "What would need to happen today for you not to feel the need to write a review?", "de": "Was müsste heute passieren, damit Sie keine Bewertung schreiben müssen?"},
          "delta": {"escalation": -1, "grounding": -2, "confusion": 27},
          "npcReaction": {"hu": "Hogy valaki végre írásban vállalja a dátumot.", "en": "That someone finally commits to the date in writing.", "de": "Dass endlich jemand das Datum schriftlich zusagt."},
          "nextNodeId": "r_04_close",
          "debriefHint": {"hu": "A partner maga mondja meg, mi elég neki. Ritkán kér lehetetlent.", "en": "Your partner tells you what is enough. They rarely ask for the impossible.", "de": "Das Gegenüber sagt selbst, was reicht. Es verlangt selten Unmögliches."}
        },
        {
          "cardId": "c_r_reframe_04",
          "category": "REFRAMING",
          "text": {"hu": "Joga van értékelni. Azt szeretném, hogy amikor megírja, már azt írhassa: végül megoldottuk.", "en": "You have every right to review us. I'd like you to be able to write that we solved it in the end.", "de": "Sie haben jedes Recht, uns zu bewerten. Ich möchte, dass Sie dann schreiben können: Am Ende wurde es gelöst."},
          "delta": {"escalation": -12, "grounding": 13, "confusion": 20},
          "npcReaction": {"hu": "Hát... az jobb lenne mindenkinek.", "en": "Well... that would be better for everyone.", "de": "Na ja... das wäre für alle besser."},
          "nextNodeId": "r_04_close",
          "debriefHint": {"hu": "A fenyegetés elfogadása és átkeretezése elveszi annak erejét.", "en": "Accepting and reframing the threat takes away its power.", "de": "Die Drohung anzunehmen und umzudeuten, nimmt ihr die Kraft."}
        },
        {
          "cardId": "c_r_att_04",
          "category": "ATTACK",
          "text": {"hu": "Írjon, amit akar, ettől nem lesz gyorsabb a {trigger_word}.", "en": "Write whatever you want, that won't make the {trigger_word} any faster.", "de": "Schreiben Sie, was Sie wollen, davon kommt die {trigger_word} auch nicht schneller."},
          "delta": {"escalation": 36, "grounding": -27, "confusion": -22},
          "npcReaction": {"hu": "Rendben. Viszontlátásra.", "en": "Fine. Goodbye.", "de": "Gut. Auf Wiederhören."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A cinikus válasz lezárja a hívást, és a panasz nyilvános lesz.", "en": "A cynical answer ends the call and the complaint goes public.", "de": "Eine zynische Antwort beendet das Gespräch, und die Beschwerde wird öffentlich."}
        }
      ]
    },
    {
      "nodeId": "r_04_close",
      "tone": "CALM",
      "npcStatement": {"hu": "Jó. De ha hétfőn sem hallok semmit, akkor nem leszek ilyen türelmes.", "en": "Fine. But if I hear nothing on Monday either, I won't be this patient.", "de": "Gut. Aber wenn ich am Montag wieder nichts höre, bin ich nicht mehr so geduldig."},
      "availableCards": [
        {
          "cardId": "c_r_pace_06",
          "category": "PACING",
          "text": {"hu": "Ez teljesen jogos. Hétfőn Önnek nem kell hívnia, én jelentkezem.", "en": "That's completely fair. On Monday you won't have to call, I'll get in touch.", "de": "Das ist völlig berechtigt. Am Montag müssen Sie nicht anrufen, ich melde mich."},
          "delta": {"escalation": -16, "grounding": 8, "confusion": 7},
          "npcReaction": {"hu": "Rendben. Ezt megjegyzem.", "en": "Alright. I'll remember that.", "de": "In Ordnung. Das merke ich mir."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Az elvárás elfogadása és a kezdeményezés átvétele lezárja a konfliktust.", "en": "Accepting the expectation and taking the initiative closes the conflict.", "de": "Die Erwartung anzunehmen und die Initiative zu übernehmen, schließt den Konflikt ab."}
        },
        {
          "cardId": "c_r_meta_06",
          "category": "META_MODEL",
          "text": {"hu": "Melyik elérhetőségen és hány órakor keressem hétfőn?", "en": "Which contact should I use on Monday, and at what time?", "de": "Über welchen Kontakt und um wie viel Uhr soll ich mich am Montag melden?"},
          "delta": {"escalation": -5, "grounding": 0, "confusion": 28},
          "npcReaction": {"hu": "E-mailben, délelőtt. Köszönöm.", "en": "E-mail, in the morning. Thank you.", "de": "Per E-Mail, vormittags. Danke."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A konkrét részletek hihetővé teszik a vállalást.", "en": "Concrete details make the commitment believable.", "de": "Konkrete Details machen die Zusage glaubwürdig."}
        },
        {
          "cardId": "c_r_reframe_05",
          "category": "REFRAMING",
          "text": {"hu": "A türelmét azzal hálálom meg, hogy hétfőn én hívom Önt, nem fordítva.", "en": "I'll repay your patience by calling you on Monday, not the other way round.", "de": "Ihre Geduld vergelte ich damit, dass am Montag ich Sie anrufe und nicht umgekehrt."},
          "delta": {"escalation": -13, "grounding": 12, "confusion": 17},
          "npcReaction": {"hu": "Na, ez már normális hozzáállás.", "en": "Now that's a normal attitude.", "de": "Na, das ist mal eine vernünftige Einstellung."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A türelem elismerése és viszonzása megfordítja a szerepeket.", "en": "Recognizing and returning the patience reverses the roles.", "de": "Geduld anzuerkennen und zu erwidern, kehrt die Rollen um."}
        },
        {
          "cardId": "c_r_def_05",
          "category": "DEFENSE",
          "text": {"hu": "Én megteszek mindent, de nem ígérhetek semmit a pénzügy nevében.", "en": "I'll do my best, but I can't promise anything on behalf of finance.", "de": "Ich tue mein Bestes, aber im Namen der Finanzabteilung kann ich nichts versprechen."},
          "delta": {"escalation": 18, "grounding": -17, "confusion": 0},
          "npcReaction": {"hu": "Akkor minek beszélgetünk?", "en": "Then why are we even talking?", "de": "Wozu reden wir dann überhaupt?"},
          "nextNodeId": null,
          "debriefHint": {"hu": "A záró óvatoskodás elbizonytalanítja az addig elért eredményt.", "en": "Hedging at the end undermines what you achieved.", "de": "Absichern am Schluss untergräbt das bisher Erreichte."}
        }
      ]
    },
    {
      "nodeId": "refund_escalated_crisis",
      "branch": "crisis",
      "tone": "FURIOUS",
      "npcStatement": {"hu": "Elég volt! Holnap ügyvédhez megyek, és a fogyasztóvédelemhez is!", "en": "That's enough! Tomorrow I'm going to a lawyer, and to consumer protection too!", "de": "Jetzt reicht's! Morgen gehe ich zum Anwalt, und zum Verbraucherschutz auch!"},
      "availableCards": [
        {
          "cardId": "c_r_pace_07",
          "category": "PACING",
          "text": {"hu": "Hallom, mennyire elege van, és értem, hogy most minden lehetőséget megfontol.", "en": "I hear how fed up you are, and I understand you're considering every option now.", "de": "Ich höre, wie sehr Sie die Nase voll haben, und verstehe, dass Sie jetzt alle Möglichkeiten erwägen."},
          "delta": {"escalation": -21, "grounding": 8, "confusion": 9},
          "npcReaction": {"hu": "...Igen. Mert senki nem segít.", "en": "...Yes. Because nobody helps.", "de": "...Ja. Weil niemand hilft."},
          "nextNodeId": "refund_crisis_02",
          "debriefHint": {"hu": "A jogos düh elismerése krízisben is megnyitja a párbeszédet.", "en": "Acknowledging justified anger reopens the dialogue, even in a crisis.", "de": "Berechtigte Wut anzuerkennen, öffnet auch in der Krise den Dialog wieder."}
        },
        {
          "cardId": "c_r_meta_07",
          "category": "META_MODEL",
          "text": {"hu": "Minek kellene még ma megtörténnie ahhoz, hogy ne kelljen ügyvédhez mennie?", "en": "What would need to happen today so that you don't have to go to a lawyer?", "de": "Was müsste heute noch passieren, damit Sie nicht zum Anwalt gehen müssen?"},
          "delta": {"escalation": -4, "grounding": -3, "confusion": 30},
          "npcReaction": {"hu": "Hogy írásban megkapjam, mikor jön a pénz.", "en": "That I get it in writing when the money comes.", "de": "Dass ich schriftlich bekomme, wann das Geld kommt."},
          "nextNodeId": "refund_crisis_02",
          "debriefHint": {"hu": "A fenyegetés mögötti minimum feltétel általában teljesíthető.", "en": "The minimum condition behind a threat is usually achievable.", "de": "Die Mindestbedingung hinter einer Drohung ist meist erfüllbar."}
        },
        {
          "cardId": "c_r_def_06",
          "category": "DEFENSE",
          "text": {"hu": "Ez az Ön joga, de attól nem lesz gyorsabb a folyamat.", "en": "That's your right, but it won't speed up the process.", "de": "Das ist Ihr gutes Recht, aber das beschleunigt den Vorgang nicht."},
          "delta": {"escalation": 19, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "Majd meglátjuk.", "en": "We'll see.", "de": "Das werden wir sehen."},
          "nextNodeId": "refund_crisis_02",
          "debriefHint": {"hu": "Igaz, de kioktató, és a partner dacból is végigviszi.", "en": "True, but condescending, and your partner will go through with it out of spite.", "de": "Stimmt, aber belehrend, und das Gegenüber zieht es aus Trotz durch."}
        },
        {
          "cardId": "c_r_att_05",
          "category": "ATTACK",
          "text": {"hu": "Tessék, menjen csak, ott is ugyanezt fogják mondani.", "en": "Go on then, they'll tell you the same thing there.", "de": "Bitte, gehen Sie nur, dort wird man Ihnen dasselbe sagen."},
          "delta": {"escalation": 44, "grounding": -34, "confusion": -29},
          "npcReaction": {"hu": "Viszontlátásra.", "en": "Goodbye.", "de": "Auf Wiederhören."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A provokáció itt a kapcsolat végét jelenti.", "en": "Provocation here means the end of the relationship.", "de": "Provokation bedeutet hier das Ende der Beziehung."}
        }
      ]
    },
    {
      "nodeId": "refund_crisis_02",
      "branch": "crisis",
      "tone": "TENSE",
      "npcStatement": {"hu": "Jó. Kap még egy esélyt. Mit tud tenni most, ebben a percben?", "en": "Fine. You get one more chance. What can you do now, this minute?", "de": "Gut. Sie bekommen noch eine Chance. Was können Sie jetzt tun, in dieser Minute?"},
      "availableCards": [
        {
          "cardId": "c_r_pace_08",
          "category": "PACING",
          "text": {"hu": "Köszönöm az esélyt. Értem, hogy most tettekre van szüksége, nem szavakra.", "en": "Thank you for the chance. I understand you need actions now, not words.", "de": "Danke für die Chance. Ich verstehe, dass Sie jetzt Taten brauchen, keine Worte."},
          "delta": {"escalation": -17, "grounding": 7, "confusion": 8},
          "npcReaction": {"hu": "Pontosan.", "en": "Exactly.", "de": "Genau."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A második esély megköszönése elismeri a partner türelmét.", "en": "Thanking for the second chance acknowledges your partner's patience.", "de": "Sich für die zweite Chance zu bedanken, würdigt die Geduld des Gegenübers."}
        },
        {
          "cardId": "c_r_reframe_06",
          "category": "REFRAMING",
          "text": {"hu": "Most rögzítem sürgős panaszként, és a hívás végére e-mailben megkapja az ügyszámot.", "en": "I'm logging it as an urgent complaint now, and by the end of this call you'll have the case number by e-mail.", "de": "Ich erfasse es jetzt als dringende Beschwerde, und bis Gesprächsende haben Sie die Fallnummer per E-Mail."},
          "delta": {"escalation": -15, "grounding": 13, "confusion": 22},
          "npcReaction": {"hu": "Rendben. Várom az e-mailt.", "en": "Alright. I'll wait for the e-mail.", "de": "In Ordnung. Ich warte auf die E-Mail."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Azonnali, ellenőrizhető lépés: a bizalom tettekből épül újra.", "en": "An immediate, verifiable step: trust is rebuilt through actions.", "de": "Ein sofortiger, überprüfbarer Schritt: Vertrauen entsteht durch Taten neu."}
        },
        {
          "cardId": "c_r_meta_08",
          "category": "META_MODEL",
          "text": {"hu": "Mi lenne ma a legfontosabb: az ügyszám, a felettesem neve vagy a várható dátum?", "en": "What matters most today: the case number, my supervisor's name or the expected date?", "de": "Was ist heute am wichtigsten: die Fallnummer, der Name meines Vorgesetzten oder das voraussichtliche Datum?"},
          "delta": {"escalation": -3, "grounding": -2, "confusion": 29},
          "npcReaction": {"hu": "Az ügyszám. Azzal tudok mit kezdeni.", "en": "The case number. I can do something with that.", "de": "Die Fallnummer. Damit kann ich etwas anfangen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A választás felkínálása visszaadja az ügyfél kontrollérzését.", "en": "Offering a choice gives the customer back a sense of control.", "de": "Eine Wahl anzubieten gibt der Kundin das Gefühl von Kontrolle zurück."}
        },
        {
          "cardId": "c_r_def_07",
          "category": "DEFENSE",
          "text": {"hu": "Én mindent megtettem, amit lehetett.", "en": "I've done everything I could.", "de": "Ich habe alles getan, was möglich war."},
          "delta": {"escalation": 17, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "Akkor ez kevés volt.", "en": "Then it wasn't enough.", "de": "Dann war das zu wenig."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Az önvédelem a második esélyt is elhasználja.", "en": "Self-defense uses up the second chance too.", "de": "Selbstverteidigung verspielt auch die zweite Chance."}
        }
      ]
    }
  ]
}
```

### 22.5 Scenario `scen_customer_gaslight_004`

P2, ADVANCED, initial E 70, `decisionTimeLimitSec: 15`. Video call. File: `public/scenarios/scen_customer_gaslight_004.json`.

Graph:

```
g_01 --pace/metamodel/reframe--> g_02_doubt  --constructive----> g_03_evidence --any--> g_04_deal -> (end)
                                            --defense/attack--> g_03_threat
     --defense/attack----------> g_02_attack --pace/metamodel--> g_03_evidence
                                            --defense/attack--> g_03_threat --c_g_att_05--> (end)
                                                                            --others-----> g_04_deal
crisis: gaslight_escalated_crisis -> gaslight_crisis_02 -> (end)   (c_g_att_06 ends directly)
Main path length: 3 to 4 nodes. Starts at E = 70 (already panic zone) with a 15 s timer.
```

```json
{
  "$schema": "https://aikido-game.internal/schemas/v1/scenario.json",
  "schemaVersion": "1.0",
  "id": "scen_customer_gaslight_004",
  "contentVersion": 1,
  "title": {"hu": "„Ezt Sosem Mondtam!”", "en": "\"I Never Said That!\"", "de": "„Das habe ich nie gesagt!“"},
  "summary": {"hu": "Egy kulcsügyfél letagad egy írásban rögzített megállapodást, és csalással vádol. Maradj földelt, és vidd vissza a beszélgetést a tényekhez, időnyomás alatt.", "en": "A key account denies an agreement made in writing and accuses you of fraud. Stay grounded and bring the conversation back to the facts, under time pressure.", "de": "Ein Schlüsselkunde leugnet eine schriftliche Vereinbarung und wirft dir Betrug vor. Bleib geerdet und bring das Gespräch unter Zeitdruck zurück zu den Fakten."},
  "briefing": {"hu": "Videóhívás a negyedéves elszámolásról. {npc_name} azt állítja, hogy a júniusi kiegészítő munkát soha nem rendelte meg, pedig a jóváhagyó e-mail nálad van. A {trigger_word} megújítása is a tét. Minden döntésre 15 másodperced van.", "en": "Video call about the quarterly invoice. {npc_name} claims he never ordered the additional work in June, although you have the approval e-mail. The {trigger_word} renewal is at stake too. You have 15 seconds for every decision.", "de": "Videocall zur Quartalsabrechnung. {npc_name} behauptet, die zusätzlichen Arbeiten im Juni nie bestellt zu haben, obwohl du die Freigabe-E-Mail hast. Auch der neue {trigger_word} steht auf dem Spiel. Für jede Entscheidung hast du 15 Sekunden."},
  "difficulty": "ADVANCED",
  "personas": ["P2_FRONTLINE"],
  "npc": {
    "name": {"hu": "Horváth Gábor", "en": "Gábor Horváth", "de": "Gábor Horváth"},
    "role": {"hu": "kulcsügyfél, beszerzési vezető", "en": "key account, head of procurement", "de": "Schlüsselkunde, Einkaufsleiter"}
  },
  "variables": {
    "trigger_word": {"hu": "szerződés", "en": "contract", "de": "Vertrag"}
  },
  "decisionTimeLimitSec": 15,
  "initialState": {"escalation": 70, "grounding": 100, "confusion": 0},
  "startNodeId": "g_01",
  "nodes": [
    {
      "nodeId": "g_01",
      "tone": "SARCASTIC",
      "npcStatement": {"hu": "Ó, szóval most kiszámlázzák azt, amit soha nem rendeltünk meg. Igazán kreatív üzleti modell.", "en": "Oh, so now you're invoicing things we never ordered. A truly creative business model.", "de": "Ach, jetzt stellen Sie also in Rechnung, was wir nie bestellt haben. Wirklich ein kreatives Geschäftsmodell."},
      "availableCards": [
        {
          "cardId": "c_g_pace_01",
          "category": "PACING",
          "text": {"hu": "Értem, hogy meglepte ez a tétel, és most úgy érzi, mintha becsapták volna.", "en": "I understand this item surprised you, and now it feels as if you'd been cheated.", "de": "Ich verstehe, dass Sie dieser Posten überrascht hat und Sie sich jetzt betrogen fühlen."},
          "delta": {"escalation": -18, "grounding": 7, "confusion": 8},
          "npcReaction": {"hu": "Meglepett? Inkább felháborított.", "en": "Surprised? Outraged, more like.", "de": "Überrascht? Empört trifft es eher."},
          "nextNodeId": "g_02_doubt",
          "debriefHint": {"hu": "A gúny mögött sértettség van. Ha azt validálod, a gúnynak nincs mibe kapaszkodnia.", "en": "Behind sarcasm there is hurt. If you validate that, the sarcasm has nothing to hold on to.", "de": "Hinter Sarkasmus steckt Kränkung. Wenn du die validierst, findet der Sarkasmus keinen Halt."}
        },
        {
          "cardId": "c_g_meta_01",
          "category": "META_MODEL",
          "text": {"hu": "Melyik tételre gondol pontosan, amit nem rendeltek meg?", "en": "Which item exactly do you mean, the one you didn't order?", "de": "Welchen Posten genau meinen Sie, den Sie nicht bestellt haben?"},
          "delta": {"escalation": -2, "grounding": -3, "confusion": 30},
          "npcReaction": {"hu": "A júniusi integrációs munkára. Azt én biztosan nem hagytam jóvá.", "en": "The integration work in June. I definitely didn't approve that.", "de": "Die Integrationsarbeiten im Juni. Die habe ich ganz sicher nicht freigegeben."},
          "nextNodeId": "g_02_doubt",
          "debriefHint": {"hu": "Az általános vádat egy konkrét, ellenőrizhető tételre szűkíted.", "en": "You narrow the general accusation down to one concrete, verifiable item.", "de": "Du grenzt den allgemeinen Vorwurf auf einen konkreten, prüfbaren Posten ein."}
        },
        {
          "cardId": "c_g_reframe_01",
          "category": "REFRAMING",
          "text": {"hu": "Mindkettőnk érdeke, hogy tiszta legyen az elszámolás, mielőtt a {trigger_word} megújításáról beszélünk.", "en": "It's in both our interests to have clean accounts before we talk about renewing the {trigger_word}.", "de": "Es liegt in unser beider Interesse, die Abrechnung zu klären, bevor wir über den neuen {trigger_word} sprechen."},
          "delta": {"escalation": -14, "grounding": 11, "confusion": 17},
          "npcReaction": {"hu": "Tiszta elszámolás. Rendben, kezdje.", "en": "Clean accounts. Fine, go ahead.", "de": "Saubere Abrechnung. Gut, fangen Sie an."},
          "nextNodeId": "g_02_doubt",
          "debriefHint": {"hu": "A közös tét megnevezése a vádaskodásból tárgyalást csinál.", "en": "Naming the shared stake turns accusation into negotiation.", "de": "Den gemeinsamen Einsatz zu benennen, macht aus Vorwürfen eine Verhandlung."}
        },
        {
          "cardId": "c_g_def_01",
          "category": "DEFENSE",
          "text": {"hu": "Dehogynem rendelték meg, nálam van az e-mail!", "en": "Of course you ordered it, I have the e-mail!", "de": "Natürlich haben Sie das bestellt, ich habe die E-Mail!"},
          "delta": {"escalation": 22, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "Akkor maga szerint én hazudok?", "en": "So you're saying I'm lying?", "de": "Sie sagen also, ich lüge?"},
          "nextNodeId": "g_02_attack",
          "debriefHint": {"hu": "Az igazad lehet meg, de ilyen formában a partner arcvesztésként éli meg.", "en": "You may be right, but in this form your partner experiences it as losing face.", "de": "Du magst recht haben, aber so erlebt dein Gegenüber es als Gesichtsverlust."}
        },
        {
          "cardId": "c_g_att_01",
          "category": "ATTACK",
          "text": {"hu": "Talán jobban oda kellene figyelnie, mit hagy jóvá.", "en": "Maybe you should pay more attention to what you approve.", "de": "Vielleicht sollten Sie besser darauf achten, was Sie freigeben."},
          "delta": {"escalation": 39, "grounding": -30, "confusion": -25},
          "npcReaction": {"hu": "Hogy merészel kioktatni?", "en": "How dare you lecture me?", "de": "Wie können Sie es wagen, mich zu belehren?"},
          "nextNodeId": "g_02_attack",
          "debriefHint": {"hu": "A kioktatás egy kulcsügyfélnél azonnali bizalomvesztés.", "en": "Lecturing a key account means an instant loss of trust.", "de": "Einen Schlüsselkunden zu belehren, bedeutet sofortigen Vertrauensverlust."}
        }
      ]
    },
    {
      "nodeId": "g_02_doubt",
      "tone": "COLD",
      "npcStatement": {"hu": "Ezt sosem mondtam. Ha lenne ilyen jóváhagyás, emlékeznék rá.", "en": "I never said that. If there were such an approval, I would remember it.", "de": "Das habe ich nie gesagt. Wenn es so eine Freigabe gäbe, würde ich mich daran erinnern."},
      "availableCards": [
        {
          "cardId": "c_g_pace_02",
          "category": "PACING",
          "text": {"hu": "Érthető, hogy ennyi projekt mellett nem minden e-mail marad meg. Velem is előfordul.", "en": "It's understandable that with so many projects not every e-mail sticks. It happens to me too.", "de": "Verständlich, dass bei so vielen Projekten nicht jede E-Mail hängen bleibt. Das passiert mir auch."},
          "delta": {"escalation": -16, "grounding": 7, "confusion": 7},
          "npcReaction": {"hu": "...Valóban sok minden van most.", "en": "...There is a lot going on right now.", "de": "...Es ist tatsächlich gerade sehr viel los."},
          "nextNodeId": "g_03_evidence",
          "debriefHint": {"hu": "Kiutat adsz a partnernek, hogy arcvesztés nélkül módosíthassa az álláspontját.", "en": "You give your partner a way out so they can change position without losing face.", "de": "Du gibst deinem Gegenüber einen Ausweg, die Position ohne Gesichtsverlust zu ändern."}
        },
        {
          "cardId": "c_g_meta_02",
          "category": "META_MODEL",
          "text": {"hu": "Megmutathatom a június 12-i e-mailt, hogy együtt ellenőrizzük?", "en": "May I show you the e-mail from June 12 so we can check it together?", "de": "Darf ich Ihnen die E-Mail vom 12. Juni zeigen, damit wir es gemeinsam prüfen?"},
          "delta": {"escalation": -3, "grounding": -2, "confusion": 31},
          "npcReaction": {"hu": "Mutassa. Kíváncsi vagyok.", "en": "Show me. I'm curious.", "de": "Zeigen Sie her. Ich bin gespannt."},
          "nextNodeId": "g_03_evidence",
          "debriefHint": {"hu": "A bizonyítékot meghívásként kínálod, nem fegyverként.", "en": "You offer the evidence as an invitation, not as a weapon.", "de": "Du bietest den Beweis als Einladung an, nicht als Waffe."}
        },
        {
          "cardId": "c_g_reframe_02",
          "category": "REFRAMING",
          "text": {"hu": "Nem az a célom, hogy igazam legyen, hanem hogy mindketten ugyanazt lássuk. Nézzük meg együtt a levelet.", "en": "My goal isn't to be right, it's for both of us to see the same thing. Let's look at the e-mail together.", "de": "Mir geht es nicht ums Rechthaben, sondern darum, dass wir beide dasselbe sehen. Schauen wir uns die E-Mail gemeinsam an."},
          "delta": {"escalation": -13, "grounding": 12, "confusion": 19},
          "npcReaction": {"hu": "Hm. Rendben, nézzük.", "en": "Hm. Alright, let's look.", "de": "Hm. Gut, schauen wir."},
          "nextNodeId": "g_03_evidence",
          "debriefHint": {"hu": "Az igazság keresése közös cél lesz, nem győzelem a másik felett.", "en": "Finding the truth becomes a shared goal, not a victory over the other.", "de": "Die Wahrheitssuche wird zum gemeinsamen Ziel, nicht zum Sieg über den anderen."}
        },
        {
          "cardId": "c_g_def_02",
          "category": "DEFENSE",
          "text": {"hu": "Az emlékezete nem bizonyíték, az e-mail viszont igen.", "en": "Your memory isn't evidence, the e-mail is.", "de": "Ihr Gedächtnis ist kein Beweis, die E-Mail schon."},
          "delta": {"escalation": 19, "grounding": -17, "confusion": 0},
          "npcReaction": {"hu": "Ezt a hangnemet nem tűröm.", "en": "I won't tolerate this tone.", "de": "Diesen Ton verbitte ich mir."},
          "nextNodeId": "g_03_threat",
          "debriefHint": {"hu": "Tényszerű, de lekezelő. A partner a hangnemre reagál, nem a tartalomra.", "en": "Factual, but condescending. Your partner reacts to the tone, not the content.", "de": "Sachlich, aber herablassend. Das Gegenüber reagiert auf den Ton, nicht auf den Inhalt."}
        },
        {
          "cardId": "c_g_att_02",
          "category": "ATTACK",
          "text": {"hu": "Szóval most kényelmes elfelejteni, ugye?", "en": "So now it's convenient to forget, is it?", "de": "Jetzt ist Vergessen also bequem, was?"},
          "delta": {"escalation": 41, "grounding": -31, "confusion": -27},
          "npcReaction": {"hu": "Ennek most következménye lesz.", "en": "This will have consequences.", "de": "Das wird Konsequenzen haben."},
          "nextNodeId": "g_03_threat",
          "debriefHint": {"hu": "A szándékos hazugság vádja visszafordíthatatlanul eszkalál.", "en": "Accusing someone of deliberate lying escalates irreversibly.", "de": "Der Vorwurf der bewussten Lüge eskaliert unumkehrbar."}
        }
      ]
    },
    {
      "nodeId": "g_02_attack",
      "tone": "FURIOUS",
      "npcStatement": {"hu": "Maguk mindig ezt csinálják! Becsúsztatnak tételeket, és azt hiszik, nem vesszük észre!", "en": "You people always do this! You slip items in and think we won't notice!", "de": "Das machen Sie immer so! Sie schieben Posten unter und glauben, wir merken das nicht!"},
      "availableCards": [
        {
          "cardId": "c_g_pace_03",
          "category": "PACING",
          "text": {"hu": "Hallom, mennyire bosszantja, ha úgy érzi, át akarják verni. Ezt komolyan veszem.", "en": "I hear how much it annoys you when you feel someone is trying to cheat you. I take that seriously.", "de": "Ich höre, wie sehr es Sie ärgert, wenn Sie sich über den Tisch gezogen fühlen. Das nehme ich ernst."},
          "delta": {"escalation": -22, "grounding": 8, "confusion": 9},
          "npcReaction": {"hu": "...Hát remélem is.", "en": "...I should hope so.", "de": "...Das will ich auch hoffen."},
          "nextNodeId": "g_03_evidence",
          "debriefHint": {"hu": "A félelem (hogy átverik) elismerése erősebb, mint a vád cáfolata.", "en": "Acknowledging the fear of being cheated is stronger than refuting the accusation.", "de": "Die Angst, betrogen zu werden, anzuerkennen, ist stärker als den Vorwurf zu widerlegen."}
        },
        {
          "cardId": "c_g_meta_03",
          "category": "META_MODEL",
          "text": {"hu": "Melyik korábbi számlánál érezte ugyanezt? Szeretném, ha minden tisztázva lenne.", "en": "On which earlier invoice did you feel the same? I'd like everything cleared up.", "de": "Bei welcher früheren Rechnung hatten Sie dasselbe Gefühl? Ich möchte, dass alles geklärt ist."},
          "delta": {"escalation": 5, "grounding": -5, "confusion": 25},
          "npcReaction": {"hu": "A márciusinál is volt egy furcsa tétel.", "en": "There was a strange item on the March one too.", "de": "Bei der vom März war auch ein seltsamer Posten."},
          "nextNodeId": "g_03_evidence",
          "debriefHint": {"hu": "A „mindig” megkérdezése kiderít egy valós sérelmet, de dühnél kockázatos.", "en": "Asking about \"always\" uncovers a real grievance, but it's risky with an angry partner.", "de": "Nach dem „immer“ zu fragen, deckt eine echte Kränkung auf, ist bei Wut aber riskant."}
        },
        {
          "cardId": "c_g_def_03",
          "category": "DEFENSE",
          "text": {"hu": "Mi soha nem csúsztatunk be semmit, ez súlyos vád.", "en": "We never slip anything in, that's a serious accusation.", "de": "Wir schieben niemals etwas unter, das ist ein schwerer Vorwurf."},
          "delta": {"escalation": 23, "grounding": -19, "confusion": 0},
          "npcReaction": {"hu": "Súlyos? Majd meglátjuk, mi a súlyos.", "en": "Serious? We'll see what's serious.", "de": "Schwer? Wir werden sehen, was schwer ist."},
          "nextNodeId": "g_03_threat",
          "debriefHint": {"hu": "A vád tagadása vitát nyit arról, ki mond igazat.", "en": "Denying the accusation opens an argument about who's telling the truth.", "de": "Den Vorwurf abzustreiten, eröffnet einen Streit darüber, wer die Wahrheit sagt."}
        },
        {
          "cardId": "c_g_att_03",
          "category": "ATTACK",
          "text": {"hu": "Ha valaki itt nem figyel, az nem mi vagyunk.", "en": "If anyone isn't paying attention here, it isn't us.", "de": "Wenn hier jemand nicht aufpasst, dann nicht wir."},
          "delta": {"escalation": 44, "grounding": -34, "confusion": -29},
          "npcReaction": {"hu": "Ezt jegyzőkönyvbe veszem.", "en": "I'm putting that on record.", "de": "Das nehme ich zu Protokoll."},
          "nextNodeId": "g_03_threat",
          "debriefHint": {"hu": "Tükörvád: ugyanazt adod vissza, amit kaptál, csak hangosabban.", "en": "Mirror accusation: you give back what you received, only louder.", "de": "Spiegelvorwurf: Du gibst zurück, was du bekommen hast, nur lauter."}
        }
      ]
    },
    {
      "nodeId": "g_03_evidence",
      "tone": "TENSE",
      "npcStatement": {"hu": "Jó, ez tényleg az én aláírásom. De akkor sem gondoltam, hogy ennyibe fog kerülni.", "en": "Fine, that really is my signature. But I still didn't think it would cost this much.", "de": "Gut, das ist tatsächlich meine Unterschrift. Aber ich habe trotzdem nicht gedacht, dass es so viel kostet."},
      "availableCards": [
        {
          "cardId": "c_g_pace_04",
          "category": "PACING",
          "text": {"hu": "Értem, a végösszeg nem az volt, amire számított. Ez kellemetlen meglepetés.", "en": "I understand the total wasn't what you expected. That's an unpleasant surprise.", "de": "Verstehe, die Endsumme war nicht das, womit Sie gerechnet haben. Das ist eine unangenehme Überraschung."},
          "delta": {"escalation": -17, "grounding": 7, "confusion": 7},
          "npcReaction": {"hu": "Az. A pénzügy engem fog kérdezni.", "en": "It is. Finance will ask me about it.", "de": "Ist es. Die Finanzabteilung wird mich danach fragen."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "Nem élsz vissza a beismeréssel, hanem a valódi problémára (az árra) figyelsz.", "en": "You don't exploit the admission, you focus on the real problem: the price.", "de": "Du nutzt das Eingeständnis nicht aus, sondern achtest auf das eigentliche Problem: den Preis."}
        },
        {
          "cardId": "c_g_meta_04",
          "category": "META_MODEL",
          "text": {"hu": "Mennyivel számolt, és mi alapján?", "en": "How much did you expect, and based on what?", "de": "Mit wie viel haben Sie gerechnet, und auf welcher Grundlage?"},
          "delta": {"escalation": -4, "grounding": -2, "confusion": 30},
          "npcReaction": {"hu": "A felével. Szóban azt mondták, kisebb munka lesz.", "en": "Half of it. I was told verbally it would be a small job.", "de": "Mit der Hälfte. Mündlich hieß es, es sei eine kleine Arbeit."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "Kiderül a valódi félreértés forrása: egy szóbeli becslés.", "en": "The real source of the misunderstanding comes out: a verbal estimate.", "de": "Die eigentliche Quelle des Missverständnisses kommt ans Licht: eine mündliche Schätzung."}
        },
        {
          "cardId": "c_g_reframe_03",
          "category": "REFRAMING",
          "text": {"hu": "Akkor nem az a kérdés, ki mit mondott, hanem hogy a különbséget hogyan rendezzük korrekt módon.", "en": "Then the question isn't who said what, but how we settle the difference fairly.", "de": "Dann ist die Frage nicht, wer was gesagt hat, sondern wie wir den Unterschied fair regeln."},
          "delta": {"escalation": -15, "grounding": 13, "confusion": 21},
          "npcReaction": {"hu": "Igen, ez a valódi kérdés.", "en": "Yes, that's the real question.", "de": "Ja, das ist die eigentliche Frage."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "A múltbeli bűnbakkeresés helyett a jövőbeli megoldásra fókuszálsz.", "en": "Instead of looking for a scapegoat in the past, you focus on the solution for the future.", "de": "Statt eines Sündenbocks in der Vergangenheit fokussierst du auf die Lösung für die Zukunft."}
        },
        {
          "cardId": "c_g_def_04",
          "category": "DEFENSE",
          "text": {"hu": "Az ár benne volt az ajánlatban, azt is jóváhagyta.", "en": "The price was in the offer, and you approved that too.", "de": "Der Preis stand im Angebot, und das haben Sie auch freigegeben."},
          "delta": {"escalation": 18, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "Ne magyarázza, tudom olvasni.", "en": "Don't explain, I can read.", "de": "Erklären Sie mir nichts, ich kann lesen."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "Megnyerted a vitát, de a partner ezt megalázásként éli meg.", "en": "You won the argument, but your partner experiences it as humiliation.", "de": "Du hast den Streit gewonnen, aber dein Gegenüber empfindet es als Demütigung."}
        },
        {
          "cardId": "c_g_att_04",
          "category": "ATTACK",
          "text": {"hu": "Szóval mégis megrendelte. Akkor miért vádolt minket csalással?", "en": "So you did order it after all. Then why did you accuse us of fraud?", "de": "Sie haben es also doch bestellt. Warum haben Sie uns dann Betrug vorgeworfen?"},
          "delta": {"escalation": 35, "grounding": -26, "confusion": -21},
          "npcReaction": {"hu": "Ahogy most viselkedik, azon nem is csodálkoznék.", "en": "Judging by how you're behaving now, I wouldn't be surprised.", "de": "So wie Sie sich gerade benehmen, würde es mich nicht wundern."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "A „megmondtam” elégtétel rövid, a kár hosszú.", "en": "The satisfaction of \"I told you so\" is short, the damage is long.", "de": "Die Genugtuung von „hab ich doch gesagt“ ist kurz, der Schaden lang."}
        }
      ]
    },
    {
      "nodeId": "g_03_threat",
      "tone": "COLD",
      "npcStatement": {"hu": "Ha ez így megy tovább, a {trigger_word} megújítását másik beszállítóval tárgyaljuk.", "en": "If this goes on, we'll negotiate the {trigger_word} renewal with another supplier.", "de": "Wenn das so weitergeht, verhandeln wir den neuen {trigger_word} mit einem anderen Lieferanten."},
      "availableCards": [
        {
          "cardId": "c_g_pace_05",
          "category": "PACING",
          "text": {"hu": "Értem, hogy most elbizonytalanodott bennünk. Ezt nem akarom figyelmen kívül hagyni.", "en": "I understand you've lost confidence in us right now. I don't want to ignore that.", "de": "Ich verstehe, dass Sie gerade das Vertrauen in uns verloren haben. Das will ich nicht übergehen."},
          "delta": {"escalation": -19, "grounding": 8, "confusion": 9},
          "npcReaction": {"hu": "...Nem könnyű most bízni.", "en": "...It isn't easy to trust right now.", "de": "...Es ist gerade nicht leicht zu vertrauen."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "A fenyegetés mögötti bizalomvesztés megnevezése lefegyverző.", "en": "Naming the loss of trust behind the threat is disarming.", "de": "Den Vertrauensverlust hinter der Drohung zu benennen, wirkt entwaffnend."}
        },
        {
          "cardId": "c_g_meta_05",
          "category": "META_MODEL",
          "text": {"hu": "Minek kellene változnia ahhoz, hogy velünk folytassák?", "en": "What would need to change for you to continue with us?", "de": "Was müsste sich ändern, damit Sie mit uns weitermachen?"},
          "delta": {"escalation": -2, "grounding": -1, "confusion": 28},
          "npcReaction": {"hu": "Átláthatóbb elszámolás. Minden tétel előre egyeztetve.", "en": "More transparent invoicing. Every item agreed in advance.", "de": "Transparentere Abrechnung. Jeder Posten vorher abgestimmt."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "A partner maga adja meg a megtartás feltételét.", "en": "Your partner names the condition for staying.", "de": "Das Gegenüber nennt selbst die Bedingung fürs Bleiben."}
        },
        {
          "cardId": "c_g_reframe_04",
          "category": "REFRAMING",
          "text": {"hu": "Ez az Ön döntése. Szeretném, ha tiszta elszámolás alapján hozná meg, nem egy félreértés alapján.", "en": "That's your decision. I'd like you to make it based on clear accounts, not on a misunderstanding.", "de": "Das ist Ihre Entscheidung. Treffen Sie sie bitte auf Basis einer klaren Abrechnung, nicht wegen eines Missverständnisses."},
          "delta": {"escalation": -13, "grounding": 12, "confusion": 18},
          "npcReaction": {"hu": "Rendben. Akkor tisztázzuk.", "en": "Alright. Then let's clear it up.", "de": "In Ordnung. Dann klären wir das."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "A döntési szabadság elismerése csökkenti a dacot.", "en": "Acknowledging their freedom to decide reduces defiance.", "de": "Die Entscheidungsfreiheit anzuerkennen, verringert den Trotz."}
        },
        {
          "cardId": "c_g_def_05",
          "category": "DEFENSE",
          "text": {"hu": "Évek óta dolgozunk együtt, ennyit igazán nem érdemlünk.", "en": "We've worked together for years, we really don't deserve this.", "de": "Wir arbeiten seit Jahren zusammen, das haben wir wirklich nicht verdient."},
          "delta": {"escalation": 20, "grounding": -17, "confusion": 0},
          "npcReaction": {"hu": "Az évek nem mentség.", "en": "Years are no excuse.", "de": "Jahre sind keine Entschuldigung."},
          "nextNodeId": "g_04_deal",
          "debriefHint": {"hu": "A sértettség kimutatása gyengeségként hat egy tárgyalásban.", "en": "Showing hurt feelings comes across as weakness in a negotiation.", "de": "Gekränktheit zu zeigen, wirkt in einer Verhandlung wie Schwäche."}
        },
        {
          "cardId": "c_g_att_05",
          "category": "ATTACK",
          "text": {"hu": "Tárgyaljanak, majd meglátják, ki ad ilyen árat.", "en": "Go ahead and negotiate, you'll see who gives you a price like ours.", "de": "Verhandeln Sie ruhig, Sie werden sehen, wer Ihnen so einen Preis macht."},
          "delta": {"escalation": 37, "grounding": -29, "confusion": -24},
          "npcReaction": {"hu": "Meg fogjuk látni.", "en": "We will see.", "de": "Das werden wir sehen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A kihívás elfogadása itt a kulcsügyfél elvesztése.", "en": "Accepting the challenge here means losing the key account.", "de": "Die Herausforderung anzunehmen bedeutet hier, den Schlüsselkunden zu verlieren."}
        }
      ]
    },
    {
      "nodeId": "g_04_deal",
      "tone": "CALM",
      "npcStatement": {"hu": "Rendben. Mit javasol, hogyan zárjuk le ezt a tételt?", "en": "Alright. What do you suggest, how do we close this item?", "de": "In Ordnung. Was schlagen Sie vor, wie schließen wir diesen Posten ab?"},
      "availableCards": [
        {
          "cardId": "c_g_pace_06",
          "category": "PACING",
          "text": {"hu": "Értem, olyan megoldás kell, amit a pénzügyük előtt is meg tud védeni.", "en": "I understand, you need a solution you can defend in front of your finance department.", "de": "Verstehe, Sie brauchen eine Lösung, die Sie auch vor Ihrer Finanzabteilung vertreten können."},
          "delta": {"escalation": -15, "grounding": 7, "confusion": 6},
          "npcReaction": {"hu": "Pontosan. Ez a lényeg.", "en": "Exactly. That's the point.", "de": "Genau. Darum geht es."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A partner belső nyomásának megértése a megállapodás kulcsa.", "en": "Understanding your partner's internal pressure is the key to agreement.", "de": "Den inneren Druck des Gegenübers zu verstehen, ist der Schlüssel zur Einigung."}
        },
        {
          "cardId": "c_g_meta_06",
          "category": "META_MODEL",
          "text": {"hu": "Milyen formát fogad el a pénzügyük gond nélkül?", "en": "What format will your finance department accept without issues?", "de": "Welche Form akzeptiert Ihre Finanzabteilung problemlos?"},
          "delta": {"escalation": -5, "grounding": -1, "confusion": 29},
          "npcReaction": {"hu": "Egy tételes kimutatást az órákról. Azzal le tudom zárni.", "en": "An itemized statement of the hours. With that I can close it.", "de": "Eine detaillierte Aufstellung der Stunden. Damit kann ich das abschließen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A lezárás feltételét a partner mondja ki, így ő is elköteleződik.", "en": "Your partner states the closing condition, so they commit to it too.", "de": "Das Gegenüber nennt die Abschlussbedingung selbst und bindet sich damit."}
        },
        {
          "cardId": "c_g_reframe_05",
          "category": "REFRAMING",
          "text": {"hu": "Küldök tételes óraelszámolást, és mostantól minden kiegészítő munkát előre, írásban egyeztetünk.", "en": "I'll send an itemized timesheet, and from now on we agree all additional work in writing in advance.", "de": "Ich schicke eine detaillierte Stundenaufstellung, und ab jetzt stimmen wir jede Zusatzarbeit vorher schriftlich ab."},
          "delta": {"escalation": -16, "grounding": 13, "confusion": 22},
          "npcReaction": {"hu": "Ez korrekt. Így folytathatjuk.", "en": "That's fair. We can continue like this.", "de": "Das ist fair. So können wir weitermachen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A konfliktusból jobb folyamat születik, ami mindkét félt védi.", "en": "A better process is born out of the conflict, protecting both sides.", "de": "Aus dem Konflikt entsteht ein besserer Prozess, der beide Seiten schützt."}
        },
        {
          "cardId": "c_g_def_06",
          "category": "DEFENSE",
          "text": {"hu": "A számla jogos, nem látom, miért kellene módosítani.", "en": "The invoice is justified, I don't see why it should be changed.", "de": "Die Rechnung ist berechtigt, ich sehe nicht, warum wir sie ändern sollten."},
          "delta": {"escalation": 19, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "Akkor majd a jogászaink eldöntik.", "en": "Then our lawyers will decide.", "de": "Dann entscheiden das eben unsere Anwälte."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Merev álláspont a végén: formailag nyersz, a kapcsolatot elveszted.", "en": "A rigid position at the end: you win formally, you lose the relationship.", "de": "Starre Position am Ende: Formal gewinnst du, die Beziehung verlierst du."}
        }
      ]
    },
    {
      "nodeId": "gaslight_escalated_crisis",
      "branch": "crisis",
      "tone": "FURIOUS",
      "npcStatement": {"hu": "Ennyi volt. Ilyen hangnemben nem tárgyalok. A jogászaink keresni fogják Önöket.", "en": "That's it. I don't negotiate in this tone. Our lawyers will be in touch.", "de": "Das war's. In diesem Ton verhandle ich nicht. Unsere Anwälte werden sich bei Ihnen melden."},
      "availableCards": [
        {
          "cardId": "c_g_pace_07",
          "category": "PACING",
          "text": {"hu": "Hallom, mennyire felháborodott. Sajnálom, hogy idáig jutottunk.", "en": "I hear how outraged you are. I'm sorry it has come to this.", "de": "Ich höre, wie empört Sie sind. Es tut mir leid, dass es so weit gekommen ist."},
          "delta": {"escalation": -21, "grounding": 8, "confusion": 9},
          "npcReaction": {"hu": "...Én sem így akartam.", "en": "...I didn't want it this way either.", "de": "...So wollte ich das auch nicht."},
          "nextNodeId": "gaslight_crisis_02",
          "debriefHint": {"hu": "A helyzet sajnálata nem beismerés, de megállítja a zuhanást.", "en": "Regretting the situation isn't an admission, but it stops the fall.", "de": "Die Situation zu bedauern ist kein Eingeständnis, stoppt aber den Absturz."}
        },
        {
          "cardId": "c_g_meta_07",
          "category": "META_MODEL",
          "text": {"hu": "Mi kellene ahhoz, hogy jogászok nélkül le tudjuk zárni?", "en": "What would it take to close this without lawyers?", "de": "Was bräuchte es, um das ohne Anwälte abzuschließen?"},
          "delta": {"escalation": -4, "grounding": -3, "confusion": 30},
          "npcReaction": {"hu": "Egy írásos magyarázat. És egy bocsánatkérés a hangnemért.", "en": "A written explanation. And an apology for the tone.", "de": "Eine schriftliche Erklärung. Und eine Entschuldigung für den Ton."},
          "nextNodeId": "gaslight_crisis_02",
          "debriefHint": {"hu": "A kilépési fenyegetés mögött ott van a maradás feltétele.", "en": "Behind the threat to walk away lies the condition for staying.", "de": "Hinter der Drohung zu gehen, liegt die Bedingung fürs Bleiben."}
        },
        {
          "cardId": "c_g_def_07",
          "category": "DEFENSE",
          "text": {"hu": "Mi csak a megállapodás szerint jártunk el.", "en": "We only acted according to the agreement.", "de": "Wir haben nur gemäß der Vereinbarung gehandelt."},
          "delta": {"escalation": 20, "grounding": -18, "confusion": 0},
          "npcReaction": {"hu": "Majd a jogász eldönti.", "en": "The lawyer will decide.", "de": "Das entscheidet der Anwalt."},
          "nextNodeId": "gaslight_crisis_02",
          "debriefHint": {"hu": "Krízisben az igazad hangoztatása csak a jogi utat erősíti.", "en": "In a crisis, insisting you're right only strengthens the legal route.", "de": "In der Krise stärkt das Beharren auf dem eigenen Recht nur den juristischen Weg."}
        },
        {
          "cardId": "c_g_att_06",
          "category": "ATTACK",
          "text": {"hu": "Rendben, a mi jogászaink is ráérnek.", "en": "Fine, our lawyers have time too.", "de": "Gut, unsere Anwälte haben auch Zeit."},
          "delta": {"escalation": 45, "grounding": -35, "confusion": -30},
          "npcReaction": {"hu": "Akkor ezt befejeztük.", "en": "Then we're done.", "de": "Dann sind wir fertig."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Az ellencsapás itt végleges szakítás.", "en": "Striking back here is a final rupture.", "de": "Der Gegenschlag ist hier der endgültige Bruch."}
        }
      ]
    },
    {
      "nodeId": "gaslight_crisis_02",
      "branch": "crisis",
      "tone": "COLD",
      "npcStatement": {"hu": "Rendben. Öt percet kap. Mit javasol?", "en": "Fine. You have five minutes. What do you propose?", "de": "Gut. Sie haben fünf Minuten. Was schlagen Sie vor?"},
      "availableCards": [
        {
          "cardId": "c_g_pace_08",
          "category": "PACING",
          "text": {"hu": "Köszönöm. Értem, hogy most bizonyítanunk kell, nem ígérgetni.", "en": "Thank you. I understand we have to prove ourselves now, not make promises.", "de": "Danke. Ich verstehe, dass wir uns jetzt beweisen müssen, statt zu versprechen."},
          "delta": {"escalation": -17, "grounding": 7, "confusion": 8},
          "npcReaction": {"hu": "Így van.", "en": "Correct.", "de": "So ist es."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A partner elvárásának pontos kimondása tisztelet.", "en": "Stating your partner's expectation precisely is a sign of respect.", "de": "Die Erwartung des Gegenübers genau auszusprechen, ist ein Zeichen von Respekt."}
        },
        {
          "cardId": "c_g_reframe_06",
          "category": "REFRAMING",
          "text": {"hu": "Ma küldök tételes kimutatást, és közös áttekintést javaslok a pénzügyükkel, mielőtt bármit kifizetnek.", "en": "I'll send an itemized statement today and propose a joint review with your finance team before anything is paid.", "de": "Ich schicke heute eine Aufstellung und schlage vor, sie vor jeder Zahlung gemeinsam mit Ihrer Finanzabteilung zu prüfen."},
          "delta": {"escalation": -15, "grounding": 14, "confusion": 23},
          "npcReaction": {"hu": "Ez elfogadható. Várom a kimutatást.", "en": "That's acceptable. I'll wait for the statement.", "de": "Das ist akzeptabel. Ich erwarte die Aufstellung."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A fizetés feltételhez kötése a te ajánlatodban visszaadja a partner biztonságát.", "en": "Making payment conditional in your own offer gives your partner back their security.", "de": "Die Zahlung im eigenen Angebot an eine Bedingung zu knüpfen, gibt dem Gegenüber Sicherheit zurück."}
        },
        {
          "cardId": "c_g_meta_08",
          "category": "META_MODEL",
          "text": {"hu": "Melyik részt kellene először tisztázni, hogy továbbléphessünk?", "en": "Which part should we clear up first so we can move on?", "de": "Welchen Teil sollten wir zuerst klären, damit wir weiterkommen?"},
          "delta": {"escalation": -4, "grounding": -2, "confusion": 28},
          "npcReaction": {"hu": "Az órák számát. A többi rendben van.", "en": "The number of hours. The rest is fine.", "de": "Die Anzahl der Stunden. Der Rest ist in Ordnung."},
          "nextNodeId": null,
          "debriefHint": {"hu": "A vitatott rész leszűkítése kiderítheti, hogy a konfliktus kisebb, mint látszott.", "en": "Narrowing down the disputed part may show the conflict is smaller than it seemed.", "de": "Den strittigen Teil einzugrenzen kann zeigen, dass der Konflikt kleiner ist als gedacht."}
        },
        {
          "cardId": "c_g_def_08",
          "category": "DEFENSE",
          "text": {"hu": "Nem tudom, mit javasolhatnék még, mindent elmondtam.", "en": "I don't know what else I could propose, I've said everything.", "de": "Ich weiß nicht, was ich noch vorschlagen könnte, ich habe alles gesagt."},
          "delta": {"escalation": 17, "grounding": -16, "confusion": 0},
          "npcReaction": {"hu": "Akkor nincs miről beszélnünk.", "en": "Then there's nothing to talk about.", "de": "Dann gibt es nichts zu besprechen."},
          "nextNodeId": null,
          "debriefHint": {"hu": "Az öt percet ötlettelenséggel tölteni a lehetőség elengedése.", "en": "Spending the five minutes without ideas means letting the opportunity go.", "de": "Die fünf Minuten ohne Ideen zu verbringen heißt, die Chance aufzugeben."}
        }
      ]
    }
  ]
}
```

### 22.6 Catalog file

`public/scenarios/catalog.json`, complete. Every field equals the matching scenario file (E016).

```json
{
  "schemaVersion": "1.0",
  "scenarios": [
    {
      "id": "scen_stakeholder_scope_002",
      "file": "scen_stakeholder_scope_002.json",
      "contentVersion": 1,
      "title": {"hu": "A Scope-Kúszás Hétfő Reggel", "en": "Scope Creep on a Monday Morning", "de": "Scope Creep am Montagmorgen"},
      "summary": {"hu": "Egy üzleti stakeholder két új funkciót akar a futó sprintbe, mert a vezérigazgató már megígérte. Mondj nemet úgy, hogy szövetséges maradj.", "en": "A business stakeholder wants two new features in the running sprint because the CEO has already promised them. Say no and stay an ally.", "de": "Ein Business-Stakeholder will zwei neue Features im laufenden Sprint, weil der CEO sie schon versprochen hat. Sag Nein und bleib trotzdem Verbündeter."},
      "difficulty": "BEGINNER",
      "personas": ["P1_MANAGER"],
      "order": 0
    },
    {
      "id": "scen_angry_pm_deadline_001",
      "file": "scen_angry_pm_deadline_001.json",
      "contentVersion": 1,
      "title": {"hu": "A Bedőlt Sprint és a Dühös Projektmenedzser", "en": "The Failed Sprint and the Angry Project Manager", "de": "Der gescheiterte Sprint und die wütende Projektmanagerin"},
      "summary": {"hu": "A projektmenedzser a csapat előtt téged hibáztat a csúszásért. Tartsd meg a hidegvéred, és tereld a beszélgetést megoldás felé.", "en": "The project manager blames you for the delay in front of the team. Keep your cool and steer the conversation towards a solution.", "de": "Die Projektmanagerin gibt dir vor dem Team die Schuld an der Verzögerung. Bleib ruhig und lenke das Gespräch in Richtung Lösung."},
      "difficulty": "INTERMEDIATE",
      "personas": ["P1_MANAGER"],
      "order": 1
    },
    {
      "id": "scen_customer_refund_003",
      "file": "scen_customer_refund_003.json",
      "contentVersion": 1,
      "title": {"hu": "A Visszatérített Pénz, Ami Nem Jött Meg", "en": "The Refund That Never Arrived", "de": "Die Rückerstattung, die nie ankam"},
      "summary": {"hu": "Egy ügyfél három hete várja a pénzét, és most azzal fenyeget, hogy mindenhol rossz értékelést ír. Csillapítsd le ígérgetés nélkül.", "en": "A customer has been waiting three weeks for her money and now threatens to post bad reviews everywhere. Calm her down without empty promises.", "de": "Eine Kundin wartet seit drei Wochen auf ihr Geld und droht, überall schlechte Bewertungen zu schreiben. Beruhige sie ohne leere Versprechen."},
      "difficulty": "INTERMEDIATE",
      "personas": ["P2_FRONTLINE"],
      "order": 2
    },
    {
      "id": "scen_customer_gaslight_004",
      "file": "scen_customer_gaslight_004.json",
      "contentVersion": 1,
      "title": {"hu": "„Ezt Sosem Mondtam!”", "en": "\"I Never Said That!\"", "de": "„Das habe ich nie gesagt!“"},
      "summary": {"hu": "Egy kulcsügyfél letagad egy írásban rögzített megállapodást, és csalással vádol. Maradj földelt, és vidd vissza a beszélgetést a tényekhez, időnyomás alatt.", "en": "A key account denies an agreement made in writing and accuses you of fraud. Stay grounded and bring the conversation back to the facts, under time pressure.", "de": "Ein Schlüsselkunde leugnet eine schriftliche Vereinbarung und wirft dir Betrug vor. Bleib geerdet und bring das Gespräch unter Zeitdruck zurück zu den Fakten."},
      "difficulty": "ADVANCED",
      "personas": ["P2_FRONTLINE"],
      "order": 3
    }
  ]
}
```

---

## 23. UI string table (HU / EN / DE)

Files:

- `src/i18n/hu.ts`: `export const hu = { ... } as const` with every key below. It is the reference key set.
- `src/i18n/en.ts`, `src/i18n/de.ts`: `export const en: Record<keyof typeof hu, string> = { ... }`. A missing or extra key is a TypeScript error, so an incomplete translation cannot build.
- `src/i18n/locale.ts`: `t(key, vars?)` looks up the active locale's table and runs `interpolate()` (Section 10.3) with `vars`. Numbers passed in `vars` are formatted by the caller with `fmtNumber()` before the call, so `t()` only handles strings.
- All three tables are bundled (about 6 KB gzip together); no lazy loading.
- Endonyms (`language.*`) are the same in every table on purpose: a player who picked the wrong language must still recognise their own.

Placeholders: `{name}` as in content. `{sec}`, `{pct}`, `{from}`, `{to}` receive already formatted numbers.

| Key | hu | en | de |
|---|---|---|---|
| `app.name` | Verbális Aikidó | Verbal Aikido | Verbales Aikido |
| `app.tagline` | The Empathy Firewall | The Empathy Firewall | The Empathy Firewall |
| `language.hu` | Magyar | Magyar | Magyar |
| `language.en` | English | English | English |
| `language.de` | Deutsch | Deutsch | Deutsch |
| `language.auto` | Rendszer szerint | Same as device | Wie das Gerät |
| `onboarding.pickLanguage` | Válassz nyelvet | Choose your language | Wähle deine Sprache |
| `onboarding.intro` | Gyakorold, hogyan maradj nyugodt és határozott, amikor valaki rád zúdítja a feszültségét. Rövid helyzetek, valódi döntések. | Practise staying calm and assertive when someone unloads their tension on you. Short situations, real decisions. | Übe, ruhig und klar zu bleiben, wenn jemand seine Anspannung an dir auslässt. Kurze Situationen, echte Entscheidungen. |
| `onboarding.pickRole` | Melyik helyzet ismerősebb neked? | Which situation sounds more familiar? | Welche Situation kennst du besser? |
| `persona.P1_MANAGER` | Vezető / projektmenedzser | Team lead / project manager | Führungskraft / Projektmanager:in |
| `persona.P2_FRONTLINE` | Ügyfélkapcsolati szakértő | Customer-facing specialist | Kundenservice-Profi |
| `onboarding.skip` | Kihagyom | Skip | Überspringen |
| `howto.title` | Hogyan működik? | How does it work? | Wie funktioniert es? |
| `howto.p1` | Három mérő mutatja a helyzetet. Ha az Eszkaláció eléri a 100-at, a beszélgetés megszakad. Ha a Földelésed 0-ra esik, kimerülsz. Ha a Megakadás eléri a 80-at, a partner megnyílik: nyertél. | Three meters show the situation. If Escalation reaches 100, the conversation breaks off. If your Grounding drops to 0, you burn out. If the Trance index reaches 80, your partner opens up: you win. | Drei Anzeigen zeigen die Lage. Erreicht die Eskalation 100, bricht das Gespräch ab. Fällt deine Erdung auf 0, bist du erschöpft. Erreicht der Trance-Index 80, öffnet sich dein Gegenüber: Du hast gewonnen. |
| `howto.p2` | Minden körben három kártyából választasz. A konstruktív stílusok (Pacing, Meta-modell kérdés, Átkeretezés) csillapítanak, a reaktívak (Védekezés, Visszatámadás) olajat öntenek a tűzre. | Each turn you pick one of three cards. Constructive styles (Pacing, Meta-model question, Reframing) calm things down, reactive ones (Defense, Counterattack) pour fuel on the fire. | In jeder Runde wählst du eine von drei Karten. Konstruktive Stile (Pacing, Meta-Modell-Frage, Reframing) beruhigen, reaktive (Verteidigung, Gegenangriff) gießen Öl ins Feuer. |
| `howto.p3` | Koppints egy kártyára, majd „Alkalmazom”, vagy húzd felfelé. | Tap a card, then "Use it", or swipe it up. | Tippe auf eine Karte und dann auf „Ausspielen“, oder wische sie nach oben. |
| `howto.p4` | Ha az Eszkaláció eléri a 70-et, vagy a Földelésed 30-ra vagy az alá esik, pánikzónában vagy. A végén megmutatjuk, mennyi időt töltöttél ott, és milyen gyorsan jöttél ki belőle. | If Escalation reaches 70 or your Grounding falls to 30, you are in the panic zone. At the end we show how long you stayed there and how fast you got out. | Erreicht die Eskalation 70 oder sinkt deine Erdung auf 30, bist du in der Panikzone. Am Ende zeigen wir, wie lange du dort warst und wie schnell du herausgefunden hast. |
| `common.next` | Tovább | Next | Weiter |
| `common.back` | Vissza | Back | Zurück |
| `common.cancel` | Mégse | Cancel | Abbrechen |
| `home.title` | Helyzetek | Situations | Situationen |
| `home.best` | Legjobb: {outcome} | Best: {outcome} | Bestes Ergebnis: {outcome} |
| `home.bestRto` | Legjobb RTO: {sec} mp | Best RTO: {sec} s | Beste RTO: {sec} s |
| `difficulty.BEGINNER` | Kezdő | Beginner | Einsteiger |
| `difficulty.INTERMEDIATE` | Haladó | Intermediate | Fortgeschritten |
| `difficulty.ADVANCED` | Profi | Advanced | Profi |
| `briefing.start` | Kezdés | Start | Los geht's |
| `briefing.timer` | Ebben a helyzetben {sec} másodperced van minden döntésre. | In this situation you have {sec} seconds for every decision. | In dieser Situation hast du für jede Entscheidung {sec} Sekunden. |
| `meter.E` | Eszkaláció | Escalation | Eskalation |
| `meter.F` | Földelés | Grounding | Erdung |
| `meter.K` | Megakadás | Trance index | Trance-Index |
| `meter.announce` | {meter} új értéke: {to} (korábban: {from}). | {meter} is now {to} (was {from}). | {meter} liegt jetzt bei {to} (vorher {from}). |
| `category.PACING` | Pacing / Validálás | Pacing / Validation | Pacing / Validierung |
| `category.META_MODEL` | Meta-modell kérdés | Meta-model question | Meta-Modell-Frage |
| `category.REFRAMING` | Átkeretezés | Reframing | Reframing |
| `category.DEFENSE` | Reaktív védekezés | Reactive defense | Reaktive Verteidigung |
| `category.ATTACK` | Visszatámadás | Counterattack | Gegenangriff |
| `game.turn` | {n}. kör | Turn {n} | Runde {n} |
| `game.hand` | Válaszkártyák | Response cards | Antwortkarten |
| `game.apply` | Alkalmazom | Use it | Ausspielen |
| `game.leaveConfirm` | Kilépsz a helyzetből? | Leave this situation? | Situation verlassen? |
| `game.later` | Később folytatom | Continue later | Später weitermachen |
| `game.giveUp` | Feladom | Give up | Aufgeben |
| `timer.fiveSeconds` | Még 5 másodperc. | 5 seconds left. | Noch 5 Sekunden. |
| `timer.expired` | Lejárt az idő, a reflexed döntött helyetted. | Time's up, your reflex decided for you. | Die Zeit ist um, dein Reflex hat für dich entschieden. |
| `resume.title` | Folytatod a megkezdett helyzetet? | Continue the situation you started? | Möchtest du die begonnene Situation fortsetzen? |
| `resume.continue` | Folytatás | Continue | Fortsetzen |
| `resume.restart` | Új kezdés | Start over | Neu beginnen |
| `outcome.WIN_BREAKTHROUGH` | Áttörés! A partner megnyílt az együttműködésre. | Breakthrough! Your partner opened up to cooperation. | Durchbruch! Dein Gegenüber ist offen für Zusammenarbeit. |
| `outcome.LOSS_RUPTURE` | Szakadás. A beszélgetés megszakadt. | Rupture. The conversation broke off. | Abbruch. Das Gespräch ist gescheitert. |
| `outcome.LOSS_BURNOUT` | Kimerültél. Lefagytál a nyomás alatt. | Burnout. You froze under the pressure. | Erschöpft. Du bist unter dem Druck erstarrt. |
| `outcome.END_DEESCALATED` | Lecsillapodott a helyzet, de áttörés nem történt. | The situation calmed down, but there was no breakthrough. | Die Lage hat sich beruhigt, aber ohne Durchbruch. |
| `outcome.END_UNRESOLVED` | A helyzet megoldatlan maradt. | The situation remained unresolved. | Die Situation blieb ungelöst. |
| `outcomeShort.WIN_BREAKTHROUGH` | Áttörés | Breakthrough | Durchbruch |
| `outcomeShort.LOSS_RUPTURE` | Szakadás | Rupture | Abbruch |
| `outcomeShort.LOSS_BURNOUT` | Kimerülés | Burnout | Erschöpfung |
| `outcomeShort.END_DEESCALATED` | Lecsillapítva | De-escalated | Deeskaliert |
| `outcomeShort.END_UNRESOLVED` | Megoldatlan | Unresolved | Ungelöst |
| `debrief.title` | Kiértékelés | Debrief | Auswertung |
| `debrief.panicSec` | Pánikzónában töltött idő: {sec} mp | Time in the panic zone: {sec} s | Zeit in der Panikzone: {sec} s |
| `debrief.rto` | Átlagos visszatérési idő (RTO): {sec} mp | Average recovery time (RTO): {sec} s | Durchschnittliche Erholungszeit (RTO): {sec} s |
| `debrief.noPanic` | Nem kerültél pánikzónába. | You never entered the panic zone. | Du warst nie in der Panikzone. |
| `debrief.unrecovered` | Nem sikerült kilépni a pánikzónából. | You did not get out of the panic zone. | Du bist nicht aus der Panikzone herausgekommen. |
| `debrief.ratio` | {pct}% konstruktív választás | {pct}% constructive choices | {pct} % konstruktive Entscheidungen |
| `debrief.dominant` | Jellemző stílusod: {style} | Your typical style: {style} | Dein typischer Stil: {style} |
| `debrief.tip.PACING` | Jól kapcsolódsz az érzelmekhez. Próbáld ki mellé a konkretizáló kérdéseket is. | You connect well with emotions. Try adding clarifying questions too. | Du gehst gut auf Gefühle ein. Probier zusätzlich konkretisierende Fragen. |
| `debrief.tip.META_MODEL` | Erős vagy a tisztázásban. Dühös partnernél előbb validálj, aztán kérdezz. | You are strong at clarifying. With an angry partner, validate first, then ask. | Du kannst gut klären. Bei einem wütenden Gegenüber erst validieren, dann fragen. |
| `debrief.tip.REFRAMING` | Jól emeled be a közös célt. Ügyelj, hogy ne hangozzon témaváltásnak. | You bring in the shared goal well. Make sure it doesn't sound like changing the subject. | Du bringst das gemeinsame Ziel gut ein. Achte darauf, dass es nicht wie ein Themenwechsel klingt. |
| `debrief.tip.DEFENSE` | Hajlamos vagy magyarázkodni. Legközelebb először nevezd meg a partner érzését. | You tend to justify yourself. Next time, name your partner's feeling first. | Du neigst dazu, dich zu rechtfertigen. Benenne nächstes Mal zuerst das Gefühl deines Gegenübers. |
| `debrief.tip.ATTACK` | Nyomás alatt visszaütsz. Vegyél egy levegőt, és kérdezz rá, mi a partner valódi célja. | Under pressure you hit back. Take a breath and ask what your partner really wants. | Unter Druck schlägst du zurück. Atme durch und frag, was dein Gegenüber wirklich will. |
| `debrief.timeline` | Mérők alakulása körönként | Meters turn by turn | Anzeigen Runde für Runde |
| `debrief.turns` | Körök részletesen | Turns in detail | Runden im Detail |
| `debrief.retry` | Újra | Play again | Nochmal |
| `debrief.toList` | Vissza a listához | Back to the list | Zurück zur Liste |
| `stats.title` | Statisztika | Statistics | Statistik |
| `stats.ratioLast50` | Konstruktív arány (utolsó 50 játék): {pct}% | Constructive ratio (last 50 runs): {pct}% | Konstruktiver Anteil (letzte 50 Runden): {pct} % |
| `settings.title` | Beállítások | Settings | Einstellungen |
| `settings.language` | Nyelv | Language | Sprache |
| `settings.audio` | Hangok | Sounds | Töne |
| `settings.haptic` | Rezgés erőssége | Vibration strength | Vibrationsstärke |
| `settings.haptic.OFF` | Ki | Off | Aus |
| `settings.haptic.LOW` | Gyenge | Low | Schwach |
| `settings.haptic.HIGH` | Erős | Strong | Stark |
| `settings.hapticUnsupported` | Ez az eszköz nem támogatja a rezgést. | This device does not support vibration. | Dieses Gerät unterstützt keine Vibration. |
| `settings.motion` | Animációk csökkentése | Reduce animations | Animationen reduzieren |
| `settings.motion.system` | Rendszer szerint | Same as device | Wie das Gerät |
| `settings.motion.on` | Be | On | An |
| `settings.motion.off` | Ki | Off | Aus |
| `settings.clearRun` | Folyamatban lévő mentés törlése | Delete the saved run in progress | Gespeicherten Spielstand löschen |
| `settings.clearAll` | Összes adat törlése | Delete all data | Alle Daten löschen |
| `settings.clearAllConfirm` | Biztosan törlöd az összes eredményt és beállítást? | Delete all results and settings? | Wirklich alle Ergebnisse und Einstellungen löschen? |
| `settings.storageVolatile` | A böngésző nem engedi az adatok mentését, az eredmények a lap bezárásakor elvesznek. | Your browser does not allow saving data; results will be lost when you close the page. | Dein Browser erlaubt kein Speichern; die Ergebnisse gehen beim Schließen der Seite verloren. |
| `update.available` | Új verzió érhető el. | A new version is available. | Eine neue Version ist verfügbar. |
| `update.apply` | Frissítés | Update | Aktualisieren |
| `errors.scenarioLoad` | Ezt a helyzetet nem sikerült betölteni. | This situation could not be loaded. | Diese Situation konnte nicht geladen werden. |
| `errors.generic` | Váratlan hiba történt. Próbáld újratölteni az oldalt. | Something went wrong. Try reloading the page. | Etwas ist schiefgelaufen. Lade die Seite neu. |

Units: Hungarian uses "mp" (másodperc), English and German "s". German puts a space before `%` (DIN 5008), Hungarian and English do not; that is why `%` is inside the strings and not appended by code.

---

## 24. Testing strategy

### 24.1 Unit tests (Vitest), `npm run test`

| Area | Must cover |
|---|---|
| `metrics.ts` | the vectors in 8.3; clamping at 0 and 100; momentum increments, cap at 4, reset on constructive; F drain uses E before the turn; 2-decimal rounding |
| `outcome.ts` | each outcome; precedence E > F > K when several thresholds hit at once; terminal DEESCALATED vs UNRESOLVED; MAX_TURNS cap |
| `branching.ts` | crisis redirect at E=80.01 yes, at E=80 no; only from main branch; only once; not on final turn |
| `hand.ts` | guarantee over 10 000 seeds; no duplicates; pool of 3 shows all; determinism (same seed same hand) |
| `rng.ts` | known first 5 values for seed 1 (record once, assert forever) |
| `interpolate.ts` | node override beats scenario var; `npc_name`; unknown var left literal |
| `fsm.ts` | every row of the transition table; ignored events return the same object; timeout auto-commit picks first reactive card |
| `replay.ts` | replaying a recorded log equals the live state (deep equal) |
| `stats.ts` | panic time accumulation, episodes, RTO mean, unrecovered episode, dominant category tie-break |
| validator | every invalid fixture triggers its code; all shipped scenarios pass with 0 errors |
| storage | IndexedDB driver with `fake-indexeddb`; LocalStorage driver with jsdom; fallback selection; quota handling; serialized writes ordering |
| haptics/audio | missing API = no throw; LOW scaling; mute |

Coverage gate: `src/engine/**` ≥ 95% lines and branches. Other folders: no gate.

### 24.2 E2E (Playwright), `npm run test:e2e`

Projects: `chromium-mobile` (Pixel 5 device descriptor), `webkit-mobile` (iPhone SE descriptor, 375×667; the automated proxy for iOS Safari, which is not verified on a device, D47).

Desktop projects (D46), each running only the tests that carry the Playwright tag `@desktop` (`grep: /@desktop/`; every `@desktop` scenario of Section 28 gets that tag): `chromium-desktop-1280` and `firefox-desktop-1280` (1280×800), `chromium-desktop-1920` and `firefox-desktop-1920` (1920×1080), all with the Desktop Chrome / Desktop Firefox descriptors (mouse, no touch, `deviceScaleFactor: 1`). Edge uses the same engine as Chromium and is checked by hand (Section 24.4).

PWA project: `pwa` (Desktop Chrome descriptor) runs `pwa.spec.ts` only and is started by the CI `pwa` job, not by `test:e2e` (Section 24.3). Server: `vite preview` on the production build, built with the same `VITE_BASE` as the deployment, so `baseURL` is `http://localhost:4173/<repo>/` (Section 25.3). Tests always run against the artifact that gets deployed.

Test hooks, allowed in production because they reveal nothing sensitive:
- `?seed=<uint32>` on the start URL fixes the run seed so hands are known.
- `?fastReveal=1` sets reveal duration to 0 (does not touch the 180/400 ms timings that FR tests measure).

Stubs (`helpers/stubs.ts`, injected with `page.addInitScript`):
- `navigator.vibrate` replaced by a recorder pushing patterns into `window.__vibrations`.
- `AudioContext` wrapped: `createOscillator` records `frequency.value` and `type` into `window.__tones`.

Acceptance scenarios for FR-01..FR-05 and everything else are specified in Section 28. Each Section 28 scenario has an `@SBE-…` id and a level tag (`@unit`, `@component`, `@e2e`, `@ci`, `@manual`); the level decides where it is automated.

Locale projects: the `chromium-mobile` project runs the full E2E suite in `hu`; `chromium-mobile-en` and `chromium-mobile-de` run the scenarios tagged `@i18n` plus one full playthrough (`@SBE-GLD-001`) with `locale` set in the Playwright context.

Additional E2E specs: `offline.spec.ts` (load once, `context.setOffline(true)`, reload, play a full scenario; also part of the `pwa` job, SBE-PWA-001), `resume.spec.ts` (commit 2 cards, reload, accept resume, assert same node, same hand, same metrics), `a11y.spec.ts` (axe on every screen), `memory.spec.ts` (Chromium only, 10 runs, heap < 45 MB), `startup.spec.ts` (Chromium only, CDP-throttled start time, Section 20), `desktop.spec.ts` (the `@desktop` scenarios), `visibility.spec.ts` (stress timer frozen while `document.visibilityState` is mocked hidden via `page.evaluate` dispatching `visibilitychange` with an overridden getter).

### 24.3 PWA checks (CI job `pwa`)

These checks prove the PRD's installable-PWA requirement (D22). They run in the CI job `pwa` with `npm run test:pwa`, against the downloaded `dist` served by `vite preview` under `VITE_BASE`, in Playwright Chromium.

| # | Check | How | SBE |
|---|---|---|---|
| 1 | Manifest | `scripts/check-manifest.ts dist`: `name` and `short_name` as in 19.1; `start_url` and `scope` resolve inside the base path; `display` is `standalone`; `theme_color` and `background_color` set; icons 192 and 512 PNG and a maskable 512 PNG exist in `dist` and have exactly those pixel sizes (read from the PNG header) | SBE-PWA-004 |
| 2 | Precache completeness | `scripts/check-bundle-size.ts` (also run by `build`) reads the precache manifest from `dist/sw.js` and fails if any file in `dist` is missing from it, except the service worker files (`sw.js`, `workbox-*.js`) and source maps (`*.map`) | SBE-PWA-002 |
| 3 | Installability | `pwa.spec.ts`: CDP `Page.getInstallabilityErrors` returns an empty list. This is Chrome's own install criteria. | SBE-PWA-006 |
| 4 | Service worker control | `pwa.spec.ts`: after the first load and one reload, `navigator.serviceWorker.controller` is set and the registration scope equals `<origin><VITE_BASE>` | SBE-PWA-007 |
| 5 | Offline | `pwa.spec.ts` and `offline.spec.ts`: `context.setOffline(true)`, reload the start URL, the app is interactive, one full scenario is played, the result is stored | SBE-PWA-001 |
| 6 | Update flow | `pwa.spec.ts`: two builds of the same commit with different versions (`dist` and `dist-next`, the second built with `VITE_APP_VERSION=<version>-next`); the spec serves `dist`, plays one run, then restarts `vite preview` on the same port with `--outDir dist-next`; the new service worker waits, the toast appears only outside the Game screen, applying it loads the new version and the stored results are unchanged | SBE-PWA-003 |

`npm run test:pwa` = `tsx scripts/check-manifest.ts dist && tsx scripts/check-bundle-size.ts && playwright test --project=pwa`. The job builds `dist-next` itself before it runs; `dist` is the artifact that gets deployed.

Manual PWA checks on the real devices are part of the checklist in Section 24.4 (rows 1 to 5).

### 24.4 Physical device test (DoD §15.4, D47)

Manual checklist, run before release, results recorded in `docs/device-test-<date>.md`. "n/a" cells are not run. The laptop column is run in Chrome, Edge and Firefox unless the cell says otherwise, at two resolutions at least (e.g. 1366×768 and 1920×1080, Windows display scaling 125–150 %).

| # | Check | Low-end Android phone (Chrome) | Other Android phone (Chrome) | Android tablet (Chrome, both orientations) | Windows laptop (Chrome, Edge, Firefox) |
|---|---|---|---|---|---|
| 1 | Install from the browser; icon and name correct; opens standalone without browser UI | | | | Chrome, Edge (Firefox: n/a, tab only) |
| 2 | Installed app is locked to portrait | | | | n/a |
| 3 | Airplane mode (laptop: network off), cold start from the home-screen / start-menu icon, play a full scenario | | | | Chrome, Edge; Firefox: reload the open tab |
| 4 | Results survive closing the app and restarting the device (laptop: restarting the browser) | | | | |
| 5 | Update deployed while installed: toast appears (never during a game), update applied, no data lost | | | | Chrome, Edge |
| 6 | Swipe-up and tap+confirm both commit (laptop: mouse click + confirm, and an upward mouse drag) | | | | |
| 7 | Keyboard only: start and finish a scenario with `Tab`, `Enter`, `1`/`2`/`3`, `Esc`, `Space`; key hints visible | n/a | n/a | n/a | |
| 8 | Layout: centred column, bottom zone usable at both resolutions and scalings, no horizontal scroll; resize the window during a run | n/a | n/a | portrait and landscape tab | |
| 9 | Vibration patterns felt and distinguishable | | | if the tablet has a motor; otherwise the setting is disabled with the note | setting disabled with the note, no error |
| 10 | Sounds play after the first tap, click or key press; mute works | | | | |
| 11 | Lock the screen mid-timer (laptop: minimize the window or switch tab), come back, timer continued from the same value | | | | |
| 12 | Kill the app mid-run (laptop: close the tab), reopen, resume works | | | | |
| 13 | No display cutout or gesture bar overlap on the bottom buttons | | | | n/a |
| 14 | Double-tap does not zoom | | | | n/a |
| 15 | Screen reader reads the NPC statement and the outcome: TalkBack on Android, NVDA (or Narrator) on Windows | | | | Chrome, Firefox |
| 16 | Switch language to German and English in Settings, play one turn each; the screen reader uses the matching voice | | | | Chrome |
| 17 | Animations smooth: DevTools performance trace during swipe, card flight and meters shows no long tasks | | n/a | n/a | n/a |

Reference devices: the low-end phone is an Android with ≤ 3 GB RAM on Chrome stable (e.g., Samsung Galaxy A14 class); the record names the exact models, Android versions, laptop resolutions and scaling. iOS and iPadOS: no device available, not verified on a device (D47); the WebKit E2E project is the only iOS check. Every record states this gap.

---

### 24.5 Spec coverage (Section 28)

- `tests/spec/*.feature` hold the Section 28 features verbatim.
- `scripts/check-spec-coverage.ts` collects every `@SBE-[A-Z0-9]+-\d{3}` id from those files, skips scenarios tagged `@manual`, and searches the titles of all Vitest and Playwright tests (from their JSON reporters) for each id. A missing id fails the CI `unit` job and prints the list.
- Scenario Outlines: one test per example row (`test.each`), title `<id> [row <n>]`. The checker accepts the id with or without a row suffix.
- A test may cover several ids (e.g. a Playwright test that plays `@SBE-GLD-001` and asserts `@SBE-HAP-002`); list all ids in its title.

## 25. Build, CI and deployment

### 25.1 npm scripts

```json
{
  "scripts": {
    "dev": "vite",
    "predev": "npm run validate:scenarios",
    "build": "tsc --noEmit && vite build && tsx scripts/check-bundle-size.ts",
    "prebuild": "npm run validate:scenarios",
    "preview": "vite preview --port 4173",
    "validate:scenarios": "tsx scripts/validate-scenarios.ts public/scenarios",
    "lint": "eslint . && prettier --check .",
    "test": "vitest run --coverage",
    "test:e2e": "playwright test --project=chromium-mobile --project=chromium-mobile-en --project=chromium-mobile-de --project=webkit-mobile --project=chromium-desktop-1280 --project=chromium-desktop-1920 --project=firefox-desktop-1280 --project=firefox-desktop-1920",
    "test:pwa": "tsx scripts/check-manifest.ts dist && tsx scripts/check-bundle-size.ts && playwright test --project=pwa"
  }
}
```

### 25.2 GitHub Actions

One workflow file, `.github/workflows/ci.yml`:

```
on:          pull_request; push to main
env:         VITE_BASE = "/${{ github.event.repository.name }}/"
permissions: contents: read   (deploy job adds pages: write, id-token: write)

validate:    setup-node from .nvmrc, npm ci, npm run lint, npm run validate:scenarios
unit:        npm run test                          (uploads coverage + the JSON test report)
build:       npm run build                         (uploads dist/ as artifact "dist")
e2e:         container mcr.microsoft.com/playwright:v<exact pinned Playwright version>-noble
             downloads "dist", npm run test:e2e    (needs: build)
pwa:         same container as e2e; downloads "dist", builds "dist-next" with VITE_APP_VERSION=<version>-next,
             npm run test:pwa                      (needs: build; Section 24.3)
deploy:      needs: validate, unit, e2e, pwa
             if: push to main
             environment: github-pages
             concurrency: group "pages", cancel-in-progress: false
             downloads "dist" -> actions/upload-pages-artifact -> actions/deploy-pages
```

- The deploy job publishes the exact `dist/` that `e2e` and `pwa` tested; it never rebuilds. `dist-next` exists only inside the `pwa` job and is never deployed.
- Pull requests run everything except `deploy`.
- Third-party actions are pinned to a full commit SHA, with the version in a comment (supply-chain safety on a public repo).
- `setup-node` uses `node-version-file: .nvmrc` and `cache: npm`.
- One-time repository setting: Settings > Pages > Build and deployment > Source = **GitHub Actions**. Branch protection on `main` requires the `validate`, `unit`, `e2e` and `pwa` checks.

### 25.3 Deployment (GitHub Pages)

- Host: GitHub Pages of the game's public GitHub repository (D45). Free, HTTPS by default (required for the service worker).
- One repository per game, one deployment per repository. Hungarian, English and German are in the same app and the same deployment and are switched at runtime in the app (D28, D32). There is no per-language repository, build, branch or URL.
- URL: `https://<owner>.github.io/<repo>/`. The app is served under the sub-path `/<repo>/`, so the build sets `base` in `vite.config.ts` from `VITE_BASE` (CI sets it to `/<repo>/`; default `/` for local dev). Manifest `start_url` and `scope` stay `"./"`, which resolves under the sub-path. The service worker is registered with the same base, so its scope is `/<repo>/`.
- No 404 fallback page is needed: navigation never changes the URL path (Section 16.1 pushes history state without a new path), so a reload always requests `index.html`.
- No `.nojekyll` file is needed: deployment goes through `actions/deploy-pages`, which does not run Jekyll.
- Content Security Policy, in `index.html` as `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' <sync endpoint if enabled>; manifest-src 'self'; worker-src 'self'">`. If `VITE_SYNC_ENDPOINT` is set, a small Vite `transformIndexHtml` hook adds its origin to `connect-src` at build time.
- Accepted trade-offs of GitHub Pages (no custom headers):
  - `frame-ancestors` cannot be set through a meta tag, so another site could embed the game in a frame. Accepted: the app has no login, no payments and no sensitive actions to click-jack.
  - `Cache-Control` cannot be set. GitHub Pages applies its own short default cache to every file. Accepted: the service worker serves everything from its precache and checks `sw.js` for updates bypassing the HTTP cache, and hashed asset names change with every build, so a stale file can only delay an update by minutes, never break the app.
- Optional custom domain: Settings > Pages > Custom domain. With a domain at the root, `VITE_BASE` becomes `/` and nothing else changes.
- GitHub Pages usage limits (site size and soft bandwidth limits) are far above what this app needs (initial bundle < 350 KB). GitHub's terms say Pages is not meant for commercial SaaS; a free training game is fine. Revisit the host if the product becomes paid.
- If header control is ever required, the same `dist/` can move to Cloudflare Pages with a `_headers` file without code changes; only the deploy job changes.
- Versioning: semver in `package.json`, exposed as `__APP_VERSION__` via Vite `define`. `VITE_APP_VERSION`, when set, overrides it; only the `pwa` job uses this, for the second build of the update test (Section 24.3).

---

## 26. Implementation order

Each step ends green (tests pass) before the next starts.

1. Scaffold Vite + Preact + TS strict, ESLint import rules, Vitest, Playwright, folder layout from Section 5.
2. Content types, JSON Schema, validator CLI with all codes, invalid fixtures. Copy `scen_angry_pm_deadline_001.json` from 22.2.
3. Engine: constants, rng, metrics, hand, interpolate, branching, outcome, fsm, replay, stats. Full unit tests (Section 24.1).
4. Storage drivers, repositories, telemetry buffer (sync stub disabled).
5. Game controller with visible clock, timers, input lock, persistence on every transition, resume.
6. UI: Game screen first (meters, NPC bubble, hand, preview, swipe, drop zone, Continue), then Debrief, Home, Briefing, Settings, Stats, Onboarding, HowTo, dialogs. The centred desktop column and mouse handling (D46) come with the Game screen; key hints come with the keyboard work in step 8.
7. Haptics and audio modules wired to the controller.
8. Accessibility pass (live regions, focus management, keyboard, contrast, axe).
9. PWA: manifest, icons, Workbox, update toast, offline test, the `pwa` job checks (Section 24.3).
10. Copy the scenarios from 22.3 to 22.5 and the catalog from 22.6 into `public/scenarios/`, run the validator (expect 0 errors, 2 warnings on `c_defense_01`).
11. E2E suite FR-01..FR-05 + extra specs, desktop projects (`@desktop`), bundle gate, start-time check, memory test.
12. Physical device test on the devices of Section 24.4, fix findings, release.

---

## 27. Definition of Done checklist

| # | Item | Proof |
|---|---|---|
| 1 | FR-01 to FR-05 green in Playwright E2E on the mobile projects; the `@desktop` set green on the four desktop projects | CI `e2e` job |
| 2 | PRD §15.2 audit, replaced by own checks (D22): PWA (manifest, installability, service worker scope, precache, offline, update), performance, accessibility, best practices | CI `pwa` job, SBE-PRF-001 to 003, SBE-A11-001, SBE-SEC-003; manual rows 1 to 5 of Section 24.4 |
| 3 | Validator passes all shipped scenarios with 0 errors | CI `validate` job |
| 4 | Physical device test passed on a low-end Android phone, another Android phone, the Android tablet and Windows laptops (Chrome, Edge, Firefox). Known gap: iOS Safari is not verified on a device, only by the WebKit E2E project (D47) | `docs/device-test-<date>.md`, which records the gap |
| 5 | Initial bundle < 350 KB gzip, start time < 1.2 s | `check-bundle-size`, `startup.spec.ts` |
| 6 | Fully playable offline after first load | `offline.spec.ts` |
| 7 | Heap < 45 MB after 10 runs | `memory.spec.ts` |
| 8 | WCAG 2.1 AA: axe zero violations, contrast ≥ 4.5:1 | `a11y.spec.ts` |
| 9 | No dialogue, UI string or delta value in TS code | code review + ESLint `react/jsx-no-literals`-style rule (`no-restricted-syntax` on `JSXText` with letters) + CI grep for accented characters outside `src/i18n` (`! grep -rnP "[áéíóöőúüűäöüßÄÖÜ]" src --include=*.ts --include=*.tsx --exclude-dir=i18n`) |
| 10 | Engine unit coverage ≥ 95% | CI `unit` job |
| 11 | All three locales complete: UI keys (TypeScript type check of `en.ts`, `de.ts` against `hu.ts`), scenario texts (validator E018/E019/E020 clean) | CI `validate` + `build` |
| 12 | Every `@SBE` scenario in Section 28 that is not `@manual` has an automated test with the id in its title, and it passes | `scripts/check-spec-coverage.ts` in CI `unit` job + test reports |
| 13 | Native-speaker review of EN and DE texts done (content and UI) | review note in `docs/translation-review-<date>.md` |

---

## 28. Specification by example (Gherkin)

This section is the executable specification. Every scenario below is meant to become one automated test (or one row of a parameterized test), except those tagged `@manual`. Where a scenario and the prose in Sections 1 to 27 disagree, treat it as a bug in this document; I generated every number below with a reference implementation of Sections 8 to 11 and cross-checked it against the scenario JSON in Section 22, so they should not disagree.

### 28.1 Conventions

**Ids and tags.** Each scenario has a unique id tag `@SBE-<AREA>-<nnn>` and at least one level tag, either on the scenario or inherited from its feature. A scenario with two level tags (e.g. `@unit` from the feature plus `@e2e` on the scenario) is automated at both levels:

| Tag | Where it runs | Notes |
|---|---|---|
| `@unit` | Vitest, pure functions or the reducer, fake clock | Fast; most of the spec lives here |
| `@component` | Vitest + `@testing-library/preact` in jsdom | UI pieces without a browser |
| `@e2e` | Playwright on the production build | Real browser, real timers unless stated |
| `@ci` | A CI job (validator, bundle and precache gate, manifest check) | |
| `@manual` | Physical device checklist (Section 24.4) | Not counted by the coverage check |

Additional tags: `@i18n` (runs in all three locale projects, Section 24.2), `@desktop` (also runs in the four desktop projects, Section 24.2, D46), `@pwa` (Playwright project `pwa`, run by the CI `pwa` job, Section 24.3), `@FR-01` … `@FR-05`, `@NFR-01` … `@NFR-04` (traceability to the PRD).

**Test naming.** The test title starts with the id, then the scenario title: `SBE-ENG-001 PACING card lowers escalation and raises confusion`. For a `Scenario Outline`, each example row is one test titled `<id> [row <n>]`.

**Feature files.** Copy each feature below into `tests/spec/<area>.feature` unchanged. They are documentation and the source for `check-spec-coverage.ts`; no Cucumber runtime is needed, tests are plain Vitest / Playwright.

**Shared step meanings.** These phrases mean the same everywhere:

| Phrase | Meaning |
|---|---|
| `the scenario "<id>" is started with seed <n>` | `START` with that scenario and seed. Unit level: reducer with the real scenario JSON from `public/scenarios/`. E2E: open `/?seed=<n>` and start the scenario from the Home screen. Locale is `hu` unless the scenario says otherwise. Visible clock at 0 ms. |
| `the hand is "<a>, <b>, <c>"` | After `REVEAL_DONE`, `state.hand` equals these card ids in this order; in the UI the cards appear left to right in this order. |
| `I commit "<cardId>"` | Unit: dispatch `CARD_COMMITTED`. E2E: tap the card, then press `game.apply`. |
| `I continue` | Unit: dispatch `RESOLUTION_DONE` then `CONTINUE`. E2E: wait for and press `common.next`. |
| `the metrics are E=<e> F=<f> K=<k>` | Stored values in `state.metrics`, exact to 2 decimals. |
| `a run with E=<e> F=<f> K=<k> and momentum <m>` | Unit-level synthetic `RunState` in phase `INTERVENTION_CHOICE`, other fields default. |
| `a <CATEGORY> card with delta (<dE>, <dF>, <dK>)` | Synthetic `Card` with that category and delta, placed in the hand. |
| `at <ms> ms` | The event's `nowMs` on the visible clock. |
| `the vibration log` / `the tone log` | Recorders injected by `tests/e2e/helpers/stubs.ts` (Section 24.2) or by unit-test mocks. |

**Background used by all `@e2e` features unless stated:** fresh browser context (empty storage), `onboardingDone = true`, locale `hu`, `navigator.vibrate` and `AudioContext` stubs installed, `?fastReveal=1` set.

### 28.2 Feature: Metric formula (Section 8)

```gherkin
@unit
Feature: Turn formula for escalation, grounding and confusion

  @SBE-ENG-001
  Scenario Outline: Applying one card
    Given a run with E=<E> F=<F> K=<K> and momentum <M>
    And a <category> card with delta (<dE>, <dF>, <dK>)
    When I commit that card
    Then the metrics are E=<E2> F=<F2> K=<K2>
    And the momentum is <M2>

    Examples:
      | E     | F     | K    | M | category   | dE  | dF  | dK  | E2    | F2    | K2   | M2 |
      | 65    | 100   | 0    | 0 | PACING     | -20 | 8   | 10  | 45    | 100   | 10   | 0  |
      | 65    | 100   | 0    | 0 | META_MODEL | -5  | -2  | 30  | 60    | 94.75 | 30   | 0  |
      | 65    | 100   | 0    | 0 | DEFENSE    | 30  | -20 | -10 | 96.25 | 76.75 | 0    | 1  |
      | 96.25 | 76.75 | 0    | 1 | DEFENSE    | 20  | -15 | 0   | 100   | 56.94 | 0    | 2  |
      | 50    | 60    | 40   | 0 | REFRAMING  | -15 | 12  | 18  | 35    | 69.5  | 58   | 0  |
      | 10    | 100   | 95   | 0 | META_MODEL | -5  | 0   | 30  | 5     | 99.5  | 100  | 0  |
      | 5     | 3     | 0    | 0 | PACING     | -20 | 8   | 10  | 0     | 10.75 | 10   | 0  |
      | 40    | 10    | 20   | 3 | ATTACK     | 40  | -30 | -25 | 85    | 0     | 0    | 4  |
      | 60    | 50    | 10   | 4 | ATTACK     | 30  | -25 | -20 | 95    | 22    | 0    | 4  |
      | 69.25 | 81.5  | 18   | 1 | ATTACK     | 36  | -26 | -21 | 100   | 52.04 | 0    | 2  |
      | 74.25 | 79.94 | 10   | 0 | REFRAMING  | -14 | 12  | 22  | 60.25 | 88.23 | 32   | 0  |
      | 33.33 | 77.77 | 12.5 | 2 | PACING     | -15 | 7   | 6   | 18.33 | 83.1  | 18.5 | 0  |
      | 45    | 100   | 0    | 0 | DEFENSE    | 18  | -16 | 0   | 64.25 | 81.75 | 0    | 1  |
      | 70    | 100   | 0    | 0 | DEFENSE    | 22  | -18 | 0   | 93.25 | 78.5  | 0    | 1  |
      | 81.25 | 80    | 0    | 1 | DEFENSE    | 19  | -18 | 0   | 100   | 57.94 | 0    | 2  |

  @SBE-ENG-002
  Scenario: Grounding drain uses escalation from before the turn
    Given a run with E=96.25 F=76.75 K=0 and momentum 0
    And a PACING card with delta (-22, 8, 10)
    When I commit that card
    Then the grounding is computed as 76.75 + 8 - 96.25 * 0.05 = 79.9375
    And the metrics are E=74.25 F=79.94 K=10

  @SBE-ENG-003
  Scenario: Rounding is applied after clamping and uses Math.round
    Given a run with E=33.33 F=77.77 K=12.5 and momentum 2
    And a PACING card with delta (-15, 7, 6)
    When I commit that card
    Then the raw grounding 83.1035 is stored as 83.1
    And the escalation is stored as 18.33

  @SBE-ENG-004
  Scenario: Values never leave the range 0..100
    Given a run with E=98 F=2 K=99 and momentum 0
    And a ATTACK card with delta (45, -35, -30)
    When I commit that card
    Then the metrics are E=100 F=0 K=69

  @SBE-ENG-005
  Scenario: The UI shows rounded integers while the state keeps decimals
    Given the metrics are E=96.25 F=76.75 K=0
    When the meters render
    Then the E meter shows "96", the F meter shows "77" and the K meter shows "0"
```

### 28.3 Feature: Escalation momentum (D1)

```gherkin
@unit
Feature: Momentum counts consecutive reactive cards

  @SBE-MOM-001
  Scenario Outline: Momentum after a sequence of categories
    Given a run with E=10 F=100 K=0 and momentum 0
    When I commit cards of the categories <sequence> with delta (0, 0, 0) each
    Then the momentum after each card is <momenta>

    Examples:
      | sequence                                         | momenta          |
      | DEFENSE, DEFENSE, ATTACK, DEFENSE, DEFENSE, PACING | 1, 2, 3, 4, 4, 0 |
      | ATTACK, META_MODEL, ATTACK                       | 1, 0, 1          |
      | REFRAMING, REFRAMING                             | 0, 0             |
      | PACING, DEFENSE, PACING, DEFENSE                 | 0, 1, 0, 1       |

  @SBE-MOM-002
  Scenario: The momentum bonus uses the updated momentum of the current turn
    Given a run with E=10 F=100 K=0 and momentum 0
    When I commit a DEFENSE card with delta (0, 0, 0)
    Then the escalation is 11.25
    When I commit a DEFENSE card with delta (0, 0, 0)
    Then the escalation is 13.75
    When I commit a PACING card with delta (0, 0, 0)
    Then the escalation is 13.75

  @SBE-MOM-003
  Scenario: Momentum is capped at 4, so the bonus is capped at 5 points
    Given a run with E=10 F=100 K=0 and momentum 4
    When I commit an ATTACK card with delta (0, 0, 0)
    Then the momentum is 4
    And the escalation is 15
```

### 28.4 Feature: Outcome evaluation (D4, D5, D12)

```gherkin
@unit
Feature: End conditions and their precedence

  @SBE-OUT-001
  Scenario Outline: Outcome after a resolved turn
    Given the metrics after the turn are E=<E> F=<F> K=<K>
    And the turn index after the turn is <turn>
    And the played card's nextNodeId is <next>
    And the scenario's initial escalation is <E0>
    When the outcome is checked
    Then the outcome is <outcome>

    Examples:
      | E     | F    | K     | turn | next     | E0 | outcome          |
      | 100   | 50   | 90    | 2    | "step_x" | 65 | LOSS_RUPTURE     |
      | 100   | 0    | 0     | 2    | "step_x" | 65 | LOSS_RUPTURE     |
      | 90    | 0    | 85    | 2    | "step_x" | 65 | LOSS_BURNOUT     |
      | 50    | 0    | 80    | 2    | "step_x" | 65 | LOSS_BURNOUT     |
      | 99.99 | 0.01 | 80    | 2    | "step_x" | 65 | WIN_BREAKTHROUGH |
      | 79    | 50   | 79.99 | 2    | "step_x" | 65 | none             |
      | 60    | 40   | 30    | 3    | null     | 65 | END_DEESCALATED  |
      | 65    | 40   | 30    | 3    | null     | 65 | END_UNRESOLVED   |
      | 69.5  | 66   | 3     | 4    | null     | 45 | END_UNRESOLVED   |
      | 40    | 40   | 30    | 7    | "step_x" | 65 | END_DEESCALATED  |
      | 70    | 40   | 30    | 7    | "step_x" | 65 | END_UNRESOLVED   |

  @SBE-OUT-002
  Scenario: A win on the 7th turn is still a win
    Given the metrics after the turn are E=30 F=60 K=82
    And the turn index after the turn is 7
    When the outcome is checked
    Then the outcome is WIN_BREAKTHROUGH

  @SBE-OUT-003
  Scenario: An ended run accepts no further game events
    Given a run that ended with LOSS_RUPTURE
    When CARD_COMMITTED, CONTINUE, REVEAL_DONE or TICK is dispatched
    Then the reducer returns the same state object
```

### 28.5 Feature: Crisis redirect (D11)

```gherkin
@unit
Feature: Redirect to the _escalated_crisis branch

  @SBE-CRI-001
  Scenario Outline: When the redirect happens
    Given the current node branch is <branch>
    And the crisis branch was <used> used in this run
    And the turn index after the turn is <turn>
    And the metrics after the turn are E=<E> F=60 K=10
    When the outcome is checked
    Then the next node is <next>

    Examples:
      | branch | used    | turn | E     | next                         |
      | main   | not yet | 1    | 80.01 | the crisis entry node        |
      | main   | not yet | 1    | 80    | the card's nextNodeId        |
      | main   | not yet | 1    | 99.99 | the crisis entry node        |
      | crisis | already | 2    | 95    | the card's nextNodeId        |
      | main   | already | 3    | 90    | the card's nextNodeId        |
      | main   | not yet | 7    | 90    | none, the run ends (MAX_TURNS) |

  @SBE-CRI-002
  Scenario: The redirect overrides a terminal card
    Given the current node is a main node
    And the played card's nextNodeId is null
    And the metrics after the turn are E=85 F=60 K=10
    And the turn index after the turn is 3
    When the outcome is checked
    Then the outcome is none
    And the next node is the crisis entry node

  @SBE-CRI-003
  Scenario: The redirect is recorded in the turn history
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    And the hand is "c_metamodel_01, c_defense_01, c_reframe_01"
    When I commit "c_defense_01"
    And the resolution finishes
    Then the last turn record has crisisRedirect = true
    And state.crisisUsed is true
    And pendingNextNodeId is "pm_escalated_crisis"
```

### 28.6 Feature: Random number generator (Section 10.1)

```gherkin
@unit
Feature: mulberry32 produces fixed values

  @SBE-RNG-001
  Scenario Outline: First five values for a seed
    Given the rng state is <seed>
    When next() is called five times
    Then the values rounded to 10 decimals are <values>

    Examples:
      | seed | values                                                              |
      | 1    | 0.6270739406, 0.0027357212, 0.5274470400, 0.9810509675, 0.9683778982 |
      | 42   | 0.6011037519, 0.4482905590, 0.8524657935, 0.6697340414, 0.1748138987 |

  @SBE-RNG-002
  Scenario: The state is a counter that advances by 0x6D2B79F5 per call
    Given the rng state is 1
    When next() is called five times
    Then the rng state is 567894474

  @SBE-RNG-003
  Scenario: The engine never uses Math.random
    Given the engine source folder src/engine
    Then it contains no reference to Math.random, Date.now or performance.now
```

### 28.7 Feature: Drawing the hand (Section 10.2, D7)

```gherkin
@unit
Feature: Hand drawing is guaranteed and deterministic

  @SBE-HND-001
  Scenario Outline: Opening hand per scenario and seed
    Given the scenario "<scenario>" is started with seed <seed>
    When the statement reveal is done
    Then the hand is "<hand>"
    And the rng state is <state>

    Examples:
      | scenario                     | seed | hand                                            | state     |
      | scen_angry_pm_deadline_001   | 1    | c_metamodel_01, c_defense_01, c_reframe_01      | 567894474 |
      | scen_angry_pm_deadline_001   | 2    | c_metamodel_01, c_pace_01, c_defense_01         | 567894475 |
      | scen_angry_pm_deadline_001   | 7    | c_pace_01, c_defense_01, c_attack_01            | 567894480 |
      | scen_angry_pm_deadline_001   | 42   | c_defense_01, c_metamodel_01, c_attack_01       | 567894515 |
      | scen_stakeholder_scope_002   | 1    | c_s2_meta_01, c_s2_def_01, c_s2_reframe_01      | 567894474 |
      | scen_stakeholder_scope_002   | 7    | c_s2_pace_01, c_s2_def_01, c_s2_att_01          | 567894480 |
      | scen_stakeholder_scope_002   | 42   | c_s2_def_01, c_s2_meta_01, c_s2_att_01          | 567894515 |
      | scen_customer_refund_003     | 1    | c_r_meta_01, c_r_def_01, c_r_reframe_01         | 567894474 |
      | scen_customer_refund_003     | 4    | c_r_def_01, c_r_pace_01, c_r_meta_01            | 567894477 |
      | scen_customer_refund_003     | 7    | c_r_pace_01, c_r_def_01, c_r_att_01             | 567894480 |
      | scen_customer_refund_003     | 42   | c_r_def_01, c_r_meta_01, c_r_att_01             | 567894515 |
      | scen_customer_gaslight_004   | 1    | c_g_meta_01, c_g_def_01, c_g_reframe_01         | 567894474 |
      | scen_customer_gaslight_004   | 2    | c_g_meta_01, c_g_pace_01, c_g_def_01            | 567894475 |
      | scen_customer_gaslight_004   | 42   | c_g_def_01, c_g_meta_01, c_g_att_01             | 567894515 |

  @SBE-HND-002
  Scenario: Guarantee holds for every seed
    Given the node "step_01" of "scen_angry_pm_deadline_001" with 5 cards
    When a hand is drawn for each seed from 1 to 10000
    Then every hand has exactly 3 distinct cards
    And every hand contains at least one PACING or META_MODEL card
    And every hand contains at least one DEFENSE or ATTACK card
    And every card of the pool appears in at least one hand

  @SBE-HND-003
  Scenario: A pool of exactly three cards is only shuffled
    Given a node whose pool is "c_a (PACING), c_b (DEFENSE), c_c (REFRAMING)"
    And the rng state is 1
    When a hand is drawn
    Then the hand contains exactly c_a, c_b and c_c in some order
    And exactly 2 rng values were consumed

  @SBE-HND-004
  Scenario: A pool of four or more consumes exactly five values
    Given the node "step_01" of "scen_angry_pm_deadline_001" and rng state 1
    When a hand is drawn
    Then the rng state is 567894474

  @SBE-HND-005
  Scenario: The hand is drawn on REVEAL_DONE, not on START
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    Then the rng state is 1 and the hand is empty
    When the statement reveal is done
    Then the hand is "c_metamodel_01, c_defense_01, c_reframe_01"

  @SBE-HND-006
  Scenario: Committing a card that is not in the hand is ignored
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 42
    And the hand is "c_defense_01, c_metamodel_01, c_attack_01"
    When I commit "c_pace_01"
    Then the reducer returns the same state object
```

### 28.8 Feature: Golden playthroughs (all engine rules together)

These runs are the strongest checks in the spec: if any rule in Sections 8 to 10 is implemented differently, at least one of them fails. Run them at `@unit` level against the real scenario files; `@SBE-GLD-001` and `@SBE-GLD-006` also run end to end.

```gherkin
@unit
Feature: Complete runs with fixed seeds

  @SBE-GLD-001 @e2e @i18n
  Scenario: Three meta-model questions win the angry PM scenario
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 2
    Then the hand is "c_metamodel_01, c_pace_01, c_defense_01"
    When I commit "c_metamodel_01"
    Then the metrics are E=60 F=94.75 K=30
    And the next node is "step_02_focused"
    When I continue
    Then the hand is "c_defense_03, c_metamodel_03, c_reframe_03"
    When I commit "c_metamodel_03"
    Then the metrics are E=55 F=88.75 K=62
    And the next node is "step_03_plan"
    When I continue
    Then the hand is "c_metamodel_05, c_defense_05, c_pace_05"
    When I commit "c_metamodel_05"
    Then the metrics are E=52 F=84 K=92
    And the outcome is WIN_BREAKTHROUGH after 3 turns

  @SBE-GLD-002
  Scenario: A counterattack on turn one ruptures the conversation
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 42
    Then the hand is "c_defense_01, c_metamodel_01, c_attack_01"
    When I commit "c_attack_01"
    Then the metrics are E=100 F=68.75 K=0
    And the momentum is 1
    And the outcome is LOSS_RUPTURE after 1 turn

  @SBE-GLD-003
  Scenario: Defense triggers the crisis branch, pacing and reframing recover it
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    Then the hand is "c_metamodel_01, c_defense_01, c_reframe_01"
    When I commit "c_defense_01"
    Then the metrics are E=96.25 F=76.75 K=0
    And the next node is "pm_escalated_crisis"
    When I continue
    Then the hand is "c_pace_08, c_defense_07, c_attack_06"
    When I commit "c_pace_08"
    Then the metrics are E=74.25 F=79.94 K=10
    And the next node is "pm_crisis_02"
    When I continue
    Then the hand is "c_reframe_07, c_pace_09, c_defense_08"
    When I commit "c_reframe_07"
    Then the metrics are E=60.25 F=88.23 K=32
    And the outcome is END_DEESCALATED after 3 turns

  @SBE-GLD-004
  Scenario: Pure pacing de-escalates the stakeholder but does not win
    Given the scenario "scen_stakeholder_scope_002" is started with seed 7
    Then the hand is "c_s2_pace_01, c_s2_def_01, c_s2_att_01"
    When I commit "c_s2_pace_01"
    Then the metrics are E=27 F=100 K=8
    When I continue
    Then the hand is "c_s2_pace_02, c_s2_meta_02, c_s2_def_02"
    When I commit "c_s2_pace_02"
    Then the metrics are E=11 F=100 K=15
    When I continue
    Then the hand is "c_s2_reframe_04, c_s2_pace_04, c_s2_def_04"
    When I commit "c_s2_pace_04"
    Then the metrics are E=0 F=100 K=21
    When I continue
    Then the hand is "c_s2_reframe_05, c_s2_att_04, c_s2_pace_05"
    When I commit "c_s2_pace_05"
    Then the metrics are E=0 F=100 K=28
    And the outcome is END_DEESCALATED after 4 turns

  @SBE-GLD-005
  Scenario: A final jab leaves the stakeholder situation unresolved
    Given the scenario "scen_stakeholder_scope_002" is started with seed 42
    Then the hand is "c_s2_def_01, c_s2_meta_01, c_s2_att_01"
    When I commit "c_s2_def_01"
    Then the metrics are E=64.25 F=81.75 K=0
    And the next node is "s2_02_push"
    When I continue
    Then the hand is "c_s2_def_03, c_s2_meta_03, c_s2_reframe_03"
    When I commit "c_s2_reframe_03"
    Then the metrics are E=52.25 F=88.54 K=17
    When I continue
    Then the hand is "c_s2_def_04, c_s2_reframe_04, c_s2_pace_04"
    When I commit "c_s2_pace_04"
    Then the metrics are E=37.25 F=92.93 K=23
    When I continue
    Then the hand is "c_s2_att_04, c_s2_reframe_05, c_s2_meta_05"
    When I commit "c_s2_att_04"
    Then the metrics are E=69.5 F=66.07 K=3
    And the outcome is END_UNRESOLVED after 4 turns

  @SBE-GLD-006 @e2e
  Scenario: Two defensive answers in a row break the refund call
    Given the scenario "scen_customer_refund_003" is started with seed 42
    Then the hand is "c_r_def_01, c_r_meta_01, c_r_att_01"
    When I commit "c_r_def_01"
    Then the metrics are E=81.25 F=80 K=0
    And the next node is "refund_escalated_crisis"
    When I continue
    Then the hand is "c_r_def_06, c_r_meta_07, c_r_att_05"
    When I commit "c_r_def_06"
    Then the metrics are E=100 F=57.94 K=0
    And the momentum is 2
    And the outcome is LOSS_RUPTURE after 2 turns

  @SBE-GLD-007
  Scenario: Running out of time plays the first reactive card
    Given the scenario "scen_customer_gaslight_004" is started with seed 42
    Then the hand is "c_g_def_01, c_g_meta_01, c_g_att_01"
    When the 15 second decision time runs out without a choice
    Then "c_g_def_01" is committed with timedOut = true
    And the metrics are E=93.25 F=78.5 K=0
    And the next node is "gaslight_escalated_crisis"

  @SBE-GLD-008
  Scenario: Meta-model questions win the gaslighting call
    Given the scenario "scen_customer_gaslight_004" is started with seed 2
    Then the hand is "c_g_meta_01, c_g_pace_01, c_g_def_01"
    When I commit "c_g_meta_01"
    Then the metrics are E=68 F=93.5 K=30
    When I continue
    Then the hand is "c_g_def_02, c_g_meta_02, c_g_reframe_02"
    When I commit "c_g_meta_02"
    Then the metrics are E=65 F=88.1 K=61
    When I continue
    Then the hand is "c_g_meta_04, c_g_def_04, c_g_reframe_03"
    When I commit "c_g_meta_04"
    Then the metrics are E=61 F=82.85 K=91
    And the outcome is WIN_BREAKTHROUGH after 3 turns

  @SBE-GLD-009
  Scenario: A mixed constructive path wins the refund call on turn four
    Given the scenario "scen_customer_refund_003" is started with seed 4
    Then the hand is "c_r_def_01, c_r_pace_01, c_r_meta_01"
    When I commit "c_r_pace_01"
    Then the metrics are E=40 F=100 K=8
    When I continue
    Then the hand is "c_r_meta_02, c_r_att_02, c_r_def_02"
    When I commit "c_r_meta_02"
    Then the metrics are E=37 F=96 K=38
    When I continue
    Then the hand is "c_r_meta_04, c_r_def_04, c_r_reframe_03"
    When I commit "c_r_reframe_03"
    Then the metrics are E=21 F=100 K=59
    When I continue
    Then the hand is "c_r_meta_06, c_r_def_05, c_r_pace_06"
    When I commit "c_r_meta_06"
    Then the metrics are E=16 F=98.95 K=87
    And the outcome is WIN_BREAKTHROUGH after 4 turns

  @SBE-GLD-010
  Scenario: Defense then sarcasm ruptures the PM conversation
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    When I commit "c_reframe_01"
    Then the metrics are E=50 F=100 K=18
    When I continue
    Then the hand is "c_pace_02, c_defense_02, c_attack_02"
    When I commit "c_defense_02"
    Then the metrics are E=69.25 F=81.5 K=18
    And the next node is "step_03_cold"
    When I continue
    Then the hand is "c_metamodel_06, c_pace_06, c_attack_05"
    When I commit "c_attack_05"
    Then the metrics are E=100 F=52.04 K=0
    And the momentum is 2
    And the outcome is LOSS_RUPTURE after 3 turns
```

### 28.9 Feature: State machine (Section 9)

```gherkin
@unit
Feature: Phase transitions and ignored events

  @SBE-FSM-001
  Scenario: A turn walks through all PRD phases in order
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 2
    Then the phase is ATTACK_INCOMING
    When the statement reveal is done
    Then the phase is INTERVENTION_CHOICE
    When I commit "c_metamodel_01"
    Then the phase is RESOLUTION_PHASE
    When the resolution finishes
    Then the phase is OUTCOME_CHECK
    When CONTINUE is dispatched
    Then the phase is ATTACK_INCOMING
    And the current node is "step_02_focused"

  @SBE-FSM-002
  Scenario: An ending goes through OUTCOME_CHECK before ENDED
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 42
    When the statement reveal is done
    And I commit "c_attack_01"
    And the resolution finishes
    Then the phase is OUTCOME_CHECK and the outcome is LOSS_RUPTURE
    And the run is persisted in phase OUTCOME_CHECK
    When the controller dispatches FINALIZE
    Then the phase is ENDED

  @SBE-FSM-003
  Scenario Outline: Events that are not valid in a phase are ignored
    Given a run in phase <phase>
    When <event> is dispatched
    Then the reducer returns the same state object

    Examples:
      | phase               | event           |
      | ATTACK_INCOMING     | CARD_COMMITTED  |
      | ATTACK_INCOMING     | CONTINUE        |
      | ATTACK_INCOMING     | RESOLUTION_DONE |
      | INTERVENTION_CHOICE | REVEAL_DONE     |
      | INTERVENTION_CHOICE | CONTINUE        |
      | RESOLUTION_PHASE    | CARD_COMMITTED  |
      | RESOLUTION_PHASE    | REVEAL_DONE     |
      | RESOLUTION_PHASE    | CONTINUE        |
      | OUTCOME_CHECK       | CARD_COMMITTED  |
      | OUTCOME_CHECK       | REVEAL_DONE     |
      | ENDED               | CONTINUE        |
      | ENDED               | ABANDON         |

  @SBE-FSM-004
  Scenario: CONTINUE is ignored when the run already has an outcome
    Given a run in phase OUTCOME_CHECK with outcome LOSS_RUPTURE
    When CONTINUE is dispatched
    Then the reducer returns the same state object

  @SBE-FSM-005
  Scenario: FINALIZE is ignored when there is no outcome
    Given a run in phase OUTCOME_CHECK with outcome none
    When FINALIZE is dispatched
    Then the reducer returns the same state object

  @SBE-FSM-006
  Scenario: Abandon ends the run without an outcome
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    When ABANDON is dispatched
    Then the phase is ENDED
    And the outcome is null
    And currentRun is deleted
    And no RunSummary and no progress record is written
    And no haptic pattern and no end sound is played
    And the telemetry event scenario_abandon is buffered
    And the Home screen is shown, not the Debrief

  @SBE-FSM-007
  Scenario: The reducer is pure
    Given any run state and any event
    When the reducer is called twice with the same inputs
    Then both results are deep-equal
    And the input state is not mutated

  @SBE-FSM-008
  Scenario: Replay reproduces the live state
    Given the event log recorded during @SBE-GLD-003
    When the log is replayed from the scenario and seed 1
    Then the replayed state is deep-equal to the live final state
```

### 28.10 Feature: Input lock (PRD §14)

```gherkin
Feature: Fast or double taps do not play two cards

  @SBE-LCK-001 @unit
  Scenario: A second commit during resolution is ignored
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 42
    And the hand is "c_defense_01, c_metamodel_01, c_attack_01"
    When I commit "c_metamodel_01" at 2000 ms
    And I commit "c_defense_01" at 2100 ms
    Then exactly one turn is recorded
    And the recorded card is "c_metamodel_01"

  @SBE-LCK-002 @component
  Scenario: The hand is locked for at least 400 ms after a commit
    Given the game screen in INTERVENTION_CHOICE
    When I commit a card
    Then isTransitioning is true
    And the hand container has aria-busy="true" and pointer-events none
    And it stays locked for at least 400 ms
    And it unlocks only when the phase is no longer RESOLUTION_PHASE

  @SBE-LCK-003 @e2e
  Scenario: Double tap in the browser plays one card
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 42
    When I tap "c_metamodel_01", press "Alkalmazom", and tap "c_defense_01" within 150 ms
    Then the turn history has 1 entry
    And no card preview is open

  @SBE-LCK-004 @component
  Scenario: The continue button ignores taps right after it appears
    Given the phase just changed to OUTCOME_CHECK
    When the continue button is tapped 100 ms after it appeared
    Then nothing happens
    When it is tapped 300 ms after it appeared
    Then CONTINUE is dispatched
```

### 28.11 Feature: Stress timer (D15)

```gherkin
@unit
Feature: Decision time limit

  Background:
    Given the scenario "scen_customer_gaslight_004" is started with seed 42
    And the statement reveal is done at 1000 ms

  @SBE-TMR-001
  Scenario: The timer starts with the scenario limit
    Then timerRemainingMs is 15000

  @SBE-TMR-002
  Scenario: Five-second warning
    When a TICK arrives at 11000 ms
    Then timerRemainingMs is 5000
    And the controller plays the TIMER_WARN sound, the TAP vibration and announces "timer.fiveSeconds" assertively
    When a TICK arrives at 11250 ms
    Then the warning is not repeated

  @SBE-TMR-003
  Scenario: Expiry auto-commits the first reactive card in display order
    When a TICK arrives at 16000 ms
    Then timerRemainingMs is 0
    And the controller dispatches CARD_COMMITTED "c_g_def_01" with timedOut = true
    And the reducer alone, given only that TICK, does not commit any card
    And the announcement "timer.expired" is made
    And the turn record's decisionMs is 15000

  @SBE-TMR-004
  Scenario: Hidden time does not count
    When the page becomes hidden at 6000 ms
    And 60 seconds of wall time pass
    And the page becomes visible again
    Then the visible clock reads 6000 ms
    And timerRemainingMs is 10000

  @SBE-TMR-005
  Scenario: Scenarios without a limit have no timer
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    When the statement reveal is done
    Then timerRemainingMs is null
    And no timer ring is rendered

  @SBE-TMR-007
  Scenario: A timed-out commit survives a reload
    When a TICK arrives at 16000 ms
    And the run is saved and replayed from its event log
    Then the replayed state is deep-equal to the live state
    And the last turn record is "c_g_def_01" with timedOut = true
    And the next node is "gaslight_escalated_crisis"

  @SBE-TMR-008
  Scenario: Reload during the choice keeps the remaining time
    When a TICK arrives at 9000 ms
    And the page is hidden, the run saved, and the app reloaded and resumed
    Then the phase is ATTACK_INCOMING of "g_01"
    When the statement reveal is done
    Then the hand is "c_g_def_01, c_g_meta_01, c_g_att_01"
    And timerRemainingMs is 7000
    And resumeTimerMs is null

  @SBE-TMR-009
  Scenario: A restored timer of 0 times out right after the reveal
    Given a saved run in INTERVENTION_CHOICE with timerRemainingMs 0
    When it is resumed and the statement reveal is done
    Then the controller dispatches CARD_COMMITTED for the first reactive card with timedOut = true

  @SBE-TMR-006 @component
  Scenario: Expiry while the preview is open
    Given the card preview for "c_g_meta_01" is open
    When the timer expires
    Then the preview closes
    And "c_g_def_01" is committed with timedOut = true
```

### 28.12 Feature: Visibility and pausing (PRD §14)

```gherkin
Feature: The app freezes time when it is not visible

  @SBE-VIS-001 @unit
  Scenario: Visible clock only counts visible time
    Given the visible clock started at wall time 0
    When the page is visible from 0 to 5000, hidden from 5000 to 65000 and visible from 65000 to 66000 (wall ms)
    Then the visible clock reads 6000 ms

  @SBE-VIS-002 @unit
  Scenario: Hiding saves the run
    Given a run in phase INTERVENTION_CHOICE
    When visibilitychange reports hidden
    Then currentRun is written to storage
    And all controller timers are cleared

  @SBE-VIS-005 @unit
  Scenario: A final TICK is sent before every freeze
    Given the scenario "scen_customer_gaslight_004" is started with seed 42
    And the statement reveal is done at 1000 ms
    And the last periodic TICK was at 5750 ms
    When the page becomes hidden at 6000 ms
    Then a TICK with nowMs 6000 is dispatched before the clock freezes
    And timerRemainingMs is 10000

  @SBE-VIS-006 @unit
  Scenario: Continue later freezes the run like hiding the page
    Given the scenario "scen_customer_gaslight_004" is started with seed 42
    And the statement reveal is done at 1000 ms
    When I choose "game.later" at 4000 ms
    And 2 minutes pass on the Home screen
    And I resume the run
    Then the visible clock continues from 4000 ms
    And timerRemainingMs after the next reveal is 12000

  @SBE-VIS-003 @unit
  Scenario: pagehide and pageshow behave like hidden and visible
    When pagehide fires
    Then the visible clock is frozen
    When pageshow fires
    Then the visible clock resumes

  @SBE-VIS-004 @e2e
  Scenario: Text reveal resumes after returning
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1 without fastReveal
    When the page becomes hidden during the statement reveal and visible again
    Then the reveal continues and REVEAL_DONE is dispatched once
```

### 28.13 Feature: Panic zone and RTO (D16, Section 11)

```gherkin
@unit
Feature: Panic time and recovery time

  @SBE-PNC-001
  Scenario Outline: Panic zone boundaries
    Given the metrics are E=<E> F=<F> K=0
    Then isPanic is <panic>

    Examples:
      | E     | F     | panic |
      | 70    | 100   | true  |
      | 69.99 | 100   | false |
      | 69.25 | 81.5  | false |
      | 10    | 30    | true  |
      | 10    | 30.01 | false |
      | 100   | 0     | true  |

  @SBE-PNC-002
  Scenario: Starting inside the panic zone and recovering
    Given the scenario "scen_customer_gaslight_004" is started with seed 2 at 0 ms
    Then inPanic is true and panicEpisodeStartMs is 0
    When the statement reveal is done at 1500 ms
    And I commit "c_g_meta_01" at 4000 ms
    Then inPanic is false
    And completedEpisodesMs is [4000]
    When the resolution finishes at 4580 ms
    And CONTINUE at 6000 ms, reveal done at 7000 ms, I commit "c_g_meta_02" at 9000 ms
    And the resolution finishes at 9580 ms
    And CONTINUE at 11000 ms, reveal done at 12000 ms, I commit "c_g_meta_04" at 14000 ms
    And the resolution finishes at 14580 ms and FINALIZE follows at 14580 ms
    Then the outcome is WIN_BREAKTHROUGH
    And panicSec is 4.0
    And rtoSec is 4.0
    And unrecoveredPanic is false
    And visibleMsTotal is 14580

  @SBE-PNC-003
  Scenario: An episode that never ends is unrecovered
    Given the scenario "scen_customer_refund_003" is started with seed 42 at 0 ms
    Then inPanic is false
    When the statement reveal is done at 1000 ms
    And I commit "c_r_def_01" at 3000 ms
    Then inPanic is true and panicEpisodeStartMs is 3000
    When the resolution finishes at 3580 ms
    And CONTINUE at 5000 ms, reveal done at 6000 ms, I commit "c_r_def_06" at 7000 ms
    And the resolution finishes at 7580 ms and FINALIZE follows at 7580 ms
    Then the outcome is LOSS_RUPTURE
    And panicSec is 4.6
    And rtoSec is null
    And unrecoveredPanic is true

  @SBE-PNC-004
  Scenario: TICKs do not change the totals, only the moment they are counted
    Given the same events as @SBE-PNC-003
    And additional TICKs every 250 ms
    Then panicSec is 4.6

  @SBE-PNC-005
  Scenario Outline: RTO rounding
    Given the completed episodes are <episodes> ms
    Then rtoSec is <rto>

    Examples:
      | episodes          | rto  |
      | 3000, 5000        | 4.0  |
      | 2000, 2500        | 2.3  |
      | 1250              | 1.3  |
      | 333, 333, 334     | 0.3  |
      | (none)            | null |

  @SBE-PNC-006
  Scenario Outline: Panic seconds rounding
    Given panicMsTotal is <ms>
    Then panicSec is <sec>

    Examples:
      | ms    | sec  |
      | 0     | 0.0  |
      | 49    | 0.0  |
      | 50    | 0.1  |
      | 150   | 0.2  |
      | 4580  | 4.6  |
      | 14580 | 14.6 |

  @SBE-PNC-007
  Scenario: Best and last RTO are kept per scenario
    Given the progress of "scen_customer_gaslight_004" has bestRtoSec 3.2
    When a run of that scenario ends with rtoSec 4.0
    Then bestRtoSec stays 3.2 and lastRtoSec is 4.0
    When a run ends with rtoSec 2.1
    Then bestRtoSec is 2.1
    When a run ends with rtoSec null
    Then bestRtoSec stays 2.1 and lastRtoSec is null
```

### 28.14 Feature: Run summary and debrief statistics (D17, FR-05)

```gherkin
@unit
Feature: Card style statistics

  @SBE-DBF-001
  Scenario Outline: Ratio and dominant style
    Given a finished run with the played categories <categories>
    Then the constructive percentage is <pct>
    And the dominant style is <dominant>

    Examples:
      | categories                                  | pct | dominant   |
      | META_MODEL, META_MODEL, META_MODEL          | 100 | META_MODEL |
      | ATTACK                                      | 0   | ATTACK     |
      | DEFENSE, REFRAMING, PACING, ATTACK          | 50  | PACING     |
      | DEFENSE, DEFENSE                            | 0   | DEFENSE    |
      | DEFENSE, ATTACK, ATTACK, DEFENSE            | 0   | DEFENSE    |
      | REFRAMING, PACING, META_MODEL               | 100 | PACING     |
      | PACING, DEFENSE, DEFENSE                    | 33  | DEFENSE    |
      | REFRAMING, REFRAMING, ATTACK                | 67  | REFRAMING  |

  @SBE-DBF-002
  Scenario: Run summary of the unresolved stakeholder run
    Given the run from @SBE-GLD-005 has ended
    Then the run summary has outcome END_UNRESOLVED, turns 4
    And categoryCounts are PACING 1, META_MODEL 0, REFRAMING 1, DEFENSE 1, ATTACK 1
    And constructiveCount is 2 and reactiveCount is 2
    And finalMetrics are E=69.5 F=66.07 K=3
    And timedOutCount is 0

  @SBE-DBF-003
  Scenario: Timed-out turns are counted
    Given the run from @SBE-GLD-007 continues and ends
    Then timedOutCount is at least 1
    And the turn record for turn 1 has timedOut = true

  @SBE-DBF-004
  Scenario: Progress best outcome ordering
    Given the progress of a scenario has bestOutcome END_UNRESOLVED
    When a run ends with LOSS_BURNOUT
    Then bestOutcome stays END_UNRESOLVED
    When a run ends with END_DEESCALATED
    Then bestOutcome is END_DEESCALATED
    When a run ends with WIN_BREAKTHROUGH
    Then bestOutcome is WIN_BREAKTHROUGH and winCount increases by 1
```

### 28.15 Feature: Persistence and resume (Section 12, PRD §14)

```gherkin
Feature: Runs survive reloads

  @SBE-PER-001 @unit
  Scenario: The run is saved on every transition
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    When the statement reveal is done and I commit "c_reframe_01"
    Then currentRun was written 3 times (after START, REVEAL_DONE, CARD_COMMITTED)
    And the stored event types are START, REVEAL_DONE, CARD_COMMITTED
    And the stored START event contains the scenario id and seed 1, not the scenario object

  @SBE-PER-002 @unit
  Scenario: Writes are serialized
    Given a storage driver whose first put resolves after 50 ms and second put after 5 ms
    When two saves are requested one after another
    Then the stored value equals the second save

  @SBE-PER-003 @e2e
  Scenario: Reload between turns resumes at the next statement with the same hand
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    And I commit "c_reframe_01" and continue
    When I reload the page
    Then the resume dialog "Folytatod a megkezdett helyzetet?" is shown
    When I choose "Folytatás"
    Then the current node is "step_02_calmed"
    And the meters show E 50, F 100, K 18
    And after the reveal the hand is "c_pace_02, c_defense_02, c_attack_02"

  @SBE-PER-004 @e2e
  Scenario: Reload while choosing restarts the same statement with the same hand
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    And the hand is "c_metamodel_01, c_defense_01, c_reframe_01"
    When I reload the page and continue the saved run
    Then the phase is ATTACK_INCOMING of "step_01"
    And after the reveal the hand is "c_metamodel_01, c_defense_01, c_reframe_01"

  @SBE-PER-005 @unit
  Scenario: Reload right after a commit keeps the choice
    Given a saved run whose last event is CARD_COMMITTED "c_defense_01" (seed 1, scen_angry_pm_deadline_001)
    When the run is resumed
    Then RESOLUTION_DONE is dispatched
    And the phase is OUTCOME_CHECK with pendingNextNodeId "pm_escalated_crisis"
    And the metrics are E=96.25 F=76.75 K=0

  @SBE-PER-006 @unit
  Scenario: Timing survives a resume
    Given a saved run with timing.visibleMsTotal 8200 and panicMsTotal 3100
    When the run is resumed
    Then the visible clock continues from 8200 ms
    And panicMsTotal is 3100

  @SBE-PER-007 @unit
  Scenario: A saved run for an older content version is discarded
    Given a saved run with contentVersion 1 for "scen_customer_refund_003"
    And the shipped scenario has contentVersion 2
    When the app starts
    Then no resume dialog is shown
    And currentRun is deleted
    And the telemetry event resume_discarded with reason "contentVersion" is buffered

  @SBE-PER-008 @e2e
  Scenario: Start over discards the saved run
    Given a saved run exists
    When I reload and choose "Új kezdés"
    Then currentRun is deleted
    And the Home screen is shown

  @SBE-PER-009 @unit
  Scenario: Ending a run writes summary and progress and clears the current run atomically
    Given the run from @SBE-GLD-002 reaches ENDED
    Then finishRun is called once
    And with the IndexedDB driver one readwrite transaction writes runs, progress and deletes currentRun
    And progress.completedCount is 1 and winCount is 0

  @SBE-PER-012 @unit
  Scenario Outline: finishRun is idempotent and ordered on every driver
    Given the <driver> driver and the summary of the run from @SBE-GLD-002
    When finishRun is called twice with the same summary
    Then progress.completedCount is 1
    And runs holds exactly one summary with that runId
    And currentRun is deleted after runs and progress were written

    Examples:
      | driver       |
      | indexeddb    |
      | localstorage |
      | memory       |

  @SBE-PER-010 @unit
  Scenario: Only the last 50 runs are kept
    Given 50 run summaries are stored
    When a 51st run ends
    Then 50 summaries are stored
    And the oldest by endedAt is gone

  @SBE-PER-011 @e2e
  Scenario: Later continue from the leave dialog
    Given a run in INTERVENTION_CHOICE
    When I press the close button and choose "Később folytatom"
    Then the Home screen is shown
    And currentRun still exists
```

### 28.16 Feature: Storage drivers (Section 12.1)

```gherkin
@unit
Feature: Storage with fallback

  @SBE-STO-001
  Scenario: IndexedDB is used when available
    Given IndexedDB opens successfully
    When storage is opened
    Then the driver kind is "indexeddb"
    And the database "verbalis-aikido" version 1 has the stores meta, settings, progress, runs, currentRun, analyticsQueue

  @SBE-STO-002
  Scenario: IndexedDB failure falls back to LocalStorage
    Given indexedDB.open throws
    When storage is opened
    Then the driver kind is "localstorage"
    And keys are written with the prefix "va:"

  @SBE-STO-003
  Scenario: IndexedDB open that hangs falls back after 1500 ms
    Given indexedDB.open never calls back
    When storage is opened
    Then after 1500 ms the driver kind is "localstorage"

  @SBE-STO-004
  Scenario: No storage at all uses memory and warns
    Given IndexedDB fails and localStorage.setItem throws
    When storage is opened
    Then the driver kind is "memory"
    And the Settings screen shows "settings.storageVolatile"

  @SBE-STO-005
  Scenario: Quota exceeded drops analytics first
    Given the LocalStorage driver and a full quota
    When a run summary is saved
    Then va:analyticsQueue is cleared and the save is retried once
    And if it still fails the oldest runs are dropped and it is retried once more

  @SBE-STO-006
  Scenario Outline: Same behaviour for every driver
    Given the <driver> driver
    When I put, get, getAll and delete records in every store
    Then the results are identical to the reference behaviour

    Examples:
      | driver       |
      | indexeddb    |
      | localstorage |
      | memory       |

  @SBE-STO-007
  Scenario: Analytics queue cap
    Given the IndexedDB driver with 2000 queued events
    When one more event is appended
    Then 2000 events are queued and the oldest is gone
```

### 28.17 Feature: Scenario validator (Section 7.3)

Base fixture for all rows: a copy of the shipped `scen_stakeholder_scope_002.json` (valid, no warnings), modified as described. Fixtures live in `tests/fixtures/scenarios/invalid/` named after the id, e.g. `SBE-VAL-001-row3.json`, and are validated with `--no-catalog` (D39). The E016 row uses its own folder `tests/fixtures/scenarios/catalog-mismatch/` that contains the scenario and a `catalog.json`.

```gherkin
@unit @ci
Feature: Validator errors and warnings

  @SBE-VAL-001
  Scenario Outline: Each error code is detected
    Given a copy of "scen_stakeholder_scope_002"
    And the change "<change>"
    When the validator runs
    Then it reports <code>
    And the exit code is 1

    Examples:
      | change                                                                                              | code |
      | remove the field "difficulty"                                                                       | E001 |
      | save it as "scen_other_002.json" without changing id                                                | E002 |
      | rename node "s2_02_push" to "s2_02_open"                                                            | E003 |
      | rename card "c_s2_def_02" to "c_s2_def_01"                                                          | E004 |
      | set startNodeId to "s2_99"                                                                          | E005 |
      | set startNodeId to "scope_crisis_02"                                                                | E005 |
      | set c_s2_pace_02.nextNodeId to "s2_99"                                                              | E006 |
      | set c_s2_pace_01.nextNodeId to "scope_crisis_02"                                                    | E007 |
      | set c_s2_pace_06.nextNodeId to "s2_04_close"                                                        | E007 |
      | rename node "scope_escalated_crisis" to "scope_crisis_01"                                           | E008 |
      | set c_s2_pace_05.nextNodeId to "s2_01"                                                              | E009 |
      | set c_s2_def_01.nextNodeId and c_s2_att_01.nextNodeId to "s2_02_open"                               | E010 |
      | set c_s2_pace_01.nextNodeId to null                                                                 | E011 |
      | append crisis nodes so that the crisis chain has 4 nodes                                            | E012 |
      | remove card "c_s2_def_04" from node "s2_03_options"                                                 | E013 |
      | set initialState.escalation to 75                                                                   | E014 |
      | set initialState.escalation to 39                                                                   | E014 |
      | set initialState.grounding to 90                                                                    | E014 |
      | set initialState.confusion to 5                                                                     | E014 |
      | replace "{trigger_word}" by "{customer}" in all locales of c_s2_meta_02.text                        | E015 |
      | change the catalog title.en of this scenario to "Other"                                             | E016 |
      | delete c_s2_pace_01.text.de                                                                         | E018 |
      | set c_s2_pace_01.npcReaction.en to "   "                                                            | E018 |
      | add the key "fr" to c_s2_pace_01.text                                                               | E018 |
      | remove "{trigger_word}" from c_s2_meta_02.text.de only                                              | E019 |
      | set c_s2_pace_01.text.de to a 221 character string                                                  | E020 |
      | set title.en to "AB"                                                                                | E020 |

  @SBE-VAL-002
  Scenario Outline: Each warning code is detected without failing
    Given a copy of "scen_stakeholder_scope_002"
    And the change "<change>"
    When the validator runs
    Then it reports <code>
    And the exit code is 0

    Examples:
      | change                                                                                              | code |
      | set c_s2_pace_01.delta.escalation to -30                                                            | W101 |
      | replace the pool of "s2_03_options" by c_s2_meta_04, c_s2_def_04 and a copy of c_s2_def_04 named c_s2_def_04b | W102 |
      | set c_s2_pace_01.text.en to a 161 character string                                                  | W103 |
      | set decisionTimeLimitSec to 20                                                                      | W104 |
      | set c_s2_pace_01.text.de equal to c_s2_pace_01.text.en                                              | W105 |

  @SBE-VAL-003
  Scenario: All shipped scenarios pass
    Given the folder public/scenarios
    When the validator runs
    Then it reports 0 errors
    And it reports exactly 2 warnings, both W101 for card "c_defense_01" (escalation and confusion)
    And the exit code is 0

  @SBE-VAL-004
  Scenario: Error message format
    Given the change "delete c_s2_pace_01.text.de"
    When the validator runs
    And the validator runs with --no-catalog
    Then a line reads "scen_stakeholder_scope_002.json: E018 nodes[0].availableCards[0].text.de missing"
    And no E001 is reported for that path
    And the last line reads "1 files, 1 errors, 0 warnings"

  @SBE-VAL-006
  Scenario: The production folder needs a catalog
    Given a copy of public/scenarios without catalog.json
    When the validator runs without flags
    Then it reports E016 "catalog.json missing"
    And the exit code is 1

  @SBE-VAL-005
  Scenario: Build is blocked by an invalid scenario
    Given an invalid scenario file in public/scenarios
    When "npm run build" runs
    Then the prebuild validator fails and no dist folder is produced
```

### 28.18 Feature: Content loading (Section 7.5)

```gherkin
Feature: Catalog and scenario loading

  @SBE-CNT-001 @unit
  Scenario: Catalog lists four scenarios in order
    When the catalog is loaded
    Then the scenario ids in order are scen_stakeholder_scope_002, scen_angry_pm_deadline_001, scen_customer_refund_003, scen_customer_gaslight_004

  @SBE-CNT-002 @unit
  Scenario: Scenario files are fetched lazily and cached
    Given the catalog is loaded
    When the briefing of "scen_customer_refund_003" is opened twice
    Then "/scenarios/scen_customer_refund_003.json" is fetched once

  @SBE-CNT-003 @unit
  Scenario: The scenario cache keeps at most 4 entries
    Given 5 different scenario files were opened
    Then the cache holds 4 entries and the first opened is evicted

  @SBE-CNT-004 @unit
  Scenario Outline: Runtime guard rejects broken files
    Given the scenario file has <defect>
    When it is loaded
    Then the error screen shows "errors.scenarioLoad"
    And the telemetry event content_error is buffered with reason <reason>

    Examples:
      | defect                       | reason          |
      | schemaVersion "2.0"          | schemaVersion   |
      | id different from the entry  | idMismatch      |
      | an empty nodes array         | noNodes         |
      | an unknown startNodeId       | badStartNode    |
      | invalid JSON                 | parse           |

  @SBE-CNT-005 @unit
  Scenario: Base URL prefix is respected
    Given the app is built with VITE_BASE "/aikido/"
    When the catalog is loaded
    Then the request URL is "/aikido/scenarios/catalog.json"
```

### 28.19 Feature: Localization (D28 to D33, Section 16.4, Section 23)

```gherkin
Feature: Hungarian, English and German

  @SBE-I18-001 @unit
  Scenario Outline: Initial locale
    Given the saved locale setting is <setting>
    And navigator.languages is <languages>
    When the app starts
    Then the active locale is <locale>
    And app_open has localeSource <source>

    Examples:
      | setting | languages              | locale | source   |
      | auto    | ["de-AT", "en"]        | de     | browser  |
      | auto    | ["fr-FR", "hu"]        | hu     | browser  |
      | auto    | ["fr-FR"]              | en     | fallback |
      | auto    | []                     | en     | fallback |
      | hu      | ["de-DE"]              | hu     | setting  |
      | en      | ["hu-HU"]              | en     | setting  |
      | auto    | ["EN-gb"]              | en     | browser  |
      | auto    | ["de-CH", "hu-HU"]     | de     | browser  |

  @SBE-I18-002 @e2e @i18n
  Scenario: First launch preselects the detected language
    Given a fresh browser context with locale "de-CH"
    When I open the app
    Then the onboarding language step shows "Deutsch" selected
    When I choose "English"
    Then the next onboarding text is "Which situation sounds more familiar?"
    And the html lang attribute is "en"

  @SBE-I18-003 @e2e
  Scenario: Switching language in Settings re-renders without reload
    Given the locale is hu and the Home screen is open
    When I open Settings and choose "Deutsch"
    And I go back to Home
    Then the title is "Situationen"
    And the first scenario title is "Scope Creep am Montagmorgen"
    And the html lang attribute is "de"
    And the page was not reloaded

  @SBE-I18-004 @unit
  Scenario Outline: Interpolation uses the variable of the same locale
    Given the scenario "scen_angry_pm_deadline_001" and locale <locale>
    When the statement of node "step_02_focused" is rendered
    Then the text is "<text>"

    Examples:
      | locale | text |
      | hu     | És ha ma délután nem lesz kész, akkor holnap megint én magyarázkodom a határidő miatt. |
      | en     | And if it's not done this afternoon, tomorrow I'll be the one explaining myself about the deadline again. |
      | de     | Und wenn es heute Nachmittag nicht fertig ist, muss ich mich morgen wieder wegen der Deadline rechtfertigen. |

  @SBE-I18-005 @unit
  Scenario Outline: npc_name follows the locale's name order
    Given the scenario "scen_customer_refund_003" and locale <locale>
    When the briefing is rendered
    Then it contains "<name>"
    And it does not contain "{npc_name}" or "{trigger_word}"

    Examples:
      | locale | name       |
      | hu     | Nagy Erika |
      | en     | Erika Nagy |
      | de     | Erika Nagy |

  @SBE-I18-006 @unit
  Scenario Outline: Number formatting
    Given the locale is <locale>
    When the debrief shows panicSec 4.6 and the constructive percentage 50
    Then the panic line reads "<panic>"
    And the ratio line reads "<ratio>"

    Examples:
      | locale | panic                              | ratio                             |
      | hu     | Pánikzónában töltött idő: 4,6 mp   | 50% konstruktív választás         |
      | en     | Time in the panic zone: 4.6 s      | 50% constructive choices          |
      | de     | Zeit in der Panikzone: 4,6 s       | 50 % konstruktive Entscheidungen  |

  @SBE-I18-007 @unit
  Scenario: The three UI tables have the same keys
    Given the tables hu, en and de
    Then en and de have exactly the keys of hu
    And no value is empty
    And every value uses the same placeholders as the hu value of the same key

  @SBE-I18-008 @unit
  Scenario: Run state is language-neutral
    Given a run started in locale hu
    When the locale changes to en and the run is resumed
    Then the run state is unchanged
    And the NPC statement is rendered in English

  @SBE-I18-009 @e2e @i18n
  Scenario Outline: Game texts appear in the chosen language
    Given the locale is <locale>
    And the scenario "scen_angry_pm_deadline_001" is started with seed 2
    Then the NPC bubble shows "<statement>"
    And the first card shows "<card>"
    And the apply button reads "<apply>"

    Examples:
      | locale | statement                                                                                | card                                                                  | apply      |
      | hu     | Már megint képtelen voltál időben leadni a modult! Mindent nekem kell megoldanom helyetted?! | Mit értesz pontosan az alatt, hogy 'mindent neked kell megoldanod'? | Alkalmazom |
      | en     | You failed to deliver the module on time again! Do I have to fix everything for you?!   | What exactly do you mean by 'I have to fix everything'?               | Use it     |
      | de     | Schon wieder hast du das Modul nicht rechtzeitig geliefert! Muss ich denn alles für dich erledigen?! | Was genau meinst du mit 'ich muss alles erledigen'?       | Ausspielen |

  @SBE-I18-010 @unit
  Scenario: Category, difficulty and outcome labels come from the table
    Given the locale is de
    Then the label of category ATTACK is "Gegenangriff"
    And the label of difficulty BEGINNER is "Einsteiger"
    And the short label of outcome END_DEESCALATED is "Deeskaliert"

  @SBE-I18-011 @component
  Scenario: Long German labels do not overflow
    Given the locale is de and a 375x667 viewport
    When the Settings, Debrief and Game screens render
    Then no element has a horizontal overflow
    And every button's text is fully visible (wrapping allowed)

  @SBE-I18-012 @e2e
  Scenario: Clear all data resets the language to auto
    Given the locale setting is "de" and the browser language is "en-US"
    When I choose "Alle Daten löschen" and confirm
    Then the active locale is en
```

### 28.20 Feature: FR-01 Card display and swipe

```gherkin
@e2e @FR-01
Feature: Cards are played by tap and confirm or by swipe-up

  Background:
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 2

  @SBE-CRD-001 @i18n
  Scenario: Three cards are shown in the bottom 40 percent
    Then 3 cards are visible
    And on a 375x667 viewport every card's top edge is at y >= 400.2 px
    And the apply button is in the bottom 40% as well

  @SBE-CRD-002
  Scenario: Tap selects and opens the preview
    When I tap the card "c_pace_01"
    Then the card is marked selected
    And the preview shows the full card text and the category label "Pacing / Validálás"
    And the vibration log ends with [15]
    And the tone log ends with 880 Hz

  @SBE-CRD-003
  Scenario: Confirm commits in under 200 ms
    When I tap the card "c_metamodel_01" and press "Alkalmazom"
    Then the card reaches the drop zone within 200 ms
    And the animation used only transform and opacity
    And the other two cards fade out

  @SBE-CRD-004
  Scenario: Swipe-up commits
    When I drag the card "c_pace_01" up by 120 px within 200 ms
    Then the card reaches the drop zone within 200 ms
    And the turn history records "c_pace_01"

  @SBE-CRD-005
  Scenario Outline: Swipe thresholds
    When I drag the card "c_pace_01" by dx <dx> px and dy <dy> px over <ms> ms
    Then the card is <result>

    Examples:
      | dx | dy   | ms  | result                              |
      | 0  | -60  | 300 | committed                           |
      | 0  | -59  | 300 | returned to its place within 150 ms |
      | 0  | -40  | 40  | committed (velocity >= 0.6 px/ms)   |
      | 49 | -80  | 300 | committed                           |
      | 50 | -80  | 300 | returned to its place within 150 ms |
      | 0  | 80   | 300 | returned to its place within 150 ms |

  @SBE-CRD-006
  Scenario: Cancel closes the preview without playing
    When I tap the card "c_pace_01" and press "Mégse"
    Then the preview is closed
    And the phase is INTERVENTION_CHOICE

  @SBE-CRD-007
  Scenario: Keyboard play
    When I press "2" and then "Enter"
    Then the card "c_pace_01" is committed

  @SBE-CRD-008
  Scenario: Escape closes the preview
    When I press "1" and then "Escape"
    Then the preview is closed

  @SBE-CRD-009
  Scenario: Scrolling inside a long card text does not commit
    Given the locale is de and a 375x667 viewport
    And the text of a card overflows its box
    When I drag vertically inside that card's text area
    Then the text scrolls
    And no card is committed

  @SBE-CRD-010
  Scenario: The card text uses the PRD font clamp
    Then the computed font-size of card text is between 8pt and 10pt
    And the text container has overflow-y auto

  @SBE-CRD-011 @desktop
  Scenario: A full scenario with the keyboard only on a computer (D46)
    Given desktop Chromium and desktop Firefox at 1280x800 and 1920x1080
    And the scenario was started from the Home screen with Tab and Enter only
    When I press "1", "Enter", "Space", "2", "Enter", "Space", "1" and "Enter"
    Then the outcome is WIN_BREAKTHROUGH after 3 turns
    And the metrics are E=52 F=84 K=92
    And focus is on the debrief headline
    When I press "Tab" until "debrief.toList" is focused and press "Enter"
    Then the Home screen is shown
    And no mouse or touch event was dispatched during the test

  @SBE-CRD-012 @desktop
  Scenario: A full scenario with the mouse only on a computer (D46)
    Given desktop Chromium and desktop Firefox at 1280x800 and 1920x1080
    When I click the card "c_metamodel_01" and click "Alkalmazom"
    And I click "Tovább"
    And I drag the card "c_metamodel_03" up by 120 px with the mouse button held
    And I click "Tovább"
    And I click the card "c_metamodel_05" and click "Alkalmazom"
    Then the outcome is WIN_BREAKTHROUGH after 3 turns
    And the turn history records "c_metamodel_01, c_metamodel_03, c_metamodel_05"
    And no key was pressed during the test
```

### 28.21 Feature: FR-02 Real-time meters

```gherkin
@e2e @FR-02
Feature: Meters animate linearly in 400 ms

  @SBE-MTR-001
  Scenario: Meters reach their new values in 400 ms
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 2
    When I commit "c_metamodel_01"
    Then within 400 ms (+50 ms tolerance) the E meter shows 60, the F meter shows 95 and the K meter shows 30
    And the E fill element has transition-duration 400ms and transition-timing-function linear

  @SBE-MTR-002
  Scenario: Midway values are interpolated linearly
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 2
    When I commit "c_metamodel_01"
    Then 200 ms after the meter tween started the E meter number is between 61 and 64

  @SBE-MTR-003 @component
  Scenario: Danger colouring
    When E changes to 70
    Then the E bar uses the danger token
    When F changes to 30
    Then the F bar uses the danger token
    When E changes to 69 and F to 31
    Then neither bar uses the danger token

  @SBE-MTR-004 @component
  Scenario: Accessible meter values update once
    When E animates from 65 to 45
    Then aria-valuenow of the E meter is updated once, to 45
    And the polite live region announces "Eszkaláció új értéke: 45 (korábban: 65)."

  @SBE-MTR-005 @component
  Scenario: Reduced motion skips the tween
    Given reduced motion is on
    When E changes from 65 to 45
    Then the E meter shows 45 immediately
```

### 28.22 Feature: FR-03 Haptics

```gherkin
@FR-03
Feature: Vibration patterns per event

  @SBE-HAP-001 @unit
  Scenario Outline: Pattern by trigger at HIGH intensity
    Given haptic intensity HIGH and a vibrate-capable device
    When <trigger>
    Then navigator.vibrate is called with <pattern>

    Examples:
      | trigger                                                          | pattern         |
      | a card is selected                                               | [15]            |
      | a PACING card resolves and E does not rise                       | [30, 50, 30]    |
      | a REFRAMING card resolves and E does not rise                    | [30, 50, 30]    |
      | a META_MODEL card resolves and E does not rise                   | [30, 50, 30]    |
      | a META_MODEL card with delta (4, -4, 26) resolves at E=50, M=0   | [15]            |
      | a DEFENSE card resolves                                          | [120, 50, 120]  |
      | an ATTACK card resolves                                          | [120, 50, 120]  |
      | the stress timer reaches 5 seconds left                          | [15]            |

  @SBE-HAP-002 @unit
  Scenario: Win adds the breakthrough pattern 300 ms after the resolution pattern
    Given the run from @SBE-GLD-001 at its last commit
    When "c_metamodel_05" resolves at 0 ms
    Then the vibration log is [30, 50, 30] at 0 ms and [60, 40, 100] at 300 ms

  @SBE-HAP-003 @unit
  Scenario: Loss adds a second damage pattern
    Given the run from @SBE-GLD-002
    When "c_attack_01" resolves at 0 ms
    Then the vibration log is [120, 50, 120] at 0 ms and [120, 50, 120] at 300 ms

  @SBE-HAP-004 @unit
  Scenario Outline: LOW intensity halves vibration segments, keeps pauses
    Given haptic intensity LOW
    When the pattern <pattern> is played
    Then navigator.vibrate is called with <scaled>

    Examples:
      | pattern        | scaled       |
      | [15]           | [10]         |
      | [30, 50, 30]   | [15, 50, 15] |
      | [60, 40, 100]  | [30, 40, 50] |
      | [120, 50, 120] | [60, 50, 60] |

  @SBE-HAP-005 @unit
  Scenario: OFF never calls vibrate
    Given haptic intensity OFF
    When any haptic pattern is played
    Then navigator.vibrate is not called

  @SBE-HAP-006 @unit
  Scenario Outline: Missing or failing API is a silent no-op
    Given navigator.vibrate <state>
    When any haptic pattern is played
    Then no error is thrown and nothing is logged

    Examples:
      | state                  |
      | is undefined           |
      | is not a function      |
      | throws a TypeError     |

  @SBE-HAP-007 @e2e
  Scenario: Full scenario without vibration support has no console errors
    Given navigator.vibrate is undefined
    When I play @SBE-GLD-001 to the end
    Then the console has no errors
    And the Settings haptic radio buttons are disabled with "settings.hapticUnsupported"

  @SBE-HAP-008 @manual
  Scenario: Patterns are distinguishable by feel on a low-end Android device
    When I trigger TAP, VALIDATION, BREAKTHROUGH and DAMAGE
    Then I can tell the four patterns apart without looking
```

### 28.23 Feature: FR-04 Synthesized audio

```gherkin
@FR-04
Feature: Sine tones without audio files

  @SBE-AUD-001 @unit
  Scenario Outline: Notes per sound
    Given audio is unlocked and not muted
    When the sound <sound> is played
    Then sine oscillators start with the frequencies <frequencies> in this order

    Examples:
      | sound          | frequencies                         |
      | CARD_TAP       | 880                                 |
      | CONSTRUCTIVE   | 523.25, 659.25                      |
      | INQUIRY        | 659.25, 783.99, 659.25              |
      | REACTIVE       | 233.08, 196                         |
      | WIN            | 523.25, 659.25, 783.99, 1046.5      |
      | LOSS           | 196, 164.81, 130.81                 |
      | NEUTRAL_END    | 440, 440                            |
      | TIMER_WARN     | 1046.5                              |
      | TONE_CALM      | 261.63                              |
      | TONE_TENSE     | 293.66 + 311.13 together            |
      | TONE_ANGRY     | 220 + 233.08 together               |
      | TONE_FURIOUS   | 196 + 207.65 together               |
      | TONE_SARCASTIC | 392, 349.23                         |
      | TONE_COLD      | 174.61                              |

  @SBE-AUD-002 @unit
  Scenario Outline: Sound by played category
    When a <category> card resolves
    Then the sound <sound> is played

    Examples:
      | category   | sound        |
      | PACING     | CONSTRUCTIVE |
      | REFRAMING  | CONSTRUCTIVE |
      | META_MODEL | INQUIRY      |
      | DEFENSE    | REACTIVE     |
      | ATTACK     | REACTIVE     |

  @SBE-AUD-003 @unit
  Scenario: The statement tone follows the node tone
    Given the scenario "scen_angry_pm_deadline_001" is started with seed 1
    Then TONE_ANGRY is played on entering ATTACK_INCOMING of "step_01"

  @SBE-AUD-004 @unit
  Scenario: Every oscillator is a sine and is disconnected after it ends
    When any sound is played
    Then every created oscillator has type "sine"
    And every oscillator is disconnected on its ended event
    And only one AudioContext exists for the app lifetime

  @SBE-AUD-005 @unit
  Scenario: Nothing plays before the first user gesture
    Given no pointerdown or keydown happened yet
    When the sound CONSTRUCTIVE is requested
    Then no AudioContext is created and nothing is queued

  @SBE-AUD-006 @unit
  Scenario: Muted plays nothing
    Given audio is muted
    When any sound is requested
    Then no oscillator is started

  @SBE-AUD-007 @unit
  Scenario: Suspended context is resumed and the sound is skipped
    Given the AudioContext state is "suspended"
    When the sound CARD_TAP is requested
    Then ctx.resume() is called
    And no oscillator is started for this request

  @SBE-AUD-008 @e2e
  Scenario: No audio files are requested
    When I play @SBE-GLD-001 to the end
    Then no network request ends in .mp3, .ogg, .wav or .m4a
```

### 28.24 Feature: FR-05 Debrief screen

```gherkin
@e2e @FR-05
Feature: Post-scenario debrief

  @SBE-DUI-001 @i18n
  Scenario: Debrief after a rupture with an unrecovered panic episode
    Given I played @SBE-GLD-006 to the end
    Then the debrief screen is shown with focus on the outcome headline
    And the headline reads "Szakadás. A beszélgetés megszakadt."
    And the panic line shows a value greater than 0
    And "Nem sikerült kilépni a pánikzónából." is shown
    And the RTO line is not shown
    And the dominant style reads "Jellemző stílusod: Reaktív védekezés"
    And the ratio reads "0% konstruktív választás"
    And the coaching tip for DEFENSE is shown

  @SBE-DUI-002
  Scenario: Debrief after a win
    Given I played @SBE-GLD-001 to the end
    Then the headline reads "Áttörés! A partner megnyílt az együttműködésre."
    And the ratio reads "100% konstruktív választás"
    And the dominant style reads "Jellemző stílusod: Meta-modell kérdés"
    And "Nem kerültél pánikzónába." is shown

  @SBE-DUI-003 @component
  Scenario: Timeline chart has one point per state
    Given the run from @SBE-GLD-003
    Then the sparkline has 3 polylines with 4 points each (initial state plus 3 turns)
    And dashed lines are drawn at E=70 and F=30
    And a visually hidden table lists the same values

  @SBE-DUI-004 @component
  Scenario: Turn list shows choices and hints
    Given the run from @SBE-GLD-003
    Then the turn list has 3 rows
    And row 1 shows the card "c_defense_01" text, the label "Reaktív védekezés", the deltas "+30 / -20 / -10" and its debrief hint
    And row 1 is marked as a crisis redirect

  @SBE-DUI-005
  Scenario: Play again starts a new run of the same scenario
    Given the debrief of "scen_angry_pm_deadline_001"
    When I press "Újra"
    Then a new run of "scen_angry_pm_deadline_001" starts with a new seed

  @SBE-DUI-006
  Scenario: Back to the list
    When I press "Vissza a listához"
    Then the Home screen shows "scen_angry_pm_deadline_001" with its best outcome badge
```

### 28.25 Feature: Layout and touch rules (PRD §12, §14)

```gherkin
Feature: One-thumb layout

  @SBE-LAY-001 @e2e
  Scenario Outline: All decision UI is in the bottom 40 percent
    Given a <viewport> viewport
    And the game screen in INTERVENTION_CHOICE
    Then the cards, the apply button and the continue button have top >= 60% of the viewport height

    Examples:
      | viewport |
      | 375x667  |
      | 390x844  |
      | 412x915  |

  @SBE-LAY-002 @component
  Scenario: Safe area padding
    Then the bottom zone has padding-bottom "env(safe-area-inset-bottom, 16px)"
    And index.html has viewport-fit=cover

  @SBE-LAY-003 @component
  Scenario: No double-tap zoom
    Then every button outside cards has touch-action manipulation
    And every card root has touch-action none

  @SBE-LAY-004 @e2e
  Scenario Outline: Landscape in a browser tab still works
    Given a <viewport> viewport
    When I play one turn
    Then the bottom zone is at least 200 px high (landscape rule, D44) and the upper zone scrolls
    And the page has no horizontal scrollbar

    Examples:
      | viewport | note                                                      |
      | 667x375  | phone in landscape                                        |
      | 910x420  | laptop 1366x768 at 150 % scaling, below the browser toolbar (D46) |

  @SBE-LAY-005 @manual
  Scenario: Display cutout and gesture bar do not cover buttons on an Android phone with gesture navigation
    Then the apply and continue buttons are fully tappable

  @SBE-LAY-006 @e2e @desktop
  Scenario Outline: Centred column on computer screens (D46)
    Given a <viewport> viewport with a mouse pointer
    And the game screen in INTERVENTION_CHOICE
    Then the app column is <width> px wide and horizontally centred
    And the bottom zone has the same width and left edge as the column
    And the cards, the apply button and the continue button have top >= 60% of the viewport height
    And the page has no horizontal scrollbar

    Examples:
      | viewport  | width |
      | 600x800   | 600   |
      | 601x800   | 520   |
      | 1280x800  | 520   |
      | 1920x1080 | 520   |

  @SBE-LAY-007 @component
  Scenario Outline: Key hints only with a fine pointer (D46)
    Given matchMedia "(hover: hover) and (pointer: fine)" matches <fine>
    When the game screen renders in INTERVENTION_CHOICE with a preview open
    Then the key hints "1", "2", "3", "Enter" and "Esc" are <shown>
    And every key hint has aria-hidden "true"

    Examples:
      | fine  | shown     |
      | true  | shown     |
      | false | not shown |
```

### 28.26 Feature: Accessibility (NFR-04)

```gherkin
@NFR-04
Feature: WCAG 2.1 AA

  @SBE-A11-001 @e2e @i18n
  Scenario Outline: No axe violations
    Given the <screen> screen
    When axe runs with the tags wcag2a and wcag2aa
    Then there are 0 violations

    Examples:
      | screen     |
      | onboarding |
      | home       |
      | briefing   |
      | game       |
      | debrief    |
      | settings   |
      | stats      |
      | howto      |

  @SBE-A11-002 @component
  Scenario: The NPC statement is announced once and in full
    When ATTACK_INCOMING starts for "step_01" in locale hu
    Then the polite live region contains the full statement immediately
    And it is not updated character by character

  @SBE-A11-003 @component
  Scenario: The outcome is announced assertively
    When the run ends with WIN_BREAKTHROUGH in locale en
    Then the assertive live region contains "Breakthrough! Your partner opened up to cooperation."

  @SBE-A11-004 @component
  Scenario Outline: Focus moves with the phase
    When the phase becomes <phase>
    Then focus is on <element>

    Examples:
      | phase               | element                 |
      | INTERVENTION_CHOICE | the hand group          |
      | OUTCOME_CHECK       | the continue button     |
      | ENDED               | the debrief headline    |

  @SBE-A11-005 @component
  Scenario: Meters expose their values
    Then each meter has role meter, aria-valuemin 0, aria-valuemax 100 and an aria-label from meter.E, meter.F, meter.K

  @SBE-A11-006 @component
  Scenario: Touch targets
    Then every interactive element is at least 44x44 CSS px

  @SBE-A11-007 @e2e
  Scenario: 200% zoom keeps everything readable
    Given the browser zoom is 200%
    When I open a card preview
    Then the full card text is readable without horizontal scrolling

  @SBE-A11-008 @ci
  Scenario: Contrast tokens
    Then every text colour token has contrast >= 4.5:1 against its background token in the dark and the light theme
```

### 28.27 Feature: PWA and offline (NFR-02)

```gherkin
@NFR-02
Feature: Installable and fully offline (D22, Section 24.3)

  Automated scenarios run against the built dist served by vite preview under VITE_BASE "/aikido/".

  @SBE-PWA-001 @e2e @pwa
  Scenario: Airplane mode after first load
    Given the app was loaded once online and the service worker is active
    When the network is set offline and the start URL is reloaded
    Then the Home screen shows 4 scenarios and reacts to input
    And I can play @SBE-GLD-001 to the end
    And the run summary is stored in the runs store

  @SBE-PWA-002 @ci
  Scenario: Everything is precached
    When check-bundle-size reads the precache manifest from dist/sw.js
    Then every file in dist is in the precache manifest except sw.js, workbox-*.js and *.map files
    And the manifest contains index.html, all JS and CSS, catalog.json and all 4 scenario files

  @SBE-PWA-003 @e2e @pwa
  Scenario: Update prompt is deferred during a game and keeps results
    Given dist was loaded, the service worker is active and @SBE-GLD-001 was played to the end
    And the server now serves dist-next, built with a different version
    And the new service worker is waiting
    And the game screen is open
    Then no update toast is shown
    When I return to Home
    Then the toast "Új verzió érhető el." is shown
    When I press "Frissítés"
    Then the page reloads with the version of dist-next
    And the finished run of @SBE-GLD-001 is still in Stats
    And telemetry sw_update_applied is buffered

  @SBE-PWA-004 @ci
  Scenario: Manifest
    Given dist was built with VITE_BASE "/aikido/"
    When check-manifest runs on dist
    Then the manifest has name "Verbal Aikido: The Empathy Firewall", short_name "Verbal Aikido", display standalone, orientation portrait
    And start_url and scope resolve to "/aikido/"
    And theme_color and background_color are "#0F172A"
    And icons of 192x192 and 512x512 PNG plus a maskable 512x512 PNG exist with exactly those pixel sizes

  @SBE-PWA-005 @manual
  Scenario: Install from the browser and launch standalone
    Given the Android phones and the tablet in Chrome, and a Windows laptop in Chrome and Edge
    When I install the app from the browser
    Then the icon and the name "Verbal Aikido" are correct
    And the app opens standalone without browser UI
    And on the phones it stays in portrait

  @SBE-PWA-006 @e2e @pwa
  Scenario: Chrome finds no installability errors
    Given the app was loaded once and the service worker is active
    When the CDP command Page.getInstallabilityErrors runs
    Then it returns an empty list

  @SBE-PWA-007 @e2e @pwa
  Scenario: The service worker controls the page within the base path
    Given the app was loaded once
    When the page is reloaded
    Then navigator.serviceWorker.controller is set
    And the service worker registration scope is "http://localhost:4173/aikido/"
```

### 28.28 Feature: Telemetry and sync (Section 13)

```gherkin
Feature: Local event buffer, sync disabled by default

  @SBE-TEL-001 @unit
  Scenario: card_played event content
    Given the run from @SBE-GLD-002 in locale hu
    When "c_attack_01" is committed after 3200 ms in INTERVENTION_CHOICE
    Then a card_played event is buffered with turn 1 (1-based; turnIndex 0), nodeId "step_01", cardId "c_attack_01", category "ATTACK", timedOut false, decisionMs 3200, E 100, F 68.75, K 0

  @SBE-TEL-002 @unit
  Scenario: scenario_end event content
    Given the run from @SBE-PNC-003 has ended in locale en
    Then a scenario_end event is buffered with outcome "LOSS_RUPTURE", turns 2, panicSec 4.6, rtoSec null, constructive 0, reactive 2, locale "en"

  @SBE-TEL-003 @unit
  Scenario: Events contain no personal data
    Then no event contains free text, a user name or an e-mail address
    And clientId equals meta.installId, a random UUID

  @SBE-TEL-004 @e2e
  Scenario: Default build sends nothing
    Given VITE_SYNC_ENDPOINT is empty
    When I play @SBE-GLD-001 to the end
    Then no request leaves the app origin

  @SBE-TEL-005 @unit
  Scenario Outline: Sync responses
    Given VITE_SYNC_ENDPOINT is "https://sync.example.test"
    And 150 events are queued
    When flush() runs and the server answers <status>
    Then <result>

    Examples:
      | status          | result                                                          |
      | 202             | the first 100 events are deleted, 50 remain                     |
      | 400             | the batch of 100 is deleted (dropped), 50 remain                |
      | 503             | 150 remain and a retry is scheduled in 30 s                     |
      | network failure | 150 remain and a retry is scheduled in 30 s                     |

  @SBE-TEL-006 @unit
  Scenario: Retry backoff
    Given the sync keeps failing with 503
    Then retries are scheduled after 30 s, 2 min and 10 min, then only on the next app_open

  @SBE-TEL-007 @unit
  Scenario: Batch request body
    Given VITE_SYNC_ENDPOINT is "https://sync.example.test"
    When flush() sends a batch
    Then it POSTs to "https://sync.example.test/v1/events:batch" with JSON fields clientId, appVersion, sentAt and at most 100 events
```

### 28.29 Feature: Settings, onboarding and navigation (Section 16)

```gherkin
Feature: Screens around the game

  @SBE-NAV-001 @e2e
  Scenario: First launch flow
    Given a fresh browser context with locale "hu-HU"
    When I open the app
    Then I see the language step, then the role step, then the HowTo panels
    And after HowTo the Home screen is shown
    And meta.onboardingDone is true

  @SBE-NAV-002 @e2e
  Scenario: Persona sorts matching scenarios first within each difficulty
    Given I chose the role "Ügyfélkapcsolati szakértő"
    Then within INTERMEDIATE "scen_customer_refund_003" is listed before "scen_angry_pm_deadline_001"

  @SBE-NAV-003 @e2e
  Scenario: Skipping the role keeps catalog order
    Given I skipped the role
    Then within INTERMEDIATE "scen_angry_pm_deadline_001" is listed before "scen_customer_refund_003"

  @SBE-NAV-004 @e2e
  Scenario: Browser back on the game screen asks first
    Given the game screen
    When I press the browser back button
    Then the leave dialog is shown and the game screen stays

  @SBE-NAV-005 @e2e
  Scenario: Briefing shows the timer notice only for timed scenarios
    When I open the briefing of "scen_customer_gaslight_004"
    Then "Ebben a helyzetben 15 másodperced van minden döntésre." is shown
    When I open the briefing of "scen_angry_pm_deadline_001"
    Then no timer notice is shown

  @SBE-SET-001 @e2e
  Scenario Outline: Settings persist across reloads
    When I set <setting> to <value> and reload
    Then <setting> is <value>

    Examples:
      | setting          | value |
      | audio muted      | true  |
      | haptic intensity | LOW   |
      | reduced motion   | on    |
      | language         | en    |

  @SBE-SET-002 @e2e
  Scenario: Delete all data
    Given 3 finished runs and a saved run
    When I choose "Összes adat törlése" and confirm
    Then all stores are empty
    And the onboarding is shown on next start

  @SBE-SET-003 @e2e
  Scenario: Stats screen
    Given finished runs of @SBE-GLD-001 and @SBE-GLD-002
    Then the constructive ratio over the last 50 runs is 75%
```

### 28.30 Feature: Performance and build gates (NFR-01, NFR-03, DoD)

```gherkin
@ci
Feature: Budgets enforced in CI

  @SBE-PRF-001 @NFR-01
  Scenario: Bundle size
    When the production build finishes
    Then the gzip size of the initial JS, CSS and HTML is below 350 KB

  @SBE-PRF-002 @NFR-01 @e2e
  Scenario: Start time on a throttled first load
    Given Chromium with CDP network throttling 150 ms RTT, 1.6 Mbps down, 750 Kbps up and CPU throttling rate 4
    And a fresh context with the service worker blocked
    When the start URL is loaded 3 times
    Then the median time from navigation start to the "app-interactive" mark is at most 1200 ms

  @SBE-PRF-003 @e2e
  Scenario: No console errors in a full run (D22, best practices)
    When I play @SBE-GLD-001 to the end
    Then the console has no error entries and no uncaught exceptions

  @SBE-PRF-004 @NFR-03 @e2e
  Scenario: Memory stays bounded
    Given Chromium
    When I play 10 complete runs in a row
    Then JSHeapUsedSize is below 45 MB

  @SBE-PRF-005 @NFR-03
  Scenario: Only compositor-friendly properties are animated
    Then no CSS transition or animation in src/ui/styles targets a property other than transform or opacity

  @SBE-PRF-006
  Scenario: Spec coverage
    When check-spec-coverage runs
    Then every @SBE id in tests/spec that is not @manual appears in at least one test title
```

### 28.31 Feature: Security and robustness

```gherkin
Feature: Content is rendered as text and the page is locked down

  @SBE-SEC-001 @component
  Scenario: Markup in content is shown literally
    Given a test scenario whose npc.name.en is "Dóra" and whose card text in locale en is "<b>bold</b> {npc_name}"
    When the card renders
    Then the visible text is "<b>bold</b> Dóra" and no b element exists

  @SBE-SEC-002 @ci
  Scenario: No innerHTML
    Then the source contains no dangerouslySetInnerHTML and no innerHTML assignment

  @SBE-SEC-003 @e2e
  Scenario: Content Security Policy
    Given the production build served by vite preview with the meta CSP only, as on GitHub Pages
    When the app runs a full scenario
    Then the console reports no CSP violation

  @SBE-SEC-004 @unit
  Scenario: Unknown placeholder is left as literal text
    Given the template "Hello {stranger}" and no variable "stranger"
    When it is interpolated
    Then the result is "Hello {stranger}"

  @SBE-SEC-005 @ci
  Scenario: Engine purity rule
    Then ESLint no-restricted-imports reports nothing for src/engine importing from src/ui, src/storage, src/feedback or src/telemetry
```

### 28.32 Not covered by examples

- Visual design details (colours, spacing, icon shapes) beyond the contrast and layout rules: reviewed by eye.
- Translation quality: native-speaker review (DoD item 13), not testable by assertion.
- Two tabs writing the same database (Section 21): last write wins, intentionally untested in v1.
