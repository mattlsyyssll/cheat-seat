/** Round 8, Q06 and Q14: fixed foveation and render scale are set (three.js WebXRManager), the scale only before the session. */
import test from "node:test";
import assert from "node:assert/strict";
import { load, readSrc } from "./r8-lib.js";

const Q = await load("xr-quality.js");
const fakeXr = (presenting) => { const x = { isPresenting: presenting, calls: [] }; x.setFoveation = (v) => x.calls.push(["foveation", v]); x.setFramebufferScaleFactor = (v) => x.calls.push(["scale", v]); return x; };

test("before the session: foveation and framebuffer scale are both set, foveation below the default 1", () => {
  const xr = fakeXr(false);
  const done = Q.applyXrQuality(xr);
  assert.deepEqual(xr.calls.map((c) => c[0]).sort(), ["foveation", "scale"]);
  assert.ok(done.foveation > 0 && done.foveation < 1);
  assert.ok(done.framebufferScale > 0.5 && done.framebufferScale <= 1.2);
});

test("in a session the scale is left alone (three.js cannot change it there)", () => {
  const xr = fakeXr(true);
  Q.applyXrQuality(xr);
  assert.deepEqual(xr.calls.map((c) => c[0]), ["foveation"]);
});

test("a manager without the calls is not an error", () => {
  assert.deepEqual(Q.applyXrQuality({}), { foveation: null, framebufferScale: null });
});

test("the page sets them in setup, before any session (index.ts)", () => {
  assert.match(readSrc("index.ts"), /applyXrQuality\(world\.renderer\.xr\)/);
});
