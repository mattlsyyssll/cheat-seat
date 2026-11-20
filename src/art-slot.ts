/** The one place where the art stage plugs in. Stage B's hero Shark is plugged in here (`SharkAvatarFactory`, see actor/interface.ts);
 * the placeholder Shark stays in actor/placeholder.ts as the fallback. The game logic does not change. */
export { createSharkAvatar } from "./art/hero-slot.js";
