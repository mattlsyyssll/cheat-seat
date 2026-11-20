/** The player's arm (stage D, judge fix 3: "the player's arm as a rigid dark tube"). A tapering jacket sleeve that starts at a cream cuff on the
 * wrist, bends at an elbow found by two-bone IK (so it bends toward the player's own shoulder, whatever way the hand reaches) and runs on to the
 * shoulder, below the edge of the picture. Drawn as one small mesh of rings, rebuilt every frame (about 200 vertices). */
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Mesh, Vector3, Group, type Material } from "@iwsdk/core";
import { twoBone } from "./shark-rig.js";

type V3 = { x: number; y: number; z: number };
const SEG = 14;
/** Distance from the wrist along the arm (metres) of each ring. Two rings 1.5 mm apart make the sharp edge where the cuff ends and the sleeve begins. */
const D = [0, 0.004, 0.0345, 0.036, 0.0362, 0.05, 0.1, 0.18, 0.26, 0.36, 0.46, 0.57];
const CUFF_RINGS = 4; // rings 0 to 3 are the cuff (cream); the sleeve (jacket colour) starts with ring 4
/** Radius at each ring (metres): a turned-back cuff, then a sleeve that widens toward the elbow and the shoulder. */
const R = [0.0405, 0.0455, 0.0455, 0.0455, 0.0418, 0.0425, 0.0455, 0.0495, 0.0535, 0.0565, 0.058, 0.059];
const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const SLEEVE = [0.2, 0.23, 0.33].map(srgb);
const CUFF = [0.95, 0.92, 0.84].map(srgb);
export const ARM_UPPER = 0.3;
export const ARM_FORE = 0.27;

export class Arm {
  readonly mesh: Mesh;
  private geo = new BufferGeometry();
  private pos: Float32Array;
  private rings = D.length;
  private p0 = new Vector3();
  private e = new Vector3();
  private s = new Vector3();
  private c = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private t = new Vector3();
  private r = new Vector3();
  private u = new Vector3();

  constructor(material: Material) {
    const nv = this.rings * SEG;
    this.pos = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const idx: number[] = [];
    for (let i = 0; i < this.rings; i++) {
      const c = i < CUFF_RINGS ? CUFF : SLEEVE;
      for (let j = 0; j < SEG; j++) col.set(c, (i * SEG + j) * 3);
    }
    for (let i = 0; i < this.rings - 1; i++)
      for (let j = 0; j < SEG; j++) {
        const a = i * SEG + j, b = i * SEG + ((j + 1) % SEG), c = (i + 1) * SEG + j, d = (i + 1) * SEG + ((j + 1) % SEG);
        idx.push(a, b, c, b, d, c);
      }
    // the wrist end is closed with a flat disc so the cuff is never seen hollow
    const cc = nv;
    const capPos = new Float32Array((nv + 1) * 3);
    this.pos = capPos;
    const colAll = new Float32Array((nv + 1) * 3);
    colAll.set(col);
    colAll.set(CUFF, nv * 3);
    for (let j = 0; j < SEG; j++) idx.push(cc, (j + 1) % SEG, j);
    this.geo.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new Float32BufferAttribute(colAll, 3));
    this.geo.setIndex(new Uint16BufferAttribute(Uint16Array.from(idx), 1));
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = "arm";
    this.mesh.visible = false;
  }

  /** Shape the arm for this frame. `wrist` and `back` (a unit vector from the knuckles toward the wrist) place the cuff; `shoulder` is the player's shoulder;
   * `side` is +1 for the right arm and -1 for the left (the elbow falls outward and down). Table-local metres. */
  update(wrist: V3, back: V3, shoulder: V3, side: number): void {
    this.p0.set(wrist.x + back.x * 0.012, wrist.y + back.y * 0.012, wrist.z + back.z * 0.012);
    this.s.set(shoulder.x, shoulder.y, shoulder.z);
    const ik = twoBone([shoulder.x, shoulder.y, shoulder.z], [this.p0.x, this.p0.y, this.p0.z], ARM_UPPER, ARM_FORE, [side * 0.6, -1, 0.35]);
    this.e.set(ik.elbow[0], ik.elbow[1], ik.elbow[2]);
    // a quadratic curve through the wrist, the elbow (at its middle) and the shoulder
    this.c.copy(this.e).multiplyScalar(2).addScaledVector(this.p0, -0.5).addScaledVector(this.s, -0.5);
    const L = this.p0.distanceTo(this.e) + this.e.distanceTo(this.s);
    const pos = this.pos;
    for (let i = 0; i < this.rings; i++) {
      const tt = Math.min(1, D[i] / L);
      const w0 = (1 - tt) * (1 - tt), w1 = 2 * tt * (1 - tt), w2 = tt * tt;
      this.a.set(w0 * this.p0.x + w1 * this.c.x + w2 * this.s.x, w0 * this.p0.y + w1 * this.c.y + w2 * this.s.y, w0 * this.p0.z + w1 * this.c.z + w2 * this.s.z);
      // tangent: the derivative of the curve
      this.t.set(
        2 * (1 - tt) * (this.c.x - this.p0.x) + 2 * tt * (this.s.x - this.c.x),
        2 * (1 - tt) * (this.c.y - this.p0.y) + 2 * tt * (this.s.y - this.c.y),
        2 * (1 - tt) * (this.c.z - this.p0.z) + 2 * tt * (this.s.z - this.c.z),
      ).normalize();
      this.u.set(0, 1, 0);
      if (Math.abs(this.t.dot(this.u)) > 0.95) this.u.set(1, 0, 0);
      this.r.crossVectors(this.t, this.u).normalize();
      this.b.crossVectors(this.r, this.t).normalize();
      for (let j = 0; j < SEG; j++) {
        const an = (j / SEG) * Math.PI * 2, cs = Math.cos(an) * R[i], sn = Math.sin(an) * R[i];
        const o = (i * SEG + j) * 3;
        pos[o] = this.a.x + this.r.x * cs + this.b.x * sn;
        pos[o + 1] = this.a.y + this.r.y * cs + this.b.y * sn;
        pos[o + 2] = this.a.z + this.r.z * cs + this.b.z * sn;
      }
    }
    // the centre of the cap at the wrist end
    const o = this.rings * SEG * 3;
    pos[o] = this.p0.x; pos[o + 1] = this.p0.y; pos[o + 2] = this.p0.z;
    const attr = this.geo.getAttribute("position") as Float32BufferAttribute;
    attr.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

/** Where a player's shoulder is, from the head: 19 cm to the side, 30 cm down and a little back. `dir` is the way the head faces (table-local). */
export function shoulderOf(head: V3, dir: V3, side: number): V3 {
  const l = Math.hypot(dir.x, dir.z) || 1;
  const fx = dir.x / l, fz = dir.z / l;
  const rx = -fz, rz = fx; // to the player's right
  return { x: head.x + rx * 0.19 * side - fx * 0.03, y: head.y - 0.3, z: head.z + rz * 0.19 * side - fz * 0.03 };
}

export type { Group };
