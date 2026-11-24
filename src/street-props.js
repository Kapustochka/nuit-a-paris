import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// size — реальный размер в метрах по оси axis; word — ключ карточки в french-words.js.
// Новые модели Meshy сжаты meshopt (EXT_meshopt_compression), старые — без сжатия геометрии.
const ASSETS = {
  'lamp-elegance': { axis: 'y', size: 3.85, glass: [0.69, 0.84], word: 'lamp' },
  'lamp-vintage': { axis: 'y', size: 3.65, glass: [0.59, 0.79], word: 'lamp' },
  'lamp-ornate': { axis: 'y', size: 3.9, glass: [0.70, 0.85], word: 'lamp' },
  'lamp-lantern': { axis: 'y', size: 3.6, glass: [0.80, 0.95], word: 'lamp' },
  'park-bench': { axis: 'x', size: 1.85, word: 'bench' },
  pigeon: { axis: 'x', size: 0.33, word: 'pigeon' },
  'pigeon-small': { axis: 'x', size: 0.28, word: 'pigeon' },
  'chair-rattan': { axis: 'y', size: 0.9, word: 'chair' },
  'bistro-table': { axis: 'y', size: 0.74, word: 'table' },
  croissant: { axis: 'x', size: 0.16, word: 'croissant' },
  kiosk: { axis: 'y', size: 2.7, word: 'kiosk' },
  newspaper: { axis: 'x', size: 0.55, word: 'newspaper' },
  'trash-bin': { axis: 'y', size: 0.95, word: 'bin' },
  'bicycle-red': { axis: 'x', size: 1.75, word: 'bicycle' },
  'bicycle-black': { axis: 'x', size: 1.75, word: 'bicycle' },
  'scooter-red': { axis: 'z', size: 1.8, word: 'scooter' },
  'scooter-lime': { axis: 'x', size: 1.8, word: 'scooter' },
  cat: { axis: 'x', size: 0.55, word: 'cat' },
  rat: { axis: 'z', size: 0.34, word: 'rat' },
  'flower-pot': { axis: 'y', size: 0.75, word: 'flowerpot' },
  'fruit-crate': { axis: 'x', size: 0.6, word: 'crate' },
};

export async function loadStreetProps() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const assets = await Promise.all(Object.entries(ASSETS).map(async ([name, spec]) => {
    try {
      const { scene } = await loader.loadAsync(`assets/street/${name}.glb`);
      scene.updateMatrixWorld(true);
      let mesh;
      scene.traverse((object) => { if (object.isMesh) mesh = object; });
      if (!mesh) throw new Error('в модели нет меша');

      const geometry = toFloat(mesh.geometry).applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = spec.size / bounds.getSize(new THREE.Vector3())[spec.axis];
      geometry.translate(-center.x, -bounds.min.y, -center.z);
      geometry.scale(scale, scale, scale);
      geometry.computeBoundingBox();

      const material = mesh.material;
      const glassHeight = spec.glass?.map((part) => part * spec.size);
      if (glassHeight) lightGlass(material, glassHeight);
      if (name === 'park-bench') {
        material.metalness = 0.25;
        material.roughness = 0.84;
        material.roughnessMap = null;
      }
      return [name, { name, geometry, material, glassHeight, glassCenter: glassHeight && glassCentre(geometry, glassHeight), word: spec.word, bounds: geometry.boundingBox }];
    } catch (error) {
      console.warn(`Реквизит ${name}: ${error.message}`);
      return [name, null];
    }
  }));
  return Object.fromEntries(assets);
}

// meshopt хранит координаты в целых числах; до масштабирования переводим их в float,
// иначе вершины за пределами [-1, 1] обрежутся.
function toFloat(geometry) {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (attribute.array instanceof Float32Array && !attribute.isInterleavedBufferAttribute) continue;
    const { count, itemSize } = attribute, array = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) for (let k = 0; k < itemSize; k++) array[i * itemSize + k] = attribute.getComponent(i, k);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  return geometry;
}

// Середина фонаря: среднее по вершинам в полосе стекла (у столба их мало, фонарь перевешивает)
function glassCentre(geometry, [bottom, top]) {
  const p = geometry.attributes.position; let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < bottom || y > top) continue;
    sx += p.getX(i); sz += p.getZ(i); n++;
  }
  return [n ? sx / n : 0, (bottom + top) / 2, n ? sz / n : 0];
}

function lightGlass(material, [bottom, top]) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lampGlass = { value: new THREE.Vector2(bottom, top) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float lampHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nlampHeight = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float lampHeight;\nuniform vec2 lampGlass;')
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float band = smoothstep(lampGlass.x, lampGlass.x + 0.09, lampHeight)
                   * (1.0 - smoothstep(lampGlass.y - 0.09, lampGlass.y, lampHeight));
        float glass = smoothstep(0.055, 0.33, dot(diffuseColor.rgb, vec3(0.21, 0.72, 0.07)));
        totalEmissiveRadiance += vec3(0.84, 0.48, 0.20) * band * glass;
      `);
  };
}

// С какого расстояния реквизит перестаёт рисоваться (world.js прячет дальние группы целиком).
// Модели Meshy тяжёлые — голубь 4 тыс. треугольников, скамейка 19 тыс., — а вдали они меньше мазка кисти.
const SMALL = new Set(['pigeon', 'pigeon-small', 'rat', 'cat', 'croissant', 'newspaper', 'fruit-crate', 'flower-pot']);
export const propRange = (name) => (name.startsWith('lamp') ? 240 : SMALL.has(name) ? 60 : 120);

export function addPropInstances(scene, asset, placements) {
  if (!asset || placements.length === 0) return;
  const cells = new Map();
  for (const prop of placements) {
    const key = Math.floor(prop.x / 48) + ':' + Math.floor(prop.z / 48);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(prop);
  }

  const pose = new THREE.Object3D();
  for (const cell of cells.values()) {
    const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, cell.length);
    mesh.name = asset.name;
    mesh.userData.word = asset.word;
    mesh.userData.range = propRange(asset.name);
    if (!asset.name.startsWith('lamp')) mesh.userData.inkRange = 40;
    cell.forEach(({ x, z, yaw, y = 0, scale = 1 }, i) => {
      pose.position.set(x, y, z);
      pose.rotation.y = yaw;
      pose.scale.setScalar(scale);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    });
    scene.add(mesh);
  }
}

export function placeBenches(asset, roads, lamps, trees, blocked, random) {
  if (!asset) return [];
  const candidates = [];
  const halfWidth = asset.bounds.max.x;
  const halfDepth = asset.bounds.max.z;
  const addCandidate = (x, z, yaw, rank) => {
    if (blocked(x, z)) return;
    candidates.push({ x, z, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), halfWidth, halfDepth, rank });
  };
  // Скамейку видно с площади Тертр, остальные стоят вдоль улиц.
  addCandidate(4.6, -6.6, -0.25, -1);
  for (const { p, k } of roads) {
    if (!['pedestrian', 'residential', 'living_street', 'footway', 'path', 'unclassified'].includes(k)) continue;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az;
      const length = Math.hypot(dx, dz);
      if (length < 6) continue;
      const side = random() < 0.5 ? -1 : 1;
      const nx = -dz / length * side, nz = dx / length * side;
      const t = 0.25 + random() * 0.5;
      const offset = k === 'footway' || k === 'path' ? 2.5 : 4;
      const x = ax + dx * t + nx * offset, z = az + dz * t + nz * offset;
      if (Math.hypot(x, z) < 12.5) continue;
      addCandidate(x, z, Math.atan2(-nx, -nz), random());
    }
  }

  candidates.sort((a, b) => a.rank - b.rank);
  const benches = [];
  for (const bench of candidates) {
    const { x, z, cos, sin } = bench;
    if (benches.some((other) => Math.hypot(other.x - x, other.z - z) < 17)) continue;
    if (lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 2)) continue;
    let clear = true;
    for (let i = 0; i < trees.length; i += 2) {
      if (Math.hypot(trees[i] - x, trees[i + 1] - z) < 1.5) { clear = false; break; }
    }
    for (const u of [-halfWidth, halfWidth]) {
      for (const v of [-halfDepth, halfDepth]) {
        if (blocked(x + u * cos + v * sin, z - u * sin + v * cos)) clear = false;
      }
    }
    if (clear) benches.push(bench);
    if (benches.length === 16) break;
  }
  return benches;
}

export function placePigeons(scene, props, benches, blocked, random) {
  const flocks = [[-2.5, 0], [3.8, -4], ...benches.filter((_, i) => i % 2 === 0)
    .map(({ x, z, sin, cos }) => [x + sin * 1.6, z + cos * 1.6])];
  const assets = [props.pigeon, props['pigeon-small']].filter(Boolean);
  const birds = assets.map(() => []);
  if (!assets.length) return 0;

  flocks.forEach(([x, z], group) => {
    const count = 2 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      const a = (i + random() * 0.45) / count * Math.PI * 2;
      const px = x + Math.cos(a) * 0.65, pz = z + Math.sin(a) * 0.65;
      if (!blocked(px, pz)) birds[(group + i) % assets.length].push({ x: px, z: pz, yaw: random() * Math.PI * 2 });
    }
  });
  assets.forEach((asset, i) => addPropInstances(scene, asset, birds[i]));
  return birds.reduce((sum, list) => sum + list.length, 0);
}
