import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame } from "../src/game/duel.js";
import { KEEP } from "../src/game/keep.js";
import { SPOTS } from "../src/game/booth.js";
import { KEEP_GHOST_S, keepGhostState, keepGhostWanted } from "../src/game/ghost.js";

/** Desk Keep, the one-time teach cue: shown once when a palmed card is first in the hand, stops at the first keep, never repeats. */
const HEAD = { pos: { x: 0, y: 0.47, z: 0.46 }, dir: { x: 0, y: -0.2, z: -1 } };
const DT = 1 / 60;

/** A game in the play phase of round 1, with the Shark held quiet (no random cheat, a pending plan keeps the round open). */
function playing(opts = {}) {
  const g = createGame({ seed: 5, ...opts });
  startMatch(g);
  const evs = [];
  const hand = { id: "right", tracked: true, pos: { x: 0.12, y: 0.05, z: 0.22 }, fist: false, pointRay: null };
  const run = (secs, h = hand) => {
    for (let i = 0; i < Math.round(secs * 60); i++) {
      stepGame(g, DT, { head: HEAD, hands: [{ ...h }] });
      evs.push(...g.events.splice(0));
    }
  };
  const types = () => evs.map((e) => e.type);
  run(0.1);
  while (g.phase !== "play") run(0.1);
  g.brain.plan = { at: 999, window: 3.4 };
  g.brain.script = { noRandom: true };
  /** Move the hand to `to` in `secs`, keeping fist as given. */
  const go = (to, fist, secs = 0.4) => {
    const from = { ...hand.pos };
    const n = Math.max(1, Math.round(secs * 60));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      hand.pos = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
      hand.fist = fist;
      run(DT, hand);
    }
  };
  return { g, hand, evs, run, go, types };
}

const LAY = { x: SPOTS.playerLay.x, y: 0.03, z: SPOTS.playerLay.z };
const spotAt = (g, y = 0.03) => ({ x: g.keep.spot.x, y, z: g.keep.spot.z });

/** Take the dealt card with a closing hand, hold the fist (a palm), carry it over the keep spot, open the hand flat and lift it. */
function palmAndKeep(t) {
  const { g, go, run } = t;
  go(LAY, false, 0.4);
  go(LAY, true, 0.1);
  run(0.6, { ...t.hand, fist: true });
  go(spotAt(g), true, 0.5);
  go(spotAt(g), false, 0.2);
  go(spotAt(g, 0.03), false, 0.1);
  go(spotAt(g, 0.12), false, 0.3);
  run(0.2, { ...t.hand, fist: false });
}


const cueOn = (g) => typeof g.view.kept.cue === "number";

test("keep cue (pure): wanted only for a palmed card in a running round, once, before any keep, with room on the spot", () => {
  const base = { taught: false, shown: false, palmed: true, playing: true, room: true };
  assert.equal(keepGhostWanted(base), true);
  for (const k of ["palmed", "playing", "room"]) assert.equal(keepGhostWanted({ ...base, [k]: false }), false, k);
  assert.equal(keepGhostWanted({ ...base, taught: true }), false, "after the first keep");
  assert.equal(keepGhostWanted({ ...base, shown: true }), false, "after it has played");
});

test("keep cue (pure): the ghost closes over the spot, opens flat there, lifts at least the keep lift, and fades in and out; the frame glows while it plays", () => {
  const spot = { x: 0.3, z: 0.1 };
  const mid = keepGhostState(1.1, spot);
  assert.ok(Math.hypot(mid.hand.x - spot.x, mid.hand.z - spot.z) < 0.08, "over the spot (the palm sits a little toward you so the fingers cover the frame)");
  assert.equal(mid.flat, 1, "open");
  assert.equal(keepGhostState(0.3, spot).flat, 0, "closed on the way in");
  assert.ok(keepGhostState(2.0, spot).hand.y - mid.hand.y >= KEEP.liftY, "it lifts at least as far as the keep needs");
  assert.ok(keepGhostState(0, spot).alpha < 0.05 && keepGhostState(KEEP_GHOST_S, spot).alpha < 0.05);
  assert.ok(mid.glow > 0.2);
  assert.equal(keepGhostState(KEEP_GHOST_S, spot).done, true);
});

test("keep cue: shows once when the card is first palmed, and not before", () => {
  const t = playing();
  const { g, go, run } = t;
  assert.equal(cueOn(g), false, "not at the start of the round");
  go(LAY, false, 0.4);
  go(LAY, true, 0.1);
  assert.equal(cueOn(g), false, "a quick grab is not a palm");
  run(0.6, { ...t.hand, fist: true });
  assert.equal(cueOn(g), true, "the palmed card starts it");
  assert.equal(g.teach.shown, true);
  run(KEEP_GHOST_S + 0.3, { ...t.hand, fist: true });
  assert.equal(cueOn(g), false, "it ends by itself");
  // palm again: it does not come back
  go(LAY, false, 0.3);
  go(LAY, true, 0.1);
  run(0.8, { ...t.hand, fist: true });
  assert.equal(cueOn(g), false, "once only, even if the first showing was not followed");
});

test("keep cue: stops at the first keep and never repeats for the rest of the game", () => {
  const t = playing();
  const { g, go, run } = t;
  go(LAY, false, 0.4);
  go(LAY, true, 0.1);
  run(0.6, { ...t.hand, fist: true });
  assert.equal(cueOn(g), true);
  go(spotAt(g), true, 0.5);
  go(spotAt(g), false, 0.2);
  go(spotAt(g, 0.03), false, 0.1);
  go(spotAt(g, 0.12), false, 0.3);
  run(0.2, { ...t.hand, fist: false });
  assert.equal(g.match.kept.length, 1, "kept");
  assert.equal(cueOn(g), false, "the first keep stops the cue at once");
  assert.equal(g.teach.taught, true);
  // a second palm in the same game: no cue
  go(LAY, false, 0.6);
  go(LAY, true, 0.1);
  run(0.8, { ...t.hand, fist: true });
  assert.equal(cueOn(g), false);
});

test("keep cue: not for a player who already knows (kept cards in the save, or taught earlier in the session) and not in practice", () => {
  for (const opts of [{ keep: { cards: [7], spot: null } }, { keepTaught: true }, { noKeepCue: true }]) {
    const t = playing(opts);
    const { g, go, run } = t;
    go(LAY, false, 0.4);
    go(LAY, true, 0.1);
    run(0.8, { ...t.hand, fist: true });
    assert.equal(cueOn(g), false, JSON.stringify(opts));
  }
  const p = createGame({ seed: 5, practice: true });
  assert.equal(p.teach.t, -1);
});
