export interface TimerRingProps {
  remainingMs: number | null;
  totalLimitSec?: number;
}

export function TimerRing({ remainingMs, totalLimitSec }: TimerRingProps) {
  if (remainingMs === null || totalLimitSec === undefined || totalLimitSec <= 0) {
    return null;
  }

  const totalMs = totalLimitSec * 1000;
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
  const isWarning = remainingMs <= 5000 && remainingMs > 0;

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <div
      class={`timer-ring ${isWarning ? 'timer-ring--warning' : ''}`}
      aria-hidden="true"
      data-testid="timer-ring"
    >
      <svg viewBox="0 0 40 40" width="40" height="40" class="timer-ring__svg">
        <circle class="timer-ring__track" cx="20" cy="20" r={radius} fill="none" stroke-width="3" />
        <circle
          class="timer-ring__progress"
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke-width="3"
          stroke-dasharray={circumference}
          stroke-dashoffset={offset}
          transform="rotate(-90 20 20)"
        />
        <text x="20" y="24" text-anchor="middle" class="timer-ring__text">
          {secondsLeft}
        </text>
      </svg>
    </div>
  );
}
