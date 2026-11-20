/** All sound is synthesised here with Web Audio. No samples, no files.
 * Call start() from a user gesture (browsers keep audio silent until then). */
import { CUE_TRIM } from "./audio-levels.js";
import { createAudioResume } from "./audio-resume.js";

export type Cue =
  | "snap" | "slide" | "slam" | "grunt" | "tick" | "clink" | "low" | "win" | "palm" | "stash" | "slap" | "pinch"
  | "freeze" | "boom" | "gotcha" | "swap" | "alert" | "deal"
  | "breath" | "exhale" | "rustle" | "notice" | "wobble" | "struggle" | "what" | "fist" | "open" | "lay" | "point"
  // stage C (feel): the slow-motion swoosh in and out, chips scattering, his gasp, the card falling and landing, his laugh and growl
  | "slowIn" | "slowOut" | "chips" | "gasp" | "cardFall" | "cardLand" | "laugh" | "growl"
  // stage D (sound): the stings on the start screen and on the Play click, and the small sounds of the room that keep it from ever being silent
  | "intro" | "play" | "tock" | "glass" | "creak" | "riffle" | "murmur";

/** Every cue, in the order the level table and the level check use. */
export const CUES: Cue[] = [
  "snap", "slide", "slam", "grunt", "tick", "clink", "low", "win", "palm", "stash", "slap", "pinch", "freeze", "boom", "gotcha", "swap", "alert", "deal",
  "breath", "exhale", "rustle", "notice", "wobble", "struggle", "what", "fist", "open", "lay", "point",
  "slowIn", "slowOut", "chips", "gasp", "cardFall", "cardLand", "laugh", "growl",
  "intro", "play", "tock", "glass", "creak", "riffle", "murmur",
];
/** The small sounds of the room, one every 1.1 to 2.4 s while the audio runs (stage D, judge fix 9: no near-silent stretch longer than 2 s). */
export const AMBIENT: Cue[] = ["tock", "glass", "creak", "riffle", "murmur", "tock"];

export interface CheatAudioOptions {
  /** QA only: called for every cue that is asked for (before the sound itself), also when the audio is not running. */
  onCue?: (name: Cue, intensity: number) => void;
  /** QA only: called when the tension level changes. */
  onTension?: (level: number) => void;
  /** QA only: draw the sounds into an offline context (no speakers, no stream) so a script can measure their levels. */
  offline?: OfflineAudioContext;
}

export interface CheatAudio {
  start(): Promise<void>;
  /** Start without a gesture if the browser allows it (a page that was interacted with before, or a test browser): true when the audio runs now. */
  autoStart(): boolean;
  cue(name: Cue, intensity?: number): void;
  setVolume(value: number): void;
  setPaused(value: boolean): void;
  /** Round 8 (Q08, Q13): resume the context when a session starts, on a select, and when the system or page is visible again (never while paused). */
  watchSession(session: EventTarget & { visibilityState?: string }, doc: Document): void;
  setMusic(on: boolean): void;
  /** A low tension tone under everything: 0 silent to 1 full (the stare: it rises as he leans in). */
  setTension(level: number): void;
  /** QA only (offline): schedule the music bed for `seconds` from now, at its playing level. */
  bed?(seconds: number): void;
  /** QA only (offline): a cue at `at` seconds, in the same context as the others (so a check of a whole moment shares one compressor). */
  cueAt?(name: Cue, at: number, intensity?: number): void;
  /** QA only (offline): schedule the room tone and the room's small sounds for `seconds` from now (seeded, so a check is repeatable). */
  room?(seconds: number, seed?: number): void;
  /** Start the room tone and the small sounds (called with the first sound; the music bed stays off until the match starts). */
  setRoom(on: boolean): void;
  readonly stream: MediaStream | null;
  readonly running: boolean;
  destroy(): void;
}

/** The music bed and the tension drone at their playing levels (before the master volume). */
const MUSIC_LEVEL = 0.075;
/** The room tone (stage D): a soft low rumble of air and a faint hum, always under everything once the audio runs. */
const ROOM_LEVEL = 0.075;
const TENSION_LEVEL = 0.2;
const clamp01 = (v: number, fallback: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

/** Slow minor loop, 48 beats per minute: bass on every beat, a soft pad each bar. */
const BPM = 48;
const BASS = [55, 55, 43.65, 41.2]; // A1 A1 F1 E1
const PAD = [
  [220, 261.63, 329.63],
  [220, 261.63, 349.23],
  [174.61, 220, 261.63],
  [164.81, 207.65, 246.94],
];

export function createCheatAudio(opts: CheatAudioOptions = {}): CheatAudio {
  const offline = opts.offline ?? null;
  let ctx: BaseAudioContext | null = null;
  let master: GainNode | null = null;
  let tensionNodes: { gain: GainNode; oscs: OscillatorNode[] } | null = null;
  let tension = 0;
  let musicGain: GainNode | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let noise: AudioBuffer | null = null;
  let volume = 0.5;
  let paused = false;
  let destroyed = false;
  const keeper = createAudioResume({ getCtx: () => (offline ? null : (ctx as AudioContext | null)), isPaused: () => paused || destroyed });
  let pending: Promise<void> | null = null;
  let musicOn = false;
  let nextBeat = 0;
  let beat = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let roomGain: GainNode | null = null;
  let roomNodes: AudioScheduledSourceNode[] = [];
  let roomOn = false;
  let nextAmbient = 0;
  let ambientIdx = 0;
  /** QA (offline): schedule the next cue at this time instead of "now". */
  let cueAtOverride: number | null = null;

  function build() {
    const A = globalThis.AudioContext;
    if (!A && !offline) return;
    ctx = offline ?? new A();
    // a context that the browser lets run only later (after the first click or key) begins its room tone the moment it runs
    if (!offline) ctx.addEventListener("statechange", () => { if (ctx && ctx.state === "running") finish(); else keeper.onState(); });
    master = ctx.createGain();
    master.gain.value = volume;
    // a compressor on the way out: several cues at once (a slam, chips, a gasp) stay clear and never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;
    master.connect(comp);
    // stage D: a soft clipper after the compressor (a plain safety stage, no make-up gain: quiet sounds pass unchanged). The slam is the loudest moment (his freeze,
    // the boom, the chips and his laugh, over the room tone and the bed) and its first instants got through the compressor's 3 ms attack at -0.6 to -1.9 dBFS;
    // the stage C line is -3 dBFS. The curve is linear to 0.45 and then bends toward 0.67 (-3.5 dBFS).
    const lim = ctx.createWaveShaper();
    const N = 4096, curve = new Float32Array(N), knee = 0.45, top = 0.67;
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x);
      const y = a <= knee ? a : knee + (top - knee) * Math.tanh((a - knee) / (top - knee));
      curve[i] = Math.sign(x) * y;
    }
    lim.curve = curve;
    lim.oversample = "2x";
    comp.connect(lim);
    lim.connect(ctx.destination);
    if (!offline) {
      destination = (ctx as AudioContext).createMediaStreamDestination();
      lim.connect(destination);
    }
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
    const len = ctx.sampleRate;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = s / 2147483648 - 1;
    }
  }

  function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    // start silent: a gain node starts at 1 until its first event, and a source that begins one sample before the envelope leaks one sample of
    // full-volume sound (an audible click at the start of every noise burst; stage C found it while measuring levels)
    g.gain.value = 0;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function burst(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, q = 1, out: AudioNode = master!) {
    if (!ctx || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, peak, 0.004, dur);
    src.connect(filt).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function tone(t: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType, out: AudioNode = master!, attack = 0.005) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, peak, attack, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  /** A voiced sound: a saw wave at pitch f0 to f1 through two band filters (the "vowel"), with a breath of noise. */
  function voice(t: number, f0: number, f1: number, dur: number, peak: number, formants: [number, number], breathy = 0.2, attack = 0.02) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, peak, attack, dur);
    for (const f of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = 4;
      o.connect(bp).connect(g);
    }
    g.connect(master!);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    if (breathy > 0) burst(t, dur, peak * breathy, "bandpass", formants[1], formants[1] * 0.8, 0.8);
  }

  function ensureTension() {
    if (!ctx || tensionNodes) return;
    // a low drone: a fundamental, a fifth above it and a sub, with a slow swell (about 0.7 times a second) like a pulse under the floor.
    // The swell scales the drone (0.5 to 1.0 of its level); the level gain after it is what the stare moves.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const swell = ctx.createGain();
    swell.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(swell.gain);
    const oscs: OscillatorNode[] = [];
    for (const [f, type, a] of [[55, "sine", 1], [82.9, "triangle", 0.55], [36.7, "sine", 0.8]] as [number, OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(swell);
      o.start();
      oscs.push(o);
    }
    lfo.start();
    oscs.push(lfo);
    swell.connect(gain);
    gain.connect(master!);
    tensionNodes = { gain, oscs };
  }

  function scheduleMusic() {
    if (!ctx || !musicGain || !musicOn || paused || ctx.state !== "running") return;
    const spb = 60 / BPM;
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
    while (nextBeat < ctx.currentTime + 0.4) {
      const bar = Math.floor(beat / 4) % 4;
      tone(nextBeat, BASS[bar], BASS[bar] * 0.98, spb * 0.9, 0.5, "sine", musicGain, 0.02);
      if (beat % 4 === 0) {
        for (const f of PAD[bar]) tone(nextBeat, f, f, spb * 3.6, 0.1, "triangle", musicGain, 0.6);
      }
      if (beat % 8 === 6) tone(nextBeat + spb * 0.5, PAD[bar][2] * 2, PAD[bar][2] * 2, spb, 0.07, "sine", musicGain, 0.01);
      nextBeat += spb;
      beat++;
    }
  }

  /** The audio runs: the timer for the music and the room's small sounds, and the room tone itself (if the room is on). */
  function finish() {
    if (!ctx || destroyed) return;
    if (!offline && !timer) timer = setInterval(() => { scheduleMusic(); scheduleAmbient(api); }, 120);
    if (roomOn) ensureRoom();
    if (roomOn && roomGain && !offline) roomGain.gain.setTargetAtTime(ROOM_LEVEL * (CUE_TRIM.room ?? 1), ctx.currentTime, 0.6);
  }

  /** The room tone: pink-ish noise (a long random buffer, looped, low-passed) and a faint mains hum; nothing else. Built once. */
  function ensureRoom() {
    if (!ctx || roomGain || !master) return;
    const len = Math.floor(ctx.sampleRate * 6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let sd = 777, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0;
      const w = sd / 2147483648 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; // a pink-ish slope (a Paul Kellet style filter, three poles)
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 45;
    roomGain = ctx.createGain();
    roomGain.gain.value = 0;
    src.connect(lp).connect(hp).connect(roomGain);
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 50;
    const hum2 = ctx.createOscillator();
    hum2.type = "sine";
    hum2.frequency.value = 100;
    const hg = ctx.createGain();
    hg.gain.value = 0.18;
    const hg2 = ctx.createGain();
    hg2.gain.value = 0.06;
    hum.connect(hg).connect(roomGain);
    hum2.connect(hg2).connect(roomGain);
    roomGain.connect(master);
    src.start();
    hum.start();
    hum2.start();
    roomNodes = [src, hum, hum2];
  }

  /** The small sounds of the room: when the audio runs and the room is on, one every 1.1 to 2.4 s. */
  function scheduleAmbient(api: CheatAudio) {
    if (!ctx || !roomOn || paused || ctx.state !== "running") return;
    if (nextAmbient === 0) nextAmbient = ctx.currentTime + 0.8;
    if (ctx.currentTime < nextAmbient) return;
    const name = AMBIENT[ambientIdx++ % AMBIENT.length];
    api.cue(name, 0.8 + 0.2 * Math.random());
    nextAmbient = ctx.currentTime + 1.1 + Math.random() * 1.3;
  }

  const api: CheatAudio = {
    async start() {
      if (destroyed || paused) return;
      if (offline) {
        if (!ctx) build();
        return;
      }
      if (pending) return pending;
      pending = (async () => {
        try {
          if (!ctx) build();
          if (ctx && ctx.state !== "running") await (ctx as AudioContext).resume();
          finish();
        } catch {
          /* blocked or unsupported audio must never stop the game */
        }
      })();
      try {
        await pending;
      } finally {
        pending = null;
      }
    },
    autoStart() {
      if (destroyed || offline) return false;
      try {
        if (!ctx) build();
        if (ctx && ctx.state === "running") {
          finish();
          return true;
        }
      } catch {
        /* blocked or unsupported audio must never stop the game */
      }
      return false;
    },
    cue(name, intensity = 1) {
      opts.onCue?.(name, intensity);
      if (!ctx || !master || destroyed || paused || (!offline && ctx.state !== "running")) return;
      const t = (cueAtOverride ?? ctx.currentTime) + 0.005;
      const k = clamp01(intensity, 1) * (CUE_TRIM[name] ?? 1);
      switch (name) {
        case "snap": // card snap: a short band of noise
          burst(t, 0.06, 0.55 * k, "bandpass", 3200, 1800, 1.4);
          break;
        case "slide": // card slide: soft swish
          burst(t, 0.28, 0.22 * k, "lowpass", 2600, 500, 0.8);
          break;
        case "slam": // low thud plus a short rattle
          tone(t, 95, 38, 0.32, 0.9 * k, "sine");
          burst(t, 0.18, 0.5 * k, "lowpass", 600, 120, 0.7);
          for (let i = 0; i < 5; i++) burst(t + 0.08 + i * 0.045, 0.05, 0.28 * k, "highpass", 4200, 3000, 1);
          break;
        case "grunt": { // filtered saw
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(118, t);
          o.frequency.exponentialRampToValueAtTime(70, t + 0.38);
          const f = ctx.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.setValueAtTime(520, t);
          f.frequency.exponentialRampToValueAtTime(180, t + 0.38);
          const g = ctx.createGain();
          env(g, t, 0.42 * k, 0.03, 0.36);
          o.connect(f).connect(g).connect(master);
          o.start(t);
          o.stop(t + 0.5);
          break;
        }
        case "tick": // gaze tick: the cone is on a hand
          tone(t, 1900, 1700, 0.03, 0.16 * k, "square");
          break;
        case "clink": // buttons land
          tone(t, 2350, 2300, 0.09, 0.14 * k, "sine");
          tone(t + 0.012, 3150, 3100, 0.07, 0.08 * k, "sine");
          break;
        case "low": // a round lost: two soft low notes
          tone(t, 164.8, 150, 0.35, 0.3 * k, "triangle");
          tone(t + 0.12, 123.5, 112, 0.45, 0.3 * k, "triangle");
          break;
        case "palm": // a hand lands flat on the desk: soft brush plus a low pat
          burst(t, 0.12, 0.3 * k, "lowpass", 1500, 300, 0.7);
          tone(t, 150, 90, 0.1, 0.3 * k, "sine");
          break;
        case "stash": // the card clicks into its hiding place
          tone(t, 1250, 1100, 0.04, 0.2 * k, "square");
          tone(t + 0.05, 1700, 1500, 0.05, 0.16 * k, "square");
          break;
        case "slap": // his hand is caught: a sharp slap
          burst(t, 0.09, 0.8 * k, "bandpass", 2400, 900, 0.9);
          tone(t, 120, 55, 0.2, 0.6 * k, "sine");
          break;
        case "pinch": // a pinch lands on a card
          tone(t, 880, 820, 0.025, 0.1 * k, "triangle");
          break;
        case "win": // a round won: two warm notes up
          tone(t, 261.6, 261.6, 0.25, 0.22 * k, "triangle");
          tone(t + 0.1, 392, 392, 0.4, 0.22 * k, "triangle");
          break;
        case "freeze": // stage 1: the moment he sees you: a rising sting, then silence (the slam follows 0.3 s later)
          tone(t, 220, 880, 0.28, 0.5 * k, "sawtooth");
          tone(t, 233, 932, 0.28, 0.35 * k, "square");
          burst(t, 0.28, 0.25 * k, "bandpass", 800, 4200, 2);
          break;
        case "boom": // stage 1: the big slam. Sub drop, body, crack, rattle
          tone(t, 150, 28, 0.7, 1.0 * k, "sine");
          tone(t, 62, 32, 0.55, 0.8 * k, "triangle");
          burst(t, 0.35, 0.9 * k, "lowpass", 900, 90, 0.7);
          burst(t, 0.07, 1.0 * k, "highpass", 2500, 1500, 0.8);
          for (let i = 0; i < 8; i++) burst(t + 0.1 + i * 0.05, 0.06, 0.34 * k, "highpass", 4500, 2800, 1);
          break;
        case "gotcha": // stage 1: you caught him: a sharp slap, then a bright run up
          burst(t, 0.09, 0.9 * k, "bandpass", 2600, 900, 0.9);
          tone(t, 130, 50, 0.22, 0.7 * k, "sine");
          tone(t + 0.12, 392, 392, 0.2, 0.3 * k, "triangle");
          tone(t + 0.22, 523.3, 523.3, 0.2, 0.3 * k, "triangle");
          tone(t + 0.32, 659.3, 659.3, 0.45, 0.34 * k, "triangle");
          tone(t + 0.32, 784, 784, 0.45, 0.2 * k, "sine");
          break;
        case "swap": // stage 1: your card goes onto the deck and a new one comes back
          burst(t, 0.18, 0.4 * k, "lowpass", 3000, 600, 0.8);
          burst(t + 0.16, 0.06, 0.5 * k, "bandpass", 3200, 1800, 1.4);
          tone(t + 0.2, 660, 990, 0.12, 0.14 * k, "triangle");
          break;
        case "alert": // stage 1: his glove goes under the hat: two quick notes
          tone(t, 740, 740, 0.09, 0.22 * k, "square");
          tone(t + 0.11, 988, 988, 0.14, 0.22 * k, "square");
          break;
        case "deal": // stage 1: a card is dealt to you
          burst(t, 0.2, 0.3 * k, "lowpass", 2400, 700, 0.8);
          burst(t + 0.17, 0.05, 0.45 * k, "bandpass", 3200, 1800, 1.4);
          break;
        case "breath": // stage A: his breath in the stare, in through the nose
          burst(t, 0.55, 0.42 * k, "bandpass", 500, 1100, 0.7);
          break;
        case "exhale": // out again, lower
          burst(t, 0.7, 0.4 * k, "bandpass", 900, 320, 0.6);
          tone(t, 90, 70, 0.5, 0.12 * k, "sine");
          break;
        case "rustle": // stage A: his sleeve moves: the tell before he cheats
          for (let i = 0; i < 4; i++) burst(t + i * 0.055, 0.07, 0.3 * k, "highpass", 3000 + i * 400, 2200, 0.8);
          break;
        case "notice": // he noticed something: a low "hm"
          tone(t, 150, 120, 0.2, 0.3 * k, "sawtooth");
          tone(t, 151, 121, 0.2, 0.2 * k, "triangle");
          break;
        case "wobble": // a small tick each time your hand moves while he stares
          tone(t, 1500, 1200, 0.035, 0.16 * k, "square");
          break;
        case "struggle": // he pulls against your hand
          burst(t, 0.22, 0.5 * k, "lowpass", 1400, 300, 0.8);
          tone(t, 110, 80, 0.2, 0.35 * k, "sawtooth");
          break;
        case "what": // "What?": a short rising grunt as he turns his head
          tone(t, 120, 190, 0.18, 0.34 * k, "sawtooth");
          tone(t + 0.06, 130, 200, 0.14, 0.2 * k, "triangle");
          break;
        case "fist": // your hand closes: the card is gone
          burst(t, 0.09, 0.4 * k, "bandpass", 1800, 700, 1.1);
          tone(t, 520, 380, 0.07, 0.12 * k, "triangle");
          break;
        case "open": // your hand opens
          burst(t, 0.08, 0.28 * k, "bandpass", 900, 2200, 1.1);
          break;
        case "lay": // the card goes down on the felt
          burst(t, 0.07, 0.5 * k, "bandpass", 2400, 1200, 1.2);
          tone(t, 300, 200, 0.06, 0.12 * k, "sine");
          break;
        case "point": // you point: a thin whistle
          tone(t, 1400, 1800, 0.12, 0.12 * k, "sine");
          break;
        case "slowIn": // time slows: a low swoosh that falls in pitch
          burst(t, 0.7, 0.4 * k, "bandpass", 2600, 140, 1.1);
          tone(t, 240, 52, 0.75, 0.4 * k, "sine");
          break;
        case "slowOut": // time speeds up again: a short rising swoosh
          burst(t, 0.3, 0.34 * k, "bandpass", 180, 2800, 1.1);
          tone(t, 60, 180, 0.3, 0.24 * k, "sine");
          break;
        case "chips": // chips scatter over the felt: many small clinks, early and loud, then fewer; a slide under them
          burst(t, 0.22, 0.22 * k, "lowpass", 1900, 380, 0.8);
          for (let i = 0; i < 16; i++) {
            const at = t + 0.02 + Math.pow(Math.random(), 1.7) * 0.95;
            const f = 1700 + Math.random() * 2300;
            const a = (0.16 + 0.1 * Math.random()) * k * (1 - (at - t) * 0.5);
            tone(at, f, f * 0.985, 0.05 + Math.random() * 0.05, a, "sine");
            tone(at + 0.003, f * 1.52, f * 1.5, 0.035, a * 0.5, "sine");
            if (i % 4 === 0) burst(at, 0.045, 0.13 * k, "bandpass", 2800, 1900, 2);
          }
          break;
        case "gasp": // his gasp: a quick breath in with a voice in it
          burst(t, 0.32, 0.5 * k, "bandpass", 650, 1900, 0.9);
          voice(t + 0.03, 250, 330, 0.26, 0.28 * k, [800, 1700], 0.15, 0.05);
          break;
        case "cardFall": // a card flutters down from his sleeve
          for (let i = 0; i < 5; i++) burst(t + i * 0.07, 0.06, (0.34 - i * 0.05) * k, "highpass", 3600 - i * 280, 2600, 0.8);
          break;
        case "cardLand": // and lands on the felt
          burst(t, 0.06, 0.5 * k, "bandpass", 2300, 1100, 1.2);
          tone(t, 280, 190, 0.06, 0.16 * k, "sine");
          break;
        case "laugh": // a short laugh: four low "heh"s about 0.19 s apart (the jaw pulses at the same pace), each a little lower and softer
          for (let i = 0; i < 4; i++) voice(t + i * 0.19, 135 - i * 8, 112 - i * 8, 0.11, (0.34 - i * 0.05) * k, [700, 1150], 0.35, 0.012);
          break;
        case "growl": // his glare: a low growl that swells and fades
          voice(t, 88, 66, 0.8, 0.34 * k, [380, 720], 0.25, 0.22);
          voice(t, 89.2, 67, 0.8, 0.2 * k, [380, 720], 0, 0.22);
          break;
        case "intro": // the start screen's sting: a low note, a deck riffled, a snap, and a bright fifth on top
          tone(t, 55, 52, 1.2, 0.6 * k, "sine");
          tone(t, 110, 104, 0.9, 0.2 * k, "triangle");
          for (let i = 0; i < 16; i++) burst(t + 0.1 + i * 0.026 * (1 - i * 0.018), 0.03, (0.14 + i * 0.012) * k, "bandpass", 2600 + i * 90, 1800, 1.6);
          burst(t + 0.62, 0.06, 0.5 * k, "bandpass", 3200, 1800, 1.4);
          tone(t + 0.66, 440, 440, 0.7, 0.14 * k, "triangle");
          tone(t + 0.66, 659.3, 659.3, 0.7, 0.1 * k, "sine");
          break;
        case "play": // the Play click: a quick riffle, a card snap, a low thump
          for (let i = 0; i < 10; i++) burst(t + i * 0.02, 0.025, (0.2 + i * 0.03) * k, "bandpass", 2800 + i * 120, 1900, 1.6);
          burst(t + 0.22, 0.06, 0.55 * k, "bandpass", 3200, 1800, 1.4);
          tone(t + 0.22, 98, 60, 0.3, 0.5 * k, "sine");
          break;
        case "tock": // a wall clock in the next room: tick, then a lower tock
          tone(t, 1900, 1500, 0.025, 0.4 * k, "square");
          tone(t + 0.5, 1350, 1100, 0.03, 0.4 * k, "square");
          burst(t, 0.03, 0.2 * k, "bandpass", 2400, 1800, 2);
          burst(t + 0.5, 0.035, 0.2 * k, "bandpass", 1800, 1300, 2);
          break;
        case "glass": // ice settles in a glass
          for (let i = 0; i < 3; i++) {
            const f = 3300 + Math.random() * 900;
            tone(t + i * 0.09, f, f * 0.99, 0.13, (0.36 - i * 0.08) * k, "sine");
            tone(t + i * 0.09 + 0.004, f * 1.5, f * 1.49, 0.07, (0.2 - i * 0.04) * k, "sine");
          }
          break;
        case "creak": // a chair or a floorboard creaks
          tone(t, 72, 118, 0.38, 0.32 * k, "sawtooth");
          burst(t, 0.4, 0.3 * k, "bandpass", 420, 260, 3);
          break;
        case "riffle": // somewhere a deck is riffled, quietly
          for (let i = 0; i < 12; i++) burst(t + i * 0.03, 0.025, (0.16 + i * 0.015) * k, "bandpass", 2400 + i * 80, 1700, 1.6);
          break;
        case "murmur": // two low voices behind a wall: "mm-hm"
          voice(t, 112, 104, 0.34, 0.3 * k, [310, 620], 0.25, 0.06);
          voice(t + 0.5, 128, 118, 0.3, 0.26 * k, [330, 690], 0.25, 0.06);
          break;
      }
    },
    setVolume(value) {
      volume = clamp01(value, 0.5);
      if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    },
    watchSession(session, doc) {
      keeper.watchSession(session, doc);
    },
    setPaused(value) {
      if (value === paused) return; // called every frame by the page: act only when the state changes (it asked the audio context to resume 60 times a second)
      paused = value;
      if (!ctx) return;
      if (offline) return;
      void (value ? (ctx as AudioContext).suspend() : (ctx as AudioContext).resume()).catch(() => {});
    },
    setRoom(on) {
      roomOn = on;
      if (!ctx) return;
      if (on) ensureRoom();
      if (roomGain && offline) roomGain.gain.value = on ? ROOM_LEVEL * (CUE_TRIM.room ?? 1) : 0;
      else if (roomGain) roomGain.gain.setTargetAtTime(on ? ROOM_LEVEL * (CUE_TRIM.room ?? 1) : 0, ctx.currentTime, 0.5);
    },
    setMusic(on) {
      musicOn = on;
      if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? MUSIC_LEVEL * (1 - 0.45 * tension) : 0, ctx.currentTime, on ? 1.5 : 0.4);
    },
    setTension(level) {
      const k = clamp01(level, 0);
      if (Math.abs(k - tension) < 0.01) return;
      tension = k;
      opts.onTension?.(k);
      if (!ctx) return;
      if (k > 0) ensureTension();
      if (tensionNodes) {
        // the drone rises in level and in pitch (about 2 semitones) as he leans in; the music bed ducks a little under it
        tensionNodes.gain.gain.setTargetAtTime(TENSION_LEVEL * (CUE_TRIM.tension ?? 1) * k, ctx.currentTime, 0.35);
        tensionNodes.oscs.slice(0, 3).forEach((o, i) => o.frequency.setTargetAtTime([55, 82.9, 36.7][i] * (1 + 0.12 * k), ctx!.currentTime, 0.5));
      }
      if (musicGain && musicOn) musicGain.gain.setTargetAtTime(MUSIC_LEVEL * (1 - 0.45 * k), ctx.currentTime, 0.6);
    },
    bed(seconds) {
      if (!ctx || !musicGain || !offline) return;
      musicGain.gain.value = MUSIC_LEVEL;
      const spb = 60 / BPM;
      let b = 0;
      for (let at = 0.05; at < seconds; at += spb, b++) {
        const bar = Math.floor(b / 4) % 4;
        tone(at, BASS[bar], BASS[bar] * 0.98, spb * 0.9, 0.5, "sine", musicGain, 0.02);
        if (b % 4 === 0) for (const f of PAD[bar]) tone(at, f, f, spb * 3.6, 0.1, "triangle", musicGain, 0.6);
      }
    },
    cueAt(name, at, intensity = 1) {
      if (!offline) return;
      cueAtOverride = at;
      api.cue(name, intensity);
      cueAtOverride = null;
    },
    room(seconds, seed = 1) {
      if (!ctx || !offline) return;
      ensureRoom();
      if (roomGain) roomGain.gain.value = ROOM_LEVEL * (CUE_TRIM.room ?? 1);
      // seeded events at the same spacing the live timer uses (1.1 to 2.4 s)
      let s = seed >>> 0;
      const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      let i = 0;
      const saved = Math.random;
      Math.random = rnd; // the cues use Math.random for small variations: seeded here so a check is repeatable
      try {
        for (let at = 0.8; at < seconds; at += 1.1 + rnd() * 1.3) {
          const name = AMBIENT[i++ % AMBIENT.length];
          cueAtOverride = at;
          api.cue(name, 0.8 + 0.2 * rnd());
          cueAtOverride = null;
        }
      } finally {
        Math.random = saved;
      }
    },
    get stream() {
      return destination ? destination.stream : null;
    },
    get running() {
      return !!ctx && ctx.state === "running";
    },
    destroy() {
      destroyed = true;
      if (timer) clearInterval(timer);
      tensionNodes?.oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
      if (!offline) void (ctx as AudioContext | null)?.close().catch(() => {});
    },
  };
  return api;
}
