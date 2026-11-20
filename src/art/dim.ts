/** The headset room, lit like the dark study of flat play (stage D, judge fix 10). In mixed reality the real room shows through, bright and ordinary.
 * A big translucent dark dome around the table dims it, clearest around the table and darkest toward the walls, with a warm black tint, so the light
 * seems to come from the lamp over the table. It is an ordinary transparent object (no pass-through control is needed: the compositor blends it over
 * the camera picture, in the emulator over its drawn room). Costs one draw call and no light. The flat page never shows it. */
import { Mesh, SphereGeometry, ShaderMaterial, Vector3, BackSide, type Object3D } from "@iwsdk/core";

export class RoomDim {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private v = new Vector3();

  constructor() {
    this.mat = new ShaderMaterial({
      uniforms: { uTable: { value: new Vector3(0, 0.1, 0) }, uCenter: { value: 0.3 }, uEdge: { value: 0.78 }, uColor: { value: new Vector3(0.045, 0.028, 0.02) }, uPause: { value: 0 } },
      vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: `uniform vec3 uTable; uniform float uCenter; uniform float uEdge; uniform vec3 uColor; uniform float uPause; varying vec3 vW;
        void main(){
          vec3 toFrag = normalize(vW - cameraPosition);
          vec3 toTable = normalize(uTable - cameraPosition);
          float ang = acos(clamp(dot(toFrag, toTable), -1.0, 1.0));
          float a = mix(uCenter, uEdge, smoothstep(0.3, 0.95, ang));
          a = clamp(a + uPause * 0.16, 0.0, 0.92);
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true, depthWrite: false, depthTest: true, side: BackSide,
    });
    this.mesh = new Mesh(new SphereGeometry(5.5, 40, 20), this.mat);
    this.mesh.name = "room dim";
    this.mesh.renderOrder = -50;
    this.mesh.frustumCulled = false;
    this.mesh.position.set(0, 0.2, 0); // a child of the table group: it follows the table
    this.mesh.visible = false;
  }

  /** @param on a headset session is running @param paused the pause menu is open @param root the table group (the table's world position is read from it) */
  update(on: boolean, paused: boolean, root: Object3D): void {
    this.mesh.visible = on;
    if (!on) return;
    root.localToWorld(this.v.set(0, 0.1, -0.05));
    (this.mat.uniforms.uTable.value as Vector3).copy(this.v);
    this.mat.uniforms.uPause.value = paused ? 1 : 0;
  }
}
