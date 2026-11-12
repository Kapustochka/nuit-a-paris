// paint-material.js — «живописный» материал: ступенчатый свет с дрожащей границей-мазком,
// сине-фиолетовые тени вместо чёрных, неоднородная штукатурка, нарисованные окна, черепица и брусчатка.
// Все цвета задаются сразу «как на картинке» (sRGB), без физического освещения и тонмаппинга.
import * as THREE from 'three';

export const NOISE = /* glsl */ `
  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.07 + 5.2) * 0.3 + vnoise(p * 4.3 + 1.7) * 0.15; }
`;

export const MAX_LIGHTS = 8;

// Общие для всех материалов «настройки картины»: свет, тени, туман, тёплые источники
export function createLook() {
  return {
    uKeyDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
    uKeyCol: { value: new THREE.Color() },
    uShadeCol: { value: new THREE.Color() },
    uSkyCol: { value: new THREE.Color() },
    uFogCol: { value: new THREE.Color() },
    uFog: { value: new THREE.Vector2(16, 75) },
    uWindowsOn: { value: 0.6 },
    uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 0.01)) },
    uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  };
}

const VERT = /* glsl */ `
  attribute float aKind; attribute float aRand; attribute float aBase;
  varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying vec2 vUv;
  varying float vKind; varying float vRand; varying float vBase;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
    vColor = color; vUv = uv; vKind = aKind; vRand = aRand; vBase = aBase;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uKeyDir, uKeyCol, uShadeCol, uSkyCol, uFogCol;
  uniform vec2 uFog; uniform float uWindowsOn;
  uniform vec4 uLightPos[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}];
  #ifdef USE_PAINT_MAP
    uniform sampler2D uMap;
  #endif
  varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying vec2 vUv;
  varying float vKind; varying float vRand; varying float vBase;
  ${NOISE}
  bool is(float k) { return abs(vKind - k) < 0.5; }

  // брусчатка: клетки Вороного, F1 и F2
  vec3 cells(vec2 p) {
    vec2 i = floor(p), f = fract(p); float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y), o = hash2(i + g) * 0.8 + 0.1;
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; id = i + g; } else if (d < f2) f2 = d;
    }
    return vec3(f1, f2 - f1, hash(id));
  }

  void main() {
    vec3 n = normalize(vNormal); if (!gl_FrontFacing) n = -n;
    vec3 base = vColor;
    float alpha = 1.0;
    #ifdef USE_PAINT_MAP
      vec4 tx = texture2D(uMap, vUv);
      if (tx.a < 0.5) discard;
      base *= tx.rgb;
    #endif

    // мазки: шум, вытянутый вдоль поверхности (по горизонтали на стенах)
    vec3 an = abs(n);
    vec2 sp = an.y > 0.7 ? vWorld.xz : (an.x > an.z ? vWorld.zy : vWorld.xy);
    float strokes = fbm(vec2(sp.x * 1.3, sp.y * 4.2) + vRand * 13.0);
    float blotch = fbm(sp * 0.33 + vRand * 7.0);

    // ── узоры поверхностей ──
    if (is(0.0)) {                                       // штукатурка: пятна, тёплые разводы, потёки
      base *= 0.9 + blotch * 0.2;
      base = mix(base, base * vec3(1.04, 0.95, 0.88), smoothstep(0.55, 0.8, fbm(sp * 0.9 + 3.0)) * 0.7);
      base *= 1.0 - smoothstep(0.6, 0.95, vnoise(vec2(sp.x * 2.6, sp.y * 0.22 + vRand * 5.0))) * 0.13;
    } else if (is(1.0)) {                                // шифер/черепица рядами со сдвигом
      vec2 t = vec2(vUv.x * 2.6, vUv.y * 3.2);
      float row = floor(t.y);
      vec2 tile = vec2(floor(t.x + row * 0.5), row);
      float fx = fract(t.x + row * 0.5);
      float edge = smoothstep(0.0, 0.12, fract(t.y)) * smoothstep(0.0, 0.05, min(fx, 1.0 - fx));
      base *= (0.82 + hash(tile) * 0.22) * (0.8 + 0.2 * edge);
    } else if (is(4.0)) {                                // ставни: ламели
      base *= 0.78 + 0.22 * smoothstep(0.1, 0.5, fract(vUv.y * 9.0));
    } else if (is(5.0)) {                                // брусчатка
      vec3 c = cells(vWorld.xz * vec2(3.4, 4.2));
      float mortar = 1.0 - smoothstep(0.03, 0.13, c.y);
      base *= (0.82 + c.z * 0.3) * (1.06 - c.x * 0.25);
      base = mix(base, base * vec3(0.55, 0.52, 0.66), mortar);
    } else if (is(14.0)) {                               // плиты тротуара
      vec2 g = fract(vWorld.xz * vec2(0.9, 1.3));
      float seam = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
      base *= (0.9 + hash(floor(vWorld.xz * vec2(0.9, 1.3))) * 0.14) * (1.0 - seam * 0.3);
    } else if (is(11.0)) {                               // кора: вертикальные мазки
      base *= 0.75 + 0.35 * vnoise(vec2(atan(n.z, n.x) * 3.0, vWorld.y * 0.8) * vec2(4.0, 1.0));
    } else if (is(15.0)) {                               // ворота: филёнки и окошко-фрамуга
      vec2 u = vUv;
      float leaf = step(abs(u.x - 0.5), 0.015);
      vec2 q = vec2(fract(u.x * 2.0), u.y);
      float panel = step(0.14, q.x) * step(q.x, 0.86) * (step(0.08, q.y) * step(q.y, 0.42) + step(0.5, q.y) * step(q.y, 0.78));
      base *= 1.0 - leaf * 0.5 + panel * 0.12 - (1.0 - panel) * 0.05;
      if (u.y > 0.84) base = mix(base, vec3(0.95, 0.66, 0.32), step(0.03, abs(fract(u.x * 4.0) - 0.5)) * step(u.y, 0.97));
    } else if (is(9.0)) {                                // маркиза в полоску
      base = mix(base, vec3(0.94, 0.88, 0.78), step(0.5, fract(vUv.x * 1.6)));
      base *= 1.0 - smoothstep(0.85, 1.0, vUv.y) * 0.3;
    }

    // ── свет: два тона с дрожащей границей, узкий блик и цветные тени ──
    float ndl = dot(n, uKeyDir);
    float t = ndl + (strokes - 0.5) * 0.5;
    float lit = smoothstep(0.02, 0.2, t);
    float glint = smoothstep(0.62, 0.8, t) * 0.1;
    float h = vWorld.y - vBase;
    float ao = mix(0.62, 1.0, smoothstep(0.0, 2.8, h));
    vec3 shade = mix(base * uShadeCol, uShadeCol * 0.55, 0.3);
    vec3 col = mix(shade, base * uKeyCol, lit) + base * glint;
    col = mix(col * uShadeCol * 1.25, col, ao);
    col += uSkyCol * base * smoothstep(0.2, 1.0, n.y) * 0.18;

    // тёплые источники: свет ложится ступенями, как нарисованный
    vec3 warm = vec3(0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec3 d = uLightPos[i].xyz - vWorld; float r = uLightPos[i].w, dist = length(d);
      float f = clamp(1.0 - dist / r, 0.0, 1.0); f *= f;
      float wrap = clamp(dot(n, d / max(dist, 0.001)) * 0.6 + 0.45, 0.0, 1.0);
      float g = f * wrap;
      g = floor(g * 4.0 + 0.35 + (strokes - 0.5) * 0.6) / 4.0;
      warm += uLightCol[i] * g;
    }
    col += base * warm * 1.5 + warm * 0.06;

    // мокрая мостовая: вытянутые отражения фонарей в сторону камеры
    if (is(5.0) || is(14.0)) {
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        if (uLightPos[i].w < 7.0) continue;
        vec2 dl = vWorld.xz - uLightPos[i].xz, vd = normalize(cameraPosition.xz - uLightPos[i].xz + 0.001);
        float along = dot(dl, vd), across = dot(dl, vec2(-vd.y, vd.x));
        float s = exp(-across * across / max(0.18 + along * 0.05, 0.12)) * smoothstep(-0.6, 1.0, along) * exp(-max(along, 0.0) / 7.0);
        s *= 0.55 + 0.45 * vnoise(vec2(along * 3.0, across * 6.0));
        col += uLightCol[i] * s * 0.55;
      }
      float puddle = smoothstep(0.58, 0.7, fbm(vWorld.xz * 0.18 + 2.0));
      col = mix(col, uSkyCol * 0.75 + col * 0.35, puddle * 0.45);
    }

    // ── нарисованные окна ──
    if (is(3.0) || is(8.0)) {
      vec2 u = vUv;
      bool on = vRand < uWindowsOn || is(8.0);
      vec3 glow = mix(vec3(1.0, 0.52, 0.2), vec3(1.0, 0.86, 0.55), smoothstep(0.0, 1.0, u.y + (strokes - 0.5) * 0.5));
      if (is(3.0)) {
        float cw = 0.2 + 0.05 * sin(u.y * 16.0 + vRand * 40.0);           // занавески по краям
        float curtain = 1.0 - smoothstep(cw - 0.03, cw + 0.03, min(u.x, 1.0 - u.x));
        glow = mix(glow, glow * vec3(0.92, 0.55, 0.45), curtain * 0.85);
        if (fract(vRand * 7.0) < 0.2) glow *= 1.0 - smoothstep(0.35, 0.3, length((u - vec2(0.62, 0.32)) * vec2(1.0, 0.7))) * 0.6;  // силуэт цветка
      } else {                                           // витрина: переплёт, дверь посередине, полки с товаром
        float mull = step(abs(fract(u.x * 3.0) - 0.5), 0.02) + step(abs(u.y - 0.78), 0.012);
        float doorway = step(abs(u.x - 0.5), 0.12) * step(u.y, 0.82);
        float shelf = step(abs(fract(u.y * 2.6 + 0.2) - 0.5), 0.03) * step(u.y, 0.74);
        float goods = smoothstep(0.45, 0.5, vnoise(vec2(u.x * 30.0, floor(u.y * 2.6 + 0.2)))) * step(fract(u.y * 2.6 + 0.2), 0.42) * step(u.y, 0.74);
        glow = mix(glow, glow * vec3(0.95, 0.72, 0.55), goods * (1.0 - doorway));
        glow *= 1.0 - shelf * 0.35 * (1.0 - doorway);
        glow = mix(glow, vec3(0.35, 0.2, 0.16), doorway * step(0.55, u.y) * 0.0 + min(mull, 1.0) * 0.8);
      }
      vec3 dark = mix(vec3(0.08, 0.09, 0.24), vec3(0.3, 0.33, 0.6), smoothstep(0.1, 1.0, u.y * 0.7 + u.x * 0.3 + strokes * 0.4));
      dark += smoothstep(0.05, 0.0, abs(u.x - u.y * 0.6 - 0.25)) * 0.12;   // блик неба
      vec3 glass = on ? glow : dark;
      float frame = max(step(abs(u.x - 0.5), 0.03), step(abs(u.y - 0.64), 0.025));
      frame = max(frame, 1.0 - step(0.05, min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y))));
      if (is(8.0)) frame = 1.0 - step(0.035, min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y)));
      col = mix(glass, col, frame);
      if (on) { gl_FragColor = vec4(mix(col, uFogCol, smoothstep(uFog.x, uFog.y, distance(vWorld, cameraPosition)) * 0.4), 1.0); return; }
    }
    if (is(10.0)) { gl_FragColor = vec4(1.0, 0.86, 0.55, 1.0); return; }

    float dist = distance(vWorld, cameraPosition);
    col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, dist) * 0.88);
    gl_FragColor = vec4(col, alpha);
  }
`;

export function paintMaterial(look, { map = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: map ? { ...look, uMap: { value: map } } : look,
    vertexShader: VERT, fragmentShader: FRAG,
    defines: map ? { USE_PAINT_MAP: '' } : {},
    vertexColors: true, side: THREE.DoubleSide,
  });
}
