/** The player's own hands, drawn from 25 joints (table-local): capsules for the bones, balls for the joints, a palm slab, a jacket
 * sleeve and a white cuff at the wrist (the cuff is where the sleeve card peeks out). The joints come from the headset (real
 * tracking) or from a synthesised skeleton (the mouse and gaze hands, see game/synth.js). One InstancedMesh per kind: cheap. */
import {
  Group, Mesh, InstancedMesh, CylinderGeometry, SphereGeometry, BoxGeometry, MeshStandardMaterial, Object3D, Vector3, Quaternion, Matrix4,
} from "@iwsdk/core";
import { JOINTS } from "../game/pose.js";
import { POSE_RADII } from "../game/synth.js";

type V3 = { x: number; y: number; z: number };

const FINGER_CHAINS: string[][] = ["index", "middle", "ring", "pinky"].map((f) => [
  `${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`, `${f}-finger-phalanx-intermediate`, `${f}-finger-phalanx-distal`, `${f}-finger-tip`,
]);
const THUMB = ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"];
const PALM_BONES: [string, string][] = [
  ["wrist", "index-finger-metacarpal"], ["wrist", "middle-finger-metacarpal"], ["wrist", "ring-finger-metacarpal"], ["wrist", "pinky-finger-metacarpal"], ["wrist", "thumb-metacarpal"],
  ["index-finger-phalanx-proximal", "middle-finger-phalanx-proximal"], ["middle-finger-phalanx-proximal", "ring-finger-phalanx-proximal"], ["ring-finger-phalanx-proximal", "pinky-finger-phalanx-proximal"],
  ["index-finger-metacarpal", "pinky-finger-metacarpal"],
];
const BONES: { a: string; b: string; r: number }[] = [];
for (const c of FINGER_CHAINS) for (let i = 0; i < c.length - 1; i++) BONES.push({ a: c[i], b: c[i + 1], r: [0.011, 0.0098, 0.0088, 0.0078][i] });
for (let i = 0; i < THUMB.length - 1; i++) BONES.push({ a: THUMB[i], b: THUMB[i + 1], r: [0.0125, 0.0115, 0.0098][i] });
for (const [a, b] of PALM_BONES) BONES.push({ a, b, r: 0.0125 });

export class HandVisual {
  readonly group = new Group();
  private bones: InstancedMesh;
  private balls: InstancedMesh;
  private palm: Mesh;
  private sleeve: Mesh;
  private cuff: Mesh;
  private dummy = new Object3D();
  private up = new Vector3(0, 1, 0);

  constructor(skin = "#e0ab88") {
    const skinMat = new MeshStandardMaterial({ color: skin, roughness: 0.55, metalness: 0 });
    this.bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8, 1), skinMat, BONES.length);
    this.balls = new InstancedMesh(new SphereGeometry(1, 8, 6), skinMat, JOINTS.length);
    this.bones.frustumCulled = false;
    this.balls.frustumCulled = false;
    this.palm = new Mesh(new BoxGeometry(1, 1, 1), skinMat);
    this.sleeve = new Mesh(new CylinderGeometry(0.043, 0.05, 1, 12), new MeshStandardMaterial({ color: "#2b2422", roughness: 0.85 }));
    this.cuff = new Mesh(new CylinderGeometry(0.0425, 0.0425, 0.03, 14), new MeshStandardMaterial({ color: "#e8e1cf", roughness: 0.8 }));
    this.group.add(this.bones, this.balls, this.palm, this.sleeve, this.cuff);
    this.group.visible = false;
    this.group.name = "player hand";
  }

  /** Draw the hand. `joints` null hides it. */
  update(joints: Record<string, V3> | null): void {
    if (!joints) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const p = (n: string) => joints[n];
    const d = this.dummy;
    const a = new Vector3(), b = new Vector3(), dir = new Vector3();
    BONES.forEach((bn, i) => {
      const A = p(bn.a), B = p(bn.b);
      a.set(A.x, A.y, A.z);
      b.set(B.x, B.y, B.z);
      dir.copy(b).sub(a);
      const len = Math.max(1e-4, dir.length());
      d.position.copy(a).add(b).multiplyScalar(0.5);
      d.quaternion.setFromUnitVectors(this.up, dir.multiplyScalar(1 / len));
      d.scale.set(bn.r, len, bn.r);
      d.updateMatrix();
      this.bones.setMatrixAt(i, d.matrix);
    });
    this.bones.instanceMatrix.needsUpdate = true;
    JOINTS.forEach((n, i) => {
      const J = p(n);
      d.position.set(J.x, J.y, J.z);
      d.quaternion.identity();
      const r = Math.max(0.006, POSE_RADII[i] * 0.78);
      d.scale.set(r, r, r);
      d.updateMatrix();
      this.balls.setMatrixAt(i, d.matrix);
    });
    this.balls.instanceMatrix.needsUpdate = true;
    // the palm slab: from the wrist to the knuckles, across the index and pinky knuckles
    const w = p("wrist"), ik = p("index-finger-phalanx-proximal"), pk = p("pinky-finger-phalanx-proximal"), mk = p("middle-finger-phalanx-proximal");
    const wv = new Vector3(w.x, w.y, w.z), iv = new Vector3(ik.x, ik.y, ik.z), pv = new Vector3(pk.x, pk.y, pk.z), mv = new Vector3(mk.x, mk.y, mk.z);
    const across = iv.clone().sub(pv);
    const along = mv.clone().sub(wv);
    const normal = new Vector3().crossVectors(across, along).normalize();
    const x = across.clone().normalize(), z = along.clone().normalize(), y = new Vector3().crossVectors(z, x).normalize();
    void normal;
    const m = new Matrix4().makeBasis(x, y, z);
    this.palm.quaternion.setFromRotationMatrix(m);
    this.palm.position.copy(wv).add(mv).multiplyScalar(0.5).addScaledVector(z, -0.004);
    this.palm.scale.set(across.length() * 1.02, 0.026, along.length() * 1.04);
    // sleeve and cuff: from the wrist back along the arm (away from the knuckles)
    const back = wv.clone().sub(mv).normalize();
    const cuffPos = wv.clone().addScaledVector(back, 0.012);
    this.cuff.position.copy(cuffPos);
    this.cuff.quaternion.setFromUnitVectors(this.up, back);
    const sleeveLen = 0.2;
    this.sleeve.position.copy(wv).addScaledVector(back, 0.03 + sleeveLen / 2);
    this.sleeve.quaternion.setFromUnitVectors(this.up, back);
    this.sleeve.scale.set(1, sleeveLen, 1);
  }

  /** Where the cuff is (the sleeve card peeks out here). */
  cuffPoint(joints: Record<string, V3>): Vector3 {
    const w = joints["wrist"], mk = joints["middle-finger-phalanx-proximal"];
    const wv = new Vector3(w.x, w.y, w.z);
    const back = wv.clone().sub(new Vector3(mk.x, mk.y, mk.z)).normalize();
    return wv.addScaledVector(back, 0.02);
  }

  setOpacity(o: number): void {
    for (const m of [this.bones.material, this.balls.material, this.palm.material] as MeshStandardMaterial[]) {
      m.transparent = o < 1;
      m.opacity = o;
    }
  }
}
