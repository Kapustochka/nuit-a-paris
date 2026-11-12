// world.js — ночной Монмартр по настоящей карте, в стиле концепт-арта:
// фиолетовое небо, тёплые фонари, мокрая брусчатка, кремовые дома со ставнями, бордовые маркизы.
import * as THREE from 'three';
import { toXZ } from './osm.js';
import { createNightSky } from './night-sky.js';
import { addPropInstances, placeBenches, placePigeons } from './street-props.js';
import { placeStreetLife, terraceSet } from './street-life.js';
import { createNightLight } from './night-light.js';
import { createTerrain, groundGeometry, liftToGround } from './terrain.js';
import { buildStairs } from './stairs.js';
import { buildViewpoint, buildCityBelow } from './viewpoint.js';
import { createLook, groundMaterial, paintMaterial, paintObject, MAX_LIGHTS } from './paint/paint.js';
import { planFacades, buildFacades } from './paint/facades.js';
import { Builder, K } from './paint/builder.js';
import { foliage, leafTexture, basilicaMesh } from './paint/props.js';

const CELL = 24;              // ячейка сетки для столкновений

export function buildParis(scene, renderer, data, city, props = {}) {
  const firstChild = scene.children.length;
  const terrain = city.terrain || createTerrain(null), heightAt = terrain.heightAt;
  let standAt = heightAt;                 // рельеф плюс ступени лестниц
  const sky = createNightSky(scene);
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.21, 0.19, 0.4, THREE.LinearSRGBColorSpace), 0.0075);

  // ── Земля: мокрая брусчатка ───────────────────────────────
  const b = data.bounds;
  const night = createNightLight(b, terrain);
  const look = createLook(night, sky.moonDirection);      // общий «живописный» свет (paint/paint.js)
  const groundMat = groundMaterial(look);
  const ground = new THREE.Mesh(groundGeometry(terrain, b), groundMat);
  ground.userData.word = 'cobble';
  scene.add(ground);

  // ── Дома на настоящих контурах (рисуются в paint/facades.js) ──
  const rnd = mulberry(7);
  const polys = [];                       // для столкновений
  const wallSpots = [];
  const SACRE = toXZ(48.88672, 2.34306);
  const TINTS = [[1, 1, 1], [1.05, 0.98, 0.92], [0.94, 0.96, 1.04], [1.04, 1.0, 0.9], [0.97, 0.93, 0.97]];
  const pending = [];

  for (const bd of data.buildings) {
    let p = [];
    for (let i = 0; i < bd.p.length; i += 2) {
      const k = p.length;
      if (!k || Math.hypot(bd.p[i] - p[k - 2], bd.p[i + 1] - p[k - 1]) > 0.08) p.push(bd.p[i], bd.p[i + 1]);
    }
    if (p.length >= 4 && Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) < 0.08) p.length -= 2;
    const n = p.length / 2;
    if (n < 3) continue;
    let area = 0, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
      cx += p[i * 2]; cz += p[i * 2 + 1];
    }
    cx /= n; cz /= n; area /= 2;
    if (Math.abs(area) < 6) continue;
    const nearSacre = Math.hypot(cx - SACRE[0], cz - SACRE[1]) < 55;
    if (/Sacr/i.test(bd.n) || (nearSacre && (Math.abs(area) > 900 || /church|cathedral|basilica/.test(bd.k)))) { polys.push(makePoly(p)); continue; }
    if (area > 0) { const q = []; for (let i = n - 1; i >= 0; i--) q.push(p[i * 2], p[i * 2 + 1]); p = q; }
    const A = Math.abs(area);
    const H = A < 45 ? 7 + rnd() * 2.5 : bd.h ? Math.min(22, Math.max(10, bd.h + 3)) : 11 + rnd() * 8;   // +3 м на крышу
    polys.push(makePoly(p));
    pending.push({ p, n, H, A, tint: TINTS[Math.floor(rnd() * TINTS.length)] });
  }
  night.buildings(polys);
  // ── Сетка столкновений ────────────────────────────────────
  const grid = new Map();
  for (const poly of polys) {
    for (let gx = Math.floor(poly.minX / CELL); gx <= Math.floor(poly.maxX / CELL); gx++)
      for (let gz = Math.floor(poly.minZ / CELL); gz <= Math.floor(poly.maxZ / CELL); gz++) {
        const k = gx + ':' + gz;
        (grid.get(k) || grid.set(k, []).get(k)).push(poly);
      }
  }
  const inside = (x, z) => {
    const cell = grid.get(Math.floor(x / CELL) + ':' + Math.floor(z / CELL));
    if (!cell) return false;
    for (const poly of cell) {
      if (x < poly.minX || x > poly.maxX || z < poly.minZ || z > poly.maxZ) continue;
      const p = poly.p; let c = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
      }
      if (c) return true;
    }
    return false;
  };
  const R = 0.35;
  let benches = [];
  const solids = [];                       // киоск, урны, велосипеды, скутеры, горшки
  const hitsBox = (x, z, box) => {
    const dx = x - box.x, dz = z - box.z;
    return Math.abs(dx * box.cos - dz * box.sin) < box.halfWidth + R &&
           Math.abs(dx * box.sin + dz * box.cos) < box.halfDepth + R;
  };
  const blocked = (x, z) =>
    x < b.minX + 8 || x > b.maxX - 8 || z < b.minZ + 8 || z > b.maxZ - 8 ||
    inside(x, z) || inside(x + R, z) || inside(x - R, z) || inside(x, z + R) || inside(x, z - R) ||
    benches.some((bench) => hitsBox(x, z, bench)) || solids.some((box) => hitsBox(x, z, box));

  // ── Рисованные дома: план фасадов (сами дома строятся ниже, когда известны витрины) ──
  const plan = planFacades(pending, heightAt, inside, terrain.flat);
  wallSpots.push(...plan.wallSpots);

  // ── Фонари вдоль настоящих улиц ───────────────────────────
  const lamps = [];
  const LAMP_KINDS = new Set(['pedestrian', 'residential', 'living_street', 'footway', 'steps', 'tertiary', 'secondary', 'unclassified', 'path']);
  for (const rd of data.roads) {
    if (!LAMP_KINDS.has(rd.k) || rd.p.length < 4) continue;
    let acc = 11 + rnd() * 8, side = rnd() < 0.5 ? 1 : -1;
    for (let i = 0; i + 3 < rd.p.length; i += 2) {
      const ax = rd.p[i], az = rd.p[i + 1], dx = rd.p[i + 2] - ax, dz = rd.p[i + 3] - az;
      const len = Math.hypot(dx, dz); if (len < 0.1) continue;
      while (acc < len) {
        const t = acc / len, nx = -dz / len, nz = dx / len;
        for (const off of [2.6, 1.6, 0.9]) {
          const x = ax + dx * t + nx * off * side, z = az + dz * t + nz * off * side;
          if (!inside(x, z) && !inside(x + nx * side * 0.5, z + nz * side * 0.5) && lamps.every((l) => (l[0] - x) ** 2 + (l[1] - z) ** 2 > 190)) { lamps.push([x, z, dx / len, dz / len]); break; }
        }
        acc += 24; side = -side;
      }
      acc -= len;
    }
  }
  const propRandom = mulberry(27);
  const { lights: lampLights, detailed: detailedLamps } = buildLamps(scene, lamps, props, propRandom);
  for (const [x, z] of lamps) night.light(x, z);
  buildBollards(scene, lamps, inside);
  benches = placeBenches(props['park-bench'], data.roads, lamps, data.trees, blocked, propRandom);
  addPropInstances(scene, props['park-bench'], benches);
  const pigeons = placePigeons(scene, props, benches, blocked, propRandom);
  buildVines(scene, wallSpots, inside, rnd);
  buildPlaques(scene, data.roads, polys, inside);

  // ── Деревья: изогнутый ствол и крона из мазков ─────────────
  buildTrees(scene, look, data.trees.length ? data.trees : [], inside, rnd, terrain.flat ? () => 0 : heightAt);

  // ── Кафе, бистро, булочные (настоящие названия) ───────────
  const shopFronts = [], terraces = [];
  buildShops(scene, data.pois, polys, inside, rnd, props, propRandom, shopFronts, terraces);
  for (const s of shopFronts) night.shopSpill(s.x, s.z, s.nx, s.nz, s.w);
  night.done();
  const facades = buildFacades(scene, look, plan, shopFronts, { progressive: city.progressive !== false });
  if (props['chair-rattan']) solids.push(...terraces);     // за столики со стульями не заходим

  // ── Мелочи улицы из моделей Meshy ──────────────────────────
  const streetLife = placeStreetLife(scene, props, { benches, lamps, wallSpots, shopFronts, blocked, solids, random: propRandom });

  // ── Площадь Тертр: мольберты художников ───────────────────
  buildEasels(scene, inside, rnd);

  // ── Сакре-Кёр, Эйфелева башня и огни вдали ─────────────────
  buildBasilica(scene, look, SACRE[0], SACRE[1]);
  const drop = terrain.flat ? 0 : terrain.heightAt(1e4, 1e4);
  buildFarParis(scene, drop);

  // ── Лестницы Монмартра, смотровая площадка и город внизу ───
  const stairs = terrain.flat ? { lift: () => 0, count: 0 } : buildStairs(scene, data.roads, heightAt, null);
  standAt = (x, z) => heightAt(x, z) + stairs.lift(x, z);
  if (!terrain.flat) {
    solids.push(...buildViewpoint(scene, SACRE[0], SACRE[1] + 64, heightAt, null));
    buildCityBelow(scene, drop, heightAt, renderer.getPixelRatio());
  }

  // Всё, что выше расставлено на ровном полу, встаёт на склон холма
  if (!terrain.flat) {
    for (const object of scene.children.slice(firstChild)) liftToGround(object, standAt);
    for (const l of lampLights) l.y += standAt(l.x, l.z);
  }
  // Все готовые материалы (модели Meshy, фонари, лестницы, столики) — в тот же «живописный» свет
  for (const object of scene.children.slice(firstChild)) paintObject(object, look);
  facades.warmStart(0, 0);

  // Названия улиц
  const named = data.roads.filter((r) => r.n);
  function streetAt(x, z) {
    let best = '', bd = 30 * 30;
    for (const rd of named) for (let i = 0; i + 3 < rd.p.length; i += 2) {
      const ax = rd.p[i], az = rd.p[i + 1], dx = rd.p[i + 2] - ax, dz = rd.p[i + 3] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = (ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2;
      if (d < bd) { bd = d; best = rd.n; }
    }
    return best;
  }

  // Свободная точка для старта
  function freeSpot(x0, z0) {
    for (let r = 0; r < 60; r += 1.5) for (let a = 0; a < 6.28; a += 0.5) {
      const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      if (!blocked(x, z) && !blocked(x + 1, z) && !blocked(x - 1, z) && !blocked(x, z + 1) && !blocked(x, z - 1)) return [x, z];
    }
    return [x0, z0];
  }

  // Тёплые блики на мокрой мостовой: в шейдер идут ближайшие к камере фонари
  let tick = 0;
  const lampOrder = lampLights.map((p) => ({ p, d: 0 }));
  function update(dt, hx, hz, camera) {
    sky.update(dt);
    facades.update(camera.position.x, camera.position.z);
    if (hero) {
      const h = hero.position, [, moon, fill, lamp] = heroLights;
      moon.target.position.copy(h); moon.position.copy(h).addScaledVector(sky.moonDirection, 30); moon.target.updateMatrixWorld();
      fill.position.set(h.x + (camera.position.x - h.x) * 0.35, h.y + 2.3, h.z + (camera.position.z - h.z) * 0.35);
      const near = lampOrder[0];
      if (near) { lamp.position.copy(near.p); lamp.intensity = 14; }
    }
    tick -= dt;
    if (tick <= 0) {
      tick = 0.2;
      for (const l of lampOrder) l.d = (l.p.x - camera.position.x) ** 2 + (l.p.z - camera.position.z) ** 2;
      lampOrder.sort((a, c) => a.d - c.d);
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const l = lampOrder[i];
        if (!l) { look.uLightCol.value[i].setRGB(0, 0, 0); continue; }
        look.uLightPos.value[i].set(l.p.x, l.p.y, l.p.z, 10.5);
        look.uLightCol.value[i].setRGB(1.0, 0.64, 0.3, THREE.LinearSRGBColorSpace);
      }
    }
  }
  const paint = (object) => paintObject(object, look);

  // Свет только для героини (живописные материалы его не замечают): небо, луна, мягкая подсветка и ближайший фонарь
  let hero = null;
  const heroLights = [new THREE.HemisphereLight(0x9aa0d8, 0x4a4256, 1.15), new THREE.DirectionalLight(0xb8c0ff, 0.7),
    new THREE.PointLight(0xffddae, 3.2, 7, 1.4), new THREE.PointLight(0xffb066, 0, 14, 1.6)];
  function lightHeroine(root) {
    hero = root;
    heroLights[1].position.copy(sky.moonDirection).multiplyScalar(30);
    for (const l of heroLights) scene.add(l);
  }

  return {
    blocked, inside, streetAt, freeSpot, update, sky, night, look, paint, facades, lightHeroine, heightAt: (x, z) => standAt(x, z),
    stats: { stairs: stairs.count, buildings: polys.length, lamps: lamps.length, detailedLamps, benches: benches.length, pigeons, ...streetLife },
  };
}

// ═══ Геометрия ═══════════════════════════════════════════════
function makePoly(p) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minZ = Math.min(minZ, p[i + 1]); maxZ = Math.max(maxZ, p[i + 1]);
  }
  return { p, minX, maxX, minZ, maxZ };
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

function glowTexture(inner = 'rgba(255,200,120,1)', mid = 'rgba(255,150,60,0.35)') {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(0.25, mid); grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

// ═══ Фонари ══════════════════════════════════════════════════
function buildLamps(scene, lamps, props, random) {
  const n = lamps.length;
  if (!n) return { lights: [], detailed: 0 };
  const variants = [props['lamp-elegance'], props['lamp-vintage'], props['lamp-ornate'], props['lamp-lantern']].filter(Boolean);
  const placements = variants.map(() => []);
  const chosen = new Map();
  if (variants.length) {
    const candidates = lamps.map(([x, z], index) => ({
      index, rank: Math.hypot(x, z) < 30 ? -1 + random() : random(),
    }));
    candidates.sort((a, b) => a.rank - b.rank);
    candidates.slice(0, 60).forEach(({ index }, i) => {
      chosen.set(index, i % variants.length);
    });
  }
  const standardCount = n - chosen.size;
  const black = new THREE.MeshStandardMaterial({ color: 0x0e0e14, roughness: 0.35, metalness: 0.8 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.11, 3.2, 8), black, standardCount);
  const foot = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.2, 0.7, 8), black, standardCount);
  const cap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.3, 0.25, 6), black, standardCount);
  const lantern = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.15, 0.48, 6), new THREE.MeshBasicMaterial({ color: 0xffcf85 }), standardCount);
  const M = new THREE.Matrix4();
  const pts = new Float32Array(n * 3);
  let standardIndex = 0;
  const lights = lamps.map(([x, z, tx, tz], i) => {
    const variant = chosen.get(i);
    let height = 3.42;
    if (variant === undefined) {
      pole.setMatrixAt(standardIndex, M.makeTranslation(x, 1.6, z));
      foot.setMatrixAt(standardIndex, M.makeTranslation(x, 0.35, z));
      lantern.setMatrixAt(standardIndex, M.makeTranslation(x, height, z));
      cap.setMatrixAt(standardIndex, M.makeTranslation(x, 3.78, z));
      standardIndex++;
    } else {
      const [bottom, top] = variants[variant].glassHeight;
      height = (bottom + top) / 2;
      placements[variant].push({ x, z, yaw: Math.atan2(tx, tz) });
    }
    pts.set([x, height, z], i * 3);
    return new THREE.Vector3(x, height, z);
  });
  variants.forEach((variant, i) => addPropInstances(scene, variant, placements[i]));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const glow = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTexture('rgba(255,229,176,0.75)', 'rgba(255,204,122,0.18)'),
    size: 2.8, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  for (const part of [pole, foot, cap, lantern]) part.userData.word = 'lamp';
  glow.renderOrder = 2;
  for (const m of [pole, foot, cap, lantern, glow]) { m.frustumCulled = false; scene.add(m); }
  return { lights, detailed: chosen.size };
}

// ═══ Деревья: платаны «мазками» (как в прототипе experiments/painted-street.html) ═══
function buildTrees(scene, look, flat, inside, rnd, groundAt) {
  const list = [];
  for (let i = 0; i < flat.length; i += 2) if (!inside(flat[i], flat[i + 1])) list.push([flat[i], flat[i + 1]]);
  if (!list.length) return;
  const B = new Builder(), crowns = [], bark = [0.55, 0.49, 0.42];
  // Трубка по точкам [x, y, z, радиус]: ствол и ветви.
  const tube = (ring, sides) => {
    for (let k = 0; k < ring.length - 1; k++) {
      const [ax, ay, az, ar] = ring[k], [bx, by, bz, br] = ring[k + 1];
      for (let s = 0; s < sides; s++) {
        const a0 = s / sides * Math.PI * 2, a1 = (s + 1) / sides * Math.PI * 2;
        B.quad([ax + Math.cos(a0) * ar, ay, az + Math.sin(a0) * ar], [ax + Math.cos(a1) * ar, ay, az + Math.sin(a1) * ar],
          [bx + Math.cos(a1) * br, by, bz + Math.sin(a1) * br], [bx + Math.cos(a0) * br, by, bz + Math.sin(a0) * br], bark, K.BARK);
      }
    }
  };
  for (const [x, z] of list) {
    // платан: стройный ствол с лёгким изгибом и корневым наплывом, на ~2.5 м — развилка из 3–4 ветвей в крону
    const y = groundAt(x, z), fork = 2.3 + rnd() * 0.6;
    const bend = [(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3], phase = rnd() * 6;
    const ring = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, wob = Math.sin(t * 3 + phase) * 0.05;
      ring.push([x + bend[0] * t * t + wob, y - 0.1 + t * (fork + 0.1), z + bend[1] * t * t - wob,
        0.15 * (1 - t * 0.35) + 0.09 * Math.max(0, 1 - t * 6)]);
    }
    tube(ring, 7);
    const [fx, fy, fz] = ring[6], branches = 3 + (rnd() < 0.5 ? 1 : 0), turn = rnd() * Math.PI * 2;
    crowns.push([fx, fy + 2.4, fz, 1.7 + rnd() * 0.4]);
    for (let b = 0; b < branches; b++) {
      const a = turn + b / branches * Math.PI * 2 + (rnd() - 0.5) * 0.8, reach = 1.1 + rnd() * 0.5, rise = 1.4 + rnd() * 0.8;
      const limb = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3, out = reach * Math.sqrt(t);
        limb.push([fx + Math.cos(a) * out, fy - 0.15 + rise * t, fz + Math.sin(a) * out, 0.095 * (1 - t * 0.6)]);
      }
      tube(limb, 5);
      const [ex, ey, ez] = limb[3];
      crowns.push([ex + Math.cos(a) * 0.3, ey + 0.5 + rnd() * 0.4, ez + Math.sin(a) * 0.3, 1.2 + rnd() * 0.45]);
    }
  }
  const trunk = new THREE.Mesh(B.geometry(0, Math.PI / 3), paintMaterial(look));
  const leafTex = leafTexture(3);
  const crown = new THREE.Mesh(foliage(crowns, [0.44, 0.6, 0.42], 7), paintMaterial(look, { map: leafTex }));
  crown.userData.leafMap = leafTex;
  trunk.userData.word = 'trunk'; crown.userData.word = 'tree';
  trunk.userData.noLift = crown.userData.noLift = true;
  scene.add(trunk, crown);
}

// ═══ Кафе и булочные ═════════════════════════════════════════
function buildShops(scene, pois, polys, inside, rnd, props = {}, propRandom = rnd, shopFronts = [], terraces = []) {
  const spots = [];
  const sorted = [...pois].sort((a, c) => Math.hypot(a.x, a.z) - Math.hypot(c.x, c.z)).slice(0, 36);
  const nearestBakery = sorted.find(({ k }) => k === 'bakery');
  if (nearestBakery) sorted.splice(sorted.indexOf(nearestBakery), 1);
  for (const poi of nearestBakery ? [nearestBakery, ...sorted] : sorted) {
    let best = null, bd = 14 * 14;
    for (const poly of polys) {
      if (poi.x < poly.minX - 14 || poi.x > poly.maxX + 14 || poi.z < poly.minZ - 14 || poi.z > poly.maxZ + 14) continue;
      const p = poly.p, n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], dx = p[j * 2] - ax, dz = p[j * 2 + 1] - az;
        const l2 = dx * dx + dz * dz; if (l2 < 9) continue;
        const t = Math.max(0.2, Math.min(0.8, ((poi.x - ax) * dx + (poi.z - az) * dz) / l2));
        const x = ax + dx * t, z = az + dz * t, d = (x - poi.x) ** 2 + (z - poi.z) ** 2;
        if (d < bd) { const len = Math.sqrt(l2); bd = d; best = { x, z, nx: -dz / len, nz: dx / len, len }; }
      }
    }
    if (!best) continue;
    if (inside(best.x + best.nx * 1.2, best.z + best.nz * 1.2)) { best.nx = -best.nx; best.nz = -best.nz; }
    if (inside(best.x + best.nx * 1.2, best.z + best.nz * 1.2)) continue;
    if (spots.some((s) => (s.x - best.x) ** 2 + (s.z - best.z) ** 2 < 30)) continue;
    spots.push({ ...best, name: poi.n || (poi.k === 'bakery' ? 'Boulangerie' : poi.k === 'bar' ? 'Bar' : 'Café'), kind: poi.k });
  }
  if (!spots.length) return null;
  const bakery = spots.find(({ kind }) => kind === 'bakery');

  const n = spots.length;
  const tableTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.35 }), n * 2);
  const tableLeg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.14, 0.72, 6), new THREE.MeshStandardMaterial({ color: 0x15151a, metalness: 0.7, roughness: 0.4 }), n * 2);
  const flower = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: 0x401028, flatShading: true }), n * 6);
  const candles = new Float32Array(n * 2 * 3);
  const candle = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.042, 0.046, 0.11, 8),
    new THREE.MeshStandardMaterial({ color: 0xf1d3a5, emissive: 0x3d2310, roughness: 0.84 }), n * 2);
  candle.userData.word = 'candle';
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), col = new THREE.Color();
  const Yax = new THREE.Vector3(0, 1, 0);
  const PINK = [0xff7fb0, 0xe85a8a, 0xc98be0, 0xff9ac0];

  const terrace = { tables: [], chairs: [] }, crates = [];
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  spots.forEach((s, i) => {
    const w = Math.min(6, Math.max(3.2, s.len * 0.7));
    const yaw = Math.atan2(s.nx, s.nz);                // фасад смотрит вдоль нормали
    const tx = s.nz, tz = -s.nx;                       // направление вдоль стены
    Q.setFromAxisAngle(Yax, yaw);
    // витрина, маркиза и вывеска рисуются вместе с домом (paint/facades.js)
    for (let k = 0; k < 2; k++) {
      const off = (k ? 1 : -1) * (s === bakery ? w * 0.47 : w * 0.28), x = s.x + s.nx * 1.9 + tx * off, z = s.z + s.nz * 1.9 + tz * off;
      // У ближних кафе — мраморный столик и плетёные стулья Meshy, дальше — простой столик (ради телефона)
      const model = i < 14 && props['bistro-table'];
      const tableHeight = model ? 0.74 : 0.76;
      tableTop.setMatrixAt(i * 2 + k, model ? ZERO : M.makeTranslation(x, 0.74, z));
      tableLeg.setMatrixAt(i * 2 + k, model ? ZERO : M.makeTranslation(x, 0.36, z));
      candle.setMatrixAt(i * 2 + k, M.makeTranslation(x, tableHeight + 0.055, z));
      candles.set([x, tableHeight + 0.13, z], (i * 2 + k) * 3);
      if (model) {
        terraceSet(props, x, z, tx, tz, propRandom, terrace);
        const turn = Math.atan2(-tz, tx);
        terraces.push({ x, z, cos: Math.cos(turn), sin: Math.sin(turn), halfWidth: 0.85, halfDepth: 0.35 });
      }
    }
    shopFronts.push({ x: s.x, z: s.z, w, nx: s.nx, nz: s.nz, name: s.name });
    // ящик с яблоками у булочной и у каждой третьей лавки
    if (s === bakery || i % 3 === 1) {
      const off = w / 2 + 0.95;
      crates.push({ x: s.x + s.nx * 0.55 + tx * off, z: s.z + s.nz * 0.55 + tz * off, yaw: yaw + (propRandom() - 0.5) * 0.3 });
    }
    for (let k = 0; k < 6; k++) {                      // гортензии у входа
      const sideS = k < 3 ? -1 : 1, off = sideS * (w / 2 + 0.3);
      const r = 0.5 + rnd() * 0.35;
      M.compose(P.set(s.x + s.nx * (0.5 + rnd() * 0.3) + tx * (off + (rnd() - 0.5) * 0.4), 0.4 + rnd() * 0.45, s.z + s.nz * (0.5 + rnd() * 0.3) + tz * (off + (rnd() - 0.5) * 0.4)), Q, S.set(r, r, r));
      flower.setMatrixAt(i * 6 + k, M);
      flower.setColorAt(i * 6 + k, col.setHex(PINK[Math.floor(rnd() * PINK.length)]));
    }
  });
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(candles, 3));
  const candleGlow = new THREE.Points(cg, new THREE.PointsMaterial({ map: glowTexture(), size: 0.48, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd795, opacity: 0.75 }));
  tableTop.userData.word = tableLeg.userData.word = 'table';
  for (const m of [tableTop, tableLeg, candle, candleGlow]) { m.frustumCulled = false; scene.add(m); }
  addPropInstances(scene, props['bistro-table'], terrace.tables);
  addPropInstances(scene, props['chair-rattan'], terrace.chairs);
  addPropInstances(scene, props['fruit-crate'], crates);
  return bakery;
}

// ═══ Площадь Тертр: мольберты ═════════════════════════════════
function buildEasels(scene, inside, rnd) {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x6a4424, roughness: 0.8 });
  const paints = [0, 1, 2].map((k) => {
    const [c, g] = canvas(96, 128);
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, ['#4a4a9a', '#e8a070', '#7a5aa8'][k]); grd.addColorStop(1, ['#f0c090', '#5a3a70', '#f4d0a0'][k]);
    g.fillStyle = grd; g.fillRect(0, 0, 96, 128);
    const ground = ['#504759', '#4b374b', '#443747'][k];
    g.fillStyle = ground;
    g.beginPath(); g.moveTo(0, 103); g.quadraticCurveTo(44, 68, 96, 97); g.lineTo(96, 128); g.lineTo(0, 128); g.fill();
    if (k === 0) {
      g.fillStyle = '#d8bfa0';
      for (const [x, y, w, h] of [[48, 48, 9, 14], [30, 63, 6, 9], [66, 65, 6, 8]]) {
        g.beginPath(); g.ellipse(x, y, w, h, 0, Math.PI, 0); g.fill();
        g.fillRect(x - w, y - 1, w * 2, 89 - y);
      }
      g.fillStyle = '#534660'; g.fillRect(44, 70, 8, 19);
    } else {
      const skyline = k === 1 ? [29, 37, 34, 48, 26, 33] : [49, 37, 23, 25, 40, 52];
      skyline.forEach((h, i) => {
        const x = 4 + 15 * i, y = 97 - h;
        g.fillStyle = i % 2 ? '#514253' : '#69515c';
        g.fillRect(x, y, 13, h);
        g.beginPath(); g.moveTo(x - 1, y); g.lineTo(x + 6, y - 8); g.lineTo(x + 14, y); g.fill();
        g.fillStyle = '#e8b56e';
        g.fillRect(x + 3, y + 7, 3, 5); g.fillRect(x + 8, y + 18, 3, 5);
      });
    }
    g.strokeStyle = '#bdab93'; g.lineWidth = 7; g.strokeRect(0, 0, 96, 128);
    return new THREE.MeshBasicMaterial({ map: tex(c), color: 0xbcb5ad });
  });
  const frameGeo = new THREE.BoxGeometry(0.06, 1.7, 0.06), canvGeo = new THREE.PlaneGeometry(0.62, 0.8);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + 0.2, r = 9 + (i % 2) * 2.2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inside(x, z)) continue;
    const g = new THREE.Group();
    for (const dx of [-0.26, 0.26]) { const leg = new THREE.Mesh(frameGeo, frameMat); leg.position.set(dx, 0.85, 0); leg.rotation.x = -0.14; g.add(leg); }
    const back = new THREE.Mesh(frameGeo, frameMat); back.position.set(0, 0.8, -0.3); back.rotation.x = 0.35; g.add(back);
    const cv = new THREE.Mesh(canvGeo, paints[i % 3]); cv.position.set(0, 1.15, 0.06); cv.rotation.x = -0.14; g.add(cv);
    g.traverse((part) => { if (part.isMesh) part.userData.word = part === cv ? 'painting' : 'easel'; });
    g.position.set(x, 0, z); g.rotation.y = Math.atan2(x, z) + Math.PI + (rnd() - 0.5) * 0.6;
    scene.add(g);
  }
}

// ═══ Эйфелева башня и огни города ═══════════════════════════
function buildFarParis(scene, drop = 0) {
  const rnd = mulberry(21);
  const [ec, eg] = canvas(128, 384);                                      // Эйфелева башня на юго-западе
  eg.strokeStyle = '#ffc266'; eg.fillStyle = '#ffb347'; eg.shadowColor = '#ff9a30'; eg.shadowBlur = 12; eg.lineWidth = 5;
  eg.beginPath(); eg.moveTo(8, 380); eg.quadraticCurveTo(56, 250, 62, 10); eg.moveTo(120, 380); eg.quadraticCurveTo(72, 250, 66, 10); eg.stroke();
  for (const [y, w] of [[300, 80], [220, 46], [110, 18]]) eg.fillRect(64 - w / 2, y, w, 8);
  eg.lineWidth = 2; for (let y = 40; y < 380; y += 22) { const w = 6 + (y / 380) ** 2 * 50; eg.beginPath(); eg.moveTo(64 - w, y); eg.lineTo(64 + w, y + 22); eg.moveTo(64 + w, y); eg.lineTo(64 - w, y + 22); eg.stroke(); }
  const eiffel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(ec), fog: false, depthWrite: false, transparent: true }));
  eiffel.position.set(-1050, 78 + drop, 1050); eiffel.userData.noLift = true; eiffel.scale.set(55, 165, 1); eiffel.userData.word = 'eiffel'; scene.add(eiffel);

  const m = 500, lp = new Float32Array(m * 3);                            // огни города на горизонте
  for (let i = 0; i < m; i++) { const a = rnd() * Math.PI * 2, r = 700 + rnd() * 700; lp.set([Math.cos(a) * r, drop + 4 + rnd() * 22, Math.sin(a) * r], i * 3); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({
    map: glowTexture('rgba(255,228,174,0.8)', 'rgba(255,205,133,0.40)'),
    size: 3, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false, opacity: 0.65,
  }));
  lights.frustumCulled = false; lights.userData.noLift = true; scene.add(lights);
}

// ═══ Столбики вдоль улиц ═════════════════════════════════════
function buildBollards(scene, lamps, inside) {
  const list = [];
  for (const [x, z, tx, tz] of lamps) for (const d of [-4.5, -2.25, 2.25, 4.5]) {
    const bx = x + tx * d, bz = z + tz * d;
    if (!inside(bx, bz) && !inside(bx + 0.3, bz) && !inside(bx - 0.3, bz) && !inside(bx, bz + 0.3) && !inside(bx, bz - 0.3)) list.push([bx, bz]);
  }
  if (!list.length) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0x0e0e14, roughness: 0.3, metalness: 0.85 });
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.85, 8), mat, list.length);
  const ball = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), mat, list.length);
  const M = new THREE.Matrix4();
  list.forEach(([x, z], i) => { post.setMatrixAt(i, M.makeTranslation(x, 0.42, z)); ball.setMatrixAt(i, M.makeTranslation(x, 0.9, z)); });
  post.frustumCulled = ball.frustumCulled = false;
  post.userData.word = ball.userData.word = 'bollard';
  scene.add(post, ball);
}

// ═══ Плющ и глициния на стенах ═══════════════════════════════
function vineTexture(kind, seed) {
  const [c, g] = canvas(256, 256), rnd = mulberry(seed);
  const leaves = kind === 'ivy' ? [[110, 32, 26], [105, 28, 32], [95, 30, 22], [70, 34, 30], [32, 45, 36], [18, 55, 34]] : [[275, 45, 62], [268, 40, 55], [282, 50, 70], [262, 35, 48], [110, 25, 30]];
  const leaf = (x, y, r, a, [h, sat, l]) => {                          // лист: заострённый, с тенью и прожилкой
    g.save(); g.translate(x, y); g.rotate(a);
    const grd = g.createLinearGradient(-r, -r, r, r);
    grd.addColorStop(0, `hsl(${h},${sat}%,${l + 8}%)`); grd.addColorStop(1, `hsl(${h},${sat}%,${l - 9}%)`);
    g.fillStyle = grd;
    g.beginPath();
    if (kind === 'ivy') { g.moveTo(0, -r); g.quadraticCurveTo(r * 0.9, -r * 0.5, r * 0.75, r * 0.3); g.quadraticCurveTo(r * 0.3, r * 0.5, 0, r); g.quadraticCurveTo(-r * 0.3, r * 0.5, -r * 0.75, r * 0.3); g.quadraticCurveTo(-r * 0.9, -r * 0.5, 0, -r); }
    else g.ellipse(0, 0, r * 0.45, r, 0, 0, 6.3);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -r * 0.8); g.lineTo(0, r * 0.8); g.stroke();
    g.restore();
  };
  g.strokeStyle = 'rgba(55,40,30,0.9)'; g.lineWidth = 1.4;
  for (let k = 0; k < 11; k++) {                                       // свисающие плети
    let x = 14 + rnd() * 228, y = 0; const len = 90 + rnd() * 160;
    const pts = [];
    while (y < len) { pts.push([x, y]); x += (rnd() - 0.5) * 8; y += 5 + rnd() * 4; }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [px, py] of pts) g.lineTo(px, py); g.stroke();
    for (const [px, py] of pts) {
      const taper = 1 - py / len * 0.55;
      for (let q = 0; q < 2; q++) {
        const r = (kind === 'ivy' ? 6 + rnd() * 4 : 4 + rnd() * 3) * taper;
        leaf(px + (rnd() - 0.5) * 18 * taper, py + rnd() * 6, r, (rnd() - 0.5) * 2.2, leaves[Math.floor(rnd() * leaves.length)]);
      }
    }
  }
  for (let k = 0; k < 120; k++) leaf(rnd() * 256, rnd() * 30, 6 + rnd() * 4, rnd() * 6.3, leaves[Math.floor(rnd() * leaves.length)]);   // гуща у карниза
  return tex(c);
}
function buildVines(scene, spots, inside, rnd) {
  const pick = spots.filter(([x, z, nx, nz]) => !inside(x + nx * 1.5, z + nz * 1.5) && !inside(x + nx * 3.5, z + nz * 3.5) && rnd() < 0.3).slice(0, 220);
  if (!pick.length) return;
  const geo = new THREE.PlaneGeometry(1, 1);
  const kinds = [['ivy', 41], ['wisteria', 42]].map(([k, sd]) => new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
    map: vineTexture(k, sd), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9,
    emissive: k === 'ivy' ? 0x1a1208 : 0x1e1030, emissiveIntensity: 0.8,
  }), pick.length));
  const count = [0, 0];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Yax = new THREE.Vector3(0, 1, 0);
  for (const [x, z, nx, nz, len, H] of pick) {
    const k = rnd() < 0.62 ? 0 : 1, w = Math.min(len * 0.8, 3.5 + rnd() * 3), h = 3 + rnd() * 2.6;
    const topY = Math.min(H, 3.2 + rnd() * 4.5), sh = (rnd() - 0.5) * (len - w) * 0.6;
    Q.setFromAxisAngle(Yax, Math.atan2(nx, nz));
    M.compose(P.set(x + nx * 0.2 + nz * sh, topY - h / 2, z + nz * 0.2 - nx * sh), Q, S.set(w, h, 1));
    kinds[k].setMatrixAt(count[k]++, M);
  }
  kinds.forEach((m, i) => {
    m.count = count[i]; m.frustumCulled = false;
    m.userData.word = i === 0 ? 'ivy' : 'wisteria';
    scene.add(m);
  });
}

// ═══ Таблички с названиями улиц ═══════════════════════════════
function plaqueTexture(name) {
  const [c, g] = canvas(256, 160);
  g.fillStyle = '#2c6a4e'; g.beginPath(); g.roundRect(4, 26, 248, 130, 8); g.fill();
  g.beginPath(); g.ellipse(128, 30, 46, 26, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#1c2a6e'; g.beginPath(); g.roundRect(13, 35, 230, 112, 5); g.fill();
  g.beginPath(); g.ellipse(128, 34, 38, 20, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#f4f1e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 15px Georgia, serif'; g.fillText('18ᵉ Arrᵗ', 128, 28);
  const words = name.toUpperCase().split(' ');
  const lines = [];
  if (words.length > 1) { lines.push(words[0]); const rest = words.slice(1).join(' '); if (rest.length > 12 && words.length > 2) { lines.push(words.slice(1, -1).join(' '), words[words.length - 1]); } else lines.push(rest); } else lines.push(words[0]);
  lines.forEach((ln, i) => {
    let size = i === 0 && lines.length > 1 ? 20 : 30;
    do { g.font = `700 ${size}px Georgia, serif`; size -= 2; } while (g.measureText(ln).width > 214 && size > 10);
    g.fillText(ln, 128, 92 + (i - (lines.length - 1) / 2) * 30);
  });
  return tex(c);
}
function buildPlaques(scene, roads, polys, inside) {
  const seen = new Map(), geo = new THREE.PlaneGeometry(1.15, 0.72);
  let made = 0;
  const sorted = roads.filter((r) => r.n && r.p.length >= 4).sort((a, c) => Math.hypot(a.p[0], a.p[1]) - Math.hypot(c.p[0], c.p[1]));
  for (const rd of sorted) {
    if ((seen.get(rd.n) || 0) >= 2 || made >= 60) continue;
    const rx = rd.p[0], rz = rd.p[1];
    let best = null, bd = 11 * 11;
    for (const poly of polys) {
      if (rx < poly.minX - 11 || rx > poly.maxX + 11 || rz < poly.minZ - 11 || rz > poly.maxZ + 11) continue;
      const p = poly.p, n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], dx = p[j * 2] - ax, dz = p[j * 2 + 1] - az, l2 = dx * dx + dz * dz;
        if (l2 < 6) continue;
        const t = Math.max(0.15, Math.min(0.85, ((rx - ax) * dx + (rz - az) * dz) / l2));
        const x = ax + dx * t, z = az + dz * t, d = (x - rx) ** 2 + (z - rz) ** 2;
        if (d < bd) { const len = Math.sqrt(l2); bd = d; best = { x, z, nx: -dz / len, nz: dx / len }; }
      }
    }
    if (!best) continue;
    if ((rx - best.x) * best.nx + (rz - best.z) * best.nz < 0) { best.nx = -best.nx; best.nz = -best.nz; }
    if (inside(best.x + best.nx * 0.8, best.z + best.nz * 0.8)) continue;
    if (!seen.has(rd.n)) seen.set(rd.n, 0);
    const mat = seen.get('tex:' + rd.n) || new THREE.MeshBasicMaterial({ map: plaqueTexture(rd.n), transparent: true, color: 0xd8d0e8 });
    seen.set('tex:' + rd.n, mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(best.x + best.nx * 0.16, 2.75, best.z + best.nz * 0.16);
    m.rotation.y = Math.atan2(best.nx, best.nz);
    m.userData.word = 'plaque';
    scene.add(m);
    seen.set(rd.n, seen.get(rd.n) + 1); made++;
  }
}

// ═══ Сакре-Кёр: та же рисованная базилика, что в прототипе, — белый камень, подсвечена снизу ═══
function buildBasilica(scene, look, x, z) {
  const m = basilicaMesh(paintMaterial(look));
  m.position.set(x, -1, z); m.rotation.y = Math.PI / 2; m.scale.setScalar(1.8);
  m.userData.word = 'basilica';
  scene.add(m);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,224,176,0.10)', 'rgba(255,207,144,0.04)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(x, 45, z); halo.scale.set(200, 180, 1);
  scene.add(halo);
}
