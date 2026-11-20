/** Desk Keep (pure, no graphics, no browser objects). One marked spot on the player's side of the desk, near the dominant-hand (right) edge, holds at most
 * KEEP.max cards face down between rounds and between visits. This file holds: the numbers, where the spot is (the load order anchor, saved, default), the
 * cone dwell that makes kept cards cost something, and the save to local storage (every storage call is inside try/catch; a failure falls back to memory).
 * Table-local metres: +x to the player's right, +z toward the player, y up from the desk. The table frame is built on the detected desk plane (or the virtual
 * table), so a position in it IS a position relative to the desk plane. */
import { validCard } from "./cards.js";
import { onTable } from "./sight.js";
import { TABLE } from "./booth.js";

export const KEEP = {
  /** Cards the spot holds. */
  max: 2,
  /** Where the spot is when nothing better is known: the player's side, near the right (dominant) hand edge, clear of the lay spot and the point tokens (x 0.42; the frame's right edge is at 0.383). It is
   * placed where his view cone reaches it only part of the time (measured in a no-hands run, Normal, 8 seeds: cards on it were taken in 6 of 8 rounds, median 34 s into the round).
   * A spot further in (x 0.31) is covered 26 percent of the time and the cards are taken in 2 to 9 s; a spot further out (x 0.37 or more) is never reached. The edge between
   * the two is sharp, so this is the number to tune in the headset run. */
  defaultSpot: { x: 0.338, z: 0.115 },
  /** Glasses only (2026-11-11): the default spot is 44 degrees right and 41 below the seated view axis, outside the Glasses view (37 left and right, 25 up, 43 down), so a seated player had to turn the head to see
   * the frame. This spot keeps the whole frame (card size plus a centimetre, all four corners, measured in the camera's own frame) inside that view from the seated eye (0.47 m over the desk, 0.46 m back),
   * with 3 degrees to spare at that height and 1 degree at 0.50 m. It is at the right edge, clear of the pause pad (0.30, 0.035), the pot chips, the Shark's lay card and his strike lamps (x 0.40), and the point tokens (x 0.42).
   * Cost: z -0.10 is level with the Shark's lay card, not on the near half. The view's lower limit (43 degrees) sets a minimum distance from the eye (about 0.5 m on the desk), so no spot nearer than z -0.08 is inside it. */
  glassesSpot: { x: 0.31, z: -0.1 },
  /** An open hand this close (flat, metres) to the spot, and below `maxY`, is over it. */
  r: 0.07,
  maxY: 0.14,
  /** Stage H: once the hand is armed (opened flat over the spot, at or below `maxY`), the lift is read up to this height. A palm that hovers at 12 to 14 cm (the emulated hand's palm sits 3.6 cm above its grip) and lifts 4 cm
   * is above `maxY` and used to disarm itself before the lift counted. */
  liftMaxY: 0.3,
  /** A closing hand this close to a kept card picks it up (the play gesture). */
  pickR: 0.08,
  /** Keep: the open hand rises this much (metres) above where it opened, over the spot. A hand that just rests open for `restS` seconds also keeps it (a mouse cannot lift). */
  liftY: 0.04,
  restS: 0.6,
  /** After a keep, picking a card up from the spot waits this long (the hand that kept it is still there). */
  coolS: 0.8,
  /** Height of the point on the spot his eyes are tested at. */
  y: 0.004,
  /** How fast the dwell meter drains when the cone is off the spot, per second. */
  drain: 1.2,
  /** A spot outside this box (table-local) is not believed (a bad save or a bad anchor). */
  bounds: { xMin: -0.6, xMax: 0.6, zMin: -0.2, zMax: 0.5 },
};

export const KEEP_KEY = "cheat-seat-keep-v1";
export const KEEP_VERSION = 1;
export const KEEP_MAX_CHARS = 2000;

const finite = (n) => typeof n === "number" && Number.isFinite(n);

/** @param {unknown} p @returns {boolean} a spot inside the believable box */
export function validSpot(p) {
  if (!p || typeof p !== "object") return false;
  const s = /** @type {any} */ (p);
  const b = KEEP.bounds;
  return finite(s.x) && finite(s.z) && s.x >= b.xMin && s.x <= b.xMax && s.z >= b.zMin && s.z <= b.zMax;
}

/**
 * Stage H: is a spot (table-local) on this table? The felt and the game's things (frame, pause pad, tokens) lie on the table rectangle of game/booth.js; a detected desk plane gives a polygon that
 * can be smaller or turned (the emulator's sunlit living room gives a diamond that does not contain the default spot). So the spot counts when it is inside the polygon OR inside the rectangle.
 * Before this, a polygon that missed the default spot made the page refuse the anchor's pose and the saved position for good (the keep spot stayed "default" although the anchor was ready).
 * @param {{x:number,z:number}} spot @param {{polygon?:{x:number,z:number}[]|null}} [table]
 */
export function spotOnTable(spot, table) {
  if (!validSpot(spot)) return false;
  return onTable(spot.x, spot.z, { ...TABLE, polygon: table?.polygon ?? null }) || onTable(spot.x, spot.z, { ...TABLE, polygon: null });
}

/** The Meta VR Glasses view, degrees from the view axis. */
export const GLASSES_VIEW = { left: 37, right: 37, up: 25, down: 43 };
/** The seated Glasses head: metres over the desk and back from its middle (game/booth.js SEAT), and the axis (the seat looks a little below the Shark's face). */
export const GLASSES_SEAT = { eyeY: 0.47, z: 0.46, axisDy: -0.05, axisDz: -0.92 };
/** The keep frame: a card plus a centimetre, half width and half depth in metres. */
export const FRAME_HALF = { x: 0.0425, z: 0.0575 };

/**
 * How far inside the Glasses view the whole keep frame is, in degrees (pure). Each of the four corners (on the desk) is taken in the camera's own frame (right, up, forward), so the view is a perspective rectangle
 * as the device draws it. The result is the smallest distance of any corner to any of the four edges: negative means a corner is outside.
 * @param {{x:number,z:number}} spot table-local @param {{eyeY?:number, z?:number}} [eye] head position over the desk (default the seated Glasses head)
 * @returns {number}
 */
export function glassesMargin(spot, eye = {}) {
  let m = Infinity;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m = Math.min(m, pointMargin({ x: spot.x + sx * FRAME_HALF.x, y: 0, z: spot.z + sz * FRAME_HALF.z }, eye));
  return m;
}

/** How far inside the Glasses view one point (table-local, metres) is, in degrees; negative = outside. The same camera-frame test as glassesMargin. @param {{x:number,y:number,z:number}} p @param {{eyeY?:number, z?:number}} [eye] */
export function pointMargin(p, eye = {}) {
  const ey = eye.eyeY ?? GLASSES_SEAT.eyeY, ez = eye.z ?? GLASSES_SEAT.z;
  const L = Math.hypot(GLASSES_SEAT.axisDy, GLASSES_SEAT.axisDz);
  const f = { y: GLASSES_SEAT.axisDy / L, z: GLASSES_SEAT.axisDz / L };
  const u = { y: -f.z, z: f.y }; // up: perpendicular to the axis, in the vertical plane
  const vx = p.x, vy = p.y - ey, vz = p.z - ez;
  const cz = vy * f.y + vz * f.z, cy = vy * u.y + vz * u.z;
  if (cz <= 0.01) return -90; // behind the eye
  const yaw = (Math.atan2(vx, cz) * 180) / Math.PI, pitch = (Math.atan2(cy, cz) * 180) / Math.PI;
  return Math.min(GLASSES_VIEW.right - Math.abs(yaw), pitch >= 0 ? GLASSES_VIEW.up - pitch : GLASSES_VIEW.down + pitch);
}

/** Is the whole frame inside the seated Glasses view, with `margin` degrees to spare? @param {{x:number,z:number}} spot @param {number} [margin] */
export function frameInGlassesView(spot, margin = 1) {
  return glassesMargin(spot) >= margin;
}

/** @param {unknown} cards @returns {number[]} the cards that are real, distinct and fit (at most KEEP.max) */
export function cleanCards(cards) {
  if (!Array.isArray(cards)) return [];
  const out = [];
  for (const c of cards) if (validCard(c) && !out.includes(c) && out.length < KEEP.max) out.push(c);
  return out;
}

/**
 * Where the spot is. Load order: the persistent anchor (its pose read back into table-local), else the saved position relative to the desk, else the default.
 * @param {{anchor?:{x:number,z:number}|null, saved?:{x:number,z:number}|null, glasses?:boolean}} [have] glasses = the device is the Glasses (see GLASSES_VIEW)
 * @returns {{x:number, z:number, source:"anchor"|"saved"|"default"|"glasses"}}
 */
export function chooseSpot(have = {}) {
  if (have.glasses) {
    // Glasses: a saved or anchored spot counts only when its whole frame is inside the Glasses view (a spot saved on a Quest is usually not); else the Glasses spot
    for (const k of /** @type {const} */ (["anchor", "saved"])) {
      const c = have[k];
      if (c && validSpot(c) && frameInGlassesView(c, 1)) return { x: c.x, z: c.z, source: k };
    }
    return { x: KEEP.glassesSpot.x, z: KEEP.glassesSpot.z, source: "glasses" };
  }
  if (validSpot(have.anchor)) return { x: /** @type {any} */ (have.anchor).x, z: /** @type {any} */ (have.anchor).z, source: "anchor" };
  if (validSpot(have.saved)) return { x: /** @type {any} */ (have.saved).x, z: /** @type {any} */ (have.saved).z, source: "saved" };
  return { x: KEEP.defaultSpot.x, z: KEEP.defaultSpot.z, source: "default" };
}

/** The keep state of one game: where the spot is, and the cone dwell meter.
 * @param {{spot?:{x:number,z:number,source?:string}|null, glasses?:boolean}} [o] */
export function createKeep(o = {}) {
  const s = o.glasses ? chooseSpot({ glasses: true, saved: o.spot && validSpot(o.spot) ? o.spot : null }) : o.spot && validSpot(o.spot) ? { x: o.spot.x, z: o.spot.z, source: o.spot.source ?? "saved" } : chooseSpot();
  return { spot: s, meter: 0, seenT: 0, cool: 0, /** @type {number|null} */ lifted: /** @type {number|null} */ (null) };
}

/**
 * The cone dwell (pure). While kept cards lie on the spot and his view cone covers it, the meter fills; it drains when the cone is off. Full = he slams and takes them.
 * @param {{meter:number, seenT:number}} k
 * @param {number} dt
 * @param {{covered:boolean, cards:number, seeS:number}} input covered = the spot is inside his cone and not blocked; cards = kept cards on it
 * @returns {"seen"|null}
 */
export function watchKeep(k, dt, input) {
  if (input.cards <= 0 || !input.covered) {
    k.meter = Math.max(0, k.meter - dt * KEEP.drain);
    if (k.meter === 0) k.seenT = 0;
    return null;
  }
  k.seenT += dt;
  k.meter = Math.min(1, k.meter + dt / Math.max(0.05, input.seeS));
  if (k.meter >= 1) {
    k.meter = 0;
    k.seenT = 0;
    return "seen";
  }
  return null;
}

/** Is a hand (table-local palm position) over the spot? @param {{x:number,z:number}} spot @param {{x:number,y:number,z:number}} p @param {number} [r] */
export function overSpot(spot, p, r = KEEP.r) {
  return Math.hypot(p.x - spot.x, p.z - spot.z) <= r && p.y <= KEEP.maxY;
}

// ------------------------------------------------------------------ saving
/** @typedef {{getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void}} Store */

/** What is saved: the cards, the spot relative to the desk plane (table-local), the persistent anchor handle if the browser gave one.
 * @param {{cards:number[], spot:{x:number,z:number}, handle?:string|null}} d @param {number} [now] */
export function serializeKeep(d, now = Date.now()) {
  return JSON.stringify({ version: KEEP_VERSION, savedAt: now, cards: cleanCards(d.cards), spot: validSpot(d.spot) ? { x: d.spot.x, z: d.spot.z } : null, handle: typeof d.handle === "string" && d.handle.length < 400 ? d.handle : null });
}

/** Read a save (text from storage). Anything wrong gives the empty answer; nothing throws.
 * @param {string|null|undefined} raw @returns {{cards:number[], spot:{x:number,z:number}|null, handle:string|null}} */
export function parseKeep(raw) {
  const empty = { cards: [], spot: null, handle: null };
  if (typeof raw !== "string" || raw.length > KEEP_MAX_CHARS) return empty;
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object" || d.version !== KEEP_VERSION) return empty;
    return { cards: cleanCards(d.cards), spot: validSpot(d.spot) ? { x: d.spot.x, z: d.spot.z } : null, handle: typeof d.handle === "string" && d.handle.length < 400 ? d.handle : null };
  } catch {
    return empty;
  }
}

/**
 * The keep save with a memory fallback: when storage is missing, full or blocked, reads and writes go to memory and nothing throws.
 * @param {Store|null|(()=>Store|null)} store a store, or a function that returns one (it may throw: that counts as no storage)
 */
export function createKeepStore(store) {
  let memory = /** @type {string|null} */ (null);
  let failed = false;
  const get = () => {
    try {
      const s = typeof store === "function" ? store() : store;
      if (!s) throw new Error("no storage");
      return s;
    } catch {
      failed = true;
      return null;
    }
  };
  return {
    /** True once any storage call failed (the memory copy is in use). */
    get failed() {
      return failed;
    },
    load() {
      const s = get();
      if (s) {
        try {
          return parseKeep(s.getItem(KEEP_KEY));
        } catch {
          failed = true;
        }
      }
      return parseKeep(memory);
    },
    /** @param {{cards:number[], spot:{x:number,z:number}, handle?:string|null}} d @returns {boolean} true when it reached real storage */
    save(d) {
      const text = serializeKeep(d);
      memory = text;
      const s = get();
      if (!s) return false;
      try {
        s.setItem(KEEP_KEY, text);
        return true;
      } catch {
        failed = true;
        return false;
      }
    },
  };
}
