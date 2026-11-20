/** Numbers the Shark's body is built from, shared by the bake step (which makes the mesh) and the live avatar (which moves it).
 * Pure JavaScript. Frame: table-local metres (origin on the table top, +x to the player's right, +y up, +z toward the player;
 * the Shark faces +z). The rest pose matches the rig in actor/rig.js with the player's eyes 0.47 m over the table. */
import { POSE_JOINTS, POSE_RADII } from "../game/hand-poses.js";

export const REST = {
  head: [0, 0.47, -0.46],
  hip: [0, -0.14, -0.6],
  neck: [0, 0.34, -0.51],
  shoulderR: [-0.2, 0.3, -0.5],
  shoulderL: [0.2, 0.3, -0.5],
  wristR: [-0.15, 0.025, -0.2],
  wristL: [0.15, 0.025, -0.22],
  dir: [0, -0.05, 1],
  upper: 0.3,
  fore: 0.27,
};
/** The head is drawn a little larger than life (a cartoon head reads better across a table); every head part is scaled about the head centre. */
export const HEAD_SCALE = 1.1;
/** A head-local point (metres, unscaled) in table-local bind space. */
export const headToRoot = (p) => [REST.head[0] + p[0] * HEAD_SCALE, REST.head[1] + p[1] * HEAD_SCALE, REST.head[2] + p[2] * HEAD_SCALE];
/** Bigger than life by this much, so his hands read across a table. */
export const HAND_SCALE = 1.1;

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => mul(a, 1 / (len(a) || 1));

/** Two-bone arm: the elbow for a shoulder S and wrist W (arrays), bone lengths L1 and L2 and a pole (where the elbow points).
 * The arm stretches up to 25 percent when the wrist is out of reach. */
export function twoBone(S, W, L1, L2, pole) {
  const d = sub(W, S);
  let dist = len(d) || 1e-4;
  const dir = mul(d, 1 / dist);
  let k = 1;
  const reach = L1 + L2;
  if (dist > reach * 0.985) k = Math.min(1.25, dist / (reach * 0.985));
  const l1 = L1 * k, l2 = L2 * k;
  dist = Math.min(dist, (l1 + l2) * 0.999);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  if (dot(p, p) < 1e-6) p = [0, -1, 0];
  p = unit(p);
  return { elbow: add(add(S, mul(dir, a)), mul(p, h)), stretch: k };
}

export const POLE_R = [-0.6, -1, 0.1];
export const POLE_L = [0.6, -1, 0.1];
export const ELBOW_R = twoBone(REST.shoulderR, REST.wristR, REST.upper, REST.fore, POLE_R).elbow;
export const ELBOW_L = twoBone(REST.shoulderL, REST.wristL, REST.upper, REST.fore, POLE_L).elbow;

// ------------------------------------------------------------------------------------------------ the hand
export const FINGER_NAMES = ["index", "middle", "ring", "pinky"];
/** Hand bones, in order. Each is a segment between two of the 25 joints (see JOINTS in game/pose.js); `palm` is the root. */
export const HAND_BONES = [
  { name: "palm", a: 0, b: 11 },
  ...FINGER_NAMES.flatMap((f, i) => {
    const m = 5 + i * 5;
    return [
      { name: `${f}1`, a: m + 1, b: m + 2, parent: -1 },
      { name: `${f}2`, a: m + 2, b: m + 3, parent: -2 },
      { name: `${f}3`, a: m + 3, b: m + 4, parent: -3 },
    ];
  }),
  { name: "thumb1", a: 1, b: 2 },
  { name: "thumb2", a: 2, b: 3 },
  { name: "thumb3", a: 3, b: 4 },
];
/** The parent of each hand bone (index into HAND_BONES), -1 for the palm. */
export const HAND_PARENT = [-1, 0, 1, 2, 0, 4, 5, 0, 7, 8, 0, 10, 11, 0, 13, 14];
/** Hand-local bind joints (right hand, XR frame: fingers along -z, palm down -y, thumb on -x): the open hand. */
export const OPEN_JOINTS = POSE_JOINTS.open;
export const RADII = POSE_RADII;

/** Joints of a hand posed between the flat hand (open = 1) and a fist (open = 0), right hand, XR frame. */
export function blendJoints(open) {
  const k = Math.max(0, Math.min(1, open));
  const A = POSE_JOINTS.fist, B = k > 0.5 ? POSE_JOINTS.open : POSE_JOINTS.default;
  const C = k > 0.5 ? POSE_JOINTS.default : POSE_JOINTS.fist;
  const t = k > 0.5 ? (k - 0.5) * 2 : k * 2;
  void A;
  return C.map((p, i) => [p[0] + (B[i][0] - p[0]) * t, p[1] + (B[i][1] - p[1]) * t, p[2] + (B[i][2] - p[2]) * t]);
}

/** Map a right-hand XR-frame joint to the Shark's hand frame (fingers +z, palm down -y, thumb +x for his right hand). */
export const toSharkLocal = (p, left) => (left ? [p[0] * HAND_SCALE, p[1] * HAND_SCALE, -p[2] * HAND_SCALE] : [-p[0] * HAND_SCALE, p[1] * HAND_SCALE, -p[2] * HAND_SCALE]);

/** The frame of a hand from its direction (wrist toward fingers): x across, y up, z along the fingers. */
export function handBasis(dir) {
  const z = unit(dir);
  let x = cross([0, 1, 0], z);
  if (len(x) < 1e-6) x = [1, 0, 0];
  x = unit(x);
  const y = cross(z, x);
  return { x, y, z };
}
export const toRoot = (q, wrist, basis) => [
  wrist[0] + basis.x[0] * q[0] + basis.y[0] * q[1] + basis.z[0] * q[2],
  wrist[1] + basis.x[1] * q[0] + basis.y[1] * q[1] + basis.z[1] * q[2],
  wrist[2] + basis.x[2] * q[0] + basis.y[2] * q[1] + basis.z[2] * q[2],
];

/** The Shark's bind joints for one hand, in table-local metres. */
export function sharkBindJoints(left) {
  const wrist = left ? REST.wristL : REST.wristR;
  const basis = handBasis(REST.dir);
  return OPEN_JOINTS.map((p) => toRoot(toSharkLocal(p, left), wrist, basis));
}

// ---------------------------------------------------------------------------------------------- the skeleton
const handNames = (side) => HAND_BONES.map((b) => `${b.name}${side}`);
/** Every bone of the Shark, in the order the baked mesh refers to them. */
export const BONE_NAMES = [
  "hip", "chest",
  "upperR", "foreR", "upperL", "foreL",
  "head", "jaw", "eyeL", "eyeR", "lidUL", "lidUR", "lidLL", "lidLR", "pupL", "pupR", "browL", "browR", "hat", "bow",
  ...handNames("R"), ...handNames("L"),
];
export const BONE = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
/** Index of the first hand bone for a side. */
export const HAND_BASE = { R: BONE.palmR, L: BONE.palmL };
