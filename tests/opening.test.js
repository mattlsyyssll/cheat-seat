import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openingState, openingEvents, OPENING_S, OPENING_EVENTS, READY_S,
  GLOVE_KEYS, PICK_S, LAY_S,
} from "../src/game/opening.js";
import { ZONES, PLAYER_SIDE_Z } from "../src/game/layout.js";
import { sampleKeys, smooth, span, pulse } from "../src/game/keys.js";

test("the opening runs in order: hat, deck, eyes, one sweep, palm, wink, lay", () => {
  let prev = -1;
  const order = [];
  for (let t = 0; t <= 10.5; t += 0.01) {
    for (const e of openingEvents(prev, t)) order.push(e);
    prev = t;
  }
  assert.deepEqual(order, OPENING_EVENTS);
  assert.deepEqual(order, [
    "hat", "deckSlide", "eyes", "sweepStart", "sweepEnd", "pick", "wink", "lay", "ready", "done",
  ]);
  assert.equal(OPENING_S, 10);
});

test("at 0 s nothing but a bare desk; at 10 s everything has happened", () => {
  const a = openingState(0);
  assert.equal(a.hat, 0);
  assert.equal(a.deck, 0);
  assert.equal(a.eyes, 0);
  assert.equal(a.cone.on, false);
  assert.equal(a.cardLaid, false);
  const z = openingState(10);
  assert.equal(z.hat, 1);
  assert.equal(z.deck, 1);
  assert.equal(z.eyes, 1);
  assert.equal(z.cone.on, true);
  assert.equal(z.cardLaid, true);
  assert.equal(z.cardAttached, false);
  assert.equal(z.glint, 1);
  assert.ok(z.ready && z.done);
});

test("the hat shows first, the deck slides out of it, then the eyes open", () => {
  assert.ok(openingState(0.6).hat > 0 && openingState(0.6).hat < 1);
  assert.equal(openingState(1.2).hat, 1);
  assert.equal(openingState(1.0).deck, 0);
  assert.ok(openingState(2.0).deck > 0 && openingState(2.0).deck < 1);
  assert.equal(openingState(3.0).eyes, 0);
  assert.ok(openingState(3.6).eyes > 0 && openingState(3.6).eyes < 1);
  assert.equal(openingState(4.2).eyes, 1);
});

test("the cone sweeps the player's side once, left to right, and never goes back", () => {
  const xs = [];
  for (let t = 4.4; t <= 6.7; t += 0.05) {
    const s = openingState(t);
    assert.equal(s.cone.on, true);
    assert.equal(s.cone.z, PLAYER_SIDE_Z);
    xs.push(s.cone.x);
  }
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1] - 1e-9, "sweep never reverses");
  assert.ok(xs[0] < -0.3 && xs[xs.length - 1] > 0.3);
  // eases back to the middle after the sweep, no second pass
  assert.ok(Math.abs(openingState(7.3).cone.x) < 0.01);
  assert.equal(openingState(4.0).cone.x, openingState(4.4).cone.x, "waits at the left");
});

test("he picks the card at the deck, carries it, winks, then lays it face down", () => {
  assert.equal(openingState(PICK_S - 0.05).cardAttached, false);
  assert.equal(openingState(PICK_S + 0.05).cardAttached, true);
  assert.equal(openingState(LAY_S - 0.05).cardAttached, true);
  assert.equal(openingState(LAY_S + 0.05).cardLaid, true);
  const atDeck = openingState(PICK_S).glove;
  assert.ok(Math.hypot(atDeck.x - ZONES.deck.x, atDeck.z - ZONES.deck.z) < 0.03);
  const atLay = sampleKeys(GLOVE_KEYS, LAY_S);
  assert.ok(Math.hypot(atLay.x - ZONES.sharkLay.x, atLay.z - ZONES.sharkLay.z) < 0.03);
  assert.equal(openingState(7.9).wink, pulse(7.9, 8.0, 8.5));
  assert.equal(openingState(8.25).wink > 0.9, true, "the squint peaks mid-wink");
  assert.equal(openingState(9).wink, 0);
});

test("the glint that says 'pinch the deck' appears only when the card is laid", () => {
  assert.equal(openingState(READY_S - 0.01).ready, false);
  assert.equal(openingState(READY_S - 0.01).glint, 0);
  assert.equal(openingState(READY_S).ready, true);
  assert.ok(READY_S > LAY_S);
});

test("keyframe helpers behave", () => {
  assert.equal(smooth(-1), 0);
  assert.equal(smooth(2), 1);
  assert.equal(smooth(0.5), 0.5);
  assert.equal(span(5, 0, 10), 0.5);
  assert.equal(span(5, 6, 6), 0);
  const k = [{ t: 0, x: 0, flag: "a" }, { t: 2, x: 10, flag: "b" }];
  assert.equal(sampleKeys(k, -1).x, 0);
  assert.equal(sampleKeys(k, 1).x, 5);
  assert.equal(sampleKeys(k, 9).x, 10);
});
