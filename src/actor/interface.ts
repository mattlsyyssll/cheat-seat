/** THE CONTRACT BETWEEN THE SHARK'S BRAIN AND THE ART (stage B implements this; nothing else in the game needs to change).
 *
 * The game (game/duel.js) decides what the Shark does. The rig (actor/rig.js) turns that into a `SharkPose` every frame, in
 * table-local metres (origin on the table top, +x to the player's right, +y up, +z toward the player; he faces +z). An avatar is
 * anything that draws a `SharkPose`. To replace the placeholder, write a `SharkAvatarFactory` (for example in src/art/) and pass it
 * to `createSharkAvatar` in src/art-slot.ts. The avatar owns its meshes, its arm solver and its face; it must not read game state.
 *
 * What the pose gives you (see `SharkPose` in rig.js for every field):
 *   head      position of the head centre, yaw (0 = facing the player, + toward +x), pitch (+ = down), roll
 *   eyes      l and r: yaw and pitch RELATIVE to the head, and `lid` (0 shut, 1 open, up to 1.3 wide)
 *   brows     l and r: -1 lowered and pulled in (angry) to +1 raised
 *   jaw       0 shut to 1 wide open (also named `mouth`)
 *   torso     hip and neck points and how far he leans (0 to 1)
 *   breath    0 to 1: inhale amount (chest and shoulders rise; faster in the stare)
 *   shoulders r and l positions; the right one dips when he cheats (`dipR`)
 *   handR/L   wrist position, `dir` (unit, wrist toward fingertips), `open` (0 fist to 1 flat), `mode`
 *             ("rest", "hover", "under", "slam", "hold", "shove")
 *   sight     his eye point and the true gaze direction; used by the rules, not for drawing
 * The wrist of `handR` is what the player grabs: keep the drawn wrist where the pose says (within a few centimetres).
 * The head must stay at the player's eye height and about 0.9 m away at rest, at least 0.5 m from the player's head (nose and hat brim) when he leans in: his head centre stops 0.7 m from yours (comfort, bench part B6). */
import type { Group } from "@iwsdk/core";
import type { SharkPose, RigCommand } from "./rig.js";

export type { SharkPose, RigCommand };

export interface SharkAvatar {
  /** Add this to the table group (table-local space). */
  readonly root: Group;
  /** Called every frame, after the rig has stepped. `dt` is the frame time in seconds. */
  apply(pose: SharkPose, dt: number): void;
  /** Stage E: the player's eye and the far edge of the table (table-local: y and z of the edge). He sits behind that edge: the avatar draws no body below your line of sight over it. */
  setView?(eye: { x: number; y: number; z: number }, edge: { y: number; z: number }): void;
  /** Free geometry and materials. */
  dispose?(): void;
}

export type SharkAvatarFactory = () => SharkAvatar;
