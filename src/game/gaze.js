/** The Shark's gaze: a state machine, not AI. Three states:
 *  watching     cone on the player's side
 *  lookingAway  cone off for 1 to 2 seconds, started by a telegraph
 *  cheating     glove under the hat; starts only after the player's view has been
 *               more than 24 degrees off him (down at the hands, or turned away)
 *               for more than 0.4 seconds (stage 1: the swap opens the door; it
 *               used to be a head turn of 35 degrees for 0.7 seconds)
 * The catch window (glove under the hat) is `gloveUnderHat`; the click or slap that
 * uses it is in contact.js and the caught check is in suspicion.js. */
import { nextRange, nextInt, nextFloat } from "./rng.js";
import { LEVELS } from "./levels.js";

export const WATCHING = "watching";
export const AWAY = "lookingAway";
export const CHEATING = "cheating";

/** Angle off him (degrees) beyond which the player is not watching him. A seated player looking at the deck or the
 * card in front of him is about 29 to 32 degrees off a Shark at the far edge; looking at the middle of the desk, about 20. */
export const LOOK_LIMIT_DEG = 24;
/** How long the view must stay off him before he cheats. */
export const LOOK_HOLD_S = 0.4;
/** Old names (the head-turn rule before stage 1). */
export const YAW_LIMIT_DEG = LOOK_LIMIT_DEG;
export const YAW_HOLD_S = LOOK_HOLD_S;
export const AWAY_MIN_S = 1.0;
export const AWAY_MAX_S = 2.0;
export const GAP_MIN_S = 3.5;
export const GAP_MAX_S = 7.0;
/** The catch window: how long the glove stays under the hat where you can still
 * catch him. PRODUCT-FIT P0-6 widened it from 1.0 s to 1.5 s (Normal). */
export const CATCH_WINDOW_S = 1.5;
/** Whole cheat: glove goes to the hat (0.35 s), is under it for the catch window,
 * comes back (0.35 s). */
export const CHEAT_GO_S = 0.35;
export const CHEAT_UNDER_END_S = CHEAT_GO_S + CATCH_WINDOW_S;
export const CHEAT_S = CHEAT_UNDER_END_S + 0.35;
export const CHEAT_COOLDOWN_S = 4.0;
/** Stage 1: his glove stays under the hat while your view is down at your hands, and for at least `reactS` seconds after you look
 * back up (Normal 1.0 s), so a slow swap never uses up the catch window. A cheat never lasts longer than this. */
export const CHEAT_MAX_S = 7.0;
export const REACT_S = 1.0;
/** Telegraphs that are built so far; "knock" and "sip" are cut-first extras. */
export const TELEGRAPHS = ["count"];

/** @typedef {{ state:string, t:number, yawHold:number, gap:number, awayFor:number,
 *   telegraph:string|null, cooldown:number, rng:{s:number}, telegraphs:string[], declined:boolean,
 *   sawOff:boolean, reacted:boolean, cheatClock:number,
 *   level:{awayMin:number, awayMax:number, fillS:number, catchWindowS:number, cheatChance?:number, reactS?:number} }} Gaze */

/** @param {{s:number}} rng @param {{telegraphs?:string[], level?:Gaze["level"]}} [opts] @returns {Gaze} */
export function createGaze(rng, opts = {}) {
  return {
    state: WATCHING,
    t: 0,
    yawHold: 0,
    gap: nextRange(rng, GAP_MIN_S, GAP_MAX_S),
    awayFor: 0,
    telegraph: null,
    cooldown: 0,
    rng,
    declined: false,
    sawOff: false,
    reacted: false,
    cheatClock: 0,
    telegraphs: opts.telegraphs ?? TELEGRAPHS,
    level: opts.level ?? LEVELS.normal,
  };
}

/** Angle in degrees between where the head faces and the direction to the Shark,
 * flat on the floor plane. @param {{x:number,z:number}} head
 * @param {{x:number,z:number}} forward head forward (any length)
 * @param {{x:number,z:number}} target @returns {number} 0..180 */
export function yawOffDeg(head, forward, target) {
  const fx = forward.x, fz = forward.z;
  const tx = target.x - head.x, tz = target.z - head.z;
  const fl = Math.hypot(fx, fz), tl = Math.hypot(tx, tz);
  if (fl < 1e-6 || tl < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, (fx * tx + fz * tz) / (fl * tl)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle in degrees between where the head faces and the direction to the Shark, in 3D (so looking down at your
 * hands counts as well as turning away). @param {{x:number,y:number,z:number}} head
 * @param {{x:number,y:number,z:number}} forward head forward (any length)
 * @param {{x:number,y:number,z:number}} target @returns {number} 0..180 */
export function lookOffDeg(head, forward, target) {
  const tx = target.x - head.x, ty = target.y - head.y, tz = target.z - head.z;
  const fl = Math.hypot(forward.x, forward.y, forward.z), tl = Math.hypot(tx, ty, tz);
  if (fl < 1e-6 || tl < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, (forward.x * tx + forward.y * ty + forward.z * tz) / (fl * tl)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** The cone is on the player's side only while watching. @param {Gaze} g */
export function coneOn(g) {
  return g.state === WATCHING;
}

/** True while the glove is hidden under the hat: the catch window.
 * @param {Gaze} g */
export function gloveUnderHat(g) {
  return g.state === CHEATING && g.t >= CHEAT_GO_S && g.t < CHEAT_GO_S + windowOf(g);
}

/** The catch window of this gaze machine (Normal 1.5 s; Easy 2 s; Hard 1 s). @param {Gaze} g */
export function windowOf(g) {
  return g.level?.catchWindowS ?? CATCH_WINDOW_S;
}

/** The cheat's whole length for this level. @param {Gaze} g */
export function cheatLength(g) {
  return CHEAT_GO_S + windowOf(g) + 0.35;
}

/** Time on the glove's path (paths.js, built for the Normal window) for this gaze time: the
 * trip to the hat and the way back keep their speed; only the time under the hat stretches or shrinks.
 * @param {Gaze} g @returns {number} */
export function cheatPathT(g) {
  const w = windowOf(g);
  if (g.t < CHEAT_GO_S) return g.t;
  if (g.t < CHEAT_GO_S + w) return CHEAT_GO_S + ((g.t - CHEAT_GO_S) * CATCH_WINDOW_S) / w;
  return CHEAT_UNDER_END_S + (g.t - CHEAT_GO_S - w);
}

/** Change the level (for the next look-away and the next cheat). @param {Gaze} g @param {Gaze["level"]} level */
export function setGazeLevel(g, level) {
  g.level = level;
}

/** Can a catch made now succeed? The glove must be under the hat and the player's
 * view must be back within 24 degrees of him (he looked up).
 * @param {Gaze} g @param {number} yawDeg */
export function catchOpen(g, yawDeg) {
  return gloveUnderHat(g) && Math.abs(yawDeg) <= LOOK_LIMIT_DEG;
}

/** The player caught him: the cheat is cancelled, the cooldown starts.
 * @param {Gaze} g */
export function cancelCheat(g) {
  if (g.state !== CHEATING) return false;
  g.cooldown = CHEAT_COOLDOWN_S;
  g.yawHold = 0;
  g.gap = nextRange(g.rng, GAP_MIN_S, GAP_MAX_S);
  enter(g, WATCHING);
  return true;
}

/** @param {Gaze} g @param {string} state */
function enter(g, state) {
  g.state = state;
  g.t = 0;
  if (state === CHEATING) {
    g.sawOff = false;
    g.reacted = false;
    g.cheatClock = 0;
  }
}

/** The look-up time this gaze machine promises. @param {Gaze} g */
export function reactOf(g) {
  return g.level?.reactS ?? REACT_S;
}

/**
 * Advance the machine by `dt` seconds.
 * @param {Gaze} g
 * @param {number} dt
 * @param {{yawDeg:number, canCheat?:boolean, active?:boolean, holding?:boolean}} input
 *   active=false freezes the telegraph timer (for example during the opening). holding = a card is in the player's hand:
 *   while he is watching, that is not a chance to cheat.
 * @returns {{type:string, telegraph?:string}[]} events: away, watch, cheatStart, cheatEnd
 */
export function updateGaze(g, dt, input) {
  const events = [];
  const off = Math.abs(input.yawDeg) > LOOK_LIMIT_DEG;
  g.yawHold = off ? g.yawHold + dt : 0;
  if (!off) g.declined = false;
  g.cooldown = Math.max(0, g.cooldown - dt);
  g.t += dt;
  if (g.state === CHEATING) {
    g.cheatClock += dt;
    const endUnder = CHEAT_GO_S + windowOf(g);
    if (off) {
      g.sawOff = true;
      g.reacted = false;
      // the view is down at the hands: the glove stays under the hat (unless the cheat has gone on too long)
      if (g.t > endUnder - 0.05 && g.cheatClock < CHEAT_MAX_S) g.t = endUnder - 0.05;
    } else if (g.sawOff && !g.reacted) {
      // the view is back on him: from now the glove stays under the hat for at least `reactS`
      g.reacted = true;
      const need = Math.min(reactOf(g), windowOf(g));
      if (g.t > endUnder - need) g.t = Math.max(CHEAT_GO_S + 0.02, endUnder - need);
    }
    if (g.t >= cheatLength(g)) {
      g.cooldown = CHEAT_COOLDOWN_S;
      g.yawHold = 0;
      g.gap = nextRange(g.rng, GAP_MIN_S, GAP_MAX_S);
      enter(g, WATCHING);
      events.push({ type: "cheatEnd" });
      events.push({ type: "watch" });
    }
    return events;
  }
  // The door: the view has been down at the hands (or turned away) for 0.4 s, in a look-away or while he watches.
  // He takes the chance with the level's probability, once per time the view drops. While he watches you hold a card
  // he does not cheat: he catches you (suspicion.js).
  if (g.yawHold > LOOK_HOLD_S && g.cooldown === 0 && input.canCheat !== false && !g.declined && !(g.state === WATCHING && input.holding === true)) {
    const chance = g.level?.cheatChance ?? 1;
    if (chance >= 1 || nextFloat(g.rng) < chance) {
      g.telegraph = null;
      enter(g, CHEATING);
      events.push({ type: "cheatStart" });
      return events;
    }
    g.declined = true;
  }
  if (g.state === WATCHING) {
    if (input.active !== false) {
      g.gap -= dt;
      if (g.gap <= 0) {
        g.telegraph = g.telegraphs[nextInt(g.rng, g.telegraphs.length)];
        g.awayFor = nextRange(g.rng, g.level?.awayMin ?? AWAY_MIN_S, g.level?.awayMax ?? AWAY_MAX_S);
        enter(g, AWAY);
        events.push({ type: "away", telegraph: g.telegraph });
      }
    }
  } else if (g.state === AWAY) {
    if (g.t >= g.awayFor) {
      g.telegraph = null;
      g.gap = nextRange(g.rng, GAP_MIN_S, GAP_MAX_S);
      enter(g, WATCHING);
      events.push({ type: "watch" });
    }
  }
  return events;
}

/** QA / scripted use: start a look-away now (the cone goes off for `seconds`).
 * It is the same state the telegraph starts; only the start time is chosen.
 * @param {Gaze} g @param {number} seconds */
export function forceAway(g, seconds) {
  if (g.state !== WATCHING) return false;
  g.telegraph = g.telegraphs[0];
  g.awayFor = seconds;
  enter(g, AWAY);
  return true;
}

/** The lesson cheat: in the guided first round he cheats right after your first swap, so a new player sees
 * that he cheats and that his glove under the hat can be caught. Same cheat, same
 * window; only the start does not need the hold or the dice.
 * @param {Gaze} g */
export function forceCheat(g) {
  if ((g.state !== WATCHING && g.state !== AWAY) || g.cooldown > 0) return false;
  g.yawHold = 0;
  g.telegraph = null;
  enter(g, CHEATING);
  return true;
}
