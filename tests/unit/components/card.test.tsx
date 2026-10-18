import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
import { Card } from '@/ui/components/Card';
import { CardPreview } from '@/ui/components/CardPreview';
import { setLocale } from '@/i18n/locale';
import type { Card as CardType, Scenario } from '@/content/types';

const mockNpc: Scenario['npc'] = {
  name: { hu: 'Kovács Anna', en: 'Anna Kovacs', de: 'Anna Kovacs' },
  role: { hu: 'Projektvezető', en: 'Project Manager', de: 'Projektleiterin' },
};

const mockVariables: Scenario['variables'] = {
  trigger_word: { hu: 'határidő', en: 'deadline', de: 'Frist' },
};

const testCard: CardType = {
  cardId: 'c_pace_01',
  category: 'PACING',
  text: {
    hu: 'Látom, hogy a {trigger_word} miatt feszült vagy.',
    en: 'I see that you are tense about the {trigger_word}.',
    de: 'Ich sehe, dass Sie wegen der {trigger_word} angespannt sind.',
  },
  delta: { escalation: -20, grounding: 10, confusion: 10 },
  npcReaction: {
    hu: 'Igen, mert az ügyfél tombol!',
    en: 'Yes, because the client is furious!',
    de: 'Ja, weil der Kunde tobt!',
  },
  nextNodeId: 'node_2',
};

describe('Card component', () => {
  beforeEach(() => {
    setLocale('hu');
    if (typeof globalThis.PointerEvent === 'undefined') {
      class TestPointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, params: any = {}) {
          super(type, params);
          this.pointerId = params.pointerId ?? 0;
          Object.defineProperty(this, 'clientX', { value: params.clientX ?? 0 });
          Object.defineProperty(this, 'clientY', { value: params.clientY ?? 0 });
          Object.defineProperty(this, 'button', { value: params.button ?? 0 });
        }
      }
      globalThis.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
    }
    globalThis.ResizeObserver = class {
      private cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        this.cb();
      }
      disconnect() {}
      unobserve() {}
    } as any;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders category header and interpolated card text', () => {
    render(
      <Card
        card={testCard}
        index={0}
        isSelected={false}
        onSelect={vi.fn()}
        onCommit={vi.fn()}
        keyHint="1"
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    const button = screen.getByRole('button');
    expect(button.classList.contains('card--pacing')).toBe(true);
    expect(screen.getByText('Pacing / Validálás')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByTestId('card-text-c_pace_01').textContent).toContain(
      'Látom, hogy a határidő miatt feszült vagy.'
    );
  });

  it('handles selected, flown, and faded states', () => {
    const { rerender } = render(
      <Card
        card={testCard}
        index={0}
        isSelected={true}
        onSelect={vi.fn()}
        onCommit={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    expect(screen.getByRole('button').classList.contains('card--selected')).toBe(true);

    rerender(
      <Card
        card={testCard}
        index={0}
        isSelected={false}
        isFlown={true}
        onSelect={vi.fn()}
        onCommit={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );
    expect(screen.getByRole('button').classList.contains('card--flown')).toBe(true);

    rerender(
      <Card
        card={testCard}
        index={0}
        isSelected={false}
        isFadedOut={true}
        onSelect={vi.fn()}
        onCommit={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );
    expect(screen.getByRole('button').classList.contains('card--faded')).toBe(true);
  });

  it('calls onSelect on tap', () => {
    const onSelect = vi.fn();
    render(
      <Card
        card={testCard}
        index={0}
        isSelected={false}
        onSelect={onSelect}
        onCommit={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders icons for all category types', () => {
    const categories: CardType['category'][] = ['META_MODEL', 'REFRAMING', 'DEFENSE', 'ATTACK'];

    for (const cat of categories) {
      cleanup();
      const card = { ...testCard, cardId: `c_${cat}`, category: cat };
      render(
        <Card
          card={card}
          index={0}
          isSelected={false}
          onSelect={vi.fn()}
          onCommit={vi.fn()}
          scenarioNpc={mockNpc}
          scenarioVariables={mockVariables}
        />
      );

      expect(screen.getByRole('button').classList.contains(`card--${cat.toLowerCase()}`)).toBe(
        true
      );
    }
  });
});

describe('CardPreview component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders full text and buttons, handling apply and cancel', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    render(
      <CardPreview
        card={testCard}
        onCommit={onCommit}
        onCancel={onCancel}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    expect(screen.getByTestId('card-preview-text').textContent).toContain(
      'Látom, hogy a határidő miatt feszült vagy.'
    );

    fireEvent.click(screen.getByTestId('preview-apply-btn'));
    expect(onCommit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('preview-cancel-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables action buttons when disabled is true', () => {
    render(
      <CardPreview
        card={testCard}
        disabled={true}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    const applyBtn = screen.getByTestId('preview-apply-btn') as HTMLButtonElement;
    const cancelBtn = screen.getByTestId('preview-cancel-btn') as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
  });

  it('updates CardPreview transform style while dragging', () => {
    render(
      <CardPreview
        card={testCard}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    const preview = screen.getByTestId('card-preview');
    act(() => {
      preview.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          button: 0,
        })
      );
      preview.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 110,
          clientY: 150,
          pointerId: 1,
        })
      );
    });

    expect(preview.classList.contains('card-preview--dragging')).toBe(true);
    expect(preview.style.transform).toContain('translate3d');
  });

  it('updates Card transform style while dragging', () => {
    render(
      <Card
        card={testCard}
        index={0}
        isSelected={false}
        onSelect={vi.fn()}
        onCommit={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    const cardBtn = screen.getByRole('button');
    act(() => {
      cardBtn.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
          button: 0,
        })
      );
      cardBtn.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 110,
          clientY: 150,
          pointerId: 1,
        })
      );
    });

    expect(cardBtn.classList.contains('card--dragging')).toBe(true);
    expect(cardBtn.style.transform).toContain('translate3d');
  });

  it('adds is-scrollable class when text overflows', () => {
    const origScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 100,
    });

    render(
      <Card
        card={testCard}
        index={0}
        isSelected={false}
        onSelect={vi.fn()}
        onCommit={vi.fn()}
        scenarioNpc={mockNpc}
        scenarioVariables={mockVariables}
      />
    );

    const cardText = screen.getByTestId(`card-text-${testCard.cardId}`);
    expect(cardText.classList.contains('is-scrollable')).toBe(true);

    if (origScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', origScrollHeight);
    }
    if (origClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', origClientHeight);
    }
  });
});
