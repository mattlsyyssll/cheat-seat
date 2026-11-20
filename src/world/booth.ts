/** The booth scene (placeholder art, stage A): a small card table with felt, a virtual table and den when there is no real desk,
 * warm lamp light, the cards (yours, his, the one in your hand, the one up your sleeve, the one that falls from his sleeve), the
 * chips, strike lamps, the three tokens for "point him away", and the rings that show where to look. Everything is table-local.
 * No text in this scene (the page words live in flat-ui.ts). The art stage may replace this file's looks; the data it draws
 * comes from `view` (game/duel.js buildView). */
import {
  Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, BoxGeometry, PlaneGeometry, CylinderGeometry, SphereGeometry, RingGeometry,
  AmbientLight, PointLight, BackSide, RepeatWrapping, AdditiveBlending, NormalBlending, DoubleSide, Vector3, Matrix4, Color,
} from "@iwsdk/core";
import { makeTextures, type Textures } from "../art/textures.js";
import { CardMesh, Stack } from "../art/cards.js";
import { ButtonField } from "../art/buttons.js";
import { KeepSpot } from "../art/keep.js";
import { Shocks } from "../art/markers.js";
import { SPOTS, TABLE } from "../game/booth.js";
import { PEEK } from "../game/duel.js";
import { hysteresis } from "../game/pose.js";

const PEEK_SHOW_S = PEEK.showS;

type V3 = { x: number; y: number; z: number };
const FELT_W = TABLE.halfX * 2 - 0.04, FELT_D = TABLE.zNear - TABLE.zFar - 0.04;

export interface BoothContext {
  head: V3;
  /** Joints of each hand (table-local) for the held card and the sleeve card. */
  joints: Map<string, Record<string, V3>>;
  /** Cuff points (where the sleeve card peeks out) by hand id. */
  cuffs: Map<string, V3>;
}

interface Tween { t: number; d: number; fn: (k: number) => void; done?: () => void }

const smooth = (k: number) => k * k * (3 - 2 * k);

export class Booth {
  readonly group = new Group();
  readonly textures: Textures;
  readonly deck: Stack;
  readonly playerCard: CardMesh;
  readonly sharkCard: CardMesh;
  readonly heldCard: CardMesh;
  /** Round 8 (Q04): whether the held card is drawn between the fingers (a pinch, two thresholds) or in the palm. */
  private pinchVis = false;
  readonly sleeveCard: CardMesh;
  readonly evidence: CardMesh;
  readonly buttons: ButtonField;
  /** Desk Keep: the marked spot and the cards kept on it (art/keep.ts). */
  readonly keepSpot: KeepSpot;
  readonly shocks: Shocks;
  readonly virtualSet = new Group();
  readonly room = new Group();
  readonly lampKey: PointLight;
  /** A light over the table for the result of a round (gold when you win or catch him, red when he wins or catches you): the headset shows no words. */
  readonly resultLight: PointLight;
  private resultT = 99;
  private resultDur = 1;
  private resultPeak = 0;
  /** Headset comfort (stage D): the flash of the lamp and the result light at a hit are much weaker, so the view never goes white. */
  protected comfort = false;
  private lampFlash = 0;
  private tweens: Tween[] = [];
  private strikeLamps: { player: Mesh[]; shark: Mesh[] } = { player: [], shark: [] };
  private tokens: Mesh[] = [];
  private cueRing: Mesh<RingGeometry, MeshBasicMaterial>;
  /** The wrist cue (S2, stage C): a second ring that swells outward and fades, and a warm glow disc under both. Shown only for that cue. */
  private cueRipple: Mesh<RingGeometry, MeshBasicMaterial>;
  private cueGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Stage D (judge fix 6): the cue on his real sleeve cuff. A ring that stands up round the cuff and faces you, a ripple that swells out of it and a
   * warm glow on the cuff itself; before he cheats only a soft glow ("Watch his glowing cuff"). */
  private cuffRing: Mesh<RingGeometry, MeshBasicMaterial>;
  private cuffRipple: Mesh<RingGeometry, MeshBasicMaterial>;
  private cuffGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private underRings: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  private seatRing: Mesh<RingGeometry, MeshBasicMaterial>;
  private clock = 0;
  private peekOn = false;
  private tmpV = new Vector3();
  private playerCardState = "";
  private sharkUp = false;
  private flipping = false;
  private lastCounts = "";
  private sharkLaid = false;
  private dealtPlayer = false;
  floorY = -0.72;

  constructor() {
    this.textures = makeTextures();
    const T = this.textures;
    this.group.name = "booth";
    const g = this.group;

    // ---- light: a hanging lamp over the table, a cool light behind him, a soft fill for the face
    g.add(new AmbientLight("#7b7f98", 0.75));
    this.lampKey = new PointLight("#ffdcb0", 3.0, 5, 1.6);
    this.lampKey.position.set(0, 0.95, -0.08);
    g.add(this.lampKey);
    const rim = new PointLight("#7f9bff", 0.9, 3.4, 2);
    rim.position.set(0.55, 0.7, -1.15);
    g.add(rim);
    const fill = new PointLight("#ffc48f", 0.9, 2.2, 2);
    fill.position.set(-0.25, 0.62, 0.35);
    g.add(fill);
    this.resultLight = new PointLight("#ffd27a", 0, 2.4, 1.6);
    this.resultLight.position.set(0, 0.42, 0.02);
    g.add(this.resultLight);
    const lampShade = new Mesh(new CylinderGeometry(0.06, 0.16, 0.1, 18, 1, true), new MeshStandardMaterial({ color: "#16301f", roughness: 0.6, side: DoubleSide }));
    lampShade.position.set(0, 1.02, -0.08);
    const lampBulb = new Mesh(new SphereGeometry(0.03, 10, 8), new MeshBasicMaterial({ color: "#fff3d0" }));
    lampBulb.position.set(0, 0.97, -0.08);
    g.add(lampShade, lampBulb);

    // ---- the felt (always); a table with legs only when there is no real desk
    T.felt.repeat.set(3, 2);
    T.felt.wrapS = T.felt.wrapT = RepeatWrapping;
    const felt = new Mesh(new PlaneGeometry(FELT_W, FELT_D).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: T.felt, roughness: 0.95 }));
    felt.position.set(0, 0.0012, (TABLE.zNear + TABLE.zFar) / 2);
    felt.name = "felt";
    g.add(felt);
    T.wood.wrapS = T.wood.wrapT = RepeatWrapping;
    T.wood.repeat.set(2, 1);
    const wood = new MeshStandardMaterial({ map: T.wood, roughness: 0.6 });
    const top = new Mesh(new BoxGeometry(TABLE.halfX * 2 + 0.06, 0.045, TABLE.zNear - TABLE.zFar + 0.06), wood);
    top.position.set(0, -0.0225 - 0.001, (TABLE.zNear + TABLE.zFar) / 2);
    this.virtualSet.add(top);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = new Mesh(new BoxGeometry(0.055, 0.7, 0.055), new MeshStandardMaterial({ color: "#2b1d15", roughness: 0.7 }));
        leg.position.set(sx * (TABLE.halfX - 0.03), -0.37, (TABLE.zNear + TABLE.zFar) / 2 + sz * (TABLE.zNear - TABLE.zFar) * 0.43);
        this.virtualSet.add(leg);
      }
    g.add(this.virtualSet);

    // ---- the den around the table: floor, walls, a door, a window, a clock, a picture (virtual play and the flat page only)
    const wall = new Mesh(new BoxGeometry(6.4, 3.25, 5.9), new MeshStandardMaterial({ color: "#3a2a22", roughness: 0.95, side: BackSide }));
    wall.position.set(0, 0.875, 0.65);
    const floor = new Mesh(new PlaneGeometry(6.4, 5.9).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: T.wood, color: "#8a6a50", roughness: 0.7 }));
    floor.position.set(0, -0.745, 0.65);
    this.room.add(wall, floor);
    const dec = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, emissive = false) => {
      const m = new Mesh(new BoxGeometry(w, h, d), emissive ? new MeshBasicMaterial({ color }) : new MeshStandardMaterial({ color, roughness: 0.7 }));
      m.position.set(x, y, z);
      this.room.add(m);
      return m;
    };
    dec(1.0, 2.05, 0.06, "#2a1a12", 1.35, 0.28, -2.27);          // the door behind him
    dec(0.06, 0.04, 0.06, "#b99a52", 1.0, 0.3, -2.23);              // its handle
    dec(0.05, 1.1, 1.3, "#ffcf8a", -3.17, 0.95, -0.4, true);        // a window on the left, lit
    dec(0.05, 1.12, 0.05, "#1a110d", -3.15, 0.95, -0.4);
    dec(0.05, 0.05, 1.32, "#1a110d", -3.15, 0.95, -0.4);
    dec(0.05, 0.4, 0.4, "#e6dcc0", 3.17, 1.5, -0.2);                // a clock on the right
    dec(0.9, 0.62, 0.05, "#5a4a2a", -0.9, 0.9, -2.27);              // a picture
    dec(0.8, 0.05, 0.3, "#3b2a1c", -2.5, 0.35, -2.1);               // a shelf
    for (let i = 0; i < 4; i++) dec(0.08, 0.26, 0.08, ["#2f5a3a", "#6a3a2a", "#3a4a6a", "#5a5a3a"][i], -2.8 + i * 0.18, 0.5, -2.1);
    g.add(this.room);

    // ---- the cards
    this.deck = new Stack(T, "deck", 40);
    this.deck.group.position.set(SPOTS.deck.x, 0.0012, SPOTS.deck.z);
    this.playerCard = new CardMesh(T, "your card");
    this.sharkCard = new CardMesh(T, "his card");
    this.heldCard = new CardMesh(T, "card in your hand");
    this.sleeveCard = new CardMesh(T, "card up your sleeve");
    this.evidence = new CardMesh(T, "card from his sleeve");
    this.sleeveCard.group.scale.setScalar(0.62);
    this.sharkCard.setGlow(0); // stage F (D15): its own lit material exists from the start, so the first peek compiles nothing
    g.add(this.deck.group, this.playerCard.group, this.sharkCard.group, this.heldCard.group, this.sleeveCard.group, this.evidence.group);

    // ---- chips and rings
    this.buttons = new ButtonField();
    this.buttons.mesh.position.y = 0.0012;
    g.add(this.buttons.mesh);
    this.shocks = new Shocks();
    g.add(this.shocks.group);
    this.keepSpot = new KeepSpot(T);
    g.add(this.keepSpot.group);

    // ---- strike lamps: yours on the near left corner, his on the far right corner
    const lampBase = new MeshStandardMaterial({ color: "#2a1d15", roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      for (const side of ["player", "shark"] as const) {
        const x = side === "player" ? -0.4 : 0.4;
        const z = side === "player" ? 0.1 + i * 0.055 : -0.1 - i * 0.055;
        const base = new Mesh(new CylinderGeometry(0.02, 0.022, 0.01, 12), lampBase);
        base.position.set(x, 0.005, z);
        const bulb = new Mesh(new SphereGeometry(0.017, 12, 8), new MeshStandardMaterial({ color: "#3a0c0c", emissive: "#000000", roughness: 0.3 }));
        bulb.position.set(x, 0.02, z);
        g.add(base, bulb);
        this.strikeLamps[side].push(bulb);
      }
    }
    // ---- three tokens for "point him away": brass discs at the right edge, near you
    for (let i = 0; i < 3; i++) {
      const t = new Mesh(new CylinderGeometry(0.016, 0.016, 0.006, 14), new MeshStandardMaterial({ color: "#c9a24a", roughness: 0.35, metalness: 0.6, emissive: "#3a2a08" }));
      t.position.set(0.42, 0.004, 0.1 + i * 0.05); // x 0.42 (was 0.40): the keep frame's right edge is at 0.383, so the tokens clear it
      g.add(t);
      this.tokens.push(t);
    }
    // the cue ring (where to look or reach) keeps its own colour over felt, wood and cloth: plain blending, not additive (additive
    // washed an orange ring to pale yellow on the green felt, and a stranger could not tell the wrist ring from the card ring)
    const ringMat = (c: string, additive = true, onTop = false) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, depthTest: !onTop, toneMapped: !onTop, blending: additive ? AdditiveBlending : NormalBlending, side: DoubleSide });
    // the cue rings draw over everything near them (his hand and sleeve hid half of the wrist ring on the laptop view)
    this.cueRing = new Mesh(new RingGeometry(0.72, 1, 48).rotateX(-Math.PI / 2), ringMat("#ffd27a", false, true));
    this.cueRing.visible = false;
    this.cueRing.renderOrder = 7;
    g.add(this.cueRing);
    this.cueRipple = new Mesh(new RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), ringMat("#ff7a4a", false, true));
    this.cueRipple.visible = false;
    this.cueRipple.renderOrder = 8;
    g.add(this.cueRipple);
    this.cueGlow = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: T.glow, color: "#ffb050", transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, blending: AdditiveBlending }));
    this.cueGlow.visible = false;
    this.cueGlow.renderOrder = 6;
    g.add(this.cueGlow);
    this.cuffRing = new Mesh(new RingGeometry(0.8, 1, 48), ringMat("#ff7a4a", false, true));
    this.cuffRipple = new Mesh(new RingGeometry(0.9, 1, 48), ringMat("#ffd27a", false, true));
    this.cuffGlow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: T.glow, color: "#ffa040", transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, blending: AdditiveBlending, side: DoubleSide }));
    for (const m of [this.cuffRing, this.cuffRipple, this.cuffGlow]) {
      m.visible = false;
      m.renderOrder = 8;
      g.add(m);
    }
    for (let i = 0; i < 2; i++) {
      const r = new Mesh(new RingGeometry(0.6, 1, 32).rotateX(-Math.PI / 2), ringMat("#7fe3ff"));
      r.visible = false;
      r.renderOrder = 7;
      g.add(r);
      this.underRings.push(r);
    }
    this.seatRing = new Mesh(new RingGeometry(0.22, 0.3, 40).rotateX(-Math.PI / 2), ringMat("#ffd27a"));
    this.seatRing.visible = false;
    g.add(this.seatRing);
  }

  /** A real desk gives the table top (no virtual table); the den and its floor show only without passthrough. */
  setMode(o: { virtualTable: boolean; showRoom: boolean; floorY: number }): void {
    this.virtualSet.visible = o.virtualTable;
    this.room.visible = o.showRoom;
    this.floorY = o.floorY;
    this.buttons.setFloorY(o.floorY);
    // the room box is built for a floor 0.75 m under the table top; move it if the floor is elsewhere
    this.room.position.y = o.floorY + 0.75;
  }

  showSeat(at: V3 | null): void {
    if (!at) {
      this.seatRing.visible = false;
      return;
    }
    this.seatRing.visible = true;
    this.seatRing.position.set(at.x, this.floorY + 0.01, at.z);
    this.seatRing.material.opacity = 0.55 + 0.25 * Math.sin(this.clock * 3);
  }

  /** A coloured light over the table that swells and fades (the result of a round without words). */
  pulseLight(color: string, peak: number, secs: number): void {
    this.resultLight.color.set(color);
    this.resultT = 0;
    this.resultDur = secs;
    this.resultPeak = peak * (this.comfort ? 0.4 : 1);
  }

  setComfort(on: boolean): void {
    this.comfort = on;
  }

  /** Stage D: the table is cleared for a new game (the start screen's demo ends, or begins again): no card, chip flight, ring or light left over. */
  reset(): void {
    this.tweens.length = 0;
    this.shocks.reset();
    this.buttons.landThrow({ player: 20, shark: 20, pot: 0, floor: 0 });
    this.buttons.setCounts({ player: 20, shark: 20, pot: 0, floor: 0 }, true);
    this.lampFlash = 0;
    this.resultT = 99;
    this.resultPeak = 0;
    this.resultLight.intensity = 0;
    this.lastCounts = "";
    this.sharkLaid = false;
    this.sharkUp = false;
    this.flipping = false;
    this.dealtPlayer = false;
    this.playerCardState = "";
    for (const c of [this.playerCard, this.sharkCard, this.heldCard, this.sleeveCard, this.evidence]) c.group.visible = false;
  }

  tween(d: number, fn: (k: number) => void, done?: () => void): void {
    this.tweens.push({ t: 0, d, fn, done });
  }

  /** The look of a game event (sound is the page's job). */
  onEvent(e: { type: string; [k: string]: any }, view: any): void {
    switch (e.type) {
      case "roundStart":
        this.dealtPlayer = false;
        this.sharkLaid = false;
        this.sharkUp = false;
        this.flipping = false;
        this.playerCardState = "";
        this.playerCard.group.visible = false;
        this.sharkCard.group.visible = false;
        this.evidence.group.visible = false;
        this.heldCard.group.visible = false;
        break;
      case "sharkLay": {
        this.sharkLaid = true;
        this.sharkCard.setFlip(1);
        const dx = SPOTS.deck.x, dz = SPOTS.deck.z;
        this.tween(0.5, (k) => {
          this.sharkCard.group.visible = true;
          this.sharkCard.group.position.set(dx + (SPOTS.sharkLay.x - dx) * k, 0.0015 + Math.sin(Math.PI * k) * 0.05, dz + (SPOTS.sharkLay.z - dz) * k);
        });
        break;
      }
      case "deal": {
        this.dealtPlayer = true;
        this.playerCard.setFlip(1);
        const dx = SPOTS.deck.x, dz = SPOTS.deck.z;
        this.tween(0.5, (k) => {
          this.playerCard.group.visible = true;
          this.playerCard.group.position.set(dx + (SPOTS.playerLay.x - dx) * k, 0.0015 + Math.sin(Math.PI * k) * 0.06, dz + (SPOTS.playerLay.z - dz) * k);
        });
        break;
      }
      case "sharkSwapped": {
        const y0 = 0.0015;
        this.tween(0.35, (k) => (this.sharkCard.group.position.y = y0 + Math.sin(Math.PI * k) * 0.035));
        break;
      }
      case "cardFalls": {
        const w = view.pose.handR.wrist;
        this.evidence.setCard(e.n ?? 0);
        this.evidence.setFlip(0);
        this.evidence.group.visible = true;
        const x0 = w.x, z0 = w.z;
        const x1 = w.x + 0.1, z1 = w.z + 0.2;
        this.tween(0.55, (k) => {
          this.evidence.group.position.set(x0 + (x1 - x0) * k, 0.06 * (1 - k * k) + 0.0016, z0 + (z1 - z0) * k);
          this.evidence.group.rotation.y = 1.6 * k;
        });
        break;
      }
      case "matchOver":
        this.pulseLight(e.n === "player" ? "#ffd27a" : "#ff3a24", 2.8, 4.2);
        break;
      case "result":
        // you win: a warm gold light on the table; he wins: a low red one; the same card: none
        if (e.result === "player") this.pulseLight("#ffd27a", 3.4, 2.8);
        else if (e.result === "shark") this.pulseLight("#ff4a2a", 2.8, 2.8);
        break;
      case "slamHit": {
        this.pulseLight("#ff3020", 4.2, 2.2);
        this.lampFlash = 1;
        const h = view.pose;
        const slamWrist = (view.hands as any[]).find((x) => x.present)?.pos;
        // Desk Keep: his hand lands on the keep spot, whatever your hands were doing
        const at = view.beat?.reason === "keep" ? view.kept.spot : slamWrist ?? { x: 0, z: 0.1 };
        this.shocks.fire(at.x, at.z, "#ff5a30", 0.34, 0.9);
        this.shocks.fire(at.x, at.z, "#ffd9a0", 0.2, 0.6);
        void h;
        break;
      }
      case "gotcha": {
        this.pulseLight("#ffd27a", 4.4, 2.6);
        this.lampFlash = 0.7;
        const w = view.pose.handR.wrist;
        this.shocks.fire(w.x, w.z + 0.05, "#ffe08a", 0.3, 0.8);
        break;
      }
    }
  }

  private place(card: CardMesh, pos: V3, head: V3, up = new Vector3(0, 1, 0)): void {
    const n = new Vector3(head.x - pos.x, head.y - pos.y, head.z - pos.z).normalize();
    const u = up.clone().sub(n.clone().multiplyScalar(up.dot(n))).normalize();
    const zl = u.clone().multiplyScalar(-1);
    const xl = new Vector3().crossVectors(n, zl).normalize();
    card.group.position.set(pos.x, pos.y, pos.z);
    card.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xl, n, zl));
    card.group.visible = true;
  }

  sync(view: any, dt: number, ctx: BoothContext): void {
    this.clock += dt;
    // tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.fn(smooth(k));
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
    this.shocks.update(dt);
    this.buttons.update(dt);
    this.lampFlash = Math.max(0, this.lampFlash - dt * 1.4);
    // the result light: swells in 0.15 s and fades out
    this.resultT += dt;
    const rk = Math.min(1, this.resultT / this.resultDur);
    this.resultLight.intensity = this.resultPeak * (rk < 0.06 ? rk / 0.06 : Math.pow(1 - (rk - 0.06) / 0.94, 1.6));
    this.lampKey.intensity = 3.4 + this.lampFlash * (this.comfort ? 1.4 : 5) * (view.phase === "caught" ? 1 : 0.5) + (view.stare ? -0.7 : 0);

    // chips follow the match
    const c = view.buttons, key = `${c.player},${c.shark},${view.pot},${view.floor}`;
    if (key !== this.lastCounts && !this.buttons.tossing) {
      this.buttons.setCounts({ player: c.player, shark: c.shark, pot: view.pot, floor: view.floor });
      this.lastCounts = key;
    }
    this.deck.setCount(view.deck ?? 30);
    this.keepSpot.sync(view.kept, dt);

    // your card: face down at the lay spot unless it is in your hand
    const held = view.card.held;
    const ps = view.phase;
    const showdown = ps === "showdown" || ps === "between" || ps === "over";
    if (held) {
      // a catch confiscates the card in your hand: during the result beat it lies face up where yours lay
      const confiscated = this.sharkUp && view.beat?.kind === "caught" && view.beat.player !== null && view.beat.player !== undefined;
      this.playerCard.group.visible = confiscated;
      if (confiscated) {
        this.playerCard.group.position.x = SPOTS.playerLay.x;
        this.playerCard.group.position.z = SPOTS.playerLay.z;
        this.playerCard.group.quaternion.identity();
      }
      if (view.card.shown && view.card.face !== null && view.card.holderPos) {
        const j = ctx.joints.get(view.card.holderId);
        this.heldCard.setCard(view.card.face);
        this.heldCard.setFlip(0);
        let pos: V3 = view.card.holderPos;
        if (j) {
          const a = j["index-finger-tip"], b = j["thumb-tip"], p = j["wrist"], mk = j["middle-finger-phalanx-proximal"];
          // round 8 (Q04): two thresholds (grip below 3 cm, let go above 5 cm), not one at 4 cm: tracking noise near one value made the card jump between the fingers and the palm
          this.pinchVis = hysteresis(this.pinchVis, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), 0.03, 0.05);
          const pinch = this.pinchVis;
          pos = pinch ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.02, z: (a.z + b.z) / 2 } : { x: (p.x + mk.x) / 2, y: (p.y + mk.y) / 2 + 0.06, z: (p.z + mk.z) / 2 };
        }
        this.place(this.heldCard, { x: pos.x, y: Math.max(pos.y, 0.04), z: pos.z }, ctx.head);
      } else {
        this.heldCard.group.visible = false;
        this.pinchVis = false;
      }
    } else {
      this.heldCard.group.visible = false;
      if (this.dealtPlayer && ps !== "dealing" || (ps === "dealing" && this.playerCard.group.visible)) {
        // laid down again (or never lifted)
        const tweening = this.tweens.length > 0 && ps === "dealing";
        if (!tweening && !this.flipping) {
          this.playerCard.group.position.set(SPOTS.playerLay.x, 0.0015, SPOTS.playerLay.z);
          this.playerCard.group.rotation.set(0, 0, 0);
          this.playerCard.group.quaternion.identity();
          this.playerCard.setFlip(1);
        }
        this.playerCard.group.visible = view.card.state !== "none" && ps !== "caught" || ps === "caught";
      }
    }
    // the showdown (and a catch): both cards turn over and stay face up for the whole result beat. The beat knows your card even when it
    // was taken from your hand (a catch confiscates it): it lies face up where yours lay.
    if (view.sharkCard.up && !this.sharkUp) {
      this.sharkUp = true;
      this.flipping = true;
      const mine = view.beat?.player ?? view.card.face;
      if (mine !== null && mine !== undefined) {
        this.playerCard.setCard(mine);
        this.playerCard.group.visible = true;
      }
      if (view.sharkCard.face !== null) this.sharkCard.setCard(view.sharkCard.face);
      const flipMine = mine !== null && mine !== undefined;
      this.tween(0.55, (k) => {
        this.sharkCard.setFlip(1 - k);
        if (flipMine) this.playerCard.setFlip(1 - k);
        this.sharkCard.group.position.y = 0.0015 + Math.sin(Math.PI * k) * 0.07;
        this.playerCard.group.position.y = 0.0015 + Math.sin(Math.PI * k) * 0.07;
      });
    }
    if (showdown && ps === "between" && this.sharkUp) {
      this.sharkCard.group.visible = false;
      this.playerCard.group.visible = false;
    }
    if (ps === "caught" || ps === "gotcha") {
      // a caught round clears the table at the end; before that the cards stay
    }
    this.sharkCard.group.visible = this.sharkCard.group.visible && view.sharkCard.present;
    // the peek (stage D; stage F, D4: a readable payoff): his face-down card rises 19 cm off the felt, comes 7 cm toward you, turns its face to your eyes and grows
    // 1.8 times for 2.4 s, lit from within, then drops back face down. Looking at it, his face is just above it in the same view.
    if (view.peek && this.sharkLaid && !this.sharkUp) {
      const t = view.peek.t;
      const up = Math.min(1, t / 0.3) * Math.max(0, Math.min(1, (PEEK_SHOW_S - t) / 0.35));
      const k = smooth(up);
      this.sharkCard.setCard(view.peek.card);
      this.peekOn = true;
      const pos = { x: SPOTS.sharkLay.x, y: 0.0015 + 0.19 * k, z: SPOTS.sharkLay.z + 0.07 * k };
      if (k > 0.02) this.place(this.sharkCard, pos, ctx.head);
      else {
        this.sharkCard.group.quaternion.identity();
        this.sharkCard.setFlip(1);
        this.sharkCard.group.position.set(SPOTS.sharkLay.x, 0.0015, SPOTS.sharkLay.z);
      }
      this.sharkCard.group.scale.setScalar(1 + 0.8 * k);
      this.sharkCard.setGlow(0.7 * k);
    } else if (this.peekOn) {
      this.peekOn = false;
      this.sharkCard.setGlow(0);
      this.sharkCard.group.scale.setScalar(1);
      this.sharkCard.group.quaternion.identity();
      this.sharkCard.setFlip(1);
      this.sharkCard.group.position.set(SPOTS.sharkLay.x, 0.0015, SPOTS.sharkLay.z);
    }

    // the sleeve card peeks out of the cuff of your holding hand (or the right hand) while you have one up there
    const sleeve = view.sleeve.card;
    // stage D: the card lies tucked in the cuff of the hand that holds nothing: while one hand holds a card, the sleeve card shows at the OTHER hand's
    // cuff (never two cards in one hand); with one hand only (the mouse), it is hidden while that hand holds
    const keys = [...ctx.cuffs.keys()];
    const hid = held ? keys.find((k) => k !== view.card.holderId) : keys.find((k) => k === "right") ?? keys[0];
    const cuff = hid ? ctx.cuffs.get(hid) : undefined;
    if (sleeve !== null && cuff && (ps === "play" || ps === "dealing")) {
      this.sleeveCard.setCard(sleeve);
      this.sleeveCard.setFlip(0);
      // stage D: the card is tucked into the cuff: it lies on the wrist along the arm, only its top end pokes out over the back of the hand (it used
      // to hang in the air at the cuff facing you, and looked like a second card in the hand)
      const j = ctx.joints.get(hid as string);
      if (j && j["wrist"] && j["middle-finger-phalanx-proximal"]) {
        const w = j["wrist"], mk = j["middle-finger-phalanx-proximal"];
        const back = new Vector3(w.x - mk.x, w.y - mk.y, w.z - mk.z).normalize();
        const up = new Vector3(0, 1, 0);
        const zl = back.clone();
        const n = up.clone().sub(zl.clone().multiplyScalar(up.dot(zl))).normalize();
        const xl = new Vector3().crossVectors(n, zl).normalize();
        this.sleeveCard.group.position.set(w.x + back.x * 0.0156, w.y + back.y * 0.0156 + 0.014, w.z + back.z * 0.0156);
        this.sleeveCard.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xl, n, zl));
        this.sleeveCard.group.visible = true;
      } else this.place(this.sleeveCard, { x: cuff.x, y: cuff.y + 0.012, z: cuff.z }, ctx.head, new Vector3(0, 1, 0));
    } else this.sleeveCard.group.visible = false;

    // lamps and tokens
    for (let i = 0; i < 3; i++) {
      for (const side of ["player", "shark"] as const) {
        const lit = view.strikes[side] > i;
        const m = this.strikeLamps[side][i].material as MeshStandardMaterial;
        m.emissive.set(lit ? "#ff2a1a" : "#000000");
        m.emissiveIntensity = lit ? 1.4 + 0.5 * Math.sin(this.clock * 6 + i) : 0;
        m.color.set(lit ? "#ff5a40" : "#3a0c0c");
      }
      const t = this.tokens[i].material as MeshStandardMaterial;
      const have = i < view.pointsLeft;
      t.emissive.set(have ? "#4a3510" : "#000000");
      t.color.set(have ? "#e0b556" : "#4a3f2a");
      this.tokens[i].position.y = have ? 0.006 : 0.003;
    }

    // rings: the cue (where to look or reach), and where a hand under the table is
    const cue = view.cue;
    this.cueRipple.visible = false;
    this.cueGlow.visible = false;
    this.cuffRing.visible = this.cuffRipple.visible = this.cuffGlow.visible = false;
    const cuffCue = cue && (cue.kind === "wrist" || cue.kind === "cuff");
    if (cuffCue) {
      // the ring stands up round his cuff and faces you; the glow sits on the cuff (it is where his sleeve ends, so it is on the sleeve, not on the felt)
      const grab = cue.kind === "wrist";
      this.tmpV.set(ctx.head.x, ctx.head.y, ctx.head.z);
      this.group.localToWorld(this.tmpV);
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * (grab ? 7 : 3));
      const cy = Math.max(cue.pos.y, 0.0) + 0.02;
      const r = (grab ? 0.085 : 0.06) * (1 + 0.18 * pulse);
      this.cuffGlow.visible = true;
      this.cuffGlow.position.set(cue.pos.x, cy, cue.pos.z + 0.02);
      this.cuffGlow.lookAt(this.tmpV);
      this.cuffGlow.scale.setScalar(r * (grab ? 4.2 : 3.4));
      this.cuffGlow.material.opacity = grab ? 0.6 + 0.35 * pulse : 0.28 + 0.3 * pulse;
      if (grab) {
        this.cuffRing.visible = true;
        this.cuffRing.position.copy(this.cuffGlow.position);
        this.cuffRing.lookAt(this.tmpV);
        this.cuffRing.scale.setScalar(r);
        this.cuffRing.material.opacity = 0.9 + 0.1 * pulse;
        const ph = (this.clock * 1.6) % 1;
        this.cuffRipple.visible = true;
        this.cuffRipple.position.copy(this.cuffGlow.position);
        this.cuffRipple.lookAt(this.tmpV);
        this.cuffRipple.scale.setScalar(r * (1 + 0.9 * ph));
        this.cuffRipple.material.opacity = 0.8 * (1 - ph) * (1 - ph);
      }
      this.cueRing.visible = false;
    } else if (cue) {
      const wrist = false;
      const col = wrist ? "#ff7a4a" : cue.kind === "under" ? "#7fe3ff" : "#ffd27a";
      (this.cueRing.material as MeshBasicMaterial).color.set(new Color(col));
      this.cueRing.visible = true;
      // the wrist ring is the one a first-timer must find in a few seconds: big, nearly solid, pulsing about twice a second, with a ripple
      // that swells out of it and a warm glow under it (S2). The card and under-the-table rings keep a calmer pulse.
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * (wrist ? 7 : 5));
      const r = wrist ? 0.1 * (1 + 0.22 * pulse) : 0.085 * (1 + 0.12 * pulse);
      this.cueRing.scale.set(r, 1, r);
      // centred a little toward you from his wrist, over the forearm: his hand no longer covers half of it, and a closed hand there is a grab
      const cx = cue.pos.x, cz = cue.pos.z + (wrist ? 0.025 : 0);
      this.cueRing.position.set(cx, wrist ? Math.max(cue.pos.y, 0) + 0.006 : 0.005, cz);
      this.cueRing.material.opacity = wrist ? 0.86 + 0.14 * pulse : 0.7 + 0.3 * pulse;
      if (wrist) {
        const ph = (this.clock * 1.6) % 1;
        const rr = r * (1 + 0.9 * ph);
        this.cueRipple.visible = true;
        this.cueRipple.scale.set(rr, 1, rr);
        this.cueRipple.position.set(cx, this.cueRing.position.y + 0.001, cz);
        this.cueRipple.material.opacity = 0.8 * (1 - ph) * (1 - ph);
        this.cueGlow.visible = true;
        this.cueGlow.scale.set(r * 4.4, 1, r * 4.4);
        this.cueGlow.position.set(cx, this.cueRing.position.y - 0.001, cz);
        this.cueGlow.material.opacity = 0.55 + 0.4 * pulse;
      }
    } else this.cueRing.visible = false;
    let ui = 0;
    for (const h of view.hands as any[]) {
      if (!h.present || !h.under || ui >= this.underRings.length) continue;
      const r = this.underRings[ui++];
      r.visible = true;
      r.position.set(h.pos.x, 0.004, h.pos.z);
      r.scale.set(0.06, 1, 0.06);
      r.material.opacity = 0.35 + 0.2 * Math.sin(this.clock * 4);
    }
    for (; ui < this.underRings.length; ui++) this.underRings[ui].visible = false;
  }
}
