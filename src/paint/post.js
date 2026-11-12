// post.js — «кисть и тушь» поверх кадра игры (из прототипа experiments/painted/post.js):
//   1) кадр рисуется в текстуру (в линейных цветах), отдельно — нормали и глубина без неба, спрайтов и прозрачного;
//   2) фильтр Кувахары превращает пиксели в плоские мазки, сохраняя края;
//   3) контуры по скачкам нормалей и глубины: толщина плавает, линия дрожит и местами рвётся;
//   4) перевод в sRGB, зерно бумаги и виньетка.
// Листва и всё с alphaTest-картой пишут в нормали чёрный «маркер» — обводится только силуэт кроны, а не каждый лист.
import * as THREE from 'three';
import { NOISE } from './paint.js';

export function createPainter(renderer, { radius = 3, scale = 1 } = {}) {
  const size = new THREE.Vector2();
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
  const normalRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const normalInst = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const normalReal = new THREE.MeshNormalMaterial({ opacity: 0 });   // альфа 0 — «здесь без мазков»
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

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    defines: { RADIUS: radius },
    uniforms: {
      tColor: { value: colorRT.texture }, tNormal: { value: normalRT.texture }, tDepth: { value: normalRT.depthTexture },
      uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 600 },
      uPaint: { value: 1 }, uEdges: { value: 1 }, uLine: { value: 1.4 }, uInk: { value: new THREE.Color(0.08, 0.06, 0.2) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor, tNormal, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uPaint, uEdges, uLine; uniform vec3 uInk;
      varying vec2 vUv;
      ${NOISE}
      float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
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
        float real = 1.0 - texture2D(tNormal, vUv).a;             // героиня: чёткий кадр без мазков
        vec3 col = uPaint > 0.5 && real < 0.5 ? kuwahara(vUv, px) : tap(vUv);

        float w = uLine * (0.5 + 1.3 * vnoise(sp / 80.0));
        vec2 c = vUv + (vec2(vnoise(sp / 19.0), vnoise(sp / 19.0 + 31.0)) - 0.5) * 1.8 * px;
        vec3 nC = texture2D(tNormal, c).rgb;
        float leaf = step(length(nC), 0.05);
        vec2 dx = vec2(w * px.x, 0.0), dy = vec2(0.0, w * px.y);
        vec3 nL = texture2D(tNormal, c - dx).rgb, nR = texture2D(tNormal, c + dx).rgb;
        vec3 nD = texture2D(tNormal, c - dy).rgb, nU = texture2D(tNormal, c + dy).rgb;
        float zC = lin(texture2D(tDepth, c).r);
        float zL = lin(texture2D(tDepth, c - dx).r), zR = lin(texture2D(tDepth, c + dx).r);
        float zD = lin(texture2D(tDepth, c - dy).r), zU = lin(texture2D(tDepth, c + dy).r);
        float dn = length(nL - nR) + length(nU - nD);
        // скачок глубины: вторая производная 1/z — у ровной плоскости под любым углом она ноль, поэтому
        // мостовая и стены вдали не покрываются ложными линиями-рябью
        float iC = 1.0 / zC;
        float dz = (abs(1.0 / zL + 1.0 / zR - 2.0 * iC) + abs(1.0 / zU + 1.0 / zD - 2.0 * iC)) / iC;
        float e = max(smoothstep(0.45, 0.95, dn) * (1.0 - real), smoothstep(0.04, 0.12, dz) * mix(1.0, 0.6, real));   // на героине — только силуэт
        e *= (1.0 - leaf) * (1.0 - 0.85 * smoothstep(14.0, 70.0, zC)) * uEdges;
        e *= mix(0.55, 1.0, smoothstep(0.25, 0.5, vnoise(sp / 7.0 + 5.0)));
        vec3 ink = mix(col * vec3(0.35, 0.3, 0.55), uInk, 0.5);
        col = mix(col, ink, e);

        float grain = hash(floor(sp)) * 0.05 + vnoise(sp / 2.5) * 0.04 + vnoise(vec2(sp.x / 70.0, sp.y / 5.0)) * 0.03;
        col *= 0.95 + grain;
        vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q) * 0.6;
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
  }
  const swap = [], hidden = [];
  const skip = (m) => m.transparent || m.depthWrite === false || m.visible === false || m.blending === THREE.AdditiveBlending;
  function render(scene, camera) {
    U.uNear.value = camera.near; U.uFar.value = camera.far;
    // нормали и глубина: без неба, спрайтов, огоньков и прозрачного; листва — «маркером»
    const mask = camera.layers.mask;
    camera.layers.set(0);
    scene.traverseVisible((o) => {
      if (o.isMesh) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (skip(m)) { hidden.push(o); return; }
        swap.push([o, o.material]);
        o.material = o.userData.realistic ? normalReal : o.userData.leafMap ? leafNormal(o.userData.leafMap)
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
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
  function setRadius(r) { quad.material.defines.RADIUS = r; quad.material.needsUpdate = true; }
  function setScale(s) { curScale = s; setSize(); }
  return { render, setSize, uniforms: U, setRadius, setScale, get radius() { return quad.material.defines.RADIUS; } };
}
