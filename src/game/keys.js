/** Keyframe sampling for glove paths and similar small animations (pure). */

/** @param {number} x @returns {number} smoothstep 0..1 */
export function smooth(x) {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

/** Progress of `t` through the window [a, b], clamped to 0..1.
 * @param {number} t @param {number} a @param {number} b @returns {number} */
export function span(t, a, b) {
  return b <= a ? (t >= b ? 1 : 0) : Math.max(0, Math.min(1, (t - a) / (b - a)));
}

/** A bump that rises then falls inside [a, b]. @returns {number} 0..1..0 */
export function pulse(t, a, b) {
  if (t <= a || t >= b) return 0;
  return Math.sin(span(t, a, b) * Math.PI);
}

/**
 * Sample keyframes. Each key is {t, ...numbers}; numbers are blended with a
 * smoothstep between neighbouring keys and held outside the range.
 * @template {{t:number}} K
 * @param {K[]} keys sorted by t @param {number} t @returns {K}
 */
export function sampleKeys(keys, t) {
  if (t <= keys[0].t) return { ...keys[0] };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { ...last };
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const k = smooth((t - a.t) / (b.t - a.t));
  /** @type {any} */
  const out = { t };
  for (const name of Object.keys(a)) {
    if (name === "t") continue;
    const av = /** @type {any} */ (a)[name], bv = /** @type {any} */ (b)[name];
    out[name] = typeof av === "number" && typeof bv === "number" ? av + (bv - av) * k : av;
  }
  return out;
}
