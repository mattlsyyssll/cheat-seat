/** The duel: ONE game state with ONE set of strict rules, driven only by 3D hand inputs (pure, no graphics, no input device).
 *
 * Every input adapter (the headset's hands, Glasses gaze-and-pinch, the mouse) sends the same thing each frame and nothing else:
 *   HandInput = { id, tracked, pos (the palm, table-local 3D), fist, pinch, pointRay }
 * plus the player's head (position and facing). The rules below never see pixels, a cursor, a DOM event or the kind of device.
 * The Shark's sight is computed from his eyes and these 3D positions (sight.js).
 *
 * The five moments, as rules:
 *  1 Palm it       a closing hand next to your card grabs it; a fist hides the card; an open hand shows it again.
 *  2 Under the table  a palm below the table top (the table blocks his sight line) can swap the card in your hand with the one in
 *                  your sleeve: hold a fist there for 0.25 s, then open the hand.
 *  3 Point him away   a steady index-finger point at a spot of the room (3 per match) turns his head for about 2 s.
 *  4 The stare     suspicion 0.6 or more: he leans in; a visible hand that moves, or a hand under the table too long, gives you away.
 *  5 Grab his wrist   while his hand is under the table, a closed hand on his wrist for 0.5 s catches him.
 * Strict: his gaze is a line of sight; a visible card that is not the one he dealt you is seen; a fist or a hand under the table is not. */
import { createRng, nextFloat } from "./rng.js";
import {
  createMatch, cutMatch, sharkLay, sharkSwap, armHat, dealPlayer, playerLift, playerReturn, playerSwapSleeve, playerIllegal, armSleeve,
  resolveRound, finishRound, caughtPlayer, catchShark, ROUNDS, keepHeld, playKept, seizeKept,
} from "./match.js";
import { KEEP, createKeep, chooseSpot, frameInGlassesView, watchKeep, overSpot, validSpot, cleanCards } from "./keep.js";
import { createRig } from "../actor/rig.js";
import { createBrain, brainNewRound, brainStep, brainReact, notice, distract, grabbed, slam } from "./brain.js";
import { tuningOf, glassesTuning, POINTS_PER_MATCH, POINT_HOLD_S } from "./tuning.js";
import { levelId } from "./levels.js";
import { TABLE, SEAT, SPOTS, RULES } from "./booth.js";
import { canSee, CONE, dist, segmentDistance, unit, angleTo } from "./sight.js";
import { resolvePoint, VIRTUAL_ROOM } from "./spots.js";
import { rankOf } from "./cards.js";
import { MENU } from "./menu.js";
import { KEEP_GHOST_S, keepGhostWanted } from "./ghost.js";
import { createHabits, habitsNewMatch, recordSwap, adaptation, WATCH_FIST_X } from "./habits.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{id:string, tracked:boolean, pos:V3, fist:boolean, pinch?:boolean, pointRay:{o:V3,d:V3}|null}} HandInput */
/** @typedef {{pos:V3, dir:V3}} HeadInput */

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Lesson 3 (S2, stage C): his first cheat gives a first-timer time to read the line, find the ring and hold the button for half a second;
 * if he cheats again (you missed it) the window is the lesson standard. The real match keeps the level's window (2.3 s on normal). */
export const FIRST_CHEAT_WINDOW_S = 7.5;
export const REPEAT_CHEAT_WINDOW_S = 5.5;
/** The practice rounds (the first minute): one verb each, in this order. The Shark is scripted so that the verb is needed at a known
 * moment: step 1 palm it (he looks at your hands a little later), step 2 the stare (he leans in and you hold still), step 3 grab his
 * wrist (he cheats, again and again, until you catch him), step 4 under the table (he looks at his own card from a moment after you pick
 * up yours until you lay it). A lesson round never times out: it ends when its step is done (see `phases`), or when you are caught
 * (a warning, never a strike, and the same lesson comes again, at most twice). */
export const PRACTICE = [
  null,
  { noRandom: true, look: { kind: "hands", at: 2.6, dur: 1.6 } },
  { noRandom: true, stare: { at: 1.0, dur: 2.4 } },
  { noRandom: true, cheat: { at: 1.2, window: FIRST_CHEAT_WINDOW_S } },
  { noRandom: true, look: { kind: "own", at: 0.8, dur: 99, whenHeld: true } },
];
/** Stage F: THE GUIDED FIRST MATCH (replaces the four lesson rounds on a first visit; the lessons stay for `?practice=1` and the old tests).
 * The first deal is round 1 of the real match: 7 rounds, three strikes lose, the pot is real. The first time each situation happens a short tip says what
 * to do (an id the page turns into words; the headset shows the same on its plate). A tip never waits: the round runs on whether you follow it or not, and the
 * page can switch the tips off (`setTips`). Two rounds are scripted, softly, so that each situation comes once in story order:
 *   GLANCE round (round 1): he stares at you soon after you take your card (his "caught" meter fills at 0.45 of the usual rate: a twitch is forgiven, a real
 *     move is not), then he looks down at his own card until you lay yours. That is the moment to cheat: hand under the table, swap in your sleeve card,
 *     hide it in your fist, lay it. If you swap, the round is yours (his card is set below your sleeve card, the way the first lesson paid off).
 *   CUFF round (round 2): he cheats a few seconds in, with a long first window (his cuff glows and carries the ring).
 * If a scripted round ends without its situation (you were caught, or you laid without swapping), the next round plays the same script once more (at most
 * twice each), so a first-timer still sees each one. Tips: take your card, hide it in your fist, his stare, his glance (go under), the swap, hide the new card and lay it, his cuff, look away;
 * in a headset also the peek and the pause pad (the page decides those two, it knows the device). */
export const COACH = {
  glance: { noRandom: true, soft: 0.45, stare: { at: 1.1, dur: 2.2, whenHeld: true, afterHide: 5 }, look: { kind: "own", at: 0.3, whenHeld: true, afterStare: true } },
  cuff: { cheat: { at: 2.6, window: 6.5 } },
  /** Each scripted round is played at most this many times. */
  tries: 2,
};

/** The tips that belong to each scripted round of the guided first match. */
const COACH_TIPS = { glance: ["c-take", "c-fist", "c-stare", "c-under", "c-swap", "c-swap-go", "c-swap-retry", "c-hide"], cuff: ["c-cuff"] };

/** The names of the four lessons (shown on the page in flat play). */
export const LESSONS = [null, "Palm the card", "Hold still", "Catch his cheat", "Under the table"];
/** A fist that stays closed this long (seconds) is a real palm (a click, down and up within 0.3 s, closes the hand for less). A shorter
 * close and open over the lay spot, with the card held for at least TAP_LAY_HELD_S, puts the card down ("click the ring"). */
export const PALM_HOLD_S = 0.4;
export const TAP_LAY_HELD_S = 0.5;
/** PEEK (stage D, the one move only a body can do): lean over the table (your head 12 cm or more forward of the seat) and look at his face-down card for
 * 0.45 s: it tilts up and you see it for 1.6 s. Once a round. The risk is built in: leaning raises his suspicion all the while (brain.js LEAN_*),
 * and if his eyes are on you when you peek, he notices (+0.3). Flat play never leans, so it never peeks. */
// stage F (D4): the card shows for 2.4 s (was 1.6): it rises, turns to you and grows, and the plate says what it is
export const PEEK = { lean: 0.12, angleDeg: 26, holdS: 0.45, showS: 2.4, riskGain: 0.3, riskCone: 32 };
/** The result beat after every round (seconds): cards turn over at `SHOW_AT_S`, then stay face up for `BEAT_S`. */
export const SHOW_AT_S = 0.7;
export const BEAT_S = 2.7;
export const COVER_MEMORY_S = 2.5;
/** Lesson 1 only: the cards stay face down this much longer after the swap, so the swap can be seen and read before the cards turn. */
export const PAYOFF_HOLD_S = 1.1;
/** Lesson 2 only (stage D): the cards stay face down this much longer after the stare ends, so the payoff of holding still shows first. */
export const STILL_HOLD_S = 1.7;

/** @param {{seed?:number, level?:string, eyeRel?:number, table?:import("./sight.js").TableTop, surfaces?:import("./spots.js").Surface[], warn?:boolean, practice?:boolean, coach?:boolean, tipPointSeen?:boolean,
 *   keep?:{cards?:number[], spot?:{x:number,z:number,source?:string}|null}, keepTaught?:boolean, noKeepCue?:boolean, glasses?:boolean}} [opts] keepTaught = the keep lesson is already known this session; noKeepCue = never show it (the start screen's demo); keep = Desk Keep: the cards already on the keep spot and where the spot is (from the save or the anchor) */
export function createGame(opts = {}) {
  const seed = opts.seed ?? 1;
  const level = levelId(opts.level);
  const glasses = opts.glasses === true;
  const tuning = glasses ? glassesTuning(tuningOf(level)) : tuningOf(level);
  const g = {
    seed, level, tuning,
    /** Meta VR Glasses: the keep spot sits inside their narrow view and the keep risk is tuned for it (setGlasses). Quest 3 and flat play are not changed. */
    glasses,
    rng: createRng(seed + 17),
    eyeRel: opts.eyeRel ?? SEAT.eyeRel,
    table: opts.table ?? { ...TABLE, polygon: null },
    surfaces: opts.surfaces ?? [VIRTUAL_ROOM],
    match: createMatch({ seed, warn: opts.warn === true, kept: opts.practice ? [] : opts.keep?.cards }),
    /** Desk Keep: where the keep spot is, the cone dwell meter and the pick-up pause (game/keep.js). */
    keep: createKeep({ spot: opts.keep?.spot, glasses }),
    /** Fair first keep: the cards kept in THIS round are safe from his cone until the round ends (cleared in beginRound). */
    keepSafe: /** @type {number[]} */ ([]),
    /** The one-time keep cue (game/ghost.js): taught = the player has kept once (or came back with kept cards, or the page said so); shown = it has played; t = seconds into it, or -1. */
    teach: { taught: opts.keepTaught === true || (opts.keep?.cards?.length ?? 0) > 0, shown: opts.noKeepCue === true, t: -1 },
    rig: createRig({ eyeRel: opts.eyeRel ?? SEAT.eyeRel }),
    brain: createBrain(createRng(seed + 1000), tuning),
    /** The Shark learns your tell: what you do every time you cheat (game/habits.js). It stays across matches (the rematch). */
    habits: createHabits(),
    _cover: /** @type {{kind:string, t:number}|null} */ (null),
    _dip: /** @type {{hand:string, cover:string|null}|null} */ (null),
    phase: "intro", phaseT: 0, clock: 0,
    started: false,
    /** @type {Map<string, any>} */
    hands: new Map(),
    card: { state: "down", holder: /** @type {string|null} */ (null), shown: false, armed: false, heldT: 0, fistT: 0, laidOnce: false, palmedOnce: false },
    sharkCardUp: false, evidence: /** @type {number|null} */ (null),
    /** The result of the round, for the page words and the look of the table (set at the showdown, a catch or a grab). */
    beat: /** @type {any} */ (null),
    /** One-time tips (the page keeps `seen` between visits): "point" explains the Point button the first time he is watching you. */
    tips: { point: opts.tipPointSeen ? "seen" : "new", pointT: 0 },
    pointsLeft: POINTS_PER_MATCH, usedSpots: /** @type {V3[]} */ ([]),
    grabT: 0, falseT: 0, swaps: 0, round: 1,
    /** The peek: seconds the head has leaned and looked at his card; once a round; the card being shown now ({card, t}) or null. */
    peekT: 0, peeked: false, peek: /** @type {{card:number, t:number}|null} */ (null),
    steps: 0,
    /** @type {string[]} */ log: [],
    /** @type {{type:string, [k:string]:any}[]} */ events: [],
    head: { pos: { x: 0, y: opts.eyeRel ?? SEAT.eyeRel, z: SEAT.playerZ }, dir: { x: 0, y: -0.2, z: -1 } },
    lastFinal: /** @type {any} */ (null),
    view: /** @type {any} */ (null),
    qa: { calm: false },
    /** Stage F: the guided first match (see COACH); null when off (a returning visitor, QA runs unless asked). */
    coach: opts.coach && !opts.practice ? { tips: true, script: /** @type {string|null} */ (null), tries: { glance: 0, cuff: 0 }, done: { glance: false, cuff: false }, seen: /** @type {Record<string, boolean>} */ ({}), tip: /** @type {string|null} */ (null), tipT: 0, finished: false } : null,
    practice: opts.practice ? { step: 1, tries: 0, done: false, sawPalm: false, finished: false, paid: false } : /** @type {null|{step:number,tries:number,done:boolean,sawPalm:boolean,finished:boolean,paid:boolean}} */ (null),
  };
  return g;
}

/** @typedef {ReturnType<typeof createGame>} Game */

/** @param {Game} g @param {string} type @param {any} [data] */
function emit(g, type, data = {}) {
  g.events.push({ type, ...data });
  const detail = data.reason ?? data.why ?? data.valid ?? data.result ?? data.n ?? null;
  g.log.push(detail === null || detail === undefined ? type : `${type}:${detail}`);
  if (g.log.length > 400) g.log.shift();
}

/** Begin the match: round 1. @param {Game} g */
export function startMatch(g) {
  if (g.started) return;
  g.started = true;
  cutMatch(g.match, 20);
  beginRound(g);
  if (g.practice) emit(g, "practiceStep", { n: g.practice.step });
  // Desk Keep, the next visit: the kept cards are already on the spot; the page shows their count on a short wordless plate
  if (!g.practice && g.match.kept.length > 0) emit(g, "keptCount", { n: g.match.kept.length });
}

/** @param {Game} g */
function beginRound(g) {
  g.phase = "dealing";
  g.phaseT = 0;
  if (g.round !== g.match.round) g.keepSafe = []; // a card kept in the round that just ended is no longer safe: from this round on the cone dwell applies (a tie that re-deals the same round stays the same round)
  g.round = g.match.round;
  g.card = { state: "down", holder: null, shown: false, armed: false, heldT: 0, fistT: 0, laidOnce: false, palmedOnce: false };
  g.sharkCardUp = false;
  g.evidence = null;
  g.beat = null;
  g.grabT = 0;
  g.falseT = 0;
  g.peekT = 0;
  g.peeked = false;
  g.peek = null;
  g._dealt = { shark: false, player: false, sleeve: false };
  g.keep.lifted = null;
  const pr = g.practice;
  if (pr) {
    pr.done = false;
    pr.sawPalm = false;
    pr.paid = false;
    g.match.warn = true; // a catch in practice is a warning
  }
  const script = pr ? PRACTICE[pr.step] : coachScript(g);
  brainNewRound(g.brain, script, script ? null : adaptation(g.habits, g.round));
  g._dip = null;
  // stage F: in the guided first match a catch in a scripted round is a warning (no strike); after them every catch is a strike (three strikes lose)
  if (g.coach && !pr) g.match.warn = !!g.coach.script;
  emit(g, "roundStart", { n: g.round });
}

/** Stage F: which scripted round the guided first match plays now (the glance until you have cheated during it, then his cuff until you have seen it), or none.
 * @param {Game} g */
function coachScript(g) {
  const c = g.coach;
  if (!c) return null;
  c.script = null;
  for (const k of /** @type {const} */ (["glance", "cuff"])) {
    if (c.done[k] || c.tries[k] >= COACH.tries) continue;
    // played again: its tips show again (a first-timer who missed them gets them once more)
    if (c.tries[k] > 0) for (const id of COACH_TIPS[k]) delete c.seen[id];
    c.tries[k]++;
    c.script = k;
    return COACH[k];
  }
  if (!c.finished) {
    c.finished = true;
    emit(g, "coachDone");
  }
  return null;
}

/** Stage F: the scripted rounds of the guided first match are behind you (played, or tried twice each). @param {Game} g */
export function coachDone(g) {
  return !g.coach || !!g.coach.finished;
}

/** Stage F: the page switches the tips of the guided first match off (the player skipped them) or on. The scripted rounds stay. @param {Game} g @param {boolean} on */
export function setTips(g, on) {
  if (g.coach) g.coach.tips = on;
}

/** A fresh match after the old one ended. @param {Game} g */
export function newMatch(g) {
  if (g.phase === "over") habitsNewMatch(g.habits);
  else g.habits.caught = {};
  g.keepSafe = [];
  g.match = createMatch({ seed: g.seed + g.round + 31 + g.steps, warn: false, kept: g.match.kept }); // kept cards stay on the spot across matches
  g.keep.meter = 0;
  g.pointsLeft = POINTS_PER_MATCH;
  g.usedSpots = [];
  g.brain.suspicion = 0;
  g.brain.mode = "watch";
  g.started = false;
  startMatch(g);
}

// ------------------------------------------------------------------ hand tracking
/** A flag that changes only after the raw value has differed for `RULES.debounceS`. @returns {[boolean, number]} */
function debounce(stable, raw, t, dt) {
  if (raw === stable) return [stable, 0];
  t += dt;
  return t >= RULES.debounceS ? [raw, 0] : [stable, t];
}

/** A hand whose tracking is lost: for this long (seconds) nothing changes (a short dropout is not an event). */
const GRACE_S = 0.35;
/** A lost hand is remembered this long; after that it is gone (not present). */
const HOLD_MAX_S = 4.0;

/** @param {Game} g @param {HandInput} inp @param {number} dt */
function trackHand(g, inp, dt) {
  let h = g.hands.get(inp.id);
  const fresh = !h;
  if (!h) {
    h = { id: inp.id, tracked: false, present: false, pos: { ...inp.pos }, sp: { ...inp.pos }, hist: [], speed: 0, vy: 0, fist: false, pinch: false, closed: false, wasClosed: false, wasFist: false,
      fistT: 0, pinchT: 0, under: false, wasUnder: false, underT: 99, visible: false, wasVisible: false, hidden: false, fistUnderT: 0, pointT: 0, pointDir: null, pointArmed: true, pointOff: 0, layDwell: 0, ray: null, lostT: 0, dropped: false };
    g.hands.set(inp.id, h);
  }
  h.wasClosed = h.closed;
  h.wasFist = h.fist;
  h.wasUnder = h.under;
  h.wasVisible = h.visible;
  h.tracked = inp.tracked;
  if (inp.tracked) {
    if (h.lostT > 0 || fresh) {
      // tracking is back (or the hand is new): the jump is not a movement, so start the stillness window again
      h.hist.length = 0;
      h.sp = { ...inp.pos };
      h.lostT = 0;
      h.dropped = false;
    }
    h.present = true;
    h.pos = { x: inp.pos.x, y: inp.pos.y, z: inp.pos.z };
    // fist and pinch: a change must last 60 ms (tracking flicker); "under": it leaves only above underY + 3 cm (hysteresis)
    if (fresh) {
      h.fist = !!inp.fist;
      h.pinch = !!inp.pinch;
    } else {
      [h.fist, h.fistT] = debounce(h.fist, !!inp.fist, h.fistT, dt);
      [h.pinch, h.pinchT] = debounce(h.pinch, !!inp.pinch, h.pinchT, dt);
    }
    h.closed = h.fist || h.pinch;
    h.under = h.under ? h.pos.y < RULES.underY + RULES.underBackY : h.pos.y < RULES.underY;
    h.ray = inp.pointRay;
    // stillness: the hand position is smoothed (time constant 40 ms), and speed is the net movement of the smoothed point over the
    // last quarter second, so a few millimetres of jitter do not count as moving
    const k = 1 - Math.exp(-dt / 0.04);
    h.sp = { x: h.sp.x + (h.pos.x - h.sp.x) * k, y: h.sp.y + (h.pos.y - h.sp.y) * k, z: h.sp.z + (h.pos.z - h.sp.z) * k };
    h.hist.push({ t: g.clock, p: { ...h.sp } });
    while (h.hist.length > 2 && g.clock - h.hist[0].t > 0.32) h.hist.shift();
    const old = h.hist[0];
    const span = g.clock - old.t;
    h.speed = span >= 0.12 ? dist(h.sp, old.p) / span : 0;
    h.vy = span >= 0.12 ? (h.sp.y - old.p.y) / span : 0;
  } else {
    // LOST TRACKING. A real headset cannot see a hand below a desk edge, so a hand that was low or going down when it vanished is
    // under the table (hidden from him) and keeps the state it had (a fist stays a fist); when it is tracked again it carries on.
    // A hand lost higher up is held where it was (still, visible) for a while. Neither is a broken hand and neither pauses the game.
    h.lostT += dt;
    h.speed = 0;
    h.ray = null;
    if (h.lostT > GRACE_S && h.lostT <= HOLD_MAX_S && !h.dropped && (h.pos.y < 0.025 || (h.vy < -0.15 && h.pos.y < 0.12) || h.under)) {
      h.dropped = true;
      h.under = true;
      h.pos = { x: h.pos.x, y: Math.min(h.pos.y, -0.08), z: h.pos.z };
    }
    h.present = h.lostT <= HOLD_MAX_S;
    if (!h.present) {
      h.closed = false;
      h.fist = false;
      h.pinch = false;
      h.under = false;
      h.dropped = false;
    }
  }
  h.underT = h.under ? 0 : h.underT + dt;
  return h;
}

// ------------------------------------------------------------------------- step
/** @param {Game} g @param {number} dt @param {{head:HeadInput, hands:HandInput[]}} input */
export function stepGame(g, dt, input) {
  dt = Math.max(0, Math.min(dt, 0.1));
  g.clock += dt;
  g.steps++;
  g.head = input.head;
  const handList = [];
  const byId = new Map(input.hands.map((i) => [i.id, i]));
  for (const id of g.hands.keys()) if (!byId.has(id)) byId.set(id, { id, tracked: false, pos: g.hands.get(id).pos, fist: false, pointRay: null });
  for (const inp of byId.values()) handList.push(trackHand(g, inp, dt));
  g.phaseT += dt;
  const m = g.match;

  // ---------- his sight: the cone depends on what he is doing; the line is from his eye
  const pose = g.rig.pose;
  const mode = g.brain.mode;
  const half = mode === "stare" ? CONE.stare : mode === "distracted" ? CONE.spot : mode === "cheat" ? CONE.cheat : g.brain.look === "own" ? 18 : g.brain.look === "hands" ? CONE.hands : g.brain.look === "cards" ? CONE.cards : 36;
  const illegal = playerIllegal(m);
  for (const h of handList) {
    if (!h.present) {
      h.visible = false;
      h.hidden = false;
      continue;
    }
    const s = canSee(pose.sight, h.pos, half, g.table);
    h.visible = s.visible;
    h.hidden = s.blocked && h.pos.y < 0; // a hand the table hides
    h.angle = s.angle;
  }

  const playing = g.phase === "play";
  const holder = g.card.holder ? g.hands.get(g.card.holder) : null;

  if (g.started && (g.phase === "play" || g.phase === "dealing") && !g.qa.calm) {
    // ---------- events from the hands (grab, fist, dip, swap, lay, point, wrist)
    for (const h of handList) if (h.present) handEvents(g, h, dt, playing);
    if (playing) wristContact(g, handList, dt);
  }
  // the card follows its holder
  if (g.card.state === "held") {
    const hh = holder;
    if (!hh || !hh.present) {
      g.card.shown = false;
    } else {
      g.card.heldT += dt;
      g.card.shown = !hh.fist;
      g.card.fistT = hh.fist ? g.card.fistT + dt : 0;
      g.card.fistMax = Math.max(g.card.fistMax ?? 0, g.card.fistT);
      if (g.practice && g.card.fistT >= PALM_HOLD_S) g.practice.sawPalm = true;
      if (g.card.fistT >= PALM_HOLD_S) g.card.palmedOnce = true;
      if (!g.card.armed && (flat(hh.pos, SPOTS.playerLay) > 0.15 || hh.pos.y > 0.14 || hh.under)) g.card.armed = true;
    }
  }

  // the look-away that covers a swap: his glance at his own card, or the wall you pointed him at (remembered for COVER_MEMORY_S, the time a swap takes)
  if (g.brain.mode === "distracted") g._cover = { kind: "point", t: g.clock };
  else if (g.brain.mode === "watch" && g.brain.look === "own") g._cover = { kind: "look", t: g.clock };

  peekStep(g, dt);
  keepStep(g, dt, half);
  keepTeachStep(g, dt);

  // ---------- the Shark's mind
  const perc = {
    head: g.head.pos,
    hands: handList.filter((h) => h.present).map((h) => ({
      id: h.id, pos: h.pos, visible: h.visible, hidden: h.hidden, speed: h.speed,
      shownIllegal: g.card.state === "held" && g.card.holder === h.id && g.card.shown && illegal,
    })),
    guilt: illegal && (g.card.state === "held" || g.card.laidOnce || m.stash.wristR !== null && m.playerSwapped),
    roundActive: playing,
    sharkLaid: m.sharkCard !== null,
    held: g.card.state === "held",
    palmed: g.card.state === "held" && g.card.palmedOnce,
  };
  /** @type {{type:string, reason?:string, handId?:string}[]} */
  let bev = [];
  if (g.started && !g.qa.calm) bev = brainStep(g.brain, dt, perc);
  else g.brain.cmd = brainStepIdle(g, perc);
  for (const e of bev) brainEvent(g, e);
  updateTips(g, dt);

  // ---------- the rig
  g.rig.step(dt, g.brain.cmd, { playerHead: g.head.pos });

  // ---------- phases
  phases(g, dt);
  g.view = buildView(g, handList);
  return g.events;
}

/** The peek rule (see PEEK). @param {Game} g @param {number} dt */
function peekStep(g, dt) {
  if (g.peek) {
    g.peek.t += dt;
    if (g.peek.t >= PEEK.showS) g.peek = null;
  }
  const m = g.match;
  const ok = g.started && g.phase === "play" && !g.qa.calm && !g.peeked && m.sharkCard !== null && !g.sharkCardUp;
  if (!ok) {
    g.peekT = 0;
    return;
  }
  const lean = SEAT.playerZ - g.head.pos.z;
  const card = { x: SPOTS.sharkLay.x, y: 0.01, z: SPOTS.sharkLay.z };
  const looking = angleTo(g.head.pos, g.head.dir, card) <= PEEK.angleDeg;
  if (lean >= PEEK.lean && looking) g.peekT += dt;
  else g.peekT = Math.max(0, g.peekT - dt * 2);
  if (g.peekT >= PEEK.holdS) {
    g.peeked = true;
    g.peekT = 0;
    g.peek = { card: m.sharkCard, t: 0 };
    emit(g, "peek", { n: m.sharkCard });
    // his eyes are on you: he sees you looking at his card
    const s = g.rig.pose.sight;
    const eyesOnYou = angleTo(s.pos, s.dir, g.head.pos) <= PEEK.riskCone && g.brain.mode !== "distracted" && g.brain.look !== "own" && g.brain.look !== "cards";
    if (eyesOnYou) {
      notice(g.brain, PEEK.riskGain);
      emit(g, "peekSeen");
    }
  }
}

/** The intro (before Start): a calm Shark who breathes and looks at your face and hands. */
function brainStepIdle(g, perc) {
  return brainStep(g.brain, 0.0001, { ...perc, roundActive: false, guilt: false }) && g.brain.cmd;
}

// -------------------------------------------------------------------- hand rules
/** @param {Game} g @param {any} h @param {number} dt @param {boolean} playing */
function handEvents(g, h, dt, playing) {
  const m = g.match;
  const card = g.card;
  const isHolder = card.holder === h.id && card.state === "held";

  // 1 PALM IT: a closing hand next to the card grabs it
  if (playing && !isHolder && card.state !== "held" && h.closed && !h.wasClosed && m.playerCard !== null && flat(h.pos, SPOTS.playerLay) <= RULES.grabCardR && h.pos.y < 0.2) {
    const c = playerLift(m);
    if (c !== null) {
      card.state = "held";
      card.holder = h.id;
      card.armed = false;
      card.heldT = 0;
      card.shown = !h.fist;
      card.fistT = 0;
      emit(g, "grab");
      // taking the card with a closing hand puts it in your fist at once; a quick click opens the hand again within 0.2 s, a held
      // button keeps the fist (that is the palm: it counts in the practice once the fist has been closed for PALM_HOLD_S, see stepGame)
    }
  }
  // DESK KEEP, play a kept card: a closing hand at a kept card on the keep spot takes it instead of the dealt card (the same pinch as taking the dealt card)
  if (playing && !g.practice && !isHolder && card.state === "down" && h.closed && !h.wasClosed && m.kept.length > 0 && g.keep.cool === 0 && m.playerCard !== null
    && flat(h.pos, g.keep.spot) <= KEEP.pickR && h.pos.y < 0.2) {
    const c = playKept(m);
    if (c !== null) {
      g.keep.lifted = c; // still saved with the kept cards until it is laid (a page closed in between must not lose it)
      card.state = "held";
      card.holder = h.id;
      card.armed = false;
      card.heldT = 0;
      card.shown = !h.fist;
      card.fistT = 0;
      emit(g, "grab", { keep: true });
      emit(g, "keptPlay", { n: c, cards: m.kept.length });
    }
  }
  if (isHolder) {
    keepGesture(g, h, dt);
    const wasArmed = card.armed;
    // the fist closes on the card while he can see the hand: a small tell
    if (h.fist && !h.wasFist && h.visible) {
      notice(g.brain, g.tuning.gainFist * (g.brain.adapt?.fist ? WATCH_FIST_X : 1));
      emit(g, "palm");
    } else if (h.fist && !h.wasFist) {
      emit(g, "palmUnseen");
    }
    if (!h.fist && h.wasFist) {
      emit(g, "show");
      // a real palm (the fist was held, not just a click) and then the open hand: the palm lesson is done
      if (g.practice && g.practice.step === 1 && g.practice.sawPalm && card.fistT >= PALM_HOLD_S) g.practice.done = true;
    }
    // 2 UNDER THE TABLE
    if (h.under && h.fist) h.fistUnderT += dt;
    else if (!h.under && h.underT >= 0.6) { h.fistUnderT = 0; h.dipSwapped = false; h.swapMissed = false; }
    if (h.fist && !h.wasFist) h.swapMissed = false;
    if ((h.under || h.underT < 0.6) && h.wasFist && !h.fist) {
      // stage F: one swap per trip under the table (closing the hand on the new card and opening it over the ring on the way up swapped it back)
      if (h.fistUnderT >= 0.25 && m.stash.wristR !== null && !h.dipSwapped) {
        h.dipSwapped = true;
        h.swapMissed = false;
        const c = playerSwapSleeve(m);
        if (c !== null) {
          g.swaps++;
          if (!g.practice) recordSwap(g.habits, { cover: g._dip?.cover ?? null, hand: h.id, fistS: g.card.fistMax ?? 0 });
          const glance = g.coach?.script === "glance" && g.brain.look === "own";
          if (glance) {
            // the guided first match: you cheated while he looked at his own card. The round is yours: his face-down card becomes one below your sleeve card
            // (it is not seen yet), the way the first lesson paid off. Later rounds are fair.
            g.coach.done.glance = true;
            lowerSharkBelow(g, c);
          }
          emit(g, "swap", { n: c, coach: glance });
          if (g.practice && g.practice.step === 4) g.practice.done = true;
        }
      }
      // let go under the table before the fist was held long enough: nothing was swapped, and the same trip under the table can try again
      else if (h.under && !h.dipSwapped && m.stash.wristR !== null && h.fistUnderT < 0.25) h.swapMissed = true;
      h.fistUnderT = 0;
    }
    // laying it down: the hand opens over the lay spot, low (after it has left the spot once)
    const atSpot = flat(h.pos, SPOTS.playerLay) <= RULES.layR && h.pos.y <= RULES.layMaxY && !h.under;
    // a quick close and open over the spot (a click on the ring) puts a card down that you have held for a moment; a held fist is a palm
    const tapOnRing = card.fistT < PALM_HOLD_S && card.heldT >= TAP_LAY_HELD_S;
    if (h.wasClosed && !h.closed && atSpot && (wasArmed || tapOnRing)) {
      layCard(g, "lay");
    } else if (card.armed && atSpot && !h.closed && !h.wasClosed) {
      // or set it down: an open hand resting over the spot for half a second
      h.layDwell += dt;
      if (h.layDwell >= 0.5) layCard(g, "set");
    } else h.layDwell = 0;
  }
  if (h.under && !h.wasUnder) g._dip = { hand: h.id, cover: g._cover && g.clock - g._cover.t < COVER_MEMORY_S ? g._cover.kind : null };
  // a hand going under the table while he is looking at it
  if (h.under && !h.wasUnder && h.wasVisible) {
    if (g.brain.mode === "watch" || g.brain.mode === "stare" || g.brain.mode === "cheat") {
      notice(g.brain, g.tuning.gainDip);
      emit(g, "dip", { why: "seen" });
    }
  } else if (h.under && !h.wasUnder) emit(g, "dip", { why: "unseen" });

  // 3 POINT HIM AWAY
  if (h.ray) {
    h.pointOff = 0;
    const d = unit(h.ray.d);
    if (h.pointDir && Math.acos(Math.max(-1, Math.min(1, d.x * h.pointDir.x + d.y * h.pointDir.y + d.z * h.pointDir.z))) > 0.21) h.pointT = 0; // moved more than about 12 degrees: start again
    if (!h.pointDir || h.pointT === 0) h.pointDir = d;
    h.pointT += dt;
    if (h.pointArmed && h.pointT >= POINT_HOLD_S && playing) {
      h.pointArmed = false;
      pointAt(g, h, { o: h.ray.o, d });
    }
  } else {
    h.pointOff += dt;
    if (h.pointOff > 0.25) {
      h.pointArmed = true;
      h.pointT = 0;
      h.pointDir = null;
    }
  }

}

/** DESK KEEP, the verb "keep": a palmed card (the fist was held) is in the hand; the hand opens flat over the keep spot and lifts: the card stays face down on the spot.
 * A hand that rests open over the spot for KEEP.restS also keeps it (a mouse cannot lift). The spot holds KEEP.max cards; when it is full nothing happens (one event).
 * @param {Game} g @param {any} h @param {number} dt */
function keepGesture(g, h, dt) {
  if (!g.started || g.practice || g.phase !== "play") { h.keepArm = null; return; }
  const k = g.keep, m = g.match;
  if (!g.card.palmedOnce || h.closed) { h.keepArm = null; return; }
  if (!h.keepArm) {
    if (!overSpot(k.spot, h.pos)) return;
    if (m.kept.length >= KEEP.max) {
      if (!h.keepFullSaid) { h.keepFullSaid = true; emit(g, "keepFull"); }
      return;
    }
    h.keepArm = { y: h.pos.y, t: 0 };
    return;
  }
  // armed: stay over the spot sideways; the lift itself may rise above the arming height (KEEP.liftMaxY)
  if (!overSpot(k.spot, { x: h.pos.x, y: Math.min(h.pos.y, KEEP.maxY), z: h.pos.z }, KEEP.r * 1.6) || h.pos.y > KEEP.liftMaxY) { h.keepArm = null; return; }
  h.keepArm.t += dt;
  h.keepArm.y = Math.min(h.keepArm.y, h.pos.y);
  if ((h.pos.y - h.keepArm.y >= KEEP.liftY && h.keepArm.t >= 0.15) || h.keepArm.t >= KEEP.restS) {
    h.keepArm = null;
    doKeep(g);
  }
}

/** @param {Game} g */
function doKeep(g) {
  const m = g.match;
  const r = keepHeld(m);
  if (!r) return;
  g.card = { state: "down", holder: null, shown: false, armed: false, heldT: 0, fistT: 0, laidOnce: false, palmedOnce: false };
  g.keep.cool = KEEP.coolS;
  g.keep.lifted = null;
  g.keepSafe.push(r.kept); // safe for the rest of this round
  g.teach.taught = true; // the first keep ends the lesson for good
  g.teach.t = -1;
  emit(g, "keep", { n: r.kept, cards: m.kept.length });
  emit(g, "deal", { keep: true, n: r.next }); // the hand that is left: a fresh card is dealt face down on the lay spot
}

/** DESK KEEP, the lesson: the first time a palmed card is in the hand (and never after the first keep) the cue runs once for KEEP_GHOST_S seconds (the page draws the frame glow and the ghost hand from view.kept.cue).
 * @param {Game} g @param {number} dt */
function keepTeachStep(g, dt) {
  const t = g.teach;
  if (t.t >= 0) {
    t.t += dt;
    // it ends when it has played through, the round stops, or the card leaves the hand
    if (t.t >= KEEP_GHOST_S || g.phase !== "play" || g.card.state !== "held") t.t = -1;
    return;
  }
  if (g.practice || !g.started) return;
  const palmed = g.card.state === "held" && g.card.palmedOnce;
  if (keepGhostWanted({ taught: t.taught, shown: t.shown, palmed, playing: g.phase === "play", room: g.match.kept.length < KEEP.max })) {
    t.shown = true;
    t.t = 0;
  }
}

/** DESK KEEP, the risk: his view cone sweeps the desk. While kept cards lie on the spot and the cone covers it for the level's dwell time (tuning keepSeeS), he slams and takes them
 * (the same slam and falling buttons as any catch). Only in a running round. @param {Game} g @param {number} dt @param {number} half his cone's half width now */
function keepStep(g, dt, half) {
  const k = g.keep, m = g.match;
  k.cool = Math.max(0, k.cool - dt);
  const b = g.brain;
  const live = g.started && g.phase === "play" && !g.qa.calm && !g.practice && b.mode !== "slam" && b.mode !== "grabbed";
  // fair first keep: no takes in the scripted rounds of the guided first match; a card kept in this round is safe until it ends (g.keepSafe)
  const guided = !!g.coach && !g.coach.finished;
  const cards = live && !guided ? m.kept.filter((c) => !g.keepSafe.includes(c)).length : 0;
  const covered = cards > 0 && canSee(g.rig.pose.sight, { x: k.spot.x, y: KEEP.y, z: k.spot.z }, half + (g.glasses ? g.tuning.keepConeExtra ?? 0 : 0), g.table).visible;
  if (watchKeep(k, dt, { covered, cards, seeS: g.tuning.keepSeeS ?? 0.5 }) === "seen") keepCaught(g);
}

/** He saw the kept cards long enough: his hand slams the spot. The penalty (pot, fine, strike) is applied in the "caught" phase as for any catch, and the cards are taken there.
 * @param {Game} g */
function keepCaught(g) {
  const m = g.match;
  const at = { x: g.keep.spot.x, y: 0, z: g.keep.spot.z };
  const mine = m.playerHeld ?? m.playerCard;
  emit(g, "caught", { reason: "keep" });
  g.beat = { kind: "caught", result: "shark", reason: "keep", card: mine, shark: m.sharkCard, player: mine, pot: m.pot };
  slam(g.brain, at, "keep");
  g.phase = "caught";
  g.phaseT = 0;
  g._pen = { stage: 0 };
}

/** The cards to save for the keep spot: the ones on it, plus a kept card that is in the hand and not yet played (so closing the page then does not lose it).
 * @param {Game} g @returns {number[]} */
export function keptForSave(g) {
  const m = g.match;
  const l = g.keep.lifted;
  return cleanCards(l !== null && l !== undefined && (m.playerHeld === l || m.playerCard === l) ? [...m.kept, l] : m.kept);
}

/** QA and the page: put exactly these cards on the keep spot (at most KEEP.max). Cards come from the deck or the discard pile; the ones that were on the spot go back under the deck.
 * @param {Game} g @param {number[]} cards @returns {number[]} what is on the spot now */
export function setKept(g, cards) {
  const m = g.match;
  g.keepSafe = [];
  m.deck.push(...m.kept.splice(0));
  for (const c of cleanCards(cards)) {
    let found = false;
    for (const list of [m.deck, m.discard]) {
      const i = list.indexOf(c);
      if (i >= 0) { list.splice(i, 1); found = true; break; }
    }
    if (found) m.kept.push(c);
  }
  return [...m.kept];
}

/** The device is (or is no longer) the Meta VR Glasses: the keep spot moves to the one inside their view (unless the spot already is inside it), and the keep risk takes the Glasses numbers.
 * Cards on the spot stay (the spot only moves). Quest 3 and flat play never call this with `true`. @param {Game} g @param {boolean} on @returns {boolean} whether the spot moved */
export function setGlasses(g, on) {
  if (g.glasses === on) return false;
  g.glasses = on;
  g.tuning = on ? glassesTuning(tuningOf(g.level)) : tuningOf(g.level);
  if (on) {
    if (frameInGlassesView(g.keep.spot, 1)) return false; // an anchored, saved or Glasses spot that is already inside the view stays
    const c = chooseSpot({ glasses: true });
    g.keep.spot = { x: c.x, z: c.z, source: c.source };
    return true;
  }
  if (!on && g.keep.spot.source === "glasses") {
    g.keep.spot = chooseSpot();
    return true;
  }
  return false;
}

/** Move the keep spot (the anchor's pose read back, a save, the default). A spot outside the believable box is refused. @param {Game} g @param {{x:number,z:number}} spot @param {string} [source] */
export function setKeepSpot(g, spot, source = "saved") {
  if (!validSpot(spot)) return false;
  g.keep.spot = { x: spot.x, z: spot.z, source };
  return true;
}

/** The palm lesson pays off (S3, stage C): you palmed the card, you showed it, and as it goes down on the ring the card from your sleeve
 * takes its place. The card on the ring is a better one than his, so round 1 ends with a win. Only in lesson 1, only once.
 * @param {Game} g */
function palmPayoff(g) {
  const m = g.match;
  const pr = g.practice;
  if (!pr || pr.step !== 1 || !pr.done || pr.paid) return;
  pr.paid = true;
  const up = playerSwapSleeve(m);
  if (up === null) return;
  g.swaps++;
  // his card is face down and not yet seen: if it would tie or beat yours, it becomes the lowest card left (a win is the point)
  if (m.sharkCard !== null && rankOf(up) <= rankOf(m.sharkCard)) {
    let low = -1;
    for (const c of m.deck) if (rankOf(c) < rankOf(up) && (low < 0 || rankOf(c) < rankOf(low))) low = c;
    if (low >= 0) arrange(g, { shark: low });
  }
  emit(g, "swap", { n: up, payoff: true });
}

/** His face-down card becomes the lowest card left that is below `card` (if his would tie or beat it). @param {Game} g @param {number} card */
function lowerSharkBelow(g, card) {
  const m = g.match;
  if (m.sharkCard === null || rankOf(card) > rankOf(m.sharkCard)) return;
  let low = -1;
  for (const c of m.deck) if (rankOf(c) < rankOf(card) && (low < 0 || rankOf(c) < rankOf(low))) low = c;
  if (low >= 0) arrange(g, { shark: low });
}

/** @param {Game} g @param {string} why */
function layCard(g, why) {
  const m = g.match;
  palmPayoff(g);
  playerReturn(m); // the held card goes back on the lay spot (face down)
  g.card.state = "laid";
  g.card.holder = null;
  g.card.shown = false;
  g.card.laidOnce = true;
  g.keep.lifted = null; // a kept card that was played is spent
  emit(g, "lay", { why });
}

/** @param {Game} g @param {any} h @param {{o:V3,d:V3}} ray */
function pointAt(g, h, ray) {
  const b = g.brain;
  if (b.mode === "cheat" || b.mode === "slam" || b.mode === "grabbed") {
    emit(g, "pointBusy");
    return;
  }
  if (g.pointsLeft <= 0) {
    notice(b, g.tuning.gainNothing * 0.5);
    emit(g, "pointEmpty");
    return;
  }
  const pose = g.rig.pose;
  const r = resolvePoint(ray, { surfaces: g.surfaces, shark: { head: pose.head.pos, eyeRel: g.eyeRel }, used: g.usedSpots, table: g.table, head: g.head.pos });
  if (r.valid && r.spot) {
    g.pointsLeft--;
    g.usedSpots.push(r.spot);
    distract(b, r.spot);
    emit(g, "point", { valid: "spot", n: g.pointsLeft });
  } else if (r.why === "table" && pointsAtPad(ray)) {
    // stage F: a finger on its way to the pause pad (headset) points down at the table: that is not pointing at nothing (no suspicion)
    emit(g, "pointPad");
  } else {
    notice(b, g.tuning.gainNothing);
    emit(g, "pointNothing", { why: r.why });
  }
}

/** Does the ray meet the table top within 12 cm of the pause pad? @param {{o:V3,d:V3}} ray */
function pointsAtPad(ray) {
  if (ray.d.y >= -1e-6) return false;
  const t = -ray.o.y / ray.d.y;
  if (t < 0) return false;
  const x = ray.o.x + ray.d.x * t, z = ray.o.z + ray.d.z * t;
  return Math.hypot(x - MENU.pad.x, z - MENU.pad.z) <= 0.12;
}

/** 5 GRAB HIS WRIST: his wrist (or lower forearm) in a closed hand. Checked once a frame over all hands (any hand counts).
 * @param {Game} g @param {any[]} handList @param {number} dt */
function wristContact(g, handList, dt) {
  const b = g.brain;
  const pose = g.rig.pose;
  const cheatingUnder = b.mode === "cheat" && b.cheat?.phase === "under";
  const lim = RULES.grabWristR;
  let contact = null;
  for (const h of handList) {
    if (!h.tracked || !h.closed) continue;
    for (const [i, hd] of [pose.handR, pose.handL].entries()) {
      const sh = i === 0 ? pose.shoulders.r : pose.shoulders.l;
      // the lower forearm: from the wrist a third of the way back toward the shoulder
      const back = { x: hd.wrist.x + (sh.x - hd.wrist.x) * 0.3, y: hd.wrist.y + (sh.y - hd.wrist.y) * 0.3, z: hd.wrist.z + (sh.z - hd.wrist.z) * 0.3 };
      if (segmentDistance(h.pos, hd.wrist, back) <= lim) contact = { h, right: i === 0 };
    }
  }
  if (contact && cheatingUnder && contact.right) {
    g.grabT += dt;
    g.falseT = 0;
    if (g.grabT >= RULES.grabWristS) catchHim(g, contact.h);
  } else if (contact && !cheatingUnder && b.mode !== "slam" && b.mode !== "grabbed") {
    g.falseT += dt;
    g.grabT = Math.max(0, g.grabT - dt * 2);
    if (g.falseT >= RULES.grabWristS) {
      g.falseT = 0;
      notice(b, 0.5);
      emit(g, "falseGrab");
    }
  } else {
    g.grabT = Math.max(0, g.grabT - dt * 2);
    g.falseT = Math.max(0, g.falseT - dt * 2);
  }
}

/** You hold his wrist long enough while his hand is under the table. @param {Game} g @param {any} h */
function catchHim(g, h) {
  const m = g.match;
  g.evidence = m.hatCard;
  const pot = m.pot;
  const pen = catchShark(m);
  if (!pen) return;
  g.beat = { kind: "gotcha", result: "player", card: g.evidence, shark: m.sharkCard, player: m.playerCard, pot };
  grabbed(g.brain, h.id, { x: h.pos.x, y: Math.max(0.0, h.pos.y), z: h.pos.z });
  g.phase = "gotcha";
  g.phaseT = 0;
  g._pen = { stage: 0 };
  if (g.practice && g.practice.step === 3) g.practice.done = true;
  emit(g, "gotcha", { n: m.strikes.shark });
}

// ------------------------------------------------------------------ brain events
/** @param {Game} g @param {{type:string, reason?:string, handId?:string}} e */
function brainEvent(g, e) {
  const m = g.match;
  switch (e.type) {
    case "cheatUnder":
      armHat(m); // the card he goes for
      if (g.coach?.script === "cuff") g.coach.done.cuff = true; // you have seen his cuff glow (caught or not, the situation came)
      emit(g, "cheatUnder", { n: m.hatCard });
      break;
    case "stareEnd":
      emit(g, "stareEnd");
      if (g.practice && g.practice.step === 2) {
        g.practice.done = true;
        brainReact(g.brain, "tie"); // the payoff of holding still: he shrugs and backs off (the page adds "You held still")
      }
      break;
    case "cheatDone":
      if (m.phase === "lay" && m.sharkCard !== null && m.hatCard !== null) {
        sharkSwap(m);
        emit(g, "sharkSwapped");
      }
      emit(g, "cheatDone");
      // lesson 3 goes on until you have caught him: he tries again a moment later
      if (g.practice && g.practice.step === 3 && !g.practice.done) g.brain.plan = { at: g.brain.roundT + 1.6, window: REPEAT_CHEAT_WINDOW_S };
      break;
    case "caught": {
      if (g.phase !== "play") break;
      const h = (e.handId && g.hands.get(e.handId)) || [...g.hands.values()].find((x) => x.present) || null;
      const at = h ? { x: h.pos.x, y: Math.max(0.0, h.pos.y), z: Math.min(h.pos.z, g.table.zNear - 0.03) } : { x: SPOTS.playerLay.x, y: 0, z: SPOTS.playerLay.z };
      // a hand under the table is slammed on the table top above it
      if (h && h.pos.y < 0) at.y = 0;
      emit(g, "caught", { reason: e.reason });
      g.beat = { kind: "caught", result: "shark", reason: e.reason ?? "moved", card: m.playerHeld ?? m.playerCard, shark: m.sharkCard, player: m.playerHeld ?? m.playerCard, pot: m.pot };
      slam(g.brain, at, e.reason ?? "moved");
      g.phase = "caught";
      g.phaseT = 0;
      g._pen = { stage: 0 };
      break;
    }
    case "adaptTiming": case "adaptHand": case "adaptFist": {
      const key = e.type === "adaptTiming" ? "cover" : e.type === "adaptHand" ? "hand" : "fist";
      g.habits.caught[key] = (g.habits.caught[key] ?? 0) + 1;
      emit(g, e.type, { reason: e.reason });
      break;
    }
    default:
      emit(g, e.type);
  }
}

// --------------------------------------------------------------------- phases
/** After a practice round: the next verb, or the same one again if the round ended with it open (only a catch does that; at most two
 * repeats), or the real match. @param {Game} g */
function advancePractice(g) {
  const pr = g.practice;
  if (!pr) return false;
  if (!pr.done && pr.tries < 2) {
    pr.tries++;
    emit(g, "practiceAgain", { n: pr.step });
    return true;
  }
  pr.tries = 0;
  pr.step++;
  if (pr.step > 4) {
    pr.finished = true;
    emit(g, "practiceDone");
    return false;
  }
  emit(g, "practiceStep", { n: pr.step });
  return true;
}

/** @param {Game} g @param {number} dt */
function phases(g, dt) {
  const m = g.match;
  const pr = g.practice;
  // practice rounds run faster between the lessons (dealing, showdown, clearing the table)
  const sp = pr ? 2.6 : 1;
  const t = g.phaseT * sp;
  if (g.phase === "dealing") {
    const d = g._dealt;
    if (!d.sleeve && t > 0.2) {
      d.sleeve = true;
      const c = armSleeve(m);
      if (c !== null) emit(g, "sleeve", { n: c });
    }
    if (!d.shark && t > 0.5) {
      d.shark = true;
      const c = sharkLay(m);
      if (c !== null) emit(g, "sharkLay");
    }
    if (!d.player && t > 0.9) {
      d.player = true;
      const c = dealPlayer(m);
      if (c !== null) emit(g, "deal");
    }
    if (t > 1.5 && d.player) {
      g.phase = "play";
      g.phaseT = 0;
    }
  } else if (g.phase === "play") {
    const b = g.brain;
    // a lesson round never times out: its step ends it (the timer pauses in lessons)
    const timeout = !pr && b.roundT >= g.tuning.roundTimeoutS && !g.qa.calm;
    const calmEnough = b.mode !== "cheat" && b.mode !== "slam" && b.mode !== "grabbed" && b.mode !== "stare" && b.mode !== "distracted";
    let ready = g.card.state === "laid" && m.sharkCard !== null && !b.plan && calmEnough && !g.qa.calm;
    if (pr) {
      if (pr.step === 1 || pr.step === 4) ready = ready && pr.done; // palm it, then lay the card; swap under the table, then lay the card
      else if (pr.step === 2) ready = pr.done && m.sharkCard !== null && calmEnough; // the stare lesson ends when the stare ends
      else ready = false; // step 3 ends with the catch (phase "gotcha"); until then he cheats again
    }
    if (ready || timeout) {
      if (g.card.state === "held") layCard(g, "timeout");
      else if (g.card.state === "down" && m.playerCard !== null) g.card.state = "laid";
      g.phase = "showdown";
      g.phaseT = 0;
      // lesson 1 holds the cards face down after the swap; lesson 2 holds them after the stare so "You held still" and his shrug can be seen first
      g._sd = { stage: 0, hold: pr && pr.step === 1 && pr.paid ? PAYOFF_HOLD_S : pr && pr.step === 2 ? STILL_HOLD_S : 0 };
      b.plan = null;
    }
  } else if (g.phase === "showdown") {
    // the result beat: his card and yours turn over, the pot goes to the winner, he reacts (the page adds one line in flat play)
    const s = g._sd;
    if (s.stage === 0 && g.phaseT > SHOW_AT_S + (s.hold ?? 0)) {
      s.stage = 1;
      const swapped = m.playerSwapped;
      const out = resolveRound(m);
      g.sharkCardUp = true;
      if (out) {
        g.lastFinal = { ...out };
        g.beat = { kind: out.result === "tie" ? "tie" : "cards", result: out.result, player: m.playerCard, shark: m.sharkCard, pot: out.pot, swapped };
        brainReact(g.brain, out.result === "player" ? "lose" : out.result === "shark" ? "win" : "tie");
        emit(g, "result", { result: out.result, player: m.playerCard, shark: m.sharkCard, pot: out.pot, swapped, cheated: out.cheated });
      }
    }
    if (s.stage === 1 && g.phaseT > SHOW_AT_S + (s.hold ?? 0) + BEAT_S) {
      g.phase = "between";
      g.phaseT = 0;
      g._bt = { done: false };
    }
  } else if (g.phase === "caught") {
    const pen = g._pen;
    if (pen.stage === 0 && g.phaseT >= 0.28) {
      pen.stage = 1;
      const p = caughtPlayer(m);
      g.sharkCardUp = m.sharkCard !== null;
      if (p && g.beat?.reason === "keep") {
        const taken = seizeKept(m); // he takes the cards on the keep spot
        g.keep.meter = 0;
        emit(g, "keptTaken", { n: taken.length });
      }
      if (p) emit(g, "slamHit", { n: m.strikes.player });
    }
    if (g.phaseT > (pr ? 3.3 : 4.0)) {
      g.phase = "between";
      g.phaseT = 0;
      g._bt = { done: false };
    }
  } else if (g.phase === "gotcha") {
    const pen = g._pen;
    if (pen.stage === 0 && g.phaseT >= 0.5) {
      pen.stage = 1;
      emit(g, "cardFalls", { n: g.evidence });
    }
    if (g.phaseT > (pr ? 3.3 : 4.0)) {
      g.phase = "between";
      g.phaseT = 0;
      g._bt = { done: false };
    }
  } else if (g.phase === "between") {
    if (t > 0.9 && !g._bt.done) {
      g._bt.done = true;
      g.evidence = null;
      const next = finishRound(m);
      emit(g, "roundEnd", { n: m.round });
      const again = pr ? advancePractice(g) : true;
      if (pr && pr.finished) {
        g.practice = null;
        newMatch(g);
      } else if (next === "over" && !pr) {
        g.phase = "over";
        g.phaseT = 0;
        emit(g, "matchOver", { n: m.winner });
      } else if (next === "over" && pr) {
        // practice never ends the match: start the real one
        g.practice = null;
        newMatch(g);
      } else if (again) beginRound(g);
    }
  } else if (g.phase === "over") {
    // the runtime decides when a new match begins (newMatch)
  }
}

// ------------------------------------------------------------------------ view
/** @param {Game} g @param {any[]} handList */
function buildView(g, handList) {
  const m = g.match;
  const b = g.brain;
  const holder = g.card.holder ? g.hands.get(g.card.holder) : null;
  const { prompt, cue } = guideFor(g);
  const visibleMovers = handList.filter((h) => h.present && h.visible).reduce((a, h) => Math.max(a, h.speed), 0);
  return {
    phase: g.phase,
    round: m.round, rounds: ROUNDS,
    pot: m.pot, buttons: { ...m.buttons }, floor: m.floor,
    strikes: { ...m.strikes },
    pointsLeft: g.pointsLeft,
    deck: m.deck.length,
    pose: g.rig.pose,
    mode: b.mode, stare: b.mode === "stare", look: b.look,
    suspicion: b.suspicion, alert: b.alert,
    tremor: b.mode === "stare" ? Math.min(2, visibleMovers / g.tuning.stareSpeed) : 0,
    card: {
      state: g.card.state,
      face: m.playerHeld ?? m.playerCard,
      held: g.card.state === "held",
      shown: g.card.shown,
      holderId: g.card.holder,
      holderPos: holder?.pos ?? null,
      illegal: playerIllegal(m),
    },
    sharkCard: { present: m.sharkCard !== null, up: g.sharkCardUp, face: m.sharkCard },
    sleeve: { card: m.stash.wristR },
    kept: { cards: [...m.kept], spot: { x: g.keep.spot.x, z: g.keep.spot.z }, meter: g.keep.meter, source: g.keep.spot.source ?? "default", glasses: g.glasses, cue: g.teach.t >= 0 ? g.teach.t : null },
    evidence: g.evidence,
    winner: m.winner,
    result: g.lastFinal?.result ?? null,
    cheat: b.cheat ? { ...b.cheat } : null,
    coach: g.coach ? { tips: g.coach.tips, script: g.coach.script, done: { ...g.coach.done }, tip: g.coach.tip } : null,
    practice: g.practice ? { step: g.practice.step, name: LESSONS[g.practice.step] ?? "", tries: g.practice.tries, done: g.practice.done, sawPalm: g.practice.sawPalm } : null,
    beat: g.beat,
    peek: g.peek ? { card: g.peek.card, t: g.peek.t } : null,
    tips: { point: g.tips.point },
    prompt, cue,
    grabT: g.grabT,
    hands: handList.map((h) => ({ id: h.id, tracked: h.tracked, present: h.present, dropped: h.dropped, pos: h.pos, fist: h.fist, closed: h.closed, under: h.under, visible: h.visible, hidden: h.hidden, speed: h.speed })),
  };
}

/** The swap line for what the hand under the table is doing now: open (hold, then let go), closed (let go now), or let go too soon (try again). @param {string} base @param {any} hand */
function swapPrompt(base, hand) {
  if (hand.swapMissed && !hand.fist) return `${base}-retry`;
  return hand.fist ? `${base}-go` : base;
}

/** What to tell the player now (an id the page turns into plain words; the headset shows only the cue ring) and where a ring glows.
 * The four practice rounds guide step by step: each line appears only when the step before it is done (what is done is read from the
 * state of the game, never from a clock). Later rounds are on their own, except for one tip about pointing him away.
 * @param {Game} g @returns {{prompt:string|null, cue:{kind:string, pos:V3}|null}} */
function guideFor(g) {
  const pr = g.practice;
  const b = g.brain;
  if (g.phase !== "play") return { prompt: null, cue: null };
  if (!pr && g.coach) return coachTip(g);
  if (!pr) return g.tips.point === "showing" ? { prompt: "tip-point", cue: null } : { prompt: null, cue: null };
  const held = g.card.state === "held";
  const hand = held && g.card.holder ? g.hands.get(g.card.holder) : null;
  const cardCue = { kind: "card", pos: { x: SPOTS.playerLay.x, y: 0.02, z: SPOTS.playerLay.z } };
  const handCue = hand ? { kind: "hand", pos: { x: hand.pos.x, y: 0.0, z: hand.pos.z } } : null;
  const underCue = { kind: "under", pos: { x: 0, y: 0.0, z: g.table.zNear - 0.04 } };
  const wrist = g.rig.pose.handR.wrist;
  switch (pr.step) {
    case 1:
      // 1 pick the card up, 2 close the hand (it hides), 3 open it (it shows), 4 put it down on the ring
      if (!held) return pr.done ? { prompt: null, cue: null } : { prompt: "p1-grab", cue: cardCue };
      if (!pr.sawPalm) return { prompt: b.look === "hands" ? "p1-fist-now" : "p1-fist", cue: handCue };
      if (!pr.done) return { prompt: "p1-open", cue: handCue };
      return { prompt: "p1-lay", cue: cardCue }; // click the ring (or carry the card away and back)
    case 2:
      if (b.mode === "stare") return { prompt: "p2-still", cue: null };
      return { prompt: pr.done ? null : "p2-wait", cue: null };
    case 3:
      if (pr.done) return { prompt: null, cue: null };
      if (b.mode === "cheat" && b.cheat?.phase !== "return") return { prompt: "p3-grab", cue: { kind: "wrist", pos: { x: wrist.x, y: wrist.y, z: wrist.z } } };
      // stage D: before he cheats his cuff glows softly (the line says "Watch his glowing cuff": nobody has to turn left and right in the head)
      return { prompt: "p3-wait", cue: { kind: "cuff", pos: { x: wrist.x, y: wrist.y, z: wrist.z } } };
    case 4:
      // 1 pick the card up, 2 wait until he looks at his own card, 3 hand under the table, 4 close the hand and open it (the swap), 5 back up, lay it
      if (!held) return pr.done ? { prompt: null, cue: null } : { prompt: "p4-take", cue: cardCue };
      if (pr.done) return { prompt: "p4-lay", cue: cardCue };
      if (hand && hand.under) return { prompt: swapPrompt("p4-swap", hand), cue: underCue };
      return b.look === "own" ? { prompt: "p4-under", cue: underCue } : { prompt: "p4-wait", cue: null };
    default:
      return { prompt: null, cue: null };
  }
}

/** Stage F: the tip of the guided first match for this moment (first time each situation happens, never again), and where a ring glows. A tip shows while its
 * situation lasts; once the situation is over it is marked seen. With the tips off, no words and no rings (the scripted rounds still play).
 * @param {Game} g @returns {{prompt:string|null, cue:{kind:string, pos:V3}|null}} */
function coachTip(g) {
  const c = /** @type {NonNullable<Game["coach"]>} */ (g.coach);
  const b = g.brain;
  const m = g.match;
  const held = g.card.state === "held";
  const hand = held && g.card.holder ? g.hands.get(g.card.holder) : null;
  const swapped = m.playerSwapped;
  const wrist = g.rig.pose.handR.wrist;
  const cardCue = { kind: "card", pos: { x: SPOTS.playerLay.x, y: 0.02, z: SPOTS.playerLay.z } };
  const underCue = { kind: "under", pos: { x: 0, y: 0.0, z: g.table.zNear - 0.04 } };
  // stage F: a nudge: the card has lain untouched for 9 s of a round (a slow first-timer who missed his cuff sat through a silent round until it timed out)
  const idleTake = !held && g.card.state === "down" && m.playerCard !== null && !g.card.laidOnce && b.roundT > 9 && b.mode === "watch";
  /** @type {[string, boolean, any][]} the situations in story order: [id, happening now, ring] */
  const now = [
    ["c-cuff", b.mode === "cheat" && b.cheat?.phase !== "return", { kind: "wrist", pos: { x: wrist.x, y: wrist.y, z: wrist.z } }],
    ["c-stare", b.mode === "stare", null],
    ["c-take", !held && g.card.state === "down" && m.playerCard !== null && !g.card.laidOnce, cardCue],
    ["c-hide", held && swapped, cardCue],
    ["c-swap-retry", held && !swapped && !!hand?.under && !!hand.swapMissed && !hand.fist && c.script === "glance", underCue],
    ["c-swap-go", held && !swapped && !!hand?.under && !!hand.fist && c.script === "glance" && b.look === "own", underCue],
    ["c-swap", held && !swapped && !!hand?.under && !hand.fist && !hand.swapMissed && c.script === "glance" && b.look === "own", underCue],
    ["c-under", held && !swapped && !hand?.under && c.script === "glance" && b.mode === "watch" && b.look === "own", underCue],
    // hide it: close your hand on the card (the first thing to do with a card in your hand; the stare and the glance come after)
    ["c-fist", held && !swapped && g.card.fistT < PALM_HOLD_S && !(c.script === "glance" && b.look === "own"), hand ? { kind: "hand", pos: { x: hand.pos.x, y: 0.0, z: hand.pos.z } } : null],
    ["tip-point", g.tips.point === "showing", null],
  ];
  // a tip that was showing and whose situation is over is seen
  if (c.tip && !now.some(([id, on]) => id === c.tip && on)) {
    c.seen[c.tip] = true;
    c.tip = null;
  }
  for (const [id, on, cue] of now) {
    if (!on || (c.seen[id] && !(id === "c-take" && idleTake) && id !== "c-swap-retry")) continue;
    // the swap tips belong together: once you went under, "go under" is seen; once you swapped, "swap" is seen
    if (c.tip !== id) {
      c.tip = id;
      c.tipT = 0;
    }
    if (!c.tips) return { prompt: null, cue: null };
    return { prompt: id, cue };
  }
  return { prompt: null, cue: null };
}

/** The one-time tip about pointing him away: shown in the real match the first time he is staring at you or watching your hands while
 * you hold a card (that is when pointing helps), for at most 7 seconds, and never again (the page keeps `seen`). @param {Game} g @param {number} dt */
function updateTips(g, dt) {
  const t = g.tips;
  if (t.point === "seen") return;
  const b = g.brain;
  if (t.point === "new") {
    // stage F: in the guided first match the tip waits until the scripted rounds are behind you (his first stare has its own tip)
    if (!g.practice && coachDone(g) && g.phase === "play" && g.pointsLeft > 0 && (b.mode === "stare" || (b.look === "hands" && g.card.state === "held"))) {
      t.point = "showing";
      t.pointT = 0;
    }
  } else if (t.point === "showing") {
    t.pointT += dt;
    if (t.pointT > 7 || g.phase !== "play" || g.pointsLeft < 3) {
      t.point = "seen";
    }
  }
}

/** QA and tests: make the Shark cheat on the next frame. @param {Game} g */
export function forceCheat(g) {
  g.brain.plan = { at: 0 };
}

/** QA and tests: set cards. { player?, shark?, sleeve? } Moves cards between the deck and their places. @param {Game} g @param {{player?:number, shark?:number, sleeve?:number, hat?:number}} o */
export function arrange(g, o) {
  const m = g.match;
  const take = (c) => {
    for (const list of [m.deck, m.discard]) {
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
    }
  };
  if (o.player !== undefined && m.playerCard !== null && m.playerCard !== o.player) {
    take(o.player);
    m.deck.push(m.playerCard);
    m.playerCard = o.player;
    m.dealtCard = o.player;
  }
  if (o.shark !== undefined && m.sharkCard !== null && m.sharkCard !== o.shark) {
    take(o.shark);
    m.deck.push(m.sharkCard);
    m.sharkCard = o.shark;
  }
  if (o.sleeve !== undefined && m.stash.wristR !== null && m.stash.wristR !== o.sleeve) {
    take(o.sleeve);
    m.deck.push(m.stash.wristR);
    m.stash.wristR = o.sleeve;
  }
  if (o.hat !== undefined) {
    // the card the Shark will go for: put it on top of the deck so the next armHat finds it as the highest
    take(o.hat);
    m.deck.unshift(o.hat);
  }
}

export { nextFloat };
