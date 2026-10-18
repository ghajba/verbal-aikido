import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  haptic,
  setHapticIntensity,
  getHapticIntensity,
  isHapticSupported,
  _resetHapticsForTesting,
} from '@/feedback/haptics';
import { play, setMuted, getMuted, unlockAudio, _resetAudioForTesting } from '@/feedback/audio';

describe('Haptics Engine (Section 14)', () => {
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetHapticsForTesting();
    vibrateMock = vi.fn();
    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });
    setHapticIntensity('HIGH');
  });

  it('triggers vibration patterns at HIGH intensity', () => {
    expect(isHapticSupported()).toBe(true);
    expect(getHapticIntensity()).toBe('HIGH');

    haptic('TAP');
    expect(vibrateMock).toHaveBeenCalledWith([15]);

    haptic('VALIDATION');
    expect(vibrateMock).toHaveBeenCalledWith([30, 50, 30]);

    haptic('BREAKTHROUGH');
    expect(vibrateMock).toHaveBeenCalledWith([60, 40, 100]);

    haptic('DAMAGE');
    expect(vibrateMock).toHaveBeenCalledWith([120, 50, 120]);
  });

  it('halves vibration pulse at LOW intensity (odd pause intervals unchanged, min 10 ms)', () => {
    setHapticIntensity('LOW');
    expect(getHapticIntensity()).toBe('LOW');

    haptic('TAP');
    // 15 * 0.5 = 7.5 -> rounded 8, min 10 -> 10
    expect(vibrateMock).toHaveBeenCalledWith([10]);

    haptic('VALIDATION');
    // 30 * 0.5 = 15, pause 50 unchanged, 30 * 0.5 = 15
    expect(vibrateMock).toHaveBeenCalledWith([15, 50, 15]);

    haptic('DAMAGE');
    // 120 * 0.5 = 60, pause 50, 120 * 0.5 = 60
    expect(vibrateMock).toHaveBeenCalledWith([60, 50, 60]);
  });

  it('does nothing when intensity is OFF', () => {
    setHapticIntensity('OFF');
    haptic('DAMAGE');
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('silently catches navigator.vibrate errors', () => {
    vibrateMock.mockImplementation(() => {
      throw new Error('Vibration permission denied');
    });
    expect(() => haptic('TAP')).not.toThrow();
  });

  it('handles missing vibrate support and invalid pattern gracefully', () => {
    _resetHapticsForTesting();
    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(isHapticSupported()).toBe(false);
    expect(() => haptic('TAP')).not.toThrow();

    // Invalid pattern
    _resetHapticsForTesting();
    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });
    expect(() => haptic('UNKNOWN' as any)).not.toThrow();
  });
});

describe('Audio Engine (Section 15)', () => {
  let origAudioContext: unknown;
  let mockCtx: {
    state: string;
    currentTime: number;
    destination: object;
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    _resetAudioForTesting();
    setMuted(false);
    mockCtx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    origAudioContext = (globalThis.window as unknown as { AudioContext?: unknown }).AudioContext;
    (globalThis.window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(() => mockCtx);
  });

  afterEach(() => {
    (globalThis.window as unknown as { AudioContext?: unknown }).AudioContext = origAudioContext;
  });

  it('respects muted state and unlocks audio on gesture', () => {
    expect(getMuted()).toBe(false);
    setMuted(true);
    expect(getMuted()).toBe(true);

    play('CARD_TAP');
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    setMuted(false);
    // Play before unlock is ignored
    play('CARD_TAP');
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    unlockAudio();
    // Play with unknown sound does nothing
    play('UNKNOWN' as any);

    play('CARD_TAP');
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });

  it('resumes suspended context when playing or unlocking', () => {
    mockCtx.state = 'suspended';
    unlockAudio();
    expect(mockCtx.resume).toHaveBeenCalled();
  });

  it('plays sequential notes for CONSTRUCTIVE and simultaneous for TONE_TENSE', () => {
    unlockAudio();
    mockCtx.state = 'running';

    play('CONSTRUCTIVE');
    // 2 notes
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);

    play('TONE_TENSE');
    // 2 notes together
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(4);
  });

  it('skips sound and resumes when AudioContext is suspended', () => {
    unlockAudio();
    mockCtx.state = 'suspended';
    play('CARD_TAP');
    expect(mockCtx.resume).toHaveBeenCalled();
  });

  it('disconnects nodes on oscillator ended event', () => {
    unlockAudio();
    mockCtx.state = 'running';

    let capturedEnded: (() => void) | null = null;
    const oscMock = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      set onended(fn: () => void) {
        capturedEnded = fn;
      },
    };
    mockCtx.createOscillator.mockReturnValueOnce(oscMock as any);

    play('CARD_TAP');
    expect(capturedEnded).toBeDefined();
    capturedEnded!();
    expect(oscMock.disconnect).toHaveBeenCalled();
  });

  it('handles missing AudioContext gracefully', () => {
    _resetAudioForTesting();
    (globalThis.window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    (globalThis.window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext =
      undefined;

    expect(() => {
      unlockAudio();
      play('CARD_TAP');
    }).not.toThrow();
  });

  it('handles AudioContext constructor error in catch block', () => {
    _resetAudioForTesting();
    (globalThis.window as unknown as { AudioContext: unknown }).AudioContext = vi
      .fn()
      .mockImplementation(() => {
        throw new Error('Not allowed');
      });

    expect(() => {
      unlockAudio();
      play('CARD_TAP');
    }).not.toThrow();
  });
});
