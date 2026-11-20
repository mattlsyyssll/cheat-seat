/** The one-time ghost-hand lesson (pure, a function of time). Stage 1: the first time his eyes leave you, a
 * see-through hand shows the swap: pinch your own card, carry it to the deck, let go. A glint on the deck marks
 * the drop. The ghost never comes back after the player has swapped once. No text (the laptop page has its own
 * hand cursor and words; this ghost is for the headset). */
import { ZONES } from "./layout.js";
import { sampleKeys, smooth, span } from "./keys.js";
import { LOOK_LIMIT_DEG } from "./gaze.js";

export const GHOST_S = 2.1;
const C = ZONES.playerLay;
const D = ZONES.deck;

/** Right hand, table-local. flat 0..1 (hand lies flat), pinch 0..1. */
const KEYS = [
  { t: 0, x: 0.3, y: 0.13, z: 0.24, flat: 0, pinch: 0 },
  { t: 0.35, x: C.x, y: 0.07, z: C.z, flat: 0, pinch: 0 },
  { t: 0.55, x: C.x, y: 0.03, z: C.z, flat: 0, pinch: 1 },
  { t: 0.7, x: C.x, y: 0.05, z: C.z, flat: 0, pinch: 1 },
  { t: 1.3, x: D.x, y: 0.05, z: D.z, flat: 0, pinch: 1 },
  { t: 1.45, x: D.x, y: 0.03, z: D.z, flat: 0, pinch: 0 },
  { t: GHOST_S, x: D.x + 0.08, y: 0.12, z: D.z + 0.1, flat: 0, pinch: 0 },
];

/**
 * @param {number} t seconds since the ghost started
 * @returns {{hand:{x:number,y:number,z:number}, flat:number, pinch:number, cardOnTable:boolean,
 *   cardLifted:boolean, glint:number, alpha:number, done:boolean}}
 */
export function ghostState(t) {
  const k = sampleKeys(KEYS, Math.max(0, Math.min(GHOST_S, t)));
  return {
    hand: { x: k.x, y: k.y, z: k.z },
    flat: k.flat,
    pinch: k.pinch,
    cardOnTable: t < 0.55,
    cardLifted: t >= 0.55 && t < 1.45,
    glint: smooth(span(t, 1.3, 1.5)) * (1 - smooth(span(t, 1.7, GHOST_S))),
    alpha: smooth(span(t, 0, 0.2)) * (1 - smooth(span(t, 1.7, GHOST_S))),
    done: t >= GHOST_S,
  };
}

/** Does the ghost play now? It plays on the first looking-away of a round, in the
 * first three rounds, until the player has swapped once.
 * @param {{taught:boolean, round:number, shown:number}} s @returns {boolean} */
export function ghostWanted(s) {
  return !s.taught && s.round <= 3 && s.shown < 3;
}

/** The second lesson: how to catch him. While his glove is under the hat and your head
 * is facing him, a see-through hand puts its palm down on his half of the desk and lifts
 * again. It plays in every catch window until the player has caught him once.
 * `t` is seconds since the glove went under the hat (the window is 1.5 s). No text. */
export const SLAP_GHOST_S = 1.5;
export const SLAP_SPOT = { x: 0.04, z: -0.14 };
const SLAP_KEYS = [
  { t: 0, x: 0.3, y: 0.17, z: 0.02, flat: 1, pinch: 0 },
  { t: 0.4, x: SLAP_SPOT.x, y: 0.07, z: SLAP_SPOT.z, flat: 1, pinch: 0 },
  { t: 0.62, x: SLAP_SPOT.x, y: 0.016, z: SLAP_SPOT.z, flat: 1, pinch: 0 },
  { t: 1.05, x: SLAP_SPOT.x, y: 0.016, z: SLAP_SPOT.z, flat: 1, pinch: 0 },
  { t: SLAP_GHOST_S, x: SLAP_SPOT.x + 0.04, y: 0.13, z: SLAP_SPOT.z + 0.04, flat: 1, pinch: 0 },
];

/** @param {number} t seconds since the glove went under the hat
 * @returns {{hand:{x:number,y:number,z:number}, flat:number, pinch:number, alpha:number, down:boolean, done:boolean}} */
export function slapGhostState(t) {
  const k = sampleKeys(SLAP_KEYS, Math.max(0, Math.min(SLAP_GHOST_S, t)));
  return {
    hand: { x: k.x, y: k.y, z: k.z },
    flat: 1,
    pinch: 0,
    alpha: smooth(span(t, 0, 0.18)) * (1 - smooth(span(t, 1.25, SLAP_GHOST_S))),
    down: t >= 0.58 && t < 1.1,
    done: t >= SLAP_GHOST_S,
  };
}

/** Does the catch lesson play now? Only until the player has caught him once, and
 * only while the window is open and the view is back on him (within the 24 degree limit).
 * @param {{caughtHim:boolean, windowOpen:boolean, yawDeg:number}} s @returns {boolean} */
export function slapGhostWanted(s) {
  return !s.caughtHim && s.windowOpen && Math.abs(s.yawDeg) <= LOOK_LIMIT_DEG;
}

/** The keep lesson (Desk Keep): the first time in a session the player holds a palmed card, the keep frame glows and a see-through hand shows the verb once:
 * a closed hand comes over the spot, opens flat, and lifts. Never again after the first keep (or once it has played through). No text.
 * `t` is seconds since the cue started; offsets are metres from the keep spot (table-local). */
export const KEEP_GHOST_S = 2.6;
const KEEP_KEYS = [
  { t: 0, dx: 0.1, y: 0.13, dz: 0.19, flat: 0 },
  { t: 0.6, dx: 0.0, y: 0.075, dz: 0.06, flat: 0 },
  { t: 0.95, dx: 0.0, y: 0.05, dz: 0.06, flat: 1 },
  { t: 1.35, dx: 0.0, y: 0.05, dz: 0.06, flat: 1 },
  { t: 1.9, dx: 0.0, y: 0.115, dz: 0.05, flat: 1 },
  { t: KEEP_GHOST_S, dx: 0.0, y: 0.125, dz: 0.05, flat: 1 },
];

/** @param {number} t seconds since the keep cue started @param {{x:number, z:number}} spot the keep spot, table-local @param {boolean} [glasses] the Glasses device: the hand comes in from the left
 * @returns {{hand:{x:number,y:number,z:number}, flat:number, pinch:number, alpha:number, glow:number, done:boolean}} glow = 0..1 for the frame */
export function keepGhostState(t, spot, glasses = false) {
  const k = sampleKeys(KEEP_KEYS, Math.max(0, Math.min(KEEP_GHOST_S, t)));
  // Glasses: the spot is at the right edge of their narrow view, so the closed hand arrives from the left (toward the middle of the view), not from outside it on the right
  if (glasses) k.dx = -k.dx;
  const fade = smooth(span(t, 0, 0.25)) * (1 - smooth(span(t, 2.1, KEEP_GHOST_S)));
  return {
    hand: { x: spot.x + k.dx, y: k.y, z: spot.z + k.dz },
    flat: k.flat,
    pinch: 0,
    alpha: fade,
    glow: fade * (0.65 + 0.35 * Math.sin(t * 7)),
    done: t >= KEEP_GHOST_S,
  };
}

/** Does the keep cue start now? Once per session: a palmed card is in the hand, the round is running, the spot has room, it has not played and no card has been kept yet.
 * @param {{taught:boolean, shown:boolean, palmed:boolean, playing:boolean, room:boolean}} s @returns {boolean} */
export function keepGhostWanted(s) {
  return !s.taught && !s.shown && s.palmed && s.playing && s.room;
}
