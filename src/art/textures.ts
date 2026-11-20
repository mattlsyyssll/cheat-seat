/** Every texture is drawn here, in code, when the app starts. No image files.
 * This is the only module that draws text: the rank letters and numbers painted on the card faces.
 * The look: ivory cards with real faces (corner indices, pips, painted court figures), a wine-red back with a fin, a felt mat with the
 * lamp's light baked in (so the table needs no lighting maths), wallpaper and floor with the glow and the slats of light baked in. */
import { CanvasTexture, SRGBColorSpace, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter } from "@iwsdk/core";
import { createRng, nextFloat } from "../game/rng.js";

/** A short word on a dark rounded plate, for the headset's pause menu (stage D: the only words in the headset scene). Returns a texture of
 * `w` by `h` pixels; the plate is part of the picture, so it needs no extra mesh. */
export function makeLabel(text: string, w = 512, h = 128, color = "#f4ecd8"): CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(14,9,6,0.9)";
  const r = h * 0.3;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(226,184,90,0.85)";
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(h * 0.52)}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + h * 0.03);
  const t = texture(c, false, 4);
  return t;
}

export type PlateTone = "gold" | "good" | "bad";

/** The headset's plate (stage D, rebuilt in stage E): a big line and, under it, a smaller line, on a dark rounded plate with a coloured edge (gold, green for a
 * win, red for a loss); 600 by 506 pixels. Each part wraps to at most four lines. */
export function makeHint(main: string, sub = "", tone: PlateTone = "gold", into?: CanvasTexture): CanvasTexture {
  // stage F (D7): the plate is taller (art/hint.ts PLATE.height 0.232 to 0.29 m) at the same pixels per metre, so the second line can be 30 percent bigger (54 to 70 px)
  const w = 600, h = 493;
  const [c, ctx] = into ? paintTarget(into) : canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const r = 44;
  ctx.fillStyle = "rgb(10,7,5)";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = tone === "good" ? "rgba(120,214,148,0.95)" : tone === "bad" ? "rgba(255,112,92,0.95)" : "rgba(226,184,90,0.95)";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const wrap = (text: string, size: number, weight: number, maxLines: number): { lines: string[]; size: number } => {
    let sz = size;
    for (;;) {
      ctx.font = `${weight} ${sz}px ${FONT}`;
      const words = text.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const wd of words) {
        const t = cur ? `${cur} ${wd}` : wd;
        if (ctx.measureText(t).width > w - 80 && cur) { lines.push(cur); cur = wd; } else cur = t;
      }
      if (cur) lines.push(cur);
      // stage F: never cut words off (a tip lost its last word "table."); the caller shrinks both parts until they fit the plate
      if (lines.length <= maxLines || sz <= size * 0.7) return { lines, size: sz };
      sz -= 4;
    }
  };
  // both parts shrink together (never under 80 percent) until they fit the plate
  // a plate with no second line (a tip) has room for five lines; with a second line the big line keeps to three
  const mainLines = sub ? 3 : 5;
  let M = wrap(main, sub ? 70 : 82, 800, mainLines);
  let S = sub ? wrap(sub, 76, 700, 5) : { lines: [] as string[], size: 0 };
  const gap = sub ? 18 : 0;
  const fit = () => M.lines.length * M.size * 1.12 + gap + S.lines.length * S.size * 1.16 <= h - 56;
  for (let k = 0.96; !fit() && k >= 0.6; k -= 0.04) {
    M = wrap(main, Math.round((sub ? 70 : 82) * k), 800, mainLines);
    if (sub) S = wrap(sub, Math.round(76 * k), 700, 5);
  }
  const lhM = M.size * 1.12, lhS = S.size * 1.16;
  const total = M.lines.length * lhM + gap + S.lines.length * lhS;
  let y = (h - total) / 2 + lhM / 2 + 4;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${M.size}px ${FONT}`;
  for (const ln of M.lines) { ctx.fillText(ln, w / 2, y); y += lhM; }
  y += gap - lhM / 2 + lhS / 2;
  ctx.fillStyle = "#fff4d6";
  ctx.font = `650 ${S.size}px ${FONT}`;
  for (const ln of S.lines) { ctx.fillText(ln, w / 2, y); y += lhS; }
  if (into) {
    into.needsUpdate = true; // round 8 (Q02): the board paints into the texture it has (made and sent to the graphics card before the session), not a new one
    return into;
  }
  return texture(c, false, 4);
}

/** Stage F: the headset's scoreboard (a small board standing on the table, art/score.ts): the round, the pot and both sides' strikes out of three (red lamps).
 * 512 by 400 pixels; the board is 0.21 m wide, so the big lines are about 3 cm tall on the table. */
export function makeScore(o: { round: number; rounds: number; pot: number; you: number; him: number }, into?: CanvasTexture): CanvasTexture {
  const w = 512, h = 400;
  const [c, ctx] = into ? paintTarget(into) : canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const r = 34;
  ctx.fillStyle = "rgba(14,9,6,0.94)";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(201,150,47,0.95)";
  ctx.stroke();
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f2c766";
  ctx.font = `800 82px ${FONT}`;
  ctx.fillText(`ROUND ${o.round}/${o.rounds}`, w / 2, 78);
  ctx.fillStyle = "#f8f0dc";
  ctx.font = `800 82px ${FONT}`;
  ctx.fillText(`POT ${o.pot}`, w / 2, 178);
  // strikes: two columns, YOU on the left and HIM on the right, each name over its own three lamps (lit red). Stage F: the first layout put each name at the
  // left of a row of lamps; seen from the seat the board is turned and tilted, the rows slope, and his lit lamp read as yours.
  ctx.font = `800 52px ${FONT}`;
  ctx.textAlign = "center";
  const col = (label: string, n: number, cx: number) => {
    ctx.fillStyle = "#eadcba";
    ctx.fillText(label, cx, 262);
    for (let i = 0; i < 3; i++) {
      const x = cx - 64 + i * 64, y = 336, lit = n > i;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.fillStyle = lit ? "#ff4a2a" : "rgba(80,40,32,0.9)";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = lit ? "#ffd0b8" : "rgba(201,150,47,0.7)";
      ctx.stroke();
    }
  };
  col("YOU", o.you, 132);
  col("HIM", o.him, 380);
  // a thin rule between the two columns
  ctx.fillStyle = "rgba(201,150,47,0.6)";
  ctx.fillRect(w / 2 - 2, 232, 4, 136);
  if (into) {
    into.needsUpdate = true; // round 8 (Q02): the board paints into the texture it has (made and sent to the graphics card before the session), not a new one
    return into;
  }
  return texture(c, false, 8);
}

/** 13 ranks across, 4 suits down, then one extra row: cell 0 = card back, cell 1 = card edge. */
export const ATLAS = { cols: 13, rows: 5, cellW: 144, cellH: 202 };
const RED = "#b3282d";
const INK = "#22201f";
const CREAM = "#f4ebd3";
const GOLD = "#c9962f";

/** One short word painted in brass on a clear ground (the label next to the strike lamps). */
export function makeTag(word: string): CanvasTexture {
  const w = 512, h = 128;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 92px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(14,9,6,0.85)";
  ctx.strokeText(word, w / 2, h / 2 + 4);
  ctx.fillStyle = "#f2c766";
  ctx.fillText(word, w / 2, h / 2 + 4);
  return texture(c, false, 4);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** The canvas and 2D context of a texture that is painted again. */
function paintTarget(t: CanvasTexture): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = t.image as HTMLCanvasElement;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, repeat = false, aniso = 4): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number, tint = [0.6, 1, 0.6]): void {
  const rng = createRng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (nextFloat(rng) - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n * tint[0]));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n * tint[1]));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * tint[2]));
  }
  ctx.putImageData(img, 0, 0);
}

/** Green felt from layered noise (the plain tiling felt). */
export function makeFelt(): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const rng = createRng(1301);
  ctx.fillStyle = "#1c5436";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const r = 6 + nextFloat(rng) * 40;
    ctx.fillStyle = nextFloat(rng) > 0.5 ? "rgba(70,140,90,0.05)" : "rgba(8,30,18,0.06)";
    ctx.beginPath();
    ctx.arc(nextFloat(rng) * 512, nextFloat(rng) * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, 512, 512, 34, 1302);
  return texture(c, true);
}

/** The table's felt mat in one piece, 0.88 m by 0.48 m: felt with fibres, an inlaid gold border, a faint ring in the middle, and the
 * pool of lamplight baked in (bright in the middle, dark at the rim), so the mat is drawn with no lighting at all. */
export function makeTableFelt(): CanvasTexture {
  const W = 1280, H = 700;
  const [c, ctx] = canvas(W, H);
  const rng = createRng(4411);
  ctx.fillStyle = "#1f6a42";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    const r = 10 + nextFloat(rng) * 70;
    ctx.fillStyle = nextFloat(rng) > 0.5 ? "rgba(90,170,110,0.05)" : "rgba(8,40,22,0.07)";
    ctx.beginPath();
    ctx.arc(nextFloat(rng) * W, nextFloat(rng) * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, W, H, 30, 4412);
  // faint ring and fin mark in the middle of the table
  ctx.strokeStyle = "rgba(230,200,120,0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 122, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // gold inlay border with rounded corners, double line, and a small diamond in each corner
  const inset = 26, r = 46;
  const rr = (m: number) => {
    ctx.beginPath();
    ctx.roundRect(m, m, W - 2 * m, H - 2 * m, Math.max(4, r - (m - inset)));
  };
  ctx.strokeStyle = "rgba(214,170,70,0.85)";
  ctx.lineWidth = 5;
  rr(inset);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(214,170,70,0.6)";
  rr(inset + 14);
  ctx.stroke();
  ctx.fillStyle = "rgba(214,170,70,0.9)";
  for (const [x, y] of [[inset + 14, inset + 14], [W - inset - 14, inset + 14], [inset + 14, H - inset - 14], [W - inset - 14, H - inset - 14]]) {
    ctx.beginPath();
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x + 11, y);
    ctx.lineTo(x, y + 11);
    ctx.lineTo(x - 11, y);
    ctx.closePath();
    ctx.fill();
  }
  // the pool of light: a warm centre and a dark rim, centred a little toward his side (the lamp hangs over the middle of the table)
  const cx = W * 0.5, cy = H * 0.44;
  const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, W * 0.62);
  g.addColorStop(0, "rgba(255,226,160,0.30)");
  g.addColorStop(0.35, "rgba(255,200,120,0.08)");
  g.addColorStop(0.7, "rgba(0,0,0,0.30)");
  g.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return texture(c, false, 8);
}

/** Dark wood for the virtual table (used only when no real desk is found). */
export function makeWood(): CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  const rng = createRng(77);
  ctx.fillStyle = "#4a3224";
  ctx.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 2) {
    const a = 0.05 + nextFloat(rng) * 0.12;
    ctx.fillStyle = nextFloat(rng) > 0.5 ? `rgba(20,10,5,${a})` : `rgba(120,80,50,${a * 0.6})`;
    ctx.fillRect(0, y, 512, 1 + nextFloat(rng) * 2);
  }
  return texture(c, true);
}

/** Soft white spot, used for the pool of light and the glint. */
export function makeGlow(): CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(c);
}

/** Cream page edges for the deck sides. */
export function makeEdge(): CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  paintEdge(ctx, 0, 0, 64, 64);
  return texture(c, true);
}

function paintEdge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "#ece2c8";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(110,86,50,0.4)";
  for (let k = 0; k < h; k += 3) ctx.fillRect(x, y + k, w, 1);
}

/** The back of a card: wine red, a cream border, a diamond lattice and a shark's fin in a ring. */
function paintBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.translate(x, y);
  clearRoundRect(ctx, w, h);
  ctx.fillStyle = "#efe3c6";
  ctx.fill();
  ctx.fillStyle = "#6a1a28";
  ctx.beginPath();
  ctx.roundRect(9, 9, w - 18, h - 18, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(9, 9, w - 18, h - 18, 8);
  ctx.clip();
  ctx.strokeStyle = "rgba(239,227,198,0.5)";
  ctx.lineWidth = 2;
  for (let i = -h; i < w + h; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i + h, h);
    ctx.moveTo(i + h, 0); ctx.lineTo(i, h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "#efe3c6";
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  // ring and fin
  ctx.fillStyle = "#6a1a28";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#efe3c6";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#efe3c6";
  ctx.beginPath();
  ctx.moveTo(w / 2 - 14, h / 2 + 16);
  ctx.quadraticCurveTo(w / 2 - 8, h / 2 - 6, w / 2 + 4, h / 2 - 24);
  ctx.quadraticCurveTo(w / 2 + 8, h / 2 - 4, w / 2 + 20, h / 2 + 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#efe3c6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 24, h / 2 + 22);
  ctx.quadraticCurveTo(w / 2 - 12, h / 2 + 15, w / 2, h / 2 + 22);
  ctx.quadraticCurveTo(w / 2 + 12, h / 2 + 29, w / 2 + 24, h / 2 + 22);
  ctx.stroke();
  ctx.restore();
}

export function makeBack(): CanvasTexture {
  const { cellW: w, cellH: h } = ATLAS;
  const [c, ctx] = canvas(w, h);
  paintBack(ctx, 0, 0, w, h);
  return texture(c);
}

function clearRoundRect(ctx: CanvasRenderingContext2D, w: number, h: number, inset = 1.5): void {
  ctx.beginPath();
  ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, 15);
}

/** Suit shapes. s is the half size. */
export function drawSuit(ctx: CanvasRenderingContext2D, suit: number, cx: number, cy: number, s: number, color?: string): void {
  ctx.fillStyle = color ?? (suit === 1 || suit === 2 ? RED : INK);
  ctx.beginPath();
  if (suit === 0) {
    ctx.moveTo(cx, cy - s);
    ctx.bezierCurveTo(cx + s * 1.25, cy - s * 0.1, cx + s * 0.95, cy + s * 0.85, cx, cy + s * 0.4);
    ctx.bezierCurveTo(cx - s * 0.95, cy + s * 0.85, cx - s * 1.25, cy - s * 0.1, cx, cy - s);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.15);
    ctx.lineTo(cx + s * 0.38, cy + s);
    ctx.lineTo(cx - s * 0.38, cy + s);
    ctx.closePath();
    ctx.fill();
  } else if (suit === 1) {
    ctx.moveTo(cx, cy + s);
    ctx.bezierCurveTo(cx + s * 1.4, cy - s * 0.05, cx + s * 0.75, cy - s * 1.05, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx - s * 0.75, cy - s * 1.05, cx - s * 1.4, cy - s * 0.05, cx, cy + s);
    ctx.fill();
  } else if (suit === 2) {
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s * 0.72, cy);
    ctx.lineTo(cx, cy + s);
    ctx.lineTo(cx - s * 0.72, cy);
    ctx.closePath();
    ctx.fill();
  } else {
    for (const [dx, dy] of [[0, -0.5], [-0.52, 0.25], [0.52, 0.25]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * s, cy + dy * s, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + s * 0.34, cy + s);
    ctx.lineTo(cx - s * 0.34, cy + s);
    ctx.closePath();
    ctx.fill();
  }
}

const PIPS: Record<number, [number, number][]> = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 0.33], [1, 0.33], [0.5, 0.5], [0, 0.67], [1, 0.67], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 0.17], [0, 0.33], [1, 0.33], [0, 0.67], [1, 0.67], [0.5, 0.83], [0, 1], [1, 1]],
};

function rankLabel(rank: number): string {
  return rank === 14 ? "A" : rank === 13 ? "K" : rank === 12 ? "Q" : rank === 11 ? "J" : String(rank);
}

/** One court figure (a bust, upper half of the frame, in a 72 by 74 box with its origin at the top left), painted flat in bold shapes. */
function paintCourt(ctx: CanvasRenderingContext2D, rank: number, suit: number): void {
  const suitCol = suit === 1 || suit === 2 ? RED : INK;
  const robe = suit === 1 || suit === 2 ? "#a8272d" : "#25324f";
  const trim = GOLD;
  const skin = "#e8bf98", hair = rank === 13 ? "#d9d4c8" : rank === 12 ? "#6b3a1e" : "#3c2514";
  // body: shoulders
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(6, 74);
  ctx.quadraticCurveTo(8, 50, 36, 47);
  ctx.quadraticCurveTo(64, 50, 66, 74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.moveTo(30, 47); ctx.lineTo(36, 74); ctx.lineTo(42, 47); ctx.lineTo(36, 51); ctx.closePath();
  ctx.fill();
  ctx.fillRect(6, 66, 60, 3);
  // hair behind the head
  ctx.fillStyle = hair;
  if (rank === 12) { ctx.beginPath(); ctx.ellipse(36, 36, 21, 24, 0, 0, Math.PI * 2); ctx.fill(); }
  // neck and face
  ctx.fillStyle = skin;
  ctx.fillRect(31, 40, 10, 10);
  ctx.beginPath();
  ctx.ellipse(36, 30, 13, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  if (rank === 13) {
    // a beard
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(23, 32); ctx.quadraticCurveTo(24, 52, 36, 54); ctx.quadraticCurveTo(48, 52, 49, 32);
    ctx.quadraticCurveTo(42, 40, 36, 38); ctx.quadraticCurveTo(30, 40, 23, 32);
    ctx.fill();
  }
  // eyes and brows
  ctx.fillStyle = INK;
  ctx.fillRect(29, 27, 4, 2);
  ctx.fillRect(40, 27, 4, 2);
  ctx.fillRect(28, 24, 6, 1.5);
  ctx.fillRect(39, 24, 6, 1.5);
  ctx.fillStyle = "#b8564a";
  ctx.fillRect(33, 38, 7, 1.8);
  // crown or cap
  if (rank === 11) {
    ctx.fillStyle = suitCol;
    ctx.beginPath(); ctx.moveTo(21, 26); ctx.quadraticCurveTo(22, 4, 38, 6); ctx.lineTo(62, 12); ctx.quadraticCurveTo(46, 12, 51, 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim; ctx.fillRect(21, 21, 30, 4);
    ctx.strokeStyle = "#e9e0c8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(58, 12); ctx.quadraticCurveTo(70, 2, 66, -4); ctx.stroke();
  } else {
    ctx.fillStyle = trim;
    ctx.beginPath();
    const top = rank === 13 ? 4 : 10;
    ctx.moveTo(22, 22); ctx.lineTo(22, top + 6); ctx.lineTo(29, top + 12); ctx.lineTo(36, top); ctx.lineTo(43, top + 12); ctx.lineTo(50, top + 6); ctx.lineTo(50, 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = suitCol;
    for (const x of [28, 36, 44]) { ctx.beginPath(); ctx.arc(x, 18, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
}

function paintFace(ctx: CanvasRenderingContext2D, x: number, y: number, rank: number, suit: number): void {
  const { cellW: w, cellH: h } = ATLAS;
  const color = suit === 1 || suit === 2 ? RED : INK;
  ctx.save();
  ctx.translate(x, y);
  clearRoundRect(ctx, w, h);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.strokeStyle = "#b9a883";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const label = rankLabel(rank);
  const corner = () => {
    ctx.fillStyle = color;
    ctx.font = `bold ${label.length > 1 ? 40 : 52}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, 25, 50);
    drawSuit(ctx, suit, 25, 76, 12);
  };
  corner();
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  corner();
  ctx.restore();
  const cx0 = 58, cx1 = w - 36, cy0 = 38, cy1 = h - 38;
  if (rank <= 10) {
    for (const [px, py] of PIPS[rank]) {
      const X = cx0 + px * (cx1 - cx0), Y = cy0 + py * (cy1 - cy0);
      if (py > 0.5) {
        ctx.save(); ctx.translate(X, Y); ctx.rotate(Math.PI); drawSuit(ctx, suit, 0, 0, 14); ctx.restore();
      } else drawSuit(ctx, suit, X, Y, 14);
    }
  } else if (rank === 14) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc((cx0 + cx1) / 2 + 2, h / 2, 40, 0, Math.PI * 2); ctx.stroke();
    drawSuit(ctx, suit, (cx0 + cx1) / 2 + 2, h / 2, 30);
  } else {
    const fx = 40, fy = 24, fw = w - 80, fh = h - 48;
    ctx.fillStyle = "#faf3df";
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(fx, fy, fw, fh);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(fx + 3, fy + 3, fw - 6, fh - 6);
    ctx.save();
    ctx.beginPath(); ctx.rect(fx + 4, fy + 4, fw - 8, fh - 8); ctx.clip();
    const sc = (fw - 8) / 72;
    // upper figure
    ctx.save(); ctx.translate(fx + 4, fy + 4 + 0); ctx.scale(sc, sc); paintCourt(ctx, rank, suit); ctx.restore();
    // the same figure turned upside down in the lower half
    ctx.save(); ctx.translate(fx + fw - 4, fy + fh - 4); ctx.rotate(Math.PI); ctx.scale(sc, sc); paintCourt(ctx, rank, suit); ctx.restore();
    ctx.restore();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fx, fy + fh / 2); ctx.lineTo(fx + fw, fy + fh / 2); ctx.stroke();
    drawSuit(ctx, suit, fx + fw - 12, fy + fh / 2, 8);
  }
  ctx.restore();
}

/** All 52 faces in one atlas: column = rank - 2, row = suit. Row 4: the back (column 0) and the edge (column 1). */
export function makeAtlas(): CanvasTexture {
  const { cols, rows, cellW, cellH } = ATLAS;
  const [c, ctx] = canvas(cols * cellW, rows * cellH);
  for (let suit = 0; suit < 4; suit++)
    for (let col = 0; col < cols; col++) paintFace(ctx, col * cellW, suit * cellH, col + 2, suit);
  paintBack(ctx, 0, 4 * cellH, cellW, cellH);
  paintEdge(ctx, cellW, 4 * cellH, cellW, cellH);
  return texture(c, false, 8);
}

/** UV rectangle of a card (0..51) in the atlas, with a half-pixel inset against bleeding. */
export function atlasUv(card: number): { u0: number; v0: number; du: number; dv: number } {
  return cellUv(card % 13, Math.floor(card / 13));
}

export function cellUv(col: number, row: number): { u0: number; v0: number; du: number; dv: number } {
  const { cols, rows, cellW, cellH } = ATLAS;
  const px = 0.5 / (cols * cellW), py = 0.5 / (rows * cellH);
  return { u0: col / cols + px, v0: 1 - (row + 1) / rows + py, du: 1 / cols - 2 * px, dv: 1 / rows - 2 * py };
}
/** Where the card back and the page edge are in the atlas. */
export const BACK_CELL = cellUv(0, 4);
export const EDGE_CELL = cellUv(1, 4);

/** A poker chip: the top (left half, a disc) and the side (right half, stripes). Grey-cream so a colour per chip can tint it. */
export function makeChip(): CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = "#efe6cf";
  ctx.fillRect(0, 0, 512, 256);
  // top: ivory disc, six wine-red wedges on the rim, a gold ring and a spade
  ctx.save();
  ctx.translate(128, 128);
  ctx.fillStyle = "#efe6cf";
  ctx.beginPath(); ctx.arc(0, 0, 128, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8d1f2b";
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i / 6) * Math.PI * 2);
    ctx.beginPath(); ctx.moveTo(-26, -128); ctx.lineTo(26, -128); ctx.lineTo(20, -98); ctx.lineTo(-20, -98); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = GOLD; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, 84, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#8d1f2b";
  ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
  drawSuit(ctx, 0, 0, 0, 36, "#efe6cf");
  ctx.restore();
  // side: alternating wine and ivory blocks
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? "#efe6cf" : "#8d1f2b";
    ctx.fillRect(256 + i * (256 / 12), 0, 256 / 12 + 1, 256);
  }
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(256, 0, 256, 20);
  ctx.fillRect(256, 236, 256, 20);
  return texture(c);
}

/** The wall behind and around him: dark wallpaper stripes with a soft damask, a warm glow behind his head and bars of light from a
 * blind across the wall. Light and dark are baked in. */
export function makeWall(): CanvasTexture {
  const W = 1024, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#2a1618";
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 64) {
    ctx.fillStyle = "rgba(255,210,150,0.045)";
    ctx.fillRect(x, 0, 30, H);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x + 30, 0, 4, H);
  }
  ctx.fillStyle = "rgba(255,200,140,0.05)";
  for (let y = 40; y < H - 100; y += 80)
    for (let x = 32; x < W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y - 14); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 9, y); ctx.closePath();
      ctx.fill();
    }
  // wainscot: a darker panel along the bottom with a rail
  ctx.fillStyle = "#1d100f";
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.fillStyle = "#4a2d22";
  ctx.fillRect(0, H * 0.72 - 6, W, 8);
  // slats of warm light, tilted, across the right of the picture
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H * 0.72); ctx.clip();
  for (let i = 0; i < 9; i++) {
    const y0 = 20 + i * 48;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + 24);
    g.addColorStop(0, "rgba(255,196,120,0)");
    g.addColorStop(0.5, "rgba(255,196,120,0.22)");
    g.addColorStop(1, "rgba(255,196,120,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.transform(1, 0.16, 0, 1, 0, -90);
    ctx.fillRect(W * 0.58, y0, W * 0.42, 24);
    ctx.restore();
  }
  ctx.restore();
  // glow behind his head (the middle of the wall) and a dark vignette at the corners
  let g = ctx.createRadialGradient(W * 0.5, H * 0.34, 10, W * 0.5, H * 0.34, W * 0.36);
  g.addColorStop(0, "rgba(255,190,110,0.5)");
  g.addColorStop(0.5, "rgba(255,160,90,0.14)");
  g.addColorStop(1, "rgba(255,160,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.2, W * 0.5, H * 0.5, W * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  noise(ctx, W, H, 10, 5511, [1, 0.9, 0.8]);
  return texture(c, false, 4);
}

/** Dark floor boards with the pool of light from the lamp. */
export function makeFloor(): CanvasTexture {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = createRng(6061);
  ctx.fillStyle = "#2b1b14";
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 64) {
    ctx.fillStyle = `rgba(${60 + nextFloat(rng) * 40},${35 + nextFloat(rng) * 20},20,0.5)`;
    ctx.fillRect(x, 0, 62, H);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x + 62, 0, 2, H);
  }
  noise(ctx, W, H, 18, 6062, [1, 0.8, 0.6]);
  const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.5);
  g.addColorStop(0, "rgba(255,200,130,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return texture(c, false, 4);
}

/** A small night painting for the back wall: a moon over a dark sea and a shark's fin. */
export function makePainting(): CanvasTexture {
  const W = 320, H = 220;
  const [c, ctx] = canvas(W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, "#0f1b30");
  sky.addColorStop(1, "#2c4a62");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f2e6bd";
  ctx.beginPath(); ctx.arc(W * 0.74, H * 0.28, 24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(242,230,189,0.16)";
  ctx.beginPath(); ctx.arc(W * 0.74, H * 0.28, 44, 0, Math.PI * 2); ctx.fill();
  const sea = ctx.createLinearGradient(0, H * 0.6, 0, H);
  sea.addColorStop(0, "#1d3a4e");
  sea.addColorStop(1, "#08121c");
  ctx.fillStyle = sea;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  ctx.strokeStyle = "rgba(242,230,189,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const y = H * 0.64 + i * 14; ctx.beginPath(); ctx.moveTo(W * 0.62 - i * 4, y); ctx.lineTo(W * 0.86 + i * 4, y); ctx.stroke(); }
  ctx.fillStyle = "#050a10";
  ctx.beginPath();
  ctx.moveTo(W * 0.2, H * 0.84);
  ctx.quadraticCurveTo(W * 0.3, H * 0.72, W * 0.34, H * 0.48);
  ctx.quadraticCurveTo(W * 0.42, H * 0.7, W * 0.52, H * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.85); ctx.quadraticCurveTo(W * 0.3, H * 0.9, W * 0.6, H * 0.84); ctx.stroke();
  return texture(c);
}

export interface Textures {
  felt: CanvasTexture;
  wood: CanvasTexture;
  glow: CanvasTexture;
  edge: CanvasTexture;
  back: CanvasTexture;
  atlas: CanvasTexture;
  table: CanvasTexture;
  chip: CanvasTexture;
  wall: CanvasTexture;
  floor: CanvasTexture;
  painting: CanvasTexture;
}

export function makeTextures(): Textures {
  return {
    felt: makeFelt(),
    wood: makeWood(),
    glow: makeGlow(),
    edge: makeEdge(),
    back: makeBack(),
    atlas: makeAtlas(),
    table: makeTableFelt(),
    chip: makeChip(),
    wall: makeWall(),
    floor: makeFloor(),
    painting: makePainting(),
  };
}
