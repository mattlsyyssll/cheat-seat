/** A smooth hand for the Shark and for the player, from the 25 joints of the open hand. The surface is a blend of capsules along the
 * bones (palm, four fingers with a thumb), meshed on a grid; every vertex follows the nearest bones with a soft falloff, so a finger
 * bends like a finger. Pure maths: the bake script calls it. */
import { surfaceNets, capsule, ellipsoid, smin, smoothstep, clamp, ao } from "./sdf.js";
import { RADII, HAND_BONES, sharkBindJoints, BONE, HAND_BASE, handBasis, REST, OPEN_JOINTS } from "./shark-rig.js";
import { makeBuilder } from "./builder.js";

export const SKIN = [0.85, 0.64, 0.53];
const NAIL = [0.95, 0.8, 0.72];
const GOLD = [0.95, 0.72, 0.2];

/** Segments that belong to each hand bone: [[a, b], ...] as joint indices; the palm has several. */
const palmSegs = [[0, 5], [0, 10], [0, 15], [0, 20], [0, 1], [5, 6], [10, 11], [15, 16], [20, 21], [6, 11], [11, 16], [16, 21], [1, 5]];
export function boneSegments() {
  return HAND_BONES.map((b, i) => (i === 0 ? palmSegs : [[b.a, b.b]]));
}

const distSeg = (p, a, b) => {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 < 1e-12 ? 0 : clamp(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / l2, 0, 1);
  return { d: Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t, p[2] - a[2] - abz * t), t };
};

/** Field, bounds, colour and weights of a hand from its 25 bind joints. rs scales the joint radii. */
export function makeHand(J, o = {}) {
  const rs = o.rs ?? 1.18;
  const R = (j) => RADII[j] * rs;
  const ring = o.ring ?? false;
  const back = o.back ?? [0, 1, 0];
  /** Stage E: how thick the palm and the back of the hand are (1 = as before). A thinner palm lets the knuckles and the curled fingers of a fist show. */
  const palmK = o.palm ?? 1, padK = o.pad ?? 1;
  /** Stage E: the thickness of the fingers (1.12 as before; a little thinner for the player's hand, so the fingers of a fist show as fingers). */
  const fingerK = o.finger ?? 1.12;
  const segs = boneSegments();
  // finger chains for the field: joint index lists
  const chains = [];
  for (let f = 0; f < 4; f++) chains.push([5 + f * 5 + 1, 5 + f * 5 + 2, 5 + f * 5 + 3, 5 + f * 5 + 4]);
  chains.push([2, 3, 4]);
  const cap = (x, y, z, a, b, r1, r2) => capsule(x, y, z, J[a][0], J[a][1], J[a][2], J[b][0], J[b][1], J[b][2], r1, r2);
  /** Stage E: the palm and the back of the hand are squashed in y by `flat` (1 = as before) about the knuckle height, so the knuckles stand out of the back of the hand. */
  const flat = o.flat ?? 1;
  const yc = (J[6][1] + J[0][1]) / 2;
  const palmField = (x, y0, z) => {
    const y = yc + (y0 - yc) * flat;
    let palm = 1e9;
    const pc = (a, b, r1, r2) => { palm = smin(palm, cap(x, y, z, a, b, r1, r2), 0.012); };
    pc(0, 5, R(0) * 0.92 * palmK, R(5) * 0.98 * palmK);
    pc(0, 10, R(0) * 0.92 * palmK, R(10) * 0.98 * palmK);
    pc(0, 15, R(0) * 0.9 * palmK, R(15) * 0.98 * palmK);
    pc(0, 20, R(0) * 0.85 * palmK, R(20) * 0.95 * palmK);
    pc(0, 1, R(0) * 0.8 * Math.max(palmK, 0.85), R(1) * 1.0);
    pc(1, 2, R(1) * 1.0, R(2) * 1.15);
    for (const m of [5, 10, 15, 20]) pc(m, m + 1, R(m) * 0.95 * palmK, R(m + 1) * 1.05);
    pc(6, 11, R(6) * 1.05, R(11) * 1.05);
    pc(11, 16, R(11) * 1.05, R(16) * 1.05);
    pc(16, 21, R(16) * 1.05, R(21) * 1.0);
    // the pad of the palm
    const mx = (J[0][0] + J[11][0]) / 2, my = (J[0][1] + J[11][1]) / 2, mz = (J[0][2] + J[11][2]) / 2;
    palm = smin(palm, ellipsoid(x, y, z, mx, my, mz, 0.046 * rs, 0.019 * rs * padK, 0.052 * rs), 0.01);
    return palm / flat;
  };
  const f = (x, y, z) => {
    let d = palmField(x, y, z);
    // knuckle bumps: the four knuckles stand out of the back of the hand (they show in a fist from above)
    if (flat > 1) for (const m of [6, 11, 16, 21]) {
      // the knuckle: a rounded bump a little above and just behind the knuckle joint, so that the row of four shows on the back of the hand and at the front of a fist
      const kx = J[m][0] + back[0] * 0.0075, ky = J[m][1] + back[1] * 0.0075, kz = J[m][2] + back[2] * 0.0075 + 0.004;
      d = smin(d, capsule(x, y, z, kx, ky, kz, kx, ky, kz, R(m) * (m === 6 || m === 11 ? 1.5 : 1.4)), 0.006);
    }
    for (const c of chains) {
      let fd = 1e9;
      for (let i = 0; i < c.length - 1; i++) fd = smin(fd, cap(x, y, z, c[i], c[i + 1], R(c[i]) * fingerK, R(c[i + 1]) * fingerK), 0.004);
      d = smin(d, fd, 0.008);
    }
    if (ring) {
      // a signet ring on the little finger
      const a = J[21], b = J[22];
      const cx = a[0] + (b[0] - a[0]) * 0.3, cy = a[1] + (b[1] - a[1]) * 0.3, cz = a[2] + (b[2] - a[2]) * 0.3;
      const dx = (b[0] - a[0]) * 0.1, dy = (b[1] - a[1]) * 0.1, dz = (b[2] - a[2]) * 0.1;
      d = Math.min(d, capsule(x, y, z, cx - dx, cy - dy, cz - dz, cx + dx, cy + dy, cz + dz, R(21) * 1.12 + 0.0017, R(21) * 1.12 + 0.0017));
    }
    return d;
  };
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let j = 0; j < 25; j++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], J[j][k] - 0.04); mx[k] = Math.max(mx[k], J[j][k] + 0.04); }
  const w = [];
  const color = (x, y, z, out) => {
    const p = [x, y, z];
    let c = SKIN;
    // nails: the back side of each fingertip
    for (const [a, b] of [[8, 9], [13, 14], [18, 19], [23, 24], [3, 4]]) {
      const s = distSeg(p, J[a], J[b]);
      if (s.t > 0.35 && s.d < R(b) * 1.5) {
        const px = x - (J[a][0] + (J[b][0] - J[a][0]) * s.t), py = y - (J[a][1] + (J[b][1] - J[a][1]) * s.t), pz = z - (J[a][2] + (J[b][2] - J[a][2]) * s.t);
        const side = (px * back[0] + py * back[1] + pz * back[2]) / (Math.hypot(px, py, pz) || 1);
        const k = smoothstep(0.55, 0.8, side);
        if (k > 0) c = [c[0] + (NAIL[0] - c[0]) * k, c[1] + (NAIL[1] - c[1]) * k, c[2] + (NAIL[2] - c[2]) * k];
      }
    }
    if (ring) {
      const s = distSeg(p, J[21], J[22]);
      const k = smoothstep(0.12, 0.2, s.t) * (1 - smoothstep(0.4, 0.48, s.t)) * smoothstep(R(21) * 1.12 - 0.0004, R(21) * 1.12 + 0.0012, s.d);
      c = [c[0] + (GOLD[0] - c[0]) * k, c[1] + (GOLD[1] - c[1]) * k, c[2] + (GOLD[2] - c[2]) * k];
    }
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
  /** Weights over the 16 hand bones for a point: [[boneIndex, weight], ...]. */
  const weights = (x, y, z, outW) => {
    const p = [x, y, z];
    outW.length = 0;
    for (let bi = 0; bi < segs.length; bi++) {
      let d = 1e9;
      for (const [a, b] of segs[bi]) d = Math.min(d, distSeg(p, J[a], J[b]).d);
      outW.push([bi, 1 / Math.pow(d + 0.0055, 3)]);
    }
    outW.sort((u, v) => v[1] - u[1]);
    outW.length = 4;
    let s = 0;
    for (const e of outW) s += e[1];
    for (const e of outW) e[1] /= s;
  };
  return { f, min: mn, max: mx, color, weights };
}

/** The Shark's hand on one side, built at its rest pose in table-local metres. The left hand wears a gold ring. */
export function buildHand(b, q, left) {
  const J = sharkBindJoints(left);
  const basis = handBasis(REST.dir);
  const hand = makeHand(J, { rs: 1.2, ring: left, back: basis.y });
  const mesh = surfaceNets({ f: hand.f, min: hand.min, max: hand.max, h: q.hand });
  if (left) {
    // sharkBindJoints already mirrors the joints; the mesh is built from them, so nothing to flip
  }
  const base = left ? HAND_BASE.L : HAND_BASE.R;
  const ws = [];
  const c3 = [0, 0, 0];
  b.add(mesh, (x, y, z, o, i, nx, ny, nz) => {
    hand.color(x, y, z, c3);
    const k = Math.min(0.7, ao(hand.f, x, y, z, nx, ny, nz, 0.9) * 0.95);
    o.c = [c3[0] * (1 - k * 0.5), c3[1] * (1 - k * 0.72), c3[2] * (1 - k * 0.68)];
    hand.weights(x, y, z, ws);
    for (const [bi, w] of ws) o.w.push([base + bi, w]);
  }, { name: left ? "handL" : "handR", outline: true });
}

const SLEEVE = [0.2, 0.23, 0.33], CUFF = [0.93, 0.89, 0.8];

/** The player's hand (right hand, XR frame: fingers along -z, palm down, thumb on -x) with a jacket sleeve and a white cuff behind the
 * wrist. Bones are the 16 hand bones, index 0 = palm; the sleeve follows the palm. The left hand is this mesh mirrored at run time. */
export function buildPlayerHand(quality = {}) {
  const hq = quality.hand ?? 0.0052, sq = quality.sleeve ?? 0.009;
  const J = OPEN_JOINTS_XR();
  const hand = makeHand(J, { rs: 1.2, back: [0, 1, 0], palm: quality.palm ?? 0.8, pad: quality.pad ?? 0.8, flat: quality.flat ?? 1.4, finger: quality.finger ?? 0.98 });
  const b = makeBuilder();
  const mesh = surfaceNets({ f: hand.f, min: hand.min, max: hand.max, h: hq });
  const ws = [];
  const c3 = [0, 0, 0];
  b.add(mesh, (x, y, z, o, i, nx, ny, nz) => {
    hand.color(x, y, z, c3);
    const k = Math.min(0.7, ao(hand.f, x, y, z, nx, ny, nz, 0.9) * 0.95);
    hand.weights(x, y, z, ws);
    // stage E: a crease colour where two different fingers share the skin (the webs; in a fist, the grooves between the curled fingers). It reads wherever the fingers meet.
    const grp = (bi) => (bi === 0 ? -1 : bi >= 13 ? 4 : Math.floor((bi - 1) / 3));
    const crease = ws.length > 1 && grp(ws[0][0]) !== grp(ws[1][0]) && grp(ws[0][0]) >= 0 && grp(ws[1][0]) >= 0 ? smoothstep(0.16, 0.42, ws[1][1]) : 0;
    const kk = Math.min(0.85, k + crease * 0.55);
    const dark = 1;
    o.c = [c3[0] * (1 - kk * 0.5) * dark, c3[1] * (1 - kk * 0.72) * dark, c3[2] * (1 - kk * 0.68) * dark];
    for (const [bi, w] of ws) o.w.push([bi, w]);
  }, { name: "hand", outline: true });
  // stage D: no baked sleeve any more. It was a rigid 38 cm tube that followed the palm (a dark pipe when the hand reached). The arm is drawn at run
  // time (art/arm.ts): a tapering sleeve with a cuff that bends at the elbow toward the player's shoulder.
  return b.data();
}
const OPEN_JOINTS_XR = () => OPEN_JOINTS;
