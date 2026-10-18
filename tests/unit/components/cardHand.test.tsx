import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { CardHand } from '@/ui/components/CardHand';
import { setLocale } from '@/i18n/locale';
import type { Card as CardType, Scenario } from '@/content/types';

const mockNpc: Scenario['npc'] = {
  name: { hu: 'Kovács Anna', en: 'Anna Kovacs', de: 'Anna Kovacs' },
  role: { hu: 'Projektvezető', en: 'Project Manager', de: 'Projektleiterin' },
};

const mockCards: CardType[] = [
  {
    cardId: 'c_pace_01',
    category: 'PACING',
    text: { hu: 'Pacing kártya', en: 'Pacing card', de: 'Pacing Karte' },
    delta: { escalation: -20, grounding: 10, confusion: 10 },
    npcReaction: { hu: 'Reakció 1', en: 'Reaction 1', de: 'Reaktion 1' },
    nextNodeId: 'n2',
  },
  {
    cardId: 'c_meta_01',
    category: 'META_MODEL',
    text: { hu: 'Meta kártya', en: 'Meta card', de: 'Meta Karte' },
    delta: { escalation: 0, grounding: 0, confusion: 30 },
    npcReaction: { hu: 'Reakció 2', en: 'Reaction 2', de: 'Reaktion 2' },
    nextNodeId: 'n2',
  },
  {
    cardId: 'c_def_01',
    category: 'DEFENSE',
    text: { hu: 'Defense kártya', en: 'Defense card', de: 'Defense Karte' },
    delta: { escalation: 20, grounding: -15, confusion: 0 },
    npcReaction: { hu: 'Reakció 3', en: 'Reaction 3', de: 'Reaktion 3' },
    nextNodeId: 'n2',
  },
];

describe('CardHand component', () => {
  beforeEach(() => {
    setLocale('hu');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders 3 cards inside a group container with proper a11y attributes', () => {
    render(
      <CardHand
        cards={mockCards}
        selectedCardId={null}
        committedCardId={null}
        isTransitioning={false}
        onSelectCard={vi.fn()}
        onCommitCard={vi.fn()}
        onCancelPreview={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={{}}
      />
    );

    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toBe('Válaszkártyák');
    expect(group.getAttribute('aria-busy')).toBe('false');

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(3);
  });

  it('renders CardPreview overlay when a card is selected', () => {
    const onCancel = vi.fn();
    const onCommit = vi.fn();

    const { rerender } = render(
      <CardHand
        cards={mockCards}
        selectedCardId="c_meta_01"
        committedCardId={null}
        isTransitioning={false}
        onSelectCard={vi.fn()}
        onCommitCard={onCommit}
        onCancelPreview={onCancel}
        scenarioNpc={mockNpc}
        scenarioVariables={{}}
      />
    );

    const preview = screen.getByTestId('card-preview');
    expect(preview).toBeDefined();
    expect(screen.getByTestId('card-preview-text').textContent).toBe('Meta kártya');

    // Clicking cancel calls onCancelPreview
    fireEvent.click(screen.getByTestId('preview-cancel-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Clicking apply calls onCommitCard
    fireEvent.click(screen.getByTestId('preview-apply-btn'));
    expect(onCommit).toHaveBeenCalledWith('c_meta_01');

    // Deselect closes preview
    rerender(
      <CardHand
        cards={mockCards}
        selectedCardId={null}
        committedCardId={null}
        isTransitioning={false}
        onSelectCard={vi.fn()}
        onCommitCard={onCommit}
        onCancelPreview={onCancel}
        scenarioNpc={mockNpc}
        scenarioVariables={{}}
      />
    );
    expect(screen.queryByTestId('card-preview')).toBeNull();
  });

  it('marks committed card as flown and others as faded', () => {
    render(
      <CardHand
        cards={mockCards}
        selectedCardId={null}
        committedCardId="c_pace_01"
        isTransitioning={true}
        onSelectCard={vi.fn()}
        onCommitCard={vi.fn()}
        onCancelPreview={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={{}}
      />
    );

    const buttons = screen.getAllByRole('button');
    const flownBtn = buttons.find((b) => b.getAttribute('data-card-id') === 'c_pace_01');
    const fadedBtn = buttons.find((b) => b.getAttribute('data-card-id') === 'c_meta_01');

    expect(flownBtn?.classList.contains('card--flown')).toBe(true);
    expect(fadedBtn?.classList.contains('card--faded')).toBe(true);
  });
});
