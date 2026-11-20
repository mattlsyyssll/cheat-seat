/** Cheat Seat (stage A, 2026-11-07): a life-size card duel across a small table with a card shark who also cheats.
 *
 * ONE game state, ONE set of strict rules (game/duel.js). Every way of playing sends the rules the same thing and nothing else: a 3D
 * hand position, fist yes or no, a point ray (plus the head). Headset: real hands (input/xr.ts). Glasses: gaze and pinch. Flat play:
 * the mouse (input/mouse.ts, game/adapters.js). The Shark (actor/rig.js) is drawn by the avatar in art-slot.ts.
 * This file only connects the pieces: placement, input, the frame loop, sound and the page. No rule lives here. */
import { World, createSystem, Group, Vector3, Quaternion, Matrix4, Euler } from "@iwsdk/core";
import options from "virtual:iwsdk-project";
import "./style.css";

import { createGame, startMatch, stepGame, newMatch, arrange, forceCheat, setTips, setKept, setKeepSpot, setGlasses, keptForSave, PAYOFF_HOLD_S, SHOW_AT_S, type Game } from "./game/duel.js";
import { createKeepStore, chooseSpot, validSpot, spotOnTable, frameInGlassesView } from "./game/keep.js";
import { isGlassesViews, viewAngles, maskIsGlasses, glassesCall } from "./input/glasses-detect.js";
import { createKeepAnchor, resetKeepAnchor, startAnchor, readAnchor } from "./input/keep-anchor.js";
import { createRng } from "./game/rng.js";
import { slowFactor, shakeAmp, shakeOffset, breathIntensity, tensionTarget } from "./game/feel.js";
import { levelId } from "./game/levels.js";
import { SEAT, TABLE } from "./game/booth.js";
import { onTable } from "./game/sight.js";
import { createDeskWatch, resetDeskWatch, deskStep } from "./game/desk-watch.js";
import { createHandSourceWatch, resetHandSourceWatch, handSourceStep, NO_HAND_LINE } from "./input/hand-source.js";
import { createEnterVr } from "./input/xr-enter.js";
import { applyXrQuality } from "./xr-quality.js";
import { VIRTUAL_ROOM, type Surface } from "./game/spots.js";
import { mouseHand, mouseLook, mouseTick, mouseFor, cameraBasis, gazeHand, createGaze, createHandsFeeder, type MouseState } from "./game/adapters.js";
import { synthHand, wristForPalm } from "./game/synth.js";
import { attractHand, attractStep, attractCaption, ATTRACT } from "./game/attract.js";
import { createMenu, stepMenu, pointersFrom } from "./game/menu.js";
import { createCheatAudio } from "./audio.js";
import { Booth } from "./art/booth.js";
import { HandVisual } from "./art/player-hand.js";
import { createSharkAvatar } from "./art-slot.js";
import { attachMouse, onFirstPointer, onAnyGesture, ndcToClient } from "./input/mouse.js";
import { XrInput, collectPlanes, type HandInputT } from "./input/xr.js";
import { createWebcamHands } from "./input/webcam.js";
import { createFlatUi, resultLine, reasonLine, cardWords } from "./flat-ui.js";
import { matchHabitLines } from "./game/habits.js";
import { XR_PROMPTS, XR_GOAL, XR_DEAL, XR_STAKES, xrStamp } from "./xr-words.js";

// ---------------------------------------------------------------- settings
const params = new URLSearchParams(location.search);
const DEV = import.meta.env.DEV;
const qaMode = DEV && params.has("qa");
let holdStart = qaMode && params.has("hold");
const ignorePlanes = qaMode && params.get("planes") === "0";
const forceGaze = params.get("input") === "gaze";
let timeScale = qaMode && Number.isFinite(Number(params.get("ts"))) && Number(params.get("ts")) > 0 ? Number(params.get("ts")) : 1;
const seedParam = params.get("seed");
const baseSeed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) >>> 0 : qaMode ? 7 : (Date.now() & 0x7fffffff) >>> 0;
const FLAGS_KEY = "cheat-seat-flags-a1";
const storageOn = !qaMode || params.has("persist");
const flags = { practiceDone: false, level: "normal", pointTipSeen: false, tipsOff: false };
if (storageOn) {
  try {
    const raw = JSON.parse(localStorage.getItem(FLAGS_KEY) ?? "{}");
    flags.practiceDone = raw.practiceDone === true;
    flags.pointTipSeen = raw.pointTipSeen === true;
    flags.tipsOff = raw.tipsOff === true;
    flags.level = levelId(raw.level);
  } catch {
    /* storage can be unavailable */
  }
}
if (params.has("level")) flags.level = levelId(params.get("level"));
/** Desk Keep: the kept cards, the spot relative to the desk and the anchor handle, in local storage (every call inside try/catch; a failure falls back to memory, game/keep.js). */
const keepStore = createKeepStore(() => localStorage);
/** Desk Keep, headset: the WebXR anchor of the spot (input/keep-anchor.js). */
const keepAnchor = createKeepAnchor();
/** Stage H (debug state only): the anchor's last pose read back into table-local metres, and whether it lies on this desk. */
let keepAnchorLocal: { x: number; y: number; z: number; onDesk: boolean } | null = null;
/** Meta VR Glasses (2026-11-11): read once per session from the field of view the session reports (input/glasses-detect.js); null = not known yet. ?glasses=1 or 0 forces it (QA). The keep spot, the keep cue and the keep risk change for Glasses only. */
let glassesSession: boolean | null = null;
let glassesViews: unknown = null; // QA: the half angles the session reported for each view
const glassesForced = params.get("glasses") === "1" ? true : params.get("glasses") === "0" ? false : null;
/** Desk Keep: the one-time keep cue (game/ghost.js) has ended its job for this page session once the player has kept a card. */
let keepTaughtSession = false;
function persistKeep(): void {
  if (!storageOn || attract.on || game.practice) return;
  // the Glasses default spot is not saved (a Quest that reads the same storage keeps its own spot)
  keepStore.save({ cards: keptForSave(game), spot: game.keep.spot.source === "glasses" ? (null as unknown as { x: number; z: number }) : game.keep.spot, handle: keepAnchor.handle });
}
/** Stage F: the four lesson rounds are gone from a first visit (they stay behind ?practice=1 for the old tests and scenarios). A first visit plays THE GUIDED FIRST
 * MATCH instead (game/duel.js COACH): the real match from the first deal, with a tip the first time each situation happens. ?coach=1 or ?coach=0 force it; QA runs only with ?coach=1. */
const wantPractice = params.get("practice") === "1";
const wantCoach = !wantPractice && (params.has("coach") ? params.get("coach") === "1" : qaMode ? false : !flags.practiceDone);
function saveFlags(): void {
  if (!storageOn) return;
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------- state
let world: World;
const root = new Group();
root.name = "cheat seat";
let booth: Booth;
let avatar: ReturnType<typeof createSharkAvatar>;
let game: Game = createGame({ seed: baseSeed, level: flags.level });
/** QA only (a dev build): which sounds were asked for, in order, with game-clock-independent real time in seconds, and the tension level. */
const cueLog: { t: number; name: string; k: number }[] = [];
let tensionNow = 0;
const audio = createCheatAudio(DEV ? { onCue: (name, k) => { cueLog.push({ t: +(performance.now() / 1000).toFixed(3), name, k: +k.toFixed(2) }); if (cueLog.length > 400) cueLog.shift(); }, onTension: (v) => { tensionNow = v; } } : {});
const ui = createFlatUi();
const xrInput = new XrInput();
const gazeState = createGaze();
/** Stage E: the opt-in webcam hands (input/webcam.ts). Off until the player presses its button; the mouse stays the default and is the fallback whenever no hand is seen. */
const webcam = createWebcamHands({ preview: document.getElementById("cam-preview") as HTMLCanvasElement | null, status: (t) => ui.camStatus(t) });
const webcamFeeder = createHandsFeeder();
let webcamOn = false;
let mouse: MouseState;
const hands = new Map<string, HandVisual>();
let started = false;
let placed = false;
/** Round 8 (Q01): waits for a desk plane, then keeps reading planes for a while after the virtual table is shown (game/desk-watch.js). */
const deskWatch = createDeskWatch();
/** Round 8 (Q03): controllers only, or no input source: the match waits and one line says why (input/hand-source.js). */
const handWatch = createHandSourceWatch();
let noHand = false;
const fwV = new Vector3();
let planeFound = false;
let activeSession: XRSession | undefined;
let paused = false;
let clock = 0;
let frameAvgMs = 0;
let swayOn = true;
let frame = { x: 0, y: 0.72, z: -SEAT.playerZ, yaw: 0, real: false, seatFar: false, seat: { x: 0, z: 0 } };
let lastPlanes: { id: number; y: number; polygon: { x: number; z: number }[]; center: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; radius: number; horizontal: boolean }[] = [];
let lastSurfaceKey = "";
let tossRng = createRng(77);
const timers: { at: number; fn: () => void }[] = [];
/** QA and simulation: joint frames fed from a script instead of the headset or the mouse (see game/adapters.js createHandsFeeder). */
let injected: { frame: { head?: { pos: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } }; hands: Record<string, Record<string, { x: number; y: number; z: number }> | null>; selecting?: Record<string, boolean> }; feeder: ReturnType<typeof createHandsFeeder> } | null = null;
let lastBreath = 0;
/** Camera shake of the laptop view (flat play only; a headset never moves your view): strength at the hit and when it was. */
let shakePeak = 0;
let shakeAt = -99;
let lastWobble = 0;
let handIconSwap = 0;
const visK = new Map<string, number>();
performance.mark("cheat-seat-script-start");
/** Stage D: the start screen's demo (a ghost hand, the real rules; see game/attract.js). Flat play only; off in QA runs unless ?attract=1. */
const attractEnabled = !qaMode || params.has("attract");
let attract = { on: false, t: 0, loops: 0 };
/** Stage D: the player paused (flat: Esc or the pause button; headset: the pause pad, hands only, see game/menu.js). The world freezes. */
let userPaused = false;
let matchEndOpen = false;
function rematch(): void {
  if (!matchEndOpen) return;
  matchEndOpen = false;
  ui.matchEnd(null);
  newMatch(game);
  say("Rematch", "He remembers how you cheated. Change it.", "gold", 3);
}
const menu = createMenu();
let menuFill: Record<string, number> = { pad: 0, resume: 0, exit: 0 };
let menuTips: ({ x: number; y: number; z: number } | null)[] = [];
let menuPtrs: { id: string; tip: { x: number; y: number; z: number } | null; press: boolean }[] = [];
/** A short freeze of the world on "Caught him!" and on the slam (judge fix 11), in frames; and the flat camera's push (metres and when). */
let hitStop = 0;
let pushPeak = 0;
let pushAt = -99;
let firstFrameMarked = false;
/** QA (dev builds): how many times a script called into the page's cheatQa hooks (a hands-only proof run must end at 0), and the free camera of the picture tool. */
let qaCalls = 0;
let lastSeen = ""; // User Timing marks (cs:*) say what the player can see (his look, the phase); a script only reads them, nothing goes back into the game
let lastHeadDir: { x: number; y: number; z: number } | null = null;
let freeCam: { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number }; fov: number } | null = null;
let lastPausedFlag = false;
/** Seconds since the headset session began (the goal plate shows for the first nine). */
let sessionT = 0;
/** After a headset session the demo starts again once the flat table is placed. */
let attractPending = false;
let frameN = 0;
/** Stage F: the headset-only tips of the guided first match (the peek and the pause pad; the page knows the device, the rules do not): which were shown, which is on and for how long. */
const xrTips = { seen: new Set<string>(), cur: null as string | null, t: 0, roundsEnded: 0 };
/** Stage F (D15, frozen frames of 0.5 to 0.7 s at the first appearance of a thing): every shader of the scene is compiled once the table is placed, before play. */
let warmPending = false;
let lastUpdateAt = 0;
// stage G: update gaps of the first 120 frames of a headset session (DEV log only; plain numbers, nothing allocated per frame)
let launchAt = 0;
let sessGapN = 120;
let sessGapMax = 0;
let sessGapSum = 0;
let programsNow = 0;
/** QA (dev builds): the headset session as a log, with the kinds of input device the session reports (hands only: no controller). */
const sessionLog: { t: number; e: string }[] = [];
const slog = (e: string): void => {
  if (!DEV) return;
  sessionLog.push({ t: +(performance.now() / 1000).toFixed(2), e });
  if (sessionLog.length > 800) sessionLog.shift();
};
const inputKinds = (s: XRSession): string[] => [...s.inputSources].map((i) => (i.hand ? "hand" : i.targetRayMode === "gaze" ? "gaze" : i.targetRayMode === "tracked-pointer" ? "controller" : i.targetRayMode));
const log = (s: string) => {
  dbgEvents.push(s);
  if (dbgEvents.length > 80) dbgEvents.shift();
};
const dbgEvents: string[] = [];
const v1 = new Vector3();
const inv = new Matrix4();
const q1 = new Quaternion();

/** Head sway for the flat camera (a small natural motion, always on, off in tests). */
const FLAT = { pitchDown: (24 * Math.PI) / 180, fovY: 74 };
function sway(t: number): { x: number; y: number; z: number; yaw: number; pitch: number } {
  if (!swayOn) return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  return {
    x: 0.004 * Math.sin(t * 0.7) + 0.002 * Math.sin(t * 1.9), y: 0.005 * Math.sin(t * 0.52 + 1) + 0.002 * Math.sin(t * 2.3), z: 0.003 * Math.sin(t * 0.43 + 2),
    yaw: (0.55 * Math.PI / 180) * Math.sin(t * 0.37), pitch: (0.45 * Math.PI / 180) * Math.sin(t * 0.61 + 1.3),
  };
}

// --------------------------------------------------------------- placement
function applyFrame(f: { x: number; y: number; z: number; yaw: number; real: boolean; seatFar: boolean; seat: { x: number; z: number }; eyeRel: number; polygon: { x: number; z: number }[] | null }, xr: boolean): void {
  frame = f;
  hitStop = 0; // a freeze belongs to the game that was hit; the new game starts running (a frozen first frame of a new game has no view to draw)
  root.visible = true;
  root.position.set(f.x, f.y, f.z);
  root.rotation.set(0, f.yaw, 0);
  root.updateMatrixWorld(true);
  performance.mark("cs:table", { detail: { x: f.x, y: f.y, z: f.z, yaw: f.yaw } });
  placed = true;
  planeFound = f.real;
  booth.setMode({ virtualTable: !f.real, showRoom: !xr || (!f.real && !xr), floorY: -f.y });
  // In a headset session the room is the real room (passthrough); the den shows only on the flat page and in VR without passthrough.
  booth.room.visible = !xr;
  let poly: { x: number; z: number }[] | null = null;
  if (f.real && f.polygon) {
    poly = f.polygon.map((p) => {
      v1.set(p.x, f.y, p.z);
      root.worldToLocal(v1);
      return { x: v1.x, z: v1.z };
    });
  }
  booth.setComfort(xr);
  booth.setDesk(xr ? poly : null); // a real desk gets a felt cloth over its whole top (the bare wood of a round table showed round the mat)
  warmPending = true; // stage F (D15): compile every shader of the scene before play (see warmUp)
  const level = flags.level;
  const surfaces = buildSurfaces();
  // Desk Keep, load order for the spot: the anchor (read back once the session has it, see the frame loop), else the saved position relative to the desk, else the default; the kept cards come from the save
  const savedKeep = storageOn ? keepStore.load() : { cards: [] as number[], spot: null, handle: null };
  const tableNow = { ...TABLE, polygon: poly };
  const glassesNow = glassesForced ?? glassesSession === true;
  const spotChoice = chooseSpot({ saved: savedKeep.spot && spotOnTable(savedKeep.spot, tableNow) ? savedKeep.spot : null, glasses: glassesNow });
  game = createGame({ seed: baseSeed, level, eyeRel: f.eyeRel, table: tableNow, surfaces, practice: wantPractice, coach: wantCoach, warn: params.has("warn") || (!qaMode && !flags.practiceDone), tipPointSeen: flags.pointTipSeen || qaMode, keep: { cards: savedKeep.cards, spot: spotChoice }, keepTaught: keepTaughtSession, glasses: glassesNow });
  if (savedKeep.handle && !keepAnchor.handle) keepAnchor.handle = savedKeep.handle;
  game.surfaces = surfaces;
  if (flags.tipsOff) setTips(game, false);
  xrTips.seen.clear();
  xrTips.cur = null;
  rebuildAvatar();
  started = false;
  booth.showSeat(f.seatFar ? { x: f.seat.x, y: 0, z: f.seat.z } : null);
  log(f.real ? "placed on the real desk" : "placed on a virtual table");
  slog(f.real ? "table placed on the real desk" : "table placed (virtual table)");
}

/** Flat play: the table, the Shark and the camera go to the seat at once (the start screen shows his face from the first frame). */
function placeFlat(): void {
  applyFrame({ x: 0, y: 0.72, z: -SEAT.playerZ, yaw: 0, real: false, seatFar: false, polygon: null, eyeRel: SEAT.eyeRel, seat: { x: 0, z: 0 } }, false);
  fitFlatCamera();
  placeFlatCamera({ x: 0, y: SEAT.eyeRel, z: SEAT.playerZ }, { yaw: 0, pitchDown: FLAT.pitchDown }, mouse, aspectOf());
}

function rebuildAvatar(): void {
  if (avatar) {
    root.remove(avatar.root);
    avatar.dispose?.();
  }
  avatar = createSharkAvatar();
  root.add(avatar.root);
}

/** The room as the rules see it: detected planes (table-local discs), and the virtual den when little is known. */
function buildSurfaces(): Surface[] {
  const out: Surface[] = [];
  if (!ignorePlanes) {
    root.updateMatrixWorld(true);
    const m = new Matrix4().copy(root.matrixWorld).invert();
    for (const p of lastPlanes) {
      if (p.radius < 0.25) continue;
      const c = new Vector3(p.center.x, p.center.y, p.center.z).applyMatrix4(m);
      const n = new Vector3(p.normal.x, p.normal.y, p.normal.z).transformDirection(m);
      out.push({ type: "disc", c: { x: c.x, y: c.y, z: c.z }, n: { x: n.x, y: n.y, z: n.z }, r: Math.min(4, p.radius * 1.15) });
    }
  }
  if (out.filter((s) => s.type === "disc").length < 3 || !planeFound) out.push(VIRTUAL_ROOM);
  return out;
}

// ---------------------------------------------------------------- the frame
function visualJoints(id: string, input: HandInputT, headLocal: { x: number; y: number; z: number }, holding: boolean, dt: number): Record<string, { x: number; y: number; z: number }> {
  // a synthesised skeleton for the mouse and gaze hands: fingers away from the eye, palm down; a fist, a point or a hold shapes it
  // the arm comes from the player's right shoulder (below and to the right of the eye), so the sleeve enters the picture from the lower right
  const shoulder = { x: headLocal.x + 0.2, y: headLocal.y - 0.3, z: headLocal.z + 0.06 };
  // fingers a little raised so they do not sink into the felt
  const fwd = new Vector3(input.pos.x - shoulder.x, input.pos.y - shoulder.y + 0.2, input.pos.z - shoulder.z).normalize();
  let forward = { x: fwd.x, y: fwd.y, z: fwd.z };
  let palmNormal = { x: 0, y: -1, z: 0 };
  let to = "default";
  let kTarget = 0;
  if (input.pointRay) {
    forward = { ...input.pointRay.d };
    to = "point";
    kTarget = 1;
  } else if (input.fist) {
    to = "fist";
    kTarget = 1;
  } else if (holding) {
    to = "pinch";
    kTarget = 1;
  }
  const key = `${id}:${to}`;
  const prevK = visK.get(key) ?? 0;
  const k = prevK + (kTarget - prevK) * (1 - Math.exp(-dt * 16));
  visK.set(key, k);
  for (const t of ["fist", "point", "pinch", "default"]) if (t !== to) visK.set(`${id}:${t}`, (visK.get(`${id}:${t}`) ?? 0) * 0.5);
  const wrist = wristForPalm(input.pos, forward, palmNormal, "default");
  const upFix = Math.abs(forward.y) > 0.9 ? { x: 0, y: 0, z: -1 } : palmNormal;
  return synthHand({ wrist, forward, palmNormal: upFix, from: "default", to, k: Math.min(1, Math.max(0, k)), side: "right" });
}

class CheatSeatSystem extends createSystem({}) {
  update(dt: number, time: number): void {
    const nowMs = performance.now();
    if (DEV && lastUpdateAt > 0 && nowMs - lastUpdateAt > 120) {
      // stage F (D15): a long frame and whether new shader programs were made in it (a program compiled at the first sight of a thing stalls the frame)
      const progs = ((world.renderer as unknown as { info: { programs?: unknown[] } }).info.programs ?? []).length;
      const handover = !!world.xrFrame?.session && world.xrFrame.session !== activeSession;
      slog(`long ${handover ? "gap: the page's animation loop hands over to the session's, this is the first session frame" : "frame"} ${(nowMs - lastUpdateAt).toFixed(0)} ms (shader programs ${programsNow} -> ${progs}); last events: ${dbgEvents.slice(-3).join(", ")}`);
    }
    if (DEV && sessGapN < 120 && lastUpdateAt > 0 && world.xrFrame?.session === activeSession) {
      const gap = nowMs - lastUpdateAt;
      sessGapMax = Math.max(sessGapMax, gap);
      sessGapSum += gap;
      if (++sessGapN === 120) slog(`first 120 session frames after the handover: mean gap ${(sessGapSum / 120).toFixed(1)} ms, longest ${sessGapMax.toFixed(0)} ms`);
    }
    lastUpdateAt = nowMs;
    programsNow = ((world.renderer as unknown as { info: { programs?: unknown[] } }).info.programs ?? []).length;
    if (warmPending && placed) {
      warmPending = false;
      warmUp(world.xrFrame ? "headset" : "flat");
    }
    dt = Math.min(dt, 0.05);
    frameAvgMs += (dt * 1000 - frameAvgMs) * 0.05;
    const realDt = dt;
    // the slam's short slow-motion (game/feel.js): time runs at 0.4 for the wind-up and the landing of his hand, then eases back
    dt *= timeScale * slowFactor(game.phase, game.phaseT);
    const xrFrame = world.xrFrame;
    const session = xrFrame?.session;
    if (!firstFrameMarked) {
      // the first update of the system happens with the table, the Shark and the camera already in place: the next animation frame is the first picture
      firstFrameMarked = true;
      requestAnimationFrame(() => performance.mark("cheat-seat-first-frame"));
    }
    if (session && session !== activeSession) {
      activeSession = session;
      sessGapN = 0;
      sessGapMax = 0;
      sessGapSum = 0;
      ui.setXr(true);
      xrInput.attach(session);
      placed = false;
      glassesSession = null; // read again for this session
      resetKeepAnchor(keepAnchor, keepAnchor.handle); // the handle from the last visit stays; the anchor itself is made again for this session
      resetDeskWatch(deskWatch);
      resetHandSourceWatch(handWatch);
      noHand = false;
      audio.watchSession(session, document); // round 8 (Q08, Q13): the audio context is resumed now, on a select, and when the system or page is visible again
      started = false;
      userPaused = false;
      menu.open = false;
      // stage E: the match starts by hand (the green Deal orb). QA runs keep the old automatic start unless ?deal=1 is given.
      menu.waiting = !qaMode || params.has("deal");
      menu.cool = 0.5;
      booth.hint.clear();
      attract.on = false;
      sessionT = 0;
      root.visible = false; // the table is drawn only once it is placed (before, it stood where the flat page had it: a stretched Shark for the first moments)
      ui.hideStart();
      slog(`session start (${session.visibilityState}); ${launchAt > 0 ? `${(nowMs - launchAt).toFixed(0)} ms after the Enter VR click; ` : ""}input sources: ${inputKinds(session).join(",") || "none yet"}`);
      session.addEventListener("inputsourceschange", () => slog(`input sources: ${inputKinds(session).join(",") || "none"}`));
      session.addEventListener("visibilitychange", () => slog(`system visibility: ${session.visibilityState}`));
      session.addEventListener(
        "end",
        () => {
          slog("session end");
          if (activeSession !== session) return;
          activeSession = undefined;
          ui.setXr(false);
          placed = false;
          started = false;
          userPaused = false;
          menu.open = false;
          menu.waiting = false;
          booth.hint.clear();
          root.visible = true;
          hideAllHands();
          // back on the flat page: the start screen returns with its demo (the exit orb ends the session; so does the system)
          ui.showStart();
          attractPending = attractEnabled;
        },
        { once: true },
      );
    }
    paused = document.hidden || (!!session && session.visibilityState !== "visible");
    if (paused !== lastPausedFlag) {
      lastPausedFlag = paused;
      if (session) slog(paused ? "system pause (the system menu or the hand menu gesture opened)" : "system resume");
    }
    audio.setPaused(paused || userPaused);
    if (paused) {
      // a tab in the background still gets its first picture right: the camera goes to the seat before anything else (S1, stage C: with
      // the camera left at the engine's default the hanging lamp sat in the middle of the start view and hid the Shark)
      if (!placed && !session && booth) placeFlat();
      return;
    }
    clock += dt;
    ui.tick(userPaused ? 0 : dt); // the words and stamps run on game time, like the game itself (a slow frame rate slows both)

    // ---- placement
    if (!placed) {
      if (xrFrame && world.xrReferenceSpace) {
        const vp = xrFrame.getViewerPose(world.xrReferenceSpace);
        if (!vp) return;
        const hp = vp.transform.position, ho = vp.transform.orientation;
        q1.set(ho.x, ho.y, ho.z, ho.w);
        const fw = fwV.set(0, 0, -1).applyQuaternion(q1);
        const planes = collectPlanes(xrFrame, world.xrReferenceSpace);
        lastPlanes = planes;
        const horizontal = planes.filter((p) => p.horizontal && !ignorePlanes).map((p) => ({ id: p.id, y: p.y, polygon: p.polygon }));
        const head = { x: hp.x, y: hp.y, z: hp.z };
        const step = deskStep(deskWatch, dt, horizontal, head, { x: fw.x, z: fw.z });
        if (step) applyFrame(step.frame, true);
      } else if (booth) {
        placeFlat();
      }
      if (!placed) return;
    }

    if (attractPending && !session) {
      attractPending = false;
      startAttract();
    }

    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    noHand = session && !injected ? handSourceStep(handWatch, realDt, session.inputSources) : false;
    if (xrFrame && session && world.xrReferenceSpace && glassesSession === null && glassesForced === null) {
      const gvp = xrFrame.getViewerPose(world.xrReferenceSpace);
      const gviews = gvp ? (gvp.views as unknown as { projectionMatrix?: ArrayLike<number> }[]) : null;
      const isG = glassesCall(isGlassesViews(gviews), maskIsGlasses(document));
      glassesViews = gviews ? gviews.map((v) => viewAngles(v.projectionMatrix)) : null;
      if (isG !== null) {
        glassesSession = isG;
        slog(`device view: ${isG ? "Meta VR Glasses (narrow view)" : "wide view"}`);
        if (isG && setGlasses(game, true)) persistKeep();
      }
    }
    if (xrFrame && session && world.xrReferenceSpace && keepAnchor.status === "idle" && !attract.on) {
      // Desk Keep: the spot gets a WebXR anchor on the desk (restored from the last visit's handle, or made now); with no anchor support the saved position relative to the desk stays in charge
      v1.set(game.keep.spot.x, 0, game.keep.spot.z);
      root.localToWorld(v1);
      void startAnchor(keepAnchor, { session, frame: xrFrame, ref: world.xrReferenceSpace, world: { x: v1.x, y: v1.y, z: v1.z }, handle: keepAnchor.handle }).then(() => {
        slog(`keep anchor: ${keepAnchor.status}${keepAnchor.how ? ` (${keepAnchor.how}${keepAnchor.handle ? ", persistent handle" : ", no persistent handle"})` : ""}${keepAnchor.error ? `; ${keepAnchor.error}` : ""}`);
        persistKeep();
      });
    }
    if (xrFrame && world.xrReferenceSpace && Math.floor(time * 2) !== Math.floor((time - realDt) * 2)) {
      lastPlanes = collectPlanes(xrFrame, world.xrReferenceSpace);
      const ap = readAnchor(keepAnchor, xrFrame, world.xrReferenceSpace);
      if (ap) {
        // the anchor is the first choice for where the spot is: its pose, back in table-local metres, if it lies on this desk
        v1.set(ap.x, ap.y, ap.z);
        root.worldToLocal(v1);
        const sp = game.keep.spot;
        keepAnchorLocal = { x: +v1.x.toFixed(3), y: +v1.y.toFixed(3), z: +v1.z.toFixed(3), onDesk: Math.abs(v1.y) < 0.1 && spotOnTable({ x: v1.x, z: v1.z }, game.table) };
        if (Math.abs(v1.y) < 0.1 && spotOnTable({ x: v1.x, z: v1.z }, game.table) && (!game.glasses || frameInGlassesView({ x: v1.x, z: v1.z }, 1)) && (sp.source !== "anchor" || Math.hypot(v1.x - sp.x, v1.z - sp.z) > 0.02)) {
          setKeepSpot(game, { x: v1.x, z: v1.z }, "anchor");
          persistKeep();
        }
      }
      if (deskWatch.virtualShown && !deskWatch.closed) {
        // round 8 (Q01): the table stands on the virtual table; a desk plane that arrives within 20 s moves it onto the desk, once (never in a running match), and says so
        const vp2 = xrFrame.getViewerPose(world.xrReferenceSpace);
        if (vp2) {
          const hp2 = vp2.transform.position, ho2 = vp2.transform.orientation;
          q1.set(ho2.x, ho2.y, ho2.z, ho2.w);
          fwV.set(0, 0, -1).applyQuaternion(q1);
          const horizontal2 = lastPlanes.filter((p) => p.horizontal && !ignorePlanes).map((p) => ({ id: p.id, y: p.y, polygon: p.polygon }));
          const step2 = deskStep(deskWatch, 0.5, horizontal2, { x: hp2.x, y: hp2.y, z: hp2.z }, { x: fwV.x, z: fwV.z }, !started);
          if (step2) {
            applyFrame(step2.frame, true);
            if (step2.line) booth.hint.say(step2.line, "", "gold", 5);
            lastSurfaceKey = "";
            return; // the next frame runs on the new table
          }
        }
      }
      const key = lastPlanes.map((p) => `${p.id}`).join(",");
      if (key !== lastSurfaceKey) {
        lastSurfaceKey = key;
        game.surfaces = buildSurfaces();
      }
    }

    // ---- input: the same HandInput from every device
    const inputs: HandInputT[] = [];
    const joints = new Map<string, Record<string, { x: number; y: number; z: number }>>();
    let head = { pos: { x: 0, y: SEAT.eyeRel, z: SEAT.playerZ }, dir: { x: 0, y: 0, z: -1 } };
    let xrGaze = false;
    let xrRay: { o: { x: number; y: number; z: number }; d: { x: number; y: number; z: number } } | null = null;
    const holdId = game.view?.card?.holderId ?? null;
    if (injected) {
      // a script feeds joint frames (table-local): the same path as the headset's hands, with whatever jitter, delay and dropouts it adds
      const fed = injected.feeder.feed(injected.frame.hands, injected.frame.selecting ?? {}, realDt);
      for (const h of fed.inputs) inputs.push(h);
      for (const [id, j] of fed.joints) joints.set(id, j);
      if (injected.frame.head) head = injected.frame.head;
      else head = { pos: { x: 0, y: game.eyeRel, z: SEAT.playerZ }, dir: { x: 0, y: -0.25, z: -1 } };
      if (!xrFrame) placeFlatCamera({ x: 0, y: game.eyeRel, z: SEAT.playerZ }, { yaw: 0, pitchDown: FLAT.pitchDown }, mouse, aspectOf());
    } else if (xrFrame && world.xrReferenceSpace) {
      const r = xrInput.read(xrFrame, world.xrReferenceSpace, inv, realDt);
      head = { pos: r.head.pos, dir: r.head.dir };
      const gazeMode = forceGaze || (r.hands.length === 0 && r.gaze.has);
      xrGaze = gazeMode;
      if (gazeMode) {
        const ray = r.gaze.has ? { o: r.gaze.o, d: r.gaze.d } : { o: r.head.pos, d: r.head.dir };
        xrRay = ray;
        const h = gazeHand(gazeState, ray, r.selecting, dt);
        inputs.push(h);
        joints.set(h.id, visualJoints(h.id, h, r.head.pos, h.id === holdId, realDt));
      } else {
        for (const h of r.hands) inputs.push(h);
        for (const [id, j] of r.joints) joints.set(id, j);
      }
    } else if (attract.on && ui.starting()) {
      // the start screen's demo: a ghost hand on a script, the camera still (see game/attract.js)
      attract.t += dt;
      const s = sway(clock);
      const headLocal = { x: s.x, y: game.eyeRel + s.y, z: SEAT.playerZ + s.z };
      const pose = { yaw: s.yaw, pitchDown: FLAT.pitchDown + s.pitch };
      attractStep(game, attract.t);
      const a = attractHand(attract.t);
      if (a) {
        const h: HandInputT = { id: "mouse", tracked: true, pos: a.pos, fist: a.fist, pointRay: null };
        inputs.push(h);
        joints.set(h.id, visualJoints(h.id, h, headLocal, h.id === holdId, realDt));
      }
      const b = cameraBasis(pose.yaw, pose.pitchDown);
      head = { pos: headLocal, dir: b.f };
      placeFlatCamera(headLocal, pose, mouse, aspectOf());
      if (attract.t > ATTRACT.loopS) startAttract();
    } else if (webcamOn && webcam.frame()) {
      // flat play with your own hands in front of the laptop camera (opt-in): the tracker's hands go through the same feeder as a headset's, shape only (input/webcam-map.js)
      const wf = webcam.frame()!;
      const fed = webcamFeeder.feed(wf.hands, {});
      for (const h of fed.inputs) inputs.push(h);
      for (const [id, j] of fed.joints) joints.set(id, j);
      const s = sway(clock);
      const headLocal = { x: s.x, y: game.eyeRel + s.y, z: SEAT.playerZ + s.z };
      const pose = { yaw: s.yaw, pitchDown: FLAT.pitchDown + s.pitch };
      const b = cameraBasis(pose.yaw, pose.pitchDown);
      head = { pos: headLocal, dir: b.f };
      placeFlatCamera(headLocal, pose, mouse, aspectOf());
    } else {
      // flat play: first person at eye height with a little sway; the mouse is a hand on a 3D ray from the eye
      const s = sway(clock);
      const headLocal = { x: s.x, y: game.eyeRel + s.y, z: SEAT.playerZ + s.z };
      mouseLook(mouse, realDt);
      mouseTick(mouse, dt); // a quick click keeps its fist (or point) for a moment of game time
      const aspect = aspectOf();
      const cam = { fovY: fovOf(aspect), aspect };
      const pose = { yaw: s.yaw, pitchDown: FLAT.pitchDown + s.pitch };
      const h = mouseHand(mouse, headLocal, pose, cam);
      const b = cameraBasis(pose.yaw + (mouse.lookYaw * Math.PI) / 180, pose.pitchDown + (mouse.lookPitch * Math.PI) / 180);
      head = { pos: headLocal, dir: b.f };
      if (h.tracked) {
        inputs.push(h);
        joints.set(h.id, visualJoints(h.id, h, headLocal, h.id === holdId, realDt));
      }
      placeFlatCamera(headLocal, pose, mouse, aspect);
    }

    // ---- the hands-only pause menu (headset session only): fingertips and pinches, see game/menu.js
    if (xrFrame) {
      const ptrs = pointersFrom(inputs, joints, xrGaze, xrRay);
      menuTips = ptrs.map((p) => p.tip);
      menuPtrs = ptrs.map((p) => ({ id: p.id, tip: p.tip, press: p.press }));
      const r = stepMenu(menu, realDt, ptrs);
      menuFill = r.fill;
      for (const ev of r.events) onMenu(ev);
    }

    // ---- the game (frozen while paused, and for a few frames at a hit)
    const frozen = userPaused || hitStop > 0 || noHand; // round 8 (Q03): no hand source: the match waits until a hand arrives
    if (hitStop > 0 && !userPaused) hitStop--;
    const gdt = frozen ? 0 : dt;
    if (!frozen) {
      if (holdStart && !started) {
        /* QA: the page waits for release() before the match starts */
      } else if (xrFrame && activeSession && !started && !menu.waiting) startGame();
      const events = stepGame(game, gdt, { head, hands: inputs });
      const evs = events.splice(0, events.length);
      for (const e of evs) onGameEvent(e, game.view);
    }
    const view = game.view;
    if (!view) return; // a brand-new game that has not stepped yet (nothing to draw in this frame)

    const seen = `${view.phase}|${view.round}|${view.mode}|${view.look}`;
    if (seen !== lastSeen) { lastSeen = seen; performance.mark("cs:view", { detail: { phase: view.phase, round: view.round, mode: view.mode, look: view.look, buttons: view.buttons, strikes: view.strikes } }); }

    // ---- what you see
    avatar.setView?.(head.pos, booth.occluder); // he sits behind the table's far edge: no body is drawn below your line of sight over it
    if (!frozen) avatar.apply(view.pose, gdt);
    const cuffs = new Map<string, { x: number; y: number; z: number }>();
    for (const [id, j] of joints) {
      let hv = hands.get(id);
      if (!hv) {
        hv = new HandVisual();
        hands.set(id, hv);
        root.add(hv.group);
        warmPending = true; // stage F (D15): its shaders (the hand, the sleeve, the ghost) are compiled now, not at their first sight
      }
      hv.update(j, head);
      cuffs.set(id, hv.cuffPoint(j));
    }
    for (const [id, hv] of hands) if (!joints.has(id)) hv.update(null);
    booth.sync(view, gdt, { head: head.pos, joints, cuffs });
    // stage F: a hand under the table is drawn as a ghost through the table top (it is hidden from him, not gone)
    for (const [id, hv] of hands) hv.setGhost(!!joints.has(id) && view.hands.some((h: any) => h.id === id && h.present && h.under));
    // stage F (D1): while paused the cards stay out of your hands (the pointing hand chooses Resume or Exit; a card stuck to it was the last picture of the take)
    if (userPaused) {
      booth.heldCard.group.visible = false;
      booth.sleeveCard.group.visible = false;
    }
    // stage F: the headset's scoreboard on the table: round, pot, strikes (the flat page has its line at the top left)
    booth.score.update((xrFrame || (qaMode && params.has("board"))) && started ? { round: view.round, rounds: view.rounds, pot: view.pot, you: view.strikes.player, him: view.strikes.shark } : null, head.pos);
    // the SDK draws its own hand models for tracked hands (2 draw calls each); the game draws its own hands, so they are hidden (a draw call saved per model)
    if (xrFrame && (frameN++ % 20 === 0)) world.scene.traverse((o) => { if (o.visible && /handMeshNode$/.test(o.name)) o.visible = false; });
    booth.dim.update(!!xrFrame, userPaused, root);
    // the headset's one plate of words: before the match, the goal (first visit) and how to start; then the line of the lesson you are on (first visit only);
    // result stamps (booth.hint.say, from say() below) go over either, every time
    if (xrFrame) {
      sessionT += realDt;
      const firstVisit = wantPractice || wantCoach || (qaMode && params.has("goal"));
      const xrTip = xrTipNow(view, realDt);
      booth.menu.highlight = xrTip === "c-pause";
      if (userPaused) {
        booth.hint.clear();
      } else if (noHand) {
        booth.hint.set(NO_HAND_LINE);
      } else if (menu.waiting) {
        // stage F: the stakes are on the first plate, under the line that says how to start (the goal is on the start screen; the tips teach the rest)
        booth.hint.set(XR_DEAL, XR_STAKES);
      } else if (firstVisit && qaMode && sessionT < 9 && !view.prompt) {
        booth.hint.set(XR_GOAL);
      } else if (view.prompt && XR_PROMPTS[view.prompt] && (view.coach || (firstVisit && view.practice))) {
        booth.hint.set(XR_PROMPTS[view.prompt]);
      } else if (xrTip) {
        booth.hint.set(XR_PROMPTS[xrTip]);
      } else booth.hint.set(null);
      lastHeadDir = { x: +head.dir.x.toFixed(3), y: +head.dir.y.toFixed(3), z: +head.dir.z.toFixed(3) };
      booth.hint.update(realDt, head.pos, head.dir);
    } else {
      booth.hint.clear();
      booth.hint.update(realDt, head.pos, head.dir);
    }
    booth.menu.group.visible = !!xrFrame;
    if (xrFrame) booth.menu.update(realDt, menu.open, menuFill, head.pos, menuTips, menu.waiting);
    if (!frozen) {
      sound(view, gdt, time);
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].at -= gdt;
        if (timers[i].at <= 0) timers.splice(i, 1)[0].fn();
      }
    }
    pageWords(view, !!xrFrame);
  }
}

/** Stage F: the headset-only tips of the guided first match. The pause pad (D9: it was never introduced) after the first round, and the peek (lean in over the table) from the
 * third round. Each shows once, for a few seconds, and gives way to any tip of the rules. The rules do not know the device, so the page decides these two. */
function xrTipNow(view: any, dt: number): string | null {
  if (!activeSession || !game.coach || !game.coach.tips || userPaused) {
    xrTips.cur = null;
    return null;
  }
  if (xrTips.cur) {
    xrTips.t += dt;
    const over = xrTips.cur === "c-pause" ? xrTips.t > 5.5 : xrTips.t > 9 || !!view.peek || game.peeked || view.phase !== "play" || !!view.stare;
    if (over || view.prompt) {
      xrTips.seen.add(xrTips.cur);
      xrTips.cur = null;
    }
    return xrTips.cur;
  }
  if (view.prompt) return null;
  if (!xrTips.seen.has("c-pause") && xrTips.roundsEnded >= 1 && (view.phase === "dealing" || view.phase === "between")) {
    xrTips.cur = "c-pause";
    xrTips.t = 0;
  } else if (!xrTips.seen.has("c-peek") && xrTips.seen.has("c-pause") && xrTips.roundsEnded >= 2 && view.phase === "play" && view.sharkCard.present && !view.sharkCard.up && view.mode === "watch" && !game.peeked && game.phaseT > 1.5) {
    xrTips.cur = "c-peek";
    xrTips.t = 0;
  }
  return xrTips.cur;
}

/** Stage F (D15): frozen frames of 0.5 to 0.7 s came at the first sight of a thing (the deal, the card in the hand, the result, his glowing cuff): the shader program of a
 * material is compiled the first time it is drawn, and that stalls the frame. Here every material of the scene (hidden ones too: three.js compile walks every object) gets its
 * program, and every texture is sent to the graphics card, once the table is placed (flat page and headset session apart: a headset draws with other settings). */
function warmUp(tag: string): void {
  const r = world.renderer as unknown as { compile: (s: unknown, c: unknown) => void; initTexture: (t: unknown) => void; info: { programs?: unknown[] } };
  const before = (r.info.programs ?? []).length;
  const t0 = performance.now();
  try {
    r.compile(world.scene, world.camera);
    const sent = new Set<unknown>();
    world.scene.traverse((o: any) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms)
        for (const k of ["map", "emissiveMap", "alphaMap", "normalMap"]) {
          const tx = m[k];
          if (tx && !sent.has(tx)) {
            sent.add(tx);
            r.initTexture(tx);
          }
        }
    });
  } catch (e) {
    slog(`warm-up failed: ${String(e)}`);
    return;
  }
  programsNow = (r.info.programs ?? []).length;
  slog(`warm-up (${tag}): ${programsNow - before} new shader programs, ${programsNow} in all, ${(performance.now() - t0).toFixed(0)} ms`);
}

function hideAllHands(): void {
  for (const hv of hands.values()) hv.update(null);
}

// ------------------------------------------------------------------- events
function onGameEvent(e: { type: string; [k: string]: any }, view: any): void {
  // the start screen's demo plays at under half the level of the game (it sits behind the title)
  const A = (name: Parameters<typeof audio.cue>[0], k = 1): void => audio.cue(name, attract.on ? k * 0.4 : k);
  booth.onEvent(e, view);
  performance.mark(`cs:${e.type}`, { detail: { round: view?.round, n: e.n, why: e.why } });
  log(e.type + (e.why ? `:${e.why}` : e.reason ? `:${e.reason}` : ""));
  switch (e.type) {
    case "sleeve": A("snap", 0.4); break;
    case "sharkLay": A("slide", 0.7); break;
    case "deal": A("deal"); break;
    case "grab": A("pinch", 0.8); break;
    case "palm": case "palmUnseen": A("fist"); break;
    case "show": A("open"); break;
    case "swap":
      A("swap");
      handIconSwap = 1.2;
      // the palm lesson's payoff: the sleeve card goes in as yours goes down; the cards turn a moment later
      if (e.payoff) say("Swapped!", "Your sleeve card is on the ring now. It is a better one.", "gold", PAYOFF_HOLD_S + SHOW_AT_S - 0.05);
      // stage F: the cheat of the guided first match, done while he looked at his own card
      else if (e.coach) say("Swapped!", `${cardWordsCap(e.n)} from your sleeve is in your hand. Do not let him see it.`, "gold", 2.4);
      break;
    case "lay": A("lay"); persistKeep(); break;
    // Desk Keep: the next visit shows how many kept cards wait on the spot (a short wordless plate: one dot for each card)
    case "keptCount": A("snap", 0.4); say("●".repeat(e.n).split("").join(" "), "", "gold", 3); break;
    case "keep": A("lay", 0.8); keepTaughtSession = true; persistKeep(); break;
    case "keptPlay": persistKeep(); break;
    case "keptTaken": A("cardFall", 0.8); persistKeep(); break;
    case "keepFull": A("notice", 0.5); break;
    case "dip": if (e.why === "seen") A("notice", 0.8); break;
    case "point":
      A("point");
      A("what");
      mouse.pointMode = false; // point mode is one shot
      // stage F: the look-away pays off in words on the headset plate (the laptop has its button with the count)
      if (activeSession) say("He looks away", `About 2 seconds: cheat now. ${e.n} look-away${e.n === 1 ? "" : "s"} left.`, "good", 2.2);
      break;
    case "pointNothing": case "pointEmpty": case "falseGrab": A("notice"); mouse.pointMode = false; break;
    case "stareStart": A("notice"); A("breath", breathIntensity(0)); break; // starts soft: his breath grows as he leans in (sound())
    case "stareEnd":
      A("exhale");
      // the payoff of the hold-still lesson: he backs off, you are told so (stage D)
      if (game.practice?.step === 2) { say("You held still", "He backs off. He suspects nothing.", "good", 1.9); A("win", 0.7); }
      break;
    case "cheatTell": A("rustle"); break;
    case "peek":
      A("snap", 0.5); // you lean in and his card lifts: the one move only a body can do (stage D)
      // stage F: the payoff in words (the card itself rises and turns to you, bigger)
      say(`You peek: ${cardWords(e.n)}`, "He did not see you. Now you know what to beat.", "good", 2.6);
      break;
    case "peekSeen":
      A("notice", 0.8); // he saw you looking at his card
      say(`You peek: ${cardWords(game.match.sharkCard)}`, "He saw you look. He is suspicious now.", "bad", 2.6);
      break;
    case "roundEnd": if (activeSession) xrTips.roundsEnded++; persistKeep(); break;
    case "coachDone":
      // stage F: the guided rounds are behind you; a later visit starts without tips
      flags.practiceDone = true;
      saveFlags();
      break;
    case "gotcha": {
      A("gotcha");
      A("gasp");
      A("struggle");
      // he fights your hand for about 1.2 s: a grunt and a rattle every 0.3 s while the camera hums
      for (let i = 1; i <= 4; i++) timers.push({ at: i * 0.3, fn: () => A(i % 2 ? "struggle" : "grunt", 0.8 - i * 0.12) });
      kick(0.45);
      flash(0.4, "#e2b85a");
      const b = view.beat;
      say("Caught him!", `He had ${cardWordsOf(b?.card)} up his sleeve. You take the pot. His strike ${game.match.strikes.shark} of 3.`, "good", 3.1);
      throwChips("shark", view);
      hitStopNow(3, 0.06);
      break;
    }
    case "caught": {
      A("freeze");
      A("slowIn");
      break;
    }
    case "glare": A("growl"); break;
    case "laugh": A("laugh"); break;
    case "cardFalls":
      A("cardFall");
      timers.push({ at: 0.5, fn: () => A("cardLand") });
      break;
    case "slamHit": {
      A("boom");
      A("chips");
      kick(1);
      timers.push({ at: 0.1, fn: () => A("slowOut") });
      flash(0.7);
      const m = game.match;
      const b = view.beat;
      const reason = reasonLine(game.log.length ? lastCaughtReason() : "", b?.card);
      say("He saw you!", `${reason} You lose the pot. ${m.penalty?.warned ? "A warning this time, no strike." : `Your strike ${m.strikes.player} of 3.`}`, "bad", 3.1);
      throwChips("player", view);
      hitStopNow(3, 0.09);
      break;
    }
    case "result": {
      // the result beat: both cards are face up on the table, the chips go to the winner, he reacts; the page adds one line
      const line = resultLine(e.shark, e.player, !!e.swapped, !!e.cheated);
      if (e.result === "player") { A("win"); say("You take the pot", line, "good", 2.8); }
      else if (e.result === "shark") { A("low"); say("He takes the pot", line, "bad", 2.8); }
      else say("Same card: the pot stays", line, "gold", 2.8);
      break;
    }
    case "practiceStep": break; // stage D: no centre card for a new lesson (the pips and the one line say it)
    case "practiceAgain": say("Try that lesson again", "No strike in a lesson.", "gold", 1.8); break;
    case "practiceDone": {
      flags.practiceDone = true;
      saveFlags();
      say("Now play for real", "7 rounds. Three strikes lose.", "gold", 3);
      break;
    }
    case "adaptTiming": A("notice", 0.7); say("He's onto your timing.", "He looks back sooner now. Cheat in a different way.", "bad", 2.8); break;
    case "adaptHand": A("notice", 0.7); say(`He's watching your ${e.reason ?? "usual"} hand.`, "A look-away no longer hides it. Try your other hand.", "bad", 2.8); break;
    case "adaptFist": A("notice", 0.7); say("He's watching your fist.", "He sees it close. Close it for less time.", "bad", 2.8); break;
    case "sharkTell": A("rustle", 0.5); break;
    case "matchOver": {
      const win = e.n === "player";
      const lines = matchHabitLines(game.habits);
      const m = game.match;
      const score = `Buttons at the end: you ${m.buttons.player}, him ${m.buttons.shark}. Strikes: you ${m.strikes.player} of 3, him ${m.strikes.shark} of 3.`;
      if (activeSession || attract.on) {
        say(win ? "You win!" : "He wins", `${lines.caught[0] ?? score} ${lines.next}`, win ? "good" : "bad", 10);
        timers.push({ at: 12, fn: () => { newMatch(game); say("Rematch", "He remembers how you cheated. Change it.", "gold", 3); } });
      } else {
        matchEndOpen = true;
        ui.matchEnd({ title: win ? "You win the match" : "He wins the match", result: `${score}`, caught: lines.caught.length ? lines.caught : ["He saw no habit in you."], next: lines.next });
      }
      break;
    }
  }
}

const cardWordsOf = (c: number | null | undefined) => cardWords(c);
const cardWordsCap = (c: number | null | undefined) => { const w = cardWords(c); return w.charAt(0).toUpperCase() + w.slice(1); };
/** Page words and the screen flash exist on the laptop page only; in a headset session the table, the cards, the chips, his face, the
 * light over the table and the sounds say it (the booth does the light, see world/booth.ts), and the one plate in the upper part of the view says the
 * same words (stage E: the slam is always explained). */
const say = (main: string, sub = "", tone: "good" | "bad" | "gold" = "gold", secs = 2): void => {
  if (activeSession) {
    // the headset: the same words on the plate in the upper part of the view (stage E)
    const w = xrStamp(main, sub);
    booth.hint.say(w.main, w.sub, tone, secs + 0.4);
  } else if (!attract.on) ui.stamp(main, sub, tone, secs);
};
const flash = (secs: number, color?: string): void => { if (!activeSession) ui.flash(secs, color); };

/** Judge fix 11: the world freezes for `frames` frames at a hit (the headset too: a freeze of the world only, no camera motion) and the flat camera
 * pushes in `push` metres and eases back (flat play only). */
function hitStopNow(frames: number, push: number): void {
  hitStop = frames;
  if (activeSession) return;
  pushPeak = push;
  pushAt = performance.now() / 1000;
}

/** The pause menu's events (hands only, see game/menu.js). The session log keeps each one for the proof of the hands-only path. */
function onMenu(ev: string): void {
  slog(`menu: ${ev}`);
  log(`menu:${ev}`);
  if (ev === "deal") {
    // the match starts by hand: the frame loop starts it on the next frame (menu.waiting is already false)
    audio.cue("play");
  } else if (ev === "pause") {
    userPaused = true;
    audio.cue("freeze");
  } else if (ev === "resume") {
    userPaused = false;
    game.brain.suspicion = Math.min(game.brain.suspicion, 0.3); // the hand that chose "Resume" is still moving: no unfair stare on the first frame
    audio.cue("open", 0.6);
  } else if (ev === "exit") {
    userPaused = false;
    audio.cue("exhale", 0.5);
    // the session ends after this frame is done: its "end" event may fire inside end(), and the rest of this frame must not run as if the session were still there
    const ending = activeSession;
    setTimeout(() => {
      try {
        void ending?.end();
      } catch {
        /* the session may already be ending */
      }
    }, 0);
  }
}

/** The start screen's demo begins again: a fresh throwaway game (same rules), the table cleared. */
function startAttract(): void {
  attract = { on: true, t: 0, loops: attract.loops + 1 };
  booth.reset();
  timers.length = 0;
  game = createGame({ seed: baseSeed + 101 * attract.loops, level: "normal", eyeRel: SEAT.eyeRel, table: { ...TABLE, polygon: null }, surfaces: [VIRTUAL_ROOM], warn: true, tipPointSeen: true, noKeepCue: true });
  game.surfaces = buildSurfaces();
  startMatch(game);
}

/** Flat play: pause or resume (Esc, or the button at the top right). */
function togglePause(): void {
  if (activeSession || !started || ui.starting()) return;
  userPaused = !userPaused;
  mouse.left = mouse.right = false;
  audio.setPaused(userPaused);
}

function lastCaughtReason(): string {
  for (let i = game.log.length - 1; i >= 0; i--) if (game.log[i].startsWith("caught:")) return game.log[i].slice(7);
  return "";
}

function throwChips(side: "player" | "shark", view: any): void {
  const pen = game.match.penalty;
  if (!pen) return;
  tossRng = createRng(baseSeed + 4242 + view.round * 31);
  booth.buttons.throwOff(tossRng, { pot: true, fineFrom: side, fine: pen.fine, dir: side === "player" ? 1 : -1 }, (x: number, z: number) => onTable(x, z, game.table), -frame.y);
  booth.buttons.onFloorHit = () => audio.cue("clink", 0.9);
  timers.push({
    at: 2.3,
    fn: () => {
      const m = game.match;
      booth.buttons.landThrow({ player: m.buttons.player, shark: m.buttons.shark, pot: m.pot, floor: m.floor });
    },
  });
}

function sound(view: any, dt: number, time: number): void {
  if (attract.on) return; // the demo has no breath or tension tone of its own: the room tone and its stings are enough under the title
  // his breath in the stare: one breath sound at each inhale, louder the closer he leans (faint when he sits back, full across the table); a
  // low tension tone that grows with the lean and with your wobble; a tick for each wobble of your hand
  const b = view.pose.breath;
  const lean = view.pose.torso.lean;
  if (view.stare) {
    const k = breathIntensity(lean);
    if (b > 0.5 && lastBreath <= 0.5) audio.cue("breath", k);
    if (b < 0.5 && lastBreath >= 0.5) audio.cue("exhale", 0.45 + 0.55 * k);
    if (view.tremor > 0.55 && time - lastWobble > 0.22) {
      lastWobble = time;
      audio.cue("wobble", Math.min(1, view.tremor));
    }
  }
  audio.setTension(tensionTarget(!!view.stare, lean, Math.min(1, view.alert ?? 0)));
  lastBreath = b;
  void dt;
}

/** A hit shakes the laptop camera (strength 1 = the slam). No effect in a headset session. */
function kick(peak: number): void {
  if (activeSession) return;
  shakePeak = peak;
  shakeAt = performance.now() / 1000;
}

function pageWords(view: any, xr: boolean): void {
  ui.showPause(userPaused && !xr);
  ui.pauseButton(!xr && started && !ui.starting());
  if (xr || ui.starting()) {
    // the start screen shows its demo's one line ("He stares. Hold still, or he slams your hand."); a headset session shows no page words at all
    ui.prompt(!xr && attract.on ? attractCaption(view) : null);
    ui.hud(null);
    ui.pips(null);
    ui.tremor(null);
    ui.handIcon(null);
    ui.pointButton(false, false);
    return;
  }
  ui.pips(view.practice ? view.practice.step : null);
  const playing = view.phase !== "intro";
  const lesson = view.practice ? { step: view.practice.step, name: view.practice.name } : null;
  ui.hud(playing ? { round: view.round, rounds: view.rounds, pot: view.pot, strikesYou: view.strikes.player, strikesHim: view.strikes.shark, points: view.pointsLeft, lesson, chipsYou: view.buttons.player, chipsHim: view.buttons.shark } : null);
  // the line at the top: the lesson's next step, the one-time tip about pointing, or the hint while point mode is on
  ui.prompt(view.prompt ?? (mouse.pointMode && view.phase === "play" ? "point-mode" : null));
  if (view.tips?.point === "seen" && !flags.pointTipSeen && !qaMode) {
    flags.pointTipSeen = true;
    saveFlags();
  }
  ui.tremor(view.stare ? Math.min(1, view.tremor / 1.4) : null);
  handIconSwap = Math.max(0, handIconSwap - 0.016);
  const under = view.hands.some((h: any) => h.present && h.under);
  ui.handIcon(handIconSwap > 0 ? "swap" : under ? "under" : null);
  // the Point button shows from the real match on (the lessons do not use it); the tip line explains it the first time it helps
  ui.pointButton(playing && !lesson, mouse.pointMode, view.pointsLeft);
}

// ------------------------------------------------------------------ flat camera
function aspectOf(): number {
  const el = world?.renderer?.domElement;
  return el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 16 / 9;
}
function fovOf(aspect: number): number {
  // a tall window (a phone upright) keeps the same width of view
  if (aspect >= 1) return FLAT.fovY;
  const half = (FLAT.fovY * Math.PI) / 360;
  return Math.min(100, (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI);
}
function fitFlatCamera(): void {
  const cam = world?.camera as { fov?: number; updateProjectionMatrix?: () => void } | undefined;
  if (!cam || cam.fov === undefined || !cam.updateProjectionMatrix) return;
  const f = DEV && freeCam ? freeCam.fov : fovOf(aspectOf());
  if (Math.abs(cam.fov - f) > 0.05) {
    cam.fov = f;
    cam.updateProjectionMatrix();
  }
}
function placeFlatCamera(headLocal: { x: number; y: number; z: number }, pose: { yaw: number; pitchDown: number }, m: MouseState, aspect: number): void {
  const cam = world.camera;
  fitFlatCamera();
  void aspect;
  const now = performance.now() / 1000;
  const sh = activeSession ? null : shakeOffset(now, shakeAmp(now - shakeAt, shakePeak));
  v1.set(headLocal.x + (sh?.x ?? 0), headLocal.y + (sh?.y ?? 0), headLocal.z + (sh?.z ?? 0));
  root.localToWorld(v1);
  cam.position.copy(v1);
  const e = new Euler(-(pose.pitchDown + (m.lookPitch * Math.PI) / 180) + (sh?.pitch ?? 0), -(pose.yaw + (m.lookYaw * Math.PI) / 180) + (sh?.yaw ?? 0), sh?.roll ?? 0, "YXZ");
  cam.quaternion.copy(root.quaternion).multiply(q1.setFromEuler(e));
  // the push at a hit: in 0.1 s the camera moves forward `pushPeak` metres, holds, and eases back by 0.7 s (flat play only)
  if (!activeSession && pushPeak > 0) {
    const pt = now - pushAt;
    const k = pt < 0 ? 0 : pt < 0.1 ? pt / 0.1 : pt < 0.7 ? 1 - Math.pow((pt - 0.1) / 0.6, 1.6) : 0;
    if (k > 0) cam.position.addScaledVector(v1.set(0, 0, -1).applyQuaternion(cam.quaternion), pushPeak * k);
  }
  if (DEV && freeCam) {
    // QA picture tool: a camera anywhere in table-local space (a headset-like view of the art)
    v1.set(freeCam.pos.x, freeCam.pos.y, freeCam.pos.z);
    root.localToWorld(v1);
    cam.position.copy(v1);
    v1.set(freeCam.look.x, freeCam.look.y, freeCam.look.z);
    root.localToWorld(v1);
    cam.lookAt(v1);
  }
}

// --------------------------------------------------------------------- start
function startGame(): void {
  if (started) return;
  if (attract.on) {
    // the start screen's demo ends: a clean table and the real game (its practice rounds), whoever starts it (the Play button, or a QA call)
    attract.on = false;
    pushPeak = 0;
    hitStop = 0;
    timers.length = 0;
    placeFlat();
    booth.reset();
  }
  started = true;
  holdStart = false;
  ui.hideStart();
  void audio.start();
  audio.setMusic(true);
  booth.showSeat(null);
  startMatch(game);
  log("match started");
  slog("match started");
}

// ------------------------------------------------------------------ debug state
function snapshot() {
  const v = game.view;
  const pos = root.position;
  return {
    qaMode, seed: baseSeed, clock: +clock.toFixed(2), timeScale, placed, planeFound, started,
    table: { x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), z: +pos.z.toFixed(3), yaw: +root.rotation.y.toFixed(3), eyeRel: game.eyeRel, seatFar: frame.seatFar },
    qaCalls, plate: booth?.hint?.shown ?? "",
    // stage F (QA reads): the surfaces of the room the rules know (detected planes as discs, or the virtual room box), table-local, for a script that points at one
    surfaces: (game.surfaces ?? []).map((s: any) => (s.type === "disc" ? { type: "disc", c: { x: +s.c.x.toFixed(2), y: +s.c.y.toFixed(2), z: +s.c.z.toFixed(2) }, n: { x: +s.n.x.toFixed(2), y: +s.n.y.toFixed(2), z: +s.n.z.toFixed(2) }, r: +s.r.toFixed(2) } : { type: s.type })), score: booth?.score?.shown ?? "", xrTip: xrTips.cur, coach: game.coach ? { tip: game.coach.tip, tips: game.coach.tips, script: game.coach.script, done: { ...game.coach.done }, finished: !!(game.coach as any).finished, seen: Object.keys(game.coach.seen) } : null, programs: programsNow, wantCoach, plateAt: booth?.hint?.debug?.(), headDir: lastHeadDir, webcam: { ...webcam.state(), on: webcamOn },
    session: !!activeSession, paused, userPaused, gameClock: +game.clock.toFixed(3), attract: { on: attract.on, t: +attract.t.toFixed(2), loops: attract.loops },
    menu: { open: menu.open, waiting: menu.waiting, fill: menuFill, pointers: menuPtrs.map((p) => ({ id: p.id, press: p.press, tip: p.tip ? { x: +p.tip.x.toFixed(3), y: +p.tip.y.toFixed(3), z: +p.tip.z.toFixed(3) } : null })) },
    sessionLog: sessionLog.slice(),
    phase: v?.phase ?? "intro", round: v?.round ?? 1, mode: v?.mode, stare: v?.stare, look: v?.look,
    suspicion: +(v?.suspicion ?? 0).toFixed(3), alert: +(v?.alert ?? 0).toFixed(3), tremor: +(v?.tremor ?? 0).toFixed(2),
    glassesDevice: { detected: glassesSession, forced: glassesForced, views: glassesViews, inputs: activeSession ? inputKinds(activeSession) : null, blend: activeSession ? (activeSession as XRSession).environmentBlendMode : null }, keep: v?.kept, deskPoly: (game.table as any).polygon ? (game.table as any).polygon.map((q: any) => ({ x: +q.x.toFixed(3), z: +q.z.toFixed(3) })) : null, keepAnchor: { status: keepAnchor.status, how: keepAnchor.how, persistent: !!keepAnchor.handle, read: keepAnchor.read, local: keepAnchorLocal, error: keepAnchor.error }, card: v?.card, sharkCard: v?.sharkCard, sleeve: v?.sleeve, evidence: v?.evidence, cheat: v?.cheat, grabT: +(v?.grabT ?? 0).toFixed(2),
    strikes: v?.strikes, pointsLeft: v?.pointsLeft, pot: v?.pot, buttons: v?.buttons, floor: v?.floor, winner: v?.winner, result: v?.result,
    practice: v?.practice, prompt: v?.prompt, cue: v?.cue,
    hands: v?.hands?.map((h: any) => ({ ...h, pos: { x: +h.pos.x.toFixed(3), y: +h.pos.y.toFixed(3), z: +h.pos.z.toFixed(3) }, speed: +h.speed.toFixed(3) })),
    shark: v ? { head: v.pose.head.pos, wristR: v.pose.handR.wrist, modeR: v.pose.handR.mode, wristL: v.pose.handL.wrist, modeL: v.pose.handL.mode, dipR: +v.pose.dipR.toFixed(2), lean: +v.pose.torso.lean.toFixed(2), sight: v.pose.sight } : null,
    match: { phase: game.match.phase, buttons: { ...game.match.buttons }, pot: game.match.pot, floor: game.match.floor, strikes: { ...game.match.strikes }, deck: game.match.deck.length, playerCard: game.match.playerCard, playerHeld: game.match.playerHeld, sharkCard: game.match.sharkCard, hatCard: game.match.hatCard, sleeveCard: game.match.stash.wristR, dealtCard: game.match.dealtCard, history: game.match.history.map((h) => ({ ...h })) },
    log: game.log.slice(-80), events: dbgEvents.slice(-20),
    cards3d: booth ? { held: { v: booth.heldCard.group.visible, p: booth.heldCard.group.position.toArray().map((n) => +n.toFixed(3)), s: booth.heldCard.group.scale.x }, player: { v: booth.playerCard.group.visible, p: booth.playerCard.group.position.toArray().map((n) => +n.toFixed(3)) }, sleeve: { v: booth.sleeveCard.group.visible, p: booth.sleeveCard.group.position.toArray().map((n) => +n.toFixed(3)) } } : null,
    ui: ui.state(), frameAvgMs: +frameAvgMs.toFixed(1),
    mouse: mouse ? { ndcX: +mouse.ndcX.toFixed(3), ndcY: +mouse.ndcY.toFixed(3), factor: +mouse.factor.toFixed(3), left: mouse.left, right: mouse.right, pointMode: mouse.pointMode, lookYaw: +mouse.lookYaw.toFixed(1), lookPitch: +mouse.lookPitch.toFixed(1) } : null,
    flags: { ...flags }, wantPractice,
  };
}

/** QA only: set-up for scenarios (never used to prove a move; hands, head and mouse do that). */
function qaApi() {
  const api = {
    release: () => {
      holdStart = false;
      return true;
    },
    /** Feed one joint frame (table-local): { head?: {pos, dir}, hands: { left?: joints|null, right?: joints|null }, selecting? }. A null hand is a tracking dropout. */
    feed: (frame: NonNullable<typeof injected>["frame"]) => {
      if (!injected) injected = { frame, feeder: createHandsFeeder() };
      else injected.frame = frame;
      return true;
    },
    /** Stop feeding: the headset or the mouse drives the hands again. */
    stopFeed: () => {
      injected = null;
      return true;
    },
    start: () => {
      startGame();
      return true;
    },
    timeScale: (k: number) => {
      timeScale = Math.max(0.05, Math.min(4, k));
      return timeScale;
    },
    /** QA: how long a round may last before it ends by itself (seconds of game time); the emulator's hand commands are slow on a busy Mac. */
    roundTimeout: (secs: number) => {
      game.tuning = { ...game.tuning, roundTimeoutS: secs };
      return secs;
    },
    calm: (on: boolean) => {
      game.qa.calm = on;
      return on;
    },
    sway: (on: boolean) => {
      swayOn = on;
      return on;
    },
    arrange: (o: { player?: number; shark?: number; sleeve?: number; hat?: number }) => {
      arrange(game, o);
      return true;
    },
    forceCheat: () => {
      forceCheat(game);
      return true;
    },
    /** { suspicion?, plan?: {at, window?}, script? } */
    brain: (o: { suspicion?: number; plan?: { at: number; window?: number } | null; script?: unknown; holdStare?: number }) => {
      if (o.suspicion !== undefined) game.brain.suspicion = o.suspicion;
      if (o.holdStare !== undefined) game.brain.holdStare = o.holdStare;
      if (o.plan !== undefined) game.brain.plan = o.plan;
      if (o.script !== undefined) game.brain.script = o.script;
      return true;
    },
    level: (id: string) => {
      flags.level = levelId(id);
      return flags.level;
    },
    noise: (sigma: number) => {
      xrInput.noise.sigma = sigma;
      return sigma;
    },
    newMatch: () => {
      newMatch(game);
      return true;
    },
    /** QA (Desk Keep): put exactly these cards on the keep spot (at most two); saved like a real keep. Returns what is on the spot. */
    keptSet: (cards: number[]) => {
      const r = setKept(game, cards);
      persistKeep();
      return r;
    },
    /** QA (Desk Keep): the cards on the spot, where the spot is and from what (anchor, saved, default), the cone dwell meter, the anchor's state, whether storage failed. */
    keptGet: () => ({ cards: [...game.match.kept], spot: { x: game.keep.spot.x, z: game.keep.spot.z, source: game.keep.spot.source }, meter: +game.keep.meter.toFixed(3), anchor: { status: keepAnchor.status, how: keepAnchor.how, persistent: !!keepAnchor.handle, error: keepAnchor.error }, storageFailed: keepStore.failed }),
    /** QA: the sounds asked for so far (real seconds), the tension level now, and the camera (world position, and rotation about x, y, z in radians). */
    cues: (clear = false) => { const c = cueLog.slice(); if (clear) cueLog.length = 0; return c; },
    tension: () => tensionNow,
    camera: () => { const c = world.camera; return { x: c.position.x, y: c.position.y, z: c.position.z, rx: c.rotation.x, ry: c.rotation.y, rz: c.rotation.z, t: +(performance.now() / 1000).toFixed(3) }; },
    clock: () => ({ game: +clock.toFixed(3), real: +(performance.now() / 1000).toFixed(3) }),
    /** QA: jump to lesson n (1 to 4) of the practice rounds and restart its round (a game started with ?practice=1). */
    lesson: (n: number) => {
      if (!game.practice) return false;
      game.practice.step = Math.max(1, Math.min(4, n));
      game.practice.done = false;
      game.started = false;
      startMatch(game);
      return true;
    },
    /** QA: what the scene costs and holds (bench part B5): meshes, lights, shadow casters, geometry and texture counts, heap in MB when the browser says. */
    scene: () => {
      let meshes = 0, lights = 0, shadowCasters = 0, shadowLights = 0, visibleMeshes = 0;
      const geos = new Set<unknown>(), mats = new Set<unknown>();
      world.scene.traverse((o: any) => {
        if (o.isMesh) { meshes++; if (o.visible) visibleMeshes++; if (o.castShadow) shadowCasters++; geos.add(o.geometry); mats.add(o.material); }
        if (o.isLight) { lights++; if (o.castShadow) shadowLights++; }
      });
      const r = world.renderer.info;
      const mem = (performance as any).memory;
      // stage D: which meshes are drawn now (deep visibility), by name and how many materials each costs, for the draw call budget
      const drawn: Record<string, number> = {};
      world.scene.traverse((o: any) => {
        if (!o.isMesh) return;
        for (let n: any = o; n; n = n.parent) if (n.visible === false) return;
        const key = `${o.name || o.parent?.name || o.geometry?.type || "mesh"}`;
        drawn[key] = (drawn[key] ?? 0) + (Array.isArray(o.material) ? o.material.length : 1);
      });
      return { drawn, meshes, visibleMeshes, lights, shadowCasters, shadowLights, geometries: geos.size, materials: mats.size, rendererGeometries: r.memory.geometries, rendererTextures: r.memory.textures, heapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null };
    },
    /** QA (stage E): a free camera for pictures of the art in flat play: a table-local position, a table-local point to look at, and a vertical field of view (null: back to the seat). */
    freeCam: (o: { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number }; fov: number } | null) => {
      freeCam = o;
      return true;
    },
    /** QA (stage E): act as the hand tracker: give the landmark results of one camera picture ({landmarks, worldLandmarks}); they go through the same mapper and feeder as the camera's. */
    webcamFeed: (results: { landmarks?: { x: number; y: number; z: number }[][]; worldLandmarks?: { x: number; y: number; z: number }[][] } | null) => {
      webcamOn = true;
      ui.setWebcamWords(true);
      webcam.feedResults(results);
      return true;
    },
    /** QA: the shortest distance (metres) from the player's head to any vertex of the Shark's skinned mesh right now (bench part B6, comfort). */
    sharkNearest: () => {
      const head = new Vector3();
      const hp = game.head.pos;
      head.set(hp.x, hp.y, hp.z);
      root.localToWorld(head);
      let best = Infinity;
      const tmp = new Vector3();
      avatar.root.traverse((o: any) => {
        if (!o.isSkinnedMesh) return;
        o.skeleton.update();
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) {
          o.getVertexPosition(i, tmp);
          tmp.applyMatrix4(o.matrixWorld);
          const d = tmp.distanceTo(head);
          if (d < best) best = d;
        }
      });
      return +best.toFixed(4);
    },
    /** QA: where his head centre is and how far it is from the player's head (metres). */
    sharkHeadDistance: () => {
      const p = game.view?.pose.head.pos;
      const h = game.head.pos;
      return p ? +Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z).toFixed(4) : null;
    },
    /** Client pixel of a table-local point (flat play: where a mouse move must go) and the wheel depth that puts the hand there. */
    mouseAt: (x: number, y: number, z: number) => {
      const aspect = aspectOf();
      const s = sway(clock);
      const head = { x: s.x, y: game.eyeRel + s.y, z: SEAT.playerZ + s.z };
      const c = mouseFor({ x, y, z }, head, { yaw: s.yaw, pitchDown: FLAT.pitchDown + s.pitch }, { fovY: fovOf(aspect), aspect }, mouse.lookYaw, mouse.lookPitch);
      return { ...ndcToClient(world.renderer.domElement, c.ndcX, c.ndcY), factor: +c.factor.toFixed(3), ndcX: c.ndcX, ndcY: c.ndcY };
    },
    /** Set the wheel factor (the wheel itself is a real input; a script that cannot send wheel events uses this). */
    factor: (f: number) => {
      mouse.factor = Math.max(0.55, Math.min(1.9, f));
      return mouse.factor;
    },
    pointMode: (on: boolean) => {
      mouse.pointMode = on;
      return on;
    },
    /** Client pixel of a table-local point as the camera sees it (for pictures and for finding things on the page). */
    project: (x: number, y: number, z: number) => {
      v1.set(x, y, z);
      root.localToWorld(v1);
      v1.project(world.camera);
      return ndcToClient(world.renderer.domElement, v1.x, v1.y);
    },
  };
  // stage E: count every call a script makes into the page (the proof log of a hands-only run must show 0)
  const wrapped: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(api)) wrapped[k] = (...a: unknown[]) => { qaCalls++; return (f as (...x: unknown[]) => unknown)(...a); };
  return wrapped as typeof api;
}

// -------------------------------------------------------------------- setup
function setup(w: World): void {
  world = w;
  booth = new Booth();
  root.add(booth.group);
  root.visible = true;
  world.createTransformEntity(root);
  // round 8b (Q02, Q15): Cheat Seat is hands only. The SDK has no option to switch controller models off, so the two controller visual adapters do not load them: the
  // meta-quest-touch-plus left.glb and right.glb carry two 2048 x 2048 textures whose upload (about 40 ms each) stalled the first frames after the Enter VR click. Pointer and select events do not use these models.
  for (const side of ["left", "right"] as const) {
    (world.input.visualAdapters.controller[side] as unknown as { connectVisual: () => void }).connectVisual = () => {};
  }
  mouse = attachMouse(world.renderer.domElement, () => {
    void audio.start();
  }, () => {
    if (!mouse.pointMode) togglePause();
  });
  placeFlat(); // builds the avatar too; the first frame already has the seat's view (a session replaces it at once)
  // round 8 (Q02, Q15): both hands are built now, hidden, so their shaders and textures are warmed before the Enter VR click (a hand built at its first sight in the session stalled the first headset frames)
  for (const id of ["left", "right"]) {
    const hv = new HandVisual();
    hv.update(null);
    hands.set(id, hv);
    root.add(hv.group);
  }
  warmPending = true;
  applyXrQuality(world.renderer.xr); // round 8 (Q06, Q14): fixed foveation and render scale, set before any session
  ui.onPointButton(() => {
    mouse.pointMode = !mouse.pointMode;
  });
  ui.onPause(togglePause);
  // stage F: the tips of the guided first match are skippable (the round never waits for them)
  const skipBtn = document.getElementById("btn-skip") as HTMLButtonElement | null;
  const tipsOff = () => {
    setTips(game, false);
    flags.tipsOff = true;
    saveFlags();
    if (skipBtn) { skipBtn.disabled = true; skipBtn.textContent = "Lesson skipped"; }
  };
  ui.onTipsOff(tipsOff);
  if (skipBtn) {
    skipBtn.hidden = !wantCoach || flags.tipsOff;
    skipBtn.addEventListener("click", tipsOff);
  }
  ui.onResume(togglePause);
  ui.onRematch(rematch);
  window.addEventListener("keydown", (ev) => { if (matchEndOpen && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); rematch(); } });
  // sound (stage D): the room tone and its small sounds are always on once the audio runs; if the browser lets it run before a click, it does
  audio.setRoom(true);
  if (audio.autoStart() && !introPlayed) {
    introPlayed = true;
    audio.cue("intro");
  }
  performance.mark("cheat-seat-table-ready");
  ui.setReady(true);
  if (attractEnabled) startAttract();
  world.registerSystem(CheatSeatSystem);
  if (DEV) {
    Object.defineProperty(window, "cheatDebug", { configurable: true, get: snapshot });
    Object.defineProperty(window, "cheatQa", { configurable: true, value: qaApi() });
  }
  (window as unknown as { cheatAudio?: MediaStream | null }).cheatAudio = null;
}

World.create(document.getElementById("scene-container")!, options)
  .then(setup)
  .catch((e) => {
    const n = document.querySelector<HTMLElement>("#notice");
    if (n) n.textContent = `Could not start: ${e.message}`;
    console.error(e);
  });

// The start screen: two buttons. "Play with mouse" starts flat play. "Enter VR (best experience)" starts the headset session.
ui.onMouse(() => {
  if (!placed) return;
  introPlayed = true;
  void audio.start().then(() => {
    audio.setRoom(true);
    audio.cue("play"); // the Play click's sting
  });
  startGame(); // ends the demo (if it runs) and begins the real game
});
// Stage E: "Play with your hands (webcam)" (opt-in). It asks for the camera, loads the tracker from this site, then starts the same flat game; the mouse keeps working and takes over
// whenever no hand is seen. Any failure leaves the page as it was (plain words, the mouse path).
ui.onCam(() => {
  if (!placed || webcamOn) return;
  introPlayed = true;
  ui.camBusy(true);
  ui.camBox(true);
  void webcam
    .start()
    .then(() => {
      webcamOn = true;
      ui.setWebcamWords(true);
      void audio.start().then(() => {
        audio.setRoom(true);
        audio.cue("play");
      });
      startGame();
    })
    .catch(() => {
      ui.camBox(true); // the box shows the plain sentence; the start screen's note says it too
    })
    .finally(() => ui.camBusy(false));
});
ui.onCamStop(() => {
  webcam.stop();
  webcamOn = false;
  ui.setWebcamWords(false);
  ui.camBox(false);
  ui.camStatus("");
});
let xrSupported = false;
void (async () => {
  try {
    xrSupported = !!navigator.xr && (await navigator.xr.isSessionSupported("immersive-ar"));
  } catch {
    xrSupported = false;
  }
  ui.setVrAvailable(xrSupported);
})();
let introPlayed = false;
/** The first press or key anywhere starts the sound (browsers keep it off until then). On the start screen, off the buttons, it also plays the start screen's sting. */
function firstGesture(e: Event): void {
  const onButton = !!(e.target as Element | null)?.closest?.("#btn-mouse, #btn-vr");
  void audio.start().then(() => {
    audio.setRoom(true);
    if (ui.starting() && !onButton && !introPlayed) {
      introPlayed = true;
      audio.cue("intro");
    }
  });
}
onAnyGesture(firstGesture);
// round 8 (Q07): the session request is the first thing the click does, in the same task (input/xr-enter.js); the button is off until the table is ready (flat-ui.ts setReady)
const enterVr = createEnterVr({
  getWorld: () => world,
  begin: () => {
    launchAt = performance.now();
  },
  startAudio: () => {
    void audio.start().then(() => {
      (window as unknown as { cheatAudio?: MediaStream | null }).cheatAudio = audio.stream;
      audio.setRoom(true);
      introPlayed = true;
      audio.cue("play");
    });
  },
  say: (t) => ui.camStatus(t),
});
ui.onVr(() => void enterVr.click());
// QA: the emulator enters the session by itself (xr enter); the page's own sound needs a click, so QA starts it on the first click.
if (qaMode) onFirstPointer(() => void audio.start());
