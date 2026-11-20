/** The player's baked hand (right hand, 16 bones, a sleeve behind the wrist), unpacked once at page load. Same format as shark-data.ts. */
import baked from "./baked/hand.js";
import { pack, unpack } from "./pack.js";
import type { SharkData } from "./shark-data.js";

async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function load(): Promise<SharkData> {
  try {
    return unpack(await inflate(baked)) as SharkData;
  } catch (e) {
    console.warn("[art] baked hand could not be read; meshing live", e);
    const { buildPlayerHand } = await import("./shark-hand.js");
    return unpack(pack(buildPlayerHand())) as SharkData;
  }
}

export const HAND: SharkData = await load();
