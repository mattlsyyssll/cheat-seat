import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, cutMatch, sharkLay, dealPlayer, armSleeve, playerLift, playerSwapSleeve, playerReturn, playerIllegal, caughtPlayer, allCards } from "../src/game/match.js";
import { rankOf } from "../src/game/cards.js";
import { boothFrame, virtualFrame } from "../src/game/place.js";

function round() {
  const m = createMatch({ seed: 4 });
  cutMatch(m, 20);
  armSleeve(m);
  sharkLay(m);
  dealPlayer(m);
  return m;
}

test("the sleeve card is the highest of the top eight cards, kept hidden in the sleeve, and no card is lost", () => {
  const m = createMatch({ seed: 9 });
  cutMatch(m, 20);
  const top8 = m.deck.slice(0, 8).map(rankOf);
  const c = armSleeve(m);
  assert.equal(rankOf(c), Math.max(...top8));
  assert.equal(m.stash.wristR, c);
  assert.equal(allCards(m).length, 52);
  assert.equal(new Set(allCards(m)).size, 52);
  assert.equal(armSleeve(m), null, "the sleeve is full");
});

test("under the table the card in the hand and the sleeve card change places; the swapped card is illegal, the dealt one is not", () => {
  const m = round();
  const dealt = m.playerCard;
  const up = m.stash.wristR;
  assert.equal(playerIllegal(m), false);
  playerLift(m);
  assert.equal(playerIllegal(m), false);
  assert.equal(playerSwapSleeve(m), up);
  assert.equal(m.playerHeld, up);
  assert.equal(m.stash.wristR, dealt);
  assert.equal(playerIllegal(m), up !== dealt);
  assert.equal(playerSwapSleeve(m), dealt, "a second swap puts it back");
  assert.equal(playerIllegal(m), false);
  playerReturn(m);
  assert.equal(m.playerCard, dealt);
  assert.equal(allCards(m).length, 52);
});

test("a swap needs a card in the hand and a card in the sleeve", () => {
  const m = round();
  assert.equal(playerSwapSleeve(m), null);
  playerLift(m);
  m.stash.wristR = null;
  assert.equal(playerSwapSleeve(m), null);
});

test("caught: the card in your hand and the one up your sleeve are taken", () => {
  const m = round();
  playerLift(m);
  playerSwapSleeve(m);
  const pen = caughtPlayer(m);
  assert.ok(pen);
  assert.equal(m.stash.wristR, null);
  assert.equal(allCards(m).length, 52);
});

test("placement: a desk near the head puts the player at the desk; a far desk puts the near edge on the desk and asks you to sit; no plane gives a virtual table under the eyes", () => {
  const desk = { id: 1, y: 0.74, polygon: [{ x: -0.6, z: -1.2 }, { x: 0.6, z: -1.2 }, { x: 0.6, z: -0.5 }, { x: -0.6, z: -0.5 }] };
  const near = boothFrame([desk], { x: 0, y: 1.2, z: 0 }, { x: 0, z: -1 });
  assert.equal(near.real, true);
  assert.equal(near.seatFar, false, "the desk edge is 0.5 m away: you are sitting at it");
  assert.ok(Math.abs(near.z + 0.46) < 1e-9, "the middle of the table is 0.46 m in front of your head");
  assert.ok(Math.abs(near.y - 0.74) < 1e-9);
  assert.ok(Math.abs(near.eyeRel - 0.46) < 1e-9);
  const far = boothFrame([{ ...desk, polygon: desk.polygon.map((p) => ({ x: p.x, z: p.z - 2 })) }], { x: 0, y: 1.2, z: 0 }, { x: 0, z: -1 });
  assert.equal(far.seatFar, true);
  const v = virtualFrame({ x: 0, y: 1.2, z: 0 }, { x: 0, z: -1 });
  assert.equal(v.real, false);
  assert.ok(Math.abs(v.y - 0.73) < 1e-9);
  assert.ok(Math.abs(v.z + 0.46) < 1e-9);
});
