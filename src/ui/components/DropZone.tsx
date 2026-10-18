import type { Card as CardType, Scenario, ScenarioNode } from '../../content/types';
import { interpolate } from '../../engine/interpolate';
import { currentLocale, t } from '../../i18n/locale';

export interface DropZoneProps {
  committedCard?: CardType | null;
  scenarioNpc?: Scenario['npc'];
  scenarioVariables?: Scenario['variables'];
  nodeVariables?: ScenarioNode['variables'];
}

export function DropZone({
  committedCard,
  scenarioNpc,
  scenarioVariables,
  nodeVariables,
}: DropZoneProps) {
  let cardText = '';
  let categoryLabel = '';

  if (committedCard && scenarioNpc && scenarioVariables) {
    cardText = interpolate(
      committedCard.text,
      currentLocale.value,
      { npc: scenarioNpc, variables: scenarioVariables },
      { variables: nodeVariables }
    );
    categoryLabel = t(`category.${committedCard.category}` as any);
  }

  return (
    <div
      class={`drop-zone ${committedCard ? 'drop-zone--occupied' : 'drop-zone--empty'}`}
      data-testid="drop-zone"
      aria-hidden="true"
    >
      {committedCard ? (
        <div class={`drop-zone__card drop-zone__card--${committedCard.category.toLowerCase()}`}>
          <span class="drop-zone__category">{categoryLabel}</span>
          <p class="drop-zone__text">{cardText}</p>
        </div>
      ) : (
        <span class="drop-zone__placeholder" />
      )}
    </div>
  );
}
