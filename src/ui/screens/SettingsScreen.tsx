import { useEffect, useState } from 'preact/hooks';
import type { StorageDriver } from '../../storage/types';
import type { Locale } from '../../content/types';
import { currentLocale, setLocale, t } from '../../i18n/locale';
import { getMuted, setMuted } from '../../feedback/audio';
import type { HapticIntensity } from '../../feedback/haptics';
import { getHapticIntensity, setHapticIntensity, isHapticSupported } from '../../feedback/haptics';
import { navigateTo } from '../router';
import { checkWebGpuSupport } from '../../ai/webgpu';
import type { AiProviderId, ByoServiceId } from '../../ai/types';

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

  const [aiMode, setAiMode] = useState<AiProviderId | 'classic'>('classic');
  const [byoService, setByoService] = useState<ByoServiceId>('gemini');
  const [apiKey, setApiKey] = useState<string>('');
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);
  const [aiStatusMsg, setAiStatusMsg] = useState<string>('');

  const hapticsAvailable = isHapticSupported();

  useEffect(() => {
    checkWebGpuSupport().then((res) => setWebGpuAvailable(res.supported));
    storage
      .get<{ mode?: AiProviderId | 'classic'; service?: ByoServiceId; apiKey?: string }>(
        'settings',
        'aiConfig'
      )
      .then((cfg) => {
        if (cfg) {
          if (cfg.mode) setAiMode(cfg.mode);
          if (cfg.service) setByoService(cfg.service);
          if (cfg.apiKey) setApiKey(cfg.apiKey);
        }
      });
  }, [storage]);

  const handleAiModeChange = async (mode: AiProviderId | 'classic') => {
    setAiMode(mode);
    await storage.put('settings', 'aiConfig', { mode, service: byoService, apiKey });
  };

  const handleByoServiceChange = async (service: ByoServiceId) => {
    setByoService(service);
    await storage.put('settings', 'aiConfig', { mode: aiMode, service, apiKey });
  };

  const handleSaveApiKey = async () => {
    await storage.put('settings', 'aiConfig', { mode: aiMode, service: byoService, apiKey });
    setAiStatusMsg(t('settings.keySaved'));
    setTimeout(() => setAiStatusMsg(''), 3000);
  };

  const handleClearApiKey = async () => {
    setApiKey('');
    await storage.put('settings', 'aiConfig', { mode: aiMode, service: byoService, apiKey: '' });
    setAiStatusMsg(t('settings.clearKey') + ': OK');
    setTimeout(() => setAiStatusMsg(''), 3000);
  };

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

        {/* Dynamic AI Sparring Section */}
        <section class="settings-group" data-testid="settings-ai-section">
          <h2 class="settings-group__title">{t('settings.aiSection')}</h2>

          <div class="settings-radio-group" role="radiogroup" aria-label={t('settings.aiMode')}>
            {[
              { id: 'classic', label: t('settings.aiClassic') },
              { id: 'webllm', label: t('settings.aiWebLlm') },
              { id: 'byokey', label: t('settings.aiByoKey') },
            ].map((m) => (
              <label key={m.id} class="settings-radio-label">
                <input
                  type="radio"
                  name="aiMode"
                  value={m.id}
                  checked={aiMode === m.id}
                  onChange={() => handleAiModeChange(m.id as any)}
                  data-testid={`settings-ai-mode-${m.id}`}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>

          {/* WebLLM Info / Warning */}
          {aiMode === 'webllm' && (
            <div style={{ marginTop: '12px' }}>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: webGpuAvailable ? 'var(--color-success, #10b981)' : 'var(--color-warning, #f59e0b)',
                }}
              >
                {webGpuAvailable
                  ? t('settings.webGpuSupported')
                  : t('settings.webGpuUnsupported')}
              </p>
            </div>
          )}

          {/* BYO-Key Form */}
          {aiMode === 'byokey' && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                {t('settings.aiService')}
                <select
                  class="settings-select"
                  value={byoService}
                  onChange={(e) => handleByoServiceChange((e.target as HTMLSelectElement).value as ByoServiceId)}
                  data-testid="settings-byo-service-select"
                  style={{ width: '100%', padding: '6px', marginTop: '4px', background: 'var(--color-surface, #1e1b2e)', color: 'inherit', borderRadius: '4px' }}
                >
                  <option value="gemini">Google Gemini 3.8 Flash (Free quota)</option>
                  <option value="claude">Anthropic Claude 5.5 Sonnet</option>
                  <option value="openai">OpenAI GPT-5-mini</option>
                  <option value="openrouter">OpenRouter (Llama 4)</option>
                  <option value="ollama">Ollama (localhost:11434)</option>
                </select>
              </label>

              {byoService !== 'ollama' && (
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                  {t('settings.apiKey')}
                  <input
                    type="password"
                    value={apiKey}
                    onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
                    placeholder={t('settings.apiKeyPlaceholder')}
                    data-testid="settings-api-key-input"
                    style={{ width: '100%', padding: '8px', marginTop: '4px', background: 'var(--color-surface, #1e1b2e)', color: 'inherit', borderRadius: '4px', border: '1px solid var(--color-border, #4b5563)' }}
                  />
                </label>
              )}

              <p style={{ fontSize: '0.75rem', opacity: 0.8, margin: '4px 0' }}>
                {t('settings.byoHint')}
              </p>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  class="settings-btn settings-btn--primary"
                  onClick={handleSaveApiKey}
                  data-testid="settings-save-key-btn"
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                >
                  {t('settings.saveKey')}
                </button>
                {apiKey && (
                  <button
                    type="button"
                    class="settings-btn settings-btn--secondary"
                    onClick={handleClearApiKey}
                    data-testid="settings-clear-key-btn"
                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  >
                    {t('settings.clearKey')}
                  </button>
                )}
              </div>

              {aiStatusMsg && (
                <p class="settings-status-msg" style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--color-success, #10b981)' }}>
                  {aiStatusMsg}
                </p>
              )}
            </div>
          )}
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
