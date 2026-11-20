/** Keeps the audio context running (round 8, Q08 and Q13). A context stays suspended until a user gesture; the browser's own "enter VR" offer and a deep link give no page
 * click, and the system menu, taking the headset off or an interruption suspends it again. It is resumed: when a session starts, on the first select (pinch) in the
 * session, when the system or the page becomes visible again, and when the context itself reports suspended or interrupted. Never while the game is paused. Pure. */
export function createAudioResume({ getCtx, isPaused }) {
  const resume = () => {
    const ctx = getCtx();
    if (!ctx || isPaused()) return false;
    if (ctx.state === "running") return false;
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* blocked audio must never stop the game */
    }
    return true;
  };
  return {
    resume,
    /** The context changed state by itself (not through the game's pause). */
    onState() {
      const ctx = getCtx();
      if (ctx && (ctx.state === "suspended" || ctx.state === "interrupted")) resume();
    },
    /** @param {EventTarget & {visibilityState?:string}} session @param {EventTarget & {hidden?:boolean}} doc */
    watchSession(session, doc) {
      resume(); // the session has started
      session.addEventListener("selectstart", () => resume());
      session.addEventListener("visibilitychange", () => { if (session.visibilityState === "visible") resume(); });
      if (doc && doc.addEventListener) doc.addEventListener("visibilitychange", () => { if (!doc.hidden) resume(); });
    },
  };
}
