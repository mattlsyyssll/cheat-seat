/** Critically damped springs for the Shark's rig (pure). A spring moves a number toward its target with no overshoot; `omega` is
 * how fast (about 3 / omega seconds to settle). Stable at any frame time. */

/** @param {number} cur @param {number} vel @param {number} target @param {number} omega @param {number} dt @returns {[number, number]} */
export function springStep(cur, vel, target, omega, dt) {
  const x = cur - target;
  const e = Math.exp(-omega * dt);
  const temp = (vel + omega * x) * dt;
  return [target + (x + temp) * e, (vel - omega * temp) * e];
}

export class Spring {
  /** @param {number} v */
  constructor(v = 0) {
    this.v = v;
    this.vel = 0;
  }
  /** @param {number} target @param {number} omega @param {number} dt */
  step(target, omega, dt) {
    [this.v, this.vel] = springStep(this.v, this.vel, target, omega, dt);
    return this.v;
  }
  /** @param {number} v */
  set(v) {
    this.v = v;
    this.vel = 0;
  }
}

export class Spring3 {
  /** @param {{x:number,y:number,z:number}} p */
  constructor(p = { x: 0, y: 0, z: 0 }) {
    this.x = new Spring(p.x);
    this.y = new Spring(p.y);
    this.z = new Spring(p.z);
  }
  /** @param {{x:number,y:number,z:number}} t @param {number} omega @param {number} dt */
  step(t, omega, dt) {
    return { x: this.x.step(t.x, omega, dt), y: this.y.step(t.y, omega, dt), z: this.z.step(t.z, omega, dt) };
  }
  get value() {
    return { x: this.x.v, y: this.y.v, z: this.z.v };
  }
  /** @param {{x:number,y:number,z:number}} p */
  set(p) {
    this.x.set(p.x);
    this.y.set(p.y);
    this.z.set(p.z);
  }
}
