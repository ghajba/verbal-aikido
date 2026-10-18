import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { MeterBar } from '@/ui/components/MeterBar';

describe('MeterBar component (SBE-MTR-*)', () => {
  it('renders with role="meter" and correct accessibility attributes (SBE-MTR-004)', () => {
    render(<MeterBar metric="E" value={45} label="Eszkaláció" previousValue={65} />);

    const meter = screen.getByRole('meter');
    expect(meter).toBeDefined();
    expect(meter.getAttribute('aria-label')).toBe('Eszkaláció');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuenow')).toBe('45');
    expect(screen.getByTestId('meter-value-E').textContent).toBe('45');
  });

  it('sets transform scaleX on the fill element (SBE-MTR-001)', () => {
    render(<MeterBar metric="F" value={80} label="Földelés" />);

    const fill = screen.getByTestId('meter-fill-F') as HTMLElement;
    expect(fill.style.transform).toBe('scaleX(0.8)');
  });

  it('handles danger coloring per SBE-MTR-003', () => {
    // E >= 70 -> danger
    const { rerender } = render(<MeterBar metric="E" value={70} label="Eszkaláció" />);
    expect(screen.getByRole('meter').classList.contains('meter-bar--danger')).toBe(true);

    // E = 69 -> no danger
    rerender(<MeterBar metric="E" value={69} label="Eszkaláció" />);
    expect(screen.getByRole('meter').classList.contains('meter-bar--danger')).toBe(false);

    // F <= 30 -> danger
    rerender(<MeterBar metric="F" value={30} label="Földelés" />);
    expect(screen.getByRole('meter').classList.contains('meter-bar--danger')).toBe(true);

    // F = 31 -> no danger
    rerender(<MeterBar metric="F" value={31} label="Földelés" />);
    expect(screen.getByRole('meter').classList.contains('meter-bar--danger')).toBe(false);
  });

  it('triggers pulse on K meter when crossing 50', () => {
    const { rerender } = render(
      <MeterBar metric="K" value={50} label="Megakadás" previousValue={40} />
    );
    expect(screen.getByRole('meter').classList.contains('meter-bar--pulse')).toBe(true);

    // Pulse when crossing 50 without previousValue specified (defaults to pulse)
    rerender(<MeterBar metric="K" value={50} label="Megakadás" />);
    expect(screen.getByRole('meter').classList.contains('meter-bar--pulse')).toBe(true);

    // No pulse if already above 50
    rerender(<MeterBar metric="K" value={55} label="Megakadás" previousValue={50} />);
    expect(screen.getByRole('meter').classList.contains('meter-bar--pulse')).toBe(false);
  });
});
