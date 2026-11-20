/** Hand pose from joint positions (pure). Used by the headset adapter and by the tests; the rules never read joints,
 * only the result (`fist`, `pinch`, `pointRay`, `pos`).
 *
 * Numbers come from the emulator's own hand model (qa/emulator-hand-poses.json): palm length 0.096 m; wrist to
 * fingertip: open 0.158 to 0.191, fist 0.065 to 0.071, point (index) 0.182 and the other three 0.064 to 0.085, pinch
 * (thumb to index tip) 0.002. Real tracking will differ: UNVERIFIED on a headset. The distances are divided by the
 * hand's own size (palm length over 0.096), so small and large hands use the same rule. */

export const JOINTS = [
  "wrist",
  "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip",
  "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip",
  "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip",
  "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip",
  "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip",
];

export const FINGERS = ["index", "middle", "ring", "pinky"];
export const PALM_LEN_M = 0.096;
/** A fingertip closer to the wrist than this (hand-size units, metres) is curled; farther than EXT_M is extended. */
export const CURL_M = 0.115;
export const EXT_M = 0.135;
/** The index counts as pointing when it is at least this far from the wrist. */
export const POINT_INDEX_M = 0.15;
/** Thumb tip to index tip: a pinch starts below PINCH_ON_M and ends above PINCH_OFF_M (hand-size units). Round 8 (Q04): the release is wider than the grab (4.5 cm, was 4 cm),
 * and each change must last a short time, so a gap that flickers around one threshold neither drops nor re-grabs. The times need a frame time (dt) in classifyHand; without
 * one they are zero. */
export const PINCH_ON_M = 0.025;
export const PINCH_OFF_M = 0.045;
export const PINCH_GRAB_HOLD_S = 0.03;
export const PINCH_RELEASE_HOLD_S = 0.05;

/** A two-threshold switch: `on` stays as it is until the value passes the threshold on the far side (turns on below `onBelow`, off above `offAbove`). */
export function hysteresis(on, value, onBelow, offAbove) {
  return on ? value <= offAbove : value < onBelow;
}

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @param {V3} a @param {V3} b */
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** @param {Record<string,V3>} j */
export function handScale(j) {
  const d = dist3(j["wrist"], j["middle-finger-phalanx-proximal"]);
  return Number.isFinite(d) && d > 0.02 ? Math.max(0.7, Math.min(1.4, d / PALM_LEN_M)) : 1;
}

/** Raw measurements, in hand-size units. @param {Record<string,V3>} j */
export function measureHand(j) {
  const s = handScale(j);
  const w = j["wrist"];
  /** @type {Record<string, number>} */
  const reach = {};
  for (const f of FINGERS) reach[f] = dist3(w, j[`${f}-finger-tip`]) / s;
  const pinchGap = dist3(j["thumb-tip"], j["index-finger-tip"]) / s;
  const mp = j["middle-finger-phalanx-proximal"];
  const palm = { x: w.x + (mp.x - w.x) * 0.55, y: w.y + (mp.y - w.y) * 0.55, z: w.z + (mp.z - w.z) * 0.55 };
  return { scale: s, reach, pinchGap, palm };
}

/**
 * @param {Record<string,V3>} j joints in any one frame (the table's)
 * @param {{fist:boolean, pinch:boolean, point:boolean, pinchOnT?:number, pinchOffT?:number}|null} [prev] last result, for hysteresis
 * @param {number} [dt] seconds since the last frame (for the pinch hold times; 0 or missing: no hold)
 * @returns {{fist:boolean, pinch:boolean, point:boolean, open:boolean, pinchOnT:number, pinchOffT:number, pose:string, palm:V3, wrist:V3,
 *   pinchPoint:V3, pointRay:{o:V3,d:V3}|null, reach:Record<string,number>, pinchGap:number, scale:number}}
 */
export function classifyHand(j, prev = null, dt = 0) {
  const m = measureHand(j);
  const wasFist = !!prev?.fist, wasPoint = !!prev?.point, wasPinch = !!prev?.pinch;
  const curled = FINGERS.filter((f) => m.reach[f] < CURL_M).length;
  const extended = FINGERS.filter((f) => m.reach[f] > EXT_M).length;
  // a fist: the index and at least two other fingers curled (an index that points while the others are curled is a point);
  // it lets go when the index or two fingers reach out again
  const fist = wasFist ? extended < 2 && m.reach.index < EXT_M : curled >= 3 && m.reach.index < CURL_M;
  const othersCurled = ["middle", "ring", "pinky"].every((f) => m.reach[f] < (wasPoint ? EXT_M : CURL_M));
  const point = !fist && othersCurled && m.reach.index > (wasPoint ? POINT_INDEX_M - 0.015 : POINT_INDEX_M);
  // pinch: starts when the gap stays below PINCH_ON_M for PINCH_GRAB_HOLD_S; ends only when it stays above PINCH_OFF_M for PINCH_RELEASE_HOLD_S (a fist or a point ends it at once)
  let pinch = false, pinchOnT = 0, pinchOffT = 0;
  if (!fist && !point) {
    if (wasPinch) {
      if (m.pinchGap > PINCH_OFF_M) {
        pinchOffT = (prev.pinchOffT || 0) + dt;
        pinch = dt > 0 && pinchOffT < PINCH_RELEASE_HOLD_S;
        if (!pinch) pinchOffT = 0;
      } else pinch = true;
    } else if (m.pinchGap < PINCH_ON_M) {
      pinchOnT = ((prev && prev.pinchOnT) || 0) + dt;
      pinch = !(dt > 0) || pinchOnT >= PINCH_GRAB_HOLD_S;
      if (pinch) pinchOnT = 0;
    }
  }
  const open = !fist && !point && !pinch && extended >= 3;
  const ip = j["index-finger-tip"], iprox = j["index-finger-phalanx-proximal"];
  const dl = Math.hypot(ip.x - iprox.x, ip.y - iprox.y, ip.z - iprox.z) || 1;
  const pointRay = point ? { o: { x: iprox.x, y: iprox.y, z: iprox.z }, d: { x: (ip.x - iprox.x) / dl, y: (ip.y - iprox.y) / dl, z: (ip.z - iprox.z) / dl } } : null;
  const tt = j["thumb-tip"];
  const pinchPoint = { x: (ip.x + tt.x) / 2, y: (ip.y + tt.y) / 2, z: (ip.z + tt.z) / 2 };
  return {
    fist, pinch, point, open, pinchOnT, pinchOffT,
    pose: fist ? "fist" : point ? "point" : pinch ? "pinch" : open ? "open" : "relaxed",
    palm: m.palm, wrist: j["wrist"], pinchPoint, pointRay, reach: m.reach, pinchGap: m.pinchGap, scale: m.scale,
  };
}
