import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame, PRACTICE, LESSONS, BEAT_S, SHOW_AT_S } from "../src/game/duel.js";
import { makeAdapter, makeClickMouse, HEAD } from "./helpers-duel.js";
import { stranger, head } from "./helpers-stranger.js";
import { SPOTS, BODY } from "../src/game/booth.js";
import { rankOf } from "../src/game/cards.js";

const DT = 1 / 60;
const LAY = { x: SPOTS.playerLay.x, y: 0.045, z: SPOTS.playerLay.z };

test("the practice rounds script the Shark: one verb per round, in the order palm, stare, wrist, under the table", () => {
  assert.equal(PRACTICE.length, 5);
  assert.equal(LESSONS.length, 5);
  assert.ok(PRACTICE[1].look.kind === "hands" && PRACTICE[2].stare && PRACTICE[3].cheat && PRACTICE[4].look.kind === "own");
});

for (const kind of ["click"]) {
  test(`a stranger who follows the words (${kind === "click" ? "real one-frame clicks" : "adapter"}) finishes the four lessons and the real match starts`, () => {
    const r = stranger(kind);
    assert.equal(r.g.practice, null, `practice not finished; prompts so far: ${r.steps.join(" ")}; log ${r.g.log.slice(-12).join(" ")}`);
    for (const id of ["p1-grab", "p1-fist", "p1-open", "p1-lay", "p2-still", "p3-grab", "p4-take", "p4-wait", "p4-under", "p4-swap", "p4-lay"]) assert.ok(r.steps.includes(id), `line ${id} never shown (${r.steps.join(" ")})`);
    for (const e of ["practiceStep:2", "practiceStep:3", "practiceStep:4", "practiceDone", "gotcha", "swap:", "stareEnd"]) assert.ok(r.g.log.some((l) => l.startsWith(e)), `${e} missing: ${r.g.log.join(" ")}`);
    console.log(`lessons, ${kind}: ${r.t.toFixed(1)} s of game time`);
    assert.ok(r.t < 80, `took ${r.t.toFixed(0)} s`);
    assert.equal(r.g.match.strikes.player, 0, "practice never costs a strike");
    assert.equal(r.g.match.round, 1, "the real match starts at round 1");
  });
}

test("a press-and-hold also picks up the card and the lessons still finish", () => {
  const r = stranger("click", { holdClick: true });
  assert.equal(r.g.practice, null, `not finished: ${r.steps.join(" ")}`);
});

test("each line appears only after the step before it is done, in the order of the lesson", () => {
  const r = stranger("click");
  const order = (a, b, c) => { const i = r.steps.indexOf(a), j = r.steps.indexOf(b); assert.ok(i >= 0 && j > i, `${a} should come before ${b}: ${r.steps.join(" ")}`); void c; };
  order("p1-grab", "p1-fist");
  order("p1-fist", "p1-open");
  order("p1-open", "p1-lay");
  order("p1-lay", "p2-wait");
  order("p2-wait", "p2-still");
  order("p2-still", "p3-wait");
  order("p3-wait", "p3-grab");
  order("p3-grab", "p4-take");
  order("p4-take", "p4-wait");
  order("p4-wait", "p4-under");
  order("p4-under", "p4-swap");
  order("p4-swap", "p4-lay");
});

test("a lesson round never ends while its step is open, and nothing times out", () => {
  const r = stranger("click");
  for (const e of r.roundEnds) assert.ok(e.done || e.tries > 0, `a round ended with lesson ${e.step} open: ${JSON.stringify(e)}`);
  // a player who does nothing for two minutes is still in lesson 1, in the same round, with the first line showing
  const g = createGame({ seed: 4, practice: true });
  startMatch(g);
  for (let t = 0; t < 120; t += DT) { stepGame(g, DT, { head: head(), hands: [makeAdapter("mouse").input({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false })] }); g.events.length = 0; }
  assert.equal(g.practice.step, 1);
  assert.equal(g.match.round, 1, "no round went by");
  assert.equal(g.phase, "play");
  assert.equal(g.view.prompt, "p1-grab");
});

test("lesson 1 does not count a quick click as the palm: the palm needs the button held", () => {
  const g = createGame({ seed: 4, practice: true });
  startMatch(g);
  const ad = makeClickMouse();
  let t = 0;
  const step = (want) => { stepGame(g, DT, { head: head(), hands: [ad.input(want)] }); g.events.length = 0; t += DT; };
  while (g.phase !== "play") step({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false });
  for (let i = 0; i < 40; i++) step({ pos: LAY, fist: false });
  step({ pos: LAY, fist: true });
  for (let i = 0; i < 90; i++) step({ pos: LAY, fist: false });
  assert.equal(g.card.state, "held", "a one-frame click picked the card up");
  assert.equal(g.view.prompt, "p1-fist", "the next line asks for the held button; the click was not the palm");
  assert.equal(g.practice.sawPalm, false);
  assert.equal(g.card.state, "held", "and the card stays in the hand (not laid again by itself)");
  for (let i = 0; i < 180; i++) step({ pos: LAY, fist: false });
  assert.equal(g.card.state, "held", "waiting with the open hand over the ring does not lay a card you have not palmed");
  // now the palm: hold the button
  for (let i = 0; i < 40; i++) step({ pos: LAY, fist: true });
  assert.equal(g.view.prompt, "p1-open");
  for (let i = 0; i < 20; i++) step({ pos: LAY, fist: false });
  assert.equal(g.view.prompt, "p1-lay");
  for (let i = 0; i < 90; i++) step({ pos: LAY, fist: false });
  assert.equal(g.card.state, "held", "an open hand resting over the ring does not lay the card by itself (it may be waiting for the right moment)");
  step({ pos: LAY, fist: true });
  for (let i = 0; i < 40; i++) step({ pos: LAY, fist: false });
  assert.equal(g.card.state, "laid", "a click on the ring puts the card down");
});

test("the pick-up click itself does not put the card down again, and a held fist that is let go over the ring is a palm, not a lay", () => {
  for (const holdS of [0.0, 0.5, 0.9]) {
    const g = createGame({ seed: 4 });
    startMatch(g);
    const ad = makeClickMouse();
    const step = (want, n = 1) => { for (let i = 0; i < n; i++) { stepGame(g, DT, { head: head(), hands: [ad.input(want)] }); g.events.length = 0; } };
    while (g.phase !== "play") step({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false });
    step({ pos: LAY, fist: false }, 30);
    step({ pos: LAY, fist: true }, Math.max(1, Math.round(holdS * 60)));
    step({ pos: LAY, fist: false }, 120);
    assert.equal(g.card.state, "held", `a pick-up by a ${holdS} s press stays in the hand`);
  }
  // later: a fist held 0.8 s over the ring and let go is the palm (the card shows again), not a lay
  const g = createGame({ seed: 4 });
  startMatch(g);
  const ad = makeClickMouse();
  const step = (want, n = 1) => { for (let i = 0; i < n; i++) { stepGame(g, DT, { head: head(), hands: [ad.input(want)] }); g.events.length = 0; } };
  while (g.phase !== "play") step({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false });
  step({ pos: LAY, fist: false }, 30);
  step({ pos: LAY, fist: true }, 2);
  step({ pos: LAY, fist: false }, 90);
  step({ pos: LAY, fist: true }, 48);
  step({ pos: LAY, fist: false }, 60);
  assert.equal(g.card.state, "held", "a held fist let go over the ring shows the card; it does not lay it");
  assert.equal(g.card.shown, true);
});

test("F1: a click of any length under 0.3 s picks the card up, with a real mouse at 60 and at 15 frames per second", () => {
  for (const fps of [60, 30, 15]) {
    for (const seconds of [0, 0.02, 0.1, 0.25, 0.299]) {
      const g = createGame({ seed: 8 });
      startMatch(g);
      const dt = 1 / fps;
      const ad = makeClickMouse(dt);
      const frame = (want, n) => { for (let i = 0; i < n; i++) { stepGame(g, dt, { head: head(), hands: [ad.input(want)] }); g.events.length = 0; } };
      while (g.phase !== "play") frame({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false }, 1);
      frame({ pos: LAY, fist: false }, Math.ceil(0.4 * fps));
      frame({ pos: LAY, fist: true }, Math.max(1, Math.round(seconds * fps)));
      frame({ pos: LAY, fist: false }, 3 * fps);
      assert.equal(g.card.state, "held", `a click of ${seconds} s (${Math.max(1, Math.round(seconds * fps))} frames) at ${fps} fps did not pick the card up`);
    }
  }
});

test("lesson 3: he cheats again until you catch him, and the round ends only with the catch", () => {
  const g = createGame({ seed: 5, practice: true });
  startMatch(g);
  g.practice.step = 3;
  g.brain.script = null;
  // jump to lesson 3 cleanly: end this round by hand and start round 3 through the normal path
  const ad = makeAdapter("mouse");
  g.practice.step = 3; g.practice.done = false;
  // restart the round with the lesson-3 script
  g.started = false; g.practice.step = 3;
  startMatch(g);
  let cheats = 0, t = 0;
  while (t < 40 && g.phase !== "gotcha") {
    stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false })] });
    for (const e of g.events) if (e.type === "cheatTell") cheats++;
    g.events.length = 0;
    t += DT;
  }
  assert.ok(cheats >= 2, `he cheated ${cheats} time(s) while we did nothing`);
  assert.equal(g.phase === "gotcha", false, "without a grab the round goes on");
  assert.equal(g.view.practice.done, false);
});

test("moving in the lesson stare is a warning, never a strike, and the same lesson comes again", () => {
  const g = createGame({ seed: 3, practice: true });
  startMatch(g);
  g.practice.step = 2;
  g.started = false;
  startMatch(g);
  const ad = makeAdapter("mouse");
  let caught = false;
  for (let t = 0; t < 14; t += DT) {
    const want = { pos: { x: 0.15 + 0.1 * Math.sin(t * 9), y: 0.06, z: 0.22 }, fist: false };
    stepGame(g, DT, { head: head(), hands: [ad.input(want)] });
    if (g.events.some((e) => e.type === "caught")) caught = true;
    g.events.length = 0;
    if (caught && g.phase === "play" && g.view.practice.tries > 0) break;
  }
  assert.ok(caught, "the wobble was caught");
  assert.equal(g.match.strikes.player, 0, "no strike in a lesson");
  assert.equal(g.practice.step, 2, "the same lesson again");
  assert.equal(g.practice.tries, 1);
});

test("F2: after every round the result stays on the table for 2 to 3 seconds with both cards face up, the pot goes to the winner and he reacts", () => {
  assert.ok(BEAT_S >= 2 && BEAT_S <= 3.2, "the beat is 2 to 3 seconds");
  const g = createGame({ seed: 21 });
  startMatch(g);
  const ad = makeAdapter("mouse");
  let tResult = null, tGone = null, beat = null, buttonsAtResult = null, potBefore = null, react = null;
  for (let t = 0; t < 70 && tGone === null; t += DT) {
    if (g.phase === "play" && potBefore === null) potBefore = g.match.pot;
    stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false })] });
    for (const e of g.events) if (e.type === "result") { tResult = t; beat = { ...g.view.beat }; buttonsAtResult = { ...g.match.buttons }; react = g.brain.react ? g.brain.react.kind : null; assert.ok(e.player !== undefined && e.shark !== undefined && e.pot > 0, "the result event carries both cards and the pot"); }
    g.events.length = 0;
    if (tResult !== null && g.phase === "between" && tGone === null) tGone = t;
  }
  assert.ok(tResult !== null && tGone !== null, "a round ran to its result");
  assert.ok(tGone - tResult >= 2.5 && tGone - tResult <= 3.2, `the beat lasted ${(tGone - tResult).toFixed(2)} s`);
  assert.ok(beat.player !== null && beat.shark !== null, "both cards are known");
  assert.equal(g.view.sharkCard.up, true, "his card is face up while the beat runs");
  assert.ok(["win", "lose", "tie"].includes(react), `he reacts (${react})`);
  assert.equal(rankOf(beat.player) > rankOf(beat.shark) ? "player" : rankOf(beat.player) < rankOf(beat.shark) ? "shark" : "tie", beat.result === "cards" ? beat.result && (g.lastFinal?.result) : g.lastFinal?.result, "the beat names the real winner");
  assert.ok(buttonsAtResult.player + buttonsAtResult.shark > 0 && g.lastFinal.pot === beat.pot);
  assert.ok(SHOW_AT_S + BEAT_S < 4);
});

test("F2: a catch and a grab leave a beat too: who, why and the card", () => {
  const g = createGame({ seed: 5, practice: true });
  startMatch(g);
  g.practice.step = 3; g.started = false; startMatch(g);
  const ad = makeAdapter("mouse");
  let beat = null;
  let t = 0;
  let want = { pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false };
  while (t < 30 && !beat) {
    const b = g.brain;
    if (b.mode === "cheat" && b.cheat?.phase === "under") {
      const w = BODY.cheatWrist;
      want = { pos: { x: w.x, y: w.y + 0.045, z: w.z + 0.06 }, fist: true };
    }
    stepGame(g, DT, { head: head(), hands: [ad.input(want)] });
    if (g.phase === "gotcha" && g.view.beat) beat = { ...g.view.beat };
    g.events.length = 0;
    t += DT;
  }
  assert.ok(beat, "the grab left a beat");
  assert.equal(beat.kind, "gotcha");
  assert.equal(beat.result, "player");
  assert.ok(Number.isInteger(beat.card), "the card from his sleeve is named");
});

test("the Shark's face shows the result: smug when he wins, angry when he loses", () => {
  const faces = {};
  for (const seed of [21, 22, 23, 24, 25, 26, 27, 28]) {
    const g = createGame({ seed });
    startMatch(g);
    const ad = makeAdapter("mouse");
    for (let t = 0; t < 70; t += DT) {
      stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false })] });
      g.events.length = 0;
      if (g.brain.react?.kind === "win" && g.brain.react.t > 1.0 && faces.win && faces.win.lateRoll === undefined) faces.win.lateRoll = g.rig.pose.head.roll;
      if (g.brain.react && g.brain.react.t > 0.3 && g.brain.react.t < 0.345 && !faces[g.brain.react.kind]) { // before the laugh starts (0.35 s)
        const p = g.rig.pose;
        faces[g.brain.react.kind] = { brow: p.brow, jaw: p.jaw, lid: (p.eyes.l.lid + p.eyes.r.lid) / 2, skew: p.brows.r - p.brows.l, roll: p.head.roll };
      }
      if (g.phase === "between") break;
    }
  }
  assert.ok(faces.win && faces.lose, `saw both faces: ${Object.keys(faces)}`);
  assert.ok(faces.win.skew > 0.6, `smirk: one brow up, one down (skew ${faces.win.skew})`);
  assert.ok(faces.win.lid < 0.85, `smirk: eyes half shut (lid ${faces.win.lid})`);
  assert.ok(faces.win.lateRoll > 0.05, `smirk: head tilted (roll ${faces.win.lateRoll})`);
  assert.ok(faces.lose.brow < -0.4, `angry brow ${faces.lose.brow}`);
  assert.ok(faces.lose.jaw > faces.win.jaw, "teeth when he loses");
});

test("the Point tip shows exactly once, for at most 7 s, in the real match, the first time he watches your hand while you hold a card; never in the lessons or when already seen", () => {
  for (const seed of [9, 10, 11, 12]) {
    const g = createGame({ seed });
    startMatch(g);
    const ad = makeClickMouse();
    let showed = 0, was = false, firstAt = null, lastAt = null, picked = false;
    for (let t = 0; t < 80; t += DT) {
      let want = { pos: { x: 0.25, y: 0.05, z: 0.2 }, fist: false };
      if (g.phase === "play") { want = { pos: LAY, fist: !picked && g.card.state === "down" }; if (g.card.state === "held") picked = true; }
      stepGame(g, DT, { head: head(), hands: [ad.input(want)] });
      g.events.length = 0;
      const now = g.view.prompt === "tip-point";
      if (now && !was) { showed++; firstAt ??= t; }
      if (now) lastAt = t;
      was = now;
    }
    assert.equal(showed, 1, `seed ${seed}: the tip showed ${showed} times`);
    assert.ok(lastAt - firstAt <= 7.1, `seed ${seed}: the tip stayed ${(lastAt - firstAt).toFixed(1)} s`);
    assert.equal(g.tips.point, "seen");
  }
  const seen = createGame({ seed: 9, tipPointSeen: true });
  startMatch(seen);
  const ad = makeAdapter("mouse");
  for (let t = 0; t < 40; t += DT) { stepGame(seen, DT, { head: head(), hands: [ad.input({ pos: LAY, fist: false })] }); seen.events.length = 0; assert.notEqual(seen.view.prompt, "tip-point"); }
  const p = createGame({ seed: 9, practice: true });
  startMatch(p);
  for (let t = 0; t < 40; t += DT) { stepGame(p, DT, { head: head(), hands: [ad.input({ pos: LAY, fist: false })] }); p.events.length = 0; assert.notEqual(p.view.prompt, "tip-point"); }
});

test("lesson 4 swap step: a click too short shows the retry line in the same look-away, and a longer hold then swaps", () => {
  const seen = [];
  let retryWhileUnder = false, swapAfterRetry = false;
  const r = stranger("click", { quickFirst: true, onFrame: (g) => {
    const id = g.view?.prompt;
    if (id && seen[seen.length - 1] !== id) seen.push(id);
    if (id === "p4-swap-retry" && g.practice.step === 4) retryWhileUnder = true;
    if (retryWhileUnder && g.log.some((l) => l.startsWith("swap:"))) swapAfterRetry = true;
  } });
  assert.ok(seen.includes("p4-swap-retry"), `no retry line: ${seen.join(" ")}`);
  assert.ok(seen.includes("p4-swap-go"), `no 'let go now' line: ${seen.join(" ")}`);
  assert.ok(seen.indexOf("p4-swap") < seen.indexOf("p4-swap-retry") && seen.indexOf("p4-swap-retry") < seen.lastIndexOf("p4-swap-go"), seen.join(" "));
  assert.ok(swapAfterRetry, "the swap happened after the retry line");
  assert.equal(r.g.practice, null, "the lessons still finish");
});

test("lesson 4 swap step: with the button already held the line says to let go; the plain line shows before any press", () => {
  const seen = [];
  stranger("click", { onFrame: (g) => { const id = g.view?.prompt; if (id && seen[seen.length - 1] !== id) seen.push(id); } });
  const i = seen.indexOf("p4-swap");
  assert.ok(i >= 0 && seen[i + 1] === "p4-swap-go", `after the plain line comes the let-go line: ${seen.join(" ")}`);
  assert.ok(!seen.includes("p4-swap-retry"), "no retry line when the hold was long enough");
});
