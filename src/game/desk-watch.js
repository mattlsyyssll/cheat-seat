/** Late or missing desk planes (round 8, Q01). The first placement is as before: the real desk if a desk-height plane is known, else the virtual table after 1.5 s.
 * New: the planes are read for DESK_SCAN_S more seconds after the virtual table is shown; when a desk-height plane arrives in that time the table is
 * placed on it, once, and the player is told in one line. Pure: index.ts feeds it the planes and the head and applies the frame it returns. */
import { boothFrame, virtualFrame } from "./place.js";

/** Seconds of waiting for a plane before the first (virtual) placement. */
export const DESK_FIRST_WAIT_S = 1.5;
/** Seconds after the virtual table is shown during which a late desk plane still moves the table onto the desk. */
export const DESK_SCAN_S = 20;
export const DESK_FOUND_LINE = "Found your desk. The table is on it now.";

export function createDeskWatch() {
  return { waited: 0, virtualShown: false, scanned: 0, closed: false, replaced: false };
}
export function resetDeskWatch(w) {
  w.waited = 0; w.virtualShown = false; w.scanned = 0; w.closed = false; w.replaced = false;
}

/**
 * One step. Call every frame before the first placement, then on each plane read (twice a second) with its elapsed time, until `closed`.
 * @param {ReturnType<typeof createDeskWatch>} w
 * @param {number} dt seconds since the last call
 * @param {{id?:any,y:number,polygon:{x:number,z:number}[]}[]} planes horizontal planes, world metres
 * @param {boolean} [canReplace] false while a match runs (the table must not move under the player)
 * @returns {{kind:"real"|"virtual"|"replace", frame:ReturnType<typeof boothFrame>, line?:string}|null}
 */
export function deskStep(w, dt, planes, head, fwd, canReplace = true) {
  if (w.closed) return null;
  const real = planes.length ? boothFrame(planes, head, fwd) : null;
  if (!w.virtualShown) {
    w.waited += dt;
    if (real && real.real) { w.closed = true; return { kind: "real", frame: real }; }
    if (w.waited > DESK_FIRST_WAIT_S) { w.virtualShown = true; return { kind: "virtual", frame: virtualFrame(head, fwd) }; }
    return null;
  }
  w.scanned += dt;
  if (w.scanned > DESK_SCAN_S) { w.closed = true; return null; }
  if (real && real.real && canReplace) { w.closed = true; w.replaced = true; return { kind: "replace", frame: real, line: DESK_FOUND_LINE }; }
  return null;
}
