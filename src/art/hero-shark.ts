/** The hero Shark: one skinned mesh (baked from smooth shapes, see shark-model.js) drawn with soft toon light, a rim of light and an
 * outline on the head, hat and hands. It draws a `SharkPose` (actor/interface.ts) and adds the small motions the rig does not: eye
 * darts, finger drumming, hat and tie lag, lid and brow shapes. Two draw calls (body, outline), no shadows, no textures. */
import {
  Group, SkinnedMesh, Skeleton, Bone, BufferGeometry, BufferAttribute, Float32BufferAttribute, Uint16BufferAttribute, Matrix4, Quaternion, Vector3, Euler, Color,
} from "@iwsdk/core";
import type { SharkAvatar, SharkAvatarFactory, SharkPose } from "../actor/interface.js";
import { SHARK } from "./shark-data.js";
import { makeToon, makeOutline } from "./toon.js";
import { HandSolver } from "./hand-solve.js";
import {
  BONE, BONE_NAMES, REST, HEAD_SCALE, headToRoot, ELBOW_R, ELBOW_L, POLE_R, POLE_L, twoBone, blendJoints, toSharkLocal, handBasis, toRoot,
  sharkBindJoints, HAND_BASE, OPEN_JOINTS,
} from "./shark-rig.js";
import { EYE, JAW_HINGE } from "./shark-head.js";
import { POSE_JOINTS } from "../game/hand-poses.js";

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const LIN = new Float32Array(256).map((_, i) => srgbToLinear(i / 255));

export interface HeroLook {
  rimColor?: string;
  rimStrength?: number;
  outlineWidth?: number;
}

/** The bind-pose matrices of the bones are all identity (the mesh is authored in place), so a bone matrix is the move from bind to now. */
export function createHeroShark(look: HeroLook = {}): SharkAvatar {
  const root = new Group();
  root.name = "shark";
  const d = SHARK;
  const nv = d.positions.length / 3;

  // ---- geometry
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(d.positions, 3));
  g.setAttribute("normal", new BufferAttribute(d.normals, 3));
  const col = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) col[i] = LIN[d.colors[i]];
  g.setAttribute("color", new BufferAttribute(col, 3));
  const flat = new Float32Array(nv);
  for (let i = 0; i < nv; i++) flat[i] = d.flats[i] / 255;
  g.setAttribute("aFlat", new BufferAttribute(flat, 1));
  g.setAttribute("skinIndex", new Uint16BufferAttribute(Uint16Array.from(d.skinIndex), 4));
  const sw = new Float32Array(nv * 4);
  for (let i = 0; i < nv * 4; i++) sw[i] = d.skinWeight[i] / 255;
  g.setAttribute("skinWeight", new BufferAttribute(sw, 4));
  g.setIndex(new BufferAttribute(d.indices, 1));
  g.addGroup(0, d.indices.length, 0);
  g.addGroup(0, d.outlineCount, 1);
  g.computeBoundingSphere();

  // the rim of warm light on the suit was a soft orange fringe along the arms and shoulders (read as a blurred halo when he leans in): a thin,
  // faint rim now (stage A2, 2026-11-07); the dark outline on the head, hat and hands is unchanged
  const toon = makeToon({ rimColor: look.rimColor ?? "#ffb070", rimStrength: look.rimStrength ?? 0.04, rimPower: 8, flatAttr: true, clipY: -0.004, hideBehindEdge: true });
  const outline = makeOutline(look.outlineWidth ?? 0.0024);
  const mesh = new SkinnedMesh(g, [toon, outline]);
  mesh.name = "shark mesh";
  mesh.frustumCulled = false;
  const bones = BONE_NAMES.map((n) => {
    const b = new Bone();
    b.name = n;
    b.matrixAutoUpdate = false;
    return b;
  });
  for (const b of bones) mesh.add(b);
  const skeleton = new Skeleton(bones, bones.map(() => new Matrix4()));
  mesh.bind(skeleton, new Matrix4());
  root.add(mesh);

  // ---- scratch
  const M = bones.map(() => new Matrix4());
  const t1 = new Matrix4(), t2 = new Matrix4(), t3 = new Matrix4(), t4 = new Matrix4(), Mh = new Matrix4();
  const qa = new Quaternion(), qb = new Quaternion();
  const ea = new Euler();
  const va = new Vector3(), vb = new Vector3(), vc = new Vector3(), vd = new Vector3();
  const set = (i: number, m: Matrix4) => {
    bones[i].matrix.copy(m);
    bones[i].matrixWorldNeedsUpdate = true;
  };
  const about = (out: Matrix4, c: Vector3, rot: Matrix4) => {
    // T(c) * rot * T(-c)
    out.makeTranslation(c.x, c.y, c.z).multiply(rot).multiply(t3.makeTranslation(-c.x, -c.y, -c.z));
    return out;
  };
  const P = (a: number[]) => new Vector3(a[0], a[1], a[2]);
  const H0 = P(REST.head);
  const hingeC = P(headToRoot(JAW_HINGE));
  const eyeC = [P(headToRoot([EYE.x, EYE.y, EYE.z])), P(headToRoot([-EYE.x, EYE.y, EYE.z]))]; // left (+x), right
  const chordP = Math.sqrt(EYE.r * EYE.r - 0.0045 * 0.0045);
  const pupC = [P(headToRoot([EYE.x, EYE.y, EYE.z + chordP])), P(headToRoot([-EYE.x, EYE.y, EYE.z + chordP]))];
  const browC = [P(headToRoot([0.037, 0.05, 0.09])), P(headToRoot([-0.037, 0.05, 0.09]))];
  const hatC = P(headToRoot([0, 0.079, -0.014]));
  const bowC = P([0, 0.321, -0.4]);
  const chestC = P([0, 0.22, -0.52]);
  const N0 = P(REST.neck), HP0 = P(REST.hip);
  const S0 = { R: P(REST.shoulderR), L: P(REST.shoulderL) };
  const E0 = { R: P(ELBOW_R), L: P(ELBOW_L) };
  const W0 = { R: P(REST.wristR), L: P(REST.wristL) };
  const solvers = { R: new HandSolver(sharkBindJoints(false)), L: new HandSolver(sharkBindJoints(true)) };
  const handM = Array.from({ length: 16 }, () => new Matrix4());

  /** M = T(a1) R S T(-a0): the move that takes the bind segment a0-b0 onto a1-b1 (stretching along it). */
  function segment(out: Matrix4, a0: Vector3, b0: Vector3, a1: Vector3, b1: Vector3, maxStretch = 1.5): void {
    vb.copy(b0).sub(a0);
    const l0 = vb.length();
    vb.multiplyScalar(1 / l0);
    vc.copy(b1).sub(a1);
    const l1 = vc.length() || 1e-5;
    vc.multiplyScalar(1 / l1);
    qa.setFromUnitVectors(vb, vc);
    const s = Math.min(maxStretch, l1 / l0) - 1;
    t1.set(
      1 + s * vb.x * vb.x, s * vb.x * vb.y, s * vb.x * vb.z, 0,
      s * vb.x * vb.y, 1 + s * vb.y * vb.y, s * vb.y * vb.z, 0,
      s * vb.x * vb.z, s * vb.y * vb.z, 1 + s * vb.z * vb.z, 0,
      0, 0, 0, 1,
    );
    out.makeRotationFromQuaternion(qa).multiply(t1);
    out.premultiply(t2.makeTranslation(a1.x, a1.y, a1.z));
    out.multiply(t2.makeTranslation(-a0.x, -a0.y, -a0.z));
  }

  // ---- life: small motions that do not come from the game
  let clock = 0;
  let seed = 90210;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dart = { x: 0, y: 0, tx: 0, ty: 0, next: 0.8 };
  const lastHead = new Vector3(NaN, NaN, NaN);
  const headVel = new Vector3();
  const hatA = { a: 0, v: 0 }, hatR = { a: 0, v: 0 };
  const bow = { a: 0, v: 0 };
  const drum = { phase: [0, 1.1, 2.3, 3.4] };

  function spring(s: { a: number; v: number }, target: number, k: number, damp: number, dt: number): void {
    s.v += (target - s.a) * k * dt - s.v * damp * dt;
    s.a += s.v * dt;
  }

  function lidAngles(lid: number, pitch: number): { up: number; low: number } {
    const L = Math.max(0, Math.min(1.3, lid));
    const eu = L <= 0.45 ? -0.22 + 0.58 * L : L <= 1 ? 0.04 + 0.36 * (L - 0.45) : 0.24 + ((L - 1) / 0.3) * 0.7; // elevation of the upper lid edge in radians
    const el = L <= 0.45 ? -0.22 - 0.2 * L : L <= 1 ? -0.31 - 0.4 * (L - 0.45) : -0.53 - ((L - 1) / 0.3) * 0.2; // elevation of the lower lid edge (negative = below the eye's middle)
    // looking down pulls the upper lid down with the eye
    return { up: -(eu - 0.45 * pitch), low: -(el - 0.1 * pitch) };
  }

  function handJoints(h: SharkPose["handR"], left: boolean): number[][] {
    const local = blendJoints(h.open).map((p) => p.slice());
    if (h.mode === "rest") {
      // he drums his fingers on the felt while he waits
      for (let f = 0; f < 4; f++) {
        const a = 0.28 * Math.pow(Math.max(0, Math.sin(clock * 3.3 + drum.phase[f] * (left ? 1.4 : 1))), 3);
        if (a < 0.01) continue;
        const m = 5 + f * 5;
        for (let j = 1; j <= 4; j++) {
          const q = POSE_JOINTS.fist[m + j];
          const p = local[m + j];
          p[0] += (q[0] - p[0]) * a * (j === 1 ? 0.3 : 1);
          p[1] += (q[1] - p[1]) * a * (j === 1 ? 0.3 : 1);
          p[2] += (q[2] - p[2]) * a * (j === 1 ? 0.3 : 1);
        }
      }
    }
    const basis = handBasis([h.dir.x, h.dir.y, h.dir.z]);
    const wrist = [h.wrist.x, h.wrist.y, h.wrist.z];
    return local.map((p) => toRoot(toSharkLocal(p, left), wrist, basis));
  }

  function apply(pose: SharkPose, dt: number): void {
    dt = Math.min(0.05, Math.max(0, dt));
    clock += dt;
    const hp = pose.head.pos;
    // ---- head matrix: T(pos) R T(-bind)
    ea.set(pose.head.pitch, pose.head.yaw, pose.head.roll, "YXZ");
    qa.setFromEuler(ea);
    Mh.makeRotationFromQuaternion(qa).premultiply(t1.makeTranslation(hp.x, hp.y, hp.z)).multiply(t1.makeTranslation(-H0.x, -H0.y, -H0.z));
    set(BONE.head, Mh);
    if (Number.isNaN(lastHead.x)) lastHead.set(hp.x, hp.y, hp.z);
    headVel.set((hp.x - lastHead.x) / Math.max(dt, 1e-3), (hp.y - lastHead.y) / Math.max(dt, 1e-3), (hp.z - lastHead.z) / Math.max(dt, 1e-3));
    lastHead.set(hp.x, hp.y, hp.z);

    // ---- jaw: a turn about the hinge, in the head's frame
    // stage F (D2): the jaw opens at most 0.06 + 0.6 x 0.32 = 0.25 rad. At 0.32 rad (his "Caught him!" face, mouth 0.8) the skin between the jaw and the cheeks
    // stretched: the mouth went wide and skewed. The laugh and the slam stay under this limit.
    const jawAng = 0.06 + Math.max(0, Math.min(0.6, pose.jaw)) * 0.32;
    t2.makeRotationX(jawAng);
    about(M[BONE.jaw], hingeC, t2).premultiply(Mh);
    set(BONE.jaw, M[BONE.jaw]);

    // ---- eyes: pose gaze plus quick darts
    dart.next -= dt;
    if (dart.next <= 0) {
      dart.next = 0.5 + rnd() * 2.2;
      dart.tx = (rnd() - 0.5) * 0.07;
      dart.ty = (rnd() - 0.5) * 0.04;
    }
    dart.x += (dart.tx - dart.x) * Math.min(1, dt * 40);
    dart.y += (dart.ty - dart.y) * Math.min(1, dt * 40);
    const eyes = [pose.eyes.l, pose.eyes.r];
    for (let i = 0; i < 2; i++) {
      const e = eyes[i];
      const left = i === 0;
      ea.set(e.pitch + dart.y, e.yaw + dart.x, 0, "YXZ");
      t2.makeRotationFromQuaternion(qa.setFromEuler(ea));
      about(M[left ? BONE.eyeL : BONE.eyeR], eyeC[i], t2).premultiply(Mh);
      set(left ? BONE.eyeL : BONE.eyeR, M[left ? BONE.eyeL : BONE.eyeR]);
      // pupil: follows the eye, and shrinks when he narrows his eyes, widens when he is startled
      const k = 0.78 + 0.5 * Math.max(0, Math.min(1.3, e.lid) - 0.6) + (e.lid > 1 ? 0.35 : 0);
      t2.makeScale(k, k, 1);
      about(t1, pupC[i], t2);
      M[left ? BONE.pupL : BONE.pupR].copy(M[left ? BONE.eyeL : BONE.eyeR]).multiply(t1);
      set(left ? BONE.pupL : BONE.pupR, M[left ? BONE.pupL : BONE.pupR]);
      // lids: swing about the eye centre; the brows tilt them (angry: the inner end drops)
      const la = lidAngles(e.lid, e.pitch + dart.y);
      const b = left ? pose.brows.l : pose.brows.r;
      const roll = (left ? 1 : -1) * (b < 0 ? -b * 0.32 : -b * 0.1);
      for (const [bone, ang] of [[left ? BONE.lidUL : BONE.lidUR, la.up], [left ? BONE.lidLL : BONE.lidLR, la.low]] as [number, number][]) {
        t2.makeRotationZ(roll * (bone === BONE.lidUL || bone === BONE.lidUR ? 1 : 0.4)).multiply(t3.makeRotationX(ang));
        about(M[bone], eyeC[i], t2).premultiply(Mh);
        set(bone, M[bone]);
      }
      // brows: up and down, and tilt
      const bb = Math.max(-1, Math.min(1, b));
      t2.makeRotationZ((left ? 1 : -1) * (bb < 0 ? -bb * 0.4 : -bb * 0.14));
      about(M[left ? BONE.browL : BONE.browR], browC[i], t2);
      M[left ? BONE.browL : BONE.browR].premultiply(t1.makeTranslation(0, 0.0058 * HEAD_SCALE * bb, 0)).premultiply(Mh);
      set(left ? BONE.browL : BONE.browR, M[left ? BONE.browL : BONE.browR]);
    }

    // ---- hat: a little lag when the head moves, a bump on a slam
    spring(hatA, Math.max(-0.12, Math.min(0.12, -headVel.z * 0.05)), 220, 14, dt);
    spring(hatR, Math.max(-0.1, Math.min(0.1, headVel.x * 0.05)), 220, 14, dt);
    t2.makeRotationX(hatA.a).multiply(t3.makeRotationZ(hatR.a));
    about(M[BONE.hat], hatC, t2).premultiply(Mh);
    set(BONE.hat, M[BONE.hat]);

    // ---- chest: hips slide forward half as far as the neck, the spine turns and stretches a little, the chest rises with each breath
    const N1 = vc.set(pose.torso.neck.x, pose.torso.neck.y, pose.torso.neck.z).clone();
    const slide = Math.max(0, N1.z - N0.z) * 0.5;
    t1.makeTranslation(0, 0, slide);
    M[BONE.hip].copy(t1);
    set(BONE.hip, M[BONE.hip]);
    const H1 = HP0.clone().add(vd.set(0, 0, slide));
    segment(M[BONE.chest], HP0, N0, H1, N1, 1.35);
    const br = pose.breath;
    t2.makeScale(1 + 0.022 * br, 1 + 0.012 * br, 1 + 0.03 * br);
    about(t4, chestC, t2);
    M[BONE.chest].multiply(t4);
    set(BONE.chest, M[BONE.chest]);
    // bow tie: swings a little behind the chest
    spring(bow, -0.25 * pose.torso.lean, 120, 9, dt);
    t2.makeRotationX(bow.a);
    about(M[BONE.bow], bowC, t2).premultiply(M[BONE.chest]);
    set(BONE.bow, M[BONE.bow]);

    // ---- arms and hands
    for (const side of ["R", "L"] as const) {
      const left = side === "L";
      const sh = left ? pose.shoulders.l : pose.shoulders.r;
      const h = left ? pose.handL : pose.handR;
      const S1 = va.set(sh.x, sh.y, sh.z).clone();
      const W1 = new Vector3(h.wrist.x, h.wrist.y, h.wrist.z);
      const ik = twoBone([S1.x, S1.y, S1.z], [W1.x, W1.y, W1.z], REST.upper, REST.fore, left ? POLE_L : POLE_R);
      const E1 = new Vector3(ik.elbow[0], ik.elbow[1], ik.elbow[2]);
      segment(M[BONE["upper" + side]], S0[side], E0[side], S1, E1, 1.3);
      set(BONE["upper" + side], M[BONE["upper" + side]]);
      segment(M[BONE["fore" + side]], E0[side], W0[side], E1, W1, 1.3);
      set(BONE["fore" + side], M[BONE["fore" + side]]);
      solvers[side].solve(handJoints(h, left), handM);
      const base = HAND_BASE[side];
      for (let i = 0; i < 16; i++) set(base + i, handM[i]);
    }
  }

  const U = toon.userData.uniforms as { uEye: { value: Vector3 }; uEdge: { value: { set(x: number, y: number): void } } };
  return {
    root,
    apply,
    /** Stage E: where your eye is and where the far edge of the table is (table-local): he is hidden behind that edge along your line of sight. */
    setView(eye: { x: number; y: number; z: number }, edge: { y: number; z: number }) {
      U.uEye.value.set(eye.x, eye.y, eye.z);
      U.uEdge.value.set(edge.y, edge.z);
    },
    dispose() {
      g.dispose();
      toon.dispose();
      (outline as { dispose(): void }).dispose();
      skeleton.dispose();
    },
  };
}

export const createHero: SharkAvatarFactory = () => createHeroShark();
