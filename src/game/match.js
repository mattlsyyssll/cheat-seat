/** One match of High Card: round loop, button accounting, the swap and the
 * strikes (pure, no graphics).
 *
 * Stage 1 (2026-11-07): ONE verb. Each round the player is dealt a card and sees it
 * (`dealPlayer`). When his eyes are off you, lift your card (`playerLift`) and drop it
 * on the deck (`playerSwapDeck`): your card goes under the deck and the top card comes
 * back to you. The old palm, stash and take-from-the-pile moves below are no longer
 * reachable in play; they stay here only so that old saves and old tests still load.
 *
 * Buttons: each side starts with 20; every round each side puts 5 in the pot;
 * the higher card takes the pot; equal ranks re-deal with the pot kept.
 * Total buttons stay 40 (player + shark + pot + floor).
 *
 * The cheat (the player's three moves):
 *   Palm   take the top card of the discard pile into a hand (held), then lay the
 *          hand flat over it: the card is palmed (hidden in that hand).
 *   Stash  slide the palmed card into a hidden zone (see zones.js).
 *   Swap   on the draw, take a stashed card instead of the deck card and lay it.
 * Getting caught (caughtPlayer): the round is lost, the pot goes to the Shark, the
 * hidden cards are confiscated, 3 buttons fall on the floor and the player takes a
 * strike. Catching him (catchShark): the same, the other way round.
 * Three strikes end the match: the side with three strikes loses. */
import { createRng, nextInt } from "./rng.js";
import { KEEP, cleanCards } from "./keep.js";
import {
  createDeck,
  shuffle,
  cutDeck,
  compareCards,
  highestIndex,
  rankOf,
} from "./cards.js";

export const ROUNDS = 7;
export const START_BUTTONS = 20;
export const ANTE = 5;
export const TOTAL_BUTTONS = START_BUTTONS * 2;
export const PHASES = ["cut", "lay", "settle", "over"];
export const STRIKES_MAX = 3;
/** Buttons that fall on the floor, lost for the match, each time a side is caught. */
export const STRIKE_FINE = 3;
export const STASH_KEYS = ["wristL", "wristR", "edge"];
export const HELD_FROM = ["deck", "discard", "lay", ...STASH_KEYS];

/** @typedef {"player"|"shark"} Side */
/** @typedef {{round:number, player:number|null, shark:number|null, result:"player"|"shark"|"tie", pot:number, cheated:boolean,
 *   swapped?:boolean, cause?:"cards"|"caught"|"caughtShark"}} RoundRecord */
/** @typedef {{side:Side, fine:number, strike:boolean, warned:boolean, pot:number, over:boolean}} Penalty */
/** @typedef {{
 *  version:2, seed:number, rng:{s:number}, deck:number[], discard:number[],
 *  hatCard:number|null, playerHeld:number|null, heldFrom:string|null,
 *  playerCard:number|null, dealtCard:number|null, playerSwapped:boolean,
 *  palmed:{card:number, hand:string}|null, stash:Record<string, number|null>, kept:number[],
 *  sharkCard:number|null, sharkCheated:boolean,
 *  phase:"cut"|"lay"|"settle"|"over", round:number, pot:number, floor:number,
 *  buttons:{player:number, shark:number}, strikes:{player:number, shark:number},
 *  history:RoundRecord[], winner:Side|null, sharkCheats:number,
 *  warn:boolean, penalty:Penalty|null }} Match */

/** @param {{seed?:number, warn?:boolean, kept?:number[]}} [options] warn = the first catch of the
 * first ever run is a warning: slam, lost round and fine, but no strike. kept = Desk Keep cards already on the keep spot (they are
 * not in the deck: every card is in one place).
 * @returns {Match} */
export function createMatch(options = {}) {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const kept = cleanCards(options.kept);
  return {
    version: 2,
    seed,
    rng,
    deck: shuffle(createDeck().filter((c) => !kept.includes(c)), rng),
    discard: [],
    hatCard: null,
    playerHeld: null,
    heldFrom: null,
    playerCard: null,
    dealtCard: null,
    playerSwapped: false,
    palmed: null,
    stash: { wristL: null, wristR: null, edge: null },
    kept,
    sharkCard: null,
    sharkCheated: false,
    phase: "cut",
    round: 1,
    pot: 0,
    floor: 0,
    buttons: { player: START_BUTTONS, shark: START_BUTTONS },
    strikes: { player: 0, shark: 0 },
    history: [],
    winner: null,
    sharkCheats: 0,
    warn: options.warn === true,
    penalty: null,
  };
}

/** All 52 cards are somewhere; used by tests and by the save check.
 * @param {Match} m @returns {number[]} */
export function allCards(m) {
  const out = [...m.deck, ...m.discard];
  for (const c of [m.hatCard, m.playerHeld, m.playerCard, m.sharkCard])
    if (c !== null) out.push(c);
  if (m.palmed) out.push(m.palmed.card);
  for (const k of STASH_KEYS) if (m.stash[k] !== null) out.push(/** @type {number} */ (m.stash[k]));
  if (m.kept) out.push(...m.kept);
  return out;
}

/** @param {Match} m @returns {number} */
export function buttonTotal(m) {
  return m.buttons.player + m.buttons.shark + m.pot + m.floor;
}

/** Make sure the deck has at least `need` cards by reshuffling the discard under it.
 * @param {Match} m @param {number} need */
function ensureDeck(m, need) {
  if (m.deck.length >= need || m.discard.length === 0) return;
  m.deck.push(...shuffle(m.discard.splice(0), m.rng));
}

/** @param {Match} m @returns {number|null} */
function takeTop(m) {
  ensureDeck(m, 1);
  const card = m.deck.shift();
  return card === undefined ? null : card;
}

/** Each side puts the ante in the pot. @param {Match} m */
function startRound(m) {
  const ante = Math.min(ANTE, m.buttons.player, m.buttons.shark);
  m.buttons.player -= ante;
  m.buttons.shark -= ante;
  m.pot += ante * 2;
  m.phase = "lay";
}

/** The player cuts the deck. `n` is how many top cards go under; random if omitted.
 * Starts round 1 (the ante goes in). @param {Match} m @param {number} [n]
 * @returns {number|false} the cut size, or false if not allowed now */
export function cutMatch(m, n) {
  if (m.phase !== "cut") return false;
  const size = n ?? 12 + nextInt(m.rng, 28);
  m.deck = cutDeck(m.deck, size);
  startRound(m);
  return size;
}

/** The Shark's glove slips under the hat and returns with the highest card left
 * in the deck. One cheat card at a time. @param {Match} m @returns {number|null} */
export function armHat(m) {
  if (m.hatCard !== null || m.phase === "over") return null;
  ensureDeck(m, 1);
  const i = highestIndex(m.deck);
  if (i < 0) return null;
  m.hatCard = m.deck.splice(i, 1)[0];
  m.sharkCheats++;
  return m.hatCard;
}

/** The Shark lays his card face down: the hat card if he has one, else the top
 * of the deck. Allowed before the cut (the opening) and during a round.
 * @param {Match} m @returns {number|null} */
export function sharkLay(m) {
  if (m.sharkCard !== null || (m.phase !== "cut" && m.phase !== "lay"))
    return null;
  if (m.hatCard !== null) {
    m.sharkCard = m.hatCard;
    m.hatCard = null;
    m.sharkCheated = true;
  } else {
    m.sharkCard = takeTop(m);
    m.sharkCheated = false;
  }
  return m.sharkCard;
}

/** A cheat after he has laid his card: the glove swaps it for the hat card. The
 * old card goes under the deck, so no card is lost. @param {Match} m
 * @returns {number|null} the new laid card */
export function sharkSwap(m) {
  if (m.phase !== "lay" || m.sharkCard === null || m.hatCard === null) return null;
  m.deck.push(m.sharkCard);
  m.sharkCard = m.hatCard;
  m.hatCard = null;
  m.sharkCheated = true;
  return m.sharkCard;
}

/** The player picks up the top card. @param {Match} m @returns {number|null} */
export function playerDraw(m) {
  if (m.phase !== "lay" || m.playerHeld !== null || m.playerCard !== null)
    return null;
  m.playerHeld = takeTop(m);
  m.heldFrom = m.playerHeld === null ? null : "deck";
  return m.playerHeld;
}

/** Stage 1: the player is dealt a card, face up for him. Called once at the start of a round.
 * @param {Match} m @returns {number|null} */
export function dealPlayer(m) {
  if (m.phase !== "lay" || m.playerHeld !== null || m.playerCard !== null) return null;
  m.playerCard = takeTop(m);
  m.dealtCard = m.playerCard;
  m.playerSwapped = false;
  return m.playerCard;
}

/** Stage A: before the round the player has a card up his sleeve: the highest card among the top `look` cards of the deck. It is
 * kept in `stash.wristR` (so it counts as hidden and is confiscated when he is caught). Returns the card, or null if the sleeve is full.
 * @param {Match} m @param {number} [look] @returns {number|null} */
export function armSleeve(m, look = 8) {
  if (m.stash.wristR !== null || m.phase === "over") return null;
  ensureDeck(m, look);
  const n = Math.min(look, m.deck.length);
  let best = -1;
  for (let i = 0; i < n; i++) if (best < 0 || rankOf(m.deck[i]) > rankOf(m.deck[best])) best = i;
  if (best < 0) return null;
  m.stash.wristR = m.deck.splice(best, 1)[0];
  return m.stash.wristR;
}

/** Stage A: under the table the card in the hand and the card up the sleeve change places. The held card goes up the sleeve.
 * @param {Match} m @returns {number|null} the card now in the hand */
export function playerSwapSleeve(m) {
  if (m.phase !== "lay" || m.playerHeld === null || m.stash.wristR === null) return null;
  const up = m.stash.wristR;
  m.stash.wristR = m.playerHeld;
  m.playerHeld = up;
  m.playerSwapped = true;
  return up;
}

/** Stage A: is the card the player has (in the hand or laid) different from the card he was dealt? That card is the one he must hide.
 * @param {Match} m @returns {boolean} */
export function playerIllegal(m) {
  const c = m.playerHeld ?? m.playerCard;
  return c !== null && m.dealtCard !== null && c !== m.dealtCard;
}

/** Stage 1: lift your own card off its spot (the card is now "in your hand").
 * @param {Match} m @returns {number|null} */
export function playerLift(m) {
  if (m.phase !== "lay" || m.playerCard === null || m.playerHeld !== null) return null;
  m.playerHeld = m.playerCard;
  m.heldFrom = "lay";
  m.playerCard = null;
  return m.playerHeld;
}

/** Stage 1, the swap: drop the card you hold onto the deck. It goes under the deck and the
 * top card comes back to you, face up for you. @param {Match} m @returns {number|null} the new card */
export function playerSwapDeck(m) {
  if (m.phase !== "lay" || m.playerHeld === null || m.heldFrom !== "lay") return null;
  const next = takeTop(m);
  if (next === null) return null;
  m.deck.push(m.playerHeld);
  m.playerHeld = null;
  m.heldFrom = null;
  m.playerCard = next;
  m.playerSwapped = true;
  return next;
}

/** Desk Keep, the verb "keep": the card in the hand (the dealt card, lifted off its spot) stays face down on the keep spot instead of being played this round. It
 * takes the place of playing it: the round goes on with the hand that is left, a fresh card from the top of the deck, dealt face down on the lay spot (the player's
 * own, not a cheat: it counts as the dealt card). Allowed while the spot holds fewer than KEEP.max cards.
 * @param {Match} m @returns {{kept:number, next:number}|null} null when not allowed (nothing changes) */
export function keepHeld(m) {
  if (m.phase !== "lay" || m.playerHeld === null || m.heldFrom !== "lay" || m.playerCard !== null) return null;
  if (m.kept.length >= KEEP.max) return null;
  ensureDeck(m, 1);
  if (m.deck.length === 0) return null;
  const kept = m.playerHeld;
  m.kept.push(kept);
  m.playerHeld = null;
  m.heldFrom = null;
  const next = /** @type {number} */ (takeTop(m));
  m.playerCard = next;
  m.dealtCard = next;
  m.playerSwapped = false;
  return { kept, next };
}

/** Desk Keep, play a kept card instead of the dealt card: the dealt card (face down on the lay spot, not yet lifted) goes under the deck and the newest kept card
 * is in the hand, as if it had been dealt (it is not a cheat). @param {Match} m @returns {number|null} the card now in the hand */
export function playKept(m) {
  if (m.phase !== "lay" || m.playerHeld !== null || m.playerCard === null || m.kept.length === 0) return null;
  const card = /** @type {number} */ (m.kept.pop());
  m.deck.push(m.playerCard);
  m.playerCard = null;
  m.playerHeld = card;
  m.heldFrom = "lay";
  m.dealtCard = card;
  m.playerSwapped = false;
  return card;
}

/** Desk Keep: he slams and takes the kept cards; they go to the discard pile. @param {Match} m @returns {number[]} the cards taken */
export function seizeKept(m) {
  const taken = m.kept.splice(0);
  m.discard.push(...taken);
  return taken;
}

/** The player puts the held card back where it came from: the deck, the discard
 * pile or the stash zone (a wrong card can always be put back, P0-4).
 * @param {Match} m @returns {boolean} */
export function playerReturn(m) {
  if (m.playerHeld === null) return false;
  const from = m.heldFrom ?? "deck";
  if (from === "lay") m.playerCard = m.playerHeld;
  else if (from === "deck") m.deck.unshift(m.playerHeld);
  else if (from === "discard") m.discard.push(m.playerHeld);
  else if (m.stash[from] === null) m.stash[from] = m.playerHeld;
  else m.discard.push(m.playerHeld);
  m.playerHeld = null;
  m.heldFrom = null;
  return true;
}

/** The player lays the held card face down. A card from the discard pile cannot be
 * laid (it must be palmed or put back). @param {Match} m @returns {number|null} */
export function playerLay(m) {
  if (m.phase !== "lay" || m.playerHeld === null || m.heldFrom === "discard") return null;
  m.playerCard = m.playerHeld;
  m.playerSwapped = m.heldFrom !== "deck";
  m.playerHeld = null;
  m.heldFrom = null;
  return m.playerCard;
}

/** The Shark burns the top card face up on the discard pile after the cut, so the
 * pile always has a card to palm. @param {Match} m @returns {number|null} */
export function burnCard(m) {
  if (m.phase !== "lay" || m.discard.length > 0 || m.deck.length < 10) return null;
  const c = m.deck.shift();
  m.discard.push(/** @type {number} */ (c));
  return c;
}

/** The top card of the discard pile (face up), or null. @param {Match} m */
export function discardTop(m) {
  return m.discard.length ? m.discard[m.discard.length - 1] : null;
}

/** Palm, step 1: pinch the top discard card. @param {Match} m @returns {number|null} */
export function playerTakeDiscard(m) {
  if (m.phase !== "lay" || m.playerHeld !== null || m.palmed !== null) return null;
  if (m.discard.length === 0) return null;
  m.playerHeld = /** @type {number} */ (m.discard.pop());
  m.heldFrom = "discard";
  return m.playerHeld;
}

/** Palm, step 2: the hand lies flat over the card; it is now hidden in that hand.
 * @param {Match} m @param {string} hand "left" | "right" | "mouse" @returns {number|null} */
export function playerPalmHeld(m, hand) {
  if (m.phase !== "lay" || m.playerHeld === null || m.heldFrom !== "discard") return null;
  m.palmed = { card: m.playerHeld, hand };
  m.playerHeld = null;
  m.heldFrom = null;
  return m.palmed.card;
}

/** Put a palmed card back on the discard pile. @param {Match} m @returns {boolean} */
export function palmPutBack(m) {
  if (!m.palmed) return false;
  m.discard.push(m.palmed.card);
  m.palmed = null;
  return true;
}

/** Stash: slide the palmed card into a hidden zone. @param {Match} m @param {string} zone
 * @returns {boolean} */
export function playerStash(m, zone) {
  if (!m.palmed || !STASH_KEYS.includes(zone) || m.stash[zone] !== null) return false;
  m.stash[zone] = m.palmed.card;
  m.palmed = null;
  return true;
}

/** Swap: on the draw, take the stashed card instead of the deck card.
 * @param {Match} m @param {string} zone @returns {number|null} */
export function playerTakeStash(m, zone) {
  if (m.phase !== "lay" || m.playerHeld !== null || m.playerCard !== null) return null;
  if (!STASH_KEYS.includes(zone) || m.stash[zone] === null) return null;
  m.playerHeld = m.stash[zone];
  m.stash[zone] = null;
  m.heldFrom = zone;
  return m.playerHeld;
}

/** Cards the cone logic must treat as hidden: palmed, stashed, or held from a
 * stash zone. @param {Match} m @returns {{card:number, where:string}[]} */
export function hiddenCards(m) {
  const out = [];
  if (m.palmed) out.push({ card: m.palmed.card, where: "palm" });
  for (const k of STASH_KEYS) if (m.stash[k] !== null) out.push({ card: /** @type {number} */ (m.stash[k]), where: k });
  if (m.playerHeld !== null && m.heldFrom !== null && m.heldFrom !== "deck" && m.heldFrom !== "discard")
    out.push({ card: m.playerHeld, where: `held:${m.heldFrom}` });
  return out;
}

/** Everything hidden goes to the discard pile (a catch confiscates it).
 * @param {Match} m @returns {number[]} the cards taken */
export function confiscate(m) {
  const taken = [];
  if (m.palmed) {
    taken.push(m.palmed.card);
    m.palmed = null;
  }
  for (const k of STASH_KEYS)
    if (m.stash[k] !== null) {
      taken.push(/** @type {number} */ (m.stash[k]));
      m.stash[k] = null;
    }
  if (m.playerHeld !== null && m.heldFrom !== null && m.heldFrom !== "deck" && m.heldFrom !== "discard") {
    taken.push(m.playerHeld);
    m.playerHeld = null;
    m.heldFrom = null;
  }
  m.discard.push(...taken);
  return taken;
}

/** @param {Match} m @returns {boolean} */
export function bothLaid(m) {
  return m.phase === "lay" && m.playerCard !== null && m.sharkCard !== null;
}

/** Turn both cards over and settle the pot.
 * @param {Match} m
 * @returns {{result:"player"|"shark"|"tie", pot:number, cheated:boolean, over:boolean}|null} */
export function resolveRound(m) {
  if (!bothLaid(m)) return null;
  const cmp = compareCards(
    /** @type {number} */ (m.playerCard),
    /** @type {number} */ (m.sharkCard),
  );
  const result = cmp > 0 ? "player" : cmp < 0 ? "shark" : "tie";
  const pot = m.pot;
  if (result !== "tie") {
    m.buttons[result] += m.pot;
    m.pot = 0;
  }
  m.history.push({
    round: m.round,
    player: /** @type {number} */ (m.playerCard),
    shark: /** @type {number} */ (m.sharkCard),
    result,
    pot,
    cheated: m.sharkCheated,
    swapped: m.playerSwapped,
    cause: "cards",
  });
  m.phase = "settle";
  if (result !== "tie") m.winner = decideWinner(m);
  return { result, pot, cheated: m.sharkCheated, over: m.winner !== null };
}

/** Three strikes lose; out of buttons loses; after the last round the larger pile
 * wins; equal piles go on.
 * @param {Match} m @returns {Side|null} */
function decideWinner(m) {
  if (m.strikes.player >= STRIKES_MAX) return "shark";
  if (m.strikes.shark >= STRIKES_MAX) return "player";
  if (m.buttons.player === 0 && m.buttons.shark === 0) return null;
  if (m.buttons.player === 0) return "shark";
  if (m.buttons.shark === 0) return "player";
  if (m.round >= ROUNDS && m.buttons.player !== m.buttons.shark)
    return m.buttons.player > m.buttons.shark ? "player" : "shark";
  return null;
}

/** Clear the table after a round. Returns the next phase.
 * A tie re-deals the same round with the pot kept; otherwise the next round
 * starts and the ante goes in. @param {Match} m @returns {"lay"|"over"|null} */
export function finishRound(m) {
  if (m.phase !== "settle") return null;
  if (m.playerHeld !== null) playerReturn(m);
  for (const c of [m.playerCard, m.sharkCard]) if (c !== null) m.discard.push(c);
  if (m.hatCard !== null) {
    m.discard.push(m.hatCard);
    m.hatCard = null;
  }
  m.playerCard = null;
  m.dealtCard = null;
  m.sharkCard = null;
  m.sharkCheated = false;
  m.playerSwapped = false;
  m.penalty = null;
  if (m.winner !== null) {
    m.phase = "over";
    return "over";
  }
  const last = m.history[m.history.length - 1];
  if (last && last.result === "tie") {
    m.phase = "lay";
    return "lay";
  }
  m.round++;
  startRound(m);
  return "lay";
}

/** The player is caught. The round is lost: the pot goes to the Shark, every hidden
 * card is confiscated, `STRIKE_FINE` buttons fall on the floor and the player takes
 * a strike (the very first catch of the first ever run, `m.warn`, is a warning: no
 * strike). Allowed only during a round. @param {Match} m
 * @returns {Penalty|null} */
export function caughtPlayer(m) {
  return applyPenalty(m, "player");
}

/** The player catches him. The round is lost by the Shark: the pot goes to the
 * player, the card under his glove is confiscated, he drops `STRIKE_FINE` buttons
 * on the floor and takes a strike. @param {Match} m @returns {Penalty|null} */
export function catchShark(m) {
  return applyPenalty(m, "shark");
}

/** @param {Match} m @param {Side} side the side that was caught @returns {Penalty|null} */
function applyPenalty(m, side) {
  if (m.phase !== "lay") return null;
  const other = side === "player" ? "shark" : "player";
  if (side === "player") confiscate(m);
  else if (m.hatCard !== null) {
    m.discard.push(m.hatCard);
    m.hatCard = null;
  }
  const pot = m.pot;
  m.buttons[other] += m.pot;
  m.pot = 0;
  const fine = Math.min(STRIKE_FINE, m.buttons[side]);
  m.buttons[side] -= fine;
  m.floor += fine;
  let warned = false;
  if (side === "player" && m.warn) {
    warned = true;
    m.warn = false;
  } else m.strikes[side]++;
  m.history.push({
    round: m.round,
    player: m.playerCard,
    shark: m.sharkCard,
    result: other,
    pot,
    cheated: side === "shark",
    swapped: m.playerSwapped,
    cause: side === "player" ? "caught" : "caughtShark",
  });
  m.phase = "settle";
  m.winner = decideWinner(m);
  m.penalty = { side, fine, strike: !warned, warned, pot, over: m.winner !== null };
  return m.penalty;
}
