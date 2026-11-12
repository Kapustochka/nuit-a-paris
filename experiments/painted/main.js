// main.js — фрагмент улицы Монмартра в рисованном стиле: два ряда домов на склоне,
// фонари, платан, цветы на окнах, Сакре-Кёр в дымке. Переключатели показывают вклад каждого слоя.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHouse, Builder, mulberry } from './houses.js';
import { createLook, paintMaterial, MAX_LIGHTS } from './paint-material.js';
import { createPainter } from './post.js';
import { leafTexture, railTexture, signTexture, foliage, street, stairs, parvis, basilicaMesh, lamp, tree, sky, glow } from './props.js';

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
// Улица поднимается по склону, затем переходит в лестницу к площади перед базиликой
const SLOPE = 0.07, STAIR0 = 62, STAIR1 = 88, STEEP = 0.42;
const yAt = (x) => x < STAIR0 ? x * SLOPE : x < STAIR1 ? STAIR0 * SLOPE + (x - STAIR0) * STEEP : STAIR0 * SLOPE + (STAIR1 - STAIR0) * STEEP;
const TOP = yAt(STAIR1);

// ── дома ───────────────────────────────────────────────
const P = {
  peach: [0.96, 0.79, 0.67], cream: [0.95, 0.88, 0.74], rose: [0.93, 0.74, 0.71], butter: [0.97, 0.86, 0.62], grey: [0.82, 0.83, 0.88], sage: [0.8, 0.85, 0.76],
  apricot: [0.97, 0.76, 0.58], lilac: [0.86, 0.8, 0.9],
};
const SH = { blue: [0.36, 0.46, 0.64], green: [0.4, 0.56, 0.5], red: [0.6, 0.24, 0.28], cream: [0.88, 0.84, 0.74], teal: [0.3, 0.52, 0.56] };
const ROOF = { mansard: [0.4, 0.43, 0.6], gable: [0.74, 0.43, 0.34], flat: [0.4, 0.43, 0.6] };
const SHOPS = [['Fromagerie', '#4a3a26', [0.36, 0.28, 0.18], [0.85, 0.66, 0.32]], ['Épicerie', '#2d4a52', [0.22, 0.36, 0.4], [0.3, 0.52, 0.44]], ['Librairie', '#3b2f5c', [0.28, 0.23, 0.45], [0.55, 0.22, 0.3]],
  ['Bistrot', '#5b2230', [0.42, 0.16, 0.22], [0.62, 0.2, 0.28]], ['Pâtisserie', '#6a3a52', [0.5, 0.28, 0.4], [0.86, 0.6, 0.66]], ['Galerie', '#22303f', [0.18, 0.24, 0.32], [0.3, 0.36, 0.5]]];
const hand = {
  north: [
    { w: 6.4, floors: 4, wall: P.cream, shutter: SH.green, chimneys: [1.2, 5.0] },
    { w: 7.6, floors: 5, wall: P.peach, shutter: SH.blue, balconyFloor: 2, sign: ['Boulangerie', '#2f4a3e'], shopColor: [0.24, 0.36, 0.32], awning: [0.62, 0.2, 0.28], chimneys: [6.4] },
    { w: 5.6, floors: 4, wall: P.rose, shutter: SH.cream, roofType: 'gable', chimneys: [2.8], ivy: true },
    { w: 8.2, floors: 5, wall: P.butter, shutter: SH.red, balconyFloor: 1, sign: ['Café des Artistes', '#5b2230'], shopColor: [0.42, 0.16, 0.22], awning: [0.28, 0.36, 0.5], chimneys: [1.4, 6.8], wisteria: true },
    { w: 6.0, floors: 4, wall: P.grey, shutter: SH.blue, roofType: 'flat', chimneys: [1.0] },
    { w: 7.0, floors: 3, wall: P.peach, shutter: SH.green, roofType: 'gable', chimneys: [1.0] },
  ],
  south: [
    { w: 7.2, floors: 4, wall: P.sage, shutter: SH.red, chimneys: [3.6] },
    { w: 6.6, floors: 5, wall: P.cream, shutter: SH.blue, balconyFloor: 2, sign: ['Fleurs', '#3b3360'], shopColor: [0.3, 0.27, 0.48], awning: [0.32, 0.5, 0.42], chimneys: [1.2, 5.4], crates: true },
    { w: 8.0, floors: 4, wall: P.rose, shutter: SH.green, roofType: 'flat', chimneys: [4.0] },
    { w: 6.2, floors: 5, wall: P.butter, shutter: SH.blue, chimneys: [3.1], wisteria: true },
    { w: 7.4, floors: 4, wall: P.peach, shutter: SH.cream, roofType: 'gable', chimneys: [2.0], ivy: true },
  ],
};
const pick = (r, a) => a[Math.floor(r() * a.length)];
function genHouse(r) {                                        // случайный, но «местный» дом
  const t = r(), roofType = t < 0.55 ? 'mansard' : t < 0.82 ? 'gable' : 'flat', w = 5.2 + r() * 3.2;
  const o = { w, floors: 3 + Math.floor(r() * 3), wall: pick(r, Object.values(P)), shutter: pick(r, Object.values(SH)), roofType, shutters: r() < 0.8,
    chimneys: [w * (0.15 + r() * 0.2), ...(r() < 0.5 ? [w * (0.7 + r() * 0.15)] : [])], ivy: r() < 0.18, wisteria: r() < 0.12 };
  if (r() < 0.35) o.balconyFloor = 1 + Math.floor(r() * 2);
  if (r() < 0.38) { const [text, bg, shopColor, awning] = pick(r, SHOPS); Object.assign(o, { sign: [text, bg], shopColor, awning, crates: text === 'Épicerie' || r() < 0.2 }); }
  return o;
}
const houseGeos = [], railGeos = [], signs = [], planters = [], climbers = [], wisteria = [], shops = [], extras = [];
const rnd = mulberry(5);
function place(list, x0, x1, side, seed) {
  let x = x0, i = 0;
  const gr = mulberry(seed * 3 + 1);
  while (x < x1) {
    const spec = list[i] || genHouse(gr);
    const o = { d: 9, trim: [0.94, 0.9, 0.82], stone: [0.78, 0.74, 0.7], roof: ROOF[spec.roofType || 'mansard'], chimney: [0.74, 0.5, 0.42], shutters: true, seed: seed + i * 7, ...spec };
    o.dormerSkip = Math.floor(rnd() * 4);
    if (!o.shopColor) o.shopColor = o.wall.map((v) => v * 0.85);
    const ya = yAt(x), yb = yAt(x + o.w), base = Math.max(ya, yb) * 0.65 + Math.min(ya, yb) * 0.35 - 0.05;
    o.plinth = 1.8 + Math.abs(yb - ya);
    if (Math.abs(yb - ya) > 1.2) { delete o.awning; delete o.sign; delete o.crates; }   // у лестницы — без витрин
    const h = buildHouse(o);
    const zFront = side > 0 ? -4.6 : 4.6;
    const toWorld = side > 0 ? ([px, py, pz]) => [x + px, base + py, zFront + pz] : ([px, py, pz]) => [x + o.w - px, base + py, zFront - pz];
    const local = (p) => toWorld(h.deform(p));
    for (const [B, out] of [[h.B, houseGeos], [h.rails, railGeos]]) { if (!B.pos.length) continue; B.transform(toWorld); out.push(B.geometry(base)); }
    if (h.sign.pos.length) { h.sign.transform(toWorld); signs.push([h.sign.geometry(base, 0), o.sign]); }
    for (const [px, py, pz, w, t] of h.planters) planters.push([...toWorld([px, py, pz]), w, t]);
    if (o.ivy) for (let k = 0; k < 6; k++) climbers.push([...local([0.3 + Math.sin(k) * 0.25, 1.2 + k * 1.15, 0.14]), 0.7 + gr() * 0.25, true]);
    if (o.wisteria) for (let px = 0.4; px < o.w - 0.3; px += 0.7) wisteria.push([...local([px, 3.75 + gr() * 0.3, 0.3]), 0.42 + gr() * 0.15, true]);
    if (o.awning) shops.push(toWorld([o.w / 2, 1.7, 1.2]));
    if (o.crates) extras.push(['crates', toWorld([0.9, 0.15, 0.7]), side], ['crates', toWorld([o.w - 0.9, 0.15, 0.7]), side]);
    else if (gr() < 0.35 && Math.abs(yb - ya) < 1.2) extras.push(['pot', toWorld([0.35, 0.15, 0.45]), side]);
    x += o.w; i++;
  }
}
place(hand.north, -20, STAIR1 + 4, 1, 11);
place(hand.south, -24, STAIR1 + 4, -1, 51);
place([], -58, -20, 1, 91);
place([], -60, -24, -1, 97);

const houseMat = paintMaterial(look);
const houses = new THREE.Mesh(mergeGeometries(houseGeos), houseMat);
const rails = new THREE.Mesh(mergeGeometries(railGeos), paintMaterial(look, { map: railTexture() }));
rails.layers.set(1);
scene.add(houses, rails);
for (const [geo, [text, bg]] of signs) scene.add(new THREE.Mesh(geo, paintMaterial(look, { map: signTexture(text, bg) })));

// ── улица, лестница, площадь, фонари, дерево, цветы ───
const S = street(SLOPE, -62, STAIR0);
const R = new Builder();                                  // перила лестницы — отдельно, без прозрачности
stairs(S, R, STAIR0, STAIR1, yAt(STAIR0), STEEP, 4.6);
parvis(S, STAIR1, 175, TOP, 34);
const lampSpots = [[-49, -3.3], [-33, 3.3], [-25, -3.3], [-9, -3.3], [7, -3.3], [23, -3.3], [-1, 3.3], [15, 3.3], [31, 3.3], [39, -3.3], [47, 3.3], [55, -3.3],
  [66, 0], [75, 0], [84, 0], [94, -8], [94, 8], [112, -14], [112, 14]];
const lamps = lampSpots.map(([x, z]) => lamp(S, x, yAt(x) + (Math.abs(z) > 0.5 && x < STAIR0 ? 0.15 : 0.02), z));
const crowns = [...tree(S, -5, yAt(-5) + 0.15, 3.85, mulberry(9)), ...tree(S, 35, yAt(35) + 0.15, -3.9, mulberry(19)),
  ...tree(S, 98, TOP, -16, mulberry(29)), ...tree(S, 104, TOP, 17, mulberry(39)), ...tree(S, 120, TOP, -22, mulberry(49))];
const fruit = [], shrubs = [];
for (const [type, [x, y, z], side] of extras) {
  if (type === 'crates') {
    for (const dz of [0, 0.5]) { S.box(x - 0.35, y, z - 0.22 + dz * -side, x + 0.35, y + 0.38 + dz * 0.3, z + 0.22 + dz * -side, [0.62, 0.46, 0.32], 13); }
    fruit.push([x, y + 0.5, z, 0.32, false], [x, y + 0.78, z - 0.5 * side, 0.3, false]);
  } else {
    S.lathe(x, y, z, [[0.2, 0], [0.27, 0.48], [0.3, 0.52]], 9, [0.72, 0.42, 0.32], 13);
    shrubs.push([x, y + 1.0, z, 0.55, false]);
  }
}
const basilica = basilicaMesh(houseMat); basilica.position.set(138, TOP, 0); scene.add(basilica);
const groundGeo = S.geometry(0, Math.PI / 4);
{ const pos = groundGeo.attributes.position, b = groundGeo.attributes.aBase; for (let i = 0; i < b.count; i++) b.setX(i, pos.getY(i) - 3); }
const ground = new THREE.Mesh(groundGeo, houseMat);
scene.add(ground, new THREE.Mesh(R.geometry(0, 0), houseMat));
// у каждой точки листвы в aBase — «земля» кроны
const leafTex = leafTexture(3), flowerTex = leafTexture(8, true);
const leafMat = paintMaterial(look, { map: leafTex }), flowerMat = paintMaterial(look, { map: flowerTex });
const boxes = planters.filter((p) => !p[4]), pots = planters.filter((p) => p[4]);
const leafy = [
  [crowns, [0.46, 0.62, 0.42], leafMat, leafTex],
  [climbers, [0.38, 0.55, 0.36], leafMat, leafTex],
  [boxes.map(([x, y, z, w]) => [x, y + 0.08, z, 0.22 + w * 0.12]), [0.42, 0.6, 0.4], leafMat, leafTex],
  [boxes.map(([x, y, z, w]) => [x, y + 0.16, z, 0.18 + w * 0.1]), [0.95, 0.5, 0.55], flowerMat, flowerTex],
  [pots.map(([x, y, z, w, t]) => [x, y + (t === 'shrub' ? 0.1 : 0), z, t === 'shrub' ? 0.6 : 0.3]), [0.4, 0.58, 0.38], leafMat, leafTex],
  [wisteria, [0.74, 0.6, 0.95], flowerMat, flowerTex],
  [fruit, [1.0, 0.62, 0.3], flowerMat, flowerTex],
  [shrubs, [0.4, 0.6, 0.4], leafMat, leafTex],
];
leafy.forEach(([list, color, mat, map], i) => {
  if (!list.length) return;
  const m = new THREE.Mesh(foliage(list, color, 4 + i), mat); m.userData.leafMap = map; scene.add(m);
});

// тёплые источники: в шейдер каждый кадр идут ближайшие к камере
const warmLights = [...lamps.map(([x, y, z]) => ({ p: new THREE.Vector3(x, y, z), r: 10.5, kind: 'lamp' })), ...shops.map(([x, y, z]) => ({ p: new THREE.Vector3(x, y, z), r: 5.5, kind: 'shop' }))];
for (const [x, y, z] of lamps) { const s = glow(0xffb866, 2.4); s.position.set(x, y, z); scene.add(s); }
function feedLights() {
  const c = controls.target, m = MODES[mode];
  warmLights.sort((a, b) => a.p.distanceToSquared(c) - b.p.distanceToSquared(c));
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const l = warmLights[i];
    if (!l) { look.uLightCol.value[i].setRGB(0, 0, 0); continue; }
    look.uLightPos.value[i].set(l.p.x, l.p.y, l.p.z, l.r);
    look.uLightCol.value[i].setRGB(...(l.kind === 'lamp' ? m.lamp : m.shop));
  }
}

const skyMesh = sky(look); scene.add(skyMesh);

// ── режимы картины ────────────────────────────────────
const MODES = {
  night: {
    key: [0.45, 0.75, 0.5], keyCol: [0.44, 0.46, 0.74], shade: [0.18, 0.16, 0.38], sky: [0.32, 0.33, 0.66], fog: [0.22, 0.19, 0.42], fogRange: [24, 110], windows: 0.62,
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
  U.uTop.value.setRGB(...m.top); U.uMid.value.setRGB(...m.mid); U.uHorizon.value.setRGB(...m.horizon);
  U.uCloud.value.setRGB(...m.cloud); U.uCloudLit.value.setRGB(...m.cloudLit); U.uStars.value = m.stars;
  painter.uniforms.uInk.value.setRGB(...m.ink);
}

// ── «обычный 3D» для сравнения: те же формы, стандартный свет без живописи ──
const plain = new Map();
const lights = new THREE.Group();
lights.add(new THREE.HemisphereLight(0x8a90c8, 0x403850, 1.3));
const moonLight = new THREE.DirectionalLight(0xb8c0ff, 1.0); moonLight.position.set(20, 40, 25); lights.add(moonLight);
for (const [x, y, z] of lamps.slice(0, 8)) { const l = new THREE.PointLight(0xffa860, 14, 14, 1.6); l.position.set(x, y, z); lights.add(l); }
let compare = false;
function setCompare(on) {
  compare = on;
  scene.traverse((o) => {
    if (!o.isMesh || o === skyMesh) return;
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
controls.enableDamping = true; controls.maxPolarAngle = 1.65; controls.minDistance = 1.5; controls.maxDistance = 70;
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
  feedLights();
  if (compare) { renderer.setRenderTarget(null); renderer.setClearColor(0x14103a); renderer.render(scene, camera); } else painter.render(scene, camera);
  frames++; const now = performance.now(); if (now - last > 1000) { fps = frames * 1000 / (now - last); frames = 0; last = now; }
});
window.__painted = { renderer, camera, controls, look, setMode, setCompare, painter, get fps() { return fps; }, stats: () => ({ tris: houses.geometry.attributes.position.count / 3 }) };
