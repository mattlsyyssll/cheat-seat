/** One look for everything hand-made in the booth: soft-banded toon lighting, a rim of light on the edges, a per-vertex "unlit" amount
 * (eyes, glints) and an outline drawn as a shell pushed out along the normals. Built on the SDK's own toon and basic materials, so
 * skinning, fog and colour handling stay standard. */
import {
  MeshToonMaterial, MeshBasicMaterial, DataTexture, RedFormat, LinearFilter, UnsignedByteType, BackSide, Color, Vector3, Vector2, type Material,
} from "@iwsdk/core";

/** A soft step ramp: shadow, mid, light with short blends between them. */
export function makeRamp(stops: [number, number][] = [[0, 0.34], [0.3, 0.34], [0.42, 0.7], [0.62, 0.72], [0.74, 1], [1, 1]], size = 64): DataTexture {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let v = stops[stops.length - 1][1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k][0] && t <= stops[k + 1][0]) {
        const u = (t - stops[k][0]) / Math.max(1e-6, stops[k + 1][0] - stops[k][0]);
        v = stops[k][1] + (stops[k + 1][1] - stops[k][1]) * u;
        break;
      }
    }
    data[i] = Math.round(v * 255);
  }
  const tex = new DataTexture(data, size, 1, RedFormat, UnsignedByteType);
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface ToonOptions {
  rimColor?: string;
  rimStrength?: number;
  rimPower?: number;
  gradient?: DataTexture;
  /** The mesh has an `aFlat` attribute (0 lit .. 1 flat colour). */
  flatAttr?: boolean;
  /** Dissolve the surface between these two heights (model space, metres): solid above the second, gone below the first. Dithered, so no sorting.
   * (Stage D: not used for the Shark any more; the dither showed as a stippled patch at his waist.) */
  fade?: [number, number];
  /** Stage D: a hard clip: nothing is drawn below this height (model space, metres). Used for the part over the table (the felt hides it).
   * Stage E: behind the edge of the table the cut follows your line of sight (see `hideBehindEdge`), so there is no flat disc where he meets the wood. */
  clipY?: number;
  /** Stage E: he sits BEHIND the far edge of the table. Behind that edge, nothing is drawn below the line from your eye over the edge (the table hides it there anyway),
   * so his body goes down behind the table the way a seated man's does, with no cut and no plank under him. Uniforms `uEye` (table-local eye) and `uEdge` (y, z of the
   * edge) are set every frame (hero-shark `setView`). In front of the edge the plain `clipY` cut applies (the felt hides it). */
  hideBehindEdge?: boolean;
}

export function makeToon(o: ToonOptions = {}): MeshToonMaterial {
  const mat = new MeshToonMaterial({ vertexColors: true, gradientMap: o.gradient ?? makeRamp() });
  const rim = new Color(o.rimColor ?? "#ffb878");
  const uniforms = { uRimColor: { value: new Vector3(rim.r, rim.g, rim.b) }, uRimStrength: { value: o.rimStrength ?? 0.5 }, uRimPower: { value: o.rimPower ?? 4.2 }, uEye: { value: new Vector3(0, 0.52, 0.46) }, uEdge: { value: new Vector2(0.02, -0.35) } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    if (o.flatAttr) {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aFlat;\nvarying float vFlat;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlat = aFlat;");
    }
    if (o.fade || o.clipY !== undefined) {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vModelP;").replace("#include <project_vertex>", "vModelP = transformed;\n#include <project_vertex>");
    }
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${o.fade || o.clipY !== undefined ? "varying vec3 vModelP;" : ""}\n${o.hideBehindEdge ? "uniform vec3 uEye;\nuniform vec2 uEdge;" : ""}\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;\n${o.flatAttr ? "varying float vFlat;" : ""}`)
      .replace(
        "#include <opaque_fragment>",
        `${o.clipY !== undefined ? (o.hideBehindEdge ? `{
          if (vModelP.z > uEdge.y) { if (vModelP.y < ${o.clipY.toFixed(4)}) discard; }
          else {
            float edy = uEdge.x - uEye.y; float edz = uEdge.y - uEye.z;
            vec2 en = normalize(vec2(-edz, edy));
            if (dot(en, vec2(vModelP.y - uEdge.x, vModelP.z - uEdge.y)) < -0.012) discard;
          }
        }\n` : `if (vModelP.y < ${o.clipY.toFixed(4)}) discard;\n`) : ""}${o.fade ? `{
          float fadeK = smoothstep(${o.fade[0].toFixed(4)}, ${o.fade[1].toFixed(4)}, vModelP.y);
          if (fadeK < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
        }` : ""}
        {
          float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
          ${o.flatAttr ? "outgoingLight = mix(outgoingLight, diffuseColor.rgb, vFlat);\n          rimK *= (1.0 - vFlat);" : ""}
          outgoingLight += uRimColor * rimK * uRimStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  return mat;
}

/** Outline shell: draw the back faces pushed out along the normals; thickness grows with distance so it stays about 2 px wide. */
export function makeOutline(widthAt1m = 0.0022, color = "#120a08"): Material {
  const mat = new MeshBasicMaterial({ color, side: BackSide });
  const uniforms = { uOutline: { value: widthAt1m } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uOutline;")
      .replace(
        "#include <skinning_vertex>",
        `#include <skinning_vertex>
        {
          #ifdef USE_SKINNING
          vec4 mvO = modelViewMatrix * vec4(transformed, 1.0);
          float distO = clamp(-mvO.z, 0.25, 3.0);
          transformed += normalize(objectNormal) * uOutline * distO;
          #endif
        }`,
      );
  };
  return mat;
}
