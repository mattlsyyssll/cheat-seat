import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAY_DECK, SWAP_PATH, CHEAT_KEYS, COUNT_KEYS, UNDER_HAT, rightRest, leftRest, samplePath,
} from "../src/game/paths.js";
import { ZONES } from "../src/game/layout.js";
import {
  CHEAT_S, CHEAT_GO_S, CHEAT_UNDER_END_S, createGaze, updateGaze, gloveUnderHat,
} from "../src/game/gaze.js";
import { createRng } from "../src/game/rng.js";
import { LEVELS } from "../src/game/levels.js";

const near = (a, b, tol = 0.03) => Math.hypot(a.x - b.x, a.z - b.z) < tol;

test("laying a card: from rest, to the deck for the pick, to his spot for the lay, back to rest", () => {
  assert.deepEqual(samplePath(LAY_DECK, 0), rightRest);
  assert.ok(near(samplePath(LAY_DECK, LAY_DECK.pickAt), ZONES.deck), "picks at the deck");
  assert.ok(near(samplePath(LAY_DECK, LAY_DECK.layAt), ZONES.sharkLay), "lays at his spot");
  assert.deepEqual(samplePath(LAY_DECK, LAY_DECK.endAt), rightRest);
  assert.ok(LAY_DECK.pickAt < LAY_DECK.layAt && LAY_DECK.layAt < LAY_DECK.endAt);
});

test("the swap after a cheat starts at the hat, touches his card, ends at rest", () => {
  const start = samplePath(SWAP_PATH, 0);
  assert.ok(Math.abs(start.z - (ZONES.hat.z + 0.07)) < 0.02, "starts at the hat front");
  assert.ok(near(samplePath(SWAP_PATH, SWAP_PATH.swapAt), ZONES.sharkLay));
  assert.deepEqual(samplePath(SWAP_PATH, SWAP_PATH.endAt), rightRest);
});

test("the cheat path hides the glove under the hat exactly while the gaze machine says it is under", () => {
  const g = createGaze(createRng(9), { level: { ...LEVELS.normal, cheatChance: 1 } });
  g.gap = 99;
  for (let i = 0; i < 80; i++) updateGaze(g, 0.01, { yawDeg: 90 });
  assert.equal(g.state, "cheating");
  let checked = 0;
  for (let i = 0; i < 400 && g.state === "cheating"; i++) {
    updateGaze(g, 0.01, { yawDeg: 0 });
    if (g.state !== "cheating") break;
    const p = samplePath(CHEAT_KEYS, g.t);
    const hidden = Math.abs(p.z - UNDER_HAT.z) < 0.005 && Math.abs(p.y - UNDER_HAT.y) < 0.005;
    if (g.t > CHEAT_GO_S + 0.16 && g.t < CHEAT_UNDER_END_S - 0.16) {
      assert.equal(hidden, true, `hidden at ${g.t}`);
      assert.equal(gloveUnderHat(g), true);
      checked++;
    }
    if (g.t < CHEAT_GO_S - 0.01) assert.equal(hidden, false, `visible at ${g.t}`);
  }
  assert.ok(checked > 50);
  assert.ok(CHEAT_KEYS[CHEAT_KEYS.length - 1].t === CHEAT_S);
});

test("the left glove counts his pile and comes back", () => {
  assert.deepEqual(samplePath(COUNT_KEYS, 0), leftRest);
  assert.ok(near(samplePath(COUNT_KEYS, 0.6), ZONES.sharkPile, 0.05));
  assert.deepEqual(samplePath(COUNT_KEYS, 5), leftRest);
});

test("every path keeps the glove above the desk and inside the felt", () => {
  for (const path of [LAY_DECK.keys, SWAP_PATH.keys, CHEAT_KEYS, COUNT_KEYS])
    for (const k of path) {
      assert.ok(k.y >= 0.01 && k.y <= 0.1, `height ${k.y}`);
      assert.ok(Math.abs(k.x) <= 0.4 && k.z >= -0.45 && k.z <= 0.3, `position ${k.x},${k.z}`);
    }
});
