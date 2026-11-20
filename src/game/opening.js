/** The first ten seconds, as a pure function of time. No text anywhere.
 *  0.0-1.2  a battered hat appears at the far edge of the desk
 *  1.2-3.0  a deck slides out from under the hat
 *  3.0-4.2  two eyes open under the brim
 *  4.4-6.7  a soft cone of light from the eyes sweeps the player's side once
 *  6.7-8.0  he palms the top card in plain sight
 *  8.0-8.5  he squints (a wink)
 *  8.5-9.1  he lays the card face down
 *  9.5-     a glint on the deck: pinch it to cut */
import { ZONES, PLAYER_SIDE_Z } from "./layout.js";
import { sampleKeys, smooth, span, pulse } from "./keys.js";

export const OPENING_S = 10;
export const READY_S = 9.5;
export const SWEEP_FROM_S = 4.4;
export const SWEEP_TO_S = 6.7;
export const PICK_S = 7.45;
export const LAY_S = 9.1;
const SWEEP_X = 0.36;

const R = ZONES.gloveRestR, L = ZONES.gloveRestL;
/** Right glove (the Shark's right hand, on the player's left). */
export const GLOVE_KEYS = [
  { t: 0, x: R.x, y: 0.012, z: R.z },
  { t: 6.7, x: R.x, y: 0.012, z: R.z },
  { t: 7.25, x: ZONES.deck.x, y: 0.05, z: ZONES.deck.z - 0.01 },
  { t: PICK_S, x: ZONES.deck.x, y: 0.024, z: ZONES.deck.z },
  { t: 8.0, x: -0.09, y: 0.032, z: -0.14 },
  { t: 8.5, x: -0.09, y: 0.032, z: -0.14 },
  { t: LAY_S, x: ZONES.sharkLay.x, y: 0.04, z: ZONES.sharkLay.z },
  { t: 9.3, x: ZONES.sharkLay.x, y: 0.018, z: ZONES.sharkLay.z },
  { t: 9.9, x: R.x, y: 0.012, z: R.z },
];
/** Left glove: waits, a small restless shift. */
export const LEFT_GLOVE = { x: L.x, y: 0.012, z: L.z };

/**
 * @param {number} t seconds since the opening began
 * @returns {{hat:number, deck:number, eyes:number, cone:{on:boolean,x:number,z:number,intensity:number},
 *   glove:{x:number,y:number,z:number}, cardAttached:boolean, cardLaid:boolean,
 *   wink:number, glint:number, ready:boolean, done:boolean}}
 */
export function openingState(t) {
  const sweepK = span(t, SWEEP_FROM_S, SWEEP_TO_S);
  const sweeping = t >= SWEEP_FROM_S && t <= SWEEP_TO_S;
  const settle = smooth(span(t, SWEEP_TO_S, 7.2));
  // one pass left to right, then it eases back to the middle of his view of you
  const sweepX = -SWEEP_X + 2 * SWEEP_X * smooth(sweepK);
  const x = t < SWEEP_TO_S ? sweepX : SWEEP_X * (1 - settle);
  const intensity = smooth(span(t, 3.6, 4.4));
  const g = sampleKeys(GLOVE_KEYS, t);
  return {
    hat: smooth(span(t, 0, 1.2)),
    deck: smooth(span(t, 1.2, 3.0)),
    eyes: smooth(span(t, 3.0, 4.2)),
    cone: {
      on: t >= 3.6,
      x: t < SWEEP_FROM_S ? -SWEEP_X : x,
      z: PLAYER_SIDE_Z,
      intensity: sweeping || t > SWEEP_TO_S ? Math.max(intensity, 0.9) : intensity,
    },
    glove: { x: g.x, y: g.y, z: g.z },
    cardAttached: t >= PICK_S && t < LAY_S,
    cardLaid: t >= LAY_S,
    wink: pulse(t, 8.0, 8.5),
    glint: span(t, READY_S, READY_S + 0.4),
    ready: t >= READY_S,
    done: t >= OPENING_S,
  };
}

const EVENT_TIMES = [
  ["hat", 0.05],
  ["deckSlide", 1.2],
  ["eyes", 3.0],
  ["sweepStart", SWEEP_FROM_S],
  ["sweepEnd", SWEEP_TO_S],
  ["pick", PICK_S],
  ["wink", 8.0],
  ["lay", LAY_S],
  ["ready", READY_S],
  ["done", OPENING_S],
];
export const OPENING_EVENTS = EVENT_TIMES.map(([name]) => name);

/** Events whose time lies in (prev, now]. @param {number} prev @param {number} now
 * @returns {string[]} */
export function openingEvents(prev, now) {
  return EVENT_TIMES.filter(([, at]) => at > prev && at <= now).map(([n]) => String(n));
}
