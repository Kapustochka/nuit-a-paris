# Build assets/terrain.json: a 4 m height grid of Montmartre for src/terrain.js.
# Source: AWS Terrain Tiles (Mapzen terrarium PNG, zoom 15), https://registry.opendata.aws/terrain-tiles/
# Usage:
#   1) download the tiles covering the map into a folder as {x}_{y}.png from
#      https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/{x}/{y}.png
#      (for the current bounds: x 16596-16597, y 11268-11269)
#   2) python scripts/build-terrain.py <tiles-folder> assets/terrain.json
import math, json, sys
from PIL import Image
D = sys.argv[1]; out = sys.argv[2]
z = 15; CLAT, CLON = 48.88655, 2.34065
MX = math.cos(math.radians(CLAT)) * 111320; MZ = 110574
tiles = {}
def tile(x, y):
    if (x, y) not in tiles: tiles[(x, y)] = Image.open(f'{D}/{x}_{y}.png').convert('RGB').load()
    return tiles[(x, y)]
def elev_px(px, py):
    tx, ty = int(px // 256), int(py // 256)
    r, g, b = tile(tx, ty)[int(px % 256), int(py % 256)]
    return r * 256 + g + b / 256 - 32768
def elev(lat, lon):
    n = 2 ** z
    px = (lon + 180) / 360 * n * 256 - 0.5
    py = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n * 256 - 0.5
    x0, y0 = math.floor(px), math.floor(py); fx, fy = px - x0, py - y0
    a = elev_px(x0, y0); b = elev_px(x0 + 1, y0); c = elev_px(x0, y0 + 1); d = elev_px(x0 + 1, y0 + 1)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
STEP = 4
minX, maxX, minZ, maxZ = -300, 280, -224, 212
nx, nz = int((maxX - minX) / STEP) + 1, int((maxZ - minZ) / STEP) + 1
h = []
for j in range(nz):
    for i in range(nx):
        x, zz = minX + i * STEP, minZ + j * STEP
        lon = CLON + x / MX; lat = CLAT - zz / MZ
        h.append(elev(lat, lon))
# smooth 3x3 twice (SRTM noise / building bumps)
for _ in range(2):
    g = h[:]
    for j in range(nz):
        for i in range(nx):
            s = n = 0
            for dj in (-1, 0, 1):
                for di in (-1, 0, 1):
                    jj, ii = j + dj, i + di
                    if 0 <= jj < nz and 0 <= ii < nx: s += h[jj * nx + ii]; n += 1
            g[j * nx + i] = s / n
    h = g
base = min(h)
json.dump({"minX": minX, "minZ": minZ, "step": STEP, "nx": nx, "nz": nz, "base": round(base, 1),
           "h": [round((v - base) * 10) for v in h]}, open(out, 'w'), separators=(',', ':'))
def at(lat, lon): return round(elev(lat, lon), 1)
print('cells', nx, nz, 'min', round(base, 1), 'max', round(max(h), 1))
print('Tertre', at(48.88655, 2.34065), 'Sacre', at(48.88672, 2.34306), 'S edge', at(48.8848, 2.3400), 'N edge', at(48.8884, 2.3400), 'W', at(48.8866, 2.3368), 'E', at(48.8866, 2.3442))
