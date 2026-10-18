import { catalog } from '../scenarios';
import { navigateTo } from '../router';
import { currentLocale, setLocale, t, pick } from '../../i18n/locale';
import type { CatalogEntry, Locale, PersonaId } from '../../content/types';

export function HomeScreen() {
  const scenarios: CatalogEntry[] = catalog.scenarios;

  const handleLanguageChange = (lang: Locale) => {
    setLocale(lang);
  };

  return (
    <div class="home-screen" data-testid="home-screen">
      <header class="home-header">
        <div class="home-header__brand">
          <h1 class="home-header__title">Verbal Aikido</h1>
          <p class="home-header__subtitle">{t('app.tagline')}</p>
        </div>

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
    </div>
  );
}
