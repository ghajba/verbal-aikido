import { useRef, useState } from 'preact/hooks';

export interface SwipeUpOptions {
  onCommit: () => void;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface SwipeState {
  isDragging: boolean;
  dx: number;
  dy: number;
}

export function useSwipeUp({ onCommit, onSelect, disabled }: SwipeUpOptions) {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    isDragging: false,
    dx: 0,
    dy: 0,
  });

  const pointerDownPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const velocityHistory = useRef<Array<{ y: number; time: number }>>([]);
  const hasMovedRef = useRef<boolean>(false);

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
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDownPos.current || disabled) return;

    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    const now = performance.now();

    velocityHistory.current.push({ y: e.clientY, time: now });
    // Keep only last 80ms
    velocityHistory.current = velocityHistory.current.filter((v) => now - v.time <= 80);

    // Only drag upwards (dy < 0) or slight downwards slack
    if (dy < -5 || Math.abs(dx) > 5) {
      hasMovedRef.current = true;
      setSwipeState({
        isDragging: true,
        dx,
        dy: Math.min(10, dy), // cap downwards pull
      });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDownPos.current) return;

    const targetElem = e.currentTarget as HTMLElement;
    try {
      targetElem.releasePointerCapture(e.pointerId);
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

      // Commit if dy <= -60px or velocity >= 0.6 px/ms, and |dx| < 50px
      if ((dy <= -60 || velocity >= 0.6) && Math.abs(dx) < 50) {
        onCommit();
      }
    } else if (!hasMovedRef.current) {
      // Clean tap without drag
      onSelect?.();
    }

    pointerDownPos.current = null;
    velocityHistory.current = [];
    setSwipeState({ isDragging: false, dx: 0, dy: 0 });
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (pointerDownPos.current) {
      const targetElem = e.currentTarget as HTMLElement;
      try {
        targetElem.releasePointerCapture(e.pointerId);
      } catch {}
      pointerDownPos.current = null;
      velocityHistory.current = [];
      setSwipeState({ isDragging: false, dx: 0, dy: 0 });
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
