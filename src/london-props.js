// london-props.js — London street furniture for Night in London: red K6 phone boxes and pillar
// postboxes against the walls, and red double-decker buses parked at the left kerb of the big roads.
// Built with the painted Builder (no model files), one merged mesh per kind so they cost a few draw calls.
import * as THREE from 'three';
import { Builder, K } from './paint/builder.js';
import { paintMaterial } from './paint/paint.js';

const RED = [0.78, 0.12, 0.1], RED_D = [0.58, 0.08, 0.08], BLACK = [0.1, 0.1, 0.12], GOLD = [0.93, 0.76, 0.4];
const WARM = [1, 0.86, 0.6], CREAM = [0.95, 0.92, 0.82];

// K6 kiosk: 0.92 m square, 2.5 m tall, glazed on three sides, domed crown, lit "TELEPHONE" panels. Front = +z.
function phoneBox() {
  const B = new Builder(), w = 0.46, h = 2.32;
  B.box(-w - 0.04, 0, -w - 0.04, w + 0.04, 0.12, w + 0.04, RED_D, K.TRIM);
  B.box(-w, 0.12, -w, w, h, w, RED, K.WALL);
  for (const [x, z] of [[-w, -w], [w, -w], [w, w], [-w, w]]) B.box(x - 0.06, 0.12, z - 0.06, x + 0.06, h + 0.05, z + 0.06, RED_D, K.TRIM);
  for (let s = 0; s < 4; s++) {
    const a = s * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const C = new Builder(), f = w + 0.012;
    if (s !== 2) for (let r = 0; r < 8; r++) for (let c = 0; c < 3; c++) {   // 8 x 3 small panes, the back is solid
      const x0 = -0.33 + c * 0.22, y0 = 0.5 + r * 0.19;
      C.quad([x0 + 0.02, y0, f], [x0 + 0.2, y0, f], [x0 + 0.2, y0 + 0.16, f], [x0 + 0.02, y0 + 0.16, f], WARM, K.GLASS, [0, 0, 1, 1], 0.55);
    }
    C.quad([-0.34, 2.06, f], [0.34, 2.06, f], [0.34, 2.22, f], [-0.34, 2.22, f], CREAM, K.GLASS, [0, 0, 1, 1], 0.9);   // TELEPHONE
    C.tri([-0.4, h, f], [0.4, h, f], [0, h + 0.16, f], RED, K.TRIM);       // pediment of the crown
    C.box(-0.06, h + 0.02, f - 0.01, 0.06, h + 0.12, f + 0.02, GOLD, K.TRIM);  // the crown badge
    B.append(C, ([x, y, z]) => [x * ca + z * sa, y, -x * sa + z * ca]);
  }
  B.lathe(0, h, 0, [[0.5, 0], [0.42, 0.12], [0.24, 0.2], [0, 0.23]], 8, RED, K.TRIM, Math.PI / 8);
  return B;
}

// Pillar postbox: 1.5 m red cylinder with a black foot, a domed cap and a slot. Front = +z.
function postbox() {
  const B = new Builder();
  B.lathe(0, 0, 0, [[0.29, 0], [0.29, 0.14]], 10, BLACK, K.TRIM);
  B.lathe(0, 0.14, 0, [[0.27, 0], [0.27, 1.18], [0.31, 1.22], [0.31, 1.27]], 10, RED, K.WALL);
  B.lathe(0, 1.27, 0, [[0.29, 0], [0.24, 0.12], [0.12, 0.2], [0, 0.22]], 10, RED, K.TRIM);
  B.quad([-0.13, 1.0, 0.272], [0.13, 1.0, 0.272], [0.13, 1.04, 0.272], [-0.13, 1.04, 0.272], BLACK, K.TRIM);
  B.quad([-0.08, 0.72, 0.272], [0.08, 0.72, 0.272], [0.08, 0.84, 0.272], [-0.08, 0.84, 0.272], CREAM, K.TRIM);   // collection plate
  return B;
}

// Double-decker bus: 11 m along local x, 2.5 m wide, 4.3 m tall, two decks of warm lit windows.
function bus() {
  const B = new Builder(), L = 5.5, W = 1.25;
  B.box(-L, 0.35, -W, L, 4.2, W, RED, K.WALL);
  B.box(-L + 0.1, 4.2, -W + 0.1, L - 0.1, 4.32, W - 0.1, RED_D, K.TRIM);
  B.box(-L - 0.02, 0.35, -W - 0.02, L + 0.02, 0.6, W + 0.02, BLACK, K.TRIM);                  // skirt
  B.box(-L - 0.02, 2.2, -W - 0.02, L + 0.02, 2.36, W + 0.02, CREAM, K.TRIM);                  // waist band
  for (const side of [-1, 1]) {
    const z = side * (W + 0.015);
    for (const [y0, y1] of [[1.25, 2.1], [2.6, 3.65]]) for (let x = -L + 0.5; x < L - 0.9; x += 1.45) {
      const a = [x, y0, z], b = [x + 1.25, y0, z], c = [x + 1.25, y1, z], d = [x, y1, z];
      if (side > 0) B.quad(a, b, c, d, WARM, K.GLASS, [0, 0, 1, 1], 0.8); else B.quad(b, a, d, c, WARM, K.GLASS, [0, 0, 1, 1], 0.8);
    }
    for (const x of [-3.6, 3.4]) B.box(x - 0.5, 0, side * W - 0.18, x + 0.5, 0.95, side * W + 0.06 * side, BLACK, K.TRIM);   // wheels
  }
  const f = L + 0.015;   // front: windscreens and the route board
  B.quad([f, 1.3, W - 0.15], [f, 1.3, -W + 0.15], [f, 2.1, -W + 0.15], [f, 2.1, W - 0.15], WARM, K.GLASS, [0, 0, 1, 1], 0.6);
  B.quad([f, 2.6, W - 0.15], [f, 2.6, -W + 0.15], [f, 3.6, -W + 0.15], [f, 3.6, W - 0.15], WARM, K.GLASS, [0, 0, 1, 1], 0.8);
  B.quad([f, 3.7, 0.8], [f, 3.7, -0.8], [f, 4.05, -0.8], [f, 4.05, 0.8], [1, 0.9, 0.45], K.GLASS, [0, 0, 1, 1], 1);
  for (const z of [0.85, -0.85]) B.quad([f, 0.7, z + 0.15], [f, 0.7, z - 0.15], [f, 0.9, z - 0.15], [f, 0.9, z + 0.15], [1, 0.95, 0.8], K.GLASS, [0, 0, 1, 1], 1);
  const r = -L - 0.015;
  B.quad([r, 2.6, -W + 0.2], [r, 2.6, W - 0.2], [r, 3.5, W - 0.2], [r, 3.5, -W + 0.2], WARM, K.GLASS, [0, 0, 1, 1], 0.6);
  return B;
}

const KINDS = {
  phoneBox: { make: phoneBox, half: [0.52, 0.52], word: 'phoneBox' },
  postbox: { make: postbox, half: [0.32, 0.32], word: 'postbox' },
  bus: { make: bus, half: [5.55, 1.3], word: 'bus' },
};

export function placeLondonProps(scene, look, { roads, wallSpots, shopFronts, blocked, addSolid, random }) {
  const spots = { phoneBox: [], postbox: [], bus: [] };
  const taken = [];
  const fp = (kind, x, z, yaw) => {
    const [hw, hd] = KINDS[kind].half;
    return { x, z, yaw, scale: 1, cos: Math.cos(yaw), sin: Math.sin(yaw), halfWidth: hw, halfDepth: hd };
  };
  const free = (f, gap) => {
    for (const u of [-f.halfWidth, 0, f.halfWidth]) for (const v of [-f.halfDepth, f.halfDepth]) {
      if (blocked(f.x + u * f.cos + v * f.sin, f.z - u * f.sin + v * f.cos)) return false;
    }
    if (shopFronts.some(({ x, z, w }) => Math.hypot(x - f.x, z - f.z) < w / 2 + 1)) return false;
    return !taken.some(([x, z, r]) => Math.hypot(x - f.x, z - f.z) < r + gap);
  };
  const put = (kind, x, z, yaw, gap) => {
    const f = fp(kind, x, z, yaw);
    if (!free(f, gap)) return false;
    spots[kind].push(f); taken.push([x, z, Math.max(f.halfWidth, f.halfDepth)]); addSolid(f);
    return true;
  };

  // Phone boxes and postboxes stand with their backs to a wall, spread out over the map.
  const walls = wallSpots.slice().sort(() => random() - 0.5);
  for (const [kind, count, gap] of [['phoneBox', 7, 22], ['postbox', 7, 16]]) {
    let n = 0;
    for (const [mx, mz, nx, nz] of walls) {
      if (n >= count) break;
      const out = KINDS[kind].half[1] + 0.5;
      if (put(kind, mx + nx * out, mz + nz * out, Math.atan2(nx, nz), gap)) n++;
    }
  }

  // Buses wait at the left kerb (traffic keeps left) of wide roads, away from bridges.
  const big = roads.filter((r) => !r.bridge && /primary|secondary|trunk|tertiary/.test(r.k || '')).sort(() => random() - 0.5);
  let buses = 0;
  for (const r of big) {
    if (buses >= 3) break;
    const p = r.p, half = (r.w || 9) / 2;
    for (let i = 0; i + 3 < p.length && buses < 3; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], len = Math.hypot(bx - ax, bz - az);
      if (len < 16) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len, off = Math.max(1.4, half - 1.5);
      const x = (ax + bx) / 2 + dz * off, z = (az + bz) / 2 - dx * off;     // left of the travel direction
      if (put('bus', x, z, Math.atan2(-dz, dx), 30)) buses++;
    }
  }

  const material = paintMaterial(look);
  for (const [kind, list] of Object.entries(spots)) {
    if (!list.length) continue;
    const proto = KINDS[kind].make(), B = new Builder();
    for (const { x, z, cos, sin } of list) B.append(proto, ([px, py, pz]) => [x + px * cos + pz * sin, py, z - px * sin + pz * cos]);
    const mesh = new THREE.Mesh(B.geometry(0, Math.PI / 4), material);
    mesh.userData.word = KINDS[kind].word;
    scene.add(mesh);
  }
  return { phoneBoxes: spots.phoneBox.length, postboxes: spots.postbox.length, buses: spots.bus.length };
}
