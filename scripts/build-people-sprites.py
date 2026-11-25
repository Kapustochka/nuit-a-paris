"""Нарезка рисованных прохожих: лист «спереди · сбоку в шаге · сзади · вполоборота» на белом фоне
→ assets/people/painted/<имя>.webp (4 клетки в ряд, ноги на одной линии) + src/people-sheets.js.

python3 scripts/build-people-sprites.py <папка с листами 01-painter.png ...>
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

CELL_H, FIG_H, FOOT = 512, 460, 504
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'people' / 'painted'
# рост в метрах (с головным убором) и пол — для голоса
CAST = {
    'painter': (1.72, True), 'gentleman': (1.86, False), 'dog-walker': (1.70, True), 'baker': (1.80, False),
    'accordionist': (1.80, False), 'student': (1.70, True), 'elegant-woman': (1.74, True), 'waiter': (1.82, False),
}


def cut(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lo, hi = rgb.min(2), rgb.max(2)
    white = (lo > 236) & (hi - lo < 14)
    lab, n = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # белые просветы между рукой и телом: только совсем чистый белый
    sizes = ndimage.sum(np.ones_like(lo), lab, range(1, n + 1))
    means = ndimage.mean(lo, lab, range(1, n + 1))
    holes = [i + 1 for i in range(n) if i + 1 not in border and sizes[i] > 300 and means[i] > 249]
    bg |= np.isin(lab, holes)
    alpha = (~bg).astype(np.float32)
    band = (~bg) & ndimage.binary_dilation(bg, iterations=2)
    alpha[band] = np.clip((255 - lo[band]) / 70, 0, 1)
    a = alpha[..., None]
    rgb = np.where(a > 0.02, (rgb - (1 - a) * 255) / np.maximum(a, 0.02), rgb).clip(0, 255)
    return rgb, alpha


def split(alpha):
    W = alpha.shape[1]
    cols = (alpha > 0.5).sum(0)
    cuts = [0]
    for q in (W // 4, W // 2, 3 * W // 4):
        xs = np.arange(q - 200, q + 200)
        m = cols[xs].min()
        best = xs[cols[xs] <= m]
        cuts.append(int(best[len(best) // 2]))
    return cuts + [W]


def main(src):
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for name, (height, woman) in CAST.items():
        path = next(Path(src).glob(f'*{name}.png'))
        rgb, alpha = cut(path)
        cuts = split(alpha)
        views = []
        for x0, x1 in zip(cuts, cuts[1:]):
            a = alpha[:, x0:x1]
            ys, xs = np.nonzero(a > 0.5)
            top, bot = ys.min(), ys.max()
            # центр фигуры — по голове и плечам (собака, трость и поднос не сдвигают его)
            upper = ys < top + (bot - top) * 0.4
            px = xs[upper].mean()
            views.append((x0, x1, top, bot, px + x0))
        s = FIG_H / (views[0][3] - views[0][2])
        half = 0
        for x0, x1, top, bot, px in views:
            xs = np.nonzero((alpha[:, x0:x1] > 0.5).any(0))[0] + x0
            half = max(half, px - xs.min(), xs.max() - px)
        cw = int(np.ceil((half * s + 6) / 2) * 2)
        atlas = Image.new('RGBA', (cw * 2 * 4, CELL_H), (0, 0, 0, 0))
        full = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
        for k, (x0, x1, top, bot, px) in enumerate(views):
            crop = full.crop((x0, 0, x1, full.height))
            crop = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
            atlas.alpha_composite(crop, (round(k * cw * 2 + cw - (px - x0) * s), round(FOOT - bot * s)))
        # цвет под прозрачным — от соседних мазков, чтобы мип-уровни не давали белой каймы
        arr = np.asarray(atlas).astype(np.float32)
        a = arr[..., 3:] / 255
        blur = lambda x: ndimage.gaussian_filter(x, (6, 6, 0))
        fill = blur(arr[..., :3] * a) / np.maximum(blur(a), 1e-4)
        arr[..., :3] = np.where(a > 0.01, arr[..., :3], fill)
        Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA').save(OUT / f'{name}.webp', quality=86, method=6)
        meta[name] = {'cells': 4, 'cell': cw * 2, 'h': CELL_H, 'foot': FOOT, 'fig': FIG_H, 'height': height, 'woman': woman}
        print(name, atlas.size, cuts)
    js = OUT.parent.parent.parent / 'src' / 'people-sheets.js'
    js.write_text('// Создано scripts/build-people-sprites.py: клетки листов рисованных прохожих (px) и рост (м)\n'
                  'export const SHEETS = ' + json.dumps(meta, indent=1) + ';\n')


if __name__ == '__main__':
    main(sys.argv[1])
