/** Counts what is in the scene, so a test can prove no text is rendered in it. */
import { Mesh, type Scene } from "@iwsdk/core";

export function auditScene(scene: Scene): { meshes: number; sprites: number; textLike: number } {
  let meshes = 0, sprites = 0, textLike = 0;
  scene.traverse((o) => {
    if (o instanceof Mesh) meshes++;
    if (o.type === "Sprite") sprites++;
    if (/text/i.test(o.constructor.name) || (o as unknown as { isText?: boolean }).isText) textLike++;
  });
  return { meshes, sprites, textLike };
}
