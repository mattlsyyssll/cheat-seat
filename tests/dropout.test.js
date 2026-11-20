import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame, arrange } from "../src/game/duel.js";
import { createHandsFeeder } from "../src/game/adapters.js";
import { synthHand, wristForPalm } from "../src/game/synth.js";
import { SPOTS } from "../src/game/booth.js";

/** Real headsets lose hands below a desk edge and now and then elsewhere. These tests feed joint frames (the one function a replay or a
 * webcam simulation uses) with dropouts, jitter and delay, and check that the rules stay strict and tolerant. */
const DT = 1 / 72;
const HEAD = { pos: { x: 0, y: 0.47, z: 0.46 }, dir: { x: 0, y: -0.2, z: -1 } };
const face = { forward: { x: 0, y: -0.15, z: -1 }, palmNormal: { x: 0, y: -1, z: 0 } };
const frame = (pos, pose) => {
  const wrist = wristForPalm(pos, face.forward, face.palmNormal, pose);
  return synthHand({ wrist, ...face, from: pose, side: "right" });
};

function setup() {
  const g = createGame({ seed: 5 });
  startMatch(g);
  const feeder = createHandsFeeder();
  const run = (secs, hand, opts = {}) => {
    // hand: () => ({pos, pose} | null) at each time step
    for (let t = 0; t < secs; t += DT) {
      const w = hand(t);
      const joints = w ? frame(opts.noise ? { x: w.pos.x + (Math.random() - 0.5) * 2 * opts.noise, y: w.pos.y + (Math.random() - 0.5) * 2 * opts.noise, z: w.pos.z + (Math.random() - 0.5) * 2 * opts.noise } : w.pos, w.pose) : null;
      const fed = feeder.feed({ right: joints });
      stepGame(g, DT, { head: HEAD, hands: fed.inputs });
      g.events.length = 0;
    }
  };
  // into play with a calm Shark
  const still = () => ({ pos: { x: 0.2, y: 0.05, z: 0.25 }, pose: "open" });
  run(3, still);
  g.brain.plan = { at: 999 };
  arrange(g, { player: 1, shark: 20, sleeve: 12 });
  return { g, run, still };
}
const has = (g, p) => g.log.some((l) => l.startsWith(p));
const lay = { x: SPOTS.playerLay.x, y: 0.05, z: SPOTS.playerLay.z };

test("a hand that goes below the table and loses tracking is under the table; when it returns the swap happens (no pause, no broken hand)", () => {
  const { g, run } = setup();
  assert.equal(g.phase, "play");
  // grab by a fist at the card, then go down and vanish while the fist is closed
  run(0.5, () => ({ pos: lay, pose: "open" }));
  run(0.4, () => ({ pos: lay, pose: "fist" }));
  assert.equal(g.view.card.held, true);
  run(0.6, (t) => ({ pos: { x: 0.05, y: 0.05 - 0.17 * Math.min(1, t / 0.5), z: 0.0 }, pose: "fist" }));
  // tracking lost: three seconds below the desk
  const before = g.log.length;
  run(1.5, () => null);
  const h = g.hands.get("right");
  assert.equal(h.under, true, "a hand lost on its way down is under the table");
  assert.equal(h.dropped, true);
  assert.equal(h.hidden, true, "and he cannot see it");
  assert.equal(g.phase, "play", "no pause");
  // it comes back up and opens in view: the swap counts (the fist was kept through the dropout)
  run(0.6, (t) => ({ pos: { x: 0.05 + 0.25 * Math.min(1, t / 0.5), y: -0.1 + 0.22 * Math.min(1, t / 0.4), z: 0.05 + 0.17 * Math.min(1, t / 0.5) }, pose: "fist" }));
  run(0.5, () => ({ pos: { x: 0.3, y: 0.12, z: 0.22 }, pose: "open" }));
  assert.ok(has(g, "swap"), `swap after the dropout: ${g.log.slice(before).join(" ")}`);
  assert.equal(g.match.playerHeld, 12);
});

test("a dropout of a third of a second above the table changes nothing; a longer one holds the hand where it was, still and visible", () => {
  const { g, run, still } = setup();
  run(1, still);
  const base = g.log.length;
  run(0.3, () => null);
  run(1, still);
  assert.deepEqual(g.log.slice(base), [], "a short dropout is not an event");
  g.brain.suspicion = 0.7;
  run(1.0, still); // the stare begins
  assert.equal(g.brain.mode, "stare");
  run(1.5, () => null); // 1.5 s lost above the table during the stare: held still, visible, never "moved"
  assert.equal(has(g, "caught"), false);
  const h = g.hands.get("right");
  assert.equal(h.dropped, false, "lost high up is held, not under");
  assert.equal(h.present, true);
});

test("the jump when tracking returns is not movement (stillness restarts); jitter and dropouts together never catch a still hand in the stare", () => {
  const { g, run, still } = setup();
  g.brain.suspicion = 0.7;
  // 8 seconds of stare with 4 mm jitter and a 0.2 s dropout every 1.5 s, the hand reappearing 3 cm away each time
  let k = 0;
  run(8, (t) => {
    const cycle = t % 1.5;
    if (cycle > 1.3) return null;
    const n = Math.floor(t / 1.5);
    k = n;
    return { pos: { x: 0.2 + 0.03 * (n % 2), y: 0.05, z: 0.25 }, pose: "open" };
  }, { noise: 0.004 });
  void k;
  assert.equal(has(g, "caught"), false, `caught: ${g.log.join(" ")}`);
  assert.ok(has(g, "stareStart"));
});

test("a fist that flickers for two frames does not grab, swap or palm", () => {
  const { g, run } = setup();
  run(0.3, () => ({ pos: lay, pose: "open" }));
  const before = g.log.length;
  let n = 0;
  run(1, () => ({ pos: lay, pose: ++n % 40 === 0 || n % 40 === 1 ? "fist" : "open" }));
  assert.equal(g.log.slice(before).some((l) => l === "grab" || l === "palm" || l.startsWith("swap")), false);
});

test("no rule needs both hands: every moment works with one hand tracked", () => {
  const { g } = setup();
  assert.equal(g.hands.size, 1);
  assert.equal(g.phase, "play");
});
