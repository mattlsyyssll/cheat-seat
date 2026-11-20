/** No hand source (round 8, Q03). A Quest session can have controllers and no hands (hand tracking off in the system settings, or controllers in the hands),
 * or no input source at all. The game then gets no input and would show no reason. This says when to stop the match and show one plain line. Pure. */
export const NO_HAND_LINE = "Put the controllers down and use your hands";
/** Controllers only: the line shows after this long (a switch between hands and controllers takes a moment). */
export const CONTROLLER_GRACE_S = 1;
/** No input source at all: the line shows after this long. */
export const NO_SOURCE_WAIT_S = 3;

export function createHandSourceWatch() {
  return { t: 0, reason: null };
}
export function resetHandSourceWatch(w) {
  w.t = 0; w.reason = null;
}

/**
 * @param {{t:number, reason:string|null}} w
 * @param {number} dt seconds since the last call
 * @param {ArrayLike<{hand?:any, targetRayMode?:string}>} sources session.inputSources
 * @returns {boolean} true while the match must wait for a hand (w.reason says why: "controllers" or "none")
 */
export function handSourceStep(w, dt, sources) {
  let hand = false, gaze = false, controller = false;
  const n = sources.length;
  for (let i = 0; i < n; i++) {
    const s = sources[i];
    if (s.hand) hand = true;
    else if (s.targetRayMode === "gaze") gaze = true;
    else controller = true;
  }
  if (hand || gaze) { w.t = 0; w.reason = null; return false; } // a hand (or the Glasses' gaze and pinch) is a source the game can use
  w.t += dt;
  if (controller && w.t >= CONTROLLER_GRACE_S) { w.reason = "controllers"; return true; }
  if (n === 0 && w.t >= NO_SOURCE_WAIT_S) { w.reason = "none"; return true; }
  w.reason = null;
  return false;
}
