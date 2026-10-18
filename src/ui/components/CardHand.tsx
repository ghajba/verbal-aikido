import type { Card as CardType, Scenario, ScenarioNode } from '../../content/types';
import { t } from '../../i18n/locale';
import { KEY_HINTS } from '../keyHints';
import { Card } from './Card';
import { CardPreview } from './CardPreview';

export interface CardHandProps {
  cards: CardType[];
  selectedCardId: string | null;
  committedCardId: string | null;
  isTransitioning: boolean;
  onSelectCard: (cardId: string) => void;
  onCommitCard: (cardId: string) => void;
  onCancelPreview: () => void;
  scenarioNpc: Scenario['npc'];
  scenarioVariables: Scenario['variables'];
  nodeVariables?: ScenarioNode['variables'];
}

const HINTS = [KEY_HINTS.card1, KEY_HINTS.card2, KEY_HINTS.card3];

export function CardHand({
  cards,
  selectedCardId,
  committedCardId,
  isTransitioning,
  onSelectCard,
  onCommitCard,
  onCancelPreview,
  scenarioNpc,
  scenarioVariables,
  nodeVariables,
}: CardHandProps) {
  const selectedCard = cards.find((c) => c.cardId === selectedCardId);

  return (
    <div
      class="card-hand-wrapper"
      role="group"
      aria-label={t('game.hand')}
      aria-busy={isTransitioning}
      data-testid="card-hand"
    >
      <div class="card-hand">
        {cards.map((card, index) => {
          const isSelected = card.cardId === selectedCardId;
          const isFlown = card.cardId === committedCardId;
          const isFadedOut = committedCardId !== null && card.cardId !== committedCardId;

          return (
            <Card
              key={card.cardId}
              card={card}
              index={index}
              isSelected={isSelected}
              isFlown={isFlown}
              isFadedOut={isFadedOut}
              disabled={isTransitioning || committedCardId !== null}
              onSelect={() => onSelectCard(card.cardId)}
              onCommit={() => onCommitCard(card.cardId)}
              keyHint={HINTS[index]}
              scenarioNpc={scenarioNpc}
              scenarioVariables={scenarioVariables}
              nodeVariables={nodeVariables}
            />
          );
        })}
      </div>

      {selectedCard && committedCardId === null && (
        <CardPreview
          card={selectedCard}
          disabled={isTransitioning}
          onCommit={() => onCommitCard(selectedCard.cardId)}
          onCancel={onCancelPreview}
          scenarioNpc={scenarioNpc}
          scenarioVariables={scenarioVariables}
          nodeVariables={nodeVariables}
        />
      )}
    </div>
  );
}
