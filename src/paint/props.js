// props.js — то, что рисуется вокруг домов: листва «мазками», кованые перила, вывески и Сакре-Кёр.
import * as THREE from 'three';
import { Builder, K, mulberry } from './builder.js';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, repeat = false) => {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

// Листва: облако мазков-листьев с рваным краем; яркость мазков — светотень внутри кроны
export function leafTexture(seed = 3, flowers = false) {
  const [c, g] = canvas(256, 256), rnd = mulberry(seed);
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 104;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.9;
    const v = 150 + (1 - r / 110) * 70 + rnd() * 35 - (y - 128) * 0.35 | 0;
    g.fillStyle = flowers && rnd() < 0.35 ? `rgb(255,${200 + rnd() * 40 | 0},${210 + rnd() * 40 | 0})` : `rgb(${v},${v},${v})`;
    g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI);
    g.beginPath(); g.ellipse(0, 0, 7 + rnd() * 9, 3.5 + rnd() * 5, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  return tex(c);
}

// Кованые перила: завитки и стойки, нарисованные линией
export function railTexture() {
  const [c, g] = canvas(256, 256);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.lineWidth = 9; g.strokeRect(4, 8, 248, 240);
  g.lineWidth = 6;
  for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x, 246); g.stroke(); }
  g.lineWidth = 5;
  for (let x = 16; x < 256; x += 64) {
    for (const s of [-1, 1]) {
      g.beginPath();
      for (let t = 0; t < 1; t += 0.02) { const a = t * Math.PI * 3, r = 26 * (1 - t); g.lineTo(x + 16 + s * Math.cos(a) * r * 0.7, 128 + s * Math.sin(a) * r * 1.3); }
      g.stroke();
    }
  }
  g.lineWidth = 7; g.beginPath(); g.moveTo(0, 60); g.lineTo(256, 60); g.moveTo(0, 200); g.lineTo(256, 200); g.stroke();
  return tex(c, true);
}

// Вывеска лавки: золотые буквы на крашеном дереве, как нарисованные от руки
export function signTexture(text, bg) {
  const [c, g] = canvas(512, 96);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = 'rgba(255,230,170,0.6)'; g.lineWidth = 3; g.strokeRect(8, 8, 496, 80);
  g.font = 'italic 600 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(40,20,20,0.5)'; g.fillText(text, 259, 52);
  g.fillStyle = '#f6d48d'; g.fillText(text, 256, 49);
  return tex(c);
}

// Крона из перекрещённых «карточек»: нормали смотрят из центра кроны — свет ложится мягким шаром
export function foliage(clusters, color, seed = 1) {
  const rnd = mulberry(seed), pos = [], nor = [], uv = [], col = [], kind = [], rand = [], base = [];
  for (const [cx, cy, cz, r, flat] of clusters) {
    const n = Math.round(10 + r * 8);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, e = (rnd() - 0.4) * 1.6, d = rnd() * r * 0.6;
      const px = cx + Math.cos(a) * Math.cos(e) * d, py = cy + Math.sin(e) * d * 0.8, pz = cz + Math.sin(a) * Math.cos(e) * d * (flat ? 0.25 : 1);
      const s = r * (0.75 + rnd() * 0.5), ang = rnd() * Math.PI, tilt = (rnd() - 0.5) * 1.2;
      const ux = Math.cos(ang), uz = Math.sin(ang) * (flat ? 0.15 : 1), vx = -Math.sin(ang) * Math.sin(tilt), vy = Math.cos(tilt), vz = Math.cos(ang) * Math.sin(tilt);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      for (const [i2, j2] of corners) {
        const x = px + (ux * i2 + vx * j2) * s / 2, y = py + vy * j2 * s / 2, z = pz + (uz * i2 + vz * j2) * s / 2;
        pos.push(x, y, z);
        const nx = x - cx, ny = y - cy + r * 0.35, nz = (z - cz) + (flat ? r : 0), l = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / l, ny / l, nz / l);
        uv.push((i2 + 1) / 2, (j2 + 1) / 2);
        const v = 0.9 + rnd() * 0.2;
        col.push(color[0] * v, color[1] * v, color[2] * v); kind.push(K.LEAF); rand.push(rnd()); base.push(cy - r * 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(rand, 1));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
  return g;
}






// Сакре-Кёр в том же живописном стиле: белый камень, яйцевидные купола, кампанила.
// Фасад смотрит в −x (вниз по улице). Подсвечен ночью и меньше тонет в дымке.
export function basilicaMesh(material) {
  const B = new Builder(), W = [0.97, 0.94, 0.88], Wd = [0.9, 0.86, 0.8], dark = [0.3, 0.26, 0.42];
  const dome = (x, y, z, r, h, seg = 14) => {
    const prof = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; prof.push([r * Math.sin((1 - t) * Math.PI / 2) ** 0.8 * (1 + 0.08 * Math.sin(t * Math.PI)), h * (1 - Math.cos(t * Math.PI / 2)) ** 0.9]); }
    prof[prof.length - 1][0] = 0;
    B.lathe(x, y, z, prof, seg, W, 16);
    B.lathe(x, y + h, z, [[r * 0.16, 0], [r * 0.16, r * 0.45], [r * 0.24, r * 0.5], [r * 0.12, r * 0.75], [0.02, r * 0.95]], 8, W, 16);
  };
  const drum = (x, y, z, r, h, seg = 14) => {
    B.lathe(x, y, z, [[r, 0], [r, h], [r * 1.08, h + 0.3], [r * 0.98, h + 0.5]], seg, W, 16);
    for (let s = 0; s < seg; s += 1) {                                     // окна барабана
      const a = (s + 0.5) / seg * Math.PI * 2, wx = x + Math.cos(a) * (r + 0.02), wz = z + Math.sin(a) * (r + 0.02), tx = -Math.sin(a) * 0.45, tz = Math.cos(a) * 0.45;
      B.quad([wx - tx, y + h * 0.25, wz - tz], [wx + tx, y + h * 0.25, wz + tz], [wx + tx, y + h * 0.8, wz + tz], [wx - tx, y + h * 0.8, wz - tz], [0.93, 0.9, 0.84], 3, [0, 0, 1, 1], s % 3 ? 0.2 : 0.9);
    }
  };
  B.box(-16, -12, -14, 16, 15, 14, W, 16);                                     // тело (уходит в склон — не висит над землёй)
  for (const sz of [-1, 1]) {                                                   // боковые стены: пилястры, арочные окна, карнизы
    const z = sz * 14.02;
    for (let x = -13; x <= 13; x += 4.3) {
      B.box(x - 2.15, -12, z - 0.01 * sz, x - 1.75, 15, z + 0.45 * sz, Wd, 16);
      B.quad([x - 0.7, 4, z + 0.01 * sz], [x + 0.7, 4, z + 0.01 * sz], [x + 0.7, 10, z + 0.01 * sz], [x - 0.7, 10, z + 0.01 * sz], [0.93, 0.9, 0.84], 3, [0, 0, 1, 1], 0.95);
      for (let s = 0; s < 6; s++) {
        const a0 = s / 6 * Math.PI, a1 = (s + 1) / 6 * Math.PI;
        B.tri([x, 10, z + 0.01 * sz], [x + Math.cos(a0) * 0.7, 10 + Math.sin(a0) * 0.7, z + 0.01 * sz], [x + Math.cos(a1) * 0.7, 10 + Math.sin(a1) * 0.7, z + 0.01 * sz], dark, 13);
      }
    }
    B.box(-16.3, 12.4, z - 0.3 * sz, 16.3, 13.1, z + 0.6 * sz, Wd, 16);
    B.box(-16.3, 2.6, z - 0.3 * sz, 16.3, 3.1, z + 0.5 * sz, Wd, 16);
  }
  B.box(-20.5, -12, -10, -16, 12, 10, Wd, 16);                                   // портик
  for (const z of [-6, 0, 6]) {                                                 // три арки портика
    B.quad([-20.52, 0.5, z - 2], [-20.52, 0.5, z + 2], [-20.52, 7, z + 2], [-20.52, 7, z - 2], dark, 13);
    for (let s = 0; s < 8; s++) {
      const a0 = s / 8 * Math.PI, a1 = (s + 1) / 8 * Math.PI;
      B.tri([-20.52, 7, z], [-20.52, 7 + Math.sin(a0) * 2, z + Math.cos(a0) * 2], [-20.52, 7 + Math.sin(a1) * 2, z + Math.cos(a1) * 2], dark, 13);
    }
  }
  B.box(-21, 12, -10.5, -15.5, 13, 10.5, W, 16);
  drum(0, 15, 0, 8, 7); dome(0, 22.5, 0, 8.4, 13);
  for (const [x, z] of [[-11, -9], [-11, 9], [10, -10], [10, 10]]) { drum(x, 15, z, 2.6, 3, 10); dome(x, 18.5, z, 2.8, 4.6, 10); }
  for (const z of [-11.5, 11.5]) { drum(-18, 12, z, 1.6, 2.5, 8); dome(-18, 14.8, z, 1.7, 3, 8); }
  B.box(16, -12, -4, 24, 30, 4, W, 16); drum(20, 30, 0, 3.4, 3, 10); dome(20, 33.5, 0, 3.6, 6, 10);   // кампанила
  const m = new THREE.Mesh(B.geometry(0, Math.PI / 5), material);
  return m;
}

