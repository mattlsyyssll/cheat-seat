/** Round 8, Q01: late or missing desk planes. The headset can report the desk planes seconds after the session starts, or never. */
import test from "node:test";
import assert from "node:assert/strict";
import { load, readSrc } from "./r8-lib.js";

const W = await load("game/desk-watch.js");
const HEAD = { x: 0, y: 1.3, z: 0 }, FWD = { x: 0, z: -1 };
const DESK = { id: 1, y: 0.75, polygon: [{ x: -0.6, z: -1.2 }, { x: 0.6, z: -1.2 }, { x: 0.6, z: -0.4 }, { x: -0.6, z: -0.4 }] };

/** The desk plane is reported from `arriveAt` seconds on (null: never). Returns what the page would do, in order. */
function run(arriveAt, { seconds = 60, dt = 0.1, canReplace = () => true } = {}) {
  const w = W.createDeskWatch();
  const events = [];
  for (let i = 0; i * dt < seconds; i++) {
    const t = +(i * dt).toFixed(2);
    const planes = arriveAt !== null && t >= arriveAt ? [DESK] : [];
    const step = W.deskStep(w, dt, planes, HEAD, FWD, canReplace(t));
    if (step) events.push({ t, kind: step.kind, real: step.frame.real, line: step.line });
  }
  return events;
}

test("planes at 0 s: the table goes on the desk at once and nothing else happens", () => {
  const ev = run(0);
  assert.deepEqual(ev.map((e) => e.kind), ["real"]);
  assert.equal(ev[0].real, true);
});

test("planes at 5 s: virtual table at 1.5 s, then the table moves onto the desk once, with one line", () => {
  const ev = run(5);
  assert.deepEqual(ev.map((e) => e.kind), ["virtual", "replace"]);
  assert.ok(ev[0].t >= 1.3 && ev[0].t <= 1.8, `virtual at ${ev[0].t}`);
  assert.ok(ev[1].t >= 5 && ev[1].t <= 5.3, `replaced at ${ev[1].t}`);
  assert.equal(ev[1].real, true);
  assert.equal(typeof ev[1].line, "string");
  assert.ok(ev[1].line.length > 5 && ev[1].line.length < 60);
});

test("no planes ever: the virtual table is shown once and the table never moves", () => {
  const ev = run(null);
  assert.deepEqual(ev.map((e) => e.kind), ["virtual"]);
});

test("planes are still read for 20 s after the virtual table is shown, and not much longer", () => {
  assert.deepEqual(run(21).map((e) => e.kind), ["virtual", "replace"], "a plane 19.5 s after the virtual table still counts");
  assert.deepEqual(run(30).map((e) => e.kind), ["virtual"], "a plane after the 20 s window does not move the table");
});

test("a running match is never moved: the table waits for the match to end, inside the window", () => {
  const ev = run(5, { canReplace: (t) => t >= 15 });
  assert.deepEqual(ev.map((e) => e.kind), ["virtual", "replace"]);
  assert.ok(ev[1].t >= 15 && ev[1].t <= 15.3, `replaced at ${ev[1].t}`);
});

test("the page keeps reading planes after the virtual table (index.ts) and says so on the plate", () => {
  const index = readSrc("index.ts");
  assert.match(index, /deskStep\(/);
  assert.match(index, /deskWatch\.virtualShown && !deskWatch\.closed/);
  assert.match(index, /booth\.hint\.say\(step2\.line/);
});
