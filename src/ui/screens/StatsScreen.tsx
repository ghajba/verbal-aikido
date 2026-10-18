import { useEffect, useState } from 'preact/hooks';
import type { StorageDriver } from '../../storage/types';
import type { RunSummary } from '../../engine/stats';
import type { ScenarioProgress } from '../../storage/types';
import { currentLocale, t } from '../../i18n/locale';
import { navigateTo } from '../router';
import { catalog } from '../scenarios';

export interface StatsScreenProps {
  storage: StorageDriver;
}

export function StatsScreen({ storage }: StatsScreenProps) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ScenarioProgress | null>>({});
  const [loading, setLoading] = useState(true);

  const manifests = catalog.scenarios;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const allRuns = await storage.getAll<RunSummary>('runs');
        allRuns.sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
        const map: Record<string, ScenarioProgress | null> = {};
        for (const m of manifests) {
          const p = await storage.get<ScenarioProgress>('progress', m.id);
          map[m.id] = p ?? null;
        }
        if (mounted) {
          setRuns(allRuns);
          setProgressMap(map);
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to load stats', e);
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [storage]);

  if (loading) {
    return (
      <div class="stats-screen stats-screen--loading" data-testid="stats-loading">
        <p>Loading stats...</p>
      </div>
    );
  }

  // Calculate aggregates over recent runs
  const totalCompleted = runs.length;
  const winsCount = runs.filter((r) => r.outcome.startsWith('WIN')).length;
  const winRate = totalCompleted > 0 ? Math.round((winsCount / totalCompleted) * 100) : 0;

  const totalConstructive = runs.reduce((acc, r) => acc + (r.constructiveCount || 0), 0);
  const totalReactive = runs.reduce((acc, r) => acc + (r.reactiveCount || 0), 0);
  const totalActions = totalConstructive + totalReactive;
  const constructiveRatio =
    totalActions > 0 ? Math.round((totalConstructive / totalActions) * 100) : 0;

  const totalPanicSec = Math.round(runs.reduce((acc, r) => acc + (r.panicSec || 0), 0) * 10) / 10;
  const runsWithRto = runs.filter((r) => r.rtoSec !== null);
  const avgRtoSec =
    runsWithRto.length > 0
      ? Math.round((runsWithRto.reduce((acc, r) => acc + r.rtoSec!, 0) / runsWithRto.length) * 10) /
        10
      : null;

  const dateFormatter = new Intl.DateTimeFormat(currentLocale.value, { dateStyle: 'medium' });

  return (
    <div class="stats-screen" data-testid="stats-screen">
      <header class="stats-header">
        <button
          type="button"
          class="stats-back-btn"
          onClick={() => navigateTo({ name: 'home' })}
          data-testid="stats-back-btn"
        >
          ← {t('common.back')}
        </button>
        <h1 class="stats-title">{t('stats.title')}</h1>
      </header>

      <div class="stats-content">
        {/* Career Summary Cards */}
        <section class="stats-summary-grid">
          <div class="stats-card">
            <span class="stats-card__label">Games Played</span>
            <span class="stats-card__value">{totalCompleted}</span>
          </div>

          <div class="stats-card">
            <span class="stats-card__label">Win Rate</span>
            <span class="stats-card__value">{winRate}%</span>
          </div>

          <div class="stats-card">
            <span class="stats-card__label">
              {t('stats.ratioLast50', { pct: constructiveRatio })}
            </span>
            <span class="stats-card__value">{constructiveRatio}%</span>
          </div>

          <div class="stats-card">
            <span class="stats-card__label">Total Panic Time</span>
            <span class="stats-card__value">{totalPanicSec} s</span>
          </div>

          {avgRtoSec !== null && (
            <div class="stats-card">
              <span class="stats-card__label">Average RTO</span>
              <span class="stats-card__value">{avgRtoSec} s</span>
            </div>
          )}
        </section>

        {/* Per-Scenario Progress */}
        <section class="stats-section">
          <h2 class="stats-section__title">{t('home.title')}</h2>
          <div class="stats-scenarios-list">
            {manifests.map((manifest) => {
              const prog = progressMap[manifest.id];
              const title = manifest.title[currentLocale.value] ?? manifest.title.en;

              return (
                <div key={manifest.id} class="stats-scenario-row">
                  <div class="stats-scenario-row__header">
                    <span class="stats-scenario-row__title">{title}</span>
                    <span
                      class={`difficulty-badge difficulty-badge--${manifest.difficulty.toLowerCase()}`}
                    >
                      {t(`difficulty.${manifest.difficulty}` as any)}
                    </span>
                  </div>

                  {prog ? (
                    <div class="stats-scenario-row__body">
                      <span>
                        {t('home.best', { outcome: t(`outcomeShort.${prog.bestOutcome}` as any) })}
                      </span>
                      {prog.bestRtoSec !== null && (
                        <span>{t('home.bestRto', { sec: prog.bestRtoSec })}</span>
                      )}
                      <span class="stats-scenario-row__date">
                        {dateFormatter.format(new Date(prog.lastPlayedAt))}
                      </span>
                    </div>
                  ) : (
                    <div class="stats-scenario-row__empty">Not played yet</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Runs History */}
        {runs.length > 0 && (
          <section class="stats-section">
            <h2 class="stats-section__title">Recent Runs</h2>
            <div class="stats-recent-list">
              {runs.slice(0, 10).map((r) => (
                <div
                  key={r.runId}
                  class="stats-recent-item"
                  onClick={() => navigateTo({ name: 'debrief', runId: r.runId })}
                  role="button"
                  tabIndex={0}
                  data-testid={`stats-run-${r.runId}`}
                >
                  <div class="stats-recent-item__left">
                    <span
                      class={`outcome-badge outcome-badge--${r.outcome.startsWith('WIN') ? 'win' : 'loss'}`}
                    >
                      {t(`outcomeShort.${r.outcome}` as any)}
                    </span>
                    <span class="stats-recent-item__turns">{r.turns} turns</span>
                  </div>
                  <div class="stats-recent-item__right">
                    <span>{r.panicSec}s panic</span>
                    <span class="stats-recent-item__arrow">→</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
