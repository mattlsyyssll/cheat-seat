import { test } from "node:test";
import assert from "node:assert/strict";
import { createContact, updateContact, gazeCatchOk, CONTACT_HOLD_S } from "../src/game/contact.js";

const STEP = 1 / 90;
function press(c, seconds, input) {
  const ev = [];
  for (let t = 0; t < seconds - 1e-9; t += STEP) ev.push(...updateContact(c, STEP, input));
  return ev;
}

test("a palm-down touch on his side, held 0.15 s, inside the window and with the view within 24 degrees, is a catch", () => {
  const c = createContact();
  const ev = press(c, 0.4, { down: true, windowOpen: true, yawDeg: 10 });
  assert.equal(ev.filter((e) => e.type === "contact").length, 1);
  const slap = ev.find((e) => e.type === "slap");
  assert.ok(slap && slap.ok === true);
  assert.equal(CONTACT_HOLD_S, 0.15);
});

test("no contact in the window gives no catch (replaces the old speed gate)", () => {
  const c = createContact();
  const ev = press(c, 1, { down: false, windowOpen: true, yawDeg: 0 });
  assert.equal(ev.length, 0);
});

test("a touch while the glove is not under the hat is a slap with no catch", () => {
  const c = createContact();
  const ev = press(c, 0.4, { down: true, windowOpen: false, yawDeg: 0 });
  assert.equal(ev.find((e) => e.type === "slap").ok, false);
});

test("a hand already resting on his side when the window opens does not count; it has to land", () => {
  const c = createContact();
  press(c, 0.5, { down: true, windowOpen: false, yawDeg: 0 });
  const ev = press(c, 0.5, { down: true, windowOpen: true, yawDeg: 0 });
  assert.equal(ev.length, 0, "no new contact, no new slap");
  press(c, 0.1, { down: false, windowOpen: true, yawDeg: 0 });
  const again = press(c, 0.4, { down: true, windowOpen: true, yawDeg: 0 });
  assert.equal(again.find((e) => e.type === "slap").ok, true);
});

test("view still down or turned away (more than 24 degrees): no catch", () => {
  const c = createContact();
  assert.equal(press(c, 0.4, { down: true, windowOpen: true, yawDeg: 25 }).find((e) => e.type === "slap").ok, false);
  const d = createContact();
  assert.equal(press(d, 0.4, { down: true, windowOpen: true, yawDeg: -23 }).find((e) => e.type === "slap").ok, true);
});

test("a touch shorter than 0.15 s is not a slap", () => {
  const c = createContact();
  const ev = press(c, 0.1, { down: true, windowOpen: true, yawDeg: 0 });
  press(c, 0.1, { down: false, windowOpen: true, yawDeg: 0 });
  assert.equal(ev.filter((e) => e.type === "slap").length, 0);
});

test("the window may close during the 0.15 s hold: contact that began inside still counts", () => {
  const c = createContact();
  const a = press(c, 0.05, { down: true, windowOpen: true, yawDeg: 0 });
  const b = press(c, 0.3, { down: true, windowOpen: false, yawDeg: 0 });
  assert.equal([...a, ...b].find((e) => e.type === "slap").ok, true);
});

test("gaze-and-pinch on the hat counts inside the window within 24 degrees", () => {
  assert.equal(gazeCatchOk(true, 5), true);
  assert.equal(gazeCatchOk(false, 5), false);
  assert.equal(gazeCatchOk(true, 30), false);
});
