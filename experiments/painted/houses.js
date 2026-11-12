// houses.js — процедурные парижские дома «как нарисованные»:
// каждый этаж чуть нависает над нижним, окна — настоящие ниши со ставнями и подоконниками,
// мансарда изогнута колоколом, на крыше слуховые окна с арками и кривые трубы.
// В конце весь дом слегка «оживает»: наклон, выпуклый фасад, волнистые линии этажей, просевший конёк.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const K = { WALL: 0, ROOF: 1, TRIM: 2, GLASS: 3, SHUTTER: 4, COBBLE: 5, LEAF: 6, IRON: 7, SHOP: 8, AWNING: 9, LAMP: 10, BARK: 11, PAINT: 13, PAVING: 14, DOOR: 15 };

export class Builder {
  constructor() { this.pos = []; this.col = []; this.uv = []; this.kind = []; this.rand = []; }
  // четырёхугольник a-b-c-d (a, b — низ), uv по прямоугольнику
  quad(a, b, c, d, col, kind, [u0, v0, u1, v1] = [0, 0, 1, 1], rand = 0) {
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    for (let i = 0; i < 6; i++) { this.col.push(...col); this.kind.push(kind); this.rand.push(rand); }
  }
  tri(a, b, c, col, kind, uv = [0, 0, 1, 0, 0.5, 1], rand = 0) {
    this.pos.push(...a, ...b, ...c); this.uv.push(...uv);
    for (let i = 0; i < 3; i++) { this.col.push(...col); this.kind.push(kind); this.rand.push(rand); }
  }
  // плоскость от o вдоль u на w и вдоль v на h, разбитая на клетки не больше step метров
  panel(o, u, v, w, h, col, kind, step = 1.5, rand = 0, uvScale = 1) {
    const nu = Math.max(1, Math.ceil(w / step)), nv = Math.max(1, Math.ceil(h / step));
    const P = (i, j) => [o[0] + u[0] * w * i / nu + v[0] * h * j / nv, o[1] + u[1] * w * i / nu + v[1] * h * j / nv, o[2] + u[2] * w * i / nu + v[2] * h * j / nv];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      this.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), col, kind,
        [w * i / nu * uvScale, h * j / nv * uvScale, w * (i + 1) / nu * uvScale, h * (j + 1) / nv * uvScale], rand);
    }
  }
  box(x0, y0, z0, x1, y1, z1, col, kind, rand = 0) {
    const c = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
    const f = (a, b, cc, d) => this.quad(c[a], c[b], c[cc], c[d], col, kind, [0, 0, 1, 1], rand);
    f(0, 1, 2, 3); f(5, 4, 7, 6); f(4, 0, 3, 7); f(1, 5, 6, 2); f(3, 2, 6, 7); f(4, 5, 1, 0);
  }
  // тело вращения по профилю [[r, y], ...]
  lathe(cx, cy, cz, profile, seg, col, kind, phase = 0) {
    for (let k = 0; k + 1 < profile.length; k++) for (let s = 0; s < seg; s++) {
      const a0 = phase + s / seg * Math.PI * 2, a1 = phase + (s + 1) / seg * Math.PI * 2;
      const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
      const p = (r, y, a) => [cx + Math.cos(a) * r, cy + y, cz + Math.sin(a) * r];
      this.quad(p(r0, y0, a0), p(r0, y0, a1), p(r1, y1, a1), p(r1, y1, a0), col, kind, [s / seg, k / profile.length, (s + 1) / seg, (k + 1) / profile.length]);
    }
  }
  append(other, fn = (p) => p) {
    for (let i = 0; i < other.pos.length; i += 3) this.pos.push(...fn([other.pos[i], other.pos[i + 1], other.pos[i + 2]]));
    this.col.push(...other.col); this.uv.push(...other.uv); this.kind.push(...other.kind); this.rand.push(...other.rand);
  }
  transform(fn) {
    for (let i = 0; i < this.pos.length; i += 3) {
      const p = fn([this.pos[i], this.pos[i + 1], this.pos[i + 2]]);
      this.pos[i] = p[0]; this.pos[i + 1] = p[1]; this.pos[i + 2] = p[2];
    }
  }
  geometry(base = 0, crease = Math.PI / 5) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aRand', new THREE.Float32BufferAttribute(this.rand, 1));
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(new Array(this.kind.length).fill(base), 1));
    return crease ? toCreasedNormals(g, crease) : g;
  }
}

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const shadeOf = (c, k) => c.map((v) => v * k);
const IRON_COL = [0.17, 0.15, 0.27];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], NX = [-1, 0, 0], NZ = [0, 0, -1];

// Дом в своих координатах: фасад смотрит в +z, от x = 0 до w, вглубь до z = -d, низ y = 0.
// Возвращает геометрию дома, перила (для прозрачного материала), вывеску и точки для цветов.
export function buildHouse(o) {
  const rnd = mulberry(o.seed);
  const B = new Builder(), rails = new Builder(), sign = new Builder();
  const planters = [], ivy = [];
  const { w: W, d: D, floors: F } = o;
  const fh = (f) => f === 0 ? 3.9 : f === F - 1 ? 2.85 : 3.0 + rnd() * 0.15;
  const ys = [0]; for (let f = 0; f < F; f++) ys.push(ys[f] + fh(f));
  const H = ys[F];
  const zOf = (f) => f === 0 ? 0 : 0.05 * f;                    // каждый этаж чуть нависает
  const cols = Math.max(2, Math.round((W - 0.6) / 2.2));
  const margin = 0.55 + rnd() * 0.25, stepX = (W - 2 * margin) / cols;
  const centers = Array.from({ length: cols }, (_, i) => margin + stepX * (i + 0.5) + (rnd() - 0.5) * 0.12);
  const wall = o.wall, trim = o.trim, shutter = o.shutter;

  for (let f = 0; f < F; f++) {
    const y0 = ys[f], y1 = ys[f + 1], zf = zOf(f);
    let rows, cells;
    if (f === 0 && o.awning) {
      rows = [0, 0.45, 3.0, 3.55, y1];
      cells = [[0, 0.45, 'pier'], [0.45, W - 0.45, 'shop'], [W - 0.45, W, 'pier']];
    } else if (f === 0) {                                        // жилой первый этаж: ворота и высокие окна
      rows = [0, 0.95, 3.0, y1];
      cells = []; let x = 0;
      const door = o.doorAt ?? (centers.length > 2 ? 1 : 0);
      centers.forEach((c, i) => {
        const ww = i === door ? 1.5 : 1.1;
        cells.push([x, c - ww / 2, 'wall']); cells.push([c - ww / 2, c + ww / 2, i === door ? 'door' : 'win']); x = c + ww / 2;
      });
      cells.push([x, W, 'wall']);
    } else {
      const top = f === F - 1;
      const ww = top ? 0.92 : 1.05, sill = y0 + (top ? 0.7 : 0.85), wtop = Math.min(y1 - 0.35, sill + (top ? 1.45 : 1.85));
      rows = [y0, sill, wtop, y1];
      cells = []; let x = 0;
      for (const c of centers) { cells.push([x, c - ww / 2, 'wall']); cells.push([c - ww / 2, c + ww / 2, 'win']); x = c + ww / 2; }
      cells.push([x, W, 'wall']);
    }
    // фасад этажа — сетка без Т-стыков, чтобы деформация не рвала швы
    for (const [xa, xb, type] of cells) for (let r = 0; r + 1 < rows.length; r++) {
      const ya = rows[r], yb = rows[r + 1];
      const hole = ((type === 'win' || type === 'shop') && r === 1) || (type === 'door' && r <= 1);
      if (hole) continue;
      let col = wall, kind = K.WALL;
      if (type === 'shop') { col = r === 0 ? o.shopColor : r === 2 ? o.shopColor : wall; kind = r === 3 ? K.WALL : K.PAINT; }
      if (type === 'shop' && r === 2 && o.sign) {
        sign.quad([xa, ya, zf + 0.03], [xb, ya, zf + 0.03], [xb, yb, zf + 0.03], [xa, yb, zf + 0.03], [1, 1, 1], K.PAINT);
      }
      B.panel([xa, ya, zf], X, Y, xb - xa, yb - ya, col, kind, 1.2);
    }
    // ниши окон
    for (const [xa, xb, type] of cells) {
      if (type !== 'win' && type !== 'shop' && type !== 'door') continue;
      const door = type === 'door';
      const ya = door ? rows[0] : rows[1], yb = rows[2], dp = type === 'shop' ? 0.2 : door ? 0.35 : 0.3, zb = zf - dp, rv = shadeOf(trim, 0.92);
      B.quad([xa, ya, zf], [xa, ya, zb], [xa, yb, zb], [xa, yb, zf], rv, K.TRIM);
      B.quad([xb, ya, zb], [xb, ya, zf], [xb, yb, zf], [xb, yb, zb], rv, K.TRIM);
      B.quad([xa, yb, zb], [xb, yb, zb], [xb, yb, zf], [xa, yb, zf], shadeOf(rv, 0.7), K.TRIM);
      B.quad([xa, ya, zf], [xb, ya, zf], [xb, ya, zb], [xa, ya, zb], rv, K.TRIM);
      if (door) {                                                                                               // ворота: две створки с филёнками и фрамугой
        B.quad([xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb], o.doorColor || shutter.map((v) => v * 0.75), K.DOOR, [0, 0, 1, 1], rnd());
        B.box(xa - 0.16, yb, zf - 0.02, xb + 0.16, yb + 0.28, zf + 0.08, trim, K.TRIM);
        B.box((xa + xb) / 2 - 0.13, yb - 0.04, zf - 0.02, (xa + xb) / 2 + 0.13, yb + 0.4, zf + 0.12, trim, K.TRIM);
        continue;
      }
      B.quad([xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb], type === 'shop' ? [0.35, 0.22, 0.18] : [0.93, 0.9, 0.84], type === 'shop' ? K.SHOP : K.GLASS, [0, 0, 1, 1], rnd());
      if (type === 'shop') continue;
      const c = (xa + xb) / 2;
      B.box(xa - 0.09, ya - 0.11, zf - 0.02, xb + 0.09, ya + 0.01, zf + 0.14, trim, K.TRIM);                   // подоконник
      B.box(xa - 0.13, yb, zf - 0.02, xb + 0.13, yb + 0.2, zf + 0.06, trim, K.TRIM);                           // перемычка
      B.box(c - 0.11, yb - 0.04, zf - 0.02, c + 0.11, yb + 0.3, zf + 0.1, trim, K.TRIM);                        // замковый камень
      if (o.shutters && f < F - 1) {
        const sw = (xb - xa) / 2 + 0.04, open = 0.12 + rnd() * 0.1;
        B.quad([xa - sw, ya, zf + open], [xa - 0.02, ya, zf + 0.04], [xa - 0.02, yb, zf + 0.04], [xa - sw, yb, zf + open], shutter, K.SHUTTER, [0, 0, 1, (yb - ya)]);
        B.quad([xb + 0.02, ya, zf + 0.04], [xb + sw, ya, zf + open], [xb + sw, yb, zf + open], [xb + 0.02, yb, zf + 0.04], shutter, K.SHUTTER, [0, 0, 1, (yb - ya)]);
      }
      if (f !== o.balconyFloor && rnd() < 0.55) {                                                              // французский балкончик
        rails.quad([xa - 0.05, ya, zf + 0.16], [xb + 0.05, ya, zf + 0.16], [xb + 0.05, ya + 0.85, zf + 0.16], [xa - 0.05, ya + 0.85, zf + 0.16], IRON_COL, K.IRON, [0, 0, (xb - xa + 0.1) / 0.9, 0.95]);
      } else if (f !== o.balconyFloor && rnd() < 0.6) {
        B.box(xa - 0.02, ya + 0.01, zf + 0.02, xb + 0.02, ya + 0.22, zf + 0.3, [0.62, 0.36, 0.3], K.PAINT);       // ящик с цветами
        planters.push([c, ya + 0.3, zf + 0.18, xb - xa]);
      }
    }
    // сплошной балкон «бельэтажа» на консолях
    if (f === o.balconyFloor) {
      B.box(-0.04, y0 - 0.06, zf - 0.02, W + 0.04, y0 + 0.1, zf + 0.72, trim, K.TRIM);
      for (let x = 0.3; x < W; x += 1.1) B.box(x - 0.08, y0 - 0.38, zf - 0.02, x + 0.08, y0 - 0.06, zf + 0.5, shadeOf(trim, 0.9), K.TRIM);
      rails.quad([0, y0 + 0.1, zf + 0.7], [W, y0 + 0.1, zf + 0.7], [W, y0 + 1.05, zf + 0.7], [0, y0 + 1.05, zf + 0.7], IRON_COL, K.IRON, [0, 0, W / 0.9, 0.95]);
      for (const x of [0.02, W - 0.02]) rails.quad([x, y0 + 0.1, zf], [x, y0 + 0.1, zf + 0.7], [x, y0 + 1.05, zf + 0.7], [x, y0 + 1.05, zf], IRON_COL, K.IRON, [0, 0, 0.8, 0.95]);
    }
    // карниз между этажами
    if (f < F - 1) {
      B.box(-0.08, y1 - 0.2, zf - 0.02, W + 0.08, y1 + 0.02, zf + 0.15, trim, K.TRIM);
    }
    // боковые стены и задняя: те же строки, что у фасада
    for (let r = 0; r + 1 < rows.length; r++) {
      const ya = rows[r], yb = rows[r + 1];
      B.panel([0, ya, -D], Z, Y, D + zf, yb - ya, shadeOf(wall, 0.93), K.WALL, 2.0, 0.3);
      B.panel([W, ya, zf], NZ, Y, D + zf, yb - ya, shadeOf(wall, 0.93), K.WALL, 2.0, 0.6);
      B.panel([W, ya, -D], NX, Y, W, yb - ya, shadeOf(wall, 0.85), K.WALL, 2.0, 0.8);
    }
  }
  // главный карниз под крышей (две полки)
  const zt = zOf(F - 1);
  B.box(-0.14, H - 0.4, zt - 0.02, W + 0.14, H - 0.18, zt + 0.24, trim, K.TRIM);
  B.box(-0.2, H - 0.18, zt - 0.02, W + 0.2, H + 0.02, zt + 0.36, shadeOf(trim, 1.02), K.TRIM);

  // цоколь до склона улицы
  B.box(-0.02, -1.8, -0.4, W + 0.02, 0.42, 0.06, o.stone, K.TRIM);

  // ── мансарда-«колокол» ──
  const roofY = H + 0.02, zFront = zt + 0.34, rise = 2.3 + rnd() * 0.5, pitch = 0.55 + rnd() * 0.3;
  const zMid = (zFront - D) / 2, low = 1.0 + rnd() * 0.25;
  const prof = [];
  for (let k = 0; k <= 6; k++) { const s = k / 6; prof.push([zFront - low * s * s, roofY + rise * s]); }
  const top = prof[prof.length - 1];
  for (let k = 1; k <= 3; k++) { const s = k / 3; prof.push([top[0] + (zMid - top[0]) * s, top[1] + pitch * Math.sin(s * Math.PI / 2)]); }
  for (let k = prof.length - 2; k >= 0; k--) prof.push([2 * zMid - prof[k][0], prof[k][1]]);
  let acc = 0;
  for (let k = 0; k + 1 < prof.length; k++) {
    const [za, ya] = prof[k], [zb, yb] = prof[k + 1], l = Math.hypot(zb - za, yb - ya);
    const nx = Math.max(1, Math.ceil((W + 0.3) / 1.4));
    for (let i = 0; i < nx; i++) {
      const xa = -0.15 + (W + 0.3) * i / nx, xb = -0.15 + (W + 0.3) * (i + 1) / nx;
      B.quad([xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb], o.roof, K.ROOF, [xa, acc, xb, acc + l]);
    }
    acc += l;
  }
  for (const x of [-0.15, W + 0.15]) {                                                                         // торцы мансарды
    const cen = [x, roofY + rise * 0.5, zMid];
    for (let k = 0; k + 1 < prof.length; k++) B.tri(cen, [x, prof[k][1], prof[k][0]], [x, prof[k + 1][1], prof[k + 1][0]], shadeOf(wall, 0.8), K.WALL);
    B.tri(cen, [x, prof[prof.length - 1][1], prof[prof.length - 1][0]], [x, prof[0][1], prof[0][0]], shadeOf(wall, 0.8), K.WALL);
  }
  B.box(-0.18, top[1] + pitch - 0.04, zMid - 0.12, W + 0.18, top[1] + pitch + 0.1, zMid + 0.12, [0.62, 0.66, 0.78], K.TRIM);  // цинковый конёк

  // слуховые окна с арочным верхом
  const slopeZ = (y) => { for (let k = 0; k < 6; k++) if (prof[k + 1][1] >= y) { const t = (y - prof[k][1]) / (prof[k + 1][1] - prof[k][1]); return prof[k][0] + (prof[k + 1][0] - prof[k][0]) * t; } return top[0]; };
  centers.forEach((c, i) => {
    if (o.dormerSkip === i) return;
    const dw = 1.2, half = dw / 2, yb = roofY + 0.25, yt = roofY + 1.5, zd = slopeZ(yb) + 0.06, back = top[0] - 0.4;
    const gw = 0.72, g0 = c - gw / 2, g1 = c + gw / 2, gb = yb + 0.25, gt = yt - 0.02, dp = 0.14;
    B.panel([c - half, yb, zd], X, Y, g0 - (c - half), yt - yb, trim, K.TRIM, 2);
    B.panel([g1, yb, zd], X, Y, c + half - g1, yt - yb, trim, K.TRIM, 2);
    B.panel([g0, yb, zd], X, Y, gw, gb - yb, trim, K.TRIM, 2);
    B.quad([g0, gb, zd - dp], [g1, gb, zd - dp], [g1, gt, zd - dp], [g0, gt, zd - dp], [0.93, 0.9, 0.84], K.GLASS, [0, 0, 1, 1], rnd());
    B.quad([g0, gb, zd], [g0, gb, zd - dp], [g0, gt, zd - dp], [g0, gt, zd], shadeOf(trim, 0.85), K.TRIM);
    B.quad([g1, gb, zd - dp], [g1, gb, zd], [g1, gt, zd], [g1, gt, zd - dp], shadeOf(trim, 0.85), K.TRIM);
    B.quad([g0, gb, zd], [g1, gb, zd], [g1, gb, zd - dp], [g0, gb, zd - dp], shadeOf(trim, 0.85), K.TRIM);
    const arch = (r, a) => [c + Math.cos(a) * r, yt + Math.sin(a) * r * 0.8];
    for (let s = 0; s < 8; s++) {                                                                              // арка фасадика
      const a0 = s / 8 * Math.PI, a1 = (s + 1) / 8 * Math.PI, [xa, ya] = arch(half, a0), [xb, yb2] = arch(half, a1);
      B.tri([c, yt, zd], [xa, ya, zd], [xb, yb2, zd], trim, K.TRIM);
      const [ra, rya] = arch(half + 0.08, a0), [rb, ryb] = arch(half + 0.08, a1);                              // крыша-полуцилиндр
      B.quad([ra, rya, zd + 0.1], [rb, ryb, zd + 0.1], [rb, ryb, back], [ra, rya, back], o.roof, K.ROOF, [0, s / 8, 1.5, (s + 1) / 8]);
    }
    B.quad([c - half, yb, back], [c - half, yb, zd], [c - half, yt, zd], [c - half, yt, back], shadeOf(trim, 0.8), K.TRIM);
    B.quad([c + half, yb, zd], [c + half, yb, back], [c + half, yt, back], [c + half, yt, zd], shadeOf(trim, 0.8), K.TRIM);
    B.box(c - half - 0.04, yb - 0.08, zd - 0.05, c + half + 0.04, yb + 0.04, zd + 0.12, trim, K.TRIM);
  });

  // трубы: чуть кривые, с керамическими горшками
  const ridge = top[1] + pitch;
  for (const cx of o.chimneys) {
    const C = new Builder(), hgt = 1.1 + rnd() * 0.7;
    C.box(-0.32, -1.0, -0.24, 0.32, hgt, 0.24, o.chimney, K.WALL);
    C.box(-0.38, hgt, -0.3, 0.38, hgt + 0.14, 0.3, shadeOf(o.chimney, 1.1), K.TRIM);
    for (const px of [-0.17, 0.0, 0.17]) C.lathe(px, hgt + 0.14, 0, [[0.07, 0], [0.065, 0.22], [0.05, 0.3], [0.06, 0.34]], 7, [0.78, 0.45, 0.32], K.PAINT);
    const lean = (rnd() - 0.5) * 0.12, lz = (rnd() - 0.5) * 0.08;
    B.append(C, ([x, y, z]) => [cx + x + y * lean, ridge - 0.2 + y, zMid + z + y * lz]);
  }

  // ── маркиза над витриной ──
  if (o.awning) {
    const x0 = 0.4, x1 = W - 0.4, seg = 6, ya = 3.02, out = 1.35, drop = 0.6;
    const at = (s) => [out * Math.sin(s * Math.PI / 2), ya - drop * (1 - Math.cos(s * Math.PI / 2))];
    for (let k = 0; k < seg; k++) {
      const [za, yA] = at(k / seg), [zb, yB] = at((k + 1) / seg);
      B.quad([x0, yA, za + 0.02], [x1, yA, za + 0.02], [x1, yB, zb + 0.02], [x0, yB, zb + 0.02], o.awning, K.AWNING, [x0, k / seg * 0.85, x1, (k + 1) / seg * 0.85]);
    }
    const [ze, ye] = at(1);
    B.quad([x0, ye - 0.24, ze + 0.02], [x1, ye - 0.24, ze + 0.02], [x1, ye, ze + 0.02], [x0, ye, ze + 0.02], o.awning, K.AWNING, [x0, 0.86, x1, 1.0]);
  }
  if (o.ivy) ivy.push(...o.ivy);

  // ── «оживляем» дом: наклон, выпуклость, волнистые этажи, просевший конёк ──
  const leanX = (rnd() - 0.5) * 0.022, leanZ = 0.004 + rnd() * 0.006, bulge = 0.05 + rnd() * 0.05;
  const sag = 0.1 + rnd() * 0.14, ph = rnd() * 10;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const deform = ([x, y, z]) => {
    const u = clamp01(x / W), h = clamp01(y / H), front = 0.3 + 0.7 * smooth(-2.5, 0, z);
    let nx = x + Math.max(y, 0) * leanX + Math.sin(y * 0.45 + ph) * 0.035;
    let nz = z + Math.max(y, 0) * leanZ + Math.sin(h * Math.PI) * Math.sin(u * Math.PI) * bulge * front;
    let ny = y + Math.sin(x * 0.5 + ph) * 0.035 * h;
    if (y > H) ny -= Math.sin(u * Math.PI) * sag * clamp01((y - H) / 3);
    return [nx, ny, nz];
  };
  B.transform(deform); rails.transform(deform); sign.transform(deform);
  return { B, rails, sign, planters: planters.map(([x, y, z, w]) => [...deform([x, y, z]), w]), ivy, height: H, deform };
}
