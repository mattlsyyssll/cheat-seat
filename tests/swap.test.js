import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMatch, cutMatch, sharkLay, sharkSwap, armHat, dealPlayer, playerLift, playerSwapDeck, playerReturn,
  resolveRound, finishRound, caughtPlayer, catchShark, bothLaid, allCards, buttonTotal, HELD_FROM, ROUNDS,
} from "../src/game/match.js";
import { DECK_SIZE, rankOf } from "../src/game/cards.js";
import { serializeRun, restoreRun, validMatch } from "../src/game/save.js";

function roundOne(seed = 3) {
  const m = createMatch({ seed });
  cutMatch(m, 20);
  return m;
}

test("stage 1: a round deals you a card from the top of the deck, once", () => {
  const m = roundOne();
  const top = m.deck[0];
  assert.equal(dealPlayer(m), top);
  assert.equal(m.playerCard, top);
  assert.equal(m.deck.length, DECK_SIZE - 1);
  assert.equal(dealPlayer(m), null, "no second card in the same round");
  assert.equal(m.playerSwapped, false);
  const cut = createMatch({ seed: 1 });
  assert.equal(dealPlayer(cut), null, "not before the cut");
});

test("stage 1: lifting your card puts it in your hand; there is nothing to lift before the deal or while holding", () => {
  const m = roundOne();
  assert.equal(playerLift(m), null, "no card yet");
  const c = dealPlayer(m);
  assert.equal(playerLift(m), c);
  assert.equal(m.playerHeld, c);
  assert.equal(m.heldFrom, "lay");
  assert.equal(m.playerCard, null);
  assert.equal(playerLift(m), null, "already in your hand");
  assert.ok(HELD_FROM.includes("lay"));
});

test("stage 1: the swap sends your card under the deck and brings the top card back to you", () => {
  const m = roundOne();
  const mine = dealPlayer(m);
  const top = m.deck[0];
  playerLift(m);
  const next = playerSwapDeck(m);
  assert.equal(next, top, "the old top card comes back");
  assert.equal(m.playerCard, top);
  assert.equal(m.deck[m.deck.length - 1], mine, "your card is the last card of the deck");
  assert.equal(m.playerHeld, null);
  assert.equal(m.heldFrom, null);
  assert.equal(m.playerSwapped, true);
  assert.equal(m.deck.length, DECK_SIZE - 1);
  assert.equal(new Set(allCards(m)).size, DECK_SIZE, "every card is somewhere, once");
  assert.equal(playerSwapDeck(m), null, "nothing in the hand to swap");
});

test("stage 1: a card dropped anywhere but on the deck goes back to its spot and the deck does not change", () => {
  const m = roundOne();
  const mine = dealPlayer(m);
  const deck = [...m.deck];
  playerLift(m);
  assert.equal(playerReturn(m), true);
  assert.equal(m.playerCard, mine);
  assert.equal(m.playerSwapped, false);
  assert.deepEqual(m.deck, deck);
});

test("stage 1: a swap works with a one-card deck and with an empty deck that has a discard pile to reshuffle", () => {
  const m = roundOne();
  m.discard.push(...m.deck.splice(1)); // leave one card in the deck
  const mine = dealPlayer(m); // the deck is now empty
  assert.equal(m.deck.length, 0);
  playerLift(m);
  const next = playerSwapDeck(m);
  assert.ok(next !== null && next !== mine, "a card came back from the reshuffled pile");
  assert.equal(new Set(allCards(m)).size, DECK_SIZE);
});

test("stage 1: caught with your card in your hand: the card is taken, the round and the pot go to the Shark, 3 buttons fall, a strike", () => {
  const m = roundOne();
  m.warn = false;
  const mine = dealPlayer(m);
  sharkLay(m);
  playerLift(m);
  const pot = m.pot;
  const pen = caughtPlayer(m);
  assert.ok(pen && pen.side === "player" && pen.strike === true && pen.fine === 3);
  assert.equal(m.playerHeld, null);
  assert.ok(m.discard.includes(mine), "your card went to the discard pile");
  assert.equal(m.buttons.shark, 15 + pot);
  assert.equal(m.floor, 3);
  assert.equal(m.strikes.player, 1);
  assert.equal(buttonTotal(m), 40);
  assert.equal(finishRound(m), "lay");
  assert.equal(new Set(allCards(m)).size, DECK_SIZE);
});

test("stage 1: the very first catch of the first run is a warning (no strike)", () => {
  const m = createMatch({ seed: 3, warn: true });
  cutMatch(m, 20);
  dealPlayer(m);
  sharkLay(m);
  playerLift(m);
  const pen = caughtPlayer(m);
  assert.equal(pen.warned, true);
  assert.equal(m.strikes.player, 0);
  assert.equal(m.floor, 3);
});

test("stage 1: catching him after a swap: you win the pot, he drops 3 buttons and takes a strike, the card he stole goes to the discard pile", () => {
  const m = roundOne();
  dealPlayer(m);
  sharkLay(m);
  playerLift(m);
  playerSwapDeck(m);
  const stolen = armHat(m);
  assert.ok(stolen !== null);
  const pot = m.pot;
  const pen = catchShark(m);
  assert.ok(pen && pen.side === "shark");
  assert.equal(m.buttons.player, 15 + pot);
  assert.equal(m.strikes.shark, 1);
  assert.equal(m.floor, 3);
  assert.ok(m.discard.includes(stolen));
  assert.equal(m.history.at(-1).cause, "caughtShark");
  assert.equal(new Set(allCards(m)).size, DECK_SIZE);
});

test("stage 1: a swapped round is recorded as swapped and the higher card wins the pot", () => {
  const m = roundOne(5);
  dealPlayer(m);
  sharkLay(m);
  playerLift(m);
  playerSwapDeck(m);
  assert.ok(bothLaid(m));
  const out = resolveRound(m);
  assert.ok(out);
  const last = m.history.at(-1);
  assert.equal(last.swapped, true);
  const cmp = rankOf(last.player) - rankOf(last.shark);
  assert.equal(last.result, cmp > 0 ? "player" : cmp < 0 ? "shark" : "tie");
  assert.equal(buttonTotal(m), 40);
});

test("stage 1: a saved run that stopped with the card in your hand loads again and the round restarts clean", () => {
  const m = roundOne(9);
  dealPlayer(m);
  sharkLay(m);
  playerLift(m);
  assert.equal(validMatch(JSON.parse(JSON.stringify(m))), true, "a held card from your spot is a valid save");
  m.history.push({ round: 1, player: null, shark: null, result: "shark", pot: 0, cheated: false, swapped: false, cause: "caught" });
  const back = restoreRun(serializeRun(m));
  assert.ok(back, "restored");
  assert.equal(back.playerHeld, null);
  assert.equal(back.playerCard, null);
  assert.equal(new Set(allCards(back)).size, DECK_SIZE);
});
test("stage 1: a whole match of swaps and showdowns keeps 40 buttons and 52 cards and ends", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = createMatch({ seed });
    cutMatch(m);
    for (let guard = 0; guard < 60 && m.phase !== "over"; guard++) {
      dealPlayer(m);
      sharkLay(m);
      if (rankOf(m.playerCard) < 8) {
        playerLift(m);
        playerSwapDeck(m);
      }
      if (guard % 5 === 4) {
        armHat(m);
        sharkSwap(m);
      }
      resolveRound(m);
      finishRound(m);
      assert.equal(buttonTotal(m), 40);
      assert.equal(new Set(allCards(m)).size, DECK_SIZE, `seed ${seed} round ${guard}`);
    }
    assert.equal(m.phase, "over", `seed ${seed} ended`);
    assert.ok(m.history.length <= ROUNDS + 12);
  }
});
