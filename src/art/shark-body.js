/** The Shark below the head: a broad-shouldered torso in a jacket, a thick neck, two sleeves that end in white cuffs, a shirt front, lapels
 * and a bow tie. The big forms are one smooth mesh on a coarse grid; the details (shirt, lapels, collar, tie) are thin strips laid on the
 * surface, so they stay crisp and cost few triangles. Table-local metres, built at the rest pose. */
import { surfaceNets, ellipsoid, capsule, smin, smoothstep, clamp, ao } from "./sdf.js";
import { spherePatch, cone, tube } from "./prims.js";
import { REST, BONE, ELBOW_R, ELBOW_L, HAND_BASE, unit, sub } from "./shark-rig.js";

export const JACKET = [0.22, 0.26, 0.38];
export const LAPEL = [0.31, 0.36, 0.5];
export const SHIRT = [0.92, 0.88, 0.78];
export const TIE = [0.6, 0.12, 0.13];
const SKIN = [0.84, 0.63, 0.52];
const CUFF = [0.95, 0.92, 0.84];

const S = { R: REST.shoulderR, L: REST.shoulderL };
const E = { R: ELBOW_R, L: ELBOW_L };
const W = { R: REST.wristR, L: REST.wristL };

/** The jacket, neck and sleeves as one shape. */
export function bodyField(x, y, z) {
  const ax = Math.abs(x);
  const chest = ellipsoid(ax, y, z, 0, 0.225, -0.525, 0.19, 0.15, 0.115);
  const waist = ellipsoid(ax, y, z, 0, -0.005, -0.56, 0.158, 0.21, 0.1);
  let d = smin(chest, waist, 0.09);
  d = smin(d, capsule(ax, y, z, 0, 0.305, -0.51, 0.205, 0.3, -0.5, 0.056, 0.06), 0.05);
  d = smin(d, capsule(ax, y, z, 0, 0.345, -0.51, 0.13, 0.315, -0.505, 0.045, 0.05), 0.05);
  d = smin(d, capsule(ax, y, z, 0, 0.3, -0.51, 0, 0.376, -0.5, 0.043, 0.04), 0.03);
  for (const s of ["R", "L"]) {
    const sh = S[s], el = E[s], wr = W[s];
    const up = capsule(x, y, z, sh[0], sh[1], sh[2], el[0], el[1], el[2], 0.058, 0.051);
    let fo = capsule(x, y, z, el[0], el[1], el[2], wr[0], wr[1], wr[2], 0.049, 0.039);
    const u = unit(sub(wr, el));
    fo = Math.max(fo, (x - wr[0]) * u[0] + (y - wr[1]) * u[1] + (z - wr[2]) * u[2]); // flat end at the wrist
    d = smin(d, up, 0.04);
    d = smin(d, fo, 0.02);
  }
  return d;
}

function raycastFront(f, x, y) {
  // march from the player's side toward the Shark until the surface, then bisect
  let z0 = -0.28, z1 = -0.7, prev = z0;
  const step = 0.006;
  for (let z = z0; z > z1; z -= step) {
    if (f(x, y, z) < 0) {
      let a = prev, b = z;
      for (let i = 0; i < 10; i++) {
        const m = (a + b) / 2;
        if (f(x, y, m) < 0) b = m; else a = m;
      }
      return (a + b) / 2;
    }
    prev = z;
  }
  return -0.5;
}

/** A strip laid on the surface in front: param(u, v) -> [x, y]; the surface point is pushed out by `off`. Returns a mesh. */
function decal(f, nu, nv, param, off, flip = false) {
  const positions = [], normals = [], indices = [];
  const e = 0.004;
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const [x, y] = param(i / nu, j / nv);
      const z = raycastFront(f, x, y);
      let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1;
      gx /= l; gy /= l; gz /= l;
      positions.push(x + gx * off, y + gy * off, z + gz * off);
      normals.push(gx, gy, gz);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  return { positions, normals, indices };
}

const SEGS = (() => {
  // bones as segments with a radius, for the soft weights: [bone, [a], [b], radius]
  const sg = [
    [BONE.hip, [0, -0.15, -0.6], [0, -0.03, -0.58], 0.14],
    [BONE.chest, [0, 0.04, -0.55], [0, 0.34, -0.51], 0.17],
    [BONE.head, [0, 0.37, -0.505], [0, 0.47, -0.46], 0.04],
  ];
  for (const s of ["R", "L"]) {
    sg.push([BONE["upper" + s], S[s], E[s], 0.052]);
    sg.push([BONE["fore" + s], E[s], W[s], 0.042]);
    const u = unit(sub(W[s], E[s]));
    sg.push([HAND_BASE[s], W[s], [W[s][0] + u[0] * 0.04, W[s][1] + u[1] * 0.04, W[s][2] + u[2] * 0.04], 0.03]);
  }
  return sg;
})();

const segDist = (x, y, z, a, b) => {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = clamp(((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / l2, 0, 1);
  return Math.hypot(x - a[0] - abx * t, y - a[1] - aby * t, z - a[2] - abz * t);
};

export function bodyWeights(x, y, z, out) {
  out.length = 0;
  for (const [bone, a, b, r] of SEGS) {
    const d = Math.max(0, segDist(x, y, z, a, b) - r);
    out.push([bone, 1 / Math.pow(d + 0.022, 2.4)]);
  }
}

function bodyColor(x, y, z, out) {
  const ax = Math.abs(x);
  let c = JACKET;
  // neck above the collar is skin
  const neck = smoothstep(0.347, 0.356, y) * (1 - smoothstep(0.05, 0.062, Math.hypot(ax, z + 0.505)));
  c = c.map((v, i) => v + (SKIN[i] - v) * neck);
  // a collar of shirt around the neck base
  const col = smoothstep(0.31, 0.318, y) * (1 - smoothstep(0.347, 0.354, y)) * (1 - smoothstep(0.052, 0.066, Math.hypot(ax, z + 0.505)));
  c = c.map((v, i) => v + (SHIRT[i] - v) * col);
  // stage D: the sleeve is jacket colour right to the wrist; the cuff is its own band (see buildBody), crisp, not a 6 mm colour gradient
  // stage D: the lower body is the jacket colour too. It used to fade to black below the table top (a black cylinder showed in the headset, where the
  // real desk does not hide it); now a hard cut at the table top hides it (toon.ts `clipY`) and the table top reaches under him (art/set.ts).
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

export function buildBody(b, q) {
  const mesh = surfaceNets({ f: bodyField, min: [-0.46, -0.22, -0.7], max: [0.46, 0.4, -0.12], h: q.body });
  const ws = [];
  const col = [0, 0, 0];
  b.add(mesh, (x, y, z, o, i, nx, ny, nz) => {
    bodyColor(x, y, z, col);
    const k = Math.min(0.6, ao(bodyField, x, y, z, nx, ny, nz, 2.2) * 1.1);
    o.c = [col[0] * (1 - k * 0.6), col[1] * (1 - k * 0.65), col[2] * (1 - k * 0.55)];
    bodyWeights(x, y, z, ws);
    const s = ws.reduce((a, p) => a + p[1], 0);
    for (const [bone, w] of ws) o.w.push([bone, w / s]);
  }, { name: "body" });

  // the shirt front: a V that opens from the collar to the belly
  const vHalf = (y) => 0.003 + 0.061 * (y - 0.08) / 0.255; // round 3: the V closes to a point (was 2.4 cm wide and cut off flat, which read as a jagged edge)
  const shirt = decal(bodyField, 8, 24, (u, v) => {
    const y = 0.335 - v * 0.255;
    return [(u * 2 - 1) * vHalf(y), y];
  }, 0.004); // stage F (D3): 4 mm off the body (was 1.2 mm): the body mesh is a 16 mm grid and poked through the bottom of the V in a jagged line
  const chestW = (x, y, z, o) => {
    const k = smoothstep(-0.12, 0.2, y);
    o.w.push([BONE.chest, k], [BONE.hip, 1 - k]);
  };
  b.add(shirt, (x, y, z, o) => { o.c = [SHIRT[0], SHIRT[1], SHIRT[2]]; chestW(x, y, z, o); }, { name: "shirt" });
  // lapels: one on each side of the V
  for (const sx of [-1, 1]) {
    const lap = decal(bodyField, 4, 12, (u, v) => {
      const y = 0.338 - v * 0.255;
      const inner = vHalf(y) + 0.002, outer = inner + 0.016 + 0.052 * Math.sin(Math.PI * (0.18 + 0.82 * v)) * (1 - v * 0.3);
      return [sx * (inner + (outer - inner) * u), y];
    }, 0.0058, sx < 0); // stage F: stays above the shirt (was 3.5 mm)
    b.add(lap, (x, y, z, o) => { o.c = [LAPEL[0], LAPEL[1], LAPEL[2]]; chestW(x, y, z, o); }, { name: "lapel" });
  }
  // a pocket square on his left breast
  const pocket = decal(bodyField, 4, 3, (u, v) => [0.09 + u * 0.045, 0.2 - v * 0.012 + u * 0.006], 0.0066);
  b.add(pocket, (x, y, z, o) => { o.c = [0.93, 0.89, 0.8]; chestW(x, y, z, o); }, { name: "pocket" });

  // cuffs (stage D): a short cream band round the end of each sleeve, with rounded edges, fixed to the forearm bone; it is a little wider than the
  // sleeve so it reads as a turned-back cuff, and its edge is as sharp as the mesh (the old colour gradient over 6 mm of sleeve looked fuzzy)
  for (const s of ["R", "L"]) {
    const wr = W[s], el = E[s], u = unit(sub(wr, el));
    const p0 = [wr[0] - u[0] * 0.036, wr[1] - u[1] * 0.036, wr[2] - u[2] * 0.036];
    const p1 = [wr[0] - u[0] * 0.004, wr[1] - u[1] * 0.004, wr[2] - u[2] * 0.004];
    const band = tube([p0, p1], 0.0445, 14);
    b.add(band, (x, y, z, o) => { o.c = [CUFF[0], CUFF[1], CUFF[2]]; o.w.push([BONE["fore" + s], 1]); }, { name: "cuff" });
  }

  // bow tie: a knot and two wings, flattened
  const T = [0, 0.321, -0.4];
  const wing = (sx) => {
    const m = cone(T[0] + sx * 0.005, T[1], T[2], T[0] + sx * 0.034, T[1], T[2] + 0.002, 0.0165, 7);
    for (let i = 2; i < m.positions.length; i += 3) m.positions[i] = T[2] + (m.positions[i] - T[2]) * 0.4;
    return m;
  };
  for (const sx of [-1, 1]) b.add(wing(sx), (x, y, z, o) => { o.c = TIE; o.w.push([BONE.bow, 1]); }, { name: "bow" });
  const knot = spherePatch(0.009, 0, Math.PI, 0, Math.PI * 2, 10, 8, T[0], T[1], T[2] + 0.002, 1, 1, 0.8);
  b.add(knot, (x, y, z, o) => { o.c = [TIE[0] * 0.9, TIE[1] * 0.9, TIE[2] * 0.9]; o.w.push([BONE.bow, 1]); }, { name: "bow" });
}
