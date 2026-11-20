import { test } from "node:test";
import assert from "node:assert/strict";
import { createRig, idleCommand } from "../src/actor/rig.js";
import { BODY, SEAT } from "../src/game/booth.js";

const player = { x: 0, y: SEAT.eyeRel, z: SEAT.playerZ };
const run = (rig, cmd, secs, dt = 1 / 60) => {
  let pose;
  for (let t = 0; t < secs; t += dt) pose = rig.step(dt, cmd, { playerHead: player });
  return pose;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test("at rest his eyes are at the player's eye height, about 0.9 m away, looking at the player", () => {
  const rig = createRig();
  const p = run(rig, { ...idleCommand(), lookAt: player }, 1.5);
  assert.ok(Math.abs(p.head.pos.y - SEAT.eyeRel) < 0.02);
  assert.ok(Math.abs(dist(p.head.pos, player) - 0.92) < 0.05, `distance ${dist(p.head.pos, player)}`);
  assert.ok(p.sight.dir.z > 0.9, "he looks toward the player");
});

test("lean-in brings his head centre to 0.7 m from the player's head (his face about 0.5 m), and back", () => {
  const rig = createRig();
  const near = run(rig, { ...idleCommand(), lookAt: player, lean: 1 }, 2.5);
  const d = dist(near.head.pos, player);
  assert.ok(d > 0.64 && d < 0.76, `distance ${d.toFixed(2)}`);
  const back = run(rig, { ...idleCommand(), lookAt: player, lean: 0 }, 3);
  assert.ok(dist(back.head.pos, player) > 0.85);
});

test("the head turns to a spot in the room within 0.8 s, up to 105 degrees; eyes lead the head", () => {
  const rig = createRig();
  const spot = { x: -3.2, y: 1.0, z: -0.6 };
  const early = run(rig, { ...idleCommand(), lookAt: spot, eyesAt: spot }, 0.12);
  assert.ok(Math.abs(early.eyes.l.yaw) > Math.abs(early.head.yaw) * 0.5 || Math.abs(early.eyes.l.yaw) > 0.2, "the eyes move first");
  const late = run(rig, { ...idleCommand(), lookAt: spot, eyesAt: spot }, 0.8);
  assert.ok(late.head.yaw < -1.0, `yaw ${late.head.yaw}`);
  const back = run(createRig(), { ...idleCommand(), lookAt: { x: 0, y: 1, z: -3 }, eyesAt: { x: 0, y: 1, z: -3 } }, 1.5);
  assert.ok(Math.abs(back.head.yaw) <= (105 * Math.PI) / 180 + 1e-6, "behind him: the head stops at 105 degrees");
});

test("breathing is faster and deeper in a stare; the right shoulder dips when he cheats", () => {
  const rig = createRig();
  let calm = [];
  for (let i = 0; i < 600; i++) calm.push(rig.step(1 / 60, { ...idleCommand(), lookAt: player }, { playerHead: player }).breath);
  const flips = (a) => a.slice(1).filter((v, i) => v > 0.5 !== a[i] > 0.5).length;
  const rig2 = createRig();
  let fast = [];
  for (let i = 0; i < 600; i++) fast.push(rig2.step(1 / 60, { ...idleCommand(), lookAt: player, breathRate: 0.72, breathAmp: 1 }, { playerHead: player }).breath);
  assert.ok(flips(fast) > flips(calm) * 1.8);
  const before = run(createRig(), idleCommand(), 1).shoulders.r.y;
  const dipped = run(createRig(), { ...idleCommand(), dipR: 1 }, 1).shoulders.r.y;
  assert.ok(before - dipped > 0.06, `dip ${before - dipped}`);
});

test("his hand goes under the table at the wrist spot, and a slam lands on a target in about 0.2 s", () => {
  const rig = createRig();
  const u = run(rig, { ...idleCommand(), handR: { mode: "under" } }, 1.2);
  assert.ok(dist(u.handR.wrist, BODY.cheatWrist) < 0.02);
  const t = { x: 0.1, y: 0.0, z: 0.15 };
  const r2 = createRig();
  const s = run(r2, { ...idleCommand(), handR: { mode: "slam", target: t } }, 0.25);
  assert.ok(Math.abs(s.handR.wrist.z - (t.z - 0.09)) < 0.03 && s.handR.wrist.y < 0.06, `wrist ${JSON.stringify(s.handR.wrist)}`);
});

test("the pose exposes eyes, lids, brows, jaw, head and hands for the art stage", () => {
  const p = createRig().pose;
  for (const k of ["head", "eyes", "sight", "torso", "breath", "shoulders", "handR", "handL", "mouth", "jaw", "brow", "brows", "dipR"]) assert.ok(k in p, k);
  assert.ok("lid" in p.eyes.l && "lid" in p.eyes.r && "l" in p.brows && "r" in p.brows);
});
