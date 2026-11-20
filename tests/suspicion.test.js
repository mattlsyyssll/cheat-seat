import { test } from "node:test";
import assert from "node:assert/strict";
import { createSuspicion, updateSuspicion, resetSuspicion, FILL_S, GRACE_S, LOCK_S } from "../src/game/suspicion.js";

const STEP = 1 / 90;
function run(s, seconds, input) {
  const events = [];
  let t = 0;
  for (; t < seconds - 1e-9; t += STEP) for (const e of updateSuspicion(s, STEP, typeof input === "function" ? input(t) : input)) events.push({ ...e, at: t + STEP });
  return events;
}

test("caught: the meter fills in 0.6 s (plus or minus 0.1) while the cone is on a hidden card", () => {
  const s = createSuspicion();
  const ev = run(s, 2, { suspicious: true });
  const caught = ev.find((e) => e.type === "caught");
  assert.ok(caught, "caught fired");
  assert.ok(Math.abs(caught.fillS - FILL_S) <= 0.1, `filled in ${caught.fillS}`);
  assert.ok(Math.abs(caught.at - 0.6) <= 0.1);
  assert.equal(ev.filter((e) => e.type === "caught").length, 1, "once");
});

test("the meter ramps smoothly: it is partly full at half time", () => {
  const s = createSuspicion();
  run(s, 0.3, { suspicious: true });
  assert.ok(s.meter > 0.4 && s.meter < 0.6, `${s.meter}`);
});

test("a hidden card while the cone is off: no strike, however long", () => {
  const s = createSuspicion();
  const ev = run(s, 20, { suspicious: false });
  assert.equal(ev.length, 0);
  assert.equal(s.meter, 0);
});

test("the meter drains when the cone leaves in time: a short glance does not catch", () => {
  const s = createSuspicion();
  const ev = run(s, 6, (t) => ({ suspicious: t % 1.5 < 0.4 }));
  assert.equal(ev.filter((e) => e.type === "caught").length, 0);
  assert.ok(ev.some((e) => e.type === "fillStart"));
});

test("a lost hand never costs a strike (P0-5)", () => {
  const s = createSuspicion();
  const ev = run(s, 5, { suspicious: true, handLost: true });
  assert.equal(ev.filter((e) => e.type === "caught").length, 0);
  assert.equal(s.meter, 0);
});

test("after a hand returns there is one second of grace before any caught check", () => {
  const s = createSuspicion();
  run(s, 0.5, { suspicious: false, handLost: true });
  const ev = run(s, 2, { suspicious: true });
  const caught = ev.find((e) => e.type === "caught");
  assert.ok(caught);
  assert.ok(caught.at >= GRACE_S + FILL_S - 0.1, `caught at ${caught.at}`);
  assert.ok(caught.at <= GRACE_S + FILL_S + 0.1);
});

test("after a catch the meter stays at zero while the slam plays, then it can catch again", () => {
  const s = createSuspicion();
  run(s, 1, { suspicious: true });
  assert.equal(s.caught, true);
  const during = run(s, LOCK_S - 1.2, { suspicious: true });
  assert.equal(during.length, 0);
  const again = run(s, 3, { suspicious: true });
  assert.ok(again.some((e) => e.type === "caught"));
  resetSuspicion(s);
  assert.equal(s.meter, 0);
  assert.equal(s.lock, 0);
});
