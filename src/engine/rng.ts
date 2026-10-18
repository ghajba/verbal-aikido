export function next(s: number): [number, number] {
  const nextS = (s + 0x6d2b79f5) >>> 0;
  let t = nextS;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextS];
}

export function int(s: number, n: number): [number, number] {
  const [v, nextS] = next(s);
  return [Math.floor(v * n), nextS];
}

export function shuffle<T>(s: number, array: readonly T[]): [T[], number] {
  const a = [...array];
  let currentS = s;
  for (let i = a.length - 1; i > 0; i--) {
    let j: number;
    [j, currentS] = int(currentS, i + 1);
    const temp = a[i]!;
    a[i] = a[j]!;
    a[j] = temp;
  }
  return [a, currentS];
}
