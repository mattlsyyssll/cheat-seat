/** A scripted player for the duel tests: the same reactive script is played through the mouse adapter and through the emulator-hand
 * adapter (synthesised joints, classified like real ones). The rules see only HandInput + head either way. */
import { createGame, startMatch, stepGame, forceCheat, arrange } from "../src/game/duel.js";
import { createMouse, mouseHand, mouseFor, mouseButton, mouseTick, handFromJoints } from "../src/game/adapters.js";
import { synthHand, wristForPalm } from "../src/game/synth.js";
import { SPOTS, BODY } from "../src/game/booth.js";

export const HEAD = { pos: { x: 0, y: 0.47, z: 0.46 }, yaw: 0, pitchDown: (14 * Math.PI) / 180 };
export const CAM = { fovY: 62, aspect: 16 / 9 };
export const LOOK_PITCH = 10; // the head looks down a little at the bottom edge (mouse-look)
const DT = 1 / 60;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Turns "where the hand is, fist or not, pointing at what" into HandInput through one of the two adapters. */
export function makeAdapter(kind) {
  if (kind === "mouse") {
    const m = createMouse();
    return {
      kind,
      input(want) {
        if (!want) return { id: "mouse", tracked: false, pos: { x: 0, y: 0.3, z: 0.3 }, fist: false, pointRay: null };
        const c = mouseFor(want.pos, HEAD.pos, HEAD, CAM, 0, LOOK_PITCH);
        m.ndcX = c.ndcX; m.ndcY = c.ndcY; m.factor = c.factor;
        m.lookPitch = LOOK_PITCH;
        m.left = want.fist; m.right = !!want.point;
        const h = mouseHand(m, HEAD.pos, HEAD, CAM);
        if (want.point) {
          // the ray goes through the wanted spot: the cursor is put on the line from the eye to it
          const cp = mouseFor(want.point, HEAD.pos, HEAD, CAM, 0, LOOK_PITCH);
          m.ndcX = cp.ndcX; m.ndcY = cp.ndcY;
          return mouseHand(m, HEAD.pos, HEAD, CAM);
        }
        return h;
      },
    };
  }
  const state = { right: null, left: null };
  return {
    kind,
    input(want, id = "right") {
      if (!want) return { id, tracked: false, pos: { x: 0, y: 0.3, z: 0.3 }, fist: false, pointRay: null };
      const pose = want.point ? "point" : want.fist ? "fist" : "open";
      let forward = { x: 0, y: -0.15, z: -1 };
      if (want.point) {
        // fingers along the line from the hand to the wanted spot
        const o = want.pos;
        forward = { x: want.point.x - o.x, y: want.point.y - o.y, z: want.point.z - o.z };
      }
      const palmNormal = want.point ? { x: 0, y: -1, z: 0.05 } : { x: 0, y: -1, z: 0 };
      const wrist = wristForPalm(want.pos, forward, palmNormal, pose);
      const joints = synthHand({ wrist, forward, palmNormal, from: pose, side: id === "left" ? "left" : "right" });
      const r = handFromJoints(id, joints, state[id]);
      state[id] = r.cls;
      return r.input;
    },
  };
}

/** A hand's wanted state: { pos, fist, point? } */
const rest = (x) => ({ pos: { x, y: 0.05, z: 0.22 }, fist: false });

/** Plays one round of all five moments. Returns { log, strikes, events } */
export function playFiveMoments(kind, { seed = 5, noise = 0, level = "normal", maxS = 80 } = {}) {
  const g = createGame({ seed, level });
  startMatch(g);
  const ad = makeAdapter(kind);
  // both kinds drive ONE hand at a time in the script; the other hand is not tracked (the mouse is one hand)
  let want = rest(0.12);
  let stage = "wait";
  let stageT = 0;
  let sub = 0;
  let t = 0;
  const wrist = () => g.rig.pose.handR.wrist;
  let noiseSeed = 12345;
  const rnd = () => ((noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0) / 4294967296) - 0.5;
  const goto = (pos, fist, secs = 0.5, point = null) => ({ pos, fist, secs, point });
  let move = null; // { from, to, t, secs }
  const setMove = (m) => {
    move = { from: { ...want.pos }, to: m.pos, fist: m.fist, point: m.point, t: 0, secs: m.secs };
  };
  const done = () => !move;
  const doneEvents = new Set();
  while (t < maxS) {
    const view = g.view;
    stageT += DT;
    // ---- the script
    if (stage === "wait" && view && view.phase === "play") {
      // a fixed Shark: no random cheat, and the cards we want
      g.brain.plan = { at: 999, window: 3.4 }; // no cheat yet (a pending plan also keeps the round open)
      arrange(g, { player: 1, shark: 20, sleeve: 12 });
      stage = "point"; stageT = 0; sub = 0;
    } else if (stage === "point") {
      // MOMENT 3: point at the back wall behind him (a valid spot)
      const spot = { x: -3.2, y: 1.0, z: -0.6 };
      if (sub === 0) { setMove(goto({ x: -0.1, y: 0.22, z: 0.3 }, false, 0.4)); sub = 1; }
      else if (sub === 1 && done()) { want = { pos: want.pos, fist: false, point: spot }; sub = 2; stageT = 0; }
      else if (sub === 2 && stageT > 0.7) { want = { pos: want.pos, fist: false }; sub = 3; stageT = 0; }
      else if (sub === 3 && stageT > 0.4) { stage = "palm"; stageT = 0; sub = 0; }
    } else if (stage === "palm") {
      // MOMENT 1: take the card (a closing hand at the card), fist it, open it again
      const spot = { x: SPOTS.playerLay.x, y: 0.03, z: SPOTS.playerLay.z };
      if (sub === 0) { setMove(goto(spot, false, 0.5)); sub = 1; }
      else if (sub === 1 && done()) { want = { pos: want.pos, fist: true }; sub = 2; stageT = 0; }
      else if (sub === 2 && stageT > 0.3) { setMove(goto({ x: 0.04, y: 0.16, z: 0.24 }, true, 0.5)); sub = 3; }
      else if (sub === 3 && done()) { want = { pos: want.pos, fist: false }; sub = 4; stageT = 0; }
      else if (sub === 4 && stageT > 0.4) { want = { pos: want.pos, fist: true }; sub = 5; stageT = 0; }
      else if (sub === 5 && stageT > 0.3) { stage = "stare"; stageT = 0; sub = 0; }
    } else if (stage === "stare") {
      // MOMENT 4: he stares; hold still (the hand stays where it is, fist closed on the card)
      if (sub === 0) { g.brain.suspicion = Math.max(g.brain.suspicion, 0.7); sub = 1; }
      else if (sub === 1 && g.brain.mode === "stare") sub = 2;
      else if (sub === 2 && g.brain.mode !== "stare") { stage = "under"; stageT = 0; sub = 0; }
      if (noise > 0 && want) want = { ...want, pos: { x: want.pos.x + rnd() * 2 * noise, y: want.pos.y + rnd() * 2 * noise, z: want.pos.z + rnd() * 2 * noise } };
    } else if (stage === "under") {
      // MOMENT 2: down under the table, fist, then open: the swap
      if (sub === 0) { setMove(goto({ x: 0.05, y: -0.12, z: 0.0 }, true, 0.7)); sub = 1; }
      else if (sub === 1 && done()) { sub = 2; stageT = 0; }
      else if (sub === 2 && stageT > 0.45) { want = { pos: want.pos, fist: false }; sub = 3; stageT = 0; }
      else if (sub === 3 && stageT > 0.3) { want = { pos: want.pos, fist: true }; setMove(goto({ x: 0.0, y: 0.1, z: 0.2 }, true, 0.7)); sub = 4; }
      else if (sub === 4 && done()) { want = { pos: want.pos, fist: false }; sub = 5; stageT = 0; }
      else if (sub === 5 && stageT > 0.2) { setMove(goto({ x: 0.0, y: 0.04, z: 0.15 }, false, 0.3)); sub = 6; }
      else if (sub === 6 && done()) { want = { pos: want.pos, fist: true }; sub = 7; stageT = 0; }
      else if (sub === 7 && stageT > 0.15) { want = { pos: want.pos, fist: false }; sub = 8; stageT = 0; }
      else if (sub === 8 && stageT > 0.3) { stage = "grab"; stageT = 0; sub = 0; }
    } else if (stage === "grab") {
      // MOMENT 5: he cheats; reach his wrist and hold it closed
      if (sub === 0) { forceCheat(g); g.brain.script = { noRandom: true }; g.brain.plan = { at: 0, window: 3.4 }; setMove(goto({ x: 0.1, y: 0.05, z: 0.2 }, false, 0.3)); sub = 1; }
      else if (sub === 1 && g.brain.mode === "cheat" && g.brain.cheat?.phase === "under") {
        const w = BODY.cheatWrist; // where his wrist ends up (the player sees it move there)
        setMove(goto({ x: w.x, y: w.y + 0.04, z: w.z + 0.06 }, false, 0.7)); sub = 2;
      } else if (sub === 2 && done()) { want = { pos: want.pos, fist: true }; sub = 3; stageT = 0; }
      else if (sub === 3 && g.phase === "gotcha") { stage = "after"; stageT = 0; }
    } else if (stage === "after") {
      want = { pos: want.pos, fist: false };
      if (g.phase === "play" || g.phase === "dealing" || stageT > 6) break;
    }
    // ---- advance the move
    if (move) {
      move.t += DT;
      const k = Math.min(1, move.t / move.secs);
      const e = k * k * (3 - 2 * k);
      want = { pos: { x: move.from.x + (move.to.x - move.from.x) * e, y: move.from.y + (move.to.y - move.from.y) * e, z: move.from.z + (move.to.z - move.from.z) * e }, fist: move.fist, point: move.point };
      if (k >= 1) move = null;
    }
    let shown = want;
    if (noise > 0 && want) shown = { ...want, pos: { x: want.pos.x + rnd() * 2 * noise, y: want.pos.y + rnd() * 2 * noise, z: want.pos.z + rnd() * 2 * noise } };
    const input = ad.input(shown, "right");
    stepGame(g, DT, { head: { pos: HEAD.pos, dir: { x: 0, y: -0.2, z: -1 } }, hands: [input] });
    g.events.length = 0;
    t += DT;
  }
  return { g, log: [...g.log], strikes: { ...g.match.strikes }, stage, t };
}

/** A real mouse as a stranger uses it: the left button goes down and up exactly when `want.fist` changes, the right button when
 * `want.rightClick` changes; the click latch of game/adapters.js runs on game time. Call `input(want)` once per frame (1/60 s). */
export function makeClickMouse(frameS = DT) {
  const m = createMouse();
  let leftWas = false, rightWas = false;
  return {
    mouse: m,
    input(want) {
      if (!want) return { id: "mouse", tracked: false, pos: { x: 0, y: 0.3, z: 0.3 }, fist: false, pointRay: null };
      const c = mouseFor(want.pos, HEAD.pos, HEAD, CAM, 0, LOCAL_LOOK);
      m.ndcX = c.ndcX; m.ndcY = c.ndcY; m.factor = c.factor; m.lookPitch = LOCAL_LOOK;
      if (!!want.fist !== leftWas) { mouseButton(m, "left", !!want.fist); leftWas = !!want.fist; }
      if (!!want.rightDown !== rightWas) { mouseButton(m, "right", !!want.rightDown); rightWas = !!want.rightDown; }
      const h = mouseHand(m, HEAD.pos, HEAD, CAM);
      mouseTick(m, frameS);
      return h;
    },
  };
}
const LOCAL_LOOK = LOOK_PITCH;
