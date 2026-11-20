/** The Shark learns your tell (pure, no random numbers): what the player does every time he cheats, and what the Shark does about it.
 *
 * Each swap is recorded as three habits:
 *  - cover: the look-away that hides the swap: "look" (he glances at his own card) or "point" (you pointed him at the wall); null when the swap had no cover,
 *  - hand: "left" or "right" (only a headset has two hands; the mouse is one hand and has no hand habit),
 *  - fist: "long" (the fist stayed closed FIST_LONG_S or more in the round) or "short".
 * He expects you to cheat the way you cheated last time: he adapts to the habits of your last swap, from round ADAPT_FROM_ROUND of a first match and from round 1 of a rematch (he remembers you).
 *  - cover habit: on that kind of look-away he looks back sooner (GLANCE_CUT_S for his own glance instead of 0.8 to 1.4 s, POINT_CUT_S when you point him away instead of 2 s), his eyes flick to your hand TELL_LEAD_S before he turns back,
 *    and for BACK_CHECK_S after he turns back a hand under the table gives you away at once (a jump in suspicion).
 *  - hand habit: he watches that hand: a look-away no longer covers it (a hidden hand of that habit raises suspicion at twice the rate) and he looks at it more.
 *  - fist habit (only when there is no hand habit): the fist closing is seen twice as well.
 * You beat it by changing the habit (cover the swap with the other kind of look-away, use the other hand, close the fist for less time), and by reading his tell:
 * his eyes flick to your hand just before he turns back, and a hand that is up and in sight when he turns back is not seen. */

export const ADAPT_FROM_ROUND = 2;
export const ADAPT_FROM_ROUND_REMATCH = 1;
export const FIST_LONG_S = 1.8;
export const GLANCE_CUT_S = 0.7;
export const POINT_CUT_S = 1.0;
export const TELL_LEAD_S = 0.4;
export const BACK_JUMP = 0.7;
export const BACK_CHECK_S = 2.0;
export const WATCH_HIDDEN_X = 2;
export const WATCH_FIST_X = 2.5;
const REMEMBER = 12;

/** @typedef {{cover:"look"|"point"|null, hand:"left"|"right"|null, fist:"long"|"short"}} Habit */
/** @typedef {{swaps: Habit[], matchNo:number, caught:Record<string, number>}} Habits */

/** @returns {Habits} */
export function createHabits() {
  return { swaps: [], matchNo: 1, caught: {} };
}

/** A new match begins: the memory stays (he remembers you), the per-match list of what he caught starts again. @param {Habits} h */
export function habitsNewMatch(h) {
  h.matchNo++;
  h.caught = {};
}

/** @param {Habits} h @param {{cover:"look"|"point"|null, hand:string, fistS:number}} s the swap: the look-away that covered it, the hand id, the longest fist of the round */
export function recordSwap(h, s) {
  h.swaps.push({
    cover: s.cover,
    hand: s.hand === "left" || s.hand === "right" ? s.hand : null,
    fist: s.fistS >= FIST_LONG_S ? "long" : "short",
  });
  if (h.swaps.length > REMEMBER) h.swaps.shift();
}

/** What he has learned, for the round that starts now. @param {Habits} h @param {number} round
 * @returns {{cover:"look"|"point"|null, hand:"left"|"right"|null, fist:boolean}|null} null when he has learned nothing (or it is too early) */
export function adaptation(h, round) {
  const from = h.matchNo > 1 ? ADAPT_FROM_ROUND_REMATCH : ADAPT_FROM_ROUND;
  if (round < from || h.swaps.length < 1) return null;
  const last = h.swaps[h.swaps.length - 1];
  const cover = last.cover;
  const hand = last.hand;
  const fist = !hand && last.fist === "long";
  if (!cover && !hand && !fist) return null;
  return { cover, hand, fist };
}

/** The habits counted over the memory: how many of the remembered swaps share the commonest value. @param {Habits} h */
export function habitCounts(h) {
  const tally = (key) => {
    const c = {};
    for (const s of h.swaps) if (s[key]) c[s[key]] = (c[s[key]] ?? 0) + 1;
    let best = null;
    for (const [k, n] of Object.entries(c)) if (!best || n > best.n) best = { value: k, n };
    return best;
  };
  return { cover: tally("cover"), hand: tally("hand"), fist: tally("fist"), total: h.swaps.length };
}

/** The match-end lines: what he caught about you, and one thing to try. Plain words. @param {Habits} h
 * @returns {{caught:string[], next:string}} */
export function matchHabitLines(h) {
  const c = habitCounts(h);
  const caught = [];
  const tries = [];
  if (h.caught.cover) {
    const point = c.cover?.value === "point";
    caught.push(point ? "You always cheated when you pointed him away." : "You always cheated when he looked at his own card.");
    tries.push(point ? "Wait until he looks at his own card." : "Point him at the wall.");
  }
  if (h.caught.hand) {
    caught.push(`You always used your ${c.hand?.value} hand.`);
    tries.push(`Use your ${c.hand?.value === "left" ? "right" : "left"} hand.`);
  }
  if (h.caught.fist) {
    caught.push("You kept your fist closed a long time.");
    tries.push("Open the fist sooner.");
  }
  if (!caught.length) {
    return { caught: [], next: c.total >= 2 ? "He saw no habit. Keep changing how you cheat." : "Cheat at least twice and he starts to learn you." };
  }
  return { caught, next: `Try this: ${tries[0]}` };
}
