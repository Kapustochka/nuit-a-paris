// facades.js — рисованные дома на настоящих контурах OpenStreetMap (стиль прототипа experiments/painted-street.html).
// Каждая грань дома, что смотрит на улицу, режется на «домики» шириной ~8 м: у каждого свой цвет штукатурки,
// свои ставни и балконы и своя высота цоколя — на склоне улица получается ступенчатой, как на Монмартре.
// Над контуром — мансарда-«колокол» со слуховыми окнами и трубами. Весь дом слегка «живой»: наклон,
// выпуклые фасады, волнистые этажи, просевший конёк.
//
// Три слоя геометрии, чтобы сотни домов шли и на телефоне:
//   • shell — крыши, глухие стены, цоколи (всегда, по кварталам 64 м);
//   • far — фасады попроще: окна, двери, ставни нарисованы на плоской стене (всегда, кроме ближних кварталов);
//   • near — настоящие ниши окон, подоконники, балконы, маркизы, цветы — строятся вокруг героини на ходу.
import { roofAccent, buildRoofAccent } from './roof-accents.js';
import * as THREE from 'three';
import { Builder, K, mulberry, X, Y, IRON_COL, shadeOf } from './builder.js';
import { paintMaterial } from './paint.js';
import { leafTexture, railTexture, signTexture, foliage } from './props.js';
import { streamGeometry } from './stream-geometry.js';

const GF = 3.7;            // первый этаж
const CHUNK = 64;          // квартал для отсечения и подгрузки
const NEAR = 95, FAR = 135; // ближние кварталы строятся ближе NEAR и убираются дальше FAR
const BUILD_SLICE_MS = 3;   // CPU-бюджет подгрузки за кадр (один фасад может занять дольше)

const WALLS = [[0.96, 0.79, 0.67], [0.95, 0.88, 0.74], [0.93, 0.74, 0.71], [0.97, 0.86, 0.62], [0.82, 0.83, 0.88],
  [0.8, 0.85, 0.76], [0.97, 0.76, 0.58], [0.86, 0.8, 0.9], [0.95, 0.88, 0.74], [0.96, 0.79, 0.67]];
const SHUTTERS = [[0.36, 0.46, 0.64], [0.4, 0.56, 0.5], [0.6, 0.24, 0.28], [0.88, 0.84, 0.74], [0.3, 0.52, 0.56]];
const ROOFS = [[0.4, 0.43, 0.6], [0.4, 0.43, 0.6], [0.46, 0.47, 0.6], [0.36, 0.38, 0.55], [0.52, 0.53, 0.62], [0.4, 0.54, 0.54], [0.3, 0.31, 0.47],
  [0.74, 0.43, 0.34]];   // цинк и сланец, светлый цинк, патина, тёмный сланец; последняя — черепица вальмовых крыш
const SHOPS = [['#4a3a26', [0.36, 0.28, 0.18], [0.85, 0.66, 0.32]], ['#2d4a52', [0.22, 0.36, 0.4], [0.3, 0.52, 0.44]],
  ['#3b2f5c', [0.28, 0.23, 0.45], [0.55, 0.22, 0.3]], ['#5b2230', [0.42, 0.16, 0.22], [0.62, 0.2, 0.28]],
  ['#6a3a52', [0.5, 0.28, 0.4], [0.86, 0.6, 0.66]], ['#22303f', [0.18, 0.24, 0.32], [0.3, 0.36, 0.5]]];
const TRIM = [0.94, 0.9, 0.82], STONE = [0.78, 0.74, 0.7], CHIMNEY = [0.74, 0.5, 0.42];
const WORDS = { [K.WALL]: 'wall', [K.ROOF]: 'roof', [K.TRIM]: 'wall', [K.GLASS]: 'window', [K.SHUTTER]: 'window', [K.SHOP]: 'shopWindow',
  [K.AWNING]: 'awning', [K.IRON]: 'balcony', [K.DOOR]: 'door', [K.PAINT]: 'shopWindow' };
const pick = (r, a) => a[Math.floor(r() * a.length)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const STREET_DETAILS = !new URLSearchParams(location.search).has('no-street-details');

// ── План: всё, что нужно и дальнему, и ближнему слою (детерминированно, от seed) ──────────────
// pending: [{ p (по часовой), n, H, tint }], open(x, z) — смотрит ли точка на улицу
export function planFacades(pending, heightAt, inside, flat) {
  const houses = [], wallSpots = [];
  pending.forEach(({ p, n, H, tint }, bi) => {
    const r = mulberry(1000 + bi * 7);
    let top0 = -Infinity, low0 = Infinity, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { const h = heightAt(p[i * 2], p[i * 2 + 1]); top0 = Math.max(top0, h); low0 = Math.min(low0, h); cx += p[i * 2]; cz += p[i * 2 + 1]; }
    cx /= n; cz /= n;
    const base = flat ? 0 : top0 - 0.3, E = base + Math.max(GF + 2.9, H * 0.76);
    const edges = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / (L || 1), tz = (bz - az) / (L || 1), nx = -tz, nz = tx;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const open = L >= 2.4 && !inside(mx + nx * 1.2, mz + nz * 1.2);
      const e = { ax, az, tx, tz, nx, nz, L, open, segs: [], bulge: 0.04 + r() * 0.05 };
      const at = (x) => [ax + tx * x, az + tz * x];
      if (open) {
        const m = L > 13 ? Math.round(L / 8) : 1;
        for (let k = 0; k < m; k++) {
          const x0 = L * k / m, x1 = L * (k + 1) / m;
          const h0 = flat ? 0 : heightAt(...at(x0)), h1 = flat ? 0 : heightAt(...at(x1));
          const b = flat ? 0 : Math.min(Math.max(h0, h1) - 0.25, E - GF - 2.8);
          e.segs.push({ x0, x1, b, low: Math.min(h0, h1) - 0.6, seed: (bi * 131 + i * 17 + k * 5) | 0, wall: WALLS[Math.floor(r() * WALLS.length)].map((v, c) => v * tint[c]) });
        }
        if (L > 5) wallSpots.push([mx, mz, nx, nz, L, H * 0.5]);
      } else {
        const h0 = flat ? 0 : heightAt(ax, az), h1 = flat ? 0 : heightAt(bx, bz);
        e.low = Math.min(h0, h1) - 0.6;
      }
      edges.push(e);
    }
    // ширина дома — чтобы мансарда не «перехлестнула» сама себя на узком контуре
    let width = Infinity;
    for (const e of edges) {
      if (e.L < 0.5) continue;
      let far = 0;
      for (let k = 0; k < n; k++) far = Math.max(far, (e.ax - p[k * 2]) * e.nx + (e.az - p[k * 2 + 1]) * e.nz);
      width = Math.min(width, far);
    }
    const ref = edges.reduce((a, e) => (e.L > a.L ? e : a), edges[0]);
    const roofType = H < 9 && r() < 0.5 ? 'flat' : r() < 0.12 ? 'hip' : 'mansard';
    houses.push({
      p, n, cx, cz, base, E, H, edges, width, roofType, roof: roofType === 'hip' ? ROOFS[ROOFS.length - 1] : pick(r, ROOFS.slice(0, -1)),
      rise: Math.min(4.2, Math.max(2.2, H * 0.24)), low: 0.9 + r() * 0.3, pitch: 0.5 + r() * 0.35,
      wall: edges.find((e) => e.segs.length)?.segs[0].wall || WALLS[0],
      lean: [(r() - 0.5) * 0.012, (r() - 0.5) * 0.012], sag: 0.08 + r() * 0.12, ph: r() * 10, ref,
      chunk: Math.floor(cx / CHUNK) + ':' + Math.floor(cz / CHUNK), seed: bi,
    });
  });
  return { houses, wallSpots };
}

// Раскладка одного «домика»: этажи и окна. Одна и та же для дальнего и ближнего слоя.
function layout(seg, E, shop) {
  const r = mulberry(seg.seed);
  const Ls = seg.x1 - seg.x0, b = seg.b;
  const nUp = Math.max(1, Math.round((E - b - GF) / 3.05)), fh = (E - b - GF) / nUp;
  const ys = [b, b + GF]; for (let f = 1; f <= nUp; f++) ys.push(b + GF + fh * f);
  const cols = Math.max(1, Math.round((Ls - 0.7) / 2.25));
  const margin = Math.min(0.5 + r() * 0.25, Ls * 0.18), stepX = (Ls - 2 * margin) / cols;
  const centers = Array.from({ length: cols }, (_, i) => seg.x0 + margin + stepX * (i + 0.5) + (r() - 0.5) * 0.1);
  const shutter = pick(r, SHUTTERS), shutters = r() < 0.78, balconyFloor = nUp >= 3 && r() < 0.4 ? 2 : nUp >= 2 && r() < 0.2 ? 1 : -1;
  const door = cols >= 2 && r() < 0.75 ? Math.floor(r() * cols) : -1;
  const style = pick(r, SHOPS);
  // разнообразие «домика» — свой генератор, чтобы раскладка окон осталась прежней
  const v = mulberry(seg.seed * 17 + 911);
  const look = {
    lintel: Math.floor(v() * 4),                       // 0 — замковый камень, 1 — фронтончик, 2 — карниз-козырёк, 3 — гладкая перемычка
    rustic: v() < 0.35, quoins: v() < 0.3,             // руст первого этажа, лопатки по краям
    winAwning: v() < 0.13 ? pick(v, SHOPS)[2] : null,  // полосатые маркизы над окнами
    topBalcony: nUp >= 4 && v() < 0.4 ? nUp : -1,      // длинный балкон под крышей, как у османовских домов
    awning: Math.floor(v() * 4),                       // лавка: 0 — круглая маркиза, 1 — прямая, 2 — лампы над вывеской, 3 — козырёк с лампочками
    blade: v() < 0.45,                                 // вывеска-флажок на кронштейне
  };
  // ячейки по этажам: [xa, xb, тип], строки — [y...]
  const floors = [];
  for (let f = 0; f <= nUp; f++) {
    const y0 = ys[f], y1 = ys[f + 1];
    let rows, cells = [];
    if (f === 0 && shop) {
      rows = [y0, y0 + 0.45, y0 + 3.0, y0 + 3.55, y1];
      const sa = Math.max(seg.x0 + 0.45, shop.at - shop.w / 2), sb = Math.min(seg.x1 - 0.45, shop.at + shop.w / 2);
      cells = [[seg.x0, sa, 'pier'], [sa, sb, 'shop'], [sb, seg.x1, 'pier']];
    } else {
      const top = f === nUp, ground = f === 0;
      const ww = ground ? 1.1 : top ? 0.92 : 1.05;
      const sill = ground ? y0 + 0.95 : y0 + (top ? 0.7 : 0.85), wtop = ground ? y0 + 3.0 : Math.min(y1 - 0.35, sill + (top ? 1.45 : 1.85));
      rows = [y0, sill, wtop, y1];
      let x = seg.x0;
      centers.forEach((c, i) => {
        const isDoor = ground && i === door, w = Math.min(isDoor ? 1.5 : ww, stepX - 0.5);
        cells.push([x, c - w / 2, 'wall'], [c - w / 2, c + w / 2, isDoor ? 'door' : 'win']); x = c + w / 2;
      });
      cells.push([x, seg.x1, 'wall']);
    }
    floors.push({ f, y0, y1, rows, cells, top: f === nUp });
  }
  return { ys, nUp, centers, shutter, shutters, balconyFloor, style, floors, look, lit: (f, i) => mulberry(seg.seed * 31 + f * 7 + i)() };
}

// ── Строители ─────────────────────────────────────────────────────────────
function houseDeform(h) {
  const [lx, lz] = h.lean, top = h.E + h.rise;
  const ux = h.ref.tx, uz = h.ref.tz;
  let u0 = Infinity, u1 = -Infinity;
  for (let i = 0; i < h.n; i++) { const u = h.p[i * 2] * ux + h.p[i * 2 + 1] * uz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
  return ([x, y, z]) => {
    const up = Math.max(y - h.base, 0), hy = clamp01((y - h.base) / (h.E - h.base));
    let ny = y + Math.sin(x * 0.5 + z * 0.3 + h.ph) * 0.035 * hy;
    if (y > h.E + 0.05) ny -= Math.sin(Math.PI * clamp01(((x * ux + z * uz) - u0) / (u1 - u0 || 1))) * h.sag * clamp01((y - h.E) / (top - h.E));
    return [x + up * lx + Math.sin(y * 0.45 + h.ph) * 0.03, ny, z + up * lz];
  };
}
// локальные координаты грани (x вдоль, y — высота, z наружу) → мир, с выпуклостью фасада
function edgeFrame(e, seg, E, deform) {
  return ([x, y, z]) => {
    const hy = clamp01((y - seg.b) / (E - seg.b)), u = clamp01(x / e.L);
    const zz = z + Math.sin(hy * Math.PI) * Math.sin(u * Math.PI) * e.bulge * (z > -0.6 ? 1 : 0.4);
    return deform([e.ax + e.tx * x + e.nx * zz, y, e.az + e.tz * x + e.nz * zz]);
  };
}

// Крыша над всем контуром: кольца, сдвинутые внутрь по биссектрисам, и крышка сверху
function roofRings(h) {
  const { p, n, E } = h, dMax = Math.max(0.3, h.width * 0.45);
  const nin = [];                                   // внутренние нормали граней
  for (const e of h.edges) nin.push([-e.nx, -e.nz]);
  const miter = [];
  for (let i = 0; i < n; i++) {
    const a = nin[(i + n - 1) % n], b = nin[i];
    let mx = a[0] + b[0], mz = a[1] + b[1];
    const d = 1 + a[0] * b[0] + a[1] * b[1];
    if (d < 0.05) { mx = b[0]; mz = b[1]; } else { mx /= d; mz /= d; }
    const l = Math.hypot(mx, mz); if (l > 2.5) { mx *= 2.5 / l; mz *= 2.5 / l; }
    miter.push([mx, mz]);
  }
  const prof = [[0.05, E - 0.45, K.TRIM], [-0.36, E - 0.45, K.TRIM], [-0.36, E + 0.04, K.TRIM]];
  if (h.roofType === 'flat') {
    prof.push([-0.36, E + 0.55, K.TRIM], [-0.05, E + 0.55, K.TRIM], [-0.05, E + 0.12, K.TRIM]);
    return { prof, miter, capY: E + 0.12, capD: -0.05, capKind: K.TRIM };
  }
  const low = Math.min(h.low, dMax * 0.55), rise = h.rise;
  if (h.roofType === 'hip') {
    const d1 = dMax, r2 = Math.min(rise * 1.1, d1 * 0.9);
    prof.push([-0.4, E + 0.04, K.ROOF]);
    for (let k = 1; k <= 4; k++) { const s = k / 4; prof.push([-0.4 + (d1 + 0.4) * s, E + r2 * (s - 0.1 * Math.sin(s * Math.PI)), K.ROOF]); }
  } else {
    prof.push([0.0, E + 0.04, K.ROOF]);
    for (let k = 1; k <= 4; k++) { const s = k / 4; prof.push([low * s * s, E + 0.04 + rise * s * 0.82, K.ROOF]); }
    const yT = E + 0.04 + rise * 0.82, pitch = Math.min(h.pitch, (dMax - low) * 0.6 + 0.1);
    for (let k = 1; k <= 3; k++) { const s = k / 3; prof.push([low + (dMax - low) * s, yT + pitch * Math.sin(s * Math.PI / 2), K.ROOF]); }
  }
  const last = prof[prof.length - 1];
  return { prof, miter, capY: last[1], capD: last[0], capKind: K.ROOF, low, yLow: E + 0.04 + rise * 0.82 };
}

function buildShell(h, S, deform) {
  const { p, n } = h;
  const R = roofRings(h);
  const ring = (d, y) => Array.from({ length: n }, (_, i) => [p[i * 2] + R.miter[i][0] * d, y, p[i * 2 + 1] + R.miter[i][1] * d]);
  const rings = R.prof.map(([d, y]) => ring(d, y));
  const lens = h.edges.map((e) => e.L);
  for (let k = 0; k + 1 < rings.length; k++) {
    const kind = R.prof[k + 1][2], col = kind === K.ROOF ? h.roof : TRIM;
    const sl = Math.hypot(R.prof[k + 1][0] - R.prof[k][0], R.prof[k + 1][1] - R.prof[k][1]);
    for (let i = 0; i < n; i++) {
      if (lens[i] < 0.05) continue;
      const j = (i + 1) % n, A = rings[k][i], B = rings[k][j], C = rings[k + 1][j], D = rings[k + 1][i];
      const v0 = k * 0.9, segs = Math.max(1, Math.ceil(lens[i] / 5));
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs, L = (a, b, t) => a.map((v, q) => v + (b[q] - v) * t);
        S.quad(L(A, B, t0), L(A, B, t1), L(D, C, t1), L(D, C, t0), col, kind, [lens[i] * t0, v0, lens[i] * t1, v0 + sl], h.seed % 7 / 7);
      }
    }
  }
  const cap = ring(R.capD, R.capY), contour = cap.map(([x, , z]) => new THREE.Vector2(x, z));
  for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) S.tri(cap[t[0]], cap[t[1]], cap[t[2]], R.capKind === K.ROOF ? shadeOf(h.roof, 1.05) : shadeOf(STONE, 0.9), R.capKind, [cap[t[0]][0], cap[t[0]][2], cap[t[1]][0], cap[t[1]][2], cap[t[2]][0], cap[t[2]][2]]);
  // глухие стены и цоколи
  const blank = shadeOf(h.wall, 0.86);
  h.edges.forEach((e) => {
    if (e.L < 0.05) return;
    const W = (x, y, z) => [e.ax + e.tx * x + e.nx * z, y, e.az + e.tz * x + e.nz * z];
    if (!e.open) {
      S.panel(W(0, e.low, 0), [e.tx, 0, e.tz], Y, e.L, h.E - e.low, blank, K.WALL, 4, 0.4);
      return;
    }
    for (const seg of e.segs) {
      const P = (x, y, z) => W(x, y, z);
      const x0 = seg.x0 - 0.02, x1 = seg.x1 + 0.02, y0 = seg.low, y1 = seg.b + 0.42;
      S.quad(P(x0, y0, 0.06), P(x1, y0, 0.06), P(x1, y1, 0.06), P(x0, y1, 0.06), STONE, K.TRIM);
      S.quad(P(x0, y1, 0.06), P(x1, y1, 0.06), P(x1, y1, -0.05), P(x0, y1, -0.05), shadeOf(STONE, 1.05), K.TRIM);
    }
  });
  // трубы
  if (h.roofType !== 'flat') {
    const r = mulberry(h.seed * 3 + 2), count = 1 + (r() < 0.5 ? 1 : 0);
    for (let c = 0; c < count; c++) {
      const i = Math.floor(r() * n), [x, , z] = ring(R.capD + 0.4, 0)[i], y = R.capY, hgt = 1.0 + r() * 0.8;
      const C = new Builder();
      const v = mulberry(h.seed * 29 + c * 7 + 5), wide = STREET_DETAILS && v() < 0.45, hw = wide ? 0.85 + v() * 0.4 : 0.32;   // парижская «стенка» с рядом горшков
      const np = Math.round(hw * 2 / 0.3), pots = wide ? Array.from({ length: np }, (_, k) => -hw + 0.2 + (hw * 2 - 0.4) * k / Math.max(np - 1, 1)) : [-0.17, 0, 0.17];
      C.box(-hw, -1.2, -0.24, hw, hgt, 0.24, wide ? shadeOf(h.wall, 0.9) : CHIMNEY, K.WALL);
      C.box(-hw - 0.06, hgt, -0.3, hw + 0.06, hgt + 0.14, 0.3, shadeOf(CHIMNEY, 1.1), K.TRIM);
      if (STREET_DETAILS && v() < 0.3) {                         // телеантенна
        const ax = hw - 0.1, top = hgt + 1.7 + v() * 0.5, dark = [0.2, 0.2, 0.32];
        C.box(ax - 0.02, hgt, -0.02, ax + 0.02, top, 0.02, dark, K.PAINT);
        for (let k = 0; k < 4; k++) C.box(ax - 0.42 + k * 0.05, top - 0.12 - k * 0.2, -0.015, ax + 0.42 - k * 0.05, top - 0.09 - k * 0.2, 0.015, dark, K.PAINT);
      }
      for (const px of pots) C.lathe(px, hgt + 0.14, 0, [[0.07, 0], [0.065, 0.22], [0.05, 0.3], [0.06, 0.34]], 6, [0.78, 0.45, 0.32], K.PAINT);
      const a = Math.atan2(h.ref.tz, h.ref.tx), ca = Math.cos(a), sa = Math.sin(a), lean = (r() - 0.5) * 0.1;
      S.append(C, ([px, py, pz]) => [x + px * ca - pz * sa + py * lean, y + py, z + px * sa + pz * ca]);
      (h.chimneys ||= []).push([x + hgt * lean, y + hgt + 0.45, z]);     // отсюда идёт дым (ambient.js)
    }
  }
  // Фронтоны видны издалека и не добавляют draw calls: это часть того же shell.
  h.accentCount = 0;
  if (STREET_DETAILS) for (const e of h.edges) for (const seg of e.segs) {
    const accent = roofAccent(seg, h, R);
    if (!accent) continue;
    const B = new Builder();
    buildRoofAccent(B, accent, seg.wall, h.roof);
    S.append(B, edgeFrame(e, seg, h.E, (p) => p));
    h.accentCount++;
  }
  S.transform(deform);
}

// Дальний слой: плоская стена, на ней нарисованы окна, двери, ставни и карнизы
function buildFar(h, F, deform, shops) {
  for (const e of h.edges) for (const seg of e.segs) {
    const shop = shops.get(seg), Lo = layout(seg, h.E, shop), to = edgeFrame(e, seg, h.E, deform);
    const B = new Builder();
    for (const fl of Lo.floors) {
      B.panel([seg.x0, fl.y0, 0], X, Y, seg.x1 - seg.x0, fl.y1 - fl.y0, seg.wall, K.WALL, 4, 0, 1);
      if (fl.f > 0) B.quad([seg.x0, fl.y0 - 0.2, 0.04], [seg.x1, fl.y0 - 0.2, 0.04], [seg.x1, fl.y0 + 0.02, 0.04], [seg.x0, fl.y0 + 0.02, 0.04], TRIM, K.TRIM);
      let wi = 0;
      for (const [xa, xb, type] of fl.cells) {
        if (type === 'win') {
          const [, ya, yb] = fl.rows;
          B.quad([xa, ya, 0.03], [xb, ya, 0.03], [xb, yb, 0.03], [xa, yb, 0.03], [0.93, 0.9, 0.84], K.GLASS, [0, 0, 1, 1], Lo.lit(fl.f, wi++));
          if (Lo.shutters && fl.f > 0 && !fl.top) {
            const sw = (xb - xa) / 2 + 0.04;
            B.quad([xa - sw, ya, 0.02], [xa - 0.02, ya, 0.02], [xa - 0.02, yb, 0.02], [xa - sw, yb, 0.02], Lo.shutter, K.SHUTTER, [0, 0, 1, yb - ya]);
            B.quad([xb + 0.02, ya, 0.02], [xb + sw, ya, 0.02], [xb + sw, yb, 0.02], [xb + 0.02, yb, 0.02], Lo.shutter, K.SHUTTER, [0, 0, 1, yb - ya]);
          }
          B.quad([xa - 0.09, ya - 0.1, 0.035], [xb + 0.09, ya - 0.1, 0.035], [xb + 0.09, ya, 0.035], [xa - 0.09, ya, 0.035], TRIM, K.TRIM);
          if (Lo.look.winAwning && fl.f > 0 && !fl.top) B.quad([xa - 0.1, yb - 0.5, 0.6], [xb + 0.1, yb - 0.5, 0.6], [xb + 0.1, yb + 0.04, 0.05], [xa - 0.1, yb + 0.04, 0.05], Lo.look.winAwning, K.AWNING, [xa, 0.85, xb, 0]);
        } else if (type === 'door') {
          const yb = fl.rows[2];
          B.quad([xa, fl.y0, 0.03], [xb, fl.y0, 0.03], [xb, yb, 0.03], [xa, yb, 0.03], Lo.shutter.map((v) => v * 0.75), K.DOOR, [0, 0, 1, 1], 0.5);
        } else if (type === 'shop') {
          const [, ya, yb, yc] = fl.rows;
          B.quad([xa, fl.y0, 0.02], [xb, fl.y0, 0.02], [xb, ya, 0.02], [xa, ya, 0.02], Lo.style[1], K.PAINT);
          B.quad([xa, ya, 0.03], [xb, ya, 0.03], [xb, yb, 0.03], [xa, yb, 0.03], [0.35, 0.22, 0.18], K.SHOP, [0, 0, 1, 1], 0.9);
          B.quad([xa, yb, 0.02], [xb, yb, 0.02], [xb, yc, 0.02], [xa, yc, 0.02], Lo.style[1], K.PAINT);
          if (Lo.look.awning < 2) B.quad([xa, yb + 0.02, 0.05], [xb, yb + 0.02, 0.05], [xb, yb - 0.5, 1.3], [xa, yb - 0.5, 1.3], Lo.style[2], K.AWNING, [xa, 0, xb, 0.85]);
        }
      }
    }
    B.quad([seg.x0, h.E - 0.4, 0.06], [seg.x1, h.E - 0.4, 0.06], [seg.x1, h.E - 0.18, 0.06], [seg.x0, h.E - 0.18, 0.06], TRIM, K.TRIM);
    F.append(B, to);
  }
}

// Ближний слой: ниши, подоконники, перемычки, ставни, балконы, маркизы, ящики с цветами, слуховые окна
function* buildNear(h, N, Rl, planters, deform, shops) {
  const R = h.roofType === 'mansard' ? roofRings(h) : null;
  for (const e of h.edges) for (const seg of e.segs) {
    const shop = shops.get(seg), Lo = layout(seg, h.E, shop), to = edgeFrame(e, seg, h.E, deform);
    const r = mulberry(seg.seed * 7 + 3);
    const accent = STREET_DETAILS ? roofAccent(seg, h, R) : null;
    const B = new Builder(), rails = new Builder(), pl = [];
    const trim = TRIM, wall = seg.wall, shutter = Lo.shutter;
    for (const fl of Lo.floors) {
      const { rows, cells, f, y0, y1 } = fl;
      for (const [xa, xb, type] of cells) for (let q = 0; q + 1 < rows.length; q++) {
        const ya = rows[q], yb = rows[q + 1];
        if (((type === 'win' || type === 'shop') && q === 1) || (type === 'door' && q <= 1)) continue;
        let col = wall, kind = K.WALL;
        if (type === 'shop') { col = q === 3 ? wall : Lo.style[1]; kind = q === 3 ? K.WALL : K.PAINT; }
        if (xb - xa > 0.01) B.panel([xa, ya, 0], X, Y, xb - xa, yb - ya, col, kind, 1.6);
      }
      if (STREET_DETAILS && f === 0 && !shop && Lo.look.rustic) {                                           // руст: рельефные полосы между проёмами
        for (const [xa, xb, type] of cells) if (type === 'wall' && xb - xa > 0.12)
          for (let y = y0 + 0.55; y < y1 - 0.45; y += 0.52) B.box(xa, y, -0.02, xb, y + 0.4, 0.045, shadeOf(wall, 0.96), K.WALL);
      }
      if (STREET_DETAILS && f > 0 && Lo.look.quoins) {                                                      // лопатки из «камней» по краям домика
        for (let y = y0 + 0.04, k = f; y < y1 - 0.5; y += 0.5, k++) {
          const w = k % 2 ? 0.36 : 0.24;
          B.box(seg.x0, y, -0.02, seg.x0 + w, y + 0.42, 0.05, shadeOf(trim, 0.97), K.TRIM);
          B.box(seg.x1 - w, y, -0.02, seg.x1, y + 0.42, 0.05, shadeOf(trim, 0.97), K.TRIM);
        }
      }
      let wi = 0;
      for (const [xa, xb, type] of cells) {
        if (type !== 'win' && type !== 'shop' && type !== 'door') continue;
        const door = type === 'door', ya = door ? rows[0] : rows[1], yb = rows[2];
        const dp = type === 'shop' ? 0.2 : door ? 0.35 : 0.3, zb = -dp, rv = shadeOf(trim, 0.92);
        B.quad([xa, ya, 0], [xa, ya, zb], [xa, yb, zb], [xa, yb, 0], rv, K.TRIM);
        B.quad([xb, ya, zb], [xb, ya, 0], [xb, yb, 0], [xb, yb, zb], rv, K.TRIM);
        B.quad([xa, yb, zb], [xb, yb, zb], [xb, yb, 0], [xa, yb, 0], shadeOf(rv, 0.7), K.TRIM);
        B.quad([xa, ya, 0], [xb, ya, 0], [xb, ya, zb], [xa, ya, zb], rv, K.TRIM);
        if (door) {
          B.quad([xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb], shutter.map((v) => v * 0.75), K.DOOR, [0, 0, 1, 1], 0.5);
          B.box(xa - 0.16, yb, -0.02, xb + 0.16, yb + 0.28, 0.08, trim, K.TRIM);
          continue;
        }
        if (type === 'shop') {
          B.quad([xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb], [0.35, 0.22, 0.18], K.SHOP, [0, 0, 1, 1], 0.9);
          const x0 = xa + 0.05, x1 = xb - 0.05, yA = rows[2] + 0.02, kindA = STREET_DETAILS ? Lo.look.awning : 0;
          if (kindA === 0) {                                     // маркиза: изогнутое полотно в полоску с фестоном
            const out = 1.35, drop = 0.6;
            const at = (s) => [out * Math.sin(s * Math.PI / 2), yA - drop * (1 - Math.cos(s * Math.PI / 2))];
            for (let k = 0; k < 5; k++) {
              const [za, y0a] = at(k / 5), [zb2, y0b] = at((k + 1) / 5);
              B.quad([x0, y0a, za + 0.02], [x1, y0a, za + 0.02], [x1, y0b, zb2 + 0.02], [x0, y0b, zb2 + 0.02], Lo.style[2], K.AWNING, [x0, k / 5 * 0.85, x1, (k + 1) / 5 * 0.85]);
            }
            const [ze, ye] = at(1);
            B.quad([x0, ye - 0.24, ze + 0.02], [x1, ye - 0.24, ze + 0.02], [x1, ye, ze + 0.02], [x0, ye, ze + 0.02], Lo.style[2], K.AWNING, [x0, 0.86, x1, 1.0]);
          } else if (kindA === 1) {                              // прямая маркиза на спицах, с ровной оборкой и боковинами
            const out = 1.5, ye = yA - 0.7;
            B.quad([x0, yA, 0.04], [x1, yA, 0.04], [x1, ye, out], [x0, ye, out], Lo.style[2], K.AWNING, [x0, 0, x1, 0.85]);
            B.quad([x0, ye - 0.22, out], [x1, ye - 0.22, out], [x1, ye, out], [x0, ye, out], Lo.style[2], K.AWNING, [x0, 0.86, x1, 1.0]);
            for (const x of [x0, x1]) B.tri([x, yA, 0.04], [x, ye, out], [x, ye, 0.04], shadeOf(Lo.style[2], 0.85), K.PAINT);
          } else if (kindA === 2) {                              // без маркизы: лампы на «гусиных шеях» светят на вывеску
            const n = Math.max(2, Math.round((x1 - x0) / 1.3));
            for (let k = 0; k < n; k++) {
              const x = x0 + (x1 - x0) * (k + 0.5) / n, y = rows[3] + 0.16;
              B.box(x - 0.02, y, 0, x + 0.02, y + 0.03, 0.42, IRON_COL, K.PAINT);
              B.box(x - 0.02, y - 0.12, 0.39, x + 0.02, y + 0.03, 0.43, IRON_COL, K.PAINT);
              B.box(x - 0.1, y - 0.2, 0.33, x + 0.1, y - 0.12, 0.5, Lo.style[1], K.PAINT);
              B.box(x - 0.05, y - 0.25, 0.37, x + 0.05, y - 0.2, 0.46, [1, 0.86, 0.55], K.LAMP);
            }
          } else {                                               // козырёк-«маркиз» с гирляндой лампочек по краю
            const out = 1.05;
            B.box(x0, yA - 0.16, 0, x1, yA, out, Lo.style[2], K.PAINT);
            B.box(x0 - 0.03, yA, 0, x1 + 0.03, yA + 0.05, out + 0.03, shadeOf(Lo.style[1], 0.9), K.PAINT);
            for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.42) B.box(x - 0.035, yA - 0.22, out - 0.1, x + 0.035, yA - 0.16, out - 0.03, [1, 0.86, 0.55], K.LAMP);
          }
          if (STREET_DETAILS && Lo.look.blade && seg.x1 - xb > 0.3) {     // вывеска-флажок на кованом кронштейне
            const x = xb + 0.22, y = rows[3] + 0.25;
            B.box(x - 0.02, y + 0.62, 0, x + 0.02, y + 0.66, 0.82, IRON_COL, K.PAINT);
            B.tri([x, y + 0.24, 0.02], [x, y + 0.62, 0.02], [x, y + 0.62, 0.4], IRON_COL, K.PAINT);
            B.box(x - 0.035, y, 0.24, x + 0.035, y + 0.56, 0.8, Lo.style[2], K.PAINT);
            B.box(x - 0.04, y + 0.2, 0.36, x + 0.04, y + 0.36, 0.68, [0.95, 0.86, 0.6], K.PAINT);
          }
          continue;
        }
        B.quad([xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb], [0.93, 0.9, 0.84], K.GLASS, [0, 0, 1, 1], Lo.lit(f, wi++));
        const c = (xa + xb) / 2;
        B.box(xa - 0.09, ya - 0.11, -0.02, xb + 0.09, ya + 0.01, 0.14, trim, K.TRIM);                     // подоконник
        B.box(xa - 0.13, yb, -0.02, xb + 0.13, yb + 0.2, 0.06, trim, K.TRIM);                             // перемычка
        const lintel = STREET_DETAILS ? Lo.look.lintel : 0;
        if (!fl.top && lintel === 0) B.box(c - 0.11, yb - 0.04, -0.02, c + 0.11, yb + 0.3, 0.1, trim, K.TRIM);   // замковый камень
        else if (!fl.top && lintel === 1) {                                                              // низкий фронтончик
          B.tri([xa - 0.2, yb + 0.14, 0.07], [xb + 0.2, yb + 0.14, 0.07], [c, yb + 0.36, 0.07], trim, K.TRIM);
          B.box(xa - 0.22, yb + 0.1, -0.02, xb + 0.22, yb + 0.17, 0.13, shadeOf(trim, 1.03), K.TRIM);
        } else if (!fl.top && lintel === 2) {                                                            // карниз-козырёк на двух консолях
          B.box(xa - 0.24, yb + 0.2, -0.02, xb + 0.24, yb + 0.29, 0.22, trim, K.TRIM);
          for (const bx of [xa - 0.12, xb + 0.12]) B.box(bx - 0.05, yb - 0.02, -0.02, bx + 0.05, yb + 0.2, 0.15, shadeOf(trim, 0.92), K.TRIM);
        }
        const full = f === Lo.balconyFloor || f === Lo.look.topBalcony;
        if (STREET_DETAILS && Lo.look.winAwning && f > 0 && !fl.top && !full) {                              // маркиза над окном
          const yA = yb + 0.04, ye = yb - 0.5, out = 0.62, wa = xa - 0.1, wb = xb + 0.1;
          B.quad([wa, ye, out], [wb, ye, out], [wb, yA, 0.05], [wa, yA, 0.05], Lo.look.winAwning, K.AWNING, [wa, 0.85, wb, 0]);
          B.quad([wa, ye - 0.14, out], [wb, ye - 0.14, out], [wb, ye, out], [wa, ye, out], Lo.look.winAwning, K.AWNING, [wa, 1.0, wb, 0.86]);
          for (const x of [wa, wb]) B.tri([x, yA, 0.05], [x, ye, out], [x, ye, 0.05], shadeOf(Lo.look.winAwning, 0.85), K.PAINT);
        }
        if (Lo.shutters && f > 0 && !fl.top) {
          const sw = (xb - xa) / 2 + 0.04, open = 0.12 + r() * 0.1;
          B.quad([xa - sw, ya, open], [xa - 0.02, ya, 0.04], [xa - 0.02, yb, 0.04], [xa - sw, yb, open], shutter, K.SHUTTER, [0, 0, 1, yb - ya]);
          B.quad([xb + 0.02, ya, 0.04], [xb + sw, ya, open], [xb + sw, yb, open], [xb + 0.02, yb, 0.04], shutter, K.SHUTTER, [0, 0, 1, yb - ya]);
        }
        if (f === 0) continue;
        const roll = r();
        if (!full && roll < 0.16) {                                                          // балкончик на консолях
          B.box(xa - 0.25, ya - 0.08, -0.02, xb + 0.25, ya + 0.06, 0.55, trim, K.TRIM);
          for (const bx of [xa - 0.1, xb + 0.1]) B.box(bx - 0.06, ya - 0.34, -0.02, bx + 0.06, ya - 0.08, 0.4, shadeOf(trim, 0.9), K.TRIM);
          rails.quad([xa - 0.25, ya + 0.06, 0.53], [xb + 0.25, ya + 0.06, 0.53], [xb + 0.25, ya + 0.95, 0.53], [xa - 0.25, ya + 0.95, 0.53], IRON_COL, K.IRON, [0, 0, (xb - xa + 0.5) / 0.9, 0.95]);
          for (const bx of [xa - 0.24, xb + 0.24]) rails.quad([bx, ya + 0.06, 0], [bx, ya + 0.06, 0.53], [bx, ya + 0.95, 0.53], [bx, ya + 0.95, 0], IRON_COL, K.IRON, [0, 0, 0.55, 0.95]);
          if (r() < 0.7) pl.push([xb + 0.05, ya + 0.35, 0.35, 0.8, 'pot']);
        } else if (!full && roll < 0.62) {                                                   // французский балкончик
          rails.quad([xa - 0.05, ya, 0.16], [xb + 0.05, ya, 0.16], [xb + 0.05, ya + 0.85, 0.16], [xa - 0.05, ya + 0.85, 0.16], IRON_COL, K.IRON, [0, 0, (xb - xa + 0.1) / 0.9, 0.95]);
        } else if (!full && roll < 0.8) {                                                    // ящик с цветами
          B.box(xa - 0.02, ya + 0.01, 0.02, xb + 0.02, ya + 0.22, 0.3, [0.62, 0.36, 0.3], K.PAINT);
          pl.push([c, ya + 0.3, 0.18, xb - xa]);
        }
      }
      if (f === Lo.balconyFloor || f === Lo.look.topBalcony) {                                                                            // сплошной балкон бельэтажа
        const xa = seg.x0 + 0.1, xb = seg.x1 - 0.1;
        B.box(xa, y0 - 0.06, -0.02, xb, y0 + 0.1, 0.72, trim, K.TRIM);
        for (let x = xa + 0.3; x < xb; x += 1.1) B.box(x - 0.08, y0 - 0.38, -0.02, x + 0.08, y0 - 0.06, 0.5, shadeOf(trim, 0.9), K.TRIM);
        rails.quad([xa, y0 + 0.1, 0.7], [xb, y0 + 0.1, 0.7], [xb, y0 + 1.05, 0.7], [xa, y0 + 1.05, 0.7], IRON_COL, K.IRON, [0, 0, (xb - xa) / 0.9, 0.95]);
        for (const x of [xa + 0.02, xb - 0.02]) rails.quad([x, y0 + 0.1, 0], [x, y0 + 0.1, 0.7], [x, y0 + 1.05, 0.7], [x, y0 + 1.05, 0], IRON_COL, K.IRON, [0, 0, 0.8, 0.95]);
        if (STREET_DETAILS && xb - xa > 3.5) {
          const c = (xa + xb) / 2, w = Math.min(1.6, (xb - xa) * 0.3);
          B.box(c - w / 2, y0 + 0.54, 0.57, c + w / 2, y0 + 0.78, 0.83, [0.62, 0.36, 0.3], K.PAINT);
          pl.push([c, y0 + 0.84, 0.7, w]);
        }
      }
      if (f < Lo.nUp) B.box(seg.x0 - 0.04, y1 - 0.2, -0.02, seg.x1 + 0.04, y1 + 0.02, 0.15, trim, K.TRIM);  // карниз между этажами
    }
    B.box(seg.x0 - 0.06, h.E - 0.4, -0.02, seg.x1 + 0.06, h.E - 0.18, 0.24, trim, K.TRIM);                     // главный карниз
    // слуховые окна на мансарде
    if (R && R.low > 0.45) {
      const slope = (y) => { const s = clamp01((y - h.E - 0.04) / (R.yLow - h.E - 0.04)); return -R.low * s * s; };
      for (const c of Lo.centers) {
        if (c < 1.1 || c > e.L - 1.1 || r() < 0.25) continue;
        if (accent && Math.abs(c - accent.center) < accent.half + 0.7) continue;
        const half = 0.6, yb = h.E + 0.25, yt = Math.min(h.E + 1.5, R.yLow - 0.15), zd = slope(yb) + 0.06, back = -R.low - 0.3;
        const gw = 0.72, g0 = c - gw / 2, g1 = c + gw / 2, gb = yb + 0.25, gt = yt - 0.02, dp = 0.14;
        B.panel([c - half, yb, zd], X, Y, g0 - (c - half), yt - yb, trim, K.TRIM, 2);
        B.panel([g1, yb, zd], X, Y, c + half - g1, yt - yb, trim, K.TRIM, 2);
        B.panel([g0, yb, zd], X, Y, gw, gb - yb, trim, K.TRIM, 2);
        B.quad([g0, gb, zd - dp], [g1, gb, zd - dp], [g1, gt, zd - dp], [g0, gt, zd - dp], [0.93, 0.9, 0.84], K.GLASS, [0, 0, 1, 1], r());
        B.quad([g0, gb, zd], [g0, gb, zd - dp], [g0, gt, zd - dp], [g0, gt, zd], shadeOf(trim, 0.85), K.TRIM);
        B.quad([g1, gb, zd - dp], [g1, gb, zd], [g1, gt, zd], [g1, gt, zd - dp], shadeOf(trim, 0.85), K.TRIM);
        const arch = (rr, a) => [c + Math.cos(a) * rr, yt + Math.sin(a) * rr * 0.8];
        for (let s = 0; s < 6; s++) {
          const a0 = s / 6 * Math.PI, a1 = (s + 1) / 6 * Math.PI, [xa, ya] = arch(half, a0), [xb, yb2] = arch(half, a1);
          B.tri([c, yt, zd], [xa, ya, zd], [xb, yb2, zd], trim, K.TRIM);
          const [ra, rya] = arch(half + 0.08, a0), [rb, ryb] = arch(half + 0.08, a1);
          B.quad([ra, rya, zd + 0.1], [rb, ryb, zd + 0.1], [rb, ryb, back], [ra, rya, back], h.roof, K.ROOF, [0, s / 6, 1.5, (s + 1) / 6]);
        }
        B.quad([c - half, yb, back], [c - half, yb, zd], [c - half, yt, zd], [c - half, yt, back], shadeOf(trim, 0.8), K.TRIM);
        B.quad([c + half, yb, zd], [c + half, yb, back], [c + half, yt, back], [c + half, yt, zd], shadeOf(trim, 0.8), K.TRIM);
      }
    }
    N.append(B, to); Rl.append(rails, to);
    for (const [x, y, z, w, t] of pl) planters.push([...to([x, y, z]), w, t]);
    yield;
  }
}

// ── Сборка ────────────────────────────────────────────────────────────────
export function buildFacades(scene, look, plan, shopFronts, { progressive = false } = {}) {
  const { houses } = plan;
  const material = paintMaterial(look);
  const railMat = paintMaterial(look, { map: railTexture() });
  const leafTex = leafTexture(3), flowerTex = leafTexture(8, true);
  const leafMat = paintMaterial(look, { map: leafTex }), flowerMat = paintMaterial(look, { map: flowerTex });
  const wordOf = (mesh) => ({ faceIndex }) => WORDS[Math.round(mesh.geometry.attributes.aKind.array[faceIndex * 3])] || 'wall';

  // витрины: к какому «домику» относится каждая лавка
  const shops = new Map();
  for (const s of shopFronts) {
    let best = null, bd = 1.2;
    for (const h of houses) {
      if (Math.abs(h.cx - s.x) > 40 || Math.abs(h.cz - s.z) > 40) continue;
      for (const e of h.edges) for (const seg of e.segs) {
        const along = (s.x - e.ax) * e.tx + (s.z - e.az) * e.tz, off = Math.abs((s.x - e.ax) * e.nx + (s.z - e.az) * e.nz);
        if (along < seg.x0 - 0.5 || along > seg.x1 + 0.5 || off > bd) continue;
        bd = off; best = { seg, e, h, at: Math.max(seg.x0 + 0.5, Math.min(seg.x1 - 0.5, along)), w: s.w, name: s.name };
      }
    }
    if (best && !shops.has(best.seg)) shops.set(best.seg, best);
  }

  // кварталы
  const chunks = new Map();
  for (const h of houses) {
    let c = chunks.get(h.chunk);
    if (!c) { c = { houses: [], x: 0, z: 0, near: null, far: null }; chunks.set(h.chunk, c); }
    c.houses.push(h); c.x += h.cx; c.z += h.cz;
  }
  const deforms = new Map(houses.map((h) => [h, houseDeform(h)]));
  let tris = 0;
  const add = (geo, mat, word) => {
    const m = new THREE.Mesh(geo, mat);
    m.userData.noLift = true;
    if (word) m.userData.word = word === true ? wordOf(m) : word;
    tris += geo.attributes.position.count / 3;
    scene.add(m);
    return m;
  };
  const list = [...chunks.values()];
  for (const c of list) {
    c.x /= c.houses.length; c.z /= c.houses.length;
    c.baseReady = false;
  }
  function* buildBase(c) {
    const S = new Builder(), F = new Builder();
    for (const h of c.houses) {
      const s = new Builder(); buildShell(h, s, deforms.get(h)); S.append(s);
      buildFar(h, F, deforms.get(h), shops);
      yield;
    }
    let shell = null, far = null, committed = false;
    try {
      if (S.pos.length) shell = yield* streamGeometry(S, true, Math.PI / 4);
      yield;
      if (F.pos.length) far = yield* streamGeometry(F, true);
      if (shell) add(shell, material, true);
      if (far) c.far = add(far, material, true);
      c.baseReady = committed = true;
    } finally {
      if (!committed) { shell?.dispose(); far?.dispose(); }
    }
  }
  for (const c of list) {
    // За пределами ближайшего окружения геометрия достраивается уже во время прогулки.
    if (!progressive || c.x * c.x + c.z * c.z < NEAR * NEAR) for (const _ of buildBase(c)) { /* до первого кадра */ }
  }
  // вывески лавок: золотые буквы на крашеном дереве, над витриной
  for (const { seg, e, h, at, w, name } of shops.values()) {
    const Lo = layout(seg, h.E, { at, w }), [xa, xb] = Lo.floors[0].cells[1], [, , y0, y1] = Lo.floors[0].rows;
    const B = new Builder();
    B.quad([xa + 0.1, y0 + 0.04, 0.05], [xb - 0.1, y0 + 0.04, 0.05], [xb - 0.1, y1 - 0.04, 0.05], [xa + 0.1, y1 - 0.04, 0.05], [1, 1, 1], K.PAINT);
    B.transform(edgeFrame(e, seg, h.E, deforms.get(h)));
    add(B.geometry(0, 0), paintMaterial(look, { map: signTexture(name, Lo.style[0]) }), 'sign');
  }

  // Ближний квартал собирается частями. Дальний фасад остаётся видимым до полной готовности.
  function* buildChunk(c) {
    const N = new Builder(), Rl = new Builder(), planters = [];
    const g = new THREE.Group();
    let committed = false;
    try {
      for (const h of c.houses) yield* buildNear(h, N, Rl, planters, deforms.get(h), shops);
      if (N.pos.length) g.add(new THREE.Mesh(yield* streamGeometry(N, true), material));
      if (Rl.pos.length) { const m = new THREE.Mesh(yield* streamGeometry(Rl), railMat); m.layers.set(1); g.add(m); }
      const boxes = planters.filter((q) => !q[4]), pots = planters.filter((q) => q[4]);
      const leafy = [
        [boxes.map(([x, y, z, w]) => [x, y + 0.08, z, 0.2 + w * 0.1, true]), [0.42, 0.6, 0.4], leafMat, leafTex],
        [boxes.map(([x, y, z, w]) => [x, y + 0.16, z, 0.16 + w * 0.09, true]), [0.95, 0.5, 0.55], flowerMat, flowerTex],
        [pots.map(([x, y, z]) => [x, y, z, 0.3, false]), [0.4, 0.58, 0.38], leafMat, leafTex],
      ];
      for (const [i, [list, color, mat, map]] of leafy.entries()) {
        if (!list.length) continue;
        const m = new THREE.Mesh(foliage(list, color, 4 + i), mat); m.userData.leafMap = map; g.add(m);
        m.geometry.computeBoundingSphere();
        yield;
      }
      g.traverse((o) => { o.userData.noLift = true; });
      scene.add(g);
      c.near = g;
      if (c.far) c.far.visible = false;
      committed = true;
    } finally {
      if (!committed) g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
  }
  function dropChunk(c) {
    c.near.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    scene.remove(c.near); c.near = null;
    if (c.far) c.far.visible = true;
  }
  let pending = null;
  function update(x, z, budget = 1) {
    const distance2 = (c) => (c.x - x) ** 2 + (c.z - z) ** 2;
    if (pending?.kind === 'near' && distance2(pending.chunk) > FAR * FAR) {
      pending.work.return();
      pending = null;
    }
    for (const c of list) if (c.near && distance2(c) > FAR * FAR) dropChunk(c);
    if (budget <= 0) return;
    const deadline = budget === Infinity ? Infinity : performance.now() + BUILD_SLICE_MS;
    let built = 0;
    do {
      if (!pending) {
        let nearest = null, d = Infinity;
        for (const c of list) {
          const next = distance2(c);
          if (c.baseReady && (c.near || next >= NEAR * NEAR)) continue;
          if (next < d) { nearest = c; d = next; }
        }
        if (!nearest) break;
        const kind = nearest.baseReady ? 'near' : 'base';
        pending = { chunk: nearest, kind, work: kind === 'near' ? buildChunk(nearest) : buildBase(nearest) };
      }
      if (pending.work.next().done) { pending = null; built++; }
    } while (built < budget && performance.now() < deadline);
  }
  function warmStart(x, z) {
    if (!list.length) return;
    if (!progressive) { update(x, z, Infinity); return; }
    const nearest = list.reduce((a, c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (a.x - x) ** 2 + (a.z - z) ** 2 ? c : a);
    if (!nearest.baseReady) for (const _ of buildBase(nearest)) { /* ближний город */ }
    for (const _ of buildChunk(nearest)) { /* ближайшие окна и витрины */ }
  }
  return { update, warmStart, stats: () => ({ houses: houses.length, chunks: list.length, base: list.filter((c) => c.baseReady).length,
    near: list.filter((c) => c.near).length, pending: Number(Boolean(pending)), baseTris: tris }) };
}
