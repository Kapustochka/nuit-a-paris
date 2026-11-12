// falling-star.js — падающая звезда со случайным французским словом, фразой или историей.
// Примерно каждые десять шагов звезда падает перед героиней и ждёт двойного нажатия.
// Пока её не открыли, новая не появляется; если звезда пропала из виду, может упасть следующая.
import * as THREE from 'three';
import { starKeys } from './entries.js';

const STEPS_BETWEEN = 7.5;   // метров пути между звёздами: около десяти шагов
const FIRST_AFTER = 3;       // первая звезда падает почти сразу, чтобы её заметили
const LOST_AFTER = 3;        // секунд вне кадра, после которых звезда считается потерянной
const LOST_DISTANCE = 30;    // дальше этого расстояния звезду уже не разглядеть
const FALL_TIME = 1.7, HOVER = 0.55;
const KIND_ODDS = [['word', 0.62], ['phrase', 0.2], ['story', 0.12], ['song', 0.06]];   // фиолетовые — редкие
// Для отладки: ?star=song (или word, phrase, story) — падают звёзды только этого вида.
const FORCED_KIND = new URLSearchParams(location.search).get('star');
const seenKey = 'nuit-a-paris:stars:v1';

export function createFallingStars(scene, camera, world, inspector) {
  const seen = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(seenKey) || '[]');
    if (Array.isArray(saved)) saved.forEach((key) => seen.add(key));
  } catch { /* браузер может запретить хранение */ }

  // Звезда: яркая пятиконечная фигурка, мягкий ореол и невидимая сфера, по которой удобно попадать.
  const outline = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? 0.105 : 0.25, angle = i / 10 * Math.PI * 2 + Math.PI / 2;
    outline[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.025, bevelSegments: 2 });
  geometry.center();
  // Цвет звезды говорит, что внутри: жёлтая — слово, салатовая — фраза, голубая — история, фиолетовая (редкая) — песенка.
  // Как в рисованном мире вокруг: пастельное тело, обводка тушью и мягкий ореол.
  const PALETTES = {
    gold: { body: new THREE.Color(1.75, 1.18, 0.42), glow: new THREE.Color(0xffc468) },
    blue: { body: new THREE.Color(0.62, 0.92, 2.0), glow: new THREE.Color(0x8ab8ff) },
    green: { body: new THREE.Color(0.95, 1.9, 0.5), glow: new THREE.Color(0xb6f27a) },
    violet: { body: new THREE.Color(1.45, 0.72, 2.1), glow: new THREE.Color(0xc79bff) },
  };
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: PALETTES.gold.body.clone(), fog: false, transparent: true });
  const inkMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1440, side: THREE.BackSide, fog: false, transparent: true });
  const glowTexture = makeGlow();
  const glowMaterial = (opacity) => new THREE.SpriteMaterial({ map: glowTexture, color: 0xffc468, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

  const group = new THREE.Group();
  group.visible = false;
  const body = new THREE.Mesh(geometry, bodyMaterial);
  const ink = new THREE.Mesh(geometry, inkMaterial);
  ink.scale.set(1.22, 1.22, 1.6);
  body.add(ink);
  const halo = new THREE.Sprite(glowMaterial(0.85));
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  group.add(body, halo, hit);
  const tail = Array.from({ length: 9 }, () => new THREE.Sprite(glowMaterial(0)));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xffc56b, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.visible = false;
  scene.add(group, ground, ...tail);
  tail.forEach((sprite) => { sprite.visible = false; });

  const frustum = new THREE.Frustum(), view = new THREE.Matrix4();
  const from = new THREE.Vector3(), to = new THREE.Vector3(), probe = new THREE.Sphere(new THREE.Vector3(), 0.3);
  let state = 'none';        // none → falling → resting → opened → none
  let key = null, time = 0, walked = STEPS_BETWEEN - FIRST_AFTER, unseen = 0, lost = false;
  let lastX = null, lastZ = null, enabled = true;
  const kindOf = (k) => Object.keys(starKeys).find((kind) => starKeys[kind].includes(k)) || 'word';
  function tint(name) {
    const p = PALETTES[name];
    bodyMaterial.color.copy(p.body);
    for (const m of [halo.material, ground.material, ...tail.map((t) => t.material)]) m.color.copy(p.glow);
  }

  hit.userData.onInspect = (x, y) => {
    if (state !== 'resting' && state !== 'falling') return;
    seen.add(key);
    try { localStorage.setItem(seenKey, JSON.stringify([...seen])); } catch { /* нет доступа к записи */ }
    inspector.show(key, x, y, hit);
    state = 'opened';
    time = 0;
    walked = 0;
    inspector.removeTarget(hit);
  };

  function pick() {
    const fresh = (kind) => starKeys[kind].filter((candidate) => !seen.has(candidate));
    if (!Object.keys(starKeys).some((kind) => fresh(kind).length)) seen.clear();
    let roll = Math.random(), kind = 'word';
    for (const [name, odds] of KIND_ODDS) { if (roll < odds) { kind = name; break; } roll -= odds; }
    if (starKeys[FORCED_KIND]) kind = FORCED_KIND;
    let pool = fresh(kind);
    if (!pool.length && starKeys[FORCED_KIND]) pool = starKeys[kind];
    if (!pool.length) pool = Object.keys(starKeys).flatMap(fresh);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Свободное место перед героиней, до которого можно дойти по прямой.
  function landing(px, pz, facing) {
    // Чуть сбоку, иначе героиня заслонит звезду от камеры.
    const side = Math.random() < 0.5 ? 1 : -1;
    for (const distance of [3.4, 2.6, 4.8, 1.8]) for (const turn of [0.36 * side, -0.36 * side, 0.8 * side, -0.8 * side, 0]) {
      const dx = Math.sin(facing + turn), dz = Math.cos(facing + turn);
      const x = px + dx * distance, z = pz + dz * distance;
      let free = !world.blocked(x, z);
      for (let t = 0.25; free && t < 1; t += 0.25) free = !world.inside(px + dx * distance * t, pz + dz * distance * t);
      if (free) return [x, z];
    }
    return null;
  }

  function drop(px, pz, facing) {
    const spot = landing(px, pz, facing);
    if (!spot) return false;
    if (state !== 'none') inspector.removeTarget(hit);
    key = pick();
    tint({ story: 'blue', phrase: 'green', song: 'violet' }[kindOf(key)] || 'gold');
    const groundY = world.heightAt?.(spot[0], spot[1]) ?? 0;
    to.set(spot[0], groundY + HOVER, spot[1]);
    // Летит издалека навстречу героине: так весь след виден в небе над улицей.
    const side = (Math.random() < 0.5 ? 1 : -1) * (4 + Math.random() * 8);
    from.set(to.x + Math.cos(facing) * side + Math.sin(facing) * 55, groundY + 25, to.z - Math.sin(facing) * side + Math.cos(facing) * 55);
    group.position.copy(from);
    group.scale.setScalar(1);
    group.visible = true;
    bodyMaterial.opacity = inkMaterial.opacity = 1;
    halo.material.opacity = 0.85;
    ground.position.set(to.x, groundY + 0.03, to.z);
    ground.visible = true;
    ground.material.opacity = 0;
    inspector.addTarget(hit);
    state = 'falling';
    time = 0; walked = 0; unseen = 0; lost = false;
    chime();
    return true;
  }

  function hide() {
    group.visible = false;
    ground.visible = false;
    tail.forEach((sprite) => { sprite.visible = false; });
    state = 'none';
  }

  function update(dt, px, pz, facing) {
    if (!enabled) { lastX = px; lastZ = pz; return; }
    if (lastX !== null) walked += Math.min(1, Math.hypot(px - lastX, pz - lastZ));
    lastX = px; lastZ = pz;
    time += dt;

    if (state === 'falling') {
      const k = Math.min(1, time / FALL_TIME), eased = k ** 1.5;
      group.position.lerpVectors(from, to, eased);
      tail.forEach((sprite, index) => {
        const behind = Math.max(0, eased - (index + 1) * 0.02 * (1.15 - k));
        sprite.position.lerpVectors(from, to, behind);
        sprite.visible = k < 1;
        sprite.material.opacity = 0.55 * (1 - index / tail.length) * (1 - k * k);
        sprite.scale.setScalar((0.9 - index * 0.07) * (1 + (1 - eased) * 3));
      });
      halo.scale.setScalar(1.9 + (1 - eased) * 5);
      body.rotation.z = time * 9;
      ground.material.opacity = 0.35 * eased;
      ground.scale.setScalar(0.4 + eased);
      if (k >= 1) { state = 'resting'; time = 0; }
    } else if (state === 'resting') {
      const settle = Math.exp(-time * 3.2);
      group.position.y = to.y + Math.sin(time * 2.1) * 0.07 + Math.abs(Math.sin(time * 9)) * 0.45 * settle;
      // Покачивается лицом к камере, чтобы не поворачиваться ребром.
      body.rotation.set(0, Math.atan2(camera.position.x - to.x, camera.position.z - to.z) + Math.sin(time * 1.5) * 0.75, Math.sin(time * 1.3) * 0.12);
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.3);
      halo.scale.setScalar(1.7 + pulse * 0.45 + settle * 2.2);
      halo.material.opacity = 0.7 + pulse * 0.2;
      ground.material.opacity = 0.3 + pulse * 0.12 + settle * 0.4;
      ground.scale.setScalar(1.25 + pulse * 0.15 + settle);

      // Потерялась из виду: ушла из кадра или осталась далеко позади.
      view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(view);
      probe.center.copy(group.position);
      const far = Math.hypot(px - to.x, pz - to.z) > LOST_DISTANCE;
      unseen = far || !frustum.intersectsSphere(probe) ? unseen + dt : 0;
      if (unseen === 0) lost = false; else if (unseen > LOST_AFTER) lost = true;
      if (!lost) walked = 0;
    } else if (state === 'opened') {
      const k = Math.min(1, time / 0.45);
      group.scale.setScalar(1 + k * 1.6);
      group.position.y += dt * 1.8;
      bodyMaterial.opacity = inkMaterial.opacity = 1 - k;
      halo.material.opacity = 0.9 * (1 - k);
      ground.material.opacity = 0.4 * (1 - k);
      if (k >= 1) hide();
    }

    if (walked >= STEPS_BETWEEN && (state === 'none' || (state === 'resting' && lost))) {
      if (!drop(px, pz, facing)) walked = STEPS_BETWEEN - 1;   // нет места: пробуем ещё через шаг
    }
  }

  // Звёзды можно выключить: тогда новая не падает, а текущая тихо исчезает
  function setEnabled(on) {
    enabled = on;
    if (!on && state !== 'none') {
      if (state !== 'opened') inspector.removeTarget(hit);
      hide();
    }
    if (on) walked = Math.max(walked, STEPS_BETWEEN - FIRST_AFTER);
  }

  return {
    update, setEnabled,
    get enabled() { return enabled; },
    get state() { return state; },
    get key() { return key; },
    get position() { return group.position; },
  };
}

function makeGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,236,180,.75)');
  gradient.addColorStop(0.5, 'rgba(255,200,110,.22)');
  gradient.addColorStop(1, 'rgba(255,180,80,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Тихий перезвон, когда звезда падает. До первого нажатия браузер может не дать звук — тогда молчим.
let tones = null;
function chime() {
  try {
    tones ||= new (window.AudioContext || window.webkitAudioContext)();
    if (tones.state === 'suspended') tones.resume().catch(() => {});
    if (tones.state !== 'running') return;
    const now = tones.currentTime;
    [1568, 1175, 1976].forEach((pitch, index) => {
      const start = now + index * 0.13;
      const tone = tones.createOscillator(), volume = tones.createGain();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(pitch, start);
      volume.gain.setValueAtTime(0, start);
      volume.gain.linearRampToValueAtTime(0.05, start + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0004, start + 0.7);
      tone.connect(volume).connect(tones.destination);
      tone.start(start);
      tone.stop(start + 0.75);
    });
  } catch { /* звук необязателен */ }
}
