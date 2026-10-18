import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/preact';
import { NpcBubble } from '@/ui/components/NpcBubble';

describe('NpcBubble component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders metadata and statement text immediately when isRevealing is false', () => {
    render(
      <NpcBubble
        npcName="Kovács Anna"
        npcRole="Project Manager"
        tone="ANGRY"
        statement="Már megint képtelen voltál tartani a határidőt!"
      />
    );

    expect(screen.getByText('Kovács Anna')).toBeDefined();
    expect(screen.getByText('(Project Manager)')).toBeDefined();
    expect(screen.getByText('ANGRY')).toBeDefined();
    expect(screen.getByTestId('npc-statement-text').textContent).toBe(
      'Már megint képtelen voltál tartani a határidőt!'
    );
  });

  it('animates character-by-character when isRevealing is true', () => {
    let rAFCallbacks: Array<(time: number) => void> = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFCallbacks.push(cb);
      return rAFCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    render(
      <NpcBubble
        npcName="Kovács Anna"
        npcRole="PM"
        tone="ANGRY"
        statement="1234567890"
        isRevealing={true}
      />
    );

    const textEl = screen.getByTestId('npc-statement-text');
    expect(textEl.textContent).toBe('');

    // Advance first frame at now = 1000
    const cb1 = rAFCallbacks.shift();
    act(() => {
      cb1?.(1000);
    });
    expect(textEl.textContent).toBe('');

    // 10 chars * 16ms/char = 160ms. Halfway at 1080 -> 5 chars
    const cb2 = rAFCallbacks.shift();
    act(() => {
      cb2?.(1080);
    });
    expect(textEl.textContent).toBe('12345');

    // Finished at 1160
    const cb3 = rAFCallbacks.shift();
    act(() => {
      cb3?.(1160);
    });
    expect(textEl.textContent).toBe('1234567890');
  });

  it('skips reveal when tapped', () => {
    const onSkip = vi.fn();
    render(
      <NpcBubble
        npcName="Anna"
        npcRole="PM"
        tone="COLD"
        statement="Hosszú bejelentés..."
        isRevealing={true}
        onSkipReveal={onSkip}
      />
    );

    fireEvent.click(screen.getByTestId('npc-bubble'));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('npc-statement-text').textContent).toBe('Hosszú bejelentés...');
  });

  it('renders reaction bubble when reaction text is provided', () => {
    render(
      <NpcBubble
        npcName="Anna"
        npcRole="PM"
        tone="CALM"
        statement="Nyugodt mondat."
        reaction="Megértő biccentés."
      />
    );

    const reactionEl = screen.getByTestId('npc-reaction');
    expect(reactionEl).toBeDefined();
    expect(reactionEl.textContent).toContain('Megértő biccentés.');
  });

  it('displays full text immediately when reduced motion is preferred', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query.includes('prefers-reduced-motion: reduce'),
          media: query,
        }) as any
    );

    render(
      <NpcBubble
        npcName="Anna"
        npcRole="PM"
        tone="ANGRY"
        statement="Azonnali szöveg."
        isRevealing={true}
      />
    );

    expect(screen.getByTestId('npc-statement-text').textContent).toBe('Azonnali szöveg.');

    matchMediaSpy.mockRestore();
  });

  it('handles empty statement or durationMs <= 0', () => {
    render(<NpcBubble npcName="Anna" npcRole="PM" tone="CALM" statement="" isRevealing={true} />);
    expect(screen.getByTestId('npc-statement-text').textContent).toBe('');
  });

  it('falls back to default msPerChar when tone is unknown', () => {
    render(
      <NpcBubble
        npcName="Anna"
        npcRole="PM"
        tone={'UNKNOWN' as any}
        statement="Teszt"
        isRevealing={false}
      />
    );
    expect(screen.getByTestId('npc-statement-text').textContent).toBe('Teszt');
  });

  it('falls back to clearTimeout when cancelAnimationFrame is undefined during unmount or skip', () => {
    const origRAF = window.requestAnimationFrame;
    const origCAF = window.cancelAnimationFrame;
    // @ts-expect-error test override
    delete window.requestAnimationFrame;
    // @ts-expect-error test override
    delete window.cancelAnimationFrame;
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const { unmount } = render(
      <NpcBubble
        npcName="Anna"
        npcRole="PM"
        tone="CALM"
        statement="Teszt szöveg"
        isRevealing={true}
      />
    );
    fireEvent.click(screen.getByTestId('npc-bubble'));
    expect(clearTimeoutSpy).toHaveBeenCalled();

    unmount();
    window.requestAnimationFrame = origRAF;
    window.cancelAnimationFrame = origCAF;
    clearTimeoutSpy.mockRestore();
  });
});
