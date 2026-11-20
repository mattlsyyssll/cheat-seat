/** Foveation and render scale for the Quest browser (round 8, Q06 and Q14). three.js WebXRManager: the framebuffer scale cannot change in a session, so it is set before
 * the session; the fixed foveation level is stored and applied when the session starts. Values are a choice for a text-heavy table, not measured on a Quest:
 * foveation 0.5 (the default is 1, the strongest: it blurs card text near the edges of the view), scale 1.0 (the browser's recommended size). */
export const XR_QUALITY = { foveation: 0.5, framebufferScale: 1.0 };

/** @param {{isPresenting?:boolean, setFoveation?:(v:number)=>void, setFramebufferScaleFactor?:(v:number)=>void}|null|undefined} xr the renderer's xr manager */
export function applyXrQuality(xr, q = XR_QUALITY) {
  const done = { foveation: null, framebufferScale: null };
  if (!xr) return done;
  if (typeof xr.setFramebufferScaleFactor === "function" && !xr.isPresenting) { xr.setFramebufferScaleFactor(q.framebufferScale); done.framebufferScale = q.framebufferScale; }
  if (typeof xr.setFoveation === "function") { xr.setFoveation(q.foveation); done.foveation = q.foveation; }
  return done;
}
