/** Hand helpers (pure). Positions are table-local metres. */
/** Thumb tip and index tip this close (metres) count as a pinch even if the
 * runtime sent no select event. A relaxed hand is never this tight. */
export const PINCH_TOUCH_M = 0.015;

/** A hand is pinching when the runtime says it is selecting (a pinch is a
 * select on hands), or the fingertips touch.
 * @param {boolean} selecting from selectstart / selectend
 * @param {number} distance thumb tip to index tip, metres
 * @returns {boolean} */
export function isPinching(selecting, distance) {
  return selecting === true || (Number.isFinite(distance) && distance < PINCH_TOUCH_M);
}

/** Flat distance between two points on the desk. */
export function flatDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Is a pinch point at a zone: close in x and z, and not high above the desk.
 * @param {{x:number,y:number,z:number}} p @param {{x:number,z:number}} zone
 * @param {number} radius @param {number} [maxY] */
export function pinchAt(p, zone, radius, maxY = 0.14) {
  return flatDistance(p, zone) <= radius && p.y <= maxY && p.y >= -0.05;
}

// ------------------------------------------------------------------ hand shape
/** Straight-line distance between two {x,y,z} points. */
export function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** A finger tip this far from the wrist (metres) counts as extended. An adult
 * flat hand measures about 0.16 to 0.19; a fist about 0.08 to 0.11. Lenient on
 * purpose (PRODUCT-FIT P0-4): small hands and slightly curled fingers still pass. */
export const FLAT_REACH_M = 0.115;
/** Fingertips of a flat hand lie within this height of each other. */
export const FLAT_SPREAD_M = 0.06;
/** Thumb tip to index tip: a flat hand is not a pinch. */
export const FLAT_THUMB_GAP_M = 0.028;
/** The palm normal must point this close to straight down (cos of 55 degrees). */
export const PALM_DOWN_COS = 0.57;

/**
 * Is this a flat, palm-down hand (the palm of "Palm")? Pure: joint positions only.
 * `handed` is +1 for the right hand and -1 for the left. Joint names follow WebXR.
 * @param {{wrist:any, thumbTip:any, indexTip:any, middleTip:any, ringTip:any, pinkyTip:any,
 *   indexKnuckle:any, pinkyKnuckle:any, handed:number}} j
 * @returns {{flat:boolean, palmDown:boolean, extended:boolean, spread:number, normalY:number}}
 */
export function handShape(j) {
  const tips = [j.indexTip, j.middleTip, j.ringTip, j.pinkyTip];
  const reach = tips.map((t) => dist3(j.wrist, t));
  const extended = reach[1] >= FLAT_REACH_M && reach.filter((r) => r >= FLAT_REACH_M).length >= 3;
  const ys = tips.map((t) => t.y);
  const spread = Math.max(...ys) - Math.min(...ys);
  const v1 = { x: j.indexKnuckle.x - j.wrist.x, y: j.indexKnuckle.y - j.wrist.y, z: j.indexKnuckle.z - j.wrist.z };
  const v2 = { x: j.pinkyKnuckle.x - j.wrist.x, y: j.pinkyKnuckle.y - j.wrist.y, z: j.pinkyKnuckle.z - j.wrist.z };
  const n = { x: v1.y * v2.z - v1.z * v2.y, y: v1.z * v2.x - v1.x * v2.z, z: v1.x * v2.y - v1.y * v2.x };
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  const normalY = (j.handed * n.y) / len;
  const palmDown = normalY < -PALM_DOWN_COS;
  const open = dist3(j.thumbTip, j.indexTip) >= FLAT_THUMB_GAP_M;
  return { flat: extended && spread <= FLAT_SPREAD_M && palmDown && open, palmDown, extended, spread, normalY };
}

// ----------------------------------------------------------------- forgiving aim
/** A short history of one hand's pinch point, so a pinch can use where the hand
 * was a moment ago (the pinch itself nudges the fingertips). PRODUCT-FIT P0-4. */
export const TRAIL_S = 0.5;

/** @returns {{pts:{t:number,x:number,y:number,z:number}[]}} */
export function createTrail() {
  return { pts: [] };
}

/** @param {{pts:any[]}} tr @param {number} t seconds @param {{x:number,y:number,z:number}} p */
export function pushTrail(tr, t, p) {
  tr.pts.push({ t, x: p.x, y: p.y, z: p.z });
  while (tr.pts.length && t - tr.pts[0].t > TRAIL_S) tr.pts.shift();
}

/**
 * Pick the target a pinch means. Every sample of the last half second counts: the
 * target whose zone the hand came closest to (distance divided by its radius)
 * wins, so a hand that overshot or jittered still picks what it was aiming at.
 * @param {{pts:any[]}} tr
 * @param {{id:string,x:number,z:number,r:number,maxY?:number}[]} targets
 * @returns {{id:string, score:number}|null} score 0..1 (0 = dead centre)
 */
export function pickTarget(tr, targets) {
  let best = null;
  for (const tg of targets) {
    for (const p of tr.pts) {
      if (p.y > (tg.maxY ?? 0.16) || p.y < -0.05) continue;
      const score = flatDistance(p, tg) / tg.r;
      if (score <= 1 && (!best || score < best.score)) best = { id: tg.id, score };
    }
  }
  return best;
}
