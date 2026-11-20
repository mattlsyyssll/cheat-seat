/** The Shark's gaze: a soft cone of light from his eyes onto the desk, and the
 * pool of light where it lands. It is the clock and the whole tutorial. */
import {
  Group, Mesh, CylinderGeometry, CircleGeometry, RingGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide, Vector3,
} from "@iwsdk/core";
import type { Textures } from "./textures.js";

export const CONE_HALF_ANGLE = (11 * Math.PI) / 180;

export class GazeCone {
  group = new Group();
  private cone: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private pool: Mesh<CircleGeometry, MeshBasicMaterial>;
  /** A ring that closes in on the lit circle as the suspicion meter fills. */
  private reticle: Mesh<RingGeometry, MeshBasicMaterial>;
  private origin = new Vector3();
  private target = new Vector3();
  x = 0;
  z = 0;
  intensity = 0;
  /** 0..1: the suspicion meter. The cone narrows and turns from warm to red. */
  tension = 0;

  constructor(textures: Textures) {
    // unit cone: apex at the origin, opening along +z to radius 1 at z = 1
    const g = new CylinderGeometry(0.0015, 1, 1, 24, 1, true);
    g.translate(0, -0.5, 0);
    g.rotateX(-Math.PI / 2);
    this.cone = new Mesh(
      g,
      new MeshBasicMaterial({
        color: "#ffe9a8", transparent: true, opacity: 0, depthWrite: false,
        blending: AdditiveBlending, side: DoubleSide,
      }),
    );
    this.cone.renderOrder = 3;
    this.cone.frustumCulled = false;
    const pg = new CircleGeometry(1, 28);
    pg.rotateX(-Math.PI / 2);
    this.pool = new Mesh(
      pg,
      new MeshBasicMaterial({
        map: textures.glow, color: "#ffe2a0", transparent: true, opacity: 0, depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.pool.renderOrder = 2;
    const rg = new RingGeometry(0.9, 1, 40);
    rg.rotateX(-Math.PI / 2);
    this.reticle = new Mesh(
      rg,
      new MeshBasicMaterial({ color: "#ff4a2a", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
    );
    this.reticle.renderOrder = 4;
    this.reticle.visible = false;
    this.group.add(this.cone, this.pool, this.reticle);
    this.group.name = "gaze cone";
  }

  setOrigin(p: Vector3): void {
    this.origin.copy(p);
  }

  /** Aim at (x, z) on the desk. intensity 0..1. */
  set(x: number, z: number, intensity: number, tension = 0): void {
    this.x = x;
    this.z = z;
    this.intensity = intensity;
    this.tension = tension;
    this.target.set(x, 0.004, z);
    const dist = this.origin.distanceTo(this.target);
    this.cone.position.copy(this.origin);
    this.cone.lookAt(this.target);
    const r = dist * Math.tan(CONE_HALF_ANGLE) * (1 - 0.3 * tension);
    this.cone.scale.set(r, r, dist);
    this.cone.material.color.setRGB(1, 0.91 - 0.55 * tension, 0.66 - 0.5 * tension);
    this.pool.material.color.setRGB(1, 0.89 - 0.55 * tension, 0.63 - 0.5 * tension);
    this.cone.material.opacity = (0.16 + 0.12 * tension) * intensity;
    this.cone.visible = intensity > 0.01;
    this.pool.position.copy(this.target);
    this.pool.position.y = 0.003;
    this.pool.scale.set(r * 0.95, 1, r * 0.95 * 1.4);
    this.pool.material.opacity = (0.34 + 0.2 * tension) * intensity;
    this.pool.visible = intensity > 0.01;
    // the reticle closes from a wide ring to the edge of the lit circle and burns red
    const showR = tension > 0.03 && intensity > 0.3;
    this.reticle.visible = showR;
    if (showR) {
      const rr = r * (1.9 - 0.9 * tension);
      this.reticle.position.set(x, 0.0045, z);
      this.reticle.scale.set(rr, 1, rr * 1.4);
      this.reticle.material.opacity = Math.min(1, tension * 1.6) * 0.85 * intensity;
    }
  }

  /** Radius of the lit circle on the desk, in metres. */
  get footprint(): number {
    const dist = this.origin.distanceTo(this.target);
    return dist * Math.tan(CONE_HALF_ANGLE) * 0.95 * (1 - 0.3 * this.tension);
  }
}
