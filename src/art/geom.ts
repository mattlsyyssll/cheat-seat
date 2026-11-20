/** Small helpers for flat-shaded low-poly shapes: many parts, one mesh. */
import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3, Euler, Color } from "@iwsdk/core";

export interface Part {
  geometry: BufferGeometry;
  color: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/** Merge parts into one non-indexed geometry with a colour per vertex (flat normals). */
export function mergeParts(parts: Part[]): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const m = new Matrix4();
  const c = new Color();
  for (const p of parts) {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    m.compose(
      new Vector3(...(p.position ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(p.rotation ?? [0, 0, 0]))),
      new Vector3(...(p.scale ?? [1, 1, 1])),
    );
    g.applyMatrix4(m);
    const pos = g.getAttribute("position");
    c.set(p.color);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      colors.push(c.r, c.g, c.b);
    }
    g.dispose();
    p.geometry.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(positions, 3));
  out.setAttribute("color", new Float32BufferAttribute(colors, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}
