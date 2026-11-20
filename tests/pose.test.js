import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyHand, handScale, measureHand } from "../src/game/pose.js";
import { synthHand, wristForPalm } from "../src/game/synth.js";

const face = { forward: { x: 0, y: 0, z: -1 }, palmNormal: { x: 0, y: -1, z: 0 } };
const at = { x: 0.1, y: 0.2, z: 0.1 };
const hand = (pose, side = "right", scale = 1) => synthHand({ wrist: at, ...face, from: pose, side, scale });

test("synthesised emulator poses are classified the way the emulator names them", () => {
  const want = { fist: "fist", point: "point", pinch: "pinch", open: "open", flat: "open", default: "open" };
  for (const [pose, expect] of Object.entries(want)) {
    const c = classifyHand(hand(pose));
    assert.equal(c.pose, expect, `${pose} read as ${c.pose}`);
  }
});

test("left hands and small or large hands read the same", () => {
  for (const side of ["left", "right"]) {
    for (const scale of [0.8, 1, 1.2]) {
      assert.equal(classifyHand(hand("fist", side, scale)).pose, "fist");
      assert.equal(classifyHand(hand("point", side, scale)).pose, "point");
      assert.equal(classifyHand(hand("open", side, scale)).pose, "open");
      assert.equal(classifyHand(hand("pinch", side, scale)).pose, "pinch");
    }
  }
});

test("hand size is the palm length over 0.096 m", () => {
  assert.ok(Math.abs(handScale(hand("open", "right", 1)) - 1) < 0.02);
  assert.ok(Math.abs(handScale(hand("open", "right", 1.2)) - 1.2) < 0.03);
  const m = measureHand(hand("fist"));
  assert.ok(Object.values(m.reach).every((r) => r < 0.115), "fist reaches are short");
});

test("pointing gives a ray along the index finger; other poses give none", () => {
  const c = classifyHand(hand("point"));
  assert.ok(c.pointRay);
  assert.ok(c.pointRay.d.z < -0.9, "index points forward (-z)");
  assert.equal(classifyHand(hand("fist")).pointRay, null);
});

test("blending half way from open to fist is not yet a fist, a full blend is", () => {
  const half = synthHand({ wrist: at, ...face, from: "open", to: "fist", k: 0.35 });
  assert.notEqual(classifyHand(half).pose, "fist");
  const full = synthHand({ wrist: at, ...face, from: "open", to: "fist", k: 1 });
  assert.equal(classifyHand(full).pose, "fist");
});

test("fist keeps its state until two fingers reach out again (no flicker at the threshold)", () => {
  const f = classifyHand(hand("fist"));
  const loose = synthHand({ wrist: at, ...face, from: "fist", to: "open", k: 0.3 });
  assert.equal(classifyHand(loose, f).fist, true);
  const out = synthHand({ wrist: at, ...face, from: "fist", to: "open", k: 0.9 });
  assert.equal(classifyHand(out, f).fist, false);
});

test("wristForPalm puts the palm where asked", () => {
  const palm = { x: 0.3, y: 0.05, z: 0.0 };
  const wrist = wristForPalm(palm, face.forward, face.palmNormal, "open");
  const c = classifyHand(synthHand({ wrist, ...face, from: "open" }));
  assert.ok(Math.hypot(c.palm.x - palm.x, c.palm.y - palm.y, c.palm.z - palm.z) < 0.002);
});
