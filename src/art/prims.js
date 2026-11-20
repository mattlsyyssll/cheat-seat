/** Small mesh generators in plain JavaScript (no graphics library): each returns { positions, normals, indices } as plain arrays,
 * ready for the bake step to colour and skin. Used for the eyes, lids, brows, teeth and other parts that are not worth a grid. */

/** Part of a sphere: polar angle theta from the +y axis (thetaStart..thetaStart+thetaLen), azimuth phi around y from +z toward +x. */
export function spherePatch(r, thetaStart, thetaLen, phiStart, phiLen, wSeg = 16, hSeg = 10, cx = 0, cy = 0, cz = 0, sx = 1, sy = 1, sz = 1) {
  const positions = [], normals = [], indices = [];
  for (let j = 0; j <= hSeg; j++) {
    const th = thetaStart + (thetaLen * j) / hSeg;
    for (let i = 0; i <= wSeg; i++) {
      const ph = phiStart + (phiLen * i) / wSeg;
      const nx = Math.sin(th) * Math.sin(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.cos(ph);
      positions.push(cx + r * nx * sx, cy + r * ny * sy, cz + r * nz * sz);
      const l = Math.hypot(nx / sx, ny / sy, nz / sz) || 1;
      normals.push(nx / sx / l, ny / sy / l, nz / sz / l);
    }
  }
  for (let j = 0; j < hSeg; j++)
    for (let i = 0; i < wSeg; i++) {
      const a = j * (wSeg + 1) + i, b = a + 1, c = a + wSeg + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  return { positions, normals, indices };
}

/** A flat disc facing +z at (cx, cy, cz), optionally domed a little toward +z, radius r. */
export function disc(r, seg, cx, cy, cz, dome = 0) {
  const positions = [cx, cy, cz + dome], normals = [0, 0, 1], indices = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    positions.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz);
    const nx = Math.cos(a) * dome * 0.9, ny = Math.sin(a) * dome * 0.9, l = Math.hypot(nx, ny, 1);
    normals.push(nx / l, ny / l, 1 / l);
  }
  for (let i = 0; i < seg; i++) indices.push(0, 1 + i, 1 + ((i + 1) % seg));
  return { positions, normals, indices };
}

/** A cone from base centre (bx,by,bz) to tip (tx,ty,tz), base radius r, `seg` sides, with a flat base. Smooth normals. */
export function cone(bx, by, bz, tx, ty, tz, r, seg = 5) {
  const ax = tx - bx, ay = ty - by, az = tz - bz, len = Math.hypot(ax, ay, az) || 1;
  const zx = ax / len, zy = ay / len, zz = az / len;
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(zy) > 0.95) { ux = 1; uy = 0; }
  let px = uy * zz - uz * zy, py = uz * zx - ux * zz, pz = ux * zy - uy * zx;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  const qx = zy * pz - zz * py, qy = zz * px - zx * pz, qz = zx * py - zy * px;
  const positions = [tx, ty, tz], normals = [zx, zy, zz], indices = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const dx = px * c + qx * s, dy = py * c + qy * s, dz = pz * c + qz * s;
    positions.push(bx + dx * r, by + dy * r, bz + dz * r);
    const nl = Math.hypot(dx + zx * (r / len), dy + zy * (r / len), dz + zz * (r / len)) || 1;
    normals.push((dx + zx * (r / len)) / nl, (dy + zy * (r / len)) / nl, (dz + zz * (r / len)) / nl);
  }
  for (let i = 0; i < seg; i++) indices.push(0, 1 + ((i + 1) % seg), 1 + i);
  return { positions, normals, indices };
}

/** A tube with round ends along a poly-line of points [[x,y,z], ...] with radius r (used for brows). */
export function tube(points, radius, radial = 8) {
  const positions = [], normals = [], indices = [];
  const n = points.length;
  for (let k = 0; k < n; k++) {
    const p = points[k], a = points[Math.max(0, k - 1)], b = points[Math.min(n - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(tz) > 0.9) { ux = 0; uy = 1; uz = 0; }
    let sx = ty * uz - tz * uy, sy = tz * ux - tx * uz, sz = tx * uy - ty * ux;
    const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    const vx = ty * sz - tz * sy, vy = tz * sx - tx * sz, vz = tx * sy - ty * sx;
    const rk = typeof radius === "function" ? radius(k / (n - 1)) : radius;
    for (let i = 0; i < radial; i++) {
      const ang = (i / radial) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const nx = sx * c + vx * s, ny = sy * c + vy * s, nz = sz * c + vz * s;
      positions.push(p[0] + nx * rk, p[1] + ny * rk, p[2] + nz * rk);
      normals.push(nx, ny, nz);
    }
  }
  for (let k = 0; k < n - 1; k++)
    for (let i = 0; i < radial; i++) {
      const a = k * radial + i, b = k * radial + ((i + 1) % radial), c = a + radial, d = b + radial;
      indices.push(a, b, c, b, d, c);
    }
  // round the ends with a fan to the end centre
  for (const [k, flip] of [[0, true], [n - 1, false]]) {
    const ci = positions.length / 3;
    const p = points[k], q = points[k === 0 ? 1 : n - 2];
    let tx = p[0] - q[0], ty = p[1] - q[1], tz = p[2] - q[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const rk = typeof radius === "function" ? radius(k / (n - 1)) : radius;
    positions.push(p[0] + tx * rk * 0.6, p[1] + ty * rk * 0.6, p[2] + tz * rk * 0.6);
    normals.push(tx, ty, tz);
    for (let i = 0; i < radial; i++) {
      const a = k * radial + i, b = k * radial + ((i + 1) % radial);
      if (flip) indices.push(ci, b, a); else indices.push(ci, a, b);
    }
  }
  return { positions, normals, indices };
}

/** A grid patch: u across (n+1 columns), v up (m+1 rows); fn(u, v) -> [x, y, z]. Normals are left to the caller (0,0,1 by default). */
export function grid(nu, nv, fn) {
  const positions = [], normals = [], indices = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const p = fn(i / nu, j / nv);
      positions.push(p[0], p[1], p[2]);
      normals.push(0, 0, 1);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  return { positions, normals, indices };
}

/** Smooth vertex normals from triangle faces (area weighted). Returns a new array. */
export function smoothNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** A surface of revolution about the y axis. profile = [[r, y], ...]; seg = steps around; fn(x, y, z, r, ang) -> [x, y, z] may bend it. */
export function lathe(profile, seg, fn) {
  const positions = [], indices = [];
  for (let k = 0; k < profile.length; k++)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const r = profile[k][0], y = profile[k][1];
      const p = fn ? fn(Math.sin(a) * r, y, Math.cos(a) * r, r, a) : [Math.sin(a) * r, y, Math.cos(a) * r];
      positions.push(p[0], p[1], p[2]);
    }
  for (let k = 0; k < profile.length - 1; k++)
    for (let i = 0; i < seg; i++) {
      const a = k * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  return { positions, normals: Array.from(smoothNormals(positions, indices)), indices };
}
