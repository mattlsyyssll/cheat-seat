/** Where the booth goes (pure). Mixed reality: the table top is the real desk. The player sits at the desk, so the middle of the
 * table is 0.46 m in front of the head and the Shark sits 0.46 m beyond it. If the desk is far from the head the table's near edge
 * goes on the desk's near edge and a ring on the floor shows where to sit. No plane: a virtual table at desk height under the eyes. */
import { chooseDesk } from "./layout.js";
import { SEAT } from "./booth.js";

/** @param {{x:number,z:number}} v */
const unit2 = (v) => {
  const l = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / l, z: v.z / l };
};

/**
 * @param {{id?:any,y:number,polygon:{x:number,z:number}[]}[]} planes horizontal planes in world metres
 * @param {{x:number,y:number,z:number}} head
 * @param {{x:number,z:number}} headFwd
 * @returns {{x:number,y:number,z:number,yaw:number,real:boolean,seatFar:boolean,polygon:{x:number,z:number}[]|null,eyeRel:number,seat:{x:number,z:number}}}
 */
export function boothFrame(planes, head, headFwd) {
  const desk = chooseDesk(planes, { x: head.x, z: head.z });
  if (!desk) return virtualFrame(head, headFwd);
  let f = { x: desk.centroid.x - head.x, z: desk.centroid.z - head.z };
  if (Math.hypot(f.x, f.z) < 0.3) f = { x: headFwd.x, z: headFwd.z };
  f = unit2(f);
  const seatFar = desk.dist > 0.6;
  const origin = seatFar
    ? { x: desk.near.x + f.x * (SEAT.playerZ - 0.18), z: desk.near.z + f.z * (SEAT.playerZ - 0.18) }
    : { x: head.x + f.x * SEAT.playerZ, z: head.z + f.z * SEAT.playerZ };
  const seat = { x: origin.x - f.x * SEAT.playerZ, z: origin.z - f.z * SEAT.playerZ };
  const eyeRel = Math.max(0.3, Math.min(0.75, head.y - desk.y));
  return { x: origin.x, y: desk.y, z: origin.z, yaw: Math.atan2(-f.x, -f.z), real: true, seatFar, polygon: desk.polygon, eyeRel, seat };
}

/** No plane: a virtual table 0.47 m under the eyes (between 0.55 and 1.0 m high). */
export function virtualFrame(head, headFwd) {
  const f = unit2(Math.hypot(headFwd.x, headFwd.z) < 1e-3 ? { x: 0, z: -1 } : headFwd);
  const y = Math.max(0.55, Math.min(1.0, head.y - SEAT.eyeRel));
  const origin = { x: head.x + f.x * SEAT.playerZ, z: head.z + f.z * SEAT.playerZ };
  return { x: origin.x, y, z: origin.z, yaw: Math.atan2(-f.x, -f.z), real: false, seatFar: false, polygon: null, eyeRel: Math.max(0.3, Math.min(0.75, head.y - y)), seat: { x: head.x, z: head.z } };
}
