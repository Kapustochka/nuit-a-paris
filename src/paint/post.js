// post.js — «кисть и тушь» поверх кадра игры (из прототипа experiments/painted/post.js):
//   1) кадр рисуется в текстуру (в линейных цветах), отдельно — нормали и глубина без неба, спрайтов и прозрачного;
//   2) фильтр Кувахары превращает пиксели в плоские мазки, сохраняя края;
//   3) контуры по скачкам нормалей и глубины: толщина плавает, линия дрожит и местами рвётся;
//   4) воздух (paint/air.js): дымка по высоте, конусы света под фонарями, сияние Сакре-Кёр;
//   5) свечение (bloom): яркое — фонари, окна, луна — размывается в маленьких текстурах и ложится поверх;
//   6) бумага: едва заметные волокна и зерно листа, мягкая виньетка.
// Листва и всё с alphaTest-картой пишут в нормали чёрный «маркер» — обводится только силуэт кроны, а не каждый лист.
import * as THREE from 'three';
import { NOISE } from './paint.js';
import { AIR_GLSL, airUniforms, MAX_SHAFTS } from './air.js';

export function createPainter(renderer, { radius = 3, scale = 1, heroStyle = 1, shafts = 8, shaftSteps = 8, bloom = 2 } = {}) {
  const size = new THREE.Vector2(), cssSize = new THREE.Vector2();
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
  const normalRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const normalInst = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  // OPAQUE в MeshNormalMaterial принудительно пишет alpha=1, даже при opacity=0.
  // Transparent отключает OPAQUE, а NoBlending сохраняет alpha=0 и запись глубины.
  const normalLegacy = new THREE.MeshNormalMaterial({ opacity: 0 });
  const normalReal = new THREE.MeshNormalMaterial({ opacity: 0, transparent: true,
    blending: THREE.NoBlending, side: THREE.DoubleSide, forceSinglePass: true });
  const leafMats = new Map();
  const leafNormal = (map) => {
    if (!leafMats.has(map)) leafMats.set(map, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map } }, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; void main() { if (texture2D(uMap, vUv).a < 0.5) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
    }));
    return leafMats.get(map);
  };

  // ── Свечение: яркие места кадра → 1/4 и 1/8 размера → размытие по двум осям ──
  let bloomLevels = bloom;                               // 2 — широкое и узкое, 1 — только узкое (телефон), 0 — нет
  const bloomRT = [0, 1, 2, 3].map(() => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }));
  const fsVert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: colorRT.texture }, uPx: { value: new THREE.Vector2() }, uThreshold: { value: 0.66 } },
    vertexShader: fsVert, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor; uniform vec2 uPx; uniform float uThreshold; varying vec2 vUv;
      vec3 tap(vec2 o) { return pow(clamp(texture2D(tColor, vUv + o * uPx).rgb, 0.0, 1.0), vec3(1.0 / 2.2)); }
      void main() {
        vec3 c = (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25;
        float l = max(c.r, max(c.g, c.b));                 // тёплый свет ярок в красном, а не в «серой» яркости
        gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, l), 1.0);
      }`,
  });
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: fsVert, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
      void main() {                                        // 9 точек Гаусса за 5 выборок (между пикселями)
        vec3 c = texture2D(tMap, vUv).rgb * 0.227;
        c += (texture2D(tMap, vUv + uDir * 1.385).rgb + texture2D(tMap, vUv - uDir * 1.385).rgb) * 0.316;
        c += (texture2D(tMap, vUv + uDir * 3.231).rgb + texture2D(tMap, vUv - uDir * 3.231).rgb) * 0.0703;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), brightMat);
  const fsScene = new THREE.Scene(); fsScene.add(fsQuad);
  function pass(material, target) { fsQuad.material = material; renderer.setRenderTarget(target); renderer.render(fsScene, postCam); }
  function blur(src, tmp, spread) {                      // src → tmp (по горизонтали) → src (по вертикали)
    blurMat.uniforms.tMap.value = src.texture; blurMat.uniforms.uDir.value.set(spread / src.width, 0); pass(blurMat, tmp);
    blurMat.uniforms.tMap.value = tmp.texture; blurMat.uniforms.uDir.value.set(0, spread / src.height); pass(blurMat, src);
  }
  function renderBloom() {
    if (!bloomLevels || U.uBloom.value <= 0) return;
    brightMat.uniforms.tColor.value = colorRT.texture; brightMat.uniforms.uPx.value.set(1 / colorRT.width, 1 / colorRT.height);
    pass(brightMat, bloomRT[0]); blur(bloomRT[0], bloomRT[1], 1);
    if (bloomLevels > 1) {
      blurMat.uniforms.tMap.value = bloomRT[0].texture; blurMat.uniforms.uDir.value.set(0, 0); pass(blurMat, bloomRT[2]);
      blur(bloomRT[2], bloomRT[3], 1.6);
    }
  }

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    defines: { RADIUS: radius, BLOOM: bloom, SHAFTS: Math.min(shafts, MAX_SHAFTS), SHAFT_STEPS: shaftSteps },
    uniforms: {
      tColor: { value: colorRT.texture }, tNormal: { value: normalRT.texture }, tDepth: { value: normalRT.depthTexture },
      uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 600 },
      uCssRes: { value: new THREE.Vector2(1, 1) }, uHeroLine: { value: 0.65 }, uHeroStyle: { value: heroStyle },
      ...airUniforms(),
      tBloom: { value: bloomRT[0].texture }, tBloomWide: { value: bloomRT[2].texture }, uBloom: { value: 1 },
      uPaper: { value: 1 }, uVignette: { value: 1 },
      uPaint: { value: 1 }, uEdges: { value: 1 }, uLine: { value: 1.4 }, uInk: { value: new THREE.Color(0.08, 0.06, 0.2) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor, tNormal, tDepth, tBloom, tBloomWide; uniform float uBloom, uPaper, uVignette; uniform vec2 uRes, uCssRes; uniform float uNear, uFar, uPaint, uEdges, uLine, uHeroLine, uHeroStyle; uniform vec3 uInk;
      varying vec2 vUv;
      ${NOISE}
      float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      ${AIR_GLSL}
      vec3 srgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
      vec3 tap(vec2 uv) { return srgb(texture2D(tColor, uv).rgb); }
      vec3 kuwahara(vec2 uv, vec2 px) {
        vec3 m[4]; vec3 s[4];
        for (int k = 0; k < 4; k++) { m[k] = vec3(0); s[k] = vec3(0); }
        for (int j = -RADIUS; j <= RADIUS; j++) for (int i = -RADIUS; i <= RADIUS; i++) {
          vec3 c = tap(uv + vec2(i, j) * px), c2 = c * c;
          if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
          if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
          if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
          if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
        }
        float n = float((RADIUS + 1) * (RADIUS + 1)), best = 1e9; vec3 res = vec3(0);
        for (int k = 0; k < 4; k++) {
          vec3 mean = m[k] / n, v = abs(s[k] / n - mean * mean);
          float sig = v.r + v.g + v.b;
          if (sig < best) { best = sig; res = mean; }
        }
        return res;
      }
      void main() {
        vec2 px = 1.0 / uRes, sp = vUv * uRes;
        vec4 center = texture2D(tNormal, vUv);
        float real = 1.0 - center.a;                           // героиня: чёткий кадр без мазков
        vec3 col = uPaint > 0.5 && real < 0.5 ? kuwahara(vUv, px) : tap(vUv);

        float w = uLine * (0.5 + 1.3 * vnoise(sp / 80.0));
        vec2 c = vUv + (vec2(vnoise(sp / 19.0), vnoise(sp / 19.0 + 31.0)) - 0.5) * 1.8 * px;
        vec3 nC = texture2D(tNormal, c).rgb;
        vec2 dx = vec2(w * px.x, 0.0), dy = vec2(0.0, w * px.y);
        vec4 left = texture2D(tNormal, c - dx), right = texture2D(tNormal, c + dx);
        vec4 down = texture2D(tNormal, c - dy), up = texture2D(tNormal, c + dy);
        // Используем уже прочитанные маркеры: тонкая линия с обеих сторон силуэта, без новых texture taps.
        float hero = step(0.05, max(real, 1.0 - min(min(left.a, right.a), min(down.a, up.a)))) * uHeroStyle;
        float heroWidth = max(0.6, uHeroLine * uRes.x / uCssRes.x);
        w = mix(w, heroWidth, hero);
        c = mix(c, vUv, hero);                                 // на героине — ровный контур без дрожания туши
        nC = mix(nC, center.rgb, hero);
        float leaf = step(length(nC), 0.05);
        dx = vec2(w * px.x, 0.0); dy = vec2(0.0, w * px.y);
        float zC = lin(texture2D(tDepth, c).r);
        float zL = lin(texture2D(tDepth, c - dx).r), zR = lin(texture2D(tDepth, c + dx).r);
        float zD = lin(texture2D(tDepth, c - dy).r), zU = lin(texture2D(tDepth, c + dy).r);
        float dn = length(left.rgb - right.rgb) + length(up.rgb - down.rgb);
        // скачок глубины: вторая производная 1/z — у ровной плоскости под любым углом она ноль, поэтому
        // мостовая и стены вдали не покрываются ложными линиями-рябью
        float iC = 1.0 / zC;
        float dz = (abs(1.0 / zL + 1.0 / zR - 2.0 * iC) + abs(1.0 / zU + 1.0 / zD - 2.0 * iC)) / iC;
        float e = max(smoothstep(0.45, 0.95, dn) * (1.0 - max(real, hero)), smoothstep(0.04, 0.12, dz) * mix(mix(1.0, 0.6, real), 0.42, hero));
        e *= (1.0 - leaf) * (1.0 - 0.85 * smoothstep(14.0, 70.0, zC)) * uEdges;
        e *= mix(mix(0.55, 1.0, smoothstep(0.25, 0.5, vnoise(sp / 7.0 + 5.0))), 1.0, hero);
        vec3 ink = mix(col * vec3(0.35, 0.3, 0.55), uInk, 0.5);
        ink = mix(ink, col * vec3(0.45, 0.43, 0.55), hero);
        col = mix(col, ink, e);
        // далёкие огни — окна Парижа под холмом, Эйфелева башня, звёзды — мельче мазка: фильтр их стирает,
        // а дымка гасит. Берём их из исходного кадра и возвращаем поверх дымки.
        float dRaw = texture2D(tDepth, vUv).r;
        vec3 raw = tap(vUv);
        vec3 farLights = raw * smoothstep(0.42, 0.7, max(raw.r, max(raw.g, raw.b))) * step(260.0, lin(dRaw)) * (1.0 - real);
        col = air(col, vUv, dRaw, sp);
        col = max(col, farLights * 0.85);

        #if BLOOM > 0
          vec3 glowB = texture2D(tBloom, vUv).rgb * 0.5;
          #if BLOOM > 1
            glowB += texture2D(tBloomWide, vUv).rgb * 0.6;
          #endif
          col = 1.0 - (1.0 - col) * (1.0 - min(glowB * uBloom, 1.0));   // «экран»: свет добавляется, но не выгорает
        #endif

        // бумага: лист один на весь экран и не зависит от плотности пикселей
        vec2 pp = vUv * uCssRes;
        float fibre = vnoise(vec2(pp.x / 46.0, pp.y / 3.2) + 3.0) * 0.6 + vnoise(vec2(pp.x / 4.0, pp.y / 61.0) + 11.0) * 0.4;
        float tooth = vnoise(pp / 1.6) * 0.55 + hash(floor(pp * 1.5)) * 0.45;
        float sheet = fbm(pp / 190.0);
        float paper = (fibre - 0.5) * 0.05 + (tooth - 0.5) * 0.075 + (sheet - 0.5) * 0.05;
        float keep = real * uHeroStyle;                          // на героине бумаги почти нет
        col *= 1.0 + paper * uPaper * (1.0 - 0.7 * keep);
        col += vec3(0.05, 0.04, 0.03) * max(tooth - 0.62, 0.0) * uPaper * (1.0 - keep);   // светлые ворсинки листа
        // виньетка уводит углы в фиолетовую тень, а не в чёрный
        vec2 q = vUv - 0.5; float vg = smoothstep(0.18, 0.85, dot(q, q) * 1.9) * uVignette;
        col = mix(col, col * vec3(0.5, 0.46, 0.66), vg * 0.75);
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  }));
  const postScene = new THREE.Scene(); postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const U = quad.material.uniforms;

  let curScale = scale;
  function setSize() {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.round(size.x * curScale)), h = Math.max(1, Math.round(size.y * curScale));
    colorRT.setSize(w, h); normalRT.setSize(w, h); U.uRes.value.set(w, h);
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    bloomRT[0].setSize(bw, bh); bloomRT[1].setSize(bw, bh);
    bloomRT[2].setSize(Math.max(1, bw >> 1), Math.max(1, bh >> 1)); bloomRT[3].setSize(Math.max(1, bw >> 1), Math.max(1, bh >> 1));
    renderer.getSize(cssSize); U.uCssRes.value.copy(cssSize);
  }
  const swap = [], hidden = [];
  const skip = (m) => m.transparent || m.depthWrite === false || m.visible === false || m.blending === THREE.AdditiveBlending;
  function render(scene, camera) {
    U.uNear.value = camera.near; U.uFar.value = camera.far;
    U.uProjInv.value.copy(camera.projectionMatrixInverse); U.uCamWorld.value.copy(camera.matrixWorld);
    U.uTime.value = performance.now() / 1000 % 3600;
    if (airSrc) U.uGroundY.value = airSrc.groundY;
    // нормали и глубина: без неба, спрайтов, огоньков и прозрачного; листва — «маркером»
    const mask = camera.layers.mask;
    camera.layers.set(0);
    scene.traverseVisible((o) => {
      if (o.isMesh) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (skip(m)) { hidden.push(o); return; }
        swap.push([o, o.material]);
        o.material = o.userData.realistic ? (U.uHeroStyle.value > 0.5 ? normalReal : normalLegacy) : o.userData.leafMap ? leafNormal(o.userData.leafMap)
          : m.alphaTest > 0 && m.map ? leafNormal(m.map)
          : o.isInstancedMesh ? normalInst : normalMat;
      } else if (o.isPoints || o.isSprite || o.isLine) hidden.push(o);
    });
    for (const o of hidden) o.visible = false;
    const bg = scene.background; scene.background = null;
    renderer.setRenderTarget(normalRT); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, camera);
    for (const [o, m] of swap) o.material = m;
    for (const o of hidden) o.visible = true;
    swap.length = 0; hidden.length = 0;
    scene.background = bg;
    camera.layers.mask = mask;
    camera.layers.enableAll();
    renderer.setRenderTarget(colorRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
    renderBloom();
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
  function setRadius(r) { quad.material.defines.RADIUS = r; quad.material.needsUpdate = true; }
  function setScale(s) { curScale = s; setSize(); }
  function setBloom(levels) { bloomLevels = levels; quad.material.defines.BLOOM = levels; quad.material.needsUpdate = true; }
  // воздух: world.air даёт фонари для лучей, маяк-базилику и высоту земли под героиней
  let airSrc = null;
  function setAir(air) { airSrc = air; U.uShaftPos.value = air.shaftPos; U.uBeacon.value = air.beacon; if (air.tower) U.uTower.value = air.tower; }
  function setShafts(n, steps = n) { quad.material.defines.SHAFTS = Math.min(n, MAX_SHAFTS); quad.material.defines.SHAFT_STEPS = steps; quad.material.needsUpdate = true; }
  return { render, setSize, uniforms: U, setRadius, setScale, setAir, setShafts, setBloom, get bloom() { return bloomLevels; }, get shafts() { return quad.material.defines.SHAFTS; }, get radius() { return quad.material.defines.RADIUS; } };
}
