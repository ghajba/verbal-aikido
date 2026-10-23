import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { WebGpuBanner } from '../../../src/ui/components/WebGpuBanner';
import { setLocale } from '../../../src/i18n/locale';

describe('WebGpuBanner component', () => {
  it('renders localized warning and triggers action callbacks', () => {
    setLocale('hu');
    const onConfigure = vi.fn();
    const onDismiss = vi.fn();

    render(<WebGpuBanner onConfigureByo={onConfigure} onDismiss={onDismiss} />);

    expect(screen.getByText('A helyi AI futtatás nem támogatott')).toBeDefined();
    expect(screen.getByText('Saját kulcs beállítása')).toBeDefined();
    expect(screen.getByText('Klasszikus szcenáriók')).toBeDefined();

    fireEvent.click(screen.getByText('Saját kulcs beállítása'));
    expect(onConfigure).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Klasszikus szcenáriók'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
