/** Stage A numbers for the three difficulty sets. INFERRED, not measured: tune them in the headset run (stage C). Same code, different numbers.
 * Easy forgives more and gives longer windows; Hard is quick to see and quick to cheat. */
import { levelId } from "./levels.js";

/** @typedef {{cheatChance:number, cheatWindowS:number, seeS:number, stareSpeed:number, gainDip:number, gainFist:number, gainNothing:number,
 *   distractS:number, stareMinS:number, roundTimeoutS:number, cheatFrom:number, cheatTo:number, guildRate:number, hiddenRate:number, glanceScale:number, keepSeeS:number}} Tuning */
/** keepSeeS (Desk Keep): seconds his view cone must cover the keep spot, with cards on it, before he slams and takes them. Starts near seeS (the time to spot a hidden card: 0.55 / 0.38 / 0.28), longer (1.0 / 0.7 / 0.55)
 * because the spot is in plain view all the time. Tuned 2026-11-11 (fair first keep): with a card safe in the round it was kept, a card survives the next round in about half of idle runs on Normal (see qa/DESK-KEEP.md). Still to be tuned in the headset run. */
/** @type {Record<string, Tuning>} */
export const TUNING = {
  easy: { cheatChance: 0.5, cheatWindowS: 3.0, seeS: 0.55, stareSpeed: 0.09, gainDip: 0.15, gainFist: 0.03, gainNothing: 0.3, distractS: 2.6, stareMinS: 2.0, roundTimeoutS: 50, cheatFrom: 6, cheatTo: 16, guildRate: 0.03, hiddenRate: 0.03, glanceScale: 1.2, keepSeeS: 1.0 },
  normal: { cheatChance: 0.65, cheatWindowS: 2.3, seeS: 0.38, stareSpeed: 0.07, gainDip: 0.22, gainFist: 0.06, gainNothing: 0.35, distractS: 2.0, stareMinS: 2.4, roundTimeoutS: 40, cheatFrom: 5, cheatTo: 14, guildRate: 0.04, hiddenRate: 0.04, glanceScale: 1, keepSeeS: 0.7 },
  hard: { cheatChance: 0.8, cheatWindowS: 1.7, seeS: 0.28, stareSpeed: 0.055, gainDip: 0.28, gainFist: 0.09, gainNothing: 0.4, distractS: 1.5, stareMinS: 2.8, roundTimeoutS: 32, cheatFrom: 4, cheatTo: 11, guildRate: 0.05, hiddenRate: 0.05, glanceScale: 0.8, keepSeeS: 0.55 },
};

/** Glasses keep risk (2026-11-11): the Glasses keep spot (x 0.31, z -0.10, game/keep.js) lies at the edge of his cone's sweep (about 41 degrees off his axis from his eye, against 30 for the Quest spot), so with the Quest numbers
 * his cone never covered it (idle: 24 of 24 cards survived). Two numbers move for Glasses only: the cone is 12 degrees wider for the keep spot (GLASSES_KEEP_CONE_EXTRA; the edge sits at about 8 degrees, so 12 is clear of it) and the dwell is longer (seconds the cone must
 * cover the spot before he takes the cards). Measured with `GLASSES=1 node qa/keep-fair-measure.mjs normal 24`: a kept card survives one following round in 13 of 24 idle runs (54 percent) and 18 of 24 with look-away (75 percent); 8 seeds: 4 of 8 and 6 of 8. See qa/DESK-KEEP.md "Glasses keep spot". */
export const GLASSES_KEEP_SEE_S = { easy: 3.4, normal: 2.4, hard: 1.9 };
/** Degrees added to his cone for the keep spot on Glasses (the spot is further from the middle of his sweep). */
export const GLASSES_KEEP_CONE_EXTRA = { easy: 12, normal: 12, hard: 12 };

/** @param {Tuning} t @returns {Tuning} the same level with the Glasses keep dwell */
export function glassesTuning(t) {
  const id = levelId(Object.keys(TUNING).find((k) => TUNING[k] === t));
  return { ...t, keepSeeS: GLASSES_KEEP_SEE_S[id] ?? t.keepSeeS, keepConeExtra: GLASSES_KEEP_CONE_EXTRA[id] ?? 0 };
}

/** @param {string|null|undefined} id @returns {Tuning} */
export function tuningOf(id) {
  return TUNING[levelId(id)];
}

/** Points he can be pointed away from per match. */
export const POINTS_PER_MATCH = 3;
/** A hand must hold a point this long (seconds) with a steady aim before it counts. */
export const POINT_HOLD_S = 0.3;
