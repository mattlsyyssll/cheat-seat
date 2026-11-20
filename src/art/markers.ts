/** Small things on the desk that carry the cheat and the strikes without text:
 * the hover glint on a card a pinch will take, strike pegs, the wrist zone
 * markers and the peek of a stashed card, and a simple hand shape used for the
 * ghost-hand lesson and the mouse cursor. All shapes, no textures but the ones
 * drawn in code. */
import {
  Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, BoxGeometry, RingGeometry, CircleGeometry, PlaneGeometry,
  SphereGeometry, CylinderGeometry, IcosahedronGeometry, AdditiveBlending, DoubleSide,
} from "@iwsdk/core";
import { CARD } from "../game/layout.js";
import { mergeParts, type Part } from "./geom.js";
import { smooth } from "../game/keys.js";
import type { Textures } from "./textures.js";

type P3 = { x: number; y: number; z: number };
/** Wrist zone centres for this frame, table-local metres. */
export interface Anchors {
  wristL: P3;
  wristR: P3;
}

// ------------------------------------------------------------------- hover
/** A soft ring under the card or zone the next pinch will take: a thick bright ring,
 * a faint disc inside it and a slow pulse, so it reads at a glance. */
export class Hover {
  mesh = new Group();
  private ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private disc: Mesh<CircleGeometry, MeshBasicMaterial>;
  constructor(color = "#fff1c4", textures?: Textures) {
    const g = new RingGeometry(0.72, 1, 40);
    g.rotateX(-Math.PI / 2);
    this.ring = new Mesh(
      g,
      new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
    );
    const dg = new CircleGeometry(0.72, 32);
    dg.rotateX(-Math.PI / 2);
    this.disc = new Mesh(
      dg,
      new MeshBasicMaterial({ map: textures?.glow, color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
    );
    this.ring.renderOrder = 6;
    this.disc.renderOrder = 5;
    this.mesh.add(this.disc, this.ring);
    this.mesh.visible = false;
    this.mesh.name = "hover ring";
  }
  setColor(color: string): void {
    this.ring.material.color.set(color);
    this.disc.material.color.set(color);
  }
  /** Show at (x, y, z) with radius r; strength 0..1 (0 hides it). */
  set(x: number, y: number, z: number, r: number, strength: number): void {
    this.mesh.visible = strength > 0.01;
    this.mesh.position.set(x, y + 0.003, z);
    const pulse = 1 + 0.07 * Math.sin(performance.now() * 0.006);
    this.mesh.scale.set(r * 1.12 * pulse, 1, r * 1.12 * pulse);
    this.ring.material.opacity = 0.8 * strength;
    this.disc.material.opacity = 0.32 * strength;
  }
}

// ------------------------------------------------------------------ strikes
const BULB_OFF = "#54443b";
const BULB_ON = "#ff4d2e";
/** Three strike lamps on each side: a brass base, a post and a bulb. A struck side
 * lights one bulb per strike (bright red with a halo); the lamp that was just lit
 * pulses and throws a ring. His lamps stand by him, yours by you, on the left edge
 * of the felt, where both are inside the view. */
export class StrikePegs {
  group = new Group();
  private bulbs: Record<"player" | "shark", Mesh<IcosahedronGeometry, MeshBasicMaterial>[]> = { player: [], shark: [] };
  private halos: Record<"player" | "shark", Mesh<PlaneGeometry, MeshBasicMaterial>[]> = { player: [], shark: [] };
  private rings: Record<"player" | "shark", Mesh<RingGeometry, MeshBasicMaterial>[]> = { player: [], shark: [] };
  private lit: Record<"player" | "shark", number> = { player: 0, shark: 0 };
  private flashT = 0;
  private flashSide: "player" | "shark" | null = null;
  private flashIndex = -1;

  constructor(textures: Textures) {
    this.group.name = "strike lamps";
    const base = new MeshLambertMaterial({ color: "#8c6b2c", flatShading: true });
    const post = new MeshLambertMaterial({ color: "#2b211c", flatShading: true });
    const baseGeo = new CylinderGeometry(0.026, 0.03, 0.012, 10);
    const postGeo = new CylinderGeometry(0.009, 0.012, 0.034, 8);
    const bulbGeo = new IcosahedronGeometry(0.024, 1);
    const ringGeo = new RingGeometry(0.7, 1, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const haloGeo = new PlaneGeometry(0.22, 0.22);
    haloGeo.rotateX(-Math.PI / 2);
    for (const side of ["player", "shark"] as const)
      for (let i = 0; i < 3; i++) {
        const x = -0.35;
        const z = side === "player" ? 0.03 + i * 0.058 : -0.3 + i * 0.058;
        const lamp = new Group();
        lamp.position.set(x, 0, z);
        lamp.name = `${side} lamp ${i + 1}`;
        const b = new Mesh(baseGeo, base);
        b.position.y = 0.006;
        const p = new Mesh(postGeo, post);
        p.position.y = 0.029;
        const bulb = new Mesh(bulbGeo, new MeshBasicMaterial({ color: BULB_OFF }));
        bulb.position.y = 0.062;
        const halo = new Mesh(
          haloGeo,
          new MeshBasicMaterial({ map: textures.glow, color: "#ff3b1f", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }),
        );
        halo.position.y = 0.004;
        halo.renderOrder = 4;
        const ring = new Mesh(
          ringGeo,
          new MeshBasicMaterial({ color: "#ff7a4a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
        );
        ring.position.y = 0.006;
        ring.visible = false;
        ring.renderOrder = 6;
        const body = new Group();
        body.scale.setScalar(0.62);
        body.add(b, p, bulb);
        lamp.add(body, halo, ring);
        this.group.add(lamp);
        this.bulbs[side].push(bulb);
        this.halos[side].push(halo);
        this.rings[side].push(ring);
      }
  }

  /** Light this many lamps per side. */
  set(player: number, shark: number): void {
    this.lit.player = player;
    this.lit.shark = shark;
    this.paint();
  }

  /** The lamp that was just lit pulses and throws a ring (also used for a warning, which lights nothing). */
  flash(side: "player" | "shark", index: number): void {
    this.flashSide = side;
    this.flashIndex = index;
    this.flashT = 0;
  }

  update(dt: number): void {
    if (this.flashSide === null) return;
    this.flashT += dt;
    this.paint();
    if (this.flashT > 1.8) this.flashSide = null;
    if (this.flashSide === null) this.paint();
  }

  private paint(): void {
    for (const side of ["player", "shark"] as const)
      this.bulbs[side].forEach((bulb, i) => {
        const on = i < this.lit[side];
        const flashing = this.flashSide === side && i === this.flashIndex;
        let scale = on ? 1.15 : 1;
        let halo = on ? 0.75 : 0;
        let ring = 0;
        if (flashing) {
          const k = Math.min(1, this.flashT / 1.4);
          const beat = Math.floor(this.flashT * 6) % 2 === 0;
          bulb.material.color.set(beat ? "#ffd2a0" : on ? BULB_ON : "#a24a30");
          scale = 1.15 + 0.7 * Math.sin(Math.min(1, this.flashT * 1.4) * Math.PI);
          halo = on ? 1 : 0.35;
          ring = (1 - k) * 0.9;
          const rr = this.rings[side][i];
          rr.visible = ring > 0.01;
          rr.scale.set(0.03 + 0.2 * k, 1, 0.03 + 0.2 * k);
          rr.material.opacity = ring;
        } else {
          bulb.material.color.set(on ? BULB_ON : BULB_OFF);
          this.rings[side][i].visible = false;
        }
        bulb.scale.setScalar(scale);
        this.halos[side][i].material.opacity = halo;
        this.halos[side][i].visible = halo > 0.01;
      });
  }
}

// -------------------------------------------------------------- stash markers
/** Gold rings (a see-through ball outline) and a spot of light at the wrist zones (bright while you hold a palmed card, as the
 * place to put it), a peek of a stashed card, and the peek of the palmed card
 * under the hand that holds it. Also the glint that confirms a stash. */
export class StashMarkers {
  group = new Group();
  /** Per wrist zone: three crossing rings (a see-through ball outline), a soft core, a spot on the felt. */
  private zones: { group: Group; rings: Mesh<RingGeometry, MeshBasicMaterial>[]; core: Mesh<SphereGeometry, MeshBasicMaterial>; spot: Mesh<CircleGeometry, MeshBasicMaterial> }[] = [];
  private edgeGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private peeks: Record<string, Mesh<PlaneGeometry, MeshBasicMaterial>> = {};
  private palmPeek: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private edge: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private glints: Mesh<CircleGeometry, MeshBasicMaterial>[] = [];
  private glintT: number[] = [-1, -1];

  constructor(textures: Textures) {
    this.group.name = "stash markers";
    for (let i = 0; i < 2; i++) {
      const group = new Group();
      group.name = i === 0 ? "wrist zone left" : "wrist zone right";
      const ringMat = () => new MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      const rings: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
      for (let k = 0; k < 3; k++) {
        const rg = new RingGeometry(0.92, 1, 40);
        if (k === 0) rg.rotateX(-Math.PI / 2);
        else if (k === 2) rg.rotateY(Math.PI / 2);
        const ring = new Mesh(rg, ringMat());
        ring.scale.setScalar(0.08);
        ring.renderOrder = 4;
        rings.push(ring);
        group.add(ring);
      }
      const core = new Mesh(
        new SphereGeometry(0.075, 14, 10),
        new MeshBasicMaterial({ color: "#ffcf5a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }),
      );
      core.renderOrder = 3;
      group.add(core);
      const spotGeo = new CircleGeometry(0.12, 24);
      spotGeo.rotateX(-Math.PI / 2);
      const spot = new Mesh(
        spotGeo,
        new MeshBasicMaterial({ map: textures.glow, color: "#ffc94a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }),
      );
      spot.renderOrder = 2;
      group.add(spot);
      this.zones.push({ group, rings, core, spot });
      this.group.add(group);
      const g = new Mesh(
        new CircleGeometry(0.06, 20),
        new MeshBasicMaterial({ map: textures.glow, color: "#fff4cf", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
      );
      g.rotation.x = -Math.PI / 2;
      g.renderOrder = 7;
      this.glints.push(g);
      this.group.add(g);
    }
    const peekGeo = () => {
      const g = new PlaneGeometry(CARD.w * 0.6, CARD.h * 0.6);
      g.rotateX(-Math.PI / 2);
      return g;
    };
    const peekMat = () => new MeshBasicMaterial({ map: textures.back, transparent: true, opacity: 0.85, side: DoubleSide });
    for (const k of ["wristL", "wristR"]) {
      const m = new Mesh(peekGeo(), peekMat());
      m.visible = false;
      m.name = `stash ${k}`;
      this.peeks[k] = m;
      this.group.add(m);
    }
    this.palmPeek = new Mesh(peekGeo(), peekMat());
    this.palmPeek.visible = false;
    this.palmPeek.name = "palmed card";
    this.group.add(this.palmPeek);
    const egg = new PlaneGeometry(0.62, 0.07);
    egg.rotateX(-Math.PI / 2);
    this.edgeGlow = new Mesh(egg, new MeshBasicMaterial({ map: textures.glow, color: "#ffc94a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    this.edgeGlow.position.set(0, 0.004, 0.35);
    this.edgeGlow.renderOrder = 2;
    this.group.add(this.edgeGlow);
    // the strip under the desk edge: a card edge sticking out of the lip
    const eg = new PlaneGeometry(CARD.w * 0.8, 0.012);
    eg.rotateX(-Math.PI / 2);
    this.edge = new Mesh(eg, new MeshBasicMaterial({ map: textures.back, color: "#d9c79a", side: DoubleSide }));
    this.edge.position.set(0, 0.004, 0.36);
    this.edge.visible = false;
    this.edge.name = "stash edge";
    this.group.add(this.edge);
  }

  /** A glint at wrist zone 0 (left) or 1 (right) or the edge (2) */
  glint(which: 0 | 1 | 2): void {
    this.glintT[which === 2 ? 0 : which] = 0;
    this.glintWhich = which;
  }
  private glintWhich: 0 | 1 | 2 = 0;

  /**
   * @param a anchors for this frame (wrist centres in table-local metres)
   * @param stash stash cards by zone; palmedAt = palm centre when a card is palmed
   * @param lesson 0..1 how much the wrist spheres glow as the place to put a card
   */
  update(dt: number, a: Anchors, stash: Record<string, number | null>, palmedAt: { x: number; y: number; z: number } | null, lesson: number, time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    const palmGlow = palmedAt ? 0.1 + 0.08 * pulse : 0;
    const l = Math.max(lesson, palmGlow * 4);
    const zoneAt = [a.wristL, a.wristR];
    const show = Math.min(1, l * 1.6);
    for (let i = 0; i < 2; i++) {
      const z = this.zones[i], w = zoneAt[i];
      z.group.visible = show > 0.01;
      z.group.position.set(w.x, w.y, w.z);
      const breathe = 1 + 0.06 * Math.sin(time * 4 + i);
      z.group.scale.setScalar(breathe);
      for (const r of z.rings) r.material.opacity = 0.8 * show;
      z.core.material.opacity = 0.14 * show * (palmedAt ? 1 + 0.4 * pulse : 1);
      z.spot.position.y = 0.004 - w.y;
      z.spot.material.opacity = 0.55 * show;
    }
    this.edgeGlow.visible = !!palmedAt;
    this.edgeGlow.material.opacity = palmedAt ? 0.3 + 0.2 * pulse : 0;
    for (const k of ["wristL", "wristR"] as const) {
      const p = this.peeks[k];
      p.visible = stash[k] !== null && stash[k] !== undefined;
      const w = k === "wristL" ? a.wristL : a.wristR;
      p.position.set(w.x, w.y + 0.012, w.z - 0.04);
    }
    this.edge.visible = stash.edge !== null && stash.edge !== undefined;
    this.palmPeek.visible = !!palmedAt;
    if (palmedAt) this.palmPeek.position.set(palmedAt.x, palmedAt.y - 0.012, palmedAt.z);
    for (let i = 0; i < 2; i++) {
      if (this.glintT[i] < 0) {
        this.glints[i].material.opacity = 0;
        continue;
      }
      this.glintT[i] += dt;
      const k = this.glintT[i] / 0.9;
      const w = this.glintWhich === 2 ? { x: 0, y: 0.02, z: 0.36 } : i === 0 ? a.wristL : a.wristR;
      this.glints[i].position.set(w.x, w.y + 0.02, w.z);
      this.glints[i].material.opacity = Math.sin(Math.PI * Math.min(1, k)) * 0.9;
      if (k >= 1) this.glintT[i] = -1;
    }
  }

  /** The ghost hand's wrist glint (0..1) on the left wrist zone. */
  lessonGlint(k: number, a: Anchors): void {
    const g = this.glints[1];
    g.position.set(a.wristL.x, a.wristL.y + 0.02, a.wristL.z);
    if (this.glintT[1] < 0) g.material.opacity = smooth(k) * 0.9;
  }
}

// ------------------------------------------------------------------ hand shape
/** A plain hand made of boxes: a palm, four fingers and a thumb. Points along -z
 * (away from the player), palm down. `flat` straightens the fingers; `pinch` brings
 * the thumb and the index finger together. */
export class HandMesh {
  group = new Group();
  private fingers: Group[] = [];
  private thumb: Group;
  private mats: MeshBasicMaterial[] = [];
  private halo: Mesh<CircleGeometry, MeshBasicMaterial> | null = null;

  constructor(color: string, opacity: number, textures?: Textures) {
    this.group.name = "hand shape";
    if (textures) {
      // a soft pool of light on the felt under the hand, so a see-through hand still reads
      const hg = new CircleGeometry(0.13, 24);
      hg.rotateX(-Math.PI / 2);
      this.halo = new Mesh(hg, new MeshBasicMaterial({ map: textures.glow, color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      this.halo.renderOrder = 2;
      this.group.add(this.halo);
    }
    const mat = () => {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      this.mats.push(m);
      return m;
    };
    const palm = new Mesh(new BoxGeometry(0.082, 0.018, 0.085), mat());
    palm.position.set(0, 0, 0.005);
    this.group.add(palm);
    const xs = [-0.03, -0.01, 0.01, 0.03];
    const lens = [0.07, 0.078, 0.072, 0.056];
    xs.forEach((x, i) => {
      const pivot = new Group();
      pivot.position.set(x, 0, -0.04);
      const f = new Mesh(new BoxGeometry(0.0165, 0.013, lens[i]), mat());
      f.position.set(0, 0, -lens[i] / 2);
      pivot.add(f);
      this.group.add(pivot);
      this.fingers.push(pivot);
    });
    this.thumb = new Group();
    this.thumb.position.set(-0.044, 0, 0.0);
    const t = new Mesh(new BoxGeometry(0.018, 0.013, 0.058), mat());
    t.position.set(0, 0, -0.029);
    this.thumb.add(t);
    this.group.add(this.thumb);
    this.group.visible = false;
  }

  /** @param flat 0..1 @param pinch 0..1 @param alpha 0..1 of the base opacity */
  set(flat: number, pinch: number, alpha = 1): void {
    const curl = (1 - flat) * 0.7;
    this.fingers.forEach((p, i) => {
      p.rotation.x = i === 0 ? -(curl + pinch * 0.35) : -curl;
    });
    this.thumb.rotation.y = -0.45 + pinch * 0.5 + flat * 0.2;
    for (const m of this.mats) m.opacity = (m.userData.base ??= m.opacity) * alpha;
    if (this.halo) {
      this.halo.position.y = 0.004 - this.group.position.y;
      this.halo.material.opacity = 0.5 * alpha;
    }
    this.group.visible = alpha > 0.01;
  }
}

// ---------------------------------------------------------------- ghost trail
/** Dots on the felt from the discard pile to the wrist zone, lighting up in order as
 * the ghost hand carries the card, so the path stays on the desk after the hand is gone. */
export class GhostTrail {
  group = new Group();
  private dots: Mesh<CircleGeometry, MeshBasicMaterial>[] = [];
  constructor(from: { x: number; z: number }, to: { x: number; z: number }, n = 9) {
    this.group.name = "ghost trail";
    const g = new CircleGeometry(0.011, 14);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / (n + 1);
      const d = new Mesh(g, new MeshBasicMaterial({ color: "#fff0b8", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      d.position.set(from.x + (to.x - from.x) * k, 0.004, from.z + (to.z - from.z) * k);
      d.renderOrder = 5;
      this.dots.push(d);
      this.group.add(d);
    }
  }
  /** @param progress 0..1 how far along the path the hand is @param alpha 0..1 overall */
  set(progress: number, alpha: number): void {
    const n = this.dots.length;
    this.group.visible = alpha > 0.01;
    this.dots.forEach((d, i) => {
      const lit = Math.max(0, Math.min(1, progress * (n + 1) - i));
      d.material.opacity = 0.9 * lit * alpha;
      d.scale.setScalar(0.7 + 0.5 * lit);
    });
  }
}

// ------------------------------------------------------------------ slap cue
/** A warm pulse over his half of the desk while his glove is under the hat: the place
 * to put a flat palm down. Soft ellipse, no flashing. */
export class SlapCue {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private ring: Mesh<RingGeometry, MeshBasicMaterial>;
  group = new Group();
  constructor(textures: Textures, center: { x: number; z: number }) {
    const g = new PlaneGeometry(0.8, 0.46);
    g.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(g, new MeshBasicMaterial({ map: textures.glow, color: "#ffc86a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    this.mesh.position.set(center.x, 0.0035, center.z);
    this.mesh.renderOrder = 2;
    const rg = new RingGeometry(0.9, 1, 48);
    rg.rotateX(-Math.PI / 2);
    this.ring = new Mesh(rg, new MeshBasicMaterial({ color: "#ffe2a0", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
    this.ring.position.set(center.x, 0.0045, center.z);
    this.ring.renderOrder = 3;
    this.group.name = "slap cue";
    this.group.add(this.mesh, this.ring);
    this.group.visible = false;
  }
  /** @param k 0..1 how strongly to show it @param time seconds, for the slow pulse */
  set(k: number, time: number): void {
    this.group.visible = k > 0.01;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    this.mesh.material.opacity = k * (0.34 + 0.14 * pulse);
    this.ring.material.opacity = k * (0.5 + 0.3 * pulse);
    const r = 0.17 + 0.02 * pulse;
    this.ring.scale.set(r, 1, r);
  }
}

// ---------------------------------------------------------------- shock rings
/** Expanding rings on the felt: the slam, and a strike landing. A small pool, no allocation per use. */
export class Shocks {
  group = new Group();
  private items: { mesh: Mesh<RingGeometry, MeshBasicMaterial>; t: number; dur: number; r: number }[] = [];
  constructor(n = 3) {
    this.group.name = "shock rings";
    const g = new RingGeometry(0.82, 1, 48);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mesh = new Mesh(g, new MeshBasicMaterial({ color: "#ff6a3a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.items.push({ mesh, t: 1, dur: 1, r: 0.3 });
      this.group.add(mesh);
    }
  }
  fire(x: number, z: number, color: string, radius = 0.34, dur = 0.7): void {
    const it = this.items.find((i) => i.t >= i.dur) ?? this.items[0];
    it.t = 0;
    it.dur = dur;
    it.r = radius;
    it.mesh.position.set(x, 0.005, z);
    it.mesh.material.color.set(color);
    it.mesh.visible = true;
  }
  /** Stage D: hide every ring at once (the table is cleared). */
  reset(): void {
    for (const it of this.items) {
      it.t = it.dur;
      it.mesh.visible = false;
    }
  }
  update(dt: number): void {
    for (const it of this.items) {
      if (it.t >= it.dur) {
        it.mesh.visible = false;
        continue;
      }
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      const r = 0.04 + it.r * (1 - Math.pow(1 - k, 2.2));
      it.mesh.scale.set(r, 1, r);
      it.mesh.material.opacity = 0.85 * Math.pow(1 - k, 1.6);
    }
  }
}

// ---------------------------------------------------------------- level hats
/** Three small hats on the right edge of the felt: one, two or three brass bands. Pinch one before the cut to pick
 * the difficulty (Easy, Normal, Hard). The chosen hat stands tall with a ring under it; the others sit low and dim.
 * They show only while the deck waits for the cut. No text. */
export class LevelHats {
  group = new Group();
  private hats: Record<string, { root: Group; mat: MeshLambertMaterial; ring: Mesh<RingGeometry, MeshBasicMaterial> }> = {};
  private k = 0;
  constructor(spots: Record<string, { x: number; z: number }>, bands: Record<string, number>) {
    this.group.name = "level hats";
    const ringGeo = new RingGeometry(0.78, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    for (const id of Object.keys(spots)) {
      const parts: Part[] = [
        { geometry: new CylinderGeometry(0.026, 0.028, 0.004, 12), color: "#3b2c22" },
        { geometry: new CylinderGeometry(0.016, 0.02, 0.028, 12), color: "#4a382d", position: [0, 0.016, 0] },
      ];
      for (let i = 0; i < (bands[id] ?? 1); i++)
        parts.push({ geometry: new CylinderGeometry(0.0205, 0.0207, 0.0034, 12), color: "#d2a23c", position: [0, 0.006 + i * 0.0072, 0] });
      const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const root = new Group();
      root.add(new Mesh(mergeParts(parts), mat));
      const ring = new Mesh(ringGeo, new MeshBasicMaterial({ color: "#ffe2a0", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
      ring.scale.setScalar(0.04);
      ring.position.y = 0.003;
      root.add(ring);
      root.position.set(spots[id].x, 0.003, spots[id].z);
      this.group.add(root);
      this.hats[id] = { root, mat, ring };
    }
    this.group.visible = false;
  }
  /** @param show whether the hats are offered @param chosen the level id now picked */
  update(dt: number, show: boolean, chosen: string, time: number): void {
    this.k += ((show ? 1 : 0) - this.k) * (1 - Math.exp(-dt * 8));
    this.group.visible = this.k > 0.02;
    if (!this.group.visible) return;
    for (const [id, h] of Object.entries(this.hats)) {
      const on = id === chosen;
      const s = (on ? 1.25 : 0.95) * (0.4 + 0.6 * this.k);
      h.root.scale.setScalar(s);
      h.root.position.y = 0.003 + (on ? 0.006 + 0.002 * Math.sin(time * 4) : 0);
      h.mat.color.setScalar(on ? 1.25 : 0.6);
      h.ring.material.opacity = on ? 0.85 * this.k : 0;
    }
  }
}
