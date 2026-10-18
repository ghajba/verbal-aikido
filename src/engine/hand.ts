import type { Card } from '../content/types';
import { int, shuffle } from './rng';

export function drawHand(pool: readonly Card[], rngState: number): [string[], number] {
  if (pool.length === 3) {
    const [shuffled, nextS] = shuffle(rngState, pool);
    return [shuffled.map((c) => c.cardId), nextS];
  }

  const A = pool.filter((c) => c.category === 'PACING' || c.category === 'META_MODEL');
  const B = pool.filter((c) => c.category === 'DEFENSE' || c.category === 'ATTACK');

  let s = rngState;
  let idxA: number;
  [idxA, s] = int(s, A.length);
  const a = A[idxA]!;

  let idxB: number;
  [idxB, s] = int(s, B.length);
  const b = B[idxB]!;

  const rest = pool.filter((c) => c.cardId !== a.cardId && c.cardId !== b.cardId);
  let idxC: number;
  [idxC, s] = int(s, rest.length);
  const c = rest[idxC]!;

  const [shuffled, finalS] = shuffle(s, [a, b, c]);
  return [shuffled.map((card) => card.cardId), finalS];
}
