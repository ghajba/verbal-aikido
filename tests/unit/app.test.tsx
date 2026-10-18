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

  it('toggles is-game-active class on body and app-shell--game on main when on game screen', () => {
    const { unmount } = render(<App />);

    expect(document.body.classList.contains('is-game-active')).toBe(false);
    const mainEl = document.querySelector('main');
    expect(mainEl?.classList.contains('app-shell--game')).toBe(false);

    act(() => {
      currentScreen.value = {
        name: 'game',
        scenarioId: 'scen_angry_pm_deadline_001',
      };
    });

    expect(document.body.classList.contains('is-game-active')).toBe(true);
    expect(mainEl?.classList.contains('app-shell--game')).toBe(true);
    expect(screen.queryByRole('link', { name: /sponsor/i })).toBeNull();

    act(() => {
      currentScreen.value = { name: 'home' };
    });

    expect(document.body.classList.contains('is-game-active')).toBe(false);
    expect(mainEl?.classList.contains('app-shell--game')).toBe(false);

    unmount();
    expect(document.body.classList.contains('is-game-active')).toBe(false);
  });
});
