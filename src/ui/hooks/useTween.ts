import { useEffect, useState, useRef } from 'preact/hooks';

function safeRAF(cb: (time: number) => void): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

function safeCAF(id: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

export function useTween(targetValue: number, durationMs: number = 400): number {
  const [displayValue, setDisplayValue] = useState<number>(targetValue);
  const startValueRef = useRef<number>(targetValue);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // Check reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (durationMs === 0 || prefersReducedMotion) {
      setDisplayValue(targetValue);
      startValueRef.current = targetValue;
      return;
    }

    startValueRef.current = displayValue;
    startTimeRef.current = null;

    const animate = (now: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }

      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / durationMs);

      // Linear interpolation per Section 17
      const current = startValueRef.current + (targetValue - startValueRef.current) * progress;
      setDisplayValue(Math.round(current));

      if (progress < 1) {
        frameRef.current = safeRAF(animate);
      } else {
        startValueRef.current = targetValue;
      }
    };

    frameRef.current = safeRAF(animate);

    return () => {
      if (frameRef.current !== null) {
        safeCAF(frameRef.current);
      }
    };
  }, [targetValue, durationMs]);

  return displayValue;
}
