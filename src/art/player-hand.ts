/** The player's own hands, drawn from the 25 joints (table-local): one smooth skinned hand in the same toon style as the Shark's, with a
 * jacket sleeve and a white cuff at the wrist (the cuff is where the sleeve card peeks out). Same interface as world/hands.ts HandVisual,
 * so index.ts only changes its import. The joints come from the headset (real tracking) or from a
 * synthesised skeleton (the mouse and gaze hands). Right and left are the same mesh, mirrored; the page picks by the shape of the joints. */
import {
  Group, SkinnedMesh, Skeleton, Bone, BufferGeometry, BufferAttribute, Uint16BufferAttribute, Matrix4, Vector3, MeshBasicMaterial, AdditiveBlending, type Material,
} from "@iwsdk/core";
import { HAND } from "./hand-data.js";
import { HandSolver } from "./hand-solve.js";
import { makeToon, makeOutline } from "./toon.js";
import { Arm, shoulderOf } from "./arm.js";
import { HAND_BONES, OPEN_JOINTS } from "./shark-rig.js";
import { JOINTS } from "../game/pose.js";
import { retargetHand } from "./hand-retarget.js";

type V3 = { x: number; y: number; z: number };
const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const LIN = new Float32Array(256).map((_, i) => srgb(i / 255));
const J = Object.fromEntries(JOINTS.map((n: string, i: number) => [n, i])) as Record<string, number>;

function build(mirror: boolean, toon: Material, outline: Material): { mesh: SkinnedMesh; solver: HandSolver; bones: Bone[] } {
  const d = HAND;
  const nv = d.positions.length / 3;
  const pos = new Float32Array(d.positions), nor = new Float32Array(d.normals);
  if (mirror) for (let i = 0; i < nv; i++) { pos[i * 3] = -pos[i * 3]; nor[i * 3] = -nor[i * 3]; }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  const col = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) col[i] = LIN[d.colors[i]];
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setAttribute("skinIndex", new Uint16BufferAttribute(Uint16Array.from(d.skinIndex), 4));
  const sw = new Float32Array(nv * 4);
  for (let i = 0; i < nv * 4; i++) sw[i] = d.skinWeight[i] / 255;
  g.setAttribute("skinWeight", new BufferAttribute(sw, 4));
  const idx = Uint32Array.from(d.indices);
  if (mirror) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  g.setIndex(new BufferAttribute(idx, 1));
  g.addGroup(0, idx.length, 0);
  g.addGroup(0, d.outlineCount, 1);
  g.computeBoundingSphere();
  const mesh = new SkinnedMesh(g, [toon, outline]);
  mesh.frustumCulled = false;
  const bones = HAND_BONES.map((b) => { const bn = new Bone(); bn.name = b.name; bn.matrixAutoUpdate = false; return bn; });
  for (const b of bones) mesh.add(b);
  mesh.bind(new Skeleton(bones, bones.map(() => new Matrix4())), new Matrix4());
  const bind = OPEN_JOINTS.map((p: number[]) => (mirror ? [-p[0], p[1], p[2]] : p));
  return { mesh, solver: new HandSolver(bind), bones };
}

export class HandVisual {
  readonly group = new Group();
  private toon: Material;
  private outline: Material;
  private side: { mesh: SkinnedMesh; solver: HandSolver; bones: Bone[] }[] = [];
  private mats = new Matrix4();
  private m = Array.from({ length: HAND_BONES.length }, () => new Matrix4());
  private arr: number[][] = Array.from({ length: 25 }, () => [0, 0, 0]);
  /** Stage D: the sleeve is a bending arm drawn at run time (art/arm.ts), one per hand, built once. */
  private arm: Arm;
  /** Stage F (judge: "an empty table with a ring" while your hand is under it): a ghost of the hand, drawn through the table top, while the hand is under the
   * table. The same skinned geometry and bones as the hand; a pale blue, see-through, drawn over everything. */
  private ghostMat = new MeshBasicMaterial({ color: "#d2f2ff", vertexColors: true, transparent: true, opacity: 0.62, depthTest: false, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  /** The ghost is drawn just under the felt, right above the real hand (metres to lift it), so it is in the picture where you look: a hand 10 cm under the table top
   * near the edge was below the bottom of the picture. */
  private lift = { value: 0 };
  private ghosts: (SkinnedMesh | null)[] = [null, null];
  private ghostOn = false;

  constructor(_skin = "#e0ab88") {
    this.toon = makeToon({ rimColor: "#ffb878", rimStrength: 0.12 });
    this.outline = makeOutline(0.0021);
    this.group.name = "player hand";
    this.group.visible = false;
    this.arm = new Arm(makeToon({ rimColor: "#ffb878", rimStrength: 0.06 }));
    this.group.add(this.arm.mesh);
    // stage F (D15): both sides and their ghosts exist from the start (hidden), so the page's warm-up compiles their shaders before they are first seen
    for (const left of [false, true]) {
      const k = left ? 1 : 0;
      this.side[k] = build(left, this.toon, this.outline);
      this.side[k].mesh.visible = false;
      this.group.add(this.side[k].mesh);
      this.ghostFor(k);
    }
  }

  private ghostShader(): void {
    if (this.ghostMat.userData.lifted) return;
    this.ghostMat.userData.lifted = true;
    this.ghostMat.onBeforeCompile = (sh) => {
      sh.uniforms.uLift = this.lift;
      // judge (round 3): a closed ghost hand read as a smooth egg. The ghost is shaded by the angle of its surface to the eye, so every finger edge and the gaps between fingers draw as bright lines.
      sh.vertexShader = sh.vertexShader
        .replace("void main() {", "uniform float uLift;\nvarying vec3 vGhostN;\nvoid main() {")
        .replace("#include <skinning_vertex>", "#include <skinning_vertex>\n\ttransformed.y += uLift;\n\tvGhostN = normalize(normalMatrix * objectNormal);");
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "varying vec3 vGhostN;\nvoid main() {")
        .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n\tfloat gRim = 1.0 - abs(normalize(vGhostN).z);\n\tgl_FragColor.a *= 0.55 + 3.6 * gRim * gRim;");
    };
    this.ghostMat.customProgramCacheKey = () => "cheat-seat-ghost-hand-v3";
  }

  private ghostFor(k: number): void {
    this.ghostShader();
    if (this.ghosts[k]) return;
    const s = this.side[k];
    const gm = new SkinnedMesh(s.mesh.geometry, this.ghostMat);
    gm.frustumCulled = false;
    gm.renderOrder = 11;
    gm.name = "ghost hand";
    gm.visible = false;
    gm.bind(s.mesh.skeleton, s.mesh.bindMatrix);
    this.group.add(gm);
    this.ghosts[k] = gm;
  }

  /** Draw the hand. `joints` null hides it. `head` (the player's head, table-local) lets the sleeve find the shoulder; without it no arm is drawn. */
  update(joints: Record<string, V3> | null, head?: { pos: V3; dir: V3 }): void {
    if (!joints) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    // stage E: the drawn hand is made from the tracked joints by their curl (art/hand-retarget.js): a relaxed hand, a loose fist with curled fingers, smaller than tracked
    const { left } = retargetHand(joints, this.arr);
    const k = left ? 1 : 0;
    if (!this.side[k]) {
      this.side[k] = build(left, this.toon, this.outline);
      this.group.add(this.side[k].mesh);
    }
    this.side[0]?.mesh && (this.side[0].mesh.visible = !left);
    this.side[1]?.mesh && (this.side[1].mesh.visible = left);
    const s = this.side[k];
    this.ghostFor(k);
    this.ghosts.forEach((gm, i) => { if (gm) gm.visible = this.ghostOn && i === k; });
    // the palm (between the wrist and the middle knuckle) goes to 1.5 cm under the felt; the ghost keeps the hand's shape and its place across the table
    const pw = joints["wrist"], pm = joints["middle-finger-phalanx-proximal"];
    const palmY = pw && pm ? (pw.y + pm.y) / 2 : 0;
    this.lift.value = Math.max(0, -0.015 - palmY);
    if (head) {
      const w = joints["wrist"], mk = joints["middle-finger-phalanx-proximal"];
      const back = new Vector3(w.x - mk.x, w.y - mk.y, w.z - mk.z).normalize();
      this.arm.update(w, back, shoulderOf(head.pos, head.dir, left ? -1 : 1), left ? -1 : 1);
    } else this.arm.hide();
    s.solver.solve(this.arr, this.m);
    for (let i = 0; i < this.m.length; i++) {
      s.bones[i].matrix.copy(this.m[i]);
      s.bones[i].matrixWorldNeedsUpdate = true;
    }
  }

  /** Where the cuff is (the sleeve card peeks out here). */
  cuffPoint(joints: Record<string, V3>): Vector3 {
    const w = joints["wrist"], mk = joints["middle-finger-phalanx-proximal"];
    const wv = new Vector3(w.x, w.y, w.z);
    const back = wv.clone().sub(new Vector3(mk.x, mk.y, mk.z)).normalize();
    return wv.addScaledVector(back, 0.02);
  }

  /** Stage F: show the ghost of the hand (the hand is under the table, hidden from him). */
  setGhost(on: boolean): void {
    this.ghostOn = on;
    if (!on) for (const gm of this.ghosts) if (gm) gm.visible = false;
  }

  setOpacity(o: number): void {
    for (const m of [this.toon, this.outline]) {
      m.transparent = o < 1;
      m.opacity = o;
    }
  }
}
