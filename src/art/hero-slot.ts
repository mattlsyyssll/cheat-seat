/** Drop-in for src/art-slot.ts: `export { createSharkAvatar } from "./art/hero-slot.js"`. */
import type { SharkAvatarFactory } from "../actor/interface.js";
import { createHeroShark } from "./hero-shark.js";

export const createSharkAvatar: SharkAvatarFactory = () => createHeroShark();
