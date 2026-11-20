/** Webcam hands (stage E, judge item 9): an opt-in way to play the flat page with your own hands in front of a laptop camera. The mouse stays the default; this starts only when the
 * player presses "Play with your hands (webcam)". It is NEVER the headset path and is never presented as headset proof.
 *
 * The tracker is MediaPipe HandLandmarker (@mediapipe/tasks-vision, Apache-2.0). Its code, its WASM and its model are served from this site (public/mediapipe/): nothing is loaded from
 * a CDN, and the pictures from the camera are processed in this page only: no frame is stored, recorded, uploaded or sent anywhere (no network request is made with a picture; the
 * small preview is drawn on a canvas and thrown away every frame). Landmarks are mapped to the game's own hand input by input/webcam-map.js (shape only: fist, open, point, still;
 * never depth from the size of the hand). Stopping the camera ends every track and frees the model. */
import { createWebcamMapper } from "./webcam-map.js";

type Joints = Record<string, { x: number; y: number; z: number }>;
export interface WebcamFrame { hands: { left: Joints | null; right: Joints | null }; seen: number; t: number }
export interface WebcamState { on: boolean; loading: boolean; error: string | null; hands: number; fps: number; frames: number; delegate: string; step: string }

const BASE = "./mediapipe";
/** The finger bones drawn on the small preview (landmark indices). */
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

export function createWebcamHands(hooks: { preview?: HTMLCanvasElement | null; status?: (text: string) => void }) {
  const mapper = createWebcamMapper();
  const st: WebcamState = { on: false, loading: false, error: null, hands: 0, fps: 0, frames: 0, delegate: "", step: "" };
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let landmarker: { detectForVideo(v: HTMLVideoElement, t: number): { landmarks: { x: number; y: number; z: number }[][]; worldLandmarks: { x: number; y: number; z: number }[][] }; close(): void } | null = null;
  let raf = 0;
  let latest: WebcamFrame | null = null;
  let lastVideoTime = -1;
  let fpsCount = 0, fpsAt = 0;
  let stopped = true;
  const say = (step: string): void => { st.step = step; hooks.status?.(step); };

  function draw(lm: { x: number; y: number }[][]): void {
    const c = hooks.preview;
    if (!c || !video) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width, h = c.height;
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // mirrored, like a selfie: your right is on the right
    ctx.drawImage(video, 0, 0, w, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e2b85a";
    ctx.fillStyle = "#fff6e0";
    for (const L of lm) {
      ctx.beginPath();
      for (const [a, b] of BONES) { ctx.moveTo(L[a].x * w, L[a].y * h); ctx.lineTo(L[b].x * w, L[b].y * h); }
      ctx.stroke();
      for (const p of L) ctx.fillRect(p.x * w - 1.5, p.y * h - 1.5, 3, 3);
    }
    ctx.restore();
  }

  function loop(): void {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (!video || !landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const now = performance.now();
    let res;
    try {
      res = landmarker.detectForVideo(video, now);
    } catch (e) {
      st.error = `The hand tracker stopped: ${(e as Error).message}`;
      say(st.error);
      stop();
      return;
    }
    const m = mapper.update(res, now);
    latest = { hands: m.hands, seen: m.seen, t: now };
    st.hands = m.seen;
    st.frames++;
    fpsCount++;
    if (now - fpsAt > 1000) { st.fps = Math.round((fpsCount * 1000) / (now - fpsAt)); fpsCount = 0; fpsAt = now; }
    if (st.frames % 2 === 0) draw(res.landmarks);
  }

  /** Ask for the camera, load the tracker from this site, and start. Rejects with a short plain sentence on any failure (the mouse still works). */
  async function start(): Promise<void> {
    if (st.on || st.loading) return;
    st.loading = true;
    st.error = null;
    stopped = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot use a camera on this page.");
      say("Asking for the camera...");
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
      video = document.createElement("video");
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      say("Loading hand tracking from this site (about 22 MB, once)...");
      const vision = await import("@mediapipe/tasks-vision");
      const files = await vision.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
      const make = (delegate: "GPU" | "CPU") =>
        vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}/hand_landmarker.task`, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        landmarker = (await make("GPU")) as unknown as typeof landmarker;
        st.delegate = "GPU";
      } catch {
        landmarker = (await make("CPU")) as unknown as typeof landmarker;
        st.delegate = "CPU";
      }
      mapper.reset();
      st.on = true;
      fpsAt = performance.now();
      say("Hold one hand in front of the camera. Nothing is recorded or sent.");
      raf = requestAnimationFrame(loop);
    } catch (e) {
      const err = e as Error & { name?: string };
      st.error = err.name === "NotAllowedError" || err.name === "SecurityError" ? "The camera was not allowed. The mouse works as before." : err.name === "NotFoundError" ? "No camera was found. The mouse works as before." : `The camera could not start (${err.message}). The mouse works as before.`;
      say(st.error);
      stop();
      throw new Error(st.error);
    } finally {
      st.loading = false;
    }
  }

  function stop(): void {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) { video.pause(); video.srcObject = null; video = null; }
    try { landmarker?.close(); } catch { /* already closed */ }
    landmarker = null;
    mapper.reset();
    latest = null;
    st.on = false;
    st.hands = 0;
    const c = hooks.preview;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }

  return {
    start,
    stop,
    state: (): WebcamState => ({ ...st }),
    /** The newest hands, or null if the camera has not seen a hand for half a second (then the mouse drives, as always). */
    frame(): WebcamFrame | null {
      if (!st.on || !latest) return null;
      if (performance.now() - latest.t > 500) return null;
      return latest.hands.left || latest.hands.right ? latest : null;
    },
    /** QA (dev builds): feed the tracker's results by hand (no camera, no model), through the same mapper. */
    feedResults(results: Parameters<typeof mapper.update>[0], nowMs = performance.now()): void {
      const m = mapper.update(results, nowMs);
      latest = { hands: m.hands, seen: m.seen, t: nowMs };
      st.on = true;
      stopped = true; // no loop of its own
      st.hands = m.seen;
    },
  };
}
