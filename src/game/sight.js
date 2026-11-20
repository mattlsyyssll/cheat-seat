/** What the Shark can see (pure). His gaze is a line of sight from his eyes: a point is seen only if it is inside his view cone
 * and nothing blocks the straight line from his eye to it. The table top blocks anything below it; a closed fist hides a card
 * (the hand is seen, the card is not). Both input adapters (hands and mouse) feed the same 3D positions in here: this file never
 * sees pixels. */
import { TABLE } from "./booth.js";
import { insidePolygon } from "./layout.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{halfX:number,zNear:number,zFar:number,polygon?:{x:number,z:number}[]|null}} TableTop */

/** @param {V3} v */
export const unit = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
/** @param {V3} a @param {V3} b */
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
/** @param {V3} a @param {V3} b */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** @param {V3} a @param {V3} b */
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Is the table-plane point (x, z) on the table top? A real desk gives a polygon; otherwise the small card table.
 * @param {number} x @param {number} z @param {TableTop} [t] */
export function onTable(x, z, t = TABLE) {
  if (t.polygon && t.polygon.length >= 3) return insidePolygon(t.polygon, { x, z });
  return Math.abs(x) <= t.halfX && z <= t.zNear && z >= t.zFar;
}

/** Does the table top block the straight line from `eye` to `p`? Only a point below the top, seen from above it, can be blocked.
 * @param {V3} eye @param {V3} p @param {TableTop} [t] */
export function blockedByTable(eye, p, t = TABLE) {
  if (p.y >= 0 || eye.y <= 0) return false;
  const k = eye.y / (eye.y - p.y); // where the line crosses y = 0
  return onTable(eye.x + (p.x - eye.x) * k, eye.z + (p.z - eye.z) * k, t);
}

/** Angle in degrees between the gaze direction and the direction to `p`. @param {V3} eye @param {V3} dir @param {V3} p */
export function angleTo(eye, dir, p) {
  const d = unit(sub(p, eye));
  return (Math.acos(Math.max(-1, Math.min(1, dot(unit(dir), d)))) * 180) / Math.PI;
}

/**
 * @param {{pos:V3, dir:V3}} sight his eye and the way he looks
 * @param {V3} p the point
 * @param {number} halfDeg half width of his view cone
 * @param {TableTop} [table]
 * @returns {{angle:number, inCone:boolean, blocked:boolean, visible:boolean}}
 */
export function canSee(sight, p, halfDeg, table = TABLE) {
  const angle = angleTo(sight.pos, sight.dir, p);
  const inCone = angle <= halfDeg;
  const blocked = blockedByTable(sight.pos, p, table);
  return { angle, inCone, blocked, visible: inCone && !blocked };
}

/** His view cone, half width in degrees, by what he is doing (a stare takes in everything near; a turned head sees what is in front of it). */
export const CONE = { watch: 34, hands: 26, cards: 26, own: 22, spot: 30, stare: 95, cheat: 30 };

/** Distance from point p to the segment a-b. @param {V3} p @param {V3} a @param {V3} b */
export function segmentDistance(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const l2 = dot(ab, ab) || 1;
  const k = Math.max(0, Math.min(1, dot(ap, ab) / l2));
  return dist(p, { x: a.x + ab.x * k, y: a.y + ab.y * k, z: a.z + ab.z * k });
}
