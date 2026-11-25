// people.js — живые улицы: рисованные прохожие.
// Каждый — картинка в стиле аниме-акварели, стоящая в 3D и всегда повёрнутая к камере (как в Paper Mario
// или Octopath). Листы с четырьмя видами (спереди, сбоку в шаге, сзади, вполоборота) нарезаны
// scripts/build-people-sprites.py в assets/people/painted/; вид выбирается по углу между тем, куда человек идёт,
// и камерой, сбоку и вполоборота ещё и зеркалится. Шаг — покачивание, лёгкий наклон и смена вида.
// Живописный свет (paint.js) ложится на картинку так же, как на дома, а тушь обводит силуэт.
// Прохожие ходят по настоящим тротуарам и пешеходным улицам из OSM, поворачивают на перекрёстках,
// держатся правой стороны и обходят героиню. Те, кто ушёл далеко, тихо появляются снова
// за спиной камеры — так рядом всегда кто-то есть, а телефон считает не больше дюжины человек.
// Проходя мимо, прохожий иногда здоровается по-французски: облачко с фразой и переводом,
// голос (женский или мужской), двойной клик по облачку или по нему самому — карточка в блокнот.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { words } from './french-words.js';
import { isParis } from './city.js';
import { SHEETS } from './people-sheets.js';

// Что говорят прохожие (ключи карточек из french-words.js; голос — assets/voice/people/<ключ>-f|m.mp3)
const GREETINGS = ['bonsoirStreet', 'bonsoirMademoiselle', 'bonneSoiree', 'salut', 'belleNuit', 'ilFaitFrais', 'bonneNuit', 'pardon'];
// …а в дождь (rain.js) ещё и это
const RAIN_GREETINGS = ['ilPleut', 'quelTemps'];
const UMBRELLAS = [0x1a1820, 0x1a1820, 0x1a1820, 0x8a1e2a, 0x24305a, 0x2f5a4e, 0xd8a03a, 0x6a3a6a];

// По каким дорогам ходят и как далеко от оси дороги их тротуар (м)
const WALK_OFFSET = { footway: [0.45, 0], path: [0.4, 0], steps: [0.45, 0], pedestrian: [2.4, 1.4, 0.6], living_street: [2.4, 1.4, 0.6], residential: [3.6, 2.8, 2, 1.2] };
const RADIUS = 0.3;
// в какие стороны пробовать обойти препятствие (радианы от прямого пути; + вправо)
const DETOURS = [0, 0.4, -0.4, 0.8, -0.8, 1.25, -1.25, 1.7];

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
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

// ── Рисованные фигуры ────────────────────────────────────────
const CAST = Object.keys(SHEETS);
// 4 вида × (как есть, зеркально): плоскость с ногами в начале координат, своя полоска листа в UV
function figureGeometries(sheet) {
  const h = sheet.h / sheet.fig * sheet.height, w = sheet.cell / sheet.h * h, foot = (sheet.h - sheet.foot) / sheet.h * h;
  const list = [];
  for (let view = 0; view < sheet.cells; view++) for (const mirror of [false, true]) {
    const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2 - foot, 0);
    const uv = g.attributes.position.array, u = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < u.count; i++) {
      const right = uv[i * 3] > 0 !== mirror;
      u.setX(i, (view + (right ? 1 : 0)) / sheet.cells);
      nrm.setXYZ(i, 0, 0.45, 0.89);         // свет как на стоящего человека, а не на лист бумаги
    }
    list.push(g);
  }
  return list;
}
// Какой вид показать: угол камеры относительно того, куда человек смотрит (0 — камера прямо перед ним)
const FRONT = 0, SIDE = 1, BACK = 2, THREE_QUARTER = 3;
function viewFor(angle) {
  const a = Math.abs(angle), right = angle > 0;         // камера справа от человека
  if (a < 0.45) return FRONT * 2;
  if (a < 1.1) return THREE_QUARTER * 2 + (right ? 1 : 0);
  if (a < 2.25) return SIDE * 2 + (right ? 0 : 1);
  return BACK * 2;
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

export function createPeople(scene, world, mapData, { count = 16, inspector, camera, player, onTalk = null, far3d = 85 } = {}) {
  const net = walkNetwork(mapData.roads);
  const loader = new THREE.TextureLoader();
  const cast = CAST.map((name) => {
    const map = loader.load(`assets/people/painted/${name}.webp`);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return { name, sheet: SHEETS[name], map, geometries: figureGeometries(SHEETS[name]) };
  });
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
  // свободно ли место для прохожего: дома, скамейки, столики, фонари, деревья, столбики, героиня и другие люди
  function clear(person, x, z) {
    if (world.blocked(x, z) || world.post?.(x, z, RADIUS)) return false;
    if ((x - player.x) ** 2 + (z - player.z) ** 2 < 0.62 ** 2) return false;
    for (const o of people) {
      if (o === person || !o.active || o === person.dog || o === person.owner) continue;
      const q = o.root.position, ox = x - q.x, oz = z - q.z;
      // ближе 0,55 м к другому — нельзя, но если уже стоим вплотную, разрешаем расходиться
      if (ox * ox + oz * oz < 0.55 ** 2 && ox * ox + oz * oz < (person.root.position.x - q.x) ** 2 + (person.root.position.z - q.z) ** 2) return false;
    }
    return true;
  }
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
  function randomRoadPoint(person) {
    if (person?.home) {                              // 3D-прохожий: точка в его районе
      const pts = person.homePoints ??= homePoints(person.home, person.range);
      if (pts.length) return pts[Math.floor(rnd() * pts.length)];
    }
    let t = rnd() * net.total, w = 0;
    while (w < net.ways.length - 1 && t > net.lengths[w]) { t -= net.lengths[w]; w++; }
    return [w, Math.floor(rnd() * (net.ways[w].p.length / 2))];
  }
  function homePoints([hx, hz], range) {
    const out = [];
    net.ways.forEach((w, wi) => { for (let i = 0; i < w.p.length; i += 2) if (Math.hypot(w.p[i] - hx, w.p[i + 1] - hz) < range) out.push([wi, i / 2]); });
    return out;
  }
  function inView(x, y, z) {
    return frustum.containsPoint(tmp.set(x, y + 1, z));
  }
  // появиться на тротуаре в кольце [near, far] от героини, по возможности вне кадра
  function spawn(person, near, far, hidden) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const [w, i] = randomRoadPoint(person);
      const p = net.ways[w].p, n = p.length / 2;
      person.way = w; person.dir = i === 0 ? 1 : i === n - 1 ? -1 : rnd() < 0.5 ? 1 : -1;
      const [x, z] = waypoint(person, w, i);
      const d = Math.hypot(x - player.x, z - player.z);
      if (!person.home && (d < near || d > far)) continue;
      if (!free(x, z) || (person.home && d < 6 && attempt < 30)) continue;
      const y = world.heightAt(x, z);
      if (hidden && attempt < 30 && inView(x, y, z) && d < 60) continue;
      if (people.some((o) => o !== person && o.active && Math.hypot(o.root.position.x - x, o.root.position.z - z) < 2)) continue;
      person.index = i;
      person.root.position.set(x, y, z);
      nextTarget(person, true);
      person.root.rotation.y = Math.atan2(person.target[0] - x, person.target[1] - z);
      person.active = true; person.root.visible = true;
      if (person.dog) placeDog(person.dog, person, true);
      person.pause = 0; person.wait = 0; person.stuck = 0; person.detour = 0; person.check = 4; person.lastD = 1e9; person.greeted = -1e9;
      return true;
    }
    person.active = false; person.root.visible = false;
    if (person.dog) { person.dog.active = false; person.dog.root.visible = false; }
    return false;
  }
  // следующая вершина; на перекрёстке иногда сворачиваем
  function nextTarget(person, first = false) {
    person.lastD = 1e9; person.check = 4;
    if (!first) {
      const options = net.branches(person.way, person.index).filter(([w]) => w !== person.way);
      if (options.length && rnd() < 0.45) {
        const [w, i] = options[Math.floor(rnd() * options.length)];
        const n = net.ways[w].p.length / 2;
        person.way = w; person.index = i;
        person.dir = i === 0 ? 1 : i === n - 1 ? -1 : rnd() < 0.5 ? 1 : -1;
      }
      // иногда останавливаются: посмотреть на витрину, на город, в телефон
      if (!person.model && rnd() < 0.07) person.pause = 1.5 + rnd() * 4;   // 3D-клип — только ходьба, без остановок
    }
    const n = net.ways[person.way].p.length / 2;
    let i = person.index + person.dir;
    if (i < 0 || i >= n) { person.dir = -person.dir; i = person.index + person.dir; }
    // 3D-прохожий не уходит из своего района: у границы разворачивается
    if (person.home) {
      const p = net.ways[person.way].p, j = Math.max(0, Math.min(n - 1, i));
      if (Math.hypot(p[j * 2] - person.home[0], p[j * 2 + 1] - person.home[1]) > person.range) {
        person.dir = -person.dir; i = Math.max(0, Math.min(n - 1, person.index + person.dir));
      }
    }
    person.index = Math.max(0, Math.min(n - 1, i));
    person.target = waypoint(person, person.way, person.index);
  }

  const camLocal = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    const who = cast[k % cast.length], woman = who.sheet.woman;
    // тот же лист, но чуть другой оттенок и рост — двойники не так бросаются в глаза
    // часть собственного цвета картинки не зависит от ночного света — прохожие не тонут в фиолетовой мгле
    const material = new THREE.MeshLambertMaterial({ map: who.map, alphaTest: 0.5, emissiveMap: who.map, emissive: new THREE.Color(0.42, 0.4, 0.38) });
    const tone = 1.25 + rnd() * 0.12;                 // ночью живописный свет сильно темнит — картинка светлее
    material.color.setRGB(tone * (0.97 + rnd() * 0.06), tone * (0.97 + rnd() * 0.06), tone * (0.97 + rnd() * 0.06));
    const mesh = new THREE.Mesh(who.geometries[0], material);
    mesh.userData.figure = true;                    // post.js: меньше мазков кисти, чтобы прохожие читались
    const root = new THREE.Group();
    root.name = woman ? 'Passante' : 'Passant';
    root.add(mesh);
    const scale = 0.97 + rnd() * 0.06;
    root.scale.setScalar(scale);
    scene.add(root);
    world.paint(mesh);
    const person = {
      root, mesh, who, woman, view: 0,
      speed: (woman ? 1.15 : 1.25) + rnd() * 0.3, stride: 1.32 * who.sheet.height * scale / 1.7,
      phase: rnd() * 6.28, amp: 0, side: 1, way: 0, index: 0, dir: 1, target: [0, 0],
      pause: 0, wait: 0, stuck: 0, detour: 0, check: 4, lastD: 1e9, active: false, greeted: -1e9, saying: null, sayUntil: 0, look: 0,
    };
    mesh.userData.word = () => (person.saying && performance.now() < person.sayUntil + 6000 ? person.saying : woman ? 'passerby' : 'passant');
    // двойной клик по прохожему рядом — разговор (talk.js); издалека — карточка слова
    if (onTalk) mesh.userData.onInspect = (x, y) => { if (!onTalk(person, rain > 0.25)) inspector?.show(mesh.userData.word(), x, y, mesh); };
    inspector?.addTarget(mesh);
    // зонт есть примерно у двух третей; в руке, свободной от багета
    if (rnd() < 0.68) {
      const hex = UMBRELLAS[Math.floor(rnd() * UMBRELLAS.length)];
      if (!umbrellaShapes.has(hex)) umbrellaShapes.set(hex, umbrellaGeometry(hex));
      const umbrella = new THREE.Mesh(umbrellaShapes.get(hex), umbrellaMat);
      umbrella.position.set(-0.16, who.sheet.height - 0.82, 0.08);   // купол чуть выше головы, спица у правой руки
      umbrella.visible = false;
      umbrella.userData.word = 'umbrella';
      root.add(umbrella);
      inspector?.addTarget(umbrella);
      person.umbrella = umbrella; person.open = 0;
    }
    people.push(person);
    spawn(person, 4, 70, false);
  }
  const anyUmbrella = people.find((p) => p.umbrella);
  if (anyUmbrella) world.paint(anyUmbrella.umbrella);

  // поворот к камере, выбор вида и «шаг»: покачивание вверх-вниз и с боку на бок
  function pose(person, dt, moving, step = 0) {
    if (person.model) { animateModel(person, step); return; }
    person.amp += ((moving ? 1 : 0) - person.amp) * (1 - Math.exp(-dt * 6));
    const a = person.amp, s = Math.sin(person.phase), c = Math.cos(person.phase);
    const root = person.root, mesh = person.mesh, yaw = root.rotation.y;
    camLocal.copy(camera.position).sub(root.position);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // правая рука человека, смотрящего вдоль (fx, fz), — это (-fz, fx)
    const angle = Math.atan2(-camLocal.x * fz + camLocal.z * fx, camLocal.x * fx + camLocal.z * fz);
    // рядом с героиней и в разговоре он поворачивается к ней — «вперёд» сдвигается на часть look
    const turned = angle + person.look * 0.6 * (1 - a);
    const view = viewFor(Math.atan2(Math.sin(turned), Math.cos(turned)));
    if (view !== person.view) { person.view = view; mesh.geometry = person.who.geometries[view]; }
    mesh.rotation.y = Math.atan2(camLocal.x, camLocal.z) - yaw;
    const idle = Math.sin(performance.now() / 900 + person.speed * 10) * (1 - a);
    mesh.position.y = (Math.abs(c) - 0.6) * 0.04 * a;
    mesh.rotation.z = 0.022 * s * a + 0.006 * idle;
    mesh.scale.y = 1 - 0.012 * a * Math.abs(s) + 0.004 * idle;
    // зонт раскрывается в дождь
    if (person.umbrella) {
      const want = rain > 0.25 ? 1 : rain < 0.1 ? 0 : person.open > 0.5 ? 1 : 0;
      person.open += (want - person.open) * (1 - Math.exp(-dt * 4));
      const k = 0.15 + 0.85 * THREE.MathUtils.smoothstep(person.open, 0.3, 1);
      person.umbrella.scale.set(k, 1, k);
      person.umbrella.position.y = person.who.sheet.height - 0.82 + mesh.position.y;
      person.umbrella.visible = person.open > 0.02;
    }
  }

  function say(person, key) {
    person.saying = key; person.sayUntil = performance.now() + 3600;
    lastGreeting = key; greetCooldown = 11 + rnd() * 10;
    bubble.show(person, key);
    const card = document.querySelector('#word-card');
    if (card && !card.hidden) return;                      // карточку не перебиваем — только облачко
    voice.src = `${isParis ? 'assets/voice' : 'assets/london/voice'}/people/${key}-${person.woman ? 'f' : 'm'}.mp3`;
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
      if (person.owner) { followOwner(person, dt); continue; }
      if (!person.active) { if (rnd() < dt * 2) spawn(person, 35, 75, true); continue; }
      const toX = player.x - pos.x, toZ = player.z - pos.z, dist = Math.hypot(toX, toZ);
      if (dist > 90 && !person.home) { spawn(person, 35, 75, true); continue; }
      if (person.model) person.root.visible = dist < far3d;   // 3D-прохожие живут в своём районе и вдали просто не рисуются
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

      let moving = false, walked = 0;
      if (person.pause > 0) person.pause -= dt;
      else {
        const dx = person.target[0] - pos.x, dz = person.target[1] - pos.z, d = Math.hypot(dx, dz);
        // точку внутри препятствия (столик, фонарь) засчитываем издалека — обходить её незачем
        if (d < 0.35 || (d < 1 && person.detour > 0.3)) nextTarget(person);
        else {
          // идти прямо к цели, а если там фонарь, столбик, дерево, столик или другой человек —
          // взять в сторону (сначала вправо: правостороннее движение), в крайнем случае ждать
          const want = Math.atan2(dx, dz);
          const hurry = person.umbrella ? 1 : 1 + Math.min(1, rain * 1.5) * 0.3;
          let go = null;
          for (const off of DETOURS) {
            const h = want - off * person.side;
            const sx = Math.sin(h), sz = Math.cos(h);
            if (clear(person, pos.x + sx * 0.32, pos.z + sz * 0.32) && clear(person, pos.x + sx * 0.75, pos.z + sz * 0.75)) { go = h; break; }
          }
          if (go === null) {
            person.wait += dt;
            if (person.wait > 1.6) { person.wait = 0; person.dir = -person.dir; nextTarget(person, true); }
            if (++person.stuck > 400) spawn(person, 35, 75, true);
          } else {
            person.wait = 0;
            person.detour = go === want ? Math.max(0, person.detour - dt) : person.detour + dt;
            const delta = Math.atan2(Math.sin(go - yaw), Math.cos(go - yaw));
            person.root.rotation.y += delta * (1 - Math.exp(-dt * 6));
            const turn = Math.atan2(Math.sin(go - person.root.rotation.y), Math.cos(go - person.root.rotation.y));
            const step = person.speed * hurry * dt * Math.max(0.15, Math.cos(turn));
            const nx = pos.x + Math.sin(go) * step, nz = pos.z + Math.cos(go) * step;
            if (clear(person, nx, nz)) {
              pos.x = nx; pos.z = nz; pos.y = world.heightAt(nx, nz);
              person.phase += step / person.stride * Math.PI * 2;
              moving = step > 0.0001; walked = step;
            }
          }
          // не продвигается к цели несколько секунд — следующая точка, а если и так никак — появиться заново
          person.check -= dt;
          if (person.check <= 0) {
            if (d > person.lastD - 0.6) { person.stuck += 100; nextTarget(person, true); }
            else person.stuck = 0;
            person.check = 4; person.lastD = d;
            if (person.stuck >= 300) spawn(person, 35, 75, !inView(pos.x, pos.y, pos.z));
          }
        }
      }
      if (dist < 70) pose(person, dt, moving, walked);
    }
    bubble.update(camera);
  }

  // ── 3D-прохожие (people-3d.js) ──
  // Клип крутится ровно на пройденный путь: время = путь / «скорость стопы» клипа — ноги не скользят.
  function animateModel(person, step) {
    if (!person.root.visible || !inView(person.root.position.x, person.root.position.y, person.root.position.z)) { person.lag += step; return; }
    person.model.mixer.update((step + person.lag) / person.gait);
    person.lag = 0;
  }
  // собака идёт слева от хозяйки, чуть позади, на своём скелете и своём клипе
  function placeDog(dog, owner, snap) {
    const o = owner.root.position, yaw = owner.root.rotation.y;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const [side, back] of [[0.62, 0.15], [-0.62, 0.15], [0, 0.9]]) {
      const x = o.x + fz * side - fx * back, z = o.z - fx * side - fz * back;   // слева: (fz, -fx)
      if (!world.blocked(x, z)) { dog.want = [x, z]; break; }
    }
    if (snap && dog.want) {
      dog.root.position.set(dog.want[0], world.heightAt(dog.want[0], dog.want[1]), dog.want[1]);
      dog.root.rotation.y = yaw;
    }
    dog.active = owner.active; dog.root.visible = owner.root.visible;
  }
  function followOwner(dog, dt) {
    const owner = dog.owner;
    placeDog(dog, owner, !dog.active && owner.active);
    if (!dog.active || !dog.want) return;
    const pos = dog.root.position, dx = dog.want[0] - pos.x, dz = dog.want[1] - pos.z, d = Math.hypot(dx, dz);
    if (d > 4) { placeDog(dog, owner, true); return; }        // отстала (хозяйка развернулась в узком месте) — рядом снова
    // догоняет быстрее, если отстала; стоит, если уже на месте
    const speed = Math.min(owner.speed * 1.6, owner.speed * (0.4 + d * 1.6));
    const step = d < 0.05 ? 0 : Math.min(d, speed * dt);
    if (step > 0) {
      const nx = pos.x + dx / d * step, nz = pos.z + dz / d * step;
      if (!world.blocked(nx, nz)) { pos.x = nx; pos.z = nz; pos.y = world.heightAt(nx, nz); }
    }
    // смотрит туда, куда идёт, а стоя — туда же, куда хозяйка
    const want = step > 0.002 ? Math.atan2(dx, dz) : owner.root.rotation.y;
    const delta = Math.atan2(Math.sin(want - dog.root.rotation.y), Math.cos(want - dog.root.rotation.y));
    dog.root.rotation.y += delta * (1 - Math.exp(-dt * 8));
    if (Math.hypot(player.x - pos.x, player.z - pos.z) < 70) animateModel(dog, step);
  }
  function addModel(asset, { woman, home, range, scale = 1, owner = null, word } = {}) {
    const root = new THREE.Group();
    root.name = woman ? 'Passante' : 'Passant';
    root.add(asset.model);
    root.scale.setScalar(scale);
    scene.add(root);
    world.paint(asset.model);
    const person = {
      root, mesh: null, model: asset, woman, home, range, owner,
      gait: asset.speed * scale, speed: asset.speed * scale, lag: 0, stride: 1, phase: 0, amp: 0,
      side: 1, way: 0, index: 0, dir: 1, target: [0, 0],
      pause: 0, wait: 0, stuck: 0, detour: 0, check: 4, lastD: 1e9, active: false, greeted: -1e9, saying: null, sayUntil: 0, look: 0,
    };
    // идёт со «своей» скоростью клипа, но не медленнее 0,95 и не быстрее 1,5 м/с; клип подстраивается под шаг
    person.speed = THREE.MathUtils.clamp(person.speed, 0.75, 1.5);
    const wordOf = () => (person.saying && performance.now() < person.sayUntil + 6000 ? person.saying : word ?? (woman ? 'passerby' : 'passant'));
    asset.model.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.word = wordOf;
      if (onTalk && !owner) o.userData.onInspect = (x, y) => { if (!onTalk(person, rain > 0.25)) inspector?.show(wordOf(), x, y, o); };
      inspector?.addTarget(o);
    });
    people.push(person);
    if (owner) { owner.dog = person; placeDog(person, owner, true); }
    else spawn(person, 0, 1e9, false);
    return person;
  }

  return {
    people, update, count, say, addModel,
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
