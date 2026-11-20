import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** No text is rendered in the scene. Card numerals are painted into card textures
 * by one module; nothing else may draw text, make text meshes or load UI kits. */
const root = new URL("../src/", import.meta.url).pathname;
function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const sources = files(root).filter((f) => /\.(ts|js)$/.test(f));

test("no text meshes, sprites or UI kits in the source", () => {
  assert.ok(sources.length > 5);
  const banned = [/TextGeometry/, /\bSprite\b/, /SpriteMaterial/, /@pmndrs\/uikit/, /uikitml/i, /troika/i, /msdf/i, /\bUIKit/];
  for (const f of sources) {
    if (f.endsWith("art/audit.ts")) continue; // the audit looks for sprites in order to count zero
    if (f.includes("/art/baked/")) continue; // baked model data (base64 text) can contain any four letters by chance: it is not code
    const text = readFileSync(f, "utf8");
    for (const re of banned) assert.equal(re.test(text), false, `${f} matches ${re}`);
  }
});

test("canvas text is used only in the card art module", () => {
  const users = sources.filter((f) => /\bfillText\b|\bstrokeText\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(users.map((f) => f.slice(root.length)), ["art/textures.ts"]);
});

test("no Clay Hour, glaze or kiln wording is left in the source", () => {
  // baked model data (base64 text, src/art/baked/) can contain any three letters by chance: it is not wording
  for (const f of sources) if (!f.includes("/art/baked/")) assert.equal(/clay|glaze|kiln/i.test(readFileSync(f, "utf8")), false, f);
});
