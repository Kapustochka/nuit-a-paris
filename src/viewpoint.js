// viewpoint.js — смотровая площадка перед Сакре-Кёр и ночной Париж внизу:
// каменная балюстрада с проходом к лестницам, две подзорные трубы,
// ковёр огней города у подножия холма и полосы тумана над ним.
import * as THREE from 'three';
import { nightStone } from './night-light.js';

// Балюстрада дугой вокруг (cx, z) с проходом посередине к лестницам вниз. Возвращает препятствия.
export function buildViewpoint(scene, cx, z, heightAt, night) {
  const HALF = 34, GAP = 5, BULGE = 5;                   // полудлина, полупроход, выгиб дуги к югу
  const at = (x) => z + BULGE * (1 - ((x - cx) / HALF) ** 2);
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xb8ad9d });
  if (night) nightStone(stoneMat, night, 'balustrade');
  const solids = [], balusters = [], blocks = [];

  for (const sign of [-1, 1]) {
    const xa = cx + sign * GAP, xb = cx + sign * HALF;
    const n = Math.round(Math.abs(xb - xa) / 3.2);
    for (let k = 0; k < n; k++) {                         // пролёт между двумя тумбами
      const x0 = xa + (xb - xa) * k / n, x1 = xa + (xb - xa) * (k + 1) / n;
      const z0 = at(x0), z1 = at(x1), y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, yaw = Math.atan2(-uz, ux);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = Math.min(y0, y1);
      blocks.push([mx, my, mz, len, 0.18, 0.42, yaw]);           // цоколь
      blocks.push([mx, my + 0.86, mz, len, 0.12, 0.46, yaw]);    // перило
      blocks.push([x0, Math.min(y0, my), z0, 0.42, 1.02, 0.5, yaw]);   // тумба
      if (k === n - 1) blocks.push([x1, Math.min(y1, my), z1, 0.42, 1.02, 0.5, yaw]);
      const nb = Math.floor(len / 0.3);
      for (let b = 1; b < nb; b++) { const t = b / nb; balusters.push([x0 + (x1 - x0) * t, my + 0.18, z0 + (z1 - z0) * t]); }
      solids.push({ x: mx, z: mz, cos: ux, sin: -uz, halfWidth: len / 2, halfDepth: 0.25 });
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const blockMesh = new THREE.InstancedMesh(box, stoneMat, blocks.length);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  blocks.forEach(([x, y, zz, w, h, d, yaw], i) => blockMesh.setMatrixAt(i, M.compose(P.set(x, y, zz), Q.setFromAxisAngle(UP, yaw), S.set(w, h, d))));
  const profile = [[0, 0], [0.09, 0], [0.09, 0.05], [0.06, 0.1], [0.11, 0.3], [0.1, 0.42], [0.05, 0.52], [0.06, 0.62], [0.08, 0.66], [0.08, 0.68], [0, 0.68]].map(([r, y]) => new THREE.Vector2(r, y));
  const balMesh = new THREE.InstancedMesh(new THREE.LatheGeometry(profile, 7), stoneMat, balusters.length);
  balusters.forEach(([x, y, zz], i) => balMesh.setMatrixAt(i, M.makeTranslation(x, y, zz)));
  for (const m of [blockMesh, balMesh]) { m.userData.noLift = true; m.userData.word = 'balustrade'; m.computeBoundingSphere(); scene.add(m); }

  // Подзорные трубы по обе стороны прохода — смотрят на юг, на Париж
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.45, metalness: 0.7 });
  for (const sign of [-1, 1]) {
    const x = cx + sign * (GAP + 2.2), zz = at(x) - 1.1, y = heightAt(x, zz);
    const scope = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.05, 10), metal); post.position.y = 0.52;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), metal); head.position.y = 1.18;
    const eye = new THREE.CylinderGeometry(0.06, 0.075, 0.42, 10).rotateX(Math.PI / 2);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(eye, metal); e.position.set(s * 0.09, 1.22, 0.16); scope.add(e); }
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.12), metal); hood.position.set(0, 1.33, -0.16);
    scope.add(post, head, hood);
    scope.position.set(x, y, zz); scope.rotation.y = sign * 0.25;
    scope.userData.noLift = true;
    scope.traverse((o) => { o.userData.word = 'telescope'; });
    scene.add(scope);
    solids.push({ x, z: zz, cos: 1, sin: 0, halfWidth: 0.2, halfDepth: 0.2 });
  }
  return solids;
}

// Париж внизу: улицы-ниточки огней, окна домов и туман у подножия холма
export function buildCityBelow(scene, drop, heightAt, pixelRatio = 1) {
  const rnd = mulberry(33);
  const street = [], streetCol = [], windows = [], windowCol = [];
  const ground = (x, z) => Math.max(drop, heightAt(x, z));
  const warm = [1, 0.72, 0.42], white = [0.95, 0.92, 0.85], cool = [0.75, 0.82, 1];
  const inRange = (x, z) => { const r = Math.hypot(x, z); return r > 270 && r < 2600; };
  for (let k = 0; k < 70; k++) {                                       // бульвары и улицы: прямые нитки огней
    const r = 300 + rnd() * 1900, a = rnd() * Math.PI * 2;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const dir = rnd() < 0.5 ? a + Math.PI / 2 : a + (rnd() - 0.5) * 0.4;  // по кругу или от холма
    const dx = Math.cos(dir), dz = Math.sin(dir), len = 300 + rnd() * 900, gap = 16 + rnd() * 10;
    const col = rnd() < 0.7 ? warm : white;
    for (let s = -len / 2; s < len / 2; s += gap) {
      const x = ox + dx * s, z = oz + dz * s;
      if (!inRange(x, z)) continue;
      for (const side of [-1, 1]) {
        const px = x - dz * side * 9 + (rnd() - 0.5) * 2, pz = z + dx * side * 9 + (rnd() - 0.5) * 2;
        street.push(px, ground(px, pz) + 5, pz); streetCol.push(...col);
      }
    }
  }
  for (let k = 0; k < 2600; k++) {                                     // окна: гуще к югу, где Париж
    const a = rnd() * Math.PI * 2, r = 280 + rnd() ** 0.7 * 2200;
    if (Math.sin(a) < -0.3 && rnd() < 0.5) continue;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    windows.push(x, ground(x, z) + 3 + rnd() * 22, z);
    const c = rnd() < 0.75 ? warm : rnd() < 0.6 ? white : cool, v = 0.55 + rnd() * 0.45;
    windowCol.push(c[0] * v, c[1] * v, c[2] * v);
  }
  const dot = glowDot();
  const points = (pos, col, size) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({
      map: dot, size: size * pixelRatio, sizeAttenuation: false, vertexColors: true,
      transparent: true, depthWrite: false, fog: false, opacity: 0.85, blending: THREE.AdditiveBlending,
    }));
    p.frustumCulled = false; p.userData.noLift = true; p.userData.word = 'city';
    scene.add(p);
  };
  points(street, streetCol, 3.2);
  points(windows, windowCol, 2.2);

  // Полосы тумана у подножия: огни просвечивают сквозь дымку
  const mist = new THREE.SpriteMaterial({ map: mistTexture(), color: 0x7d80aa, opacity: 0.2, transparent: true, depthWrite: false, fog: false });
  for (let k = 0; k < 30; k++) {
    const a = rnd() * Math.PI * 2, r = 260 + rnd() * 520, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = new THREE.Sprite(mist);
    s.position.set(x, ground(x, z) + 6 + rnd() * 10, z);
    s.scale.set(260 + rnd() * 220, 26 + rnd() * 22, 1);
    s.userData.noLift = true;
    scene.add(s);
  }
}
function glowDot() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
function mistTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 32, 0, 64, 32, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
