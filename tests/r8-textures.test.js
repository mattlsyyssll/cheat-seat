/** Round 8, Q02 and Q15: textures that change in play (score board, hint plate) are made and warmed before the Enter VR click and painted again in place. */
import test from "node:test";
import assert from "node:assert/strict";
import { load, readSrc } from "./r8-lib.js";

const { PaintedTexture } = await load("art/painted-texture.js");

test("a texture first used after the session starts never reaches the GPU: the board's texture is always one the warm-up sent", () => {
  const made = [];
  const make = () => { const t = { id: made.length + 1, needsUpdate: false }; made.push(t); return t; };
  const paint = (t, ...a) => { t.painted = a; };
  const gpu = new Set(); // what renderer.initTexture sent before the click; in the session a texture that is not in here draws blank
  const renderer = { initTexture: (t) => gpu.add(t) };
  const board = new PaintedTexture(make, paint);
  renderer.initTexture(board.tex); // the warm-up, before the click
  const drawn = new Set();
  for (let i = 0; i < 40; i++) drawn.add(board.repaint({ round: 1 + (i % 7), pot: i }));
  assert.equal(made.length, 1, `${made.length} textures were made`);
  assert.ok([...drawn].every((t) => gpu.has(t)), "a texture was drawn that the warm-up had not sent");
  assert.deepEqual(board.tex.painted, [{ round: 1 + (39 % 7), pot: 39 }]);
});

test("score.ts and hint.ts paint into the texture they have; no new texture, no dispose in play", () => {
  for (const f of ["art/score.ts", "art/hint.ts"]) {
    const s = readSrc(f);
    assert.match(s, /new PaintedTexture\(/, f);
    assert.match(s, /\.repaint\(/, f);
    assert.doesNotMatch(s, /\.dispose\(\)/, f);
  }
  const t = readSrc("art/textures.ts");
  assert.match(t, /makeHint\(main: string, sub = "", tone: PlateTone = "gold", into\?: CanvasTexture\)/);
  assert.match(t, /export function makeScore\(o: [^)]*\}, into\?: CanvasTexture\)/);
});

test("both hands are built and warmed before the click (index.ts setup)", () => {
  assert.match(readSrc("index.ts"), /for \(const id of \["left", "right"\]\) \{\n\s+const hv = new HandVisual\(\);\n\s+hv\.update\(null\);/);
});
