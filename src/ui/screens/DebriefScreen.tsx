import { useEffect, useRef, useState } from 'preact/hooks';
import type { Scenario, ScenarioNode } from '../../content/types';
import type { StorageDriver } from '../../storage/types';
import type { RunSummary } from '../../engine/stats';
import { getDominantCategory } from '../../engine/stats';
import { interpolate } from '../../engine/interpolate';
import { currentLocale, t } from '../../i18n/locale';
import { navigateTo } from '../router';
import { loadScenario } from '../scenarios';

export interface DebriefScreenProps {
  runId: string;
  storage: StorageDriver;
}

export function DebriefScreen({ runId, storage }: DebriefScreenProps) {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    let mounted = true;
    storage
      .get<RunSummary>('runs', runId)
      .then(async (run) => {
        if (!mounted || !run) {
          setLoading(false);
          return;
        }
        setSummary(run);
        try {
          const scen = await loadScenario(run.scenarioId);
          if (mounted) {
            setScenario(scen);
          }
        } catch (e) {
          console.error('Failed to load scenario for debrief', e);
        }
        if (mounted) {
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('Failed to load run for debrief', e);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [runId, storage]);

  // Focus management per Section 18: focus moves to headline on debrief entry
  useEffect(() => {
    if (!loading && summary) {
      headlineRef.current?.focus();
    }
  }, [loading, summary]);

  if (loading) {
    return (
      <div class="debrief-screen debrief-screen--loading" data-testid="debrief-loading">
        <p>Loading summary...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div class="debrief-screen" data-testid="debrief-not-found">
        <header class="debrief-header">
          <h2>{t('debrief.title')}</h2>
        </header>
        <p>{t('errors.generic')}</p>
        <button
          type="button"
          class="debrief-btn debrief-btn--primary"
          onClick={() => navigateTo({ name: 'home' })}
        >
          {t('debrief.toList')}
        </button>
      </div>
    );
  }

  const dominantCategory = getDominantCategory(summary.categoryCounts);
  const totalCards = summary.constructiveCount + summary.reactiveCount || 1;
  const constructivePct = Math.round((summary.constructiveCount / totalCards) * 100);

  // Compute Sparkline points for timeline
  const svgWidth = 320;
  const svgHeight = 120;
  const padX = 20;
  const padY = 16;
  const innerW = svgWidth - 2 * padX;
  const innerH = svgHeight - 2 * padY;

  const turnsCount = Math.max(1, summary.history.length);
  const getX = (step: number) => padX + (step / turnsCount) * innerW;
  const getY = (val: number) => padY + innerH - (val / 100) * innerH;

  // Build timeline data points: start with initial turn 0 before metrics, then each turn after
  const timelinePoints = [
    summary.history[0]?.before ?? { escalation: 50, grounding: 50, confusion: 0 },
    ...summary.history.map((h) => h.after),
  ];

  const ePoints = timelinePoints.map((m, i) => `${getX(i)},${getY(m.escalation)}`).join(' ');
  const fPoints = timelinePoints.map((m, i) => `${getX(i)},${getY(m.grounding)}`).join(' ');
  const kPoints = timelinePoints.map((m, i) => `${getX(i)},${getY(m.confusion)}`).join(' ');

  const panicEY = getY(70);
  const panicFY = getY(30);

  // Map turn records with scenario details
  const allCards = scenario?.nodes.flatMap((n) => n.availableCards) ?? [];
  const nodeMap = new Map<string, ScenarioNode>(scenario?.nodes.map((n) => [n.nodeId, n]) ?? []);

  const isWin = summary.outcome.startsWith('WIN');
  const isLoss = summary.outcome.startsWith('LOSS');

  return (
    <div class="debrief-screen" data-testid="debrief-screen">
      {/* 1. Outcome Headline */}
      <div
        class={`debrief-banner ${
          isWin
            ? 'debrief-banner--win'
            : isLoss
              ? 'debrief-banner--loss'
              : 'debrief-banner--neutral'
        }`}
      >
        <span class="debrief-banner__badge">{t(`outcomeShort.${summary.outcome}` as any)}</span>
        <h1
          ref={headlineRef}
          class="debrief-banner__headline"
          tabIndex={-1}
          data-testid="debrief-headline"
        >
          {t(`outcome.${summary.outcome}` as any)}
        </h1>
      </div>

      {/* 2. Key Numbers Cards */}
      <section class="debrief-stats-grid" aria-label="Key metrics">
        <div class="debrief-stat-card">
          <span class="debrief-stat-card__label">{t('game.turn', { n: summary.turns })}</span>
          <span class="debrief-stat-card__value">{summary.turns} / 7</span>
        </div>

        <div class="debrief-stat-card">
          <span class="debrief-stat-card__label">
            {summary.panicSec > 0
              ? t('debrief.panicSec', { sec: summary.panicSec })
              : t('debrief.noPanic')}
          </span>
          <span class="debrief-stat-card__value">
            {summary.panicSec > 0 ? `${summary.panicSec} s` : '0 s'}
          </span>
        </div>

        {summary.rtoSec !== null && (
          <div class="debrief-stat-card">
            <span class="debrief-stat-card__label">
              {t('debrief.rto', { sec: summary.rtoSec })}
            </span>
            <span class="debrief-stat-card__value">{summary.rtoSec} s</span>
          </div>
        )}

        {summary.unrecoveredPanic && (
          <div class="debrief-stat-card debrief-stat-card--alert">
            <span class="debrief-stat-card__value">{t('debrief.unrecovered')}</span>
          </div>
        )}
      </section>

      {/* 3. Card Style & Coaching Tip */}
      <section class="debrief-style-section">
        <h2 class="debrief-section-title">
          {t('debrief.dominant', { style: t(`category.${dominantCategory}` as any) })}
        </h2>

        <div class="debrief-ratio-badge">{t('debrief.ratio', { pct: constructivePct })}</div>

        {/* Category distribution bars */}
        <div class="debrief-category-bars">
          {(['PACING', 'META_MODEL', 'REFRAMING', 'DEFENSE', 'ATTACK'] as const).map((cat) => {
            const count = summary.categoryCounts[cat] || 0;
            const pct = Math.round((count / totalCards) * 100);
            return (
              <div key={cat} class="debrief-category-row">
                <span class="debrief-category-row__label">{t(`category.${cat}` as any)}</span>
                <div class="debrief-category-row__track">
                  <div
                    class={`debrief-category-row__fill debrief-category-row__fill--${cat.toLowerCase()}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span class="debrief-category-row__count">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Coaching tip */}
        <div class="debrief-coaching-box" data-testid="debrief-coaching-tip">
          <p>{t(`debrief.tip.${dominantCategory}` as any)}</p>
        </div>
      </section>

      {/* 4. Timeline SVG Sparkline */}
      <section class="debrief-timeline-section">
        <h2 class="debrief-section-title">{t('debrief.timeline')}</h2>

        <div class="debrief-sparkline-container">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            class="debrief-sparkline-svg"
            role="img"
            aria-label="Timeline chart of Escalation, Grounding and Trance meters over turns"
          >
            {/* Panic threshold lines */}
            <line
              x1={padX}
              y1={panicEY}
              x2={svgWidth - padX}
              y2={panicEY}
              stroke="#ef4444"
              stroke-dasharray="4 4"
              stroke-opacity="0.4"
            />
            <line
              x1={padX}
              y1={panicFY}
              x2={svgWidth - padX}
              y2={panicFY}
              stroke="#10b981"
              stroke-dasharray="4 4"
              stroke-opacity="0.4"
            />

            {/* Metrix Polylines */}
            <polyline fill="none" stroke="#ef4444" stroke-width="2.5" points={ePoints} />
            <polyline fill="none" stroke="#10b981" stroke-width="2.5" points={fPoints} />
            <polyline fill="none" stroke="#38bdf8" stroke-width="2.5" points={kPoints} />

            {/* Turn dots */}
            {timelinePoints.map((m, i) => (
              <g key={i}>
                <circle cx={getX(i)} cy={getY(m.escalation)} r="3" fill="#ef4444" />
                <circle cx={getX(i)} cy={getY(m.grounding)} r="3" fill="#10b981" />
                <circle cx={getX(i)} cy={getY(m.confusion)} r="3" fill="#38bdf8" />
              </g>
            ))}
          </svg>

          {/* Accessible Screen-reader only data table per Section 16.2 */}
          <table class="sr-only">
            <caption>Timeline data</caption>
            <thead>
              <tr>
                <th scope="col">Turn</th>
                <th scope="col">Escalation</th>
                <th scope="col">Grounding</th>
                <th scope="col">Trance</th>
              </tr>
            </thead>
            <tbody>
              {timelinePoints.map((m, i) => (
                <tr key={i}>
                  <td>{i}</td>
                  <td>{m.escalation}</td>
                  <td>{m.grounding}</td>
                  <td>{m.confusion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div class="debrief-sparkline-legend">
          <span class="legend-item legend-item--e">
            <span class="legend-item__dot" />
            {t('meter.E')}
          </span>
          <span class="legend-item legend-item--f">
            <span class="legend-item__dot" />
            {t('meter.F')}
          </span>
          <span class="legend-item legend-item--k">
            <span class="legend-item__dot" />
            {t('meter.K')}
          </span>
        </div>
      </section>

      {/* 5. Turn by Turn History */}
      <section class="debrief-turns-section">
        <h2 class="debrief-section-title">{t('debrief.turns')}</h2>
        <div class="debrief-turns-list">
          {summary.history.map((record) => {
            const node = nodeMap.get(record.nodeId);
            const card = allCards.find((c) => c.cardId === record.cardId);

            const npcText =
              node && scenario
                ? interpolate(
                    node.npcStatement,
                    currentLocale.value,
                    { npc: scenario.npc, variables: scenario.variables },
                    { variables: node.variables }
                  )
                : record.nodeId;

            const cardText =
              card && scenario
                ? interpolate(
                    card.text,
                    currentLocale.value,
                    { npc: scenario.npc, variables: scenario.variables },
                    { variables: node?.variables }
                  )
                : record.cardId;

            const hintObj = card?.debriefHint;
            const debriefHint =
              hintObj && scenario
                ? interpolate(
                    hintObj,
                    currentLocale.value,
                    { npc: scenario.npc, variables: scenario.variables },
                    { variables: node?.variables }
                  )
                : null;

            const deltaE = record.after.escalation - record.before.escalation;
            const deltaF = record.after.grounding - record.before.grounding;
            const deltaK = record.after.confusion - record.before.confusion;

            return (
              <div key={record.turnIndex} class="debrief-turn-item">
                <div class="debrief-turn-item__header">
                  <span class="debrief-turn-item__num">
                    {t('game.turn', { n: record.turnIndex + 1 })}
                  </span>
                  <span class="debrief-turn-item__category">
                    {t(`category.${record.category}` as any)}
                  </span>
                </div>

                <div class="debrief-turn-item__npc">
                  <strong>NPC:</strong> {npcText}
                </div>

                <div class="debrief-turn-item__player">
                  <strong>{t('game.apply')}:</strong> {cardText}
                </div>

                <div class="debrief-turn-item__deltas">
                  <span class={deltaE <= 0 ? 'delta-good' : 'delta-bad'}>
                    E: {deltaE > 0 ? `+${deltaE}` : deltaE}
                  </span>
                  <span class={deltaF >= 0 ? 'delta-good' : 'delta-bad'}>
                    F: {deltaF > 0 ? `+${deltaF}` : deltaF}
                  </span>
                  <span class={deltaK >= 0 ? 'delta-good' : 'delta-bad'}>
                    K: {deltaK > 0 ? `+${deltaK}` : deltaK}
                  </span>
                </div>

                {debriefHint && (
                  <div class="debrief-turn-item__hint">
                    <em>💡 {debriefHint}</em>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. Action Buttons */}
      <footer class="debrief-actions">
        <button
          type="button"
          class="debrief-btn debrief-btn--retry"
          onClick={() => navigateTo({ name: 'game', scenarioId: summary.scenarioId })}
          data-testid="debrief-retry-btn"
        >
          {t('debrief.retry')}
        </button>

        <button
          type="button"
          class="debrief-btn debrief-btn--list"
          onClick={() => navigateTo({ name: 'home' })}
          data-testid="debrief-to-list-btn"
        >
          {t('debrief.toList')}
        </button>
      </footer>
    </div>
  );
}
