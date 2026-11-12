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

function tube(parent, points, material, radius = 0.025) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  parent.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 5, false), material));
}

/**
 * Add authentic hanging "enseigne drapeau" perpendicular to the real shopfront.
 * All positions are locally based at ground height (liftToGround handles terrain).
 * Call before the scene's global paintObject pass.
 */
export function addHangingShopSigns(scene, shopFronts) {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('no-hanging-signs'))
    return { count: 0 };

  const signs = shopFronts.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.z) &&
    Number.isFinite(s.nx) && Number.isFinite(s.nz) && s.w >= 3).slice(0, 28);
  const iron = new THREE.MeshStandardMaterial({ color: '#30283d', metalness: 0.14, roughness: 0.84 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#b89469', metalness: 0.24, roughness: 0.74 });
  const paints = {};
  for (const kind of Object.keys(CATEGORIES)) paints[kind] = new THREE.MeshStandardMaterial({
    map: signTexture(kind), transparent: true, alphaTest: 0.14, side: THREE.FrontSide,
    metalness: 0, roughness: 0.96, emissive: '#26150f', emissiveIntensity: 0.1,
  });

  const plane = new THREE.PlaneGeometry(0.98, 1.05);
  for (let i = 0; i < signs.length; i++) {
    const s = signs[i], kind = category(s), normal = new THREE.Vector2(s.nx, s.nz).normalize();
    const nx = normal.x, nz = normal.y, alongX = nz, alongZ = -nx;
    // У краешка витрины, чуть в стороне от двери. Никаких объектов внутри дома.
    const posX = s.x + alongX * Math.min(1.8, s.w * 0.31);
    const posZ = s.z + alongZ * Math.min(1.8, s.w * 0.31);
    const g = new THREE.Group();
    g.position.set(posX, 0, posZ);
    g.userData.word = 'sign';

    const boardX = nx * 1.02, boardZ = nz * 1.02, y = 3.42;
    // Две независимые стороны: текст не зеркалится при взгляде с другого конца улицы.
    const facing = Math.atan2(alongX, alongZ);
    for (const signSide of [-1, 1]) {
      const mesh = new THREE.Mesh(plane, paints[kind]);
      mesh.rotation.y = facing + (signSide < 0 ? Math.PI : 0);
      mesh.position.set(boardX + alongX * signSide * 0.015, y, boardZ + alongZ * signSide * 0.015);
      mesh.userData.word = 'sign';
      g.add(mesh);
    }

    // Кованый кронштейн, диагональная распорка и две подвески.
    tube(g, [[nx*0.04,4.12,nz*0.04],[nx*0.25,4.22,nz*0.25],
      [nx*0.8,4.20,nz*0.8],[nx*1.51,4.13,nz*1.51]], iron, 0.035);
    tube(g, [[nx*0.02,3.75,nz*0.02],[nx*0.19,3.99,nz*0.19],[nx*0.58,4.21,nz*0.58]], iron, 0.022);
    for (const dist of [0.62, 1.42])
      tube(g, [[nx*dist,4.13,nz*dist],[nx*dist,3.91,nz*dist]], bronze, 0.012);

    const finial = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), bronze);
    finial.position.set(nx * 1.51, 4.13, nz * 1.51); g.add(finial);
    scene.add(g);
  }
  return { count: signs.length };
}
