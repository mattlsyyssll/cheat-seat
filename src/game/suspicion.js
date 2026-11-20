/** The caught check (pure): a suspicion meter that fills while the Shark's gaze
 * cone is on a hand that holds a hidden card, or is inside the discard pile zone.
 * Full meter = CAUGHT. It fills in 0.6 seconds and drains when the cone leaves.
 *
 * Tracking trouble never costs a strike (PRODUCT-FIT P0-5): while any hand is
 * lost the meter cannot fill, and for one second after a hand returns it still
 * cannot. */
export const FILL_S = 0.6;
export const DRAIN_S = 0.4;
export const GRACE_S = 1.0;
/** After a catch the meter stays at zero for this long (the slam plays out). */
export const LOCK_S = 3.0;

/** @typedef {{meter:number, grace:number, lock:number, caught:boolean, fillClock:number,
 *   filling:boolean, clock:number, lastFillS:number|null, fillS:number}} Suspicion */

/** @param {number} [fillS] seconds to fill (Normal 0.6; Easy 0.9; Hard 0.45) @returns {Suspicion} */
export function createSuspicion(fillS = FILL_S) {
  return { meter: 0, grace: 0, lock: 0, caught: false, fillClock: 0, filling: false, clock: 0, lastFillS: null, fillS };
}

/**
 * @param {Suspicion} s
 * @param {number} dt
 * @param {{suspicious:boolean, handLost?:boolean}} input suspicious = the cone is on a
 *   hand that holds a hidden card or sits in the discard zone, and the cone is on
 * @returns {{type:string, fillS?:number}[]} events: fillStart, caught, clear
 */
export function updateSuspicion(s, dt, input) {
  const events = [];
  s.clock += dt;
  if (s.lock > 0) {
    s.lock = Math.max(0, s.lock - dt);
    s.meter = 0;
    s.filling = false;
    s.fillClock = 0;
    if (s.lock === 0) s.caught = false;
    return events;
  }
  if (input.handLost) s.grace = GRACE_S;
  else s.grace = Math.max(0, s.grace - dt);
  const live = input.suspicious && !input.handLost && s.grace === 0;
  if (live) {
    if (!s.filling) {
      s.filling = true;
      events.push({ type: "fillStart" });
    }
    s.fillClock += dt;
    s.meter = Math.min(1, s.meter + dt / (s.fillS || FILL_S));
    if (s.meter >= 1) {
      s.caught = true;
      s.lastFillS = s.fillClock;
      s.lock = LOCK_S;
      s.meter = 0;
      s.filling = false;
      events.push({ type: "caught", fillS: s.lastFillS });
      s.fillClock = 0;
    }
  } else {
    const was = s.meter;
    s.meter = Math.max(0, s.meter - dt / DRAIN_S);
    if (s.filling) {
      s.filling = false;
      if (s.meter === 0 && was > 0) events.push({ type: "clear" });
    }
    if (s.meter === 0) s.fillClock = 0;
  }
  return events;
}

/** Forget a catch (a new round starts clean). @param {Suspicion} s */
export function resetSuspicion(s) {
  s.meter = 0;
  s.grace = 0;
  s.lock = 0;
  s.caught = false;
  s.fillClock = 0;
  s.filling = false;
}
