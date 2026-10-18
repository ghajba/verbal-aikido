import type { Card as CardType, Scenario, ScenarioNode } from '../../content/types';
import { interpolate } from '../../engine/interpolate';
import { currentLocale, t } from '../../i18n/locale';
import { useSwipeUp } from '../hooks/useSwipeUp';
import { KEY_HINTS } from '../keyHints';
import { SWIPE_HORIZONTAL_FACTOR } from '../../engine/constants';

export interface CardPreviewProps {
  card: CardType;
  disabled?: boolean;
  onCommit: () => void;
  onCancel: () => void;
  scenarioNpc: Scenario['npc'];
  scenarioVariables: Scenario['variables'];
  nodeVariables?: ScenarioNode['variables'];
}

export function CardPreview({
  card,
  disabled = false,
  onCommit,
  onCancel,
  scenarioNpc,
  scenarioVariables,
  nodeVariables,
}: CardPreviewProps) {
  const { swipeState, pointerHandlers } = useSwipeUp({
    onCommit,
    disabled,
  });

  const fullText = interpolate(
    card.text,
    currentLocale.value,
    { npc: scenarioNpc, variables: scenarioVariables },
    { variables: nodeVariables }
  );

  const categoryLabel = t(`category.${card.category}` as any);

  let transformStyle = '';
  if (swipeState.isDragging) {
    const snapBonusY = swipeState.isPastCommit ? -12 : 0;
    transformStyle = `translate3d(${swipeState.dx * SWIPE_HORIZONTAL_FACTOR}px, ${
      swipeState.dy + snapBonusY
    }px, 0)`;
  }

  return (
    <div
      class={`card-preview card-preview--${card.category.toLowerCase()} ${
        swipeState.isDragging ? 'card-preview--dragging' : ''
      }`}
      data-testid="card-preview"
      style={transformStyle ? { transform: transformStyle } : undefined}
      {...pointerHandlers}
    >
      <header class="card-preview__header">
        <span class="card-preview__category">{categoryLabel}</span>
      </header>

      <div class="card-preview__body">
        <p class="card-preview__text" data-testid="card-preview-text">
          {fullText}
        </p>
      </div>

      <footer class="card-preview__actions">
        <button
          type="button"
          class="card-preview__btn card-preview__btn--cancel"
          onClick={onCancel}
          disabled={disabled}
          data-testid="preview-cancel-btn"
        >
          <span>{t('common.cancel')}</span>
          <span class="key-hint" aria-hidden="true">
            {KEY_HINTS.cancel}
          </span>
        </button>

        <button
          type="button"
          class="card-preview__btn card-preview__btn--apply"
          onClick={onCommit}
          disabled={disabled}
          data-testid="preview-apply-btn"
        >
          <span>{t('game.apply')}</span>
          <span class="key-hint" aria-hidden="true">
            {KEY_HINTS.apply}
          </span>
        </button>
      </footer>
    </div>
  );
}
