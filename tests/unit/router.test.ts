import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentScreen, navigateTo } from '@/ui/router';

describe('Router', () => {
  beforeEach(() => {
    currentScreen.value = { name: 'home' };
  });

  it('updates currentScreen and pushes browser history', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');

    navigateTo({ name: 'briefing', scenarioId: 'scen_001' });
    expect(currentScreen.value).toEqual({
      name: 'briefing',
      scenarioId: 'scen_001',
    });
    expect(pushSpy).toHaveBeenCalledWith(
      { screen: { name: 'briefing', scenarioId: 'scen_001' } },
      ''
    );

    pushSpy.mockRestore();
  });

  it('replaces browser history when replace is true', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    navigateTo({ name: 'home' }, true);
    expect(currentScreen.value).toEqual({ name: 'home' });
    expect(replaceSpy).toHaveBeenCalledWith({ screen: { name: 'home' } }, '');

    replaceSpy.mockRestore();
  });
});

describe('Scenarios loader', () => {
  it('loads static scenarios directly', async () => {
    const { loadScenario } = await import('@/ui/scenarios');
    const s = await loadScenario('scen_angry_pm_deadline_001');
    expect(s.id).toBe('scen_angry_pm_deadline_001');
  });

  it('fetches non-static scenarios and throws on failure', async () => {
    const { loadScenario } = await import('@/ui/scenarios');

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'external_scen' }),
    } as any);

    const s = await loadScenario('external_scen');
    expect(s.id).toBe('external_scen');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
    } as any);

    await expect(loadScenario('non_existent')).rejects.toThrow('Scenario not found');

    globalThis.fetch = origFetch;
  });
});
