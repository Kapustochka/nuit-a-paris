// builder.js — сборщик геометрии для рисованного стиля: четырёхугольники, панели, коробки, тела вращения.
// Каждая вершина несёт цвет (как на картинке, sRGB), «вид» поверхности (aKind), случайное число (aRand)
// и высоту земли под ней (aBase) — по ним живописный шейдер решает, как её раскрасить.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const K = { WALL: 0, ROOF: 1, TRIM: 2, GLASS: 3, SHUTTER: 4, COBBLE: 5, LEAF: 6, IRON: 7, SHOP: 8, AWNING: 9, LAMP: 10, BARK: 11, PAINT: 13, PAVING: 14, DOOR: 15, LANDMARK: 16 };

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
export const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
export const IRON_COL = [0.17, 0.15, 0.27];
export const shadeOf = (c, k) => c.map((v) => v * k);
