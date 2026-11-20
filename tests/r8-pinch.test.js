/** Round 8, Q04: pinch with two thresholds and a short hold. A card must not drop or be grabbed again when the tracked gap flickers around one value. */
import test from "node:test";
import assert from "node:assert/strict";
import { load, readSrc } from "./r8-lib.js";

const { JOINTS } = await load("game/pose.js");
const Pose = await load("game/pose.js");
const { createHandsFeeder } = await load("game/adapters.js");
const DT = 1 / 72;

/** An open hand (fingers out, so no fist and no point) whose thumb tip is `gap` metres from the index tip. */
function joints(gap) {
  const j = {};
  for (const n of JOINTS) j[n] = { x: 0.02, y: 0, z: -0.05 };
  j["wrist"] = { x: 0, y: 0, z: 0 };
  j["middle-finger-phalanx-proximal"] = { x: 0, y: 0, z: -0.096 };
  for (const f of ["index", "middle", "ring", "pinky"]) j[`${f}-finger-tip`] = { x: 0, y: 0, z: -0.17 };
  j["index-finger-phalanx-proximal"] = { x: 0, y: 0, z: -0.11 };
  j["thumb-tip"] = { x: gap, y: 0, z: -0.17 };
  return j;
}
function drive(gaps) {
  const feeder = createHandsFeeder();
  return gaps.map((g) => feeder.feed({ right: joints(g) }, {}, DT).inputs[0].pinch);
}
const count = (s, from, to) => s.reduce((n, v, i) => n + (i > 0 && s[i - 1] === from && v === to ? 1 : 0), 0);
const drops = (s) => count(s, true, false);
const grabs = (s) => count(s, false, true);
const rep = (a, n) => Array.from({ length: n }, () => a).flat();

test("a gap that flickers around the old release threshold (4 cm) drops the card 0 times", () => {
  const s = drive([...rep([0.015], 20), ...rep([0.036, 0.036, 0.036, 0.044, 0.044, 0.044], 24)]);
  assert.equal(s[19], true, "the card was grabbed");
  assert.equal(drops(s), 0);
  assert.equal(s[s.length - 1], true);
});

test("short spikes above the release threshold (shorter than the hold time) drop the card 0 times", () => {
  const s = drive([...rep([0.015], 20), ...rep([0.06, 0.06, 0.015, 0.015, 0.015, 0.015], 12)]);
  assert.equal(drops(s), 0);
});

test("a real release still lets go: once, within 0.12 s", () => {
  const s = drive([...rep([0.015], 20), ...rep([0.08], 30)]);
  assert.equal(drops(s), 1);
  const at = s.findIndex((v, i) => i >= 20 && !v);
  assert.ok((at - 20) * DT <= 0.12, `let go after ${((at - 20) * DT).toFixed(3)} s`);
});

test("a gap that flickers around the grab threshold (2.5 cm) does not grab", () => {
  const s = drive([...rep([0.08], 10), ...rep([0.02, 0.03], 30)]);
  assert.equal(grabs(s), 0);
});

test("the two-threshold switch holds its state between the thresholds, and the held card is drawn with it (world/booth.ts)", () => {
  assert.equal(typeof Pose.hysteresis, "function");
  let on = false;
  const seen = [];
  for (const g of rep([0.045, 0.036], 20)) { on = Pose.hysteresis(on, g, 0.03, 0.05); seen.push(on); }
  assert.deepEqual([...new Set(seen)], [false], "between 3 and 5 cm a released pinch stays released");
  on = true;
  for (const g of rep([0.045, 0.036], 20)) on = Pose.hysteresis(on, g, 0.03, 0.05) && on;
  assert.equal(on, true);
  assert.match(readSrc("world/booth.ts"), /hysteresis\(this\.pinchVis/);
});
