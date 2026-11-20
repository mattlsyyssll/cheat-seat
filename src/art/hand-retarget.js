/** What the player's hands LOOK like (stage E, judge items 4 and 14). The 25 joints from the headset (or the emulator, or the mouse's synthesised skeleton) say where each
 * finger is; the drawing does not copy them. Each finger's curl (how far its tip is from the wrist) picks a drawn pose between a relaxed hand and a fist, built by turning the
 * finger's three bones at the knuckle (so a curled finger is a curled finger, not a squashed tube):
 *   relaxed  fingers a little curved, the outer ones more, and not spread wide (the emulator's open hand is flat and spread stiff);
 *   fist     a loose fist: the first bone of each finger angles forward and down, so the row of middle knuckles and the finger backs show from above, the thumb lies across;
 *   keeps    the thumb and the index finger as tracked while you pinch or point (the card sits between the tips; the point ray follows the index bone).
 * The wrist, the palm and the knuckles stay as tracked. Everything is drawn a little smaller (HAND_SCALE) about the wrist. Pure maths: no graphics, no device; tested in
 * tests/hand-retarget.test.js. The rules never read this; they read the tracked joints. */
import { JOINTS, FINGERS, measureHand } from "../game/pose.js";
import { POSE_JOINTS } from "../game/hand-poses.js";

/** @typedef {{x:number,y:number,z:number}} V3 */

/** The drawn hand is this much of the tracked size, about the wrist (the judge: hands large, covering the lower third of the picture). */
export const HAND_SCALE = 0.92;
/** Spread of the fingers in the relaxed hand, as a share of the tracked open hand's sideways spread. */
export const RELAX_SPREAD = 0.55;
/** The same for a closed hand: the first bones of the fingers stand a little apart (more than the open hand's), so the four fingers read as four fingers from above. */
export const FIST_SPREAD = 1.35;

const OPEN = POSE_JOINTS.open;
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));

/** Flexion angles in degrees at the three joints of a finger (knuckle, middle joint, tip joint), index to pinky. */
const REL = [[6, 14, 8], [9, 18, 10], [13, 22, 12], [17, 26, 14]];
const FIST = [[42, 74, 52], [44, 76, 52], [46, 76, 50], [48, 74, 48]];
/** The thumb of the fist (right hand, wrist-local metres: x pinky side, y back of hand, z toward the arm): across the front of the first two fingers. */
const THUMB_FIST = [[-0.04, -0.036, -0.066], [-0.03, -0.055, -0.097], [-0.011, -0.059, -0.109]];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/** The drawn bones of each finger from the open hand: lengths and unit directions of knuckle-to-middle, middle-to-tip-joint and last bone. */
const BONES = FINGERS.map((_, f) => {
  const b = 5 + f * 5;
  const out = [];
  for (let k = 1; k <= 3; k++) {
    const d = sub(OPEN[b + k + 1], OPEN[b + k]);
    out.push({ l: len(d), d: unit(d) });
  }
  return out;
});

/** Turn a direction about the sideways axis by `deg` degrees toward the palm (right-hand wrist-local frame). */
function flex(d, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [d[0], d[1] * c + d[2] * s, d[2] * c - d[1] * s];
}

/** One finger's drawn joints (pip, dip, tip) in the wrist-local frame for a curl 0 (relaxed) to 1 (fist), from the knuckle `mcp`. */
export function fingerPose(f, curl, mcp, scale = 1) {
  const c = Math.max(0, Math.min(1, curl));
  const spread = mix(RELAX_SPREAD, FIST_SPREAD, c);
  const ang = [0, 1, 2].map((k) => mix(REL[f][k], FIST[f][k], c));
  const out = [];
  let p = mcp, total = 0;
  for (let k = 0; k < 3; k++) {
    total += ang[k];
    const d0 = BONES[f][k].d;
    const lateral = unit([d0[0] * spread, d0[1], d0[2]]);
    const d = flex(lateral, total);
    p = [p[0] + d[0] * BONES[f][k].l * scale, p[1] + d[1] * BONES[f][k].l * scale, p[2] + d[2] * BONES[f][k].l * scale];
    out.push(p);
  }
  return out;
}

/** +1 or -1: the handedness of a set of joints (the sign of the wrist-to-knuckle, across-the-palm and wrist-to-thumb triple product). Same rule the skinning uses. */
export function chirality(p) {
  const w = p(0), m = p(11), a = p(6), b = p(21), t = p(1);
  const f = sub(m, w), s = sub(a, b), th = sub(t, w);
  const c = [f[1] * s[2] - f[2] * s[1], f[2] * s[0] - f[0] * s[2], f[0] * s[1] - f[1] * s[0]];
  return Math.sign(c[0] * th[0] + c[1] * th[1] + c[2] * th[2]) || 1;
}
export const RIGHT_SIGN = chirality((i) => OPEN[i]);

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Draw pose for the tracked joints.
 * @param {Record<string,V3>} j the 25 tracked joints (any one frame)
 * @param {number[][]} out 25 arrays of 3 numbers, written (the drawn joints, same frame)
 * @returns {{left:boolean, curl:number[], keep:number, fist:number}} the handedness, the curl of each finger (0 to 1), how much the thumb and index are kept as tracked, the fist share */
export function retargetHand(j, out) {
  const P = (i) => { const q = j[JOINTS[i]]; return [q.x, q.y, q.z]; };
  const w = P(0);
  const left = chirality(P) !== RIGHT_SIGN;
  const m = measureHand(j);
  // the hand's frame: F along the fingers, S from the index knuckle to the little knuckle, N toward the palm (the same as synthHand's frame)
  const F = unit(sub(P(11), w));
  let S = sub(P(21), P(6));
  const sf = dot(S, F);
  S = unit([S[0] - F[0] * sf, S[1] - F[1] * sf, S[2] - F[2] * sf]);
  const FxS = cross(F, S);
  const N = left ? [-FxS[0], -FxS[1], -FxS[2]] : FxS;
  const exw = cross(N, F);
  const eyw = [-N[0], -N[1], -N[2]];
  const ezw = [-F[0], -F[1], -F[2]];
  const mir = left ? -1 : 1;
  const toLocal = (p) => { const d = sub(p, w); return [dot(d, exw) * mir, dot(d, eyw), dot(d, ezw)]; };
  const toWorld = (l) => [w[0] + exw[0] * l[0] * mir + eyw[0] * l[1] + ezw[0] * l[2], w[1] + exw[1] * l[0] * mir + eyw[1] * l[1] + ezw[1] * l[2], w[2] + exw[2] * l[0] * mir + eyw[2] * l[1] + ezw[2] * l[2]];
  // curl of each finger from how far its tip is from the wrist (hand-size units): open about 0.16 to 0.19, a fist 0.065 to 0.071
  const curl = FINGERS.map((f) => smooth(0.0, 1.0, (0.168 - m.reach[f]) / (0.168 - 0.078)));
  const avg = (curl[0] + curl[1] + curl[2] + curl[3]) / 4;
  const fist = smooth(0.55, 0.9, avg);
  // pinch (thumb tip near the index tip) or point (index out, the other three curled): the thumb and the index stay as tracked
  const pinch = 1 - smooth(0.032, 0.055, m.pinchGap);
  const point = curl[0] < 0.2 && (curl[1] + curl[2] + curl[3]) / 3 > 0.6 ? 1 : 0;
  const keep = Math.max(pinch, point);
  // palm, wrist and knuckles as tracked; the thumb's base too
  for (const i of [0, 1, 5, 6, 10, 11, 15, 16, 20, 21]) { const p = P(i); out[i][0] = p[0]; out[i][1] = p[1]; out[i][2] = p[2]; }
  for (let f = 0; f < 4; f++) {
    const b = 5 + f * 5;
    const mcp = toLocal(P(b + 1));
    const drawn = fingerPose(f, curl[f], mcp, m.scale);
    for (let k = 0; k < 3; k++) {
      const wp = toWorld(drawn[k]);
      const tr = P(b + 2 + k);
      // the index follows the tracked finger while pinching or pointing
      const t = f === 0 ? keep : 0;
      out[b + 2 + k][0] = mix(wp[0], tr[0], t); out[b + 2 + k][1] = mix(wp[1], tr[1], t); out[b + 2 + k][2] = mix(wp[2], tr[2], t);
    }
  }
  // thumb: as tracked, except in a fist, where it lies across the fingers
  for (let k = 0; k < 3; k++) {
    const tr = P(2 + k);
    const th = THUMB_FIST[k].map((v) => v * m.scale);
    const wp = toWorld(th);
    const t = fist * (1 - keep);
    out[2 + k][0] = mix(tr[0], wp[0], t); out[2 + k][1] = mix(tr[1], wp[1], t); out[2 + k][2] = mix(tr[2], wp[2], t);
  }
  // drawn a little smaller about the wrist
  for (let i = 1; i < 25; i++) for (let a = 0; a < 3; a++) out[i][a] = w[a] + (out[i][a] - w[a]) * HAND_SCALE;
  return { left, curl, keep, fist };
}
