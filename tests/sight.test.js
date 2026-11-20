import { test } from "node:test";
import assert from "node:assert/strict";
import { canSee, blockedByTable, angleTo, CONE } from "../src/game/sight.js";
import { TABLE } from "../src/game/booth.js";

const eye = { pos: { x: 0, y: 0.47, z: -0.46 }, dir: { x: 0, y: -0.2, z: 1 } };

test("the table top blocks a hand below it, as seen from his eyes; a hand above the top or beside the table is seen", () => {
  assert.equal(blockedByTable(eye.pos, { x: 0, y: -0.1, z: 0.1 }), true);
  assert.equal(blockedByTable(eye.pos, { x: 0, y: 0.05, z: 0.1 }), false);
  assert.equal(blockedByTable(eye.pos, { x: 0.9, y: -0.1, z: 0.1 }), false, "beside the table the line misses the top");
  assert.equal(blockedByTable(eye.pos, { x: 0, y: -0.2, z: 0.4 }), true, "in your lap the table is in the way");
  assert.equal(blockedByTable(eye.pos, { x: 0, y: -0.02, z: 0.6 }), false, "a hand a hair below the top and far past the near edge is seen over the edge");
});

test("a real desk polygon replaces the card table", () => {
  const poly = [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }];
  assert.equal(blockedByTable(eye.pos, { x: 0.8, y: -0.1, z: 0.3 }, { ...TABLE, polygon: poly }), true);
});

test("view cone: what is outside it is not seen, even in the open", () => {
  const away = { pos: eye.pos, dir: { x: 1, y: 0, z: 0 } }; // looking along +x
  const hand = { x: 0, y: 0.1, z: 0.1 };
  assert.equal(canSee(away, hand, CONE.watch).visible, false);
  assert.equal(canSee(eye, hand, CONE.watch).visible, true);
  assert.ok(angleTo(eye.pos, away.dir, hand) > 80);
});

test("looking at his own card puts the player's hands at the lay spot outside a narrow cone (the window), looking at the face does not", () => {
  const own = { pos: eye.pos, dir: { x: 0, y: -0.46, z: 0.31 } };
  const face = { pos: eye.pos, dir: { x: 0, y: 0, z: 1 } };
  const handAtLaySpot = { x: 0, y: 0.08, z: 0.15 };
  assert.equal(canSee(own, handAtLaySpot, 18).visible, false);
  assert.equal(canSee(face, handAtLaySpot, 36).visible, true);
});
