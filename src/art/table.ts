/** The desk set: felt mat, virtual table, deck, cards, buttons, the Shark and
 * the gaze cone, all in one table-local group. */
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, PlaneGeometry, BoxGeometry, AmbientLight,
  PointLight, BackSide, RepeatWrapping,
} from "@iwsdk/core";
import { FELT, ZONES } from "../game/layout.js";
import { makeTextures, type Textures } from "./textures.js";
import { CardMesh, Stack, Glint } from "./cards.js";
import { ButtonField } from "./buttons.js";
import { GazeCone } from "./cone.js";
import { createShark, type Shark } from "./shark.js";
import { Hover, StrikePegs, StashMarkers, HandMesh, GhostTrail, SlapCue, Shocks, LevelHats } from "./markers.js";
import { ReturnMarks } from "./jar.js";
import { LEVEL_SPOTS } from "../game/levels.js";

export interface Table {
  textures: Textures;
  group: Group;
  felt: Mesh;
  /** Virtual table (and, on a flat screen, a dark room): shown only without a real desk. */
  virtualSet: Group;
  room: Mesh;
  deck: Stack;
  cutStack: Stack;
  discard: Stack;
  sharkCard: CardMesh;
  playerCard: CardMesh;
  glint: Glint;
  buttons: ButtonField;
  cone: GazeCone;
  shark: Shark;
  lamp: PointLight;
  /** The top card of the discard pile, face up. */
  discardFace: CardMesh;
  /** The card the Shark was caught holding (shown face up). */
  evidence: CardMesh;
  hover: Hover;
  gazeHover: Hover;
  pegs: StrikePegs;
  stash: StashMarkers;
  ghost: HandMesh;
  ghostCard: CardMesh;
  /** The lesson for catching him: a see-through hand that slaps his half of the desk. */
  ghostSlap: HandMesh;
  ghostTrail: GhostTrail;
  slapCue: SlapCue;
  shocks: Shocks;
  levelHats: LevelHats;
  /** The jar of saved buttons and the streak medals (shown after the first match). */
  marks: ReturnMarks;
  cursor: HandMesh;
}

export function createTable(): Table {
  const textures = makeTextures();
  const group = new Group();
  group.name = "cheat seat table";

  group.add(new AmbientLight("#9aa0bc", 1.0));
  const lamp = new PointLight("#ffd7a0", 2.6, 4, 2);
  lamp.position.set(0, 0.85, 0.02);
  group.add(lamp);

  textures.felt.repeat.set(4, 4);
  const feltGeo = new PlaneGeometry(FELT.w, FELT.d);
  feltGeo.rotateX(-Math.PI / 2);
  const felt = new Mesh(feltGeo, new MeshLambertMaterial({ map: textures.felt }));
  felt.position.set(0, 0.001, FELT.cz);
  felt.name = "felt";
  group.add(felt);

  // virtual table: a wood top with legs, and (flat screen only) a dark room
  const virtualSet = new Group();
  virtualSet.name = "virtual table";
  textures.wood.repeat.set(2, 1);
  textures.wood.wrapS = textures.wood.wrapT = RepeatWrapping;
  const top = new Mesh(new BoxGeometry(1.5, 0.04, 1.1), new MeshLambertMaterial({ map: textures.wood }));
  top.position.set(0, -0.02, FELT.cz);
  virtualSet.add(top);
  const legMat = new MeshLambertMaterial({ color: "#2b1d15" });
  for (const sx of [-0.68, 0.68])
    for (const sz of [-0.5, 0.5]) {
      const leg = new Mesh(new BoxGeometry(0.06, 0.68, 0.06), legMat);
      leg.position.set(sx, -0.38, FELT.cz + sz);
      virtualSet.add(leg);
    }
  group.add(virtualSet);
  const room = new Mesh(new BoxGeometry(6, 3.2, 6), new MeshBasicMaterial({ color: "#17110f", side: BackSide }));
  room.position.set(0, 1.0, 0);
  group.add(room);

  const deck = new Stack(textures, "deck");
  deck.group.position.set(ZONES.deck.x, 0.0012, ZONES.deck.z);
  const cutStack = new Stack(textures, "cut stack", 0);
  cutStack.group.visible = false;
  const discard = new Stack(textures, "discard", 0);
  discard.group.position.set(ZONES.discard.x, 0.0012, ZONES.discard.z);
  group.add(deck.group, cutStack.group, discard.group);

  const sharkCard = new CardMesh(textures, "shark card");
  const playerCard = new CardMesh(textures, "player card");
  group.add(sharkCard.group, playerCard.group);

  const glint = new Glint(textures);
  deck.group.add(glint.mesh);
  glint.mesh.position.set(0, 0.04, 0);

  const buttons = new ButtonField();
  buttons.mesh.position.y = 0.0012;
  group.add(buttons.mesh);

  const discardFace = new CardMesh(textures, "discard top");
  const evidence = new CardMesh(textures, "evidence");
  group.add(discardFace.group, evidence.group);
  const hover = new Hover("#fff1c4", textures);
  const gazeHover = new Hover("#bfe6ff", textures);
  const pegs = new StrikePegs(textures);
  const stash = new StashMarkers(textures);
  // the ghost hands are drawn 1.35 times life size, warm white, with a pool of light on the felt
  const ghost = new HandMesh("#f2f8ff", 0.8, textures);
  ghost.group.scale.setScalar(1.35);
  const ghostSlap = new HandMesh("#f2f8ff", 0.8, textures);
  ghostSlap.group.scale.setScalar(1.35);
  const ghostCard = new CardMesh(textures, "ghost card");
  // stage 1: the trail on the felt runs from your own card to the deck (the swap), not to the wrist
  const ghostTrail = new GhostTrail(ZONES.playerLay, ZONES.deck);
  const slapCue = new SlapCue(textures, { x: 0.02, z: -0.14 });
  const shocks = new Shocks();
  const levelHats = new LevelHats(LEVEL_SPOTS, { easy: 1, normal: 2, hard: 3 });
  const marks = new ReturnMarks();
  const cursor = new HandMesh("#f1d3a6", 0.85);
  group.add(hover.mesh, gazeHover.mesh, pegs.group, stash.group, ghostTrail.group, slapCue.group, shocks.group, levelHats.group, marks.group, ghost.group, ghostSlap.group, ghostCard.group, cursor.group);

  const shark = createShark(textures);
  group.add(shark.group, shark.gloveR, shark.gloveL);

  const cone = new GazeCone(textures);
  cone.setOrigin(shark.eyePoint);
  group.add(cone.group);

  return {
    textures, group, felt, virtualSet, room, deck, cutStack, discard, sharkCard, playerCard,
    glint, buttons, cone, shark, lamp, discardFace, evidence, hover, gazeHover, pegs, stash, ghost, ghostCard, ghostSlap, ghostTrail, slapCue, shocks, levelHats, marks, cursor,
  };
}
