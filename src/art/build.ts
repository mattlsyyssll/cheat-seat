/** Helpers for the booth's set pieces: shapes, merging many parts into one mesh, and baking the lamp's light into vertex colours so the
 * table, chair and walls need no lights at run time (the SDK guidance is few real-time lights on the headset). */
import {
  BufferGeometry, Float32BufferAttribute, Matrix4, Vector3, Shape, ExtrudeGeometry, LatheGeometry, Vector2, Color, type BufferAttribute,
} from "@iwsdk/core";

export interface Part {
  geometry: BufferGeometry;
  color: string | [number, number, number];
  matrix?: Matrix4;
  /** 0 = take the baked light, 1 = full emissive (unlit). */
  glow?: number;
}

/** Where the lamp is, table-local (matches the booth's lamp). */
export const LAMP = new Vector3(0, 0.95, -0.08);

const tmpC = new Color();
const n3 = new Vector3(), p3 = new Vector3(), l3 = new Vector3();

/** The light that is baked: a warm key from the lamp, a cool fill from the room, a little ambient. */
export function bakedLight(p: Vector3, n: Vector3, out: Vector3): Vector3 {
  l3.copy(LAMP).sub(p);
  const d = l3.length();
  l3.multiplyScalar(1 / (d || 1));
  const ndl = Math.max(0, n.dot(l3));
  const att = 1 / (1 + (d / 0.75) * (d / 0.75));
  const key = 1.55 * ndl * att;
  const up = 0.5 + 0.5 * n.y; // sky fill: faces that look up are a little brighter
  const amb = 0.2 + 0.16 * up;
  return out.set(amb * 0.9 + key * 1.0, amb * 0.92 + key * 0.84, amb * 1.1 + key * 0.62);
}

/** Merge parts (each moved by its matrix) into one indexed geometry with a `color` attribute that already holds the baked light. */
export function mergeBaked(parts: Part[], bake = true): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const m = new Matrix4(), nm = new Matrix4();
  const light = new Vector3();
  for (const part of parts) {
    const g = part.geometry;
    const gp = g.getAttribute("position") as BufferAttribute;
    const gn = g.getAttribute("normal") as BufferAttribute;
    m.copy(part.matrix ?? new Matrix4());
    nm.copy(m).invert().transpose();
    if (typeof part.color === "string") tmpC.set(part.color);
    else tmpC.setRGB(part.color[0], part.color[1], part.color[2]);
    const base = pos.length / 3;
    for (let i = 0; i < gp.count; i++) {
      p3.fromBufferAttribute(gp, i).applyMatrix4(m);
      n3.fromBufferAttribute(gn, i).transformDirection(nm);
      pos.push(p3.x, p3.y, p3.z);
      nor.push(n3.x, n3.y, n3.z);
      if (bake) {
        bakedLight(p3, n3, light);
        const k = part.glow ?? 0;
        col.push(tmpC.r * (light.x * (1 - k) + k), tmpC.g * (light.y * (1 - k) + k), tmpC.b * (light.z * (1 - k) + k));
      } else col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < gp.count; i++) idx.push(i + base);
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/** A rounded rectangle outline centred on the origin in the xy plane. */
export function roundedRect(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** A flat slab with rounded corners and bevelled edges, lying in the xz plane with its bottom at y0 and its top at y0 + height. */
export function slab(w: number, d: number, height: number, corner: number, bevel: number, y0 = 0, hole?: { w: number; d: number; r: number }): BufferGeometry {
  const shape = roundedRect(w, d, corner);
  if (hole) {
    const hp = roundedRect(hole.w, hole.d, hole.r);
    shape.holes.push(hp);
  }
  const g = new ExtrudeGeometry(shape, { depth: Math.max(0.0005, height - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  g.deleteAttribute("uv");
  return g;
}

/** A turned shape: profile = [[radius, y], ...]. */
export function turned(profile: [number, number][], seg = 18): BufferGeometry {
  const g = new LatheGeometry(profile.map((p) => new Vector2(p[0], p[1])), seg);
  g.deleteAttribute("uv");
  return g;
}

export const at = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): Matrix4 =>
  new Matrix4().makeRotationY(ry).premultiply(new Matrix4().makeTranslation(x, y, z)).multiply(new Matrix4().makeScale(sx, sy, sz));
