/** The Virtual Quest bench, pure-game parts (VIRTUAL-QUEST.md B1 to B4 and B6): a free stand-in for a headset. It plays the game's own rules
 * with simulated hands: random hand sizes and shapes, joint noise, tracking dropouts, a hand lost under the desk, a still hand with spikes,
 * desk heights, hand lag. Every part returns { pass, numbers } and takes `G`, the game modules loaded from a source folder (`loadGame`), so
 * the same bench can run on a broken copy of the game (part B7: it must fail there).
 *
 * The margins are our assumptions, not Quest measurements (see VIRTUAL-QUEST.md): hand-tracking numbers come from the emulator's own hand
 * model (qa/emulator-hand-poses.json), so "Unverified on a real headset" stays true however green this is. */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

/** Load the game modules from `<srcRoot>/game` and `<srcRoot>/actor`. A fresh folder gives fresh module instances. */
export async function loadGame(srcRoot) {
  const imp = (p) => import(pathToFileURL(join(srcRoot, p)).href);
  const [pose, duel, adapters, synth, booth, rig, tuning, cards] = await Promise.all([
    imp("game/pose.js"), imp("game/duel.js"), imp("game/adapters.js"), imp("game/synth.js"), imp("game/booth.js"), imp("actor/rig.js"), imp("game/tuning.js"), imp("game/cards.js"),
  ]);
  return { pose, duel, adapters, synth, booth, rig, tuning, cards };
}

// ------------------------------------------------------------------------------------------- random numbers
export function rng(seed) {
  let s = seed >>> 0;
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  return { u, gauss, range: (a, b) => a + (b - a) * u() };
}

const DT = 1 / 60;
const unit = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// ------------------------------------------------------------------------------------------------ hands
/** Joints (table-local, 25 named) of one hand: palm at `pos`, fingers along `forward`, shaped between two named poses.
 * @param {*} G @param {{pos:any, from?:string, to?:string, k?:number, scale?:number, forward?:any, palmNormal?:any, side?:string, sigma?:number, r?:any}} o */
export function handJoints(G, o) {
  const forward = unit(o.forward ?? { x: 0, y: -0.15, z: -1 });
  const palmNormal = o.palmNormal ?? { x: 0, y: -1, z: 0 };
  const from = o.from ?? "open", to = o.to ?? from, k = o.k ?? 0, scale = o.scale ?? 1;
  const wrist = G.synth.wristForPalm(o.pos, forward, palmNormal, from, scale);
  const j = G.synth.synthHand({ wrist, forward, palmNormal, from, to, k, side: o.side ?? "right", scale });
  if (o.sigma > 0 && o.r) for (const n of Object.keys(j)) { j[n] = { x: j[n].x + o.r.gauss() * o.sigma, y: j[n].y + o.r.gauss() * o.sigma, z: j[n].z + o.r.gauss() * o.sigma }; }
  return j;
}

/** A random hand orientation the headset sees while you play: fingers pointing away from you and a little down, turned up to 50 degrees. */
function randomAim(r) {
  const yaw = r.range(-50, 50) * Math.PI / 180, pitch = r.range(-55, 10) * Math.PI / 180;
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

// ===================================================================================================== B1
/** B1: random hands through the fist, point and stillness checks.
 * Pass: extremes classified correctly in 98 percent or more of the hands; at most 1 state flip per second on a held pose.
 * @param {*} G @param {{seed?:number, sigma?:number}} [o] */
export function benchB1(G, { seed = 101, sigma = 0.005 } = {}) {
  const r = rng(seed);
  const sweep = (from, to, expectLow, expectHigh, n) => {
    // n uniform hands, then n more stratified into the two extremes (0 to 10 percent and 90 to 100 percent of the way)
    let ok = 0, total = 0, mid = 0, midTotal = 0;
    const fails = [];
    for (let i = 0; i < n * 2; i++) {
      const k = i < n ? r.u() : (i % 2 ? r.range(0, 0.1) : r.range(0.9, 1));
      const joints = handJoints(G, { pos: { x: r.range(-0.2, 0.2), y: r.range(0.03, 0.25), z: r.range(0, 0.35) }, from, to, k, scale: r.range(0.8, 1.2), forward: randomAim(r), sigma, r });
      const c = G.pose.classifyHand(joints, null);
      if (k <= 0.1 || k >= 0.9) {
        total++;
        const good = k <= 0.1 ? expectLow(c) : expectHigh(c);
        if (good) ok++; else if (fails.length < 5) fails.push({ k: +k.toFixed(2), pose: c.pose });
      } else { midTotal++; if (expectLow(c) !== expectHigh(c)) mid++; }
    }
    void mid; void midTotal;
    return { ok, total, rate: ok / total, fails };
  };
  const fist = sweep("open", "fist", (c) => !c.fist, (c) => c.fist, 500);
  const point = sweep("fist", "point", (c) => c.fist && !c.point, (c) => c.point && !c.fist, 500);
  const extremes = { fist, point, rate: (fist.ok + point.ok) / (fist.total + point.total) };

  // held poses: 3 seconds at 60 Hz with fresh joint noise each frame, through the game (the classifier with its hysteresis, then the 60 ms debounce)
  const held = (label, shape, n = 60) => {
    let worstRaw = 0, worstGame = 0;
    for (let i = 0; i < n; i++) {
      const base = { pos: { x: r.range(-0.15, 0.15), y: r.range(0.04, 0.2), z: r.range(0.05, 0.3) }, scale: r.range(0.8, 1.2), forward: randomAim(r), ...shape };
      const g = G.duel.createGame({ seed: 5 + i });
      const feeder = G.adapters.createHandsFeeder();
      let prevRaw = null, prevGame = null, rawFlips = 0, gameFlips = 0;
      const frames = Math.round(3 / DT);
      for (let f = 0; f < frames; f++) {
        const joints = handJoints(G, { ...base, sigma, r });
        const fed = feeder.feed({ right: joints });
        const inp = fed.inputs[0];
        const raw = inp.fist ? "fist" : inp.pointRay ? "point" : inp.pinch ? "pinch" : "open";
        if (prevRaw !== null && raw !== prevRaw) rawFlips++;
        prevRaw = raw;
        G.duel.stepGame(g, DT, { head: { pos: { x: 0, y: 0.47, z: 0.46 }, dir: { x: 0, y: -0.2, z: -1 } }, hands: fed.inputs });
        g.events.length = 0;
        const h = g.hands.get("right");
        const st = h.fist ? "fist" : h.pinch ? "pinch" : h.ray ? "point" : "open";
        if (prevGame !== null && st !== prevGame) gameFlips++;
        prevGame = st;
      }
      worstRaw = Math.max(worstRaw, rawFlips / 3);
      worstGame = Math.max(worstGame, gameFlips / 3);
    }
    return { label, worstRawFlipsPerS: +worstRaw.toFixed(2), worstGameFlipsPerS: +worstGame.toFixed(2) };
  };
  const heldPoses = [
    held("open hand", { from: "open" }),
    held("fist", { from: "open", to: "fist", k: 1 }),
    held("point", { from: "fist", to: "point", k: 1 }),
    held("relaxed hand", { from: "default" }),
    held("almost a fist (95 percent)", { from: "open", to: "fist", k: 0.95 }),
    held("almost open (5 percent)", { from: "open", to: "fist", k: 0.05 }),
  ];
  const worst = Math.max(...heldPoses.map((h) => h.worstGameFlipsPerS));
  // information only: a hand held half way (60 percent curled) sits on the line between fist and open, so it may flip
  const edge = held("half curled (information only)", { from: "open", to: "fist", k: 0.6 }, 30);
  return {
    pass: extremes.rate >= 0.98 && worst <= 1,
    numbers: {
      handsPerCheck: 1000, sigmaMm: sigma * 1000, scale: "0.8 to 1.2",
      fistExtremes: `${fist.ok} of ${fist.total}`, pointExtremes: `${point.ok} of ${point.total}`, extremesRate: +(extremes.rate * 100).toFixed(2),
      worstGameFlipsPerS: worst, heldPoses, halfCurledInfo: edge, firstFailures: [...fist.fails, ...point.fails].slice(0, 6),
    },
  };
}

// ===================================================================================================== a scripted player
/** Make a game and a way to feed it hands. `hand(frame)` sends one frame: { right?: {...handJoints args}|null, left?: ... }. */
export function makeSim(G, { seed = 5, level = "normal", eyeRel, lagS = 0, sigma = 0, noiseSeed = 99, head } = {}) {
  const g = G.duel.createGame({ seed, level, eyeRel });
  G.duel.startMatch(g);
  const feeder = G.adapters.createHandsFeeder();
  const r = rng(noiseSeed);
  const headIn = head ?? { pos: { x: 0, y: g.eyeRel, z: 0.46 }, dir: { x: 0, y: -0.2, z: -1 } };
  const queue = []; // hand lag: a frame is used `lagS` seconds after it was made
  let t = 0;
  const events = [];
  const sim = {
    g, t: () => t, events, r,
    step(frame) {
      queue.push({ t, frame });
      let use = queue[0];
      while (queue.length > 1 && queue[1].t <= t - lagS) { queue.shift(); use = queue[0]; }
      if (queue.length && queue[0].t > t - lagS && queue.length === 1 && lagS > 0 && t < lagS) use = queue[0];
      const hands = {};
      for (const side of ["right", "left"]) {
        const w = use.frame[side];
        if (w === undefined) continue;
        hands[side] = w === null ? null : handJoints(G, { ...w, side, sigma, r });
      }
      const fed = feeder.feed(hands, {});
      G.duel.stepGame(g, DT, { head: sim.head ?? headIn, hands: fed.inputs });
      for (const e of g.events) events.push({ t, ...e });
      g.events.length = 0;
      t += DT;
    },
    head: null,
  };
  return sim;
}

const REST_R = { x: 0.12, y: 0.05, z: 0.22 };
const LAY = { x: 0, y: 0.05, z: 0.09 };

/** Moves a hand toward a goal at no more than `speed` m/s (so it never "moves too much" in a stare unless asked to). */
function approach(cur, goal, speed) {
  const d = dist(cur, goal);
  const stepLen = speed * DT;
  if (d <= stepLen) return { ...goal };
  const k = stepLen / d;
  return { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k, z: cur.z + (goal.z - cur.z) * k };
}

// ===================================================================================================== B2
/** B2: tracking dropouts of 100 to 500 ms, 1 to 3 a minute, while a careful player plays legally for `minutes` of game time, plus a hand that
 * is lost under the desk. Pass: zero unfair strikes; a palmed card stays palmed (hidden) through every dropout.
 * "Careful" means: moves no faster than 5 cm per second, freezes when he stares, never shows a card that is not the dealt one.
 * @param {*} G @param {{minutes?:number, seeds?:number[]}} [o] */
export function benchB2(G, { minutes = 12, seeds = [1, 2, 3] } = {}) {
  const out = { runs: [], unfairStrikes: 0, caught: [], palmBreaks: 0, dropouts: 0, rounds: 0, palmedSamples: 0, matches: 0 };
  for (const seed of seeds) {
    const sim = makeSim(G, { seed, noiseSeed: 7 + seed, sigma: 0.003 });
    const { g } = sim;
    const r = rng(seed * 31);
    let hand = { ...REST_R };
    let stage = "rest", stageT = 0, holdT = 0;
    let nextDrop = r.range(20, 60), dropLeft = 0;
    let palmedNow = false;
    const total = minutes * 60;
    let strikes0 = 0;
    let overT = 0;
    while (sim.t() < total) {
      const v = g.view;
      // the page starts a new match 6 s after one ends (index.ts matchOver); so does the bench
      if (g.phase === "over") { overT += DT; if (overT > 6) { G.duel.newMatch(g); overT = 0; out.matches++; } } else overT = 0;
      // ---- dropouts: 1 to 3 a minute, 100 to 500 ms, both hands
      nextDrop -= DT;
      if (nextDrop <= 0 && dropLeft <= 0) { dropLeft = r.range(0.1, 0.5); nextDrop = r.range(20, 60); out.dropouts++; }
      const lost = dropLeft > 0;
      if (dropLeft > 0) dropLeft -= DT;
      // ---- a careful player
      stageT += DT;
      const stare = v?.stare;
      let fist = stage === "palm" || stage === "grab";
      let goal = hand;
      if (!stare) {
        if (v?.phase === "play" && v.card.state === "down" && stage === "rest") { stage = "toCard"; stageT = 0; }
        if (stage === "toCard") { goal = LAY; if (dist(hand, LAY) < 0.02) { stage = "grab"; stageT = 0; } }
        else if (stage === "grab") { goal = LAY; if (stageT > 0.35) { stage = "palm"; stageT = 0; } }
        else if (stage === "palm") { goal = { ...LAY, y: 0.06 }; if (stageT > 3.0) { stage = "show"; stageT = 0; } }
        else if (stage === "show") { fist = false; goal = LAY; if (stageT > 1.2) { stage = "away"; stageT = 0; } }
        else if (stage === "away") { fist = false; goal = { x: 0.12, y: 0.16, z: 0.2 }; if (dist(hand, goal) < 0.02) { stage = "back"; stageT = 0; } }
        else if (stage === "back") { fist = false; goal = { ...LAY, y: 0.05 }; if (dist(hand, goal) < 0.02) { stage = "lay"; stageT = 0; } }
        else if (stage === "lay") { fist = false; goal = LAY; if (v.card.state !== "held" || stageT > 3) { stage = "rest"; stageT = 0; } }
        else if (stage === "rest") goal = REST_R;
        if (v?.phase !== "play" && stage !== "rest" && stage !== "toCard" && v?.card.state === "down") { /* between rounds */ }
        if (v?.phase !== "play" && v?.phase !== "dealing") { if (stage !== "rest") { stage = "rest"; stageT = 0; } goal = REST_R; fist = false; }
        hand = approach(hand, goal, 0.05);
      } else { fist = stage === "palm" || stage === "grab"; } // frozen: the hand stays where it is
      palmedNow = fist && v?.card.state === "held";
      sim.step({ right: lost ? null : { pos: hand, from: fist ? "fist" : "open" } });
      const w = g.view;
      if (palmedNow && w.card.state === "held" && sim.t() > 1) {
        out.palmedSamples++;
        // a fist (or a lost hand that was a fist) must keep the card hidden; the card must still be the player's
        if (w.card.shown && fist && stageT > 0.5) out.palmBreaks++;
        if (w.card.state !== "held") out.palmBreaks++;
      }
      for (const e of sim.events.splice(0)) {
        if (e.type === "caught") out.caught.push({ seed, t: +e.t.toFixed(1), reason: e.reason });
        if (e.type === "roundEnd") out.rounds++;
      }
      if (g.match.strikes.player > strikes0) strikes0 = g.match.strikes.player;
    }
    out.runs.push({ seed, strikesNow: g.match.strikes.player, roundsNow: g.match.round });
  }
  out.unfairStrikes = out.caught.length;

  // ---- a hand lost under the desk (the headset cannot see below the desk edge): fist with the card, down, lost, back
  const under = { trials: 0, swapped: 0, swappedBlind: 0, strikes: 0, palmShownWhileLost: 0, cardDropped: 0, lostSeconds: [] };
  for (let i = 0; i < 24; i++) {
    const L = rng(1000 + i).range(0.4, 3.0);
    const sim = makeSim(G, { seed: 40 + i, noiseSeed: 500 + i, sigma: 0.003 });
    const { g } = sim;
    G.duel.arrange(g, {});
    let t0 = 0, state = "wait", lostFor = 0, shownLost = 0;
    let hand = { ...REST_R };
    for (let f = 0; f < 60 * 40 && state !== "done"; f++) {
      const v = g.view;
      let fist = false, lost = false, goal = hand, speed = 0.4;
      if (state === "wait" && v?.phase === "play") { g.brain.plan = { at: 999 }; g.brain.suspicion = 0; G.duel.arrange(g, { player: 1, shark: 20, sleeve: 12 }); state = "toCard"; }
      else if (state === "toCard") { goal = LAY; if (dist(hand, LAY) < 0.02) { state = "grab"; t0 = sim.t(); } }
      else if (state === "grab") { goal = LAY; fist = true; if (sim.t() - t0 > 0.4) state = "down"; }
      else if (state === "down") { fist = true; goal = { x: 0.05, y: -0.12, z: 0.02 }; if (dist(hand, goal) < 0.02) { state = "lostWait"; t0 = sim.t(); } }
      else if (state === "lostWait") { fist = true; lost = true; goal = hand; if (sim.t() - t0 >= L) { state = "back"; t0 = sim.t(); } }
      else if (state === "back") { fist = true; goal = { x: 0.03, y: 0.14, z: 0.2 }; speed = 0.2; if (dist(hand, goal) < 0.02) state = "hold"; if (sim.t() - t0 > 2) state = "hold"; if (v.card.shown) shownLost++; }
      else if (state === "hold") { fist = true; if (sim.t() - t0 > 4.2) state = "done"; }
      hand = approach(hand, goal, speed);
      if (state === "lostWait") lostFor += DT;
      // a hand below the desk edge is untracked, from the moment it is under (y below the desk edge) until it comes back above it
      const belowEdge = hand.y < -0.05;
      sim.step({ right: lost || (belowEdge && state === "down") ? null : { pos: hand, from: fist ? "fist" : "open" } });
      if (state === "lostWait" && v.card.shown) shownLost++;
    }
    under.trials++;
    under.lostSeconds.push(+L.toFixed(2));
    under.palmShownWhileLost += shownLost > 0 ? 1 : 0;
    if (!(g.card.state === "held" && g.match.playerHeld !== null)) under.cardDropped++;
    under.strikes += g.match.strikes.player;
    if (g.log.some((l) => l.startsWith("swap"))) under.swapped++;
  }
  out.under = under;
  const pass = out.unfairStrikes === 0 && out.palmBreaks === 0 && under.strikes === 0 && under.palmShownWhileLost === 0 && under.cardDropped === 0 && out.rounds >= 30;
  return { pass, numbers: { minutesPerRun: minutes, runs: out.runs, matchesStartedAfterTheFirst: out.matches, rounds: out.rounds, dropouts: out.dropouts, unfairStrikes: out.unfairStrikes, caught: out.caught.slice(0, 5), palmedSamples: out.palmedSamples, palmBreaks: out.palmBreaks, lostUnderDesk: { trials: under.trials, lostSecondsRange: [Math.min(...under.lostSeconds), Math.max(...under.lostSeconds)], strikes: under.strikes, cardShownWhileLost: under.palmShownWhileLost, cardDroppedAfterLoss: under.cardDropped, swapDone: `${under.swapped} of ${under.trials} (information: a swap needs the hand tracked when it opens)` } } };
}

// ===================================================================================================== B3
/** One stare with a still visible hand. `hold` seconds of stare; the hand has `sigma` joint noise and, `spikeRate` times a second on average,
 * a spike of `spikeM` metres on every joint for 1 to 2 frames. `move` = { at, m, secs }: a deliberate move of m metres that starts `at` seconds in.
 * Returns { caught, t (seconds from the move start to the catch) } */
export function oneStare(G, { seed, sigma = 0.004, spikeRate = 1.5, spikeM = 0.02, move = null, hold = 6, level = "normal" }) {
  const sim = makeSim(G, { seed, level, noiseSeed: seed * 7 + 1 });
  const { g, r } = sim;
  while (g.phase !== "play" && sim.t() < 20) sim.step({ right: { pos: REST_R, from: "open" } });
  g.brain.plan = { at: 999 };
  g.brain.script = { noRandom: true };
  g.brain.suspicion = 0.75;
  g.brain.holdStare = hold;
  let pos = { ...REST_R };
  let spikeLeft = 0, spikeVec = { x: 0, y: 0, z: 0 };
  let started = null, caughtAt = null, stareT = 0, moveStart = null;
  for (let f = 0; f < 60 * (hold + 6); f++) {
    if (g.brain.mode === "stare") {
      stareT += DT;
      started ??= sim.t();
    }
    if (move && started !== null && stareT >= move.at) {
      moveStart ??= sim.t();
      const k = Math.min(1, (sim.t() - moveStart) / move.secs);
      const e = k * k * (3 - 2 * k);
      pos = { x: REST_R.x + move.m * e, y: REST_R.y, z: REST_R.z };
    }
    let p = pos;
    if (spikeLeft > 0) { p = { x: pos.x + spikeVec.x, y: pos.y + spikeVec.y, z: pos.z + spikeVec.z }; spikeLeft--; }
    else if (r.u() < spikeRate * DT) { spikeLeft = r.u() < 0.5 ? 1 : 2; const d = unit({ x: r.gauss(), y: r.gauss(), z: r.gauss() }); spikeVec = { x: d.x * spikeM, y: d.y * spikeM, z: d.z * spikeM }; }
    sim.step({ right: { pos: p, from: "open" } });
    for (const e of sim.events.splice(0)) if (e.type === "caught" && caughtAt === null) caughtAt = sim.t();
    if (caughtAt !== null) break;
    if (started !== null && g.brain.mode !== "stare" && stareT > 0.5) break; // the stare ended
  }
  return { caught: caughtAt !== null, started: started !== null, secondsFromMove: caughtAt !== null && moveStart !== null ? caughtAt - moveStart : null, stareSeconds: stareT };
}

/** B3: a still hand with noise and 20 mm spikes during the stare. Pass: at most 1 false catch in 100 stares; a real 3 cm move is caught within 0.5 s.
 * @param {*} G @param {{stares?:number, level?:string}} [o] */
export function benchB3(G, { stares = 100, level = "normal" } = {}) {
  let falseCatches = 0, notStarted = 0;
  for (let i = 0; i < stares; i++) {
    const s = oneStare(G, { seed: 200 + i, level });
    if (!s.started) notStarted++;
    if (s.caught) falseCatches++;
  }
  // a deliberate 3 cm move (0.25 s), 1.2 s into the stare, with the same noise and spikes
  const times = [];
  let missed = 0;
  for (let i = 0; i < 50; i++) {
    const s = oneStare(G, { seed: 900 + i, level, move: { at: 1.2, m: 0.03, secs: 0.25 }, hold: 7 });
    if (s.caught && s.secondsFromMove !== null) times.push(s.secondsFromMove); else missed++;
  }
  times.sort((a, b) => a - b);
  const within = times.filter((x) => x <= 0.5).length;
  const slowest = times.length ? times[times.length - 1] : null;
  return {
    pass: falseCatches <= 1 && notStarted === 0 && missed === 0 && within === 50,
    numbers: { stares, falseCatches, stareNeverStarted: notStarted, sigmaMm: 4, spikeMm: 20, spikesPerSecond: 1.5, move3cm: { trials: 50, caughtWithin0_5s: within, missed, medianS: times.length ? +times[Math.floor(times.length / 2)].toFixed(2) : null, slowestS: slowest === null ? null : +slowest.toFixed(2) } },
  };
}

// ===================================================================================================== B4
/** B4: desk heights 0.65 to 0.85 m (the player's eyes sit 0.3 to 0.75 m over the desk) with 150 ms of hand lag. His cheating wrist is within 0.5 m of
 * the player's resting hands when it can be grabbed, and a grab works 95 percent of the time or more.
 * @param {*} G @param {{trials?:number, lagS?:number}} [o] */
export function benchB4(G, { trials = 30, lagS = 0.15 } = {}) {
  const heights = [0.65, 0.7, 0.75, 0.8, 0.85];
  const seatedEyes = [1.12, 1.22, 1.32]; // metres over the floor, a short, a medium and a tall person seated
  const rows = [];
  let worstReach = 0;
  let ok = 0, all = 0;
  for (const desk of heights) {
    let hit = 0, n = 0, reachMax = 0, shoulderMax = 0;
    for (const eyeFloor of seatedEyes) {
      const eyeRel = Math.max(0.3, Math.min(0.75, eyeFloor - desk));
      for (let i = 0; i < trials; i++) {
        const sim = makeSim(G, { seed: 300 + i, eyeRel, lagS, noiseSeed: 77 + i, sigma: 0.004 });
        const { g, r } = sim;
        while (g.phase !== "play" && sim.t() < 20) sim.step({ right: { pos: REST_R, from: "open" }, left: { pos: { x: -0.15, y: 0.05, z: 0.2 }, from: "open" } });
        g.brain.plan = { at: 0, window: g.tuning.cheatWindowS };
        g.brain.script = { noRandom: true };
        g.brain.suspicion = 0;
        // a player who sees the dip reacts after 0.4 to 0.9 s, then reaches for the wrist
        const reactS = r.range(0.4, 0.9);
        let underAt = null, hand = { x: -0.15, y: 0.05, z: 0.2 }, done = false;
        for (let f = 0; f < 60 * 8 && !done; f++) {
          const b = g.brain;
          if (b.mode === "cheat" && b.cheat?.phase === "under") {
            underAt ??= sim.t();
            const w = g.rig.pose.handR.wrist;
            const rest = { x: -0.15, y: 0.05, z: 0.2 };
            reachMax = Math.max(reachMax, dist(w, rest));
            // shoulder: below and to the right of the eye, as the page draws the player's arm
            const sh = { x: 0.2, y: eyeRel - 0.3, z: 0.46 + 0.06 };
            shoulderMax = Math.max(shoulderMax, dist(w, sh));
            if (sim.t() - underAt >= reactS) hand = approach(hand, { x: w.x + 0.0, y: w.y + 0.045, z: w.z + 0.06 }, 1.3);
          } else hand = approach(hand, { x: -0.15, y: 0.05, z: 0.2 }, 1);
          const close = underAt !== null && sim.t() - underAt >= reactS && dist(hand, { x: g.rig.pose.handR.wrist.x, y: g.rig.pose.handR.wrist.y + 0.045, z: g.rig.pose.handR.wrist.z + 0.06 }) < 0.04;
          sim.step({ right: { pos: REST_R, from: "open" }, left: { pos: hand, from: close ? "fist" : "open" } });
          for (const e of sim.events.splice(0)) if (e.type === "gotcha") { hit++; done = true; }
          if (g.phase === "between" || g.phase === "caught") done = true;
        }
        n++;
      }
    }
    worstReach = Math.max(worstReach, reachMax);
    rows.push({ deskM: desk, eyeRelRangeM: [Math.max(0.3, Math.min(0.75, seatedEyes[0] - desk)), Math.max(0.3, Math.min(0.75, seatedEyes[2] - desk))], grabs: `${hit} of ${n}`, rate: +(hit / n * 100).toFixed(1), wristFromRestingHandM: +reachMax.toFixed(3), wristFromShoulderM: +shoulderMax.toFixed(3) });
    ok += hit; all += n;
  }
  const rate = ok / all;
  return { pass: worstReach <= 0.5 && rate >= 0.95 && rows.every((r) => r.rate >= 95), numbers: { lagMs: lagS * 1000, rate: +(rate * 100).toFixed(1), worstWristFromRestingHandM: +worstReach.toFixed(3), rows } };
}

// ===================================================================================================== B6
/** B6: comfort. The Shark's head never comes nearer than `faceReachM` plus 0.5 m to the player's head, whatever he does (rest, glare, stare, slam,
 * gloat, grab), also when the player's head sways and leans toward him slowly. The nearest vertex of the real mesh is measured on the page
 * (qa/stageC/bench-page.mjs); here the rig's head centre is checked with the mesh's measured reach in front of it.
 * @param {*} G @param {{faceReachM?:number, seeds?:number}} [o] */
export function benchB6(G, { faceReachM = 0.19, seeds = 12 } = {}) {
  let minCentre = Infinity, minAt = null;
  for (let s = 0; s < seeds; s++) {
    const sim = makeSim(G, { seed: 500 + s, noiseSeed: s });
    const { g } = sim;
    const r = rng(60 + s);
    let hand = { ...REST_R };
    const swayAmp = [0, 0.02, 0.05, 0.1][s % 4]; // the player's head leans toward him by up to 10 cm, slowly
    for (let f = 0; f < 60 * 120; f++) {
      const t = sim.t();
      // the player's head: a slow sway in z (toward him) and y
      sim.head = { pos: { x: 0.01 * Math.sin(t * 0.5), y: g.eyeRel + 0.01 * Math.sin(t * 0.7), z: 0.46 - swayAmp * (0.5 + 0.5 * Math.sin(t * 0.35)) }, dir: { x: 0, y: -0.2, z: -1 } };
      // things that bring him close: stares, a slam (wobble), a grab (his hand under the table), a glare (suspicion crossing 0.3)
      if (f % 600 === 200) { g.brain.suspicion = 0.35; }
      if (f % 600 === 300) { g.brain.suspicion = 0.75; g.brain.holdStare = 4; }
      if (f % 1500 === 900) hand = { x: 0.12 + 0.1 * Math.sin(r.u() * 6), y: 0.1, z: 0.2 }; // a wobble: caught, slam
      if (f % 1500 === 1200) { g.brain.plan = { at: 0, window: 2.5 }; }
      sim.step({ right: { pos: hand, from: "open" } });
      const ph = sim.head.pos, hp = g.rig.pose.head.pos;
      const d = Math.hypot(hp.x - ph.x, hp.y - ph.y, hp.z - ph.z);
      if (d < minCentre) { minCentre = d; minAt = { t: +t.toFixed(1), mode: g.brain.mode, lean: +g.rig.pose.torso.lean.toFixed(2) }; }
      sim.events.length = 0;
      if (g.phase === "over") break;
    }
  }
  const need = 0.5 + faceReachM;
  return { pass: minCentre >= need, numbers: { headCentreMinM: +minCentre.toFixed(3), needAtLeastM: need, faceReachInFrontOfCentreM: faceReachM, atMoment: minAt, leanDistanceM: G.rig.LEAN_DISTANCE } };
}

/** Run every pure part. */
export function benchAll(G, opts = {}) {
  return {
    B1: benchB1(G, opts.b1), B2: benchB2(G, opts.b2), B3: benchB3(G, opts.b3), B4: benchB4(G, opts.b4), B6: benchB6(G, opts.b6),
  };
}
