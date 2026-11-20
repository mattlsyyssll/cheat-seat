/** The headset's words (stage D). The flat page tells you what to click; in the headset the same lesson steps are told in hand words, on one small plate that
 * hangs in the upper part of your view (art/hint.ts). The lesson steps show on a first visit only; the result words show every time. By id, like PROMPTS in flat-ui.ts. */
/** @type {Record<string, string>} */
export const XR_PROMPTS = {
  "p1-grab": "Pinch your card to pick it up.",
  "p1-fist": "Close your hand: the card hides.",
  "p1-fist-now": "Close your hand now: he is looking!",
  "p1-open": "Open your hand: the card shows.",
  "p1-lay": "Put the card down on the ring.",
  "p2-wait": "He may lean in. Keep your hands still.",
  "p2-still": "He is staring. Keep your hands still.",
  "p3-wait": "Watch his glowing cuff. He is about to cheat.",
  "p3-grab": "He is cheating! Grab his glowing cuff.",
  "p4-take": "Pinch your card to pick it up.",
  "p4-wait": "Wait until he looks at his own card.",
  "p4-under": "Lower your hand under the table.",
  "p4-swap": "Close your hand for a moment, then open it.",
  "p4-swap-go": "Your hand is closed. Open it now.",
  "p4-swap-retry": "Too quick. Close it a little longer, then open it.",
  "p4-lay": "Close your hand, bring it up, open it over the ring.",
  // stage F: the guided first match (game/duel.js coachTip), the first time each situation happens
  "c-take": "Pinch your card to pick it up.",
  "c-fist": "Close your hand: the card hides.",
  "c-stare": "He is staring. Keep your hands still.",
  "c-under": "He looks at his card. Hand under the table.",
  "c-swap": "Close your hand for a moment, then open it.",
  "c-swap-go": "Your hand is closed. Open it now.",
  "c-swap-retry": "Too quick. Close it a little longer, then open it.",
  "c-hide": "Close your hand. Open it over the ring.",
  "c-cuff": "His cuff glows. Grab it!",
  "tip-point": "Point at the wall: he looks away.",
  // headset only (the page decides these two: it knows the device)
  "c-peek": "Lean over the table to peek.",
  "c-pause": "Pause: touch the brass pad.",
};
/** The goal, shown on the plate before the first deal of a first visit (the same line as the start screen). */
export const XR_GOAL = "Win the pot. Sneak a better card past him. Catch him cheating.";
/** Stage F: the stakes, on the same plate as the goal before the first deal (and on the start screen). */
export const XR_STAKES = "7 rounds. Three strikes and you lose.";
/** Stage E: the match starts by hand. The green orb over the table is touched with a fingertip (or pinched); this line tells it. */
export const XR_DEAL = "Touch the green Deal orb to start.";
/** Result words on the plate: the same words as the page's stamps, except the slam, which says whose hand it was (a headset has no screen flash to say it). */
/** @param {string} main @param {string} sub @returns {{main:string, sub:string}} */
export function xrStamp(main, sub) {
  if (main === "He saw you!") return { main: "He caught your hand", sub: shortSub(sub) };
  return { main, sub: shortSub(sub) };
}
/** Stage G: the plate keeps its second line to one short sentence or two (the judges found the boards crowded). Every rule drops a clause the table already shows. */
/** @param {string} sub @returns {string} */
function shortSub(sub) {
  return sub
    .replace(/^He had (an? .+?) up his sleeve\. You take the pot\. /, (_m, c) => `${c.charAt(0).toUpperCase()}${c.slice(1)} up his sleeve. `)
    .replace(/ from your sleeve is in your hand\. Do not let him see it\./, " from your sleeve. Hide it.")
    .replace(/^About 2 seconds: cheat now\. /, "Cheat now. ")
    .replace(/ look-aways? left\./, (m) => m.replace(" look-aways", "").replace(" look-away", ""))
    .replace(" Now you know what to beat.", "")
    .replace(" He is suspicious now.", "")
    .replace(/ in your hand that he did not deal you\./, " in your hand.");
}
