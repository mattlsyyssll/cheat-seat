import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDeck, shuffle, cutDeck, compareCards, rankOf, suitOf, rankName,
  highestIndex, DECK_SIZE, validCard,
} from "../src/game/cards.js";
import { createRng, nextFloat, nextInt, hashSeed } from "../src/game/rng.js";

test("a deck has 52 distinct cards with ranks 2..14 and four suits", () => {
  const deck = createDeck();
  assert.equal(deck.length, DECK_SIZE);
  assert.equal(new Set(deck).size, 52);
  assert.equal(Math.min(...deck.map(rankOf)), 2);
  assert.equal(Math.max(...deck.map(rankOf)), 14);
  assert.equal(new Set(deck.map(suitOf)).size, 4);
  assert.equal(rankName(14), "A");
  assert.equal(rankName(11), "J");
  assert.equal(rankName(7), "7");
  assert.ok(validCard(0) && validCard(51) && !validCard(52) && !validCard(-1) && !validCard(1.5));
});

test("the same seed gives the same shuffle and a shuffle keeps every card", () => {
  const a = shuffle(createDeck(), createRng(42));
  const b = shuffle(createDeck(), createRng(42));
  const c = shuffle(createDeck(), createRng(43));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual([...a].sort((x, y) => x - y), createDeck());
});

test("random numbers stay in range and the string hash is stable", () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const f = nextFloat(rng);
    assert.ok(f >= 0 && f < 1);
    const n = nextInt(rng, 5);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 5);
  }
  assert.equal(hashSeed("cheat"), hashSeed("cheat"));
  assert.notEqual(hashSeed("cheat"), hashSeed("seat"));
});

test("High Card: higher rank wins, suit does not count, equal rank ties", () => {
  const ace = 12; // rank 14, suit 0
  const king = 11;
  const aceOfHearts = 13 + 12;
  assert.equal(rankOf(ace), 14);
  assert.equal(compareCards(ace, king), 1);
  assert.equal(compareCards(king, ace), -1);
  assert.equal(compareCards(ace, aceOfHearts), 0);
  assert.equal(compareCards(0, 1), -1);
});

test("a cut moves the top cards under the rest and keeps every card", () => {
  const deck = createDeck();
  const cut = cutDeck(deck, 10);
  assert.equal(cut[0], 10);
  assert.equal(cut[cut.length - 1], 9);
  assert.deepEqual([...cut].sort((x, y) => x - y), deck);
  assert.deepEqual(deck, createDeck(), "input is not changed");
  assert.deepEqual(cutDeck(deck, 0), deck, "cut of 0 does nothing");
  assert.deepEqual(cutDeck(deck, 52), deck, "cut of the whole deck does nothing");
});

test("highestIndex finds the highest rank, topmost on a tie", () => {
  assert.equal(highestIndex([]), -1);
  assert.equal(highestIndex([0, 12, 25, 1]), 1); // rank 14 first at index 1 (25 is also an ace)
  assert.equal(highestIndex([3, 4, 5]), 2);
});
