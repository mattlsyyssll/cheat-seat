import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGame, startMatch, stepGame, setKept, setKeepSpot, keptForSave } from "../src/game/duel.js";
import { createMatch, cutMatch, dealPlayer, playerLift, keepHeld, playKept, seizeKept, allCards, finishRound } from "../src/game/match.js";
import { DECK_SIZE } from "../src/game/cards.js";
import { KEEP, KEEP_KEY, spotOnTable, chooseSpot, createKeepStore, parseKeep, serializeKeep, watchKeep, validSpot } from "../src/game/keep.js";
import { serializeRun, restoreRun, validMatch } from "../src/game/save.js";
import { SPOTS } from "../src/game/booth.js";
import { tuningOf } from "../src/game/tuning.js";
import { createKeepAnchor, startAnchor, readAnchor, resetKeepAnchor } from "../src/input/keep-anchor.js";

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

test("keep: a palmed card, hand opened flat over the keep spot and lifted, stays on the spot and the round goes on with a fresh card", () => {
  const t = playing();
  const { g } = t;
  const dealt = g.match.playerCard;
  assert.notEqual(dealt, null);
  const deckBefore = g.match.deck.length;
  palmAndKeep(t);
  assert.deepEqual(g.match.kept, [dealt], "the dealt card is on the spot");
  assert.notEqual(g.match.playerCard, null, "a fresh card is dealt for this round");
  assert.notEqual(g.match.playerCard, dealt);
  assert.equal(g.match.dealtCard, g.match.playerCard, "the fresh card is the dealt card, so it is not a cheat");
  assert.equal(g.match.playerHeld, null);
  assert.equal(g.match.deck.length, deckBefore - 1);
  assert.equal(g.card.state, "down");
  assert.ok(t.types().includes("keep"));
  assert.equal(new Set(allCards(g.match)).size, DECK_SIZE, "every card is in one place");
  assert.equal(g.view.kept.cards[0], dealt, "the view carries the kept card for the art");
  assert.equal(g.phase, "play", "keeping does not end the round or catch you");
});

test("keep, flat play: a mouse cannot lift, so a palmed card with the hand resting open over the spot for a moment is kept too", () => {
  const t = playing();
  const { g, go, run } = t;
  go(LAY, false, 0.4);
  go(LAY, true, 0.1);
  run(0.6, { ...t.hand, fist: true });
  go(spotAt(g), true, 0.4);
  go(spotAt(g), false, 0.1);
  assert.deepEqual(g.match.kept, [], "not at once");
  run(KEEP.restS + 0.3, { ...t.hand, fist: false });
  assert.equal(g.match.kept.length, 1);
});

test("keep, headset: a palm that hovers at 13 cm (above the arming height) and lifts 6 cm is kept by the lift, before the resting time, not disarmed (stage H, emulated hand)", () => {
  const t = playing();
  const { g, go, run } = t;
  go(LAY, false, 0.4);
  go(LAY, true, 0.1);
  run(0.6, { ...t.hand, fist: true });
  go(spotAt(g, 0.13), true, 0.5);
  go(spotAt(g, 0.13), false, 0.05);
  assert.deepEqual(g.match.kept, [], "not yet");
  go(spotAt(g, 0.19), false, 0.3);
  run(0.1, { ...t.hand, fist: false });
  assert.equal(g.match.kept.length, 1, "the lift counted although it rose above KEEP.maxY");
  assert.ok(0.19 > KEEP.maxY, "the test hand ends above the arming height");
});

test("keep, headset: a hand that rises above KEEP.liftMaxY, or leaves the spot sideways, while armed keeps nothing", () => {
  const t = playing();
  const { g, go, run } = t;
  go(LAY, false, 0.4);
  go(LAY, true, 0.1);
  run(0.6, { ...t.hand, fist: true });
  go(spotAt(g, 0.1), true, 0.4);
  go(spotAt(g, 0.1), false, 0.05);
  go(spotAt(g, KEEP.liftMaxY + 0.1), false, 0.2);
  run(0.2, { ...t.hand, fist: false });
  assert.deepEqual(g.match.kept, [], "a hand thrown far above the table is not a keep");
});

test("keep: an open hand that only passes over the spot, or a card that was never palmed, keeps nothing", () => {
  const t = playing();
  const { g, go, run } = t;
  // never palmed: a quick pick up (a click) carried over the spot and opened
  go(LAY, false, 0.4);
  go(LAY, true, 0.1);
  go(spotAt(g), true, 0.3);
  go(spotAt(g), false, 0.1);
  run(1.0, { ...t.hand, fist: false });
  assert.deepEqual(g.match.kept, []);
  assert.equal(g.match.playerHeld !== null || g.match.playerCard !== null, true, "the card is still yours");
});

test("cap of 2: a third card is refused (nothing changes, one event), at the rules and with the hand", () => {
  const m = createMatch({ seed: 3 });
  cutMatch(m, 20);
  dealPlayer(m);
  m.kept.push(m.deck.shift(), m.deck.shift());
  playerLift(m);
  assert.equal(keepHeld(m), null, "the rules refuse a third kept card");
  assert.equal(m.kept.length, KEEP.max);
  assert.equal(KEEP.max, 2);
  const t = playing();
  assert.equal(setKept(t.g, [t.g.match.deck[2], t.g.match.deck[7]]).length, 2);
  const mine = t.g.match.playerCard;
  palmAndKeep(t);
  assert.equal(t.g.match.kept.length, 2);
  assert.ok(!t.g.match.kept.includes(mine), "the third card did not go on the spot");
  assert.ok(t.types().includes("keepFull"));
  assert.equal(new Set(allCards(t.g.match)).size, DECK_SIZE);
});

test("load after reload: the kept cards and the spot come back from the save, and are not dealt again", () => {
  const store = (() => {
    const d = new Map();
    return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => d.set(k, v) };
  })();
  const t = playing();
  const kept = t.g.match.playerCard;
  palmAndKeep(t);
  setKeepSpot(t.g, { x: 0.3, z: 0.14 }, "saved");
  const first = createKeepStore(store);
  assert.equal(first.save({ cards: keptForSave(t.g), spot: t.g.keep.spot, handle: "h-1" }), true);
  assert.ok(store.getItem(KEEP_KEY).length > 10, "it reached real storage");
  // a reload: a new store object over the same storage, a new game
  const loaded = createKeepStore(store).load();
  assert.deepEqual(loaded.cards, [kept]);
  assert.deepEqual(loaded.spot, { x: 0.3, z: 0.14 });
  assert.equal(loaded.handle, "h-1");
  const spot = chooseSpot({ saved: loaded.spot });
  assert.equal(spot.source, "saved");
  const g2 = createGame({ seed: 9, keep: { cards: loaded.cards, spot } });
  assert.deepEqual(g2.match.kept, [kept]);
  assert.ok(!g2.match.deck.includes(kept), "the kept card is not in the deck");
  assert.equal(new Set(allCards(g2.match)).size, DECK_SIZE);
  assert.deepEqual({ x: g2.keep.spot.x, z: g2.keep.spot.z }, { x: 0.3, z: 0.14 });
  startMatch(g2);
  assert.deepEqual(g2.match.kept, [kept], "still on the spot when the match starts");
  const counts = g2.events.filter((e) => e.type === "keptCount");
  assert.equal(counts.length, 1, "the wordless plate gets its count when the visit starts");
  assert.equal(counts[0].n, 1);
  // a visit with nothing kept shows no plate
  const g3 = createGame({ seed: 9 });
  startMatch(g3);
  assert.equal(g3.events.filter((e) => e.type === "keptCount").length, 0);
});

test("spot load order: the persistent anchor, else the saved relative position, else the default; a bad value is skipped", () => {
  const a = { x: 0.2, z: 0.1 }, s = { x: 0.3, z: 0.12 };
  assert.equal(chooseSpot({ anchor: a, saved: s }).source, "anchor");
  assert.deepEqual(chooseSpot({ anchor: a, saved: s }), { ...a, source: "anchor" });
  assert.equal(chooseSpot({ anchor: null, saved: s }).source, "saved");
  assert.deepEqual(chooseSpot({ saved: s }), { ...s, source: "saved" });
  assert.deepEqual(chooseSpot({}), { ...KEEP.defaultSpot, source: "default" });
  assert.equal(chooseSpot({ anchor: { x: 9, z: 9 }, saved: s }).source, "saved", "an anchor far off the desk is not believed");
  assert.equal(chooseSpot({ anchor: { x: NaN, z: 0 }, saved: { x: "a", z: 0 } }).source, "default");
  assert.equal(validSpot(KEEP.defaultSpot), true);
});

test("play a kept card: a closing hand at the spot takes it instead of the dealt card, and it is laid and counted as your card", () => {
  const t = playing();
  const { g, go, run } = t;
  const kc = g.match.deck[3];
  assert.deepEqual(setKept(g, [kc]), [kc]);
  const dealt = g.match.playerCard;
  g.keep.cool = 0;
  go(spotAt(g), false, 0.5);
  go(spotAt(g), true, 0.1);
  run(0.1, { ...t.hand, fist: true });
  assert.equal(g.card.state, "held");
  assert.equal(g.match.playerHeld, kc, "the kept card is in the hand");
  assert.deepEqual(g.match.kept, []);
  assert.equal(g.match.playerCard, null);
  assert.equal(g.match.deck[g.match.deck.length - 1], dealt, "the dealt card went under the deck");
  assert.equal(g.match.dealtCard, kc, "it counts as your dealt card: no cheat");
  assert.deepEqual(keptForSave(g), [kc], "a page closed now would not lose it");
  assert.ok(t.types().includes("keptPlay"));
  // carry it to the lay spot and put it down
  go({ x: 0.1, y: 0.1, z: 0.15 }, true, 0.4);
  go(LAY, true, 0.3);
  go(LAY, false, 0.1);
  run(0.3, { ...t.hand, fist: false });
  assert.equal(g.match.playerCard, kc, "laid");
  assert.equal(g.card.state, "laid");
  assert.deepEqual(keptForSave(g), [], "a played card is spent");
  assert.equal(new Set(allCards(g.match)).size, DECK_SIZE);
  // the round ends with the kept card (the pending plan that held the round open is dropped)
  g.brain.plan = null;
  for (let i = 0; i < 60 * 8 && g.phase !== "showdown" && g.phase !== "between"; i++) { stepGame(g, DT, { head: HEAD, hands: [{ ...t.hand }] }); g.events.length = 0; }
  assert.ok(["showdown", "between"].includes(g.phase));
  for (let i = 0; i < 60 * 4 && g.match.history.length === 0; i++) { stepGame(g, DT, { head: HEAD, hands: [{ ...t.hand }] }); g.events.length = 0; }
  assert.equal(g.match.history[0]?.player, kc, "the round was played with the kept card");
});

test("playing a kept card needs the dealt card on the table and a free hand (not while holding another card)", () => {
  const m = createMatch({ seed: 3 });
  cutMatch(m, 20);
  m.kept.push(m.deck.shift());
  assert.equal(playKept(m), null, "no dealt card yet");
  dealPlayer(m);
  playerLift(m);
  assert.equal(playKept(m), null, "the hand is full");
});

test("cone dwell: kept cards in his view cone for the dwell time are taken with a slam, the cards go to the discard pile and a catch is counted", () => {
  const g = createGame({ seed: 4, level: "normal" });
  startMatch(g);
  setKept(g, [3, 17]);
  g.brain.plan = { at: 999 };
  let caught = null;
  let t = 0;
  const evs = [];
  while (t < 38 && !caught) {
    stepGame(g, DT, { head: HEAD, hands: [] });
    t += DT;
    evs.push(...g.events.splice(0));
    caught = evs.find((e) => e.type === "caught");
  }
  assert.ok(caught, "his cone reached the spot within the round");
  assert.equal(caught.reason, "keep");
  assert.equal(g.phase, "caught");
  assert.equal(g.brain.mode, "slam", "the existing slam");
  for (let i = 0; i < 60 * 1; i++) { stepGame(g, DT, { head: HEAD, hands: [] }); evs.push(...g.events.splice(0)); }
  assert.deepEqual(g.match.kept, [], "the cards are taken");
  assert.ok(g.match.discard.includes(3) && g.match.discard.includes(17));
  assert.ok(evs.some((e) => e.type === "keptTaken" && e.n === 2));
  assert.ok(evs.some((e) => e.type === "slamHit"), "the existing slam reaction ran");
  assert.equal(g.match.floor, 3, "the buttons fall");
  assert.equal(g.match.strikes.player, 1);
  assert.equal(new Set(allCards(g.match)).size, DECK_SIZE);
  // the same game with nothing kept is not caught by this rule
  const c = createGame({ seed: 4, level: "normal" });
  startMatch(c);
  c.brain.plan = { at: 999 };
  const cev = [];
  for (let i = 0; i < 60 * 38; i++) { stepGame(c, DT, { head: HEAD, hands: [] }); cev.push(...c.events.splice(0)); }
  assert.ok(!cev.some((e) => e.type === "caught" && e.reason === "keep"));
});

test("cone dwell numbers: it fills only while the cone covers the spot with cards on it, drains when it leaves, and the time is in the tuning file", () => {
  const k = { meter: 0, seenT: 0 };
  assert.equal(watchKeep(k, 0.3, { covered: true, cards: 0, seeS: 0.5 }), null, "nothing on the spot: nothing to see");
  assert.equal(k.meter, 0);
  assert.equal(watchKeep(k, 0.3, { covered: true, cards: 1, seeS: 0.5 }), null);
  assert.ok(k.meter > 0.5 && k.meter < 0.7);
  watchKeep(k, 0.1, { covered: false, cards: 1, seeS: 0.5 });
  assert.ok(k.meter < 0.5, "it drains");
  let r = null;
  for (let i = 0; i < 60 && !r; i++) r = watchKeep(k, DT, { covered: true, cards: 2, seeS: 0.5 });
  assert.equal(r, "seen");
  assert.equal(k.meter, 0);
  for (const id of ["easy", "normal", "hard"]) {
    const T = tuningOf(id);
    assert.ok(T.keepSeeS > 0.2 && T.keepSeeS < 1.5, `${id} keepSeeS ${T.keepSeeS}`);
    assert.ok(T.keepSeeS > T.seeS && T.keepSeeS - T.seeS <= 0.5, `${id}: longer than the time to spot a hidden card (${T.seeS}), not by much`);
  }
});

test("storage failure: a store that throws on read and write, or no store at all, falls back to memory and nothing throws", () => {
  const boom = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
  const s1 = createKeepStore(boom);
  assert.doesNotThrow(() => s1.save({ cards: [5], spot: { x: 0.3, z: 0.12 } }));
  assert.equal(s1.save({ cards: [5], spot: { x: 0.3, z: 0.12 } }), false, "it did not reach storage");
  assert.equal(s1.failed, true);
  assert.deepEqual(s1.load().cards, [5], "the memory copy is used");
  const s2 = createKeepStore(() => { throw new Error("localStorage is blocked"); });
  assert.doesNotThrow(() => s2.load());
  assert.deepEqual(s2.load(), { cards: [], spot: null, handle: null });
  assert.equal(s2.save({ cards: [7], spot: KEEP.defaultSpot }), false);
  assert.deepEqual(s2.load().cards, [7]);
  const s3 = createKeepStore(null);
  assert.deepEqual(s3.load().cards, []);
  // read fails but write works, and the other way round
  const readOnlyBroken = { getItem() { throw new Error("x"); }, setItem() {} };
  assert.doesNotThrow(() => createKeepStore(readOnlyBroken).load());
  // the game itself starts and keeps without any storage involved
  const t = playing();
  assert.doesNotThrow(() => palmAndKeep(t));
  assert.equal(t.g.match.kept.length, 1);
});

test("a damaged save is ignored: bad text, wrong version, impossible cards, a spot off the desk, too many cards", () => {
  for (const raw of [null, "", "{", "[]", "null", JSON.stringify({ version: 9, cards: [1] }), "x".repeat(5000)]) assert.deepEqual(parseKeep(raw).cards, [], String(raw).slice(0, 20));
  const bad = parseKeep(JSON.stringify({ version: 1, cards: [1, 1, 99, -2, "a", 5, 6], spot: { x: 50, z: 0 }, handle: 12 }));
  assert.deepEqual(bad.cards, [1, 5], "real, distinct, at most two");
  assert.equal(bad.spot, null);
  assert.equal(bad.handle, null);
  const ok = parseKeep(serializeKeep({ cards: [4, 9], spot: { x: 0.2, z: 0.1 }, handle: "abc" }));
  assert.deepEqual(ok, { cards: [4, 9], spot: { x: 0.2, z: 0.1 }, handle: "abc" });
});

test("rules: seizeKept moves the kept cards to the discard pile; a match started with kept cards never deals them; old saves without kept still load", () => {
  const m = createMatch({ seed: 2, kept: [4, 30] });
  assert.ok(!m.deck.includes(4) && !m.deck.includes(30));
  assert.equal(allCards(m).length, DECK_SIZE);
  assert.deepEqual(seizeKept(m), [4, 30]);
  assert.deepEqual(m.kept, []);
  assert.deepEqual(m.discard.slice(-2), [4, 30]);
  // a save made now holds the kept cards and checks out; a save from before the keep spot has no `kept`
  const withKept = createMatch({ seed: 2, kept: [4] });
  cutMatch(withKept, 20);
  assert.equal(validMatch(JSON.parse(JSON.stringify(withKept))), true);
  const back = restoreRun(serializeRun(withKept, 1000), 2000);
  assert.deepEqual(back?.kept, [4]);
  const old = JSON.parse(JSON.stringify(createMatch({ seed: 2 })));
  delete old.kept;
  assert.equal(validMatch(old), true, "no kept field: still valid");
  const dup = JSON.parse(JSON.stringify(withKept));
  dup.kept = [dup.deck[0]];
  assert.equal(validMatch(dup), false, "a kept card that is also in the deck is refused");
  // finishRound leaves the kept cards where they are
  const g = createMatch({ seed: 2, kept: [4] });
  cutMatch(g, 20);
  g.phase = "settle";
  finishRound(g);
  assert.deepEqual(g.kept, [4]);
});

test("a new match carries the kept cards over and does not deal them", () => {
  const g = createGame({ seed: 6, keep: { cards: [8] } });
  startMatch(g);
  g.phase = "over";
  g.events.length = 0;
  // newMatch is imported lazily to keep the file's imports short
  return import("../src/game/duel.js").then(({ newMatch }) => {
    newMatch(g);
    assert.deepEqual(g.match.kept, [8]);
    assert.ok(!g.match.deck.includes(8));
    assert.ok(g.events.some((e) => e.type === "keptCount"));
  });
});

// ---------------------------------------------------------------- the anchor (fakes for the browser's objects)
const FRAME_REF = {};
function fakeAnchor(extra = {}) {
  return { anchorSpace: { id: "a" }, ...extra };
}

test("anchor: a saved handle is restored first; otherwise an anchor is created and its persistent handle kept; no support ends in none, without throwing", async () => {
  const mk = (p) => ({ pos: p });
  // 1 restore
  let k = createKeepAnchor();
  const restored = fakeAnchor();
  await startAnchor(k, { session: { restorePersistentAnchor: async (h) => (h === "H" ? restored : null) }, frame: { createAnchor: async () => assert.fail("must not create") }, ref: FRAME_REF, world: { x: 0, y: 0, z: 0 }, handle: "H", makeTransform: mk });
  assert.equal(k.status, "ready");
  assert.equal(k.how, "restored");
  assert.equal(k.anchor, restored);
  // 2 create + persist
  k = createKeepAnchor();
  const made = fakeAnchor({ requestPersistentHandle: async () => "NEW" });
  await startAnchor(k, { session: {}, frame: { createAnchor: async (t, ref) => { assert.deepEqual(t, { pos: { x: 1, y: 2, z: 3 } }); assert.equal(ref, FRAME_REF); return made; } }, ref: FRAME_REF, world: { x: 1, y: 2, z: 3 }, makeTransform: mk });
  assert.equal(k.how, "created");
  assert.equal(k.handle, "NEW");
  // 2b stale handle: restore throws, a new anchor is made
  k = createKeepAnchor();
  await startAnchor(k, { session: { restorePersistentAnchor: async () => { throw new Error("gone"); } }, frame: { createAnchor: async () => fakeAnchor({ requestPersistentHandle: async () => "N2" }) }, ref: FRAME_REF, world: { x: 0, y: 0, z: 0 }, handle: "OLD", makeTransform: mk });
  assert.equal(k.how, "created");
  assert.equal(k.handle, "N2");
  // 2c an anchor without persistence works for this session only
  k = createKeepAnchor();
  await startAnchor(k, { session: {}, frame: { createAnchor: async () => fakeAnchor({ requestPersistentHandle: async () => { throw new Error("no"); } }) }, ref: FRAME_REF, world: { x: 0, y: 0, z: 0 }, makeTransform: mk });
  assert.equal(k.status, "ready");
  assert.equal(k.handle, null);
  // 3 nothing offered (the emulator, a laptop): none
  k = createKeepAnchor();
  await startAnchor(k, { session: {}, frame: {}, ref: FRAME_REF, world: { x: 0, y: 0, z: 0 }, makeTransform: mk });
  assert.equal(k.status, "none");
  assert.equal(readAnchor(k, {}, FRAME_REF), null);
  // creation refused
  k = createKeepAnchor();
  await startAnchor(k, { session: {}, frame: { createAnchor: async () => { throw new Error("denied"); } }, ref: FRAME_REF, world: { x: 0, y: 0, z: 0 }, makeTransform: mk });
  assert.equal(k.status, "none");
  assert.match(k.error, /denied/);
  resetKeepAnchor(k, "H");
  assert.equal(k.status, "idle");
  assert.equal(k.handle, "H");
});

test("anchor: the pose is read back each time; an anchor the system lost or a missing pose gives null", () => {
  const a = fakeAnchor();
  const k = { anchor: a, handle: null, status: "ready", how: "created", error: "" };
  const frame = { trackedAnchors: new Set([a]), getPose: (space, ref) => (space === a.anchorSpace && ref === FRAME_REF ? { transform: { position: { x: 0.5, y: 0.8, z: -0.3 } } } : null) };
  assert.deepEqual(readAnchor(k, frame, FRAME_REF), { x: 0.5, y: 0.8, z: -0.3 });
  assert.equal(readAnchor(k, { ...frame, trackedAnchors: new Set() }, FRAME_REF), null, "not tracked this frame");
  assert.equal(readAnchor(k, { getPose: () => null }, FRAME_REF), null);
  assert.equal(readAnchor(k, { getPose: () => { throw new Error("x"); } }, FRAME_REF), null);
  assert.equal(readAnchor({ ...k, status: "none" }, frame, FRAME_REF), null);
});

// ---------------------------------------------------------------- the QA hooks
test("QA hooks: the keep hooks sit inside the dev-only qaApi, so every call is counted (a hands-only run must end at 0)", () => {
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const qa = src.slice(src.indexOf("function qaApi()"), src.indexOf("// -------------------------------------------------------------------- setup"));
  assert.match(qa, /keptSet:/);
  assert.match(qa, /keptGet:/);
  assert.match(qa, /qaCalls\+\+/, "the wrapper that counts calls covers every hook");
  assert.match(src, /if \(DEV\) \{[\s\S]{0,300}?"cheatQa"/, "the hooks exist only in a dev build");
  // the game itself never calls them
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.equal((code.match(/keptSet|keptGet/g) ?? []).length, 2, "defined once each, called nowhere in the page");
});

// ---------------------------------------------------------------- stage H (headset emulator)
test("stage H: a turned desk polygon that misses the default spot no longer refuses the anchor or the saved spot (the table rectangle counts too)", () => {
  // the emulator's sunlit living room: a diamond whose edge passes behind the default spot (measured in the headset run, 2026-11-11)
  const diamond = [{ x: 0.694, z: -0.293 }, { x: 0, z: 0.28 }, { x: -0.573, z: -0.414 }, { x: 0.121, z: -0.987 }, { x: 0.694, z: -0.293 }];
  const def = { x: KEEP.defaultSpot.x, z: KEEP.defaultSpot.z };
  assert.equal(spotOnTable(def, { polygon: diamond }), true, "inside the table rectangle");
  assert.equal(spotOnTable(def, { polygon: null }), true);
  assert.equal(spotOnTable({ x: 0.3, z: 0.3 }, { polygon: null }), false, "past the near edge of the rectangle and past the believable box");
  assert.equal(spotOnTable({ x: 0.9, z: 0.1 }, { polygon: diamond }), false, "outside both");
  assert.equal(spotOnTable({ x: NaN, z: 0 }, { polygon: null }), false);
  assert.equal(spotOnTable(null, { polygon: null }), false);
});

test("stage H: readAnchor says why it gave no pose (not ready, not tracked, no pose, bad number) and 'ok' when it did", () => {
  const k = createKeepAnchor();
  assert.equal(readAnchor(k, {}, {}), null);
  assert.equal(k.read, "not-ready");
  k.status = "ready";
  k.anchor = { anchorSpace: {} };
  assert.equal(readAnchor(k, { trackedAnchors: new Set(), getPose: () => null }, {}), null);
  assert.equal(k.read, "not-tracked");
  assert.equal(readAnchor(k, { trackedAnchors: new Set([k.anchor]), getPose: () => null }, {}), null);
  assert.equal(k.read, "no-pose");
  assert.equal(readAnchor(k, { getPose: () => ({ transform: { position: { x: NaN, y: 0, z: 0 } } }) }, {}), null);
  assert.equal(k.read, "bad-number");
  assert.deepEqual(readAnchor(k, { getPose: () => ({ transform: { position: { x: 0.1, y: 0.2, z: 0.3 } } }) }, {}), { x: 0.1, y: 0.2, z: 0.3 });
  assert.equal(k.read, "ok");
  assert.match((readAnchor(k, { getPose: () => { throw new Error("boom"); } }, {}), k.read), /^error: /);
  resetKeepAnchor(k);
  assert.equal(k.read, "");
});
