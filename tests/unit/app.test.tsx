import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/preact';
import { App } from '@/app/App';
import { currentScreen } from '@/ui/router';
import { needRefresh } from '@/pwa';

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

  it('routes to howto, stats, and settings screens correctly', async () => {
    render(<App />);

    // Wait for storage to open
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    act(() => {
      currentScreen.value = { name: 'howto' };
    });
    expect(screen.getByTestId('howto-screen')).toBeDefined();

    act(() => {
      currentScreen.value = { name: 'stats' };
    });
    await waitFor(() => {
      expect(screen.getByTestId('stats-screen')).toBeDefined();
    });

    act(() => {
      currentScreen.value = { name: 'settings' };
    });
    expect(screen.getByTestId('settings-screen')).toBeDefined();
  });

  it('renders PWA update banner when needRefresh is true and not on game screen', () => {
    needRefresh.value = true;
    currentScreen.value = { name: 'home' };
    render(<App />);

    expect(screen.getByText(/Új verzió érhető el|A new version is available/i)).toBeDefined();
    needRefresh.value = false;
  });

  it('starts dynamic AI scenario game session and handles leaving to home', async () => {
    render(<App />);

    act(() => {
      currentScreen.value = {
        name: 'game',
        scenarioId: 'scen_dynamic_angry_pm',
      };
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('game-screen')).toBeDefined();
      },
      { timeout: 3000 }
    );

    // Trigger leaving the game
    act(() => {
      currentScreen.value = { name: 'home' };
    });
    expect(screen.getByTestId('home-screen')).toBeDefined();
  });
});
