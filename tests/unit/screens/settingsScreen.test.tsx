import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/preact';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { MemoryDriver } from '@/storage/memory';
import { currentScreen } from '@/ui/router';
import { setLocale } from '@/i18n/locale';
import { vi } from 'vitest';
import { _resetHapticsForTesting } from '@/feedback/haptics';

describe('SettingsScreen component', () => {
  let storage: MemoryDriver;

  beforeEach(() => {
    setLocale('hu');
    (navigator as any).vibrate = vi.fn();
    _resetHapticsForTesting();
    storage = new MemoryDriver();
    currentScreen.value = { name: 'settings' };
  });

  afterEach(() => {
    cleanup();
    delete (navigator as any).vibrate;
    _resetHapticsForTesting();
  });

  it('renders settings options and changes language on radio select', async () => {
    render(<SettingsScreen storage={storage} />);

    expect(screen.getByText('Beállítások')).toBeDefined();

    // Select English radio
    const enRadio = screen.getByTestId('settings-lang-en');
    await act(async () => {
      fireEvent.change(enRadio, { target: { checked: true } });
    });

    // Select auto radio
    const autoRadio = screen.getByTestId('settings-lang-auto');
    await act(async () => {
      fireEvent.change(autoRadio, { target: { checked: true } });
    });
    const storedAuto = await storage.get('settings', 'locale');
    expect(storedAuto).toBeUndefined();

    // Select motion options
    const motionOn = screen.getByTestId('settings-motion-on');
    act(() => {
      fireEvent.change(motionOn, { target: { checked: true } });
    });
    const motionOff = screen.getByTestId('settings-motion-off');
    act(() => {
      fireEvent.change(motionOff, { target: { checked: true } });
    });
  });

  it('toggles audio mute and changes haptic intensity', async () => {
    render(<SettingsScreen storage={storage} />);

    const audioToggle = screen.getByTestId('settings-audio-toggle');
    act(() => {
      fireEvent.click(audioToggle);
    });

    const hapticLow = screen.getByTestId('settings-haptic-LOW');
    act(() => {
      fireEvent.change(hapticLow, { target: { checked: true } });
    });
  });

  it('navigates back to home on back button click', async () => {
    render(<SettingsScreen storage={storage} />);

    const backBtn = screen.getByTestId('settings-back-btn');
    act(() => {
      fireEvent.click(backBtn);
    });

    expect(currentScreen.value).toEqual({ name: 'home' });
  });

  it('handles clear run and clear all dialog', async () => {
    await storage.put('currentRun', 'active', { dummy: 1 } as any);
    await storage.put('progress', 'scen1', { scenarioId: 'scen1' } as any);
    await storage.put('runs', 'run1', { runId: 'run1' } as any);

    render(<SettingsScreen storage={storage} />);

    const clearRunBtn = screen.getByTestId('settings-clear-run-btn');
    await act(async () => {
      fireEvent.click(clearRunBtn);
    });

    const run = await storage.get('currentRun', 'active');
    expect(run).toBeUndefined();

    // Open clear all dialog
    const clearAllBtn = screen.getByTestId('settings-clear-all-btn');
    act(() => {
      fireEvent.click(clearAllBtn);
    });

    expect(screen.getByTestId('clear-all-dialog')).toBeDefined();

    const cancelClearBtn = screen.getByTestId('cancel-clear-all-btn');
    act(() => {
      fireEvent.click(cancelClearBtn);
    });

    expect(screen.queryByTestId('clear-all-dialog')).toBeNull();

    // Confirm clear all
    act(() => {
      fireEvent.click(clearAllBtn);
    });
    const confirmClearBtn = screen.getByTestId('confirm-clear-all-btn');
    await act(async () => {
      fireEvent.click(confirmClearBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(currentScreen.value).toEqual({ name: 'home' });
  });

  it('displays unsupported hint when haptics are not supported', () => {
    delete (navigator as any).vibrate;
    _resetHapticsForTesting();
    render(<SettingsScreen storage={storage} />);
    expect(screen.getByText(/nem támogatja a rezgést|does not support vibration/i)).toBeDefined();
  });
});
