/** Stage F (judge: "no score display in the headset footage, so stakes are invisible"): the headset's scoreboard. A small board stands on the table at your
 * left, between his glass and the deck, turned toward your head and leaning back a little: the round, the pot, and each side's strikes out of three as red lamps.
 * World-locked (it stays on the table like the cards; it does not follow your head). One mesh, one draw call; the picture is drawn again only when a number changes.
 * Headset session only (the flat page has its own line at the top left). The words are drawn by art/textures.ts. */
import { Mesh, MeshBasicMaterial, PlaneGeometry, DoubleSide, type Texture } from "@iwsdk/core";
import { makeScore } from "./textures.js";
import { PaintedTexture } from "./painted-texture.js";

type V3 = { x: number; y: number; z: number };

/** Where the board stands (table-local, its bottom edge on the felt), its size (m) and how far it leans back (radians). */
export const SCORE = { x: -0.35, z: -0.035, w: 0.21, h: 0.164, lean: 0.3 };

export class ScoreBoard {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private key = "";
  private tex: Texture | null = null;
  /** Round 8 (Q02): one texture, made at setup and painted again in place; never a new one in the session. */
  private painted: PaintedTexture;
  /** QA: what the board shows now. */
  shown = "";

  constructor() {
    const geo = new PlaneGeometry(SCORE.w, SCORE.h);
    geo.translate(0, SCORE.h / 2, 0);
    this.mesh = new Mesh(geo, new MeshBasicMaterial({ transparent: true, side: DoubleSide, toneMapped: false }));
    this.mesh.name = "scoreboard";
    this.mesh.position.set(SCORE.x, 0.002, SCORE.z);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    this.painted = new PaintedTexture(() => makeScore({ round: 1, rounds: 7, pot: 0, you: 0, him: 0 }), (tex, s) => void makeScore(s, tex as never));
    this.tex = this.painted.tex;
    this.mesh.material.map = this.tex; // a map from the start (the warm-up compiles the shader with it)
  }

  /** Show the numbers (null hides the board). The board turns to face `head` about the vertical axis. */
  update(s: { round: number; rounds: number; pot: number; you: number; him: number } | null, head: V3): void {
    this.mesh.visible = !!s;
    if (!s) return;
    const key = `${s.round}|${s.rounds}|${s.pot}|${s.you}|${s.him}`;
    if (key !== this.key) {
      this.key = key;
      this.shown = `Round ${s.round}/${s.rounds} · Pot ${s.pot} · strikes you ${s.you} him ${s.him}`;
      this.painted.repaint(s);
    }
    const yaw = Math.atan2(head.x - SCORE.x, head.z - SCORE.z);
    this.mesh.rotation.set(-SCORE.lean, yaw, 0, "YXZ");
  }
}
