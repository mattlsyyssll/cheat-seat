/** The Virtual Quest bench (VIRTUAL-QUEST.md), the parts that need no browser: B1 hands, B2 dropouts and loss under the desk, B3 stillness with
 * spikes, B4 desk heights and reach, B6 comfort. Simulated hands play the game's own rules (tests/bench-lib.js). The page parts are
 * qa/stageC/bench-page.mjs (B5) and qa/stageC/bench-broken.mjs (B7 build with doubled meshes); the other three broken builds are in
 * tests/bench-broken.test.js. Pass lines are the ones written in VIRTUAL-QUEST.md; margins are our assumptions, not Quest measurements. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGame, benchB1, benchB2, benchB3, benchB4, benchB6, oneStare } from "./bench-lib.js";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const G = await loadGame(src);
const show = (id, r) => console.log(`${id}: ${r.pass ? "PASS" : "FAIL"} ${JSON.stringify(r.numbers).slice(0, 420)}`);

test("B1: 1000 random hands (scale 0.8 to 1.2, 5 mm joint noise, curl 0 to 100 percent): extremes right 98 percent or more, at most 1 flip per second on a held pose", () => {
  const r = benchB1(G);
  show("B1", r);
  assert.ok(r.numbers.extremesRate >= 98, `extremes ${r.numbers.extremesRate} percent`);
  assert.ok(r.numbers.worstGameFlipsPerS <= 1, `flips per second ${r.numbers.worstGameFlipsPerS}`);
  assert.ok(r.pass);
});

test("B2: dropouts of 100 to 500 ms 1 to 3 times a minute, and a hand lost under the desk: zero unfair strikes, a palmed card stays palmed", () => {
  const r = benchB2(G);
  show("B2", r);
  assert.equal(r.numbers.unfairStrikes, 0);
  assert.equal(r.numbers.palmBreaks, 0);
  assert.equal(r.numbers.lostUnderDesk.strikes, 0);
  assert.equal(r.numbers.lostUnderDesk.cardShownWhileLost, 0);
  assert.equal(r.numbers.lostUnderDesk.cardDroppedAfterLoss, 0);
  assert.ok(r.numbers.dropouts >= 30 && r.numbers.rounds >= 30, `the run was long enough (${r.numbers.dropouts} dropouts, ${r.numbers.rounds} rounds)`);
  assert.ok(r.pass);
});

test("B3: a still hand with 4 mm noise and 20 mm spikes in 100 stares: at most 1 false catch; a real 3 cm move is caught within 0.5 s", () => {
  const r = benchB3(G);
  show("B3", r);
  assert.ok(r.numbers.falseCatches <= 1, `${r.numbers.falseCatches} false catches`);
  assert.equal(r.numbers.stareNeverStarted, 0);
  assert.equal(r.numbers.move3cm.caughtWithin0_5s, r.numbers.move3cm.trials, `3 cm moves caught in time: ${r.numbers.move3cm.caughtWithin0_5s} of ${r.numbers.move3cm.trials}`);
  assert.ok(r.pass);
});

test("B3 margin: the stare stays fair with rougher tracking (8 mm noise, 40 mm spikes up to 3 a second: at most 2 false catches in 200)", () => {
  // not a pass line of the bench: it shows how far the pass line is from the edge
  let fc = 0;
  for (let i = 0; i < 200; i++) if (oneStare(G, { seed: 7000 + i, sigma: 0.008, spikeM: 0.04, spikeRate: 3 }).caught) fc++;
  assert.ok(fc <= 2, `${fc} false catches in 200 rough stares`);
});

test("B4: desk heights 0.65 to 0.85 m, three seated eye heights, 150 ms of hand lag: his wrist within 0.5 m of your resting hand, grab works 95 percent or more", () => {
  const r = benchB4(G);
  show("B4", r);
  assert.ok(r.numbers.worstWristFromRestingHandM <= 0.5, `reach ${r.numbers.worstWristFromRestingHandM}`);
  assert.ok(r.numbers.rate >= 95, `grab rate ${r.numbers.rate}`);
  for (const row of r.numbers.rows) assert.ok(row.rate >= 95, `desk ${row.deskM}: ${row.rate}`);
  assert.equal(r.numbers.rows.length, 5);
  assert.ok(r.pass);
});

test("B6: his face is never nearer than 0.5 m to the player's head, also when the player leans toward him by up to 10 cm", () => {
  const r = benchB6(G);
  show("B6", r);
  assert.ok(r.numbers.headCentreMinM >= 0.5 + 0.19, `head centre ${r.numbers.headCentreMinM}`);
  assert.ok(r.pass);
});
