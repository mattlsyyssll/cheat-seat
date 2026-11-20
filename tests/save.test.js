import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeRun, restoreRun, validMatch, settleForRestore, MAX_AGE_MS } from "../src/game/save.js";
import {
  createMatch, cutMatch, sharkLay, playerDraw, playerLay, resolveRound,
  finishRound, allCards, buttonTotal,
} from "../src/game/match.js";

function midMatch() {
  const m = createMatch({ seed: 31 });
  sharkLay(m);
  cutMatch(m);
  playerDraw(m);
  playerLay(m);
  resolveRound(m);
  finishRound(m);
  return m;
}

test("a run saves and restores with the same cards, buttons and history", () => {
  const m = midMatch();
  const now = 1_000_000;
  const back = restoreRun(serializeRun(m, now), now + 1000);
  assert.ok(back);
  assert.equal(back.round, m.round);
  assert.deepEqual(back.buttons, m.buttons);
  assert.equal(back.pot, m.pot);
  assert.deepEqual(back.history, m.history);
  assert.equal(new Set(allCards(back)).size, 52);
  assert.equal(buttonTotal(back), 40);
  assert.deepEqual(back.rng, m.rng, "random state is kept, so the shuffle order continues");
});

test("a run saved in the middle of a round restarts that round: held and laid cards are returned", () => {
  const m = createMatch({ seed: 32 });
  cutMatch(m);
  sharkLay(m);
  playerDraw(m);
  const back = restoreRun(serializeRun(m, 5), 10);
  assert.ok(back);
  assert.equal(back.playerHeld, null);
  assert.equal(back.sharkCard, null);
  assert.equal(back.playerCard, null);
  assert.equal(back.phase, "lay");
  assert.equal(back.pot, 10, "the ante stays in the pot");
  assert.equal(new Set(allCards(back)).size, 52);
});

test("bad, old, finished or tampered saves are refused", () => {
  const m = midMatch();
  const good = serializeRun(m, 100);
  assert.ok(restoreRun(good, 200));
  assert.equal(restoreRun(null, 200), null);
  assert.equal(restoreRun("", 200), null);
  assert.equal(restoreRun("{not json", 200), null);
  assert.equal(restoreRun(JSON.stringify({ version: 2, savedAt: 100, match: m }), 200), null);
  assert.equal(restoreRun(good, 100 + MAX_AGE_MS + 1), null, "older than 12 hours");
  const future = serializeRun(m, 1_000_000_000);
  assert.equal(restoreRun(future, 1_000_000_000 - 120_000), null, "saved in the future");
  const dupe = structuredClone(m);
  dupe.deck[0] = dupe.deck[1];
  assert.equal(validMatch(dupe), false, "duplicate card");
  const extra = structuredClone(m);
  extra.buttons.player += 1;
  assert.equal(validMatch(extra), false, "button total must stay 40");
  const over = structuredClone(m);
  over.phase = "over";
  over.winner = "player";
  assert.equal(restoreRun(serializeRun(over, 100), 200), null, "finished runs are not restored");
  assert.equal(restoreRun("x".repeat(30000), 200), null);
  assert.equal(validMatch(null), false);
  assert.equal(validMatch({}), false);
});

test("settleForRestore leaves a clean round start", () => {
  const m = createMatch({ seed: 33 });
  cutMatch(m);
  playerDraw(m);
  playerLay(m);
  sharkLay(m);
  settleForRestore(m);
  assert.equal(m.playerCard, null);
  assert.equal(m.discard.length, 2);
  assert.equal(allCards(m).length, 52);
});

test("a save made before phase 5 still loads when its under-the-hand places are empty, and is refused when a card sits there", () => {
  const m = midMatch();
  const old = JSON.parse(serializeRun(m, 5));
  old.match.stash.underL = null;
  old.match.stash.underR = null;
  assert.ok(restoreRun(JSON.stringify(old), 10), "empty old keys are ignored");
  // a card that sat under a hand is missing from the count, so the save is not trusted
  const card = old.match.deck.pop();
  old.match.stash.underL = card;
  assert.equal(restoreRun(JSON.stringify(old), 10), null);
});
