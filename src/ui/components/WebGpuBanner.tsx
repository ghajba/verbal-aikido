import type { JSX } from 'preact';
import { t } from '../../i18n/locale';

export interface WebGpuBannerProps {
  onConfigureByo?: () => void;
  onDismiss?: () => void;
}

export function WebGpuBanner({ onConfigureByo, onDismiss }: WebGpuBannerProps): JSX.Element {
  return (
    <div
      role="region"
      aria-label={t('webgpu.bannerTitle')}
      class="webgpu-banner"
      style={{
        background: 'var(--color-surface-elevated, #2a2438)',
        border: '1px solid var(--color-warning, #f59e0b)',
        borderRadius: '8px',
        padding: '16px',
        margin: '12px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>
          ⚠️
        </span>
        <strong style={{ color: 'var(--color-warning, #f59e0b)' }}>{t('webgpu.bannerTitle')}</strong>
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', lineHeight: '1.4' }}>
        {t('webgpu.bannerMsg')}
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {onConfigureByo && (
          <button
            type="button"
            class="btn btn-primary"
            onClick={onConfigureByo}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
          >
            {t('webgpu.bannerByoBtn')}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            class="btn btn-secondary"
            onClick={onDismiss}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
          >
            {t('webgpu.bannerClassicBtn')}
          </button>
        )}
      </div>
    </div>
  );
}
