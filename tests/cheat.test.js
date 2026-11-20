import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMatch, cutMatch, sharkLay, sharkSwap, armHat, playerDraw, playerLay, playerReturn,
  burnCard, discardTop, playerTakeDiscard, playerPalmHeld, palmPutBack, playerStash, playerTakeStash,
  hiddenCards, confiscate, resolveRound, finishRound, caughtPlayer, catchShark, allCards, buttonTotal,
  STRIKES_MAX, STRIKE_FINE, STASH_KEYS,
} from "../src/game/match.js";
import { rankOf } from "../src/game/cards.js";
import { serializeRun, restoreRun, validMatch } from "../src/game/save.js";

/** A match in round 1, after the cut and the burn, with a chosen top discard card. */
function started(seed = 5, opts = {}) {
  const m = createMatch({ seed, ...opts });
  cutMatch(m, 20);
  burnCard(m);
  return m;
}
const total = (m) => allCards(m).length;
const ACE = 12; // spades ace is card 12 (rank 14)

/** Put a chosen card on top of the discard pile (test set-up only). */
function setTop(m, card) {
  for (const list of [m.deck, m.discard]) {
    const i = list.indexOf(card);
    if (i >= 0) list.splice(i, 1);
  }
  m.discard.push(card);
}

test("burn: after the cut the Shark burns the top card face up on the discard pile (once)", () => {
  const m = createMatch({ seed: 5 });
  cutMatch(m, 20);
  const top = m.deck[0];
  assert.equal(burnCard(m), top);
  assert.equal(discardTop(m), top);
  assert.equal(burnCard(m), null, "only when the pile is empty");
  assert.equal(total(m), 52);
});

test("palm: take the top discard card, lay the hand flat; it is hidden in that hand", () => {
  const m = started();
  setTop(m, ACE);
  assert.equal(playerTakeDiscard(m), ACE);
  assert.equal(m.heldFrom, "discard");
  assert.equal(hiddenCards(m).length, 0, "still in plain sight while pinched");
  assert.equal(playerPalmHeld(m, "right"), ACE);
  assert.deepEqual(m.palmed, { card: ACE, hand: "right" });
  assert.deepEqual(hiddenCards(m), [{ card: ACE, where: "palm" }]);
  assert.equal(total(m), 52);
});

test("palm: a card from the discard pile cannot be laid as the round card", () => {
  const m = started();
  setTop(m, ACE);
  playerTakeDiscard(m);
  assert.equal(playerLay(m), null);
  assert.equal(playerReturn(m), true);
  assert.equal(discardTop(m), ACE, "put back where it came from");
  assert.equal(total(m), 52);
});

test("palm: a palmed card can be put back; only one card at a time", () => {
  const m = started();
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "left");
  assert.equal(playerTakeDiscard(m), null, "hands full");
  assert.equal(palmPutBack(m), true);
  assert.equal(discardTop(m), ACE);
  assert.equal(m.palmed, null);
});

test("stash: the palmed card goes into one empty hidden zone; a card in the zone is hidden", () => {
  const m = started();
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  assert.equal(playerStash(m, "nowhere"), false);
  assert.equal(playerStash(m, "wristL"), true);
  assert.equal(m.stash.wristL, ACE);
  assert.equal(m.palmed, null);
  assert.deepEqual(hiddenCards(m), [{ card: ACE, where: "wristL" }]);
  assert.equal(playerStash(m, "wristL"), false, "nothing palmed any more");
  setTop(m, 25);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  assert.equal(playerStash(m, "wristL"), false, "zone already has a card");
  assert.equal(playerStash(m, "edge"), true);
  assert.equal(total(m), 52);
});

test("swap: on the draw, take the stashed card; lay it; it wins the round", () => {
  const m = started(6);
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  playerStash(m, "wristL");
  // the Shark lays an honest card that is not an ace
  sharkLay(m);
  if (rankOf(m.sharkCard) === 14) m.sharkCard = m.deck.shift() ?? m.sharkCard;
  assert.equal(playerTakeStash(m, "wristR"), null, "empty zone");
  assert.equal(playerTakeStash(m, "wristL"), ACE);
  assert.equal(m.stash.wristL, null);
  assert.equal(m.heldFrom, "wristL");
  assert.deepEqual(hiddenCards(m), [{ card: ACE, where: "held:wristL" }], "carrying it is still hidden");
  assert.equal(playerLay(m), ACE);
  assert.equal(m.playerSwapped, true);
  assert.deepEqual(hiddenCards(m), [], "laid: no longer hidden");
  const before = m.buttons.player;
  const out = resolveRound(m);
  assert.equal(out.result, "player", "an ace beats everything but another ace");
  assert.equal(m.buttons.player, before + 10);
  assert.equal(m.history.at(-1).swapped, true);
  assert.equal(total(m), 52);
  assert.equal(buttonTotal(m), 40);
});

test("swap: putting a stash card back returns it to its zone", () => {
  const m = started();
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  playerStash(m, "edge");
  playerTakeStash(m, "edge");
  playerReturn(m);
  assert.equal(m.stash.edge, ACE);
  assert.equal(m.playerHeld, null);
});

test("the normal draw is untouched: deck card, not swapped", () => {
  const m = started();
  sharkLay(m);
  const top = m.deck[0];
  assert.equal(playerDraw(m), top);
  assert.equal(m.heldFrom, "deck");
  playerLay(m);
  assert.equal(m.playerSwapped, false);
});

test("caught: the round is lost, the pot goes to the Shark, hidden cards are confiscated, 3 buttons fall, strikes 0 to 1", () => {
  const m = started(7);
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  playerStash(m, "wristL");
  sharkLay(m);
  const p = m.buttons.player, s = m.buttons.shark, pot = m.pot;
  assert.equal(m.strikes.player, 0);
  const pen = caughtPlayer(m);
  assert.deepEqual({ side: pen.side, fine: pen.fine, strike: pen.strike, warned: pen.warned, pot: pen.pot }, { side: "player", fine: STRIKE_FINE, strike: true, warned: false, pot });
  assert.equal(m.strikes.player, 1);
  assert.equal(m.buttons.player, p - STRIKE_FINE);
  assert.equal(m.buttons.shark, s + pot);
  assert.equal(m.pot, 0);
  assert.equal(m.floor, STRIKE_FINE);
  assert.equal(buttonTotal(m), 40);
  assert.deepEqual(hiddenCards(m), [], "stash confiscated");
  assert.ok(m.discard.includes(ACE));
  assert.equal(m.history.at(-1).cause, "caught");
  assert.equal(m.history.at(-1).result, "shark");
  assert.equal(m.phase, "settle");
  const next = finishRound(m);
  assert.equal(next, "lay");
  assert.equal(m.round, 2);
  assert.equal(m.pot, 10, "next ante in");
  assert.equal(total(m), 52);
});

test("caught while holding a deck card or with cards laid: nothing is lost", () => {
  const m = started(8);
  sharkLay(m);
  playerDraw(m);
  caughtPlayer(m);
  finishRound(m);
  assert.equal(total(m), 52);
  assert.equal(new Set(allCards(m)).size, 52);
  assert.equal(m.playerHeld, null);
});

test("the first catch of the first ever run is a warning: lost round and fine, no strike", () => {
  const m = started(9, { warn: true });
  const pen = caughtPlayer(m);
  assert.equal(pen.warned, true);
  assert.equal(pen.strike, false);
  assert.equal(m.strikes.player, 0);
  assert.equal(m.floor, STRIKE_FINE, "the buttons still fall");
  assert.equal(m.warn, false);
  finishRound(m);
  const pen2 = caughtPlayer(m);
  assert.equal(pen2.strike, true);
  assert.equal(m.strikes.player, 1);
});

test("a catch is only possible during a round", () => {
  const m = createMatch({ seed: 3 });
  assert.equal(caughtPlayer(m), null, "before the cut");
  assert.equal(catchShark(m), null);
});

test("catch him: he loses the round, the pot goes to the player, he takes a strike and drops 3 buttons", () => {
  const m = started(10);
  sharkLay(m);
  armHat(m);
  const p = m.buttons.player, s = m.buttons.shark, pot = m.pot;
  const pen = catchShark(m);
  assert.equal(pen.side, "shark");
  assert.equal(m.strikes.shark, 1);
  assert.equal(m.strikes.player, 0);
  assert.equal(m.buttons.player, p + pot);
  assert.equal(m.buttons.shark, s - STRIKE_FINE);
  assert.equal(m.floor, STRIKE_FINE);
  assert.equal(m.hatCard, null, "the card under his glove is confiscated");
  assert.equal(m.history.at(-1).cause, "caughtShark");
  assert.equal(m.history.at(-1).result, "player");
  assert.equal(buttonTotal(m), 40);
  finishRound(m);
  assert.equal(total(m), 52);
});

test("catching him ignores the player's own hidden cards (they stay hidden)", () => {
  const m = started(11);
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  playerStash(m, "edge");
  sharkLay(m);
  catchShark(m);
  assert.equal(m.stash.edge, ACE);
});

test("win by strikes: three strikes on the Shark end the match for the player", () => {
  const m = started(12);
  for (let i = 1; i <= STRIKES_MAX; i++) {
    sharkLay(m);
    const pen = catchShark(m);
    assert.equal(pen.over, i === STRIKES_MAX);
    const next = finishRound(m);
    assert.equal(next, i === STRIKES_MAX ? "over" : "lay");
  }
  assert.equal(m.winner, "player");
  assert.equal(m.phase, "over");
  assert.equal(m.strikes.shark, 3);
  assert.equal(buttonTotal(m), 40);
});

test("lose by strikes: three strikes on the player end the match for the Shark", () => {
  const m = started(13);
  for (let i = 1; i <= STRIKES_MAX; i++) {
    sharkLay(m);
    caughtPlayer(m);
    finishRound(m);
  }
  assert.equal(m.winner, "shark");
  assert.equal(m.phase, "over");
  assert.equal(buttonTotal(m), 40);
});

test("lose by running out of buttons through fines and lost pots", () => {
  const m = started(14);
  m.buttons.player = 4;
  m.buttons.shark = 26;
  caughtPlayer(m);
  assert.equal(m.buttons.player, 1, "fine is 3");
  assert.equal(m.winner, null);
  finishRound(m);
  m.buttons.player = 0;
  m.buttons.shark = 40 - m.floor - m.pot;
  sharkLay(m);
  const pen = caughtPlayer(m);
  assert.equal(pen.over, true);
  assert.equal(m.winner, "shark");
  assert.equal(buttonTotal(m), 40);
});

test("win by buttons: the Shark runs out because of his fines", () => {
  const m = started(15);
  m.buttons.shark = 2;
  m.buttons.player = 40 - 2 - m.pot;
  const pen = catchShark(m);
  assert.equal(m.buttons.shark, 0);
  assert.equal(pen.over, true);
  assert.equal(m.winner, "player");
});

test("palmed and stashed cards survive a save and restore; a palm goes under the edge", () => {
  const m = started(16);
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  playerStash(m, "wristR");
  setTop(m, 30);
  playerTakeDiscard(m);
  playerPalmHeld(m, "left");
  assert.equal(validMatch(m), true);
  const back = restoreRun(serializeRun(m, 10), 20);
  assert.ok(back);
  assert.equal(back.stash.wristR, ACE);
  assert.equal(back.palmed, null);
  assert.equal(back.stash.edge, 30, "the palmed card was tucked under the edge");
  assert.equal(new Set(allCards(back)).size, 52);
  assert.equal(buttonTotal(back), 40);
});

test("a save with a bad stash, strike count or floor is refused", () => {
  const m = started(17);
  const bad = (f) => {
    const c = structuredClone(m);
    f(c);
    return validMatch(c);
  };
  assert.equal(validMatch(m), true);
  assert.equal(bad((c) => (c.strikes.player = 4)), false);
  assert.equal(bad((c) => (c.stash.nowhere = 3)), true, "extra keys are ignored");
  assert.equal(bad((c) => (c.stash.wristL = 99)), false);
  assert.equal(bad((c) => (c.floor = 2)), false, "button total must stay 40");
  assert.equal(bad((c) => (c.heldFrom = "deck")), false, "a held-from without a held card");
  assert.equal(bad((c) => (c.palmed = { card: c.deck[0], hand: "x" })), false, "a card in two places");
});

test("every stash key is covered by the save and confiscation", () => {
  const m = started(18);
  for (const [i, k] of STASH_KEYS.entries()) m.stash[k] = m.deck.splice(i, 1)[0];
  assert.equal(hiddenCards(m).length, STASH_KEYS.length);
  assert.equal(confiscate(m).length, STASH_KEYS.length);
  assert.equal(hiddenCards(m).length, 0);
  assert.equal(total(m), 52);
});

test("a swapped-in Shark cheat and a player cheat can both happen in one round", () => {
  const m = started(19);
  setTop(m, ACE);
  playerTakeDiscard(m);
  playerPalmHeld(m, "right");
  playerStash(m, "edge");
  sharkLay(m);
  armHat(m);
  sharkSwap(m);
  playerTakeStash(m, "edge");
  playerLay(m);
  resolveRound(m);
  assert.ok(m.history.at(-1).cheated);
  assert.ok(m.history.at(-1).swapped);
  assert.equal(total(m), 52);
});
