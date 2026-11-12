// Координаты деталей в развёртке каждого фасада, от верхнего левого угла.
// Обе игровые текстуры используют одну разметку 224 × 305.
function rows(xRanges, yRanges, word = 'window') {
  return yRanges.flatMap(([top, bottom]) =>
    xRanges.map(([left, right]) => [word, left, top, right, bottom]));
}

const classic = [
  ...rows([[47, 67], [99, 122], [151, 173]], [[33, 55], [64, 78], [105, 140], [153, 189], [201, 234], [250, 291]]),
  ...rows([[12, 212]], [[227, 245]], 'balcony'),
];
const haussmann = [
  ...rows([[94, 129]], [[248, 305]], 'door'),
  ...rows([[30, 49], [78, 98], [126, 145], [173, 193]], [[40, 70], [83, 113], [134, 169], [187, 219]]),
  ...rows([[30, 49], [173, 193]], [[245, 279]]),
  ...rows([[16, 205]], [[105, 119], [216, 231]], 'balcony'),
];

const layouts = {
  pharmacy_v0: { roof: 115, masonry: 'brick', details: [
    ...rows([[94, 130]], [[247, 305]], 'door'),
    ...rows([[43, 72], [98, 124], [148, 177]], [[124, 200]]),
    ...rows([[42, 71], [148, 177]], [[223, 290]]),
    ...rows([[101, 122]], [[74, 107]]),
  ] },
  pharmacy_v1: { roof: 115, masonry: 'brick', details: [
    ...rows([[75, 106], [152, 181]], [[124, 200], [222, 290]]),
  ] },
  roses_v0: { roof: 53, details: [
    ...rows([[82, 139]], [[239, 305]], 'door'),
    ...rows([[29, 61], [93, 129], [155, 193]], [[104, 145], [166, 206]]),
    ...rows([[31, 62], [159, 196]], [[243, 285]]),
    ...rows([[84, 147]], [[138, 156]], 'balcony'),
  ] },
  boulangerie_v0: { roof: 62, details: [
    ...rows([[76, 118]], [[253, 305]], 'door'),
    ...rows([[119, 184]], [[250, 281]], 'shopWindow'),
    ...rows([[59, 88], [141, 172]], [[66, 99], [119, 151], [174, 207]]),
  ] },
  facade_v0: { roof: 59, details: classic },
  facade_v1: { roof: 59, details: classic },
  townhouse_v0: { roof: 87, details: [
    ...rows([[44, 68], [130, 153]], [[36, 80]]),
    ...rows([[40, 70], [122, 165]], [[114, 166], [197, 248]]),
  ] },
  townhouse_v2: { roof: 87, details: [
    ...rows([[65, 90], [153, 182]], [[35, 80]]),
    ...rows([[59, 96], [146, 181]], [[110, 164], [197, 248]]),
  ] },
  haussmann_v0: { roof: 37, details: haussmann },
  haussmann_v2: { roof: 37, details: haussmann },
  plain: { roof: 93, brickBelow: 220, details: [] },
};

export function facadeWord(facade, uv, ground, split) {
  const layout = layouts[facade.name];
  if (!layout) return 'wall';
  const { u0, u1, v0, v1, gu0, gu1, gv0, gv1 } = facade;
  const x = 224 * (ground ? (uv.x - gu0) / (gu1 - gu0) : (uv.x - u0) / (u1 - u0));
  const y = 305 * (1 - (ground ? split * (uv.y - gv0) / (gv1 - gv0) : (uv.y - v0) / (v1 - v0)));
  for (const [word, left, top, right, bottom] of layout.details) {
    if (x >= left && x <= right && y >= top && y <= bottom) return word;
  }
  if (y < layout.roof) return 'roof';
  if (layout.masonry || y > layout.brickBelow) return 'brick';
  return 'wall';
}
