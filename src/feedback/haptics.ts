export type HapticPattern = 'TAP' | 'VALIDATION' | 'BREAKTHROUGH' | 'DAMAGE';
export type HapticIntensity = 'OFF' | 'LOW' | 'HIGH';

const BASE_PATTERNS: Record<HapticPattern, number[]> = {
  TAP: [15],
  VALIDATION: [30, 50, 30],
  BREAKTHROUGH: [60, 40, 100],
  DAMAGE: [120, 50, 120],
};

let currentIntensity: HapticIntensity = 'HIGH';
let cachedSupported: boolean | null = null;

export function isHapticSupported(): boolean {
  if (cachedSupported === null) {
    cachedSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }
  return cachedSupported;
}

export function setHapticIntensity(intensity: HapticIntensity): void {
  currentIntensity = intensity;
}

export function getHapticIntensity(): HapticIntensity {
  return currentIntensity;
}

export function _resetHapticsForTesting(): void {
  cachedSupported = null;
  currentIntensity = 'HIGH';
}

export function haptic(p: HapticPattern): void {
  if (currentIntensity === 'OFF') return;
  if (!isHapticSupported()) return;

  const base = BASE_PATTERNS[p];
  if (!base) return;

  let pattern: number[];
  if (currentIntensity === 'LOW') {
    // Even indexes (vibration) x 0.5 rounded min 10. Odd indexes (pause) unchanged.
    pattern = base.map((val, idx) => (idx % 2 === 0 ? Math.max(10, Math.round(val * 0.5)) : val));
  } else {
    pattern = [...base];
  }

  try {
    navigator.vibrate(pattern);
  } catch {
    // Silent no-op per PRD §11
  }
}
