/** Stage E, judge item 9 (webcam hands): the tracker's 21 landmarks become the game's own hand input, shape only. Tested on SYNTHETIC landmarks made from the emulator's hand model
 * (game/hand-poses.js): a recorded clip of a real person's hands is not available here (the replay harness, qa/stageE/webcam-replay.mjs, is ready for one: see qa/stageE/README.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWebcamMapper, handShape, tablePoint, WEBCAM } from "../src/input/webcam-map.js";
import { createHandsFeeder } from "../src/game/adapters.js";
import { POSE_JOINTS } from "../src/game/hand-poses.js";

const MP = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24]; // landmark i is joint MP[i] of the 25
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

/** A hand as the tracker would report it. `pose` from the hand model, `side`, the hand's place `at` in the (raw, not mirrored) picture, `s` its size in the picture, `rot` an in-plane
 * turn (radians), `noise` jitter in picture units, `rng` a seeded generator. Palm toward the camera, fingers up in the picture. Returns {landmarks, worldLandmarks}. */
function tracker(pose, { side = "right", at = [0.5, 0.5], s = 1, rot = 0, noise = 0, rng = () => 0.5, blend = null } = {}) {
  const P = blend ? POSE_JOINTS[pose].map((p, i) => p.map((v, k) => v + (POSE_JOINTS[blend.to][i][k] - v) * blend.k)) : POSE_JOINTS[pose];
  const mir = side === "left" ? -1 : 1;
  // the hand's centre (mean of wrist and knuckles) is the origin of the world landmarks
  const pick = MP.map((j) => P[j]);
  const world = pick.map((p) => ({ x: -p[0] * mir, y: p[2], z: p[1] })); // camera frame: x right, y down, z away; fingers up
  const c = [0, 5, 9, 13, 17].map((i) => world[i]).reduce((a, p) => ({ x: a.x + p.x / 5, y: a.y + p.y / 5, z: a.z + p.z / 5 }), { x: 0, y: 0, z: 0 });
  const centred = world.map((p) => ({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }));
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const turned = centred.map((p) => ({ x: p.x * cr - p.y * sr, y: p.x * sr + p.y * cr, z: p.z }));
  const j = () => (rng() - 0.5) * 2 * noise;
  const image = turned.map((p) => ({ x: at[0] + p.x * 2.2 * s + j(), y: at[1] + p.y * 2.9 * s + j(), z: p.z * 2 * s }));
  return { landmarks: [image], worldLandmarks: [turned] };
}
const seeded = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const feedOnce = (res, t = 1000) => { const m = createWebcamMapper(); const f = createHandsFeeder(); const r = m.update(res, t); const fed = f.feed(r.hands, {}); return { r, fed, input: fed.inputs.find((i) => i.tracked) }; };

test("a closed hand, an open hand and a pointing finger are read as such by the game's own rules (shape only), on both hands and at any turn of the picture", () => {
  for (const side of ["right", "left"]) {
    for (const rot of [0, 0.5, -0.6, 1.1]) {
      const fist = feedOnce(tracker("fist", { side, rot })).input;
      assert.equal(fist.fist, true, `${side} fist, turned ${rot}`);
      assert.equal(fist.pointRay, null);
      const open = feedOnce(tracker("open", { side, rot })).input;
      assert.equal(open.fist, false, `${side} open, turned ${rot}`);
      assert.equal(open.pointRay, null);
      const point = feedOnce(tracker("point", { side, rot })).input;
      assert.equal(point.fist, false);
      assert.ok(point.pointRay, `${side} point, turned ${rot}`);
    }
  }
});

test("the hand is the left or right hand by its shape, whatever the picture's side", () => {
  assert.equal(feedOnce(tracker("open", { side: "right" })).input.id, "right");
  assert.equal(feedOnce(tracker("open", { side: "left" })).input.id, "left");
});

test("the place on the table comes from the place in the picture only: mirrored like a selfie, up is far, down is near, and the size of the hand in the picture is not a distance", () => {
  const at = (u, v, s = 1) => feedOnce(tracker("open", { at: [u, v], s })).input.pos;
  const centre = at(0.5, 0.5), right = at(0.2, 0.5), left = at(0.8, 0.5);
  // the picture is raw (the camera faces you): your right hand appears at the picture's left; the game mirrors it back, so smaller picture x is more to the right
  assert.ok(right.x > centre.x + 0.15, `a hand at the picture's left goes right on the table (${right.x} vs ${centre.x})`);
  assert.ok(left.x < centre.x - 0.15);
  assert.ok(at(0.5, 0.15).z < at(0.5, 0.5).z - 0.15, "up in the picture is farther from you");
  assert.ok(at(0.5, 0.85).z > at(0.5, 0.5).z + 0.15, "down in the picture is nearer to you");
  // never depth from the size: the same hand 1.8 times bigger in the picture (closer to the camera) lands on the same spot with the same joints
  const a = feedOnce(tracker("open", { at: [0.4, 0.45], s: 1 })).fed.joints.get("right"), b = feedOnce(tracker("open", { at: [0.4, 0.45], s: 1.8 })).fed.joints.get("right");
  for (const k of Object.keys(a)) for (const c of ["x", "y", "z"]) assert.ok(Math.abs(a[k][c] - b[k][c]) < 2e-3, `${k}.${c} the same at any size (${a[k][c]} vs ${b[k][c]})`);
});

test("the hand lies on the felt (a fixed height) and sinks under the table at the bottom of the picture; a hand lost low stays under the table for the rules", () => {
  const y = (v) => feedOnce(tracker("open", { at: [0.5, v] })).input.pos.y;
  assert.ok(Math.abs(y(0.4) - y(0.7)) < 0.012, "the same height anywhere above the bottom");
  assert.ok(y(0.4) > 0.02 && y(0.4) < 0.12);
  assert.ok(y(0.99) < -0.05, `the bottom of the picture is below the felt (${y(0.99)})`);
  assert.ok(Math.abs(tablePoint(0.5, 0.0).z - WEBCAM.zFar) < 1e-9);
  assert.ok(Math.abs(tablePoint(0.5, 1.0).z - WEBCAM.zNear) < 1e-9);
});

test("the tracker's own jitter is not a move: a hand held still with 4 mm of noise (0.4 percent of the picture) stays within 1 mm, and a real move is followed", () => {
  const m = createWebcamMapper();
  const rng = seeded(5);
  let t = 0, first = null, worst = 0;
  for (let i = 0; i < 150; i++) {
    t += 33;
    const r = m.update(tracker("open", { at: [0.5, 0.5], noise: 0.004, rng }), t);
    const w = r.hands.right.wrist;
    if (!first) first = { ...w };
    else worst = Math.max(worst, Math.hypot(w.x - first.x, w.y - first.y, w.z - first.z));
  }
  assert.ok(worst < 0.001, `held still: moved ${worst} m`);
  // then the hand moves 20 percent of the picture to the side over a second: the table hand follows
  let last = null;
  for (let i = 0; i < 30; i++) { t += 33; last = m.update(tracker("open", { at: [0.5 - 0.2 * ((i + 1) / 30), 0.5] }), t).hands.right.wrist; }
  assert.ok(last.x - first.x > 0.12, `the hand followed a real move (${last.x - first.x} m)`);
});

test("noise on the landmarks does not flip the pose: 600 noisy frames of a fist, an open hand and a point, 98 percent right or more", () => {
  for (const [pose, check] of [["fist", (i) => i.fist], ["open", (i) => !i.fist && !i.pointRay], ["point", (i) => !!i.pointRay]]) {
    const rng = seeded(11);
    const m = createWebcamMapper(), f = createHandsFeeder();
    let ok = 0, n = 600;
    for (let i = 0; i < n; i++) {
      const r = m.update(tracker(pose, { at: [0.5, 0.5], noise: 0.004, rng }), 33 * (i + 1));
      if (check(f.feed(r.hands, {}).inputs.find((i) => i.tracked))) ok++;
    }
    assert.ok(ok / n >= 0.98, `${pose}: ${ok} of ${n}`);
  }
});

test("a hand that is not seen for a quarter of a second is lost (tracked false); a short dropout is carried over", () => {
  const m = createWebcamMapper(), f = createHandsFeeder();
  let r = m.update(tracker("open"), 1000);
  assert.ok(r.hands.right);
  r = m.update({ landmarks: [], worldLandmarks: [] }, 1120);
  assert.ok(r.hands.right, "100 ms without a hand: still there");
  r = m.update({ landmarks: [], worldLandmarks: [] }, 1400);
  assert.equal(r.hands.right, null, "400 ms without a hand: lost");
  const input = f.feed({ right: null }, {}).inputs.find((i) => i.id === "right");
  assert.equal(input.tracked, false);
});

test("a pointing hand turns toward the way the finger points in the picture (shape and angle only)", () => {
  const dirX = (rot) => feedOnce(tracker("point", { rot })).input.pointRay.d.x;
  // the picture is mirrored for the game: a finger turned toward the picture's right (rot positive turns clockwise in image coordinates) aims to one side, the other turn to the other side
  assert.ok(dirX(0.6) * dirX(-0.6) < 0, "opposite turns aim to opposite sides");
  assert.ok(Math.abs(dirX(0)) < 0.15, "a finger straight up aims straight ahead");
});

test("the input is only the game's own: no controller, no recording and no network call is made with a picture (source check)", () => {
  const cam = read("../src/input/webcam.ts") + read("../src/input/webcam-map.js");
  assert.equal(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|MediaRecorder|toDataURL|toBlob|createImageBitmap|new Blob|localStorage|indexedDB/.test(cam), false, "no picture is stored or sent");
  assert.match(cam, /audio: false/);
  assert.match(cam, /\.\/mediapipe/);
  assert.equal(/https?:\/\//.test(cam.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), false, "no remote address in the code");
  const index = read("../src/index.ts");
  assert.match(index, /ui\.onCam\(/);
  assert.match(index, /webcamOn && webcam\.frame\(\)/);
});

test("the webcam path is opt-in and never the default: the start screen's main button is still the mouse, the camera starts only on its own button, and the words say what it does", () => {
  const html = read("../index.html");
  assert.match(html, /id="btn-mouse"[^>]*class="big"/);
  assert.match(html, /id="btn-cam"/);
  assert.match(html, /Play with your hands \(webcam\)/);
  assert.match(html, /Nothing is recorded or sent/);
  const ui = read("../src/flat-ui.ts");
  for (const id of ["p1-grab", "p1-fist", "p1-open", "p1-lay", "p2-wait", "p2-still", "p3-wait", "p3-grab", "p4-take", "p4-wait", "p4-under", "p4-swap", "p4-lay"]) assert.match(ui, new RegExp(`WEBCAM_PROMPTS[\\s\\S]*"${id}": \\{ text:`), `webcam words for ${id}`);
  assert.equal(/headset proof|headset footage/i.test(html + ui), false, "never labelled as headset proof");
});

test("shape needs only 21 landmarks and refuses a broken one", () => {
  assert.equal(handShape([]), null);
  assert.equal(handShape(null), null);
  const flat = Array.from({ length: 21 }, () => [0, 0, 0]);
  assert.equal(handShape(flat), null);
});
