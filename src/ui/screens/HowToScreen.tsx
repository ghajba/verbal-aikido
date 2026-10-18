import { t } from '../../i18n/locale';
import { navigateTo } from '../router';

export function HowToScreen() {
  return (
    <div class="howto-screen" data-testid="howto-screen">
      <header class="howto-header">
        <button
          type="button"
          class="howto-back-btn"
          onClick={() => navigateTo({ name: 'home' })}
          data-testid="howto-back-btn"
        >
          ← {t('common.back')}
        </button>
        <h1 class="howto-title">{t('howto.title')}</h1>
      </header>

      <div class="howto-content">
        {/* Core Principles */}
        <section class="howto-card">
          <h2 class="howto-card__title">The Empathy Firewall</h2>
          <p class="howto-p">{t('howto.p1')}</p>
        </section>

        {/* Meters Explanation */}
        <section class="howto-card">
          <h2 class="howto-card__title">The 3 Meters</h2>
          <div class="howto-meters-list">
            <div class="howto-meter-item howto-meter-item--e">
              <span class="howto-meter-item__badge">{t('meter.E')}</span>
              <p>Partner's emotional intensity. Keep below 100 (loss at 100, panic at &gt;=70).</p>
            </div>
            <div class="howto-meter-item howto-meter-item--f">
              <span class="howto-meter-item__badge">{t('meter.F')}</span>
              <p>
                Your inner stability and composure. Keep above 0 (burnout at 0, panic at &lt;=30).
              </p>
            </div>
            <div class="howto-meter-item howto-meter-item--k">
              <span class="howto-meter-item__badge">{t('meter.K')}</span>
              <p>Mental shift / confusion in partner's attack trance. Reach 80 to WIN!</p>
            </div>
          </div>
        </section>

        {/* Card Styles */}
        <section class="howto-card">
          <h2 class="howto-card__title">Card Categories</h2>
          <p class="howto-p">{t('howto.p2')}</p>
          <div class="howto-categories-grid">
            <div class="howto-cat-item howto-cat-item--constructive">
              <strong>Constructive</strong>
              <span>{t('category.PACING')}</span>
              <span>{t('category.META_MODEL')}</span>
              <span>{t('category.REFRAMING')}</span>
            </div>
            <div class="howto-cat-item howto-cat-item--reactive">
              <strong>Reactive</strong>
              <span>{t('category.DEFENSE')}</span>
              <span>{t('category.ATTACK')}</span>
            </div>
          </div>
        </section>

        {/* Controls */}
        <section class="howto-card">
          <h2 class="howto-card__title">Controls & Panic Zone</h2>
          <p class="howto-p">{t('howto.p3')}</p>
          <p class="howto-p">{t('howto.p4')}</p>
        </section>

        <button
          type="button"
          class="howto-primary-btn"
          onClick={() => navigateTo({ name: 'home' })}
          data-testid="howto-home-btn"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}
