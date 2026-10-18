import { useEffect, useState } from 'preact/hooks';
import { catalog } from '../scenarios';
import { navigateTo } from '../router';
import { currentLocale, setLocale, t, pick } from '../../i18n/locale';
import type { CatalogEntry, Locale, PersonaId } from '../../content/types';
import type { StorageDriver } from '../../storage/types';
import type { RunState } from '../../engine/types';

export interface HomeScreenProps {
  storage?: StorageDriver | null;
}

export function HomeScreen({ storage }: HomeScreenProps) {
  const scenarios: CatalogEntry[] = catalog.scenarios;
  const [activeSavedRun, setActiveSavedRun] = useState<RunState | null>(null);

  useEffect(() => {
    if (!storage) return;
    storage
      .get<RunState>('currentRun', 'active')
      .then((run) => {
        if (run && run.scenarioId) {
          setActiveSavedRun(run);
        }
      })
      .catch(console.error);
  }, [storage]);

  const handleLanguageChange = (lang: Locale) => {
    setLocale(lang);
  };

  const handleContinueSavedRun = () => {
    if (activeSavedRun) {
      navigateTo({ name: 'game', scenarioId: activeSavedRun.scenarioId });
      setActiveSavedRun(null);
    }
  };

  const handleRestartSavedRun = async () => {
    if (storage) {
      await storage.delete('currentRun', 'active');
    }
    setActiveSavedRun(null);
  };

  return (
    <div class="home-screen" data-testid="home-screen">
      <header class="home-header">
        <div class="home-header__brand">
          <h1 class="home-header__title">Verbal Aikido</h1>
          <p class="home-header__subtitle">{t('app.tagline')}</p>
        </div>

        <div class="home-header__actions">
          <button
            type="button"
            class="home-nav-btn"
            onClick={() => navigateTo({ name: 'howto' })}
            aria-label={t('howto.title')}
            title={t('howto.title')}
            data-testid="nav-howto-btn"
          >
            ❓
          </button>
          <button
            type="button"
            class="home-nav-btn"
            onClick={() => navigateTo({ name: 'stats' })}
            aria-label={t('stats.title')}
            title={t('stats.title')}
            data-testid="nav-stats-btn"
          >
            📊
          </button>
          <button
            type="button"
            class="home-nav-btn"
            onClick={() => navigateTo({ name: 'settings' })}
            aria-label={t('settings.title')}
            title={t('settings.title')}
            data-testid="nav-settings-btn"
          >
            ⚙️
          </button>

          <nav class="lang-selector" aria-label="Language selector">
            {(['en', 'hu', 'de'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                class={`lang-btn ${currentLocale.value === lang ? 'lang-btn--active' : ''}`}
                onClick={() => handleLanguageChange(lang)}
                aria-pressed={currentLocale.value === lang}
                data-testid={`lang-btn-${lang}`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main class="home-content">
        <h2 class="home-section-title">{t('home.title')}</h2>

        <div class="scenario-grid" data-testid="scenario-grid">
          {scenarios.map((item: CatalogEntry) => {
            const title = pick(item.title, currentLocale.value);
            const summary = pick(item.summary, currentLocale.value);
            const difficultyLabel = t(`difficulty.${item.difficulty}` as any);

            return (
              <article key={item.id} class="scenario-card" data-testid={`scenario-card-${item.id}`}>
                <div class="scenario-card__header">
                  <span
                    class={`difficulty-badge difficulty-badge--${item.difficulty.toLowerCase()}`}
                  >
                    {difficultyLabel}
                  </span>
                  {item.personas.map((p: PersonaId) => (
                    <span key={p} class="persona-badge">
                      {p === 'P1_MANAGER' ? 'Manager' : 'Frontline'}
                    </span>
                  ))}
                </div>

                <h3 class="scenario-card__title">{title}</h3>
                <p class="scenario-card__summary">{summary}</p>

                <button
                  type="button"
                  class="scenario-card__action-btn"
                  onClick={() => navigateTo({ name: 'briefing', scenarioId: item.id })}
                  data-testid={`start-scenario-${item.id}`}
                >
                  {t('briefing.start')}
                </button>
              </article>
            );
          })}
        </div>
      </main>

      {/* Resume Unfinished Run Dialog */}
      {activeSavedRun && (
        <div
          class="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-resume-title"
          data-testid="resume-dialog"
        >
          <div class="dialog-box">
            <h2 id="dialog-resume-title" class="dialog-box__title">
              {t('resume.title')}
            </h2>
            <div class="dialog-buttons">
              <button
                type="button"
                class="dialog-btn dialog-btn--giveup"
                onClick={handleContinueSavedRun}
                data-testid="resume-continue-btn"
              >
                {t('resume.continue')}
              </button>
              <button
                type="button"
                class="dialog-btn dialog-btn--cancel"
                onClick={handleRestartSavedRun}
                data-testid="resume-restart-btn"
              >
                {t('resume.restart')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
