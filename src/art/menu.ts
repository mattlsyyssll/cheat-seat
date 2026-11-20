/** The hands-only pause menu, drawn (stage D). The rules for it are in game/menu.js. A small brass pad with two bars sits on the felt at the near
 * right corner: touch it with a fingertip and it fills; the game freezes and two orbs float over the table: RESUME (green, a triangle) on the
 * left and EXIT (red, a cross) on the right, with their words under them. A touched orb fills white from the inside. No page words, no 2D layer. */
import {
  Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, CylinderGeometry, SphereGeometry, BoxGeometry, PlaneGeometry, CircleGeometry, ShaderMaterial, Matrix4, DoubleSide, Shape, ShapeGeometry, Vector2, type Texture,
} from "@iwsdk/core";
import { mergeBaked, type Part } from "./build.js";
import { MENU } from "../game/menu.js";
import { makeLabel } from "./textures.js";

type V3 = { x: number; y: number; z: number };

export class PauseMenu {
  readonly group = new Group();
  private padDisc: Mesh<CircleGeometry, ShaderMaterial>;
  private padMat: ShaderMaterial;
  private menu = new Group();
  private dealGroup = new Group();
  private orbs: { name: "deal" | "resume" | "exit"; group: Group; fill: Mesh<SphereGeometry, MeshBasicMaterial>; body: Mesh<SphereGeometry, MeshStandardMaterial>; base: number }[] = [];
  private title: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private labels: Texture[] = [];
  private clock = 0;

  constructor() {
    this.group.name = "pause menu";
    // ---- the pad: ONE mesh for the brass rim, the dark top and the two cream bars (vertex colours), and ONE disc for the glow and the fill (two draw calls)
    const pad = new Group();
    pad.position.set(MENU.pad.x, 0, MENU.pad.z);
    const parts: Part[] = [
      { geometry: new CylinderGeometry(MENU.padR + 0.004, MENU.padR + 0.006, 0.012, 28), color: "#c9a24a", matrix: new Matrix4().makeTranslation(0, 0.006, 0) },
      { geometry: new CylinderGeometry(MENU.padR - 0.002, MENU.padR - 0.002, 0.0125, 28), color: "#2a1d15", matrix: new Matrix4().makeTranslation(0, 0.0065, 0) },
      { geometry: new BoxGeometry(0.009, 0.003, 0.028), color: "#f4ecd8", matrix: new Matrix4().makeTranslation(-0.0115, 0.0145, 0) },
      { geometry: new BoxGeometry(0.009, 0.003, 0.028), color: "#f4ecd8", matrix: new Matrix4().makeTranslation(0.0115, 0.0145, 0) },
    ];
    const body = new Mesh(mergeBaked(parts, false), new MeshBasicMaterial({ vertexColors: true }));
    body.name = "pause pad";
    // the disc: a faint gold glow ring (so the pad can be found) and, while a finger rests on the pad, a gold fill that grows from the middle
    this.padMat = new ShaderMaterial({
      uniforms: { uFill: { value: 0 }, uGlow: { value: 0.12 } },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xz / " + (MENU.padR - 0.002).toFixed(5) + "; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uFill; uniform float uGlow; varying vec2 vP; void main(){ float r = length(vP); float fill = step(r, uFill) * step(0.002, uFill); float glow = (1.0 - smoothstep(0.95, 2.1, r)) * uGlow; float a = max(fill * 0.85, glow); gl_FragColor = vec4(0.886, 0.722, 0.353, a); }",
      transparent: true, depthWrite: false,
    });
    this.padDisc = new Mesh(new CircleGeometry((MENU.padR - 0.002) * 2.1, 40).rotateX(-Math.PI / 2), this.padMat);
    this.padDisc.position.y = 0.0153;
    this.padDisc.name = "pause pad glow";
    pad.add(body, this.padDisc);
    this.group.add(pad);

    // ---- the open menu
    const mk = (name: "deal" | "resume" | "exit", at: V3, color: string, word: string, R = MENU.orbR): void => {
      const g = new Group();
      g.position.set(at.x, at.y, at.z);
      const body = new Mesh(new SphereGeometry(R, 28, 20), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.1 }));
      const fill = new Mesh(new SphereGeometry(R * 0.94, 24, 16), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92, depthWrite: false }));
      fill.scale.setScalar(0.001);
      g.add(body, fill);
      // the glyph sits on the side facing the player (+z of the group, which is turned toward the head each frame)
      const glyphMat = new MeshBasicMaterial({ color: "#fff6e0" });
      if (name === "resume" || name === "deal") {
        // the play triangle: a flat shape on the side that faces the player
        const shape = new Shape([new Vector2(-0.013, -0.021), new Vector2(-0.013, 0.021), new Vector2(0.023, 0)]);
        const tri = new Mesh(new ShapeGeometry(shape), new MeshBasicMaterial({ color: "#fff6e0", side: DoubleSide }));
        tri.position.set(0, 0, R + 0.0005);
        g.add(tri);
      } else {
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          const bar = new Mesh(new BoxGeometry(0.037, 0.008, 0.005), glyphMat);
          bar.rotation.z = a;
          bar.position.set(0, 0, R - 0.001);
          g.add(bar);
        }
      }
      const tex = makeLabel(word, 512, 128);
      this.labels.push(tex);
      const label = new Mesh(new PlaneGeometry(0.21, 0.0525), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }));
      label.position.set(0, -R - 0.05, 0.02);
      g.add(label);
      (name === "deal" ? this.dealGroup : this.menu).add(g);
      this.orbs.push({ name, group: g, fill, body, base: 1 });
    };
    mk("deal", MENU.deal, "#2f9e5a", "Deal", MENU.dealR);
    mk("resume", MENU.resume, "#2f9e5a", "Resume");
    mk("exit", MENU.exit, "#c4382d", "Exit VR");
    const ttex = makeLabel("Paused", 512, 128);
    this.labels.push(ttex);
    this.title = new Mesh(new PlaneGeometry(0.3, 0.075), new MeshBasicMaterial({ map: ttex, transparent: true, depthWrite: false, side: DoubleSide }));
    this.title.position.set(0, MENU.resume.y + 0.14, MENU.resume.z);
    this.menu.add(this.title);
    this.menu.visible = false;
    this.dealGroup.visible = false;
    this.group.add(this.menu, this.dealGroup);
    for (const m of this.group.children) m.renderOrder = 9;
  }

  /** @param open the menu is open @param fill ring fill 0..1 by target name @param head the player's head (the orbs turn to face it) @param tips fingertips of the pointers
   * @param waiting the match has not started: the DEAL orb is up and the pad is not shown (stage E) */
  /** Stage F (D9): the pad is shown to you once (the plate says "Pause any time: touch the brass pad by your right hand"): it glows brighter and pulses. */
  highlight = false;

  update(dt: number, open: boolean, fill: Record<string, number>, head: V3, tips: (V3 | null)[], waiting = false): void {
    this.clock += dt;
    this.menu.visible = open && !waiting;
    this.dealGroup.visible = waiting;
    // the pad: hidden while the menu is open or the DEAL orb is up; a faint breathing glow while closed so it can be found; a gold fill while a finger rests on it
    const padOn = !open && !waiting;
    this.group.children[0].visible = padOn;
    const f = fill.pad ?? 0;
    this.padMat.uniforms.uFill.value = f;
    this.padMat.uniforms.uGlow.value = (this.highlight ? 0.75 + 0.25 * Math.sin(this.clock * 6) : 0.1 + 0.07 * Math.sin(this.clock * 2.2)) + 0.4 * f;
    // stage F (D9): while the plate points it out, the pad swells and shrinks a little (found at a glance)
    this.group.children[0].scale.setScalar(this.highlight ? 1.18 + 0.12 * Math.sin(this.clock * 6) : 1);
    if (!open && !waiting) return;
    for (const o of this.orbs) {
      if ((o.name === "deal") !== waiting) continue;
      o.group.rotation.y = Math.atan2(head.x - o.group.position.x, head.z - o.group.position.z);
      const k = Math.max(0.001, fill[o.name] ?? 0);
      o.fill.scale.setScalar(k);
      const target = MENU[o.name];
      const hover = tips.some((t) => t && Math.hypot(t.x - target.x, t.y - target.y, t.z - target.z) <= (o.name === "deal" ? MENU.dealR : MENU.orbR) * 1.7);
      o.base += ((hover ? 1.1 : 1) - o.base) * Math.min(1, dt * 12);
      o.group.scale.setScalar(o.base);
      o.group.position.y = target.y + 0.008 * Math.sin(this.clock * 2 + (o.name === "exit" ? 1.5 : 0));
    }
    if (open) this.title.rotation.y = Math.atan2(head.x - this.title.position.x, head.z - this.title.position.z);
  }

  dispose(): void {
    for (const t of this.labels) t.dispose();
  }
}
