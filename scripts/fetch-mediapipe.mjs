// Fetches the MediaPipe hand-tracking files the game loads from public/mediapipe/.
// They are third-party (Apache-2.0) and large, so they are not stored in this repo.
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
const out = 'public/mediapipe';
mkdirSync(`${out}/wasm`, { recursive: true });
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  if (!existsSync(`${src}/${f}`)) { console.error(`missing ${src}/${f}: run npm ci first`); process.exit(1); }
  copyFileSync(`${src}/${f}`, `${out}/wasm/${f}`);
}
const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const res = await fetch(url);
if (!res.ok) { console.error(`download failed: ${res.status}`); process.exit(1); }
writeFileSync(`${out}/hand_landmarker.task`, Buffer.from(await res.arrayBuffer()));
console.log('MediaPipe files ready in public/mediapipe/');
