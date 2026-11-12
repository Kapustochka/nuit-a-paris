// street-life.js — мелкие модели Meshy на улицах: киоск, урны, велосипеды, скутеры,
// цветы у стен, кот, крысы и газеты. Всё ставится детерминированно (propRandom),
// поэтому улица выглядит одинаково при каждом запуске.
import { addPropInstances } from './street-props.js';

// Модели, у которых длинная сторона лежит вдоль оси z, а не x.
const ALONG_Z = new Set(['scooter-red', 'rat']);
const along = (name, tx, tz) => (ALONG_Z.has(name) ? Math.atan2(tx, tz) : Math.atan2(-tz, tx));

export function placeStreetLife(scene, props, { benches, lamps, wallSpots, shopFronts = [], blocked, solids, random }) {
  const placed = {};
  const put = (asset, item) => { if (asset) (placed[asset.name] ||= []).push(item); };

  // Прямоугольник модели в плане; повторяет формат скамеек, чтобы blocked() его понимал.
  function footprint(asset, x, z, yaw, scale = 1, pad = 0) {
    return {
      x, z, yaw, scale, cos: Math.cos(yaw), sin: Math.sin(yaw),
      halfWidth: asset.bounds.max.x * scale + pad, halfDepth: asset.bounds.max.z * scale + pad,
    };
  }
  function free(fp, shopGap = 1.2) {
    if (blocked(fp.x, fp.z)) return false;
    for (const u of [-fp.halfWidth, fp.halfWidth]) for (const v of [-fp.halfDepth, fp.halfDepth]) {
      if (blocked(fp.x + u * fp.cos + v * fp.sin, fp.z - u * fp.sin + v * fp.cos)) return false;
    }
    if (shopFronts.some(({ x, z, w }) => Math.hypot(x - fp.x, z - fp.z) < w / 2 + shopGap)) return false;   // не загораживаем витрины
    return !lamps.some(([lx, lz]) => Math.hypot(lx - fp.x, lz - fp.z) < 0.9);
  }
  // Твёрдые модели героиня обходит; мелочь (газеты, кот, крысы) — нет.
  function tryPut(asset, x, z, yaw, { scale = 1, solid = true, y = 0, shopGap } = {}) {
    if (!asset) return null;
    const fp = footprint(asset, x, z, yaw, scale);
    if (!free(fp, shopGap)) return null;
    put(asset, { x, z, yaw, scale, y });
    if (solid) solids.push(fp);
    return fp;
  }

  // ── Киоск спиной к дому у площади Тертр, лицом на улицу ─────
  const kiosk = props.kiosk;
  let kioskSpot = null;
  if (kiosk) {
    const walls = wallSpots.filter(([x, z]) => Math.hypot(x, z) > 12)
      .sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    for (const [mx, mz, nx, nz] of walls) {
      const out = kiosk.bounds.max.z + 0.45;
      const x = mx + nx * out, z = mz + nz * out, yaw = Math.atan2(nx, nz);
      if (tryPut(kiosk, x, z, yaw, { shopGap: 4 })) { kioskSpot = { x, z, yaw }; break; }
    }
  }

  // ── Газеты: у киоска и у части скамеек ─────────────────────
  const paper = props.newspaper;
  if (paper && kioskSpot) {
    const { x, z, yaw } = kioskSpot, fx = Math.sin(yaw), fz = Math.cos(yaw);
    tryPut(paper, x + fx * 1.5 + fz * 0.6, z + fz * 1.5 - fx * 0.6, random() * 6.28, { solid: false });
  }

  // ── Урны: рядом со скамейками и у фонарей ближе к центру ───
  const bin = props['trash-bin'];
  const bins = [];
  if (bin) {
    for (const bench of benches) {
      for (const side of [1, -1]) {
        const d = bench.halfWidth + 0.8;
        const fp = tryPut(bin, bench.x + bench.cos * d * side, bench.z - bench.sin * d * side, random() * 6.28);
        if (fp) { bins.push(fp); break; }
      }
    }
    lamps.forEach(([x, z, tx, tz], i) => {
      if (i % 3 || Math.hypot(x, z) > 160 || bins.length >= 32) return;
      const fp = tryPut(bin, x + tx * 1.3, z + tz * 1.3, random() * 6.28);
      if (fp) bins.push(fp);
    });
  }
  benches.forEach((bench, i) => {
    if (paper && i % 3 === 1) tryPut(paper, bench.x + bench.sin * 1.3, bench.z + bench.cos * 1.3, random() * 6.28, { solid: false });
  });

  // ── Крысы — у урн, ночью им там самое место ─────────────────
  const rat = props.rat;
  bins.forEach((b, i) => {
    if (!rat || i % 3) return;
    const a = random() * 6.28;
    tryPut(rat, b.x + Math.cos(a) * 1.0, b.z + Math.sin(a) * 1.0, random() * 6.28, { solid: false });
  });

  // ── Вдоль стен: велосипеды, скутеры, цветы, кот ────────────
  const near = wallSpots
    .map((spot) => ({ spot, d: Math.hypot(spot[0], spot[1]) }))
    .filter(({ d }) => d < 170)
    .sort((a, b) => a.d - b.d);
  const bikes = [props['bicycle-red'], props['bicycle-black']].filter(Boolean);
  const scooters = [props['scooter-red'], props['scooter-lime']].filter(Boolean);
  const pot = props['flower-pot'], cat = props.cat;
  let bikeCount = 0, scooterCount = 0, catCount = 0, potCount = 0;
  near.forEach(({ spot: [mx, mz, nx, nz, L] }, i) => {
    const tx = nz, tz = -nx;                                   // вдоль стены
    const at = (offset, out) => [mx + tx * offset + nx * out, mz + tz * offset + nz * out];
    const roll = random();
    if (pot && L > 6 && i % 4 === 0 && potCount < 28) {          // горшки у каждой четвёртой стены
      for (const s of [-0.32, 0.32]) {
        if (random() < 0.45) continue;
        const [x, z] = at(L * s, 0.8);
        if (tryPut(pot, x, z, random() * 6.28, { scale: 0.85 + random() * 0.3 })) potCount++;
      }
    }
    if (roll < 0.22 && bikes.length && bikeCount < 12) {
      const asset = bikes[bikeCount % bikes.length];
      const [x, z] = at((random() - 0.5) * L * 0.3, 0.85);
      if (tryPut(asset, x, z, along(asset.name, tx, tz) + (random() < 0.5 ? 0 : Math.PI))) bikeCount++;
    } else if (roll < 0.4 && scooters.length && scooterCount < 10) {
      const asset = scooters[scooterCount % scooters.length];
      const [x, z] = at((random() - 0.5) * L * 0.3, 1.1);
      if (tryPut(asset, x, z, along(asset.name, tx, tz) + (random() < 0.5 ? 0 : Math.PI))) scooterCount++;
    } else if (cat && catCount < 4 && i % 5 === 2) {
      const [x, z] = at((random() - 0.5) * L * 0.4, 0.75);
      if (tryPut(cat, x, z, along('cat', tx, tz) + random() * 0.6 - 0.3, { solid: false })) catCount++;
    }
  });

  for (const [name, list] of Object.entries(placed)) addPropInstances(scene, props[name], list);
  return Object.fromEntries(Object.entries(placed).map(([name, list]) => [name, list.length]));
}

// Терраса кафе: мраморный столик и два плетёных стула, повёрнутых к нему.
export function terraceSet(props, x, z, tx, tz, random, out) {
  const table = props['bistro-table'], chair = props['chair-rattan'];
  if (table) out.tables.push({ x, z, yaw: random() * 6.28 });
  if (!chair) return;
  for (const side of [-1, 1]) {
    const cx = x + tx * side * 0.58, cz = z + tz * side * 0.58;
    out.chairs.push({ x: cx, z: cz, yaw: Math.atan2(x - cx, z - cz) + (random() - 0.5) * 0.4 });
  }
}
