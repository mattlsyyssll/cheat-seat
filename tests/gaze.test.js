import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGaze, updateGaze, coneOn, gloveUnderHat, yawOffDeg, lookOffDeg,
  WATCHING, AWAY, CHEATING, AWAY_MIN_S, AWAY_MAX_S, CHEAT_S, CHEAT_COOLDOWN_S, CHEAT_GO_S, CHEAT_MAX_S,
  LOOK_HOLD_S, LOOK_LIMIT_DEG, CATCH_WINDOW_S, REACT_S, catchOpen, cancelCheat, forceCheat,
} from "../src/game/gaze.js";
import { LEVELS } from "../src/game/levels.js";
import { createRng } from "../src/game/rng.js";

/** Normal numbers, but he always takes the chance to cheat (the chance itself is tested on its own). */
const SURE = { level: { ...LEVELS.normal, cheatChance: 1 } };
const STEP = 0.01;
function run(g, seconds, input) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += STEP)
    for (const e of updateGaze(g, STEP, typeof input === "function" ? input(t) : input))
      events.push({ ...e, at: g.t });
  return events;
}

test("yaw is the flat angle between where the head faces and the Shark", () => {
  const head = { x: 0, z: 0 }, shark = { x: 0, z: -1 };
  assert.ok(Math.abs(yawOffDeg(head, { x: 0, z: -1 }, shark)) < 1e-6);
  assert.ok(Math.abs(yawOffDeg(head, { x: 1, z: -1 }, shark) - 45) < 1e-6);
  assert.ok(Math.abs(yawOffDeg(head, { x: 1, z: 0 }, shark) - 90) < 1e-6);
  assert.ok(Math.abs(yawOffDeg(head, { x: 0, z: 1 }, shark) - 180) < 1e-6);
  assert.equal(yawOffDeg(head, { x: 0, z: 0 }, shark), 0, "no direction means no yaw");
});

test("watching: the cone is on the player's side", () => {
  const g = createGaze(createRng(1), SURE);
  assert.equal(g.state, WATCHING);
  assert.equal(coneOn(g), true);
});

test("looking away lasts 1 to 2 seconds, the cone is off, then he watches again", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = createGaze(createRng(seed), SURE);
    let awayAt = null, backAt = null, off = null;
    let clock = 0;
    for (let i = 0; i < 3000 && backAt === null; i++) {
      clock += STEP;
      const ev = updateGaze(g, STEP, { yawDeg: 0 });
      for (const e of ev) {
        if (e.type === "away") {
          awayAt = clock;
          off = coneOn(g);
        }
        if (e.type === "watch" && awayAt !== null) backAt = clock;
      }
    }
    assert.ok(awayAt !== null && backAt !== null, `seed ${seed} looked away`);
    assert.equal(off, false);
    const len = backAt - awayAt;
    assert.ok(len >= AWAY_MIN_S - 0.02 && len <= AWAY_MAX_S + 0.02, `seed ${seed} away ${len}`);
  }
});

test("look-off is the 3D angle between where the head faces and the Shark: looking down at the hands counts", () => {
  const head = { x: 0, y: 0.53, z: 0.43 }, hat = { x: 0, y: 0.12, z: -0.31 };
  const toHat = { x: 0, y: hat.y - head.y, z: hat.z - head.z };
  assert.ok(lookOffDeg(head, toHat, hat) < 1e-6, "facing him is 0");
  const toCard = { x: 0, y: -0.53, z: 0.15 - 0.43 }; // the card in front of you
  const toDeck = { x: -0.2, y: -0.53, z: 0.04 - 0.43 };
  const toPot = { x: 0.14, y: -0.53, z: -0.04 - 0.43 };
  assert.ok(lookOffDeg(head, toCard, hat) > LOOK_LIMIT_DEG + 4, "looking at your card is off him");
  assert.ok(lookOffDeg(head, toDeck, hat) > LOOK_LIMIT_DEG + 2, "looking at the deck is off him");
  assert.ok(lookOffDeg(head, toPot, hat) < LOOK_LIMIT_DEG, "looking at the middle of the desk is still on his side");
  assert.equal(lookOffDeg(head, { x: 0, y: 0, z: 0 }, hat), 0, "no direction means no angle");
  assert.equal(LOOK_LIMIT_DEG, 24);
  assert.equal(LOOK_HOLD_S, 0.4);
});

test("he never cheats while the view stays within 24 degrees, however long", () => {
  const g = createGaze(createRng(2), SURE);
  const ev = run(g, 60, { yawDeg: LOOK_LIMIT_DEG - 0.1 });
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 0);
});

test("he never cheats if the view drops for 0.4 seconds or less", () => {
  const g = createGaze(createRng(3), SURE);
  // 0.39 s down, then back, repeated
  const ev = run(g, 30, (t) => ({ yawDeg: t % 3 < 0.39 ? 60 : 0 }));
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 0);
});

test("he cheats once the view has been more than 24 degrees off him for over 0.4 seconds", () => {
  const g = createGaze(createRng(3), SURE);
  g.gap = 99; // keep the telegraph from interfering
  const events = [];
  let clock = 0;
  while (clock < 2 && !events.some((e) => e.type === "cheatStart")) {
    clock += STEP;
    events.push(...updateGaze(g, STEP, { yawDeg: 40 }));
  }
  assert.ok(events.some((e) => e.type === "cheatStart"));
  assert.ok(clock > LOOK_HOLD_S - 1e-9 && clock < LOOK_HOLD_S + 0.03, `cheat began at ${clock}`);
  assert.equal(g.state, CHEATING);
  assert.equal(coneOn(g), false, "eyes are down while the glove is in the hat");
});

test("he also cheats in the middle of his own look-away if the view drops (that is when you swap)", () => {
  const g = createGaze(createRng(7), SURE);
  g.gap = 0.001;
  updateGaze(g, 0.01, { yawDeg: 0 });
  assert.equal(g.state, AWAY);
  g.awayFor = 4;
  const ev = run(g, 1.0, { yawDeg: 40 });
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 1, "the look-away turns into the cheat");
  assert.equal(g.state, CHEATING);
});

test("with a card in your hand and his eyes on you he does not cheat: he catches you (the door opens only in his look-away)", () => {
  const g = createGaze(createRng(4), SURE);
  g.gap = 99;
  const ev = run(g, 3, { yawDeg: 40, holding: true });
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 0, "watching while you hold a card: no cheat");
  assert.equal(g.state, WATCHING);
  const h = createGaze(createRng(4), SURE);
  h.gap = 0.001;
  updateGaze(h, 0.01, { yawDeg: 0 });
  assert.equal(h.state, AWAY);
  h.awayFor = 4;
  const ev2 = run(h, 1, { yawDeg: 40, holding: true });
  assert.equal(ev2.filter((e) => e.type === "cheatStart").length, 1, "in his look-away the same drop opens the door");
});

test("turning back resets the hold timer", () => {
  const g = createGaze(createRng(4), SURE);
  g.gap = 99;
  run(g, 0.35, { yawDeg: 50 });
  run(g, 0.05, { yawDeg: 10 });
  const ev = run(g, 0.35, { yawDeg: 50 });
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 0);
});

test("he takes the chance with the level's probability, once per time the view drops", () => {
  // chance 0: never, however often the view drops
  const never = createGaze(createRng(5), { level: { ...LEVELS.normal, cheatChance: 0 } });
  never.gap = 99;
  let starts = 0;
  for (let i = 0; i < 20; i++) {
    starts += run(never, 1.2, { yawDeg: 50 }).filter((e) => e.type === "cheatStart").length;
    run(never, 0.2, { yawDeg: 0 });
  }
  assert.equal(starts, 0);
  // chance 1: every time
  const always = createGaze(createRng(5), { level: { ...LEVELS.normal, cheatChance: 1 } });
  always.gap = 99;
  assert.equal(run(always, 0.6, { yawDeg: 50 }).filter((e) => e.type === "cheatStart").length, 1);
  // Normal 0.8: between 70 and 90 percent over many drops (a fixed seed, so this does not flake)
  let yes = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const g = createGaze(createRng(1000 + i), { level: LEVELS.normal });
    g.gap = 99;
    if (run(g, 0.6, { yawDeg: 50 }).some((e) => e.type === "cheatStart")) yes++;
  }
  assert.ok(yes / N > 0.7 && yes / N < 0.9, `cheated ${yes} of ${N}`);
  assert.deepEqual([LEVELS.easy.cheatChance, LEVELS.normal.cheatChance, LEVELS.hard.cheatChance], [0.9, 0.8, 0.7]);
});

test("the glove is under the hat only inside the cheat window, and the cheat ends", () => {
  const g = createGaze(createRng(5), SURE);
  g.gap = 99;
  run(g, 0.45, { yawDeg: 80 });
  assert.equal(g.state, CHEATING);
  const seen = [];
  const startT = g.t;
  let ended = null;
  for (let i = 0; i < 300; i++) {
    const ev = updateGaze(g, STEP, { yawDeg: 0 });
    seen.push([g.t, gloveUnderHat(g)]);
    if (ev.some((e) => e.type === "cheatEnd")) {
      ended = startT + (i + 1) * STEP;
      break;
    }
  }
  assert.ok(ended !== null);
  assert.ok(Math.abs(ended - CHEAT_S) < 0.02, `cheat ended after ${ended}`);
  const under = seen.filter(([, u]) => u).map(([t]) => t);
  assert.ok(under.length > 0);
  assert.ok(Math.min(...under) >= 0.34 && Math.max(...under) <= 1.86, "window 0.35 to 1.85 s (1.5 s catch window, PRODUCT-FIT P0-6)");
  assert.ok(Math.max(...under) - Math.min(...under) >= 1.0, "the window is open for a good second after the view came back");
  assert.equal(g.state, WATCHING);
});

test("stage 1: the glove stays under the hat while the view is down, and for at least 1 s after you look up", () => {
  const g = createGaze(createRng(5), SURE);
  g.gap = 99;
  run(g, 0.45, { yawDeg: 80 });
  assert.equal(g.state, CHEATING);
  // the swap takes 3 s: the view stays down far past the 1.5 s window
  run(g, 3, { yawDeg: 80 });
  assert.equal(g.state, CHEATING, "still cheating after 3.4 s with the view down");
  assert.equal(gloveUnderHat(g), true, "the glove is still under the hat");
  // look up: at least REACT_S of window is left
  run(g, 0.05, { yawDeg: 5 });
  let open = 0;
  while (gloveUnderHat(g) && open < 5) {
    open += STEP;
    updateGaze(g, STEP, { yawDeg: 5 });
  }
  assert.ok(open >= REACT_S - 0.07, `the window stayed open ${open.toFixed(2)} s after looking up`);
  assert.equal(REACT_S, 1.0);
});

test("stage 1: a quick look up inside the window changes nothing (the window is still 1.5 s from the start)", () => {
  const g = createGaze(createRng(5), SURE);
  g.gap = 99;
  run(g, 0.45, { yawDeg: 80 });
  run(g, 0.2, { yawDeg: 5 });
  const t0 = g.t;
  let ended = null;
  for (let i = 0; i < 400; i++) if (updateGaze(g, STEP, { yawDeg: 5 }).some((e) => e.type === "cheatEnd")) { ended = i * STEP; break; }
  assert.ok(ended !== null);
  assert.ok(Math.abs(t0 + ended - CHEAT_S) < 0.05, `ended at ${t0 + ended}`);
});

test("stage 1: a cheat never lasts longer than CHEAT_MAX_S, even if the view never comes back", () => {
  const g = createGaze(createRng(5), SURE);
  g.gap = 99;
  let ended = null, clock = 0;
  while (clock < 20 && ended === null) {
    clock += STEP;
    if (updateGaze(g, STEP, { yawDeg: 80 }).some((e) => e.type === "cheatEnd")) ended = clock;
  }
  assert.ok(ended !== null && ended <= CHEAT_MAX_S + LOOK_HOLD_S + 0.6, `ended at ${ended}`);
  assert.equal(CHEAT_MAX_S, 7);
});

test("after a cheat he waits before cheating again, and a locked cheat does not start", () => {
  const g = createGaze(createRng(6), SURE);
  g.gap = 99;
  run(g, 0.45, { yawDeg: 80 });
  run(g, CHEAT_S + 0.05, { yawDeg: 0 });
  assert.equal(g.state, WATCHING);
  assert.ok(g.cooldown > 0 && g.cooldown <= CHEAT_COOLDOWN_S);
  const ev = run(g, CHEAT_COOLDOWN_S - 0.5, { yawDeg: 80 });
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 0);
  const h = createGaze(createRng(6), SURE);
  h.gap = 99;
  const ev2 = run(h, 5, { yawDeg: 80, canCheat: false });
  assert.equal(ev2.filter((e) => e.type === "cheatStart").length, 0);
});

test("inactive gaze (the opening) does not start telegraphs", () => {
  const g = createGaze(createRng(8), SURE);
  const ev = run(g, 30, { yawDeg: 0, active: false });
  assert.equal(ev.length, 0);
  assert.equal(g.state, WATCHING);
});

test("catch window: open only while the glove is under the hat and the view is within 24 degrees", () => {
  assert.equal(CATCH_WINDOW_S, 1.5);
  const g = createGaze(createRng(9), SURE);
  g.gap = 99;
  run(g, 0.45, { yawDeg: 80 });
  assert.equal(g.state, CHEATING);
  // glove still going to the hat: closed
  g.t = 0.2;
  assert.equal(catchOpen(g, 0), false, "before the glove is under the hat");
  g.t = 0.4;
  assert.equal(catchOpen(g, 0), true);
  assert.equal(catchOpen(g, 23.9), true);
  assert.equal(catchOpen(g, -23.9), true);
  assert.equal(catchOpen(g, 24.1), false, "the view is still down or away");
  g.t = 1.84;
  assert.equal(catchOpen(g, 10), true, "still inside 1.5 s");
  g.t = 1.86;
  assert.equal(catchOpen(g, 10), false, "glove is out again");
  // not cheating: never open
  const w = createGaze(createRng(9), SURE);
  assert.equal(catchOpen(w, 0), false);
});

test("a catch cancels the cheat, goes back to watching and starts the cooldown", () => {
  const g = createGaze(createRng(10), SURE);
  g.gap = 99;
  run(g, 0.45, { yawDeg: 80 });
  g.t = 0.6;
  assert.equal(cancelCheat(g), true);
  assert.equal(g.state, WATCHING);
  assert.equal(g.cooldown, CHEAT_COOLDOWN_S);
  assert.equal(cancelCheat(g), false, "nothing left to cancel");
  const ev = run(g, CHEAT_COOLDOWN_S - 0.5, { yawDeg: 80 });
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 0, "no new cheat during the cooldown");
});

test("the lesson cheat starts in plain sight, runs the same cheat and window, and respects the cooldown", () => {
  const g = createGaze(createRng(11), SURE);
  g.gap = 99;
  assert.equal(forceCheat(g), true);
  assert.equal(g.state, CHEATING);
  const ev = run(g, 0.4, { yawDeg: 0 });
  assert.equal(gloveUnderHat(g), true, "glove under the hat 0.35 s in, with the head facing him");
  assert.equal(catchOpen(g, 0), true, "and he can be caught");
  const rest = run(g, CHEAT_S, { yawDeg: 0 });
  assert.ok(rest.some((e) => e.type === "cheatEnd"));
  assert.equal(forceCheat(g), false, "cooldown after a cheat");
  assert.equal(ev.filter((e) => e.type === "cheatStart").length, 0, "no extra start event from the run");
});
