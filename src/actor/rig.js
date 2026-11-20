/** The Shark rig (pure): turns a few commands from the game into a body pose, every frame. No graphics here. The art draws
 * the pose through the `SharkAvatar` interface (actor/interface.ts); the placeholder avatar is actor/placeholder.ts.
 *
 * What it does: head turn, and eyes that lead the head and track the player's head and hands; lean-in across the table until his face (nose and hat brim) is about 0.5 m from the player's head (comfort, bench part B6); breathing (slow, fast in a stare); the right shoulder dips while that hand goes under the table;
 * a wrist that can be grabbed (the pose says where it is); a slam that lands his hand on the player's hand in about 0.12 s.
 * Frame: table-local metres (x to the player's right, y up, z toward the player). The Shark faces +z. Yaw 0 looks at the player;
 * yaw > 0 turns toward +x. Pitch > 0 looks down. */
import { Spring, Spring3 } from "./spring.js";
import { BODY, SEAT } from "../game/booth.js";

/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {"rest"|"hover"|"under"|"slam"|"hold"|"shove"} HandMode */
/**
 * What the game asks of the rig each frame.
 * @typedef {Object} RigCommand
 * @property {V3|null} lookAt where the head turns (null = straight ahead)
 * @property {V3|null} [eyesAt] where the eyes look (default lookAt)
 * @property {number} lean 0 to 1: how far he leans across the table toward the player's face
 * @property {number} breathRate breaths per second (0.22 calm, 0.7 in a stare)
 * @property {number} breathAmp 0 to 1
 * @property {number} dipR 0 to 1: the right shoulder dips (his cheat)
 * @property {{mode:HandMode, target?:V3}} handR
 * @property {{mode:HandMode, target?:V3}} handL
 * @property {number} narrow 0 to 1 eyes narrow
 * @property {number} widen 0 to 1 eyes widen
 * @property {number} mouth 0 to 1 mouth open
 * @property {number} brow -1 (angry) to 1 (raised)
 * @property {number} struggle 0 to 1 shake of the held wrist and the shoulder
 * @property {number} [laugh] 0 to 1: a short laugh (the jaw pulses about 3 times a second, the head bobs, the chest jumps)
 * @property {number} [browSkew] -1 to 1: one brow up and the other down (a smirk is +)
 * @property {number} [tilt] -1 to 1: the head tilts (a smug tilt is +)
 */
/**
 * What the rig gives back (everything table-local).
 * @typedef {Object} SharkPose
 * @property {{pos:V3, yaw:number, pitch:number, roll:number}} head
 * @property {{l:{yaw:number,pitch:number,lid:number}, r:{yaw:number,pitch:number,lid:number}}} eyes yaw and pitch are relative to the head; lid 0 shut to 1 wide
 * @property {{pos:V3, dir:V3}} sight his eye point and the way he really looks (head plus eyes); the game's line-of-sight uses this
 * @property {{hip:V3, neck:V3, lean:number}} torso
 * @property {number} breath 0 to 1 (inhale)
 * @property {{r:V3, l:V3}} shoulders
 * @property {{wrist:V3, dir:V3, open:number, mode:HandMode}} handR dir = unit vector from the wrist toward the fingertips; open 0 fist to 1 flat
 * @property {{wrist:V3, dir:V3, open:number, mode:HandMode}} handL
 * @property {number} mouth 0 shut to 1 wide open (same value as `jaw`)
 * @property {number} jaw 0 shut to 1 wide open
 * @property {number} brow -1 angry to 1 raised (the mean of both brows)
 * @property {{l:number,r:number}} brows -1 lowered and pulled in (angry) to 1 raised, each brow
 * @property {number} dipR
 */

const DEG = Math.PI / 180;
/** Distance (metres) from the player's head to his head centre when he leans in all the way. */
export const LEAN_DISTANCE = 0.72;
/** Laugh pulses per second (the audio's "heh"s use the same spacing, see audio.ts). */
export const LAUGH_HZ = 5.2;
/** Length of the hand from the wrist to the middle fingertip, and of the forearm below the elbow (metres). */
export const HAND_LEN = 0.19;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unit = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

/** @returns {RigCommand} a calm command (also the default). */
export function idleCommand() {
  return {
    lookAt: null, eyesAt: null, lean: 0, breathRate: 0.22, breathAmp: 0.5, dipR: 0,
    handR: { mode: "rest" }, handL: { mode: "rest" }, narrow: 0, widen: 0, mouth: 0, brow: 0, struggle: 0, laugh: 0, browSkew: 0, tilt: 0,
  };
}

/**
 * @param {{eyeRel?:number, leanDistance?:number}} [opts] eyeRel = the player's eye height over the table top (the Shark's eyes sit there)
 */
export function createRig(opts = {}) {
  const eyeRel = opts.eyeRel ?? SEAT.eyeRel;
  // comfort (bench part B6): the nearest point of his head or hat is never closer than 0.5 m to the player's head. His head centre stops this far
  // from the player's head when he leans in; the face, nose and hat brim reach about 0.2 m in front of that centre.
  const leanDistance = opts.leanDistance ?? LEAN_DISTANCE;
  // his eyes follow the height of the player's eyes over the table (slowly: he sits taller when you sit taller)
  const eyeSpring = new Spring(eyeRel);
  const restHead = { x: 0, y: eyeRel, z: SEAT.sharkZ };
  const hipBase = { x: 0, y: -0.14, z: SEAT.sharkZ - 0.14 };
  const head = new Spring3(restHead);
  const yaw = new Spring(0), pitch = new Spring(0), roll = new Spring(0);
  const eyeYaw = [new Spring(0), new Spring(0)], eyePitch = [new Spring(0), new Spring(0)];
  const lean = new Spring(0), dip = new Spring(0), narrow = new Spring(0), widen = new Spring(0);
  const mouth = new Spring(0), brow = new Spring(0), breathAmp = new Spring(0.5), struggle = new Spring(0);
  const laughS = new Spring(0), skewS = new Spring(0), tiltS = new Spring(0);
  let laughPhase = 0;
  const wristR = new Spring3(BODY.restR), wristL = new Spring3(BODY.restL);
  const openR = new Spring(0.55), openL = new Spring(0.55);
  const dirR = new Spring3({ x: 0, y: -0.05, z: 1 }), dirL = new Spring3({ x: 0, y: -0.05, z: 1 });
  let clock = 0, phase = 0, rate = 0.22;
  /** @type {SharkPose|null} */
  let last = null;

  /** @param {number} dt @param {RigCommand} cmd @param {{playerHead:V3}} ctx @returns {SharkPose} */
  function step(dt, cmd, ctx) {
    dt = clamp(dt, 0, 0.1);
    clock += dt;
    const eyeNow = eyeSpring.step(clamp(ctx.playerHead.y, 0.32, 0.8), 1.4, dt);
    restHead.y = eyeNow;
    rate += (cmd.breathRate - rate) * (1 - Math.exp(-dt * 2));
    phase += dt * rate * Math.PI * 2;
    const amp = breathAmp.step(cmd.breathAmp, 3, dt);
    const breath = 0.5 + 0.5 * Math.sin(phase);

    // the lean: the head goes toward the player's face and stops leanDistance from it (never past the middle of the table)
    const lk = lean.step(clamp(cmd.lean, -0.4, 1), cmd.lean > 0.5 ? 3.2 : 2.6, dt);
    const ph = ctx.playerHead;
    const toRest = unit({ x: restHead.x - ph.x, y: restHead.y - ph.y, z: restHead.z - ph.z });
    const leanHead = { x: ph.x + toRest.x * leanDistance, y: ph.y + toRest.y * leanDistance * 0.6 - 0.02, z: Math.min(ph.z + toRest.z * leanDistance, 0.2) };
    const sway = { x: 0.004 * Math.sin(clock * 0.31) + 0.002 * Math.sin(clock * 0.83), y: 0.0035 * Math.sin(clock * 0.47), z: 0.003 * Math.sin(clock * 0.23) };
    const bob = 0.006 * amp * (breath - 0.5);
    // a short laugh: about 5 pulses a second; the jaw opens on each, the head bobs and the chest jumps
    const lau = laughS.step(clamp(cmd.laugh ?? 0, 0, 1), 18, dt);
    if (lau > 0.02) laughPhase += dt * Math.PI * 2 * LAUGH_HZ;
    const lp = Math.max(0, Math.sin(laughPhase)) * lau;
    const target = lerp3(restHead, leanHead, lk);
    const hp = head.step({ x: target.x + sway.x, y: target.y + sway.y + bob + 0.012 * lp, z: target.z + sway.z }, 9, dt);

    // the head turns toward lookAt (limits: 105 degrees to the side, 40 degrees down or up); the eyes lead it
    const look = cmd.lookAt ?? { x: hp.x, y: hp.y, z: hp.z + 1 };
    const dx = look.x - hp.x, dy = look.y - hp.y, dz = look.z - hp.z;
    const wantYaw = clamp(Math.atan2(dx, dz), -105 * DEG, 105 * DEG);
    // stage D: the head tips down at most 15 degrees (the hat brim hid his eyes at 25 degrees and more); the eyes do the rest of the looking down
    const wantPitch = clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -40 * DEG, 15 * DEG) + 0.1 * lp;
    const hy = yaw.step(wantYaw, 8, dt);
    const hpch = pitch.step(wantPitch, 8, dt);
    const tl = tiltS.step(clamp(cmd.tilt ?? 0, -1, 1), 7, dt);
    // stage F (D2): the struggle shakes the head only a little (0.2 rad of roll at 6 shakes a second tipped the face sideways in the grab)
    const hroll = roll.step(clamp(-wantYaw * 0.12, -0.15, 0.15) + 0.14 * tl + (cmd.struggle > 0 ? 0.05 * Math.sin(clock * 38) * cmd.struggle : 0), 6, dt);
    const eyeT = cmd.eyesAt ?? cmd.lookAt ?? { x: hp.x, y: hp.y, z: hp.z + 1 };
    const ex = eyeT.x - hp.x, ey = eyeT.y - hp.y, ez = eyeT.z - hp.z;
    const eyeWantYaw = clamp(Math.atan2(ex, ez) - hy, -34 * DEG, 34 * DEG);
    const eyeWantPitch = clamp(Math.atan2(-ey, Math.hypot(ex, ez)) - hpch, -28 * DEG, 28 * DEG);
    const eYaw = eyeYaw.map((s) => s.step(eyeWantYaw, 24, dt));
    const ePitch = eyePitch.map((s) => s.step(eyeWantPitch, 24, dt));

    const nr = narrow.step(clamp(cmd.narrow, 0, 1), 12, dt);
    const wd = widen.step(clamp(cmd.widen, 0, 1), 16, dt);
    // a blink every 3 to 5 seconds for 0.13 s (not while narrowed hard)
    const bt = (clock * 0.27 + Math.sin(clock * 0.37) * 0.3) % 1;
    const blink = bt > 0.96 && nr < 0.5 ? Math.sin(((bt - 0.96) / 0.04) * Math.PI) : 0;
    const lid = clamp(1 - 0.55 * nr + 0.3 * wd - 0.95 * blink, 0.02, 1.3);

    const mo = Math.max(mouth.step(clamp(cmd.mouth, 0, 1), 14, dt), lau > 0.02 ? lau * 0.2 + 0.55 * lp : 0);
    const sk = skewS.step(clamp(cmd.browSkew ?? 0, -1, 1), 10, dt);
    const br = brow.step(clamp(cmd.brow, -1, 1), 10, dt);
    const st = struggle.step(clamp(cmd.struggle, 0, 1), 12, dt);

    // the actual gaze: head plus eyes
    const gy = hy + (eYaw[0] + eYaw[1]) / 2, gp = hpch + (ePitch[0] + ePitch[1]) / 2;
    const dir = { x: Math.sin(gy) * Math.cos(gp), y: -Math.sin(gp), z: Math.cos(gy) * Math.cos(gp) };
    const fwd = { x: Math.sin(hy) * Math.cos(hpch), y: -Math.sin(hpch), z: Math.cos(hy) * Math.cos(hpch) };
    const sightPos = { x: hp.x + fwd.x * 0.07, y: hp.y + 0.005, z: hp.z + fwd.z * 0.07 };

    // body: hip stays; the neck follows the head; the shoulders follow the neck and dip with the right shoulder
    const dp = dip.step(clamp(cmd.dipR, 0, 1), cmd.dipR > 0.5 ? 9 : 5, dt);
    const neck = { x: hp.x * 0.85, y: hp.y - 0.13 + 0.004 * amp * (breath - 0.5), z: hp.z - 0.05 * Math.cos(hy) };
    const follow = { x: (neck.x - restHead.x) * 0.7, z: (neck.z - (restHead.z - 0.05)) * 0.75 };
    const shR = { x: BODY.shoulderR.x + follow.x - 0.012 * dp, y: eyeNow - 0.17 + 0.012 * amp * (breath - 0.5) - 0.085 * dp + (neck.y - (eyeNow - 0.13)) * 0.8, z: BODY.shoulderR.z + follow.z + 0.035 * dp };
    const shL = { x: BODY.shoulderL.x + follow.x, y: eyeNow - 0.17 + 0.012 * amp * (breath - 0.5) + 0.012 * dp + (neck.y - (eyeNow - 0.13)) * 0.8, z: BODY.shoulderL.z + follow.z };

    /** @param {{mode:HandMode,target?:V3}} h @param {V3} rest @param {Spring3} w @param {Spring} o @param {Spring3} d @param {boolean} right */
    const hand = (h, rest, w, o, d, right) => {
      let tw = rest, od = 0.55, om = 9, dd = { x: 0, y: -0.05, z: 1 };
      const t = h.target;
      if (h.mode === "under") {
        tw = BODY.cheatWrist; od = 0.2; om = 10; dd = unit(BODY.cheatDir);
      } else if (h.mode === "slam" && t) {
        // the palm lands on the target; the wrist is a hand length behind it (toward him)
        tw = { x: t.x, y: Math.max(0.02, t.y) + 0.012, z: t.z - 0.09 }; od = 1; om = 44; dd = { x: 0, y: -0.08, z: 1 };
      } else if (h.mode === "hold" && t) {
        tw = { x: t.x + 0.012 * st * Math.sin(clock * 41), y: t.y + 0.012 * st * Math.sin(clock * 53), z: t.z + 0.01 * st * Math.sin(clock * 37) }; od = 0.65; om = 26; dd = unit({ x: 0.2, y: -0.3, z: 0.9 });
      } else if (h.mode === "shove" && t) {
        tw = { x: t.x, y: Math.max(0.03, t.y), z: t.z - 0.08 }; od = 1; om = 30; dd = { x: 0, y: -0.05, z: 1 };
      } else if (h.mode === "hover" && t) {
        tw = t; od = 0.6; om = 12;
      } else {
        // resting on the table: a little breathing movement
        tw = { x: rest.x, y: rest.y + 0.003 * amp * (breath - 0.5), z: rest.z };
      }
      const wp = w.step(tw, om, dt);
      const open = o.step(od, 14, dt);
      const dv = d.step(dd, 12, dt);
      return { wrist: wp, dir: unit(dv), open, mode: h.mode, right };
    };
    const hR = hand(cmd.handR, BODY.restR, wristR, openR, dirR, true);
    const hL = hand(cmd.handL, BODY.restL, wristL, openL, dirL, false);

    last = {
      head: { pos: hp, yaw: hy, pitch: hpch, roll: hroll },
      eyes: { l: { yaw: eYaw[0], pitch: ePitch[0], lid }, r: { yaw: eYaw[1], pitch: ePitch[1], lid } },
      sight: { pos: sightPos, dir },
      torso: { hip: hipBase, neck, lean: lk },
      breath: clamp(breath * amp + 0.45 * lp, 0, 1),
      shoulders: { r: shR, l: shL },
      handR: { wrist: hR.wrist, dir: hR.dir, open: hR.open, mode: hR.mode },
      handL: { wrist: hL.wrist, dir: hL.dir, open: hL.open, mode: hL.mode },
      mouth: mo, jaw: mo, brow: br, brows: { l: clamp(br - 0.25 * nr - 0.55 * sk, -1, 1), r: clamp(br + 0.3 * nr + 0.8 * sk, -1, 1) }, dipR: dp,
    };
    return last;
  }

  return {
    step,
    get pose() {
      return last ?? step(0, idleCommand(), { playerHead: { x: 0, y: eyeRel, z: SEAT.playerZ } });
    },
    eyeRel,
    leanDistance,
  };
}
