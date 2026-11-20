/** The start screen's demo (stage D, judge fix 6: show the stake early). Behind the title a ghost hand takes the card, the Shark leans in and
 * stares, the hand twitches and he slams it: what getting caught costs, inside the first seconds of a cold start, with no click needed.
 * It is the REAL game on a throwaway state (same rules, same Shark); only the hand is a script. Pure: positions and a few brain nudges, no graphics.
 * Times are seconds since the demo started; the loop restarts at `loopS`. Table-local metres. */
import { SPOTS } from "./booth.js";

export const ATTRACT = { handIn: 1.7, grabAt: 2.6, liftAt: 2.95, stillAt: 3.6, twitchAt: 5.5, twitchS: 0.25, loopS: 11, stareNudgeAt: 4.0 };
const LAY = { x: SPOTS.playerLay.x, y: 0.05, z: SPOTS.playerLay.z };
const START = { x: 0.34, y: 0.15, z: 0.34 };
const STILL = { x: 0.03, y: 0.08, z: 0.15 };
const smooth = (k) => k * k * (3 - 2 * k);
const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

/** The ghost hand at time t: null before it comes in, else { pos, fist }. @param {number} t */
export function attractHand(t) {
  const A = ATTRACT;
  if (t < A.handIn) return null;
  if (t < A.grabAt) return { pos: mix(START, LAY, smooth((t - A.handIn) / (A.grabAt - A.handIn))), fist: false };
  if (t < A.liftAt) return { pos: LAY, fist: true };
  if (t < A.stillAt) return { pos: mix(LAY, STILL, smooth((t - A.liftAt) / (A.stillAt - A.liftAt))), fist: true };
  if (t < A.twitchAt) return { pos: STILL, fist: true };
  const k = Math.min(1, (t - A.twitchAt) / A.twitchS);
  return { pos: { x: STILL.x + 0.11 * k, y: STILL.y + 0.03 * k, z: STILL.z }, fist: true };
}

/** What the demo tells the brain: no random cheat, and a nudge of suspicion so that he leans in to stare. Call once a frame. @param {any} g @param {number} t */
export function attractStep(g, t) {
  if (g.brain.plan) g.brain.plan = null;
  if (t >= ATTRACT.stareNudgeAt && !g._attractNudged) {
    g._attractNudged = true;
    g.brain.suspicion = Math.max(g.brain.suspicion, 0.7);
    g.brain.holdStare = 99; // he stays in the stare until the hand moves
  }
}

/** The caption under the demo: "stare" while he stares, "slam" once he has slammed; null otherwise. @param {any} view */
export function attractCaption(view) {
  if (view.phase === "caught") return "attract-slam";
  if (view.stare) return "attract-stare";
  return null;
}
