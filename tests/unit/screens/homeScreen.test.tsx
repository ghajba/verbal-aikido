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
});
