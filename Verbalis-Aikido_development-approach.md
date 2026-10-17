# Verbális Aikidó: development approach

| Key | Value |
|---|---|
| Based on | [`Verbalis_Aikido_Architecture.md`](Verbalis_Aikido_Architecture.md) (Architecture v1.0, revised 2026-10-14, D35–D47) |
| Date | 2026-10-14 |

This plan builds on Architecture v1.0 as revised on 2026-10-14 (D35–D47). Every open question is closed:

- The architect confirmed A1–A13.
- The PO approved the three languages and the card `touch-action` change.
- The PO decided three more points: the game runs on computers too (D46), the PWA requirement is proven by our own pass/fail checks instead of an audit score (D22), and the device tests use the Android phones, the Android tablet and the Windows laptops we have, with iOS not verified on a device (D47).
- I am the native-speaker reviewer for the English and German texts.

The plan follows Section 26. It changes the order in two places so the biggest risks show up early, not in week 6.

## 1. Working principles

1. **The spec is the source of truth.** Section 28 is the acceptance test. When code and spec disagree, I raise it with the architect and don't quietly pick one. Questions for the PO are collected and sent in one batch.
2. **Tests first, linked to the spec.** Each feature starts by copying its `.feature` file into `tests/spec/`, then writing failing tests titled with the `@SBE` ids, then writing code until they pass. `check-spec-coverage.ts` is in CI from day 1, so the list of missing ids works as the to-do list.
3. **Pure engine, thin controller, plain UI.** All logic that can be tested without a browser lives in `src/engine` or in pure helpers. The UI only renders the state and sends events.
4. **Small pull requests, main always deployable.** One feature area per PR. Each PR passes all CI jobs, and every merge to `main` deploys to GitHub Pages.
5. **Constants in one place.** Every timing and threshold lives in `constants.ts`, including the swipe thresholds and the spring-back duration. That is the tuning knob for the UX work in phase 6.
6. **Minimal dependencies.** The only runtime dependencies are `preact` and `@preact/signals`. Development dependencies are limited to the Section 3 list plus `@testing-library/preact` and `@axe-core/playwright`. I'll write my own small helpers before adding a library.

## 2. Phases

Each phase lists its deliverables, the spec ids it covers and the condition for calling it done.

### Phase 0: Repository, CI pipeline and risk spikes (Section 26 step 1, extended)

Deliverables:

- **Repository:**
  - A public GitHub repo with Pages set to deploy from GitHub Actions.
  - Branch protection on `main` requiring `validate`, `unit`, `e2e` and `pwa`.
- **Toolchain:**
  - Node 24 LTS with the exact version in `.nvmrc`.
  - Every tool pinned exactly.
  - The Playwright container tag matches the pinned Playwright version.
  - Third-party actions pinned to a full commit SHA.
- **Scaffold:**
  - Vite, Preact, TypeScript with `strict` and `noUncheckedIndexedAccess`.
  - ESLint, including the `no-restricted-imports` rule for each folder and the rule against literal text in JSX.
  - Prettier, Vitest, Playwright, and the full folder layout from Section 5.
- **`ci.yml`** with all six jobs from 25.2 running against an "empty" app shell: one screen, the manifest and the service worker.
- **Spikes that settle the main risks before any feature work:**
  1. **PWA check on the shell under the Pages sub-path.** Serve the built shell with `vite preview` under `VITE_BASE`, then call CDP `Page.getInstallabilityErrors` from Playwright Chromium. It must return an empty list, and the service worker must control the page with scope `/<repo>/` after one reload. This is the core of the `pwa` job (24.3), so the job starts life with these two checks plus `check-manifest.ts`.
  2. **Start time ≤ 1200 ms** for the shell in `startup.spec.ts` (CDP network and CPU throttling, Section 20). This sets the baseline; the shell should be far under the limit, so later regressions are easy to see.
  3. **GitHub Pages under the `/<repo>/` sub-path.** Check that the service worker scope, the manifest `start_url`, the CSP meta tag, a reload in airplane mode, and install on a real Android phone and from Chrome and Edge on a Windows laptop all work.

Done when: CI is green, the shell is live on Pages, and the PWA spike shows no installability errors.

### Phase 1: Content types, schema and validator (step 2)

- Write `content/types.ts`, `scenario.schema.json` and `catalog.schema.json` exactly as in Sections 6–7.
- Build the validator with every error and warning code (E001–E020, W101–W105) and the `--no-catalog` flag:
  - Schema errors inside a translated-text field are reported as E018 (D39).
  - Output format as in SBE-VAL-004.
  - The guideline ranges are imported from `constants.ts`, so they exist only once.
- Fixtures: one file per row of SBE-VAL-001/002 under `tests/fixtures/scenarios/invalid/` and `catalog-mismatch/`.
- **All four scenarios go in now**, not in step 10 as Section 26 says. My dry run already shows they validate, and the golden playthroughs in phase 2 need them.
- Done when: SBE-VAL-001…006 and SBE-CNT-001 pass, `npm run validate:scenarios` shows 0 errors and 2 warnings, and `prebuild` blocks a broken file.

### Phase 2: Engine (step 3)

I build the engine bottom-up, each part tested before the next one starts:

1. **`rng.ts`**: SBE-RNG-001…003.
2. **`metrics.ts`**: SBE-ENG-\*, SBE-MOM-\*. Watch the operation order and the `Math.round` rounding to 2 decimals (example: `79.9375` must become `79.94`).
3. **`hand.ts`**: SBE-HND-\*. Exactly 5 random draws from a pool of 4 or more cards, 2 from a pool of 3.
4. **`interpolate.ts`** and `pick()`: SBE-I18-004/005, SBE-SEC-004.
5. **`outcome.ts` and `branching.ts`**: SBE-OUT-\*, SBE-CRI-\*. The turn limit is checked before the crisis redirect.
6. **`fsm.ts`**: the transition table, unknown events return the *same object*, `firstReactiveCard`, `resumeTimerMs` (D35/D36), and SBE-FSM-\*.
7. **`replay.ts`** and **`stats.ts`**: SBE-FSM-008, SBE-PNC-\*, SBE-DBF-\*, SBE-TMR-007…009.
8. **Golden playthroughs** SBE-GLD-001…010 against the real scenario files. These are the final check of the engine. My earlier Python dry run already reproduced them, so a mismatch means a bug in my TypeScript, not in the spec.

Two extra checks beyond the spec, written as seeded loops with no new library:

- **Random playthroughs:** about 5,000 runs per scenario. Every run must keep the metrics within 0–100, keep the guaranteed card mix in every hand, end within 7 turns, and replay to the same final state.
- **Purity:** the engine never changes its input state.

Done when: the engine has at least 95% line and branch coverage and every `@unit` engine id passes.

### Phase 3: Storage and telemetry (step 4)

- One driver interface (12.1) with three implementations: IndexedDB, LocalStorage and in-memory. A single shared test suite runs against all three (SBE-STO-006, SBE-PER-012).
- **`finishRun`** (D38):
  - IndexedDB: one `readwrite` transaction covering `runs`, `progress` and `currentRun`.
  - LocalStorage and memory: write the summary, then progress, then delete `currentRun`.
  - In all three: if the `runId` is already in `runs`, progress is not touched, and stored runs are trimmed to 50.
- `openStorage()` handles the 1500 ms IndexedDB timeout and the fallbacks. All writes go through one ordered chain (SBE-PER-002), and a full quota is handled as in SBE-STO-005.
- Telemetry: events are only buffered in storage. `flush()` checks for a sync endpoint inside the function, the retry delays use an injectable timer, and SBE-TEL-\* pass.

### Phase 4: Game controller and clock (step 5)

- `VisibleClock` reads time from an injected source, so tests use a fake clock with no real waiting.
- The controller sends events, saves the run after every transition, runs the side effects for each phase, and owns:
  - the reveal, resolution and timer timeouts;
  - the 250 ms `TICK`;
  - the final `TICK` before every freeze (D43): page hidden, `pagehide`, and leaving the Game screen (D42);
  - the timer expiry commit (D35);
  - the `isTransitioning` input lock.
- Resume: replay the saved events, apply the phase rules from 12.5, restore the timing and `resumeTimerMs`, and discard runs saved with an older content version.
- Haptics, audio, storage, telemetry and screen-reader announcements are injected into the controller, so its tests check *which* side effects fired and when (SBE-TMR-002, SBE-HAP-002/003, SBE-AUD-003).
- Covers SBE-VIS-\*, SBE-PER-001…011, SBE-LCK-001, SBE-TMR-\*.

### Phase 5: Game screen as the first playable build, then device check 1 (steps 6–7, combined)

- Build the Game screen first, with haptics and audio wired in at once rather than in a later step. Feedback is part of how a card feels, and the PO's goal is UX.
  - Parts: meters, NPC speech bubble, hand, preview, drop zone, Continue button.
- Add just enough Home and Briefing to start a scenario.
- The centred desktop column (max 520 px, D46) goes in with the Game screen layout, because the fixed bottom zone and the card width both depend on it. Mouse clicks work through the same Pointer Events from the start.
- **First device check:** play on the low-end Android phone and one Windows laptop (Chrome) straight from the Pages deployment. This happens now, not in step 12. I write down what feels wrong in swipe, timing and readability before the other screens are built on top of the Game screen.

### Phase 6: Card handling UX (the PO's B3 goal)

The aim is a swipe that feels physical and never fights with scrolling.

**During the drag:**

- Use `setPointerCapture` and move the card only with `transform` inside `requestAnimationFrame`. Read the layout once, when the drag starts, and never during it.
- Add `will-change` only on the dragged card, and remove it afterwards.
- While dragging, the card follows the finger exactly up and down, and moves sideways at 0.2× (16.3).
- Past the commit threshold, the card snaps toward the drop zone and fires a TAP vibration, so the player feels the commit point before releasing.

**Releasing:**

- Commit on 60 px of upward movement *or* a flick of at least 0.6 px/ms, measured over the last 80 ms of the gesture.
- A cancelled drag springs back in 150 ms with ease-out.
- A commit flies the card to the drop zone in 180 ms from where it *currently* is, not from its resting place. This avoids a visible jump.

**Scrolling vs. swiping:**

- The card body uses `touch-action: none`. Text that overflows switches to `pan-y` through the `is-scrollable` class, which a `ResizeObserver` sets.
- A drag that starts inside text that can scroll never becomes a swipe (SBE-CRD-009).
- Buttons keep `manipulation`, exactly as the PRD says.

**Tap path:**

- Tap opens the preview and Confirm commits it.
- Swiping up on the preview also commits, so both play styles work everywhere.

**Mouse (D46):**

- A click is a tap. An upward drag with the button held commits with the same thresholds; a lost pointer capture counts as a cancelled drag.
- The drag is a bonus, not a requirement: click + Confirm and the keyboard do everything. SBE-CRD-012 plays a whole scenario with the mouse only, including one drag.

**Tuning:**

- All thresholds are in `constants.ts`.
- On the second device check (phase 9) I adjust them using the real phones, and I tell the architect about every value I change, because SBE-CRD-005 asserts the current numbers.

**Measuring:**

- A Chrome DevTools performance trace on the Android phone during swipe, card flight and meter movement: no long tasks and no dropped frames.
- SBE-PRF-005 is checked in CI.

Covers SBE-CRD-001…010 and 012, SBE-LAY-\* except LAY-007, SBE-LCK-002…004, SBE-MTR-\*.

### Phase 7: Remaining screens and languages (step 6, continued)

- Screens in this order: Debrief, Home (sorted by persona), Settings, Stats, Onboarding, HowTo, and the dialogs (resume, leave, update).
- `src/i18n`:
  - `hu.ts` holds the reference set of keys; `en.ts` and `de.ts` must match it, checked by TypeScript.
  - `t()`, `pick()`, `fmtNumber()` and `detectLocale()` are pure helpers.
  - `<html lang>` follows the chosen language.
- Each German screen is checked at 375 px width for text spilling outside its box (SBE-I18-011).
- Covers SBE-DUI-\*, SBE-NAV-\*, SBE-SET-\*, SBE-I18-\*.

### Phase 8: Accessibility, then PWA and offline (steps 8–9)

- **Accessibility:**
  - Screen-reader announcements: the full NPC statement at once (not letter by letter), and outcomes announced with priority.
  - Focus moves with the game phase, and every action works from the keyboard, so a whole scenario can be played without a mouse (SBE-CRD-011).
  - Key hints on cards and buttons, shown only with a fine pointer (SBE-LAY-007).
  - Colour contrast is checked in both dark and light mode, with a CI check (SBE-A11-008).
  - An automated axe check runs on every screen in all three languages.
- **PWA:** manifest, icons (an SVG master exported to PNG), Workbox precache, an update toast that waits until the player leaves the Game screen, and the offline test. The `pwa` job gets its remaining checks: precache completeness in `check-bundle-size.ts`, the full offline run with a stored result, and the update flow with a second build (`dist-next`) that must keep stored results.
- Covers SBE-A11-\*, SBE-PWA-\*, SBE-SEC-\*, SBE-CRD-011, SBE-LAY-007.

### Phase 9: Hardening and gates (step 11)

- Every remaining E2E test, in Hungarian across the full suite, plus the `@i18n` set in English and German.
- The `@desktop` set on desktop Chromium and desktop Firefox at 1280×800 and 1920×1080.
- `memory.spec.ts` with 10 runs, the bundle size gate, the start-time check and the console-error check (SBE-PRF-003).
- **Flaky-test rule:** a flaky test is a bug. No automatic retries in CI except Playwright's single retry for E2E, and every retry gets reported.
- **Device check 2:** the full checklist from 24.4 on the low-end Android phone, the other Android phone, the Android tablet (both orientations) and the Windows laptops (Chrome, Edge, Firefox at two resolutions), with TalkBack and NVDA. Then the threshold tuning from phase 6, and fixes.

### Phase 10: Translation review and release (steps 10 and 12)

- I review all English and German content and UI text. To make that manageable I'll generate a side-by-side table (HU | EN | DE for every field, scenario texts and UI strings) from the JSON files and `src/i18n`. I record the review in `docs/translation-review-<date>.md`, as DoD 13 requires.
- **Any content fix raises `contentVersion`** in both the scenario file and the catalog. The validator enforces that they match, and a saved run from the old version gets discarded.
- After my review the golden playthroughs must still pass. Text fixes never touch ids, deltas or the graph.
- Final device test record in `docs/device-test-<date>.md`, including the note that iOS is not verified on a device (D47), a check against the DoD table, tag the version, release.

## 3. Testing strategy in short

| Level | Tool | What | Share |
|---|---|---|---|
| unit | Vitest, fake clock | engine, storage, telemetry, controller, i18n, validator | about 70% of the `@SBE` ids |
| component | Vitest, `@testing-library/preact`, jsdom | input lock, focus, live regions, meters, layout classes | about 15% |
| e2e | Playwright: Chromium mobile in HU/EN/DE, WebKit iPhone SE, desktop Chromium and Firefox at 1280×800 and 1920×1080 (`@desktop`) | FR-01…05, offline, resume, accessibility, memory, start time, CSP, keyboard-only and mouse-only play | about 15% |
| ci | validator, bundle and precache gate, manifest check, PWA checks (`pwa` job), coverage, spec coverage | gates | — |
| manual | 2 Android phones, Android tablet, Windows laptops | feel of the vibrations, install, offline cold start, update, screen readers (TalkBack, NVDA), display cutout, desktop layout at two resolutions | the checklist |

- **Determinism:** E2E tests use `?seed=` and `?fastReveal=1`. Only the FR-02 and swipe timing tests run with real animations.
- **Recorders:** vibration and audio calls are captured by recorders injected with `addInitScript`, and tests check the recorded patterns, not timing luck.

## 4. Workflow

- **Branches:** `feature/<area>` (example: `feature/engine-fsm`). Each pull request lists the `@SBE` ids it closes.
- **Commits:** short subject lines, no attribution lines, as in the house style.
- **Architect review:** the architect reviews PRs that touch Sections 6, 9, 11 or 12, which is the contract.
- **Deviations:** a deviation found during work (as A1–A13 were) goes into a running list. The architect gets it once a week, or at once if it blocks work. Questions for the PO are batched and only sent when the PRD can't answer them.

## 5. Risks and countermeasures

| Risk | Countermeasure |
|---|---|
| Chrome changes its install criteria and the `pwa` job turns red | It uses Chrome's own `Page.getInstallabilityErrors`, so a red job names the exact criterion. Fix the app, not the check |
| Start time ≤ 1.2 s on the throttled first load is tight | Measure the baseline in phase 0, check on every PR, keep the initial JS below 60 KB, load scenario files only when opened |
| iOS Safari is not verified on a device (no iPhone, no Mac) | Accepted (D47). The cheap iOS measures stay: audio unlocked on the first touch or key press, freeze on both `visibilitychange` and `pagehide`, silent vibration fallback, safe-area padding. The WebKit E2E project runs in CI as the only proxy. Every device record states the gap |
| Desktop: the layout breaks on a scaled laptop screen, or Firefox behaves differently | The `@desktop` set runs on Chromium and Firefox at two sizes in CI; the device check covers 1366×768 and 1920×1080 with 125–150 % scaling |
| Swipe vs. scroll vs. the Android back gesture | Gesture rules from 16.3, a drag counts only for vertical movement, device check in phase 5 before the UI grows |
| GitHub Pages caches for a few minutes | Accepted (D45). The service worker handles updates; release notes mention up to roughly 10 minutes of delay |
| Saved runs going out of step with the engine after a code change | Replay tests on golden event logs. Any engine change that alters a hand or metric means updating the golden values together with the architect |
| Memory test flakiness | Force garbage collection through the Chrome DevTools protocol before measuring, use the median of 3 samples |

## 6. Order and dependencies

```
P0 ─► P1 ─► P2 ─► P3 ─► P4 ─► P5 ─► P6 ─► P7 ─► P8 ─► P9 ─► P10
                   └── i18n helpers and icon work can run alongside P3–P5
```

The longest chain runs through the engine (P2), the controller (P4) and the Game screen (P5/P6). The translation review (P10) can start as soon as phase 1 has loaded the content, so I'll do my HU/EN/DE review alongside phases 2–6, and it won't hold up the release.
