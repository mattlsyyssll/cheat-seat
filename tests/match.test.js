import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMatch, cutMatch, sharkLay, playerDraw, playerLay, playerReturn,
  bothLaid, resolveRound, finishRound, armHat, buttonTotal, allCards,
  ROUNDS, START_BUTTONS, ANTE, TOTAL_BUTTONS,
} from "../src/game/match.js";
import { rankOf } from "../src/game/cards.js";

/** Put exact cards on top of the deck for a controlled round. */
function rig(m, shark, player) {
  m.deck = m.deck.filter((c) => c !== shark && c !== player);
  m.deck.unshift(player);
  m.deck.unshift(shark);
}
const ACE = 12, KING = 11, TWO = 0, TWO_H = 13;

function playRound(m, sharkCard, playerCard) {
  rig(m, sharkCard, playerCard);
  assert.equal(sharkLay(m), sharkCard);
  assert.equal(playerDraw(m), playerCard);
  assert.equal(playerLay(m), playerCard);
  assert.ok(bothLaid(m));
  return resolveRound(m);
}

test("a new match: 20 buttons each, pot empty, waiting for the cut", () => {
  const m = createMatch({ seed: 5 });
  assert.equal(m.phase, "cut");
  assert.deepEqual(m.buttons, { player: START_BUTTONS, shark: START_BUTTONS });
  assert.equal(m.pot, 0);
  assert.equal(buttonTotal(m), TOTAL_BUTTONS);
  assert.equal(allCards(m).length, 52);
});

test("the cut starts round 1 and each side puts 5 in the pot", () => {
  const m = createMatch({ seed: 5 });
  assert.equal(playerDraw(m), null, "no drawing before the cut");
  const n = cutMatch(m);
  assert.ok(n >= 12 && n < 40);
  assert.equal(m.phase, "lay");
  assert.deepEqual(m.buttons, { player: 15, shark: 15 });
  assert.equal(m.pot, 2 * ANTE);
  assert.equal(buttonTotal(m), TOTAL_BUTTONS);
  assert.equal(cutMatch(m), false, "cannot cut twice");
});

test("the higher card takes the pot and buttons are conserved", () => {
  const m = createMatch({ seed: 9 });
  cutMatch(m);
  const out = playRound(m, TWO, ACE);
  assert.equal(out.result, "player");
  assert.equal(out.pot, 10);
  assert.deepEqual(m.buttons, { player: 25, shark: 15 });
  assert.equal(m.pot, 0);
  assert.equal(buttonTotal(m), TOTAL_BUTTONS);
  assert.equal(finishRound(m), "lay");
  assert.equal(m.round, 2);
  assert.deepEqual(m.buttons, { player: 20, shark: 10 });
  assert.equal(m.pot, 10);
  assert.equal(m.discard.length, 2);
});

test("a tie re-deals the same round and keeps the pot; no new ante", () => {
  const m = createMatch({ seed: 9 });
  cutMatch(m);
  const out = playRound(m, TWO, TWO_H);
  assert.equal(out.result, "tie");
  assert.equal(m.pot, 10);
  assert.deepEqual(m.buttons, { player: 15, shark: 15 });
  assert.equal(finishRound(m), "lay");
  assert.equal(m.round, 1);
  assert.equal(m.pot, 10);
  assert.equal(m.playerCard, null);
  assert.equal(m.sharkCard, null);
  const out2 = playRound(m, KING, ACE);
  assert.equal(out2.result, "player");
  assert.equal(out2.pot, 10);
  assert.deepEqual(m.buttons, { player: 25, shark: 15 });
});

test("four straight losses empty a pile and end the match", () => {
  const m = createMatch({ seed: 3 });
  cutMatch(m);
  const log = [];
  for (let i = 0; i < 4; i++) {
    const out = playRound(m, ACE, TWO);
    log.push(out.over);
    assert.equal(buttonTotal(m), TOTAL_BUTTONS);
    finishRound(m);
  }
  assert.deepEqual(log, [false, false, false, true]);
  assert.equal(m.buttons.player, 0);
  assert.equal(m.buttons.shark, 40);
  assert.equal(m.winner, "shark");
  assert.equal(m.phase, "over");
});

test("after seven rounds the larger pile wins", () => {
  const m = createMatch({ seed: 4 });
  cutMatch(m);
  // alternate wins: player takes rounds 1, 3, 5, 7 and the Shark 2, 4, 6
  for (let r = 1; r <= ROUNDS; r++) {
    const playerWins = r % 2 === 1;
    const out = playRound(m, playerWins ? TWO : ACE, playerWins ? ACE : TWO);
    if (r < ROUNDS) assert.equal(out.over, false, `round ${r} goes on`);
    else assert.equal(out.over, true);
    finishRound(m);
  }
  assert.equal(m.history.length, 7);
  assert.deepEqual(m.buttons, { player: 25, shark: 15 });
  assert.equal(m.winner, "player");
  assert.equal(m.phase, "over");
});

test("a tie in round 7 does not end the match; the next decisive round does", () => {
  const m = createMatch({ seed: 4 });
  cutMatch(m);
  for (let r = 1; r < ROUNDS; r++) {
    const playerWins = r % 2 === 1;
    playRound(m, playerWins ? TWO : ACE, playerWins ? ACE : TWO);
    finishRound(m);
  }
  assert.equal(m.round, 7);
  const tie = playRound(m, TWO, TWO_H);
  assert.equal(tie.result, "tie");
  assert.equal(tie.over, false);
  assert.equal(finishRound(m), "lay");
  assert.equal(m.round, 7);
  const last = playRound(m, ACE, TWO);
  assert.equal(last.over, true);
  assert.equal(m.winner, "shark");
});

test("the Shark cheats only with a hat card: the highest card left, taken from the deck", () => {
  const m = createMatch({ seed: 11 });
  cutMatch(m);
  const before = m.deck.length;
  const best = Math.max(...m.deck.map(rankOf));
  const card = armHat(m);
  assert.equal(rankOf(card), best);
  assert.equal(m.deck.length, before - 1);
  assert.equal(m.sharkCheats, 1);
  assert.equal(armHat(m), null, "one cheat card at a time");
  assert.equal(allCards(m).length, 52);
  assert.equal(sharkLay(m), card);
  assert.equal(m.sharkCheated, true);
  assert.equal(m.hatCard, null);
  playerDraw(m);
  playerLay(m);
  const out = resolveRound(m);
  assert.equal(out.cheated, true);
});

test("a honest lay takes the top of the deck and is not marked as a cheat", () => {
  const m = createMatch({ seed: 12 });
  const top = m.deck[0];
  assert.equal(sharkLay(m), top, "he may lay before the cut (the opening)");
  assert.equal(m.sharkCheated, false);
  assert.equal(sharkLay(m), null, "one card per round");
  cutMatch(m);
  assert.equal(m.sharkCard, top, "his card stays laid through the cut");
});

test("returning a held card puts it back on top; cards are never lost or doubled", () => {
  const m = createMatch({ seed: 13 });
  cutMatch(m);
  const top = m.deck[0];
  assert.equal(playerDraw(m), top);
  assert.equal(playerDraw(m), null, "one held card at a time");
  assert.equal(allCards(m).length, 52);
  assert.ok(playerReturn(m));
  assert.equal(m.deck[0], top);
  assert.equal(playerReturn(m), false);
  assert.equal(new Set(allCards(m)).size, 52);
});

test("a full seeded match always conserves buttons and cards and ends", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = createMatch({ seed });
    sharkLay(m);
    cutMatch(m);
    let guard = 0;
    while (m.phase !== "over" && guard++ < 60) {
      sharkLay(m);
      playerDraw(m);
      playerLay(m);
      resolveRound(m);
      assert.equal(buttonTotal(m), TOTAL_BUTTONS, `buttons seed ${seed}`);
      assert.equal(new Set(allCards(m)).size, 52, `cards seed ${seed}`);
      finishRound(m);
    }
    assert.equal(m.phase, "over", `seed ${seed} ended`);
    assert.ok(m.winner === "player" || m.winner === "shark");
    assert.ok(m.history.length >= 4);
  }
});

test("the discard pile is reshuffled into the deck if the deck runs out", () => {
  const m = createMatch({ seed: 21 });
  cutMatch(m);
  m.discard = m.deck.splice(0, m.deck.length - 1);
  assert.equal(m.deck.length, 1);
  assert.ok(playerDraw(m) !== null);
  assert.equal(m.deck.length, 0);
  assert.ok(sharkLay(m) !== null, "the next draw refills the deck from the discard pile");
  assert.ok(m.deck.length > 0);
  assert.equal(allCards(m).length, 52);
  assert.equal(new Set(allCards(m)).size, 52);
});

import { sharkSwap } from "../src/game/match.js";
test("a cheat after he has laid swaps his card for the hat card; the old card goes under the deck", () => {
  const m = createMatch({ seed: 14 });
  cutMatch(m);
  const first = sharkLay(m);
  assert.equal(sharkSwap(m), null, "nothing to swap with before he cheats");
  const hat = armHat(m);
  const before = m.deck.length;
  assert.equal(sharkSwap(m), hat);
  assert.equal(m.sharkCard, hat);
  assert.equal(m.hatCard, null);
  assert.equal(m.deck[m.deck.length - 1], first, "old card is at the bottom of the deck");
  assert.equal(m.deck.length, before + 1);
  assert.equal(m.sharkCheated, true);
  assert.equal(new Set(allCards(m)).size, 52);
  playerDraw(m);
  playerLay(m);
  const out = resolveRound(m);
  assert.equal(out.cheated, true);
});
