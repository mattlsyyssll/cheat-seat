/** The Shark's baked triangles, unpacked once when the page loads (top-level await: a few milliseconds). If the browser cannot inflate the
 * string, the same shapes are meshed live instead (about 1.5 s on a laptop). See qa/stageB/bake-shark.mjs. */
import baked from "./baked/shark.js";
import { pack, unpack } from "./pack.js";

export interface SharkData {
  positions: Float32Array;
  normals: Float32Array;
  /** 0..255, display (sRGB) values; flats and weights are bytes too (weights add to 255). */
  colors: Uint8Array;
  flats: Uint8Array;
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  indices: Uint16Array | Uint32Array;
  parts: { name: string; start: number; count: number; outline: boolean; tris: number }[];
  outlineCount: number;
}

async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function load(): Promise<SharkData> {
  try {
    // ?live in the URL (development only) meshes the shapes now instead of reading the baked string
    if (import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("live")) throw new Error("live");
    return unpack(await inflate(baked)) as SharkData;
  } catch (e) {
    if ((e as Error).message !== "live") console.warn("[art] baked Shark could not be read; meshing live", e);
    const { buildShark } = await import("./shark-model.js");
    return unpack(pack(buildShark())) as SharkData;
  }
}

export const SHARK: SharkData = await load();
