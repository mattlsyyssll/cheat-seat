/** Round 8, Q08 and Q13: a suspended audio context is resumed at session start, on selectstart, when visibility returns, and when it suspends itself; never while paused. */
import test from "node:test";
import assert from "node:assert/strict";
import { load, readSrc } from "./r8-lib.js";

const A = await load("audio-resume.js");

function rig({ paused = false, state = "suspended" } = {}) {
  const ctx = Object.assign(new EventTarget(), { state, resumes: 0, resume() { this.resumes++; this.state = "running"; return Promise.resolve(); } });
  const flag = { paused };
  const keeper = A.createAudioResume({ getCtx: () => ctx, isPaused: () => flag.paused });
  const session = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  ctx.addEventListener("statechange", () => keeper.onState());
  return { ctx, flag, keeper, session, doc };
}
const suspend = (ctx, s = "suspended") => { ctx.state = s; ctx.dispatchEvent(new Event("statechange")); };

test("session start: a suspended context is resumed", () => {
  const r = rig();
  r.keeper.watchSession(r.session, r.doc);
  assert.equal(r.ctx.resumes, 1);
  assert.equal(r.ctx.state, "running");
});

test("selectstart: a suspended context is resumed", () => {
  const r = rig({ state: "running" });
  r.keeper.watchSession(r.session, r.doc);
  r.ctx.state = "suspended";
  r.session.dispatchEvent(new Event("selectstart"));
  assert.equal(r.ctx.resumes, 1);
});

test("visibility returns (system and page) while the game is not paused: resumed", () => {
  const r = rig({ state: "running" });
  r.keeper.watchSession(r.session, r.doc);
  r.ctx.state = "suspended";
  r.session.visibilityState = "visible-blurred";
  r.session.dispatchEvent(new Event("visibilitychange"));
  assert.equal(r.ctx.resumes, 0, "not while the system menu is open");
  r.session.visibilityState = "visible";
  r.session.dispatchEvent(new Event("visibilitychange"));
  assert.equal(r.ctx.resumes, 1);
  r.ctx.state = "suspended";
  r.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(r.ctx.resumes, 2);
});

test("the context suspends or is interrupted by the system: resumed when the game is not paused", () => {
  const r = rig({ state: "running" });
  r.keeper.watchSession(r.session, r.doc);
  suspend(r.ctx, "suspended");
  suspend(r.ctx, "interrupted");
  assert.equal(r.ctx.resumes, 2);
});

test("while the game is paused nothing resumes it", () => {
  const r = rig({ paused: true });
  r.keeper.watchSession(r.session, r.doc);
  r.session.dispatchEvent(new Event("selectstart"));
  r.doc.dispatchEvent(new Event("visibilitychange"));
  suspend(r.ctx);
  assert.equal(r.ctx.resumes, 0);
});

test("audio.ts and index.ts use it", () => {
  assert.match(readSrc("audio.ts"), /createAudioResume\(/);
  assert.match(readSrc("audio.ts"), /keeper\.onState\(\)/);
  assert.match(readSrc("index.ts"), /audio\.watchSession\(session, document\)/);
});
