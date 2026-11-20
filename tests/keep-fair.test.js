import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, startMatch, stepGame, setKept } from "../src/game/duel.js";
import { SPOTS } from "../src/game/booth.js";

const HEAD = { pos: { x: 0, y: 0.47, z: 0.46 }, dir: { x: 0, y: -0.2, z: -1 } };
const DT = 1 / 60;
const LAY = { x: SPOTS.playerLay.x, y: 0.03, z: SPOTS.playerLay.z };

/** Step a game with no hands (or the given hand) for `secs`; returns the events and whether his cone took the kept cards ("caught" with reason "keep") and in which round. */
function idle(g, secs, until = () => false) {
  const evs = [];
  let took = null;
  for (let t = 0; t < secs && !until(); t += DT) {
    const round = g.round;
    stepGame(g, DT, { head: HEAD, hands: [] });
    for (const e of g.events.splice(0)) { evs.push(e); if (e.type === "caught" && e.reason === "keep") took = { round, t: +t.toFixed(1) }; }
  }
  return { evs, took };
}

/** Keep the dealt card with the real gesture in the running round 1 (carry it to the spot, open the hand, lift). */
function keepWithHand(g) {
  const hand = { id: "right", tracked: true, pos: { ...LAY }, fist: false, pointRay: null };
  const run = (secs, h) => { for (let i = 0; i < Math.round(secs * 60); i++) { stepGame(g, DT, { head: HEAD, hands: [{ ...h }] }); g.events.splice(0); } };
  const go = (to, fist, secs) => {
    const from = { ...hand.pos };
    const n = Math.max(1, Math.round(secs * 60));
    for (let i = 1; i <= n; i++) { const k = i / n; hand.pos = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k }; hand.fist = fist; run(DT, hand); }
  };
  const spot = (y) => ({ x: g.keep.spot.x, y, z: g.keep.spot.z });
  go(LAY, false, 0.4); go(LAY, true, 0.1); run(0.6, { ...hand, fist: true });
  go(spot(0.03), true, 0.5); go(spot(0.03), false, 0.2); go(spot(0.12), false, 0.4); run(0.2, { ...hand, fist: false });
}

function started(opts) {
  const g = createGame(opts);
  startMatch(g);
  while (g.phase !== "play") stepGame(g, DT, { head: HEAD, hands: [] });
  g.brain.plan = { at: 999, window: 3.4 }; // he does not cheat; his cone still sweeps the desk
  return g;
}

test("fair keep: a card kept in a round is safe from his cone for the rest of that round (the same game without the rule loses it in the round)", () => {
  const g = started({ seed: 4, level: "normal" });
  g.tuning = { ...g.tuning, keepSeeS: 0.05 }; // a very short dwell, so the cone would certainly take an unsafe card inside the round
  keepWithHand(g);
  assert.equal(g.match.kept.length, 1, "the card was kept");
  const keptRound = g.round;
  const r = idle(g, 400, () => g.round !== keptRound);
  assert.equal(r.took, null, "no take in the keep round");
  assert.equal(g.keep.meter, 0, "the dwell meter never filled");
  // control: the same play, but the card is not safe: his cone takes it inside the round (so the safe rule is what held it)
  const c = started({ seed: 4, level: "normal" });
  c.tuning = { ...c.tuning, keepSeeS: 0.05 };
  keepWithHand(c);
  c.keepSafe = [];
  const rc = idle(c, 400, () => c.round !== keptRound);
  assert.ok(rc.took && rc.took.round === keptRound, "without the rule the cone takes the card in the keep round");
});

test("fair keep: no take in the scripted rounds of the guided first match, even for a card that was not kept this round", () => {
  const g = createGame({ seed: 7, level: "normal", coach: true });
  startMatch(g);
  while (g.phase !== "play") stepGame(g, DT, { head: HEAD, hands: [] });
  setKept(g, [g.match.deck[5]]); // not safe by the keep round: only the guided match protects it
  let tooEarly = null;
  for (let t = 0; t < 300 && !g.coach.finished && !tooEarly; t += DT) {
    stepGame(g, DT, { head: HEAD, hands: [] });
    for (const e of g.events.splice(0)) if (e.type === "caught" && e.reason === "keep") tooEarly = e;
  }
  assert.equal(tooEarly, null, "no take while the scripted rounds run");
  assert.equal(g.coach.finished, true, "the scripted rounds ended");
  // control: the same game without the guided match: the cone takes the card in the same time
  const c = started({ seed: 7, level: "normal" });
  setKept(c, [c.match.deck[5]]);
  assert.ok(idle(c, 400).took, "without the guided match his cone takes it");
});

test("fair keep: from the next round on the cone dwell applies to a card kept earlier (a card can still be taken in the following round)", () => {
  // seeds 3, 5, 8 and 9 lose the card in round 2 when the player does nothing (found by running seeds 1 to 12, Normal)
  let taken = 0;
  for (const seed of [3, 5, 8, 9]) {
    const g = started({ seed, level: "normal" });
    keepWithHand(g);
    const keptRound = g.round;
    const r1 = idle(g, 400, () => g.round !== keptRound);
    assert.equal(r1.took, null, `seed ${seed}: safe in the keep round`);
    assert.equal(g.match.kept.length, 1, `seed ${seed}: still on the spot`);
    const r2 = idle(g, 400, () => g.round !== keptRound + 1);
    if (r2.took && r2.took.round === keptRound + 1) taken++;
  }
  assert.equal(taken, 4, "the cone takes a kept card in the next round (seeds 3, 5, 8, 9)");
});

