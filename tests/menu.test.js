/** Stage D, judge fix 1: the pause menu is reachable and works with fingertips and pinches only. */
import test from "node:test";
import assert from "node:assert/strict";
import { createMenu, stepMenu, MENU, pointersFrom } from "../src/game/menu.js";

const DT = 1 / 60;
const tipAt = (p) => [{ id: "right", tip: { ...p }, press: false }];
const run = (m, secs, ptrs) => { const ev = []; for (let t = 0; t < secs; t += DT) ev.push(...stepMenu(m, DT, ptrs).events); return ev; };

test("a fingertip on the pause pad for half a second pauses; the menu opens", () => {
  const m = createMenu();
  const ev = run(m, 1.6, tipAt(MENU.pad));
  assert.deepEqual(ev, ["pause"]);
  assert.equal(m.open, true);
});

test("a pinch on the pad pauses at once (after the first half second of cool-down)", () => {
  const m = createMenu();
  run(m, 0.6, []);
  const ev = run(m, 0.2, [{ id: "right", tip: { ...MENU.pad }, press: true }]);
  assert.deepEqual(ev, ["pause"]);
});

test("a hand that only passes the pad does not pause", () => {
  const m = createMenu();
  const ev = run(m, 0.3, tipAt(MENU.pad));
  run(m, 1, tipAt({ x: 0, y: 0.1, z: 0.1 }));
  assert.deepEqual(ev, []);
  assert.equal(m.open, false);
});

test("resume closes the menu; exit asks the session to end; neither fires twice", () => {
  const m = createMenu();
  run(m, 1.6, tipAt(MENU.pad));
  assert.equal(m.open, true);
  run(m, 1, []); // hand away
  assert.deepEqual(run(m, 1.6, tipAt(MENU.resume)), ["resume"]);
  assert.equal(m.open, false);
  run(m, 1, []);
  run(m, 1.6, tipAt(MENU.pad));
  run(m, 1, []);
  const ev = run(m, 2, tipAt(MENU.exit));
  assert.deepEqual(ev, ["exit"]);
});

test("nothing is chosen in the first 0.8 s after the menu opens (the opening hand is still there)", () => {
  const m = createMenu();
  run(m, 1.6, tipAt(MENU.pad));
  assert.deepEqual(run(m, 0.5, tipAt(MENU.resume)), []);
});

test("the Glasses (gaze and pinch) pointer works the same way: look at the pad and pinch", () => {
  const hands = [{ id: "gaze", pos: { ...MENU.pad }, fist: true, pinch: false }];
  const ptrs = pointersFrom(hands, new Map(), true);
  const m = createMenu();
  run(m, 0.6, []);
  assert.deepEqual(run(m, 0.2, ptrs), ["pause"]);
});

test("Glasses: the gaze RAY picks an orb of the open menu (a pinch at once, or half a second of looking), and the pad needs the pinch", () => {
  const ray = (target) => ({ o: { x: 0, y: 0.47, z: 0.46 }, d: { x: target.x, y: target.y - 0.47, z: target.z - 0.46 } });
  const m = createMenu();
  // looking at the pad without a pinch does nothing
  const look = [{ id: "gaze", tip: { x: 0, y: 0, z: 0 }, press: false, ray: ray(MENU.pad) }];
  assert.deepEqual(run(m, 2, look), []);
  // looking at it and pinching opens the menu
  run(m, 0.5, []);
  assert.deepEqual(run(m, 0.2, [{ id: "gaze", tip: { x: 0, y: 0, z: 0 }, press: true, ray: ray(MENU.pad) }]), ["pause"]);
  // in the open menu, looking at EXIT for half a second is enough
  run(m, 1, []);
  assert.deepEqual(run(m, 1, [{ id: "gaze", tip: { x: 0, y: 0, z: 0 }, press: false, ray: ray(MENU.exit) }]), ["exit"]);
});

test("pointers from hands use the index fingertip joint", () => {
  const joints = new Map([["right", { "index-finger-tip": { x: 1, y: 2, z: 3 } }]]);
  const p = pointersFrom([{ id: "right", pos: { x: 0, y: 0, z: 0 }, pinch: true }], joints, false);
  assert.deepEqual(p, [{ id: "right", tip: { x: 1, y: 2, z: 3 }, press: true }]);
});
