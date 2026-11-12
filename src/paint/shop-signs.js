// shop-signs.js — кованые двусторонние вывески на реальных POI Монмартра.
// Отдельный художественный слой: не меняет здания, коллизии, шейдеры и данные карты.
// Включены только там, где buildShops уже поставил настоящую витрину.
import * as THREE from 'three';

const CATEGORIES = {
  bakery: { label: 'BOULANGERIE', board: '#54364f', gold: '#f4cc82' },
  cafe: { label: 'CAFÉ', board: '#2e5158', gold: '#f5d49a' },
  books: { label: 'LIBRAIRIE', board: '#504d73', gold: '#f1d396' },
  flowers: { label: 'FLEURISTE', board: '#38564d', gold: '#f5d49a' },
  atelier: { label: 'ATELIER', board: '#58455e', gold: '#f5d69c' },
};

function category(shop) {
  const key = ((shop.kind || '') + ' ' + (shop.name || '')).toLowerCase();
  if (/bakery|boulanger|pâtisser|patisser|pain|croissant/.test(key)) return 'bakery';
  if (/florist|flower|fleur|bouquet/.test(key)) return 'flowers';
  if (/book|librair|livre/.test(key)) return 'books';
  if (/cafe|café|coffee|bistro|restaurant|bar|brasserie|pub/.test(key)) return 'cafe';
  return 'atelier';
}

// Рисованная металлическая табличка с золотой иконкой; никаких внешних файлов.
function signTexture(kind) {
  const cfg = CATEGORIES[kind], canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // Асимметричный фигурный силуэт вместо прямоугольной низкополигональной таблички.
  const shield = () => {
    g.beginPath();
    g.moveTo(44, 43);
    g.quadraticCurveTo(45, 26, 65, 26);
    g.quadraticCurveTo(128, 14, 191, 26);
    g.quadraticCurveTo(212, 29, 212, 48);
    g.lineTo(213, 189);
    g.quadraticCurveTo(209, 207, 187, 209);
    g.quadraticCurveTo(153, 228, 128, 233);
    g.quadraticCurveTo(104, 228, 69, 209);
    g.quadraticCurveTo(43, 207, 44, 185);
    g.closePath();
  };
  shield();
  const grad = g.createLinearGradient(35, 28, 212, 220);
  grad.addColorStop(0, cfg.board);
  grad.addColorStop(0.47, '#3b344b');
  grad.addColorStop(1, cfg.board);
  g.fillStyle = grad; g.fill();
  g.strokeStyle = '#1b1931'; g.lineWidth = 12; g.stroke();
  g.strokeStyle = cfg.gold; g.lineWidth = 5; g.stroke();
  g.strokeStyle = 'rgba(255,227,176,0.55)'; g.lineWidth = 1.6;
  g.save(); g.translate(0, -6); g.scale(0.91, 0.91); g.translate(12.7, 13.8); shield(); g.stroke(); g.restore();

  // Мазки краски и потёртые золотые вкрапления с фиксированной последовательностью.
  for (let i = 0; i < 125; i++) {
    const x = 51 + ((i * 53) % 153), y = 46 + ((i * 79) % 145);
    const shade = i % 4 === 0 ? 'rgba(255,221,170,0.08)' : 'rgba(31,25,55,0.12)';
    g.fillStyle = shade;
    g.save(); g.translate(x, y); g.rotate(Math.sin(i * 2.7) * 0.45);
    g.fillRect(0, 0, 4 + (i % 6), 1 + (i % 2)); g.restore();
  }
  g.strokeStyle = cfg.gold; g.fillStyle = cfg.gold;
  g.lineWidth = 8;
  const line = (...points) => {
    g.beginPath(); g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.stroke();
  };
  if (kind === 'bakery') {
    // Круассан с прорезями.
    g.beginPath(); g.moveTo(66, 137);
    g.bezierCurveTo(76, 108, 88, 93, 103, 100);
    g.bezierCurveTo(120, 110, 137, 108, 152, 98);
    g.bezierCurveTo(171, 98, 187, 123, 190, 139);
    g.bezierCurveTo(162, 125, 159, 144, 140, 150);
    g.quadraticCurveTo(128, 161, 114, 150);
    g.quadraticCurveTo(88, 147, 66, 137); g.fill();
    g.strokeStyle = cfg.board; g.lineWidth = 5;
    line(111, 113, 103, 138); line(144, 113, 150, 139);
  } else if (kind === 'cafe') {
    g.beginPath(); g.moveTo(84, 115); g.lineTo(161, 115); g.lineTo(154, 153);
    g.quadraticCurveTo(124, 166, 94, 153); g.closePath(); g.fill();
    g.lineWidth = 8; g.beginPath(); g.arc(166, 127, 16, -1.2, 1.3); g.stroke();
    line(86, 167, 162, 167);
    g.lineWidth = 5;
    for (const x of [108, 131]) { g.beginPath(); g.moveTo(x, 103); g.bezierCurveTo(x - 9, 91, x + 12, 86, x + 2, 71); g.stroke(); }
  } else if (kind === 'books') {
    g.lineWidth = 7;
    g.strokeRect(83, 104, 24, 65);
    g.strokeRect(113, 96, 23, 73);
    g.save(); g.translate(150, 166); g.rotate(-0.18); g.strokeRect(0, -72, 23, 72); g.restore();
    line(87, 119, 103, 119); line(117, 109, 132, 109);
  } else if (kind === 'flowers') {
    g.lineWidth = 7;
    line(126, 152, 128, 174); line(110, 160, 98, 145); line(143, 160, 156, 146);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.beginPath(); g.ellipse(126 + Math.cos(a) * 19, 122 + Math.sin(a) * 19, 12, 20, a, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = cfg.board; g.beginPath(); g.arc(126, 122, 11, 0, Math.PI * 2); g.fill();
  } else {
    g.lineWidth = 7;
    g.beginPath(); g.ellipse(127, 125, 45, 36, -0.2, 0, Math.PI * 2); g.stroke();
    for (const [x, y] of [[102,115],[121,105],[143,114]]) { g.beginPath(); g.arc(x,y,5,0,Math.PI*2); g.fill(); }
    g.beginPath(); g.moveTo(156, 150); g.quadraticCurveTo(183, 145, 178, 125); g.stroke();
  }

  // Крупная надпись читается на близком расстоянии; иконка — издалека.
  g.fillStyle = cfg.gold; g.font = 'italic 600 18px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(cfg.label, 128, 190, 158);
  g.beginPath(); g.arc(128, 207, 3, 0, Math.PI * 2); g.fill();

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  return t;
}


const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const bracketPath = (vertices, radius) => new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3(vertices.map((p) => V3(...p))), 10, radius, 5, false
);

/**
 * Парижские «enseigne drapeau» перпендикулярно настоящим витринам OSM.
 * Батчинг: до 5 материалов табличек + 6 инстансированных деталей кронштейна;
 * до 11 draw calls. Высота уже учтена в точке крепления на фасаде.
 */
export function addHangingShopSigns(scene, shopFronts) {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('no-hanging-signs'))
    return { count: 0 };

  const shops = shopFronts.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.z) &&
    Number.isFinite(s.y) && Number.isFinite(s.nx) && Number.isFinite(s.nz)).slice(0, 28);
  if (!shops.length) return { count: 0 };

  const iron = new THREE.MeshStandardMaterial({ color: '#30283d', metalness: 0.14, roughness: 0.84 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#b89469', metalness: 0.24, roughness: 0.74 });
  const paints = {};
  const byCategory = new Map();
  for (const kind of Object.keys(CATEGORIES)) {
    paints[kind] = new THREE.MeshStandardMaterial({
      map: signTexture(kind), transparent: true, alphaTest: 0.14,
      side: THREE.FrontSide, metalness: 0, roughness: 0.96,
      emissive: '#26150f', emissiveIntensity: 0.1,
    });
    byCategory.set(kind, []);
  }
  const entries = shops.map((s) => {
    const normal = new THREE.Vector2(s.nx, s.nz).normalize();
    const nx = normal.x, nz = normal.y;
    // These coordinates come from the same deformed OSM facade as the actual storefront.
    const entry = { x: s.x, y: s.y, z: s.z, nx, nz, yaw: Math.atan2(nx, nz), kind: category(s) };
    byCategory.get(entry.kind).push(entry);
    return entry;
  });

  const axis = V3(0, 1, 0), unit = V3(1, 1, 1);
  const mat = new THREE.Matrix4(), quat = new THREE.Quaternion();
  const set = (mesh, i, x, y, z, yaw) => {
    quat.setFromAxisAngle(axis, yaw);
    mesh.setMatrixAt(i, mat.compose(V3(x, y, z), quat, unit));
  };
  const push = (mesh, name) => {
    mesh.userData.word = name;
    mesh.userData.noLift = true; // world elevation already includes slope
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  };

  // Двусторонняя нарисованная табличка: два экземпляра, каждый читается правильно.
  const cardGeo = new THREE.PlaneGeometry(0.98, 1.05);
  for (const [kind, entriesOfKind] of byCategory) {
    if (!entriesOfKind.length) continue;
    const signs = new THREE.InstancedMesh(cardGeo, paints[kind], entriesOfKind.length * 2);
    let i = 0;
    for (const s of entriesOfKind) for (const side of [-1, 1]) {
      const tx = s.nz, tz = -s.nx;
      set(signs, i++, s.x + s.nx * 1.02 + tx * side * 0.015,
        s.y + 2.94, s.z + s.nz * 1.02 + tz * side * 0.015,
        s.yaw + Math.PI / 2 + (side < 0 ? Math.PI : 0));
    }
    push(signs, 'sign');
  }

  // Один набор кованых деталей переиспользуется на всех лавках.
  const parts = [
    // A plate anchored to the wall and a clear, curved support over the sign.
    [new THREE.BoxGeometry(0.19, 0.52, 0.085).translate(0,3.40,0.055),iron],
    [bracketPath([[0,3.63,0.04],[0,3.73,0.24],[0,3.69,0.85],[0,3.63,1.51]],0.035),iron],
    [bracketPath([[0,3.16,0.04],[0,3.35,0.20],[0,3.69,0.64]],0.025),iron],
    [bracketPath([[0,3.63,0.62],[0,3.45,0.62]],0.012),bronze],
    [bracketPath([[0,3.63,1.42],[0,3.45,1.42]],0.012),bronze],
    [new THREE.IcosahedronGeometry(0.085,0).translate(0,3.63,1.51),bronze],
  ];
  for (const [geometry, material] of parts) {
    const brackets = new THREE.InstancedMesh(geometry, material, entries.length);
    for (let i=0;i<entries.length;i++)
      set(brackets, i, entries[i].x, entries[i].y, entries[i].z, entries[i].yaw);
    push(brackets, 'sign');
  }
  return { count: entries.length };
}
