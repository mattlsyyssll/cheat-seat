/** The headset read (round 8, Q16): the viewer pose, the 25 joints of each hand and the gaze ray from an XRFrame, in table-local space. Same result as before, but the
 * objects are made once and written over every frame: after the first frame this code allocates nothing (a new object per joint per frame, 50 or more at 72 Hz, made
 * garbage-collection stalls on the Quest's CPU). The browser's own XRJointPose objects and the feeder's result (game/adapters.js) are not made here.
 * Matrices are the 16 numbers of a three.js Matrix4 (column-major), so this file needs no three.js. */
import { JOINTS } from "../game/pose.js";

const NJ = JOINTS.length;
const mkV = () => ({ x: 0, y: 0, z: 0 });
const mkRec = () => {
  const r = {};
  for (const n of JOINTS) r[n] = mkV();
  return r;
};

/** to = (position) turned into table-local space by matrix e. */
function pointInto(to, p, e) {
  const x = p.x, y = p.y, z = p.z;
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
  to.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
  to.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
  to.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
}

/** to = the direction (0,0,-1) turned by quaternion o, then by the rotation part of matrix e, as a unit vector. */
function forwardInto(to, o, e) {
  const qx = o.x, qy = o.y, qz = o.z, qw = o.w;
  const tx = -2 * qy, ty = 2 * qx; // t = 2 * cross(q.xyz, (0,0,-1)), t.z = 0
  const vx = qw * tx - qz * ty;
  const vy = qw * ty + qz * tx;
  const vz = -1 + (qx * ty - qy * tx);
  const x = e[0] * vx + e[4] * vy + e[8] * vz;
  const y = e[1] * vx + e[5] * vy + e[9] * vz;
  const z = e[2] * vx + e[6] * vy + e[10] * vz;
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  to.x = x / l; to.y = y / l; to.z = z / l;
}

export class XrReader {
  /** @param {() => {feed:(hands:any, selecting:any, dt?:number)=>{inputs:any[], joints:Map<string,any>}}} makeFeeder */
  constructor(makeFeeder) {
    this.makeFeeder = makeFeeder;
    this.feeder = makeFeeder();
    this.rec = { left: mkRec(), right: mkRec() };
    this.hj = { left: null, right: null };
    this.sel = { left: false, right: false };
    this.out = { head: { pos: mkV(), dir: mkV(), tracked: false }, hands: [], joints: new Map(), gaze: { o: mkV(), d: mkV(), has: false }, selecting: false };
  }
  /** A new session: the hands start fresh. */
  reset() {
    this.feeder = this.makeFeeder();
  }
  rnd(noise) {
    noise.seed = (Math.imul(noise.seed, 1664525) + 1013904223) >>> 0;
    return (noise.seed / 4294967296 - 0.5) * 2; // uniform in -1..1 (QA jitter)
  }
  /**
   * @param {any} frame XRFrame @param {any} ref XRReferenceSpace @param {ArrayLike<number>} e inverse of the table's world matrix (16 numbers)
   * @param {number} dt @param {Set<string>} selecting handedness of the inputs now selecting @param {{sigma:number, seed:number}} noise QA jitter (sigma 0 = none)
   * @returns {any} the same object every call (read it before the next call)
   */
  read(frame, ref, e, dt, selecting, noise) {
    const out = this.out, hd = out.head, g = out.gaze;
    hd.pos.x = 0; hd.pos.y = 1.2; hd.pos.z = 0; hd.dir.x = 0; hd.dir.y = 0; hd.dir.z = -1; hd.tracked = false;
    g.o.x = 0; g.o.y = 0; g.o.z = 0; g.d.x = 0; g.d.y = 0; g.d.z = -1; g.has = false;
    out.selecting = selecting.size > 0;
    const vp = frame.getViewerPose(ref);
    if (vp) {
      pointInto(hd.pos, vp.transform.position, e);
      forwardInto(hd.dir, vp.transform.orientation, e);
      hd.tracked = true;
    }
    const hj = this.hj;
    hj.left = null; hj.right = null;
    const s = noise.sigma;
    const srcs = frame.session.inputSources;
    for (let i = 0; i < srcs.length; i++) {
      const source = srcs[i];
      if (source.targetRayMode === "gaze" && source.targetRaySpace) {
        const gp = frame.getPose(source.targetRaySpace, ref);
        if (gp) {
          forwardInto(g.d, gp.transform.orientation, e);
          pointInto(g.o, gp.transform.position, e);
          g.has = true;
        }
      }
      if (!source.hand || !frame.getJointPose) continue;
      const id = source.handedness === "left" ? "left" : "right";
      const rec = this.rec[id];
      let ok = true;
      for (let k = 0; k < NJ; k++) {
        const name = JOINTS[k];
        const j = source.hand.get(name);
        const jp = j ? frame.getJointPose(j, ref) : null;
        if (!jp) { ok = false; break; }
        const r = rec[name];
        pointInto(r, jp.transform.position, e);
        if (s > 0) { r.x += this.rnd(noise) * s; r.y += this.rnd(noise) * s; r.z += this.rnd(noise) * s; }
      }
      if (ok) hj[id] = rec; // a hand the headset no longer reports stays null: the rules decide what a lost hand means
    }
    this.sel.left = selecting.has("left"); this.sel.right = selecting.has("right");
    const fed = this.feeder.feed(hj, this.sel, dt);
    out.hands = fed.inputs;
    out.joints = fed.joints;
    return out;
  }
}
