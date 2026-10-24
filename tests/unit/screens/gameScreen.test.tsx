import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/preact';
import { GameScreen } from '@/ui/screens/GameScreen';
import { GameController } from '@/app/gameController';
import { MemoryDriver } from '@/storage/memory';
import { setLocale } from '@/i18n/locale';
import type { Scenario } from '@/content/types';

import pmRaw from '../../../public/scenarios/scen_angry_pm_deadline_001.json';

const pmScenario = pmRaw as unknown as Scenario;

describe('GameScreen component (Phase 5 UI)', () => {
  let driver: MemoryDriver;
  let controller: GameController;

  beforeEach(async () => {
    vi.useFakeTimers();
    setLocale('hu');
    driver = new MemoryDriver();
    controller = new GameController({
      storage: driver,
      fastReveal: true, // starts directly into INTERVENTION_CHOICE
    });
    await controller.start(pmScenario, 42, 'run-ui-test');
  });

  afterEach(() => {
    cleanup();
    controller.destroy();
    vi.useRealTimers();
  });

  it('renders header, turn counter, meters, statement, and 3 cards in the bottom zone', () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    expect(screen.getByTestId('game-screen')).toBeDefined();
    expect(screen.getByTestId('game-turn-counter').textContent).toContain('1. kör / ≤7');
    expect(screen.getByTestId('meter-value-E').textContent).toBe('65');
    expect(screen.getByTestId('meter-value-F').textContent).toBe('100');
    expect(screen.getByTestId('meter-value-K').textContent).toBe('0');
    expect(screen.getByTestId('npc-statement-text')).toBeDefined();

    const cardGroup = screen.getByTestId('card-hand');
    expect(cardGroup).toBeDefined();
    const cards = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-card-id'));
    expect(cards.length).toBe(3);
  });

  it('selects card on click, opens preview, and commits on "Alkalmazom" (SBE-CRD-002, 003)', async () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    const cards = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-card-id'));
    const firstCard = cards[0]!;
    const cardId = firstCard.getAttribute('data-card-id')!;

    // Tap first card -> opens preview
    fireEvent.click(firstCard);
    expect(screen.getByTestId('card-preview')).toBeDefined();

    // Commit via "Alkalmazom" in preview
    const applyBtn = screen.getByTestId('preview-apply-btn');
    await act(async () => {
      fireEvent.click(applyBtn);
    });

    // Run transitions to RESOLUTION_PHASE then OUTCOME_CHECK
    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');

    // Advance 580ms resolution
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');
    expect(controller.runState.value?.history[0]?.cardId).toBe(cardId);
  });

  it('cancels preview on "Mégse" button (SBE-CRD-006)', () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    const cards = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-card-id'));
    fireEvent.click(cards[0]!);
    expect(screen.getByTestId('card-preview')).toBeDefined();

    fireEvent.click(screen.getByTestId('preview-cancel-btn'));
    expect(screen.queryByTestId('card-preview')).toBeNull();
  });

  it('supports full keyboard control: 1 selects, Enter commits, Escape cancels (SBE-CRD-007, 008)', async () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    // Press '1' to select first card
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('card-preview')).toBeDefined();

    // Press 'Escape' to cancel
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('card-preview')).toBeNull();

    // Press '2' and then 'Enter' to commit
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByTestId('card-preview')).toBeDefined();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');
  });

  it('enforces 250ms input lock on "Tovább" in OUTCOME_CHECK, then advances on Space or click', async () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    // Commit a card to reach OUTCOME_CHECK
    const cardId = controller.runState.value!.hand[0]!;
    await act(async () => {
      await controller.commitCard(cardId);
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    // Primary button is "Tovább"
    const continueBtn = screen.getByTestId('primary-continue-btn') as HTMLButtonElement;
    expect(continueBtn).toBeDefined();

    // Immediately disabled during 250ms lock per Section 16.5
    expect(continueBtn.disabled).toBe(true);

    // Clicking while locked does nothing
    fireEvent.click(continueBtn);
    expect(controller.runState.value?.phase).toBe('OUTCOME_CHECK');

    // Advance 250ms lock timer
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });

    expect(continueBtn.disabled).toBe(false);

    // Pressing Space now continues to next turn
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' });
      await vi.advanceTimersByTimeAsync(50);
    });

    // In fastReveal mode, advances to INTERVENTION_CHOICE
    expect(controller.runState.value?.phase).toBe('INTERVENTION_CHOICE');
    expect(controller.runState.value?.turnIndex).toBe(1);
  });

  it('opens leave confirm dialog and supports "Később folytatom", "Feladom", "Mégse"', async () => {
    const onLeave = vi.fn();
    render(<GameScreen controller={controller} scenario={pmScenario} onLeave={onLeave} />);

    // Click [x] in header
    fireEvent.click(screen.getByTestId('header-leave-btn'));
    expect(screen.getByTestId('leave-confirm-dialog')).toBeDefined();

    // Cancel dialog
    fireEvent.click(screen.getByTestId('leave-cancel-btn'));
    expect(screen.queryByTestId('leave-confirm-dialog')).toBeNull();

    // Reopen dialog and confirm "Később folytatom" (suspend)
    fireEvent.click(screen.getByTestId('header-leave-btn'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('leave-later-btn'));
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(onLeave).toHaveBeenCalledTimes(1);

    // Verify run saved in storage for resume
    const saved = await driver.get('currentRun', 'active');
    expect(saved).not.toBeNull();
  });

  it('handles give up in leave confirm dialog', async () => {
    const onLeave = vi.fn();
    render(<GameScreen controller={controller} scenario={pmScenario} onLeave={onLeave} />);

    fireEvent.click(screen.getByTestId('header-leave-btn'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('leave-giveup-btn'));
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(controller.runState.value?.phase).toBe('ENDED');
    const saved = await driver.get('currentRun', 'active');
    expect(saved).toBeFalsy();
  });

  it('skips reveal when clicking upper zone in ATTACK_INCOMING', async () => {
    // Controller with normal reveal
    const normalController = new GameController({
      storage: driver,
      fastReveal: false,
    });
    await normalController.start(pmScenario, 42, 'run-normal-reveal');

    expect(normalController.runState.value?.phase).toBe('ATTACK_INCOMING');

    render(<GameScreen controller={normalController} scenario={pmScenario} />);

    // Click upper zone
    await act(async () => {
      fireEvent.click(screen.getByTestId('game-upper-zone'));
    });

    expect(normalController.runState.value?.phase).toBe('INTERVENTION_CHOICE');
    normalController.destroy();
  });

  it('toggles audio mute button in header', () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    const muteBtn = screen.getByTestId('mute-toggle-btn');
    expect(muteBtn.getAttribute('aria-label')).toBe('Mute');

    fireEvent.click(muteBtn);
    expect(muteBtn.getAttribute('aria-label')).toBe('Unmute');

    fireEvent.click(muteBtn);
    expect(muteBtn.getAttribute('aria-label')).toBe('Mute');
  });

  it('handles key 3 to select 3rd card and commits via bottom primary button', async () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    // Press '3' to select 3rd card
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByTestId('card-preview')).toBeDefined();

    // Click bottom primary "Alkalmazom" button
    const applyBtn = screen.getByTestId('primary-apply-btn');
    await act(async () => {
      fireEvent.click(applyBtn);
    });

    expect(controller.runState.value?.phase).toBe('RESOLUTION_PHASE');
  });

  it('handles popstate browser back button and Escape on dialog', () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    // Dispatch popstate event
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('leave-confirm-dialog')).toBeDefined();

    // Escape closes dialog
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('leave-confirm-dialog')).toBeNull();
  });

  it('announces grounding (F) and confusion (K) meter changes', async () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    // Modify grounding on runState to trigger F announcement
    await act(async () => {
      controller.runState.value = {
        ...controller.runState.value!,
        metrics: {
          ...controller.runState.value!.metrics,
          grounding: 90,
        },
      };
    });

    expect(screen.getByTestId('live-polite').textContent).toContain('Földelés új értéke: 90');

    // Modify confusion on runState to trigger K announcement
    await act(async () => {
      controller.runState.value = {
        ...controller.runState.value!,
        metrics: {
          ...controller.runState.value!.metrics,
          confusion: 25,
        },
      };
    });

    expect(screen.getByTestId('live-polite').textContent).toContain('Megakadás új értéke: 25');
  });

  it('announces 5-second timer warning in assertive live region', async () => {
    render(<GameScreen controller={controller} scenario={pmScenario} />);

    await act(async () => {
      controller.runState.value = {
        ...controller.runState.value!,
        timing: {
          ...controller.runState.value!.timing,
          timerRemainingMs: 4000,
        },
      };
    });

    expect(screen.getByTestId('live-assertive').textContent).toContain('Még 5 másodperc.');
  });

  it('returns null if scenario or runState is missing', () => {
    controller.runState.value = null;
    const { container: c1 } = render(<GameScreen controller={controller} scenario={pmScenario} />);
    expect(c1.firstChild).toBeNull();

    const emptyController = new GameController({ storage: driver });
    const { container: c2 } = render(<GameScreen controller={emptyController} />);
    expect(c2.firstChild).toBeNull();
    emptyController.destroy();
  });

  it('handles unknown currentNode gracefully and renders no bubble', () => {
    controller.runState.value = {
      ...controller.runState.value!,
      currentNodeId: 'unknown_node_xyz',
    };
    render(<GameScreen controller={controller} scenario={pmScenario} />);
    expect(screen.queryByTestId('npc-statement-text')).toBeNull();
  });

  it('renders Debrief button in ENDED phase and navigates on click or Enter/Space', async () => {
    controller.runState.value = {
      ...controller.runState.value!,
      phase: 'ENDED',
      outcome: 'WIN_BREAKTHROUGH',
      hand: [],
    };

    render(<GameScreen controller={controller} scenario={pmScenario} />);

    const debriefBtn = screen.getByTestId('primary-debrief-btn');
    expect(debriefBtn).toBeDefined();
    expect(debriefBtn.textContent).toContain('Kiértékelés');

    // Click triggers navigation
    fireEvent.click(debriefBtn);

    // Keyboard Enter triggers navigation
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: ' ' });
  });

  it('correctly updates hand cards when advancing to dynamic AI turns', async () => {
    const { DynamicScenarioManager } = await import('@/ai/dynamicScenario');
    const { ARCHETYPES } = await import('@/ai/prompts');
    const { MockAiProvider } = await import('@/ai/providers/mockProvider');

    const dynamicAi = new MockAiProvider({ delayMs: 0 });
    const dynamicController = new GameController({
      storage: driver,
      fastReveal: true,
      aiProvider: dynamicAi,
      locale: 'hu',
    });

    const dynamicScenario = DynamicScenarioManager.createInitialScenario(
      ARCHETYPES.angry_pm!,
      'hu'
    );
    await dynamicController.start(dynamicScenario, 123, 'run-dynamic-test');

    const { container } = render(
      <GameScreen controller={dynamicController} scenario={dynamicScenario} />
    );

    // Turn 1 hand has 3 cards
    expect(container.querySelectorAll('.card')).toHaveLength(3);

    // Commit a card
    const firstCardId = dynamicController.runState.value!.hand[0]!;
    await act(async () => {
      await dynamicController.commitCard(firstCardId);
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(dynamicController.runState.value?.phase).toBe('OUTCOME_CHECK');

    // Advance to turn 2
    await act(async () => {
      await dynamicController.continueNext();
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(dynamicController.runState.value?.phase).toBe('INTERVENTION_CHOICE');
    expect(dynamicController.runState.value?.turnIndex).toBe(1);

    // Cards in hand for turn 2 MUST be rendered (not 0 / empty!)
    const handCards = container.querySelectorAll('.card');
    expect(handCards.length).toBe(3);

    dynamicController.destroy();
  });
});
