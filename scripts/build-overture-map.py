"""Build a compact city map (same format as assets/montmartre.json) from Overture Maps.

Overture is used where the OpenStreetMap API and Overpass are not reachable. Its buildings,
streets and water come mostly from OpenStreetMap (ODbL), so the same attribution applies.

    pip install pyarrow shapely
    python scripts/build-overture-map.py london          # writes assets/london/map.json
"""
import json, math, os, sys
from datetime import datetime, timezone
import pyarrow.compute as pc, pyarrow.dataset as ds, pyarrow.fs as pfs
from shapely import wkb
from shapely.geometry import box

RELEASE = '2026-11-18.0'
CITIES = {
    # center = scene origin (lat, lon); bbox = south, west, north, east
    'london': {'center': (51.50070, -0.12600), 'bbox': (51.4993, -0.1290, 51.5021, -0.1222), 'out': 'assets/london/map.json',
               # OSM heights here are roof-line guesses or missing; use the real ones for the landmarks
               'heights': {'Palace of Westminster': 30, 'Westminster Hall': 28, 'Westminster Abbey': 31,
                           "St Margaret's Church": 18, "St. Stephen's Hall": 26, "St. Stephen's Porch": 24}},
}
city = CITIES[sys.argv[1] if len(sys.argv) > 1 else 'london']
(clat, clon), (S, W, N, E) = city['center'], city['bbox']
MX, MZ = math.cos(math.radians(clat)) * 111320, 110574
r1 = lambda v: round(v * 10) / 10
xz = lambda lon, lat: (r1((lon - clon) * MX), r1(-(lat - clat) * MZ))   # north = -z, as in src/osm.js

proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
fs = pfs.S3FileSystem(anonymous=True, region='us-west-2', **({'proxy_options': proxy} if proxy else {}))
def read(theme, typ, cols):
    d = ds.dataset(f'overturemaps-us-west-2/release/{RELEASE}/theme={theme}/type={typ}/', filesystem=fs, format='parquet')
    f = (pc.field('bbox', 'xmin') < E) & (pc.field('bbox', 'xmax') > W) & (pc.field('bbox', 'ymin') < N) & (pc.field('bbox', 'ymax') > S)
    return d.to_table(filter=f, columns=['geometry', *cols]).to_pylist()

clip = box(W, S, E, N)
name = lambda r: ((r.get('names') or {}).get('primary') or '')
def rings(geom):
    polys = getattr(geom, 'geoms', [geom])
    for g in polys:
        if g.geom_type == 'Polygon' and not g.is_empty:
            pts = list(g.exterior.coords)[:-1]
            if len(pts) >= 3: yield [v for lon, lat in pts for v in xz(lon, lat)]
def lines(geom):
    for g in getattr(geom, 'geoms', [geom]):
        if g.geom_type == 'LineString' and len(g.coords) >= 2: yield [v for lon, lat in g.coords for v in xz(lon, lat)]

buildings = []
for r in read('buildings', 'building', ['height', 'num_floors', 'names', 'class']):
    g = wkb.loads(r['geometry'])
    if not g.intersects(clip): continue
    g = g.simplify(0.000012, preserve_topology=True)   # ~1 m: the Palace outline has 730 points, the facade builder chokes on it
    h = city.get('heights', {}).get(name(r)) or r['height'] or (r['num_floors'] or 0) * 3.2
    for p in rings(g): buildings.append({'p': p, 'h': r1(h) if h > 2 else 0, 'n': name(r), 'k': r['class'] or 'yes'})

roads = []
SKIP = {'service', 'cycleway', 'unclassified', 'track', 'unknown', None}
for r in read('transportation', 'segment', ['subtype', 'class', 'names', 'road_flags']):
    if r['subtype'] != 'road' or r['class'] in SKIP: continue
    flags = {v for f in (r['road_flags'] or []) for v in f['values']}
    if flags & {'is_tunnel', 'is_indoor', 'is_covered'}: continue
    g = wkb.loads(r['geometry']).intersection(clip)
    for p in lines(g):
        road = {'p': p, 'n': name(r), 'k': r['class']}
        if 'is_bridge' in flags: road['bridge'] = 1
        roads.append(road)

water = []
for r in read('base', 'water', ['class', 'subtype', 'names']):
    if r['subtype'] not in ('river', 'water', 'lake'): continue
    g = wkb.loads(r['geometry'])
    if g.geom_type not in ('Polygon', 'MultiPolygon'): continue
    for p in rings(g.intersection(clip)): water.append({'p': p, 'n': name(r)})

minx, minz = xz(W, N); maxx, maxz = xz(E, S)
data = {'bounds': {'minX': minx, 'maxX': maxx, 'minZ': minz, 'maxZ': maxz}, 'buildings': buildings, 'roads': roads,
        'trees': [], 'pois': [], 'water': water,
        'source': {'name': 'OpenStreetMap contributors via Overture Maps Foundation', 'license': 'ODbL-1.0',
                   'attribution': 'https://www.openstreetmap.org/copyright', 'overture': RELEASE,
                   'bbox': f'{W},{S},{E},{N}', 'capturedAt': datetime.now(timezone.utc).isoformat()}}
with open(city['out'], 'w') as f: f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f"Saved {len(buildings)} buildings, {len(roads)} streets, {len(water)} water areas to {city['out']}")
