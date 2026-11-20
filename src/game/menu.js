/** The hands-only pause menu (stage D, judge fix 1; Meta's 2026 rule: entries must be fully usable with hands, end to end). Pure: no graphics,
 * no device. Every way of playing in the headset gives the same pointers each frame:
 *   Pointer = { id, tip: V3|null, press: boolean, ray?: {o, d} }   (table-local metres)
 * Real hands: tip = the index fingertip, press = a pinch. Glasses (gaze and pinch): ray = the gaze ray, press = the pinch (the closed menu's pad
 * needs the pinch; the open menu's orbs also take a half second of looking).
 * Nothing here reads a controller, a button or a cursor.
 *
 * Waiting (stage E, judge item 1: the match must start by hand): after the table is placed, one green DEAL orb floats over the middle of the table. Touch it
 * with a fingertip for `dwellS` seconds, or pinch on it (Glasses: look at it for half a second, or pinch): the match starts. Only then the pause pad appears.
 * Closed: a small brass PAUSE pad sits on the felt at the near right corner. Touch it with a fingertip for `DWELL_S` seconds (a ring fills), or
 * pinch on it: the game freezes and the menu opens.
 * Open: two orbs float over the table, RESUME on the left and EXIT on the right. Touch one with a fingertip for `DWELL_S` seconds, or pinch on it.
 * Exit ends the headset session (the page's start screen is back; nothing more to do). */
/** @typedef {{x:number,y:number,z:number}} V3 */
/** @typedef {{id:string, tip:V3|null, press:boolean, ray?:{o:V3,d:V3}|null}} Pointer */

export const MENU = {
  /** Where the pause pad is (the centre of its top, table-local). Stage F (D9): on the felt to the right of your card, inside the picture of a seated player who looks at
   * his face (it was at the near right corner, cut off at the lower right edge of every headset picture), clear of the card, the tokens and your resting hand. */
  pad: { x: 0.3, y: 0.012, z: 0.035 }, padR: 0.04,
  /** The two orbs of the open menu, over the middle of the table at hand height, in reach of a seated player. */
  resume: { x: -0.12, y: 0.12, z: 0.1 }, exit: { x: 0.12, y: 0.12, z: 0.1 }, orbR: 0.05,
  /** The DEAL orb that starts the match (stage E): over the middle of the table, between the two hands' resting places, in easy reach. */
  deal: { x: 0, y: 0.11, z: 0.14 }, dealR: 0.055,
  /** Seconds a fingertip must stay on a target (a pinch on it counts at once). */
  dwellS: 0.55,
  /** Seconds after the menu opens or closes during which nothing is chosen (the hand that opened it is still there). */
  coolS: 0.8,
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** The distance from the point `c` to the ray (origin o, unit direction d), in front of the origin only. */
function rayDist(c, ray) {
  const dl = Math.hypot(ray.d.x, ray.d.y, ray.d.z) || 1;
  const d = { x: ray.d.x / dl, y: ray.d.y / dl, z: ray.d.z / dl };
  const v = { x: c.x - ray.o.x, y: c.y - ray.o.y, z: c.z - ray.o.z };
  const t = v.x * d.x + v.y * d.y + v.z * d.z;
  if (t < 0) return Infinity;
  return Math.hypot(v.x - d.x * t, v.y - d.y * t, v.z - d.z * t);
}

/** @param {{waiting?:boolean}} [o] `waiting`: the DEAL orb is up and the match has not started (the pad is not shown yet).
 * @returns {{open:boolean, waiting:boolean, cool:number, dwell:Record<string,number>, last:string|null}} */
export function createMenu(o = {}) {
  return { open: false, waiting: !!o.waiting, cool: 0.5, dwell: { pad: 0, resume: 0, exit: 0, deal: 0 }, last: null };
}

/** One frame. Returns the events of this frame ("deal", "pause", "resume", "exit") and the fill (0 to 1) of each target's ring.
 * @param {ReturnType<typeof createMenu>} m @param {number} dt @param {Pointer[]} pointers
 * @returns {{events:string[], fill:Record<string,number>}} */
export function stepMenu(m, dt, pointers) {
  const events = [];
  m.cool = Math.max(0, m.cool - dt);
  const targets = m.waiting ? [["deal", MENU.deal, MENU.dealR]] : m.open ? [["resume", MENU.resume, MENU.orbR], ["exit", MENU.exit, MENU.orbR]] : [["pad", MENU.pad, MENU.padR]];
  let hit = null;
  for (const [name, c, r] of targets) {
    for (const p of pointers) {
      if (p.ray) {
        // a gaze ray: it is "on" a target when it passes within the target's radius; the pad also needs the pinch (looking at the table's corner is not a choice)
        const d = rayDist(c, p.ray);
        if (d <= r * 1.15 && (p.press || m.open || m.waiting)) hit = hit && hit.name !== name ? hit : { name, pinch: hit?.pinch || p.press };
        continue;
      }
      if (!p.tip) continue;
      const d = dist(p.tip, c);
      // touching: a fingertip inside the target. pinching: a pinch within a hand's breadth of it counts at once
      if (d <= r) hit = hit && hit.name !== name ? hit : { name, pinch: hit?.pinch || p.press };
      else if (p.press && d <= r * 1.7) hit = hit && hit.name !== name ? hit : { name, pinch: true };
    }
  }
  for (const [name] of targets) {
    if (hit && hit.name === name && m.cool <= 0) m.dwell[name] += dt;
    else m.dwell[name] = Math.max(0, m.dwell[name] - dt * 2);
  }
  // the targets that are not on screen right now fill nothing
  for (const k of Object.keys(m.dwell)) if (!targets.some(([n]) => n === k)) m.dwell[k] = 0;
  if (hit && m.cool <= 0 && (m.dwell[hit.name] >= MENU.dwellS || hit.pinch)) {
    const name = hit.name;
    for (const k of Object.keys(m.dwell)) m.dwell[k] = 0;
    m.cool = MENU.coolS;
    if (name === "deal") { m.waiting = false; events.push("deal"); }
    else if (name === "pad") { m.open = true; events.push("pause"); }
    else if (name === "resume") { m.open = false; events.push("resume"); }
    else if (name === "exit") { m.open = false; events.push("exit"); }
  }
  const fill = {};
  for (const k of Object.keys(m.dwell)) fill[k] = Math.min(1, m.dwell[k] / MENU.dwellS);
  return { events, fill };
}

/** Pointers from a headset frame: the index fingertip of each tracked hand with its pinch, or the gaze hand (its position and pinch). Joints are
 * table-local, 25 per hand. @param {{id:string, pinch?:boolean, fist?:boolean, pos:V3}[]} hands @param {Map<string, Record<string,V3>>} joints @param {boolean} gazeMode @param {{o:V3,d:V3}|null} [gazeRay]
 * @returns {Pointer[]} */
export function pointersFrom(hands, joints, gazeMode, gazeRay = null) {
  const out = [];
  for (const h of hands) {
    if (gazeMode) {
      out.push({ id: h.id, tip: h.pos, press: !!h.fist || !!h.pinch, ray: gazeRay });
      continue;
    }
    const j = joints.get(h.id);
    const tip = j && j["index-finger-tip"] ? j["index-finger-tip"] : null;
    out.push({ id: h.id, tip, press: !!h.pinch });
  }
  return out;
}
