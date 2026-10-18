import { useState } from 'preact/hooks';
import type { StorageDriver } from '../../storage/types';
import type { Locale } from '../../content/types';
import { currentLocale, setLocale, t } from '../../i18n/locale';
import { getMuted, setMuted } from '../../feedback/audio';
import type { HapticIntensity } from '../../feedback/haptics';
import { getHapticIntensity, setHapticIntensity, isHapticSupported } from '../../feedback/haptics';
import { navigateTo } from '../router';

export interface SettingsScreenProps {
  storage: StorageDriver;
}

export function SettingsScreen({ storage }: SettingsScreenProps) {
  const [activeLocale, setActiveLocale] = useState<string>(() => currentLocale.value);
  const [audioMuted, setAudioMuted] = useState<boolean>(() => getMuted());
  const [hapticLevel, setHapticLevel] = useState<HapticIntensity>(() => getHapticIntensity());
  const [motionPref, setMotionPref] = useState<'system' | 'on' | 'off'>('system');
  const [clearMessage, setClearMessage] = useState<string>('');
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  const hapticsAvailable = isHapticSupported();

  const handleLanguageChange = async (locale: string) => {
    setActiveLocale(locale);
    if (locale === 'auto') {
      await storage.delete('settings', 'locale');
      const detected = (navigator.language.split('-')[0] ?? 'en') as Locale;
      setLocale(['hu', 'en', 'de'].includes(detected) ? detected : 'en');
    } else {
      await storage.put('settings', 'locale', locale);
      setLocale(locale as Locale);
    }
  };

  const handleToggleAudio = () => {
    const next = !audioMuted;
    setMuted(next);
    setAudioMuted(next);
  };

  const handleHapticChange = (intensity: HapticIntensity) => {
    setHapticIntensity(intensity);
    setHapticLevel(intensity);
  };

  const handleClearRun = async () => {
    await storage.delete('currentRun', 'active');
    setClearMessage(t('settings.clearRun') + ': OK');
    setTimeout(() => setClearMessage(''), 3000);
  };

  const handleClearAll = async () => {
    const allProgress = await storage.getAll<{ scenarioId: string }>('progress');
    for (const p of allProgress) {
      await storage.delete('progress', p.scenarioId);
    }
    const allRuns = await storage.getAll<{ runId: string }>('runs');
    for (const r of allRuns) {
      await storage.delete('runs', r.runId);
    }
    await storage.delete('settings', 'locale');
    await storage.delete('currentRun', 'active');
    setConfirmClearAll(false);
    setLocale('en');
    navigateTo({ name: 'home' });
  };

  return (
    <div class="settings-screen" data-testid="settings-screen">
      <header class="settings-header">
        <button
          type="button"
          class="settings-back-btn"
          onClick={() => navigateTo({ name: 'home' })}
          data-testid="settings-back-btn"
        >
          ← {t('common.back')}
        </button>
        <h1 class="settings-title">{t('settings.title')}</h1>
      </header>

      <div class="settings-content">
        {/* Language Selection */}
        <section class="settings-group">
          <h2 class="settings-group__title">{t('settings.language')}</h2>
          <div class="settings-radio-group" role="radiogroup" aria-label={t('settings.language')}>
            {[
              { id: 'auto', label: t('language.auto') },
              { id: 'hu', label: t('language.hu') },
              { id: 'en', label: t('language.en') },
              { id: 'de', label: t('language.de') },
            ].map((lang) => (
              <label key={lang.id} class="settings-radio-label">
                <input
                  type="radio"
                  name="language"
                  value={lang.id}
                  checked={activeLocale === lang.id}
                  onChange={() => handleLanguageChange(lang.id)}
                  data-testid={`settings-lang-${lang.id}`}
                />
                <span>{lang.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Audio Mute */}
        <section class="settings-group">
          <h2 class="settings-group__title">{t('settings.audio')}</h2>
          <label class="settings-toggle-label">
            <input
              type="checkbox"
              checked={!audioMuted}
              onChange={handleToggleAudio}
              data-testid="settings-audio-toggle"
            />
            <span>{audioMuted ? 'Muted' : 'Enabled'}</span>
          </label>
        </section>

        {/* Haptics Intensity */}
        <section class="settings-group">
          <h2 class="settings-group__title">{t('settings.haptic')}</h2>
          {!hapticsAvailable ? (
            <p class="settings-hint">{t('settings.hapticUnsupported')}</p>
          ) : (
            <div class="settings-radio-group" role="radiogroup" aria-label={t('settings.haptic')}>
              {(['OFF', 'LOW', 'HIGH'] as const).map((lvl) => (
                <label key={lvl} class="settings-radio-label">
                  <input
                    type="radio"
                    name="haptic"
                    value={lvl}
                    checked={hapticLevel === lvl}
                    onChange={() => handleHapticChange(lvl)}
                    data-testid={`settings-haptic-${lvl}`}
                  />
                  <span>{t(`settings.haptic.${lvl}` as any)}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Reduced Motion */}
        <section class="settings-group">
          <h2 class="settings-group__title">{t('settings.motion')}</h2>
          <div class="settings-radio-group" role="radiogroup" aria-label={t('settings.motion')}>
            {(['system', 'on', 'off'] as const).map((m) => (
              <label key={m} class="settings-radio-label">
                <input
                  type="radio"
                  name="motion"
                  value={m}
                  checked={motionPref === m}
                  onChange={() => setMotionPref(m)}
                  data-testid={`settings-motion-${m}`}
                />
                <span>{t(`settings.motion.${m}` as any)}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Data & Storage Management */}
        <section class="settings-group settings-group--danger">
          <h2 class="settings-group__title">Storage & Data</h2>

          {storage.kind === 'memory' && (
            <p class="settings-alert">{t('settings.storageVolatile')}</p>
          )}

          <div class="settings-buttons">
            <button
              type="button"
              class="settings-btn settings-btn--secondary"
              onClick={handleClearRun}
              data-testid="settings-clear-run-btn"
            >
              {t('settings.clearRun')}
            </button>

            <button
              type="button"
              class="settings-btn settings-btn--danger"
              onClick={() => setConfirmClearAll(true)}
              data-testid="settings-clear-all-btn"
            >
              {t('settings.clearAll')}
            </button>
          </div>

          {clearMessage && <p class="settings-status-msg">{clearMessage}</p>}
        </section>

        {/* Version Info */}
        <section class="settings-group settings-info">
          <p class="settings-meta">
            Storage: <strong>{storage.kind}</strong>
          </p>
          <p class="settings-meta">
            Version: <strong>1.0.0</strong>
          </p>
        </section>
      </div>

      {/* Confirm Clear All Dialog */}
      {confirmClearAll && (
        <div class="dialog-overlay" role="dialog" aria-modal="true" data-testid="clear-all-dialog">
          <div class="dialog-box">
            <h2 class="dialog-box__title">{t('settings.clearAllConfirm')}</h2>
            <div class="dialog-buttons">
              <button
                type="button"
                class="dialog-btn dialog-btn--giveup"
                onClick={handleClearAll}
                data-testid="confirm-clear-all-btn"
              >
                {t('common.next')}
              </button>
              <button
                type="button"
                class="dialog-btn dialog-btn--cancel"
                onClick={() => setConfirmClearAll(false)}
                data-testid="cancel-clear-all-btn"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
