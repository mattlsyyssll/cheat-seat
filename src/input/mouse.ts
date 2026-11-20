/** The mouse (flat play): turns the pointer, the buttons and the wheel into the pure MouseState of game/adapters.js. The page never
 * decides anything about the game here; the adapter makes a 3D hand and a 3D ray out of this state. Left button held = closed fist
 * (a quick click keeps the fist for a moment, see CLICK in game/adapters.js). Right button = point; the Point button or P turns on
 * point mode, where a left click points. Wheel = hand depth. Near the screen edges the head turns a little. */
import { createMouse, mouseWheel, mouseButton, type MouseState } from "../game/adapters.js";

export function attachMouse(canvas: HTMLElement, onGesture: () => void, onEscape: () => void = () => {}): MouseState {
  const m: MouseState = createMouse();
  m.over = false;
  const toNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    m.ndcX = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    m.ndcY = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
  };
  canvas.addEventListener("pointermove", (e) => {
    toNdc(e);
    m.over = true;
  });
  canvas.addEventListener("pointerdown", (e) => {
    toNdc(e);
    m.over = true;
    mouseButton(m, e.button === 2 ? "right" : "left", true);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    onGesture();
    e.preventDefault();
  });
  const up = (e: PointerEvent) => {
    mouseButton(m, e.button === 2 ? "right" : "left", false);
  };
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", () => {
    m.left = false;
    m.right = false;
  });
  canvas.addEventListener("pointerleave", () => {
    m.over = false;
    m.left = false;
    m.right = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      mouseWheel(m, -e.deltaY * 0.0009);
      e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "p") m.pointMode = !m.pointMode;
    else if (k === "escape") {
      const wasPoint = m.pointMode;
      m.pointMode = false;
      if (!wasPoint) onEscape(); // Esc leaves point mode first; with no point mode on, it pauses (stage D)
    }
    else if (k === " ") {
      m.dive = true; // hold Space: the hand goes under the table
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === " ") m.dive = false;
  });
  window.addEventListener("blur", () => {
    m.left = false;
    m.right = false;
    m.dive = false;
  });
  return m;
}

/** Run `cb` once, at the first press anywhere on the page (the browser keeps sound off until a gesture). */
export function onFirstPointer(cb: () => void): void {
  window.addEventListener("pointerdown", () => cb(), { once: true });
}

/** Run `cb` once, at the first press or key anywhere on the page (capture phase, so a button's own handler runs after it). Stage D: the sound starts here. */
export function onAnyGesture(cb: (e: Event) => void): void {
  let done = false;
  const once = (e: Event) => {
    if (done) return;
    done = true;
    window.removeEventListener("pointerdown", once, true);
    window.removeEventListener("keydown", once, true);
    cb(e);
  };
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("keydown", once, true);
}

/** QA and pictures: the client pixel for a point in screen units (-1 to 1 each way). */
export function ndcToClient(el: HTMLElement, ndcX: number, ndcY: number): { px: number; py: number } {
  const r = el.getBoundingClientRect();
  return { px: Math.round(r.left + ((ndcX + 1) / 2) * r.width), py: Math.round(r.top + ((1 - ndcY) / 2) * r.height) };
}
