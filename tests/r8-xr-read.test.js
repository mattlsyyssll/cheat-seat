/** Round 8, Q16: the headset read allocates nothing per frame after warm-up (input/xr-read.js; the feeder in game/adapters.js is counted separately). */
import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceObserver } from "node:perf_hooks";
import { load, readSrc } from "./r8-lib.js";

const { XrReader } = await load("input/xr-read.js");
const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const POSE = { transform: { position: { x: 0.1, y: 1, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } };
const SPACE = {};
const HAND = { get: () => SPACE };
const GAZE = { handedness: "none", targetRayMode: "gaze", targetRaySpace: SPACE, hand: null };
const SOURCES = [{ handedness: "left", hand: HAND, targetRayMode: "none" }, { handedness: "right", hand: HAND, targetRayMode: "none" }, GAZE];
const FRAME = { session: { inputSources: SOURCES }, getViewerPose: () => POSE, getJointPose: () => POSE, getPose: () => POSE };
const FED = { inputs: [], joints: new Map() };
const stubFeeder = () => ({ feed: () => FED });
const SEL = new Set(["right"]);
const NOISE = { sigma: 0, seed: 1 };

async function gcEvents(run) {
  let n = 0;
  const obs = new PerformanceObserver((l) => { n += l.getEntries().length; });
  obs.observe({ entryTypes: ["gc"] });
  run();
  await new Promise((res) => setTimeout(res, 200));
  obs.disconnect();
  return n;
}

test("the read gives the same objects every frame (no new hand records, no new result)", () => {
  let seen = null;
  const r = new XrReader(() => ({ feed: (hands) => { seen = hands; return FED; } }));
  const a = r.read(FRAME, SPACE, ID, 1 / 72, SEL, NOISE);
  const left1 = seen.left, right1 = seen.right, wrist1 = seen.right.wrist;
  const b = r.read(FRAME, SPACE, ID, 1 / 72, SEL, NOISE);
  assert.equal(a, b, "a new result object each frame");
  assert.equal(a.head, b.head);
  assert.equal(seen.left, left1);
  assert.equal(seen.right, right1);
  assert.equal(seen.right.wrist, wrist1, "a new joint object each frame");
});

test("the read still gives the right numbers (position, forward direction, a turned table)", () => {
  const r = new XrReader(stubFeeder);
  const move = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]; // column-major: moves by (1,2,3)
  const o = r.read(FRAME, SPACE, move, 1 / 72, SEL, NOISE);
  assert.ok(Math.abs(o.head.pos.x - 1.1) < 1e-9 && Math.abs(o.head.pos.y - 3) < 1e-9 && Math.abs(o.head.pos.z - 2.7) < 1e-9);
  assert.ok(Math.abs(o.head.dir.z + 1) < 1e-9 && o.head.tracked === true && o.selecting === true && o.gaze.has === true);
  const yaw = { transform: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } } };
  const f2 = { ...FRAME, getViewerPose: () => yaw };
  const o2 = r.read(f2, SPACE, ID, 1 / 72, SEL, NOISE);
  assert.ok(Math.abs(o2.head.dir.x + 1) < 1e-9 && Math.abs(o2.head.dir.z) < 1e-9, "a quarter turn about y looks along -x");
  assert.equal(Object.keys(r.hj.left).length, 25);
});

test("a hand that loses a joint is passed on as lost (null)", () => {
  let seen = null;
  const r = new XrReader(() => ({ feed: (hands) => { seen = { ...hands }; return FED; } }));
  const lost = { ...FRAME, getJointPose: (j, ref, n = (lost.n = (lost.n || 0) + 1)) => (n > 30 ? null : POSE) };
  r.read(lost, SPACE, ID, 1 / 72, SEL, NOISE);
  assert.notEqual(seen.left, null);
  assert.equal(seen.right, null);
});

test("allocations per frame after warm-up: 0 (no garbage collection in 200000 frames)", async () => {
  const r = new XrReader(stubFeeder);
  for (let i = 0; i < 3000; i++) r.read(FRAME, SPACE, ID, 1 / 72, SEL, NOISE);
  const gcs = await gcEvents(() => { for (let i = 0; i < 200000; i++) r.read(FRAME, SPACE, ID, 1 / 72, SEL, NOISE); });
  assert.ok(gcs <= 1, `${gcs} garbage collections in 200000 frames`);
});

test("xr.ts uses it, and the placement code in index.ts reuses its vector", () => {
  assert.match(readSrc("input/xr.ts"), /new XrReader\(/);
  assert.doesNotMatch(readSrc("index.ts"), /const fw = new Vector3/);
});
