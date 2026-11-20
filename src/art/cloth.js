/** The cloth on a real desk (stage E), pure maths: the plane polygon of the desk top made into a clean, convex, rounded outline inside a box round the table. */
/** @typedef {{x:number, z:number}} P2 */
/** The cloth outline for a real desk: the desk polygon cut to the box x -0.62..0.62, z -0.34..0.6 (the felt's own reach plus a margin), reduced to its convex hull, with its corners
 * rounded. Returns null when too little of the desk is inside the box. The far edge is at z = -0.34 or nearer: his belly stays behind it. Exported for the tests. */
/** @param {P2[]} poly @param {{x0:number,x1:number,z0:number,z1:number}} [box] @returns {P2[]|null} */
export function deskCloth(poly, box = { x0: -0.62, x1: 0.62, z0: -0.34, z1: 0.6 }) {
  // Sutherland-Hodgman: cut the polygon against the four sides of the box
  let pts = poly.slice();
  const clip = (inside, cut) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    pts = out;
  };
  const lerpAtX = (a, b, x) => ({ x, z: a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x || 1e-9) });
  const lerpAtZ = (a, b, z) => ({ x: a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9), z });
  clip((p) => p.x >= box.x0, (a, b) => lerpAtX(a, b, box.x0));
  if (pts.length) clip((p) => p.x <= box.x1, (a, b) => lerpAtX(a, b, box.x1));
  if (pts.length) clip((p) => p.z >= box.z0, (a, b) => lerpAtZ(a, b, box.z0));
  if (pts.length) clip((p) => p.z <= box.z1, (a, b) => lerpAtZ(a, b, box.z1));
  if (pts.length < 3) return null;
  // convex hull (monotone chain)
  const s = pts.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lo = [];
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = [];
  for (const p of s.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  if (hull.length < 3) return null;
  const area = hull.reduce((acc, p, i) => { const q = hull[(i + 1) % hull.length]; return acc + (p.x * q.z - q.x * p.z) / 2; }, 0);
  if (Math.abs(area) < 0.12) return null; // under 0.12 m2: not a desk for the cloth (the felt mat is 0.42 m2)
  // round the corners: three passes of corner cutting (Chaikin) turn every corner, even a sharp one, into a smooth curve, so no point of felt reaches past the table edge (round 3)
  let out = hull;
  for (let pass = 0; pass < 3; pass++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out = next;
  }
  return out;
}

