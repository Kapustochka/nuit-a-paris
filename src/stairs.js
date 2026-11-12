// stairs.js — каменные лестницы Монмартра по настоящим улицам-лестницам из OpenStreetMap (highway=steps).
// Ступени «садятся» на рельеф: где склон круче — ступени чаще, где ровно — получается площадка.
// Чугунные перила по краям, а на широких лестницах (как рю Фуайатье) — ещё и посередине.
import * as THREE from 'three';
import { nightStone } from './night-light.js';

const RISE = 0.16;        // высота ступени, м
const DS = 0.12;          // шаг выборки вдоль лестницы, м
const RAIL_H = 0.92;      // высота перил над ступенями
const POST_EVERY = 1.6;   // шаг стоек перил, м

const widthOf = (rd) => rd.w > 0.8 ? Math.min(rd.w, 12) : /foyatier/i.test(rd.n) ? 6.4 : 2.8;

export function buildStairs(scene, roads, heightAt, night) {
  const flights = [];
  for (const rd of roads) {
    if (rd.k !== 'steps' || rd.p.length < 4) continue;
    const f = flight(rd.p, widthOf(rd), heightAt);
    if (f) flights.push(f);
  }
  if (!flights.length) return { lift: () => 0, count: 0 };

  const stone = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const iron = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const posts = [];
  for (const f of flights) { treads(stone, f); railings(iron, posts, f); }

  const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTexture(), vertexColors: true, side: THREE.DoubleSide });
  if (night) nightStone(stoneMat, night, 'stairs');
  const steps = new THREE.Mesh(toGeo(stone), stoneMat);
  steps.receiveShadow = true;
  steps.userData.word = 'stairs';
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x15151b, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide });
  const rails = new THREE.Mesh(toGeo(iron), ironMat);
  rails.userData.word = 'railing';
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.03, 1, 6).translate(0, 0.5, 0), ironMat, posts.length);
  const M = new THREE.Matrix4(), S = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Quaternion();
  posts.forEach(([x, y, z, h], i) => postMesh.setMatrixAt(i, M.compose(P.set(x, y, z), Q, S.set(1, h, 1))));
  postMesh.userData.word = 'railing';
  for (const m of [steps, rails, postMesh]) { m.userData.noLift = true; m.frustumCulled = m !== postMesh; scene.add(m); }

  // Сколько добавить к рельефу, чтобы ноги стояли на ступенях, а не в камне
  const lift = (x, z) => {
    for (const f of flights) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      const d = distToLine(f.line, x, z);
      if (d < f.w / 2 + 0.2) return RISE * 0.5 * Math.min(1, (f.w / 2 + 0.2 - d) / 0.3);
    }
    return 0;
  };
  return { lift, count: flights.length };
}

// Лестница вдоль ломаной: равномерные точки с касательными и высотой ступени
function flight(p, w, heightAt) {
  const pts = [];
  for (let i = 0; i < p.length; i += 2) {
    const k = pts.length;
    if (!k || Math.hypot(p[i] - pts[k - 1][0], p[i + 1] - pts[k - 1][1]) > 0.05) pts.push([p[i], p[i + 1]]);
  }
  if (pts.length < 2) return null;
  const S = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / DS));
    for (let k = i ? 1 : 0; k <= n; k++) S.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  if (S.length < 4) return null;
  const N = S.length, tx = new Float32Array(N), tz = new Float32Array(N), h = new Float32Array(N), y = new Float32Array(N);
  for (let i = 0; i < N; i++) {                                     // касательная, сглаженная на ~1 м
    const a = S[Math.max(0, i - 4)], b = S[Math.min(N - 1, i + 4)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    tx[i] = (b[0] - a[0]) / l; tz[i] = (b[1] - a[1]) / l;
    // рельеф под всей шириной: ступень должна накрыть самую высокую точку
    let top = -Infinity;
    for (const o of [-0.5, 0, 0.5]) top = Math.max(top, heightAt(S[i][0] - tz[i] * w * o, S[i][1] + tx[i] * w * o));
    h[i] = top;
  }
  let level = h[0] + RISE * 0.5;
  for (let i = 0; i < N; i++) {
    while (h[i] > level) level += RISE;
    while (h[i] < level - RISE) level -= RISE;
    y[i] = level;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const pad = w / 2 + 1;
  return { S, tx, tz, h, y, w, line: pts, minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

// Ступени: верх (проступь), подступёнок и боковые щёки до земли
function treads(g, f) {
  const { S, tx, tz, y, w } = f, N = S.length, hw = w / 2, rnd = mulberry(Math.round(S[0][0] * 31 + S[0][1] * 17));
  const edge = (i, side) => [S[i][0] - tz[i] * hw * side, S[i][1] + tx[i] * hw * side];
  let s = 0, run = 0;
  while (run < N - 1) {
    let end = run + 1;
    while (end < N - 1 && y[end] === y[run]) end++;
    // проступь кусками: новый кусок там, где лестница поворачивает
    const top = y[run], shade = 0.9 + rnd() * 0.2;
    const tread = [0.66 * shade, 0.63 * shade, 0.6 * shade], nose = tread.map((v) => Math.min(1, v * 1.18)), cheek = [0.42, 0.4, 0.4];
    let a = run;
    while (a < end) {
      let b = a + 1;
      while (b < end && tx[a] * tx[b] + tz[a] * tz[b] > 0.997) b++;
      const [lax, laz] = edge(a, -1), [rax, raz] = edge(a, 1), [lbx, lbz] = edge(b, -1), [rbx, rbz] = edge(b, 1);
      const la = Math.hypot(S[b][0] - S[a][0], S[b][1] - S[a][1]);
      const c0 = a === run ? nose : tread;
      quad(g, [lax, top, laz], [rax, top, raz], [rbx, top, rbz], [lbx, top, lbz], [0, 1, 0], [s, 0, s + la, w], c0, tread);
      const bottom = top - RISE - 0.6;
      quad(g, [lax, bottom, laz], [lbx, bottom, lbz], [lbx, top, lbz], [lax, top, laz], [tz[a], 0, -tx[a]], [s, 0, s + la, 0.4], cheek, cheek);
      quad(g, [rbx, bottom, rbz], [rax, bottom, raz], [rax, top, raz], [rbx, top, rbz], [-tz[a], 0, tx[a]], [s, 0, s + la, 0.4], cheek, cheek);
      s += la; a = b;
    }
    if (end < N - 1 || y[end] !== top) {                          // подступёнок к следующей ступени
      const lo = Math.min(top, y[end]), hi = Math.max(top, y[end]), dir = y[end] > top ? -1 : 1;
      const [lx, lz] = edge(end, -1), [rx, rz] = edge(end, 1);
      const riser = [0.5 * shade, 0.48 * shade, 0.47 * shade];
      quad(g, [lx, lo - 0.02, lz], [rx, lo - 0.02, rz], [rx, hi, rz], [lx, hi, lz], [tx[end] * dir, 0, tz[end] * dir], [0, 0, w, hi - lo], riser.map((v) => v * 0.8), riser);
    }
    run = end;
  }
}

// Чугунные перила: стойки и два поручня, плавно идущие над ступенями
function railings(g, posts, f) {
  const { S, tx, tz, y, w } = f, N = S.length;
  const offsets = w >= 5 ? [-(w / 2 - 0.15), 0, w / 2 - 0.15] : [-(w / 2 - 0.12), w / 2 - 0.12];
  const smooth = new Float32Array(N);                       // линия поручня: среднее ступеней на ~2 м
  for (let i = 0; i < N; i++) {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - 8); k <= Math.min(N - 1, i + 8); k++) { sum += y[k]; n++; }
    smooth[i] = Math.max(sum / n, y[i] - 0.05);
  }
  const every = Math.max(1, Math.round(POST_EVERY / DS));
  const stops = [];
  for (let i = 0; i < N; i += every) stops.push(i);
  if (stops[stops.length - 1] !== N - 1) stops.push(N - 1);
  for (const off of offsets) {
    const at = (i, lift) => [S[i][0] - tz[i] * off, smooth[i] + lift, S[i][1] + tx[i] * off];
    for (const i of stops) {
      const [x, top, z] = at(i, RAIL_H);
      posts.push([x, y[i], z, top - y[i]]);
    }
    for (let k = 0; k + 1 < stops.length; k++) {
      bar(g, at(stops[k], RAIL_H), at(stops[k + 1], RAIL_H), 0.03);
      bar(g, at(stops[k], 0.22), at(stops[k + 1], 0.22), 0.016);
    }
  }
}

// ── Геометрия ────────────────────────────────────────────
function quad(g, a, b, c, d, n, [u0, v0, u1, v1], c0, c1) {
  const i = g.pos.length / 3;
  g.pos.push(...a, ...b, ...c, ...d);
  for (let k = 0; k < 4; k++) g.nor.push(...n);
  g.uv.push(u0, v0, u0, v1, u1, v1, u1, v0);
  g.col.push(...c0, ...c0, ...c1, ...c1);
  g.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
function bar(g, a, b, r) {                                      // квадратная трубка от a до b
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
  const sx = -dz / l * r, sz = dx / l * r, white = [1, 1, 1];
  const A = (u, v) => [a[0] + sx * u, a[1] + r * v, a[2] + sz * u], B = (u, v) => [b[0] + sx * u, b[1] + r * v, b[2] + sz * u];
  const uv = [0, 0, 1, 1];
  quad(g, A(-1, 1), A(1, 1), B(1, 1), B(-1, 1), [0, 1, 0], uv, white, white);
  quad(g, A(1, -1), A(-1, -1), B(-1, -1), B(1, -1), [0, -1, 0], uv, white, white);
  quad(g, A(1, 1), A(1, -1), B(1, -1), B(1, 1), [sx / r, 0, sz / r], uv, white, white);
  quad(g, A(-1, -1), A(-1, 1), B(-1, 1), B(-1, -1), [-sx / r, 0, -sz / r], uv, white, white);
}
function toGeo(g) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.setIndex(g.idx);
  geo.computeBoundingSphere();
  return geo;
}
function distToLine(line, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], dx = line[i + 1][0] - ax, dz = line[i + 1][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
// Песчаник: зерно, трещинки и стёртые края — рисуем сами
function stoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), rnd = mulberry(91);
  g.fillStyle = '#b7aea2'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + rnd() * 70 | 0;
    g.fillStyle = `rgba(${v},${v - 6},${v - 14},${0.08 + rnd() * 0.14})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 4, 1 + rnd() * 3);
  }
  g.strokeStyle = 'rgba(60,52,48,0.12)'; g.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    let x = rnd() * 256, yy = rnd() * 256; g.beginPath(); g.moveTo(x, yy);
    for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 14; yy += (rnd() - 0.5) * 14; g.lineTo(x, yy); }
    g.stroke();
  }
  g.fillStyle = 'rgba(50,44,40,0.5)';                           // стыки плит поперёк лестницы
  for (const x of [0, 128]) g.fillRect(x, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.repeat.set(1 / 1.4, 1 / 1.4);
  return t;
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
