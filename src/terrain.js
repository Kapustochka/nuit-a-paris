// terrain.js — холм Монмартра по настоящему рельефу.
// assets/terrain.json: сетка высот с шагом 4 м (данные AWS Terrain Tiles / Mapzen, собраны scripts/build-terrain.py).
// Высота 0 — площадь Тертр (начало координат), вниз по склону — отрицательные значения.
import * as THREE from 'three';

const CITY_DROP = -48;     // уровень Парижа под холмом, далеко за краем карты

export async function loadTerrain() {
  try {
    const r = await fetch('assets/terrain.json');
    if (r.ok) return createTerrain(await r.json());
  } catch { /* нет файла — ровная земля */ }
  return createTerrain(null);
}

export function createTerrain(data) {
  if (!data) return { heightAt: () => 0, flat: true, texture: null, uniforms: null };
  const { minX, minZ, step, nx, nz } = data;
  const grid = Float32Array.from(data.h, (v) => v / 10);
  const raw = (x, z) => {
    const fx = THREE.MathUtils.clamp((x - minX) / step, 0, nx - 1.001), fz = THREE.MathUtils.clamp((z - minZ) / step, 0, nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
    return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + nx] * (1 - u) + grid[k + nx + 1] * u) * v;
  };
  const zero = raw(0, 0);
  const maxX = minX + (nx - 1) * step, maxZ = minZ + (nz - 1) * step;
  function heightAt(x, z) {
    const h = raw(x, z) - zero;
    const out = Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
    if (out <= 0) return h;
    return THREE.MathUtils.lerp(h, CITY_DROP, THREE.MathUtils.smoothstep(out, 0, 320));   // за картой город уходит вниз
  }

  // Та же сетка в текстуре — шейдеры фасадов считают высоту над землёй
  const half = new Uint16Array(nx * nz);
  for (let k = 0; k < half.length; k++) half[k] = THREE.DataUtils.toHalfFloat(grid[k] - zero);
  const texture = new THREE.DataTexture(half, nx, nz, THREE.RedFormat, THREE.HalfFloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const uniforms = {
    uHeightMap: { value: texture },
    uHeightBounds: { value: new THREE.Vector4(minX, minZ, 1 / ((nx - 1) * step), 1 / ((nz - 1) * step)) },
    uHeightTexel: { value: new THREE.Vector2(0.5 / nx, 0.5 / nz) },
  };
  return { heightAt, flat: false, texture, uniforms };
}

// Земля: плотная сетка над картой и редкая — до горизонта
export function groundGeometry(terrain, bounds, size = 1400) {
  const xs = axis(bounds.minX - 24, bounds.maxX + 24, size), zs = axis(bounds.minZ - 24, bounds.maxZ + 24, size);
  const pos = new Float32Array(xs.length * zs.length * 3), uv = new Float32Array(xs.length * zs.length * 2);
  let p = 0, q = 0;
  for (const z of zs) for (const x of xs) {
    pos[p++] = x; pos[p++] = terrain.heightAt(x, z); pos[p++] = z;
    uv[q++] = (x + size / 2) / size; uv[q++] = 1 - (z + size / 2) / size;   // как у PlaneGeometry, повернутой на -90°
  }
  const idx = [];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
function axis(a, b, size) {
  const out = [];
  for (let v = -size / 2; v < a; v += Math.max(8, (a - v) * 0.35)) out.push(v);
  for (let v = a; v < b; v += 4) out.push(v);
  for (let v = b; v < size / 2; v += Math.max(8, (v - b) * 0.35)) out.push(v);
  out.push(size / 2);
  return out;
}

// Поднимаем всё, что поставлено на «ровный пол» y = 0, на высоту земли в своей точке
export function liftToGround(object, heightAt) {
  if (object.userData.noLift) return;
  if (object.isInstancedMesh) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, m);
      m.elements[13] += heightAt(m.elements[12], m.elements[14]);
      object.setMatrixAt(i, m);
    }
    object.instanceMatrix.needsUpdate = true;
    object.boundingSphere = null; object.boundingBox = null;
  } else if (object.isPoints) {
    const a = object.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, a.getY(i) + heightAt(a.getX(i), a.getZ(i)));
    a.needsUpdate = true;
    object.geometry.boundingSphere = null;
  } else {
    object.position.y += heightAt(object.position.x, object.position.z);
  }
}
