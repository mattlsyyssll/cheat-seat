import { test } from "node:test";
import assert from "node:assert/strict";
import { createMouse, mouseHand, mouseFor, mouseLook, mouseWheel, mouseButton, mouseTick, cursorRay, cameraBasis, createGaze, gazeHand, createHandsFeeder, MOUSE, CLICK } from "../src/game/adapters.js";
import { synthHand, wristForPalm } from "../src/game/synth.js";

const HEAD = { x: 0, y: 0.47, z: 0.46 };
const POSE = { yaw: 0, pitchDown: (22 * Math.PI) / 180 };
const CAM = { fovY: 72, aspect: 1 };

test("the mouse hand rides the felt wherever the cursor points (wheel factor 1), and the inverse puts it back", () => {
  for (const p of [{ x: 0, y: 0.045, z: 0.09 }, { x: -0.2, y: 0.045, z: -0.1 }, { x: 0.25, y: 0.045, z: 0.15 }]) {
    const c = mouseFor(p, HEAD, POSE, CAM);
    const m = createMouse();
    Object.assign(m, { ndcX: c.ndcX, ndcY: c.ndcY, factor: c.factor });
    const h = mouseHand(m, HEAD, POSE, CAM);
    assert.ok(Math.hypot(h.pos.x - p.x, h.pos.y - p.y, h.pos.z - p.z) < 1e-6, `round trip ${JSON.stringify(p)}`);
    assert.ok(Math.abs(c.factor - 1) < 0.05, `on the felt the wheel factor is about 1 (got ${c.factor})`);
  }
});

test("the wheel moves the hand through the table top: more than about 1.2 is under the table", () => {
  const m = createMouse();
  m.ndcX = 0; m.ndcY = -0.3;
  const y = (f) => { m.factor = f; return mouseHand(m, HEAD, POSE, CAM).pos.y; };
  assert.ok(y(1.0) > 0.03);
  assert.ok(y(1.6) < -0.02, `factor 1.6 gives y ${y(1.6)}`);
  mouseWheel(m, 5);
  assert.equal(m.factor, MOUSE.factorMax);
  mouseWheel(m, -5);
  assert.equal(m.factor, MOUSE.factorMin);
});

test("the cursor in the bottom edge dives the hand under the table without the wheel", () => {
  const m = createMouse();
  m.ndcX = 0; m.ndcY = -0.99; m.factor = 1;
  assert.ok(mouseHand(m, HEAD, POSE, CAM).pos.y < -0.03);
  m.ndcY = -0.7;
  assert.ok(mouseHand(m, HEAD, POSE, CAM).pos.y > 0.03);
});

test("left button is a fist, right button (or the point switch) is a point ray from the eye through the cursor", () => {
  const m = createMouse();
  m.left = true;
  assert.equal(mouseHand(m, HEAD, POSE, CAM).fist, true);
  m.left = false; m.right = true; m.ndcX = 0.3; m.ndcY = 0.1;
  const h = mouseHand(m, HEAD, POSE, CAM);
  assert.equal(h.fist, false);
  assert.ok(h.pointRay);
  const d = cursorRay(m, POSE, CAM);
  assert.ok(Math.abs(h.pointRay.d.x - d.x) < 1e-9);
  assert.deepEqual(h.pointRay.o, HEAD);
  m.right = false; m.pointMode = true;
  assert.equal(mouseHand(m, HEAD, POSE, CAM).pointRay, null, "point mode alone only arms the point: nothing is pointed until you click");
  m.left = true;
  const pm = mouseHand(m, HEAD, POSE, CAM);
  assert.ok(pm.pointRay && pm.fist === false, "in point mode a left click is a point, not a fist");
});

test("a plain click is seen: down and up inside one frame still closes the hand for CLICK.fistS of game time, and a right click points for CLICK.pointS", () => {
  const m = createMouse();
  mouseButton(m, "left", true);
  mouseButton(m, "left", false); // the same frame
  let frames = 0;
  while (mouseHand(m, HEAD, POSE, CAM).fist && frames < 200) { mouseTick(m, 1 / 60); frames++; }
  assert.ok(frames >= Math.floor(CLICK.fistS * 60) - 1 && frames <= Math.ceil(CLICK.fistS * 60) + 1, `a click closed the hand for ${frames} frames`);
  // a slow frame loop (10 frames per second) still sees at least one closed frame
  const slow = createMouse();
  mouseButton(slow, "left", true);
  mouseButton(slow, "left", false);
  assert.equal(mouseHand(slow, HEAD, POSE, CAM).fist, true, "the first frame after a click sees the fist");
  // a held button follows the button, with no extra tail beyond the latch
  const held = createMouse();
  mouseButton(held, "left", true);
  for (let i = 0; i < 120; i++) mouseTick(held, 1 / 60);
  assert.equal(mouseHand(held, HEAD, POSE, CAM).fist, true, "a held button stays a fist");
  mouseButton(held, "left", false);
  assert.equal(mouseHand(held, HEAD, POSE, CAM).fist, false, "and opens when released after the latch has run out");
  // right click
  const r = createMouse();
  mouseButton(r, "right", true);
  mouseButton(r, "right", false);
  let pf = 0;
  while (mouseHand(r, HEAD, POSE, CAM).pointRay && pf < 200) { mouseTick(r, 1 / 60); pf++; }
  assert.ok(pf / 60 >= 0.3, `a right click holds the point ray for ${(pf / 60).toFixed(2)} s: the rules need a steady 0.3 s`);
  // point mode: a left click is a point, held for the same time
  const pmode = createMouse();
  pmode.pointMode = true;
  mouseButton(pmode, "left", true);
  mouseButton(pmode, "left", false);
  let q = 0;
  while (mouseHand(pmode, HEAD, POSE, CAM).pointRay && q < 200) { mouseTick(pmode, 1 / 60); q++; }
  assert.ok(q / 60 >= 0.3, "a click in point mode points long enough");
});

test("Glasses: a quick pinch tap is a click too (the fist or point is kept for CLICK time), a held pinch follows the pinch", () => {
  const s = createGaze();
  const ray = { o: HEAD, d: { x: 0, y: -0.45, z: -0.9 } };
  let h = gazeHand(s, ray, true, 1 / 60);
  assert.equal(h.fist, true);
  let frames = 0;
  while (gazeHand(s, ray, false, 1 / 60).fist && frames < 100) frames++;
  assert.ok(frames >= 5 && frames <= 12, `the tap kept the fist for ${frames} frames`);
  const up = { o: HEAD, d: { x: -0.7, y: 0.2, z: -0.7 } };
  h = gazeHand(s, up, true, 1 / 60);
  assert.ok(h.pointRay);
  frames = 0;
  while (gazeHand(s, up, false, 1 / 60).pointRay && frames < 100) frames++;
  assert.ok(frames / 60 >= 0.3, "a tap with the gaze raised points long enough for the rules (0.3 s)");
});

test("holding the dive key puts the hand under the table wherever the cursor is", () => {
  const m = createMouse();
  m.ndcX = 0; m.ndcY = -0.3; m.factor = 1;
  assert.ok(mouseHand(m, HEAD, POSE, CAM).pos.y > 0.03);
  m.dive = true;
  assert.ok(mouseHand(m, HEAD, POSE, CAM).pos.y < -0.03, "Space puts the hand under the table");
});

test("near the screen edges the head turns a little (up to 16 degrees across, 10 up or down) and comes back", () => {
  const m = createMouse();
  m.ndcX = 1; m.ndcY = 0;
  for (let i = 0; i < 200; i++) mouseLook(m, 0.02);
  assert.ok(m.lookYaw > 14 && m.lookYaw <= 16.01);
  m.ndcX = 0;
  for (let i = 0; i < 300; i++) mouseLook(m, 0.02);
  assert.ok(Math.abs(m.lookYaw) < 0.1);
  const b = cameraBasis(0, 0.4);
  assert.ok(b.f.z < 0 && b.f.y < 0 && b.u.y > 0, "the camera looks toward the Shark, down a little, with up up");
});

test("Glasses: the hand rides the gaze to the felt; looking down past the near edge goes under; a pinch with the gaze raised is a point", () => {
  const s = createGaze();
  const ray = (to) => { const d = { x: to.x - HEAD.x, y: to.y - HEAD.y, z: to.z - HEAD.z }; const l = Math.hypot(d.x, d.y, d.z); return { o: HEAD, d: { x: d.x / l, y: d.y / l, z: d.z / l } }; };
  let h = gazeHand(s, ray({ x: 0, y: 0.045, z: 0.09 }), true);
  assert.equal(h.fist, true);
  assert.ok(Math.hypot(h.pos.x, h.pos.y - 0.045, h.pos.z - 0.09) < 0.02, "the hand is where you look");
  gazeHand(s, ray({ x: 0, y: 0.045, z: 0.09 }), false);
  h = gazeHand(s, ray({ x: 0, y: -0.5, z: 0.3 }), true);
  assert.ok(h.pos.y < -0.03, `under the table (y ${h.pos.y})`);
  gazeHand(s, ray({ x: 0, y: 0.3, z: 0.3 }), false);
  h = gazeHand(s, ray({ x: -3.2, y: 1.0, z: -0.6 }), true);
  assert.ok(h.pointRay && h.fist === false);
});

test("the feeder: joints in, HandInput out; a missing hand is a dropout (tracked false), not an error", () => {
  const f = createHandsFeeder();
  const face = { forward: { x: 0, y: -0.15, z: -1 }, palmNormal: { x: 0, y: -1, z: 0 } };
  const pos = { x: 0.1, y: 0.05, z: 0.2 };
  const j = (pose) => synthHand({ wrist: wristForPalm(pos, face.forward, face.palmNormal, pose), ...face, from: pose, side: "right" });
  let r = f.feed({ right: j("fist") });
  assert.equal(r.inputs.length, 1);
  assert.equal(r.inputs[0].fist, true);
  assert.ok(Math.hypot(r.inputs[0].pos.x - pos.x, r.inputs[0].pos.y - pos.y, r.inputs[0].pos.z - pos.z) < 0.003);
  r = f.feed({ right: null });
  assert.equal(r.inputs[0].tracked, false);
  r = f.feed({ left: j("open") });
  assert.deepEqual(r.inputs.map((i) => [i.id, i.tracked]).sort(), [["left", true], ["right", false]]);
  r = f.feed({ right: j("pinch") });
  assert.equal(r.inputs.find((i) => i.id === "right").pinch, true);
  r = f.feed({ right: j("open") }, { right: true });
  assert.equal(r.inputs.find((i) => i.id === "right").pinch, true, "the runtime's own select event counts as a pinch");
});
