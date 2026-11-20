/** The things you keep between visits, as shapes with no text (PRODUCT-FIT P1-2): a glass jar of brass buttons for the buttons
 * you have saved, and five small medals for the streak of matches won (one carries a gold halo: the best streak). They stand
 * on the right side of the player's half of the felt and appear after the first match ends. New buttons drop into
 * the jar; a new medal lights with a pop. Three instanced or merged meshes plus a halo: 5 draw calls. */
import {
  Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, BoxGeometry, RingGeometry, CylinderGeometry, InstancedMesh,
  Object3D, Color, AdditiveBlending, DoubleSide,
} from "@iwsdk/core";
import { JAR_SHOWN_MAX, MEDALS, jarShown, marksVisible, medalState, type Progress } from "../game/progress.js";
import { mergeParts, type Part } from "./geom.js";
import { smooth } from "../game/keys.js";

/** Where the jar stands (table-local metres): the right side of the player's half, clear of the discard pile, the right
 * wrist ring and the strip under the desk edge. The five medals stand in a row on edge, a little toward the Shark from it. */
export const JAR_SPOT = { x: 0.315, z: 0.27 };
const JAR_SCALE = 0.8;
/** The row of medals: centre of the first, spacing, and the scale of the row (medals are small, so they are drawn 1.2 times larger). */
export const MEDAL_SPOT = { x: 0.225, z: 0.19 };
const MEDAL_DX = 0.02;
const MEDAL_SCALE = 1.2;
const BUTTON_R = 0.0115;
const BUTTON_H = 0.0042;
const DROP_FROM = 0.13;
const GRAVITY = 4.5;

/** Where button i rests inside the jar: three to a level, turned a little on each level. */
export function jarSlot(i: number): { x: number; y: number; z: number; spin: number; tiltX: number; tiltZ: number } {
  const level = Math.floor(i / 3), k = i % 3;
  const a = (k * 2 * Math.PI) / 3 + level * 0.7;
  const wob = Math.sin(i * 12.9898) * 43758.5453;
  const r = wob - Math.floor(wob);
  return { x: Math.cos(a) * 0.0135, y: 0.0065 + level * 0.0047, z: Math.sin(a) * 0.0135, spin: r * Math.PI, tiltX: (r - 0.5) * 0.2, tiltZ: (0.5 - r) * 0.14 };
}

export class ReturnMarks {
  group = new Group();
  /** Called once when the last button of a drop reaches the glass floor or the pile (for the clink). */
  onLand: (() => void) | null = null;
  private jar = new Group();
  private row = new Group();
  private buttons: InstancedMesh;
  private medals: InstancedMesh;
  private halo: Mesh<RingGeometry, MeshBasicMaterial>;
  private dummy = new Object3D();
  private color = new Color();
  private shown = 0;
  private fall: number[] = new Array(JAR_SHOWN_MAX).fill(1e9);
  private landing = false;
  private lit = 0;
  private haloAt = 0;
  private pop: number[] = new Array(MEDALS).fill(0);
  private appear = 0;
  private wanted = false;
  private dirty = true;

  constructor() {
    this.group.name = "return marks";
    this.group.position.set(0, 0.0012, 0);
    this.jar.position.set(JAR_SPOT.x, 0, JAR_SPOT.z);
    this.jar.scale.setScalar(JAR_SCALE);
    this.row.position.set(MEDAL_SPOT.x, 0, MEDAL_SPOT.z);
    this.row.scale.setScalar(MEDAL_SCALE);
    // the jar: a brass base, a thin glass wall, a brass rim
    const body: Part[] = [
      { geometry: new CylinderGeometry(0.033, 0.034, 0.004, 16), color: "#4a382d", position: [0, 0.002, 0] },
      { geometry: new CylinderGeometry(0.0335, 0.0335, 0.005, 16, 1, true), color: "#c99a3a", position: [0, 0.0065, 0] },
      { geometry: new CylinderGeometry(0.0335, 0.0335, 0.006, 16, 1, true), color: "#d2a23c", position: [0, 0.0745, 0] },
    ];
    const frame = new Mesh(mergeParts(body), new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }));
    const glassGeo = new CylinderGeometry(0.031, 0.031, 0.07, 16, 1, true);
    const glass = new Mesh(glassGeo, new MeshLambertMaterial({ color: "#d7eee8", transparent: true, opacity: 0.2, depthWrite: false }));
    glass.position.y = 0.04;
    glass.renderOrder = 3;
    this.buttons = new InstancedMesh(new CylinderGeometry(BUTTON_R, BUTTON_R, BUTTON_H, 12), new MeshLambertMaterial({ color: "#b58f3d" }), JAR_SHOWN_MAX);
    this.buttons.frustumCulled = false;
    this.buttons.count = 0;
    // five medals, standing on edge and facing the player, in a short row toward the near corner
    const medalGeo = mergeParts([
      { geometry: new BoxGeometry(0.012, 0.0028, 0.011), color: "#6b4f2a", position: [0, 0.0014, 0] },
      { geometry: (() => { const g = new CylinderGeometry(0.0105, 0.0105, 0.0026, 14); g.rotateX(Math.PI / 2); return g; })(), color: "#d2a23c", position: [0, 0.0148, 0] },
      { geometry: (() => { const g = new CylinderGeometry(0.0062, 0.0062, 0.003, 6); g.rotateX(Math.PI / 2); return g; })(), color: "#f1cd75", position: [0, 0.0148, 0.0008] },
    ]);
    this.medals = new InstancedMesh(medalGeo, new MeshLambertMaterial({ vertexColors: true, flatShading: true }), MEDALS);
    this.medals.frustumCulled = false;
    const ringGeo = new RingGeometry(0.62, 1, 28);
    this.halo = new Mesh(ringGeo, new MeshBasicMaterial({ color: "#ffe2a0", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    this.halo.scale.setScalar(0.0185);
    this.jar.add(frame, glass, this.buttons);
    this.row.add(this.medals, this.halo);
    this.group.add(this.jar, this.row);
    this.group.visible = false;
    this.writeMedals();
  }

  /** Show this record. With `animate`, new buttons drop into the jar and a new medal pops; without, it just appears.
   * @param p the record @param animate play the change */
  set(p: Progress, animate: boolean): void {
    this.wanted = marksVisible(p);
    const want = jarShown(p);
    const { lit, haloAt } = medalState(p);
    if (!animate) {
      this.appear = this.wanted ? 1 : 0;
      this.shown = want;
      this.fall.fill(1e9);
      this.pop.fill(0);
    } else {
      // buttons added since the last look drop in one after another
      for (let i = this.shown; i < want; i++) this.fall[i] = -0.35 - (i - this.shown) * 0.09;
      if (want > this.shown) this.landing = true;
      // a medal that was dark and is lit now pops
      for (let i = this.lit; i < lit; i++) this.pop[i] = 1;
      if (want <= this.shown) this.fall.fill(1e9, want);
      this.shown = want;
    }
    this.lit = lit;
    this.haloAt = haloAt;
    this.writeMedals();
    this.dirty = true;
  }

  /** What is drawn now (for the debug snapshot). */
  state(): { visible: boolean; buttons: number; lit: number; haloAt: number } {
    return { visible: this.group.visible, buttons: this.shown, lit: this.lit, haloAt: this.haloAt };
  }

  private writeMedals(): void {
    for (let i = 0; i < MEDALS; i++) {
      this.dummy.position.set(i * MEDAL_DX, 0, 0);
      this.dummy.rotation.set(0, 0, 0);
      const s = 1 + 0.45 * Math.sin(Math.min(1, 1 - this.pop[i]) * Math.PI) * (this.pop[i] > 0 ? 1 : 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.medals.setMatrixAt(i, this.dummy.matrix);
      const on = i < this.lit;
      this.color.setScalar(on ? 1.15 + 0.5 * this.pop[i] : 0.32);
      this.medals.setColorAt(i, this.color);
    }
    this.medals.instanceMatrix.needsUpdate = true;
    if (this.medals.instanceColor) this.medals.instanceColor.needsUpdate = true;
  }

  private writeButtons(): void {
    this.buttons.count = this.shown;
    for (let i = 0; i < this.shown; i++) {
      const s = jarSlot(i);
      const t = this.fall[i];
      let y = s.y;
      if (t < 1e8) y += t < 0 ? DROP_FROM : Math.max(0, DROP_FROM - 0.5 * GRAVITY * t * t);
      const waiting = t < 0;
      this.dummy.position.set(s.x, y, s.z);
      this.dummy.rotation.set(s.tiltX, s.spin, s.tiltZ);
      this.dummy.scale.setScalar(waiting ? 0.001 : 1);
      this.dummy.updateMatrix();
      this.buttons.setMatrixAt(i, this.dummy.matrix);
    }
    this.buttons.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, time: number): void {
    this.appear += ((this.wanted ? 1 : 0) - this.appear) * (1 - Math.exp(-dt * 6));
    this.group.visible = this.appear > 0.02;
    if (!this.group.visible) return;
    const grow = 0.5 + 0.5 * smooth(this.appear);
    this.jar.scale.setScalar(JAR_SCALE * grow);
    this.row.scale.setScalar(MEDAL_SCALE * grow);
    let moving = this.dirty;
    for (let i = 0; i < this.shown; i++) {
      if (this.fall[i] >= 1e8) continue;
      this.fall[i] += dt;
      moving = true;
      if (this.fall[i] > 0 && DROP_FROM - 0.5 * GRAVITY * this.fall[i] * this.fall[i] <= 0) this.fall[i] = 1e9;
    }
    if (moving) {
      this.writeButtons();
      this.dirty = false;
    }
    if (this.landing && this.fall.slice(0, this.shown).every((t) => t >= 1e8)) {
      this.landing = false;
      this.onLand?.();
    }
    let popping = false;
    for (let i = 0; i < MEDALS; i++) if (this.pop[i] > 0) {
      this.pop[i] = Math.max(0, this.pop[i] - dt * 1.4);
      popping = true;
    }
    if (popping) this.writeMedals();
    const h = this.haloAt;
    this.halo.visible = h > 0;
    if (h > 0) {
      this.halo.position.set((h - 1) * MEDAL_DX, 0.0148, 0.003);
      this.halo.material.opacity = (0.55 + 0.25 * Math.sin(time * 3)) * this.appear;
    }
  }
}
