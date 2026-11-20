/** The catch-him move (pure). PRODUCT-FIT P0-6: a palm-down touch on his half of
 * the desk, held 0.15 s, replaces the fast slap with a speed gate. The slap is
 * still the animation and the sound; the game only needs the contact. (On the laptop page
 * stage 1 uses a plain click on his hat: `gazeCatchOk` is the same test.)
 *
 * A catch counts when the contact BEGINS while the glove is under the hat (the
 * 1.5 s catch window) and the view is within 24 degrees of him (the player looked back up). A hand that was
 * already resting on his side does not count; it has to land. On Glasses a pinch
 * on the hat while looking at it (gaze-and-pinch) is the equal alternative. */
import { LOOK_LIMIT_DEG } from "./gaze.js";

export const CONTACT_HOLD_S = 0.15;

/** @typedef {{down:boolean, t:number, startedOpen:boolean, startedYawOk:boolean, fired:boolean}} Contact */

/** @returns {Contact} */
export function createContact() {
  return { down: false, t: 0, startedOpen: false, startedYawOk: false, fired: false };
}

/**
 * @param {Contact} c
 * @param {number} dt
 * @param {{down:boolean, windowOpen:boolean, yawDeg:number}} input
 *   down = a flat, palm-down hand touches the desk on his half
 * @returns {{type:"contact"|"slap", ok?:boolean}[]}
 */
export function updateContact(c, dt, input) {
  const events = [];
  if (!input.down) {
    c.down = false;
    c.t = 0;
    c.fired = false;
    return events;
  }
  if (!c.down) {
    c.down = true;
    c.t = 0;
    c.fired = false;
    c.startedOpen = input.windowOpen;
    c.startedYawOk = Math.abs(input.yawDeg) <= LOOK_LIMIT_DEG;
    events.push({ type: "contact" });
  }
  c.t += dt;
  if (!c.fired && c.t >= CONTACT_HOLD_S) {
    c.fired = true;
    events.push({ type: "slap", ok: c.startedOpen && c.startedYawOk });
  }
  return events;
}

/** A gaze-and-pinch catch: look at the hat, pinch inside the window.
 * @param {boolean} windowOpen @param {number} yawDeg */
export function gazeCatchOk(windowOpen, yawDeg) {
  return windowOpen && Math.abs(yawDeg) <= LOOK_LIMIT_DEG;
}
