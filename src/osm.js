// osm.js — настоящая карта Монмартра из OpenStreetMap (© участники OpenStreetMap, лицензия ODbL)
// Порядок: 1) assets/montmartre.json, 2) сохранённая копия в браузере, 3) загрузка из интернета.

export const CENTER = { lat: 48.88655, lon: 2.34065 };           // площадь Тертр
const BBOX = [48.8848, 2.3368, 48.8884, 2.3442];                  // юг, запад, север, восток
const KEY = 'nuit-a-paris:montmartre:v2';
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const MX = Math.cos(CENTER.lat * Math.PI / 180) * 111320, MZ = 110574;
export const toXZ = (lat, lon) => [(lon - CENTER.lon) * MX, -(lat - CENTER.lat) * MZ]; // север = -z

export async function loadMapData(status = () => {}) {
  try {
    const r = await fetch('assets/montmartre.json');
    if (r.ok) return await r.json();
  } catch { /* файла нет — идём дальше */ }
  try {
    const c = localStorage.getItem(KEY);
    if (c) return JSON.parse(c);
  } catch { /* хранилище недоступно */ }

  status('Chargement de la carte de Montmartre…');
  const b = BBOX.join(',');
  const q = `[out:json][timeout:60];(
    way["building"](${b}); relation["building"](${b}); way["highway"](${b});
    node["natural"="tree"](${b});
    node["amenity"~"^(cafe|restaurant|bar|pub)$"](${b});
    node["shop"~"^(bakery|pastry)$"](${b});
  );out body;>;out skel qt;`;
  let raw = null, lastErr;
  for (const url of MIRRORS) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      raw = await r.json();
      break;
    } catch (e) { lastErr = e; }
  }
  if (!raw) throw new Error('Не удалось загрузить карту: ' + (lastErr?.message || 'нет сети'));
  const data = convert(raw);
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* не страшно */ }
  return data;
}

const r1 = (v) => Math.round(v * 10) / 10;

export function convert(raw) {
  const nodes = new Map(), ways = new Map();
  for (const e of raw.elements) {
    if (e.type === 'node') nodes.set(e.id, e);
    else if (e.type === 'way') ways.set(e.id, e);
  }
  const ring = (w) => {
    const p = [];
    for (const id of w.nodes) { const n = nodes.get(id); if (n) { const [x, z] = toXZ(n.lat, n.lon); p.push(r1(x), r1(z)); } }
    return p;
  };
  const closed = (w) => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
  const height = (t) => {
    const h = parseFloat(t.height), l = parseFloat(t['building:levels']);
    if (h > 2) return r1(h);
    if (l > 0) return r1(l * 3.2);
    return 0; // неизвестно — придумаем при постройке
  };

  const buildings = [], roads = [], trees = [], pois = [];
  const used = new Set();
  const addBuilding = (w, t) => {
    if (used.has(w.id) || !closed(w)) return;
    used.add(w.id);
    const p = ring(w); p.length -= 2; // последний узел повторяет первый
    if (p.length >= 6) buildings.push({ p, h: height(t), n: t.name || '', k: t.building || '' });
  };
  for (const e of raw.elements) {
    const t = e.tags || {};
    if (e.type === 'way' && t.building) addBuilding(e, t);
    else if (e.type === 'relation' && t.building) {
      for (const m of e.members) if (m.type === 'way' && m.role !== 'inner') { const w = ways.get(m.ref); if (w) addBuilding(w, t); }
    } else if (e.type === 'way' && t.highway) {
      if (['service', 'cycleway', 'construction', 'proposed'].includes(t.highway)) continue;
      const w = parseFloat(t.width);
      roads.push({ p: ring(e), n: t.name || '', k: t.highway, ...(w > 0 ? { w } : {}) });
    } else if (e.type === 'node' && t.natural === 'tree') {
      const [x, z] = toXZ(e.lat, e.lon); trees.push(r1(x), r1(z));
    } else if (e.type === 'node' && (t.amenity || t.shop)) {
      const [x, z] = toXZ(e.lat, e.lon);
      pois.push({ x: r1(x), z: r1(z), n: t.name || '', k: t.shop ? 'bakery' : t.amenity });
    }
  }
  const [zs, xw] = toXZ(BBOX[0], BBOX[1]).reverse(), [zn, xe] = toXZ(BBOX[2], BBOX[3]).reverse();
  return { bounds: { minX: r1(xw), maxX: r1(xe), minZ: r1(zn), maxZ: r1(zs) }, buildings, roads, trees, pois };
}

export function clearMapCache() { try { localStorage.removeItem(KEY); } catch { /* */ } }
