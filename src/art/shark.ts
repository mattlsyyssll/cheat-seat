/** The Shark: a hat on a faceted head, two eye orbs, a chest with shoulders, a bow
 * tie, two gloves and a mouth line. Flat-shaded low-poly shapes, no textures except
 * a soft shadow on the felt. No rig and no character animation system: the gloves
 * are moved by the game, the eyes and hat by a few numbers. */
import {
  Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, BoxGeometry, CylinderGeometry,
  PlaneGeometry, IcosahedronGeometry, Vector3,
} from "@iwsdk/core";
import { mergeParts, type Part } from "./geom.js";
import { ZONES } from "../game/layout.js";
import type { Textures } from "./textures.js";

export interface Shark {
  /** Hat, face, eyes and mouth. Sits at the hat spot, y = desk surface. */
  group: Group;
  hat: Group;
  eyeL: Mesh;
  eyeR: Mesh;
  mouth: Mesh;
  /** Gloves live in table-local coordinates; add them to the table group. */
  gloveR: Group;
  gloveL: Group;
  /** Eye midpoint in table-local coordinates (the cone starts here). */
  eyePoint: Vector3;
  /** 0..1: the eyes shift from cream to hot orange as suspicion rises. */
  setEyeTint(t: number): void;
}

/** The Shark is drawn a little larger than life so he reads from across a desk. */
export const SHARK_SCALE = 1.5;
/** Where the hat rests on the head (group-local), and how far it is tipped back. */
export const HAT_Y = 0.134;
export const HAT_TIP = -0.32;
export const SHOULDER_R = { x: -0.11, z: -0.34 };
export const SHOULDER_L = { x: 0.11, z: -0.34 };

function gloveMesh(thumbSide: number): Mesh {
  const parts: Part[] = [
    { geometry: new BoxGeometry(0.038, 0.014, 0.04), color: "#ddd6c4" },
    ...[-0.0135, -0.0045, 0.0045, 0.0135].map<Part>((x) => ({
      geometry: new BoxGeometry(0.0075, 0.011, 0.03),
      color: "#e6dfcd",
      position: [x, 0, 0.034],
    })),
    {
      geometry: new BoxGeometry(0.01, 0.011, 0.026),
      color: "#d8d1bf",
      position: [0.025 * thumbSide, 0, 0.012],
      rotation: [0, -0.5 * thumbSide, 0],
    },
    { geometry: new BoxGeometry(0.036, 0.02, 0.016), color: "#8c6b2c", position: [0, 0.001, -0.028] },
  ];
  return new Mesh(mergeParts(parts), new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** The sleeve: a box that starts at the cuff and runs back along -z. Its length is set by placeGlove so
 * it always reaches the shoulder (short when the glove is near it, long when he reaches across). */
const SLEEVE_BASE = 0.2;
const CUFF_Z = -0.038;
function sleeveMesh(): Mesh {
  const g = new BoxGeometry(0.034, 0.022, SLEEVE_BASE);
  g.translate(0, 0.002, -SLEEVE_BASE / 2);
  const m = new Mesh(g, new MeshLambertMaterial({ color: "#241a17", flatShading: true }));
  m.position.z = CUFF_Z;
  m.name = "sleeve";
  return m;
}

export function createShark(textures: Textures): Shark {
  const group = new Group();
  group.name = "shark";
  group.position.set(ZONES.hat.x, 0, ZONES.hat.z);

  // soft contact shadow so he sits on the felt, not in front of it
  const shadow = new Mesh(
    new PlaneGeometry(0.46, 0.26),
    new MeshBasicMaterial({ map: textures.glow, color: "#000000", transparent: true, opacity: 0.55, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.0025, 0.0);
  shadow.renderOrder = 1;
  group.add(shadow);

  // chest, shoulders, shirt, lapels, bow tie, neck and head: one lit, faceted mesh
  const JACKET = "#2d2320", LAPEL = "#4a352d", SHIRT = "#d9cdb2", TIE = "#9a3126", HEAD = "#1b1411", NOSE = "#38271e";
  const bodyParts: Part[] = [
    { geometry: new CylinderGeometry(0.1, 0.15, 0.072, 10), color: JACKET, position: [0, 0.036, -0.006], scale: [1, 1, 0.5] },
    ...[-1, 1].map<Part>((sx) => ({
      geometry: new IcosahedronGeometry(0.044, 1), color: JACKET, position: [sx * 0.112, 0.04, -0.012], scale: [1.3, 0.66, 0.9],
    })),
    { geometry: new BoxGeometry(0.052, 0.062, 0.008), color: SHIRT, position: [0, 0.04, 0.0535] },
    ...[-1, 1].map<Part>((sx) => ({
      geometry: new BoxGeometry(0.013, 0.07, 0.01), color: LAPEL, position: [sx * 0.036, 0.04, 0.056], rotation: [0, 0, sx * -0.3],
    })),
    ...[-1, 1].map<Part>((sx) => ({
      geometry: new BoxGeometry(0.02, 0.013, 0.01), color: TIE, position: [sx * 0.0125, 0.068, 0.059], rotation: [0, 0, sx * 0.4],
    })),
    { geometry: new BoxGeometry(0.01, 0.013, 0.011), color: TIE, position: [0, 0.068, 0.06] },
    { geometry: new CylinderGeometry(0.026, 0.03, 0.04, 8), color: HEAD, position: [0, 0.07, 0.0] },
    { geometry: new IcosahedronGeometry(1, 1), color: HEAD, position: [0, 0.105, 0.0], scale: [0.062, 0.057, 0.052] },
    { geometry: new BoxGeometry(0.014, 0.022, 0.016), color: NOSE, position: [0, 0.084, 0.046], rotation: [0.3, 0, 0] },
  ];
  const body = new Mesh(mergeParts(bodyParts), new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  body.name = "shark body";
  group.add(body);

  // hat, tipped back so the brim does not hide the eyes from a seated player; the head fills the crown
  const hat = new Group();
  hat.position.set(0, HAT_Y, -0.02);
  hat.rotation.x = HAT_TIP;
  const hatParts: Part[] = [
    { geometry: new CylinderGeometry(0.098, 0.104, 0.007, 12), color: "#3b2c22" },
    { geometry: new CylinderGeometry(0.056, 0.07, 0.078, 12), color: "#4a382d", position: [0, 0.042, 0] },
    { geometry: new CylinderGeometry(0.0715, 0.0722, 0.014, 12), color: "#8c6b2c", position: [0, 0.013, 0] },
    { geometry: new BoxGeometry(0.05, 0.02, 0.022), color: "#2a1e17", position: [0, 0.083, 0], rotation: [0, 0, 0.06] },
  ];
  const hatMesh = new Mesh(mergeParts(hatParts), new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  hat.add(hatMesh);
  hat.rotation.z = 0.05;
  group.add(hat);

  const eyeMat = () => new MeshBasicMaterial({ color: "#ffeeb4" });
  const eyeGeo = new IcosahedronGeometry(0.0125, 1);
  const eyeL = new Mesh(eyeGeo, eyeMat());
  const eyeR = new Mesh(eyeGeo, eyeMat());
  eyeL.position.set(0.03, 0.09, 0.041);
  eyeR.position.set(-0.03, 0.09, 0.041);
  group.add(eyeL, eyeR);

  const mouth = new Mesh(new BoxGeometry(0.045, 0.004, 0.002), new MeshBasicMaterial({ color: "#7a2a22" }));
  mouth.position.set(0, 0.066, 0.0375);
  group.add(mouth);

  const gloveR = new Group();
  gloveR.add(gloveMesh(1), sleeveMesh());
  const gloveL = new Group();
  gloveL.add(gloveMesh(-1), sleeveMesh());
  gloveR.scale.setScalar(SHARK_SCALE);
  gloveL.scale.setScalar(SHARK_SCALE);

  const setEyeTint = (t: number) => {
    const k = Math.max(0, Math.min(1, t));
    for (const e of [eyeL, eyeR]) (e.material as MeshBasicMaterial).color.setRGB(1, 0.93 - 0.55 * k, 0.71 - 0.6 * k);
  };

  return {
    group, hat, eyeL, eyeR, mouth, gloveR, gloveL, setEyeTint,
    eyePoint: new Vector3(ZONES.hat.x, 0.09 * SHARK_SCALE, ZONES.hat.z + 0.041 * SHARK_SCALE),
  };
}

/** Put a glove at (x, y, z) with the sleeve running back to its shoulder. */
export function placeGlove(glove: Group, shoulder: { x: number; z: number }, x: number, y: number, z: number): void {
  glove.position.set(x, y, z);
  const dx = x - shoulder.x, dz = z - shoulder.z;
  glove.rotation.y = Math.atan2(dx, dz);
  const sleeve = glove.getObjectByName("sleeve");
  if (sleeve) {
    // from the cuff to just inside the shoulder, in world metres, as a share of the unit sleeve
    const need = Math.hypot(dx, dz) - Math.abs(CUFF_Z) * SHARK_SCALE + 0.03;
    sleeve.scale.z = Math.max(0.12, Math.min(2.4, need / (SLEEVE_BASE * SHARK_SCALE)));
  }
}
