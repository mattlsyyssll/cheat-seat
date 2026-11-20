/** Packs the Shark's mesh arrays into one compact byte string and reads it back. Positions are 16-bit over their own box, normals are
 * signed bytes, colours and weights are bytes. Pure JavaScript; the bake script deflates and base64-encodes the result. */
const MAGIC = 0x53484b31; // "SHK1"

export function pack(d) {
  const nv = d.positions.length / 3, ni = d.indices.length;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], d.positions[i * 3 + k]); mx[k] = Math.max(mx[k], d.positions[i * 3 + k]); }
  const meta = JSON.stringify({ nv, ni, mn, mx, parts: d.parts, outlineCount: d.outlineCount });
  const metaBytes = new TextEncoder().encode(meta);
  const size = 12 + metaBytes.length + nv * 6 + nv * 3 + nv * 3 + nv + nv * 4 + nv * 4 + ni * (nv < 65536 ? 2 : 4);
  const buf = new ArrayBuffer(size + 8);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint32(o, MAGIC); o += 4;
  dv.setUint32(o, metaBytes.length); o += 4;
  dv.setUint32(o, nv < 65536 ? 2 : 4); o += 4;
  new Uint8Array(buf, o, metaBytes.length).set(metaBytes); o += metaBytes.length;
  o = (o + 3) & ~3;
  const u16 = new Uint16Array(buf, o, nv * 3); o += nv * 6;
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) u16[i * 3 + k] = Math.round(((d.positions[i * 3 + k] - mn[k]) / (mx[k] - mn[k] || 1)) * 65535);
  const i8 = new Int8Array(buf, o, nv * 3); o += nv * 3;
  for (let i = 0; i < nv * 3; i++) i8[i] = Math.round(Math.max(-1, Math.min(1, d.normals[i])) * 127);
  const c8 = new Uint8Array(buf, o, nv * 3); o += nv * 3;
  for (let i = 0; i < nv * 3; i++) c8[i] = Math.round(Math.max(0, Math.min(1, d.colors[i])) * 255);
  const f8 = new Uint8Array(buf, o, nv); o += nv;
  for (let i = 0; i < nv; i++) f8[i] = Math.round(Math.max(0, Math.min(1, d.flats[i])) * 255);
  new Uint8Array(buf, o, nv * 4).set(d.skinIndex); o += nv * 4;
  const w8 = new Uint8Array(buf, o, nv * 4); o += nv * 4;
  for (let i = 0; i < nv; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) { w8[i * 4 + k] = Math.round(d.skinWeight[i * 4 + k] * 255); s += w8[i * 4 + k]; }
    w8[i * 4] += 255 - s; // weights add to exactly 255
  }
  o = (o + 3) & ~3;
  const IdxArr = nv < 65536 ? Uint16Array : Uint32Array;
  // indices are stored as differences from the previous one (small numbers deflate well)
  const ia = new IdxArr(buf, o, ni);
  let prev = 0;
  for (let i = 0; i < ni; i++) { ia[i] = (d.indices[i] - prev) & (nv < 65536 ? 0xffff : 0xffffffff); prev = d.indices[i]; }
  return new Uint8Array(buf, 0, o + ni * IdxArr.BYTES_PER_ELEMENT);
}

export function unpack(bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const dv = new DataView(buf);
  if (dv.getUint32(0) !== MAGIC) throw new Error("bad shark data");
  const metaLen = dv.getUint32(4), idxBytes = dv.getUint32(8);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, metaLen)));
  const { nv, ni, mn, mx } = meta;
  let o = (12 + metaLen + 3) & ~3;
  const u16 = new Uint16Array(buf, o, nv * 3); o += nv * 6;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = mn[k] + (u16[i * 3 + k] / 65535) * (mx[k] - mn[k]);
  const i8 = new Int8Array(buf, o, nv * 3); o += nv * 3;
  const normals = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) normals[i] = i8[i] / 127;
  const colors = new Uint8Array(buf, o, nv * 3); o += nv * 3;
  const flats = new Uint8Array(buf, o, nv); o += nv;
  const skinIndex = new Uint8Array(buf, o, nv * 4); o += nv * 4;
  const w8 = new Uint8Array(buf, o, nv * 4); o += nv * 4;
  o = (o + 3) & ~3;
  const IdxArr = idxBytes === 2 ? Uint16Array : Uint32Array;
  const raw = new IdxArr(buf, o, ni);
  const indices = new IdxArr(ni);
  let prev = 0;
  const mask = idxBytes === 2 ? 0xffff : 0xffffffff;
  for (let i = 0; i < ni; i++) { prev = (prev + raw[i]) & mask; indices[i] = prev; }
  return { positions, normals, colors, flats, skinIndex, skinWeight: w8, indices, parts: meta.parts, outlineCount: meta.outlineCount };
}
