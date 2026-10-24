import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { t } from '../../i18n/locale';

export interface AiLaunchModalProps {
  isOpen: boolean;
  webGpuSupported: boolean;
  onStartWebLlm: () => void;
  onStartSimulated: () => void;
  onConfigureApiKey: () => void;
  onCancel: () => void;
}

export function AiLaunchModal({
  isOpen,
  webGpuSupported,
  onStartWebLlm,
  onStartSimulated,
  onConfigureApiKey,
  onCancel,
}: AiLaunchModalProps): JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      class="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-launch-title"
      data-testid="ai-launch-modal"
    >
      <div
        class="dialog-box"
        style={{
          maxWidth: '480px',
          width: '92%',
          padding: '24px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header with Title and WebGPU Badge */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '6px',
            }}
          >
            <h2
              id="ai-launch-title"
              class="dialog-box__title"
              style={{ margin: 0, fontSize: '1.25rem' }}
            >
              {webGpuSupported ? t('ai.launchTitleSupported') : t('ai.launchTitleUnsupported')}
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                background: webGpuSupported ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: webGpuSupported
                  ? 'var(--color-success, #10b981)'
                  : 'var(--color-warning, #f59e0b)',
                border: `1px solid ${
                  webGpuSupported
                    ? 'var(--color-success, #10b981)'
                    : 'var(--color-warning, #f59e0b)'
                }`,
              }}
              data-testid="webgpu-badge"
            >
              {webGpuSupported ? t('ai.gpuSupportedBadge') : t('ai.gpuUnsupportedBadge')}
            </span>
          </div>
        </div>

        {/* Content for WebGPU Supported */}
        {webGpuSupported ? (
          <div>
            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--color-text-secondary, #94a3b8)',
                lineHeight: '1.4',
                marginBottom: '16px',
              }}
            >
              {t('ai.webllmIntro')}
            </p>

            <div
              style={{
                background: 'var(--color-surface-hover, #334155)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '18px',
                fontSize: '0.85rem',
                lineHeight: '1.45',
              }}
            >
              <div
                style={{
                  fontWeight: 'bold',
                  color: 'var(--color-text-primary, #fff)',
                  marginBottom: '4px',
                }}
              >
                📦 {t('ai.downloadNotice')}{' '}
                <span style={{ color: 'var(--color-pacing, #0ea5e9)' }}>
                  {t('ai.downloadSize')}
                </span>
              </div>
              <p style={{ margin: '0 0 6px 0', color: 'var(--color-text-secondary, #94a3b8)' }}>
                {t('ai.downloadCache')}
              </p>
              <p style={{ margin: 0, color: 'var(--color-success, #10b981)', fontSize: '0.8rem' }}>
                🛡️ {t('ai.downloadPrivacy')}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                class="game-primary-btn game-primary-btn--apply"
                onClick={onStartWebLlm}
                data-testid="ai-launch-webllm-btn"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              >
                <span>{t('ai.btnDownloadAndStart')}</span>
              </button>

              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                onClick={onStartSimulated}
                data-testid="ai-launch-simulated-btn"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                {t('ai.btnSimulated')}
              </button>

              <button
                type="button"
                class="dialog-btn dialog-btn--cancel"
                onClick={onConfigureApiKey}
                data-testid="ai-launch-byo-btn"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '10px',
                  fontSize: '0.85rem',
                }}
              >
                ⚙️ {t('ai.btnByoKey')}
              </button>

              <button
                type="button"
                onClick={onCancel}
                data-testid="ai-launch-cancel-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted, #64748b)',
                  cursor: 'pointer',
                  padding: '6px',
                  marginTop: '4px',
                  fontSize: '0.85rem',
                }}
              >
                {t('ai.btnCancel')}
              </button>
            </div>
          </div>
        ) : (
          /* Content for WebGPU NOT Supported */
          <div>
            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--color-text-secondary, #94a3b8)',
                lineHeight: '1.4',
                marginBottom: '14px',
              }}
            >
              {t('ai.gpuUnsupportedIntro')}
            </p>

            <p style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px' }}>
              {t('ai.gpuUnsupportedOptions')}
            </p>

            <div
              style={{
                background: 'var(--color-surface-hover, #334155)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
                fontSize: '0.85rem',
                borderLeft: '3px solid var(--color-pacing, #0ea5e9)',
              }}
            >
              <strong style={{ color: 'var(--color-text-primary, #fff)' }}>
                🔑 {t('ai.byoOptionTitle')}
              </strong>
              <p
                style={{
                  margin: '4px 0 0 0',
                  color: 'var(--color-text-secondary, #94a3b8)',
                  lineHeight: '1.4',
                }}
              >
                {t('ai.byoOptionDesc')}
              </p>
            </div>

            <div
              style={{
                background: 'var(--color-surface-hover, #334155)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '18px',
                fontSize: '0.85rem',
                borderLeft: '3px solid var(--color-text-muted, #64748b)',
              }}
            >
              <strong style={{ color: 'var(--color-text-primary, #fff)' }}>
                ⚡ {t('ai.simulatedOptionTitle')}
              </strong>
              <p
                style={{
                  margin: '4px 0 0 0',
                  color: 'var(--color-text-secondary, #94a3b8)',
                  lineHeight: '1.4',
                }}
              >
                {t('ai.simulatedOptionDesc')}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                class="game-primary-btn game-primary-btn--apply"
                onClick={onConfigureApiKey}
                data-testid="ai-launch-byo-btn"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              >
                <span>🔑 {t('ai.btnConfigureKey')}</span>
              </button>

              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                onClick={onStartSimulated}
                data-testid="ai-launch-simulated-btn"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                {t('ai.btnSimulated')}
              </button>

              <button
                type="button"
                onClick={onCancel}
                data-testid="ai-launch-cancel-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted, #64748b)',
                  cursor: 'pointer',
                  padding: '6px',
                  marginTop: '4px',
                  fontSize: '0.85rem',
                }}
              >
                {t('ai.btnCancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
