import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePoint, VIRTUAL_ROOM } from "../src/game/spots.js";

const head = { x: 0, y: 0.47, z: 0.46 };
const shark = { head: { x: 0, y: 0.47, z: -0.46 }, eyeRel: 0.47 };
const room = (used = []) => ({ surfaces: [VIRTUAL_ROOM], shark, used, head });
const ray = (o, to) => {
  const d = { x: to.x - o.x, y: to.y - o.y, z: to.z - o.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return { o, d: { x: d.x / l, y: d.y / l, z: d.z / l } };
};

test("a finger at a wall to the side is a spot", () => {
  const r = resolvePoint(ray({ x: -0.1, y: 0.25, z: 0.3 }, { x: -3.2, y: 1.0, z: -0.6 }), room());
  assert.equal(r.valid, true);
  assert.ok(r.spot.x < -3);
});

test("pointing at the table, at him, at your own lap or at the floor beside you is nothing", () => {
  assert.equal(resolvePoint(ray({ x: 0, y: 0.2, z: 0.3 }, { x: 0.1, y: 0, z: 0 }), room()).why, "table");
  assert.equal(resolvePoint(ray(head, { x: 0, y: 0.47, z: -0.46 }), room()).why, "him");
  assert.equal(resolvePoint(ray({ x: 0, y: 0.1, z: 0.4 }, { x: 0, y: -0.7, z: 0.6 }), room()).valid, false);
  assert.equal(resolvePoint(ray({ x: 0.3, y: 0.1, z: 0.4 }, { x: 0.5, y: -0.74, z: 0.9 }), room()).why, "near");
});

test("a spot he already looked at counts as nothing", () => {
  const r1 = resolvePoint(ray({ x: -0.1, y: 0.25, z: 0.3 }, { x: -3.2, y: 1.0, z: -0.6 }), room());
  const r2 = resolvePoint(ray({ x: -0.1, y: 0.25, z: 0.3 }, { x: -3.2, y: 1.1, z: -0.7 }), room([r1.spot]));
  assert.equal(r2.valid, false);
  assert.equal(r2.why, "again");
});

test("a detected wall (a disc) works like the room", () => {
  const wall = { type: "disc", c: { x: 2, y: 1, z: 0 }, n: { x: -1, y: 0, z: 0 }, r: 2 };
  const r = resolvePoint(ray({ x: 0.1, y: 0.25, z: 0.3 }, { x: 2, y: 1, z: 0 }), { surfaces: [wall], shark, used: [], head });
  assert.equal(r.valid, true);
});
