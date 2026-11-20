/** Desk Keep, the headset side of saving: a WebXR anchor on the desk for the keep spot, with a persistent handle when the browser offers one.
 * Everything here is optional and defensive: a browser without anchors (the emulator, a phone, a laptop) just ends in status "none", and the page falls back to the
 * saved position relative to the desk (game/keep.js). Nothing here throws. The browser objects are passed in, so tests drive it with fakes.
 *
 * Flow, once per headset session, after the table is placed (`startAnchor`):
 *   1. a saved handle and `session.restorePersistentAnchor`  -> the anchor from the last visit (status "ready", how "restored")
 *   2. else `frame.createAnchor` at the spot's world position -> a new anchor; if it has `requestPersistentHandle`, the handle is kept for the next visit (how "created")
 *   3. else status "none"
 * Then `readAnchor` gives the anchor's world position each time the page asks. */

/** @typedef {{anchor:any, handle:string|null, status:"idle"|"pending"|"ready"|"none", how:string, error:string, read:string}} KeepAnchor  read = why the last readAnchor gave what it gave (stage H: for the debug state) */

/** @returns {KeepAnchor} */
export function createKeepAnchor() {
  return { anchor: null, handle: null, status: "idle", how: "", error: "", read: "" };
}

/** Forget the anchor (a new session). The saved handle may be kept: it is how the next session finds the same spot. @param {KeepAnchor} k @param {string|null} [keepHandle] */
export function resetKeepAnchor(k, keepHandle = null) {
  k.anchor = null;
  k.handle = keepHandle;
  k.status = "idle";
  k.how = "";
  k.error = "";
  k.read = "";
}

/** What this session offers. @param {any} session @param {any} frame */
export function anchorSupport(session, frame) {
  return {
    create: typeof frame?.createAnchor === "function",
    restore: typeof session?.restorePersistentAnchor === "function",
  };
}

/**
 * Start the anchor for this session. Call it from inside the XR frame (createAnchor needs a live frame); the returned promise settles when the anchor is ready or has failed.
 * @param {KeepAnchor} k
 * @param {{session:any, frame:any, ref:any, world:{x:number,y:number,z:number}, handle?:string|null, makeTransform?:(p:{x:number,y:number,z:number})=>any}} o
 * @returns {Promise<KeepAnchor>}
 */
export async function startAnchor(k, o) {
  if (k.status !== "idle") return k;
  k.status = "pending";
  try {
    if (o.handle && typeof o.session?.restorePersistentAnchor === "function") {
      try {
        const a = await o.session.restorePersistentAnchor(o.handle);
        if (a) {
          k.anchor = a;
          k.handle = o.handle;
          k.status = "ready";
          k.how = "restored";
          return k;
        }
      } catch (e) {
        k.error = `restore: ${String(e)}`; // the handle is stale or refused: make a new anchor below
      }
    }
    if (typeof o.frame?.createAnchor === "function") {
      const make = o.makeTransform ?? ((p) => new XRRigidTransform({ x: p.x, y: p.y, z: p.z }));
      const a = await o.frame.createAnchor(make(o.world), o.ref);
      if (a) {
        k.anchor = a;
        k.handle = null; // a stale handle from an earlier visit no longer names this anchor
        k.status = "ready";
        k.how = "created";
        if (typeof a.requestPersistentHandle === "function") {
          try {
            const h = await a.requestPersistentHandle();
            k.handle = typeof h === "string" && h.length > 0 ? h : null;
          } catch (e) {
            k.error = `persist: ${String(e)}`; // the anchor works for this session; it just will not last
          }
        }
        return k;
      }
    }
    k.status = "none";
  } catch (e) {
    k.status = "none";
    k.error = String(e);
  }
  return k;
}

/**
 * The anchor's world position now, or null (no anchor, not tracked this frame, no pose).
 * @param {KeepAnchor} k @param {any} frame @param {any} ref @returns {{x:number,y:number,z:number}|null}
 */
export function readAnchor(k, frame, ref) {
  if (k.status !== "ready" || !k.anchor) { k.read = "not-ready"; return null; }
  try {
    const tracked = frame?.trackedAnchors;
    if (tracked && typeof tracked.has === "function" && !tracked.has(k.anchor)) { k.read = "not-tracked"; return null; }
    const pose = frame.getPose(k.anchor.anchorSpace, ref);
    if (!pose) { k.read = "no-pose"; return null; }
    const p = pose.transform.position;
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) { k.read = "ok"; return { x: p.x, y: p.y, z: p.z }; }
    k.read = "bad-number";
    return null;
  } catch (e) {
    k.read = `error: ${String(e).slice(0, 80)}`;
    return null;
  }
}
