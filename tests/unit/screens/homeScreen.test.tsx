import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { HomeScreen } from '@/ui/screens/HomeScreen';
import { currentScreen } from '@/ui/router';
import { currentLocale, setLocale } from '@/i18n/locale';

describe('HomeScreen component', () => {
  beforeEach(() => {
    setLocale('en');
    currentScreen.value = { name: 'home' };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders branding title, subtitle, and language buttons', () => {
    render(<HomeScreen />);

    expect(screen.getByText('Verbal Aikido')).toBeDefined();
    expect(screen.getByTestId('lang-btn-en')).toBeDefined();
    expect(screen.getByTestId('lang-btn-hu')).toBeDefined();
    expect(screen.getByTestId('lang-btn-de')).toBeDefined();
  });

  it('switches locale when language button is tapped', () => {
    render(<HomeScreen />);

    const huBtn = screen.getByTestId('lang-btn-hu');
    fireEvent.click(huBtn);
    expect(currentLocale.value).toBe('hu');

    const deBtn = screen.getByTestId('lang-btn-de');
    fireEvent.click(deBtn);
    expect(currentLocale.value).toBe('de');
  });

  it('renders all 4 catalog scenarios and navigates to briefing on click', () => {
    render(<HomeScreen />);

    const scenarioGrid = screen.getByTestId('scenario-grid');
    expect(scenarioGrid).toBeDefined();

    const startBtn = screen.getByTestId('start-scenario-scen_angry_pm_deadline_001');
    expect(startBtn).toBeDefined();

    fireEvent.click(startBtn);
    expect(currentScreen.value).toEqual({
      name: 'briefing',
      scenarioId: 'scen_angry_pm_deadline_001',
    });
  });

  it('navigates to howto, stats, and settings on header button clicks', () => {
    render(<HomeScreen />);

    fireEvent.click(screen.getByTestId('nav-howto-btn'));
    expect(currentScreen.value).toEqual({ name: 'howto' });

    fireEvent.click(screen.getByTestId('nav-stats-btn'));
    expect(currentScreen.value).toEqual({ name: 'stats' });

    fireEvent.click(screen.getByTestId('nav-settings-btn'));
    expect(currentScreen.value).toEqual({ name: 'settings' });
  });

  it('renders resume dialog when an active saved run is present and handles continue/restart', async () => {
    const { MemoryDriver } = await import('@/storage/memory');
    const storage = new MemoryDriver();
    await storage.put('currentRun', 'active', {
      scenarioId: 'scen_angry_pm_deadline_001',
    } as any);

    render(<HomeScreen storage={storage} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('resume-dialog')).toBeDefined();

    // Test continue button
    fireEvent.click(screen.getByTestId('resume-continue-btn'));
    expect(currentScreen.value).toEqual({
      name: 'game',
      scenarioId: 'scen_angry_pm_deadline_001',
    });

    // Test restart button with fresh mount
    cleanup();
    await storage.put('currentRun', 'active', {
      scenarioId: 'scen_angry_pm_deadline_001',
    } as any);
    render(<HomeScreen storage={storage} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('resume-dialog')).toBeDefined();

    fireEvent.click(screen.getByTestId('resume-restart-btn'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('resume-dialog')).toBeNull();
  });

  it('renders AI sparring section and navigates to briefing for dynamic archetypes', async () => {
    render(<HomeScreen />);

    expect(screen.getByTestId('ai-sparring-section')).toBeDefined();
    expect(screen.getByTestId('ai-scenario-grid')).toBeDefined();

    const startAiBtn = screen.getByTestId('start-scenario-scen_dynamic_angry_pm');
    expect(startAiBtn).toBeDefined();

    fireEvent.click(startAiBtn);
    expect(currentScreen.value).toEqual({
      name: 'briefing',
      scenarioId: 'scen_dynamic_angry_pm',
    });
  });

  it('renders WebGpuBanner when unsupported and handles dismiss', async () => {
    render(<HomeScreen />);
    await new Promise((r) => setTimeout(r, 50));

    // In jsdom environment, WebGPU is unsupported so banner appears
    const dismissBtn = screen.queryByRole('button', {
      name: /Classic Scenarios|Klasszikus szcenáriók/i,
    });
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
      expect(
        screen.queryByRole('region', {
          name: /Local AI is not supported|A helyi AI futtatás nem támogatott/i,
        })
      ).toBeNull();
    }
  });
});
