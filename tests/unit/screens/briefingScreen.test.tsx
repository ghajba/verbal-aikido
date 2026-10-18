import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { BriefingScreen } from '@/ui/screens/BriefingScreen';
import { currentScreen } from '@/ui/router';
import { setLocale } from '@/i18n/locale';
import type { Scenario } from '@/content/types';

import pmRaw from '../../../public/scenarios/scen_angry_pm_deadline_001.json';
const pmScenario = pmRaw as unknown as Scenario;

describe('BriefingScreen component', () => {
  beforeEach(() => {
    setLocale('hu');
    currentScreen.value = { name: 'briefing', scenarioId: pmScenario.id };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders briefing overview, NPC details, and start button', () => {
    render(<BriefingScreen scenarioId={pmScenario.id} scenario={pmScenario} />);

    expect(screen.getByTestId('briefing-screen')).toBeDefined();
    expect(screen.getByText('Dóra')).toBeDefined();
    expect(screen.getByTestId('briefing-text')).toBeDefined();
    expect(screen.queryByTestId('briefing-timer-notice')).toBeNull();
  });

  it('renders timer notice when scenario has decisionTimeLimitSec', () => {
    const timedScenario = {
      ...pmScenario,
      decisionTimeLimitSec: 15,
    };
    render(<BriefingScreen scenarioId={timedScenario.id} scenario={timedScenario} />);
    expect(screen.getByTestId('briefing-timer-notice')).toBeDefined();
    expect(screen.getByTestId('briefing-timer-notice').textContent).toContain('15');
  });

  it('triggers onStart prop when provided', () => {
    const onStart = vi.fn();
    render(<BriefingScreen scenarioId={pmScenario.id} scenario={pmScenario} onStart={onStart} />);

    fireEvent.click(screen.getByTestId('briefing-start-btn'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('navigates to game on start button click without onStart prop', () => {
    render(<BriefingScreen scenarioId={pmScenario.id} scenario={pmScenario} />);
    fireEvent.click(screen.getByTestId('briefing-start-btn'));
    expect(currentScreen.value).toEqual({
      name: 'game',
      scenarioId: pmScenario.id,
    });
  });

  it('triggers onBack prop when provided', () => {
    const onBack = vi.fn();
    render(<BriefingScreen scenarioId={pmScenario.id} scenario={pmScenario} onBack={onBack} />);

    fireEvent.click(screen.getByTestId('briefing-back-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('navigates to home on back button click without onBack prop', () => {
    render(<BriefingScreen scenarioId={pmScenario.id} scenario={pmScenario} />);
    fireEvent.click(screen.getByTestId('briefing-back-btn'));
    expect(currentScreen.value).toEqual({ name: 'home' });
  });

  it('loads scenario asynchronously when scenario prop is not provided', async () => {
    render(<BriefingScreen scenarioId="scen_angry_pm_deadline_001" />);
    const dora = await screen.findByText('Dóra');
    expect(dora).toBeDefined();
  });
});
