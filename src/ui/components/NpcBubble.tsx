import { useEffect, useRef, useState } from 'preact/hooks';
import type { Tone } from '../../content/types';
import { REVEAL_MAX_MS, REVEAL_MS_PER_CHAR } from '../../engine/constants';

export interface NpcBubbleProps {
  npcName: string;
  npcRole: string;
  tone: Tone;
  statement: string;
  reaction?: string | null;
  isRevealing?: boolean;
  onSkipReveal?: () => void;
}

export function NpcBubble({
  npcName,
  npcRole,
  tone,
  statement,
  reaction,
  isRevealing = false,
  onSkipReveal,
}: NpcBubbleProps) {
  const [displayedLength, setDisplayedLength] = useState<number>(() =>
    isRevealing ? 0 : statement.length
  );
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRevealing) {
      setDisplayedLength(statement.length);
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplayedLength(statement.length);
      return;
    }

    setDisplayedLength(0);
    startTimeRef.current = null;

    const msPerChar = REVEAL_MS_PER_CHAR[tone] ?? 20;
    const durationMs = Math.min(statement.length * msPerChar, REVEAL_MAX_MS);

    if (durationMs <= 0 || statement.length === 0) {
      setDisplayedLength(statement.length);
      return;
    }

    const safeRAF = (cb: (time: number) => void): number => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(cb);
      }
      return setTimeout(() => cb(Date.now()), 16) as unknown as number;
    };

    const safeCAF = (id: number): void => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(id);
      } else {
        clearTimeout(id);
      }
    };

    const animate = (now: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }

      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      const chars = Math.min(statement.length, Math.floor(progress * statement.length));

      setDisplayedLength(chars);

      if (progress < 1) {
        frameRef.current = safeRAF(animate);
      } else {
        setDisplayedLength(statement.length);
      }
    };

    frameRef.current = safeRAF(animate);

    return () => {
      if (frameRef.current !== null) {
        safeCAF(frameRef.current);
      }
    };
  }, [isRevealing, statement, tone]);

  const handleUpperTap = () => {
    if (isRevealing) {
      if (frameRef.current !== null) {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(frameRef.current);
        } else {
          clearTimeout(frameRef.current);
        }
      }
      setDisplayedLength(statement.length);
      onSkipReveal?.();
    }
  };

  const visibleStatement = isRevealing ? statement.slice(0, displayedLength) : statement;

  return (
    <section
      class={`npc-bubble-container npc-bubble-container--${tone.toLowerCase()}`}
      onClick={handleUpperTap}
      data-testid="npc-bubble"
    >
      <header class="npc-bubble__meta">
        <span class="npc-bubble__name">{npcName}</span>
        <span class="npc-bubble__role">({npcRole})</span>
        <span class={`npc-bubble__tone-badge npc-bubble__tone-badge--${tone.toLowerCase()}`}>
          {tone}
        </span>
      </header>

      <div class="npc-bubble" aria-label={statement}>
        <p class="npc-bubble__text" data-testid="npc-statement-text">
          {visibleStatement}
        </p>
      </div>

      {reaction && (
        <div class="npc-reaction-bubble" data-testid="npc-reaction">
          <p class="npc-reaction-bubble__text">{reaction}</p>
        </div>
      )}
    </section>
  );
}
