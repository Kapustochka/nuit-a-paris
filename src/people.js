// people.js — живые улицы: нарисованные прохожие, собранные прямо в коде.
// Никаких внешних моделей: тело из простых форм (эллипсоиды, конусы, пальто-«колокол»),
// шаг считается формулой (синус фазы шага → бедро, колено, руки, покачивание плеч).
// Каждый прохожий — один меш на одном общем материале, поэтому живописный свет (paint.js)
// и контуры тушью (post.js) ложатся на них так же, как на дома.
// Прохожие ходят по настоящим тротуарам и пешеходным улицам из OSM, поворачивают на перекрёстках,
// держатся правой стороны и обходят героиню. Те, кто ушёл далеко, тихо появляются снова
// за спиной камеры — так рядом всегда кто-то есть, а телефон считает не больше дюжины человек.
// Проходя мимо, прохожий иногда здоровается по-французски: облачко с фразой и переводом,
// голос (женский или мужской), двойной клик по облачку или по нему самому — карточка в блокнот.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { words } from './french-words.js';

// Что говорят прохожие (ключи карточек из french-words.js; голос — assets/voice/people/<ключ>-f|m.mp3)
const GREETINGS = ['bonsoirStreet', 'bonsoirMademoiselle', 'bonneSoiree', 'salut', 'belleNuit', 'ilFaitFrais', 'bonneNuit', 'pardon'];
// …а в дождь (rain.js) ещё и это
const RAIN_GREETINGS = ['ilPleut', 'quelTemps'];
const UMBRELLAS = [0x1a1820, 0x1a1820, 0x1a1820, 0x8a1e2a, 0x24305a, 0x2f5a4e, 0xd8a03a, 0x6a3a6a];

// По каким дорогам ходят и как далеко от оси дороги их тротуар (м)
const WALK_OFFSET = { footway: [0.45, 0], path: [0.4, 0], steps: [0.45, 0], pedestrian: [2.4, 1.4, 0.6], living_street: [2.4, 1.4, 0.6], residential: [3.6, 2.8, 2, 1.2] };
const RADIUS = 0.3;
export const TRAY_TILT = 1.5;          // наклон подноса в позе покоя: в согнутой руке он ляжет ровно

// ── Палитра парижской ночи (sRGB) ────────────────────────────
const COATS = [0x3b4a7a, 0x7a2f3a, 0x9a6a3a, 0x2f5a4e, 0x5a3a6a, 0x2a2a34, 0xb08850, 0x8a3a2a, 0x4a5a78, 0x6a4a3a, 0x9a4a5a];
const TROUSERS = [0x23263a, 0x2c3a5f, 0x4a3f36, 0x2a2a30, 0x5a5a66, 0x3a4a6f];
const ACCENTS = [0xd8402e, 0xe8b040, 0x2f9aa0, 0xf0e2c4, 0xb45aa0, 0xd06a40, 0x7aa85a, 0xf4b8b0];
const SKIN = [0xf1d0b5, 0xe2b48f, 0xc98f67, 0x9b6544, 0x6e4630, 0xf5dcc6];
const HAIR = [0x1c1412, 0x3a2418, 0x6b4426, 0xa77a4a, 0xd8c08a, 0x8a3b24, 0x9a9a9e];
const SHOES = [0x161418, 0x2e1f17, 0x3c2a22];

// Суставы стоящего человека ростом 1,70 м (лицо смотрит в +z; левая рука — +x)
const J = {
  hips: [0, 0.94, 0], spine: [0, 1.06, 0], head: [0, 1.5, 0],
  thighL: [0.095, 0.92, 0], shinL: [0.095, 0.5, 0.005], thighR: [-0.095, 0.92, 0], shinR: [-0.095, 0.5, 0.005],
  armL: [0.195, 1.42, -0.01], foreL: [0.215, 1.14, -0.02], armR: [-0.195, 1.42, -0.01], foreR: [-0.215, 1.14, -0.02],
};
const BONES = Object.keys(J);
export const B = Object.fromEntries(BONES.map((name, i) => [name, i]));
const PARENT = { spine: 'hips', head: 'spine', thighL: 'hips', shinL: 'thighL', thighR: 'hips', shinR: 'thighR', armL: 'spine', foreL: 'armL', armR: 'spine', foreR: 'armR' };

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ── Сборка фигуры ────────────────────────────────────────────
// waiter: официант(ка) у кафе (cafe.js) — белая рубашка, чёрный жилет, длинный фартук, поднос в левой руке
export function figureGeometry(rnd, { waiter = false, woman: forceWoman = null } = {}) {
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const woman = forceWoman ?? rnd() < 0.55;
  const parts = [];
  const color = new THREE.Color();
  // weight(x, y, z) → [кость A, кость B, вес B] — по умолчанию вся деталь на одной кости
  function add(geometry, hex, bone, weight = null) {
    const g = geometry;
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, pos = g.attributes.position;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    color.set(hex);
    const shade = (0.94 + rnd() * 0.12) * 2.2;      // ночью живописный свет сильно темнит — ткань чуть светлее
    for (let i = 0; i < n; i++) {
      col[i * 3] = Math.min(1, color.r * shade); col[i * 3 + 1] = Math.min(1, color.g * shade); col[i * 3 + 2] = Math.min(1, color.b * shade);
      if (weight) {
        const [a, b, w] = weight(pos.getX(i), pos.getY(i), pos.getZ(i));
        si[i * 4] = a; si[i * 4 + 1] = b; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
      } else { si[i * 4] = bone; sw[i * 4] = 1; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const blob = ([x, y, z], [rx, ry, rz], w = 14, h = 10) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z);
  // конус между двумя точками
  const limb = (a, b, r0, r1, seg = 12) => {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 3, true);
    // чуть «мышечный» профиль: середина толще концов, а не ровный цилиндр
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / len + 0.5, k = 1 + Math.sin(t * Math.PI) * 0.12;
      pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return g.translate(...a);
  };
  // «колокол» по профилю [радиус, высота] снизу вверх, сплющенный спереди-назад
  const bell = (profile, depth = 0.72, seg = 20) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg).scale(1, 1, depth);

  const skin = pick(SKIN), hair = pick(HAIR), shoes = pick(SHOES);
  let coat = pick(COATS), legs = pick(TROUSERS), accent = pick(ACCENTS);
  let outfit = woman ? pick(['coat', 'coat', 'dress', 'jacket']) : pick(['coat', 'coat', 'jacket', 'jacket']);
  let top = outfit === 'jacket' ? accent : coat;
  if (waiter) { outfit = 'waiter'; coat = 0xeeeae2; top = 0x1d1b24; legs = 0x1d1b24; }

  // ноги и обувь; шарики в коленях скругляют сгиб
  for (const [side, x] of [['L', 0.095], ['R', -0.095]]) {
    const legColor = outfit === 'dress' ? 0x241c26 : legs;
    const knee = woman ? 0.05 : 0.058;
    add(limb([x, 0.97, 0], [x, 0.5, 0.005], woman ? 0.072 : 0.078, knee), legColor, B['thigh' + side]);
    add(blob([x, 0.5, 0.008], [knee, knee * 1.1, knee]), legColor, B['shin' + side]);
    add(limb([x, 0.5, 0.005], [x, 0.08, -0.005], knee * 0.98, woman ? 0.032 : 0.042), legColor, B['shin' + side]);
    add(blob([x, 0.05, 0.035], [0.046, 0.042, woman ? 0.1 : 0.115]), shoes, B['shin' + side]);
  }
  // туловище: внизу на тазу, вверху на позвоночнике, между ними плавно; покатые плечи
  const torsoWeight = (x, y) => [B.hips, B.spine, THREE.MathUtils.smoothstep(y, 0.98, 1.14)];
  const hip = woman ? 0.175 : 0.16, waist = woman ? 0.13 : 0.15, chest = woman ? 0.16 : 0.18, sh = woman ? 0.17 : 0.195;
  add(bell([[0.001, 0.84], [hip * 0.8, 0.85], [hip, 0.9], [hip * 0.97, 0.97], [waist, 1.06], [chest * 0.97, 1.18], [chest, 1.26],
    [sh, 1.34], [sh * 0.93, 1.39], [sh * 0.72, 1.43], [0.07, 1.46], [0.045, 1.47]], woman ? 0.66 : 0.62), outfit === 'jacket' ? coat : top, 0, torsoWeight);
  // воротник
  add(new THREE.TorusGeometry(0.058, 0.022, 8, 18).rotateX(Math.PI / 2).translate(0, 1.445, 0.0), outfit === 'jacket' ? coat : top, B.spine);
  // полы пальто, юбка или длинный фартук официанта: низ качается вместе с бедром своей стороны
  const hem = outfit === 'coat' ? (woman ? 0.5 : 0.56) : outfit === 'dress' ? 0.6 : outfit === 'waiter' ? 0.4 : 0;
  if (hem) {
    const flare = outfit === 'dress' ? 0.26 : outfit === 'waiter' ? 0.2 : 0.22;
    add(bell([[flare, hem], [flare - 0.005, hem + 0.04], [flare - 0.03, hem + 0.15], [hip + 0.02, 0.85], [hip + 0.01, 0.92], [waist + 0.01, 1.02]], 0.74, 22),
      outfit === 'dress' ? accent : outfit === 'waiter' ? 0xf2eee6 : coat, 0, (x, y) => {
        const t = THREE.MathUtils.clamp((0.95 - y) / 0.45, 0, 1), s = Math.min(1, Math.abs(x) / 0.1);
        return [B.hips, x > 0 ? B.thighL : B.thighR, t * s * 0.6];
      });
  }
  // руки: плечо-шарик, рукав, локоть, предплечье, кисть
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const [ax, ay, az] = J['arm' + side];
    add(blob([ax - 0.012 * sx, ay - 0.005, az], [0.062, 0.06, 0.062]), coat, B['arm' + side]);
    add(limb([ax, ay, az], [0.212 * sx, 1.14, -0.02], 0.056, 0.046), coat, B['arm' + side]);
    add(blob([0.213 * sx, 1.14, -0.02], [0.045, 0.047, 0.045]), coat, B['fore' + side]);
    add(limb([0.213 * sx, 1.14, -0.02], [0.22 * sx, 0.91, 0.0], 0.045, 0.04), coat, B['fore' + side]);
    add(blob([0.221 * sx, 0.86, 0.008], [0.028, 0.052, 0.04], 10, 8), skin, B['fore' + side]);
  }
  // шея, голова (с подбородком и носом), волосы
  add(limb([0, 1.42, -0.005], [0, 1.56, 0.0], 0.043, 0.04), skin, B.head);
  add(blob([0, 1.605, 0.008], [0.088, 0.108, 0.098], 18, 14), skin, B.head);
  add(blob([0, 1.545, 0.04], [0.052, 0.04, 0.06], 12, 8), skin, B.head);          // подбородок и щёки
  add(blob([0, 1.6, 0.104], [0.013, 0.024, 0.02], 8, 6), skin, B.head);           // нос
  add(blob([0, 1.648, -0.028], [0.098, 0.098, 0.098], 18, 14), hair, B.head);
  if (woman) {
    add(blob([0, 1.665, 0.055], [0.085, 0.035, 0.05], 12, 8), hair, B.head);      // чёлка
    const style = rnd();
    if (style < 0.45) add(blob([0, 1.5, -0.055], [0.098, 0.17, 0.062], 14, 12), hair, B.head);  // длинные
    else if (style < 0.75) add(blob([0, 1.665, -0.105], [0.05, 0.05, 0.05], 10, 8), hair, B.head); // пучок
  }
  if (waiter) {
    // бабочка и поднос с бокалом: поднос в кисти левой руки, согнутой вперёд (pose в cafe.js)
    add(blob([0, 1.36, 0.1], [0.045, 0.085, 0.03], 10, 8), 0xf4f0ea, B.spine);      // белая рубашка в вырезе жилета
    add(blob([0.026, 1.43, 0.098], [0.028, 0.018, 0.012], 8, 6), 0x15131a, B.spine);
    add(blob([-0.026, 1.43, 0.098], [0.028, 0.018, 0.012], 8, 6), 0x15131a, B.spine);
    const onHand = (g) => g.rotateX(TRAY_TILT).translate(0.221, 0.86, 0.008);
    add(onHand(new THREE.CylinderGeometry(0.17, 0.165, 0.014, 20).translate(0, 0.03, 0.03)), 0xb8b4ae, B.foreL);
    add(onHand(new THREE.CylinderGeometry(0.03, 0.022, 0.11, 10).translate(0.05, 0.095, 0.05)), 0xe8eef4, B.foreL);
    const geometry = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    return { geometry, woman, busyArm: 'L', height: woman ? 1.62 + rnd() * 0.1 : 1.72 + rnd() * 0.12 };
  }
  // шарф
  if (rnd() < 0.6) {
    add(new THREE.TorusGeometry(0.07, 0.03, 8, 18).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, 1.45, 0.005), accent === top ? pick(ACCENTS) : accent, B.spine);
    add(new THREE.BoxGeometry(0.06, 0.24, 0.022).translate(0.045, 1.32, 0.11), accent === top ? pick(ACCENTS) : accent, B.spine);
  }
  // головной убор
  const hat = rnd();
  if (woman && hat < 0.3) add(blob([0.02, 1.705, -0.01], [0.115, 0.035, 0.115]).rotateZ(-0.15), pick([0x7b2230, 0x1f1d24, 0x2c3a5a, accent]), B.head);
  else if (!woman && hat < 0.22) {
    add(new THREE.CylinderGeometry(0.085, 0.095, 0.08, 16).translate(0, 1.73, -0.005), 0x23212a, B.head);
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 18).translate(0, 1.69, -0.005), 0x23212a, B.head);
  } else if (!woman && hat < 0.4) add(blob([0, 1.69, 0.02], [0.105, 0.04, 0.12]), pick([0x3a3d48, 0x5a4a3a]), B.head);   // кепка
  // что несут
  const carry = rnd();
  let busyArm = null;
  if (carry < 0.16) {           // багет под мышкой
    add(limb([-0.25, 1.2, 0.2], [-0.23, 1.0, -0.24], 0.03, 0.026, 6), 0xc8954e, B.armR);
    busyArm = 'R';
  } else if (woman && carry < 0.5) add(new THREE.BoxGeometry(0.06, 0.2, 0.24).translate(0.25, 0.86, 0.0), pick([0x3a2418, 0x1f1d24, 0x7b2230, 0x9a7a52]), B.foreL);   // сумка
  else if (!woman && carry < 0.32) add(new THREE.BoxGeometry(0.27, 0.34, 0.12).translate(0, 1.22, -0.17), pick([0x2c3247, 0x3b3530, 0x4b5a3a]), B.spine);       // рюкзак

  const geometry = mergeGeometries(parts);
  for (const p of parts) p.dispose();      // нормали у каждой детали свои, гладкие
  return { geometry, woman, busyArm, height: woman ? 1.58 + rnd() * 0.14 : 1.7 + rnd() * 0.17 };
}

// Зонт: восемь клиньев купола, спица-ручка; держится в кисти и всегда смотрит вверх
function umbrellaGeometry(hex) {
  const canopy = new THREE.ConeGeometry(0.48, 0.19, 8, 1, true).translate(0, 1.0, 0);
  const tip = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4).translate(0, 1.13, 0);
  const stick = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5).translate(0, 0.48, 0);
  const color = new THREE.Color(hex), dark = new THREE.Color(0x24222a);
  const parts = [[canopy, color], [tip, dark], [stick, dark]].map(([g, c]) => {
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([Math.min(1, c.r * 1.8), Math.min(1, c.g * 1.8), Math.min(1, c.b * 1.8)], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.index ? g.toNonIndexed() : g;
  });
  return mergeGeometries(parts);
}

export function makeSkeleton() {
  const bones = BONES.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
  BONES.forEach((name, i) => {
    const parent = PARENT[name], p = J[name];
    if (parent) {
      const q = J[parent];
      bones[i].position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      bones[B[parent]].add(bones[i]);
    } else bones[i].position.set(...p);
  });
  return bones;
}

// ── Сеть тротуаров ───────────────────────────────────────────
function walkNetwork(roads) {
  const ways = roads.filter((r) => WALK_OFFSET[r.k] && r.p.length >= 4);
  const nodes = new Map();          // общие точки дорог → куда можно свернуть
  const key = (x, z) => Math.round(x * 2) + ':' + Math.round(z * 2);
  ways.forEach((w, wi) => {
    for (let i = 0; i < w.p.length; i += 2) {
      const k = key(w.p[i], w.p[i + 1]);
      (nodes.get(k) || nodes.set(k, []).get(k)).push([wi, i / 2]);
    }
  });
  let total = 0;
  const lengths = ways.map((w) => { let l = 0; for (let i = 0; i + 3 < w.p.length; i += 2) l += Math.hypot(w.p[i + 2] - w.p[i], w.p[i + 3] - w.p[i + 1]); total += l; return l; });
  return { ways, lengths, total, branches: (w, i) => nodes.get(key(ways[w].p[i * 2], ways[w].p[i * 2 + 1])) || [] };
}

export function createPeople(scene, world, mapData, { count = 16, inspector, camera, player, onTalk = null } = {}) {
  const net = walkNetwork(mapData.roads);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const rnd = mulberry(4242);
  const umbrellaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  const umbrellaShapes = new Map();
  let rain = 0;
  const people = [];
  const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), tmp = new THREE.Vector3();
  const bubble = createBubble(inspector);
  const voice = new Audio();
  voice.preload = 'none';
  let greetCooldown = 6, lastGreeting = '';

  if (!net.ways.length) return { people, update() {}, count: 0 };

  const free = (x, z) => !world.blocked(x, z);
  // точка пути: вершина дороги, сдвинутая на тротуар своей стороны
  function waypoint(person, w, i) {
    const p = net.ways[w].p, n = p.length / 2;
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1];
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const side = person.dir * person.side;             // правая сторона по ходу движения
    for (const off of [...WALK_OFFSET[net.ways[w].k], 0]) {
      const x = p[i * 2] - dz * off * side, z = p[i * 2 + 1] + dx * off * side;
      if (free(x, z)) return [x, z];
    }
    return [p[i * 2], p[i * 2 + 1]];
  }
  function randomRoadPoint() {
    let t = rnd() * net.total, w = 0;
    while (w < net.ways.length - 1 && t > net.lengths[w]) { t -= net.lengths[w]; w++; }
    return [w, Math.floor(rnd() * (net.ways[w].p.length / 2))];
  }
  function inView(x, y, z) {
    return frustum.containsPoint(tmp.set(x, y + 1, z));
  }
  // появиться на тротуаре в кольце [near, far] от героини, по возможности вне кадра
  function spawn(person, near, far, hidden) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const [w, i] = randomRoadPoint();
      const p = net.ways[w].p, n = p.length / 2;
      person.way = w; person.dir = i === 0 ? 1 : i === n - 1 ? -1 : rnd() < 0.5 ? 1 : -1;
      const [x, z] = waypoint(person, w, i);
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < near || d > far || !free(x, z)) continue;
      const y = world.heightAt(x, z);
      if (hidden && attempt < 30 && inView(x, y, z) && d < 60) continue;
      if (people.some((o) => o !== person && o.active && Math.hypot(o.root.position.x - x, o.root.position.z - z) < 2)) continue;
      person.index = i;
      person.root.position.set(x, y, z);
      nextTarget(person, true);
      person.root.rotation.y = Math.atan2(person.target[0] - x, person.target[1] - z);
      person.active = true; person.root.visible = true;
      person.pause = 0; person.wait = 0; person.stuck = 0; person.greeted = -1e9;
      return true;
    }
    person.active = false; person.root.visible = false;
    return false;
  }
  // следующая вершина; на перекрёстке иногда сворачиваем
  function nextTarget(person, first = false) {
    if (!first) {
      const options = net.branches(person.way, person.index).filter(([w]) => w !== person.way);
      if (options.length && rnd() < 0.45) {
        const [w, i] = options[Math.floor(rnd() * options.length)];
        const n = net.ways[w].p.length / 2;
        person.way = w; person.index = i;
        person.dir = i === 0 ? 1 : i === n - 1 ? -1 : rnd() < 0.5 ? 1 : -1;
      }
      // иногда останавливаются: посмотреть на витрину, на город, в телефон
      if (rnd() < 0.07) person.pause = 1.5 + rnd() * 4;
    }
    const n = net.ways[person.way].p.length / 2;
    let i = person.index + person.dir;
    if (i < 0 || i >= n) { person.dir = -person.dir; i = person.index + person.dir; }
    person.index = Math.max(0, Math.min(n - 1, i));
    person.target = waypoint(person, person.way, person.index);
  }

  for (let k = 0; k < count; k++) {
    const { geometry, woman, busyArm, height } = figureGeometry(mulberry(1000 + k * 7919));
    const bones = makeSkeleton();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    const root = new THREE.Group();
    root.name = woman ? 'Passante' : 'Passant';
    root.add(mesh);
    root.scale.setScalar(height / 1.7);
    scene.add(root);
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.boundingSphere.radius += 0.4;     // руки и полы пальто в движении
    const person = {
      root, mesh, bones, woman, busyArm, rest: bones[0].position.y,
      speed: (woman ? 1.15 : 1.25) + rnd() * 0.3, stride: 1.32 * height / 1.7,
      phase: rnd() * 6.28, amp: 0, side: 1, way: 0, index: 0, dir: 1, target: [0, 0],
      pause: 0, wait: 0, stuck: 0, active: false, greeted: -1e9, saying: null, sayUntil: 0, look: 0,
    };
    mesh.userData.word = () => (person.saying && performance.now() < person.sayUntil + 6000 ? person.saying : woman ? 'passerby' : 'passant');
    // двойной клик по прохожему рядом — разговор (talk.js); издалека — карточка слова
    if (onTalk) mesh.userData.onInspect = (x, y) => { if (!onTalk(person, rain > 0.25)) inspector?.show(mesh.userData.word(), x, y, mesh); };
    inspector?.addTarget(mesh);
    // зонт есть примерно у двух третей; в руке, свободной от багета
    if (rnd() < 0.68) {
      const hex = UMBRELLAS[Math.floor(rnd() * UMBRELLAS.length)];
      if (!umbrellaShapes.has(hex)) umbrellaShapes.set(hex, umbrellaGeometry(hex));
      const side = busyArm === 'R' ? 'L' : 'R';
      const umbrella = new THREE.Mesh(umbrellaShapes.get(hex), umbrellaMat);
      umbrella.position.set(side === 'R' ? -0.005 : 0.005, -0.285, 0.0);
      umbrella.rotation.x = 1.6;                      // компенсирует поднятую руку: спица вертикальна
      umbrella.visible = false;
      umbrella.userData.word = 'umbrella';
      bones[B['fore' + side]].add(umbrella);
      inspector?.addTarget(umbrella);
      person.umbrella = umbrella; person.umbrellaSide = side; person.open = 0;
    }
    people.push(person);
    spawn(person, 4, 70, false);
  }
  if (people[0]) world.paint(people[0].root);   // материал общий на всех
  const anyUmbrella = people.find((p) => p.umbrella);
  if (anyUmbrella) world.paint(anyUmbrella.umbrella);

  function pose(person, dt, moving) {
    const b = person.bones;
    person.amp += ((moving ? 1 : 0) - person.amp) * (1 - Math.exp(-dt * 6));
    const a = person.amp, s = Math.sin(person.phase), c = Math.cos(person.phase);
    b[B.thighL].rotation.x = -0.42 * s * a;
    b[B.thighR].rotation.x = 0.42 * s * a;
    b[B.shinL].rotation.x = (0.05 + 0.65 * Math.max(0, c)) * a;
    b[B.shinR].rotation.x = (0.05 + 0.65 * Math.max(0, -c)) * a;
    b[B.armL].rotation.set(0.32 * s * a, 0, 0.07);
    b[B.armR].rotation.set(person.busyArm === 'R' ? 0.05 : -0.32 * s * a, 0, person.busyArm === 'R' ? -0.16 : -0.07);
    b[B.foreL].rotation.x = -(0.18 + 0.3 * Math.max(0, -s) * a);
    b[B.foreR].rotation.x = person.busyArm === 'R' ? -1.0 : -(0.18 + 0.3 * Math.max(0, s) * a);
    // зонт: рука поднята и согнута, спица смотрит вверх, купол раскрывается
    if (person.umbrella) {
      const want = rain > 0.25 ? 1 : rain < 0.1 ? 0 : person.open > 0.5 ? 1 : 0;
      person.open += (want - person.open) * (1 - Math.exp(-dt * 4));
      const o = person.open, side = person.umbrellaSide, sx = side === 'L' ? 1 : -1;
      if (o > 0.02) {
        const arm = b[B['arm' + side]], fore = b[B['fore' + side]];
        arm.rotation.set(THREE.MathUtils.lerp(arm.rotation.x, -0.2, o), 0, THREE.MathUtils.lerp(arm.rotation.z, 0.12 * sx, o));
        fore.rotation.x = THREE.MathUtils.lerp(fore.rotation.x, -1.15, o);
        const k = 0.15 + 0.85 * THREE.MathUtils.smoothstep(o, 0.3, 1);
        person.umbrella.rotation.x = -(arm.rotation.x + fore.rotation.x);
        person.umbrella.scale.set(k, 1, k);
      }
      person.umbrella.visible = o > 0.02;
    }
    // без зонта под дождём — плечи вперёд, шаг быстрее (см. update)
    const hunch = person.umbrella ? 0 : Math.min(1, rain * 1.5) * 0.12;
    b[B.hips].position.y = person.rest + (Math.abs(c) - 0.6) * 0.035 * a;
    b[B.hips].rotation.y = 0.09 * s * a;
    const idle = Math.sin(performance.now() / 900 + person.speed * 10) * (1 - a);
    b[B.hips].rotation.z = 0.02 * idle;
    b[B.spine].rotation.set(0.05 * a + hunch, -0.16 * s * a, -0.02 * idle);
    b[B.head].rotation.y += (person.look - b[B.head].rotation.y) * (1 - Math.exp(-dt * 5));
    b[B.head].rotation.x = 0.04 * a - 0.03 * (1 - a);
  }

  function say(person, key) {
    person.saying = key; person.sayUntil = performance.now() + 3600;
    lastGreeting = key; greetCooldown = 11 + rnd() * 10;
    bubble.show(person, key);
    const card = document.querySelector('#word-card');
    if (card && !card.hidden) return;                      // карточку не перебиваем — только облачко
    voice.src = `assets/voice/people/${key}-${person.woman ? 'f' : 'm'}.mp3`;
    voice.volume = 0.85;
    voice.play().catch(() => {});
  }

  let viewTick = 0;
  function update(dt, rainLevel = 0) {
    rain = rainLevel;
    viewTick -= dt;
    if (viewTick <= 0) { viewTick = 0.25; frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
    greetCooldown -= dt;
    const now = performance.now();
    for (const person of people) {
      const pos = person.root.position;
      if (!person.active) { if (rnd() < dt * 2) spawn(person, 35, 75, true); continue; }
      const toX = player.x - pos.x, toZ = player.z - pos.z, dist = Math.hypot(toX, toZ);
      if (dist > 90) { spawn(person, 35, 75, true); continue; }
      const yaw = person.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const facingHero = dist > 0.01 ? (toX * fx + toZ * fz) / dist : 0;

      // смотрит на героиню, когда она рядом и впереди
      let look = 0;
      if (dist < 7 && facingHero > -0.2) {
        const rel = Math.atan2(toX, toZ) - yaw;
        look = THREE.MathUtils.clamp(Math.atan2(Math.sin(rel), Math.cos(rel)), -1.0, 1.0);
      }
      person.look = look;

      // во время разговора стоит лицом к героине
      if (person.talking) {
        const want = Math.atan2(toX, toZ), delta = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
        person.root.rotation.y += delta * (1 - Math.exp(-dt * 4));
        person.look = THREE.MathUtils.clamp(delta, -1, 1);
        if (dist < 70) pose(person, dt, false);
        continue;
      }

      // здоровается
      if (dist < 3.4 && facingHero > 0.35 && greetCooldown <= 0 && now - person.greeted > 90000 && dist > 0.9) {
        person.greeted = now;
        let key = rain > 0.25 && rnd() < 0.5 ? RAIN_GREETINGS[Math.floor(rnd() * RAIN_GREETINGS.length)]
          : GREETINGS[Math.floor(rnd() * (GREETINGS.length - 1))];
        if (key === lastGreeting) key = 'bonsoirStreet';
        say(person, dist < 1.4 ? 'pardon' : key);
      }

      let moving = false;
      if (person.pause > 0) person.pause -= dt;
      else {
        const dx = person.target[0] - pos.x, dz = person.target[1] - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.35) nextTarget(person);
        else {
          const want = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
          person.root.rotation.y += delta * (1 - Math.exp(-dt * 5));
          // героиня прямо на пути — ждём, пока пройдёт
          const blockedByHero = dist < 1.15 && facingHero > 0.5;
          person.wait = blockedByHero ? person.wait + dt : 0;
          if (person.wait > 2.5) { person.wait = 0; person.dir = -person.dir; nextTarget(person, true); }
          else if (!blockedByHero) {
            const hurry = person.umbrella ? 1 : 1 + Math.min(1, rain * 1.5) * 0.3;
            const step = person.speed * hurry * dt * Math.max(0, Math.cos(delta));
            const nx = pos.x + Math.sin(person.root.rotation.y) * step, nz = pos.z + Math.cos(person.root.rotation.y) * step;
            if (free(nx, nz)) {
              pos.x = nx; pos.z = nz; pos.y = world.heightAt(nx, nz);
              person.phase += step / person.stride * Math.PI * 2;
              moving = step > 0.0001;
              person.stuck = 0;
            } else if (++person.stuck > 30) spawn(person, 35, 75, true);
            else {
              // скамейка, столик, урна: разворачиваемся
              person.dir = -person.dir;
              nextTarget(person, true);
            }
          }
        }
      }
      if (dist < 70) pose(person, dt, moving);
    }
    bubble.update(camera);
  }

  return {
    people, update, count, say,
    // для столкновений героини: прохожий как столбик радиусом RADIUS
    blocksStep(x, z) {
      for (const p of people) {
        if (!p.active) continue;
        const q = p.root.position, d = (x - q.x) ** 2 + (z - q.z) ** 2;
        if (d < (RADIUS + 0.24) ** 2 && d < (player.x - q.x) ** 2 + (player.z - q.z) ** 2) return true;
      }
      return false;
    },
  };
}

// ── Облачко с фразой над головой ─────────────────────────────
function createBubble(inspector) {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'speech';
  el.hidden = true;
  el.innerHTML = '<span lang="fr"></span><small lang="ru"></small>';
  document.body.append(el);
  const [fr, ru] = el.children;
  let person = null, key = null;
  const head = new THREE.Vector3();
  const open = (e) => { e.preventDefault(); e.stopPropagation(); if (key) inspector?.show(key); };
  el.addEventListener('click', open);
  el.addEventListener('dblclick', open);
  return {
    show(p, k) {
      person = p; key = k;
      fr.textContent = words[k][0]; ru.textContent = words[k][3].replace(/\s*\(.*\)$/, '');
      el.hidden = false;
      el.classList.remove('fade'); void el.offsetWidth; el.classList.add('show');
    },
    update(camera) {
      if (!person || el.hidden) return;
      if (performance.now() > person.sayUntil) { el.hidden = true; el.classList.remove('show'); person = null; return; }
      head.set(0, 1.95 * person.root.scale.y, 0).applyMatrix4(person.root.matrixWorld).project(camera);
      if (head.z > 1) { el.style.opacity = 0; return; }
      el.style.opacity = '';
      el.style.left = `${(head.x + 1) / 2 * innerWidth}px`;
      el.style.top = `${(1 - head.y) / 2 * innerHeight}px`;
    },
  };
}
