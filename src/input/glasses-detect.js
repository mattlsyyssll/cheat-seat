/** Is the viewer the Meta VR Glasses? (pure) The Glasses see 37 degrees to each side; a Quest sees far more (about 50 degrees or more to the outside of each eye). The test reads the field of view the
 * session reports for each view (the projection matrix, column-major WebXR layout) and calls it Glasses when no view looks further than `limitDeg` to either side. A page that cannot read a field of view
 * (no views, no matrix) is not called Glasses, so Quest 3 and flat play never change. */
export const GLASSES_SIDE_LIMIT_DEG = 42;

/** @param {ArrayLike<number>|null|undefined} m projection matrix, 16 numbers @returns {{left:number,right:number,up:number,down:number}|null} half angles in degrees */
export function viewAngles(m) {
  if (!m || m.length < 16 || !(m[0] > 0) || !(m[5] > 0)) return null;
  const deg = (t) => (Math.atan(t) * 180) / Math.PI;
  return { left: deg((1 - m[8]) / m[0]), right: deg((1 + m[8]) / m[0]), up: deg((1 + m[9]) / m[5]), down: deg((1 - m[9]) / m[5]) };
}

/** @param {ReadonlyArray<{projectionMatrix?:ArrayLike<number>}>|null|undefined} views the viewer pose's views @param {number} [limitDeg] @returns {boolean|null} true = Glasses, false = wider view, null = unknown */
export function isGlassesViews(views, limitDeg = GLASSES_SIDE_LIMIT_DEG) {
  if (!views || !views.length) return null;
  let side = 0, any = false;
  for (const v of views) {
    const a = viewAngles(v?.projectionMatrix);
    if (!a || ![a.left, a.right, a.up, a.down].every(Number.isFinite)) continue;
    any = true;
    side = Math.max(side, a.left, a.right);
  }
  return any ? side <= limitDeg : null;
}

/** The headset emulator (IWER) draws the Glasses' narrow view as a dark mask over a normal-sized render, and names the device on the mask canvas (data-webxr-visibility-mask="Meta VR Glasses").
 * The emulated Glasses therefore report a wide field of view, so the page also reads this mask: it is the emulator's only trace of the device. A real device has no such canvas.
 * @param {{querySelectorAll?:(sel:string)=>ArrayLike<{dataset?:Record<string,string|undefined>}>}|null|undefined} doc @returns {boolean} */
export function maskIsGlasses(doc) {
  try {
    const list = doc?.querySelectorAll?.("[data-webxr-visibility-mask]");
    if (!list) return false;
    for (let i = 0; i < list.length; i++) if (/glasses/i.test(String(list[i]?.dataset?.webxrVisibilityMask ?? ""))) return true;
  } catch { /* no document */ }
  return false;
}

/** The device call: the reported field of view says Glasses, or the emulator's mask names the Glasses. @param {boolean|null} fov isGlassesViews() @param {boolean} mask maskIsGlasses() @returns {boolean|null} */
export function glassesCall(fov, mask) {
  if (fov === true || mask) return true;
  return fov;
}
