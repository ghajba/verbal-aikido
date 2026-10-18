import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/preact';
import { StatsScreen } from '@/ui/screens/StatsScreen';
import { MemoryDriver } from '@/storage/memory';
import { currentScreen } from '@/ui/router';
import type { RunSummary } from '@/engine/stats';

const mockRun: RunSummary = {
  runId: 'run-abc',
  scenarioId: 'scen_angry_pm_deadline_001',
  contentVersion: 1,
  startedAt: '2026-10-18T10:00:00.000Z',
  endedAt: '2026-10-18T10:02:00.000Z',
  outcome: 'WIN_BREAKTHROUGH',
  turns: 3,
  finalMetrics: { escalation: 40, grounding: 60, confusion: 85 },
  panicSec: 2.0,
  rtoSec: 1.5,
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
  history: [],
};

import { setLocale } from '@/i18n/locale';

describe('StatsScreen component', () => {
  let storage: MemoryDriver;

  beforeEach(() => {
    setLocale('hu');
    storage = new MemoryDriver();
    currentScreen.value = { name: 'stats' };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading then aggregates and scenario progress', async () => {
    await storage.finishRun(mockRun, {
      scenarioId: 'scen_angry_pm_deadline_001',
      completedCount: 1,
      winCount: 1,
      bestOutcome: 'WIN_BREAKTHROUGH',
      bestRtoSec: 1.5,
      lastRtoSec: 1.5,
      lastPlayedAt: '2026-10-18T10:02:00.000Z',
    });

    render(<StatsScreen storage={storage} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText('Statisztika')).toBeDefined();
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0); // win rate & ratio
    expect(screen.getByTestId('stats-run-run-abc')).toBeDefined();

    // Click on recent run navigates to debrief
    const recentItem = screen.getByTestId('stats-run-run-abc');
    act(() => {
      fireEvent.click(recentItem);
    });

    expect(currentScreen.value).toEqual({ name: 'debrief', runId: 'run-abc' });
  });

  it('navigates back to home on back button click', async () => {
    render(<StatsScreen storage={storage} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const backBtn = screen.getByTestId('stats-back-btn');
    act(() => {
      fireEvent.click(backBtn);
    });

    expect(currentScreen.value).toEqual({ name: 'home' });
  });

  it('renders correctly when there are no runs', async () => {
    render(<StatsScreen storage={storage} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    expect(screen.getByText('0 s')).toBeDefined();
  });
});
