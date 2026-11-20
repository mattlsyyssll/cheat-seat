/** The Shark's mind (pure): where he looks, when he gets suspicious, when he stares, when he cheats, when he catches you.
 * It reads only what he could see (the duel passes visible hands, with the line-of-sight checks already done in sight.js)
 * and answers with a rig command plus events. No graphics, no input device.
 *
 * Modes: watch (eyes cycle over your face, your hands, the cards, his own card), distracted (turned toward a spot you pointed at),
 * stare (leaning into your face, breathing hard; a visible hand that moves, or a card he can see that is not the card he dealt,
 * gives you away), cheat (tell, hand under the table, hand back), grabbed (you hold his wrist), slam (his hand lands on yours),
 * recover. */
import { nextFloat, nextRange } from "./rng.js";
import { idleCommand } from "../actor/rig.js";
import { BODY, SPOTS, TABLE, SEAT } from "./booth.js";
import { GLANCE_CUT_S, POINT_CUT_S, TELL_LEAD_S, BACK_JUMP, BACK_CHECK_S, WATCH_HIDDEN_X } from "./habits.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/**
 * What the duel tells him each frame.
 * @typedef {Object} Perception
 * @property {V3} head the player's head
 * @property {{id:string, pos:V3, visible:boolean, hidden:boolean, speed:number, shownIllegal:boolean}[]} hands tracked hands; visible = inside his view and not blocked
 * @property {boolean} guilt the player holds or has laid a card that is not the one he dealt
 * @property {boolean} roundActive a round is being played (his card may be laid, the showdown has not begun)
 * @property {boolean} sharkLaid his card is on the table
 * @property {boolean} [held] the player holds his card in a hand (the practice rounds wait for this)
 * @property {boolean} [palmed] the card in the hand has been hidden in the fist this round (the guided first match's stare waits for it)
 */

const W = { face: 0.4, hands: 0.25, cards: 0.15, own: 0.2 };
/** His weights while he watches one of your hands: more looks at your hands, fewer at your face. */
const WA = { face: 0.25, hands: 0.4, cards: 0.15, own: 0.2 };
/** The stare's "you moved" meter fills at STARE_GAIN per second times how many times over the speed limit the hand moves (at most STARE_CAP times).
 * Stage C (bench B3): a quick 3 cm move must be caught within 0.5 s while 4 mm noise and 20 mm spikes are not. */
export const STARE_GAIN = 5;
export const STARE_CAP = 3;
/** Stage D (judge fix 7 and 8): his suspicion reacts to what your hands and your head do, not only to a script.
 * FIDGET: a visible hand that moves faster than FIDGET_SPEED (m/s, smoothed over a third of a second) raises it by FIDGET_GAIN per second for every m/s over
 * the line (the speed counts up to FIDGET_CAP), most when his eyes are on your hands. A nervous player who keeps moving gets stared at within about
 * 10 to 20 seconds, then any move in the stare is caught. Not in the practice rounds (they are scripted).
 * LEAN: your head forward of the seat by more than LEAN_FREE metres (you lean over the table) raises it by LEAN_GAIN per second for every metre over. */
export const FIDGET_SPEED = 0.14;
export const FIDGET_CAP = 1.2;
export const FIDGET_GAIN = 0.55;
export const LEAN_FREE = 0.08;
export const LEAN_GAIN = 2.0;
/** Seconds the glare and the laugh last. */
export const GLARE_S = 1.6;
export const LAUGH_S = 0.8;

/** @param {import("./rng.js").Rng} rng @param {import("./tuning.js").Tuning} tuning */
export function createBrain(rng, tuning) {
  return {
    rng, tuning,
    mode: "watch", t: 0,
    suspicion: 0, alert: 0,
    look: "face", lookT: 0, lookDwell: 1.6,
    spot: /** @type {V3|null} */ (null), distractS: 0,
    cheat: /** @type {{phase:string,t:number,window:number}|null} */ (null),
    plan: /** @type {{at:number, window?:number}|null} */ (null),
    /** The practice rounds and the guided first match script him: { stare?:{at,dur,whenHeld?}, look?:{kind,at,dur,whenHeld?,afterStare?}, cheat?:{at,window}, noRandom?:true,
     * soft?:number } (seconds from the round start, or from the moment you took your card when `whenHeld`). `soft` (stage F, the guided first match): his "caught" meter
     * fills this many times as fast as usual (0.45: a small twitch in his first stare is forgiven, a real move is not). */
    script: /** @type {any} */ (null),
    holdStare: 0,
    roundT: 0, heldT: 0,
    /** His face after the result of a round: { kind: "win"|"lose"|"tie", t } (a smug one, an angry one, a shrug). */
    react: /** @type {{kind:string, t:number}|null} */ (null),
    /** His glare (suspicion first goes over 0.3): { t } for GLARE_S seconds; a cool-down keeps it from repeating. His laugh: { t } for LAUGH_S. */
    glare: /** @type {{t:number}|null} */ (null), glareCool: 0, prevSusp: 0,
    laugh: /** @type {{t:number}|null} */ (null), laughed: false, afterSlam: false,
    stareT: 0, stares: 0,
    /** The Shark learns your tell (habits.js): what he has learned for this round, the watched look-away now ({kind, t, told}). */
    adapt: /** @type {{cover:"look"|"point"|null, hand:"left"|"right"|null, fist:boolean}|null} */ (null),
    prevLook: "face", prevMode: "watch", watch: /** @type {{kind:string, t:number, told:boolean}|null} */ (null), announced: false, announcedCover: false, backCheck: 0, backHit: false,
    target: /** @type {V3|null} */ (null), slamHand: "R", slamT: 0, grabHand: /** @type {string|null} */ (null),
    cmd: idleCommand(),
    reason: /** @type {string|null} */ (null),
    flick: { t: 0, id: /** @type {string|null} */ (null) },
    log: /** @type {string[]} */ ([]),
  };
}

/** @typedef {ReturnType<typeof createBrain>} Brain */

/** A new round: calm down a little, plan whether he cheats and when. @param {Brain} b */
export function brainNewRound(b, script = null, adapt = null) {
  b.roundT = 0;
  b.adapt = adapt;
  b.prevLook = "face";
  b.watch = null;
  b.announced = false;
  b.announcedCover = false;
  b.backCheck = 0;
  b.backHit = false;
  b.prevMode = b.mode;
  b.heldT = 0;
  b.react = null;
  b.glare = null;
  b.laugh = null;
  b.laughed = false;
  b.afterSlam = false;
  b.suspicion = Math.min(b.suspicion, 0.15);
  b.alert = 0;
  b.cheat = null;
  b.holdStare = 0;
  b.script = script ? JSON.parse(JSON.stringify(script)) : null;
  if (script?.cheat) b.plan = { at: script.cheat.at, window: script.cheat.window };
  else if (script?.noRandom) b.plan = null;
  else b.plan = nextFloat(b.rng) < b.tuning.cheatChance ? { at: nextRange(b.rng, b.tuning.cheatFrom, b.tuning.cheatTo) } : null;
  if (b.mode === "recover" || b.mode === "stare" || b.mode === "distracted") b.mode = "watch";
}

/** The round is settled: he shows what he thinks of it for about 2.7 s (the result beat). @param {Brain} b @param {"win"|"lose"|"tie"} kind */
export function brainReact(b, kind) {
  b.react = { kind, t: 0 };
}

/** Raise suspicion from a named source. @param {Brain} b @param {number} amount */
export function notice(b, amount) {
  b.suspicion = Math.max(0, Math.min(1, b.suspicion + amount));
}

/** The player pointed at a valid spot: he turns to look for about `distractS`. Not during a cheat's hand-under phase (he stays put).
 * @param {Brain} b @param {V3} spot */
export function distract(b, spot) {
  if (b.mode === "slam" || b.mode === "grabbed") return false;
  b.mode = "distracted";
  b.t = 0;
  b.spot = spot;
  b.distractS = b.tuning.distractS;
  return true;
}

/** The player holds his wrist long enough. @param {Brain} b @param {string} handId @param {V3} at */
export function grabbed(b, handId, at) {
  b.mode = "grabbed";
  b.t = 0;
  b.cheat = null;
  b.afterSlam = false;
  b.grabHand = handId;
  b.target = at;
}

/** The slam: his hand lands on `at`. @param {Brain} b @param {V3} at @param {string} reason */
export function slam(b, at, reason) {
  b.mode = "slam";
  b.t = 0;
  b.afterSlam = true;
  b.laughed = false;
  b.target = at;
  b.reason = reason;
  b.cheat = null;
  b.slamHand = at.x < 0 ? "R" : "L";
}

/** @param {Brain} b @param {number} dt @param {Perception} p @returns {{type:string, reason?:string, handId?:string}[]} */
export function brainStep(b, dt, p) {
  /** @type {{type:string, reason?:string, handId?:string}[]} */
  const events = [];
  const T = b.tuning;
  b.t += dt;
  if (p.roundActive) b.roundT += dt;
  if (p.held) b.heldT += dt;
  else if (b.script?.look?.whenHeld) b.heldT = 0;
  if (b.react) {
    b.react.t += dt;
    if (b.react.t > 3.2 || b.mode === "slam" || b.mode === "grabbed" || b.mode === "stare") b.react = null;
  }
  // his glare (he just got suspicious) and his laugh (he won the round, or slammed your hand)
  if (b.glareCool > 0) b.glareCool -= dt;
  if (b.glare) {
    b.glare.t += dt;
    if (b.glare.t > GLARE_S || b.mode !== "watch") b.glare = null;
  }
  if (!b.script?.noRandom && b.mode === "watch" && p.roundActive && !b.glare && b.glareCool <= 0 && b.prevSusp < 0.3 && b.suspicion >= 0.3 && b.suspicion < 0.6) {
    b.glare = { t: 0 };
    b.glareCool = 7;
    b.look = "face"; // he looks at your face on purpose: his sight follows
    b.lookT = 0;
    b.lookDwell = Math.max(b.lookDwell, GLARE_S + 0.3);
    events.push({ type: "glare" });
  }
  b.prevSusp = b.suspicion;
  if (b.laugh) {
    b.laugh.t += dt;
    if (b.laugh.t > LAUGH_S) b.laugh = null;
  }
  if (!b.laughed && ((b.react?.kind === "win" && b.react.t >= 0.35) || (b.mode === "recover" && b.afterSlam && b.t >= 0.3))) {
    b.laughed = true;
    b.laugh = { t: 0 };
    events.push({ type: "laugh" });
  }
  const hands = p.hands.filter((h) => h.pos);
  const visible = hands.filter((h) => h.visible);
  const nearest = (list) => list.reduce((best, h) => (!best || h.pos.z < best.pos.z ? h : best), null);

  // ---- slow things: guilt, hidden hands, the caught meter
  if (b.mode === "watch" || b.mode === "stare" || b.mode === "cheat") {
    if (p.guilt && p.roundActive) notice(b, T.guildRate * dt * (b.script?.soft ?? 1));
    const anyHidden = hands.some((h) => h.hidden);
    const watchedHand = b.adapt?.hand ?? null;
    const watchedHidden = !!watchedHand && hands.some((h) => h.hidden && h.id === watchedHand);
    // stage F: a hand that goes out of sight while he is looking down at his own card is not noticed (he is not looking: that is the moment to cheat). In the
    // guided first match the cheat during his glance left him so suspicious that he stared right after you laid the card, and the hand going back was slammed.
    const looksAway = b.mode === "watch" && b.look === "own";
    // he watches the hand you always cheat with: a look-away does not cover it, and a hidden one counts twice as much
    if ((looksAway ? watchedHidden : anyHidden) && p.roundActive) notice(b, (b.mode === "stare" ? 0.16 : T.hiddenRate) * dt * (watchedHidden ? WATCH_HIDDEN_X : 1));
    // a card he can see that is not the card he dealt
    const seen = hands.find((h) => h.visible && h.shownIllegal);
    if (seen) {
      b.alert += (dt / T.seeS) * (b.script?.soft ?? 1);
      b.reason = "seen";
      b.culprit = seen.id;
    }
    // stage D: fidgeting and leaning in raise his suspicion in an ordinary round (the practice rounds are scripted and skip this)
    let restless = false;
    if (b.mode === "watch" && p.roundActive && !b.script?.noRandom) {
      const eyesOn = b.look === "hands" || b.look === "cards" ? 1 : b.look === "face" ? 0.6 : 0.3;
      for (const h of hands) {
        if (h.hidden) continue; // a hand under the table cannot be seen to move
        const over = Math.min(FIDGET_CAP, h.speed) - FIDGET_SPEED;
        // inside his view he sees every move; at the edge of it (his eyes on your face, your hands low) he still sees movement, about half as well
        if (over > 0) {
          notice(b, FIDGET_GAIN * over * eyesOn * (h.visible ? 1 : 0.5) * dt);
          restless = true;
        }
      }
      const leanIn = SEAT.playerZ - p.head.z;
      if (leanIn > LEAN_FREE) {
        notice(b, LEAN_GAIN * (leanIn - LEAN_FREE) * dt);
        restless = true;
      }
    }
    if (b.mode === "stare") {
      const thr = T.stareSpeed;
      const movers = visible.filter((h) => h.speed > thr);
      if (movers.length) {
        const m = movers.reduce((a, h) => (h.speed > a.speed ? h : a));
        b.alert += dt * STARE_GAIN * Math.min(STARE_CAP, m.speed / thr) * (b.script?.soft ?? 1);
        b.reason = "moved";
        b.culprit = m.id;
      } else if (!seen) b.alert = Math.max(0, b.alert - dt * 0.9);
      // holding still lowers suspicion
      if (!movers.length && !anyHidden) b.suspicion = Math.max(0, b.suspicion - 0.14 * dt);
    } else if (!seen) b.alert = Math.max(0, b.alert - dt * 1.2);
    if (b.mode !== "stare" && !seen && !hands.some((h) => h.hidden) && !p.guilt && !restless) b.suspicion = Math.max(0, b.suspicion - 0.05 * dt);
    if (b.alert >= 1 || b.suspicion >= 1) {
      const reason = b.alert >= 1 ? b.reason ?? "moved" : "under";
      const culprit = reason === "under" ? hands.find((h) => h.hidden)?.id ?? hands[0]?.id : b.culprit ?? hands[0]?.id;
      events.push({ type: "caught", reason, handId: culprit });
      return events;
    }
  }

  // ---- mode changes
  if (b.mode === "watch") {
    if (b.suspicion >= 0.6 && !b.cheat && p.roundActive) {
      b.mode = "stare";
      b.t = 0;
      b.stares++;
      events.push({ type: "stareStart" });
    } else if (!b.cheat && b.plan && p.roundActive && p.sharkLaid && b.roundT >= b.plan.at) {
      b.cheat = { phase: "tell", t: 0, window: b.plan.window ?? T.cheatWindowS };
      b.plan = null;
      b.mode = "cheat";
      b.t = 0;
      events.push({ type: "cheatTell" });
    }
  } else if (b.mode === "stare") {
    if (b.suspicion < 0.25 && b.t >= Math.max(T.stareMinS, b.holdStare)) {
      b.holdStare = 0;
      b.mode = "watch";
      b.t = 0;
      b.look = "face";
      b.lookT = 0;
      if (b.script?.stare?.done) b.script.stare.ended = true;
      events.push({ type: "stareEnd" });
    }
  } else if (b.mode === "distracted") {
    if (b.t >= b.distractS) {
      b.mode = "watch";
      b.t = 0;
      b.look = "face";
      b.lookT = 0;
      b.spot = null;
      events.push({ type: "turnBack" });
    }
  } else if (b.mode === "cheat" && b.cheat) {
    b.cheat.t += dt;
    if (b.cheat.phase === "tell" && b.cheat.t >= 0.45) {
      b.cheat = { phase: "under", t: 0, window: b.cheat.window };
      events.push({ type: "cheatUnder" });
    } else if (b.cheat.phase === "under" && b.cheat.t >= b.cheat.window) {
      b.cheat = { phase: "return", t: 0, window: b.cheat.window };
      events.push({ type: "cheatReturn" });
    } else if (b.cheat.phase === "return" && b.cheat.t >= 0.5) {
      b.cheat = null;
      b.mode = "watch";
      b.t = 0;
      events.push({ type: "cheatDone" });
    }
  } else if (b.mode === "grabbed") {
    if (b.t >= 1.7) {
      b.mode = "recover";
      b.t = 0;
      events.push({ type: "freed" });
    }
  } else if (b.mode === "slam") {
    if (b.t >= 1.5) {
      b.mode = "recover";
      b.t = 0;
      b.suspicion = 0.3;
      b.alert = 0;
      events.push({ type: "slamDone" });
    }
  } else if (b.mode === "recover") {
    if (b.t >= 1.6) {
      b.mode = "watch";
      b.t = 0;
    }
  }

  // ---- where he looks
  b.lookT += dt;
  if (b.mode === "watch" || b.mode === "cheat") {
    if (b.lookT >= b.lookDwell && b.script?.noRandom) {
      b.look = "face";
      b.lookT = 0;
      b.lookDwell = 2;
    } else if (b.lookT >= b.lookDwell) {
      const r = nextFloat(b.rng);
      const w = b.adapt?.hand ? WA : W;
      b.look = r < w.face ? "face" : r < w.face + w.hands ? "hands" : r < w.face + w.hands + w.cards ? "cards" : "own";
      b.lookT = 0;
      const [a, c] = b.look === "face" ? [1.6, 3.2] : b.look === "hands" ? [0.7, 1.3] : b.look === "cards" ? [0.6, 1.0] : [0.8, 1.4];
      b.lookDwell = nextRange(b.rng, a, c) * T.glanceScale;
    }
  }
  if (b.mode === "stare") {
    // eyes on your face, darting to a hand now and then
    const phase = (b.t * 0.9) % 1;
    b.look = phase > 0.78 ? "hands" : "face";
  }
  // the practice rounds script him
  const sc = b.script;
  if (sc) {
    // stage F: `afterHide` (seconds): a stare that waits for you to close your hand on the card (or that many seconds with the card in your hand)
    const hiddenOk = !sc.stare?.afterHide || p.palmed || b.heldT >= sc.stare.afterHide;
    if (sc.stare && !sc.stare.done && (sc.stare.whenHeld ? p.held && b.heldT >= sc.stare.at && hiddenOk : b.roundT >= sc.stare.at) && b.mode === "watch" && p.roundActive) {
      sc.stare.done = true;
      b.suspicion = Math.max(b.suspicion, 0.65);
      b.holdStare = sc.stare.dur;
    }
    // a scripted look starts `at` seconds into the round, or (whenHeld) `at` seconds after the player picked his card up, and ends
    // `dur` seconds later, or (whenHeld) when the card is laid down again
    const clockT = sc.look?.whenHeld ? b.heldT : b.roundT;
    // stage F: `afterStare`: the look waits until his scripted stare has come and gone (the guided first match: the stare, then he looks down at his own card)
    const afterOk = !sc.look?.afterStare || (sc.stare?.ended && b.mode === "watch");
    const lookOn = sc.look && afterOk && (sc.look.whenHeld ? p.held && clockT >= sc.look.at : clockT >= sc.look.at && clockT < sc.look.at + sc.look.dur);
    if (sc.look && b.mode === "watch" && lookOn) {
      if (b.look !== sc.look.kind) events.push({ type: "scriptLook", reason: sc.look.kind });
      b.look = sc.look.kind;
      b.lookT = 0;
      b.lookDwell = 99;
    } else if (sc.look && !lookOn && (sc.look.whenHeld ? true : b.roundT >= sc.look.at + sc.look.dur) && b.lookDwell === 99) {
      b.look = "face";
      b.lookT = 0;
      b.lookDwell = 2;
    }
    if (sc.noRandom && b.mode === "watch" && !sc.look) b.lookDwell = Math.max(b.lookDwell, 1.2);
  }
  // the Shark learns your tell (habits.js): the look-away that covers your usual swap is cut short, with a tell
  const startWatch = (kind) => {
    b.watch = { kind, t: 0, told: false };
    if (!b.announcedCover) {
      b.announcedCover = true;
      events.push({ type: "adaptTiming", reason: kind });
    }
  };
  const canWatch = p.roundActive && !b.script?.noRandom && !!b.adapt?.cover;
  if (canWatch && b.look === "own" && b.prevLook !== "own" && b.mode === "watch" && b.adapt.cover === "look") {
    startWatch("look");
    b.lookDwell = 99;
  }
  if (canWatch && b.mode === "distracted" && b.prevMode !== "distracted" && b.adapt.cover === "point") {
    startWatch("point");
    b.distractS = Math.min(b.distractS, POINT_CUT_S);
  }
  b.prevLook = b.look;
  b.prevMode = b.mode;
  if (b.watch) {
    const cut = b.watch.kind === "point" ? POINT_CUT_S : GLANCE_CUT_S;
    if (b.watch.kind === "look" ? b.mode !== "watch" || b.look !== "own" : b.mode !== "distracted" && b.mode !== "watch") b.watch = null;
    else {
      b.watch.t += dt;
      if (!b.watch.told && b.watch.t >= cut - TELL_LEAD_S) {
        // his tell: his eyes flick to your hand before he turns back
        b.watch.told = true;
        b.flick = { t: TELL_LEAD_S + 0.1, id: (b.adapt?.hand && hands.find((h) => h.id === b.adapt.hand)?.id) ?? hands[0]?.id ?? null };
        events.push({ type: "sharkTell" });
      }
      if (b.watch.t >= cut) {
        const kind = b.watch.kind;
        b.watch = null;
        if (kind === "look") {
          b.look = "hands";
          b.prevLook = "hands";
          b.lookT = 0;
          b.lookDwell = 1.0;
        }
        events.push({ type: "glanceBack" });
        b.backCheck = BACK_CHECK_S;
      }
    }
  }
  // after he turns back he checks the table: a hand that is under it now (or goes under) is seen at once, once per round
  if (b.backCheck > 0) {
    b.backCheck -= dt;
    if (!b.backHit && hands.some((h) => h.hidden)) {
      b.backHit = true;
      notice(b, BACK_JUMP);
      events.push({ type: "adaptHit" });
    }
  }
  if (p.roundActive && b.adapt && !b.announced && (b.adapt.hand || b.adapt.fist) && !b.script?.noRandom) {
    b.announced = true;
    events.push({ type: b.adapt.hand ? "adaptHand" : "adaptFist", reason: b.adapt.hand ?? "fist" });
  }
  // eyes flick to a fast hand for a moment even while the head holds still
  const fastest = visible.reduce((a, h) => (!a || h.speed > a.speed ? h : a), null);
  if (fastest && fastest.speed > 0.3 && b.flick.t <= 0) {
    b.flick = { t: 0.45, id: fastest.id };
  }
  b.flick.t = Math.max(0, b.flick.t - dt);

  b.cmd = commandFor(b, p, hands, nearest);
  return events;
}

/** His face after a round (the result beat): he wins and is smug (hooded eyes, one raised brow look, a calm lean back, eyes on you), he loses
 * and is angry (brows down, eyes narrowed, teeth, a lean toward you, fast breath), a tie is a shrug (brows up, eyes wide).
 * @param {import("../actor/rig.js").RigCommand} c @param {{kind:string,t:number}} r @param {V3} head */
function reactionFace(c, r, head) {
  const k = Math.min(1, r.t / 0.25) * Math.max(0, Math.min(1, (3.2 - r.t) / 0.5));
  c.lookAt = head;
  c.eyesAt = head;
  if (r.kind === "win") {
    // a smirk: eyes half shut, one brow up and one down, the head tilted and a little back, a short laugh follows (see brainStep)
    c.narrow = Math.max(c.narrow, 0.5 * k);
    c.brow = 0.1 * k;
    c.browSkew = 0.85 * k;
    c.tilt = 0.8 * k;
    c.lean = -0.3 * k;
    c.mouth = 0.06 * k;
    c.breathRate = 0.2;
  } else if (r.kind === "lose") {
    c.narrow = Math.max(c.narrow, 0.55 * k);
    c.brow = -0.9 * k;
    c.mouth = 0.3 * k;
    c.lean = 0.3 * k;
    c.breathRate = 0.2 + 0.7 * k;
  } else {
    c.widen = 0.35 * k;
    c.brow = 0.6 * k;
    c.mouth = 0.12 * k;
  }
}

/** The rig command for the current mode. */
function commandFor(b, p, hands, nearest) {
  const c = idleCommand();
  const head = p.head;
  const handPoint = () => {
    const wh = b.adapt?.hand ? hands.find((x) => x.id === b.adapt.hand && !x.hidden) : null;
    const h = wh ?? nearest(hands.filter((x) => !x.hidden)) ?? null;
    return h ? h.pos : { x: SPOTS.playerLay.x, y: 0.02, z: SPOTS.playerLay.z };
  };
  const spotFor = (kind) => {
    if (kind === "hands") return handPoint();
    if (kind === "cards") return { x: 0, y: 0.01, z: 0 };
    if (kind === "own") return { x: SPOTS.sharkLay.x, y: 0.01, z: SPOTS.sharkLay.z };
    return head;
  };
  switch (b.mode) {
    case "watch": {
      c.lookAt = spotFor(b.look);
      c.eyesAt = b.flick.t > 0 ? hands.find((h) => h.id === b.flick.id)?.pos ?? c.lookAt : c.lookAt;
      c.breathRate = 0.22 + 0.5 * b.suspicion;
      c.narrow = 0.35 * b.suspicion;
      c.brow = -0.3 * b.suspicion;
      c.dipR = 0;
      if (b.glare) {
        // the glare: his face points at yours and stays there, eyes narrowed hard, brows down, a small lean in, a slow tilt
        const g = Math.min(1, b.glare.t / 0.2) * Math.max(0, Math.min(1, (GLARE_S - b.glare.t) / 0.35));
        c.lookAt = head;
        c.eyesAt = head;
        c.narrow = Math.max(c.narrow, 0.75 * g);
        c.brow = Math.min(c.brow, -0.95 * g);
        c.lean = Math.max(c.lean, 0.28 * g);
        c.tilt = -0.5 * g;
        c.breathRate = Math.max(c.breathRate, 0.5);
      }
      if (b.react) reactionFace(c, b.react, head);
      break;
    }
    case "stare": {
      // his face points at yours (so you see his eyes); his eyes dart down to your hands now and then. Leaning in this close he sees everything in front of him.
      const hp = handPoint();
      c.lookAt = { x: head.x + (hp.x - head.x) * 0.15, y: head.y + (hp.y - head.y) * 0.15, z: head.z + (hp.z - head.z) * 0.15 };
      c.eyesAt = b.look === "hands" ? hp : head;
      c.lean = 1;
      c.breathRate = 0.72;
      c.breathAmp = 1;
      c.narrow = 0.85;
      c.brow = -0.7;
      c.mouth = 0.1;
      break;
    }
    case "distracted": {
      c.lookAt = b.spot;
      c.eyesAt = b.flick.t > 0 && b.watch ? hands.find((h) => h.id === b.flick.id)?.pos ?? b.spot : b.spot;
      c.brow = 0.6;
      c.mouth = b.t < 0.9 ? 0.3 : 0.05;
      c.widen = 0.25;
      c.breathRate = 0.3;
      break;
    }
    case "cheat": {
      c.lookAt = head; // a poker face: he looks at you while his hand works
      c.eyesAt = head;
      c.narrow = 0.15;
      const phase = b.cheat?.phase;
      c.dipR = phase === "tell" || phase === "under" ? 1 : 0.2;
      c.handR = { mode: phase === "tell" ? "rest" : phase === "under" ? "under" : "rest" };
      if (phase === "tell") c.dipR = Math.min(1, (b.cheat?.t ?? 0) / 0.35);
      c.breathRate = 0.3;
      break;
    }
    case "grabbed": {
      // stage F (D2): he looks at YOUR FACE (looking down at his own wrist turned his head 30 degrees aside and tipped it, and with the jaw wide open the face
      // read as deformed); shock is in the eyes and brows, the mouth opens only a little
      c.lookAt = head;
      c.eyesAt = head;
      c.widen = 0.7;
      c.brow = 0.55;
      c.mouth = 0.4;
      c.struggle = 1;
      c.lean = 0.25;
      c.dipR = 0.7;
      c.handR = { mode: "hold", target: b.target ?? undefined };
      c.breathRate = 0.9;
      break;
    }
    case "slam": {
      // stage D: he glares at YOUR FACE while his hand lands (head turned down at the table, the hat brim hid his eyes at the slam)
      c.lookAt = head;
      c.eyesAt = head;
      c.narrow = 0.5;
      c.brow = -1;
      c.mouth = 0.35;
      c.lean = 0.8;
      c.breathRate = 0.8;
      // a 0.1 s wind-up above the target, then the hand lands
      const tg = b.target ?? head;
      const h = b.t >= 0.1 ? { mode: "slam", target: tg } : { mode: "hover", target: { x: tg.x, y: tg.y + 0.17, z: tg.z - 0.1 } };
      if (b.slamHand === "R") c.handR = h;
      else c.handL = h;
      break;
    }
    case "recover": {
      c.lookAt = head;
      c.eyesAt = head;
      c.narrow = 0.3;
      c.lean = b.afterSlam ? Math.max(-0.3, 0.6 - b.t * 1.2) : Math.max(0, 0.6 - b.t * 0.5);
      c.breathRate = 0.5;
      if (b.afterSlam) {
        // he gloats after slamming your hand: a smirk, tilted, then the laugh
        const k = Math.min(1, b.t / 0.3);
        c.narrow = 0.45;
        c.browSkew = 0.85 * k;
        c.tilt = 0.8 * k;
      }
      if (b.slamHand === "R" && b.target && b.t < 0.5) c.handR = { mode: "slam", target: b.target };
      if (b.slamHand === "L" && b.target && b.t < 0.5) c.handL = { mode: "slam", target: b.target };
      break;
    }
  }
  if (b.laugh) c.laugh = Math.min(1, b.laugh.t / 0.08) * Math.min(1, (LAUGH_S - b.laugh.t) / 0.12);
  return c;
}

export { BODY, TABLE };
