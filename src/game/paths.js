/** The Shark's glove paths (pure). Times are seconds from the start of each
 * move; positions are table-local metres. The right glove (on the player's left)
 * works the deck, the lay spot and the hat; the left glove counts his pile. */
import { ZONES } from "./layout.js";
import { sampleKeys } from "./keys.js";
import { CHEAT_GO_S, CHEAT_UNDER_END_S, CHEAT_S } from "./gaze.js";

const R = ZONES.gloveRestR, L = ZONES.gloveRestL;
const HAT = ZONES.hat;
export const REST_Y = 0.012;
export const rightRest = { x: R.x, y: REST_Y, z: R.z };
export const leftRest = { x: L.x, y: REST_Y, z: L.z };

/** Under the hat: behind the dark face, out of sight of a player in front. */
export const UNDER_HAT = { x: HAT.x - 0.02, y: 0.07, z: HAT.z - 0.05 };
const AT_HAT_FRONT = { x: HAT.x - 0.02, y: 0.05, z: HAT.z + 0.07 };

/** Laying his card from the top of the deck (rounds after the first). */
export const LAY_DECK = {
  pickAt: 0.7,
  layAt: 1.45,
  endAt: 2.1,
  keys: [
    { t: 0, ...rightRest },
    { t: 0.5, x: ZONES.deck.x, y: 0.05, z: ZONES.deck.z - 0.01 },
    { t: 0.7, x: ZONES.deck.x, y: 0.024, z: ZONES.deck.z },
    { t: 1.2, x: -0.05, y: 0.04, z: -0.15 },
    { t: 1.45, x: ZONES.sharkLay.x, y: 0.04, z: ZONES.sharkLay.z },
    { t: 1.6, x: ZONES.sharkLay.x, y: 0.018, z: ZONES.sharkLay.z },
    { t: 2.1, ...rightRest },
  ],
};

/** After a cheat: from under the hat, over his card, swap, back to rest. The
 * card under the glove changes at `swapAt`. */
export const SWAP_PATH = {
  swapAt: 0.75,
  endAt: 1.6,
  keys: [
    { t: 0, ...AT_HAT_FRONT },
    { t: 0.45, x: ZONES.sharkLay.x - 0.02, y: 0.045, z: ZONES.sharkLay.z - 0.04 },
    { t: 0.6, x: ZONES.sharkLay.x, y: 0.02, z: ZONES.sharkLay.z },
    { t: 0.9, x: ZONES.sharkLay.x, y: 0.02, z: ZONES.sharkLay.z },
    { t: 1.6, ...rightRest },
  ],
};

/** The cheat itself, driven by the gaze machine's own timer (gaze.t). The glove
 * goes to the hat, is hidden under it for one second, and comes back out. */
export const CHEAT_KEYS = [
  { t: 0, ...rightRest },
  { t: CHEAT_GO_S, ...AT_HAT_FRONT },
  { t: CHEAT_GO_S + 0.15, ...UNDER_HAT },
  { t: CHEAT_UNDER_END_S - 0.15, ...UNDER_HAT },
  { t: CHEAT_UNDER_END_S, ...AT_HAT_FRONT },
  { t: CHEAT_S, ...AT_HAT_FRONT },
];

/** Left glove counting his pile: a telegraph. */
export const COUNT_KEYS = [
  { t: 0, ...leftRest },
  { t: 0.3, x: ZONES.sharkPile.x - 0.02, y: 0.05, z: ZONES.sharkPile.z + 0.02 },
  { t: 0.55, x: ZONES.sharkPile.x - 0.02, y: 0.03, z: ZONES.sharkPile.z + 0.02 },
  { t: 0.75, x: ZONES.sharkPile.x - 0.02, y: 0.05, z: ZONES.sharkPile.z + 0.02 },
  { t: 0.95, x: ZONES.sharkPile.x - 0.02, y: 0.03, z: ZONES.sharkPile.z + 0.02 },
  { t: 1.15, x: ZONES.sharkPile.x - 0.02, y: 0.05, z: ZONES.sharkPile.z + 0.02 },
  { t: 1.6, ...leftRest },
];

/** @param {{keys:any[]}|any[]} path @param {number} t */
export function samplePath(path, t) {
  const keys = Array.isArray(path) ? path : path.keys;
  const s = sampleKeys(keys, t);
  return { x: s.x, y: s.y, z: s.z };
}
