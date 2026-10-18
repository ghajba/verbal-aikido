import { useState, useEffect } from 'preact/hooks';
import type { Scenario } from '../../content/types';
import { loadScenario } from '../scenarios';
import { navigateTo } from '../router';
import { interpolate } from '../../engine/interpolate';
import { currentLocale, t, pick } from '../../i18n/locale';

export interface BriefingScreenProps {
  scenarioId: string;
  scenario?: Scenario;
  onStart?: () => void;
  onBack?: () => void;
}

export function BriefingScreen({
  scenarioId,
  scenario: propScenario,
  onStart,
  onBack,
}: BriefingScreenProps) {
  const [scenario, setScenario] = useState<Scenario | null>(propScenario ?? null);

  useEffect(() => {
    if (propScenario) {
      setScenario(propScenario);
      return;
    }
    loadScenario(scenarioId)
      .then((s) => setScenario(s))
      .catch((err) => {
        console.error('Failed to load scenario:', err);
      });
  }, [scenarioId, propScenario]);

  if (!scenario) {
    return (
      <div class="briefing-screen briefing-screen--loading" data-testid="briefing-screen">
        <p>Loading...</p>
      </div>
    );
  }

  const title = pick(scenario.title, currentLocale.value);
  const npcName = pick(scenario.npc.name, currentLocale.value);
  const npcRole = pick(scenario.npc.role, currentLocale.value);
  const briefingText = interpolate(scenario.briefing, currentLocale.value, {
    npc: scenario.npc,
    variables: scenario.variables,
  });
  const difficultyLabel = t(`difficulty.${scenario.difficulty}` as any);

  const handleStart = () => {
    if (onStart) {
      onStart();
    } else {
      navigateTo({ name: 'game', scenarioId: scenario.id });
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigateTo({ name: 'home' });
    }
  };

  return (
    <div class="briefing-screen" data-testid="briefing-screen">
      <header class="briefing-header">
        <button
          type="button"
          class="briefing-back-btn"
          onClick={handleBack}
          aria-label={t('common.back')}
          data-testid="briefing-back-btn"
        >
          ← {t('common.back')}
        </button>
        <span class={`difficulty-badge difficulty-badge--${scenario.difficulty.toLowerCase()}`}>
          {difficultyLabel}
        </span>
      </header>

      <main class="briefing-content">
        <h1 class="briefing-title">{title}</h1>

        <section class="briefing-npc-card">
          <span class="briefing-npc-label">Partner:</span>
          <span class="briefing-npc-name">{npcName}</span>
          <span class="briefing-npc-role">({npcRole})</span>
        </section>

        <section class="briefing-body">
          <p class="briefing-text" data-testid="briefing-text">
            {briefingText}
          </p>
        </section>

        {scenario.decisionTimeLimitSec && (
          <section class="briefing-timer-alert" data-testid="briefing-timer-notice">
            ⏱ {t('briefing.timer', { sec: scenario.decisionTimeLimitSec })}
          </section>
        )}
      </main>

      <footer class="briefing-footer">
        <button
          type="button"
          class="briefing-start-btn"
          onClick={handleStart}
          data-testid="briefing-start-btn"
        >
          {t('briefing.start')}
        </button>
      </footer>
    </div>
  );
}
