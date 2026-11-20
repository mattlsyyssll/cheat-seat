/** Stage D: the start screen's demo plays the real rules: the ghost hand takes the card, he stares, the hand twitches, he slams. */
import test from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame } from "../src/game/duel.js";
import { attractHand, attractStep, ATTRACT } from "../src/game/attract.js";
import { HEAD } from "./helpers-duel.js";

const DT = 1 / 60;
const head = { pos: HEAD.pos, dir: { x: 0, y: -0.2, z: -1 } };

function run(seed) {
  const g = createGame({ seed, warn: true });
  startMatch(g);
  const when = {};
  for (let t = 0; t < ATTRACT.loopS; t += DT) {
    attractStep(g, t);
    const a = attractHand(t);
    const hands = a ? [{ id: "mouse", tracked: true, pos: a.pos, fist: a.fist, pointRay: null }] : [];
    const evs = stepGame(g, DT, { head, hands });
    for (const e of evs.splice(0, evs.length)) if (!(e.type in when)) when[e.type] = +t.toFixed(2);
  }
  return when;
}

test("the demo shows the grab, the stare and the slam inside the first 7 seconds, on every seed", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const w = run(seed);
    assert.ok(w.grab >= 2.5 && w.grab <= 3.2, `seed ${seed}: grab at ${w.grab}`);
    assert.ok(w.stareStart >= 4.0 && w.stareStart <= 4.8, `seed ${seed}: stare at ${w.stareStart}`);
    assert.ok(w.caught >= 5.4 && w.caught <= 6.2, `seed ${seed}: caught at ${w.caught}`);
    assert.ok(w.slamHit !== undefined && w.slamHit <= 6.9, `seed ${seed}: slam at ${w.slamHit}`);
    assert.equal(w.cheatTell, undefined, `seed ${seed}: he must not cheat in the demo`);
  }
});
