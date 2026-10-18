import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useTween } from '@/ui/hooks/useTween';
import { useSwipeUp } from '@/ui/hooks/useSwipeUp';

describe('UI Hooks', () => {
  describe('useTween', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('interpolates linearly over duration and clamps to target', () => {
      let rAFCallbacks: Array<(time: number) => void> = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rAFCallbacks.push(cb);
        return rAFCallbacks.length;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

      const { result, rerender } = renderHook(({ val }) => useTween(val, 400), {
        initialProps: { val: 65 },
      });

      expect(result.current).toBe(65);

      rAFCallbacks = [];
      // Target changes to 45
      rerender({ val: 45 });

      // Simulate first frame (now = 1000)
      const cb1 = rAFCallbacks.shift();
      act(() => {
        cb1?.(1000);
      });
      expect(result.current).toBe(65);

      // Halfway (now = 1200) -> 65 + (45 - 65) * 0.5 = 55
      const cb2 = rAFCallbacks.shift();
      act(() => {
        cb2?.(1200);
      });
      expect(result.current).toBe(55);

      // Finish (now = 1400) -> 45
      const cb3 = rAFCallbacks.shift();
      act(() => {
        cb3?.(1400);
      });
      expect(result.current).toBe(45);
    });

    it('immediately sets targetValue when durationMs is 0 or reduced motion is true', () => {
      const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
          ({
            matches: query.includes('prefers-reduced-motion: reduce'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) as any
      );

      const { result, rerender } = renderHook(({ val }) => useTween(val, 400), {
        initialProps: { val: 65 },
      });

      rerender({ val: 45 });
      expect(result.current).toBe(45);

      matchMediaSpy.mockRestore();
    });

    it('falls back to setTimeout / clearTimeout when requestAnimationFrame is not supported', () => {
      const origRAF = window.requestAnimationFrame;
      const origCAF = window.cancelAnimationFrame;
      // @ts-expect-error test override
      delete window.requestAnimationFrame;
      // @ts-expect-error test override
      delete window.cancelAnimationFrame;

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

      const { rerender, unmount } = renderHook(({ val }) => useTween(val, 400), {
        initialProps: { val: 65 },
      });

      rerender({ val: 45 });
      expect(setTimeoutSpy).toHaveBeenCalled();

      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();

      window.requestAnimationFrame = origRAF;
      window.cancelAnimationFrame = origCAF;
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('useSwipeUp', () => {
    it('handles tap without movement by calling onSelect', () => {
      const onCommit = vi.fn();
      const onSelect = vi.fn();

      const { result } = renderHook(() => useSwipeUp({ onCommit, onSelect }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();
      targetEl.releasePointerCapture = vi.fn();

      // Pointer down
      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      expect(targetEl.setPointerCapture).toHaveBeenCalledWith(1);

      // Pointer up without move
      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });

      expect(onSelect).toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
      expect(result.current.swipeState.isDragging).toBe(false);
    });

    it('commits when dragged up by >= 60px', () => {
      const onCommit = vi.fn();
      const onSelect = vi.fn();

      const { result } = renderHook(() => useSwipeUp({ onCommit, onSelect }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();
      targetEl.releasePointerCapture = vi.fn();

      // Pointer down
      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      // Pointer move up by 70px (dy = -70)
      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 102,
          clientY: 130,
        } as unknown as PointerEvent);
      });

      expect(result.current.swipeState.isDragging).toBe(true);
      expect(result.current.swipeState.dy).toBe(-70);

      // Pointer up
      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
      expect(result.current.swipeState.isDragging).toBe(false);
    });

    it('does not commit when dy is not enough and returns with spring back', () => {
      const onCommit = vi.fn();
      const onSelect = vi.fn();

      const { result } = renderHook(() => useSwipeUp({ onCommit, onSelect }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();
      targetEl.releasePointerCapture = vi.fn();

      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      // Move up only 20px (dy = -20)
      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 100,
          clientY: 180,
        } as unknown as PointerEvent);
      });

      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });

      expect(onCommit).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
      expect(result.current.swipeState.isDragging).toBe(false);
    });

    it('does not commit if horizontal deviation |dx| >= 50px', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();
      targetEl.releasePointerCapture = vi.fn();

      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      // Move up 70px but right 60px
      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 160,
          clientY: 130,
        } as unknown as PointerEvent);
      });

      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });

      expect(onCommit).not.toHaveBeenCalled();
    });

    it('triggers haptic feedback when crossing commit threshold and resets when moving back', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();
      targetEl.releasePointerCapture = vi.fn();

      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      // Move up by 70px (dy = -70 <= -60) -> crosses threshold
      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 100,
          clientY: 130,
        } as unknown as PointerEvent);
      });

      expect(result.current.swipeState.isPastCommit).toBe(true);

      // Move back down to dy = -20 (y = 180) -> uncrosses threshold
      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 100,
          clientY: 180,
        } as unknown as PointerEvent);
      });

      expect(result.current.swipeState.isPastCommit).toBe(false);

      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });

      expect(onCommit).not.toHaveBeenCalled();
    });

    it('ignores start when inside is-scrollable element', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit }));

      const scrollable = document.createElement('div');
      scrollable.className = 'is-scrollable';
      const inner = document.createElement('p');
      scrollable.appendChild(inner);

      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: scrollable,
          target: inner,
        } as unknown as PointerEvent);
      });

      expect(result.current.swipeState.isDragging).toBe(false);
    });

    it('cancels drag on pointer cancel or lost pointer capture', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();
      targetEl.releasePointerCapture = vi.fn();

      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 100,
          clientY: 150,
        } as unknown as PointerEvent);
      });

      expect(result.current.swipeState.isDragging).toBe(true);

      act(() => {
        result.current.pointerHandlers.onPointerCancel({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });

      expect(result.current.swipeState.isDragging).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('ignores actions when disabled', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit, disabled: true }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();

      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      expect(targetEl.setPointerCapture).not.toHaveBeenCalled();
    });

    it('commits on high velocity even when dy > -60px', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn();
      targetEl.releasePointerCapture = vi.fn();

      let nowTime = 1000;
      const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowTime);

      // Pointer down at y=200, time=1000
      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      // Pointer move at y=160 (dy = -40, > -60), time=1040 (dt = 40ms -> velocity = 40/40 = 1.0 >= 0.6)
      nowTime = 1040;
      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 100,
          clientY: 160,
        } as unknown as PointerEvent);
      });

      expect(result.current.swipeState.isDragging).toBe(true);

      // Pointer up
      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });

      expect(onCommit).toHaveBeenCalledTimes(1);
      nowSpy.mockRestore();
    });

    it('catches and ignores errors in setPointerCapture and releasePointerCapture', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit }));

      const targetEl = document.createElement('div');
      targetEl.setPointerCapture = vi.fn().mockImplementation(() => {
        throw new Error('Capture error');
      });
      targetEl.releasePointerCapture = vi.fn().mockImplementation(() => {
        throw new Error('Release error');
      });

      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 0,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          currentTarget: targetEl,
          target: targetEl,
        } as unknown as PointerEvent);
      });

      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
          currentTarget: targetEl,
        } as unknown as PointerEvent);
      });
    });

    it('ignores non-primary pointer button and handles pointer moves/ups without down', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() => useSwipeUp({ onCommit }));

      // Right click button = 2
      act(() => {
        result.current.pointerHandlers.onPointerDown({
          button: 2,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
        } as unknown as PointerEvent);
      });
      expect(result.current.swipeState.isDragging).toBe(false);

      // Move without down
      act(() => {
        result.current.pointerHandlers.onPointerMove({
          clientX: 100,
          clientY: 150,
        } as unknown as PointerEvent);
      });
      expect(result.current.swipeState.isDragging).toBe(false);

      // Up without down
      act(() => {
        result.current.pointerHandlers.onPointerUp({
          pointerId: 1,
        } as unknown as PointerEvent);
      });

      // Cancel without down
      act(() => {
        result.current.pointerHandlers.onPointerCancel({
          pointerId: 1,
        } as unknown as PointerEvent);
      });
    });
  });
});
