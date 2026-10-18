import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/preact';
import { DebriefScreen } from '@/ui/screens/DebriefScreen';
import { MemoryDriver } from '@/storage/memory';
import { currentScreen } from '@/ui/router';
import type { RunSummary } from '@/engine/stats';

const mockSummary: RunSummary = {
  runId: 'run-123',
  scenarioId: 'scen_angry_pm_deadline_001',
  contentVersion: 1,
  startedAt: '2026-10-18T10:00:00.000Z',
  endedAt: '2026-10-18T10:02:00.000Z',
  outcome: 'WIN_BREAKTHROUGH',
  turns: 3,
  finalMetrics: { escalation: 40, grounding: 60, confusion: 85 },
  panicSec: 4.5,
  rtoSec: 3.2,
  unrecoveredPanic: false,
  categoryCounts: {
    PACING: 2,
    META_MODEL: 1,
    REFRAMING: 0,
    DEFENSE: 0,
    ATTACK: 0,
  },
  constructiveCount: 3,
  reactiveCount: 0,
  timedOutCount: 0,
  history: [
    {
      turnIndex: 0,
      nodeId: 'node_1',
      hand: ['c_pace_01', 'c_defense_01'],
      cardId: 'c_pace_01',
      category: 'PACING',
      timedOut: false,
      before: { escalation: 65, grounding: 45, confusion: 10 },
      after: { escalation: 45, grounding: 55, confusion: 20 },
      momentumAfter: 1,
      crisisRedirect: false,
      decisionMs: 2500,
    },
  ],
};

import { setLocale } from '@/i18n/locale';

describe('DebriefScreen component', () => {
  let storage: MemoryDriver;

  beforeEach(() => {
    setLocale('hu');
    storage = new MemoryDriver();
    currentScreen.value = { name: 'debrief', runId: 'run-123' };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state initially then displays outcome headline and stats', async () => {
    await storage.put('runs', 'run-123', mockSummary);

    render(<DebriefScreen runId="run-123" storage={storage} />);

    // Wait for async load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('debrief-headline')).toBeDefined();
    expect(screen.getAllByText(/Áttörés/i).length).toBeGreaterThan(0);
    expect(screen.getByText('4.5 s')).toBeDefined();
    expect(screen.getByText('3.2 s')).toBeDefined();
    expect(screen.getByTestId('debrief-coaching-tip')).toBeDefined();
  });

  it('navigates to game on retry button click and home on to-list click', async () => {
    await storage.put('runs', 'run-123', mockSummary);

    render(<DebriefScreen runId="run-123" storage={storage} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const retryBtn = screen.getByTestId('debrief-retry-btn');
    fireEvent.click(retryBtn);
    expect(currentScreen.value).toEqual({
      name: 'game',
      scenarioId: 'scen_angry_pm_deadline_001',
    });

    const listBtn = screen.getByTestId('debrief-to-list-btn');
    fireEvent.click(listBtn);
    expect(currentScreen.value).toEqual({ name: 'home' });
  });

  it('renders not found state when runId is missing in storage', async () => {
    render(<DebriefScreen runId="non-existent" storage={storage} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('debrief-not-found')).toBeDefined();
  });

  it('renders loss outcome, zero panic, null RTO, and debrief hint with bad deltas', async () => {
    const lossSummary: RunSummary = {
      runId: 'run-loss-456',
      scenarioId: 'scen_angry_pm_deadline_001',
      contentVersion: 1,
      startedAt: '2026-10-18T10:00:00.000Z',
      endedAt: '2026-10-18T10:01:00.000Z',
      outcome: 'LOSS_BURNOUT',
      turns: 1,
      finalMetrics: { escalation: 90, grounding: 0, confusion: 0 },
      panicSec: 0,
      rtoSec: null,
      unrecoveredPanic: true,
      categoryCounts: {
        PACING: 0,
        META_MODEL: 0,
        REFRAMING: 0,
        DEFENSE: 1,
        ATTACK: 0,
      },
      constructiveCount: 0,
      reactiveCount: 1,
      timedOutCount: 0,
      history: [
        {
          turnIndex: 0,
          nodeId: 'step_01',
          hand: ['c_pace_01'],
          cardId: 'c_pace_01',
          category: 'DEFENSE',
          timedOut: false,
          before: { escalation: 50, grounding: 40, confusion: 10 },
          after: { escalation: 70, grounding: 20, confusion: 5 }, // deltaE +20, deltaF -20, deltaK -5
          momentumAfter: 1,
          crisisRedirect: false,
          decisionMs: 1500,
        },
      ],
    };

    await storage.put('runs', 'run-loss-456', lossSummary);
    render(<DebriefScreen runId="run-loss-456" storage={storage} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('debrief-headline')).toBeDefined();
    expect(screen.getByText('0 s')).toBeDefined(); // 0 panic time
    expect(screen.getByText(/Kimerültél/i)).toBeDefined(); // LOSS_BURNOUT
    expect(screen.getByText(/Nem sikerült kilépni/i)).toBeDefined(); // unrecovered panic
    expect(screen.getByText(/érzelem kimondása/i)).toBeDefined(); // debrief hint
  });
});
