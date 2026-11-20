/** The Shark's head as smooth shapes (pure maths, head-local metres: +z is forward, +y up, +x is his left).
 * `headSkin` is the face, `hairShape` the slicked hair, `mouthCut` the opening that the jaw swings through. `headSurface` joins them
 * and `headColor` says what each point of the surface is made of. Baked into triangles by shark-model.js. */
import { ellipsoid, capsule, sphere, smin, smax, ssub, clamp, smoothstep } from "./sdf.js";

/** Height of the mouth line at sideways distance ax: a smirk (the corners lift). */
export const mouthY = (ax) => -0.061 + 4.6 * ax * ax;
/** The hinge the jaw turns on (head-local). */
export const JAW_HINGE = [0, -0.028, -0.016];
export const EYE = { x: 0.0385, y: 0.012, z: 0.074, r: 0.0192 };

export function headSkin(x, y, z) {
  const ax = Math.abs(x);
  let d = ellipsoid(ax, y, z, 0, 0.046, -0.012, 0.088, 0.099, 0.098);
  d = smin(d, ellipsoid(ax, y, z, 0, -0.03, 0.02, 0.07, 0.088, 0.077), 0.035);
  // lower jaw: a wide block, a square chin and a jawline running from the ear to the chin
  d = smin(d, ellipsoid(ax, y, z, 0, -0.072, 0.012, 0.064, 0.045, 0.07), 0.03);
  d = smin(d, ellipsoid(ax, y, z, 0, -0.1, 0.055, 0.037, 0.026, 0.031), 0.026);
  d = smin(d, capsule(ax, y, z, 0.07, -0.04, -0.012, 0.03, -0.1, 0.05, 0.02, 0.023), 0.022);
  d = smin(d, sphere(ax, y, z, 0.052, -0.012, 0.062, 0.024), 0.032);
  // brow ridge, heavy over the eyes
  d = smin(d, capsule(ax, y, z, 0.0, 0.042, 0.087, 0.07, 0.036, 0.066, 0.0165, 0.015), 0.02);
  // nose: a bridge, a hooked tip and two wings
  d = smin(d, capsule(ax, y, z, 0, 0.022, 0.085, 0, -0.024, 0.114, 0.0105, 0.0165), 0.014);
  d = smin(d, sphere(ax, y, z, 0.0, -0.004, 0.102, 0.012), 0.014);
  d = smin(d, sphere(ax, y, z, 0.0135, -0.028, 0.101, 0.0105), 0.01);
  // ears
  d = smin(d, ellipsoid(ax, y, z, 0.089, -0.004, -0.012, 0.0095, 0.027, 0.019), 0.012);
  // eye sockets: the eyeball sits in them
  d = ssub(d, sphere(ax, y, z, EYE.x, EYE.y, EYE.z + 0.02, 0.0248), 0.012);
  return d;
}

/** The lips: two ridges that follow the mouth line. */
export function lips(x, y, z) {
  const ax = Math.abs(x);
  let d = 1e9;
  const pts = [0, 0.014, 0.028, 0.041];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    d = Math.min(d, capsule(ax, y, z, a, mouthY(a) + 0.0092, 0.0845, b, mouthY(b) + 0.0092, 0.0845, 0.0066, 0.0058));
    d = Math.min(d, capsule(ax, y, z, a, mouthY(a) - 0.0098, 0.0845, b, mouthY(b) - 0.0098, 0.0845, 0.0072, 0.0062));
  }
  return d;
}

export function hairShape(x, y, z) {
  const ax = Math.abs(x);
  const d = ellipsoid(ax, y, z, 0, 0.05, -0.014, 0.0945, 0.1055, 0.1045);
  // hair grows above a line that drops at the sides (sideburns) and at the back (nape)
  const front = 0.078 - 2.4 * Math.max(0, ax - 0.05);
  const back = -0.046;
  const line = back + (front - back) * smoothstep(-0.03, 0.02, z);
  return Math.max(d, line - y);
}

/** Whole head surface: skin with a soft crease along the mouth line, lips, nostrils, hair. */
export function headSurface(x, y, z) {
  const ax = Math.abs(x);
  let d = smin(headSkin(x, y, z), lips(x, y, z), 0.012);
  // the mouth line: a thin groove (the open mouth is a separate patch, see shark-model.js)
  const groove = Math.max(Math.abs(y - mouthY(ax)) - 0.0009, ax - 0.047, 0.07 - z);
  d = smax(d, 0.0016 - groove, 0.004);
  const nostril = sphere(ax, y, z, 0.0072, -0.0355, 0.108, 0.0052);
  d = smax(d, -nostril, 0.003);
  return Math.min(d, hairShape(x, y, z));
}

const SKIN = [0.82, 0.63, 0.53];
const SKIN_DARK = [0.66, 0.44, 0.38];
const LIP = [0.74, 0.43, 0.4];
const GROOVE = [0.3, 0.1, 0.1];
const HAIR = [0.1, 0.08, 0.075];
const NOSTRIL = [0.25, 0.1, 0.1];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Colour (0..1, display values) of the head surface at a point; blends are smooth so the colours do not step. */
export function headColor(x, y, z, out) {
  const ax = Math.abs(x);
  const skinD = smin(headSkin(x, y, z), lips(x, y, z), 0.012);
  const hairD = hairShape(x, y, z);
  let c = SKIN;
  // lips
  c = mixc(c, LIP, (1 - smoothstep(-0.0004, 0.0018, lips(x, y, z) - 0.0006)) * smoothstep(0.05, 0.075, z));
  // the mouth line
  const gl = Math.max(Math.abs(y - mouthY(ax)) - 0.0004, ax - 0.047, 0.07 - z);
  c = mixc(c, GROOVE, 1 - smoothstep(0.0003, 0.0026, gl));
  // nostrils
  c = mixc(c, NOSTRIL, 1 - smoothstep(0.003, 0.0085, Math.hypot(ax - 0.0072, y + 0.0355, z - 0.108)));
  // shade in the eye sockets
  c = mixc(c, SKIN_DARK, 0.16 * (1 - smoothstep(0.022, 0.033, Math.hypot(ax - EYE.x, y - EYE.y, z - (EYE.z + 0.015)))));
  // hair
  c = mixc(c, HAIR, 1 - smoothstep(-0.0005, 0.0016, hairD - skinD));
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return c;
}

/** 0..1: how much of the jaw bone a head surface point follows. Steep right at the mouth line (the open-mouth patch covers that band),
 * and wider toward the cheeks so the face does not smear when the jaw opens. */
export function jawWeight(x, y, z) {
  const ax = Math.abs(x);
  const m = mouthY(ax);
  const band = 0.0055 + 0.032 * smoothstep(0.03, 0.075, ax);
  const below = 1 - smoothstep(m - band, m + 0.0015, y);
  const region = smoothstep(-0.02, 0.03, z) * (1 - smoothstep(0.072, 0.094, ax));
  return clamp(below * region, 0, 1);
}

/** Where the head surface is along the line of sight at (x, y): the z of the first point inside, found from the front. */
export function surfaceZ(x, y) {
  let z0 = 0.14;
  const step = 0.002;
  let prev = z0;
  for (let z = z0; z > 0.02; z -= step) {
    if (headSurface(x, y, z) < 0) {
      let a = prev, b = z;
      for (let i = 0; i < 10; i++) {
        const m = (a + b) / 2;
        if (headSurface(x, y, m) < 0) b = m; else a = m;
      }
      return (a + b) / 2;
    }
    prev = z;
  }
  return 0.08;
}
