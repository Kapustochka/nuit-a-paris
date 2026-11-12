// main.js — фрагмент улицы Монмартра в рисованном стиле: два ряда домов на склоне,
// фонари, платан, цветы на окнах, Сакре-Кёр в дымке. Переключатели показывают вклад каждого слоя.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHouse, mulberry } from './houses.js';
import { createLook, paintMaterial, MAX_LIGHTS } from './paint-material.js';
import { createPainter } from './post.js';
import { leafTexture, railTexture, signTexture, foliage, street, lamp, tree, sky, sacreCard, glow } from './props.js';

THREE.ColorManagement.enabled = false;            // рисуем прямо в цветах картинки
const phone = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(phone ? 62 : 50, innerWidth / innerHeight, 0.1, 600);
const look = createLook();
const SLOPE = 0.07, yAt = (x) => x * SLOPE;

// ── дома ───────────────────────────────────────────────
const P = {
  peach: [0.96, 0.79, 0.67], cream: [0.95, 0.88, 0.74], rose: [0.93, 0.74, 0.71], butter: [0.97, 0.86, 0.62], grey: [0.82, 0.83, 0.88], sage: [0.8, 0.85, 0.76],
};
const SH = { blue: [0.36, 0.46, 0.64], green: [0.4, 0.56, 0.5], red: [0.6, 0.24, 0.28], cream: [0.88, 0.84, 0.74] };
const north = [
  { w: 6.4, floors: 4, wall: P.cream, shutter: SH.green, chimneys: [1.2, 5.0] },
  { w: 7.6, floors: 5, wall: P.peach, shutter: SH.blue, balconyFloor: 2, sign: ['Boulangerie', '#2f4a3e'], shopColor: [0.24, 0.36, 0.32], awning: [0.62, 0.2, 0.28], chimneys: [6.4] },
  { w: 5.6, floors: 4, wall: P.rose, shutter: SH.cream, chimneys: [2.8], ivy: [[0.25, 2.4, 0.12, 0.75], [0.3, 3.6, 0.12, 0.85], [0.5, 4.9, 0.15, 0.8], [1.1, 5.6, 0.16, 0.7]] },
  { w: 8.2, floors: 5, wall: P.butter, shutter: SH.red, balconyFloor: 1, sign: ['Café des Artistes', '#5b2230'], shopColor: [0.42, 0.16, 0.22], awning: [0.28, 0.36, 0.5], chimneys: [1.4, 6.8] },
  { w: 6.0, floors: 4, wall: P.grey, shutter: SH.blue, chimneys: [3.0] },
  { w: 7.0, floors: 3, wall: P.peach, shutter: SH.green, chimneys: [1.0] },
];
const south = [
  { w: 7.2, floors: 4, wall: P.sage, shutter: SH.red, chimneys: [3.6] },
  { w: 6.6, floors: 5, wall: P.cream, shutter: SH.blue, balconyFloor: 2, sign: ['Fleurs', '#3b3360'], shopColor: [0.3, 0.27, 0.48], awning: [0.32, 0.5, 0.42], chimneys: [1.2, 5.4] },
  { w: 8.0, floors: 4, wall: P.rose, shutter: SH.green, chimneys: [4.0] },
  { w: 6.2, floors: 5, wall: P.butter, shutter: SH.blue, chimneys: [3.1] },
  { w: 7.4, floors: 4, wall: P.peach, shutter: SH.cream, chimneys: [2.0] },
];
const houseGeos = [], railGeos = [], signs = [], planters = [], ivyClusters = [], shops = [];
const rnd = mulberry(5);
function place(list, x0, side, seed) {
  let x = x0;
  list.forEach((spec, i) => {
    const o = { d: 9, trim: [0.94, 0.9, 0.82], stone: [0.78, 0.74, 0.7], roof: [0.4, 0.43, 0.6], chimney: [0.74, 0.5, 0.42], shutters: true, seed: seed + i * 7, ...spec };
    o.dormerSkip = Math.floor(rnd() * 4);
    if (!o.shopColor) o.shopColor = o.wall.map((v) => v * 0.85);
    const h = buildHouse(o);
    const base = yAt(x + o.w * (side > 0 ? 0.7 : 0.3)) - 0.05, zFront = side > 0 ? -4.6 : 4.6;
    const toWorld = side > 0 ? ([px, py, pz]) => [x + px, base + py, zFront + pz] : ([px, py, pz]) => [x + o.w - px, base + py, zFront - pz];
    for (const [B, list2] of [[h.B, houseGeos], [h.rails, railGeos]]) { if (!B.pos.length) continue; B.transform(toWorld); list2.push(B.geometry(base)); }
    if (h.sign.pos.length) { h.sign.transform(toWorld); signs.push([h.sign.geometry(base, 0), o.sign]); }
    for (const [px, py, pz, w] of h.planters) planters.push([...toWorld([px, py, pz]), w]);
    for (const [px, py, pz, r] of h.ivy) ivyClusters.push([...toWorld(h.deform([px, py, pz])), r, true]);
    if (o.awning) shops.push(toWorld([o.w / 2, 1.7, 1.2]));
    x += o.w;
  });
}
place(north, -20, 1, 11);
place(south, -24, -1, 51);

const houseMat = paintMaterial(look);
const houses = new THREE.Mesh(mergeGeometries(houseGeos), houseMat);
const rails = new THREE.Mesh(mergeGeometries(railGeos), paintMaterial(look, { map: railTexture() }));
rails.layers.set(1);
scene.add(houses, rails);
for (const [geo, [text, bg]] of signs) scene.add(new THREE.Mesh(geo, paintMaterial(look, { map: signTexture(text, bg) })));

// ── улица, фонари, дерево, цветы ──────────────────────
const S = street(SLOPE, -30, 42);
const lamps = [];
for (const [x, z] of [[-9, -3.3], [7, -3.3], [23, -3.3], [-1, 3.3], [15, 3.3]]) lamps.push(lamp(S, x, yAt(x) + 0.15, z));
const crowns = tree(S, -5, yAt(-5) + 0.15, 3.85, mulberry(9));
const groundGeo = S.geometry(0, Math.PI / 4);
{ const pos = groundGeo.attributes.position, b = groundGeo.attributes.aBase; for (let i = 0; i < b.count; i++) b.setX(i, pos.getY(i) - 3); }
const ground = new THREE.Mesh(groundGeo, houseMat);
scene.add(ground);
// у каждой точки листвы в aBase — «земля» кроны; у мостовой — высота склона
const leafTex = leafTexture(3), flowerTex = leafTexture(8, true);
const leafMat = paintMaterial(look, { map: leafTex }), flowerMat = paintMaterial(look, { map: flowerTex });
const crown = new THREE.Mesh(foliage(crowns, [0.46, 0.62, 0.42], 4), leafMat);
const ivy = new THREE.Mesh(foliage(ivyClusters, [0.38, 0.55, 0.36], 6), leafMat);
const planterGreen = new THREE.Mesh(foliage(planters.map(([x, y, z, w]) => [x, y + 0.08, z, 0.22 + w * 0.12]), [0.42, 0.6, 0.4], 7), leafMat);
const planterFlowers = new THREE.Mesh(foliage(planters.map(([x, y, z, w]) => [x, y + 0.16, z, 0.18 + w * 0.1]), [0.95, 0.5, 0.55], 8), flowerMat);
for (const [m, map] of [[crown, leafTex], [ivy, leafTex], [planterGreen, leafTex], [planterFlowers, flowerTex]]) { m.userData.leafMap = map; scene.add(m); }

// тёплые источники для шейдера и ореолы
lamps.slice(0, MAX_LIGHTS).forEach(([x, y, z], i) => {
  look.uLightPos.value[i].set(x, y, z, 10.5);
  const s = glow(0xffb866, 2.4); s.position.set(x, y, z); scene.add(s);
});
shops.slice(0, MAX_LIGHTS - lamps.length).forEach(([x, y, z], i) => look.uLightPos.value[lamps.length + i].set(x, y, z, 5.5));

const skyMesh = sky(look); scene.add(skyMesh);
const sacre = sacreCard(); sacre.position.set(150, yAt(150) + 22, -4); sacre.scale.setScalar(1.1); sacre.rotation.y = -Math.PI / 2; scene.add(sacre);

// ── режимы картины ────────────────────────────────────
const MODES = {
  night: {
    key: [0.45, 0.75, 0.5], keyCol: [0.44, 0.46, 0.74], shade: [0.18, 0.16, 0.38], sky: [0.32, 0.33, 0.66], fog: [0.15, 0.13, 0.31], fogRange: [22, 90], windows: 0.62,
    lamp: [1.0, 0.64, 0.3], shop: [0.95, 0.55, 0.28],
    top: [0.05, 0.06, 0.2], mid: [0.17, 0.14, 0.38], horizon: [0.5, 0.33, 0.5], cloud: [0.26, 0.22, 0.46], cloudLit: [0.62, 0.55, 0.78], stars: 1, ink: [0.08, 0.06, 0.2],
  },
  dusk: {
    key: [-0.72, 0.42, 0.55], keyCol: [1.08, 0.86, 0.72], shade: [0.5, 0.42, 0.73], sky: [0.62, 0.56, 0.86], fog: [0.78, 0.6, 0.72], fogRange: [20, 95], windows: 0.3,
    lamp: [0.6, 0.38, 0.18], shop: [0.55, 0.32, 0.16],
    top: [0.22, 0.27, 0.58], mid: [0.55, 0.47, 0.72], horizon: [1.0, 0.7, 0.56], cloud: [0.72, 0.5, 0.66], cloudLit: [1.0, 0.8, 0.66], stars: 0, ink: [0.16, 0.1, 0.26],
  },
};
let mode = 'night';
function setMode(name) {
  mode = name; const m = MODES[name], U = skyMesh.material.uniforms;
  look.uKeyDir.value.set(...m.key).normalize();
  look.uKeyCol.value.setRGB(...m.keyCol); look.uShadeCol.value.setRGB(...m.shade); look.uSkyCol.value.setRGB(...m.sky);
  look.uFogCol.value.setRGB(...m.fog); look.uFog.value.set(...m.fogRange); look.uWindowsOn.value = m.windows;
  look.uLightCol.value.forEach((c, i) => i < lamps.length ? c.setRGB(...m.lamp) : i < lamps.length + shops.length ? c.setRGB(...m.shop) : c.setRGB(0, 0, 0));
  U.uTop.value.setRGB(...m.top); U.uMid.value.setRGB(...m.mid); U.uHorizon.value.setRGB(...m.horizon);
  U.uCloud.value.setRGB(...m.cloud); U.uCloudLit.value.setRGB(...m.cloudLit); U.uStars.value = m.stars;
  painter.uniforms.uInk.value.setRGB(...m.ink);
  sacre.material.color.setRGB(...m.fog.map((v, i) => v * 0.5 + [0.8, 0.75, 0.85][i] * 0.5));
}

// ── «обычный 3D» для сравнения: те же формы, стандартный свет без живописи ──
const plain = new Map();
const lights = new THREE.Group();
lights.add(new THREE.HemisphereLight(0x8a90c8, 0x403850, 1.3));
const moonLight = new THREE.DirectionalLight(0xb8c0ff, 1.0); moonLight.position.set(20, 40, 25); lights.add(moonLight);
for (const [x, y, z] of lamps) { const l = new THREE.PointLight(0xffa860, 14, 14, 1.6); l.position.set(x, y, z); lights.add(l); }
let compare = false;
function setCompare(on) {
  compare = on;
  scene.traverse((o) => {
    if (!o.isMesh || o === skyMesh || o === sacre) return;
    if (!plain.has(o)) plain.set(o, [o.material, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: o.material.uniforms?.uMap?.value || null, alphaTest: o.material.uniforms?.uMap ? 0.5 : 0 })]);
    o.material = plain.get(o)[on ? 1 : 0];
  });
  if (on) scene.add(lights); else scene.remove(lights);
  scene.fog = on ? new THREE.Fog(0x332c55, 20, 90) : null;
}

// ── камера и кадр ──────────────────────────────────────
const painter = createPainter(renderer, { radius: phone ? 2 : 3 });
painter.setSize();
camera.position.set(-10, yAt(-10) + 1.8, 1.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(3, yAt(3) + 3.6, -2.6);
controls.enableDamping = true; controls.maxPolarAngle = 1.65; controls.minDistance = 1.5; controls.maxDistance = 48;
controls.update();
setMode('night');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); painter.setSize();
});
const toggle = (id, fn) => document.getElementById(id)?.addEventListener('click', (e) => fn(e.currentTarget));
toggle('mode', (b) => { setMode(mode === 'night' ? 'dusk' : 'night'); b.textContent = mode === 'night' ? 'Ночь' : 'Сумерки'; });
toggle('edges', (b) => { const u = painter.uniforms.uEdges; u.value = 1 - u.value; b.classList.toggle('off', !u.value); });
toggle('paint', (b) => { const u = painter.uniforms.uPaint; u.value = 1 - u.value; b.classList.toggle('off', !u.value); });
toggle('compare', (b) => { setCompare(!compare); b.classList.toggle('on', compare); });

let frames = 0, last = performance.now(), fps = 0;
renderer.setAnimationLoop(() => {
  controls.update();
  if (compare) { renderer.setRenderTarget(null); renderer.setClearColor(0x14103a); renderer.render(scene, camera); } else painter.render(scene, camera);
  frames++; const now = performance.now(); if (now - last > 1000) { fps = frames * 1000 / (now - last); frames = 0; last = now; }
});
window.__painted = { renderer, camera, controls, setMode, setCompare, painter, get fps() { return fps; }, stats: () => ({ tris: houses.geometry.attributes.position.count / 3 }) };
