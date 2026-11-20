/** Stage F: the guided first match (no lesson rounds), the soft first stare, the cheat that wins during his glance, his cuff in round 2, tips that never wait. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame, COACH, setTips } from "../src/game/duel.js";
import { coachStranger, head } from "./helpers-stranger.js";
import { makeClickMouse } from "./helpers-duel.js";
import { rankOf } from "../src/game/cards.js";

const DT = 1 / 60;

test("the first deal is round 1 of the real match: no lesson rounds, the round is in play within 2 s", () => {
  const r = coachStranger({ rounds: 1 });
  assert.equal(r.g.practice, null);
  assert.ok(r.firstPlayAt !== null && r.firstPlayAt < 2, `first play at ${r.firstPlayAt}`);
  assert.equal(r.g.view.rounds, 7);
});

for (const seed of [3, 7, 11, 19, 23, 42]) {
  test(`seed ${seed}: a stranger who follows the tips cheats during his glance in round 1 and wins it, then sees his cuff and catches him`, () => {
    const r = coachStranger({ seed, rounds: 2 });
    const order = ["c-take", "c-fist", "c-stare", "c-under", "c-swap", "c-hide"];
    let i = -1;
    for (const id of order) { const j = r.steps.indexOf(id); assert.ok(j > i, `${id} out of order or missing: ${r.steps.join(" ")}`); i = j; }
    assert.ok(r.steps.includes("c-cuff"), `no cuff tip: ${r.steps.join(" ")}`);
    const swap = r.events.find((e) => e.type === "swap");
    assert.ok(swap && swap.coach, "the swap during his glance is the coached one");
    const res = r.events.find((e) => e.type === "result");
    assert.ok(res, `round 1 had no showdown: ${r.g.log.join(" ")}`);
    assert.equal(res.result, "player", `round 1 result ${JSON.stringify(res)}`);
    assert.ok(res.swapped, "won with the sleeve card");
    assert.ok(rankOf(res.player) > rankOf(res.shark));
    assert.ok(r.events.some((e) => e.type === "gotcha"), `the stranger did not catch him: ${r.g.log.slice(-30).join(" ")}`);
    assert.equal(r.g.match.strikes.player, 0);
    assert.equal(r.g.match.strikes.shark, 1, "catching him is a real strike for him");
    assert.ok(r.g.view.buttons.player > r.g.view.buttons.shark, "the score shows you ahead");
  });
}

test("each tip shows once (the take tip may return as a nudge): after the scripted rounds no tip comes back for the same situation", () => {
  const r = coachStranger({ seed: 7, rounds: 5, maxS: 200 });
  const counts = {};
  for (const id of r.steps) counts[id] = (counts[id] ?? 0) + 1;
  // the take tip may come back as a nudge when a card lies untouched for 9 s (a later test); every other tip shows once
  for (const [id, n] of Object.entries(counts)) if (id !== "c-take") assert.equal(n, 1, `${id} shown ${n} times: ${r.steps.join(" ")}`);
  assert.ok(r.g.coach.finished, "the guided rounds are over");
});

test("tips never wait: a player who does nothing still moves through the rounds (no forced lesson block)", () => {
  const r = coachStranger({ seed: 5, rounds: 3, maxS: 200, idle: true });
  assert.ok(r.g.match.round >= 3 || r.g.match.phase === "over", `stuck in round ${r.g.match.round}: ${r.g.log.slice(-10).join(" ")}`);
});

test("tips off: no words and no rings, the scripted rounds still play", () => {
  const g = createGame({ seed: 7, coach: true });
  setTips(g, false);
  startMatch(g);
  const ad = makeClickMouse();
  let any = false;
  for (let t = 0; t < 30; t += DT) {
    stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.2, y: 0.05, z: 0.25 }, fist: false })] });
    if (g.view.prompt || g.view.cue) any = true;
    g.events.length = 0;
  }
  assert.equal(any, false);
  assert.equal(g.coach.script, "glance");
});

test("his first stare is soft: a twitch is forgiven, a real move is still caught", () => {
  // the same twitch (0.12 m/s for 0.25 s) in a scripted soft stare and in a full one
  const run = (soft) => {
    const g = createGame({ seed: 7, coach: true });
    startMatch(g);
    const ad = makeClickMouse();
    const LAY = { x: 0, y: 0.045, z: 0.09 };
    let pos = { ...LAY }, fist = false, t = 0, twitched = false, phase = "take";
    while (t < 20) {
      if (phase === "take" && g.phase === "play") { fist = true; phase = "took"; }
      else if (phase === "took" && g.card.state === "held") { fist = false; phase = "wait"; }
      if (phase === "wait" && g.brain.mode === "stare" && g.brain.t > 0.6 && !twitched) {
        if (!soft) g.brain.script.soft = 1;
        twitched = true; phase = "twitch"; var tw = 0;
      }
      if (phase === "twitch") { tw += DT; pos = { ...pos, x: pos.x + 0.12 * DT }; if (tw > 0.25) phase = "still"; }
      stepGame(g, DT, { head: head(), hands: [ad.input({ pos, fist })] });
      if (g.events.some((e) => e.type === "caught")) return "caught";
      g.events.length = 0;
      t += DT;
    }
    return twitched ? "forgiven" : "no stare";
  };
  assert.equal(run(true), "forgiven");
  assert.equal(run(false), "caught");
});

test("the coach script table: the glance round is soft and scripted, the cuff round cheats with a long window", () => {
  assert.ok(COACH.glance.noRandom && COACH.glance.soft < 1 && COACH.glance.look.kind === "own" && COACH.glance.look.afterStare);
  assert.ok(COACH.cuff.cheat.window >= 5);
});

test("a slow player (1.6 s to read each tip) still gets away with the cheat in round 1: no stare and no slam after the lay", () => {
  for (const seed of [3, 7, 11, 19]) {
    const r = coachStranger({ seed, rounds: 1, readS: 1.6 });
    const res = r.events.find((e) => e.type === "result");
    assert.ok(!r.events.some((e) => e.type === "caught"), `seed ${seed}: caught in round 1: ${r.g.log.join(" ")}`);
    assert.ok(res && res.result === "player" && res.swapped, `seed ${seed}: ${JSON.stringify(res)}`);
  }
});

test("in the guided first match a catch in a scripted round is a warning; after the scripted rounds a catch is a strike", () => {
  const g = createGame({ seed: 7, coach: true, warn: true });
  startMatch(g);
  assert.equal(g.coach.script, "glance");
  assert.equal(g.match.warn, true);
  // play idle until the scripted rounds are over
  const ad = makeClickMouse();
  for (let t = 0; t < 200 && !g.coach.finished; t += DT) { stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.2, y: 0.05, z: 0.25 }, fist: false })] }); g.events.length = 0; }
  assert.ok(g.coach.finished);
  assert.equal(g.match.warn, false, "after the guided rounds the first catch is a real strike");
});

test("a finger that points down at the pause pad is not pointing at nothing (no suspicion); pointing at the middle of the table still is", async () => {
  const { MENU } = await import("../src/game/menu.js");
  const run = (target) => {
    const g = createGame({ seed: 7 });
    startMatch(g);
    for (let t = 0; t < 2.2; t += DT) { stepGame(g, DT, { head: head(), hands: [] }); g.events.length = 0; }
    g.brain.suspicion = 0;
    const o = { x: target.x, y: 0.2, z: target.z + 0.15 };
    const d = { x: target.x - o.x, y: 0 - o.y, z: target.z - o.z };
    const evs = [];
    for (let t = 0; t < 0.8; t += DT) {
      stepGame(g, DT, { head: head(), hands: [{ id: "right", tracked: true, pos: o, fist: false, pointRay: { o, d } }] });
      evs.push(...g.events.map((e) => e.type));
      g.events.length = 0;
    }
    return { evs, susp: g.brain.suspicion };
  };
  const pad = run({ x: MENU.pad.x, z: MENU.pad.z });
  assert.ok(pad.evs.includes("pointPad") && !pad.evs.includes("pointNothing"), pad.evs.join(" "));
  const mid = run({ x: -0.1, z: 0.0 });
  assert.ok(mid.evs.includes("pointNothing"), mid.evs.join(" "));
});

test("a card left untouched for 9 s in the guided first match brings the take tip back (no silent round for a slow first-timer)", () => {
  const g = createGame({ seed: 7, coach: true });
  startMatch(g);
  g.coach.seen["c-take"] = true; // as if round 1 had shown it
  const ad = makeClickMouse();
  let shownAt = null;
  for (let t = 0; t < 14; t += DT) {
    stepGame(g, DT, { head: head(), hands: [ad.input({ pos: { x: 0.25, y: 0.05, z: 0.25 }, fist: false })] });
    if (g.view.prompt === "c-take" && shownAt === null) shownAt = t;
    g.events.length = 0;
  }
  assert.ok(shownAt !== null && shownAt > 9 && shownAt < 12, `shown at ${shownAt}`);
});
