/** Builds the Shark's whole body as one skinned mesh (plain arrays, no graphics library). Run by the bake script (qa/stageB/bake-shark.mjs)
 * so the page loads triangles instead of meshing at start; the picture harness can also run it live. Shapes come from shark-head.js,
 * shark-body.js and shark-hand.js; this file joins them, colours them and gives every vertex its bones. */
import { surfaceNets, ao, smoothstep } from "./sdf.js";
import { spherePatch, disc, cone, tube, grid } from "./prims.js";
import { REST, BONE, HEAD_SCALE } from "./shark-rig.js";
import { headSurface, headColor, jawWeight, surfaceZ, EYE, mouthY } from "./shark-head.js";
import { buildHat } from "./shark-hat.js";
import { buildBody } from "./shark-body.js";
import { makeBuilder } from "./builder.js";
export { makeBuilder };
import { buildHand } from "./shark-hand.js";

export const QUALITY = { head: 0.0043, body: 0.016, hand: 0.0048 };

const SKIN_LID = [0.66, 0.5, 0.42];
const LASH = [0.16, 0.08, 0.07];
const BROW = [0.1, 0.07, 0.065];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function eyeParts(b) {
  const H = REST.head;
  for (const side of [1, -1]) {
    const L = side > 0; // +x is his left
    const cx = EYE.x * side, cy = EYE.y, cz = EYE.z;
    const eyeBone = L ? BONE.eyeL : BONE.eyeR;
    const pupBone = L ? BONE.pupL : BONE.pupR;
    const R = EYE.r;
    // eyeball
    const ball = spherePatch(R, 0, Math.PI, 0, Math.PI * 2, 22, 16, cx, cy, cz);
    b.add(ball, (x, y, z, o) => { o.c = [1, 0.98, 0.94]; o.flat = 0.6; o.w.push([eyeBone, 1]); }, { offset: H, scale: HEAD_SCALE, name: "eyeball", outline: false });
    // iris ring, iris, pupil: discs lying on the front of the ball, turning with it
    const ring = [[0.0099, [0.2, 0.09, 0.04], 0.00018], [0.0085, [0.72, 0.42, 0.12], 0.00028]];
    for (const [r, c, up] of ring) {
      const chord = Math.sqrt(R * R - r * r);
      b.add(disc(r, 24, cx, cy, cz + chord, R - chord + up), (x, y, z, o) => { o.c = c; o.flat = 0.9; o.w.push([eyeBone, 1]); }, { offset: H, scale: HEAD_SCALE, name: "iris" });
    }
    const pr = 0.0045, pchord = Math.sqrt(R * R - pr * pr);
    b.add(disc(pr, 18, cx, cy, cz + pchord, R - pchord + 0.0004), (x, y, z, o) => { o.c = [0.02, 0.012, 0.012]; o.flat = 1; o.w.push([pupBone, 1]); }, { offset: H, scale: HEAD_SCALE, name: "pupil" });
    // a glint that stays with the head, so the eye looks wet
    const gx = cx - 0.0026 * side * -1 * 0 - 0.0025, gy = cy + 0.0033;
    const gz = Math.sqrt(R * R - 0.0025 * 0.0025 - 0.0033 * 0.0033);
    b.add(disc(0.0017, 10, gx, gy, cz + gz + 0.0007, 0), (x, y, z, o) => { o.c = [1, 0.98, 0.94]; o.flat = 1; o.w.push([BONE.head, 1]); }, { offset: H, scale: HEAD_SCALE, name: "glint" });
    // lids: two caps a little larger than the ball
    const lr = R + 0.0015;
    const upper = spherePatch(lr, 0, Math.PI / 2, 0, Math.PI * 2, 22, 12, cx, cy, cz);
    const lower = spherePatch(lr, Math.PI / 2, Math.PI / 2, 0, Math.PI * 2, 22, 10, cx, cy, cz);
    const lidColor = (y, up) => {
      // the rim (the row at the equator) is dark: a lash line
      const k = clamp01(1 - Math.abs((y - cy) / lr) / 0.2);
      return [SKIN_LID[0] + (LASH[0] - SKIN_LID[0]) * k, SKIN_LID[1] + (LASH[1] - SKIN_LID[1]) * k, SKIN_LID[2] + (LASH[2] - SKIN_LID[2]) * k];
    };
    b.add(upper, (x, y, z, o) => { o.c = lidColor(y, true); o.w.push([L ? BONE.lidUL : BONE.lidUR, 1]); }, { offset: H, scale: HEAD_SCALE, name: "lid" });
    b.add(lower, (x, y, z, o) => { o.c = lidColor(y, false); o.w.push([L ? BONE.lidLL : BONE.lidLR, 1]); }, { offset: H, scale: HEAD_SCALE, name: "lid" });
    // brow: a thick arch of hair above the lid
    const pts = [[0.011, 0.0495, 0.0935], [0.025, 0.0595, 0.0935], [0.045, 0.0625, 0.0895], [0.066, 0.0545, 0.0775]].map((p) => [p[0] * side, p[1], p[2]]);
    if (side < 0) pts.reverse();
    b.add(tube(pts, (t) => 0.0076 - 0.003 * Math.abs(t - (side > 0 ? 0.2 : 0.8)) * 1.2, 8), (x, y, z, o) => { o.c = BROW; o.w.push([L ? BONE.browL : BONE.browR, 1]); }, { offset: H, scale: HEAD_SCALE, name: "brow" });
  }
}

const MOUTH_DARK = [0.13, 0.035, 0.045], TONGUE = [0.55, 0.17, 0.2], TOOTH = [0.96, 0.94, 0.86];

/** The open mouth: a patch laid on the mouth line (dark inside, a tongue at the bottom), and two rows of small pointed teeth, one on each
 * side of the line. The top of the patch and the upper teeth follow the head, the bottom and the lower teeth follow the jaw; the patch
 * stretches in between. Shut, it is a thin dark line with the tips of the teeth showing. */
function mouthParts(b) {
  const H = REST.head;
  const nu = 24, nv = 3, half = 0.0436;
  const lens = grid(nu, nv, (u, v) => {
    const x = (u * 2 - 1) * half, ax = Math.abs(x);
    const gap = 0.0004 + 0.0017 * (1 - (ax / half) ** 2);
    const y = mouthY(ax) + 0.0006 - gap * v - 0.0006 * v;
    const z = surfaceZ(x, y) + 0.0004;
    return [x, y, z];
  });
  b.add(lens, (x, y, z, o, i) => {
    const row = Math.floor(i / (nu + 1));
    const v = row / nv;
    o.c = v > 0.5 ? TONGUE.map((c, k) => MOUTH_DARK[k] + (c - MOUTH_DARK[k]) * (v - 0.5) * 1.4) : MOUTH_DARK;
    o.flat = 0.55;
    o.w.push([BONE.head, 1 - v], [BONE.jaw, v]);
  }, { offset: H, scale: HEAD_SCALE, name: "mouth", outline: false });
  const teeth = (upper) => {
    const n = upper ? 9 : 8;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.0092;
      const ax = Math.abs(x);
      const y0 = mouthY(ax) + (upper ? 0.0006 : -0.0019 - 0.0006);
      const z = surfaceZ(x, y0) + 0.0005;
      const len = (upper ? 0.0105 : 0.0088) * (1 - 0.35 * (ax / half) ** 2);
      const m = cone(x, y0, z, x, y0 + (upper ? -len : len), z + 0.0004, 0.0046, 5);
      b.add(m, (X, Y, Z, o) => { o.c = TOOTH; o.flat = 0.25; o.w.push([upper ? BONE.head : BONE.jaw, 1]); }, { offset: H, scale: HEAD_SCALE, name: "teeth", outline: false });
    }
  };
  teeth(true);
  teeth(false);
}

export function buildShark(opts = {}) {
  const q = { ...QUALITY, ...(opts.quality ?? {}) };
  const b = makeBuilder();
  const H = REST.head;
  // ---- head skin and hair (outlined)
  // the top of the skull is under the hat: cut it off at y = 0.098 to save triangles
  const head = surfaceNets({ f: (x, y, z) => Math.max(headSurface(x, y, z), y - 0.098), min: [-0.125, -0.14, -0.125], max: [0.125, 0.11, 0.14], h: q.head });
  const col = [0, 0, 0];
  b.add(head, (x, y, z, o, i, nx, ny, nz) => {
    headColor(x, y, z, col);
    // creases darken and redden (skin), the forehead under the brim is a little darker
    const occ = ao(headSurface, x, y, z, nx, ny, nz, 0.85);
    const brim = smoothstep(0.052, 0.088, y) * smoothstep(-0.01, 0.06, z) * 0.3;
    const k = Math.min(0.75, occ * 0.95 + brim);
    o.c = [col[0] * (1 - k * 0.55), col[1] * (1 - k * 0.78), col[2] * (1 - k * 0.72)];
    const j = jawWeight(x, y, z);
    o.w.push([BONE.head, 1 - j], [BONE.jaw, j]);
  }, { offset: H, scale: HEAD_SCALE, name: "head", outline: true });
  eyeParts(b);
  mouthParts(b);
  if (opts.parts?.hat !== false) buildHat(b, q);
  if (opts.parts?.hands !== false) { buildHand(b, q, false); buildHand(b, q, true); }
  if (opts.parts?.body !== false) buildBody(b, q);
  return b.data();
}
