import { useRef, useState } from 'preact/hooks';
import {
  SWIPE_COMMIT_DY,
  SWIPE_COMMIT_VELOCITY,
  SWIPE_VELOCITY_WINDOW_MS,
  SWIPE_MAX_DX,
} from '../../engine/constants';
import { haptic } from '../../feedback/haptics';

export interface SwipeUpOptions {
  onCommit: (offset?: { dx: number; dy: number }) => void;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface SwipeState {
  isDragging: boolean;
  dx: number;
  dy: number;
  isPastCommit: boolean;
}

export function useSwipeUp({ onCommit, onSelect, disabled }: SwipeUpOptions) {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    isDragging: false,
    dx: 0,
    dy: 0,
    isPastCommit: false,
  });

  const pointerDownPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const velocityHistory = useRef<Array<{ y: number; time: number }>>([]);
  const hasMovedRef = useRef<boolean>(false);
  const hasHapticTriggeredRef = useRef<boolean>(false);

  const onPointerDown = (e: PointerEvent) => {
    if (disabled || (e.button !== undefined && e.button !== 0)) return;

    // Check if target is inside a scrollable container
    const target = e.target as HTMLElement | null;
    if (target?.closest('.is-scrollable')) {
      return; // Browser scroll takes precedence
    }

    const targetElem = e.currentTarget as HTMLElement;
    try {
      targetElem?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if unsupported
    }

    pointerDownPos.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
    };
    velocityHistory.current = [{ y: e.clientY, time: performance.now() }];
    hasMovedRef.current = false;
    hasHapticTriggeredRef.current = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDownPos.current || disabled) return;

    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    const now = performance.now();

    velocityHistory.current.push({ y: e.clientY, time: now });
    // Keep only last SWIPE_VELOCITY_WINDOW_MS (80ms)
    velocityHistory.current = velocityHistory.current.filter(
      (v) => now - v.time <= SWIPE_VELOCITY_WINDOW_MS
    );

    // Only drag upwards (dy < 0) or slight downwards slack
    if (dy < -5 || Math.abs(dx) > 5) {
      hasMovedRef.current = true;

      // Check current velocity
      let velocity = 0;
      if (velocityHistory.current.length >= 2) {
        const oldest = velocityHistory.current[0]!;
        const newest = velocityHistory.current[velocityHistory.current.length - 1]!;
        const dt = newest.time - oldest.time;
        if (dt >= 10) {
          velocity = (oldest.y - newest.y) / dt;
        }
      }

      const cappedDy = Math.min(10, dy); // cap downwards pull
      const isPast =
        (cappedDy <= SWIPE_COMMIT_DY || velocity >= SWIPE_COMMIT_VELOCITY) &&
        Math.abs(dx) < SWIPE_MAX_DX;

      if (isPast && !hasHapticTriggeredRef.current) {
        hasHapticTriggeredRef.current = true;
        haptic('TAP');
      } else if (!isPast && hasHapticTriggeredRef.current) {
        hasHapticTriggeredRef.current = false;
      }

      setSwipeState({
        isDragging: true,
        dx,
        dy: cappedDy,
        isPastCommit: isPast,
      });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDownPos.current) return;

    const targetElem = e.currentTarget as HTMLElement;
    try {
      targetElem?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore if not captured
    }

    const { dx, dy, isDragging } = swipeState;

    if (isDragging) {
      // Velocity check over last 80ms
      let velocity = 0;
      if (velocityHistory.current.length >= 2) {
        const oldest = velocityHistory.current[0]!;
        const newest = velocityHistory.current[velocityHistory.current.length - 1]!;
        const dt = newest.time - oldest.time;
        if (dt >= 10) {
          velocity = (oldest.y - newest.y) / dt; // upward velocity in px/ms
        }
      }

      // Commit if dy <= SWIPE_COMMIT_DY or velocity >= SWIPE_COMMIT_VELOCITY, and |dx| < SWIPE_MAX_DX
      if (
        (dy <= SWIPE_COMMIT_DY || velocity >= SWIPE_COMMIT_VELOCITY) &&
        Math.abs(dx) < SWIPE_MAX_DX
      ) {
        onCommit({ dx, dy });
      }
    } else if (!hasMovedRef.current) {
      // Clean tap without drag
      onSelect?.();
    }

    pointerDownPos.current = null;
    velocityHistory.current = [];
    hasHapticTriggeredRef.current = false;
    setSwipeState({ isDragging: false, dx: 0, dy: 0, isPastCommit: false });
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (pointerDownPos.current) {
      const targetElem = e.currentTarget as HTMLElement;
      try {
        targetElem?.releasePointerCapture?.(e.pointerId);
      } catch {}
      pointerDownPos.current = null;
      velocityHistory.current = [];
      hasHapticTriggeredRef.current = false;
      setSwipeState({ isDragging: false, dx: 0, dy: 0, isPastCommit: false });
    }
  };

  return {
    swipeState,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onpointerdown: onPointerDown,
      onpointermove: onPointerMove,
      onpointerup: onPointerUp,
      onpointercancel: onPointerCancel,
    },
  };
}
