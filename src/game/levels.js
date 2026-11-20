/** Three difficulty sets (PRODUCT-FIT P1-3). Same code, different numbers. Stage 1 added `cheatChance`: the chance
 * that he cheats when your view drops to your hands (every time in the guided first round), `showdownS`: seconds from his card
 * being laid until the cards turn over by themselves, and `reactS`: how long his glove stays under the hat after you look back up. Normal is what the
 * constants in gaze.js and suspicion.js were always set to. A player picks one by pinching one
 * of three small hats on the table before the cut (one, two or three brass bands); no text. */
export const LEVEL_IDS = ["easy", "normal", "hard"];

/** @typedef {{awayMin:number, awayMax:number, fillS:number, catchWindowS:number, cheatChance:number, showdownS:number, reactS:number}} Level */
/** @type {Record<string, Level>} */
export const LEVELS = {
  easy: { awayMin: 1.5, awayMax: 2.5, fillS: 0.9, catchWindowS: 2.0, cheatChance: 0.9, showdownS: 14, reactS: 1.4 },
  normal: { awayMin: 1.0, awayMax: 2.0, fillS: 0.6, catchWindowS: 1.5, cheatChance: 0.8, showdownS: 12, reactS: 1.0 },
  hard: { awayMin: 0.8, awayMax: 1.5, fillS: 0.45, catchWindowS: 1.0, cheatChance: 0.7, showdownS: 10, reactS: 0.7 },
};

/** @param {string|null|undefined} id @returns {string} a valid level id (normal if unknown) */
export function levelId(id) {
  return id && LEVEL_IDS.includes(id) ? id : "normal";
}

/** @param {string|null|undefined} id @returns {Level} */
export function levelOf(id) {
  return LEVELS[levelId(id)];
}

/** Where the three hats stand (table-local), far to near on the right edge of the felt.
 * @type {Record<string,{x:number,z:number}>} */
export const LEVEL_SPOTS = {
  easy: { x: 0.335, z: -0.1 },
  normal: { x: 0.335, z: -0.03 },
  hard: { x: 0.335, z: 0.04 },
};
