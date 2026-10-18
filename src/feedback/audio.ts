import type { Tone } from '../content/types';

export type Sound =
  | 'CARD_TAP'
  | 'CONSTRUCTIVE'
  | 'INQUIRY'
  | 'REACTIVE'
  | 'WIN'
  | 'LOSS'
  | 'NEUTRAL_END'
  | 'TIMER_WARN'
  | `TONE_${Tone}`;

interface NoteSpec {
  freq: number;
  durationMs: number;
  gain: number;
  together?: boolean;
}

const SOUND_TABLE: Record<Sound, NoteSpec[]> = {
  CARD_TAP: [{ freq: 880, durationMs: 40, gain: 0.5 }],
  CONSTRUCTIVE: [
    { freq: 523.25, durationMs: 110, gain: 0.8 },
    { freq: 659.25, durationMs: 160, gain: 0.8 },
  ],
  INQUIRY: [
    { freq: 659.25, durationMs: 90, gain: 0.7 },
    { freq: 783.99, durationMs: 90, gain: 0.7 },
    { freq: 659.25, durationMs: 120, gain: 0.6 },
  ],
  REACTIVE: [
    { freq: 233.08, durationMs: 220, gain: 0.9 },
    { freq: 196.0, durationMs: 280, gain: 0.9 },
  ],
  WIN: [
    { freq: 523.25, durationMs: 100, gain: 0.8 },
    { freq: 659.25, durationMs: 100, gain: 0.8 },
    { freq: 783.99, durationMs: 100, gain: 0.8 },
    { freq: 1046.5, durationMs: 100, gain: 0.8 },
  ],
  LOSS: [
    { freq: 196.0, durationMs: 200, gain: 0.9 },
    { freq: 164.81, durationMs: 200, gain: 0.9 },
    { freq: 130.81, durationMs: 200, gain: 0.9 },
  ],
  NEUTRAL_END: [
    { freq: 440, durationMs: 200, gain: 0.6 },
    { freq: 440, durationMs: 200, gain: 0.4 },
  ],
  TIMER_WARN: [{ freq: 1046.5, durationMs: 50, gain: 0.4 }],
  TONE_CALM: [{ freq: 261.63, durationMs: 180, gain: 0.3 }],
  TONE_TENSE: [
    { freq: 293.66, durationMs: 220, gain: 0.25, together: true },
    { freq: 311.13, durationMs: 220, gain: 0.25, together: true },
  ],
  TONE_ANGRY: [
    { freq: 220, durationMs: 260, gain: 0.3, together: true },
    { freq: 233.08, durationMs: 260, gain: 0.3, together: true },
  ],
  TONE_FURIOUS: [
    { freq: 196, durationMs: 320, gain: 0.35, together: true },
    { freq: 207.65, durationMs: 320, gain: 0.35, together: true },
  ],
  TONE_SARCASTIC: [
    { freq: 392, durationMs: 80, gain: 0.3 },
    { freq: 349.23, durationMs: 160, gain: 0.3 },
  ],
  TONE_COLD: [{ freq: 174.61, durationMs: 300, gain: 0.25 }],
};

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isMuted: boolean = false;
let unlocked: boolean = false;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      audioContext = new AudioCtx();
      masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0.15, audioContext.currentTime);
      masterGain.connect(audioContext.destination);
    } catch {
      return null;
    }
  }

  return audioContext;
}

export function unlockAudio(): void {
  const ctx = getContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  unlocked = true;
}

export function setMuted(m: boolean): void {
  isMuted = m;
}

export function getMuted(): boolean {
  return isMuted;
}

export function _resetAudioForTesting(): void {
  audioContext = null;
  masterGain = null;
  isMuted = false;
  unlocked = false;
}

export function play(s: Sound): void {
  if (isMuted) return;

  const ctx = getContext();
  if (!ctx || !masterGain) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    return; // skip sound while resuming per Section 15.2
  }

  if (!unlocked) return;

  const notes = SOUND_TABLE[s];
  if (!notes || notes.length === 0) return;

  let currentStartTime = ctx.currentTime;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.freq, currentStartTime);

    const durationSec = note.durationMs / 1000;
    const endTime = currentStartTime + durationSec;
    const attackEnd = currentStartTime + Math.min(0.01, durationSec * 0.2);
    const decayStart = Math.max(attackEnd, endTime - Math.min(0.06, durationSec * 0.5));

    // Envelope
    noteGain.gain.setValueAtTime(0.0001, currentStartTime);
    noteGain.gain.linearRampToValueAtTime(note.gain, attackEnd);
    noteGain.gain.setValueAtTime(note.gain, decayStart);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.connect(noteGain);
    noteGain.connect(masterGain);

    osc.start(currentStartTime);
    osc.stop(endTime + 0.02);

    osc.onended = () => {
      osc.disconnect();
      noteGain.disconnect();
    };

    if (!note.together) {
      currentStartTime = endTime;
    }
  }
}
