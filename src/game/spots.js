/** Pointing him away (pure). A point is a ray from the index finger (headset), or from the eye through the cursor (mouse, an
 * adapter job; the rules only see the 3D ray). The spot is where the ray first hits a surface of the room. It counts only if it is
 * far enough away, not blocked by the table or by him, and not a spot he has already looked at this match. Pointing at nothing
 * (the table, him, your own lap, the open air, a spot he already looked at) makes him more suspicious instead of turning his head. */
import { TABLE } from "./booth.js";
import { RULES } from "./booth.js";
import { onTable } from "./sight.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{o:V3, d:V3}} Ray */
/** A surface: an inside-out box (a room) or a flat disc (a detected plane, approximated by its centre, normal and radius).
 * @typedef {{type:"box", min:V3, max:V3}|{type:"disc", c:V3, n:V3, r:number}} Surface */

/** The room used when no real plane is known (a headset with no planes, the flat page): a den around the booth, floor 0.75 m
 * under the table top, walls 3.2 m to each side, the back wall 2.3 m behind the Shark, the front wall 3.6 m behind the player. */
export const VIRTUAL_ROOM = /** @type {Surface} */ ({ type: "box", min: { x: -3.2, y: -0.75, z: -2.3 }, max: { x: 3.2, y: 2.5, z: 3.6 } });

/** Where the ray leaves an inside-out box, or null. @param {Ray} ray @param {V3} min @param {V3} max */
function hitBoxInside(ray, min, max) {
  let best = Infinity;
  for (const axis of /** @type {const} */ (["x", "y", "z"])) {
    const d = ray.d[axis];
    if (Math.abs(d) < 1e-9) continue;
    const plane = d > 0 ? max[axis] : min[axis];
    const t = (plane - ray.o[axis]) / d;
    if (t > 0 && t < best) best = t;
  }
  return Number.isFinite(best) ? best : null;
}

/** @param {Ray} ray @param {V3} c @param {V3} n @param {number} r */
function hitDisc(ray, c, n, r) {
  const den = ray.d.x * n.x + ray.d.y * n.y + ray.d.z * n.z;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((c.x - ray.o.x) * n.x + (c.y - ray.o.y) * n.y + (c.z - ray.o.z) * n.z) / den;
  if (t <= 0) return null;
  const p = { x: ray.o.x + ray.d.x * t, y: ray.o.y + ray.d.y * t, z: ray.o.z + ray.d.z * t };
  return Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) <= r ? t : null;
}

/** Nearest hit on any surface. @param {Ray} ray @param {Surface[]} surfaces @returns {{t:number, p:V3}|null} */
export function hitSurfaces(ray, surfaces) {
  let best = null;
  for (const s of surfaces) {
    const t = s.type === "box" ? hitBoxInside(ray, s.min, s.max) : hitDisc(ray, s.c, s.n, s.r);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best === null ? null : { t: best, p: { x: ray.o.x + ray.d.x * best, y: ray.o.y + ray.d.y * best, z: ray.o.z + ray.d.z * best } };
}

/** Does the ray run through the table top or his body before it reaches the room?
 * @param {Ray} ray @param {number} maxT @param {{head:V3, eyeRel:number}} shark @param {import("./sight.js").TableTop} [table] */
export function blockedInBooth(ray, maxT, shark, table = TABLE) {
  // the table top: the plane y = 0
  if (Math.abs(ray.d.y) > 1e-6) {
    const t = -ray.o.y / ray.d.y;
    if (t > 0 && t < maxT && onTable(ray.o.x + ray.d.x * t, ray.o.z + ray.d.z * t, table)) return "table";
  }
  // his head and chest: two spheres on the line from his head down to his seat
  const spheres = [
    { c: shark.head, r: 0.17 },
    { c: { x: shark.head.x, y: shark.head.y - 0.22, z: shark.head.z - 0.04 }, r: 0.25 },
  ];
  for (const s of spheres) {
    const oc = { x: ray.o.x - s.c.x, y: ray.o.y - s.c.y, z: ray.o.z - s.c.z };
    const b = oc.x * ray.d.x + oc.y * ray.d.y + oc.z * ray.d.z;
    const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - s.r * s.r;
    const disc = b * b - c;
    if (disc >= 0) {
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < maxT) return "him";
    }
  }
  return null;
}

/**
 * @param {Ray} ray a unit direction
 * @param {{surfaces:Surface[], shark:{head:V3, eyeRel:number}, used:V3[], table?:import("./sight.js").TableTop, head:V3}} room
 * @returns {{valid:boolean, spot:V3|null, why:string}} why: "spot" | "table" | "him" | "near" | "air" | "again"
 */
export function resolvePoint(ray, room) {
  const hit = hitSurfaces(ray, room.surfaces.length ? room.surfaces : [VIRTUAL_ROOM]);
  if (!hit) return { valid: false, spot: null, why: "air" };
  const block = blockedInBooth(ray, hit.t, room.shark, room.table);
  if (block) return { valid: false, spot: hit.p, why: block };
  const away = Math.hypot(hit.p.x - room.head.x, hit.p.y - room.head.y, hit.p.z - room.head.z);
  if (away < RULES.pointMinDistance) return { valid: false, spot: hit.p, why: "near" };
  for (const u of room.used) if (Math.hypot(hit.p.x - u.x, hit.p.y - u.y, hit.p.z - u.z) < 0.8) return { valid: false, spot: hit.p, why: "again" };
  return { valid: true, spot: hit.p, why: "spot" };
}
