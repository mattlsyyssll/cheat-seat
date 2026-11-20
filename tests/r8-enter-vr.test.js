/** Round 8, Q07: the session request must run inside the Enter VR click, in the same task. */
import test from "node:test";
import assert from "node:assert/strict";
import { load, readSrc } from "./r8-lib.js";

const E = await load("input/xr-enter.js");

function rig({ world = true } = {}) {
  const r = { requests: [], order: [], said: [], micro: false, macro: false, world: null };
  const fake = { launchXR() { r.order.push("launch"); r.requests.push({ sameTask: !r.micro && !r.macro }); } };
  r.world = world ? fake : null;
  r.fake = fake;
  r.enter = E.createEnterVr({ getWorld: () => r.world, begin: () => r.order.push("begin"), startAudio: () => r.order.push("audio"), say: (t) => r.said.push(t) });
  const button = new EventTarget();
  button.addEventListener("click", () => r.enter.click());
  r.click = () => {
    queueMicrotask(() => { r.micro = true; });
    setImmediate(() => { r.macro = true; });
    button.dispatchEvent(new Event("click"));
  };
  return r;
}

test("the session request runs in the same task as the click, before the audio starts", () => {
  const r = rig();
  r.click();
  assert.equal(r.requests.length, 1, "no request inside the click");
  assert.equal(r.requests[0].sameTask, true);
  assert.deepEqual(r.order, ["begin", "launch", "audio"]);
});

test("a click before the table is ready makes no request now and none later (a later one is outside the click)", async () => {
  const r = rig({ world: false });
  r.click();
  assert.equal(r.requests.length, 0);
  assert.equal(r.said.length, 1, "the player is told to wait");
  r.world = r.fake; // the table is built
  r.enter.tableReady?.();
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(r.requests.length, 0, "a session request was made outside a click");
});

test("the page has no pending request, and the button is off until the table is ready", () => {
  assert.doesNotMatch(readSrc("index.ts"), /pendingVr/);
  assert.match(readSrc("flat-ui.ts"), /btnVr\.disabled = !ready/);
});
