// night-light.js — общая «карта ночного света» города, одна текстура сверху:
//   R — тёплый свет фонарей и витрин на земле и низу стен,
//   G — тротуар вдоль домов (каменные плиты и бордюр),
//   B — мягкая тень у подножия стен (ambient occlusion).
// Шейдеры земли и фасадов читают её по мировым x/z: одна выборка вместо десятков источников света,
// поэтому телефон рисует пятна света от каждого фонаря почти бесплатно.
import * as THREE from 'three';

const PX_PER_M = 3.6;        // ~28 см на пиксель
const MAX_SIZE = 2048;
const SIDEWALK = 1.7;        // ширина тротуара, м
const LAMP_R = 8.5;          // радиус пятна под фонарём, м

export function createNightLight(bounds, terrain = null) {
  const w = bounds.maxX - bounds.minX, h = bounds.maxZ - bounds.minZ;
  const k = Math.min(PX_PER_M, MAX_SIZE / Math.max(w, h));
  const W = Math.ceil(w * k), H = Math.ceil(h * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const X = (x) => (x - bounds.minX) * k, Z = (z) => (z - bounds.minZ) * k;

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  const uniforms = {
    uNightMap: { value: texture },
    uNightBounds: { value: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / w, 1 / h) },
    uLampColor: { value: new THREE.Color(1.0, 0.62, 0.3) },
    ...(terrain?.uniforms || {}),
  };
  const defines = terrain?.uniforms ? { NIGHT_TERRAIN: '' } : {};

  // Тротуары и тень у стен: обводим контуры домов
  function buildings(polys) {
    g.globalCompositeOperation = 'lighter';
    const path = (p) => { g.beginPath(); g.moveTo(X(p[0]), Z(p[1])); for (let i = 2; i < p.length; i += 2) g.lineTo(X(p[i]), Z(p[i + 1])); g.closePath(); };
    g.lineJoin = 'round';
    g.strokeStyle = '#00ff00'; g.fillStyle = '#00ff00'; g.lineWidth = SIDEWALK * 2 * k;
    for (const { p } of polys) { path(p); g.stroke(); g.fill(); }
    // тень: несколько полупрозрачных обводок разной ширины = размытие без ctx.filter (нет в старом Safari)
    for (const [width, a] of [[2.6, 0.12], [1.7, 0.16], [1.0, 0.2], [0.5, 0.25]]) {
      g.strokeStyle = `rgba(0,0,255,${a})`; g.lineWidth = width * 2 * k;
      for (const { p } of polys) { path(p); g.stroke(); }
    }
  }
  // Пятно тёплого света радиусом r метров
  function light(x, z, r = LAMP_R, strength = 1) {
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * k);
    const s = (v) => `rgba(255,0,0,${(v * strength).toFixed(3)})`;
    gr.addColorStop(0, s(0.95)); gr.addColorStop(0.18, s(0.7)); gr.addColorStop(0.45, s(0.3)); gr.addColorStop(1, s(0));
    g.fillStyle = gr; g.fillRect(X(x) - r * k, Z(z) - r * k, 2 * r * k, 2 * r * k);
  }
  // Полоса света из витрины на мостовую
  function shopSpill(x, z, nx, nz, width) {
    for (let i = -1; i <= 1; i++) light(x + nz * width * 0.3 * i + nx * 1.2, z - nx * width * 0.3 * i + nz * 1.2, 3.6, 0.55);
  }
  const done = () => { texture.needsUpdate = true; };
  return { uniforms, defines, buildings, light, shopSpill, done, canvas: c };
}

const COMMON = /* glsl */ `
  uniform sampler2D uNightMap;
  uniform vec4 uNightBounds;
  uniform vec3 uLampColor;
  varying vec3 vNightPos;
  vec4 nightSample(vec2 xz) { return texture2D(uNightMap, (xz - uNightBounds.xy) * uNightBounds.zw); }
  #ifdef NIGHT_TERRAIN
    uniform sampler2D uHeightMap;
    uniform vec4 uHeightBounds;
    uniform vec2 uHeightTexel;
    float groundAt(vec2 xz) {
      vec2 uv = clamp((xz - uHeightBounds.xy) * uHeightBounds.zw, 0.0, 1.0);
      return texture2D(uHeightMap, mix(uHeightTexel, 1.0 - uHeightTexel, uv)).r;
    }
  #else
    float groundAt(vec2 xz) { return 0.0; }
  #endif
  float nHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float nNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(nHash(i), nHash(i + vec2(1, 0)), f.x), mix(nHash(i + vec2(0, 1)), nHash(i + 1.0), f.x), f.y);
  }
`;
function addWorldPos(shader, uniforms, defines = {}) {
  Object.assign(shader.uniforms, uniforms);
  shader.defines = { ...(shader.defines || {}), ...defines };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vNightPos;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 nightWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        nightWorld = instanceMatrix * nightWorld;
      #endif
      vNightPos = (modelMatrix * nightWorld).xyz;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON);
}

// Брусчатка: плиты тротуара, бордюр, тень у стен, лужи и тёплые пятна фонарей
export function nightGround(material, light, sidewalkMap) {
  material.onBeforeCompile = (shader) => {
    addWorldPos(shader, { ...light.uniforms, uWalk: { value: sidewalkMap } }, light.defines);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uWalk;\nvec4 nightCell; float nightWet;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        nightCell = nightSample(vNightPos.xz);
        float macro = nNoise(vNightPos.xz * 0.11) * 0.6 + nNoise(vNightPos.xz * 0.43) * 0.4;
        diffuseColor.rgb *= 0.82 + macro * 0.34;                       // брусчатка не повторяется плиткой
        float walk = smoothstep(0.42, 0.58, nightCell.g);
        float curb = smoothstep(0.18, 0.4, nightCell.g) * (1.0 - smoothstep(0.42, 0.56, nightCell.g));
        vec3 slab = texture2D(uWalk, vNightPos.xz * 0.5).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, slab, walk);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.49, 0.5), curb * 0.85);
        diffuseColor.rgb *= 1.0 - nightCell.b * 0.75;
        nightWet = smoothstep(0.52, 0.72, nNoise(vNightPos.xz * 0.07 + 3.1) * 0.7 + nNoise(vNightPos.xz * 0.31) * 0.3) * (1.0 - walk);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.3, nightWet);
        roughnessFactor = mix(roughnessFactor, 0.78, walk);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uLampColor * nightCell.r * (0.4 + nightCell.r) * 2.6;`);
  };
  material.customProgramCacheKey = () => 'night-ground';
}

// Фасады-открытки (MeshBasicMaterial): ночь темнее, у фонарей — тёплое пятно, окна светятся как прежде
export function nightFacade(material, light, key) {
  material.onBeforeCompile = (shader) => {
    addWorldPos(shader, light.uniforms, light.defines);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float glow = smoothstep(0.4, 0.68, c.g) * smoothstep(0.6, 0.85, c.r);   // светящиеся окна и витрины
        vec4 cell = nightSample(vNightPos.xz);
        float y = vNightPos.y - groundAt(vNightPos.xz);
        float lamp = cell.r * exp(-max(y - 1.5, 0.0) * 0.28);
        float shade = mix(0.4, 0.6, smoothstep(14.0, 2.0, y));         // верх домов уходит в ночь
        shade *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.6, y));           // тень у самого тротуара
        vec3 lit = c * (shade + lamp * 0.5) * mix(vec3(1.0), vec3(1.18, 0.96, 0.72), min(lamp, 1.0) * 0.6);
        diffuseColor.rgb = mix(lit, c * 1.12, glow);
      }`);
  };
  material.customProgramCacheKey = () => 'night-facade-' + key;
}

// Камень лестниц и балюстрад: тёплый свет фонарей из той же карты, тень у стен
export function nightStone(material, light, key) {
  material.onBeforeCompile = (shader) => {
    addWorldPos(shader, light.uniforms, light.defines);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvec4 stoneCell;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        stoneCell = nightSample(vNightPos.xz);
        diffuseColor.rgb *= (0.85 + nNoise(vNightPos.xz * 1.7) * 0.3) * (1.0 - stoneCell.b * 0.5);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uLampColor * stoneCell.r * (0.4 + stoneCell.r) * 2.2;`);
  };
  material.customProgramCacheKey = () => 'night-stone-' + key;
}
