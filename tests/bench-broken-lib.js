/** Bench part B7: broken builds the bench must fail on. Each entry patches a copy of the game's own source (never the real files), so a green
 * bench that stays green on a broken build would prove the bench worthless. The three rule-level breaks run in `npm test`; the fourth (mesh
 * count doubled) needs the page and runs from qa/stageC/bench-broken.mjs.
 *
 * Reading of the four names in VIRTUAL-QUEST.md (our interpretation, logged in AI-CHOICES.md):
 *   thresholds swapped      the fist and open limits of the hand classifier trade places (pose.js)
 *   dropout handler removed a hand that loses tracking is gone at once: no grace time, no "lost under the desk" rule (duel.js trackHand)
 *   noise off               the jitter tolerance is removed: no smoothing, a 50 ms stillness window, no 60 ms flicker filter (duel.js, booth.js)
 *   mesh count doubled      every mesh in the scene is drawn twice (index.ts), so draw calls and triangles double */
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

/** @type {{id:string, what:string, patches:{file:string, from:string, to:string}[], fails:string[], page?:boolean}[]} */
export const BROKEN = [
  {
    id: "thresholds-swapped",
    what: "the classifier's fist limit and open limit trade places",
    patches: [
      { file: "game/pose.js", from: "export const CURL_M = 0.115;", to: "export const CURL_M = 0.17;" },
      { file: "game/pose.js", from: "export const EXT_M = 0.135;", to: "export const EXT_M = 0.09;" },
    ],
    fails: ["B1"],
  },
  {
    id: "dropout-handler-removed",
    what: "a hand that loses tracking is gone at once (no grace, no lost-under-the-desk rule)",
    patches: [
      {
        file: "game/duel.js",
        from: "    h.lostT += dt;\n    h.speed = 0;\n    h.ray = null;",
        to: "    h.lostT += dt;\n    h.speed = 0;\n    h.ray = null;\n    h.present = false; h.closed = false; h.fist = false; h.pinch = false; h.under = false; h.dropped = false;\n    h.underT = 99;\n    return h;",
      },
    ],
    fails: ["B2"],
  },
  {
    id: "noise-off",
    what: "the jitter tolerance is removed (no smoothing, a 50 ms stillness window, no flicker filter)",
    patches: [
      { file: "game/duel.js", from: "const k = 1 - Math.exp(-dt / 0.04);", to: "const k = 1;" },
      { file: "game/duel.js", from: "g.clock - h.hist[0].t > 0.32", to: "g.clock - h.hist[0].t > 0.05" },
      { file: "game/duel.js", from: "h.speed = span >= 0.12 ?", to: "h.speed = span >= 0.016 ?" },
      { file: "game/booth.js", from: "debounceS: 0.06,", to: "debounceS: 0,", },
    ],
    fails: ["B3"],
  },
  {
    id: "mesh-count-doubled",
    what: "every mesh in the scene is drawn twice",
    page: true,
    patches: [
      {
        file: "index.ts",
        from: "    root.updateMatrixWorld(true);\n    inv.copy(root.matrixWorld).invert();",
        to: "    if (!(globalThis as any).__doubled) {\n      (globalThis as any).__doubled = true;\n      const all: any[] = [];\n      root.traverse((o: any) => { if (o.isMesh) all.push(o); });\n      for (const m of all) m.parent?.add(m.clone());\n    }\n    root.updateMatrixWorld(true);\n    inv.copy(root.matrixWorld).invert();",
      },
    ],
    fails: ["B5"],
  },
];

/** Copy the game's source into `outDir` (only game/ and actor/, plus the whole src/ for page builds) and apply one break.
 * @param {string} srcRoot the real src folder @param {string} id @param {string} outDir @returns {{srcDir:string, entry:typeof BROKEN[number]}} */
export function makeBroken(srcRoot, id, outDir) {
  const entry = BROKEN.find((b) => b.id === id);
  if (!entry) throw new Error(`unknown broken build ${id}`);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "package.json"), '{"type":"module"}\n');
  const srcDir = join(outDir, "src");
  if (entry.page) cpSync(srcRoot, srcDir, { recursive: true });
  else for (const d of ["game", "actor"]) cpSync(join(srcRoot, d), join(srcDir, d), { recursive: true });
  for (const p of entry.patches) {
    const f = join(srcDir, p.file);
    const text = readFileSync(f, "utf8");
    if (!text.includes(p.from)) throw new Error(`patch for ${id} did not apply: ${p.file} has no "${p.from.slice(0, 60)}"`);
    writeFileSync(f, text.replace(p.from, p.to));
  }
  return { srcDir, entry };
}

export { dirname };
