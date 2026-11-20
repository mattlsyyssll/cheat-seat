/** Synthesised hand skeletons (pure): a wrist position, a facing and a pose give 25 joints, the same kind of data a headset
 * gives. The mouse and gaze adapters draw their hands with it, the tests feed it to the pose classifier, and the parity run
 * uses it to play the same script as the emulator's hands. Poses come from the emulator's own hand model (hand-poses.js). */
import { JOINTS } from "./pose.js";
import { POSE_JOINTS, POSE_RADII } from "./hand-poses.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Blend two poses by name. @param {string} a @param {string} b @param {number} k 0 = a, 1 = b @returns {number[][]} offsets (wrist-local, right hand) */
export function blendPose(a, b, k) {
  const A = POSE_JOINTS[/** @type {keyof typeof POSE_JOINTS} */ (a)], B = POSE_JOINTS[/** @type {keyof typeof POSE_JOINTS} */ (b)];
  const t = Math.max(0, Math.min(1, k));
  return A.map((p, i) => [p[0] + (B[i][0] - p[0]) * t, p[1] + (B[i][1] - p[1]) * t, p[2] + (B[i][2] - p[2]) * t]);
}

/**
 * @param {{wrist:V3, forward:V3, palmNormal:V3, side?:"left"|"right", from?:string, to?:string, k?:number, scale?:number}} o
 *   forward = where the fingers point; palmNormal = where the palm faces (both unit, roughly perpendicular).
 * @returns {Record<string,V3>} joints in the frame of `wrist`
 */
export function synthHand(o) {
  const F = norm(o.forward);
  // make the palm normal perpendicular to the fingers
  let N = norm(o.palmNormal);
  const d = N.x * F.x + N.y * F.y + N.z * F.z;
  N = norm({ x: N.x - F.x * d, y: N.y - F.y * d, z: N.z - F.z * d });
  const exw = cross(N, F);          // the pinky side of a right hand
  const eyw = { x: -N.x, y: -N.y, z: -N.z }; // the back of the hand
  const ezw = { x: -F.x, y: -F.y, z: -F.z }; // toward the arm
  const mirror = o.side === "left" ? -1 : 1;
  const sc = o.scale ?? 1;
  const offsets = blendPose(o.from ?? "default", o.to ?? o.from ?? "default", o.k ?? 0);
  /** @type {Record<string,V3>} */
  const out = {};
  JOINTS.forEach((name, i) => {
    const [lx, ly, lz] = offsets[i];
    const x = lx * mirror * sc, y = ly * sc, z = lz * sc;
    out[name] = {
      x: o.wrist.x + exw.x * x + eyw.x * y + ezw.x * z,
      y: o.wrist.y + exw.y * x + eyw.y * y + ezw.y * z,
      z: o.wrist.z + exw.z * x + eyw.z * y + ezw.z * z,
    };
  });
  return out;
}

export { POSE_RADII };

/** The wrist position that puts the palm centre at `palm` for a hand facing `forward` (the palm is 0.55 of the way from the wrist to the middle knuckle).
 * @param {V3} palm @param {V3} forward @param {V3} palmNormal @param {string} [pose] @param {number} [scale] @returns {V3} */
export function wristForPalm(palm, forward, palmNormal, pose = "default", scale = 1) {
  const probe = synthHand({ wrist: { x: 0, y: 0, z: 0 }, forward, palmNormal, from: pose, scale });
  const mp = probe["middle-finger-phalanx-proximal"];
  return { x: palm.x - mp.x * 0.55, y: palm.y - mp.y * 0.55, z: palm.z - mp.z * 0.55 };
}
