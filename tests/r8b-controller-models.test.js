/** Round 8b, Q02 and Q15: the SDK's Quest controller models (two 2048 by 2048 textures, about 40 ms to upload each) are not loaded; Cheat Seat is hands only.
 * The SDK has no option for this, so setup() replaces connectVisual on both controller visual adapters with a function that does nothing. */
import test from "node:test";
import assert from "node:assert/strict";
import { readSrc } from "./r8-lib.js";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("setup switches off the controller model load on the left and the right controller adapter, before the first frame", () => {
  const s = strip(readSrc("index.ts"));
  const at = s.indexOf("function setup(");
  assert.ok(at > 0, "setup() not found");
  const body = s.slice(at);
  assert.match(body, /for \(const side of \["left", "right"\] as const\)/);
  assert.match(body, /visualAdapters\.controller\[side\][^;]*connectVisual\s*=\s*\(\)\s*=>\s*\{\s*\}/);
  assert.ok(body.search(/connectVisual\s*=/) < body.search(/attachMouse\(/), "the override must come before anything that can start a session");
});

test("the hand visual adapters are not touched: hands still load their own visuals", () => {
  const s = strip(readSrc("index.ts"));
  assert.equal(/visualAdapters\.hand/.test(s), false);
});
