import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyProgress, parseProgress, serializeProgress, recordMatch, jarShown, marksVisible, medalState,
  JAR_SHOWN_MAX, MEDALS, PROGRESS_KEY,
} from "../src/game/progress.js";
import { START_BUTTONS } from "../src/game/match.js";

test("a new player has nothing and sees no jar", () => {
  const p = emptyProgress();
  assert.deepEqual(p, { matches: 0, wins: 0, streak: 0, best: 0, jar: 0 });
  assert.equal(marksVisible(p), false);
  assert.deepEqual(medalState(p), { lit: 0, haloAt: 0 });
  assert.equal(jarShown(p), 0);
});

test("a win adds to the streak, the best streak and the jar (the buttons finished with beyond the 20 started with)", () => {
  let p = emptyProgress();
  p = recordMatch(p, { won: true, buttons: START_BUTTONS + 14 });
  assert.deepEqual(p, { matches: 1, wins: 1, streak: 1, best: 1, jar: 14 });
  p = recordMatch(p, { won: true, buttons: START_BUTTONS + 3 });
  assert.deepEqual(p, { matches: 2, wins: 2, streak: 2, best: 2, jar: 17 });
  assert.equal(marksVisible(p), true);
  assert.deepEqual(medalState(p), { lit: 2, haloAt: 2 });
});

test("a win with fewer buttons than the start still adds one", () => {
  const p = recordMatch(emptyProgress(), { won: true, buttons: 9 });
  assert.equal(p.jar, 1);
});

test("a loss ends the streak, keeps the best streak and the jar, and still shows the marks", () => {
  let p = emptyProgress();
  for (let i = 0; i < 3; i++) p = recordMatch(p, { won: true, buttons: 30 });
  p = recordMatch(p, { won: false, buttons: 5 });
  assert.deepEqual(p, { matches: 4, wins: 3, streak: 0, best: 3, jar: 30 });
  assert.deepEqual(medalState(p), { lit: 0, haloAt: 3 });
  const first = recordMatch(emptyProgress(), { won: false, buttons: 0 });
  assert.equal(marksVisible(first), true, "the jar appears after the first match even if it was lost");
  assert.equal(first.jar, 0);
});

test("the jar and the medals have a limit on screen, not in the record", () => {
  let p = emptyProgress();
  for (let i = 0; i < 12; i++) p = recordMatch(p, { won: true, buttons: 40 });
  assert.equal(p.jar, 240);
  assert.equal(jarShown(p), JAR_SHOWN_MAX);
  assert.deepEqual(medalState(p), { lit: MEDALS, haloAt: MEDALS });
  assert.equal(p.best, 12);
});

test("saving and reading give the same record", () => {
  let p = emptyProgress();
  p = recordMatch(p, { won: true, buttons: 33 });
  p = recordMatch(p, { won: false, buttons: 2 });
  p = recordMatch(p, { won: true, buttons: 25 });
  assert.deepEqual(parseProgress(serializeProgress(p)), p);
  assert.equal(PROGRESS_KEY, "cheat-seat-progress-v1");
});

test("bad or hand-edited saves give an empty record or a sane one, never an error", () => {
  for (const raw of [null, undefined, "", "not json", "[]", "7", "null", '"x"', "{".repeat(50), "x".repeat(500)]) {
    assert.deepEqual(parseProgress(raw), emptyProgress(), String(raw).slice(0, 20));
  }
  const odd = parseProgress(JSON.stringify({ matches: 2, wins: 99, streak: 50, best: 1, jar: -4, extra: "x" }));
  assert.deepEqual(odd, { matches: 2, wins: 2, streak: 2, best: 2, jar: 0 }, "wins cannot pass matches, the streak cannot pass wins, the best cannot be under the streak");
  const big = parseProgress(JSON.stringify({ matches: 1e9, wins: 1e9, streak: 1e9, best: 1e9, jar: 1e9 }));
  assert.ok(big.jar <= 9999 && big.matches <= 9999);
  const text = parseProgress(JSON.stringify({ matches: "5", wins: "x", streak: null, best: {}, jar: NaN }));
  assert.deepEqual(text, emptyProgress());
});
