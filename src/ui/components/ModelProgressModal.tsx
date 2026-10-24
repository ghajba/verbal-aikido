import type { JSX } from 'preact';
import { t } from '../../i18n/locale';

export interface ModelProgressModalProps {
  isOpen: boolean;
  progress: number; // 0 to 1 or 0 to 100
  text?: string;
  error?: string | null;
  onRetry?: () => void;
  onFallbackSimulated?: () => void;
  onConfigureKey?: () => void;
  onCancel?: () => void;
}

export function ModelProgressModal({
  isOpen,
  progress,
  text,
  error,
  onRetry,
  onFallbackSimulated,
  onConfigureKey,
  onCancel,
}: ModelProgressModalProps): JSX.Element | null {
  if (!isOpen) return null;

  // Normalize progress to 0-100%
  const normalizedProgress = Math.min(
    100,
    Math.max(0, Math.round(progress <= 1 ? progress * 100 : progress))
  );

  return (
    <div
      class="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-progress-title"
      data-testid="model-progress-modal"
    >
      <div class="dialog-box" style={{ maxWidth: '440px', width: '90%' }}>
        {error ? (
          /* Error State */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>
                ⚠️
              </span>
              <h2
                id="model-progress-title"
                class="dialog-box__title"
                style={{ margin: 0, color: 'var(--color-danger, #ef4444)' }}
              >
                {t('ai.downloadFailedTitle')}
              </h2>
            </div>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary, #94a3b8)',
                marginBottom: '12px',
                lineHeight: '1.4',
              }}
            >
              {t('ai.downloadFailedDesc')}
            </p>

            <div
              data-testid="model-progress-error"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid var(--color-danger, #ef4444)',
                color: 'var(--color-danger, #ef4444)',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                marginBottom: '16px',
                wordBreak: 'break-word',
              }}
            >
              {error}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {onRetry && (
                <button
                  type="button"
                  class="game-primary-btn game-primary-btn--apply"
                  onClick={onRetry}
                  data-testid="model-progress-retry-btn"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                >
                  <span>🔄 {t('ai.btnRetry')}</span>
                </button>
              )}

              {onConfigureKey && (
                <button
                  type="button"
                  class="dialog-btn dialog-btn--cancel"
                  onClick={onConfigureKey}
                  data-testid="model-progress-byo-btn"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '10px',
                    fontSize: '0.85rem',
                  }}
                >
                  🔑 {t('ai.btnByoKey')}
                </button>
              )}

              {onFallbackSimulated && (
                <button
                  type="button"
                  class="dialog-btn dialog-btn--secondary"
                  onClick={onFallbackSimulated}
                  data-testid="model-progress-simulated-btn"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                >
                  ⚡ {t('ai.btnFallbackSimulated')}
                </button>
              )}

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  data-testid="model-progress-cancel-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted, #64748b)',
                    cursor: 'pointer',
                    padding: '6px',
                    fontSize: '0.85rem',
                  }}
                >
                  {t('ai.downloadCancel')}
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Normal Loading / Progress State */
          <div>
            <h2 id="model-progress-title" class="dialog-box__title" style={{ marginBottom: '8px' }}>
              {t('ai.downloadTitle')}
            </h2>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary, #94a3b8)',
                marginBottom: '16px',
                lineHeight: '1.4',
              }}
            >
              {t('ai.downloadDesc')}
            </p>

            {/* Progress Bar Container */}
            <div
              role="progressbar"
              aria-valuenow={normalizedProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('ai.downloadTitle')}
              style={{
                width: '100%',
                height: '12px',
                backgroundColor: 'var(--color-surface-hover, #334155)',
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '10px',
              }}
              data-testid="model-progress-bar"
            >
              <div
                style={{
                  width: `${normalizedProgress}%`,
                  height: '100%',
                  backgroundColor: 'var(--color-pacing, #0ea5e9)',
                  transition: 'width 200ms ease-out',
                }}
                data-testid="model-progress-fill"
              />
            </div>

            {/* Text & Percentage */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.8rem',
                color: 'var(--color-text-muted, #64748b)',
                marginBottom: '16px',
              }}
            >
              <span data-testid="model-progress-text">{text || ''}</span>
              <span data-testid="model-progress-percentage">{normalizedProgress}%</span>
            </div>

            {onCancel && (
              <div class="dialog-buttons" style={{ justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  class="dialog-btn dialog-btn--cancel"
                  onClick={onCancel}
                  data-testid="model-progress-cancel-btn"
                >
                  {t('ai.downloadCancel')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
