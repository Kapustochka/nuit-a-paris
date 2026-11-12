// world.js — ночной Монмартр по настоящей карте, в стиле концепт-арта:
// фиолетовое небо, тёплые фонари, мокрая брусчатка, кремовые дома со ставнями, бордовые маркизы.
import * as THREE from 'three';
import { toXZ } from './osm.js';
import { createNightSky } from './night-sky.js';
import { facadeWord } from './facade-words.js';
import { buildBakeryCounter } from './bakery.js';
import { addPropInstances, placeBenches, placePigeons } from './street-props.js';
import { placeStreetLife, terraceSet } from './street-life.js';

const FLOOR = 3.2;            // высота этажа, м
const ROOF = 2.8;             // высота мансарды
const GROUND = 3.7;           // высота первого этажа
const CELL = 24;              // ячейка сетки для столкновений
const BURGUNDY = 0x7a1730;

export function buildParis(scene, renderer, data, city, props = {}) {
  const sky = createNightSky(scene);
  scene.fog = new THREE.FogExp2(0x333858, 0.009);

  // ── Свет ────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x8a9acb, 0x53515a, 1.22));
  const moon = new THREE.DirectionalLight(0xb1c5ff, 0.58);
  const moonOffset = sky.moonDirection.clone().multiplyScalar(36);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  const sc = moon.shadow.camera;
  sc.left = sc.bottom = -9; sc.right = sc.top = 9; sc.near = 1; sc.far = 70;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const fill = new THREE.PointLight(0xffddae, 4.5, 8, 1.4);   // мягкая подсветка героини
  scene.add(fill);

  // ── Земля: мокрая брусчатка ───────────────────────────────
  const b = data.bounds;
  const cob = cobbleTexture();
  cob.wrapS = cob.wrapT = THREE.RepeatWrapping;
  cob.repeat.set(1400 / 1.1, 1400 / 1.1);
  cob.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ map: cob, color: 0x9a9da5, roughness: 0.69 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.word = 'cobble';
  scene.add(ground);

  // ── Дома: нарисованные фасады (из моделей Meshy) на настоящих контурах ──
  const rnd = mulberry(7);
  const polys = [];                       // для столкновений
  const cards = newBuf(), caps = newBuf();
  const wallSpots = [];
  const SACRE = toXZ(48.88672, 2.34306);
  const FAC = Object.entries(city.facades).map(([name, f]) => ({ name, ...f }));
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
  let benches = [], bakery = null;
  const solids = [];                       // киоск, урны, велосипеды, скутеры, горшки
  const hitsBox = (x, z, box) => {
    const dx = x - box.x, dz = z - box.z;
    return Math.abs(dx * box.cos - dz * box.sin) < box.halfWidth + R &&
           Math.abs(dx * box.sin + dz * box.cos) < box.halfDepth + R;
  };
  const blocked = (x, z) =>
    x < b.minX + 8 || x > b.maxX - 8 || z < b.minZ + 8 || z > b.maxZ - 8 ||
    inside(x, z) || inside(x + R, z) || inside(x - R, z) || inside(x, z + R) || inside(x, z - R) ||
    (bakery?.blocks(x, z) ?? false) || benches.some((bench) => hitsBox(x, z, bench)) || solids.some((box) => hitsBox(x, z, box));

  // ── Стены-открытки: на каждую грань дома подбираем целые нарисованные фасады ──
  const SPLIT = city.split;                                   // нижняя доля фасада рисуется из чёткой текстуры
  const FANCY = FAC.filter((f) => !f.plain), PLAIN = FAC.find((f) => f.plain) || FAC[0];
  const upper = newBuf();
  const facadeTiles = [];
  // Фасад можно резать только между окнами. Куски: целый фасад или несколько соседних «окон-секций».
  const CUTS = { pharmacy_v0: [0.38, 0.61], pharmacy_v1: [0.58], facade_v0: [0.375, 0.607], facade_v1: [0.377, 0.603],
    townhouse_v0: [0.44], townhouse_v2: [0.54], haussmann_v0: [0.286, 0.4985, 0.709], haussmann_v2: [0.286, 0.4985, 0.709] };
  const UNITS = [];
  for (const f of FANCY) {
    const c = [0, ...(CUTS[f.name] || []), 1];
    for (let i = 0; i < c.length - 1; i++) for (let j = i + 1; j < c.length; j++) {
      const full = i === 0 && j === c.length - 1, u = { f, uA: c[i], uB: c[j], w: f.aspect * (c[j] - c[i]), full };
      UNITS.push(u); if (full) UNITS.push(u, u);            // целые фасады встречаются чаще
    }
  }
  function addCard(f, x0, z0, x1, z1, H, nx, nz, tint, uA = 0, uB = 1) {
    facadeTiles.push(f);
    const hs = H * SPLIT, du = f.u1 - f.u0, dg = f.gu1 - f.gu0;
    quad(cards, x0, z0, x1, z1, 0, hs, nx, nz, f.gu0 + dg * uA, f.gu0 + dg * uB, f.gv0, f.gv1, tint, tint);
    quad(upper, x0, z0, x1, z1, hs, H, nx, nz, f.u0 + du * uA, f.u0 + du * uB, f.v0 + (f.v1 - f.v0) * SPLIT, f.v1, tint, tint);
  }
  for (const { p, n, H, tint } of pending) {
    const fit = UNITS.filter((u) => H / u.f.h > 0.72 && H / u.f.h < 1.3);
    const units = fit.length ? fit : UNITS;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.4) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const open = !inside(mx + nx * 1.2, mz + nz * 1.2);   // смотрит на улицу или во двор, а не в соседний дом
      // пробуем несколько случайных наборов и берём тот, что ложится почти без растяжения
      let best = null, bestErr = 1e9;
      if (open) for (let t = 0; t < 24; t++) {
        const segs = []; let sum = 0;
        for (let guard = 0; guard < 60 && segs.length < 16; guard++) {
          const u = units[Math.floor(rnd() * units.length)];
          if (u.f.shop && rnd() < 0.5) continue;
          const w = u.w * H;
          if (sum + w * 0.5 > L && segs.length) break;
          segs.push(u); sum += w;
          if (sum >= L) break;
        }
        if (!segs.length) continue;
        const err = Math.abs(Math.log(L / sum)) + (segs.length > 1 && segs.every((u) => !u.full) ? 0.04 : 0);
        if (err < bestErr) { bestErr = err; best = { segs, sum }; }
        if (err < 0.08) break;
      }
      if (best && bestErr < 0.3) {                        // растяжение не больше ~30%
        let d = 0;
        for (const u of best.segs) {
          const w = u.w * H * (L / best.sum);
          addCard(u.f, ax + tx * d, az + tz * d, ax + tx * (d + w), az + tz * (d + w), H, nx, nz, tint, u.uA, u.uB);
          d += w;
        }
        if (L > 5) wallSpots.push([mx, mz, nx, nz, L, H * 0.5]);
      } else {                                            // короткая или глухая стена — ровная кладка без окон
        const natW = PLAIN.aspect * H, m = Math.max(1, Math.round(L / natW));
        const frac = Math.min(1, L / (natW * m));
        for (let k = 0; k < m; k++) {
          const d0 = L * k / m, d1 = L * (k + 1) / m;
          addCard(PLAIN, ax + tx * d0, az + tz * d0, ax + tx * d1, az + tz * d1, H, nx, nz, tint, 0.5 - frac / 2, 0.5 + frac / 2);
        }
      }
    }
    // тёмная крышка — закрывает дом сверху
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
    const base = caps.pos.length / 3, capY = H * 0.6;
    for (const v of contour) { caps.pos.push(v.x, capY, v.y); caps.nor.push(0, 1, 0); caps.uv.push(0, 0); caps.col.push(1, 1, 1); }
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const [a, c2, d2] = t.map((k) => contour[k]);
      const up = (c2.x - a.x) * (d2.y - a.y) - (c2.y - a.y) * (d2.x - a.x) < 0;
      caps.idx.push(base + t[0], base + (up ? t[1] : t[2]), base + (up ? t[2] : t[1]));
    }
  }
  const cardMat = (map) => new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, vertexColors: true });
  const cardMesh = new THREE.Mesh(toGeo(cards), cardMat(city.groundTex));
  const upperMesh = new THREE.Mesh(toGeo(upper), cardMat(city.facadeTex));
  const capMesh = new THREE.Mesh(toGeo(caps), new THREE.MeshBasicMaterial({ color: 0x15173a }));
  cardMesh.userData.word = ({ faceIndex, uv }) => facadeWord(facadeTiles[Math.floor(faceIndex / 2)], uv, true, SPLIT);
  upperMesh.userData.word = ({ faceIndex, uv }) => facadeWord(facadeTiles[Math.floor(faceIndex / 2)], uv, false, SPLIT);
  capMesh.userData.word = 'roof';
  scene.add(cardMesh, upperMesh, capMesh);

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
  buildBollards(scene, lamps, inside);
  benches = placeBenches(props['park-bench'], data.roads, lamps, data.trees, blocked, propRandom);
  addPropInstances(scene, props['park-bench'], benches);
  const pigeons = placePigeons(scene, props, benches, blocked, propRandom);
  buildVines(scene, wallSpots, inside, rnd);
  buildPlaques(scene, data.roads, polys, inside);

  // Три настоящих источника света «переезжают» к ближайшим фонарям — так телефон не устаёт
  const pool = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffbd75, 0, 15, 1.7); scene.add(l); return l; });

  // ── Деревья ──────────────────────────────────────────────
  buildTrees(scene, data.trees.length ? data.trees : [], inside, rnd);

  // ── Кафе, бистро, булочные (настоящие названия) ───────────
  const shopFronts = [], terraces = [];
  const shop = buildShops(scene, data.pois, polys, inside, rnd, props, propRandom, shopFronts, terraces);
  bakery = buildBakeryCounter(scene, shop, blocked, props.croissant);
  if (props['chair-rattan']) solids.push(...terraces);     // за столики со стульями не заходим

  // ── Мелочи улицы из моделей Meshy ──────────────────────────
  const streetLife = placeStreetLife(scene, props, { benches, lamps, wallSpots, shopFronts, blocked, solids, random: propRandom });

  // ── Площадь Тертр: мольберты художников ───────────────────
  buildEasels(scene, inside, rnd);

  // ── Сакре-Кёр, Эйфелева башня и огни вдали ─────────────────
  buildSacreCards(scene, SACRE[0], SACRE[1], city);
  buildFarParis(scene);

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

  let tick = 0;
  function update(dt, hx, hz, camera) {
    sky.update(dt);
    moon.target.position.set(hx, 0, hz);
    moon.position.copy(moon.target.position).add(moonOffset);
    fill.position.set(hx + (camera.position.x - hx) * 0.35, 2.3, hz + (camera.position.z - hz) * 0.35);
    tick -= dt;
    if (tick <= 0) {
      tick = 0.25;
      const near = lampLights.map((l) => [l.distanceToSquared(fill.position), l]).sort((a, c) => a[0] - c[0]).slice(0, pool.length);
      pool.forEach((l, i) => {
        if (near[i]) { l.position.copy(near[i][1]); l.intensity = 12; } else l.intensity = 0;
      });
    }
  }

  return {
    blocked, inside, streetAt, freeSpot, update, sky, bakery,
    stats: { buildings: polys.length, lamps: lamps.length, detailedLamps, benches: benches.length, pigeons, ...streetLife },
  };
}

// ═══ Геометрия ═══════════════════════════════════════════════
const newBuf = () => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
function quad(g, ax, az, bx, bz, y0, y1, nx, nz, u0, u1, v0, v1, c0, c1) {
  const i = g.pos.length / 3;
  g.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
  for (let k = 0; k < 4; k++) g.nor.push(nx, 0, nz);
  g.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
  g.col.push(...c0, ...c0, ...c1, ...c1);
  g.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
function quad4(g, a, b, c, d, n, u0, u1, v0, v1, c0, c1) {      // a, b — низ; c над b; d над a
  const i = g.pos.length / 3;
  g.pos.push(...a, ...b, ...c, ...d);
  for (let k = 0; k < 4; k++) g.nor.push(...n);
  g.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
  g.col.push(...c0, ...c0, ...c1, ...c1);
  g.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
// Карниз: выступающая полочка вдоль стены (лицо, низ и верх)
function ledge(g, ax, az, bx, bz, tx, tz, nx, nz, y0, y1, off, col) {
  const ex = tx * off, ez = tz * off;
  const oax = ax + nx * off - ex, oaz = az + nz * off - ez, obx = bx + nx * off + ex, obz = bz + nz * off + ez;
  const dark = col.map((v) => v * 0.6);
  quad4(g, [oax, y0, oaz], [obx, y0, obz], [obx, y1, obz], [oax, y1, oaz], [nx, 0, nz], 0, 1, 0, 1, col, col);
  quad4(g, [ax - ex, y0, az - ez], [bx + ex, y0, bz + ez], [obx, y0, obz], [oax, y0, oaz], [0, -1, 0], 0, 1, 0, 1, dark, dark);
  quad4(g, [oax, y1, oaz], [obx, y1, obz], [bx + ex, y1, bz + ez], [ax - ex, y1, az - ez], [0, 1, 0], 0, 1, 0, 1, col, col);
}
function toGeo(g) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.setIndex(g.idx);
  return geo;
}
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

// ═══ Текстуры (рисуем сами, без картинок из интернета) ═════════
function cobbleTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#1b1c22'; g.fillRect(0, 0, 512, 512);
  const rnd = mulberry(3), n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = -1; x < n; x++) {
    const off = (y % 2) * s / 2, px = x * s + off + 3, py = y * s + 3, w = s - 6;
    const l = 31 + rnd() * 14, hue = 204 + rnd() * 30;
    const grd = g.createLinearGradient(px, py, px + w, py + w);
    grd.addColorStop(0, `hsl(${hue},9%,${l + 10}%)`); grd.addColorStop(1, `hsl(${hue},10%,${l - 6}%)`);
    g.fillStyle = grd;
    g.beginPath(); g.roundRect(px, py, w, w, 13); g.fill();
    g.fillStyle = 'rgba(199,205,218,0.08)';
    g.beginPath(); g.ellipse(px + w * 0.4, py + w * 0.35, w * 0.28, w * 0.16, -0.5, 0, 6.3); g.fill();
  }
  return tex(c);
}

// Три стиля фасадов Монмартра
const FACADES = [
  { base: '#dccaa8', shutters: ['#8791ad', '#7c88a6'], balcony: true, lit: 0.5, flowers: 0.35, tall: 0.66 },   // кремовый камень, серо-голубые ставни
  { base: '#e3bfa9', shutters: ['#f1e9da', '#e9dfcf'], balcony: false, lit: 0.42, flowers: 0.6, tall: 0.56 },  // розовая штукатурка, белые ставни
  { base: '#cfc7c2', shutters: null, balcony: true, lit: 0.58, flowers: 0.2, tall: 0.74 },                     // серый камень, высокие окна без ставней
];

function stoneBase(g, W, H, base, rnd, block = 18) {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {                                    // пятна старой штукатурки
    g.fillStyle = `rgba(${80 + rnd() * 90},${60 + rnd() * 60},${70 + rnd() * 80},${0.03 + rnd() * 0.05})`;
    g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 10 + rnd() * 50, 6 + rnd() * 22, rnd() * 3, 0, 6.3); g.fill();
  }
  g.strokeStyle = 'rgba(110,85,80,0.2)'; g.lineWidth = 1;            // кладка со сдвигом рядов
  for (let y = 0, r = 0; y < H; y += block, r++) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    for (let x = (r % 2) * block; x < W; x += block * 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + block); g.stroke(); }
  }
}
function warmWindow(g, ge, x, y, w, h, curtains = true) {
  const grd = g.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, '#ffe7ad'); grd.addColorStop(0.6, '#ffb955'); grd.addColorStop(1, '#f08f34');
  for (const c of [g, ge]) {                                         // ореол на стене вокруг окна
    const halo = c.createRadialGradient(x + w / 2, y + h / 2, w * 0.3, x + w / 2, y + h / 2, h * 0.95);
    halo.addColorStop(0, c === g ? 'rgba(255,170,80,0.38)' : 'rgba(255,150,60,0.2)'); halo.addColorStop(1, 'rgba(255,150,60,0)');
    c.fillStyle = halo; c.fillRect(x - h, y - h * 0.5, w + h * 2, h * 2);
    c.fillStyle = grd; c.fillRect(x, y, w, h);
  }
  if (curtains) {
    g.fillStyle = 'rgba(255,244,220,0.6)';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.36, y); g.quadraticCurveTo(x + w * 0.3, y + h * 0.6, x, y + h * 0.85); g.fill();
    g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w * 0.64, y); g.quadraticCurveTo(x + w * 0.7, y + h * 0.6, x + w, y + h * 0.85); g.fill();
  }
}

function facadeTextures(st, seed) {
  const W = 512, Hh = 512, [c, g] = canvas(W, Hh), [e, ge] = canvas(W, Hh);
  const rnd = mulberry(seed);
  stoneBase(g, W, Hh, st.base, rnd);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, Hh);
  const bw = W / 4, fh = Hh / 4;
  for (let f = 0; f < 4; f++) {
    const y0 = f * fh;
    g.fillStyle = 'rgba(255,245,225,0.25)'; g.fillRect(0, y0 + fh - 7, W, 3);    // поясок между этажами
    g.fillStyle = 'rgba(70,50,60,0.3)'; g.fillRect(0, y0 + fh - 4, W, 4);
    for (let bcol = 0; bcol < 4; bcol++) {
      const w = bw * 0.36, x = bcol * bw + (bw - w) / 2, h = fh * st.tall, y = y0 + fh * 0.9 - h - 6;
      const lit = rnd() < st.lit;
      g.fillStyle = 'rgba(255,248,232,0.5)'; g.fillRect(x - 6, y - 7, w + 12, h + 12);   // каменный наличник
      g.fillStyle = 'rgba(60,45,55,0.35)'; g.fillRect(x - 6, y + h + 5, w + 12, 3);
      if (lit) warmWindow(g, ge, x, y, w, h);
      else { const d = g.createLinearGradient(x, y, x + w, y + h); d.addColorStop(0, '#22264a'); d.addColorStop(1, '#12142c'); g.fillStyle = d; g.fillRect(x, y, w, h); }
      g.strokeStyle = lit ? '#6a4426' : '#33324e'; g.lineWidth = 3;   // переплёт
      g.strokeRect(x, y, w, h);
      g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h);
      for (const k of [0.33, 0.66]) { g.moveTo(x, y + h * k); g.lineTo(x + w, y + h * k); }
      g.stroke();
      if (st.shutters) for (const [sx, col] of [[x - w * 0.47, st.shutters[0]], [x + w + w * 0.05, st.shutters[1]]]) {   // ставни
        g.fillStyle = col; g.fillRect(sx, y, w * 0.42, h);
        g.strokeStyle = 'rgba(30,30,60,0.4)'; g.lineWidth = 1;
        for (let k = 5; k < h - 2; k += 5) { g.beginPath(); g.moveTo(sx + 3, y + k); g.lineTo(sx + w * 0.42 - 3, y + k); g.stroke(); }
        g.strokeStyle = 'rgba(20,20,40,0.5)'; g.strokeRect(sx, y, w * 0.42, h);
      }
      const bx0 = x - w * 0.55, bwid = w * 2.1, by = y + h * 0.7;
      if (st.balcony) {                                               // кованый балкончик с завитками
        g.fillStyle = '#121218'; g.fillRect(bx0, y + h + 1, bwid, 4); g.fillRect(bx0, by, bwid, 2.5);
        g.strokeStyle = '#121218'; g.lineWidth = 1.4;
        for (let k = 0; k <= 12; k++) {
          const px = bx0 + k * bwid / 12;
          g.beginPath(); g.moveTo(px, by); g.lineTo(px, y + h + 1); g.stroke();
          if (k < 12) { g.beginPath(); g.arc(px + bwid / 24, by + (y + h - by) * 0.5, bwid / 30, 0, 6.3); g.stroke(); }
        }
      }
      if (rnd() < st.flowers) {                                       // ящик с цветами
        g.fillStyle = '#4a2f24'; g.fillRect(x - 6, y + h - 3, w + 12, 8);
        for (let k = 0; k < 26; k++) {
          g.fillStyle = ['#ff7fb0', '#e85a8a', '#d9a0f0', '#ff9a6a', '#4f8a4a', '#3f7a44'][Math.floor(rnd() * 6)];
          g.beginPath(); g.arc(x - 8 + rnd() * (w + 16), y + h - 4 - rnd() * 9, 3 + rnd() * 3, 0, 6.3); g.fill();
        }
      }
    }
  }
  return { map: wrap(tex(c)), emissive: wrap(tex(e)) };
}

// Первый этаж: 16 метров на плитку — окно, дверь, окно, фонарь на стене, витрина, окно, вторая дверь
function groundFloorTextures() {
  const W = 1024, Hh = 256, [c, g] = canvas(W, Hh), [e, ge] = canvas(W, Hh);
  const rnd = mulberry(31), m = W / 16;                               // m — пикселей в метре
  stoneBase(g, W, Hh, '#d3c1a3', rnd, 26);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(60,45,60,0.5)'; g.fillRect(0, Hh - 22, W, 22);   // тёмный цоколь
  const base = Hh - 22;
  const windowAt = (xm, lit) => {
    const w = 1.1 * m, h = 1.75 * m, x = xm * m - w / 2, y = base - 0.75 * m - h;
    g.fillStyle = 'rgba(255,248,232,0.5)'; g.fillRect(x - 6, y - 7, w + 12, h + 13);
    if (lit) warmWindow(g, ge, x, y, w, h); else { g.fillStyle = '#171a36'; g.fillRect(x, y, w, h); }
    g.strokeStyle = lit ? '#6a4426' : '#33324e'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
    g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.moveTo(x, y + h * 0.4); g.lineTo(x + w, y + h * 0.4); g.stroke();
    for (const sx of [x - w * 0.5, x + w + 3]) {
      g.fillStyle = '#7f8aa8'; g.fillRect(sx, y, w * 0.46, h);
      g.strokeStyle = 'rgba(30,30,60,0.4)'; g.lineWidth = 1;
      for (let k = 5; k < h - 2; k += 5) { g.beginPath(); g.moveTo(sx + 3, y + k); g.lineTo(sx + w * 0.46 - 3, y + k); g.stroke(); }
    }
    g.fillStyle = '#4a2f24'; g.fillRect(x - 8, y + h + 2, w + 16, 9);                 // цветы под окном
    for (let k = 0; k < 30; k++) { g.fillStyle = ['#ff7fb0', '#e85a8a', '#d9a0f0', '#4f8a4a'][Math.floor(rnd() * 4)]; g.beginPath(); g.arc(x - 10 + rnd() * (w + 20), y + h - rnd() * 10, 3 + rnd() * 3.5, 0, 6.3); g.fill(); }
  };
  const doorAt = (xm, col) => {
    const w = 1.25 * m, h = 2.5 * m, x = xm * m - w / 2, y = base - h;
    g.fillStyle = 'rgba(255,248,232,0.55)'; g.fillRect(x - 9, y - 10, w + 18, h + 10);
    g.fillStyle = col; g.fillRect(x, y, w, h);
    warmWindow(g, ge, x + 6, y + 6, w - 12, 0.42 * m, false);                          // светящаяся фрамуга
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (const [px, py, pw, ph] of [[0.1, 0.24, 0.35, 0.3], [0.55, 0.24, 0.35, 0.3], [0.1, 0.6, 0.35, 0.33], [0.55, 0.6, 0.35, 0.33]]) g.strokeRect(x + w * px, y + h * py, w * pw, h * ph);
    g.fillStyle = '#d9b25a'; g.beginPath(); g.arc(x + w * 0.5 + 6, y + h * 0.56, 3.5, 0, 6.3); g.fill();
    g.fillStyle = 'rgba(40,30,40,0.55)'; g.fillRect(x - 12, base - 5, w + 24, 5);
  };
  const lanternAt = (xm) => {                                          // настенный фонарь с ореолом
    const x = xm * m, y = base - 2.55 * m;
    for (const cc of [g, ge]) {
      const halo = cc.createRadialGradient(x, y, 2, x, y, 1.9 * m);
      halo.addColorStop(0, cc === g ? 'rgba(255,190,100,0.8)' : 'rgba(255,170,80,0.55)'); halo.addColorStop(1, 'rgba(255,150,60,0)');
      cc.fillStyle = halo; cc.fillRect(x - 2 * m, y - 2 * m, 4 * m, 4 * m);
    }
    g.strokeStyle = '#101016'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 16, y - 22); g.quadraticCurveTo(x, y - 30, x, y - 12); g.stroke();
    g.fillStyle = '#101016'; g.beginPath(); g.moveTo(x - 9, y - 12); g.lineTo(x + 9, y - 12); g.lineTo(x + 6, y + 12); g.lineTo(x - 6, y + 12); g.fill();
    for (const cc of [g, ge]) { cc.fillStyle = '#ffe6a8'; cc.fillRect(x - 5, y - 8, 10, 17); }
  };
  const shopAt = (xm) => {                                             // тёмно-зелёная витрина
    const w = 3.2 * m, h = 2.7 * m, x = xm * m - w / 2, y = base - h;
    g.fillStyle = '#1f3a34'; g.fillRect(x, y, w, h);
    for (let k = 0; k < 3; k++) {
      const px = x + 8 + k * (w - 16) / 3, pw = (w - 16) / 3 - 6;
      warmWindow(g, ge, px, y + 0.5 * m, pw, h - 1.05 * m, false);
      g.fillStyle = 'rgba(70,30,10,0.5)'; g.fillRect(px, y + h * 0.62, pw, 4);
      for (let q = 0; q < 5; q++) { g.fillStyle = 'rgba(120,60,20,0.55)'; g.beginPath(); g.ellipse(px + 8 + q * pw / 5, y + h * 0.6, 6, 4, 0, 0, 6.3); g.fill(); }
    }
    g.fillStyle = '#e9d7a6'; g.font = 'italic 600 21px Georgia, serif'; g.textAlign = 'center'; g.fillText('Épicerie fine', x + w / 2, y + 0.36 * m);
  };
  windowAt(1.3, true); doorAt(3.4, '#1f3550'); windowAt(5.5, false); lanternAt(6.9);
  shopAt(9.2); windowAt(12.1, true); lanternAt(13.3); doorAt(14.6, '#3a2230');
  return { map: wrap(tex(c)), emissive: wrap(tex(e)) };
}

function roofTextures() {
  const [c, g] = canvas(256, 128), [e, ge] = canvas(256, 128);
  const rnd = mulberry(5);
  g.fillStyle = '#3b4468'; g.fillRect(0, 0, 256, 128);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(20,24,50,0.5)';
  for (let y = 0; y < 128; y += 10) for (let x = (y / 10 % 2) * 8; x < 256; x += 16) g.strokeRect(x, y, 16, 10);   // черепица-сланец
  g.fillStyle = '#5a6288'; g.fillRect(0, 118, 256, 10);
  for (let k = 0; k < 2; k++) {                                          // слуховые окна
    const x = 40 + k * 128, lit = k === 0 ? true : rnd() < 0.5;
    g.fillStyle = '#d9cdb6'; g.fillRect(x - 6, 26, 60, 84);
    g.beginPath(); g.moveTo(x - 10, 28); g.lineTo(x + 24, 8); g.lineTo(x + 58, 28); g.fill();
    const col = lit ? '#ffc060' : '#1a1c36';
    g.fillStyle = col; g.fillRect(x + 4, 38, 40, 62);
    if (lit) { ge.fillStyle = '#ffb050'; ge.fillRect(x + 4, 38, 40, 62); }
    g.strokeStyle = '#4a3020'; g.lineWidth = 3; g.strokeRect(x + 4, 38, 40, 62);
    g.beginPath(); g.moveTo(x + 24, 38); g.lineTo(x + 24, 100); g.stroke();
  }
  return { map: wrap(tex(c)), emissive: wrap(tex(e)) };
}
function wrap(t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

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
  const poolGeo = new THREE.PlaneGeometry(13, 13); poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({
    map: glowTexture('rgba(255,207,134,0.20)', 'rgba(255,191,104,0.08)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), n);
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
    pools.setMatrixAt(i, M.makeTranslation(x, 0.03, z));
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
  pools.renderOrder = 1; glow.renderOrder = 2;
  for (const m of [pole, foot, cap, lantern, pools, glow]) { m.frustumCulled = false; scene.add(m); }
  return { lights, detailed: chosen.size };
}

// ═══ Деревья ═════════════════════════════════════════════════
function buildTrees(scene, flat, inside, rnd) {
  const list = [];
  for (let i = 0; i < flat.length; i += 2) if (!inside(flat[i], flat[i + 1])) list.push([flat[i], flat[i + 1]]);
  if (!list.length) return;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 3.4, 7), new THREE.MeshStandardMaterial({ color: 0x2a1c1e, roughness: 0.9 }), list.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), list.length * 2);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), col = new THREE.Color();
  const LEAF = [0xc98a2a, 0x8a7a2a, 0x3e6a3a, 0xd9a03a, 0x2f5a3c];
  list.forEach(([x, z], i) => {
    trunk.setMatrixAt(i, M.makeTranslation(x, 1.7, z));
    for (let k = 0; k < 2; k++) {
      const r = 1.7 + rnd() * 0.9;
      M.compose(P.set(x + (rnd() - 0.5) * 1.4, 4.2 + k * 1.1 + rnd() * 0.5, z + (rnd() - 0.5) * 1.4), Q, S.set(r, r * 0.8, r));
      crown.setMatrixAt(i * 2 + k, M);
      crown.setColorAt(i * 2 + k, col.setHex(LEAF[Math.floor(rnd() * LEAF.length)]));
    }
  });
  trunk.frustumCulled = crown.frustumCulled = false;
  trunk.userData.word = 'trunk';
  crown.userData.word = 'tree';
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
  const awn = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.07, 1.5), new THREE.MeshStandardMaterial({ color: BURGUNDY, roughness: 0.8 }), n);
  const frontGeo = new THREE.PlaneGeometry(1, 2.5);
  const front = new THREE.InstancedMesh(frontGeo, new THREE.MeshBasicMaterial({ map: shopfrontTexture() }), n);
  const tableTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.35 }), n * 2);
  const tableLeg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.14, 0.72, 6), new THREE.MeshStandardMaterial({ color: 0x15151a, metalness: 0.7, roughness: 0.4 }), n * 2);
  const flower = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: 0x401028, flatShading: true }), n * 6);
  const candles = new Float32Array(n * 2 * 3);
  const candle = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.042, 0.046, 0.11, 8),
    new THREE.MeshStandardMaterial({ color: 0xf1d3a5, emissive: 0x3d2310, roughness: 0.84 }), n * 2);
  candle.userData.word = 'candle';
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qt = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), col = new THREE.Color();
  const Yax = new THREE.Vector3(0, 1, 0), Xax = new THREE.Vector3(1, 0, 0), I = new THREE.Quaternion();
  const PINK = [0xff7fb0, 0xe85a8a, 0xc98be0, 0xff9ac0];

  const terrace = { tables: [], chairs: [] }, crates = [];
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  spots.forEach((s, i) => {
    const w = Math.min(6, Math.max(3.2, s.len * 0.7));
    const yaw = Math.atan2(s.nx, s.nz);                // фасад смотрит вдоль нормали
    const tx = s.nz, tz = -s.nx;                       // направление вдоль стены
    Q.setFromAxisAngle(Yax, yaw);
    Qt.copy(Q).multiply(I.setFromAxisAngle(Xax, 0.3));
    awn.setMatrixAt(i, M.compose(P.set(s.x + s.nx * 0.8, 2.95, s.z + s.nz * 0.8), Qt, S.set(w, 1, 1)));
    front.setMatrixAt(i, M.compose(P.set(s.x + s.nx * 0.06, 1.3, s.z + s.nz * 0.06), Q, S.set(w, 1, 1)));
    // вывеска на крае маркизы
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.5), new THREE.MeshBasicMaterial({ map: signTexture(s.name) }));
    sign.position.set(s.x + s.nx * 1.56, 2.52, s.z + s.nz * 1.56); sign.quaternion.copy(Q);
    sign.userData.word = 'sign';
    scene.add(sign);
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
    shopFronts.push({ x: s.x, z: s.z, w });
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
  awn.userData.word = 'awning';
  tableTop.userData.word = tableLeg.userData.word = 'table';
  for (const m of [awn, tableTop, tableLeg, candle, candleGlow]) { m.frustumCulled = false; scene.add(m); }
  addPropInstances(scene, props['bistro-table'], terrace.tables);
  addPropInstances(scene, props['chair-rattan'], terrace.chairs);
  addPropInstances(scene, props['fruit-crate'], crates);
  return bakery;
}

function shopfrontTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2a1410'; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 4; k++) {
    const x = 8 + k * 62, grd = g.createLinearGradient(0, 20, 0, 240);
    grd.addColorStop(0, '#ffd98a'); grd.addColorStop(0.6, '#ffab4a'); grd.addColorStop(1, '#c8641e');
    g.fillStyle = grd; g.fillRect(x, 20, 54, 200);
    g.fillStyle = 'rgba(255,245,215,0.85)'; g.beginPath(); g.arc(x + 27, 62, 9, 0, 6.3); g.fill();     // лампа внутри
    g.fillStyle = 'rgba(60,25,10,0.45)'; g.fillRect(x + 6, 150, 42, 4); g.fillRect(x + 6, 185, 42, 4); // полки
    g.strokeStyle = '#3a1c10'; g.lineWidth = 3; g.strokeRect(x, 20, 54, 200);
    g.beginPath(); g.moveTo(x, 95); g.lineTo(x + 54, 95); g.stroke();
  }
  return tex(c);
}

function signTexture(name) {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#6e1430'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#571026'; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.arc(x + 16, 64, 16, Math.PI, 0); g.fill(); }
  let size = 40;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f6dfb4';
  do { g.font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive, Georgia`; size -= 2; } while (g.measureText(name).width > 480 && size > 16);
  g.fillText(name, 256, 28);
  return tex(c);
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

// ═══ Сакре-Кёр ════════════════════════════════════════════════
function buildSacreCoeur(scene, x, z) {
  const g = new THREE.Group();
  const [sc, sg] = canvas(8, 256);
  const grd = sg.createLinearGradient(0, 256, 0, 0);                    // подсветка снизу: тёплая у земли, бледнее к куполам
  grd.addColorStop(0, '#ffb466'); grd.addColorStop(0.5, '#f3cfa0'); grd.addColorStop(1, '#cdbfd6');
  sg.fillStyle = grd; sg.fillRect(0, 0, 8, 256);
  const lit = tex(sc);
  const stone = new THREE.MeshStandardMaterial({ color: 0xfff4e2, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 0.42, roughness: 0.85, fog: false });
  const add = (geo, px, py, pz, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, stone); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const dome = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(36, 30, 70), 0, 15, 0);                       // неф
  add(new THREE.BoxGeometry(44, 22, 16), 0, 11, 34);                      // портик (юг)
  add(new THREE.CylinderGeometry(11, 12, 20, 20), 0, 40, 4);              // барабан
  add(dome, 0, 50, 4, 11, 24, 11);                                        // главный купол, вытянутый
  add(new THREE.CylinderGeometry(1.6, 2, 8, 10), 0, 77, 4);
  add(dome, 0, 81, 4, 2, 4, 2);
  for (const [dx, dz] of [[-15, 24], [15, 24], [-15, -14], [15, -14]]) {  // четыре малых купола
    add(new THREE.CylinderGeometry(5, 5.5, 12, 14), dx, 36, dz);
    add(dome, dx, 42, dz, 5, 11, 5);
    add(dome, dx, 53.5, dz, 1, 2.4, 1);
  }
  add(new THREE.BoxGeometry(11, 78, 11), 0, 39, -42);                     // колокольня (север)
  add(dome, 0, 78, -42, 5.5, 12, 5.5);
  g.position.set(x, 0, z);
  scene.add(g);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,215,160,0.22)', 'rgba(255,180,120,0.1)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.position.set(x, 45, z); halo.scale.set(190, 170, 1);
  scene.add(halo);
}

// ═══ Эйфелева башня и огни города ═══════════════════════════
function buildFarParis(scene) {
  const rnd = mulberry(21);
  const [ec, eg] = canvas(128, 384);                                      // Эйфелева башня на юго-западе
  eg.strokeStyle = '#ffc266'; eg.fillStyle = '#ffb347'; eg.shadowColor = '#ff9a30'; eg.shadowBlur = 12; eg.lineWidth = 5;
  eg.beginPath(); eg.moveTo(8, 380); eg.quadraticCurveTo(56, 250, 62, 10); eg.moveTo(120, 380); eg.quadraticCurveTo(72, 250, 66, 10); eg.stroke();
  for (const [y, w] of [[300, 80], [220, 46], [110, 18]]) eg.fillRect(64 - w / 2, y, w, 8);
  eg.lineWidth = 2; for (let y = 40; y < 380; y += 22) { const w = 6 + (y / 380) ** 2 * 50; eg.beginPath(); eg.moveTo(64 - w, y); eg.lineTo(64 + w, y + 22); eg.moveTo(64 + w, y); eg.lineTo(64 - w, y + 22); eg.stroke(); }
  const eiffel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(ec), fog: false, depthWrite: false, transparent: true }));
  eiffel.position.set(-1050, 78, 1050); eiffel.scale.set(55, 165, 1); eiffel.userData.word = 'eiffel'; scene.add(eiffel);

  const m = 500, lp = new Float32Array(m * 3);                            // огни города на горизонте
  for (let i = 0; i < m; i++) { const a = rnd() * Math.PI * 2, r = 700 + rnd() * 700; lp.set([Math.cos(a) * r, 4 + rnd() * 22, Math.sin(a) * r], i * 3); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({
    map: glowTexture('rgba(255,228,174,0.8)', 'rgba(255,205,133,0.40)'),
    size: 3, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false, opacity: 0.65,
  }));
  lights.frustumCulled = false; scene.add(lights);
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
  const leaves = kind === 'ivy' ? ['#2f5a34', '#3f7040', '#6a7a2a', '#c8962e', '#a8642a', '#b0402a'] : ['#b98be8', '#a070d8', '#d0a8f4', '#8a5cc8', '#3f7040'];
  for (let k = 0; k < 9; k++) {                                       // свисающие плети
    let x = 14 + rnd() * 228, y = 0; const len = 110 + rnd() * 140;
    while (y < len) {
      const r = kind === 'ivy' ? 7 + rnd() * 6 : (5 + rnd() * 5) * (1 - y / len * 0.5);
      for (let q = 0; q < 3; q++) {
        g.fillStyle = leaves[Math.floor(rnd() * leaves.length)];
        g.beginPath(); g.ellipse(x + (rnd() - 0.5) * 26, y + rnd() * 10, r, r * 0.75, rnd() * 3, 0, 6.3); g.fill();
      }
      x += (rnd() - 0.5) * 9; y += 7 + rnd() * 5;
    }
  }
  for (let k = 0; k < 90; k++) { g.fillStyle = leaves[Math.floor(rnd() * leaves.length)]; g.beginPath(); g.ellipse(rnd() * 256, rnd() * 34, 9, 7, rnd() * 3, 0, 6.3); g.fill(); }
  return tex(c);
}
function buildVines(scene, spots, inside, rnd) {
  const pick = spots.filter(([x, z, nx, nz]) => !inside(x + nx * 1.5, z + nz * 1.5) && !inside(x + nx * 3.5, z + nz * 3.5) && rnd() < 0.3).slice(0, 220);
  if (!pick.length) return;
  const geo = new THREE.PlaneGeometry(1, 1);
  const kinds = [['ivy', 41], ['wisteria', 42]].map(([k, sd]) => new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
    map: vineTexture(k, sd), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9,
    emissive: k === 'ivy' ? 0x2a1c08 : 0x2a1440, emissiveIntensity: 0.9,
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

// ═══ Сакре-Кёр: силуэт настоящей модели, две скрещённые «открытки» ═══
function buildSacreCards(scene, x, z, city) {
  const Hm = 88, mat = new THREE.MeshBasicMaterial({ map: city.sacreTex, alphaTest: 0.5, side: THREE.DoubleSide });
  city.sacre.forEach(([u0, u1, aspect], i) => {
    const w = aspect * Hm, geo = new THREE.PlaneGeometry(w, Hm);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, u0 + uv.getX(k) * (u1 - u0));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, Hm / 2 - 1, z); m.rotation.y = i ? Math.PI / 2 : 0;
    m.userData.word = 'basilica';
    scene.add(m);
  });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,224,176,0.10)', 'rgba(255,207,144,0.04)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(x, 45, z); halo.scale.set(200, 180, 1);
  scene.add(halo);
}
