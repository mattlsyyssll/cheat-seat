/** Save and restore of a run (local storage text only). Untrusted input is checked. */
import {
  PHASES,
  ROUNDS,
  TOTAL_BUTTONS,
  STRIKES_MAX,
  STASH_KEYS,
  HELD_FROM,
  allCards,
  buttonTotal,
  playerReturn,
} from "./match.js";
import { DECK_SIZE, validCard } from "./cards.js";

export const SAVE_KEY = "cheat-seat-run-v2";
export const SAVE_VERSION = 1;
export const MAX_SAVE_CHARS = 20000;
/** A saved run older than this is ignored. */
export const MAX_AGE_MS = 12 * 3600 * 1000;

const record = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const cardOrNull = (c) => c === null || validCard(c);

/** @param {unknown} m @returns {boolean} */
export function validMatch(m) {
  if (!record(m)) return false;
  const x = /** @type {any} */ (m);
  if (x.version !== 2 || !Number.isFinite(x.seed)) return false;
  if (!record(x.rng) || !Number.isInteger(x.rng.s)) return false;
  if (!Array.isArray(x.deck) || !Array.isArray(x.discard)) return false;
  if (![x.hatCard, x.playerHeld, x.playerCard, x.sharkCard].every(cardOrNull))
    return false;
  if (!PHASES.includes(x.phase)) return false;
  if (!Number.isInteger(x.round) || x.round < 1 || x.round > 200) return false;
  if (!record(x.buttons)) return false;
  for (const v of [x.buttons.player, x.buttons.shark, x.pot])
    if (!Number.isInteger(v) || v < 0 || v > TOTAL_BUTTONS) return false;
  if (buttonTotal(x) !== TOTAL_BUTTONS) return false;
  if (x.winner !== null && x.winner !== "player" && x.winner !== "shark")
    return false;
  if (!Array.isArray(x.history) || x.history.length > 400) return false;
  if (!Number.isInteger(x.sharkCheats) || x.sharkCheats < 0) return false;
  if (typeof x.sharkCheated !== "boolean") return false;
  if (typeof x.playerSwapped !== "boolean" || typeof x.warn !== "boolean") return false;
  if (!Number.isInteger(x.floor) || x.floor < 0 || x.floor > TOTAL_BUTTONS) return false;
  if (!record(x.strikes)) return false;
  for (const v of [x.strikes.player, x.strikes.shark])
    if (!Number.isInteger(v) || v < 0 || v > STRIKES_MAX) return false;
  if (x.palmed !== null) {
    if (!record(x.palmed) || !validCard(x.palmed.card) || typeof x.palmed.hand !== "string" || x.palmed.hand.length > 12)
      return false;
  }
  if (!record(x.stash)) return false;
  for (const k of STASH_KEYS) if (!cardOrNull(x.stash[k])) return false;
  // Desk Keep: a save from before the keep spot has no `kept`; when there is one it holds at most two real cards
  if (x.kept !== undefined && (!Array.isArray(x.kept) || x.kept.length > 2 || !x.kept.every(validCard))) return false;
  if (x.heldFrom !== null && !HELD_FROM.includes(x.heldFrom)) return false;
  if ((x.heldFrom === null) !== (x.playerHeld === null)) return false;
  if (x.penalty !== null && !record(x.penalty)) return false;
  const all = allCards(x);
  if (all.length !== DECK_SIZE || !all.every(validCard)) return false;
  return new Set(all).size === DECK_SIZE;
}

/** @param {import("./match.js").Match} m @param {number} [now] @returns {string} */
export function serializeRun(m, now = Date.now()) {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: now, match: m });
}

/**
 * A run saved mid-round restarts that round cleanly: a held card goes back on the
 * deck and laid cards go to the discard pile; the ante stays in the pot.
 * @param {import("./match.js").Match} m */
export function settleForRestore(m) {
  if (!Array.isArray(m.kept)) m.kept = [];
  if (m.playerHeld !== null) playerReturn(m);
  if (m.palmed) {
    // a palmed card goes under the desk edge if that is free, else back on the pile
    if (m.stash.edge === null) m.stash.edge = m.palmed.card;
    else m.discard.push(m.palmed.card);
    m.palmed = null;
  }
  m.playerSwapped = false;
  m.dealtCard = null;
  m.penalty = null;
  for (const k of /** @type {const} */ (["playerCard", "sharkCard"]))
    if (m[k] !== null) {
      m.discard.push(/** @type {number} */ (m[k]));
      m[k] = null;
    }
  m.sharkCheated = false;
  if (m.phase === "settle") m.phase = m.winner ? "over" : "lay";
  return m;
}

/** @param {string|null|undefined} raw @param {number} [now]
 * @returns {import("./match.js").Match|null} null when missing, invalid, old or finished */
export function restoreRun(raw, now = Date.now()) {
  if (typeof raw !== "string" || raw.length > MAX_SAVE_CHARS) return null;
  try {
    const data = JSON.parse(raw);
    if (!record(data) || data.version !== SAVE_VERSION) return null;
    if (!Number.isFinite(data.savedAt) || now - data.savedAt > MAX_AGE_MS || data.savedAt > now + 60000)
      return null;
    if (!validMatch(data.match)) return null;
    const m = data.match;
    if (m.phase === "over" || m.round > ROUNDS + 20) return null;
    return settleForRestore(m);
  } catch {
    return null;
  }
}
