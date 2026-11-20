/** Webcam hands (stage E, judge item 9; VIRTUAL-QUEST.md B8): the 21 hand landmarks that an in-browser tracker gives for a camera picture, turned into the game's own
 * input: 25 WebXR-named joints in table-local metres, fed to `createHandsFeeder` (game/adapters.js) exactly like a headset's hands. Pure maths: no camera, no model, no
 * graphics; tested on synthetic landmarks in tests/webcam.test.js. The tracker itself (MediaPipe HandLandmarker, Apache-2.0) is in input/webcam.ts.
 *
 * SHAPE ONLY. A laptop camera sees no real depth, so:
 *   shape     the three poses the rules read (fist, open, point) and "still" come from the SHAPE of the landmarks in the hand's own frame (finger lengths, curls), scaled so that the
 *             palm is the game's palm (0.096 m). The apparent size of the hand in the picture is never used as distance.
 *   place     where the hand is on the table comes from its place in the picture only: left to right is left to right (the picture is mirrored, like a selfie), top to bottom is far
 *             to near; the height above the felt is fixed, except at the very bottom of the picture, where the hand sinks under the table (so does leaving the picture at the
 *             bottom: a hand lost low is under the table for the rules).
 *   aim       the hand always faces away from you, palm down; only while you point does it turn toward the way your index finger points in the picture.
 *   still     a hand that moves less than a small dead band stays exactly where it was, so the tracker's own jitter never counts as a move during his stare.
 * Nothing here records or sends anything. */
import { JOINTS } from "../game/pose.js";
import { POSE_JOINTS } from "../game/hand-poses.js";

/** @typedef {{x:number,y:number,z:number}} P3 */
/** @typedef {Record<string,P3>} Joints */

export const WEBCAM = {
  /** The game's palm: wrist to middle knuckle, metres. */
  palm: 0.096,
  /** The table area the picture covers: width in metres, near and far z, the hover height over the felt, and the part of the picture's height (from the bottom) where the hand sinks. */
  width: 0.92, zNear: 0.46, zFar: -0.36, hoverY: 0.06, sinkFrom: 0.9, sinkDepth: 0.2,
  /** Dead band in picture units (0 to 1): a move smaller than this is not a move. The follow rate is per update. */
  deadband: 0.009, follow: 0.5,
  /** A hand not seen for this long (ms) is lost (the rules take a hand lost low as under the table). */
  lostMs: 260,
  /** How far the forward direction of a pointing hand turns with the index finger's angle in the picture (1 = as much as the finger). */
  aimGain: 1.0,
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The 25 WebXR joints from the 21 landmarks (index into the landmark list): the thumb's four, then for each finger a metacarpal (a point a third of the way from the wrist to the knuckle),
 * the knuckle, the middle joint, the end joint and the tip. @param {number[][]} L 21 points @returns {number[][]} 25 points */
export function toXrJoints(L) {
  const out = [L[0], L[1], L[2], L[3], L[4]];
  for (let f = 0; f < 4; f++) {
    const m = 5 + f * 4; // MCP, PIP, DIP, TIP are m .. m + 3
    const mc = [L[0][0] + (L[m][0] - L[0][0]) * 0.375, L[0][1] + (L[m][1] - L[0][1]) * 0.375, L[0][2] + (L[m][2] - L[0][2]) * 0.375];
    out.push(mc, L[m], L[m + 1], L[m + 2], L[m + 3]);
  }
  return out;
}

/** +1 or -1: the handedness of 25 joints (same rule as the skinning and the retargeting). */
function chirality(p) {
  const f = sub(p[11], p[0]), s = sub(p[6], p[21]), th = sub(p[1], p[0]);
  return Math.sign(dot(cross(f, s), th)) || 1;
}
const RIGHT_SIGN = chirality(POSE_JOINTS.open);

/** The shape of one hand: its 25 joints in the hand's own frame, as for a right hand (x to the little finger, y out of the back of the hand, z toward the arm), in metres with the
 * palm made 0.096 m long. `left` says the hand is a left hand (the shape is mirrored to a right hand's). Depth in the picture does not enter: only the landmarks' shape.
 * @param {number[][]} world21 the 21 landmarks (the tracker's world landmarks: metres, hand centred; any scale is fine) @returns {{local:number[][], left:boolean, indexAngle:number}|null} */
export function handShape(world21) {
  if (!world21 || world21.length < 21) return null;
  const p = toXrJoints(world21);
  const palmLen = len(sub(p[11], p[0]));
  if (!(palmLen > 1e-6)) return null;
  const k = WEBCAM.palm / palmLen;
  const left = chirality(p) !== RIGHT_SIGN;
  const F = unit(sub(p[11], p[0]));
  let S = sub(p[21], p[6]);
  const sf = dot(S, F);
  S = unit([S[0] - F[0] * sf, S[1] - F[1] * sf, S[2] - F[2] * sf]);
  const FxS = cross(F, S);
  const N = left ? [-FxS[0], -FxS[1], -FxS[2]] : FxS; // toward the palm
  const exw = cross(N, F), eyw = [-N[0], -N[1], -N[2]], ezw = [-F[0], -F[1], -F[2]];
  const mir = left ? -1 : 1;
  const local = p.map((q) => { const d = sub(q, p[0]); return [dot(d, exw) * mir * k, dot(d, eyw) * k, dot(d, ezw) * k]; });
  return { local, left, indexAngle: 0 };
}

/** The forward direction of a hand that faces away from you, palm down, and the direction when it points: `angle` is the index finger's angle from straight up in the picture
 * (radians, positive to the right of the picture as you see it mirrored). */
function frame(angle, pointing) {
  const yaw = pointing ? Math.max(-1.2, Math.min(1.2, angle * WEBCAM.aimGain)) : 0;
  const pitch = pointing ? 0.12 : -0.15; // pointing: a little upward, toward the wall; otherwise the fingers lie slightly down on the felt
  const F = unit([Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]);
  const N = [0, -1, 0];
  const d = dot(N, F);
  const Np = unit([N[0] - F[0] * d, N[1] - F[1] * d, N[2] - F[2] * d]);
  return { F, N: Np };
}

/** Place a hand shape on the table: the wrist at `wrist`, the hand facing along `F` with the palm toward `N` (the same frame maths as game/synth.js synthHand).
 * @returns {Joints} */
export function placeHand(local, left, wrist, F, N) {
  const exw = cross(N, F), eyw = [-N[0], -N[1], -N[2]], ezw = [-F[0], -F[1], -F[2]];
  const mir = left ? -1 : 1;
  /** @type {Joints} */
  const out = {};
  JOINTS.forEach((name, i) => {
    const [lx, ly, lz] = local[i];
    out[name] = {
      x: wrist.x + exw[0] * lx * mir + eyw[0] * ly + ezw[0] * lz,
      y: wrist.y + exw[1] * lx * mir + eyw[1] * ly + ezw[1] * lz,
      z: wrist.z + exw[2] * lx * mir + eyw[2] * ly + ezw[2] * lz,
    };
  });
  return out;
}

/** Where the palm is on the table for a place in the picture (0 to 1 each; `u` already mirrored so that your right is larger). The wrist is a palm-length behind it.
 * @returns {{x:number,y:number,z:number}} */
export function tablePoint(u, v) {
  const cu = Math.max(0, Math.min(1, u)), cv = Math.max(0, Math.min(1, v));
  const sink = Math.max(0, (cv - WEBCAM.sinkFrom) / (1 - WEBCAM.sinkFrom));
  return { x: (cu - 0.5) * WEBCAM.width, y: WEBCAM.hoverY - sink * WEBCAM.sinkDepth, z: WEBCAM.zFar + (WEBCAM.zNear - WEBCAM.zFar) * cv };
}

/** One tracked hand over time: the dead band, the lost timer. @returns {{update:Function}} */
function createHandTrack() {
  let u = 0.5, v = 0.5, has = false, lastSeen = -1e9, angle = 0;
  return {
    /** @param {number} nu @param {number} nv @param {number} nowMs @param {number} aimAngle */
    update(nu, nv, nowMs, aimAngle) {
      if (!has) { u = nu; v = nv; has = true; angle = aimAngle; }
      else {
        const du = nu - u, dv = nv - v, d = Math.hypot(du, dv);
        // inside the dead band the hand stays exactly where it was; outside it follows the part beyond the band
        if (d > WEBCAM.deadband) {
          const beyond = (d - WEBCAM.deadband) / d;
          u += du * beyond * WEBCAM.follow;
          v += dv * beyond * WEBCAM.follow;
        }
        angle += (aimAngle - angle) * 0.25;
      }
      lastSeen = nowMs;
      return { u, v, angle };
    },
    lost(nowMs) { return nowMs - lastSeen > WEBCAM.lostMs; },
    get has() { return has; },
    forget() { has = false; },
    pos() { return { u, v, angle }; },
  };
}

/** The mapper: give it the tracker's results for each camera picture; it returns the hands to feed (`{left, right}`: joints or null). One hand drives the game as your right
 * hand if it is a right hand, the left hand likewise; a second hand drives the other.
 * @returns {{update:(results:{landmarks?:{x:number,y:number,z:number}[][], worldLandmarks?:{x:number,y:number,z:number}[][]}|null, nowMs:number)=>{hands:{left:Joints|null,right:Joints|null}, seen:number}, reset:()=>void}} */
export function createWebcamMapper() {
  const tracks = { left: createHandTrack(), right: createHandTrack() };
  const last = { left: /** @type {Joints|null} */ (null), right: /** @type {Joints|null} */ (null) };
  return {
    update(results, nowMs) {
      const seen = new Set();
      const img = results?.landmarks ?? [], wld = results?.worldLandmarks ?? [];
      for (let h = 0; h < img.length; h++) {
        const L = img[h];
        if (!L || L.length < 21) continue;
        const W = (wld[h] && wld[h].length >= 21 ? wld[h] : L).map((q) => [q.x, q.y, q.z]);
        const shape = handShape(W);
        if (!shape) continue;
        const id = shape.left ? "left" : "right";
        if (seen.has(id)) continue; // two hands of the same side in one picture: the first one wins
        seen.add(id);
        // the palm's place in the picture: the mean of the wrist and the four knuckles, mirrored
        const idx = [0, 5, 9, 13, 17];
        const cu = 1 - idx.reduce((a, i) => a + L[i].x, 0) / idx.length, cv = idx.reduce((a, i) => a + L[i].y, 0) / idx.length;
        // the index finger's angle from straight up in the mirrored picture (knuckle to tip)
        const dx = -(L[8].x - L[5].x), dy = L[8].y - L[5].y;
        const aim = Math.atan2(dx, -dy);
        const t = tracks[id].update(cu, cv, nowMs, aim);
        const pt = tablePoint(t.u, t.v);
        // is it a pointing shape? (the index out, the other three curled: the rules decide with their own thresholds; here it only turns the hand toward the finger)
        const reach = (m) => len(sub(toXrJoints(W)[m], toXrJoints(W)[0]));
        const palm = reach(11);
        const pointing = reach(9) > 1.5 * palm && reach(14) < 1.15 * palm && reach(19) < 1.15 * palm && reach(24) < 1.15 * palm;
        const fr = frame(t.angle, pointing);
        // the wrist sits a palm-length behind the palm centre along the hand's forward direction
        const wrist = { x: pt.x - fr.F[0] * WEBCAM.palm * 0.55, y: pt.y - fr.F[1] * WEBCAM.palm * 0.55, z: pt.z - fr.F[2] * WEBCAM.palm * 0.55 };
        last[id] = placeHand(shape.local, shape.left, wrist, fr.F, fr.N);
      }
      for (const id of /** @type {const} */ (["left", "right"])) {
        if (!seen.has(id) && tracks[id].lost(nowMs)) { last[id] = null; tracks[id].forget(); }
      }
      return { hands: { left: last.left, right: last.right }, seen: seen.size };
    },
    reset() { tracks.left.forget(); tracks.right.forget(); last.left = last.right = null; },
  };
}
