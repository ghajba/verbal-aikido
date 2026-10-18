import { describe, it, expect, vi } from 'vitest';
import { VisibleClock } from '@/app/clock';

describe('VisibleClock (Timing & Visibility)', () => {
  it('SBE-VIS-001: Visible clock only counts visible time', () => {
    let mockWallMs = 0;
    const nowFn = () => mockWallMs;

    const clock = new VisibleClock(nowFn, 0);
    expect(clock.now()).toBe(0);

    // Visible from 0 to 5000
    mockWallMs = 5000;
    expect(clock.now()).toBe(5000);

    // Hidden from 5000 to 65000
    clock.pause();
    mockWallMs = 65000;
    expect(clock.now()).toBe(5000); // clock paused, still 5000

    // Visible from 65000 to 66000
    clock.resume();
    mockWallMs = 66000;
    expect(clock.now()).toBe(6000);

    clock.destroy();
  });

  it('SBE-VIS-003: pagehide and pageshow behave like hidden and visible', () => {
    let mockWallMs = 100;
    const nowFn = () => mockWallMs;

    const clock = new VisibleClock(nowFn, 0);
    expect(clock.isPaused()).toBe(false);

    // Trigger pagehide
    window.dispatchEvent(new Event('pagehide'));
    expect(clock.isPaused()).toBe(true);

    mockWallMs = 10000;
    expect(clock.now()).toBe(0);

    // Trigger pageshow
    window.dispatchEvent(new Event('pageshow'));
    expect(clock.isPaused()).toBe(false);

    mockWallMs = 12000;
    expect(clock.now()).toBe(2000);

    clock.destroy();
  });

  it('notifies onStateChange subscribers and allows unsubscribing', () => {
    const clock = new VisibleClock(() => 0, 0);
    const listener = vi.fn();

    const unsub = clock.onStateChange(listener);
    clock.pause();
    expect(listener).toHaveBeenCalledWith(true);

    clock.resume();
    expect(listener).toHaveBeenCalledWith(false);

    unsub();
    clock.pause();
    expect(listener).toHaveBeenCalledTimes(2);

    clock.destroy();
  });

  it('restores initialAccumulatedMs on creation', () => {
    let wallMs = 500;
    const clock = new VisibleClock(() => wallMs, 4000);
    expect(clock.now()).toBe(4000);

    wallMs = 1500;
    expect(clock.now()).toBe(5000);

    clock.destroy();
  });

  it('handles visibilitychange events on document and hidden start', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });
    const clock = new VisibleClock(() => 100, 0);
    expect(clock.isPaused()).toBe(true);

    // Switch to visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.isPaused()).toBe(false);

    // Switch back to hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.isPaused()).toBe(true);

    // Restore visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    clock.destroy();
  });

  it('handles idempotent pause and resume, and reset while paused', () => {
    let wallMs = 1000;
    const clock = new VisibleClock(() => wallMs, 0);

    // Resume when already running is no-op
    clock.resume();
    expect(clock.isPaused()).toBe(false);

    // Pause
    clock.pause();
    expect(clock.isPaused()).toBe(true);

    // Pause when already paused is no-op
    clock.pause();
    expect(clock.isPaused()).toBe(true);

    // Reset while paused
    clock.reset(500);
    expect(clock.now()).toBe(500);
    expect(clock.isPaused()).toBe(true);

    clock.resume();
    expect(clock.isPaused()).toBe(false);
    wallMs = 2000;
    expect(clock.now()).toBe(1500);

    clock.destroy();
  });
});
