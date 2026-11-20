/** The feel of the big moments (pure numbers, no graphics): the short slow-motion of the slam, the camera shake of the laptop view, and how
 * loud his breath and the tension tone are. The page (index.ts) reads these; the rules never do. Stage C. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The slam: for the first `holdS` seconds of game time of the "caught" phase (his hand goes up and lands on yours) time runs at `factor`, then
 * it eases back to normal speed by `backBy`. At 0.4 that is about 0.95 s of real time in all, then the strike, the chips and the shake. */
export const SLOW = { factor: 0.4, holdS: 0.26, backBy: 0.46 };

/** @param {string} phase game phase @param {number} phaseT seconds of game time in it @returns {number} the time scale, 1 = normal */
export function slowFactor(phase, phaseT) {
  if (phase !== "caught") return 1;
  if (phaseT < SLOW.holdS) return SLOW.factor;
  if (phaseT >= SLOW.backBy) return 1;
  const k = (phaseT - SLOW.holdS) / (SLOW.backBy - SLOW.holdS);
  return SLOW.factor + (1 - SLOW.factor) * k * k * (3 - 2 * k);
}

/** Real seconds the slow-motion lasts (hold plus the eased part, integrated). */
export function slowRealSeconds(dt = 1 / 240) {
  let real = 0;
  for (let t = 0; t < SLOW.backBy; ) { const f = slowFactor("caught", t); real += dt; t += dt * f; }
  return real;
}

/** The laptop camera shake. A hit gives `peak` (1 = the slam) and the shake dies away with time constant `tau`. Position in metres, angles in
 * radians. Only the flat page uses it: a headset never moves the player's view. */
export const SHAKE = { posMax: 0.016, angMax: (1.1 * Math.PI) / 180, tau: 0.16, durS: 0.7 };

/** @param {number} sinceS seconds since the hit @param {number} peak 0..1 @returns {number} the strength now */
export function shakeAmp(sinceS, peak) {
  if (sinceS < 0 || sinceS > SHAKE.durS) return 0;
  return peak * Math.exp(-sinceS / SHAKE.tau);
}

/** The offset for one frame: a few sine waves that do not repeat quickly (about 19 to 41 Hz), scaled by the strength. */
export function shakeOffset(t, amp) {
  if (amp <= 0.001) return { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
  const w = (f, p) => Math.sin(2 * Math.PI * f * t + p);
  return {
    x: SHAKE.posMax * amp * 0.6 * (w(23, 0.3) + 0.5 * w(37, 1.1)) / 1.5,
    y: SHAKE.posMax * amp * (w(29, 1.7) + 0.5 * w(41, 0.2)) / 1.5,
    z: SHAKE.posMax * amp * 0.5 * w(19, 2.4),
    pitch: SHAKE.angMax * amp * (w(31, 0.9) + 0.4 * w(43, 2.2)) / 1.4,
    yaw: SHAKE.angMax * amp * 0.7 * (w(27, 2.9) + 0.4 * w(39, 0.6)) / 1.4,
    roll: SHAKE.angMax * amp * 0.9 * w(21, 1.4),
  };
}

/** How loud his breath is, by how far he has leaned in (0 to 1): faint when he sits back, full when his face is across the table. */
export function breathIntensity(lean) {
  return 0.2 + 0.8 * clamp(lean, 0, 1);
}

/** The target level of the low tension tone: nothing outside a stare, and in a stare it grows as he leans in and as you give yourself away. */
export function tensionTarget(stare, lean, alert) {
  if (!stare) return 0;
  return clamp(0.3 + 0.55 * clamp(lean, 0, 1) + 0.3 * clamp(alert, 0, 1), 0, 1);
}
