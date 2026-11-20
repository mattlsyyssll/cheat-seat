/** A scripted cheater for the "Shark learns your tell" tests and the seeded 20-match run (qa/r5/habit-sim.mjs): plays whole matches through the
 * emulator-hand adapter. Each round it takes the card, waits for a look-away of the Shark (or points him away), closes the fist for `fistS`, goes under the table, swaps
 * and lays. A policy decides the habit of each cheat: { cover: "look"|"point", hand: "right"|"left", fistS }. */
import { createGame, startMatch, stepGame, newMatch } from "../src/game/duel.js";
import { SPOTS, BODY } from "../src/game/booth.js";
import { makeAdapter, HEAD } from "./helpers-duel.js";
import { compareCards } from "../src/game/cards.js";

const DT = 1 / 60;
const LAY = { x: SPOTS.playerLay.x, y: 0.03, z: SPOTS.playerLay.z };
const UNDER = { x: 0.05, y: -0.12, z: 0.0 };
const UP = { x: 0.0, y: 0.1, z: 0.2 };
const PT = { x: -0.1, y: 0.22, z: 0.3 };
const WALL = { x: -3.2, y: 1.0, z: -0.6 };
const pointSteps = () => [{ pos: PT, fist: false, secs: 0.4 }, { pos: PT, fist: false, point: WALL, secs: 0.7 }];

const seq = (list) => ({ list, i: 0, t: 0, from: null });
const swapSteps = (fistS) => [
  { pos: LAY, fist: true, secs: fistS },
  { pos: UNDER, fist: true, secs: 0.7 },
  { pos: UNDER, fist: true, secs: 0.45 },
  { pos: UNDER, fist: false, secs: 0.3 },
  { pos: UP, fist: true, secs: 0.7 },
  { pos: LAY, fist: true, secs: 0.35 },
  { pos: LAY, fist: false, secs: 0.5 },
];
const layOnlySteps = () => [
  { pos: LAY, fist: true, secs: 0.15 },
  { pos: LAY, fist: false, secs: 0.5 },
];

/** @param {number} seed @param {(info:{n:number, plates:string[]})=>{glance:number, hand:string, fistS:number}} policy
 * @param {{level?:string, game?:any, rematch?:boolean, maxS?:number}} [o] */
export function playMatch(seed, policy, o = {}) {
  const g = o.game ?? createGame({ seed, level: o.level ?? "normal" });
  if (o.game) { newMatch(g); g.view = null; }
  else startMatch(g);
  const ad = makeAdapter("hands");
  const out = { catches: 0, rounds: 0, swaps: 0, attempts: [], caughtRounds: 0, adapted: { glance: 0, hand: 0, fist: 0 }, plates: [], over: false, winner: null, t: 0 };
  let want = { pos: { x: 0.12, y: 0.05, z: 0.22 }, fist: false };
  let handId = "right";
  let round = 0;
  let stage = "wait";
  let st = null;
  let plan = null;
  let stageT = 0;
  let attempt = null;
  const maxS = o.maxS ?? 1500;
  while (out.t < maxS) {
    const view = g.view;
    stageT += DT;
    if (view && view.phase === "over") { out.over = true; out.winner = view.winner; break; }
    if (view && view.phase === "play" && view.round !== round) {
      round = view.round;
      const mine = view.card.face;
      const sleeve = view.sleeve.card;
      plan = policy({ n: out.attempts.length, plates: out.plates, round, mine, sleeve, useful: mine !== null && sleeve !== null && compareCards(sleeve, mine) > 0 });
      handId = plan.hand;
      stage = "take"; stageT = 0;
      st = seq([{ pos: LAY, fist: false, secs: 0.5 }, { pos: LAY, fist: true, secs: 0.3 }, { pos: LAY, fist: false, secs: 0.3 }]);
      attempt = null;
    }
    if (view && view.phase !== "play" && stage !== "wait") { stage = "wait"; want = { pos: { x: 0.12, y: 0.05, z: 0.22 }, fist: false }; st = null; }
    const frozen = g.brain.mode === "stare" || g.brain.mode === "slam" || g.brain.mode === "recover";
    if (view?.phase === "play" && st && !frozen) {
      const step = st.list[st.i];
      if (step) {
        if (!st.from) st.from = { ...want.pos };
        st.t += DT;
        const k = Math.min(1, st.t / step.secs);
        const e = k * k * (3 - 2 * k);
        want = { pos: { x: st.from.x + (step.pos.x - st.from.x) * e, y: st.from.y + (step.pos.y - st.from.y) * e, z: st.from.z + (step.pos.z - st.from.z) * e }, fist: step.fist, point: step.point };
        if (k >= 1) { st.i++; st.t = 0; st.from = null; }
      } else if (stage === "take") {
        stage = "wait-glance"; stageT = 0; st = null;
      } else if (stage === "swap" || stage === "lay" || stage === "catch") {
        stage = "done"; st = null;
      }
    }
    if (view?.phase === "play" && stage === "wait-glance" && plan.cheat === false) {
      stage = "lay"; stageT = 0; st = seq(layOnlySteps());
    }
    if (view?.phase === "play" && stage === "wait-glance") {
      const usePoint = plan.cover === "point" && g.pointsLeft > 0;
      const ready = usePoint ? stageT > 0.5 && g.brain.mode === "watch" : g.brain.look === "own" && g.brain.mode === "watch";
      if (ready) {
        stage = "swap"; stageT = 0; st = seq([...(usePoint ? pointSteps() : []), ...swapSteps(plan.fistS)]);
        attempt = { round, cover: usePoint ? "point" : "look", hand: plan.hand, fistS: plan.fistS, adaptedBefore: !!g.brain.adapt?.cover, caught: false, swapped: false, adaptHit: false, backUp: false };
        out.attempts.push(attempt);
      } else if (stageT > 26) {
        stage = "lay"; stageT = 0; st = seq(layOnlySteps());
      }
    }
    const input = ad.input(view?.phase === "play" || view?.phase === "dealing" ? want : null, handId);
    stepGame(g, DT, { head: { pos: HEAD.pos, dir: { x: 0, y: -0.2, z: -1 } }, hands: [input] });
    for (const e of g.events) {
      if (e.type === "swap" && attempt) { attempt.swapped = true; out.swaps++; }
      if (e.type === "gotcha") out.catches++;
      if (e.type === "caught" && attempt && !attempt.caught) { attempt.caught = true; out.caughtRounds++; }
      if (e.type === "adaptHit" && attempt) attempt.adaptHit = true;
      // a player who reads him: at his eye flick the hand comes up at once (the swap is not done yet, or it is and the card is in the fist)
      if (e.type === "sharkTell" && plan?.reads && stage === "swap" && attempt && !attempt.backUp) {
        attempt.backUp = true;
        st = seq([{ pos: UP, fist: true, secs: 0.45 }, { pos: LAY, fist: true, secs: 0.3 }, { pos: LAY, fist: false, secs: 0.4 }]);
      }
      // a player who sees his cuff glow: the right hand drops what it does, goes to his wrist and holds it closed
      if (e.type === "cheatUnder" && plan?.catchShark && stage !== "catch" && view?.phase === "play") {
        const w = BODY.cheatWrist;
        const at = { x: w.x, y: w.y + 0.04, z: w.z + 0.06 };
        stage = "catch"; stageT = 0; handId = "right";
        st = seq([{ pos: at, fist: false, secs: 0.8 }, { pos: at, fist: true, secs: 1.4 }]);
      }
      if (e.type === "adaptTiming") { out.adapted.glance++; out.plates.push("timing"); }
      if (e.type === "adaptHand") { out.adapted.hand++; out.plates.push("hand"); }
      if (e.type === "adaptFist") { out.adapted.fist++; out.plates.push("fist"); }
    }
    g.events.length = 0;
    out.t += DT;
  }
  out.rounds = g.match.round;
  out.g = g;
  return out;
}
