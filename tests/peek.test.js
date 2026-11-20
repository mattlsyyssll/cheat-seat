/** Stage D: the peek, the one move only a body can do. Lean over the table and look at his face-down card: you see it, once a round. */
import test from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame, PEEK } from "../src/game/duel.js";
import { SEAT } from "../src/game/booth.js";

const DT = 1 / 60;
function play({ lean, looking = true, secs = 6, seed = 5 }) {
  const g = createGame({ seed, warn: true });
  startMatch(g);
  const when = {};
  for (let t = 0; t < secs; t += DT) {
    // after the deal (2 s) the player's head moves `lean` metres toward the table and looks at his card (or away)
    const on = t > 2.2;
    const head = { pos: { x: 0, y: SEAT.eyeRel, z: SEAT.playerZ - (on ? lean : 0) }, dir: looking ? { x: 0, y: -0.55, z: -0.83 } : { x: 0, y: 0, z: 1 } };
    const evs = stepGame(g, DT, { head, hands: [] });
    for (const e of evs.splice(0, evs.length)) when[e.type] = (when[e.type] ?? []).concat(+t.toFixed(2));
  }
  return { when, g };
}

test("leaning 15 cm over the table and looking at his card shows it, once, after about half a second", () => {
  const { when, g } = play({ lean: 0.15 });
  assert.equal(when.peek?.length, 1, `one peek (${JSON.stringify(when.peek)})`);
  assert.ok(when.peek[0] >= 2.2 + PEEK.holdS - 0.05 && when.peek[0] <= 2.2 + PEEK.holdS + 0.4, `peek at ${when.peek[0]}`);
  assert.equal(g.view.peek === null || typeof g.view.peek.card === "number", true);
});

test("sitting back (the seat), or leaning without looking at his card, never peeks", () => {
  assert.equal(play({ lean: 0 }).when.peek, undefined);
  assert.equal(play({ lean: 0.15, looking: false }).when.peek, undefined);
  assert.equal(play({ lean: 0.06 }).when.peek, undefined, "6 cm is not a lean");
});

test("the view carries the peeked card for 2.4 seconds (stage F: was 1.6), then it is gone", () => {
  const g = createGame({ seed: 5, warn: true });
  startMatch(g);
  let seen = 0, last = null;
  for (let t = 0; t < 8; t += DT) {
    const on = t > 2.2;
    stepGame(g, DT, { head: { pos: { x: 0, y: SEAT.eyeRel, z: SEAT.playerZ - (on ? 0.15 : 0) }, dir: { x: 0, y: -0.55, z: -0.83 } }, hands: [] });
    if (g.view.peek) { seen += DT; last = g.view.peek.card; }
  }
  assert.ok(seen > 2.2 && seen < 2.6, `shown for ${seen.toFixed(2)} s`);
  assert.equal(typeof last, "number");
  assert.equal(g.view.peek, null);
});

test("leaning raises his suspicion all the while (the risk of the peek), so a long lean ends in his stare", () => {
  const { when } = play({ lean: 0.2, secs: 9 });
  assert.ok(when.stareStart, "a player who stays leaning over the table is stared at");
});
