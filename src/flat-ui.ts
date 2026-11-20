/** The page's own words and signs for flat play (plain DOM): the start screen with two big buttons, the round line, one short prompt
 * during the practice rounds, the "hold still" cue, a small hand icon when your hand is under the table, big stamps and a flash.
 * The headset scene shows none of this (hands only, no text). The rules never read anything from here. */

export interface FlatHud {
  round: number; rounds: number; pot: number; strikesYou: number; strikesHim: number; points: number;
  /** Stage F: the score (each side's chips). */
  chipsYou?: number; chipsHim?: number;
  /** In the four practice rounds: which lesson (1 to 4) and its name. The round, strikes and points are not shown then. */
  lesson?: { step: number; name: string } | null;
}

import { cardWords } from "./game/cards.js";
export { cardWords };

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

/** Stage F (D12): the line under "Enter VR" is the same in every build (the take showed one text, the flat pictures another). index.html carries the same words. */
export const VR_NOTE = "hands only, on Quest 3";

/** Plain words for the lines at the top, by id (game/duel.js guideFor). Flat play words only; the headset gets rings, not text.
 * `hint` is a smaller second part (an alternative). Short sentences, each lesson step in the order you do it. */
export const PROMPTS: Record<string, { text: string; hint?: string; urgent?: boolean }> = {
  "p1-grab": { text: "Click your card to pick it up." },
  "p1-fist": { text: "Hold the mouse button: your hand closes and hides the card." },
  "p1-fist-now": { text: "Hold the mouse button: your hand closes and hides the card.", urgent: true },
  "p1-open": { text: "Let go: your hand opens and shows the card." },
  "p1-lay": { text: "Click the ring to put the card down.", hint: "Your sleeve card slides in: a better one." },
  "p2-wait": { text: "He may lean in. Do not move the mouse." },
  "p2-still": { text: "He is staring at you. Do not move the mouse.", urgent: true },
  "p3-wait": { text: "Watch his glowing cuff. He is about to cheat." },
  "p3-grab": { text: "He is cheating! Hold the mouse button on his glowing cuff.", urgent: true },
  "p4-take": { text: "Click your card to pick it up." },
  "p4-wait": { text: "Wait until he looks down at his own card." },
  "p4-under": { text: "Push the mouse to the bottom of the screen: your hand goes under the table.", hint: "Or hold the Space bar.", urgent: true },
  "p4-swap": { text: "Hold the mouse button, then let go: you swap." },
  "p4-swap-go": { text: "Let go of the mouse button now: you swap." },
  "p4-swap-retry": { text: "Too quick. Hold the button a little longer, then let go.", hint: "You can try again right here." },
  "p4-lay": { text: "Hold the mouse button to hide the new card.", hint: "Move up to the gold ring, then let go to lay it." },
  "tip-point": { text: "He is watching you. Hold still, or click Point, then click a spot on the wall.", hint: "He looks away for about 2 seconds. You can do this 3 times a match." },
  "point-mode": { text: "Click a spot on the wall or the window.", hint: "Esc cancels." },
  // stage F: the guided first match (game/duel.js coachTip): the first time each situation happens, one line; the round never waits for it
  "c-take": { text: "Click your card to pick it up." },
  "c-fist": { text: "Hold the mouse button: your hand closes and hides the card." },
  "c-stare": { text: "He is staring at you. Do not move the mouse.", urgent: true },
  "c-under": { text: "He looks at his card. Push the mouse to the bottom: your hand goes under the table.", hint: "Or hold the Space bar.", urgent: true },
  "c-swap": { text: "Hold the mouse button, then let go: you swap." },
  "c-swap-go": { text: "Let go of the mouse button now: you swap." },
  "c-swap-retry": { text: "Too quick. Hold the button a little longer, then let go.", hint: "You can try again right here." },
  "c-hide": { text: "Hold the mouse button to hide the new card.", hint: "Move up to the gold ring, then let go to lay it." },
  "c-cuff": { text: "His cuff glows: he is cheating! Hold the mouse button on his cuff.", urgent: true },
  // the start screen shows a short demo of what getting caught costs (index.ts, game/attract.js)
  "attract-stare": { text: "He stares. Hold still, or he slams your hand." },
  "attract-slam": { text: "Move, and he slams your hand. Lose the pot.", urgent: true },
};

/** Stage E: the same lesson lines for the webcam hands (opt-in): the camera sees a closed hand, an open hand, a pointing finger and a hand that holds still; there is no click and no pinch. */
export const WEBCAM_PROMPTS: Record<string, { text: string; hint?: string; urgent?: boolean }> = {
  "p1-grab": { text: "Hold your hand over your card, then close it." },
  "p1-fist": { text: "Keep your hand closed: the card hides in it.", urgent: false },
  "p1-fist-now": { text: "Keep your hand closed: the card hides in it.", urgent: true },
  "p1-open": { text: "Open your hand: the card shows." },
  "p1-lay": { text: "Close your hand, bring it to the ring, open it.", hint: "The card goes down on the ring." },
  "p2-wait": { text: "He may lean in. Keep your hand still." },
  "p2-still": { text: "He is staring at you. Keep your hand still.", urgent: true },
  "p3-wait": { text: "Watch his glowing cuff. He is about to cheat." },
  "p3-grab": { text: "He is cheating! Close your hand on his glowing cuff.", urgent: true },
  "p4-take": { text: "Hold your hand over your card, then close it." },
  "p4-wait": { text: "Wait until he looks down at his own card." },
  "p4-under": { text: "Move your hand down out of the picture: it goes under the table.", urgent: true },
  "p4-swap": { text: "Close your hand for a moment, then open it: you swap." },
  "p4-swap-go": { text: "Your hand is closed. Open it now: you swap." },
  "p4-swap-retry": { text: "Too quick. Keep it closed a little longer, then open it.", hint: "You can try again right here." },
  "p4-lay": { text: "Close your hand, bring it up to the ring, open it." },
  "tip-point": { text: "He is watching you. Hold still, or point a finger at a spot on the wall.", hint: "He looks away for about 2 seconds. You can do this 3 times a match." },
  "point-mode": { text: "Click a spot on the wall or the window.", hint: "Esc cancels." },
  "c-take": { text: "Hold your hand over your card, then close it." },
  "c-fist": { text: "Keep your hand closed: the card hides in it." },
  "c-stare": { text: "He is staring at you. Keep your hand still.", urgent: true },
  "c-under": { text: "He looks at his card. Move your hand down out of the picture: under the table.", urgent: true },
  "c-swap": { text: "Close your hand for a moment, then open it: you swap." },
  "c-swap-go": { text: "Your hand is closed. Open it now: you swap." },
  "c-swap-retry": { text: "Too quick. Keep it closed a little longer, then open it.", hint: "You can try again right here." },
  "c-hide": { text: "Keep your hand closed, bring it up to the ring, open it." },
  "c-cuff": { text: "His cuff glows: he is cheating! Close your hand on his cuff.", urgent: true },
  "attract-stare": PROMPTS["attract-stare"],
  "attract-slam": PROMPTS["attract-slam"],
};

/** Round 8 (first use): the first time the "Make him look away" button shows, and the first time the "Swapped" sign shows, one plain line says what it is.
 * Flat page only (the headset shows no page text). Each line shows once per browser (localStorage, else once per page load) for FIRST_USE_SECS. One step per line. */
export const FIRST_USE_SECS = 7;
export const FIRST_USE: Record<"point" | "swap", { mouse: string; webcam: string }> = {
  point: {
    mouse: "He looks away for about 2 seconds. Click this button, then click a spot on the wall.",
    webcam: "He looks away for about 2 seconds. Click this button, or point a finger at a spot on the wall.",
  },
  swap: {
    mouse: "Swapped. The card in your hand is now the one from your sleeve.",
    webcam: "Swapped. The card in your hand is now the one from your sleeve.",
  },
};
const FIRST_USE_KEY = "cheatSeat.firstUse";

/** The one line after a round: "He had a King. You had a 3." */
export function resultLine(shark: number | null | undefined, player: number | null | undefined, swapped = false, sharkCheated = false): string {
  if (sharkCheated) return `He had ${cardWords(shark)} from his sleeve: you missed his cuff. You had ${cardWords(player)}.`;
  return swapped && player !== null && player !== undefined ? `He had ${cardWords(shark)}. You had ${cardWords(player)}: your sleeve card.` : `He had ${cardWords(shark)}. You had ${cardWords(player)}.`;
}

/** Why you were caught, in one sentence (the card is the one in your hand when it happened). */
export function reasonLine(reason: string, card: number | null | undefined): string {
  if (reason === "seen") return `He saw ${cardWords(card)} in your hand that he did not deal you.`;
  if (reason === "moved") return "You moved while he stared at you.";
  if (reason === "under") return "Your hand stayed under the table too long.";
  return "He caught you.";
}

export interface FlatUi {
  onMouse(cb: () => void): void;
  onVr(cb: () => void): void;
  /** Stage E: the opt-in webcam hands button, the small camera box, and the words for hands instead of the mouse. */
  onCam(cb: () => void): void;
  onCamStop(cb: () => void): void;
  camBox(show: boolean): void;
  camStatus(text: string): void;
  camPreview(): HTMLCanvasElement | null;
  setWebcamWords(on: boolean): void;
  camBusy(busy: boolean): void;
  onPointButton(cb: () => void): void;
  /** Stage F: the "Hide tips" button next to the line of the guided first match (the tips are skippable; the round never waits for them). */
  onTipsOff(cb: () => void): void;
  setVrAvailable(v: boolean): void;
  starting(): boolean;
  hideStart(): void;
  /** Stage D: the start screen comes back (the headset session ended: from the exit orb or from the system). */
  showStart(): void;
  prompt(id: string | null): void;
  hud(h: FlatHud | null): void;
  tremor(v: number | null): void;
  handIcon(kind: "under" | "swap" | null): void;
  stamp(main: string, sub?: string, tone?: "good" | "bad" | "gold", secs?: number): void;
  flash(secs: number, color?: string): void;
  pointButton(show: boolean, on: boolean, left?: number): void;
  notice(text: string): void;
  /** In a headset session no page layer is shown at all (hud, lines, stamps, flash, the Point button, the screen finish). */
  setXr(on: boolean): void;
  /** Stage D: the four lesson pips (step 1 to 4; null hides them), the loading state of the start buttons, and the flat pause card. */
  pips(step: number | null): void;
  setReady(ready: boolean): void;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  showPause(on: boolean): void;
  /** The match-end card of flat play: the result, the pot, what he caught about you, one thing to try, and the rematch button (null hides it). */
  matchEnd(d: { title: string; result: string; caught: string[]; next: string } | null): void;
  onRematch(cb: () => void): void;
  pauseButton(show: boolean): void;
  isPaused(): boolean;
  tick(dt: number): void;
  state(): { matchEnd: { title: string; result: string; caught: string[]; next: string } | null; start: boolean; prompt: string | null; stamp: string | null; stampSub: string | null; tremor: number | null; handIcon: string | null; hud: string | null; vr: boolean };
}

export function createFlatUi(): FlatUi {
  const start = $("start"), btnMouse = $("btn-mouse") as HTMLButtonElement | null, btnVr = $("btn-vr") as HTMLButtonElement | null, vrNote = $("vr-note");
  // round 8 (Q07): Enter VR is off until the table is built, so a click can always start the session inside the click (see input/xr-enter.js)
  if (btnVr) btnVr.disabled = true;
  const pipsEl = $("pips"), pauseBtn = $("pausebtn"), pauseCard = $("pause"), btnResume = $("btn-resume"), startNote = $("start-note");
  const meEl = $("matchend"), meTitle = $("me-title"), meResult = $("me-result"), meCaught = $("me-caught"), meNext = $("me-next"), btnRematch = $("btn-rematch");
  let meData: { title: string; result: string; caught: string[]; next: string } | null = null;
  let readyOn = false, curPips: number | null = null;
  const hud = $("hud"), promptEl = $("prompt"), tremorEl = $("tremor"), iconEl = $("handicon"), iconText = $("handicon-text");
  const stampEl = $("stamp"), stampMain = $("stamp-main"), stampSub = $("stamp-sub"), flashEl = $("flash"), pointBtn = $("pointbtn"), noticeEl = $("notice");
  const btnCam = $("btn-cam") as HTMLButtonElement | null, camBoxEl = $("cam-box"), camStatusEl = $("cam-status"), camStopEl = $("cam-stop"), camCanvas = $("cam-preview") as HTMLCanvasElement | null;
  let words = PROMPTS;
  let tipsOffCb: (() => void) | null = null;
  let vrOn = false, stampT = 0, flashT = 0, flashDur = 0, curPrompt: string | null = null, curTremor: number | null = null, curIcon: string | null = null, hudText: string | null = null, stampText: string | null = null, stampSubText: string | null = null;
  // first-use lines: which ones this browser has already shown, the one line element (made on first need) and its countdown
  const fuSeen = new Set<string>();
  try { for (const k of JSON.parse(localStorage.getItem(FIRST_USE_KEY) ?? "[]")) fuSeen.add(String(k)); } catch { /* storage off: once per page load */ }
  let fuEl: HTMLDivElement | null = null, fuT = 0, fuText: string | null = null;
  const firstUse = (key: "point" | "swap", anchor?: HTMLElement | null) => {
    if (fuSeen.has(key) || document.body.classList.contains("xr")) return;
    fuSeen.add(key);
    try { localStorage.setItem(FIRST_USE_KEY, JSON.stringify([...fuSeen])); } catch { /* storage off */ }
    const text = FIRST_USE[key][words === WEBCAM_PROMPTS ? "webcam" : "mouse"];
    if (!fuEl) {
      fuEl = document.createElement("div");
      fuEl.id = "firstuse";
      fuEl.setAttribute("role", "status");
      fuEl.style.cssText = "position:absolute;pointer-events:none;z-index:5;font-size:clamp(16px,1.9vw,34px);line-height:1.2;font-weight:650;padding:.35em .7em;border-radius:.5em;background:var(--plate,rgba(18,13,10,.86));color:var(--ink,#f4ecd8);border:2px solid rgba(226,184,90,.75);";
      (promptEl?.parentElement ?? document.body).appendChild(fuEl);
    }
    fuEl.textContent = text;
    fuText = text;
    if (key === "point" && anchor) {
      // under the button, at its right edge (the button sits at the right edge over the wall, so the bottom right of the picture stays clear for the keep spot)
      fuEl.style.cssText += `left:auto;transform:none;right:16px;bottom:auto;top:${Math.round(anchor.getBoundingClientRect().bottom + 10)}px;max-width:min(33vw,430px);text-align:left;`;
    } else {
      // at the bottom, in the middle (clear of the hand sign at the left and the button at the right)
      fuEl.style.cssText += "left:50%;transform:translateX(-50%);right:auto;bottom:4vh;width:min(92vw,820px);text-align:center;";
    }
    fuEl.hidden = false;
    fuT = FIRST_USE_SECS;
  };
  return {
    onMouse(cb) {
      btnMouse?.addEventListener("click", cb);
    },
    onVr(cb) {
      btnVr?.addEventListener("click", () => {
        if (vrOn) cb();
        else if (startNote) startNote.textContent = "No headset here. On a Quest 3, open this page in its browser and press Enter VR. The mouse works everywhere.";
      });
    },
    onCam(cb) {
      btnCam?.addEventListener("click", cb);
    },
    onCamStop(cb) {
      camStopEl?.addEventListener("click", cb);
    },
    camBox(show) {
      if (camBoxEl) camBoxEl.hidden = !show;
    },
    camStatus(text) {
      if (camStatusEl) camStatusEl.textContent = text;
      if (startNote && start && !start.hidden) startNote.textContent = text;
    },
    camPreview: () => camCanvas,
    setWebcamWords(on) {
      words = on ? WEBCAM_PROMPTS : PROMPTS;
      curPrompt = null; // redraw the line in the right words
    },
    camBusy(busy) {
      if (btnCam) btnCam.disabled = busy || !readyOn;
    },
    onPointButton(cb) {
      pointBtn?.addEventListener("click", cb);
    },
    onTipsOff(cb) {
      tipsOffCb = cb;
    },
    setVrAvailable(v) {
      vrOn = v;
      btnVr?.classList.toggle("nohmd", !v);
      // stage F (D12): one text in every build, with or without a headset
      if (vrNote) vrNote.textContent = VR_NOTE;
    },
    pips(step) {
      if (step === curPips) return;
      curPips = step;
      if (!pipsEl) return;
      pipsEl.hidden = step === null;
      if (step === null) return;
      pipsEl.querySelectorAll("i").forEach((el, i) => {
        el.classList.toggle("done", i + 1 < step);
        el.classList.toggle("now", i + 1 === step);
      });
    },
    setReady(ready) {
      readyOn = ready;
      if (btnVr) btnVr.disabled = !ready;
      if (btnCam) btnCam.disabled = !ready;
      if (btnMouse) {
        btnMouse.disabled = !ready;
        btnMouse.textContent = ready ? "Play with mouse" : "Loading the table...";
      }
      if (startNote && !ready) startNote.textContent = "Loading the table: one moment.";
      else if (startNote) startNote.textContent = ""; // stage F (D11): no extra line under the buttons (the buttons say it); the note is kept for messages
    },
    onPause(cb) {
      pauseBtn?.addEventListener("click", cb);
    },
    onResume(cb) {
      btnResume?.addEventListener("click", cb);
    },
    showPause(on) {
      if (pauseCard) pauseCard.hidden = !on;
    },
    matchEnd(d) {
      meData = d;
      if (!meEl) return;
      meEl.hidden = !d;
      if (!d) return;
      if (meTitle) meTitle.textContent = d.title;
      if (meResult) meResult.textContent = d.result;
      if (meCaught) {
        meCaught.textContent = "";
        for (const line of d.caught) {
          const li = document.createElement("li");
          li.textContent = line;
          meCaught.appendChild(li);
        }
      }
      if (meNext) meNext.textContent = d.next;
      (btnRematch as HTMLButtonElement | null)?.focus();
    },
    onRematch(cb) {
      btnRematch?.addEventListener("click", cb);
    },
    pauseButton(show) {
      if (pauseBtn) pauseBtn.hidden = !show;
    },
    isPaused: () => !!pauseCard && !pauseCard.hidden,
    starting: () => !!start && !start.hidden,
    hideStart() {
      if (start) start.hidden = true;
      document.body.classList.remove("starting");
    },
    showStart() {
      if (start) start.hidden = false;
      document.body.classList.add("starting");
    },
    prompt(id) {
      if (id === curPrompt) return;
      curPrompt = id;
      if (!promptEl) return;
      const p = id ? words[id] ?? PROMPTS[id] : null;
      promptEl.hidden = !p;
      document.body.classList.toggle("has-prompt", !!p);
      if (p) {
        promptEl.textContent = "";
        const main = document.createElement("span");
        main.textContent = p.text;
        promptEl.appendChild(main);
        if (p.hint) {
          const hint = document.createElement("small");
          hint.textContent = ` ${p.hint}`;
          promptEl.appendChild(hint);
        }
        promptEl.classList.toggle("urgent", !!p.urgent);
        // stage F: the tips of the guided first match can be switched off from the line itself
        if (id && id.startsWith("c-")) {
          const off = document.createElement("button");
          off.id = "tips-off";
          off.type = "button";
          off.className = "tips-off";
          off.textContent = "Hide tips";
          promptEl.appendChild(off);
          off.addEventListener("click", (e) => { e.stopPropagation(); tipsOffCb?.(); });
        }
      }
    },
    hud(h) {
      if (!hud) return;
      // the practice rounds show no corner text at all (the pips show the step); a real match shows the round, the pot, the strikes and, in the
      // first two rounds, the goal
      const show = !!h && !h.lesson;
      hud.hidden = !show;
      if (!h || h.lesson) {
        hudText = null;
        return;
      }
      const t = `Round ${h.round} of ${h.rounds} · Pot ${h.pot} · ${h.strikesYou} · ${h.strikesHim} · ${h.points} · ${h.round <= 2} · ${h.chipsYou} · ${h.chipsHim}`;
      if (t === hudText) return;
      hudText = t;
      // stage F: the score is always in view: round, pot, both piles of chips, and the strikes out of three (three strikes lose)
      $("hud-round")!.textContent = `Round ${h.round} of ${h.rounds}`;
      $("hud-pot")!.textContent = h.chipsYou !== undefined ? `Pot ${h.pot} · You ${h.chipsYou} · Him ${h.chipsHim}` : `Pot ${h.pot}`;
      $("hud-strikes")!.textContent = `Strikes: you ${h.strikesYou} of 3 · him ${h.strikesHim} of 3`;
      $("hud-points")!.hidden = true; // the Point button (bottom right) shows how many are left
      $("hud-goal")!.hidden = h.round > 2;
    },
    tremor(v) {
      curTremor = v;
      if (!tremorEl) return;
      tremorEl.hidden = v === null;
      if (v !== null) {
        const ring = tremorEl.querySelector("i") as HTMLElement;
        const k = Math.max(0, Math.min(1, v));
        ring.style.borderColor = `rgb(255, ${Math.round(255 - 180 * k)}, ${Math.round(255 - 200 * k)})`;
        ring.style.transform = `translate(${(Math.random() - 0.5) * 12 * k}px, ${(Math.random() - 0.5) * 12 * k}px)`;
      }
    },
    handIcon(kind) {
      if (kind === curIcon) return;
      curIcon = kind;
      if (!iconEl) return;
      iconEl.hidden = kind === null;
      iconEl.classList.toggle("swap", kind === "swap");
      if (iconText && kind) iconText.textContent = kind === "swap" ? "Swapped" : "Under the table";
      if (kind === "swap") firstUse("swap");
    },
    stamp(main, sub = "", tone = "gold", secs = 2) {
      if (!stampEl || !stampMain || !stampSub) return;
      stampMain.textContent = main;
      stampSub.textContent = sub;
      stampEl.className = `stamp ${tone}${main.startsWith("●") ? " dots" : ""}`;
      stampEl.hidden = false;
      document.body.classList.add("has-stamp");
      stampT = secs;
      stampText = main;
      stampSubText = sub;
    },
    flash(secs, color = "#ff2a1a") {
      flashT = secs;
      flashDur = secs;
      if (flashEl) flashEl.style.background = color; // red when he catches you, gold when you catch him
    },
    pointButton(show, on, left) {
      if (!pointBtn) return;
      pointBtn.hidden = !show;
      pointBtn.classList.toggle("on", on);
      if (show) firstUse("point", pointBtn);
      if (left !== undefined) {
        const t = `Make him look away: ${left} left`;
        if (pointBtn.textContent !== t) pointBtn.textContent = t;
      }
    },
    notice(text) {
      if (noticeEl) noticeEl.textContent = text;
    },
    setXr(on) {
      document.body.classList.toggle("xr", on);
      if (on && fuEl) { fuEl.hidden = true; fuT = 0; fuText = null; }
    },
    tick(dt) {
      if (fuT > 0) {
        fuT -= dt;
        if (fuT <= 0 && fuEl) { fuEl.hidden = true; fuText = null; }
      }
      if (stampT > 0) {
        stampT -= dt;
        if (stampT <= 0 && stampEl) {
          stampEl.hidden = true;
          stampText = null;
          stampSubText = null;
          document.body.classList.remove("has-stamp");
        }
      }
      if (flashEl) {
        flashT = Math.max(0, flashT - dt);
        flashEl.style.opacity = flashDur > 0 ? String(0.55 * (flashT / flashDur)) : "0";
      }
    },
    state: () => ({ matchEnd: meData, start: !!start && !start.hidden, prompt: curPrompt, stamp: stampText, stampSub: stampSubText, tremor: curTremor, handIcon: curIcon, hud: hudText, vr: vrOn, firstUse: fuText }),
  };
}
