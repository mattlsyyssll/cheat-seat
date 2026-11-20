/** Where things sit on the desk. Table-local metres: origin on the desk surface,
 * +x to the player's right, +z toward the player, -z toward the Shark, y up.
 * The player's chest and head are fixed points in this frame (seated at the
 * desk); the table is placed so this is true (see deskFrame). */

export const CARD = { w: 0.075, h: 0.105 };
export const BUTTON = { r: 0.0125, h: 0.0042 };
export const FELT = { w: 0.78, d: 0.8, cz: -0.02 };

/** @type {Record<string,{x:number,z:number}>} */
export const ZONES = {
  hat: { x: 0, z: -0.31 },
  sharkLay: { x: 0, z: -0.15 },
  playerLay: { x: 0, z: 0.15 },
  deck: { x: -0.2, z: 0.04 },
  discard: { x: 0.22, z: 0.1 },
  pot: { x: 0.14, z: -0.04 },
  sharkPile: { x: 0.23, z: -0.23 },
  playerPile: { x: -0.3, z: 0.26 },
  gloveRestR: { x: -0.15, z: -0.2 },
  gloveRestL: { x: 0.15, z: -0.2 },
};

export const HEAD = { x: 0, y: 0.53, z: 0.43 };
export const CHEST = { x: 0, y: 0.28, z: 0.4 };
/** The player's side of the desk, where the gaze cone sweeps. */
export const PLAYER_SIDE_Z = 0.17;
export const REACH_LIMIT = 0.6;
export const CONE_HALF_ANGLE_DEG = 20;

/** Zones the player's hands must reach. */
export const REACH_ZONES = ["deck", "discard", "playerLay", "playerPile", "pot"];

/** @param {{x:number,z:number}} z @param {number} [y] @returns {number} metres from the chest */
export function chestDistance(z, y = 0) {
  return Math.hypot(z.x - CHEST.x, y - CHEST.y, z.z - CHEST.z);
}

/** Angle (deg) between the head-to-hat axis and the head-to-point direction, flat.
 * @param {{x:number,z:number}} p @returns {number} */
export function coneAngleDeg(p) {
  const ax = ZONES.hat.x - HEAD.x, az = ZONES.hat.z - HEAD.z;
  const bx = p.x - HEAD.x, bz = p.z - HEAD.z;
  const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Pick the desk plane. Planes are plain data:
 * {id, y, polygon:[{x,z}] in world metres}. Only horizontal surfaces between
 * 0.55 and 1.05 m high with at least 0.2 square metres count. The nearest one to
 * the player wins; a larger area breaks a tie within 5 cm.
 * @param {{id?:any, y:number, polygon:{x:number,z:number}[]}[]} planes
 * @param {{x:number,z:number}} player
 */
export function chooseDesk(planes, player) {
  let best = null;
  for (const p of planes) {
    if (!(p.y >= 0.55 && p.y <= 1.05) || !p.polygon || p.polygon.length < 3)
      continue;
    const area = polygonArea(p.polygon);
    if (area < 0.2) continue;
    const near = nearestOnPolygon(p.polygon, player);
    const dist = Math.hypot(near.x - player.x, near.z - player.z);
    if (
      !best ||
      dist < best.dist - 0.05 ||
      (Math.abs(dist - best.dist) <= 0.05 && area > best.area)
    )
      best = { id: p.id, y: p.y, area, near, dist, centroid: centroid(p.polygon), polygon: p.polygon };
  }
  return best;
}

/** @param {{x:number,z:number}[]} poly @returns {number} */
export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

/** @param {{x:number,z:number}[]} poly @returns {{x:number,z:number}} */
export function centroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) {
    x += p.x;
    z += p.z;
  }
  return { x: x / poly.length, z: z / poly.length };
}

/** Closest point of the polygon (inside counts) to p. @returns {{x:number,z:number}} */
export function nearestOnPolygon(poly, p) {
  if (insidePolygon(poly, p)) return { x: p.x, z: p.z };
  let best = poly[0], bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const abx = b.x - a.x, abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
    const q = { x: a.x + abx * k, z: a.z + abz * k };
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** @param {{x:number,z:number}[]} poly @param {{x:number,z:number}} p */
export function insidePolygon(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/**
 * Where the table frame goes. Local +z points at the player. A desk near the
 * player (seated at it) puts the chest 0.40 m behind the origin. A desk far away
 * (the emulator rooms) puts the mat's near edge on the desk's near edge.
 * @param {{x:number,z:number}} near nearest desk point to the player
 * @param {{x:number,z:number}} centroid desk centre
 * @param {{x:number,z:number}} player head position (floor plane)
 * @param {{x:number,z:number}} headForward
 * @returns {{x:number,z:number,yaw:number}}
 */
export function deskFrame(near, centroidPoint, player, headForward) {
  let fx = centroidPoint.x - player.x, fz = centroidPoint.z - player.z;
  const d = Math.hypot(near.x - player.x, near.z - player.z);
  if (Math.hypot(fx, fz) < 0.05) {
    fx = headForward.x;
    fz = headForward.z;
  }
  const l = Math.hypot(fx, fz) || 1;
  fx /= l;
  fz /= l;
  const back = d <= 0.6 ? 0.4 : 0;
  const origin =
    d <= 0.6
      ? { x: player.x + fx * back, z: player.z + fz * back }
      : { x: near.x + fx * 0.35, z: near.z + fz * 0.35 };
  // local +z must point from the origin back to the player
  let bx = player.x - origin.x, bz = player.z - origin.z;
  if (Math.hypot(bx, bz) < 0.05) {
    bx = -fx;
    bz = -fz;
  }
  return { x: origin.x, z: origin.z, yaw: Math.atan2(bx, bz) };
}
