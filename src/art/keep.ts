/** Desk Keep: the marked spot on the player's side of the desk and the cards kept on it. Code-made shapes only (a brass frame the size of a card, a small diamond
 * in the middle while the spot is empty); the kept cards lie face down on it. The frame turns red and pulses as his view cone dwells on the spot (the dwell
 * meter of game/keep.js), so the risk can be read from the table without words. Table-local metres. */
import { Group, Mesh, MeshBasicMaterial, BoxGeometry, PlaneGeometry, DoubleSide, Color, AdditiveBlending } from "@iwsdk/core";
import { CardMesh } from "./cards.js";
import { HandMesh } from "./markers.js";
import { keepGhostState } from "../game/ghost.js";
import { CARD } from "../game/layout.js";
import type { Textures } from "./textures.js";

const BRASS = new Color("#c9a24a");
const DANGER = new Color("#ff4a2a");
const CUE = new Color("#fff2c0");
const NO_SPOT = { x: 0, z: 0 };
const FRAME_W = 0.004;

export class KeepSpot {
  readonly group = new Group();
  private readonly cards: CardMesh[];
  private readonly frame: Mesh[] = [];
  private readonly mark: Mesh;
  private readonly mat: MeshBasicMaterial;
  private clock = 0;
  /** The one-time keep lesson: a soft glow under the frame and a see-through hand that closes over the spot, opens and lifts (game/ghost.js keepGhostState). */
  private readonly glow: Mesh;
  private readonly ghost: HandMesh;
  /** QA: the cue is drawn now (glow 0..1). */
  cueGlow = 0;
  /** QA: how many cards are drawn on the spot now. */
  shown = 0;

  constructor(textures: Textures) {
    this.group.name = "keep spot";
    this.mat = new MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide });
    const w = CARD.w + 0.01, h = CARD.h + 0.01;
    const strip = (sx: number, sz: number, x: number, z: number) => {
      const m = new Mesh(new BoxGeometry(sx, 0.0012, sz), this.mat);
      m.position.set(x, 0.0014, z);
      this.group.add(m);
      this.frame.push(m);
    };
    strip(w, FRAME_W, 0, -h / 2);
    strip(w, FRAME_W, 0, h / 2);
    strip(FRAME_W, h, -w / 2, 0);
    strip(FRAME_W, h, w / 2, 0);
    // a small diamond in the middle: the spot is empty
    this.mark = new Mesh(new BoxGeometry(0.014, 0.0012, 0.014), this.mat);
    this.mark.position.set(0, 0.0014, 0);
    this.mark.rotation.y = Math.PI / 4;
    this.group.add(this.mark);
    // the lesson's glow: a pool of light on the felt under the frame, drawn over it
    const gg = new PlaneGeometry(0.2, 0.26);
    gg.rotateX(-Math.PI / 2);
    this.glow = new Mesh(gg, new MeshBasicMaterial({ map: textures.glow, color: "#ffe08a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    this.glow.position.y = 0.0022;
    this.glow.renderOrder = 2;
    this.glow.visible = false;
    this.group.add(this.glow);
    // the ghost hand is drawn 1.35 times life size, like the other lesson hands
    this.ghost = new HandMesh("#f2f8ff", 0.8, textures);
    this.ghost.group.scale.setScalar(1.35);
    this.group.add(this.ghost.group);
    // up to two kept cards, face down, a little crooked so both can be seen
    this.cards = [new CardMesh(textures, "kept card 1"), new CardMesh(textures, "kept card 2")];
    this.cards.forEach((c, i) => {
      c.setFlip(1);
      c.group.position.set(i === 0 ? 0 : 0.006, 0.0016 + i * 0.0012, i === 0 ? 0 : -0.005);
      c.group.rotation.y = i === 0 ? 0 : 0.18;
      c.group.visible = false;
      this.group.add(c.group);
    });
  }

  /** @param view game/duel.js buildView().kept: { cards, spot, meter } @param dt seconds */
  sync(view: { cards: number[]; spot: { x: number; z: number }; meter: number; cue?: number | null; glasses?: boolean } | null | undefined, dt: number): void {
    this.clock += dt;
    if (!view) {
      this.group.visible = false;
      this.shown = 0;
      this.cueGlow = 0;
      return;
    }
    this.group.visible = true;
    this.group.position.set(view.spot.x, 0, view.spot.z);
    for (let i = 0; i < this.cards.length; i++) {
      const c = view.cards[i];
      if (c === undefined) {
        this.cards[i].group.visible = false;
        continue;
      }
      // the card face is set too (never seen face down, but a peek or a play shows it); the back is what lies up
      if (this.cards[i].card !== c) this.cards[i].setCard(c);
      this.cards[i].group.visible = true;
    }
    this.shown = Math.min(view.cards.length, this.cards.length);
    this.mark.visible = view.cards.length === 0;
    const danger = Math.max(0, Math.min(1, view.meter));
    this.mat.color.copy(BRASS).lerp(DANGER, danger);
    this.mat.opacity = 0.75 + 0.25 * danger * (0.5 + 0.5 * Math.sin(this.clock * 14));
    // the one-time keep lesson (no text): the frame glows and the ghost hand shows "open over the spot and lift"
    if (typeof view.cue === "number") {
      const c = keepGhostState(view.cue, NO_SPOT, view.glasses === true);
      this.cueGlow = c.glow;
      this.mat.color.lerp(CUE, 0.6 * c.glow);
      this.mat.opacity = Math.max(this.mat.opacity, 0.75 + 0.25 * c.glow);
      (this.glow.material as MeshBasicMaterial).opacity = 0.9 * c.glow;
      this.glow.visible = c.glow > 0.01;
      this.ghost.group.position.set(c.hand.x, c.hand.y, c.hand.z);
      this.ghost.set(c.flat, c.pinch, c.alpha);
    } else if (this.cueGlow !== 0) {
      this.cueGlow = 0;
      this.glow.visible = false;
      this.ghost.group.visible = false;
    }
  }
}
