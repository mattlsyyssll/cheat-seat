/** The placeholder Shark (stage A). Plain lit shapes, a readable face (eyes with lids, brows, nose, jaw), a green dealer's visor,
 * a jacket, arms solved with two bones, hands with curling fingers. Stage B replaces it through `SharkAvatarFactory` (interface.ts).
 * It draws a `SharkPose`; it never reads game state. */
import {
  Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, SphereGeometry, BoxGeometry, CylinderGeometry, Vector3, Matrix4, Quaternion,
} from "@iwsdk/core";
import type { SharkAvatar, SharkPose } from "./interface.js";

const SKIN = "#d4a283", SKIN_SHADE = "#b07a5c", HAIR = "#15100d", JACKET = "#2b2422", SHIRT = "#e8e1cf", TIE = "#8a2b22", VISOR = "#2f6b45";

const mat = (color: string, rough = 0.7) => new MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });

function ellipsoid(r: number, sx: number, sy: number, sz: number, color: string, seg = 20): Mesh {
  const m = new Mesh(new SphereGeometry(r, seg, Math.round(seg * 0.7)), mat(color, 0.62));
  m.scale.set(sx, sy, sz);
  return m;
}

/** A cylinder between two points (the geometry runs along +y, height 1). */
function between(mesh: Mesh, a: Vector3, b: Vector3, radiusScale = 1): void {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length() || 1e-4;
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.multiplyScalar(1 / len));
  mesh.scale.set(radiusScale, len, radiusScale);
}

/** Two-bone arm: the elbow for a shoulder S, wrist W, bone lengths L1 and L2 and a pole direction (where the elbow points). The arm
 * stretches (up to 25 percent) when the wrist is out of reach, so a slam always lands where it is aimed. */
export function twoBone(S: Vector3, W: Vector3, L1: number, L2: number, pole: Vector3): { elbow: Vector3; wrist: Vector3; stretch: number } {
  const d = W.clone().sub(S);
  let dist = d.length() || 1e-4;
  const dir = d.clone().multiplyScalar(1 / dist);
  let k = 1;
  const reach = L1 + L2;
  if (dist > reach * 0.985) k = Math.min(1.25, (dist / (reach * 0.985)));
  const l1 = L1 * k, l2 = L2 * k;
  dist = Math.min(dist, (l1 + l2) * 0.999);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
  p.normalize();
  const elbow = S.clone().add(dir.clone().multiplyScalar(a)).add(p.multiplyScalar(h));
  return { elbow, wrist: W.clone(), stretch: k };
}

interface HandParts { group: Group; fingers: Group[]; tips: Group[]; thumb: Group; cuff: Mesh }

function makeHand(right: boolean, skin: MeshStandardMaterial): HandParts {
  const group = new Group();
  const palm = new Mesh(new BoxGeometry(0.082, 0.024, 0.088), skin);
  palm.position.set(0, 0, 0.044);
  group.add(palm);
  const fingers: Group[] = [], tips: Group[] = [];
  const lens = [0.034, 0.038, 0.036, 0.029];
  for (let i = 0; i < 4; i++) {
    const x = -0.031 + i * 0.0207;
    const g1 = new Group();
    g1.position.set(x, 0, 0.088);
    const a = new Mesh(new BoxGeometry(0.0185, 0.0185, lens[i]), skin);
    a.position.z = lens[i] / 2;
    g1.add(a);
    const g2 = new Group();
    g2.position.z = lens[i];
    const b = new Mesh(new BoxGeometry(0.0165, 0.0165, lens[i] * 0.85), skin);
    b.position.z = (lens[i] * 0.85) / 2;
    g2.add(b);
    g1.add(g2);
    group.add(g1);
    fingers.push(g1);
    tips.push(g2);
  }
  const thumb = new Group();
  thumb.position.set(right ? 0.043 : -0.043, -0.002, 0.026);
  thumb.rotation.y = right ? -0.55 : 0.55;
  const t1 = new Mesh(new BoxGeometry(0.02, 0.02, 0.04), skin);
  t1.position.z = 0.02;
  thumb.add(t1);
  group.add(thumb);
  // the sleeve and cuff
  const cuff = new Mesh(new CylinderGeometry(0.036, 0.04, 0.05, 14), mat(SHIRT, 0.8));
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.012;
  group.add(cuff);
  return { group, fingers, tips, thumb, cuff };
}

export function createPlaceholderShark(): SharkAvatar {
  const root = new Group();
  root.name = "shark (placeholder)";
  const skin = mat(SKIN, 0.6);
  const jacketMat = mat(JACKET, 0.85);

  // ---- body
  const chest = ellipsoid(0.1, 2.1, 1.25, 1.1, JACKET, 18);
  const belly = new Mesh(new CylinderGeometry(0.15, 0.19, 1, 14), jacketMat);
  const shirt = new Mesh(new BoxGeometry(0.075, 0.2, 0.012), mat(SHIRT, 0.8));
  const tie = new Mesh(new BoxGeometry(0.022, 0.15, 0.01), mat(TIE, 0.7));
  const lapelL = new Mesh(new BoxGeometry(0.03, 0.2, 0.012), mat("#3b302d", 0.8));
  const lapelR = lapelL.clone();
  const neck = new Mesh(new CylinderGeometry(0.036, 0.042, 1, 10), skin);
  const shoulderBalls = [ellipsoid(0.07, 1, 0.95, 1, JACKET), ellipsoid(0.07, 1, 0.95, 1, JACKET)];
  const upper = [new Mesh(new CylinderGeometry(0.052, 0.046, 1, 12), jacketMat), new Mesh(new CylinderGeometry(0.052, 0.046, 1, 12), jacketMat)];
  const fore = [new Mesh(new CylinderGeometry(0.043, 0.036, 1, 12), jacketMat), new Mesh(new CylinderGeometry(0.043, 0.036, 1, 12), jacketMat)];
  const elbows = [ellipsoid(0.048, 1, 1, 1, JACKET, 10), ellipsoid(0.048, 1, 1, 1, JACKET, 10)];
  const handR = makeHand(true, skin), handL = makeHand(false, skin);
  const chair = new Mesh(new BoxGeometry(0.5, 0.75, 0.05), mat("#3a2418", 0.8));
  chair.position.set(0, 0.2, -0.82);
  root.add(chest, belly, shirt, tie, lapelL, lapelR, neck, ...shoulderBalls, ...upper, ...fore, ...elbows, handR.group, handL.group, chair);

  // ---- head (+z is forward)
  const head = new Group();
  const skull = ellipsoid(0.1, 0.95, 1.15, 1.02, SKIN, 24);
  const hair = ellipsoid(0.104, 0.98, 0.8, 1.05, HAIR, 20);
  hair.position.set(0, 0.035, -0.012);
  const visorBand = new Mesh(new CylinderGeometry(0.104, 0.104, 0.022, 20, 1, true), mat("#1d1815", 0.8));
  visorBand.position.set(0, 0.052, 0);
  visorBand.scale.set(0.97, 1, 1.05);
  const visorBrim = new Mesh(new BoxGeometry(0.15, 0.003, 0.05), new MeshStandardMaterial({ color: VISOR, roughness: 0.3, transparent: true, opacity: 0.5 }));
  visorBrim.position.set(0, 0.05, 0.108);
  visorBrim.rotation.x = 0.3;
  const nose = new Mesh(new BoxGeometry(0.018, 0.03, 0.026), mat(SKIN_SHADE, 0.6));
  nose.position.set(0, -0.012, 0.104);
  nose.rotation.x = 0.35;
  const earL = ellipsoid(0.02, 0.5, 1, 0.8, SKIN_SHADE, 8), earR = ellipsoid(0.02, 0.5, 1, 0.8, SKIN_SHADE, 8);
  earL.position.set(0.098, 0.0, -0.005);
  earR.position.set(-0.098, 0.0, -0.005);
  const mouthIn = new Mesh(new BoxGeometry(0.05, 0.02, 0.02), new MeshBasicMaterial({ color: "#2a0c0c" }));
  mouthIn.position.set(0, -0.052, 0.088);
  const lip = new Mesh(new BoxGeometry(0.052, 0.006, 0.012), mat("#8b4a3e", 0.5));
  lip.position.set(0, -0.043, 0.098);
  const jawPivot = new Group();
  jawPivot.position.set(0, -0.035, 0.03);
  const jaw = ellipsoid(0.07, 1.0, 0.55, 0.95, SKIN, 14);
  jaw.position.set(0, -0.03, 0.035);
  const chin = new Mesh(new BoxGeometry(0.05, 0.02, 0.03), skin);
  chin.position.set(0, -0.052, 0.08);
  const lowerLip = lip.clone();
  lowerLip.position.set(0, -0.032, 0.092);
  jawPivot.add(jaw, chin, lowerLip);
  head.add(skull, hair, visorBand, visorBrim, nose, earL, earR, mouthIn, lip, jawPivot);

  const eyeWhiteMat = new MeshStandardMaterial({ color: "#f2ecdc", roughness: 0.3 });
  const irisMat = new MeshBasicMaterial({ color: "#1c120c" });
  const eyes = [-1, 1].map((side) => {
    const g = new Group();
    g.position.set(side * 0.034, 0.013, 0.082);
    const white = new Mesh(new SphereGeometry(0.0165, 14, 10), eyeWhiteMat);
    const iris = new Mesh(new SphereGeometry(0.0082, 10, 8), irisMat);
    const lidMat = mat(SKIN_SHADE, 0.6);
    const lid = new Mesh(new BoxGeometry(0.04, 0.05, 0.004), lidMat);
    const lowerLid = new Mesh(new BoxGeometry(0.04, 0.012, 0.004), lidMat);
    const brow = new Mesh(new BoxGeometry(0.04, 0.0105, 0.012), new MeshStandardMaterial({ color: HAIR, roughness: 0.9 }));
    g.add(white, iris);
    head.add(g, lid, lowerLid, brow);
    return { g, iris, lid, lowerLid, brow, side };
  });
  root.add(head);

  const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3();
  const mtx = new Matrix4(), q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const v = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);

  function orient(group: Group, dir: Vector3): void {
    const z = dir.clone().normalize();
    const x = new Vector3().crossVectors(up, z);
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const y = new Vector3().crossVectors(z, x);
    mtx.makeBasis(x, y, z);
    group.quaternion.setFromRotationMatrix(mtx);
  }

  function apply(pose: SharkPose): void {
    const hp = v(pose.head.pos);
    head.position.copy(hp);
    head.rotation.set(pose.head.pitch, pose.head.yaw, pose.head.roll, "YXZ");
    jawPivot.rotation.x = pose.jaw * 0.38;
    mouthIn.scale.y = 0.4 + pose.jaw * 2.6;
    // eyes, lids, brows (head-local)
    const eyeData = [pose.eyes.l, pose.eyes.r];
    eyes.forEach((e, i) => {
      const ed = eyeData[i === 0 ? 1 : 0]; // side -1 is the player's left... eyes.l is the Shark's left eye (+x side)
      const yaw = ed.yaw, pitch = ed.pitch;
      e.iris.position.set(Math.sin(yaw) * Math.cos(pitch) * 0.0098, -Math.sin(pitch) * 0.0098, Math.cos(yaw) * Math.cos(pitch) * 0.0098);
      const lid = Math.max(0.02, Math.min(1.3, ed.lid));
      // the upper lid is a plate whose lower edge runs from the top of the eye (open) down to the bottom (shut)
      const edge = 0.0155 * (2 * Math.min(1, lid) - 1) + (lid > 1 ? 0.004 * (lid - 1) : 0);
      e.lid.position.set(e.side * 0.034, 0.013 + edge + 0.025, 0.0955);
      e.lowerLid.position.set(e.side * 0.034, 0.013 - 0.0155 + 0.006 * (1 - Math.min(1, lid)) * 0, 0.0955);
      const b = e.side < 0 ? pose.brows.r : pose.brows.l;
      e.brow.position.set(e.side * 0.034, 0.013 + 0.03 + 0.012 * b, 0.0955);
      e.brow.rotation.z = e.side * -0.32 * (-Math.min(0, b)) + e.side * 0.2 * Math.max(0, b);
    });
    // body
    const neckP = v(pose.torso.neck), hip = v(pose.torso.hip);
    const chestC = neckP.clone().add(tmpA.set(0, -0.085, -0.01));
    chest.position.copy(chestC);
    const br = 1 + 0.045 * pose.breath;
    chest.scale.set(2.1 * br, 1.25 * br, 1.1 * (1 + 0.05 * pose.breath));
    const bellyTop = chestC.clone().add(tmpA.set(0, -0.07, 0));
    between(belly, hip, bellyTop, 1);
    shirt.position.copy(chestC).add(tmpA.set(0, -0.015, 0.108));
    tie.position.copy(chestC).add(tmpA.set(0, -0.045, 0.114));
    lapelL.position.copy(chestC).add(tmpA.set(0.05, -0.02, 0.107));
    lapelR.position.copy(chestC).add(tmpA.set(-0.05, -0.02, 0.107));
    lapelL.rotation.z = -0.25;
    lapelR.rotation.z = 0.25;
    between(neck, neckP.clone().add(tmpA.set(0, -0.03, 0)), hp.clone().add(tmpB.set(0, -0.07, -0.01)), 1);
    // arms
    const arms = [
      { s: v(pose.shoulders.r), h: pose.handR, i: 0, pole: tmpC.set(-0.6, -1, 0.1).clone(), hp: handR },
      { s: v(pose.shoulders.l), h: pose.handL, i: 1, pole: tmpC.set(0.6, -1, 0.1).clone(), hp: handL },
    ];
    for (const a of arms) {
      shoulderBalls[a.i].position.copy(a.s);
      const w = v(a.h.wrist);
      const ik = twoBone(a.s, w, 0.3, 0.27, a.pole);
      between(upper[a.i], a.s, ik.elbow, 1);
      between(fore[a.i], ik.elbow, w, 1);
      elbows[a.i].position.copy(ik.elbow);
      a.hp.group.position.copy(w);
      orient(a.hp.group, v(a.h.dir));
      const open = a.h.open;
      const curl = (1 - open) * 1.35;
      a.hp.fingers.forEach((f, k) => {
        f.rotation.x = curl * (1 - k * 0.04);
        a.hp.tips[k].rotation.x = curl * 0.9;
      });
      a.hp.thumb.rotation.x = (1 - open) * 0.5;
    }
  }

  return {
    root,
    apply,
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose?.();
      });
    },
  };
}
