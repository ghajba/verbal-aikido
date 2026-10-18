import { useTween } from '../hooks/useTween';

export interface MeterBarProps {
  metric: 'E' | 'F' | 'K';
  value: number;
  label: string;
  previousValue?: number;
}

export function MeterBar({ metric, value, label, previousValue }: MeterBarProps) {
  const displayValue = useTween(value, 400);

  const isDanger = (metric === 'E' && value >= 70) || (metric === 'F' && value <= 30);

  const isPulse =
    metric === 'K' && value >= 50 && (previousValue !== undefined ? previousValue < 50 : true);

  // Clamped scale 0..1
  const scale = Math.max(0, Math.min(100, value)) / 100;

  return (
    <div
      class={`meter-bar meter-bar--${metric.toLowerCase()} ${
        isDanger ? 'meter-bar--danger' : ''
      } ${isPulse ? 'meter-bar--pulse' : ''}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      data-metric={metric}
    >
      <div class="meter-bar__header">
        <span class="meter-bar__label">{label}</span>
        <span class="meter-bar__value" data-testid={`meter-value-${metric}`}>
          {displayValue}
        </span>
      </div>
      <div class="meter-bar__track">
        <div
          class="meter-bar__fill"
          data-testid={`meter-fill-${metric}`}
          style={{ transform: `scaleX(${scale})` }}
        />
      </div>
    </div>
  );
}
