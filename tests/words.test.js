import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardWords } from "../src/game/cards.js";
import { stranger } from "./helpers-stranger.js";

const ui = readFileSync(new URL("../src/flat-ui.ts", import.meta.url), "utf8");
// the mouse words only (the webcam words follow them in the same file and are tested in tests/webcam.test.js)
const promptKeys = [...ui.split("export const WEBCAM_PROMPTS")[0].matchAll(/^\s*"([a-z0-9-]+)": \{ text: "([^"]+)"(?:, hint: "([^"]+)")?/gm)].map((m) => ({ id: m[1], text: m[2], hint: m[3] ?? "" }));

test("cards in words read like speech: a King, an 8, an Ace, a 3", () => {
  assert.equal(cardWords(11), "a King"); // rank 13
  assert.equal(cardWords(12), "an Ace");
  assert.equal(cardWords(6), "an 8");
  assert.equal(cardWords(1), "a 3");
  assert.equal(cardWords(9), "a Jack");
  assert.equal(cardWords(10), "a Queen");
  assert.equal(cardWords(null), "no card");
});

test("every line the game can put at the top of the picture has plain words on the page, one short sentence or two", () => {
  const ids = new Set(promptKeys.map((p) => p.id));
  for (const id of ["p1-grab", "p1-fist", "p1-fist-now", "p1-open", "p1-lay", "p2-wait", "p2-still", "p3-wait", "p3-grab", "p4-take", "p4-wait", "p4-under", "p4-swap", "p4-swap-go", "p4-swap-retry", "p4-lay", "tip-point", "point-mode"]) assert.ok(ids.has(id), `no words for ${id}`);
  // the ids the lessons really use
  const used = new Set(stranger("click").steps);
  for (const id of used) assert.ok(ids.has(id), `the lessons show ${id} but flat-ui.ts has no words for it`);
  for (const p of promptKeys) {
    assert.ok(p.text.length <= 85, `${p.id} is ${p.text.length} characters: too long for one line`);
    assert.ok(!/fallback/i.test(p.text + p.hint), `${p.id} says fallback`);
    assert.ok(/[.!:)]$/.test(p.text), `${p.id} should end like a sentence`);
  }
});

test("each lesson step names the thing to do in the words a stranger can act on: click, hold, let go, move, wait, do not move", () => {
  const by = Object.fromEntries(promptKeys.map((p) => [p.id, p.text.toLowerCase()]));
  assert.match(by["p1-grab"], /click your card/);
  assert.match(by["p1-fist"], /hold the mouse button/);
  assert.match(by["p1-open"], /let go/);
  assert.match(by["p2-still"], /do not move the mouse/);
  assert.match(by["p3-grab"], /cuff/);
  assert.match(by["p3-grab"], /hold the mouse button/);
  assert.match(by["p4-under"], /bottom of the screen/);
  assert.match(by["p4-swap"], /hold the mouse button/);
  assert.match(by["p4-swap"], /let go/);
  assert.match(by["p4-lay"] + " " + promptKeys.find((p) => p.id === "p4-lay").hint.toLowerCase(), /let go/);
});

test("the Point button is explained once, with the reason, in the tip line (not in the lessons)", () => {
  const tip = promptKeys.find((p) => p.id === "tip-point");
  assert.match(tip.text, /point/i);
  assert.match(tip.text + " " + tip.hint, /looks away/);
  assert.ok(/pointButton\(playing && !lesson/.test(readFileSync(new URL("../src/index.ts", import.meta.url), "utf8")), "the Point button is hidden during the lessons");
});

test("a headset session shows no page layer: the page words and the flash go through a guard, and the xr class hides every layer", () => {
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const code = index.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const direct = [...code.matchAll(/ui\.(stamp|flash)\(/g)];
  assert.equal(direct.length, 2, "ui.stamp and ui.flash are called only inside the two guards (say and flash)");
  // stage E: in a headset session the same words go to the one plate in the upper part of the view (never to the page layer)
  assert.match(code, /const say = [\s\S]*?if \(activeSession\) \{[\s\S]*?booth\.hint\.say\([\s\S]*?\} else if \(!attract\.on\) ui\.stamp/);
  assert.match(code, /const flash = .*if \(!activeSession\) ui\.flash/);
  assert.match(code, /ui\.setXr\(true\)/);
  assert.match(code, /ui\.setXr\(false\)/);
  assert.match(css, /body\.xr main > :not\(#scene-container\) \{ display: none !important; \}/);
  assert.match(css, /body\.xr #flatfx/);
  // in a headset session pageWords clears every layer too
  assert.match(code, /if \(xr \|\| ui\.starting\(\)\) \{[\s\S]*?ui\.pointButton\(false, false\)/);
});

test("in the headset the result is in the world: a light over the table swells for a win, a loss, a catch, a grab and the end of a match", () => {
  const booth = readFileSync(new URL("../src/world/booth.ts", import.meta.url), "utf8");
  for (const ev of ["result", "slamHit", "gotcha", "matchOver"]) assert.match(booth, new RegExp(`case "${ev}"`), `${ev} is handled in the booth`);
  assert.equal([...booth.matchAll(/this\.pulseLight\(/g)].length >= 5, true);
});

test("the headset has hand words for every lesson line (no mouse words), short enough for one small plate", () => {
  const xr = readFileSync(new URL("../src/xr-words.js", import.meta.url), "utf8");
  const ids = [...xr.matchAll(/^\s+"([\w-]+)": "([^"]+)",/gm)].map((m) => [m[1], m[2]]);
  const have = new Map(ids);
  const lessons = promptKeys.filter((p) => /^p\d-/.test(p.id)).map((p) => p.id);
  assert.ok(lessons.length >= 12, "found the lesson lines");
  for (const id of lessons) {
    assert.ok(have.has(id), `the headset has no words for ${id}`);
    const t = have.get(id);
    assert.ok(t.length <= 64, `${id} is ${t.length} characters for the headset plate`);
    assert.ok(!/mouse|click|button|cursor|screen/i.test(t), `${id} uses a mouse word in the headset: ${t}`);
  }
  assert.match(xr, /XR_GOAL = "Win the pot\. Sneak a better card past him\. Catch him cheating\."/);
});
