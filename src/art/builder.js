/** Collects meshes into one set of arrays (positions, normals, colours, unlit amount, bones, triangles) for the bake step. */
/** Collects meshes into one set of arrays. A vertex function fills `out`: c (colour 0..1), flat (0..1 how unlit), w ([bone, weight] pairs). */
export function makeBuilder() {
  const pos = [], nrm = [], col = [], flat = [], sIdx = [], sW = [], idx = [];
  const parts = [];
  return {
    add(mesh, fn, opts = {}) {
      const base = pos.length / 3;
      const out = { c: [0.5, 0.5, 0.5], flat: 0, w: [] };
      const off = opts.offset ?? [0, 0, 0];
      const sc = opts.scale ?? 1;
      const n = mesh.positions.length / 3;
      for (let i = 0; i < n; i++) {
        const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2];
        out.w.length = 0;
        out.flat = 0;
        fn(x, y, z, out, i, mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
        pos.push(x * sc + off[0], y * sc + off[1], z * sc + off[2]);
        nrm.push(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
        col.push(out.c[0], out.c[1], out.c[2]);
        flat.push(out.flat);
        const w = out.w.filter((p) => p[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        let s = 0;
        for (const p of w) s += p[1];
        if (!w.length) { w.push([0, 1]); s = 1; }
        for (let k = 0; k < 4; k++) {
          sIdx.push(w[k] ? w[k][0] : 0);
          sW.push(w[k] ? w[k][1] / s : 0);
        }
      }
      const i0 = idx.length;
      for (const v of mesh.indices) idx.push(v + base);
      parts.push({ name: opts.name ?? "part", start: i0, count: idx.length - i0, outline: !!opts.outline, tris: (idx.length - i0) / 3 });
    },
    data() {
      // outlined parts first, so one index range draws all the outlines
      const order = [...parts.filter((p) => p.outline), ...parts.filter((p) => !p.outline)];
      const out = [];
      const placed = [];
      for (const p of order) {
        const start = out.length;
        for (let i = p.start; i < p.start + p.count; i++) out.push(idx[i]);
        placed.push({ name: p.name, start, count: p.count, outline: p.outline, tris: p.count / 3 });
      }
      const outlineCount = placed.filter((p) => p.outline).reduce((a, p) => a + p.count, 0);
      return {
        positions: Float32Array.from(pos), normals: Float32Array.from(nrm), colors: Float32Array.from(col), flats: Float32Array.from(flat),
        skinIndex: Uint8Array.from(sIdx), skinWeight: Float32Array.from(sW), indices: Uint32Array.from(out), parts: placed, outlineCount,
      };
    },
  };
}

