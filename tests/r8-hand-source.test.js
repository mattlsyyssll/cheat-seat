/** Round 8, Q03: a session with controllers and no hands, or with no input source. */
import test from "node:test";
import assert from "node:assert/strict";
import { load, readSrc } from "./r8-lib.js";

const H = await load("input/hand-source.js");
const HAND = { hand: {}, targetRayMode: "none", handedness: "right" };
const CONTROLLER = { hand: null, targetRayMode: "tracked-pointer", handedness: "right" };
const GAZE = { hand: null, targetRayMode: "gaze", handedness: "none" };

/** seconds the match waits, for a list of sources that holds for `seconds` */
function waits(sources, seconds, w = H.createHandSourceWatch(), dt = 1 / 72) {
  let first = null;
  for (let t = 0; t < seconds; t += dt) if (H.handSourceStep(w, dt, sources) && first === null) first = t;
  return first;
}

test("controllers only: the match waits and the line says to put the controllers down", () => {
  const w = H.createHandSourceWatch();
  const t = waits([CONTROLLER], 3, w);
  assert.notEqual(t, null, "the match never waited");
  assert.ok(t <= 1.1, `waited from ${t} s`);
  assert.equal(w.reason, "controllers");
  assert.equal(H.NO_HAND_LINE, "Put the controllers down and use your hands");
});

test("no input source: nothing for 2.9 s, the match waits from 3 s", () => {
  assert.equal(waits([], 2.9), null);
  const t = waits([], 4);
  assert.ok(t !== null && t >= 2.9 && t <= 3.1, `waited from ${t}`);
});

test("a hand arrives: the match goes on at once; hands and Glasses gaze never wait", () => {
  const w = H.createHandSourceWatch();
  assert.notEqual(waits([CONTROLLER], 2, w), null);
  assert.equal(H.handSourceStep(w, 1 / 72, [HAND]), false);
  assert.equal(waits([GAZE], 5), null);
  assert.equal(waits([HAND, HAND], 5), null);
});

test("the page stops the match and shows the line (index.ts)", () => {
  const index = readSrc("index.ts");
  assert.match(index, /handSourceStep\(handWatch, realDt, session\.inputSources\)/);
  assert.match(index, /const frozen = userPaused \|\| hitStop > 0 \|\| noHand/);
  assert.match(index, /booth\.hint\.set\(NO_HAND_LINE\)/);
});
