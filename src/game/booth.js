/** The booth: one small card table with the Shark across it. Pure numbers, no graphics.
 *
 * Frame ("table-local", metres): origin on the table top at its centre, +x to the player's right, +y up,
 * +z toward the player, -z toward the Shark. The player's head is about 0.46 m behind the near edge's
 * centre line (z = +0.46), the Shark's head 0.46 m on the other side: about 0.92 m eye to eye, "about 1 m".
 * In mixed reality the table top is the real desk (placement puts y = 0 on the desk surface); with no
 * plane the booth draws its own table at desk height. */
import { ZONES } from "./layout.js";

/** The table top: x from -halfX to +halfX, z from zFar to zNear. A real desk replaces it (see `deskPolygon` in sight.js). */
export const TABLE = { halfX: 0.46, zNear: 0.27, zFar: -0.25 };

/** Where the heads sit by default (table-local). The player's real head is read live; the Shark's eye height follows the player's. */
export const SEAT = { playerZ: 0.46, sharkZ: -0.46, eyeRel: 0.47 };

/** Where things lie on the table (same numbers as the chips and cards use in game/layout.js). */
export const SPOTS = {
  playerLay: { x: 0, z: 0.09 },
  sharkLay: { x: 0, z: -0.12 },
  deck: { x: ZONES.deck.x, z: ZONES.deck.z },
  pot: { x: ZONES.pot.x, z: ZONES.pot.z },
};

/** The Shark's shoulders and his resting hands (table-local). His right hand is on the player's left. */
export const BODY = {
  shoulderR: { x: -0.2, z: -0.5 },
  shoulderL: { x: 0.2, z: -0.5 },
  /** Shoulder height below the eyes. */
  shoulderDrop: 0.17,
  restR: { x: -0.15, y: 0.025, z: -0.2 },
  restL: { x: 0.15, y: 0.025, z: -0.22 },
  /** His cheating hand: the forearm dips over the far edge and the wrist sits at the edge, in view of the player; the hand goes
   * under the table top (fingers toward the player). */
  // stage D: the wrist stays 3 cm ABOVE the felt, so his sleeve and its glowing cuff stay in view at the far edge while the hand goes down out of sight
  cheatWrist: { x: -0.17, y: 0.03, z: -0.28 },
  cheatDir: { x: 0.2, y: -0.62, z: 0.78 },
};

/** Distances the rules use (metres unless marked). */
export const RULES = {
  /** A closing hand grabs the card if the palm is this close to it, flat. */
  grabCardR: 0.12,
  /** A card is laid when an open hand over the lay spot is this close, flat, and below `layMaxY`. */
  layR: 0.14,
  layMaxY: 0.09,
  /** The hand must have held the card this long before an open hand lays it (a grab and release in place is not a lay). */
  layMinHoldS: 0.7,
  /** A hand whose palm is below this height is under the table (the sight check decides if he can see it). It leaves "under" only
   * when it comes back above underY + underBackY (hysteresis, so tracking noise at the table top does not flicker). */
  underY: -0.025,
  underBackY: 0.03,
  /** A change of fist, pinch or "under" must last this long (seconds) before it counts (tracking flicker). */
  debounceS: 0.06,
  /** The player's resting hands lie on the table's near side at about this height and depth; his wrist is within 0.5 m of them when it can be grabbed. */
  restHands: { y: 0.04, z: 0.2 },
  /** A closed hand this close to his wrist (or the lower forearm) for `grabWristS` seconds is a grab. */
  grabWristR: 0.14,
  grabWristS: 0.5,
  /** Hand speed (m/s, smoothed) above which a visible hand moves "too much" while he stares. */
  stareSpeed: 0.07,
  /** Where the hand is when it counts as "pointing at a spot in the room": see game/spots.js. */
  pointMinDistance: 1.4,
};
