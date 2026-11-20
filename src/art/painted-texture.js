/** A texture that is made once, before the Enter VR click, and painted again in place (round 8, Q02). A texture made for the first time after the session has started
 * can fail to reach the graphics card on the Quest (IWSDK issue 55: deferred uploads under multiview); a texture the warm-up has already sent only gets new pixels.
 * Used by the score board and the hint plate, whose words change during play. Pure: `make` builds the texture, `paint` draws into it. */
export class PaintedTexture {
  /** @param {() => any} make @param {(tex: any, ...args: any[]) => void} paint */
  constructor(make, paint) {
    this.tex = make();
    this.paint = paint;
    this.repaints = 0;
  }
  /** @param {...any} args */
  repaint(...args) {
    this.paint(this.tex, ...args);
    this.tex.needsUpdate = true;
    this.repaints++;
    return this.tex;
  }
}
