/** The buttons: 40 brass discs in one instanced mesh. Each belongs to the
 * player, the Shark, the pot or the floor, and flies to its slot when the owner
 * changes. When a side is caught, the pot and a fine are thrown off the desk
 * (scripted arcs, no physics engine) and the fine stays on the floor. */
import { InstancedMesh, BufferGeometry, Float32BufferAttribute, MeshLambertMaterial, Matrix4, Object3D, Color } from "@iwsdk/core";
import { makeChip } from "./textures.js";
import { ZONES, BUTTON } from "../game/layout.js";
import { TOTAL_BUTTONS } from "../game/match.js";
import { launchToss, stepToss, type Toss } from "../game/toss.js";
import type { Rng } from "../game/rng.js";

export type Owner = "player" | "shark" | "pot";
export type Counts = Record<Owner, number> & { floor?: number };
const STACK_HEIGHT = 5;
const FLIGHT_S = 0.55;
const TOSS_SIM_STEP = 1 / 90;

type P3 = { x: number; y: number; z: number };

/** Slot k of a pile: stacks of five, four stacks to a row. */
export function slotPosition(owner: Owner, k: number): P3 {
  const zone = owner === "player" ? ZONES.playerPile : owner === "shark" ? ZONES.sharkPile : ZONES.pot;
  const s = Math.floor(k / STACK_HEIGHT), level = k % STACK_HEIGHT;
  const col = s % 4, row = Math.floor(s / 4);
  return {
    x: zone.x + (col - 1.5) * (BUTTON.r * 2.25),
    y: BUTTON.h * (level + 0.5),
    z: zone.z + (row - 0.5) * (BUTTON.r * 2.25),
  };
}

/** A chip: a rounded disc, drawn a little larger than the game's button so it reads at a metre. Top and bottom share the disc art; the
 * side shows the edge stripes. UVs: the disc in the left half of the texture, the stripes in the right half. */
function chipGeometry(): BufferGeometry {
  const R = BUTTON.r * 1.12, Hh = BUTTON.h * 1.25 / 2, ch = 0.0011, seg = 20;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const ring = (r: number, y: number, ny: number, nr: number, kind: "top" | "side", v: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(c * r, y, s * r);
      const l = Math.hypot(nr, ny);
      nor.push((c * nr) / l, ny / l, (s * nr) / l);
      if (kind === "top") uv.push(0.25 + 0.25 * (c * r) / R, 0.5 + 0.5 * ((s * r) / R) * Math.sign(y || 1));
      else uv.push(0.5 + 0.5 * (i / seg), v);
    }
  };
  // rings from the centre of the top, over the rim, to the centre of the bottom
  const rows: [number, number, number, number, "top" | "side", number][] = [
    [0.0001, Hh, 1, 0, "top", 0], [R - ch, Hh, 1, 0, "top", 0],
    [R, Hh - ch, 0.3, 1, "side", 0.9], [R, -Hh + ch, -0.3, 1, "side", 0.1],
    [R - ch, -Hh, -1, 0, "top", 0], [0.0001, -Hh, -1, 0, "top", 0],
  ];
  for (const r of rows) ring(r[0], r[1], r[2], r[3], r[4], r[5]);
  for (let k = 0; k < rows.length - 1; k++)
    for (let i = 0; i < seg; i++) {
      const a = k * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class ButtonField {
  mesh: InstancedMesh;
  private owner: (Owner | "floor" | "air")[] = [];
  private pile: Record<Owner | "floor", number[]> = { player: [], shark: [], pot: [], floor: [] };
  private from: P3[] = [];
  private at: P3[] = [];
  private to: P3[] = [];
  private delay: number[] = [];
  private t: number[] = [];
  private toss: (Toss | null)[] = [];
  private tossFine: boolean[] = [];
  private tossClock = 0;
  private tossAcc = 0;
  private onDesk: (x: number, z: number) => boolean = () => true;
  private floorY = -0.72;
  private dummy = new Object3D();
  /** Called once when a batch of buttons lands (for the clink). */
  onLand: (() => void) | null = null;
  /** Called when a thrown button first reaches the floor (for the rattle). */
  onFloorHit: (() => void) | null = null;
  private pendingLand = false;
  private floorHit = false;

  constructor() {
    this.mesh = new InstancedMesh(chipGeometry(), new MeshLambertMaterial({ map: makeChip(), color: "#ffffff" }), TOTAL_BUTTONS);
    this.mesh.name = "chips";
    this.mesh.frustumCulled = false;
    // a faint spread of warm tints so a stack does not look stamped
    const c = new Color();
    for (let i = 0; i < TOTAL_BUTTONS; i++) this.mesh.setColorAt(i, c.setRGB(0.92 + 0.08 * ((i * 37) % 7) / 6, 0.9 + 0.1 * ((i * 53) % 5) / 4, 0.86 + 0.14 * ((i * 29) % 3) / 2));
    this.setCounts({ player: 20, shark: 20, pot: 0 }, true);
  }

  count(o: Owner | "floor"): number {
    return this.pile[o].length;
  }

  /** Height of the floor under the desk, table-local (negative). */
  setFloorY(y: number): void {
    this.floorY = y;
    for (const i of this.pile.floor) this.at[i] = { ...this.at[i], y: y + BUTTON.h / 2 };
    this.write();
  }

  /** Buttons currently in the air or sliding after a throw. */
  get tossing(): boolean {
    return this.toss.some((t) => t !== null);
  }

  /** How many thrown buttons have reached the floor. */
  get fallen(): number {
    return this.toss.filter((t) => t?.onFloor).length + this.pile.floor.length;
  }

  /** Make the piles match these counts. Buttons leave the end of a pile that is
   * too big and join the end of a pile that is too small. With `instant`, no flight.
   * The floor pile only grows through `throwOff`; a smaller floor count resets it. */
  setCounts(counts: Counts, instant = false): void {
    const free: number[] = [];
    if (this.owner.length === 0) {
      for (let i = 0; i < TOTAL_BUTTONS; i++) {
        this.owner.push("player");
        this.from.push({ x: 0, y: 0, z: 0 });
        this.at.push({ x: 0, y: 0, z: 0 });
        this.to.push({ x: 0, y: 0, z: 0 });
        this.delay.push(0);
        this.t.push(1);
        this.toss.push(null);
        this.tossFine.push(false);
        free.push(i);
      }
    } else {
      for (const o of ["player", "shark", "pot"] as Owner[])
        while (this.pile[o].length > counts[o]) free.push(this.pile[o].pop()!);
      // thrown buttons that came back from the air
      for (let i = 0; i < this.owner.length; i++)
        if (this.owner[i] === "air" && this.toss[i] === null) free.push(i);
      const floorTarget = counts.floor ?? this.pile.floor.length;
      while (this.pile.floor.length > floorTarget) free.push(this.pile.floor.pop()!);
    }
    // a restored run can start with buttons already on the floor
    const floorWant = counts.floor ?? 0;
    while (this.pile.floor.length < floorWant && free.length) {
      const i = free.shift()!;
      const k = this.pile.floor.length;
      this.pile.floor.push(i);
      this.owner[i] = "floor";
      this.t[i] = 1;
      this.at[i] = { x: -0.3 + (k % 6) * 0.12, y: this.floorY + BUTTON.h / 2, z: 0.55 + Math.floor(k / 6) * 0.1 };
    }
    let order = 0;
    for (const o of ["player", "shark", "pot"] as Owner[]) {
      while (this.pile[o].length < counts[o] && free.length) {
        const i = free.shift()!;
        const k = this.pile[o].length;
        this.pile[o].push(i);
        this.owner[i] = o;
        this.from[i] = { ...this.at[i] };
        this.to[i] = slotPosition(o, k);
        this.delay[i] = instant ? 0 : order++ * 0.035;
        this.t[i] = instant ? 1 : 0;
        if (instant) this.at[i] = { ...this.to[i] };
      }
    }
    // anything left over (should not happen) goes to the pot so no button is lost
    for (const i of free) {
      this.pile.pot.push(i);
      this.owner[i] = "pot";
      this.from[i] = { ...this.at[i] };
      this.to[i] = slotPosition("pot", this.pile.pot.length - 1);
      this.t[i] = instant ? 1 : 0;
      if (instant) this.at[i] = { ...this.to[i] };
    }
    if (!instant) this.pendingLand = true;
    this.write();
  }

  /**
   * Throw buttons off the desk. The whole pot and `fine` buttons from the end of
   * `fineFrom`'s pile fly toward `dir` (+1 toward the player, -1 toward the Shark).
   * The pot comes back when `landThrow` is called; the fine stays on the floor.
   * @param onDesk is this spot over the desk top (table-local x, z)
   * @param floorY height of the floor, negative
   */
  throwOff(
    rng: Rng,
    plan: { pot: boolean; fineFrom: "player" | "shark"; fine: number; dir: number },
    onDesk: (x: number, z: number) => boolean,
    floorY: number,
  ): void {
    this.onDesk = onDesk;
    this.floorY = floorY;
    this.tossClock = 0;
    this.tossAcc = 0;
    this.floorHit = false;
    const launch = (i: number, fine: boolean, dir: number) => {
      this.owner[i] = "air";
      this.t[i] = 1;
      const p = this.at[i];
      this.toss[i] = launchToss(rng, { x: p.x, y: p.y, z: p.z }, dir, fine);
      this.tossFine[i] = fine;
    };
    if (plan.pot) {
      const ids = this.pile.pot.splice(0);
      for (const i of ids) launch(i, false, plan.dir);
    }
    for (let n = 0; n < plan.fine && this.pile[plan.fineFrom].length; n++) launch(this.pile[plan.fineFrom].pop()!, true, plan.dir);
  }

  /** The throw is over: fine buttons stay on the floor, the rest return to the piles
   * that the final counts say. */
  landThrow(counts: Counts): void {
    for (let i = 0; i < this.toss.length; i++) {
      const tw = this.toss[i];
      if (!tw) continue;
      this.toss[i] = null;
      if (this.tossFine[i]) {
        // make sure it is on the floor even if the arc was cut short
        this.at[i] = { x: tw.x, y: tw.onFloor ? this.floorY + BUTTON.h / 2 : this.floorY + BUTTON.h / 2, z: tw.z };
        this.owner[i] = "floor";
        this.pile.floor.push(i);
        this.tossFine[i] = false;
      } else this.owner[i] = "air";
    }
    this.setCounts(counts);
  }

  /** Move buttons along their flights and throws. */
  update(dt: number): boolean {
    let moving = false;
    if (this.tossing) {
      this.tossClock += dt;
      this.tossAcc += dt;
      while (this.tossAcc >= TOSS_SIM_STEP) {
        this.tossAcc -= TOSS_SIM_STEP;
        for (let i = 0; i < this.toss.length; i++) {
          const tw = this.toss[i];
          if (!tw) continue;
          const was = tw.onFloor;
          stepToss(tw, TOSS_SIM_STEP, this.onDesk, this.floorY);
          if (!was && tw.onFloor && !this.floorHit) {
            this.floorHit = true;
            this.onFloorHit?.();
          }
        }
      }
      for (let i = 0; i < this.toss.length; i++) {
        const tw = this.toss[i];
        if (!tw) continue;
        this.at[i] = { x: tw.x, y: tw.y + BUTTON.h / 2, z: tw.z };
      }
      moving = true;
    }
    for (let i = 0; i < this.t.length; i++) {
      if (this.t[i] >= 1) continue;
      moving = true;
      if (this.delay[i] > 0) {
        this.delay[i] -= dt;
        continue;
      }
      this.t[i] = Math.min(1, this.t[i] + dt / FLIGHT_S);
      const k = this.t[i], e = k * k * (3 - 2 * k);
      const a = this.from[i], b = this.to[i];
      this.at[i] = {
        x: a.x + (b.x - a.x) * e,
        y: a.y + (b.y - a.y) * e + Math.sin(Math.PI * k) * 0.05,
        z: a.z + (b.z - a.z) * e,
      };
    }
    if (moving || this.pendingLand) this.write();
    if (!moving && this.pendingLand) {
      this.pendingLand = false;
      this.onLand?.();
    }
    return moving;
  }

  /** Where the fine buttons lie (for the evidence in QA). */
  floorPositions(): P3[] {
    return this.pile.floor.map((i) => ({ ...this.at[i] }));
  }

  get moving(): boolean {
    return this.tossing || this.t.some((t) => t < 1);
  }

  private write(): void {
    for (let i = 0; i < this.at.length; i++) {
      const p = this.at[i];
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
