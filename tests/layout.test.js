import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZONES, REACH_ZONES, REACH_LIMIT, CONE_HALF_ANGLE_DEG, CARD, FELT,
  chestDistance, coneAngleDeg, chooseDesk, deskFrame, polygonArea,
  insidePolygon, nearestOnPolygon,
} from "../src/game/layout.js";
import { isPinching, pinchAt, PINCH_TOUCH_M } from "../src/game/hands.js";

test("every zone the player's hands must reach is within 60 cm of the chest", () => {
  for (const name of REACH_ZONES)
    assert.ok(chestDistance(ZONES[name]) <= REACH_LIMIT, `${name} ${chestDistance(ZONES[name])}`);
});

test("the Shark, the pot and his gloves sit inside a 40 degree cone in front of the player", () => {
  for (const name of ["hat", "pot", "sharkLay", "sharkPile", "gloveRestR", "gloveRestL"])
    assert.ok(coneAngleDeg(ZONES[name]) <= CONE_HALF_ANGLE_DEG, `${name} ${coneAngleDeg(ZONES[name])}`);
  assert.equal(CONE_HALF_ANGLE_DEG * 2, 40);
});

test("cards on their spots stay on the felt and do not overlap each other", () => {
  const rect = (z) => ({ x0: z.x - CARD.w / 2, x1: z.x + CARD.w / 2, z0: z.z - CARD.h / 2, z1: z.z + CARD.h / 2 });
  const cards = ["deck", "discard", "playerLay", "sharkLay"].map((n) => [n, rect(ZONES[n])]);
  for (const [n, r] of cards) {
    assert.ok(r.x0 >= -FELT.w / 2 && r.x1 <= FELT.w / 2, `${n} inside felt in x`);
    assert.ok(r.z0 >= FELT.cz - FELT.d / 2 && r.z1 <= FELT.cz + FELT.d / 2, `${n} inside felt in z`);
  }
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i][1], b = cards[j][1];
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
      assert.equal(overlap, false, `${cards[i][0]} overlaps ${cards[j][0]}`);
    }
});

test("polygon helpers: area, inside, nearest point", () => {
  const desk = [{ x: -0.6, z: -1.2 }, { x: 0.6, z: -1.2 }, { x: 0.6, z: -0.5 }, { x: -0.6, z: -0.5 }];
  assert.ok(Math.abs(polygonArea(desk) - 0.84) < 1e-9);
  assert.equal(insidePolygon(desk, { x: 0, z: -0.8 }), true);
  assert.equal(insidePolygon(desk, { x: 0, z: 0 }), false);
  const n = nearestOnPolygon(desk, { x: 0.2, z: 0 });
  assert.ok(Math.abs(n.x - 0.2) < 1e-9 && Math.abs(n.z + 0.5) < 1e-9);
});

test("desk choice ignores floors, ceilings, small tops; takes the nearest table-height plane", () => {
  const sq = (cx, cz, h, y) => ({ id: `${cx},${cz},${y}`, y, polygon: [
    { x: cx - h, z: cz - h }, { x: cx + h, z: cz - h }, { x: cx + h, z: cz + h }, { x: cx - h, z: cz + h }] });
  const planes = [
    sq(0, 0, 3, 0), // floor
    sq(0, 0, 3, 2.6), // ceiling
    sq(0.3, -0.9, 0.2, 0.74), // area 0.16: too small
    sq(2, -2, 0.6, 0.74), // far table
    sq(0, -1.0, 0.5, 0.74), // near table
    sq(0, -0.9, 0.3, 1.4), // too high (shelf)
  ];
  const best = chooseDesk(planes, { x: 0, z: 0 });
  assert.equal(best.id, "0,-1,0.74");
  assert.equal(chooseDesk([sq(0, 0, 3, 0)], { x: 0, z: 0 }), null);
  assert.equal(chooseDesk([], { x: 0, z: 0 }), null);
});

test("desk frame: a desk close to the player puts the chest 0.40 m behind the origin and the Shark opposite", () => {
  const poly = [{ x: -0.6, z: -0.5 }, { x: 0.6, z: -0.5 }, { x: 0.6, z: -1.2 }, { x: -0.6, z: -1.2 }];
  const best = chooseDesk([{ id: 1, y: 0.74, polygon: poly }], { x: 0, z: 0 });
  const f = deskFrame(best.near, best.centroid, { x: 0, z: 0 }, { x: 0, z: -1 });
  assert.ok(Math.abs(f.x) < 1e-9 && Math.abs(f.z + 0.4) < 1e-9, "origin 0.40 m ahead of the player");
  assert.ok(Math.abs(f.yaw) < 1e-9, "local +z points back at the player");
});

test("desk frame: a desk far away puts the near edge of the mat on the desk edge and faces the player", () => {
  const poly = [{ x: 1.4, z: -3.2 }, { x: 2.6, z: -3.2 }, { x: 2.6, z: -2.2 }, { x: 1.4, z: -2.2 }];
  const best = chooseDesk([{ id: 1, y: 0.74, polygon: poly }], { x: 0, z: 0 });
  const f = deskFrame(best.near, best.centroid, { x: 0, z: 0 }, { x: 0, z: -1 });
  // local +z in world is (sin yaw, cos yaw); it must point from the origin toward the player
  const toPlayer = { x: -f.x, z: -f.z };
  const l = Math.hypot(toPlayer.x, toPlayer.z);
  assert.ok(Math.abs(Math.sin(f.yaw) - toPlayer.x / l) < 1e-9);
  assert.ok(Math.abs(Math.cos(f.yaw) - toPlayer.z / l) < 1e-9);
  const behind = nearestOnPolygon(poly, { x: f.x, z: f.z });
  assert.ok(Math.hypot(behind.x - f.x, behind.z - f.z) < 0.01 || insidePolygon(poly, { x: f.x, z: f.z }));
});

test("a hand pinches on a select event or when the fingertips touch; a pinch point is near a zone only when close and low", () => {
  assert.equal(isPinching(true, 0.08), true, "the runtime says select");
  assert.equal(isPinching(false, PINCH_TOUCH_M - 0.001), true, "tips touching");
  assert.equal(isPinching(false, 0.03), false, "a relaxed hand is not a pinch");
  assert.equal(isPinching(false, NaN), false);
  assert.equal(pinchAt({ x: -0.2, y: 0.05, z: 0.04 }, ZONES.deck, 0.09), true);
  assert.equal(pinchAt({ x: -0.2, y: 0.4, z: 0.04 }, ZONES.deck, 0.09), false, "too high above the desk");
  assert.equal(pinchAt({ x: 0.2, y: 0.05, z: 0.04 }, ZONES.deck, 0.09), false, "too far sideways");
});
