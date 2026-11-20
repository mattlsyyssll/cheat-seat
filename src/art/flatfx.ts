/** Screen finish for the laptop view only: a soft vignette, a warm glow from the lamp at the top, and a touch of contrast and colour on
 * the picture. It is a plain page layer on top of the 3D canvas: it costs the graphics chip nothing, it is not part of the 3D scene, and in
 * a headset session the page is not shown at all, so the headset pays nothing. ?fx=0 in the address turns it off.
 * (A full-screen bloom pass through the SDK's renderer was tried first; its colours came out wrong and the cause is unknown, so it was dropped.) */
const ID = "flatfx";

function install(): void {
  if (typeof document === "undefined") return;
  if (new URLSearchParams(location.search).get("fx") === "0") return;
  if (document.getElementById(ID)) return;
  const host = document.getElementById("scene-container") ?? document.body;
  const style = document.createElement("style");
  style.textContent = `
    #${ID} { position: absolute; inset: 0; pointer-events: none;
      background:
        radial-gradient(ellipse 80% 70% at 50% 45%, rgba(0,0,0,0) 55%, rgba(8,4,2,0.55) 100%),
        radial-gradient(ellipse 55% 30% at 50% 0%, rgba(255,190,115,0.13), rgba(255,190,115,0) 72%),
        linear-gradient(to bottom, rgba(0,0,0,0) 70%, rgba(0,0,0,0.22) 100%); }
    #scene-container canvas { filter: saturate(1.07) contrast(1.05); }`;
  const el = document.createElement("div");
  el.id = ID;
  el.setAttribute("aria-hidden", "true");
  document.head.appendChild(style);
  host.appendChild(el);
  // the canvas is added after this runs; keep the layer last in its container so it sits on top of the canvas and under the page's own words
  new MutationObserver(() => { if (host.lastElementChild !== el) host.appendChild(el); }).observe(host, { childList: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}

export {};
