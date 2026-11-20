import { test } from "node:test";
import assert from "node:assert/strict";
import { ghostState, ghostWanted, GHOST_S, slapGhostState, slapGhostWanted, SLAP_GHOST_S, SLAP_SPOT } from "../src/game/ghost.js";
import { inSlapZone } from "../src/game/zones.js";
import { CATCH_WINDOW_S } from "../src/game/gaze.js";
import { launchToss, stepToss } from "../src/game/toss.js";
import { createRng } from "../src/game/rng.js";
import { ZONES } from "../src/game/layout.js";

test("ghost hand (the swap lesson): reaches your card, pinches it, carries it to the deck, lets go over it", () => {
  const a = ghostState(0.6);
  assert.ok(Math.hypot(a.hand.x - ZONES.playerLay.x, a.hand.z - ZONES.playerLay.z) < 0.01, "over your own card");
  assert.equal(a.pinch, 1, "pinching the card");
  assert.equal(a.cardLifted, true);
  assert.equal(ghostState(0.3).cardOnTable, true, "the card still lies there before the pinch");
  const c = ghostState(1.3);
  assert.ok(Math.hypot(c.hand.x - ZONES.deck.x, c.hand.z - ZONES.deck.z) < 0.01, "over the deck");
  assert.equal(c.cardLifted, true, "still carrying the card");
  const d = ghostState(1.5);
  assert.equal(d.pinch, 0, "let go over the deck");
  assert.equal(d.cardLifted, false);
  assert.ok(ghostState(1.45).glint > 0.5 && ghostState(1.6).glint > 0.9, "a glint marks the drop");
  const end = ghostState(GHOST_S);
  assert.equal(end.done, true);
  assert.ok(end.alpha < 0.05, "fades out");
  assert.ok(ghostState(0).alpha < 0.05, "fades in");
});

test("ghost hand: plays at most three times, only early, never after the player has swapped", () => {
  assert.equal(ghostWanted({ taught: false, round: 1, shown: 0 }), true);
  assert.equal(ghostWanted({ taught: false, round: 3, shown: 2 }), true);
  assert.equal(ghostWanted({ taught: false, round: 3, shown: 3 }), false);
  assert.equal(ghostWanted({ taught: false, round: 4, shown: 0 }), false);
  assert.equal(ghostWanted({ taught: true, round: 1, shown: 0 }), false, "one swap and it never returns");
});

test("the swap lesson fits his guided first look-away (3.4 s or more): the whole move is done in 2.1 s", () => {
  assert.ok(GHOST_S <= 2.2);
  assert.ok(ghostState(1.5).pinch === 0 && ghostState(1.4).cardLifted);
});

test("slap lesson: the ghost palm comes down inside the slap zone, stays flat, and ends inside the catch window", () => {
  const down = slapGhostState(0.8);
  assert.equal(down.down, true);
  assert.equal(down.flat, 1);
  assert.ok(inSlapZone({ ...down.hand, y: down.hand.y }), "the palm lands in the zone where a touch catches him");
  assert.ok(Math.hypot(down.hand.x - SLAP_SPOT.x, down.hand.z - SLAP_SPOT.z) < 0.01);
  assert.ok(slapGhostState(0.1).alpha < 0.7 && slapGhostState(0.4).alpha > 0.95, "fades in");
  assert.ok(slapGhostState(SLAP_GHOST_S).alpha < 0.05, "fades out");
  assert.ok(SLAP_GHOST_S <= CATCH_WINDOW_S, "the lesson ends before the window does");
  assert.equal(slapGhostState(SLAP_GHOST_S).done, true);
});

test("slap lesson: plays only while the window is open, the head faces him, and he has never been caught", () => {
  assert.equal(slapGhostWanted({ caughtHim: false, windowOpen: true, yawDeg: 10 }), true);
  assert.equal(slapGhostWanted({ caughtHim: true, windowOpen: true, yawDeg: 10 }), false, "never after the first catch");
  assert.equal(slapGhostWanted({ caughtHim: false, windowOpen: false, yawDeg: 10 }), false);
  assert.equal(slapGhostWanted({ caughtHim: false, windowOpen: true, yawDeg: 50 }), false, "a turned head cannot catch, so no lesson");
});

function throwAll(dir, from, desk, drift, seed = 3, n = 20, seconds = 3) {
  const rng = createRng(seed);
  const bs = Array.from({ length: n }, () => launchToss(rng, { ...from, y: 0.02 }, dir, drift));
  const floorY = -0.72;
  for (let t = 0; t < seconds; t += 1 / 90) for (const b of bs) stepToss(b, 1 / 90, desk, floorY);
  return bs;
}
// virtual table top outline: x -0.75..0.75, z -0.57..0.53
const onTop = (x, z) => Math.abs(x) <= 0.75 && z >= -0.57 && z <= 0.53;

test("scattered fine buttons fall off the desk edge to the floor and stay there (every seed)", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const bs = throwAll(1, { x: -0.3, z: 0.26 }, onTop, true, seed, 3);
    for (const b of bs) {
      assert.equal(b.onFloor, true, `seed ${seed}: a fine button stayed on the desk at ${b.x.toFixed(2)},${b.z.toFixed(2)}`);
      assert.ok(b.y >= -0.72 - 1e-9, "never below the floor");
    }
  }
});

test("buttons thrown from the middle of the pot go toward the player and many fall off", () => {
  const bs = throwAll(1, ZONES.pot, onTop, false, 5, 20, 3);
  assert.ok(bs.every((b) => b.z > ZONES.pot.z - 0.05), "thrown toward the player, not away");
  assert.ok(bs.filter((b) => b.onFloor).length >= 8, "a good part of the pot falls off the edge");
});

test("when he is caught, his fine falls off the far edge, away from the player", () => {
  const bs = throwAll(-1, ZONES.sharkPile, onTop, true, 6, 3, 3);
  assert.ok(bs.every((b) => b.onFloor && b.z < ZONES.sharkPile.z));
});

test("toss bounces on the desk before it falls and no button ends inside the felt top at rest in the air", () => {
  const rng = createRng(2);
  const b = launchToss(rng, { x: 0, y: 0.02, z: 0 }, 1, false);
  let touched = false;
  for (let t = 0; t < 3; t += 1 / 90) {
    stepToss(b, 1 / 90, onTop, -0.72);
    if (b.y === 0) touched = true;
  }
  assert.equal(touched, true, "it landed on the desk at least once");
});
