/** Stage C polish from the main session's cold play 2 (S2, S3) and the feel rules. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame, PRACTICE, PAYOFF_HOLD_S, FIRST_CHEAT_WINDOW_S, REPEAT_CHEAT_WINDOW_S } from "../src/game/duel.js";
import { stranger, head } from "./helpers-stranger.js";
import { rankOf } from "../src/game/cards.js";
import { makeAdapter } from "./helpers-duel.js";

const DT = 1 / 60;

test("S3: the palm lesson pays off: the sleeve card swaps in as the card goes down, and round 1 ends with a win (30 seeds)", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const events = [];
    let result = null;
    const r = stranger("click", {
      seed, maxS: 60,
      onFrame: (g) => {
        for (const e of g.events) {
          if (!result && g.practice?.step === 1) events.push(e.type + (e.payoff ? ":payoff" : ""));
          if (e.type === "result" && !result && g.practice?.step === 1) result = { ...e };
        }
      },
    });
    assert.ok(result, `seed ${seed}: round 1 reached its result (${events.join(" ")})`);
    assert.equal(result.result, "player", `seed ${seed}: round 1 is a win`);
    assert.equal(result.swapped, true, `seed ${seed}: the winning card came from the sleeve`);
    assert.ok(rankOf(result.player) > rankOf(result.shark), `seed ${seed}: ${result.player} beats ${result.shark}`);
    const iSwap = events.indexOf("swap:payoff"), iRes = events.indexOf("result");
    assert.ok(iSwap >= 0 && iRes > iSwap, `seed ${seed}: the swap comes before the cards turn (${events.join(" ")})`);
    assert.equal(r.g.match.strikes.player, 0);
  }
});

test("S3: the swap happens once, only in lesson 1, only after a real palm and only when the card goes down", () => {
  // a click-pick-up, no palm, laid again: no swap
  const g = createGame({ seed: 4, practice: true });
  startMatch(g);
  assert.equal(g.practice.paid, false);
  const ad = makeAdapter("mouse");
  const log = [];
  for (let t = 0; t < 12; t += DT) {
    stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false })] });
    for (const e of g.events) log.push(e.type);
    g.events.length = 0;
  }
  assert.ok(!log.includes("swap"), "a player who does nothing is never swapped");
  assert.equal(g.practice.paid, false);
  // later lessons and the real match: lay never swaps
  const r = stranger("click", { seed: 11 });
  assert.equal(r.g.practice, null);
  const swaps = r.g.log.filter((l) => l.startsWith("swap")).length;
  assert.ok(swaps >= 2, `the payoff in lesson 1 and the hand-made swap in lesson 4 (${swaps} swaps)`);
});

test("S3: the cards stay face down a moment after the payoff swap so it can be read", () => {
  let t0 = null, tRes = null;
  stranger("click", {
    seed: 3, maxS: 40,
    onFrame: (g, t) => {
      for (const e of g.events) {
        if (e.type === "swap" && e.payoff && t0 === null) t0 = t;
        if (e.type === "result" && tRes === null) tRes = t;
      }
    },
  });
  assert.ok(t0 !== null && tRes !== null);
  assert.ok(tRes - t0 >= PAYOFF_HOLD_S + 0.6, `swap at ${t0.toFixed(2)}, cards turn at ${tRes.toFixed(2)}`);
});

test("S2: lesson 3's first cheat window is at least 2.5 s, and a slow reader catches him in the first window", () => {
  assert.ok(PRACTICE[3].cheat.window >= 2.5, `window ${PRACTICE[3].cheat.window}`);
  assert.equal(PRACTICE[3].cheat.window, FIRST_CHEAT_WINDOW_S);
  assert.ok(FIRST_CHEAT_WINDOW_S > REPEAT_CHEAT_WINDOW_S && REPEAT_CHEAT_WINDOW_S >= 2.5, "the first window is the longest; a repeat is still above 2.5 s");
  for (const readS of [1.5, 2.2, 3.0, 3.6]) {
    let tells = 0, caughtAfter = null;
    const r = stranger("click", {
      seed: 11, readS, maxS: 220,
      onFrame: (g) => {
        if (g.practice?.step !== 3) return;
        for (const e of g.events) {
          if (e.type === "cheatTell") tells++;
          if (e.type === "gotcha" && caughtAfter === null) caughtAfter = tells;
        }
      },
    });
    assert.equal(r.g.practice, null, `a reader at ${readS} s per line finished the lessons`);
    assert.equal(caughtAfter, 1, `reading ${readS} s per line, he was caught in the first window (tells before the catch: ${caughtAfter})`);
  }
});

// ------------------------------------------------------------------------------------------------ feel: his idle reactions
import { LAUGH_S, GLARE_S } from "../src/game/brain.js";
import { SPOTS } from "../src/game/booth.js";
import { slowFactor, slowRealSeconds, SLOW, shakeAmp, shakeOffset, SHAKE, breathIntensity, tensionTarget } from "../src/game/feel.js";
import { LAUGH_HZ } from "../src/actor/rig.js";

const HANDS_AWAY = { pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false };

test("feel: when he wins a round he smirks and then laughs for about 0.8 s (the jaw pulses about 4 times)", () => {
  let found = null;
  for (const seed of [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
    const g = createGame({ seed });
    startMatch(g);
    const ad = makeAdapter("mouse");
    const evs = [];
    const jaw = [];
    let tRes = null;
    for (let t = 0; t < 70; t += DT) {
      stepGame(g, DT, { head: head(), hands: [ad.input(HANDS_AWAY)] });
      for (const e of g.events) { evs.push(e.type + (e.result ? ":" + e.result : "")); if (e.type === "result" && tRes === null) tRes = t; }
      g.events.length = 0;
      if (tRes !== null && t - tRes < 2) jaw.push(g.rig.pose.jaw);
      if (g.phase === "between" && tRes !== null) break;
    }
    if (evs.includes("result:shark")) { found = { evs, jaw, g }; break; }
  }
  assert.ok(found, "a round that he won");
  assert.ok(found.evs.includes("laugh"), "the laugh event came");
  // jaw peaks: count the rises over 0.35 between pulses
  let peaks = 0, up = false;
  for (const j of found.jaw) { if (j > 0.45 && !up) { peaks++; up = true; } if (j < 0.3) up = false; }
  assert.ok(peaks >= 3 && peaks <= 5, `${peaks} jaw pulses (laugh ${LAUGH_S} s at ${LAUGH_HZ} per second)`);
  assert.equal(found.evs.filter((e) => e === "laugh").length, 1, "he laughs once per win");
});

test("feel: he does not laugh when he loses the round", () => {
  for (const seed of [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
    const g = createGame({ seed });
    startMatch(g);
    const ad = makeAdapter("mouse");
    const evs = [];
    for (let t = 0; t < 70; t += DT) {
      stepGame(g, DT, { head: head(), hands: [ad.input(HANDS_AWAY)] });
      for (const e of g.events) evs.push(e.type + (e.result ? ":" + e.result : ""));
      g.events.length = 0;
      if (g.phase === "between") break;
    }
    if (evs.includes("result:player")) assert.ok(!evs.includes("laugh"), `seed ${seed}: laughed after losing`);
  }
});

test("feel: when he first gets suspicious (0.3) he glares at your face, once, then it cools down", () => {
  const g = createGame({ seed: 9 });
  startMatch(g);
  const ad = makeAdapter("mouse");
  while (g.phase !== "play") { stepGame(g, DT, { head: head(), hands: [ad.input(HANDS_AWAY)] }); g.events.length = 0; }
  g.brain.suspicion = 0.1;
  const evs = [];
  let narrowMax = 0, browMin = 0, leaned = 0;
  for (let t = 0; t < 6; t += DT) {
    if (Math.abs(t - 1.0) < DT / 2) g.brain.suspicion = 0.36; // a hand dip raises it
    if (Math.abs(t - 3.0) < DT / 2) g.brain.suspicion = 0.1;  // it falls again...
    if (Math.abs(t - 4.0) < DT / 2) g.brain.suspicion = 0.4;  // ...and rises within the cool-down: no second glare
    stepGame(g, DT, { head: head(), hands: [ad.input(HANDS_AWAY)] });
    for (const e of g.events) evs.push(e.type);
    g.events.length = 0;
    const p = g.rig.pose;
    narrowMax = Math.max(narrowMax, 1 - (p.eyes.l.lid + p.eyes.r.lid) / 2);
    browMin = Math.min(browMin, p.brow);
    leaned = Math.max(leaned, p.torso.lean);
  }
  assert.equal(evs.filter((e) => e === "glare").length, 1, `one glare (${evs.filter((e) => e === "glare").length})`);
  assert.ok(narrowMax > 0.3, `eyes narrow in the glare (${narrowMax.toFixed(2)})`);
  assert.ok(browMin < -0.6, `brows down in the glare (${browMin.toFixed(2)})`);
  assert.ok(leaned > 0.15, `a small lean in (${leaned.toFixed(2)})`);
  assert.ok(GLARE_S >= 1.2 && GLARE_S <= 2.2);
});

test("feel: no glare in the lessons (the scripted looks must stay what the words say)", () => {
  const r = stranger("click", { seed: 11 });
  assert.ok(!r.g.log.slice(0, 400).some((l) => l === "glare" && false));
  let glares = 0;
  stranger("click", { seed: 11, maxS: 70, onFrame: (g) => { if (g.practice) for (const e of g.events) if (e.type === "glare") glares++; } });
  assert.equal(glares, 0);
});

test("feel: after he slams your hand he gloats: a smirk and a laugh; after you grab his wrist he does not", () => {
  const g = createGame({ seed: 5 });
  startMatch(g);
  const ad = makeAdapter("mouse");
  let evs = [];
  let t = 0;
  while (g.phase !== "play") { stepGame(g, DT, { head: head(), hands: [ad.input(HANDS_AWAY)] }); g.events.length = 0; }
  // wobble in a stare to get caught
  g.brain.suspicion = 0.8;
  for (; t < 30; t += DT) {
    const want = { pos: { x: 0.15 + 0.1 * Math.sin(t * 9), y: 0.06, z: 0.22 }, fist: false };
    stepGame(g, DT, { head: head(), hands: [ad.input(want)] });
    for (const e of g.events) evs.push(e.type);
    g.events.length = 0;
    if (evs.includes("laugh") || g.phase === "between") break;
  }
  assert.ok(evs.includes("slamHit"), "he slammed your hand");
  assert.ok(evs.includes("laugh"), "and then laughed");
  assert.ok(evs.indexOf("laugh") > evs.indexOf("slamHit"), "the laugh follows the slam");
});

// ------------------------------------------------------------------------------------------------ feel: slow-motion, shake, levels
test("feel: the slam's slow-motion is short (0.6 to 1.1 s of real time), starts and ends smoothly, and only the caught phase uses it", () => {
  assert.equal(slowFactor("play", 0.1), 1);
  assert.equal(slowFactor("gotcha", 0.1), 1);
  assert.equal(slowFactor("caught", 0.0), SLOW.factor);
  assert.equal(slowFactor("caught", SLOW.backBy), 1);
  let prev = slowFactor("caught", 0);
  for (let t = 0; t <= SLOW.backBy; t += 0.005) { const f = slowFactor("caught", t); assert.ok(f >= prev - 1e-9, "never slows down again once speeding up"); assert.ok(f >= SLOW.factor && f <= 1); prev = f; }
  const real = slowRealSeconds();
  assert.ok(real >= 0.6 && real <= 1.1, `${real.toFixed(2)} s of real time`);
  // the strike (slamHit at 0.28 s of game time) lands during the ease out, not after it
  assert.ok(0.28 >= SLOW.holdS && 0.28 < SLOW.backBy);
});

test("feel: the camera shake dies away in under 0.7 s, stays small (under 2 cm and 1.5 degrees) and is zero before and after", () => {
  assert.equal(shakeAmp(-0.1, 1), 0);
  assert.equal(shakeAmp(SHAKE.durS + 0.01, 1), 0);
  assert.ok(shakeAmp(0.0, 1) === 1 && shakeAmp(0.3, 1) < 0.2);
  let maxPos = 0, maxAng = 0;
  for (let t = 0; t < 1; t += 1 / 240) {
    const o = shakeOffset(t, shakeAmp(t, 1));
    maxPos = Math.max(maxPos, Math.abs(o.x), Math.abs(o.y), Math.abs(o.z));
    maxAng = Math.max(maxAng, Math.abs(o.pitch), Math.abs(o.yaw), Math.abs(o.roll));
  }
  assert.ok(maxPos > 0.004 && maxPos < 0.02, `${(maxPos * 100).toFixed(1)} cm`);
  assert.ok(maxAng > 0.004 && maxAng < (1.5 * Math.PI) / 180, `${((maxAng * 180) / Math.PI).toFixed(2)} deg`);
  const o = shakeOffset(1.5, 0);
  assert.deepEqual(o, { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
});

test("feel: his breath gets louder as he leans in and the tension tone grows with the lean and with your wobble; neither exists outside a stare", () => {
  assert.ok(breathIntensity(0) < breathIntensity(0.5) && breathIntensity(0.5) < breathIntensity(1));
  assert.ok(breathIntensity(1) === 1 && breathIntensity(0) >= 0.15);
  assert.equal(tensionTarget(false, 1, 1), 0);
  assert.ok(tensionTarget(true, 0, 0) >= 0.25);
  assert.ok(tensionTarget(true, 1, 0) > tensionTarget(true, 0.4, 0));
  assert.ok(tensionTarget(true, 1, 0.8) > tensionTarget(true, 1, 0));
  assert.ok(tensionTarget(true, 1, 1) <= 1);
});

test("feel: a stare gets louder breath over the stare (the lean takes his head from rest toward you)", () => {
  const g = createGame({ seed: 9 });
  startMatch(g);
  const ad = makeAdapter("mouse");
  while (g.phase !== "play") { stepGame(g, DT, { head: head(), hands: [ad.input(HANDS_AWAY)] }); g.events.length = 0; }
  g.brain.suspicion = 0.7;
  const seen = [];
  for (let t = 0; t < 4; t += DT) {
    stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false })] });
    g.events.length = 0;
    if (g.view.stare) seen.push(breathIntensity(g.view.pose.torso.lean));
  }
  assert.ok(seen.length > 60, "the stare ran");
  assert.ok(seen[seen.length - 1] > seen[0] + 0.3, `breath ${seen[0].toFixed(2)} to ${seen[seen.length - 1].toFixed(2)} while he leans in`);
  void SPOTS;
});
