# Cheat Seat

A life-size card duel across a small table with a card shark who also cheats. Play with your hands in a headset (the best way), or with a mouse on a flat screen. Same game, same strict rules.

- Play: https://cheat-seat.vercel.app
- Video: https://youtu.be/xQJXrMeu1nA
- Built for the Meta VR Start Developer Competition 2026.

## The game

Higher card wins the pot. Each round he deals you one card and himself one. Seven rounds; three strikes lose. You have a better card up your sleeve. He has one up his.

Five moments, each one needs your body (or, in flat play, the same 3D hand):

| # | Moment | Headset (hands only) | Flat play (mouse) |
|---|---|---|---|
| 1 | Palm it | Close your hand on your card: it is in your fist and gone from sight. Open the hand: it shows again. | Click your card (hold the button = fist). Let go: the card shows. |
| 2 | Under the table | Lower a hand below the desk edge, make a fist for half a second, open it: the card in your hand and the one up your sleeve change places. | Scroll the wheel away from you (or push the cursor to the bottom edge) until the hand goes through the table top, hold the button, let go. |
| 3 | Point him away | Point your index finger at a spot in your room (3 per match): he turns his head about 2 s. Pointing at the table, at him or at nothing makes him suspicious. | Right-click (or the Point button, or P) on a spot in the room. |
| 4 | The stare | He leans to 30 to 40 cm from your face and breathes. Hold still: a visible hand that moves gives you away. | Keep the mouse still. A small ring wobbles and ticks when you move. |
| 5 | Grab his wrist | When his shoulder dips and his hand goes under the table, close your hand on his wrist for half a second: he struggles, a card falls out of his sleeve, the strike is his. | Move to his wrist, click and hold. |

When he catches you his hand slams on yours, the chips scatter and a strike lamp lights.

Strict rules (the same for hands, Glasses and mouse): his gaze is a line of sight from his eyes and has a view cone. A visible card that is not the one he dealt you is seen. A fist, or a hand under the table, is not seen. A hand that moves above 7 cm/s (Normal) while he stares is seen. His wrist can be grabbed only while his hand is under the table.

First visit: four practice rounds, one verb each (palm, the stare, grab his wrist, under the table).


> Hand tracking uses Google MediaPipe (Apache-2.0). Its files are not stored here: after `npm ci`, run `npm run fetch:mediapipe` once.

## One input layer

Every way of playing sends the rules the same thing and nothing else: `HandInput = { id, tracked, pos (3D, table-local), fist, pinch, pointRay }` plus the head. The rules never see pixels, a DOM event or the kind of device.

| Adapter | File | What it does |
|---|---|---|
| Headset hands | `src/input/xr.ts`, `src/game/pose.js` | 25 joints per hand to table-local space, then `createHandsFeeder` (fist, pinch, point ray with hysteresis). |
| Glasses gaze and pinch | `src/game/adapters.js` (`gazeHand`) | The hand rides the gaze ray to the felt; pinch = fist; pinch with the gaze raised toward the room = point. |
| Mouse | `src/input/mouse.ts`, `src/game/adapters.js` (`mouseHand`) | First person at eye height; the hand is a 3D point on the cursor ray; left button = fist; right button = point ray. |
| Webcam hands | `src/input/webcam.ts` | MediaPipe hand tracking, run in the browser. |
| A script or a simulation | `createHandsFeeder().feed({ left, right }, selecting)` | One function takes joint frames (table-local, 25 named joints, or `null` for a tracking dropout). |

## Where things are

| Path | What |
|---|---|
| `src/game/duel.js` | The one game state and all rules. `createGame`, `startMatch`, `stepGame(g, dt, {head, hands})`. |
| `src/game/brain.js` | The Shark's mind: where he looks, suspicion, the stare, his cheat, the catch. |
| `src/game/sight.js` | Line of sight and view cones. |
| `src/game/spots.js` | Pointing: a ray, the room's surfaces, why a point is "nothing". |
| `src/game/pose.js`, `synth.js`, `hand-poses.js` | Hand pose from joints; synthesised hands for mouse, gaze and tests. |
| `src/game/adapters.js` | The input adapters (pure maths). |
| `src/actor/`, `src/art/` | The Shark rig and the art code (all shapes and textures are built in code). |
| `src/world/` | The booth, cards, chips, lamps, rings and the player's hands. |
| `src/input/`, `src/flat-ui.ts`, `src/index.ts` | Device input, the flat page's words, and the glue. |
| `tests/` | Unit tests (Node's built-in test runner). |

## Run it

Needs Node 22.12 or newer (see `.nvmrc`).

```sh
npm ci
npm run fetch:mediapipe   # one time: hand-tracking files
npm run dev         # HTTPS dev server with the Immersive Web Emulation Runtime
npm run build       # production build into dist/
```

Flat play: open the page and press "Play with mouse". Headset: "Enter VR (best experience)" (a Quest 3 or Meta VR Glasses browser).

Dev-server page switches: `?qa=1&hold=1&ts=0.6&planes=0&input=gaze&practice=1&seed=7&level=easy|normal|hard&warn=1`.

## Test

```sh
npm test            # 402 unit tests, including the parity test and the grep gate
npm run typecheck
```

The parity test (`tests/duel.test.js`) plays one scripted run of all five moments through the mouse adapter and through the emulator-hand adapter and fails on any difference in events or strikes. The grep gate (`tests/no-2d-input.test.js`) fails on DOM drag, screen-space hit tests or a device branch in the rules.

## Tech

- WebXR with the [Immersive Web SDK](https://github.com/facebook/immersive-web-sdk) (`@iwsdk/core`), three.js (`super-three`), `@pmndrs/uikit`.
- TypeScript and JavaScript, built with Vite.
- MediaPipe Hand Landmarker for webcam hand tracking.

## Third-party assets

| Asset | Where | Licence |
|---|---|---|
| MediaPipe Hand Landmarker model and WASM (`@mediapipe/tasks-vision`) | `public/mediapipe/` | Apache-2.0 |
| Immersive Web SDK, three.js, pmndrs uikit and other npm packages | `node_modules/` (not in this repo) | each package's own licence, mostly MIT |

Every other shape, texture and sound in the game is generated by the code in this repo. There are no other image, model, font or music files, except the preview image `public/cheat-seat-preview.jpg`, which is a screenshot of the game.

## Licence

MIT, Copyright (c) 2026 Vexta Labs Inc. See `LICENSE`. The MediaPipe files in `public/mediapipe/` keep their Apache-2.0 licence.
