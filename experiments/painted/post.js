// post.js — «кисть и тушь» поверх кадра:
//   1) кадр рисуется в текстуру; отдельно — нормали и глубина (без неба, перил и спрайтов);
//   2) фильтр Кувахары превращает пиксели в плоские мазки, сохраняя края;
//   3) контуры по скачкам нормалей и глубины: толщина плавает, линия чуть дрожит и рвётся,
//      цвет — тёмный индиго, смешанный с цветом под линией (как цветные контуры в аниме);
//   4) зерно бумаги и виньетка.
import * as THREE from 'three';
import { NOISE } from './paint-material.js';

export function createPainter(renderer, { radius = 3, scale = 1 } = {}) {
  const size = new THREE.Vector2();
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  const normalRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const leafNormal = (map) => new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map } }, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; void main() { if (texture2D(uMap, vUv).a < 0.5) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    defines: { RADIUS: radius },
    uniforms: {
      tColor: { value: colorRT.texture }, tNormal: { value: normalRT.texture }, tDepth: { value: normalRT.depthTexture },
      uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 600 },
      uPaint: { value: 1 }, uEdges: { value: 1 }, uLine: { value: 1.4 }, uInk: { value: new THREE.Color(0.1, 0.07, 0.22) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor, tNormal, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uPaint, uEdges, uLine; uniform vec3 uInk;
      varying vec2 vUv;
      ${NOISE}
      float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      vec3 kuwahara(vec2 uv, vec2 px) {
        vec3 m[4]; vec3 s[4];
        for (int k = 0; k < 4; k++) { m[k] = vec3(0); s[k] = vec3(0); }
        for (int j = -RADIUS; j <= RADIUS; j++) for (int i = -RADIUS; i <= RADIUS; i++) {
          vec3 c = texture2D(tColor, uv + vec2(i, j) * px).rgb, c2 = c * c;
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
        vec3 col = uPaint > 0.5 ? kuwahara(vUv, px) : texture2D(tColor, vUv).rgb;

        // тушь: толщина и дрожание меняются вдоль линии
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
        float dz = (abs(zL - zR) + abs(zU - zD)) / max(zC, 0.1);
        float e = max(smoothstep(0.45, 0.95, dn), smoothstep(0.035, 0.11, dz));
        e *= (1.0 - leaf) * (1.0 - 0.85 * smoothstep(14.0, 55.0, zC)) * uEdges;
        e *= mix(0.55, 1.0, smoothstep(0.25, 0.5, vnoise(sp / 7.0 + 5.0)));   // сухая кисть: линия местами рвётся
        vec3 ink = mix(col * vec3(0.35, 0.3, 0.55), uInk, 0.5);
        col = mix(col, ink, e);

        // бумага: зерно, волокна, виньетка
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

  function setSize() {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.round(size.x * scale)), h = Math.max(1, Math.round(size.y * scale));
    colorRT.setSize(w, h); normalRT.setSize(w, h); U.uRes.value.set(w, h);
  }
  const swap = [];
  function render(scene, camera) {
    U.uNear.value = camera.near; U.uFar.value = camera.far;
    // нормали и глубина: только слой 0, у листвы — свой «маркер», чтобы не обводить каждый лист
    camera.layers.set(0);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      swap.push([o, o.material]);
      o.material = o.userData.leafMap ? (o.userData.normalMat ||= leafNormal(o.userData.leafMap)) : normalMat;
    });
    renderer.setRenderTarget(normalRT); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, camera);
    for (const [o, m] of swap) o.material = m;
    swap.length = 0;
    camera.layers.enableAll();
    renderer.setRenderTarget(colorRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
  function setRadius(r) { quad.material.defines.RADIUS = r; quad.material.needsUpdate = true; }
  return { render, setSize, uniforms: U, setRadius };
}
