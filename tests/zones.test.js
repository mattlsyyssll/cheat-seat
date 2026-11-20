import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WRIST_CORE_R, WRIST_R, EDGE_Z, WRIST_REST, STASH_ZONES, ZONE_HOLDER,
  zoneAnchor, stashZoneAt, takeZoneAt, inEdgeStrip, inDiscardZone, inSlapZone,
} from "../src/game/zones.js";
import { ZONES, chestDistance, REACH_LIMIT, coneAngleDeg, HEAD } from "../src/game/layout.js";
import { handShape, createTrail, pushTrail, pickTarget, dist3 } from "../src/game/hands.js";
import { createRng, nextFloat } from "../src/game/rng.js";

const P = (x, y, z) => ({ x, y, z });
const hands = (extra = {}) => ({
  left: { tracked: true, wrist: P(-0.2, 0.08, 0.3), palm: P(-0.2, 0.05, 0.22), flat: true },
  right: { tracked: true, wrist: P(0.2, 0.08, 0.3), palm: P(0.2, 0.05, 0.22), flat: true },
  ...extra,
});

test("wrist zones: the 6 cm core is inside the 8 cm zone (P0-4 grew it from 6 cm)", () => {
  assert.equal(WRIST_CORE_R, 0.06);
  assert.equal(WRIST_R, 0.08);
  const h = hands();
  const wl = h.left.wrist;
  for (const r of [0.02, 0.059]) assert.equal(stashZoneAt(P(wl.x, wl.y + r, wl.z), h, "right")?.zone, "wristL", `${r} m`);
  assert.equal(stashZoneAt(P(wl.x, wl.y + 0.075, wl.z), h, "right")?.zone, "wristL", "7.5 cm still counts (soft pull)");
  assert.equal(stashZoneAt(P(wl.x, wl.y + 0.1, wl.z), h, "right"), null, "10 cm does not");
});

test("a hand cannot stash into its own wrist or under itself", () => {
  const h = hands();
  assert.equal(stashZoneAt(h.right.wrist, h, "right"), null);
  assert.equal(stashZoneAt(h.right.wrist, h, "left")?.zone, "wristR");
});

test("a wrist zone is still there when that hand is not tracked", () => {
  const h = hands({ left: { tracked: false, wrist: P(9, 9, 9), palm: P(9, 9, 9), flat: false } });
  const a = zoneAnchor("wristL", h);
  assert.deepEqual(a, WRIST_REST.left);
  assert.equal(stashZoneAt(P(WRIST_REST.left.x, WRIST_REST.left.y, WRIST_REST.left.z), h, "right")?.zone, "wristL");
});

test("edge strip: the lip on the player's side, low, inside the desk width", () => {
  assert.equal(inEdgeStrip(P(0, 0.02, EDGE_Z + 0.02)), true);
  assert.equal(inEdgeStrip(P(0.3, 0.05, 0.36)), true);
  assert.equal(inEdgeStrip(P(0, 0.02, EDGE_Z - 0.05)), false, "in front of the strip");
  assert.equal(inEdgeStrip(P(0, 0.2, 0.34)), false, "too high");
  assert.equal(inEdgeStrip(P(0.6, 0.02, 0.34)), false, "outside the desk width");
  assert.equal(stashZoneAt(P(0, 0.03, 0.34), hands(), "right")?.zone, "edge");
});

test("there is no hiding place under the other hand (removed in phase 5: hand over hand is the least reliable tracking case)", () => {
  const h = hands();
  // a palmed card laid on top of a resting flat hand is not a hiding place any more
  const onPalm = P(h.left.palm.x + 0.03, 0.02, h.left.palm.z);
  assert.equal(stashZoneAt(onPalm, h, "right"), null);
  assert.equal(stashZoneAt(h.left.palm, h, "right"), null);
  assert.equal(stashZoneAt(h.right.palm, h, "left"), null);
  assert.deepEqual(Object.keys(ZONE_HOLDER).sort(), ["edge", "wristL", "wristR"]);
  assert.equal(zoneAnchor("underL", h), null);
  assert.equal(takeZoneAt(onPalm, h, { wristL: null, wristR: null, edge: null, underL: 5 }, "right"), null, "an old save with a card under a hand finds no zone");
});

test("the nearest zone wins when two overlap", () => {
  const h = hands();
  const p = P(h.left.wrist.x + 0.02, h.left.wrist.y, h.left.wrist.z);
  const z = stashZoneAt(p, h, "right");
  assert.equal(z.zone, "wristL");
});

test("taking a stashed card back (swap): wrist zones with a card, the edge strip, never an empty zone", () => {
  const h = hands();
  const stash = { wristL: 20, wristR: null, edge: 7 };
  assert.equal(takeZoneAt(P(-0.2, 0.08, 0.3), h, stash, "right"), "wristL");
  assert.equal(takeZoneAt(P(0.2, 0.08, 0.3), h, stash, "left"), null, "right wrist holds nothing");
  assert.equal(takeZoneAt(P(0, 0.02, 0.34), h, stash, "right"), "edge");
  assert.equal(takeZoneAt(P(0, 0.02, 0.34), h, { ...stash, edge: null }, "right"), null);
});

test("zone holder: the hand a hidden card belongs to (for the caught check)", () => {
  assert.equal(ZONE_HOLDER.wristL, "left");
  assert.equal(ZONE_HOLDER.wristR, "right");
  assert.equal(ZONE_HOLDER.edge, null, "the strip belongs to no hand");
  assert.deepEqual(STASH_ZONES, ["wristL", "wristR", "edge"], "three hiding places: two wrists and the strip under the desk edge");
});

test("discard zone, slap zone, and the reach rule", () => {
  assert.equal(inDiscardZone(P(ZONES.discard.x, 0.03, ZONES.discard.z)), true);
  assert.equal(inDiscardZone(P(ZONES.discard.x + 0.06, 0.03, ZONES.discard.z)), true);
  assert.equal(inDiscardZone(P(ZONES.deck.x, 0.03, ZONES.deck.z)), false);
  assert.equal(inSlapZone(P(0.1, 0.03, -0.15)), true, "his half of the desk");
  assert.equal(inSlapZone(P(0.1, 0.03, 0.1)), false, "your half");
  assert.equal(inSlapZone(P(0.1, 0.2, -0.15)), false, "hovering above the desk is not contact");
  // the rest wrist positions are within reach of the chest
  for (const w of [WRIST_REST.left, WRIST_REST.right]) assert.ok(chestDistance(w, w.y) <= REACH_LIMIT);
  assert.ok(chestDistance({ x: 0, z: EDGE_Z + 0.05 }, 0.02) <= REACH_LIMIT);
});

// ---- hand shape
function flatRight() {
  return {
    handed: 1,
    wrist: P(0, 0.03, 0),
    indexKnuckle: P(-0.035, 0.03, -0.09),
    pinkyKnuckle: P(0.04, 0.03, -0.08),
    thumbTip: P(-0.07, 0.03, -0.09),
    indexTip: P(-0.035, 0.03, -0.18),
    middleTip: P(-0.01, 0.03, -0.19),
    ringTip: P(0.015, 0.03, -0.18),
    pinkyTip: P(0.04, 0.03, -0.15),
  };
}
const mirror = (j) => {
  const m = (p) => ({ x: -p.x, y: p.y, z: p.z });
  const out = { handed: -j.handed };
  for (const k of Object.keys(j)) if (k !== "handed") out[k] = m(j[k]);
  return out;
};

test("a flat palm-down hand is flat, for the right and the left hand", () => {
  assert.equal(handShape(flatRight()).flat, true);
  assert.equal(handShape(mirror(flatRight())).flat, true);
});

test("not flat: palm up, fist, pinch, tilted fingers", () => {
  const up = mirror({ ...flatRight(), handed: -1 }); // x mirrored but the same handedness label: thumb on the wrong side = palm up
  up.handed = 1;
  assert.equal(handShape(up).palmDown, false, "palm up");
  assert.equal(handShape(up).flat, false);
  const fist = { ...flatRight(), indexTip: P(-0.03, 0.03, -0.05), middleTip: P(-0.01, 0.03, -0.05), ringTip: P(0.015, 0.03, -0.05), pinkyTip: P(0.035, 0.03, -0.05) };
  assert.equal(handShape(fist).extended, false);
  assert.equal(handShape(fist).flat, false);
  const pinch = { ...flatRight(), thumbTip: P(-0.035, 0.03, -0.17) };
  assert.equal(handShape(pinch).flat, false, "thumb on the index is a pinch");
  const tilted = { ...flatRight(), middleTip: P(-0.01, 0.16, -0.17), indexTip: P(-0.035, 0.03, -0.18) };
  assert.equal(handShape(tilted).flat, false, "fingers pointing up");
});

test("forgiving aim: the target is found from the last half second, with 2 cm jitter and 5% dropped frames", () => {
  const rng = createRng(99);
  const targets = [
    { id: "deck", x: ZONES.deck.x, z: ZONES.deck.z, r: 0.095 },
    { id: "discard", x: ZONES.discard.x, z: ZONES.discard.z, r: 0.085 },
    { id: "lay", x: ZONES.playerLay.x, z: ZONES.playerLay.z, r: 0.105 },
  ];
  let right = 0, total = 0;
  for (const aim of targets) for (let trial = 0; trial < 100; trial++) {
    const tr = createTrail();
    // 0.5 s of travel to the target at 90 Hz, then a pinch that nudges the point away
    for (let i = 0; i < 45; i++) {
      if (nextFloat(rng) < 0.05) continue; // dropped frame
      const k = i / 44, jit = () => (nextFloat(rng) - 0.5) * 0.04;
      const sx = aim.x + 0.2, sz = aim.z + 0.2;
      const nudge = i > 36 ? 0.03 : 0;
      pushTrail(tr, i / 90, { x: sx + (aim.x - sx) * k + jit() + nudge, y: 0.04, z: sz + (aim.z - sz) * k + jit() });
    }
    total++;
    if (pickTarget(tr, targets)?.id === aim.id) right++;
  }
  assert.equal(right, total, `${right} of ${total}`);
});

test("forgiving aim: a hand that never came near picks nothing, and a high hand picks nothing", () => {
  const targets = [{ id: "deck", x: ZONES.deck.x, z: ZONES.deck.z, r: 0.095 }];
  const far = createTrail();
  pushTrail(far, 0, { x: 0.3, y: 0.04, z: 0.3 });
  assert.equal(pickTarget(far, targets), null);
  const high = createTrail();
  pushTrail(high, 0, { x: ZONES.deck.x, y: 0.5, z: ZONES.deck.z });
  assert.equal(pickTarget(high, targets), null);
  assert.ok(dist3(P(0, 0, 0), P(0, 0.3, 0.4)) === 0.5);
});

test("the resting wrist zones are within 35 degrees of the line to the Shark, so they stay in view on Glasses (the real field of view is Unverified)", () => {
  for (const w of [WRIST_REST.left, WRIST_REST.right]) {
    assert.ok(coneAngleDeg(w) <= 35, `${coneAngleDeg(w)} degrees`);
    assert.ok(chestDistance(w, w.y) <= REACH_LIMIT);
  }
  assert.ok(coneAngleDeg({ x: 0, z: EDGE_Z + 0.05 }) <= 5, "the edge strip is straight ahead of the player");
});

test("no zone needs a hand within 15 cm of the face (Meta: nothing closer than 10 cm; PRODUCT-FIT P1-6)", () => {
  const near = (p, y = 0) => Math.hypot(p.x - HEAD.x, y - HEAD.y, p.z - HEAD.z);
  for (const name of ["deck", "discard", "playerLay", "playerPile", "pot"]) assert.ok(near(ZONES[name]) >= 0.15, name);
  for (const w of [WRIST_REST.left, WRIST_REST.right]) assert.ok(near(w, w.y) >= 0.15);
  assert.ok(near({ x: 0, z: EDGE_Z + 0.05 }, 0.02) >= 0.15);
});
