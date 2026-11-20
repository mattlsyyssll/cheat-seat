import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The grep gate (project rule): the mouse drives the SAME 3D events as hands. Banned: DOM drag, screen-space hit tests for
 * game rules, any desktop-or-mobile branch inside the rules. Pixels, cursors and DOM events may appear only in the input adapters
 * (src/input/*) and in the page's own words and signs (src/ui.ts, src/flat-ui.ts). */
const root = new URL("../src/", import.meta.url).pathname;
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const all = files(root).filter((f) => /\.(ts|js)$/.test(f));
const rel = (f) => f.slice(root.length);
const text = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const RULES_DIRS = ["game/", "actor/"];
const DEVICE = [/isDesktop/, /isMobile/, /isFlat/, /isHeadset/, /\bflatPlay\b/, /\bdesktopMode\b/, /navigator\.userAgent/, /\bplatform\s*===/];
const PIXELS = [/clientX/, /clientY/, /offsetX/, /offsetY/, /pointer(down|move|up|cancel)/, /mouse(down|move|up)/, /touch(start|move|end)/, /getBoundingClientRect/, /elementFromPoint/, /innerWidth/, /innerHeight/, /\bscreenX\b/, /\bscreenOf\b/, /\.project\(/, /\bunproject\b/, /Raycaster/, /\bndc\b/i];
const DRAG = [/draggable/i, /dragstart/i, /dragover/i, /\bondrag/i, /\bdrop\b.*event/i, /DataTransfer/];

test("the rules (game/ and actor/) never see pixels, DOM events, a device kind or a drag", () => {
  const rules = all.filter((f) => RULES_DIRS.some((d) => rel(f).startsWith(d)));
  assert.ok(rules.length > 10, "found the rule files");
  for (const f of rules) {
    // the pure adapters (game/adapters.js) turn a cursor in screen units into a 3D ray; they are the one place that may say "ndc"
    const skipPixels = rel(f) === "game/adapters.js";
    for (const re of [...DEVICE, ...DRAG, ...(skipPixels ? [] : PIXELS)]) assert.equal(re.test(text(f)), false, `${rel(f)} matches ${re}`);
  }
});

test("no DOM drag and no device-kind branch anywhere in the source", () => {
  for (const f of all) for (const re of [...DRAG, ...DEVICE]) assert.equal(re.test(text(f)), false, `${rel(f)} matches ${re}`);
});

test("pixel and pointer code lives only in the input adapters and the page's own words", () => {
  const allowed = (f) => rel(f).startsWith("input/") || ["ui.ts", "flat-ui.ts"].includes(rel(f));
  for (const f of all) {
    if (allowed(f) || rel(f) === "game/adapters.js") continue;
    for (const re of PIXELS.filter((r) => !/ndc|Raycaster|project|unproject/.test(String(r)))) assert.equal(re.test(text(f)), false, `${rel(f)} matches ${re}`);
  }
});
