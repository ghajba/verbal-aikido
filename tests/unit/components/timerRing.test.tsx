import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { TimerRing } from '@/ui/components/TimerRing';

describe('TimerRing component (SBE-TMR-*)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders null when remainingMs is null or totalLimitSec is absent (SBE-TMR-005)', () => {
    const { container } = render(<TimerRing remainingMs={null} totalLimitSec={15} />);
    expect(container.firstChild).toBeNull();

    const { container: c2 } = render(<TimerRing remainingMs={10000} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders countdown circle with remaining seconds and aria-hidden', () => {
    render(<TimerRing remainingMs={9200} totalLimitSec={15} />);

    const ring = screen.getByTestId('timer-ring');
    expect(ring).toBeDefined();
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.textContent).toBe('10'); // Math.ceil(9200 / 1000) = 10
  });

  it('adds timer-ring--warning class when remainingMs <= 5000 (SBE-TMR-002)', () => {
    const { rerender } = render(<TimerRing remainingMs={5000} totalLimitSec={15} />);
    expect(screen.getByTestId('timer-ring').classList.contains('timer-ring--warning')).toBe(true);

    rerender(<TimerRing remainingMs={6000} totalLimitSec={15} />);
    expect(screen.getByTestId('timer-ring').classList.contains('timer-ring--warning')).toBe(false);
  });
});
