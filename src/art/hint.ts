/** The headset's one plate of words (stage D, rebuilt in stage E). It hangs in the upper part of your view, above his hat, and eases after your head when you look
 * far away (it holds still for small head moves). It shows, in this order: a result stamp ("He caught your hand" and the reason; "Swapped!"; "You take the
 * pot"), else the step you are on (first-visit lessons) or the goal and "Touch the green orb to deal" before the match. Dark with a coloured edge, the words
 * large enough to read in a 640 px wide video, and it keeps clear of his hat, his face and the table. It exists only in a headset session. The words are drawn
 * by art/textures.ts (the one module that draws text). */
import { Mesh, MeshBasicMaterial, CylinderGeometry, BackSide, type Texture } from "@iwsdk/core";
import { makeHint, type PlateTone } from "./textures.js";
import { PaintedTexture } from "./painted-texture.js";

type V3 = { x: number; y: number; z: number };

/** Where the plate hangs, relative to your head: how far (m), its size, how many radians to the left of where your head points (`yaw`), and above it (`lift`). It is a
 * curved strip (part of a cylinder round your head), so every part of it faces your eye and no word is slanted at the edge of a wide view. The left strip of the
 * picture is free (the shelf and the wall); his hat, his face and his hands are not under it. */
// stage F (D7): taller (0.232 to 0.29 m) for 30 percent bigger second lines; the top edge stays where it was (lift 0.4 to 0.37)
export const PLATE = { dist: 0.95, arc: 0.36, height: 0.2806, yaw: 0.42, lift: 0.35, deadZone: 0.03, follow: 3.2 };

export class HintPlate {
  readonly mesh: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private key = "";
  private tex: Texture | null = null;
  /** Round 8 (Q02): one texture, made at setup and painted again in place; never a new one in the session. */
  private painted: PaintedTexture;
  private k = 0;
  private line: { main: string; sub: string; tone: PlateTone } | null = null;
  private stamp: { main: string; sub: string; tone: PlateTone; t: number } | null = null;
  private yaw = 0;
  private elev = 0.3;
  private placed = false;
  /** QA: what the plate shows now (text, or "" when hidden). */
  shown = "";
  /** QA: where the plate is (radians) and how visible. */
  debug(): { yaw: number; elev: number; k: number } { return { yaw: +this.yaw.toFixed(3), elev: +this.elev.toFixed(3), k: +this.k.toFixed(2) }; }

  constructor() {
    // a strip of a cylinder (radius = the distance, axis through your head): seen from inside, so the faces are the back faces; the u coordinate is turned round so the words read left to right
    const geo = new CylinderGeometry(PLATE.dist, PLATE.dist, PLATE.height, 20, 1, true, Math.PI - PLATE.arc / 2, PLATE.arc);
    const uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    this.mesh = new Mesh(geo, new MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0, side: BackSide }));
    this.mesh.name = "hint plate";
    this.painted = new PaintedTexture(() => makeHint(" "), (tex, m: string, sub: string, tone: PlateTone) => void makeHint(m, sub, tone, tex as never));
    this.tex = this.painted.tex;
    this.mesh.material.map = this.tex; // stage F (D15): the material has its map from the start (a map added later changes the shader: a stall at the first plate)
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  /** The steady content: the step you are on, or the goal (null hides it). */
  set(main: string | null, sub = "", tone: PlateTone = "gold"): void {
    this.line = main ? { main, sub, tone } : null;
  }

  /** A result stamp for `secs` seconds (it replaces the steady content while it shows). */
  say(main: string, sub = "", tone: PlateTone = "gold", secs = 2.5): void {
    this.stamp = { main, sub, tone, t: secs };
  }

  /** Drop any stamp (a pause or a restart). */
  clear(): void {
    this.stamp = null;
    this.line = null;
  }

  update(dt: number, head: V3, dir: V3): void {
    if (this.stamp) {
      this.stamp.t -= dt;
      if (this.stamp.t <= 0) this.stamp = null;
    }
    const cur = this.stamp ?? this.line;
    const want = !!cur;
    this.k += ((want ? 1 : 0) - this.k) * Math.min(1, dt * 12);
    // round 4: the plate is fully opaque from k 0.3 on, so its words are bright on the dark plate in every state (a half-faded plate read as pale grey)
    this.mesh.material.opacity = Math.min(1, this.k * 3.4);
    this.mesh.visible = this.k > 0.02;
    this.shown = want ? `${cur!.main}${cur!.sub ? " / " + cur!.sub : ""}` : "";
    if (cur) {
      const key = `${cur.main}|${cur.sub}|${cur.tone}`;
      if (key !== this.key) {
        this.key = key;
        this.painted.repaint(cur.main, cur.sub, cur.tone);
      }
    }
    if (!this.mesh.visible) {
      this.placed = false;
      return;
    }
    // where it should hang: to the left of where your head points and a little above it; it follows only when you turn or tilt past a small dead zone
    const flat = Math.hypot(dir.x, dir.z) || 1;
    const headYaw = Math.atan2(dir.x / flat, dir.z / flat); // table-local: 0 = looking along +z
    const headPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const wantYaw = headYaw;
    const wantElev = Math.max(-0.2, Math.min(0.9, headPitch + PLATE.lift));
    if (!this.placed) {
      this.yaw = wantYaw;
      this.elev = wantElev;
      this.placed = true;
    } else {
      let dy = wantYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const de = wantElev - this.elev;
      const soft = (e: number) => e - Math.max(-PLATE.deadZone, Math.min(PLATE.deadZone, e));
      const a = Math.min(1, dt * PLATE.follow);
      this.yaw += soft(dy) * a;
      this.elev += soft(de) * a;
    }
    // the cylinder's axis is vertical through your head; the strip's middle sits to the left of where you look (PLATE.yaw is negative) and at the elevation `elev`.
    // The strip is built with the middle of its arc at angle PI (toward -z); turning the mesh by ρ moves that angle by -ρ, so ρ = PI - (yaw - PLATE.yaw).
    this.mesh.position.set(head.x, head.y + Math.tan(this.elev) * PLATE.dist, head.z);
    this.mesh.rotation.y = Math.PI - this.yaw + PLATE.yaw;
  }
}
