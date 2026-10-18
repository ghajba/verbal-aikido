import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameController } from '@/app/gameController';
import { VisibleClock } from '@/app/clock';
import { MemoryDriver } from '@/storage/memory';
import { TelemetryBuffer } from '@/telemetry/buffer';
import type { Scenario } from '@/content/types';
import type { PersistedRun } from '@/storage/types';

import pmRaw from '../../public/scenarios/scen_angry_pm_deadline_001.json';
import gaslightRaw from '../../public/scenarios/scen_customer_gaslight_004.json';
import scopeRaw from '../../public/scenarios/scen_stakeholder_scope_002.json';

const pmScenario = pmRaw as unknown as Scenario;
const gaslightScenario = gaslightRaw as unknown as Scenario;
const scopeScenario = scopeRaw as unknown as Scenario;

describe('GameController (Phase 4)', () => {
  let driver: MemoryDriver;
  let telemetry: TelemetryBuffer;
  let audioMock: ReturnType<typeof vi.fn>;
  let hapticsMock: ReturnType<typeof vi.fn>;
  let announceMock: ReturnType<typeof vi.fn>;
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    driver = new MemoryDriver();
    telemetry = new TelemetryBuffer(driver);
    audioMock = vi.fn();
    hapticsMock = vi.fn();
    announceMock = vi.fn();
    navigateMock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts scenario in ATTACK_INCOMING and transitions to INTERVENTION_CHOICE with fastReveal', async () => {
    let mockWallMs = 0;
    const clock = new VisibleClock(() => mockWallMs, 0);

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(pmScenario, 42, 'run-1');

    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');
    expect(controller.runState.value?.hand.length).toBe(3);
    expect(controller.isTransitioning.value).toBe(false);
    expect(audioMock).toHaveBeenCalledWith('TONE_CUE');

    // Confirm saved to storage
    const saved = await driver.get<PersistedRun>('currentRun', 'active');
    expect(saved).toBeDefined();
    expect(saved?.runId).toBe('run-1');

    controller.destroy();
  });

  it('SBE-LCK-001 & SBE-LCK-002: Commits card, locks input, and ignores second commit during resolution', async () => {
    let mockWallMs = 0;
    const clock = new VisibleClock(() => mockWallMs, 0);

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(pmScenario, 42, 'run-lock-test');
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    const firstCard = controller.runState.value!.hand[0]!;
    const secondCard = controller.runState.value!.hand[1]!;

    // First commit
    await controller.commitCard(firstCard);
    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');
    expect(controller.isTransitioning.value).toBe(true);

    // Second commit while in RESOLUTION_PHASE is ignored
    await controller.commitCard(secondCard);
    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');
    expect(controller.runState.value?.turnIndex).toBe(1);

    // After resolution timer completes
    await vi.advanceTimersByTimeAsync(600);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    controller.destroy();
  });

  it('SBE-TMR-001, SBE-TMR-002, SBE-TMR-003: Stress timer limits, warning, and timeout commit', async () => {
    const clock = new VisibleClock();

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    // gaslightScenario has decisionTimeLimitSec = 15
    await controller.start(gaslightScenario, 42, 'run-tmr-test');
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');
    expect(controller.runState.value?.timing.timerRemainingMs).toBe(15000);

    // Advance 10 seconds (10000 ms) -> 5000 ms remaining
    await vi.advanceTimersByTimeAsync(10000);

    // 5-second warning fired
    expect(audioMock).toHaveBeenCalledWith('TIMER_WARN');
    expect(hapticsMock).toHaveBeenCalledWith('TAP');
    expect(announceMock).toHaveBeenCalledWith('timer.fiveSeconds', true);

    // Advance another 5 seconds (5000 ms) -> 0 ms remaining -> auto-commit
    await vi.advanceTimersByTimeAsync(5000);

    expect(announceMock).toHaveBeenCalledWith('timer.expired', true);
    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');
    const lastTurn = controller.runState.value?.history[0];
    expect(lastTurn?.timedOut).toBe(true);

    controller.destroy();
  });

  it('SBE-TMR-005: Scenario without limit has null timer', async () => {
    let mockWallMs = 0;
    const clock = new VisibleClock(() => mockWallMs, 0);

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(pmScenario, 1, 'run-nolimit');
    expect(controller.runState.value?.timing.timerRemainingMs).toBeNull();

    controller.destroy();
  });

  it('SBE-VIS-002 & SBE-VIS-005: Hiding page sends final TICK and saves run', async () => {
    const clock = new VisibleClock();

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(gaslightScenario, 42, 'run-hide-test');
    await vi.advanceTimersByTimeAsync(6000);
    clock.pause(); // simulates hiding
    await vi.advanceTimersByTimeAsync(0);

    const saved = await driver.get<PersistedRun>('currentRun', 'active');
    expect(saved).toBeDefined();
    expect(saved?.timing.visibleMsTotal).toBe(6000);
    expect(saved?.timing.timerRemainingMs).toBe(9000); // 15000 - 6000

    controller.destroy();
  });

  it('SBE-VIS-006: Suspend freezes run and navigates home', async () => {
    const clock = new VisibleClock();

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(gaslightScenario, 42, 'run-suspend-test');
    await vi.advanceTimersByTimeAsync(4000);

    await controller.suspend();
    expect(clock.isPaused()).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith('home');

    const saved = await driver.get<PersistedRun>('currentRun', 'active');
    expect(saved?.timing.visibleMsTotal).toBe(4000);

    controller.destroy();
  });

  it('abandon deletes currentRun and navigates home', async () => {
    const clock = new VisibleClock();

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(pmScenario, 42, 'run-abandon-test');
    expect(await driver.get('currentRun', 'active')).toBeDefined();

    await controller.abandon();
    expect(controller.runState.value?.phase).toBe('ENDED');
    expect(controller.runState.value?.outcome).toBeNull();
    expect(await driver.get('currentRun', 'active')).toBeUndefined();
    expect(navigateMock).toHaveBeenCalledWith('home');

    controller.destroy();
  });

  it('SBE-PER-007: Resume discards run if contentVersion differs', async () => {
    const controller = new GameController({
      storage: driver,
      telemetry,
    });

    const oldPersisted: PersistedRun = {
      runId: 'old-run',
      scenarioId: pmScenario.id,
      contentVersion: 999, // Mismatch!
      seed: 42,
      startedAt: '2026-10-18T00:00:00.000Z',
      events: [],
      timing: {
        visibleMsTotal: 1000,
        panicMsTotal: 0,
        inPanic: false,
        panicEpisodeStartMs: null,
        completedEpisodesMs: [],
        choiceEnteredAtMs: null,
        timerRemainingMs: null,
        lastEventMs: 1000,
      },
      savedAt: '2026-10-18T00:00:01.000Z',
    };
    await driver.put('currentRun', 'active', oldPersisted);

    const resumed = await controller.resume(pmScenario, oldPersisted);
    expect(resumed).toBe(false);
    expect(await driver.get('currentRun', 'active')).toBeUndefined();

    controller.destroy();
  });

  it('SBE-PER-005 & SBE-PER-006: Resume restores timing and handles choices cleanly', async () => {
    let mockWallMs = 0;
    const clock = new VisibleClock(() => mockWallMs, 0);

    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(pmScenario, 42, 'run-resume-choice');
    const hand = controller.runState.value!.hand;
    mockWallMs = 2000;
    await controller.commitCard(hand[0]!);

    const saved = (await driver.get<PersistedRun>('currentRun', 'active'))!;
    expect(saved).toBeDefined();

    // Now resume from saved state
    const newController = new GameController({
      storage: driver,
      telemetry,
      fastReveal: true,
    });

    const success = await newController.resume(pmScenario, saved);
    expect(success).toBe(true);
    expect(newController.runState.value?.timing.visibleMsTotal).toBe(2000);

    controller.destroy();
    newController.destroy();
  });

  it('runs statement reveal timer when fastReveal is false', async () => {
    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: false, // real reveal timer
      audio: audioMock,
      announce: announceMock,
    });

    await controller.start(pmScenario, 42, 'run-reveal-test');
    expect(controller.runState.value?.phase).toBe('ATTACK_INCOMING');

    // Advance 2 seconds for reveal to complete
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    controller.destroy();
  });

  it('plays through to WIN and handles outcome feedback and debrief navigation', async () => {
    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(gaslightScenario, 2, 'run-win-test');

    // Turn 1: commit META_MODEL card (c_g_meta_01)
    await controller.commitCard('c_g_meta_01');
    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');
    await vi.advanceTimersByTimeAsync(600);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    // Continue to Turn 2
    await controller.continueNext();
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Turn 2: commit c_g_meta_02
    await controller.commitCard('c_g_meta_02');
    await vi.advanceTimersByTimeAsync(600);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    // Continue to Turn 3
    await controller.continueNext();
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Turn 3: commit c_g_meta_04 -> K reaches 80 -> WIN_BREAKTHROUGH!
    await controller.commitCard('c_g_meta_04');
    await vi.advanceTimersByTimeAsync(600); // resolution finishes

    // FINALIZE is dispatched immediately
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.runState.value?.phase).toBe('ENDED');
    expect(controller.runState.value?.outcome).toBe('WIN_BREAKTHROUGH');

    // Outcome feedback after 300 ms
    await vi.advanceTimersByTimeAsync(350);
    expect(hapticsMock).toHaveBeenCalledWith('BREAKTHROUGH');
    expect(audioMock).toHaveBeenCalledWith('WIN');
    expect(navigateMock).toHaveBeenCalledWith('debrief', 'run-win-test');

    controller.destroy();
  });

  it('handles unfreezing during ATTACK_INCOMING and INTERVENTION_CHOICE', async () => {
    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: false,
    });

    // Start in ATTACK_INCOMING
    await controller.start(pmScenario, 42, 'run-unfreeze');
    expect(controller.runState.value?.phase).toBe('ATTACK_INCOMING');

    // Pause then resume in ATTACK_INCOMING
    clock.pause();
    clock.resume();
    expect(clock.isPaused()).toBe(false);

    // Complete reveal to reach INTERVENTION_CHOICE
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Pause then resume in INTERVENTION_CHOICE
    clock.pause();
    clock.resume();
    expect(clock.isPaused()).toBe(false);

    controller.destroy();
  });

  it('guards ignore invalid actions during wrong phases or with invalid cards', async () => {
    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
    });

    await controller.start(pmScenario, 42, 'run-guard-test');

    // Commit invalid card ID not in hand
    await controller.commitCard('c_nonexistent_card');
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Continue when not in OUTCOME_CHECK
    await controller.continueNext();
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Abandon
    await controller.abandon();
    expect(controller.runState.value?.phase).toBe('ENDED');

    // Suspend after ENDED is ignored
    await controller.suspend();
    // Abandon after ENDED is ignored
    await controller.abandon();

    controller.destroy();
  });

  it('plays through to LOSS_RUPTURE and triggers reactive feedback', async () => {
    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(pmScenario, 42, 'run-loss-test');
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Commit counterattack card c_attack_01 -> triggers LOSS_RUPTURE
    await controller.commitCard('c_attack_01');
    expect(hapticsMock).toHaveBeenCalledWith('DAMAGE');
    expect(audioMock).toHaveBeenCalledWith('REACTIVE');

    await vi.advanceTimersByTimeAsync(600); // resolution done
    await vi.advanceTimersByTimeAsync(100); // finalize done

    expect(controller.runState.value?.phase).toBe('ENDED');
    expect(controller.runState.value?.outcome).toBe('LOSS_RUPTURE');

    // Wait for outcome feedback
    await vi.advanceTimersByTimeAsync(350);
    expect(hapticsMock).toHaveBeenCalledWith('DAMAGE');
    expect(audioMock).toHaveBeenCalledWith('LOSS');
    expect(navigateMock).toHaveBeenCalledWith('debrief', 'run-loss-test');

    controller.destroy();
  });

  it('handles freezing and unfreezing during RESOLUTION_PHASE', async () => {
    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: false,
    });

    await controller.start(pmScenario, 42, 'run-res-freeze');
    // Fast-forward statement reveal
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Commit card to enter RESOLUTION_PHASE
    await controller.commitCard('c_metamodel_01');
    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');

    // Freeze during resolution
    clock.pause();
    expect(clock.isPaused()).toBe(true);

    // Resume during resolution
    clock.resume();
    expect(clock.isPaused()).toBe(false);

    // Complete resolution timer
    await vi.advanceTimersByTimeAsync(600);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    controller.destroy();
  });

  it('resumes run in ATTACK_INCOMING phase and with 0 timerRemainingMs', async () => {
    // 1. Resuming run saved during ATTACK_INCOMING (only START event)
    const persistedIncoming: PersistedRun = {
      runId: 'res-incoming',
      scenarioId: pmScenario.id,
      contentVersion: pmScenario.contentVersion,
      seed: 42,
      startedAt: new Date().toISOString(),
      events: [
        {
          type: 'START',
          scenarioId: pmScenario.id,
          contentVersion: pmScenario.contentVersion,
          seed: 42,
          runId: 'res-incoming',
          nowMs: 0,
        },
      ],
      timing: {
        visibleMsTotal: 0,
        panicMsTotal: 0,
        inPanic: false,
        panicEpisodeStartMs: null,
        completedEpisodesMs: [],
        choiceEnteredAtMs: null,
        timerRemainingMs: null,
        lastEventMs: 0,
      },
      savedAt: new Date().toISOString(),
    };

    const clock1 = new VisibleClock();
    const controller1 = new GameController({
      storage: driver,
      telemetry,
      clock: clock1,
      fastReveal: true,
    });

    const ok1 = await controller1.resume(pmScenario, persistedIncoming);
    expect(ok1).toBe(true);
    expect(controller1.runState.value?.phase).toBe('INTERVENTION_CHOICE');
    controller1.destroy();

    // 2. Resuming run with timerRemainingMs === 0 triggers immediate expiry
    const persistedExpired: PersistedRun = {
      runId: 'res-expired',
      scenarioId: gaslightScenario.id,
      contentVersion: gaslightScenario.contentVersion,
      seed: 42,
      startedAt: new Date().toISOString(),
      events: [
        {
          type: 'START',
          scenarioId: gaslightScenario.id,
          contentVersion: gaslightScenario.contentVersion,
          seed: 42,
          runId: 'res-expired',
          nowMs: 0,
        },
        {
          type: 'REVEAL_DONE',
          nowMs: 500,
        },
      ],
      timing: {
        visibleMsTotal: 500,
        panicMsTotal: 0,
        inPanic: false,
        panicEpisodeStartMs: null,
        completedEpisodesMs: [],
        choiceEnteredAtMs: 500,
        timerRemainingMs: 0,
        lastEventMs: 500,
      },
      savedAt: new Date().toISOString(),
    };

    const clock2 = new VisibleClock();
    const controller2 = new GameController({
      storage: driver,
      telemetry,
      clock: clock2,
      fastReveal: true,
      announce: announceMock,
    });

    const ok2 = await controller2.resume(gaslightScenario, persistedExpired);
    expect(ok2).toBe(true);
    // Stress timer immediate expiry committed reactive card
    expect(announceMock).toHaveBeenCalledWith('timer.expired', true);
    expect(controller2.runState.value?.phase).toBe('RESOLUTION_PHASE');

    controller2.destroy();
  });

  it('triggers CONSTRUCTIVE and VALIDATION feedback for PACING cards', async () => {
    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
    });

    expect(controller.getClock()).toBe(clock);

    // Pause and resume before start (state is null) does nothing
    clock.pause();
    clock.resume();

    // Start with seed 2: hand is ['c_metamodel_01', 'c_pace_01', 'c_defense_01']
    await controller.start(pmScenario, 2, 'run-pacing');
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Commit PACING card
    await controller.commitCard('c_pace_01');
    expect(hapticsMock).toHaveBeenCalledWith('VALIDATION');
    expect(audioMock).toHaveBeenCalledWith('CONSTRUCTIVE');

    await vi.advanceTimersByTimeAsync(600);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    // Pause and resume after game ended does nothing
    await controller.abandon();
    expect(controller.runState.value?.phase).toBe('ENDED');
    clock.pause();
    clock.resume();

    controller.destroy();
  });

  it('handles zero remaining reveal time during unfreeze gracefully', async () => {
    let mockWallMs = 0;
    const clock = new VisibleClock(() => mockWallMs, 0);
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: false,
    });

    await controller.start(pmScenario, 42, 'run-zero-reveal');
    expect(controller.runState.value?.phase).toBe('ATTACK_INCOMING');

    // Advance clock past statement duration before pause
    mockWallMs = 2000;
    clock.pause();
    clock.resume();

    // Zero remaining triggers immediate REVEAL_DONE
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    controller.destroy();
  });

  it('handles REFRAMING card and TAP haptic feedback when deltaE > 0', async () => {
    const testScenario: Scenario = {
      ...pmScenario,
      nodes: [
        {
          ...pmScenario.nodes[0]!,
          availableCards: [
            {
              cardId: 'c_reframe_pos',
              category: 'REFRAMING',
              text: { hu: 'test', en: 'test', de: 'test' },
              delta: { escalation: 10, grounding: -5, confusion: 15 },
              nextNodeId: 'step_02_calmed',
              npcReaction: { hu: 'test', en: 'test', de: 'test' },
            },
            {
              cardId: 'c_meta_pos',
              category: 'META_MODEL',
              text: { hu: 'test', en: 'test', de: 'test' },
              delta: { escalation: 5, grounding: 0, confusion: 20 },
              nextNodeId: 'step_02_calmed',
              npcReaction: { hu: 'test', en: 'test', de: 'test' },
            },
            {
              cardId: 'c_def_test',
              category: 'DEFENSE',
              text: { hu: 'test', en: 'test', de: 'test' },
              delta: { escalation: 10, grounding: -10, confusion: 0 },
              nextNodeId: 'pm_escalated_crisis',
              npcReaction: { hu: 'test', en: 'test', de: 'test' },
            },
          ],
        },
      ],
    };

    const clock = new VisibleClock();
    const controller = new GameController({
      storage: driver,
      telemetry,
      clock,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
    });

    await controller.start(testScenario, 42, 'run-reframe-pos');
    await controller.commitCard('c_reframe_pos');

    // deltaE is +10 > 0 -> TAP haptic and CONSTRUCTIVE audio
    expect(hapticsMock).toHaveBeenCalledWith('TAP');
    expect(audioMock).toHaveBeenCalledWith('CONSTRUCTIVE');

    // Clear tick loop branch when ENDED
    await controller.abandon();
    // Simulate tick interval execution while ENDED
    (controller as any).startTickLoop();
    await vi.advanceTimersByTimeAsync(300);

    // Dispatch without scenario does nothing
    (controller as any).scenario = null;
    await (controller as any).dispatch({ type: 'TICK', nowMs: 0 });

    // Outcome feedback for neutral end (neither WIN nor LOSS)
    (controller as any).triggerOutcomeFeedback('END_DEESCALATED');

    controller.destroy();
  });

  it('supports getScenario and skipReveal during ATTACK_INCOMING', async () => {
    const controller = new GameController({
      storage: driver,
      telemetry,
      fastReveal: false, // will stay in ATTACK_INCOMING until reveal completes
    });

    expect(controller.getScenario()).toBeNull();

    await controller.start(pmScenario, 42, 'run-skip-reveal');
    expect(controller.getScenario()).toBe(pmScenario);
    expect(controller.runState.value?.phase).toBe('ATTACK_INCOMING');

    // Skip reveal immediately
    await controller.skipReveal();
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Calling skipReveal when not in ATTACK_INCOMING is a no-op
    await controller.skipReveal();
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');

    // Dispatch an ignored transition event (nextState === prevState)
    const beforeState = controller.runState.value;
    await (controller as any).dispatch({ type: 'ADVANCE_OUTCOME', nowMs: 1234 });
    expect(controller.runState.value).toBe(beforeState);

    controller.destroy();
  });

  it('clears active reveal timeout when armRevealTimer is called again', async () => {
    const controller = new GameController({
      storage: driver,
      telemetry,
      fastReveal: false,
    });

    await controller.start(pmScenario, 42, 'run-rearm-test');
    expect((controller as any).revealTimeoutId).not.toBeNull();

    // Re-arm while active
    await (controller as any).armRevealTimer();
    expect((controller as any).revealTimeoutId).not.toBeNull();

    controller.destroy();
  });

  it('navigates to debrief when Scenario 2 reaches WIN_BREAKTHROUGH at node s2_03_options', async () => {
    const controller = new GameController({
      storage: driver,
      telemetry,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(scopeScenario, 42, 'run-scope-win');
    expect(controller.runState.value?.currentNodeId).toBe('s2_01');

    // Turn 1: commit constructive card -> moves to s2_02_open
    const card1 =
      controller.runState.value!.hand.find((id) => !id.includes('att') && !id.includes('def')) ||
      controller.runState.value!.hand[0]!;
    await controller.commitCard(card1);
    await vi.advanceTimersByTimeAsync(600);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');
    await controller.continueNext();

    // Turn 2: commit constructive card -> moves to s2_03_options
    const card2 =
      controller.runState.value!.hand.find((id) => !id.includes('att') && !id.includes('def')) ||
      controller.runState.value!.hand[0]!;
    await controller.commitCard(card2);
    await vi.advanceTimersByTimeAsync(600);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');
    await controller.continueNext();

    // Turn 3: at s2_03_options, ensure confusion reaches >= 80 on constructive card
    expect(controller.runState.value?.currentNodeId).toBe('s2_03_options');
    controller.runState.value!.metrics.confusion = 75;
    const card3 =
      controller.runState.value!.hand.find(
        (id) => id.includes('meta') || id.includes('pace') || id.includes('reframe')
      ) || controller.runState.value!.hand[0]!;
    await controller.commitCard(card3);
    await vi.advanceTimersByTimeAsync(600); // resolution finishes

    // FINALIZE is dispatched immediately
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.runState.value?.phase).toBe('ENDED');
    expect(controller.runState.value?.outcome).toBe('WIN_BREAKTHROUGH');

    await vi.advanceTimersByTimeAsync(350);
    expect(hapticsMock).toHaveBeenCalledWith('BREAKTHROUGH');
    expect(audioMock).toHaveBeenCalledWith('WIN');
    expect(navigateMock).toHaveBeenCalledWith('debrief', 'run-scope-win');

    controller.destroy();
  });

  it('ensures debrief navigation occurs even if storage finishRun throws an error', async () => {
    const failingDriver = new MemoryDriver();
    failingDriver.finishRun = vi.fn().mockRejectedValue(new Error('IndexedDB transaction aborted'));

    const controller = new GameController({
      storage: failingDriver,
      telemetry,
      fastReveal: true,
      audio: audioMock,
      haptics: hapticsMock,
      announce: announceMock,
      onNavigate: navigateMock,
    });

    await controller.start(gaslightScenario, 2, 'run-failing-storage');
    // Turn 1: commit card
    await controller.commitCard('c_g_meta_01');
    await vi.advanceTimersByTimeAsync(600);
    await controller.continueNext();

    // Turn 2: commit card
    await controller.commitCard('c_g_meta_02');
    await vi.advanceTimersByTimeAsync(600);
    await controller.continueNext();

    // Turn 3: commit c_g_meta_04 -> WIN_BREAKTHROUGH
    await controller.commitCard('c_g_meta_04');
    await vi.advanceTimersByTimeAsync(600); // resolution finishes
    await vi.advanceTimersByTimeAsync(100); // finalize
    await vi.advanceTimersByTimeAsync(350); // outcome feedback & navigation

    // Verify that despite storage failure, navigation to debrief still triggered
    expect(navigateMock).toHaveBeenCalledWith('debrief', 'run-failing-storage');

    controller.destroy();
  });
});
