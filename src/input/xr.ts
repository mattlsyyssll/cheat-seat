/** The headset (and Glasses) adapter: reads the viewer pose, the 25 joints of each tracked hand, the gaze ray and the select events
 * from an XRFrame, puts them in table-local space and gives the rules the same thing the mouse gives: HandInput (see game/duel.js).
 * It also collects detected planes. QA only: `noise` adds tracking jitter to every joint before the pose is read. */
import { Vector3, Matrix4 } from "@iwsdk/core";
import { createHandsFeeder } from "../game/adapters.js";
import { XrReader } from "./xr-read.js";

type V3 = { x: number; y: number; z: number };
export interface HandInputT { id: string; tracked: boolean; pos: V3; fist: boolean; pinch?: boolean; pointRay: { o: V3; d: V3 } | null }

export interface XrRead {
  head: { pos: V3; dir: V3; tracked: boolean };
  hands: HandInputT[];
  joints: Map<string, Record<string, V3>>;
  gaze: { o: V3; d: V3; has: boolean };
  selecting: boolean;
}

export class XrInput {
  selecting = new Set<string>();
  noise = { sigma: 0, seed: 12345 };
  /** Round 8 (Q16): the read lives in xr-read.js and writes over the same objects every frame. */
  private reader = new XrReader(createHandsFeeder);
  private session: XRSession | null = null;

  attach(session: XRSession): void {
    if (this.session === session) return;
    this.session = session;
    this.selecting.clear();
    this.reader.reset();
    session.addEventListener("selectstart", (e) => this.selecting.add((e as XRInputSourceEvent).inputSource.handedness));
    session.addEventListener("selectend", (e) => this.selecting.delete((e as XRInputSourceEvent).inputSource.handedness));
    session.addEventListener("end", () => {
      if (this.session === session) this.session = null;
    });
  }

  /** @param inv the inverse of the table group's world matrix (world to table-local). The result is the same object every call: read it before the next call. */
  read(frame: XRFrame, ref: XRReferenceSpace, inv: Matrix4, dt: number): XrRead {
    return this.reader.read(frame, ref, inv.elements, dt, this.selecting, this.noise) as XrRead;
  }
}

export interface Plane { id: number; y: number; polygon: { x: number; z: number }[]; center: V3; normal: V3; radius: number; horizontal: boolean }

/** Detected planes in world space: a polygon on the floor plane for horizontal ones (desk choice), and a centre, normal and radius
 * for every plane (pointing at a wall). */
export function collectPlanes(frame: XRFrame, ref: XRReferenceSpace): Plane[] {
  const out: Plane[] = [];
  if (!frame.detectedPlanes) return out;
  let id = 0;
  for (const plane of frame.detectedPlanes) {
    id++;
    if (plane.polygon.length < 3) continue;
    const pose = frame.getPose(plane.planeSpace, ref);
    if (!pose) continue;
    const o = pose.transform.orientation, p = pose.transform.position;
    const q = { x: o.x, y: o.y, z: o.z, w: o.w } as never;
    const pts = plane.polygon.map((pt) => new Vector3(pt.x, pt.y, pt.z).applyQuaternion(q));
    const world = pts.map((v) => ({ x: v.x + p.x, y: v.y + p.y, z: v.z + p.z }));
    const normal = new Vector3(0, 1, 0).applyQuaternion(q);
    const horizontal = plane.orientation === "horizontal";
    let r = 0;
    for (const w of world) r = Math.max(r, Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z));
    out.push({ id, y: p.y, polygon: world.map((w) => ({ x: w.x, z: w.z })), center: { x: p.x, y: p.y, z: p.z }, normal: { x: normal.x, y: normal.y, z: normal.z }, radius: r, horizontal });
  }
  return out;
}
