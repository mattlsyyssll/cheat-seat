/** Turns 25 hand joints into the bone matrices of a skinned hand (the 16 bones of shark-rig.js HAND_BONES). Shared by the Shark's hands
 * (joints from the pose) and the player's hands (joints from the headset or the mouse). Each bone keeps its start joint exactly where the
 * joint is, turns to point at the next joint and stretches to its length; the roll is carried down each finger from the palm. */
import { Matrix4, Quaternion, Vector3 } from "@iwsdk/core";
import { HAND_BONES, HAND_PARENT } from "./shark-rig.js";

type P3 = ArrayLike<number> | { x: number; y: number; z: number };
const get = (p: P3, i: number): number => (Array.isArray(p) || ArrayBuffer.isView(p) ? (p as ArrayLike<number>)[i] : ([(p as any).x, (p as any).y, (p as any).z][i]));

const v = (p: P3, out: Vector3): Vector3 => out.set(get(p, 0), get(p, 1), get(p, 2));

export class HandSolver {
  private bind: Vector3[];
  private bindQ = new Quaternion();
  private bindLen: number[] = [];
  private bindDir: Vector3[] = [];
  private bindPalm: number;
  private cur: Vector3[] = Array.from({ length: 25 }, () => new Vector3());
  private qs: Quaternion[] = Array.from({ length: HAND_BONES.length }, () => new Quaternion());
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private m = new Matrix4();
  private m2 = new Matrix4();
  private q = new Quaternion();

  constructor(bindJoints: P3[]) {
    this.bind = bindJoints.map((p) => v(p, new Vector3()));
    this.bindQ.copy(this.basis(this.bind));
    this.bindPalm = this.bind[11].distanceTo(this.bind[0]);
    HAND_BONES.forEach((bn, i) => {
      const d = this.bind[bn.b].clone().sub(this.bind[bn.a]);
      this.bindLen[i] = d.length();
      this.bindDir[i] = d.normalize();
    });
  }

  /** Orientation of the palm from the wrist, the middle knuckle and the index and little knuckles. */
  private basis(J: Vector3[]): Quaternion {
    const f = this.a.copy(J[11]).sub(J[0]).normalize();
    const s = this.b.copy(J[6]).sub(J[21]);
    s.addScaledVector(f, -s.dot(f)).normalize();
    const n = this.c.crossVectors(f, s).normalize();
    this.m.makeBasis(s, n, f);
    return new Quaternion().setFromRotationMatrix(this.m);
  }

  /** `joints` = 25 points (arrays or {x,y,z}), same space as the bind joints. Writes 16 matrices into `out`. */
  solve(joints: P3[], out: Matrix4[]): void {
    for (let i = 0; i < 25; i++) v(joints[i], this.cur[i]);
    const J = this.cur;
    const qp = this.basis(J).multiply(this.bindQ.clone().invert());
    const kp = Math.max(0.6, Math.min(1.6, J[11].distanceTo(J[0]) / this.bindPalm));
    // palm: T(wrist) R S T(-bindWrist)
    this.compose(out[0], J[0], qp, kp, null, this.bind[0]);
    this.qs[0].copy(qp);
    for (let i = 1; i < HAND_BONES.length; i++) {
      const bn = HAND_BONES[i];
      const par = this.qs[HAND_PARENT[i]];
      const d0 = this.a.copy(this.bindDir[i]).applyQuaternion(par);
      const d1 = this.b.copy(J[bn.b]).sub(J[bn.a]);
      const len = d1.length() || 1e-5;
      d1.multiplyScalar(1 / len);
      this.q.setFromUnitVectors(d0, d1);
      const qi = this.qs[i].copy(this.q).multiply(par);
      this.compose(out[i], J[bn.a], qi, len / this.bindLen[i], this.bindDir[i], this.bind[bn.a]);
    }
  }

  /** T(at) * R(q) * Scale(k along axis, or uniformly when axis is null) * T(-bindAt) */
  private compose(out: Matrix4, at: Vector3, q: Quaternion, k: number, axis: Vector3 | null, bindAt: Vector3): void {
    const s = this.m2;
    if (axis) {
      const d = k - 1;
      s.set(
        1 + d * axis.x * axis.x, d * axis.x * axis.y, d * axis.x * axis.z, 0,
        d * axis.x * axis.y, 1 + d * axis.y * axis.y, d * axis.y * axis.z, 0,
        d * axis.x * axis.z, d * axis.y * axis.z, 1 + d * axis.z * axis.z, 0,
        0, 0, 0, 1,
      );
    } else s.makeScale(k, k, k);
    out.makeRotationFromQuaternion(q).multiply(s);
    out.premultiply(this.m.makeTranslation(at.x, at.y, at.z));
    out.multiply(this.m.makeTranslation(-bindAt.x, -bindAt.y, -bindAt.z));
  }
}
