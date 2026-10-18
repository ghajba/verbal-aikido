import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { DropZone } from '@/ui/components/DropZone';
import { LiveRegion } from '@/ui/components/LiveRegion';
import type { Card as CardType, Scenario } from '@/content/types';

describe('DropZone and LiveRegion components', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders DropZone in empty state and occupied state with committed card', () => {
    const { rerender } = render(<DropZone committedCard={null} />);
    const dropZone = screen.getByTestId('drop-zone');
    expect(dropZone.classList.contains('drop-zone--empty')).toBe(true);

    const mockCard: CardType = {
      cardId: 'c_pace_01',
      category: 'PACING',
      text: { hu: 'Pacing szöveg', en: 'Pacing text', de: 'Pacing Text' },
      delta: { escalation: -20, grounding: 10, confusion: 10 },
      npcReaction: { hu: 'Reakció', en: 'Reaction', de: 'Reaktion' },
      nextNodeId: null,
    };

    const mockNpc: Scenario['npc'] = {
      name: { hu: 'Anna', en: 'Anna', de: 'Anna' },
      role: { hu: 'PM', en: 'PM', de: 'PM' },
    };

    rerender(<DropZone committedCard={mockCard} scenarioNpc={mockNpc} scenarioVariables={{}} />);

    expect(screen.getByTestId('drop-zone').classList.contains('drop-zone--occupied')).toBe(true);
    expect(screen.getByText('Pacing text')).toBeDefined();
  });

  it('renders LiveRegion with polite and assertive regions', () => {
    render(
      <LiveRegion politeMessage="Eszkaláció új értéke: 45" assertiveMessage="Még 5 másodperc." />
    );

    const polite = screen.getByTestId('live-polite');
    expect(polite.getAttribute('aria-live')).toBe('polite');
    expect(polite.textContent).toBe('Eszkaláció új értéke: 45');

    const assertive = screen.getByTestId('live-assertive');
    expect(assertive.getAttribute('aria-live')).toBe('assertive');
    expect(assertive.textContent).toBe('Még 5 másodperc.');
  });
});
