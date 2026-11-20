import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, LEVEL_IDS, levelOf, levelId, LEVEL_SPOTS } from "../src/game/levels.js";
import {
  createGaze, updateGaze, forceCheat, gloveUnderHat, cheatPathT, cheatLength, setGazeLevel, catchOpen,
  AWAY, WATCHING, CHEATING, CHEAT_GO_S, CHEAT_S, CHEAT_UNDER_END_S, AWAY_MIN_S, AWAY_MAX_S, CATCH_WINDOW_S,
} from "../src/game/gaze.js";
import { createSuspicion, updateSuspicion, FILL_S } from "../src/game/suspicion.js";
import { createRng } from "../src/game/rng.js";
import { distanceBetween } from "./helpers-levels.js";

test("levels: three sets, Normal equals the constants the game was built on, Easy is kinder and Hard is harder", () => {
  assert.deepEqual(LEVEL_IDS, ["easy", "normal", "hard"]);
  const n = LEVELS.normal;
  assert.equal(n.awayMin, AWAY_MIN_S);
  assert.equal(n.awayMax, AWAY_MAX_S);
  assert.equal(n.fillS, FILL_S);
  assert.equal(n.catchWindowS, CATCH_WINDOW_S);
  const e = LEVELS.easy, h = LEVELS.hard;
  assert.ok(e.awayMin > n.awayMin && e.awayMax > n.awayMax, "easy: longer look-aways");
  assert.ok(e.fillS > n.fillS && e.catchWindowS > n.catchWindowS, "easy: slower meter, longer window");
  assert.ok(h.awayMin < n.awayMin && h.awayMax < n.awayMax, "hard: shorter look-aways");
  assert.ok(h.fillS < n.fillS && h.catchWindowS < n.catchWindowS, "hard: faster meter, shorter window");
  // the figures from PRODUCT-FIT P1-3
  assert.deepEqual([e.awayMin, e.awayMax, e.fillS, e.catchWindowS], [1.5, 2.5, 0.9, 2.0]);
  assert.deepEqual([h.awayMin, h.awayMax, h.fillS, h.catchWindowS], [0.8, 1.5, 0.45, 1.0]);
});

test("levels: unknown names fall back to Normal", () => {
  assert.equal(levelId("nope"), "normal");
  assert.equal(levelId(null), "normal");
  assert.equal(levelId("hard"), "hard");
  assert.equal(levelOf(undefined), LEVELS.normal);
});

test("levels: look-aways last the level's length (every seed)", () => {
  for (const id of LEVEL_IDS) {
    const lv = LEVELS[id];
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGaze(createRng(seed), { level: lv });
      let away = null;
      for (let t = 0; t < 40 && away === null; t += 0.01) {
        const ev = updateGaze(g, 0.01, { yawDeg: 0, canCheat: true });
        if (ev.some((e) => e.type === "away")) away = g.awayFor;
      }
      assert.ok(away !== null, `${id} seed ${seed}: no look-away`);
      assert.ok(away >= lv.awayMin - 1e-9 && away <= lv.awayMax + 1e-9, `${id} seed ${seed}: away ${away}`);
    }
  }
});

test("levels: the catch window is 2 s on Easy, 1.5 s on Normal and 1 s on Hard, and the cheat ends 0.35 s after it", () => {
  for (const id of LEVEL_IDS) {
    const lv = LEVELS[id];
    const g = createGaze(createRng(5), { level: lv });
    assert.equal(forceCheat(g), true);
    assert.equal(g.state, CHEATING);
    g.t = CHEAT_GO_S + lv.catchWindowS - 0.02;
    assert.equal(gloveUnderHat(g), true, `${id}: open just before the end`);
    assert.equal(catchOpen(g, 10), true);
    g.t = CHEAT_GO_S + lv.catchWindowS + 0.02;
    assert.equal(gloveUnderHat(g), false, `${id}: closed just after`);
    g.t = CHEAT_GO_S - 0.02;
    assert.equal(gloveUnderHat(g), false, `${id}: not open on the way to the hat`);
    assert.ok(Math.abs(cheatLength(g) - (CHEAT_GO_S + lv.catchWindowS + 0.35)) < 1e-9);
  }
  // Normal is unchanged from before levels existed
  const n = createGaze(createRng(1));
  assert.equal(cheatLength(n), CHEAT_S);
});

test("levels: a whole cheat ends after the level's length", () => {
  for (const id of LEVEL_IDS) {
    const lv = LEVELS[id];
    const g = createGaze(createRng(9), { level: lv });
    forceCheat(g);
    let ended = null;
    for (let t = 0; t < 6 && ended === null; t += 0.005) {
      const ev = updateGaze(g, 0.005, { yawDeg: 0 });
      if (ev.some((e) => e.type === "cheatEnd")) ended = t + 0.005;
    }
    assert.ok(ended !== null && Math.abs(ended - (CHEAT_GO_S + lv.catchWindowS + 0.35)) < 0.02, `${id}: ended at ${ended}`);
  }
});

test("levels: the glove path keeps its speed to and from the hat; only the time under it stretches", () => {
  for (const id of LEVEL_IDS) {
    const g = createGaze(createRng(2), { level: LEVELS[id] });
    forceCheat(g);
    const w = LEVELS[id].catchWindowS;
    let prev = -1;
    for (let t = 0; t <= CHEAT_GO_S + w + 0.35 + 1e-9; t += 0.01) {
      g.t = t;
      const p = cheatPathT(g);
      assert.ok(p >= prev - 1e-9, `${id}: path time never goes back (${t})`);
      prev = p;
    }
    g.t = CHEAT_GO_S;
    assert.ok(Math.abs(cheatPathT(g) - CHEAT_GO_S) < 1e-9);
    g.t = CHEAT_GO_S + w;
    assert.ok(Math.abs(cheatPathT(g) - CHEAT_UNDER_END_S) < 1e-9, `${id}: leaves the hat at the same path time`);
    g.t = cheatLength(g);
    assert.ok(Math.abs(cheatPathT(g) - CHEAT_S) < 1e-9, `${id}: ends at the same path time`);
  }
});

test("levels: the suspicion meter fills in 0.9 s on Easy, 0.6 s on Normal and 0.45 s on Hard", () => {
  for (const id of LEVEL_IDS) {
    const s = createSuspicion(LEVELS[id].fillS);
    let caught = null;
    for (let t = 0; t < 3 && caught === null; t += 0.005) {
      const ev = updateSuspicion(s, 0.005, { suspicious: true });
      const c = ev.find((e) => e.type === "caught");
      if (c) caught = c.fillS;
    }
    assert.ok(caught !== null && Math.abs(caught - LEVELS[id].fillS) < 0.02, `${id}: filled in ${caught}`);
  }
  assert.ok(createSuspicion().fillS === FILL_S, "default is Normal");
});

test("levels: a level change reaches a running gaze machine", () => {
  const g = createGaze(createRng(3));
  setGazeLevel(g, LEVELS.hard);
  assert.equal(g.level, LEVELS.hard);
  forceCheat(g);
  g.t = CHEAT_GO_S + 1.2;
  assert.equal(gloveUnderHat(g), false, "hard window is already closed at 1.2 s");
  assert.equal(g.state, CHEATING);
  assert.equal(WATCHING === AWAY, false);
});

test("levels: the three hats are inside the felt and far enough apart to pick one at a time (more than 2 x 3.4 cm)", () => {
  const ids = LEVEL_IDS;
  for (const id of ids) assert.ok(Math.abs(LEVEL_SPOTS[id].x) < 0.39 && LEVEL_SPOTS[id].z > -0.4 && LEVEL_SPOTS[id].z < 0.38);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) assert.ok(distanceBetween(LEVEL_SPOTS[ids[i]], LEVEL_SPOTS[ids[j]]) > 0.068);
});
