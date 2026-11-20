/** What a player keeps between visits (pure, no storage here): a streak of matches won, the best streak, and a jar of
 * saved buttons. Phase 5, PRODUCT-FIT P1-2 "reason to come back". Local only: nothing leaves the browser.
 *  - A match you win: streak +1 (best follows), and the jar gains the buttons you finished with beyond the 20 you started
 *    with (at least 1).
 *  - A match you lose: the streak goes back to 0. The jar keeps what it has.
 *  - The scene shows it with shapes only (a jar of buttons, five medals), never text. It appears after the first match ends. */
import { START_BUTTONS } from "./match.js";

export const PROGRESS_KEY = "cheat-seat-progress-v1";
/** Buttons the jar can show at once (the saved count itself can be larger). */
export const JAR_SHOWN_MAX = 42;
/** Medals on the desk: the streak and the best streak are drawn up to this many. */
export const MEDALS = 5;
const COUNT_CAP = 9999;

/** @typedef {{matches:number, wins:number, streak:number, best:number, jar:number}} Progress */

/** @returns {Progress} */
export function emptyProgress() {
  return { matches: 0, wins: 0, streak: 0, best: 0, jar: 0 };
}

/** @param {unknown} v @returns {number} a whole number from 0 to COUNT_CAP */
function count(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(COUNT_CAP, Math.floor(v))) : 0;
}

/** Read what was saved. Anything that is not a plain object of numbers gives an empty record.
 * @param {string|null|undefined} raw @returns {Progress} */
export function parseProgress(raw) {
  if (typeof raw !== "string" || raw.length > 400) return emptyProgress();
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object" || Array.isArray(d)) return emptyProgress();
    const p = { matches: count(d.matches), wins: count(d.wins), streak: count(d.streak), best: count(d.best), jar: count(d.jar) };
    p.wins = Math.min(p.wins, p.matches);
    p.streak = Math.min(p.streak, p.wins);
    p.best = Math.max(p.best, p.streak);
    return p;
  } catch {
    return emptyProgress();
  }
}

/** @param {Progress} p @returns {string} */
export function serializeProgress(p) {
  return JSON.stringify(p);
}

/** The record after one finished match. @param {Progress} p @param {{won:boolean, buttons:number}} result @returns {Progress} */
export function recordMatch(p, result) {
  const next = { ...p, matches: Math.min(COUNT_CAP, p.matches + 1) };
  if (result.won) {
    next.wins = Math.min(COUNT_CAP, p.wins + 1);
    next.streak = Math.min(COUNT_CAP, p.streak + 1);
    next.best = Math.max(p.best, next.streak);
    next.jar = Math.min(COUNT_CAP, p.jar + Math.max(1, Math.floor(result.buttons) - START_BUTTONS));
  } else next.streak = 0;
  return next;
}

/** Buttons drawn in the jar. @param {Progress} p @returns {number} */
export function jarShown(p) {
  return Math.min(JAR_SHOWN_MAX, p.jar);
}

/** The jar and the medals show once a match has been played. @param {Progress} p @returns {boolean} */
export function marksVisible(p) {
  return p.matches > 0;
}

/** How many medals are lit, and which one carries the best-streak halo (0 for none).
 * @param {Progress} p @returns {{lit:number, haloAt:number}} */
export function medalState(p) {
  return { lit: Math.min(MEDALS, p.streak), haloAt: Math.min(MEDALS, p.best) };
}
