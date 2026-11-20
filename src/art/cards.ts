/** Card meshes, the deck and the discard pile. A card is one mesh (a face plane and a back plane, both from one atlas, corners cut out
 * by the texture's own rounded edge), so a card costs one draw call. The deck is a slab with page-edge sides and a card back on top. */
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, PlaneGeometry, BufferGeometry, Float32BufferAttribute, AdditiveBlending, DoubleSide,
} from "@iwsdk/core";
import { CARD } from "../game/layout.js";
import { atlasUv, BACK_CELL, EDGE_CELL, type Textures } from "./textures.js";

const CARD_THICKNESS = 0.0007;
const sharedMats = new WeakMap<object, MeshLambertMaterial>();
/** One material for every card and deck: same texture, same lighting. */
function cardMaterial(textures: Textures): MeshLambertMaterial {
  let m = sharedMats.get(textures.atlas);
  if (!m) {
    m = new MeshLambertMaterial({ map: textures.atlas, alphaTest: 0.5, color: "#fff4e0" });
    sharedMats.set(textures.atlas, m);
  }
  return m;
}

export class CardMesh {
  group = new Group();
  private mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  private uv: Float32BufferAttribute;
  card: number | null = null;
  private own = false;

  constructor(textures: Textures, name: string) {
    this.group.name = name;
    const w = CARD.w / 2, h = CARD.h / 2;
    const y = 0.0004;
    // front (faces up) then back (faces down)
    const pos = [-w, y, -h, w, y, -h, -w, y, h, w, y, h, -w, -y, -h, w, -y, -h, -w, -y, h, w, -y, h];
    const nor = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    this.uv = new Float32BufferAttribute(new Float32Array(16), 2);
    g.setAttribute("uv", this.uv);
    g.setIndex([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6]);
    const b = BACK_CELL;
    // the back is seen after the card turns over about its long side, which swaps left and right: so swap them here
    const bu = [[b.u0 + b.du, b.v0 + b.dv], [b.u0, b.v0 + b.dv], [b.u0 + b.du, b.v0], [b.u0, b.v0]];
    for (let i = 0; i < 4; i++) this.uv.setXY(4 + i, bu[i][0], bu[i][1]);
    this.mesh = new Mesh(g, cardMaterial(textures));
    this.group.add(this.mesh);
    this.group.visible = false;
    this.setCard(0);
  }

  /** Which face the front plane shows. */
  setCard(card: number | null): void {
    this.card = card;
    if (card === null) return;
    const { u0, v0, du, dv } = atlasUv(card);
    const c = [[0, 1], [1, 1], [0, 0], [1, 0]];
    for (let i = 0; i < 4; i++) this.uv.setXY(i, u0 + c[i][0] * du, v0 + c[i][1] * dv);
    this.uv.needsUpdate = true;
  }

  /** Stage D: light the card from within (0 to 1): the peeked card is tilted away from the lamp and would be black. The first call gives this card its own material. */
  setGlow(k: number): void {
    const m = this.mesh.material;
    if (!this.own) {
      const c = m.clone();
      c.emissiveMap = m.map;
      this.mesh.material = c;
      this.own = true;
    }
    this.mesh.material.emissive.setScalar(k);
  }

  /** 0 = face up, 1 = face down (turns about the card's long side). */
  setFlip(k: number): void {
    this.group.rotation.z = Math.PI * k;
  }
}

/** A slab of cards: page-edge sides and a card back on top, one mesh. */
export class Stack {
  group = new Group();
  private body: Mesh<BufferGeometry, MeshLambertMaterial>;
  count = 0;

  constructor(textures: Textures, name: string, readonly maxCards = 52) {
    this.group.name = name;
    const w = CARD.w / 2, d = CARD.h / 2;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    const quad = (p: number[][], n: number[], cell: { u0: number; v0: number; du: number; dv: number }, flip = false) => {
      const i = pos.length / 3;
      const t = [[0, 0], [1, 0], [1, 1], [0, 1]];
      p.forEach((v, k) => { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); uv.push(cell.u0 + t[k][0] * cell.du, cell.v0 + t[k][1] * cell.dv); });
      if (flip) idx.push(i, i + 2, i + 1, i, i + 3, i + 2); else idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    // unit height; scaled in y by the card count
    quad([[-w, 1, d], [w, 1, d], [w, 1, -d], [-w, 1, -d]], [0, 1, 0], BACK_CELL);
    quad([[-w, 0, d], [w, 0, d], [w, 1, d], [-w, 1, d]], [0, 0, 1], EDGE_CELL);
    quad([[w, 0, -d], [-w, 0, -d], [-w, 1, -d], [w, 1, -d]], [0, 0, -1], EDGE_CELL);
    quad([[w, 0, d], [w, 0, -d], [w, 1, -d], [w, 1, d]], [1, 0, 0], EDGE_CELL);
    quad([[-w, 0, -d], [-w, 0, d], [-w, 1, d], [-w, 1, -d]], [-1, 0, 0], EDGE_CELL);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.body = new Mesh(g, cardMaterial(textures));
    this.group.add(this.body);
    this.setCount(maxCards);
  }

  setCount(n: number): void {
    this.count = Math.max(0, n);
    const h = Math.max(0.0006, this.count * CARD_THICKNESS);
    this.body.scale.y = h;
    this.group.visible = this.count > 0;
  }

  /** Height of the top card above the desk. */
  get height(): number {
    return Math.max(0.0006, this.count * CARD_THICKNESS) + 0.0006;
  }
}

/** A thin bright streak that crosses a card: the hint to pinch the deck. */
export class Glint {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  constructor(textures: Textures) {
    const g = new PlaneGeometry(0.034, CARD.h * 1.1);
    g.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(
      g,
      new MeshBasicMaterial({
        map: textures.glow, color: "#fff4cf", transparent: true, opacity: 0, depthWrite: false,
        blending: AdditiveBlending, side: DoubleSide,
      }),
    );
    this.mesh.rotation.y = 0.5;
    this.mesh.renderOrder = 5;
  }

  /** k in 0..1 sweeps across the card; strength 0..1 fades it. */
  update(k: number, strength: number): void {
    this.mesh.position.x = (k - 0.5) * (CARD.w * 1.4);
    this.mesh.material.opacity = strength * Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, k))), 0.6);
    this.mesh.visible = strength > 0.01;
  }
}
