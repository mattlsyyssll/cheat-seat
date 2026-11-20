/** The set pieces of the booth, each built once: the felt mat, the card table (virtual table only), the hanging lamp with its cone of light,
 * the back room, the chair behind him and the strike lamp fittings. Everything static is merged into a few meshes with the lamp's light baked
 * into the vertex colours (unlit materials), so the whole set costs about 14 draw calls and no real-time light beyond the one lamp. */
import {
  Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, BufferGeometry, Float32BufferAttribute, DoubleSide, AdditiveBlending,
  ExtrudeGeometry, Matrix4, ShaderMaterial,
} from "@iwsdk/core";
import { mergeBaked, slab, turned, at, roundedRect, LAMP, type Part } from "./build.js";
import type { Textures } from "./textures.js";

const FELT = { x: 0.88, z: 0.48, cz: 0.01 };

/** Stage D (draw call budget): merge baked meshes that share one material kind (vertex colours, no texture) into one mesh, so they cost one draw call. */
export function mergeMeshes(meshes: Mesh[], name: string, material?: MeshBasicMaterial): Mesh {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (const m of meshes) {
    const g = m.geometry as BufferGeometry;
    const gp = g.getAttribute("position"), gn = g.getAttribute("normal"), gc = g.getAttribute("color");
    const base = pos.length / 3;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i) + m.position.x, gp.getY(i) + m.position.y, gp.getZ(i) + m.position.z);
      nor.push(gn.getX(i), gn.getY(i), gn.getZ(i));
      col.push(gc.getX(i), gc.getY(i), gc.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < gp.count; i++) idx.push(i + base);
    g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  const mesh = new Mesh(out, material ?? new MeshBasicMaterial({ vertexColors: true }));
  mesh.name = name;
  return mesh;
}

function plane(w: number, h: number): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  return g;
}

/** The felt mat: one plane with the baked texture. In flat play with no real desk it grows to fill the virtual table (setSize). */
export function makeFeltMat(t: Textures): Mesh<BufferGeometry, MeshBasicMaterial> {
  const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const m = new Mesh(g, new MeshBasicMaterial({ map: t.table }));
  m.name = "felt";
  m.position.set(0, 0.0009, FELT.cz);
  m.scale.set(FELT.x, 1, FELT.z);
  m.renderOrder = -1;
  return m;
}
export const FELT_SIZE = { real: [FELT.x, FELT.z] as const, virtual: [0.97, 0.58] as const };

/** A tapered tube with a colour that fades along its length (alpha in the colour). */
function fadeTube(r0: number, r1: number, y0: number, y1: number, a0: number, a1: number, rgb: [number, number, number], seg = 10, rows = 6): BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let k = 0; k <= rows; k++) {
    const t = k / rows, r = r0 + (r1 - r0) * t, y = y0 + (y1 - y0) * t, a = a0 + (a1 - a0) * t;
    for (let i = 0; i <= seg; i++) {
      const an = (i / seg) * Math.PI * 2;
      pos.push(Math.sin(an) * r, y, Math.cos(an) * r);
      col.push(rgb[0], rgb[1], rgb[2], a);
    }
  }
  for (let k = 0; k < rows; k++)
    for (let i = 0; i < seg; i++) {
      const a = k * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

const fadeMat = (blend: "add" | "normal", opacity = 1) =>
  new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, side: DoubleSide, ...(blend === "add" ? { blending: AdditiveBlending } : {}) });

export interface Lamp {
  group: Group;
  /** Brightness of the cone and halo, 0.. (1 = normal). */
  setGlow(k: number): void;
}

/** The hanging lamp: a green enamel cone with a brass rim and cap, a cord that fades into the dark, a glowing bulb, a faint cone of
 * light and a halo around the bulb. The pool of light on the felt is baked into the felt texture. */
export function makeLamp(t: Textures): Lamp {
  const group = new Group();
  group.name = "lamp";
  const y0 = 1.0;
  const outer = turned([[0.168, y0], [0.158, y0 + 0.03], [0.12, y0 + 0.085], [0.07, y0 + 0.128], [0.04, y0 + 0.145]], 28);
  const inner = turned([[0.04, y0 + 0.14], [0.068, y0 + 0.122], [0.116, y0 + 0.08], [0.154, y0 + 0.026], [0.164, y0 + 0.001]], 28);
  const rim = turned([[0.17, y0 - 0.004], [0.172, y0 + 0.004], [0.166, y0 + 0.012], [0.16, y0 + 0.004], [0.164, y0 - 0.004]], 28);
  const cap = turned([[0.02, y0 + 0.146], [0.024, y0 + 0.16], [0.012, y0 + 0.17], [0.012, y0 + 0.2]], 14);
  const lampParts: Part[] = [
    { geometry: outer, color: "#1f6b46" },
    { geometry: inner, color: "#fff0c8", glow: 1 },
    { geometry: rim, color: "#c8a04a" },
    { geometry: cap, color: "#c8a04a" },
    { geometry: new SphereGeometry(0.03, 16, 12), color: "#fff6dc", glow: 1, matrix: at(0, y0 - 0.0, 0) },
  ];
  const body = new Mesh(mergeBaked(lampParts), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  body.position.set(LAMP.x, 0, LAMP.z);
  group.add(body);
  // the cord, fading upward
  const cord = new Mesh(fadeTube(0.0035, 0.0035, y0 + 0.2, y0 + 0.95, 0.9, 0, [0.07, 0.06, 0.05], 6, 8), fadeMat("normal"));
  cord.position.set(LAMP.x, 0, LAMP.z);
  group.add(cord);
  // cone of light: from the rim to the felt. Bright near the lamp, nothing at the table, and soft at its sides (the edge fades where the
  // surface turns away from the eye), so it reads as haze and not as a solid triangle.
  const coneGeo = fadeTube(0.165, 0.66, y0 - 0.002, 0.004, 0.1, 0.0, [1, 0.78, 0.45], 36, 5);
  coneGeo.computeVertexNormals();
  const aA: number[] = [];
  const colA = coneGeo.getAttribute("color");
  for (let i = 0; i < colA.count; i++) aA.push(colA.getW(i));
  coneGeo.setAttribute("aA", new Float32BufferAttribute(aA, 1));
  coneGeo.deleteAttribute("color");
  const coneMat = new ShaderMaterial({
    uniforms: { uColor: { value: [1, 0.78, 0.45] }, uK: { value: 1 } },
    vertexShader: "varying vec3 vN; varying vec3 vV; varying float vA; attribute float aA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vA = aA; gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uColor; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vA; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor, vA * pow(f, 1.8) * 1.8 * uK); }",
    transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
  });
  const cone = new Mesh(coneGeo, coneMat);
  cone.position.set(LAMP.x, 0, LAMP.z);
  cone.renderOrder = 4;
  group.add(cone);
  // halo around the bulb: two crossed cards
  const haloMat = new MeshBasicMaterial({ map: t.glow, color: "#ffd9a0", transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  // two crossed cards in ONE mesh (one draw call)
  const haloGeo = plane(0.55, 0.55);
  const haloB = plane(0.55, 0.55).rotateY(Math.PI / 2);
  const hp = [...(haloGeo.getAttribute("position").array as Float32Array), ...(haloB.getAttribute("position").array as Float32Array)];
  const hu = [...(haloGeo.getAttribute("uv").array as Float32Array), ...(haloB.getAttribute("uv").array as Float32Array)];
  const hn = [...(haloGeo.getAttribute("normal").array as Float32Array), ...(haloB.getAttribute("normal").array as Float32Array)];
  const hi = [...Array.from(haloGeo.index!.array as Uint16Array), ...Array.from(haloB.index!.array as Uint16Array, (v) => v + 4)];
  const haloBoth = new BufferGeometry();
  haloBoth.setAttribute("position", new Float32BufferAttribute(hp, 3));
  haloBoth.setAttribute("uv", new Float32BufferAttribute(hu, 2));
  haloBoth.setAttribute("normal", new Float32BufferAttribute(hn, 3));
  haloBoth.setIndex(hi);
  const h = new Mesh(haloBoth, haloMat);
  h.position.set(LAMP.x, y0 + 0.02, LAMP.z);
  h.renderOrder = 5;
  group.add(h);
  return {
    group,
    setGlow(k: number) {
      coneMat.uniforms.uK.value = Math.max(0, Math.min(2, k));
      haloMat.opacity = 0.4 + 0.25 * Math.min(2, k);
    },
  };
}

/** The virtual card table (no real desk): a dark wood top with a raised wood rim around the felt, an apron and four turned legs. */
export function makeTable(): Mesh {
  const parts: Part[] = [];
  const cz = 0.01;
  parts.push({ geometry: slab(1.16, 0.76, 0.05, 0.07, 0.008, -0.05), color: "#4b2819", matrix: at(0, 0, cz) });
  parts.push({ geometry: slab(1.12, 0.72, 0.02, 0.06, 0.007, 0.0, { w: 0.97, d: 0.58, r: 0.045 }), color: "#7a4527", matrix: at(0, 0, cz) });
  parts.push({ geometry: slab(1.02, 0.64, 0.08, 0.05, 0.006, -0.13), color: "#35190f", matrix: at(0, 0, cz) });
  const leg = turned([[0.001, -0.74], [0.018, -0.74], [0.02, -0.7], [0.026, -0.55], [0.03, -0.4], [0.026, -0.3], [0.034, -0.22], [0.03, -0.18], [0.04, -0.15], [0.036, -0.1], [0.001, -0.1]], 14);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push({ geometry: leg.clone(), color: "#3c1f13", matrix: at(sx * 0.5, 0, cz + sz * 0.3) });
  const m = new Mesh(mergeBaked(parts), new MeshBasicMaterial({ vertexColors: true }));
  m.name = "table";
  return m;
}

/** His side of the table (stage D): a plain wood top from the far edge of the card table back to the chair, flush with the wood rim. His body is cut at
 * the table top and this top reaches under him, so the cut is hidden in every view (before, a dithered fade showed as a stippled patch at his waist,
 * and the lower body faded to a black cylinder where a real desk does not hide it). Shown with the virtual table and on a real desk alike. */
export function makeFarTop(): Mesh {
  const parts: Part[] = [];
  parts.push({ geometry: slab(1.16, 0.43, 0.07, 0.06, 0.007, -0.05), color: "#4b2819", matrix: at(0, 0, -0.555) });
  parts.push({ geometry: slab(1.12, 0.4, 0.02, 0.05, 0.007, 0.0), color: "#7a4527", matrix: at(0, 0, -0.555) });
  const m = new Mesh(mergeBaked(parts), new MeshBasicMaterial({ vertexColors: true }));
  m.name = "his side of the table";
  return m;
}

/** The chair behind him: a tall tufted leather back with a row of brass studs, in front of the back wall. */
export function makeChair(): Mesh {
  const parts: Part[] = [];
  const back = new ExtrudeGeometry(roundedRect(0.66, 1.06, 0.13), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 12 });
  back.deleteAttribute("uv");
  parts.push({ geometry: back, color: "#5b1a1c", matrix: at(0, 0.3, -0.82) });
  const inset = new ExtrudeGeometry(roundedRect(0.5, 0.88, 0.1), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 10 });
  inset.deleteAttribute("uv");
  parts.push({ geometry: inset, color: "#7a2326", matrix: at(0, 0.3, -0.742) });
  // brass studs round the edge of the inset
  const stud = new SphereGeometry(0.0085, 8, 6);
  const sp = (x: number, y: number) => parts.push({ geometry: stud, color: "#d1a850", matrix: at(x, 0.3 + y, -0.725) });
  for (let i = 0; i <= 10; i++) { const y = -0.44 + (0.88 * i) / 10; sp(-0.27, y); sp(0.27, y); }
  for (let i = 1; i < 6; i++) { const x = -0.27 + (0.54 * i) / 6; sp(x, 0.46); sp(x, -0.46); }
  const m = new Mesh(mergeBaked(parts), new MeshBasicMaterial({ vertexColors: true }));
  m.name = "chair";
  return m;
}

/** The back room: wallpaper with the glow and the slats of light baked in, a floor with the pool of light, a shelf of bottles, a picture
 * and a door with light under it. `floorY` of the room group is set by the booth. Floor at y = -0.745 (room-local). */
export function makeRoom(t: Textures): Group {
  const g = new Group();
  g.name = "back room";
  const back = new Mesh(new PlaneGeometry(4.8, 3.3), new MeshBasicMaterial({ map: t.wall }));
  back.position.set(0, 0.905, -1.95);
  const sideGeo = (sx: number) => new PlaneGeometry(3.9, 3.3).rotateY(sx * Math.PI / 2);
  const sideMat = new MeshBasicMaterial({ map: t.wall, color: "#8a8a8a" });
  const left = new Mesh(sideGeo(1), sideMat);
  left.position.set(-2.4, 0.905, -0.05);
  const right = new Mesh(sideGeo(-1), sideMat);
  right.position.set(2.4, 0.905, -0.05);
  const floor = new Mesh(new PlaneGeometry(4.8, 3.9).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: t.floor }));
  floor.position.set(0, -0.745, -0.05);
  g.add(back, left, right, floor);
  // props merged into one mesh: shelf with bottles and glasses, a framed picture, a door
  const parts: Part[] = [];
  const shelfY = 0.52, shelfZ = -1.86;
  parts.push({ geometry: slab(1.0, 0.2, 0.03, 0.02, 0.004), color: "#4a2b1a", matrix: at(-1.3, shelfY, shelfZ) });
  const bottle = (h: number, r: number) => turned([[0.001, 0], [r, 0], [r, h * 0.55], [r * 0.9, h * 0.68], [r * 0.38, h * 0.82], [r * 0.38, h * 0.96], [r * 0.5, h], [0.001, h]], 12);
  const bottleCols = ["#a0661c", "#245f3a", "#6e3a1e", "#8a2a2a", "#b07a2a", "#2b4a68"];
  bottleCols.forEach((c, i) => parts.push({ geometry: bottle(0.26 + (i % 3) * 0.04, 0.032), color: c, glow: 0.15, matrix: at(-1.65 + i * 0.13, shelfY + 0.03, shelfZ) }));
  parts.push({ geometry: slab(1.0, 0.2, 0.03, 0.02, 0.004), color: "#4a2b1a", matrix: at(-1.3, shelfY + 0.42, shelfZ) });
  for (let i = 0; i < 7; i++) parts.push({ geometry: turned([[0.001, 0], [0.018, 0], [0.02, 0.012], [0.03, 0.09], [0.03, 0.11], [0.001, 0.11]], 10), color: "#c8e6e0", glow: 0.35, matrix: at(-1.7 + i * 0.1, shelfY + 0.45, shelfZ) });
  // door on the right with light under it
  parts.push({ geometry: slab(0.95, 0.06, 2.1, 0.01, 0.004), color: "#3d2416", matrix: at(2.05, -0.745, -1.92) });
  // a baseboard along the back wall
  parts.push({ geometry: slab(4.8, 0.05, 0.13, 0.01, 0.004), color: "#2f1b12", matrix: at(0, -0.745, -1.925) });
  // the painting (a frame round a textured plane) and a wall lamp beside it
  const frame = new ExtrudeGeometry(roundedRect(0.86, 0.6, 0.02), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2 });
  frame.deleteAttribute("uv");
  parts.push({ geometry: frame, color: "#a8802f", matrix: at(1.2, 0.5, -1.925) });
  const arm = turned([[0.001, 0], [0.012, 0], [0.012, 0.05], [0.05, 0.07], [0.06, 0.15], [0.001, 0.15]], 14);
  parts.push({ geometry: arm, color: "#caa04a", matrix: new Matrix4().makeRotationX(Math.PI / 2).premultiply(new Matrix4().makeTranslation(0.55, 0.52, -1.92)) });
  const props = new Mesh(mergeBaked(parts), new MeshBasicMaterial({ vertexColors: true }));
  props.name = "room props";
  g.add(props);
  const paint = new Mesh(new PlaneGeometry(0.8, 0.54), new MeshBasicMaterial({ map: t.painting }));
  paint.position.set(1.2, 0.5, -1.876);
  g.add(paint);
  const glowMat = new MeshBasicMaterial({ map: t.glow, color: "#ffc27a", transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
  const halo = new Mesh(new PlaneGeometry(1.0, 1.0), glowMat);
  halo.position.set(0.55, 0.56, -1.86);
  halo.renderOrder = 2;
  g.add(halo);
  return g;
}

/** Brass fittings and a wood plaque under each trio of strike lamps. Returns one mesh. */
export function makeLampFittings(): Mesh {
  const parts: Part[] = [];
  const collar = turned([[0.001, 0], [0.0205, 0], [0.0215, 0.003], [0.0185, 0.0075], [0.0165, 0.0095], [0.001, 0.0095]], 14);
  for (const [x, zc, dir] of [[-0.4, 0.155, 1], [0.4, -0.155, -1]] as [number, number, number][]) {
    parts.push({ geometry: slab(0.06, 0.2, 0.008, 0.012, 0.0025), color: "#3a1f12", matrix: at(x, 0.0005, zc) });
    for (let i = 0; i < 3; i++) parts.push({ geometry: collar, color: "#b8913d", matrix: at(x, 0.008, zc + (i - 1) * 0.055 * dir) });
  }
  // a glass of whiskey on his side of the table
  const glass = turned([[0.001, 0], [0.024, 0], [0.028, 0.003], [0.0305, 0.085], [0.0285, 0.0875], [0.0235, 0.014], [0.001, 0.014]], 18);
  parts.push({ geometry: glass, color: "#d9c79a", glow: 0.5, matrix: at(-0.4, 0.0, -0.21) });
  const whiskey = turned([[0.001, 0.014], [0.0245, 0.014], [0.0285, 0.066], [0.001, 0.066]], 18);
  parts.push({ geometry: whiskey, color: "#c8761a", glow: 0.7, matrix: at(-0.4, 0.0, -0.21) });
  const m = new Mesh(mergeBaked(parts), new MeshBasicMaterial({ vertexColors: true }));
  m.name = "table fittings";
  return m;
}

