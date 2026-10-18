import { useEffect, useRef, useState } from 'preact/hooks';
import type { Card as CardType, Scenario, ScenarioNode } from '../../content/types';
import { interpolate } from '../../engine/interpolate';
import { currentLocale, t } from '../../i18n/locale';
import { useSwipeUp } from '../hooks/useSwipeUp';
import { SWIPE_HORIZONTAL_FACTOR } from '../../engine/constants';

export interface CardProps {
  card: CardType;
  index: number;
  isSelected: boolean;
  isFlown?: boolean;
  isFadedOut?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onCommit: () => void;
  keyHint?: string;
  scenarioNpc: Scenario['npc'];
  scenarioVariables: Scenario['variables'];
  nodeVariables?: ScenarioNode['variables'];
}

function getCategoryIcon(category: CardType['category']) {
  switch (category) {
    case 'PACING':
      // Shield / Validate icon
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
        </svg>
      );
    case 'META_MODEL':
      // Clarify / Question icon
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" />
        </svg>
      );
    case 'REFRAMING':
      // Reframe / Pivot icon
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
        </svg>
      );
    case 'DEFENSE':
      // Defense / Block icon
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z" />
        </svg>
      );
    case 'ATTACK':
      // Attack / Lightning icon
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M7 2v11h3v9l7-12h-4l4-8z" />
        </svg>
      );
  }
}

export function Card({
  card,
  isSelected,
  isFlown = false,
  isFadedOut = false,
  disabled = false,
  onSelect,
  onCommit,
  keyHint,
  scenarioNpc,
  scenarioVariables,
  nodeVariables,
}: CardProps) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [flyVector, setFlyVector] = useState<{ dx: number; dy: number } | null>(null);
  const lastDragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const { swipeState, pointerHandlers } = useSwipeUp({
    onCommit: (offset) => {
      if (offset) {
        lastDragOffsetRef.current = offset;
      }
      onCommit();
    },
    onSelect,
    disabled: disabled || isFlown,
  });

  // Track drag position for smooth flight without jump
  if (swipeState.isDragging) {
    lastDragOffsetRef.current = { dx: swipeState.dx, dy: swipeState.dy };
  }

  // Handle smooth flight toward drop zone
  useEffect(() => {
    if (isFlown) {
      const cardEl = cardRef.current;
      const dropZone = document.querySelector('.drop-zone');
      if (cardEl && dropZone) {
        const cardRect = cardEl.getBoundingClientRect();
        const dropRect = dropZone.getBoundingClientRect();
        if (dropRect.height > 0 || dropRect.top > 0) {
          const currentDx = lastDragOffsetRef.current.dx * SWIPE_HORIZONTAL_FACTOR;
          const currentDy = lastDragOffsetRef.current.dy;
          const targetDx =
            dropRect.left + dropRect.width / 2 - (cardRect.left - currentDx + cardRect.width / 2);
          const targetDy =
            dropRect.top + dropRect.height / 2 - (cardRect.top - currentDy + cardRect.height / 2);
          setFlyVector({ dx: targetDx, dy: targetDy });
        } else {
          setFlyVector({ dx: 0, dy: -120 });
        }
      } else {
        setFlyVector({ dx: 0, dy: -120 });
      }
    } else {
      setFlyVector(null);
      lastDragOffsetRef.current = { dx: 0, dy: 0 };
    }
  }, [isFlown]);

  // Overflow detection with ResizeObserver per Section 16.3
  useEffect(() => {
    const el = textRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const checkOverflow = () => {
      const overflows = el.scrollHeight > el.clientHeight;
      setIsScrollable(overflows);
    };

    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);

    return () => ro.disconnect();
  }, [card.text]);

  const rawText = interpolate(
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
  } else if (flyVector) {
    transformStyle = `translate3d(${flyVector.dx}px, ${flyVector.dy}px, 0) scale(0.65)`;
  }

  return (
    <button
      ref={cardRef}
      type="button"
      class={`card card--${card.category.toLowerCase()} ${
        isSelected ? 'card--selected' : ''
      } ${isFlown ? 'card--flown' : ''} ${isFadedOut ? 'card--faded' : ''} ${
        swipeState.isDragging ? 'card--dragging' : ''
      } ${swipeState.isPastCommit ? 'card--past-commit' : ''}`}
      aria-selected={isSelected}
      aria-describedby={`card-category-${card.cardId}`}
      data-card-id={card.cardId}
      disabled={disabled}
      style={transformStyle ? { transform: transformStyle } : undefined}
      onClick={() => {
        if (!swipeState.isDragging && !disabled && !isFlown) {
          onSelect();
        }
      }}
      {...pointerHandlers}
    >
      {keyHint && (
        <span class="card__key-hint" aria-hidden="true">
          {keyHint}
        </span>
      )}

      <header class="card__header" id={`card-category-${card.cardId}`}>
        <span class="card__category-icon">{getCategoryIcon(card.category)}</span>
        <span class="card__category-name">{categoryLabel}</span>
      </header>

      <div
        ref={textRef}
        class={`card__text ${isScrollable ? 'is-scrollable' : ''}`}
        data-testid={`card-text-${card.cardId}`}
      >
        <p>{rawText}</p>
      </div>
    </button>
  );
}
