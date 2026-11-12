import { K, X, Y, mulberry, shadeOf } from './builder.js';

const TRIM = [0.94, 0.9, 0.82];

// Один фронтон на выбранный фасадный сегмент, внутри исходной высоты крыши.
export function roofAccent(seg, h, roof) {
  const span = seg.x1 - seg.x0;
  if (h.roofType !== 'mansard' || !roof || roof.low < 0.65 || span < 6.8) return null;
  const r = mulberry(seg.seed * 13 + 7631);
  if (r() > 0.34) return null;
  const shoulder = h.E + Math.min(1.7, roof.yLow - h.E - 0.3);
  const peak = Math.min(roof.capY - 0.15, shoulder + 1.15);
  if (peak - shoulder < 0.55) return null;
  return { center: (seg.x0 + seg.x1) / 2, half: Math.min(1.8, span * 0.24),
    bottom: h.E - 0.22, shoulder, peak, rounded: r() < 0.35, back: -roof.low - 0.35 };
}

export function buildRoofAccent(B, accent, wall, roofColor) {
  const { center: c, half: w, bottom, shoulder, peak, back, rounded } = accent;
  const front = 0.09, outline = [];
  if (rounded) for (let i = 0; i <= 8; i++) {
    const a = Math.PI - i / 8 * Math.PI;
    outline.push([c + Math.cos(a) * w, shoulder + Math.sin(a) * (peak - shoulder)]);
  }
  else outline.push([c - w, shoulder], [c, peak], [c + w, shoulder]);
  B.panel([c - w, bottom, front], X, Y, w * 2, shoulder - bottom, wall, K.WALL, 1.5);
  for (let i = 0; i + 1 < outline.length; i++) {
    const [xa, ya] = outline[i], [xb, yb] = outline[i + 1];
    B.tri([c, shoulder, front], [xa, ya, front], [xb, yb, front], wall, K.WALL);
    B.quad([xa, ya, front - 0.03], [xb, yb, front - 0.03], [xb, yb, back], [xa, ya, back], roofColor, K.ROOF,
      [0, 0, Math.hypot(xb - xa, yb - ya), Math.abs(back)]);
    const length = Math.hypot(xb - xa, yb - ya), dx = -(yb - ya) / length * 0.11, dy = (xb - xa) / length * 0.11;
    B.quad([xa, ya, front + 0.03], [xb, yb, front + 0.03], [xb + dx, yb + dy, front + 0.03], [xa + dx, ya + dy, front + 0.03], TRIM, K.TRIM);
  }
  const xa = c - 0.55, xb = c + 0.55, ya = bottom + 0.48, yb = shoulder - 0.14;
  B.quad([xa, ya, front + 0.02], [xb, ya, front + 0.02], [xb, yb, front + 0.02], [xa, yb, front + 0.02], [0.93, 0.9, 0.84], K.GLASS, [0, 0, 1, 1], 0.75);
  B.box(xa - 0.12, ya - 0.12, front, xb + 0.12, ya, front + 0.17, TRIM, K.TRIM);
  B.box(xa - 0.1, ya, front, xa, yb, front + 0.09, TRIM, K.TRIM);
  B.box(xb, ya, front, xb + 0.1, yb, front + 0.09, TRIM, K.TRIM);
  B.box(xa - 0.1, yb, front, xb + 0.1, yb + 0.13, front + 0.1, shadeOf(TRIM, 0.97), K.TRIM);
}
