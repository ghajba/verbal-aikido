import { describe, it, expect } from 'vitest';
import { next, int, shuffle } from '@/engine/rng';

describe('PRNG (mulberry32)', () => {
  it('SBE-RNG-001: produces golden sequence for seed 1', () => {
    let s = 1;
    const values: number[] = [];
    for (let i = 0; i < 5; i++) {
      let v: number;
      [v, s] = next(s);
      values.push(Number(v.toFixed(10)));
    }
    expect(values).toEqual([0.6270739406, 0.0027357212, 0.52744704, 0.9810509675, 0.9683778982]);
  });

  it('SBE-RNG-002: produces golden sequence for seed 42', () => {
    let s = 42;
    const values: number[] = [];
    for (let i = 0; i < 5; i++) {
      let v: number;
      [v, s] = next(s);
      values.push(Number(v.toFixed(10)));
    }
    expect(values).toEqual([0.6011037519, 0.448290559, 0.8524657935, 0.6697340414, 0.1748138987]);
  });

  it('SBE-RNG-003: int returns integers in [0, n)', () => {
    let s = 100;
    for (let i = 0; i < 100; i++) {
      let v: number;
      [v, s] = int(s, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('shuffle does not mutate original array and preserves all elements', () => {
    const original = [1, 2, 3, 4, 5];
    const [shuffled, nextS] = shuffle(12345, original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(nextS).not.toBe(12345);
  });
});
