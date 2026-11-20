/** The player's hidden zones and the other hand zones (pure). Table-local metres,
 * +x to the player's right, +z toward the player, y up from the desk.
 *
 * Stash zones (a stashed card counts as hidden to the cone logic):
 *   wristL, wristR  a sphere at that wrist (PRODUCT-FIT P0-4: 8 cm, grown from the
 *                   6 cm of the brief; the 6 cm core is inside it)
 *   edge            the strip under the desk lip on the player's side (the edge far
 *                   from the Shark)
 * The hand that palmed the card cannot stash into its own wrist.
 * (Removed in phase 5: "under the other hand". One hand covering the other is the case Meta
 * names as the least reliable for hand tracking; the wrist and the desk edge stay.) */
import { ZONES } from "./layout.js";
import { dist3, flatDistance } from "./hands.js";

export const WRIST_CORE_R = 0.06;
export const WRIST_R = 0.08;
export const EDGE_Z = 0.3;
export const EDGE_HALF_W = 0.34;
export const EDGE_MAX_Y = 0.07;
export const DISCARD_R = 0.085;
/** A palm-down touch on his half of the desk (z at or below this) is a slap. */
export const SLAP_Z = -0.02;
export const SLAP_FAR_Z = -0.42;
export const SLAP_HALF_W = 0.4;
/** Where a wrist is taken to be when that hand is not tracked, so the zone is
 * still there and still in view (also used on a flat screen). */
export const WRIST_REST = {
  left: { x: -0.15, y: 0.06, z: 0.2 },
  right: { x: 0.15, y: 0.06, z: 0.2 },
};
export const STASH_ZONES = ["wristL", "wristR", "edge"];
/** Which hand is "holding" the hidden card when it sits in this zone. */
export const ZONE_HOLDER = { wristL: "left", wristR: "right", edge: null };

/** @typedef {{x:number,y:number,z:number}} P3
 * @typedef {{tracked:boolean, wrist:P3, palm:P3, flat:boolean}} HandPose
 * @typedef {{left?:HandPose|null, right?:HandPose|null}} Hands */

/** Centre of a stash zone. @param {string} zone @param {Hands} hands @returns {P3|null} */
export function zoneAnchor(zone, hands) {
  switch (zone) {
    case "wristL":
      return hands.left?.tracked ? hands.left.wrist : WRIST_REST.left;
    case "wristR":
      return hands.right?.tracked ? hands.right.wrist : WRIST_REST.right;
    case "edge":
      return { x: 0, y: 0.02, z: EDGE_Z + 0.05 };
    default:
      return null;
  }
}

/** Is a point inside the edge strip? @param {P3} p */
export function inEdgeStrip(p) {
  return p.z >= EDGE_Z && Math.abs(p.x) <= EDGE_HALF_W && p.y <= EDGE_MAX_Y && p.y >= -0.1;
}

/** Is a point inside the discard pile zone? @param {P3} p */
export function inDiscardZone(p) {
  return flatDistance(p, ZONES.discard) <= DISCARD_R && p.y <= 0.16 && p.y >= -0.05;
}

/** Is a palm-down contact point on his half of the desk? @param {P3} p */
export function inSlapZone(p) {
  return p.z <= SLAP_Z && p.z >= SLAP_FAR_Z && Math.abs(p.x) <= SLAP_HALF_W && p.y <= 0.06 && p.y >= -0.05;
}

/**
 * Which stash zone does a palmed card at `p` reach? The nearest zone it is inside
 * wins (a soft pull). `from` is the hand that palmed it; its own wrist is never a target.
 * @param {P3} p @param {Hands} hands @param {string} from "left" | "right" | other
 * @returns {{zone:string, dist:number}|null}
 */
export function stashZoneAt(p, hands, from) {
  let best = null;
  const take = (zone, dist) => {
    if (!best || dist < best.dist) best = { zone, dist };
  };
  for (const zone of ["wristL", "wristR"]) {
    if (ZONE_HOLDER[zone] === from) continue;
    const a = zoneAnchor(zone, hands);
    if (a && dist3(p, a) <= WRIST_R) take(zone, dist3(p, a));
  }
  if (inEdgeStrip(p)) take("edge", 0.04);
  return best;
}

/** Zone a pinch (hand or gaze) means when the player takes a stashed card back.
 * Wrist and edge zones.
 * @param {P3} p @param {Hands} hands @param {Record<string,number|null>} stash @param {string} by hand that pinches
 * @returns {string|null} */
export function takeZoneAt(p, hands, stash, by) {
  let best = null;
  for (const zone of ["wristL", "wristR"]) {
    if (stash[zone] === null || stash[zone] === undefined) continue;
    const a = zoneAnchor(zone, hands);
    const d = a ? dist3(p, a) : Infinity;
    if (d <= WRIST_R && (!best || d < best.d)) best = { zone, d };
  }
  if (stash.edge !== null && stash.edge !== undefined && inEdgeStrip(p)) {
    const d = 0.04;
    if (!best || d < best.d) best = { zone: "edge", d };
  }
  return best ? best.zone : null;
}
