import { test } from "node:test";
import assert from "node:assert/strict";
import { playFiveMoments } from "./helpers-duel.js";

test("all five moments run end to end through the mouse adapter", () => {
  const r = playFiveMoments("mouse");
  for (const e of ["grab", "palm", "show", "swap:", "dip", "point:spot", "stareStart", "stareEnd", "cheatTell", "cheatUnder", "gotcha", "cardFalls"])
    assert.ok(r.log.some((l) => l.startsWith(e)), `${e} missing in ${r.log.join(" ")}`);
  assert.equal(r.strikes.shark, 1, "he takes the strike");
  assert.equal(r.strikes.player, 0, "you take none");
});

test("PARITY: the same scripted run of all five moments gives the same events and strikes through the mouse and through the emulator hands", () => {
  const a = playFiveMoments("mouse");
  const b = playFiveMoments("hands");
  assert.deepEqual(b.log, a.log, "event logs differ");
  assert.deepEqual(b.strikes, a.strikes, "strikes differ");
  assert.ok(a.log.length > 12, "the run did something");
});

test("the same run with 3 mm of tracking jitter on the hand gives the same events and strikes", () => {
  const clean = playFiveMoments("hands");
  const noisy = playFiveMoments("hands", { noise: 0.003 });
  // his reactions (the glare when suspicion first passes 0.3, the laugh) are folded out like in the parity compare: since stage D suspicion also
  // follows how fast the hand moves, so jitter can move the glare by a frame or two against the hand events; the rules' events must not change
  const rules = (log) => log.filter((l) => l !== "glare" && l !== "laugh");
  assert.deepEqual(rules(noisy.log), rules(clean.log));
  assert.deepEqual(noisy.strikes, clean.strikes);
});
