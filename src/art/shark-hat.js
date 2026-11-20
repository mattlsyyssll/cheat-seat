/** The Shark's hat: a snap-brim fedora made as a surface of revolution (crisp edges, few triangles). Tipped back a little and
 * rolled a touch, so it sits on the head like it was put on by someone who has done it ten thousand times. Head-local metres. */
import { lathe } from "./prims.js";
import { smoothstep } from "./sdf.js";
import { REST, BONE, HEAD_SCALE } from "./shark-rig.js";

const FELT = [0.3, 0.34, 0.38], FELT_TOP = [0.36, 0.4, 0.44], BAND = [0.42, 0.09, 0.11], INSIDE = [0.1, 0.1, 0.11], BRIM_UNDER = [0.17, 0.19, 0.21];

export const HAT = { y: 0.079, z: -0.014, pitch: -0.13, roll: 0.05 };

export function buildHat(b) {
  const T = 0.0042;
  // outer path from the crown's centre, over the top, down the wall, out along the brim top, round the edge, back along the underside
  const outer = [
    [0.0, 0.1235], [0.03, 0.1225], [0.056, 0.1185], [0.0745, 0.1125], [0.0855, 0.1015], [0.0895, 0.082], [0.0915, 0.055], [0.0928, 0.0325], [0.0944, 0.0298], [0.0946, 0.0105], [0.0946, 0.0058],
    [0.1, 0.0044], [0.115, 0.0043], [0.135, 0.0047], [0.153, 0.0058], [0.1585, 0.0045], [0.1595, 0.0], [0.1585, -0.0035],
  ];
  const under = [[0.15, -0.0042], [0.125, -0.0043], [0.1, -0.0045], [0.0915, -0.0042]];
  const inner = [[0.0905, 0.012], [0.0885, 0.05], [0.0855, 0.09], [0.0765, 0.109], [0.0545, 0.1155], [0.0285, 0.1195], [0.0, 0.1205]];
  const profile = [...outer, ...under, ...inner];
  // the crown is a little oval, the front of the brim droops, the back lifts and the sides curl
  const bend = (x, y, z, r) => {
    let X = x * 0.99, Z = z * 1.08 - 0.0, Y = y;
    const w = smoothstep(0.095, 0.158, r);
    const rr = Math.hypot(X, Z) || 1;
    Y += w * (-0.026 * Math.max(0, Z / rr) + 0.014 * Math.max(0, -Z / rr) + 0.012 * (X / rr) * (X / rr));
    // a groove along the top and a pinch at each side of the front
    const topW = smoothstep(0.07, 0.12, y);
    Y -= topW * 0.02 * Math.exp(-((X / 0.028) ** 2)) * (r < 0.09 ? 1 : 0);
    X *= 1 - 0.05 * smoothstep(0.03, 0.08, y) * Math.max(0, Z / rr) * smoothstep(0.7, 0.9, Math.abs(Z / rr)) * 0;
    // tilt back and roll, then put it on the head
    const cp = Math.cos(HAT.pitch), sp = Math.sin(HAT.pitch);
    const Y1 = Y * cp - Z * sp, Z1 = Y * sp + Z * cp;
    const cr = Math.cos(HAT.roll), sr = Math.sin(HAT.roll);
    const X2 = X * cr - Y1 * sr, Y2 = X * sr + Y1 * cr;
    return [X2, Y2 + HAT.y, Z1 + HAT.z];
  };
  const mesh = lathe(profile, 56, bend);
  const rowOf = (i) => Math.floor(i / 57);
  const n = outer.length, m = under.length;
  b.add(mesh, (x, y, z, o, i) => {
    const row = rowOf(i);
    let c = FELT;
    if (row >= n + m) c = INSIDE;
    else if (row >= n) c = BRIM_UNDER;
    else {
      const yy = outer[row][1], rr = outer[row][0];
      if (rr < 0.0951 && yy < 0.0305 && yy > 0.0035) c = BAND;
      else if (rr < 0.075 && yy > 0.11) c = FELT_TOP;
      else if (rr > 0.0945 && row >= 9) c = [FELT[0] * 0.92, FELT[1] * 0.92, FELT[2] * 0.92];
    }
    o.c = [c[0], c[1], c[2]];
    o.w.push([BONE.hat, 1]);
  }, { offset: REST.head, scale: HEAD_SCALE, name: "hat", outline: true });
}
