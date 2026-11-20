/** Buttons thrown off the desk (pure, no physics engine): a short ballistic arc per
 * button, a bounce or two on the desk top, and a fall to the floor when it leaves
 * the desk outline. PRODUCT-FIT P0-8. Table-local metres, y up from the desk. */
import { nextFloat, nextRange } from "./rng.js";

export const GRAVITY = 9.8;
const FRICTION = 1.6;
/** Fine buttons also slide toward the edge, so they always fall off. */
const DRIFT = 4.0;
const BOUNCE = 0.3;

/** @typedef {{x:number,y:number,z:number,vx:number,vy:number,vz:number,dir:number,drift:boolean,rest:boolean,onFloor:boolean}} Toss */

/**
 * @param {{s:number}} rng
 * @param {{x:number,y:number,z:number}} from
 * @param {number} dir +1 throws toward the player (+z), -1 toward the Shark
 * @param {boolean} drift
 * @returns {Toss}
 */
export function launchToss(rng, from, dir, drift) {
  const speed = nextRange(rng, 1.3, 2.3);
  const angle = (nextFloat(rng) - 0.5) * 1.4; // about 40 degrees either side
  return {
    x: from.x,
    y: from.y,
    z: from.z,
    vx: Math.sin(angle) * speed,
    vz: Math.cos(angle) * speed * dir,
    vy: nextRange(rng, 0.9, 1.6),
    dir,
    drift,
    rest: false,
    onFloor: false,
  };
}

/**
 * Advance one button.
 * @param {Toss} b
 * @param {number} dt
 * @param {(x:number,z:number)=>boolean} onDesk is this spot over the desk top
 * @param {number} floorY height of the floor, negative (below the desk)
 */
export function stepToss(b, dt, onDesk, floorY) {
  if (b.rest) return;
  b.vy -= GRAVITY * dt;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.y += b.vy * dt;
  const over = onDesk(b.x, b.z);
  if (over && b.y <= 0 && b.vy < 0) {
    b.y = 0;
    if (b.vy > -0.5) b.vy = 0;
    else b.vy = -b.vy * BOUNCE;
    b.vx *= 0.7;
    b.vz *= 0.7;
  }
  if (over && b.y <= 0 && b.vy === 0) {
    // sliding on the felt
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const dec = Math.min(sp, FRICTION * dt);
      b.vx -= (b.vx / sp) * dec;
      b.vz -= (b.vz / sp) * dec;
    }
    if (b.drift) b.vz += b.dir * DRIFT * dt;
  }
  if (b.y <= floorY && b.vy < 0) {
    b.y = floorY;
    b.onFloor = true;
    if (b.vy > -0.6) {
      b.vy = 0;
      b.vx = 0;
      b.vz = 0;
      b.rest = true;
    } else {
      b.vy = -b.vy * 0.25;
      b.vx *= 0.5;
      b.vz *= 0.5;
    }
  }
}
