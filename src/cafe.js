// cafe.js — официанты у ближайших кафе и продавец у булочной. Они стоят у двери с подносом,
// поворачиваются к героине, а над ними появляется бумажная табличка «заказать». Двойной клик по
// официанту (или клик по табличке) открывает заказ — ту же карточку разговора, что у прохожих (talk.js),
// только можно выбрать, что заказать: кофе, шоколад, чай, круассан; в булочной — багет и выпечку.
// Когда официант говорит «Et voilà votre café !», чашка и круассан появляются на столике террасы.
// Фигуры — те же нарисованные из примитивов люди, что в people.js; их всего несколько, и они
// переходят к тем кафе, что ближе к героине, поэтому в кадре никогда не бывает лишних мешей.
import * as THREE from 'three';
import { figureGeometry, makeSkeleton, mulberry, B, TRAY_TILT } from './people.js';

const SERVE_KINDS = ['cafe', 'restaurant', 'bar', 'pub'];
const REACH = 7;                // дальше этого заказ не начинается (как разговор в talk.js)

export function createCafes(scene, world, { inspector, player, camera, talk, isRaining = () => false, count = 4 } = {}) {
  const spots = (world.shopFronts || []).filter((s) => s.kind === 'bakery' || SERVE_KINDS.includes(s.kind))
    .map((s) => standSpot(world, s)).filter(Boolean);
  if (!spots.length) return { update() {}, blocksStep: () => false, staff: [] };

  // ── Фигуры ─────────────────────────────────────────────────
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const staff = [];
  for (let k = 0; k < count; k++) {
    const woman = k % 2 === 1;
    const { geometry, height } = figureGeometry(mulberry(777 + k * 131), { waiter: true, woman });
    const bones = makeSkeleton();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += 0.3;
    const root = new THREE.Group();
    root.name = woman ? 'Serveuse' : 'Serveur';
    root.add(mesh);
    root.scale.setScalar(height / 1.7);
    root.visible = false;
    scene.add(root);
    const one = { root, mesh, bones, woman, rest: bones[0].position.y, spot: null, talking: false, pause: 0, look: 0, t: Math.random() * 10 };
    mesh.userData.word = () => (one.spot?.place === 'bakery' ? (woman ? 'bakerWoman' : 'baker') : woman ? 'waitress' : 'waiter');
    mesh.userData.onInspect = (x, y) => { if (!order(one)) inspector?.show(mesh.userData.word(), x, y, mesh); };
    inspector?.addTarget(mesh);
    staff.push(one);
  }
  world.paint(staff[0].root);           // материал общий

  // ── Заказ на столике ───────────────────────────────────────
  const served = new THREE.Group();
  served.name = 'Order on the table';
  scene.add(served);
  const dishes = makeDishes();
  world.paint(dishes.paintRoot);
  let clickable = [];

  function serve(one, picks) {
    const tables = one.spot.tables;
    if (!tables.length) return;
    // столик ближе к героине; заказ на краю, который к ней ближе
    const table = tables.reduce((a, t) => (Math.hypot(t.x - player.x, t.z - player.z) < Math.hypot(a.x - player.x, a.z - player.z) ? t : a));
    const dx = player.x - table.x, dz = player.z - table.z, d = Math.hypot(dx, dz) || 1;
    const x = table.x + dx / d * 0.2, z = table.z + dz / d * 0.2;      // в центре свеча
    served.clear();
    for (const m of clickable) inspector?.removeTarget?.(m);
    const set = dishes.build(one.spot.place === 'bakery' ? picks[0] : picks[1], one.spot.place === 'bakery' ? null : picks[2]);
    clickable = [];
    set.traverse((o) => { if (o.userData.word) clickable.push(o); });
    for (const m of clickable) inspector?.addTarget(m);
    set.position.set(x, world.heightAt(table.x, table.z) + table.y + 0.005, z);
    set.rotation.y = Math.atan2(dx, dz);
    served.add(set);
  }

  function order(one) {
    if (!one.spot || !talk) return false;
    return talk.start(one, isRaining(), { place: one.spot.place, events: { serve: (picks) => serve(one, picks) } });
  }

  // ── Табличка «заказать» над головой ────────────────────────
  const tag = document.createElement('button');
  tag.type = 'button';
  tag.id = 'waiter-tag';
  tag.hidden = true;
  tag.innerHTML = '<span lang="fr"></span><small>заказать: двойной клик или сюда</small>';
  if (matchMedia('(hover: none)').matches) tag.lastChild.textContent = 'нажми, чтобы заказать';
  document.body.append(tag);
  let tagged = null;
  const head = new THREE.Vector3();
  const openTag = (e) => { e.preventDefault(); e.stopPropagation(); if (tagged) order(tagged); };
  tag.addEventListener('click', openTag);
  tag.addEventListener('dblclick', openTag);

  // ── Кто у какого кафе стоит ────────────────────────────────
  let assignTick = 0;
  function assign() {
    const near = spots.map((s) => [s, Math.hypot(s.x - player.x, s.z - player.z)]).filter(([, d]) => d < 55)
      .sort((a, b) => a[1] - b[1]).slice(0, staff.length).map(([s]) => s);
    const freeSpots = near.filter((s) => !staff.some((o) => o.spot === s));
    for (const one of staff) {
      if (one.talking) continue;
      if (one.spot && near.includes(one.spot)) continue;
      const s = freeSpots.shift() || null;
      one.spot = s;
      one.root.visible = !!s;
      if (s) {
        one.root.position.set(s.x, world.heightAt(s.x, s.z), s.z);
        one.root.rotation.y = s.yaw;
      }
    }
  }

  function pose(one, dt) {
    const b = one.bones, t = (one.t += dt);
    const breathe = Math.sin(t * 1.7) * 0.012;
    b[B.hips].position.y = one.rest + breathe * 0.4;
    b[B.hips].rotation.z = Math.sin(t * 0.45) * 0.02;
    b[B.spine].rotation.set(0.02 + breathe, 0, -Math.sin(t * 0.45) * 0.015);
    // левая рука держит поднос: плечо чуть вперёд, предплечье горизонтально — поднос ровно
    b[B.armL].rotation.set(-0.15, 0, 0.1);
    b[B.foreL].rotation.x = -(TRAY_TILT - 0.15);
    // правая висит; когда героиня близко и ещё не заказала — приглашающий жест
    const invite = one.inviting ? Math.max(0, Math.sin(t * 2.2)) : 0;
    b[B.armR].rotation.set(-0.15 - invite * 0.35, 0, -0.07 - invite * 0.35);
    b[B.foreR].rotation.x = -0.2 - invite * 0.6;
    b[B.thighL].rotation.x = b[B.thighR].rotation.x = 0;
    b[B.shinL].rotation.x = b[B.shinR].rotation.x = 0.04;
    b[B.head].rotation.y += (one.look - b[B.head].rotation.y) * (1 - Math.exp(-dt * 5));
    b[B.head].rotation.x = -0.03;
  }

  function update(dt) {
    assignTick -= dt;
    if (assignTick <= 0) { assignTick = 0.5; assign(); }
    let best = null, bestD = 6;
    for (const one of staff) {
      if (!one.spot) continue;
      const pos = one.root.position, toX = player.x - pos.x, toZ = player.z - pos.z, dist = Math.hypot(toX, toZ);
      // героиня рядом — поворачивается к ней; ушла — снова смотрит на улицу
      const want = dist < 8 || one.talking ? Math.atan2(toX, toZ) : one.spot.yaw;
      const yaw = one.root.rotation.y, delta = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
      const body = one.talking ? delta : THREE.MathUtils.clamp(delta, -0.9, 0.9) * 0.6;
      one.root.rotation.y += body * (1 - Math.exp(-dt * 3));
      one.look = dist < 8 ? THREE.MathUtils.clamp(delta - body, -0.9, 0.9) : 0;
      one.inviting = !one.talking && dist < 5 && dist > 1.2;
      if (dist < 50) pose(one, dt);
      if (!one.talking && dist < bestD) { best = one; bestD = dist; }
    }
    // табличка над тем, кто ближе (и пока нет разговора)
    tagged = talk?.active ? null : best;
    if (!tagged) { tag.hidden = true; return; }
    if (tag.hidden || tag.dataset.who !== tagged.root.uuid) {
      tag.dataset.who = tagged.root.uuid;
      const bakery = tagged.spot.place === 'bakery';
      tag.firstChild.textContent = `${bakery ? '🥖' : '☕'} ${bakery ? (tagged.woman ? 'La boulangère' : 'Le boulanger') : tagged.woman ? 'La serveuse' : 'Le serveur'}`;
      tag.hidden = false;
    }
    head.set(0, 2.05, 0).applyMatrix4(tagged.root.matrixWorld).project(camera);
    if (head.z > 1 || Math.abs(head.x) > 1.1 || Math.abs(head.y) > 1.1) { tag.style.opacity = 0; tag.style.pointerEvents = 'none'; return; }
    tag.style.opacity = ''; tag.style.pointerEvents = '';
    tag.style.left = `${(head.x + 1) / 2 * innerWidth}px`;
    tag.style.top = `${(1 - head.y) / 2 * innerHeight}px`;
  }

  return {
    staff, spots, update, order,
    blocksStep(x, z) {
      for (const one of staff) {
        if (!one.spot) continue;
        const q = one.root.position, d = (x - q.x) ** 2 + (z - q.z) ** 2;
        if (d < 0.5 ** 2 && d < (player.x - q.x) ** 2 + (player.z - q.z) ** 2) return true;
      }
      return false;
    },
  };
}

// Где стоит официант: у двери, на шаг от стены; если там столик или урна — сбоку от террасы
function standSpot(world, s) {
  const tx = s.nz, tz = -s.nx;
  const tries = [[0, 0.85], [0, 1.2], [s.w / 2 + 0.45, 0.8], [-(s.w / 2 + 0.45), 0.8], [0, 0.6], [s.w / 2 + 0.8, 1.2]];
  for (const [along, out] of tries) {
    const x = s.x + s.nx * out + tx * along, z = s.z + s.nz * out + tz * along;
    if (!world.blocked(x, z)) return { x, z, yaw: Math.atan2(s.nx, s.nz), tables: s.tables || [], place: s.kind === 'bakery' ? 'bakery' : 'cafe', name: s.name };
  }
  return null;
}

// Чашка на блюдце (кофе, шоколад или чай), круассан, багет, булочка — из простых фигур
function makeDishes() {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
  const porcelain = mat(0xf4f0ea, { roughness: 0.3 }), pastry = mat(0xd89a4a, { roughness: 0.7 }), crust = mat(0xc88a40, { roughness: 0.75 });
  const drinks = { cafe: mat(0x3a2414, { roughness: 0.2 }), choco: mat(0x6a3a22, { roughness: 0.3 }), the: mat(0xa8642a, { roughness: 0.15 }) };
  const cupG = new THREE.CylinderGeometry(0.042, 0.032, 0.065, 16, 1, true).translate(0, 0.04, 0);
  const baseG = new THREE.CylinderGeometry(0.032, 0.032, 0.008, 16).translate(0, 0.01, 0);
  const saucerG = new THREE.CylinderGeometry(0.075, 0.06, 0.01, 20).translate(0, 0.005, 0);
  const liquidG = new THREE.CircleGeometry(0.039, 16).rotateX(-Math.PI / 2).translate(0, 0.064, 0);
  const handleG = new THREE.TorusGeometry(0.018, 0.005, 6, 10, Math.PI).rotateZ(-Math.PI / 2).translate(0.043, 0.042, 0);
  const croissantG = new THREE.TorusGeometry(0.05, 0.024, 8, 14, Math.PI * 1.25).rotateX(Math.PI / 2).rotateY(Math.PI * 0.12).scale(1, 0.7, 1).translate(0, 0.018, 0);
  const plateG = new THREE.CylinderGeometry(0.1, 0.085, 0.01, 20).translate(0, 0.005, 0);
  const baguetteG = new THREE.CapsuleGeometry(0.03, 0.5, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.03, 0);
  const bunG = new THREE.BoxGeometry(0.11, 0.035, 0.07, 2, 1, 2).translate(0, 0.02, 0);
  const paperG = new THREE.PlaneGeometry(0.16, 0.2).rotateX(-Math.PI / 2).translate(0, 0.003, 0);
  const paper = mat(0xe8dcc0, { roughness: 0.9, side: THREE.DoubleSide });
  const part = (g, m, word) => { const mesh = new THREE.Mesh(g, m); if (word) mesh.userData.word = word; return mesh; };
  const paintRoot = new THREE.Group();
  // все материалы перекрашиваются в живописный свет один раз
  for (const m of [porcelain, pastry, crust, paper, ...Object.values(drinks)]) paintRoot.add(new THREE.Mesh(baseG, m));
  return {
    paintRoot,
    build(main, extra) {
      const set = new THREE.Group();
      if (drinks[main]) {
        const cup = new THREE.Group();
        cup.add(part(saucerG, porcelain, 'cup'), part(cupG, porcelain, 'cup'), part(baseG, porcelain), part(handleG, porcelain, 'cup'), part(liquidG, drinks[main]));
        set.add(cup);
        if (extra === 'croissant') {
          const plate = new THREE.Group();
          plate.add(part(plateG, porcelain), part(croissantG, pastry, 'croissant'));
          plate.position.set(-0.17, 0, -0.04);
          set.add(plate);
        }
      } else {
        // из булочной — на бумаге
        set.add(part(paperG, paper));
        if (main === 'baguette') set.add(part(baguetteG, crust, 'baguette'));
        else if (main === 'croissants') {
          const a = part(croissantG, pastry, 'croissant'), b = part(croissantG, pastry, 'croissant');
          a.position.x = -0.065; b.position.set(0.06, 0, 0.05); b.rotation.y = 2.4;
          set.add(a, b);
        } else set.add(part(bunG, pastry, 'croissant'));
      }
      return set;
    },
  };
}
