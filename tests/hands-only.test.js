/** Stage D, judge fix 1 (Meta 2026: entries must be "fully usable with hands, end to end"): the game never reads a controller, a button or a stick.
 * Everything it reads from the headset is the viewer pose, the 25 joints of each hand, the gaze ray and the select (pinch) events. */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const files = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const all = files(root).filter((f) => /\.(ts|js)$/.test(f) && !f.includes("/art/baked/"));
const text = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no controller input is read anywhere in the source: no gamepad buttons or axes, no thumbstick, no trigger, no squeeze", () => {
  const banned = [/getGamepads?\b/, /\bgamepad/i, /InputComponent/, /thumbstick/i, /\bsqueeze(start|end)?\b/, /\.axes\b/, /input\.xr\b/, /raySpaces|gripSpaces/];
  for (const f of all) for (const re of banned) assert.equal(re.test(text(f)), false, `${f.slice(root.length)} matches ${re}`);
});

test("the headset adapter reads only hand joints, the gaze source and select events", () => {
  const xr = text(join(root, "input/xr.ts")) + text(join(root, "input/xr-read.js")); // round 8: the read moved to xr-read.js
  assert.match(xr, /source\.hand/);
  assert.match(xr, /selectstart/);
  assert.match(xr, /targetRayMode === "gaze"/);
  assert.equal(/gamepad/.test(xr), false);
});

test("the pause, resume and exit of the headset session are made with fingertips or a pinch (game/menu.js), and the menu is wired into the frame loop", () => {
  const menu = text(join(root, "game/menu.js"));
  assert.match(menu, /index-finger-tip/);
  assert.match(menu, /export function stepMenu/);
  const index = text(join(root, "index.ts"));
  assert.match(index, /stepMenu\(menu, realDt, ptrs\)/);
  assert.match(index, /ending\?\.end\(\)/);
});
