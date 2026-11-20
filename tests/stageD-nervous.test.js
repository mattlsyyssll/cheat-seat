/** Stage D, judge fix 7: a normal nervous player (picks the card up, then keeps moving his hand about the felt, at about 0.3 to 0.6 m/s) must get
 * a real slam in an ordinary round (no practice) within a minute, on most seeds. A calm player who holds still must not be slammed for nothing.
 * Same adapter as the mouse (helpers-duel.js makeAdapter("mouse")): the rules see HandInput only. */
import test from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame } from "../src/game/duel.js";
import { makeAdapter, HEAD } from "./helpers-duel.js";
import { SPOTS } from "../src/game/booth.js";
import { createRng, nextFloat } from "../src/game/rng.js";

const DT = 1 / 60;
const LAY = { x: SPOTS.playerLay.x, y: 0.045, z: SPOTS.playerLay.z };
const head = () => ({ pos: HEAD.pos, dir: { x: 0, y: -0.2, z: -1 } });

/** Plays an ordinary round as a nervous (or calm) person. Returns the seconds to the first slam, or null. */
function play({ seed, nervous = true, maxS = 70, low = false }) {
  const g = createGame({ seed });
  startMatch(g);
  const ad = makeAdapter("mouse");
  const rnd = createRng(seed * 7 + 3);
  let pos = { x: 0.2, y: 0.05, z: 0.25 };
  let target = { ...pos };
  let speed = 0.4;
  let fist = false;
  let next = 0;
  let clicked = false;
  let t = 0;
  let slamAt = null, catchAt = null;
  while (t < maxS && slamAt === null) {
    const v = g.view;
    const laid = v && (v.card.state === "laid" || v.card.state === "down") && v.phase === "play";
    const held = v && v.card.held;
    if (laid && !clicked && t > 2) {
      target = { ...LAY };
      speed = 0.5;
      if (Math.hypot(pos.x - LAY.x, pos.z - LAY.z) < 0.03) { fist = true; clicked = true; }
    }
    if (!laid && !held) clicked = false;
    if (held && nervous && (t >= next || Math.hypot(target.x - pos.x, target.y - pos.y, target.z - pos.z) < 0.02)) {
      // a new restless target as soon as the last is reached (or every 0.6 to 1.4 s), a fist or an open hand at random: the hand never rests
      next = t + 0.6 + nextFloat(rnd) * 0.8;
      // `low`: the hand wanders in the near part of the table, close to the player (the pixels of the lower third of the screen)
      target = low ? { x: -0.4 + nextFloat(rnd) * 0.8, y: 0.04 + nextFloat(rnd) * 0.05, z: 0.2 + nextFloat(rnd) * 0.2 } : { x: -0.3 + nextFloat(rnd) * 0.6, y: 0.05 + nextFloat(rnd) * 0.12, z: 0.0 + nextFloat(rnd) * 0.28 };
      speed = 0.3 + nextFloat(rnd) * 0.3;
      fist = nextFloat(rnd) < 0.6;
    }
    if (held && !nervous) { target = { ...pos }; fist = true; }
    // move toward the target
    const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
    const d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, speed * DT);
    if (d > 1e-6) pos = { x: pos.x + (dx / d) * step, y: pos.y + (dy / d) * step, z: pos.z + (dz / d) * step };
    const evs = stepGame(g, DT, { head: head(), hands: [ad.input({ pos, fist })] });
    for (const e of evs.splice(0, evs.length)) {
      if (e.type === "slamHit" && slamAt === null) slamAt = t;
      if (e.type === "caught" && catchAt === null) catchAt = t;
    }
    t += DT;
  }
  return { slamAt, catchAt };
}

test("a nervous player is slammed within a minute on most seeds (judge fix 7)", () => {
  const times = [];
  for (let seed = 1; seed <= 30; seed++) times.push(play({ seed }).slamAt);
  const hit = times.filter((x) => x !== null).sort((a, b) => a - b);
  const med = hit.length ? hit[Math.floor(hit.length / 2)] : Infinity;
  const within60 = times.filter((x) => x !== null && x <= 60).length;
  console.log(`# nervous player: slam in ${hit.length} of 30 seeds, median ${med.toFixed(1)} s, within 60 s: ${within60}`);
  assert.ok(within60 >= 27, `at least 27 of 30 seeds must see a slam within 60 s (got ${within60})`);
  assert.ok(med <= 35, `median time to the slam must be at most 35 s (got ${med})`);
});

test("a calm player who holds still is not slammed in the first 40 seconds", () => {
  let slammed = 0;
  for (let seed = 1; seed <= 20; seed++) if (play({ seed, nervous: false, maxS: 40 }).slamAt !== null) slammed++;
  assert.ok(slammed <= 2, `a calm player must almost never be slammed in 40 s (got ${slammed} of 20)`);
});

test("a nervous player whose hand stays in the near part of the table (the lower third of the screen) is slammed within a minute too", () => {
  const times = [];
  for (let seed = 1; seed <= 30; seed++) times.push(play({ seed, low: true }).slamAt);
  const hit = times.filter((x) => x !== null).sort((a, b) => a - b);
  const med = hit.length ? hit[Math.floor(hit.length / 2)] : Infinity;
  const within60 = times.filter((x) => x !== null && x <= 60).length;
  console.log(`# nervous low hands: slam in ${hit.length} of 30 seeds, median ${med.toFixed(1)} s, within 60 s: ${within60}`);
  assert.ok(within60 >= 26, `at least 26 of 30 seeds must see a slam within 60 s (got ${within60})`);
  assert.ok(med <= 40, `median time to the slam must be at most 40 s (got ${med})`);
});
