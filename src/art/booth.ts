/** The booth with the art stage's look. It IS the stage A booth (same cards, tweens, chips, rules of what shows when) with its placeholder
 * set swapped for the real one: felt mat with the lamp's light baked in, a card table with a wood rim, a hanging lamp with a cone of light,
 * a dark back room, a leather chair behind him, strike lamps with brass fittings. To use it, index.ts imports `Booth` from this file
 * instead of world/booth.ts. Nothing in the game logic changes. */
import {
  Group, Mesh, MeshBasicMaterial, PlaneGeometry, BufferGeometry, SphereGeometry, PointLight, HemisphereLight, Light, AdditiveBlending, DoubleSide, Shape, ShapeGeometry, Vector2, type Material, type Object3D,
} from "@iwsdk/core";
import { Booth as StageABooth } from "../world/booth.js";
import { makeFeltMat, makeLamp, makeTable, makeChair, makeRoom, makeLampFittings, mergeMeshes, FELT_SIZE, type Lamp } from "./set.js";
import { RoomDim } from "./dim.js";
import { LAMP } from "./build.js";
import { makeTag } from "./textures.js";
import { PauseMenu } from "./menu.js";
import { HintPlate } from "./hint.js";
import { deskCloth } from "./cloth.js";
import { ScoreBoard } from "./score.js";
import "./flatfx.js";

/** Stage A's lamp light is tuned for its own materials; the toon and lit materials here take this share of it. */
const KEY_SCALE = 0.62;

function drop(o: Object3D): void {
  o.parent?.remove(o);
  o.traverse((c) => {
    const m = c as Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  });
}

export class Booth extends StageABooth {
  private felt2!: Mesh<BufferGeometry, MeshBasicMaterial>;
  private lamp2!: Lamp;
  private lampHalos: Mesh<PlaneGeometry, MeshBasicMaterial>[][] = [[], []];
  private virtualSetUp = false;
  /** Stage D: the hands-only pause menu (a brass pad on the felt; orbs while paused). */
  readonly menu = new PauseMenu();
  /** Stage D: the dark dome that dims the real (or emulated) room in a headset session, and the felt cloth that covers the real desk top. */
  readonly dim = new RoomDim();
  /** Stage D: the headset's one plate of words (the goal, then the lesson line), first visit only. */
  readonly hint = new HintPlate();
  /** Stage F: the headset's scoreboard on the table (round, pot, strikes). */
  readonly score = new ScoreBoard();
  private cloth: Mesh | null = null;

  constructor() {
    super();
    const me = this as unknown as Record<string, any>;
    const g = this.group;
    const T = this.textures;
    // 1. take out the placeholder set: lights, the felt, the lamp, strike lamp bases (everything the base class did not keep a name for)
    const keep = new Set<Object3D>([
      this.deck.group, this.playerCard.group, this.sharkCard.group, this.heldCard.group, this.sleeveCard.group, this.evidence.group,
      this.buttons.mesh, this.shocks.group, this.virtualSet, this.room, me.cueRing, me.cueRipple, me.cueGlow, me.cuffRing, me.cuffRipple, me.cuffGlow, me.seatRing, ...me.underRings, ...me.tokens,
      ...me.strikeLamps.player, ...me.strikeLamps.shark,
    ]);
    for (const c of [...g.children]) if (!keep.has(c) && (c instanceof Light || c instanceof Mesh)) drop(c);
    while (this.virtualSet.children.length) drop(this.virtualSet.children[0]);
    while (this.room.children.length) drop(this.room.children[0]);

    // 2. light: one warm lamp (it also lights the Shark and the cards) and a soft sky-and-floor light
    const key = new PointLight("#ffd6a0", 3, 0, 2);
    key.position.copy(LAMP);
    me.lampKey = key;
    g.add(key, new HemisphereLight("#9aa6d8", "#4a3328", 1.0));

    // 3. the set
    this.felt2 = makeFeltMat(T);
    g.add(this.felt2);
    this.virtualSet.add(makeTable());
    this.room.add(makeRoom(T));
    this.lamp2 = makeLamp(T);
    // the chair and the brass fittings with the whiskey glass are one mesh (one draw call). Stage E: no plank on his side of the table any more; he sits behind the
    // table's far edge and his body is hidden below your line of sight over that edge (toon.ts hideBehindEdge), the way a seated man is.
    g.add(this.lamp2.group, mergeMeshes([makeChair(), makeLampFittings()], "chair and fittings"));
    g.add(this.menu.group, this.dim.mesh, this.hint.mesh, this.score.mesh);
    T.felt.repeat.set(2.6, 2.6);

    // 4. strike lamps: rounder bulbs and a glow that shows when lit
    const haloMat = (c: string) => new MeshBasicMaterial({ map: T.glow, color: c, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    (["player", "shark"] as const).forEach((side, si) => {
      (me.strikeLamps[side] as Mesh[]).forEach((bulb) => {
        bulb.geometry.dispose();
        bulb.geometry = new SphereGeometry(0.0185, 18, 14);
        bulb.position.y = 0.022;
        for (const ry of [0, Math.PI / 2]) {
          const h = new Mesh(new PlaneGeometry(0.16, 0.16), haloMat("#ff4a2a"));
          h.position.copy(bulb.position).setY(0.03);
          h.rotation.y = ry;
          h.visible = false;
          h.renderOrder = 6;
          g.add(h);
          this.lampHalos[si].push(h);
        }
      });
    });
    // one short word beside each row of lamps, flat on the felt, reading toward you
    for (const z of [-0.145, -0.02]) {
      const geo = new PlaneGeometry(0.13, 0.0325);
      geo.rotateX(-Math.PI / 2);
      const tag = new Mesh(geo, new MeshBasicMaterial({ map: makeTag("STRIKES"), transparent: true, depthWrite: false }));
      tag.position.set(-0.35, 0.003, z);
      tag.renderOrder = 5;
      tag.name = "strikes label";
      g.add(tag);
    }
  }

  /** Where the far edge of the surface that hides his lower body is (table-local: height and z). The card table's wood rim when there is no real desk; the far edge of the
   * felt cloth on a real desk. `Shark.setView` gets it every frame (stage E). */
  occluder = { y: 0.02, z: -0.35 };

  /** A real desk (the table-local polygon of its top) gets a felt cloth over its top, under the felt mat. The cloth is a clean shape made from the polygon: the polygon is cut to a box round
   * the table (a sofa or a floor plane cannot spill), reduced to its convex outline (no spikes), and stops at the table's far edge, so the Shark sits behind it (stage E; before, the
   * raw polygon gave green spikes past the table edge and the cloth ran under him). null removes it. */
  setDesk(poly: { x: number; z: number }[] | null): void {
    if (this.cloth) {
      this.group.remove(this.cloth);
      this.cloth.geometry.dispose();
      (this.cloth.material as Material).dispose();
      this.cloth = null;
    }
    this.occluder = { y: 0.02, z: -0.35 };
    if (!poly || poly.length < 3) return;
    try {
      const outline = deskCloth(poly);
      if (!outline) {
        this.occluder = { y: 0.001, z: -0.23 }; // too little desk for a cloth: the felt mat's own far edge hides him
        return;
      }
      const geo = new ShapeGeometry(new Shape(outline.map((p) => new Vector2(p.x, -p.z))));
      geo.rotateX(-Math.PI / 2);
      const mat = new MeshBasicMaterial({ map: this.textures.felt, color: "#9bb9a2", side: DoubleSide });
      this.cloth = new Mesh(geo, mat);
      this.cloth.position.y = 0.0004;
      this.cloth.renderOrder = -2;
      this.cloth.name = "desk cloth";
      this.group.add(this.cloth);
      this.occluder = { y: 0.0004, z: Math.min(...outline.map((p) => p.z)) };
    } catch {
      this.cloth = null;
    }
  }

  setMode(o: { virtualTable: boolean; showRoom: boolean; floorY: number }): void {
    super.setMode(o);
    const s = o.virtualTable ? FELT_SIZE.virtual : FELT_SIZE.real;
    this.felt2.scale.set(s[0], 1, s[1]);
  }

  sync(view: any, dt: number, ctx: any): void {
    super.sync(view, dt, ctx);
    // the base class set the lamp's strength for its own look (flash on a slam, dim in a stare); keep the shape, scale the level
    const k = this.lampKey.intensity / 3.4;
    this.lampKey.intensity = this.lampKey.intensity * KEY_SCALE;
    this.felt2.material.color.setScalar(Math.max(0.6, Math.min(1.8, 0.9 + 0.1 * k * k)));
    this.lamp2.setGlow(Math.max(0.3, k));
    // strike glow
    (["player", "shark"] as const).forEach((side, si) => {
      const n = view.strikes?.[side] ?? 0;
      this.lampHalos[si].forEach((h, i) => {
        const lampIdx = Math.floor(i / 2);
        const lit = n > lampIdx;
        h.visible = lit;
        if (lit) h.material.opacity = 0.75 + 0.2 * Math.sin(performance.now() * 0.006 + lampIdx);
      });
    });
  }
}
