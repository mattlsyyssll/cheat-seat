import { test } from "node:test";
import assert from "node:assert/strict";
import { createHabits, recordSwap, adaptation, matchHabitLines, habitsNewMatch, FIST_LONG_S } from "../src/game/habits.js";
import { createGame, startMatch, newMatch } from "../src/game/duel.js";
import { playMatch } from "./helpers-habits.js";
import { policies, runPolicy } from "../qa/r6/habit-sim.mjs";

const swap = (h, cover, hand, fistS = 0.5) => recordSwap(h, { cover, hand, fistS });

test("he learns nothing before the first swap, and nothing before round 2 of a first match", () => {
  const h = createHabits();
  assert.equal(adaptation(h, 5), null);
  swap(h, "look", "right");
  assert.equal(adaptation(h, 1), null);
  assert.deepEqual(adaptation(h, 2), { cover: "look", hand: "right", fist: false });
});

test("he expects the habits of your last swap; changing them changes what he does", () => {
  const h = createHabits();
  swap(h, "look", "right");
  swap(h, "point", "right");
  assert.deepEqual(adaptation(h, 4), { cover: "point", hand: "right", fist: false });
  swap(h, "point", "left");
  assert.deepEqual(adaptation(h, 4), { cover: "point", hand: "left", fist: false });
  swap(h, null, "left");
  assert.deepEqual(adaptation(h, 4), { cover: null, hand: "left", fist: false });
  const none = createHabits();
  recordSwap(none, { cover: null, hand: "mouse", fistS: 0.5 });
  assert.equal(adaptation(none, 4), null, "no cover, no hand, a short fist: nothing to learn");
});

test("the fist habit counts only without a hand habit; the mouse has no hand habit", () => {
  const h = createHabits();
  swap(h, null, "mouse", FIST_LONG_S + 0.1);
  assert.deepEqual(adaptation(h, 2), { cover: null, hand: null, fist: true });
  const h2 = createHabits();
  swap(h2, null, "right", 2.5);
  assert.deepEqual(adaptation(h2, 2), { cover: null, hand: "right", fist: false });
});

test("a rematch remembers you: he adapts from round 1", () => {
  const h = createHabits();
  swap(h, "look", "left");
  assert.equal(adaptation(h, 1), null);
  habitsNewMatch(h);
  assert.ok(adaptation(h, 1));
  assert.deepEqual(h.caught, {});
});

test("the match-end lines say what he caught and one thing to try, in plain words", () => {
  const h = createHabits();
  swap(h, "point", "left", 2.2);
  swap(h, "point", "left", 2.2);
  h.caught = { cover: 1, hand: 2 };
  const l = matchHabitLines(h);
  assert.deepEqual(l.caught, ["You always cheated when you pointed him away.", "You always used your left hand."]);
  assert.equal(l.next, "Try this: Wait until he looks at his own card.");
  assert.match(matchHabitLines(createHabits()).next, /at least twice/);
  const quiet = createHabits();
  swap(quiet, "look", "right");
  swap(quiet, "point", "left");
  assert.match(matchHabitLines(quiet).next, /Keep changing/);
});

test("practice and coached rounds are never adapted", () => {
  for (const o of [{ practice: true }, { coach: true }]) {
    const g = createGame({ seed: 4, ...o });
    swap(g.habits, "look", "right");
    startMatch(g);
    assert.equal(g.brain.adapt, null);
  }
});

test("the Shark's plate comes only from round 2, and the same seed plays the same match", () => {
  const a = playMatch(3, policies.keeps(3));
  const b = playMatch(3, policies.keeps(3));
  assert.deepEqual(a.attempts, b.attempts);
  assert.deepEqual(a.plates, b.plates);
  assert.ok(a.attempts.filter((x) => x.round < 2).every((x) => !x.adaptedBefore), "no adaptation before round 2");
});

test("a rematch keeps the memory and starts the new match's list of what he caught again", () => {
  const first = playMatch(2, policies.keeps(2));
  assert.ok(first.over);
  const memory = first.g.habits.swaps.length;
  const second = playMatch(2, policies.keeps(2), { game: first.g });
  assert.equal(first.g.habits.matchNo, 2);
  assert.ok(first.g.habits.swaps.length >= Math.min(memory, 2));
  assert.ok(second.attempts.length > 0);
});

test("seeded 60-match run: keeping one habit loses, varying wins some, varying and reading his tell wins most", () => {
  const keeps = runPolicy("keeps");
  const random = runPolicy("random");
  const reads = runPolicy("reads");
  assert.ok(keeps.winRate < 0.2, `keeps ${keeps.winRate}`);
  assert.ok(reads.winRate >= 0.35 && reads.winRate <= 0.6, `reads ${reads.winRate}`);
  assert.ok(random.winRate > keeps.winRate && random.winRate < reads.winRate, `random ${random.winRate}`);
  assert.ok(keeps.catchRateWhileAdapted >= 0.7, `${keeps.catchRateWhileAdapted}`);
  assert.ok(reads.catchRateWhileAdapted < keeps.catchRateWhileAdapted - 0.4);
});
