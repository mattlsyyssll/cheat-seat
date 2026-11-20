/** Card rules. A card is an integer 0..51. Rank 2..14 (14 is the ace), suit 0..3.
 * The deck is an array; index 0 is the top card. */
import { nextInt } from "./rng.js";

export const DECK_SIZE = 52;
export const SUITS = ["spades", "hearts", "diamonds", "clubs"];
export const RANK_NAMES = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};
/** First rank that counts as a "high card" for the Shark's cheat card. */
export const HIGH_RANK = 12;

/** @param {number} card @returns {number} 2..14 */
export function rankOf(card) {
  return 2 + (card % 13);
}
/** @param {number} card @returns {number} 0..3 */
export function suitOf(card) {
  return Math.floor(card / 13);
}
/** @param {number} rank @returns {string} */
export function rankName(rank) {
  return RANK_NAMES[/** @type {11|12|13|14} */ (rank)] ?? String(rank);
}
/** @param {unknown} card @returns {boolean} */
export function validCard(card) {
  return Number.isInteger(card) && card >= 0 && card < DECK_SIZE;
}

/** @returns {number[]} a new ordered deck */
export function createDeck() {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

/** Fisher-Yates in place. @param {number[]} deck @param {import("./rng.js").Rng} rng @returns {number[]} */
export function shuffle(deck, rng) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Cut: the top `n` cards go under the rest. Returns a new array; same cards.
 * @param {number[]} deck @param {number} n @returns {number[]} */
export function cutDeck(deck, n) {
  if (!Number.isInteger(n) || n < 1 || n >= deck.length) return deck.slice();
  return [...deck.slice(n), ...deck.slice(0, n)];
}

/** High Card: higher rank wins; suits do not count; equal ranks tie.
 * @param {number} a @param {number} b @returns {1|0|-1} 1 if a wins */
export function compareCards(a, b) {
  const d = rankOf(a) - rankOf(b);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

/** Index of the highest-ranked card in the deck, topmost on equal rank; -1 if empty.
 * @param {number[]} deck @returns {number} */
export function highestIndex(deck) {
  let best = -1;
  for (let i = 0; i < deck.length; i++)
    if (best < 0 || rankOf(deck[i]) > rankOf(deck[best])) best = i;
  return best;
}

const RANK_WORDS = { 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
/** A card in plain words with its article: "a King", "an 8", "an Ace", "a 3". @param {number|null|undefined} card @returns {string} */
export function cardWords(card) {
  if (card === null || card === undefined) return "no card";
  const rank = rankOf(card);
  const w = RANK_WORDS[/** @type {11|12|13|14} */ (rank)] ?? String(rank);
  return `${rank === 8 || rank === 14 ? "an" : "a"} ${w}`;
}
