/** A stranger who plays the four practice rounds by the words alone (also used by the QA notes): he reads the prompt id (the page
 * turns it into the words), does what the words say with a real mouse (clicks are one-frame clicks, holds are held buttons), and
 * nothing else. */
import { createGame, startMatch, stepGame } from "../src/game/duel.js";
import { makeAdapter, makeClickMouse, HEAD } from "./helpers-duel.js";
import { SPOTS, BODY } from "../src/game/booth.js";

const DT = 1 / 60;
const LAY = { x: SPOTS.playerLay.x, y: 0.045, z: SPOTS.playerLay.z };
export const head = () => ({ pos: HEAD.pos, dir: { x: 0, y: -0.2, z: -1 } });

export function stranger(kind, { maxS = 140, seed = 11, readS = 0.5, holdClick = false, quickFirst = false, onFrame = null } = {}) {
  const g = createGame({ seed, practice: true });
  let quickDone = !quickFirst, quickT = -1;
  startMatch(g);
  const ad = kind === "click" ? makeClickMouse() : makeAdapter("mouse");
  let want = { pos: { x: 0.2, y: 0.05, z: 0.25 }, fist: false };
  let move = null, t = 0, idleT = 0, last = null, since = 0, clickT = -1, holdT = 0, swapStart = null;
  const steps = [];
  const go = (pos, fist, secs) => { move = { from: { ...want.pos }, to: pos, fist, t: 0, secs }; };
  const at = (p, r = 0.03) => Math.hypot(want.pos.x - p.x, want.pos.z - p.z) <= r;
  const roundEnds = [];
  while (t < maxS && g.practice) {
    const v = g.view;
    const id = v?.prompt ?? null;
    if (id !== last) { last = id; since = t; holdT = 0; clickT = -1; swapStart = null; if (id) steps.push(id); }
    holdT += DT;
    const read = t - since >= readS;
    if (!move && id && read) {
      if (id === "p1-grab" || id === "p4-take") {
        if (!at(LAY)) go(LAY, false, 0.4);
        else if (clickT < 0 || t - clickT > 1.5) {
          clickT = t;
          // a click: the button is down for one frame (or for 0.25 s when `holdClick`)
          want = { pos: want.pos, fist: true };
        } else if (t - clickT >= (holdClick ? 0.25 : DT)) want = { pos: want.pos, fist: false };
      } else if (id === "p1-fist" || id === "p1-fist-now") want = { pos: want.pos, fist: true };
      else if (id === "p1-open") want = { pos: want.pos, fist: false };
      else if (id === "p1-lay") {
        // "Click the ring to put the card down."
        if (!at(LAY, 0.05) || want.pos.y > 0.1) go(LAY, false, 0.5);
        else if (clickT < 0 || t - clickT > 1.5) { clickT = t; want = { pos: want.pos, fist: true }; }
        else if (t - clickT >= DT) want = { pos: want.pos, fist: false };
      } else if (id === "p4-lay") {
        // "Hold the button down to hide the new card, move up to the ring, then let go."
        if (swapStart === null) { swapStart = t; want = { pos: want.pos, fist: true }; go(LAY, true, 0.7); }
        else if (!move && at(LAY, 0.05)) want = { pos: want.pos, fist: false };
      } else if (id === "p2-wait" || id === "p2-still" || id === "p3-wait" || id === "p4-wait") { /* keep still, wait */ }
      else if (id === "p3-grab") {
        const w = BODY.cheatWrist;
        if (Math.hypot(want.pos.x - w.x, want.pos.z - (w.z + 0.06)) > 0.03) go({ x: w.x, y: w.y + 0.045, z: w.z + 0.06 }, false, 0.6);
        else want = { pos: want.pos, fist: true };
      } else if (id === "p4-under") {
        if (want.pos.y > -0.05) go({ x: 0.05, y: -0.12, z: 0.0 }, false, 0.6);
      } else if (id === "p4-swap-go") {
        want = { pos: want.pos, fist: false };
      } else if (id === "p4-swap-retry") {
        swapStart = t; want = { pos: want.pos, fist: true };
      } else if (id === "p4-swap") {
        // "hold the button, then let go": a stranger holds for about half a second, once the hand has arrived
        if (!quickDone && quickT < 0) { quickT = t; want = { pos: want.pos, fist: true }; }
        else if (swapStart === null && quickDone) { swapStart = t; want = { pos: want.pos, fist: true }; }
        else if (quickDone && swapStart !== null && t - swapStart >= 0.55) { want = { pos: want.pos, fist: false }; if (t - swapStart > 1.6) swapStart = null; }
      }
    }
    if (!quickDone && quickT >= 0 && t - quickT >= 0.1) { want = { pos: want.pos, fist: false }; quickDone = true; }
    if (move) {
      move.t += DT;
      const k = Math.min(1, move.t / move.secs), e = k * k * (3 - 2 * k);
      want = { pos: { x: move.from.x + (move.to.x - move.from.x) * e, y: move.from.y + (move.to.y - move.from.y) * e, z: move.from.z + (move.to.z - move.from.z) * e }, fist: move.fist };
      if (k >= 1) move = null;
    }
    const before = g.practice ? { step: g.practice.step, done: g.practice.done, tries: g.practice.tries } : null;
    stepGame(g, DT, { head: head(), hands: [ad.input(want)] });
    for (const e of g.events) if (e.type === "roundEnd") roundEnds.push({ t, ...before });
    onFrame?.(g, t);
    g.events.length = 0;
    t += DT;
    idleT += DT;
  }
  return { g, t, steps, roundEnds };
}


/** Stage F: a stranger in the guided first match (no lesson rounds): he reads the tip id the page shows (the page turns it into words) and does what the words
 * say with a real mouse (one-frame clicks, held buttons), nothing else. With no tip he rests his hand and keeps still. Stops after `rounds` rounds have ended. */
export function coachStranger({ maxS = 120, seed = 11, readS = 0.5, rounds = 3, tips = true, onFrame = null, idle = false } = {}) {
  const g = createGame({ seed, coach: true });
  startMatch(g);
  const ad = makeClickMouse();
  let want = { pos: { x: 0.2, y: 0.05, z: 0.25 }, fist: false };
  let move = null, t = 0, last = null, since = 0, clickT = -1, holdStart = null;
  const steps = [];
  const stamps = [];
  const go = (pos, fist, secs) => { move = { from: { ...want.pos }, to: pos, fist, t: 0, secs }; };
  const at = (p, r = 0.03) => Math.hypot(want.pos.x - p.x, want.pos.z - p.z) <= r;
  let ended = 0;
  const firstPlayAt = { t: null };
  while (t < maxS && ended < rounds) {
    const v = g.view;
    const id = v?.prompt ?? null;
    if (firstPlayAt.t === null && v?.phase === "play") firstPlayAt.t = t;
    if (id !== last) { last = id; since = t; clickT = -1; holdStart = null; if (id) steps.push(id); }
    const read = t - since >= readS;
    if (!idle && !move && id && read) {
      if (id === "c-take") {
        if (!at(LAY)) go(LAY, false, 0.4);
        else if (clickT < 0 || t - clickT > 1.5) { clickT = t; want = { pos: want.pos, fist: true }; }
        else if (t - clickT >= DT) want = { pos: want.pos, fist: false };
      } else if (id === "c-fist") want = { pos: want.pos, fist: true };
      else if (id === "c-stare") { /* keep still */ }
      else if (id === "c-under") { if (want.pos.y > -0.05) go({ x: 0.05, y: -0.12, z: 0.0 }, false, 0.6); }
      else if (id === "c-swap-go") want = { pos: want.pos, fist: false };
      else if (id === "c-swap-retry") { holdStart = t; want = { pos: want.pos, fist: true }; }
      else if (id === "c-swap") {
        if (holdStart === null) { holdStart = t; want = { pos: want.pos, fist: true }; }
        else if (t - holdStart >= 0.55) { want = { pos: want.pos, fist: false }; if (t - holdStart > 1.6) holdStart = null; }
      } else if (id === "c-hide") {
        // "Hold the button: your hand hides the card. Move up to the ring, then let go."
        if (holdStart === null) { holdStart = t; want = { pos: want.pos, fist: true }; go(LAY, true, 0.7); }
        else if (!move && at(LAY, 0.05)) want = { pos: want.pos, fist: false };
      } else if (id === "c-cuff") {
        const w = BODY.cheatWrist;
        if (Math.hypot(want.pos.x - w.x, want.pos.z - (w.z + 0.06)) > 0.03) go({ x: w.x, y: w.y + 0.045, z: w.z + 0.06 }, false, 0.6);
        else want = { pos: want.pos, fist: true };
      }
    } else if (!idle && !move && !id && t - since >= 4 && v?.phase === "play" && g.card.state === "held" && !g.match.playerSwapped) {
      // no words: lay the card you hold (a click on the ring)
      if (!at(LAY, 0.05)) go(LAY, false, 0.5);
      else if (clickT < 0 || t - clickT > 1.5) { clickT = t; want = { pos: want.pos, fist: true }; }
      else if (t - clickT >= DT) want = { pos: want.pos, fist: false };
    } else if (!idle && !move && !id && v?.phase !== "play" && (want.fist || want.pos.y < 0)) {
      want = { pos: { x: 0.2, y: 0.05, z: 0.25 }, fist: false };
    }
    if (move) {
      move.t += DT;
      const k = Math.min(1, move.t / move.secs), e = k * k * (3 - 2 * k);
      want = { pos: { x: move.from.x + (move.to.x - move.from.x) * e, y: move.from.y + (move.to.y - move.from.y) * e, z: move.from.z + (move.to.z - move.from.z) * e }, fist: move.fist };
      if (k >= 1) move = null;
    }
    stepGame(g, DT, { head: head(), hands: [ad.input(want)] });
    for (const e of g.events) {
      if (e.type === "roundEnd") ended++;
      stamps.push({ t: +t.toFixed(2), ...e });
    }
    onFrame?.(g, t);
    g.events.length = 0;
    t += DT;
    if (!tips && t < 0.1) g.coach.tips = false;
  }
  return { g, t, steps, events: stamps, firstPlayAt: firstPlayAt.t };
}
