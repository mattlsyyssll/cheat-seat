/** Smooth-shape maths and a mesher, in plain JavaScript with no graphics library, so the same code runs in the browser and in the
 * build-time bake script (qa/stageB/bake-shark.mjs). A shape is a function (x, y, z) -> distance: negative inside, positive outside.
 * `surfaceNets` turns a shape into a smooth triangle mesh; vertex normals come from the shape's own slope, so the result is
 * round even with a coarse grid. Nothing here draws. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Smooth union / intersection / subtraction (polynomial, k = blend width in metres). */
export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);
export const ssub = (a, b, k) => smax(a, -b, k);

export const sphere = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;

/** Ellipsoid with radii (rx, ry, rz); the distance is approximate, which is enough for meshing. */
export function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

/** Capsule from a to b with radius r1 at a and r2 at b. */
export function capsule(x, y, z, ax, ay, az, bx, by, bz, r1, r2 = r1) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const bb = bax * bax + bay * bay + baz * baz;
  const h = bb < 1e-12 ? 0 : clamp((pax * bax + pay * bay + paz * baz) / bb, 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (r1 + (r2 - r1) * h);
}

/** Rounded box centred at c with half sizes (hx, hy, hz) and corner radius r. */
export function roundBox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/**
 * Naive surface nets: a smooth triangle mesh of the zero surface of `f` inside a box.
 * @param {{f:(x:number,y:number,z:number)=>number, min:number[], max:number[], h:number, project?:number}} o
 *   h = grid step in metres; project = how many times each vertex is pulled onto the true surface (default 1).
 * @returns {{positions:Float32Array, normals:Float32Array, indices:Uint32Array}}
 */
export function surfaceNets(o) {
  const { f, h } = o;
  const [x0, y0, z0] = o.min;
  const nx = Math.ceil((o.max[0] - x0) / h), ny = Math.ceil((o.max[1] - y0) / h), nz = Math.ceil((o.max[2] - z0) / h);
  const sx = nx + 1, sy = ny + 1, sz = nz + 1;
  const field = new Float32Array(sx * sy * sz);
  const gi = (i, j, k) => i + sx * (j + sy * k);
  for (let k = 0; k < sz; k++)
    for (let j = 0; j < sy; j++)
      for (let i = 0; i < sx; i++) field[gi(i, j, k)] = f(x0 + i * h, y0 + j * h, z0 + k * h);

  const cellId = new Int32Array(nx * ny * nz).fill(-1);
  const ci = (i, j, k) => i + nx * (j + ny * k);
  const pos = [];
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  let count = 0;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const d = field[gi(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
          v[c] = d;
          if (d < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, n = 0;
        for (const [a, b] of EDGES) {
          const da = v[a], db = v[b];
          if (da < 0 === db < 0) continue;
          const t = da / (da - db);
          ax += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
          ay += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
          az += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
          n++;
        }
        cellId[ci(i, j, k)] = count++;
        pos.push(x0 + (i + ax / n) * h, y0 + (j + ay / n) * h, z0 + (k + az / n) * h);
      }

  // pull every vertex onto the surface (one or two Newton steps along the slope)
  const e = h * 0.35;
  const grad = (x, y, z, out) => {
    out[0] = f(x + e, y, z) - f(x - e, y, z);
    out[1] = f(x, y + e, z) - f(x, y - e, z);
    out[2] = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
  };
  const g = [0, 0, 0];
  const steps = o.project ?? 1;
  const normals = new Float32Array(count * 3);
  for (let n = 0; n < count; n++) {
    let x = pos[n * 3], y = pos[n * 3 + 1], z = pos[n * 3 + 2];
    for (let s = 0; s < steps; s++) {
      const d = f(x, y, z);
      grad(x, y, z, g);
      const m = clamp(d, -h * 0.8, h * 0.8);
      x -= g[0] * m; y -= g[1] * m; z -= g[2] * m;
    }
    pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
    grad(x, y, z, g);
    normals[n * 3] = g[0]; normals[n * 3 + 1] = g[1]; normals[n * 3 + 2] = g[2];
  }

  // quads around every grid edge that crosses the surface
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < sz; k++)
    for (let j = 0; j < sy; j++)
      for (let i = 0; i < sx; i++) {
        const d0 = field[gi(i, j, k)];
        const in0 = d0 < 0;
        if (i < nx && j >= 1 && k >= 1 && j < sy && k < sz) {
          if (in0 !== field[gi(i + 1, j, k)] < 0)
            quad(cellId[ci(i, j - 1, k - 1)], cellId[ci(i, j, k - 1)], cellId[ci(i, j, k)], cellId[ci(i, j - 1, k)], in0);
        }
        if (j < ny && i >= 1 && k >= 1) {
          if (in0 !== field[gi(i, j + 1, k)] < 0)
            quad(cellId[ci(i - 1, j, k - 1)], cellId[ci(i - 1, j, k)], cellId[ci(i, j, k)], cellId[ci(i, j, k - 1)], in0);
        }
        if (k < nz && i >= 1 && j >= 1) {
          if (in0 !== field[gi(i, j, k + 1)] < 0)
            quad(cellId[ci(i - 1, j - 1, k)], cellId[ci(i, j - 1, k)], cellId[ci(i, j, k)], cellId[ci(i - 1, j, k)], in0);
        }
      }
  // make every triangle face along its vertex normals
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nxv = uy * wz - uz * wy, nyv = uz * wx - ux * wz, nzv = ux * wy - uy * wx;
    const dot = nxv * (normals[a * 3] + normals[b * 3] + normals[c * 3]) + nyv * (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]) + nzv * (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]);
    if (dot < 0) {
      idx[t + 1] = c;
      idx[t + 2] = b;
    }
  }
  return { positions: Float32Array.from(pos), normals, indices: Uint32Array.from(idx) };
}

/**
 * Ambient occlusion from a shape's own slope: how much of the space just above the surface at p (normal n) is filled. 0 = open, 1 = a crevice.
 * Baked into vertex colours so creases (eye sockets, under the nose, between fingers) read in soft light.
 */
export function ao(f, x, y, z, nx, ny, nz, scale = 1) {
  const hs = [0.0045, 0.0095, 0.017, 0.028];
  let occ = 0, wsum = 0;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i] * scale;
    const d = f(x + nx * h, y + ny * h, z + nz * h);
    const w = 1 / (1 + i * 0.7);
    occ += Math.max(0, (h - d) / h) * w;
    wsum += w;
  }
  return clamp(occ / wsum, 0, 1);
}
