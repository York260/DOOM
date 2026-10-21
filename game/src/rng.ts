// Small seeded random helpers. Every run has one seed; systems that must stay
// independent (weather, abilities, events) take their own stream from it.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stream(seed: number, salt: string): Rng {
  let h = seed >>> 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
  return mulberry32(h);
}

export const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

export function shuffle<T>(r: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const range = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
export const irange = (r: Rng, lo: number, hi: number) => Math.floor(lo + r() * (hi - lo + 1));
