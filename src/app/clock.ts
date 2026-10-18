export class VisibleClock {
  private nowFn: () => number;
  private accumulatedMs: number;
  private lastVisibleWallMs: number | null = null;
  private paused: boolean = false;
  private cleanupFns: Array<() => void> = [];
  private stateChangeListeners: Array<(paused: boolean) => void> = [];

  constructor(nowFn: () => number = () => performance.now(), initialAccumulatedMs: number = 0) {
    this.nowFn = nowFn;
    this.accumulatedMs = initialAccumulatedMs;

    const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';

    if (isVisible) {
      this.lastVisibleWallMs = this.nowFn();
      this.paused = false;
    } else {
      this.lastVisibleWallMs = null;
      this.paused = true;
    }

    if (typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          this.pause();
        } else {
          this.resume();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      this.cleanupFns.push(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      });
    }

    if (typeof window !== 'undefined') {
      const handlePageHide = () => this.pause();
      const handlePageShow = () => this.resume();

      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('pageshow', handlePageShow);

      this.cleanupFns.push(() => {
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('pageshow', handlePageShow);
      });
    }
  }

  now(): number {
    if (this.paused || this.lastVisibleWallMs === null) {
      return this.accumulatedMs;
    }
    const current = this.nowFn();
    return this.accumulatedMs + Math.max(0, current - this.lastVisibleWallMs);
  }

  reset(initialAccumulatedMs: number = 0): void {
    this.accumulatedMs = initialAccumulatedMs;
    this.lastVisibleWallMs = this.paused ? null : this.nowFn();
  }

  pause(): void {
    if (this.paused) return;
    if (this.lastVisibleWallMs !== null) {
      this.accumulatedMs += Math.max(0, this.nowFn() - this.lastVisibleWallMs);
      this.lastVisibleWallMs = null;
    }
    this.paused = true;
    for (const listener of this.stateChangeListeners) {
      listener(true);
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastVisibleWallMs = this.nowFn();
    for (const listener of this.stateChangeListeners) {
      listener(false);
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  onStateChange(fn: (paused: boolean) => void): () => void {
    this.stateChangeListeners.push(fn);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== fn);
    };
  }

  destroy(): void {
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];
    this.stateChangeListeners = [];
  }
}
