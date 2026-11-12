// Refresh the small bundled map. OSM geometry remains ODbL, like the live Overpass data.
// node scripts/cache-map.mjs [optional-raw-osm-json]
import { readFile, writeFile } from 'node:fs/promises';
import { convert } from '../src/osm.js';

const bbox = '2.3368,48.8848,2.3442,48.8884';
let raw;
if (process.argv[2]) raw = JSON.parse(await readFile(process.argv[2], 'utf8'));
else {
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenStreetMap: HTTP ${response.status}`);
  raw = await response.json();
}
if (!Array.isArray(raw.elements)) throw new Error('Missing OSM elements');
// The map endpoint also returns other amenities. Keep exactly the POI categories requested by osm.js.
for (const item of raw.elements) if (item.type === 'node' && item.tags) {
  if (!['cafe', 'restaurant', 'bar', 'pub'].includes(item.tags.amenity)) delete item.tags.amenity;
  if (!['bakery', 'pastry'].includes(item.tags.shop)) delete item.tags.shop;
}
const data = convert(raw);
if (data.buildings.length < 100 || data.roads.length < 50) throw new Error('Incomplete Montmartre map');
data.source = { name: 'OpenStreetMap contributors', license: 'ODbL-1.0', attribution: 'https://www.openstreetmap.org/copyright', bbox, capturedAt: new Date().toISOString() };
await writeFile(new URL('../assets/montmartre.json', import.meta.url), JSON.stringify(data) + '\n');
console.log(`Saved ${data.buildings.length} buildings, ${data.roads.length} streets, ${data.pois.length} POIs.`);
