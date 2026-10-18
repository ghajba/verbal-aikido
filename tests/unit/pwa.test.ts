import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { needRefresh, initPwa, applyUpdate } from '@/pwa';

describe('PWA update module', () => {
  beforeEach(() => {
    needRefresh.value = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes pwa without errors in non-prod environment', () => {
    expect(() => initPwa()).not.toThrow();
    expect(needRefresh.value).toBe(false);
  });

  it('applyUpdate reloads the page when no SW update function is registered', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    await applyUpdate();
    expect(reloadMock).toHaveBeenCalled();
  });
});
