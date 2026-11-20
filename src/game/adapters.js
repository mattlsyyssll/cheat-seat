/** Input adapters (pure): the headset's hands, Glasses gaze-and-pinch and the mouse all turn into the SAME thing for the rules:
 *   HandInput = { id, tracked, pos (the palm, table-local 3D), fist, pinch, pointRay }   plus the player's head.
 * Nothing about a device, a cursor or a pixel reaches game/duel.js. The mouse adapter turns a cursor into a 3D ray from the eye and
 * puts the hand on that ray at the depth set by the mouse wheel; "under the table" means that 3D hand is below the table top.
 * Camera: first person at eye height; the mouse near the screen edges turns the head a little. All maths here is plain numbers. */
import { classifyHand } from "./pose.js";
import { TABLE } from "./booth.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{id:string, tracked:boolean, pos:V3, fist:boolean, pinch?:boolean, pointRay:{o:V3,d:V3}|null}} HandInput */

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unit = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// ----------------------------------------------------------------------- headset hands
/** One tracked hand from its joints (table-local). `prev` is the last result for this hand (hysteresis).
 * @param {string} id @param {Record<string,V3>} joints @param {ReturnType<typeof classifyHand>|null} prev
 * @returns {{input:HandInput, cls:ReturnType<typeof classifyHand>}} */
export function handFromJoints(id, joints, prev = null, dt = 0) {
  const cls = classifyHand(joints, prev, dt);
  return { input: { id, tracked: true, pos: cls.palm, fist: cls.fist, pinch: cls.pinch, pointRay: cls.pointRay }, cls };
}

/**
 * THE ONE FUNCTION THAT TAKES JOINT FRAMES. The headset adapter, a replay of recorded hand motion and a webcam-driven simulation all
 * feed the rules through this: each frame gives the joints of each hand that is tracked (table-local metres, 25 joints named as in
 * pose.js) or null/missing for a hand whose tracking is lost. A hand that goes missing becomes `tracked: false`; the rules treat a
 * hand lost low or going down as under the table (a real headset cannot see below a desk edge) and carry on when it returns.
 * @returns {{feed:(hands:Record<string, Record<string,V3>|null|undefined>, selecting?:Record<string,boolean>, dt?:number)=>{inputs:HandInput[], joints:Map<string,Record<string,V3>>}}} */
export function createHandsFeeder() {
  /** @type {Map<string, ReturnType<typeof classifyHand>>} */
  const prev = new Map();
  const known = new Set();
  return {
    feed(hands, selecting = {}, dt = 0) {
      /** @type {HandInput[]} */
      const inputs = [];
      const joints = new Map();
      for (const id of new Set([...known, ...Object.keys(hands)])) {
        const j = hands[id];
        if (!j) {
          inputs.push({ id, tracked: false, pos: { x: 0, y: 0, z: 0 }, fist: false, pinch: false, pointRay: null });
          continue;
        }
        known.add(id);
        const { input, cls } = handFromJoints(id, j, prev.get(id) ?? null, dt);
        prev.set(id, cls);
        inputs.push({ ...input, pinch: !!input.pinch || (!!selecting[id] && !input.fist) });
        joints.set(id, j);
      }
      return { inputs, joints };
    },
  };
}

// ------------------------------------------------------------------------- the camera
/** The camera looks along -z (toward the Shark). Yaw turns toward +x; pitch is looking DOWN, in radians.
 * @param {number} yaw @param {number} pitchDown @returns {{f:V3, r:V3, u:V3}} */
export function cameraBasis(yaw, pitchDown) {
  const f = { x: Math.sin(yaw) * Math.cos(pitchDown), y: -Math.sin(pitchDown), z: -Math.cos(yaw) * Math.cos(pitchDown) };
  const r = unit({ x: Math.cos(yaw), y: 0, z: Math.sin(yaw) });
  const u = unit(cross(r, f));
  // make sure up points up
  return u.y < 0 ? { f, r, u: { x: -u.x, y: -u.y, z: -u.z } } : { f, r, u };
}

// ----------------------------------------------------------------------------- mouse
/** @typedef {{ndcX:number, ndcY:number, factor:number, left:boolean, right:boolean, pointMode:boolean, lookYaw:number, lookPitch:number, over:boolean, leftLatch?:number, rightLatch?:number, dive?:boolean}} MouseState */
export const MOUSE = {
  /** The hand rides the cursor ray at the distance where the ray meets a plane `hoverY` over the table top (so it lies on the felt
   * wherever you point); the wheel multiplies that distance (`factor`): more than about 1.2 puts the hand below the table top. */
  hoverY: 0.045, factorMin: 0.55, factorMax: 1.9, factorStart: 1.0,
  depthMin: 0.22, depthMax: 1.1,
  /** Head turn from the screen edges: up to this many degrees, starting 12 percent in from each edge. */
  lookYawMax: 16, lookPitchMax: 10, edge: 0.12,
  /** Stage D: the cursor at the BOTTOM edge no longer tilts the view down (lesson 4 sends the mouse to the bottom and his head left the picture). Looking up at the top edge stays. */
  lookPitchDownMax: 0,
  /** Pushing the cursor into the bottom 7 percent of the screen multiplies the distance by up to 1.35: the hand dives past the
   * table top and under it. It is still a 3D position that the rules read. */
  assistFrom: -0.86, assistGain: 2.5, assistCap: 1.35,
  /** Holding the dive key (Space) multiplies the distance by this: the hand goes under the table wherever the cursor is. */
  diveFactor: 1.5,
};
/** A plain click is as real as a hold. The frame loop samples the buttons about 60 times a second, so a click that goes down and up
 * inside one frame (a trackpad tap, a script, a quick finger) must still be seen by the rules: each press keeps the hand closed for at
 * least `fistS` seconds of game time, and a right press keeps the point ray for at least `pointS` (the rules need a steady point for
 * 0.3 s). A press held longer than that follows the button as before. A click is: down then up within `clickMaxS`, no movement. */
export const CLICK = { fistS: 0.16, pointS: 0.45, clickMaxS: 0.3 };
/** @param {number} ndcY */
export function assistFactor(ndcY) {
  return ndcY < MOUSE.assistFrom ? Math.min(MOUSE.assistCap, 1 + (MOUSE.assistFrom - ndcY) * MOUSE.assistGain) : 1;
}
/** Distance along a unit ray `d` from the eye at height `eyeY` over the table to the hover plane.
 * @param {number} eyeY @param {{y:number}} d */
export function tableDepth(eyeY, d) {
  if (d.y > -0.05) return MOUSE.depthMax;
  return Math.max(MOUSE.depthMin, Math.min(MOUSE.depthMax, (eyeY - MOUSE.hoverY) / -d.y));
}

/** @returns {MouseState} */
export function createMouse() {
  return { ndcX: 0, ndcY: -0.2, factor: MOUSE.factorStart, left: false, right: false, pointMode: false, lookYaw: 0, lookPitch: 0, over: true, leftLatch: 0, rightLatch: 0 };
}

/** A button goes down or up (called by the page's pointer code; time is not needed, the latch runs on game time in `mouseTick`).
 * @param {MouseState} m @param {"left"|"right"} which @param {boolean} isDown */
export function mouseButton(m, which, isDown) {
  m[which] = isDown;
  if (isDown) m[which === "left" ? "leftLatch" : "rightLatch"] = which === "right" || m.pointMode ? CLICK.pointS : CLICK.fistS;
}

/** Run the click latches down by one frame of game time. Call once per frame before `mouseHand`. @param {MouseState} m @param {number} dt */
export function mouseTick(m, dt) {
  m.leftLatch = Math.max(0, (m.leftLatch ?? 0) - dt);
  m.rightLatch = Math.max(0, (m.rightLatch ?? 0) - dt);
}

/** The wheel: positive delta moves the hand away from you (down through the table top and under it). @param {MouseState} m @param {number} delta */
export function mouseWheel(m, delta) {
  m.factor = clamp(m.factor + delta, MOUSE.factorMin, MOUSE.factorMax);
}

/** The head turns a little when the cursor is near an edge of the screen (smoothed). @param {MouseState} m @param {number} dt */
export function mouseLook(m, dt) {
  const edge = (v) => {
    const a = Math.abs(v);
    const k = a <= 1 - MOUSE.edge ? 0 : (a - (1 - MOUSE.edge)) / MOUSE.edge;
    return Math.sign(v) * clamp(k, 0, 1);
  };
  const wantYaw = m.over ? edge(m.ndcX) * MOUSE.lookYawMax : 0;
  const ey = edge(m.ndcY);
  const wantPitch = m.over ? (ey > 0 ? -ey * MOUSE.lookPitchMax : -ey * MOUSE.lookPitchDownMax) : 0; // cursor at the top edge: look up (negative pitch down)
  const k = 1 - Math.exp(-dt * 4);
  m.lookYaw += (wantYaw - m.lookYaw) * k;
  m.lookPitch += (wantPitch - m.lookPitch) * k;
}

/** The unit direction of the cursor ray in table-local space.
 * @param {MouseState} m @param {{yaw:number, pitchDown:number}} head the head's base yaw and pitch (degrees to radians already applied) @param {{fovY:number, aspect:number}} cam */
export function cursorRay(m, head, cam) {
  const b = cameraBasis(head.yaw + m.lookYaw * DEG, head.pitchDown + m.lookPitch * DEG);
  const th = Math.tan((cam.fovY * DEG) / 2);
  const x = m.ndcX * th * cam.aspect, y = m.ndcY * th;
  return unit({ x: b.f.x + b.r.x * x + b.u.x * y, y: b.f.y + b.r.y * x + b.u.y * y, z: b.f.z + b.r.z * x + b.u.z * y });
}

/** The mouse as a hand: a 3D position on the cursor ray, a fist while the left button is down (or for a moment after a click), a point
 * ray while the right button is down (or for a moment after a right click). With point mode on (the Point button or the P key) a left
 * click is a point instead of a fist: aim at a spot of the room and click.
 * @param {MouseState} m @param {V3} headPos @param {{yaw:number, pitchDown:number}} head @param {{fovY:number, aspect:number}} cam
 * @returns {HandInput} */
export function mouseHand(m, headPos, head, cam) {
  const d = cursorRay(m, head, cam);
  const depth = clamp(tableDepth(headPos.y, d) * m.factor * assistFactor(m.ndcY) * (m.dive ? MOUSE.diveFactor : 1), MOUSE.depthMin, MOUSE.depthMax * 1.5);
  const pos = { x: headPos.x + d.x * depth, y: headPos.y + d.y * depth, z: headPos.z + d.z * depth };
  const leftOn = m.left || (m.leftLatch ?? 0) > 0;
  const pointing = m.right || (m.rightLatch ?? 0) > 0 || (m.pointMode && leftOn);
  return { id: "mouse", tracked: m.over, pos, fist: leftOn && !pointing, pinch: false, pointRay: pointing ? { o: { ...headPos }, d } : null };
}

/** The cursor and wheel factor that put the mouse hand at `pos` (for scripted runs and tests). The inverse of `mouseHand`.
 * @param {V3} pos @param {V3} headPos @param {{yaw:number, pitchDown:number}} head @param {{fovY:number, aspect:number}} cam @param {number} [lookYaw] @param {number} [lookPitch] */
export function mouseFor(pos, headPos, head, cam, lookYaw = 0, lookPitch = 0) {
  const b = cameraBasis(head.yaw + lookYaw * DEG, head.pitchDown + lookPitch * DEG);
  const v = { x: pos.x - headPos.x, y: pos.y - headPos.y, z: pos.z - headPos.z };
  const depth = Math.hypot(v.x, v.y, v.z);
  const d = unit(v);
  const cf = dot(d, b.f);
  const th = Math.tan((cam.fovY * DEG) / 2);
  const ndcY = dot(d, b.u) / cf / th;
  return { ndcX: dot(d, b.r) / cf / (th * cam.aspect), ndcY, factor: depth / (tableDepth(headPos.y, d) * assistFactor(ndcY)) };
}

// ------------------------------------------------------------------ Glasses gaze and pinch
/** A pinch (select) with the gaze on the table is a closed hand (fist); a pinch with the gaze raised toward the room is a point.
 * The hand rides the gaze ray to where it meets the felt (so it goes where you look), and dives under the table when you look down
 * past the near edge of it.
 * @typedef {{down:boolean, mode:"fist"|"point"|null, latch?:number}} GazeState */
export const GAZE = { pointAbovePitchDeg: -18, underFactor: 1.35, nearEdgeMargin: 0.03 };

/** @returns {GazeState} */
export function createGaze() {
  return { down: false, mode: null, latch: 0 };
}

/** @param {GazeState} s @param {{o:V3,d:V3}} ray the gaze ray (table-local) @param {boolean} pinchDown @param {number} [dt] game time of this frame
 * (a quick pinch tap keeps its fist or point for a moment, like a mouse click: see CLICK) @returns {HandInput} */
export function gazeHand(s, ray, pinchDown, dt = 0) {
  const d = unit(ray.d);
  const pitchDeg = (Math.asin(clamp(d.y, -1, 1)) * 180) / Math.PI;
  if (pinchDown && !s.down) {
    s.mode = pitchDeg > GAZE.pointAbovePitchDeg ? "point" : "fist";
    s.latch = s.mode === "point" ? CLICK.pointS : CLICK.fistS;
  }
  s.latch = Math.max(0, (s.latch ?? 0) - dt);
  if (!pinchDown && !(s.latch > 0)) s.mode = null;
  s.down = pinchDown;
  let depth = tableDepth(ray.o.y, d);
  if (d.y < -0.05) {
    // looking down past the near edge of the table: the hand goes under it
    const hitZ = ray.o.z + d.z * depth;
    if (hitZ > TABLE.zNear + GAZE.nearEdgeMargin) depth *= GAZE.underFactor;
  }
  depth = clamp(depth, MOUSE.depthMin, MOUSE.depthMax * 1.5);
  const pos = { x: ray.o.x + d.x * depth, y: ray.o.y + d.y * depth, z: ray.o.z + d.z * depth };
  return { id: "gaze", tracked: true, pos, fist: s.mode === "fist", pinch: false, pointRay: s.mode === "point" ? { o: { ...ray.o }, d } : null };
}
