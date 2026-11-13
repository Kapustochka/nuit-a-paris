// paint.js — «живописный» свет для всей игры (стиль прототипа experiments/painted-street.html):
//   • два тона с дрожащей границей-мазком, тени уходят в фиолетовый, а не в чёрный;
//   • тёплый свет всех фонарей берётся из общей карты ночного света (night-light.js) и ложится ступенями;
//   • своя дымка вдали; на мостовой — блики ближайших фонарей.
// Цвета считаются «как на картинке» (sRGB), а на выходе переводятся в линейные — дальше их берёт post.js.
// paintMaterial — для своей геометрии (дома, мостовая, листва), paintPatch — для любых готовых материалов
// (модели Meshy, героиня, прохожие): их текстуры остаются, меняется только то, как они освещены.
import * as THREE from 'three';

export const MAX_LIGHTS = 6;
export const MAX_CASTERS = 6;      // героиня и ближайшие прохожие отбрасывают тени на мостовую

export const NOISE = /* glsl */ `
  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.07 + 5.2) * 0.3 + vnoise(p * 4.3 + 1.7) * 0.15; }
`;

// Общие настройки картины: свет луны, цвет теней, дымка, карта ночного света
export function createLook(night, moonDirection) {
  return {
    ...night.uniforms,
    uKeyDir: { value: moonDirection.clone().setY(Math.max(moonDirection.y, 0.55)).normalize() },
    uKeyCol: { value: new THREE.Color().setRGB(0.5, 0.52, 0.8, THREE.LinearSRGBColorSpace) },
    uShadeCol: { value: new THREE.Color().setRGB(0.2, 0.18, 0.42, THREE.LinearSRGBColorSpace) },
    uSkyCol: { value: new THREE.Color().setRGB(0.34, 0.35, 0.68, THREE.LinearSRGBColorSpace) },
    uFogCol: { value: new THREE.Color().setRGB(0.21, 0.19, 0.4, THREE.LinearSRGBColorSpace) },
    uFogDensity: { value: 0.0075 },
    uWindowsOn: { value: 0.6 },
    uCaster: { value: Array.from({ length: MAX_CASTERS }, () => new THREE.Vector4(0, -100, 0, 0)) },      // ступни: xyz, w — сила тени
    uCasterDir: { value: Array.from({ length: MAX_CASTERS }, () => new THREE.Vector4(1, 0, 1, 0)) },      // от фонаря: xz, длина, сила
    uLookTime: { value: 0 },                               // секунды: окна зажигаются и гаснут, за стёклами ходят люди
    uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 0.01)) },
    uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  };
}

const LOOK_GLSL = /* glsl */ `
  uniform vec3 uKeyDir, uKeyCol, uShadeCol, uSkyCol, uFogCol, uLampColor;
  uniform float uFogDensity, uWindowsOn, uLookTime;
  uniform sampler2D uNightMap; uniform vec4 uNightBounds;
  uniform vec4 uCaster[${MAX_CASTERS}], uCasterDir[${MAX_CASTERS}];
  #ifdef NIGHT_TERRAIN
    uniform sampler2D uHeightMap; uniform vec4 uHeightBounds; uniform vec2 uHeightTexel;
    float groundAt(vec2 xz) {
      vec2 uv = clamp((xz - uHeightBounds.xy) * uHeightBounds.zw, 0.0, 1.0);
      return texture2D(uHeightMap, mix(uHeightTexel, 1.0 - uHeightTexel, uv)).r;
    }
  #else
    float groundAt(vec2 xz) { return 0.0; }
  #endif
  vec4 nightSample(vec2 xz) { return texture2D(uNightMap, (xz - uNightBounds.xy) * uNightBounds.zw); }
  ${NOISE}
  // свет и тень «кистью»: base — цвет поверхности, h — высота над землёй
  vec3 paintShade(vec3 base, vec3 n, vec3 wp, float strokes, float h) {
    float t = dot(n, uKeyDir) + (strokes - 0.5) * 0.3;
    float lit = smoothstep(0.0, 0.25, t);
    float glint = smoothstep(0.62, 0.8, t) * 0.1;
    float ao = mix(0.62, 1.0, smoothstep(0.0, 2.8, h));
    vec3 shade = mix(base * uShadeCol, uShadeCol * 0.55, 0.3);
    vec3 col = mix(shade, base * uKeyCol, lit) + base * glint;
    col = mix(col * uShadeCol * 1.25, col, ao);
    col += uSkyCol * base * smoothstep(0.2, 1.0, n.y) * 0.18;
    float g = nightSample(wp.xz).r * exp(-max(h - 1.5, 0.0) * 0.28);
    float gb = g * 4.0 + 0.3 + (strokes - 0.5) * 0.18;          // ступени света, но с мягким краем
    g = (floor(gb) + smoothstep(0.3, 0.7, fract(gb))) / 4.0;
    col += base * uLampColor * g * 1.15 + uLampColor * g * 0.03;
    // тени людей: пятно под ногами и длинная тень прочь от ближайшего фонаря
    if (n.y > 0.5) {
      float sh = 0.0;
      for (int i = 0; i < ${MAX_CASTERS}; i++) {
        vec4 c = uCaster[i];
        if (c.w < 0.01 || abs(wp.y - c.y) > 0.7) continue;
        vec2 d = wp.xz - c.xz; vec4 L = uCasterDir[i];
        float along = dot(d, L.xy), across = dot(d, vec2(-L.y, L.x)), t = along / L.z;
        float wide = 0.2 + 0.3 * clamp(t, 0.0, 1.0);
        float lean = smoothstep(wide, wide * 0.35, abs(across) + (strokes - 0.5) * 0.08) * smoothstep(-0.12, 0.1, along) * smoothstep(1.0, 0.65, t);
        sh = max(sh, max(exp(-dot(d, d) / 0.11) * 0.75, lean * min(L.w * 1.5, 1.0) * 0.85) * c.w);
      }
      col = mix(col, col * vec3(0.26, 0.24, 0.5), sh);
    }
    return col;
  }
  vec3 paintFog(vec3 col, vec3 wp, float k) {
    float d = distance(wp, cameraPosition) * uFogDensity;
    return mix(col, uFogCol, (1.0 - exp(-d * d)) * k);
  }
  vec3 toLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
`;

// ── Материал для своей геометрии (builder.js): дома, лестницы, листва ─────────────
const VERT = /* glsl */ `
  attribute float aKind; attribute float aRand;
  varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying vec2 vUv;
  varying float vKind; varying float vRand;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
    #ifdef USE_COLOR
      vColor = color;
    #else
      vColor = vec3(1.0);
    #endif
    vUv = uv; vKind = aKind; vRand = aRand;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  ${LOOK_GLSL}
  uniform vec4 uLightPos[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}];
  #ifdef USE_PAINT_MAP
    uniform sampler2D uMap;
  #endif
  varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying vec2 vUv;
  varying float vKind; varying float vRand;
  bool is(float k) { return abs(vKind - k) < 0.5; }
  // силуэт человека за стеклом: голова и плечи; p — от середины груди, s — рост
  float figure(vec2 p, float s) {
    p /= s;
    float head = smoothstep(0.076, 0.066, length(p - vec2(0.0, 0.155)));
    vec2 q = abs(p - vec2(0.0, -0.22)) - vec2(0.03, 0.15);                      // плечи: прямоугольник со скруглением
    float body = smoothstep(0.1, 0.09, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
    return max(head, body);
  }
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
    #ifdef USE_PAINT_MAP
      vec4 tx = texture2D(uMap, vUv);
      if (tx.a < 0.5) discard;
      base *= tx.rgb;
    #endif
    vec3 an = abs(n);
    vec2 sp = an.y > 0.7 ? vWorld.xz : (an.x > an.z ? vWorld.zy : vWorld.xy);
    float strokes = fbm(vec2(sp.x * 1.3, sp.y * 4.2) + vRand * 13.0);
    float blotch = fbm(sp * 0.33 + vRand * 7.0);
    float h = vWorld.y - groundAt(vWorld.xz);

    if (is(0.0)) {                                       // штукатурка: пятна, тёплые разводы, потёки
      base *= 0.94 + blotch * 0.12;
      base = mix(base, base * vec3(1.03, 0.96, 0.9), smoothstep(0.55, 0.8, fbm(sp * 0.9 + 3.0)) * 0.5);
      base *= 1.0 - smoothstep(0.7, 0.95, vnoise(vec2(sp.x * 2.6, sp.y * 0.22 + vRand * 5.0))) * 0.06;
    } else if (is(1.0)) {                                // шифер рядами со сдвигом
      vec2 t = vec2(vUv.x * 2.6, vUv.y * 3.2);
      float row = floor(t.y), fx = fract(t.x + row * 0.5);
      float edge = smoothstep(0.0, 0.12, fract(t.y)) * smoothstep(0.0, 0.05, min(fx, 1.0 - fx));
      base *= (0.82 + hash(vec2(floor(t.x + row * 0.5), row)) * 0.22) * (0.8 + 0.2 * edge);
    } else if (is(4.0)) {                                // ставни: ламели
      base *= 0.78 + 0.22 * smoothstep(0.1, 0.5, fract(vUv.y * 9.0));
    } else if (is(11.0)) {                               // кора
      base *= 0.75 + 0.35 * vnoise(vec2(atan(n.z, n.x) * 3.0, vWorld.y * 0.8) * vec2(4.0, 1.0));
    } else if (is(9.0)) {                                // маркиза в полоску
      base = mix(base, vec3(0.94, 0.88, 0.78), step(0.5, fract(vUv.x * 1.6)));
      base *= 1.0 - smoothstep(0.85, 1.0, vUv.y) * 0.3;
    } else if (is(15.0)) {                               // ворота: филёнки и фрамуга
      vec2 u = vUv, q = vec2(fract(u.x * 2.0), u.y);
      float panel = step(0.14, q.x) * step(q.x, 0.86) * (step(0.08, q.y) * step(q.y, 0.42) + step(0.5, q.y) * step(q.y, 0.78));
      base *= 1.0 - step(abs(u.x - 0.5), 0.015) * 0.5 + panel * 0.12 - (1.0 - panel) * 0.05;
      if (u.y > 0.84) base = mix(base, vec3(0.95, 0.66, 0.32), step(0.03, abs(fract(u.x * 4.0) - 0.5)) * step(u.y, 0.97));
    }

    vec3 col = paintShade(base, n, vWorld, strokes, h);

    if (is(3.0) || is(8.0)) {                            // живые окна и витрины
      vec2 u = vUv;
      // число окна округляем: между вершинами оно чуть «плывёт», а hash превращает это в рябь
      float wr = floor(vRand * 2048.0 + 0.5) / 2048.0;
      float r2 = hash(vec2(wr * 311.0, 1.7)), r3 = hash(vec2(wr * 173.0, 5.1)), r4 = hash(vec2(wr * 97.0, 9.3));
      // свет в квартирах время от времени зажигается и гаснет — у каждого окна свой ритм
      float turn = floor(uLookTime / (45.0 + 150.0 * r3) + r4 * 9.0);
      bool flip = hash(vec2(wr * 517.0, turn)) < 0.2;
      bool on = ((vRand < uWindowsOn) != flip) || is(8.0);
      vec3 glow = mix(vec3(1.0, 0.52, 0.2), vec3(1.0, 0.86, 0.55), smoothstep(0.0, 1.0, u.y + (strokes - 0.5) * 0.5));
      if (is(3.0)) {
        // у каждой квартиры своя лампа: янтарная, сливочная, розовая, зелёный абажур, синий телевизор
        float tv = step(0.93, r2);
        vec3 tint = r2 < 0.5 ? vec3(1.0) : r2 < 0.7 ? vec3(1.0, 1.12, 1.25) : r2 < 0.84 ? vec3(1.0, 0.86, 1.05) : r2 < 0.93 ? vec3(0.86, 1.1, 0.95) : vec3(0.42, 0.7, 1.9);
        glow *= tint * mix(0.72, 1.05, r3);
        float flick = floor(vnoise(vec2(uLookTime * 5.0, wr * 50.0)) * 4.0) / 4.0;             // телевизор мигает ступенями
        glow *= mix(1.0, 0.6 + 0.6 * flick, tv);
        if (r4 < 0.4) glow += vec3(0.22, 0.17, 0.08) * smoothstep(0.26, 0.0, length((u - vec2(0.28 + 0.44 * r3, 0.6)) * vec2(0.6, 1.0))) * (1.0 - tv);   // пятно абажура
        float cw = 0.2 + 0.05 * sin(u.y * 16.0 + wr * 40.0);
        float curtain = 1.0 - smoothstep(cw - 0.03, cw + 0.03, min(u.x, 1.0 - u.x));
        glow = mix(glow, glow * vec3(0.92, 0.55, 0.45), curtain * 0.85);
        // силуэты: кто-то проходит по комнате, кто-то стоит у окна, на подоконнике сидит кошка
        float who = hash(vec2(wr * 61.0, 3.3)), shade = 0.0;
        if (who < 0.26) {
          float px = 0.5 + 0.75 * sin(uLookTime * 0.11 * (0.5 + r3) + r4 * 40.0);
          shade = figure((u - vec2(px, 0.5)) * vec2(0.55, 1.0), 1.0);
        } else if (who < 0.38) {
          shade = figure((u - vec2(0.36 + 0.3 * r3, 0.46 + 0.012 * sin(uLookTime * 0.7 + r4 * 9.0))) * vec2(0.55, 1.0), 1.0);
        } else if (who < 0.45) {
          vec2 c = (u - vec2(0.3 + 0.4 * r3, 0.07)) * vec2(0.55, 1.0);
          float ears = max(0.0, 0.035 - abs(abs(c.x - 0.045) - 0.022) * 1.6 - abs(c.y - 0.115) * 0.9);
          float tail = smoothstep(0.012, 0.006, abs(length(c - vec2(-0.075, 0.03 + 0.012 * sin(uLookTime * 1.3 + r4 * 20.0))) - 0.045)) * step(c.x, -0.06);
          shade = max(max(smoothstep(0.075, 0.065, length(c * vec2(1.0, 1.25))), smoothstep(0.04, 0.032, length(c - vec2(0.045, 0.085)))), max(step(0.001, ears), tail));
        }
        glow *= 1.0 - shade * 0.62;
      } else if (hash(floor(vWorld.xz / 7.0) + 3.0) < 0.5) {
        // кафе: тёплый зал, подвесные лампы, гости за столиками и официант, который ходит по залу
        vec2 c = vec2(u.x * 1.5, u.y);
        glow = mix(vec3(0.96, 0.5, 0.24), vec3(1.0, 0.8, 0.5), smoothstep(0.1, 0.9, u.y + (strokes - 0.5) * 0.4));
        float seat = floor(c.x * 2.6), sx = fract(c.x * 2.6) - 0.5, sr = hash(vec2(seat, floor(vWorld.x / 7.0)));
        float guest = figure(vec2(sx / 2.6 + 0.01 * sin(uLookTime * 0.6 + sr * 30.0), u.y - 0.47), 0.78) * step(0.38, sr);
        float table = step(abs(u.y - 0.27), 0.012) * step(abs(sx), 0.34) + step(abs(sx), 0.02) * step(u.y, 0.27);
        float wx = fract(uLookTime * 0.02 + hash(floor(vWorld.xz / 7.0))) * 2.1 - 0.3;
        float waiter = figure(vec2(c.x - wx, u.y - 0.6), 1.15);
        float lampX = fract(c.x * 1.3) - 0.5;
        float bulb = smoothstep(0.06, 0.02, length(vec2(lampX / 1.3, u.y - 0.82)));
        float cone = smoothstep(0.55, 0.1, abs(lampX) / max(0.82 - u.y, 0.02) * 0.6) * step(u.y, 0.82) * 0.16;
        glow += vec3(0.3, 0.24, 0.12) * cone;
        glow = mix(glow, vec3(0.3, 0.15, 0.13), max(max(guest, waiter), min(table, 1.0)) * 0.72);
        glow = mix(glow, vec3(1.0, 0.95, 0.8), bulb);
        glow = mix(glow, vec3(0.3, 0.17, 0.14), step(abs(lampX), 0.006) * step(0.84, u.y) * 0.7);
      } else {
        float mull = step(abs(fract(u.x * 3.0) - 0.5), 0.02) + step(abs(u.y - 0.78), 0.012);
        float shelf = step(abs(fract(u.y * 2.6 + 0.2) - 0.5), 0.03) * step(u.y, 0.74);
        float goods = smoothstep(0.45, 0.5, vnoise(vec2(u.x * 30.0, floor(u.y * 2.6 + 0.2)))) * step(fract(u.y * 2.6 + 0.2), 0.42) * step(u.y, 0.74);
        glow = mix(glow, glow * vec3(0.95, 0.72, 0.55), goods);
        glow *= 1.0 - shelf * 0.35;
        glow = mix(glow, vec3(0.35, 0.2, 0.16), min(mull, 1.0) * 0.8);
      }
      vec3 dark = mix(vec3(0.08, 0.09, 0.24), vec3(0.3, 0.33, 0.6), smoothstep(0.1, 1.0, u.y * 0.7 + u.x * 0.3 + strokes * 0.4));
      dark += smoothstep(0.05, 0.0, abs(u.x - u.y * 0.6 - 0.25)) * 0.12;
      vec3 glass = on ? glow : dark;
      float frame = max(step(abs(u.x - 0.5), 0.03), step(abs(u.y - 0.64), 0.025));
      frame = max(frame, 1.0 - step(0.05, min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y))));
      if (is(8.0)) frame = 1.0 - step(0.035, min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y)));
      col = mix(glass, col, frame);
      if (on) { gl_FragColor = vec4(toLinear(paintFog(col, vWorld, 0.45)), 1.0); return; }
    }
    if (is(10.0)) { gl_FragColor = vec4(toLinear(vec3(1.0, 0.86, 0.55)), 1.0); return; }
    float fogK = 1.0;
    if (is(16.0)) {                                      // памятники: ночью подсвечены, в дымке тонут меньше
      float flood = smoothstep(0.4, 0.6, uWindowsOn) * (0.95 - 0.3 * smoothstep(12.0, 50.0, h));
      col = mix(col, base * mix(vec3(1.0, 0.9, 0.76), vec3(0.92, 0.9, 1.0), smoothstep(15.0, 45.0, h)) * (0.92 + (strokes - 0.5) * 0.12), flood);
      fogK = 0.35;
    }
    gl_FragColor = vec4(toLinear(paintFog(col, vWorld, fogK)), 1.0);
  }
`;

export function paintMaterial(look, { map = null, side = THREE.DoubleSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: map ? { ...look, uMap: { value: map } } : look,
    vertexShader: VERT, fragmentShader: FRAG,
    defines: { ...(look.uHeightMap ? { NIGHT_TERRAIN: '' } : {}), ...(map ? { USE_PAINT_MAP: '' } : {}) },
    vertexColors: true, side,
  });
}

// ── Мостовая: брусчатка, тротуары из карты ночного света, лужи и блики фонарей ────
const GROUND_FRAG = /* glsl */ `
  ${LOOK_GLSL}
  uniform vec4 uLightPos[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}];
  varying vec3 vWorld; varying vec3 vNormal;
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
    vec3 n = normalize(vNormal);
    vec4 cell = nightSample(vWorld.xz);
    float walk = smoothstep(0.42, 0.58, cell.g), curb = smoothstep(0.18, 0.4, cell.g) * (1.0 - smoothstep(0.42, 0.56, cell.g));
    vec2 cp = vWorld.xz * vec2(3.4, 4.2);
    float far = smoothstep(0.35, 0.9, max(length(fwidth(cp)), 0.0));   // вдали камни сливаются в ровный тон — без ряби
    vec3 c = mix(cells(cp), vec3(0.42, 0.5, 0.5), far);
    vec3 base = vec3(0.62, 0.6, 0.66) * (0.82 + c.z * 0.3) * (1.06 - c.x * 0.25);
    base = mix(base, base * vec3(0.55, 0.52, 0.66), 1.0 - smoothstep(0.03, 0.13, c.y));
    vec2 g = mix(fract(vWorld.xz * vec2(0.9, 1.3)), vec2(0.5), smoothstep(0.2, 0.6, length(fwidth(vWorld.xz * vec2(0.9, 1.3)))));
    vec3 slab = vec3(0.78, 0.74, 0.72) * (0.9 + hash(floor(vWorld.xz * vec2(0.9, 1.3))) * 0.14) * (1.0 - (1.0 - smoothstep(0.0, 0.04, min(g.x, g.y))) * 0.3);
    base = mix(base, slab, walk);
    base = mix(base, vec3(0.84, 0.8, 0.76), curb * 0.85);
    base *= 1.0 - cell.b * 0.6;
    float strokes = fbm(vWorld.xz * vec2(1.3, 4.2));
    vec3 col = paintShade(base, n, vWorld, strokes, 0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {                    // мокрые блики фонарей
      vec2 dl = vWorld.xz - uLightPos[i].xz, vd = normalize(cameraPosition.xz - uLightPos[i].xz + 0.001);
      float along = dot(dl, vd), across = dot(dl, vec2(-vd.y, vd.x));
      float s = exp(-across * across / max(0.18 + along * 0.05, 0.12)) * smoothstep(-0.6, 1.0, along) * exp(-max(along, 0.0) / 7.0);
      col += uLightCol[i] * s * 0.2;
    }
    float puddle = smoothstep(0.58, 0.7, fbm(vWorld.xz * 0.18 + 2.0)) * (1.0 - walk);
    col = mix(col, uSkyCol * 0.75 + col * 0.35, puddle * 0.2);
    gl_FragColor = vec4(toLinear(paintFog(col, vWorld, 1.0)), 1.0);
  }
`;
export function groundMaterial(look) {
  return new THREE.ShaderMaterial({
    uniforms: look,
    vertexShader: 'varying vec3 vWorld; varying vec3 vNormal; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: GROUND_FRAG,
    defines: look.uHeightMap ? { NIGHT_TERRAIN: '' } : {},
  });
}

// ── Любой готовый материал (Lambert / Standard / Phong / Toon) становится «нарисованным» ──
const patched = new WeakSet();
export function paintPatch(material, look) {
  if (patched.has(material) || !(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshToonMaterial)) return;
  if (material.transparent && material.blending === THREE.AdditiveBlending) return;
  patched.add(material);
  material.fog = false;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.call(material, shader, r);
    Object.assign(shader.uniforms, look);
    if (look.uHeightMap) shader.defines = { ...(shader.defines || {}), NIGHT_TERRAIN: '' };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintW; varying vec3 vPaintN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 pw = vec4(transformed, 1.0); vec3 pn = objectNormal;
          #ifdef USE_INSTANCING
            pw = instanceMatrix * pw; pn = mat3(instanceMatrix) * pn;
          #endif
          vPaintW = (modelMatrix * pw).xyz; vPaintN = normalize(mat3(modelMatrix) * pn);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintW; varying vec3 vPaintN;\n' + LOOK_GLSL)
      .replace('#include <opaque_fragment>', `{
          vec3 pb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
          vec3 pn = normalize(vPaintN); if (!gl_FrontFacing) pn = -pn;
          float st = fbm(vec2((vPaintW.x + vPaintW.z) * 0.9, vPaintW.y * 4.2));
          vec3 pc = paintShade(pb, pn, vPaintW, st, vPaintW.y - groundAt(vPaintW.xz));
          outgoingLight = toLinear(paintFog(pc, vPaintW, 1.0)) + totalEmissiveRadiance * 0.8;
        }
        #include <opaque_fragment>`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => 'paint|' + (key ? key() : '');
  material.needsUpdate = true;
}

// Пройтись по объекту и «перерисовать» все подходящие материалы
export function paintObject(object, look) {
  object.traverse((o) => {
    if (!o.isMesh || o.userData.noPaint) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) paintPatch(m, look);
  });
}
