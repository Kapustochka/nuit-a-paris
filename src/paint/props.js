// props.js — всё, что вокруг домов: мостовая на склоне, фонари, дерево и цветы «мазками»,
// кованые перила, вывески, нарисованное небо и силуэт Сакре-Кёр в дымке.
import * as THREE from 'three';
import { Builder, K, mulberry } from './builder.js';
import { NOISE } from './paint.js';

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

// Мостовая на склоне: проезжая часть, тротуары с бордюром
export function street(slope, x0, x1, half = 3.0, walk = 1.6) {
  const B = new Builder(), y = (x) => x * slope, cobble = [0.62, 0.6, 0.66], paving = [0.78, 0.74, 0.72], curb = [0.84, 0.8, 0.76];
  for (let x = x0; x < x1; x += 1.5) {
    const xa = x, xb = Math.min(x + 1.5, x1);
    for (let z = -half; z < half; z += 1.5) {
      const za = z, zb = Math.min(z + 1.5, half);
      B.quad([xa, y(xa), zb], [xb, y(xb), zb], [xb, y(xb), za], [xa, y(xa), za], cobble, K.COBBLE);
    }
    for (const s of [-1, 1]) {
      const zi = s * half, zo = s * (half + walk), hgt = 0.15;
      B.quad([xa, y(xa) + hgt, zo], [xb, y(xb) + hgt, zo], [xb, y(xb) + hgt, zi], [xa, y(xa) + hgt, zi], paving, K.PAVING);
      B.quad([xa, y(xa), zi], [xb, y(xb), zi], [xb, y(xb) + hgt, zi], [xa, y(xa) + hgt, zi], curb, K.TRIM);
      B.quad([xa, y(xa) + hgt, zo], [xb, y(xb) + hgt, zo], [xb, y(xb) - 2, zo], [xa, y(xa) - 2, zo], paving, K.TRIM);
    }
  }
  return B;
}

// Парижский фонарь: точёный столб и четырёхгранный фонарь
export function lamp(B, x, y, z) {
  const iron = [0.2, 0.19, 0.3];
  B.lathe(x, y, z, [[0.17, 0], [0.16, 0.25], [0.11, 0.35], [0.12, 0.55], [0.075, 0.7], [0.06, 2.6], [0.09, 2.75], [0.05, 2.95], [0.05, 3.25]], 10, iron, K.IRON);
  B.lathe(x, y + 3.25, z, [[0.12, 0], [0.24, 0.1], [0.3, 0.62], [0.36, 0.68]], 4, [1, 1, 1], K.LAMP, Math.PI / 4);
  B.lathe(x, y + 3.25, z, [[0.13, -0.03], [0.13, 0.02]], 8, iron, K.IRON);
  B.lathe(x, y + 3.92, z, [[0.42, 0], [0.34, 0.08], [0.1, 0.32], [0.04, 0.42], [0, 0.48]], 4, iron, K.IRON, Math.PI / 4);
  return [x, y + 3.6, z];
}

// Платан: изогнутый ствол с ветками и крона из мазков
export function tree(B, x, y, z, rnd) {
  const bark = [0.62, 0.56, 0.5], crowns = [];
  const branch = (p, dir, len, r0, depth) => {
    let [px, py, pz] = p, [dx, dy, dz] = dir;
    const seg = 5, ring = [];
    for (let k = 0; k <= seg; k++) {
      ring.push([px, py, pz, r0 * (1 - k / seg * 0.55)]);
      px += dx * len / seg; py += dy * len / seg; pz += dz * len / seg;
      dx += (rnd() - 0.5) * 0.25; dz += (rnd() - 0.5) * 0.25; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    }
    for (let k = 0; k < seg; k++) {
      const [ax, ay, az, ar] = ring[k], [bx, by, bz, br] = ring[k + 1];
      for (let s = 0; s < 8; s++) {
        const a0 = s / 8 * Math.PI * 2, a1 = (s + 1) / 8 * Math.PI * 2;
        B.quad([ax + Math.cos(a0) * ar, ay, az + Math.sin(a0) * ar], [ax + Math.cos(a1) * ar, ay, az + Math.sin(a1) * ar],
          [bx + Math.cos(a1) * br, by, bz + Math.sin(a1) * br], [bx + Math.cos(a0) * br, by, bz + Math.sin(a0) * br], bark, K.BARK);
      }
    }
    const end = [px, py, pz];
    if (depth > 0) for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      branch(end, [Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7], len * 0.6, r0 * 0.45, depth - 1);
    } else crowns.push([px, py + 0.4, pz, 1.25 + rnd() * 0.4]);
  };
  branch([x, y, z], [0.08, 1, 0.04], 3.2, 0.2, 2);
  crowns.push([x + 0.2, y + 5.6, z, 1.9]);
  return crowns;
}

// Нарисованное небо: градиент, мягкие облака-мазки, звёзды и луна с ореолом
export function sky(look) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0.35, 0.42, -0.84).normalize() },
      uStars: { value: 1 },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHorizon, uCloud, uCloudLit, uMoonDir; uniform float uStars;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.05, 0.25, h));
        col = mix(col, uTop, smoothstep(0.2, 0.8, h));
        vec2 p = d.xz / (h + 0.18);
        float c = fbm(p * vec2(0.9, 2.4) + vec2(3.0, 0.0)) + fbm(p * 2.6) * 0.25;
        float shape = smoothstep(0.62, 0.68, c) * smoothstep(-0.02, 0.15, h);
        float edge = smoothstep(0.68, 0.8, c);
        float toMoon = max(dot(d, uMoonDir), 0.0);
        vec3 cloud = mix(uCloudLit, uCloud, edge);
        cloud += uCloudLit * pow(toMoon, 6.0) * 0.4;
        col = mix(col, cloud, shape * 0.92);
        float st = step(0.996, hash(floor(d.xz / (h + 0.4) * 260.0))) * smoothstep(0.08, 0.4, h) * (1.0 - shape);
        col += st * uStars * vec3(1.0, 0.95, 0.85);
        float moon = smoothstep(0.9993, 0.9996, toMoon);
        col = mix(col, vec3(1.0, 0.97, 0.88), moon * uStars);
        col += vec3(0.75, 0.7, 0.9) * pow(toMoon, 60.0) * 0.35 * uStars;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  m.layers.set(1); m.renderOrder = -10; m.frustumCulled = false;
  void look;
  return m;
}

// Лестница как на рю Фуайатье: каменные ступени во всю ширину, два поручня посередине
export function stairs(S, R, x0, x1, y0, steep, half) {
  const rise = 0.16, tread = rise / steep, n = Math.round((x1 - x0) / tread);
  for (let k = 0; k < n; k++) {
    const xa = x0 + k * tread, top = y0 + (k + 1) * rise, v = 0.95 + (k % 3) * 0.03;
    S.box(xa, top - 0.7, -half, xa + tread + 0.01, top, half, [0.86 * v, 0.82 * v, 0.78 * v], K.TRIM);
    if (k % 8 === 0) S.box(xa, top - 0.7, -half - 0.6, xa + tread * 8, top + 0.55 + (Math.min(k + 8, n) - k) * rise * 0.5, -half, [0.8, 0.76, 0.72], K.TRIM);   // боковые стенки
    if (k % 8 === 0) S.box(xa, top - 0.7, half, xa + tread * 8, top + 0.55 + (Math.min(k + 8, n) - k) * rise * 0.5, half + 0.6, [0.8, 0.76, 0.72], K.TRIM);
  }
  const iron = [0.2, 0.19, 0.3];
  for (const z of [-0.45, 0.45]) {
    const yRail = (x) => y0 + (x - x0) * steep + 0.95;
    bar(R, [x0 + 0.3, yRail(x0 + 0.3), z], [x1 - 0.3, yRail(x1 - 0.3), z], 0.035, iron);
    for (let x = x0 + 0.3; x < x1; x += 1.8) { const t = Math.floor((x - x0) / tread) + 1; R.box(x - 0.025, y0 + t * rise, z - 0.025, x + 0.025, yRail(x), z + 0.025, iron, K.IRON); }
  }
}
// Площадь перед базиликой: плиты, низкая балюстрада по краю, газоны
export function parvis(S, x0, x1, y, halfZ) {
  for (let x = x0; x < x1; x += 2) for (let z = -halfZ; z < halfZ; z += 2) {
    S.quad([x, y, z + 2], [x + 2, y, z + 2], [x + 2, y, z], [x, y, z], [0.8, 0.77, 0.74], K.PAVING);
  }
  for (const sz of [-1, 1]) {
    S.box(x0, y - 4, sz * halfZ - 0.3, x1, y + 0.75, sz * halfZ + 0.3, [0.88, 0.84, 0.78], K.TRIM);
    S.box(x0 + 6, y, sz * 9 - 3, x0 + 26, y + 0.2, sz * 9 + 3, [0.42, 0.58, 0.4], K.PAINT);      // газоны
  }
  S.box(x0, y - 8, -halfZ, x0 + 0.5, y + 0.02, -4.6, [0.82, 0.78, 0.74], K.TRIM);                 // подпорная стена по бокам лестницы
  S.box(x0, y - 8, 4.6, x0 + 0.5, y + 0.02, halfZ, [0.82, 0.78, 0.74], K.TRIM);
}
function bar(B, a, b, r, col) {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, sx = -dz / l * r, sz = dx / l * r;
  const A = (u, v) => [a[0] + sx * u, a[1] + r * v, a[2] + sz * u], Bp = (u, v) => [b[0] + sx * u, b[1] + r * v, b[2] + sz * u];
  B.quad(A(-1, 1), A(1, 1), Bp(1, 1), Bp(-1, 1), col, K.IRON);
  B.quad(A(1, -1), A(-1, -1), Bp(-1, -1), Bp(1, -1), col, K.IRON);
  B.quad(A(1, 1), A(1, -1), Bp(1, -1), Bp(1, 1), col, K.IRON);
  B.quad(A(-1, -1), A(-1, 1), Bp(-1, 1), Bp(-1, -1), col, K.IRON);
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
  B.box(-16, 0, -14, 16, 15, 14, W, 16);                                       // тело
  B.box(-20.5, 0, -10, -16, 12, 10, Wd, 16);                                   // портик
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
  B.box(16, 0, -4, 24, 30, 4, W, 16); drum(20, 30, 0, 3.4, 3, 10); dome(20, 33.5, 0, 3.6, 6, 10);   // кампанила
  const m = new THREE.Mesh(B.geometry(0, Math.PI / 5), material);
  return m;
}

// Мягкий ореол вокруг фонарей и витрин
export function glow(color, size) {
  const [c, g] = canvas(64, 64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = tex(c); t.colorSpace = THREE.NoColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.set(size, size, 1); s.layers.set(1);
  return s;
}
