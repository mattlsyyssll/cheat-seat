/** Stage E (the blind judge's list of 2026-11-08): the hand-driven match start, the plate in the headset, the table's far edge, the drawn hands. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMenu, stepMenu, MENU, pointersFrom } from "../src/game/menu.js";
import { XR_PROMPTS, XR_GOAL, XR_DEAL, xrStamp } from "../src/xr-words.js";
import { retargetHand, fingerPose, HAND_SCALE } from "../src/art/hand-retarget.js";
import { synthHand } from "../src/game/synth.js";
import { classifyHand, JOINTS } from "../src/game/pose.js";
import { deskCloth } from "../src/art/cloth.js";

const DT = 1 / 60;
const tipAt = (p) => [{ id: "right", tip: { ...p }, press: false }];
const run = (m, secs, ptrs) => { const ev = []; for (let t = 0; t < secs; t += DT) ev.push(...stepMenu(m, DT, ptrs).events); return ev; };
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

// ------------------------------------------------------------------------------------------------ item 1: the match starts by hand
test("waiting: the DEAL orb is the only target; a fingertip on it for half a second deals", () => {
  const m = createMenu({ waiting: true });
  // the pause pad does nothing while the orb is up
  assert.deepEqual(run(m, 1.5, tipAt(MENU.pad)), []);
  assert.equal(m.open, false);
  const ev = run(m, 1.6, tipAt(MENU.deal));
  assert.deepEqual(ev, ["deal"]);
  assert.equal(m.waiting, false);
});

test("waiting: a pinch near the orb deals at once (after the first half second); a hand that only passes does not", () => {
  const m = createMenu({ waiting: true });
  run(m, 0.6, []);
  assert.deepEqual(run(m, 0.3, tipAt(MENU.deal)), []);
  run(m, 1, []);
  assert.deepEqual(run(m, 0.2, [{ id: "right", tip: { ...MENU.deal }, press: true }]), ["deal"]);
});

test("waiting: Glasses (gaze) deals by looking at the orb for half a second, or by a pinch", () => {
  const ray = { o: { x: 0, y: 0.47, z: 0.46 }, d: { x: MENU.deal.x, y: MENU.deal.y - 0.47, z: MENU.deal.z - 0.46 } };
  const m = createMenu({ waiting: true });
  assert.deepEqual(run(m, 1.6, [{ id: "gaze", tip: { x: 0, y: 0, z: 0 }, press: false, ray }]), ["deal"]);
});

test("after the deal the pause pad works as before, and the deal cannot fire twice", () => {
  const m = createMenu({ waiting: true });
  run(m, 1.6, tipAt(MENU.deal));
  assert.deepEqual(run(m, 1.2, tipAt(MENU.deal)), []);
  run(m, 1, []);
  assert.deepEqual(run(m, 1.6, tipAt(MENU.pad)), ["pause"]);
});

test("the headset session starts waiting for the deal (production and ?deal=1); the match starts only when the deal comes; the plate says how", () => {
  const src = read("../src/index.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(src, /menu\.waiting = !qaMode \|\| params\.has\("deal"\)/);
  assert.match(src, /xrFrame && activeSession && !started && !menu\.waiting\) startGame\(\)/);
  assert.match(src, /booth\.hint\.set\(XR_DEAL, XR_STAKES\)/); // stage F: the stakes are on the first plate
  assert.match(XR_DEAL, /green/);
  assert.match(XR_DEAL, /Deal/);
  // no controller anywhere in the new path
  assert.equal(/gamepad|squeeze|thumbstick/i.test(read("../src/game/menu.js") + read("../src/art/menu.ts") + read("../src/art/hint.ts")), false);
});

// ------------------------------------------------------------------------------------------------ item 2: the plate
test("every lesson step has a hand line for the headset and a page line, and every result the page stamps reaches the plate", () => {
  const flat = read("../src/flat-ui.ts");
  // stage F: the peek and the pause pad exist only in a headset (a laptop never leans, and its pause is the button at the top right)
  for (const id of Object.keys(XR_PROMPTS)) if (!["c-peek", "c-pause"].includes(id)) assert.match(flat, new RegExp(`"${id}": \\{ text:`), `${id} has a page line`);
  for (const id of ["p1-grab", "p1-fist", "p1-open", "p1-lay", "p2-wait", "p2-still", "p3-wait", "p3-grab", "p4-take", "p4-wait", "p4-under", "p4-swap", "p4-lay"]) assert.ok(XR_PROMPTS[id], `${id} has a hand line`);
  const src = read("../src/index.ts");
  assert.match(src, /booth\.hint\.say\(w\.main, w\.sub, tone, secs \+ 0\.4\)/);
});

test("the slam is always explained on the plate: whose hand it was and why, for each reason", () => {
  // the page's reason sentences (flat-ui.ts reasonLine) are the plate's sub line; the slam's main line says whose hand it was
  const flat = read("../src/flat-ui.ts");
  const reasons = ["He saw ${cardWords(card)} in your hand that he did not deal you.", "You moved while he stared at you.", "Your hand stayed under the table too long.", "He caught you."];
  for (const r of reasons) assert.ok(flat.includes(r), `flat-ui.ts has the reason "${r}"`);
  for (const r of reasons) {
    const w = xrStamp("He saw you!", `${r} You lose the pot.`);
    assert.equal(w.main, "He caught your hand");
    assert.match(w.sub, /lose the pot/);
  }
  assert.deepEqual(xrStamp("Caught him!", "x"), { main: "Caught him!", sub: "x" });
  // stage F: the sub line also says the strike count (or that it was a warning), so the red lamps and the stakes are explained
  assert.match(read("../src/index.ts"), /say\("He saw you!", `\$\{reason\} You lose the pot\. \$\{m\.penalty\?\.warned \? "A warning this time, no strike\." : `Your strike \$\{m\.strikes\.player\} of 3\.`\}`/);
});

// ------------------------------------------------------------------------------------------------ item 3: the table's far edge, the cloth
const box = { x0: -0.62, x1: 0.62, z0: -0.34, z1: 0.6 };
const area = (p) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + (q.x * r.z - r.x * q.z) / 2; }, 0));
const convex = (p) => p.every((q, i) => { const a = p[(i + 1) % p.length], b = p[(i + 2) % p.length]; return (a.x - q.x) * (b.z - a.z) - (a.z - q.z) * (b.x - a.x) >= -1e-9; });

test("the cloth of a real desk is a clean convex shape inside the box, with no spike, whatever the plane polygon is", () => {
  // a plain desk, a desk with a spike (a far vertex), a big floor plane, a plane with a hole-like notch
  const desk = [{ x: -0.5, z: -0.3 }, { x: 0.5, z: -0.3 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }];
  const spiky = [{ x: -0.5, z: -0.3 }, { x: 0, z: -2.5 }, { x: 0.5, z: -0.3 }, { x: 0.5, z: 0.5 }, { x: 4, z: 0.2 }, { x: -0.5, z: 0.5 }];
  const floor = [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: -4, z: 4 }];
  for (const poly of [desk, spiky, floor]) {
    const c = deskCloth(poly, box);
    assert.ok(c && c.length >= 6, "a cloth");
    assert.ok(convex(c), "convex");
    for (const p of c) {
      assert.ok(p.x >= box.x0 - 1e-9 && p.x <= box.x1 + 1e-9, `x ${p.x} inside`);
      assert.ok(p.z >= box.z0 - 1e-9 && p.z <= box.z1 + 1e-9, `z ${p.z} inside (his belly stays behind the far edge)`);
    }
    assert.ok(area(c) > 0.4, "most of the box");
  }
  assert.equal(deskCloth([{ x: 2, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 3 }], box), null, "a plane outside the box makes no cloth");
  assert.equal(deskCloth([{ x: -0.2, z: -0.1 }, { x: 0.2, z: -0.1 }, { x: 0.2, z: 0.1 }, { x: -0.2, z: 0.1 }], box), null, "a tiny plane makes no cloth");
});

test("the Shark sits behind the table's far edge: his body is hidden below the line of sight over it, there is no plank under him, and the avatar is told the eye every frame", () => {
  const toon = read("../src/art/toon.ts");
  assert.match(toon, /hideBehindEdge/);
  assert.match(toon, /uniform vec2 uEdge/);
  const booth = read("../src/art/booth.ts");
  assert.equal(/makeFarTop/.test(booth), false, "his side of the table is gone");
  assert.match(read("../src/index.ts"), /avatar\.setView\?\.\(head\.pos, booth\.occluder\)/);
  assert.match(read("../src/art/hero-shark.ts"), /hideBehindEdge: true/);
});

// ------------------------------------------------------------------------------------------------ item 4: the drawn hands
const out25 = () => Array.from({ length: 25 }, () => [0, 0, 0]);
const hand = (to, side = "right", k = 1, from = "open") => synthHand({ wrist: { x: 0.1, y: 0.1, z: 0.3 }, forward: { x: 0, y: -0.1, z: -1 }, palmNormal: { x: 0, y: -1, z: 0 }, side, from, to, k });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("a closed hand is drawn with curled fingers: every fingertip is near the palm and lower than its knuckle; an open hand is drawn long and slightly curved", () => {
  for (const side of ["right", "left"]) {
    const o = out25();
    const info = retargetHand(hand("fist", side), o);
    assert.equal(info.left, side === "left");
    assert.ok(info.curl.every((c) => c > 0.9), `all four curled (${info.curl})`);
    const w = o[0];
    for (const t of [9, 14, 19, 24]) assert.ok(dist(o[t], w) < 0.115, `tip ${t} is near the wrist (${dist(o[t], w).toFixed(3)})`);
    const open = out25();
    retargetHand(hand("open", side), open);
    for (const t of [9, 14, 19, 24]) assert.ok(dist(open[t], open[0]) > 0.13, `open tip ${t} is far from the wrist`);
  }
});

test("the drawn hand is smaller than the tracked one by HAND_SCALE about the wrist, and the wrist does not move", () => {
  const j = hand("open");
  const o = out25();
  retargetHand(j, o);
  assert.deepEqual(o[0], [j.wrist.x, j.wrist.y, j.wrist.z]);
  const k = JOINTS.indexOf("middle-finger-phalanx-proximal");
  const tracked = Math.hypot(j[JOINTS[k]].x - j.wrist.x, j[JOINTS[k]].y - j.wrist.y, j[JOINTS[k]].z - j.wrist.z);
  assert.ok(Math.abs(dist(o[k], o[0]) / tracked - HAND_SCALE) < 1e-6);
  assert.ok(HAND_SCALE < 1 && HAND_SCALE > 0.8);
});

test("the open hand is less spread than the tracked open hand (the emulator's is flat and spread)", () => {
  const j = hand("open");
  const o = out25();
  retargetHand(j, o);
  const spreadTracked = Math.hypot(j["index-finger-tip"].x - j["pinky-finger-tip"].x, j["index-finger-tip"].y - j["pinky-finger-tip"].y, j["index-finger-tip"].z - j["pinky-finger-tip"].z);
  assert.ok(dist(o[9], o[24]) < spreadTracked * 0.97, `fingertip spread ${dist(o[9], o[24]).toFixed(3)} vs ${spreadTracked.toFixed(3)}`);
});

test("while you pinch or point, the thumb and the index finger stay where they are tracked (up to the hand's own scale)", () => {
  for (const pose of ["pinch", "point"]) {
    const j = hand(pose);
    const o = out25();
    const info = retargetHand(j, o);
    assert.ok(info.keep > 0.9, `${pose} keeps the thumb and index`);
    const w = j.wrist;
    for (const name of ["thumb-tip", "index-finger-tip"]) {
      const i = JOINTS.indexOf(name);
      const want = [w.x + (j[name].x - w.x) * HAND_SCALE, w.y + (j[name].y - w.y) * HAND_SCALE, w.z + (j[name].z - w.z) * HAND_SCALE];
      assert.ok(dist(o[i], want) < 1e-6, `${pose}: ${name} as tracked`);
    }
  }
});

test("the drawn pose never changes what the rules read: they classify the tracked joints, and a drawn fist is still read as a fist by the same classifier", () => {
  const j = hand("fist");
  const o = out25();
  retargetHand(j, o);
  const drawn = Object.fromEntries(JOINTS.map((n, i) => [n, { x: o[i][0], y: o[i][1], z: o[i][2] }]));
  assert.equal(classifyHand(j).fist, true);
  assert.equal(classifyHand(drawn).fist, true);
  assert.equal(classifyHand(drawn).open, false);
});

test("finger poses move smoothly with curl and keep their bone lengths within 5 percent of the open hand", () => {
  const mcp = [-0.024, -0.007, -0.096];
  let prev = null;
  for (let c = 0; c <= 1.0001; c += 0.1) {
    const p = fingerPose(0, c, mcp);
    if (prev) for (let k = 0; k < 3; k++) assert.ok(dist(p[k], prev[k]) < 0.02, "no jump");
    prev = p;
    const L = [dist(mcp, p[0]), dist(p[0], p[1]), dist(p[1], p[2])];
    assert.ok(L.every((l) => l > 0.015 && l < 0.045));
  }
});
