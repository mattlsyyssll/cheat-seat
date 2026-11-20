/** Bench part B7, the rule-level half: three broken copies of the game's rules. The bench part that watches for each break must FAIL on it
 * (a bench that passes a broken build is worthless), while the same part passes on the real source. The fourth broken build (every mesh drawn
 * twice) needs the page: qa/stageC/bench-broken.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadGame, benchB1, benchB2, benchB3 } from "./bench-lib.js";
import { BROKEN, makeBroken } from "./bench-broken-lib.js";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const parts = { B1: (G) => benchB1(G), B2: (G) => benchB2(G), B3: (G) => benchB3(G) };

for (const b of BROKEN.filter((x) => !x.page)) {
  test(`B7: the bench fails on the broken build "${b.id}" (${b.what}) and passes on the real source`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "cheat-broken-"));
    try {
      const { srcDir } = makeBroken(src, b.id, join(dir, b.id));
      const broken = await loadGame(srcDir);
      const good = await loadGame(src);
      for (const part of b.fails) {
        const rb = parts[part](broken);
        const rg = parts[part](good);
        console.log(`B7 ${b.id}: ${part} on the broken build ${rb.pass ? "PASSED (bad)" : "FAILED (good)"}; on the real source ${rg.pass ? "passed" : "FAILED"}`);
        assert.equal(rb.pass, false, `${part} must fail on "${b.id}"`);
        assert.equal(rg.pass, true, `${part} must pass on the real source`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("B7: all four broken builds are defined and each one names the bench part that must catch it", () => {
  assert.deepEqual(BROKEN.map((b) => b.id), ["thresholds-swapped", "dropout-handler-removed", "noise-off", "mesh-count-doubled"]);
  for (const b of BROKEN) assert.ok(b.fails.length >= 1 && b.patches.length >= 1);
});
