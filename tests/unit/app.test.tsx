import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/preact';
import { App } from '@/app/App';
import { currentScreen } from '@/ui/router';

describe('App component', () => {
  beforeEach(() => {
    currentScreen.value = { name: 'home' };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders HomeScreen and sponsor button on initial load', () => {
    render(<App />);

    expect(screen.getByText('Verbal Aikido')).toBeDefined();
    const sponsorBtn = screen.getByRole('link', { name: /sponsor/i });
    expect(sponsorBtn).toBeDefined();
    expect(sponsorBtn.getAttribute('href')).toBe('https://github.com/sponsors/ghajba');
  });

  it('updates screen when browser popstate event is dispatched', () => {
    render(<App />);

    act(() => {
      window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: {
            screen: {
              name: 'briefing',
              scenarioId: 'scen_angry_pm_deadline_001',
            },
          },
        })
      );
    });

    expect(screen.getByTestId('briefing-screen')).toBeDefined();
  });
});
