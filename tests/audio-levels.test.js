/** Sound levels (stage C): the trim table covers the cues, and every cue in the type has a sound. The measured levels are
 * `node qa/stageC/audio-levels.mjs` (offline renders in a browser, so it is not part of this fast test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const audio = readFileSync(join(root, "src/audio.ts"), "utf8");
const trims = readFileSync(join(root, "src/audio-levels.ts"), "utf8");
const cues = [...(/export const CUES: Cue\[\] = \[([\s\S]*?)\];/.exec(audio)?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);

test("every cue has a sound (a case in the cue switch) and a level trim; no trim names a cue that does not exist", () => {
  assert.ok(cues.length >= 44, `${cues.length} cues`);
  for (const c of cues) {
    assert.ok(new RegExp(`case "${c}":`).test(audio), `cue ${c} has no sound`);
    assert.ok(new RegExp(`\\b${c}: [0-9.]+,`).test(trims), `cue ${c} has no level trim (run qa/stageC/audio-levels.mjs --write)`);
  }
  const named = [...trims.matchAll(/^\s+(\w+): ([0-9.]+),/gm)].map((m) => [m[1], Number(m[2])]);
  for (const [name, v] of named) {
    assert.ok(cues.includes(name) || name === "tension" || name === "room", `trim for unknown cue ${name}`);
    assert.ok(v >= 0.1 && v <= 80, `trim ${name} = ${v}`);
  }
});

test("the new feel cues exist: slow-motion in and out, chips, gasp, card fall and landing, laugh, growl, and a tension tone", () => {
  for (const c of ["slowIn", "slowOut", "chips", "gasp", "cardFall", "cardLand", "laugh", "growl"]) assert.ok(cues.includes(c), c);
  assert.ok(/setTension\(level: number\): void;/.test(audio));
});

test("all sound is made in code: no audio file, no sample, no network fetch", () => {
  assert.ok(!/fetch\(|new Audio\(|decodeAudioData|\.mp3|\.wav|\.ogg/.test(audio));
  assert.ok(/createOscillator/.test(audio) && /createBufferSource/.test(audio));
});

test("stage D sounds: the start screen and Play stings, and the room's small sounds, exist; the room tone has a trim", () => {
  for (const c of ["intro", "play", "tock", "glass", "creak", "riffle", "murmur"]) assert.ok(cues.includes(c), c);
  assert.ok(/export const AMBIENT: Cue\[\]/.test(audio));
  assert.ok(/\broom: [0-9.]+,/.test(trims), "the room tone has a level trim");
});
