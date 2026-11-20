/** Small seeded random numbers. The state is one integer, so a run can be saved.
 * @typedef {{ s: number }} Rng */

/** @param {number} seed @returns {Rng} */
export function createRng(seed) {
  return { s: Number.isFinite(seed) ? seed >>> 0 : 1 };
}

/** @param {Rng} rng @returns {number} a float in [0, 1) */
export function nextFloat(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** @param {Rng} rng @param {number} n @returns {number} an integer in [0, n) */
export function nextInt(rng, n) {
  return Math.min(n - 1, Math.floor(nextFloat(rng) * n));
}

/** @param {Rng} rng @param {number} lo @param {number} hi @returns {number} */
export function nextRange(rng, lo, hi) {
  return lo + (hi - lo) * nextFloat(rng);
}

/** @param {string} text @returns {number} */
export function hashSeed(text) {
  let n = 2166136261;
  for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
