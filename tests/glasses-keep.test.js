import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP, GLASSES_VIEW, FRAME_HALF, glassesMargin, pointMargin, frameInGlassesView, chooseSpot, createKeep } from "../src/game/keep.js";
import { keepGhostState, KEEP_GHOST_S } from "../src/game/ghost.js";
import { TABLE, SPOTS } from "../src/game/booth.js";
import { MENU } from "../src/game/menu.js";
import { ZONES } from "../src/game/layout.js";
import { TUNING, tuningOf, glassesTuning } from "../src/game/tuning.js";
import { createGame, setGlasses } from "../src/game/duel.js";
import { isGlassesViews, viewAngles, maskIsGlasses, glassesCall } from "../src/input/glasses-detect.js";

const G = KEEP.glassesSpot;

test("Glasses keep spot: the whole frame (all four corners) is inside the seated Glasses view, with margin at three head heights", () => {
  assert.ok(glassesMargin(G) >= 2.5, `seated 0.47 m: ${glassesMargin(G)}`);
  assert.ok(glassesMargin(G, { eyeY: 0.5 }) >= 0.8, `0.50 m: ${glassesMargin(G, { eyeY: 0.5 })}`);
  assert.ok(glassesMargin(G, { eyeY: 0.42 }) >= 2.5, `0.42 m: ${glassesMargin(G, { eyeY: 0.42 })}`);
  assert.ok(frameInGlassesView(G, 2));
  // sitting a few centimetres off the seat in any direction still shows the frame
  for (const dz of [-0.04, 0.04]) assert.ok(glassesMargin(G, { z: 0.46 + dz }) > 0, `head z shifted ${dz}`);
});

test("the old default spot is outside the Glasses view (44 degrees right of the axis), which is the bug this fixes", () => {
  assert.ok(glassesMargin(KEEP.defaultSpot) < -5, `${glassesMargin(KEEP.defaultSpot)}`);
  assert.ok(!frameInGlassesView(KEEP.defaultSpot));
  // the yaw of the old spot's centre from the eye, as the stage H measure reports it
  const yaw = (Math.atan2(KEEP.defaultSpot.x, 0.46 - KEEP.defaultSpot.z) * 180) / Math.PI;
  assert.ok(yaw > GLASSES_VIEW.right + 5, `${yaw}`);
});

test("pointMargin: straight ahead is the view centre, a point 40 degrees right is outside, one 30 degrees right is inside", () => {
  assert.ok(pointMargin({ x: 0, y: 0.47 - 0.05 * 0.5, z: -0.46 }) > 20);
  const d = 0.9; // metres ahead of the eye (z 0.46 - d)
  assert.ok(pointMargin({ x: d * Math.tan((40 * Math.PI) / 180), y: 0.4, z: 0.46 - d }) < 0);
  assert.ok(pointMargin({ x: d * Math.tan((30 * Math.PI) / 180), y: 0.4, z: 0.46 - d }) > 0);
});

/** [x, z, halfX, halfZ] of what lies on the felt */
const ITEMS = {
  deck: [ZONES.deck.x, ZONES.deck.z, 0.05, 0.065],
  discard: [ZONES.discard.x, ZONES.discard.z, 0.05, 0.065],
  playerLay: [SPOTS.playerLay.x, SPOTS.playerLay.z, 0.0425, 0.0575],
  playerLayZone: [ZONES.playerLay.x, ZONES.playerLay.z, 0.0425, 0.0575],
  sharkLay: [SPOTS.sharkLay.x, SPOTS.sharkLay.z, 0.0425, 0.0575],
  sharkLayZone: [ZONES.sharkLay.x, ZONES.sharkLay.z, 0.0425, 0.0575],
  potChips: [ZONES.pot.x, ZONES.pot.z, 0.065, 0.045],
  sharkPile: [ZONES.sharkPile.x, ZONES.sharkPile.z, 0.065, 0.045],
  playerPile: [ZONES.playerPile.x, ZONES.playerPile.z, 0.065, 0.045],
  pausePad: [MENU.pad.x, MENU.pad.z, MENU.padR, MENU.padR],
  token0: [0.42, 0.1, 0.02, 0.02], token1: [0.42, 0.15, 0.02, 0.02], token2: [0.42, 0.2, 0.02, 0.02],
  sharkLamp0: [0.4, -0.1, 0.022, 0.022], sharkLamp1: [0.4, -0.155, 0.022, 0.022], sharkLamp2: [0.4, -0.21, 0.022, 0.022],
  playerLamp0: [-0.4, 0.1, 0.022, 0.022], playerLamp1: [-0.4, 0.155, 0.022, 0.022], playerLamp2: [-0.4, 0.21, 0.022, 0.022],
};

test("Glasses keep spot: the frame is on the table and clear of every other felt item (cards, chips, pause pad, point tokens, strike lamps)", () => {
  assert.ok(Math.abs(G.x) + FRAME_HALF.x <= TABLE.halfX && G.z + FRAME_HALF.z <= TABLE.zNear && G.z - FRAME_HALF.z >= TABLE.zFar, "on the table rectangle");
  for (const [name, [x, z, hx, hz]] of Object.entries(ITEMS)) {
    const gapX = Math.abs(G.x - x) - (hx + FRAME_HALF.x), gapZ = Math.abs(G.z - z) - (hz + FRAME_HALF.z);
    assert.ok(gapX > 0.005 || gapZ > 0.005, `${name}: gap x ${gapX.toFixed(3)} z ${gapZ.toFixed(3)}`);
  }
  assert.ok(G.x > 0, "right-hand side, the dominant hand's edge");
});

test("the Glasses keep cue: the glow frame and the see-through hand stay inside the Glasses view for the whole cue", () => {
  for (let t = 0; t <= KEEP_GHOST_S + 1e-9; t += 0.05) {
    const c = keepGhostState(t, G, true);
    const m = pointMargin({ x: G.x + c.hand.x - G.x, y: c.hand.y, z: G.z + c.hand.z - G.z });
    assert.ok(m > 0, `t ${t.toFixed(2)}: hand at ${JSON.stringify(c.hand)} margin ${m.toFixed(1)}`);
  }
  // the same cue for everyone else is unchanged (offsets to the right)
  assert.equal(keepGhostState(0, G).hand.x, G.x + 0.1);
  assert.equal(keepGhostState(0, G, true).hand.x, G.x - 0.1);
  assert.equal(keepGhostState(1.2, G).hand.z, keepGhostState(1.2, G, true).hand.z);
});

test("chooseSpot: Quest and flat unchanged; Glasses takes a saved or anchored spot only if its whole frame is in view", () => {
  assert.deepEqual(chooseSpot(), { x: KEEP.defaultSpot.x, z: KEEP.defaultSpot.z, source: "default" });
  assert.deepEqual(chooseSpot({ saved: { x: 0.3, z: 0.2 } }), { x: 0.3, z: 0.2, source: "saved" });
  assert.equal(chooseSpot({ glasses: true }).source, "glasses");
  assert.equal(chooseSpot({ glasses: true, saved: { x: 0.338, z: 0.115 } }).x, G.x, "a Quest-saved spot is outside the view: replaced");
  assert.equal(chooseSpot({ glasses: true, saved: { x: 0.31, z: -0.12 } }).source, "saved", "a saved spot inside the view stays");
  assert.equal(chooseSpot({ glasses: true, anchor: { x: 0.3, z: -0.11 }, saved: { x: 0.2, z: 0.1 } }).source, "anchor");
  assert.equal(chooseSpot({ glasses: true, anchor: { x: 0.45, z: 0.2 } }).source, "glasses");
});

test("a Glasses game puts the keep spot in the Glasses view in every room (the spot does not depend on the desk polygon or eye height)", () => {
  for (const eyeRel of [0.6, 0.7, 0.75]) {
    const g = createGame({ seed: 3, eyeRel, glasses: true });
    assert.equal(g.keep.spot.source, "glasses");
    assert.ok(frameInGlassesView(g.keep.spot, 2));
  }
  const q = createGame({ seed: 3 });
  assert.deepEqual({ x: q.keep.spot.x, z: q.keep.spot.z, source: q.keep.spot.source }, { x: 0.338, z: 0.115, source: "default" });
  assert.equal(q.glasses, false);
});

test("Quest 3 and flat numbers do not change: the level tuning is the same object, and Glasses only changes the keep dwell and cone", () => {
  for (const lvl of ["easy", "normal", "hard"]) {
    const base = tuningOf(lvl), q = createGame({ seed: 1, level: lvl });
    assert.equal(q.tuning, base);
    assert.equal(base.keepConeExtra, undefined);
    const gl = createGame({ seed: 1, level: lvl, glasses: true }).tuning;
    for (const k of Object.keys(base)) if (k !== "keepSeeS") assert.equal(gl[k], base[k], k);
    assert.ok(gl.keepSeeS > base.keepSeeS && gl.keepConeExtra > 0);
  }
  assert.equal(TUNING.normal.keepSeeS, 0.7);
  assert.equal(glassesTuning(TUNING.normal).keepSeeS, 2.4);
});

test("setGlasses: moves the spot into the view (cards stay), restores the default off Glasses, and leaves a spot that is already inside the view", () => {
  const g = createGame({ seed: 5, keep: { cards: [7] } });
  assert.equal(g.keep.spot.source, "default");
  assert.equal(setGlasses(g, true), true);
  assert.equal(g.keep.spot.source, "glasses");
  assert.deepEqual(g.match.kept, [7]);
  assert.equal(setGlasses(g, true), false, "second call does nothing");
  assert.equal(g.tuning.keepSeeS, 2.4);
  assert.equal(setGlasses(g, false), true);
  assert.equal(g.keep.spot.source, "default");
  assert.equal(g.tuning.keepSeeS, 0.7);
  const h = createGame({ seed: 5, keep: { spot: { x: 0.3, z: -0.11, source: "anchor" } } });
  assert.equal(setGlasses(h, true), false);
  assert.equal(h.keep.spot.source, "anchor");
  assert.equal(createKeep({ glasses: true }).spot.source, "glasses");
});

/** a WebXR projection matrix for a view with these half angles (degrees) */
const proj = (l, r, u, d) => {
  const tl = Math.tan((l * Math.PI) / 180), tr = Math.tan((r * Math.PI) / 180), tu = Math.tan((u * Math.PI) / 180), td = Math.tan((d * Math.PI) / 180);
  const m = new Array(16).fill(0);
  m[0] = 2 / (tl + tr); m[5] = 2 / (tu + td); m[8] = (tr - tl) / (tl + tr); m[9] = (tu - td) / (tu + td); m[10] = -1; m[11] = -1; m[14] = -0.002;
  return m;
};

test("the page reads Glasses from the reported field of view; a wider view, no matrix, or no views is not Glasses", () => {
  const a = viewAngles(proj(37, 37, 25, 43));
  assert.deepEqual([a.left, a.right, a.up, a.down].map(Math.round), [37, 37, 25, 43]);
  assert.equal(isGlassesViews([{ projectionMatrix: proj(37, 37, 25, 43) }]), true);
  assert.equal(isGlassesViews([{ projectionMatrix: proj(36, 36, 24, 42) }, { projectionMatrix: proj(36, 36, 24, 42) }]), true);
  assert.equal(isGlassesViews([{ projectionMatrix: proj(52, 42, 48, 53) }, { projectionMatrix: proj(42, 52, 48, 53) }]), false, "a Quest-like pair of views");
  assert.equal(isGlassesViews([{ projectionMatrix: proj(60, 60, 60, 60) }]), false);
  assert.equal(isGlassesViews([]), null);
  assert.equal(isGlassesViews(null), null);
  assert.equal(isGlassesViews([{}]), null);
  assert.equal(isGlassesViews([{ projectionMatrix: [0, 0, 0] }]), null);
});

test("the emulator's Glasses mask names the device (the emulated Glasses report a wide field of view); a Quest has no mask", () => {
  const doc = (name) => ({ querySelectorAll: () => (name === null ? [] : [{ dataset: { webxrVisibilityMask: name } }]) });
  assert.equal(maskIsGlasses(doc("Meta VR Glasses")), true);
  assert.equal(maskIsGlasses(doc("Meta Quest 3")), false);
  assert.equal(maskIsGlasses(doc(null)), false);
  assert.equal(maskIsGlasses(null), false);
  assert.equal(maskIsGlasses({ querySelectorAll: () => { throw new Error("x"); } }), false);
  assert.equal(glassesCall(false, true), true, "wide reported view but the Glasses mask: Glasses");
  assert.equal(glassesCall(true, false), true);
  assert.equal(glassesCall(false, false), false);
  assert.equal(glassesCall(null, false), null, "unknown stays unknown, so Quest and flat never change");
});
