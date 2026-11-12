// main.js — сцена, камера от третьего лица, движение героини по настоящему Монмартру
import * as THREE from 'three';
import { loadHeroine, TUNING } from './heroine.js';
import { loadMapData, clearMapCache, toXZ } from './osm.js';
import { buildParis } from './world.js';
import { loadTerrain } from './terrain.js';
import { createControls } from './controls.js';
import { createMinimap } from './minimap.js';
import { loadStreetProps } from './street-props.js';
import { installWordInspector } from './word-inspector.js';
import { createFrenchAudio } from './french-audio.js';
import { createLesson } from './lesson.js';
import { createFallingStars } from './falling-star.js';
import { createCityAudio } from './city-audio.js';
import { loadPasserby, placePasserby, placeCircularPasserby, passerbyBlocksStep } from './passerby.js';
import { createPainter } from './paint/post.js';

const loading = document.getElementById('loading');
const streetEl = document.getElementById('street');
const fail = (e) => { loading.textContent = String(e.message || e); throw e; };

const phone = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 4000);

// Кадр как нарисованный: мазки (фильтр Кувахары), контуры тушью, зерно бумаги (paint/post.js).
// С ?plain — обычный кадр без живописи, для сравнения и для очень слабых устройств.
const plainView = new URLSearchParams(location.search).has('plain');
const originalHero = new URLSearchParams(location.search).has('original-hero');
let painter = plainView ? null : createPainter(renderer, { radius: phone ? 2 : 3, heroStyle: originalHero ? 0 : 1 });
painter?.setSize();
let slowFrames = 0, frames = 0;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  painter?.setSize();
});

const streetProps = loadStreetProps();
// Героиня загружается одновременно с картой и реквизитом, а не после сборки всего города.
const heroineLoad = loadHeroine(scene).then((heroine) => ({ heroine }), (error) => ({ error }));
const terrainLoad = loadTerrain();
const mapData = await loadMapData((t) => { loading.textContent = t; }).catch(fail);
const world = buildParis(scene, renderer, mapData, { terrain: await terrainLoad }, await streetProps);
const controls = createControls(renderer.domElement);
controls.state.camDist = 3.6;
const minimap = createMinimap(document.getElementById('minimap'), mapData);

loading.textContent = 'Bonsoir…';
const loadedHeroine = await heroineLoad;
if (loadedHeroine.error) fail(loadedHeroine.error);
const heroine = loadedHeroine.heroine;
const [sx, sz] = world.freeSpot(0, 6);
heroine.root.position.set(sx, world.heightAt(sx, sz), sz);
const player = heroine.root.position;
const near = (actor, x, z) => actor && Math.hypot(x - actor.position.x, z - actor.position.z) < 0.75;
// Две прохожие гуляют в разных местах: одна у площади Тертр, другая на смотровой площадке перед Сакре-Кёр.
// (Возможно, потом станут альтернативными героинями.)
const [sacreX, sacreZ] = toXZ(48.88672, 2.34306);
let walkingPasserby = null, circularPasserby = null, distantRequested = false;
const passersby = [];
// Героиня чуть реалистичнее мира вокруг: обычный свет вместо живописного и без мазков (только тонкий контур)
heroine.root.traverse((o) => { o.userData.noPaint = true; o.userData.realistic = true; });
world.lightHeroine(heroine.root, { clarity: !originalHero });
world.paint(scene);                 // прохожие и всё остальное — в живописный свет
const blocked = (x, z) => world.blocked(x, z) || passersby.some((actor) => passerbyBlocksStep(actor, player, x, z));
const cityAudio = createCityAudio(world.soundSpots);
const audio = createFrenchAudio({ onActivity: (active) => cityAudio.setDucked(active) });
const lesson = createLesson((key) => inspector.show(key));
const inspector = installWordInspector(renderer.domElement, scene, camera, world.sky.moonDirection, audio, lesson.inspect, lesson.review);
const stars = createFallingStars(scene, camera, world, inspector, lesson.review);
installStarToggle(stars);
loading.remove();
performance.mark('paris-ready');

const debug = new URLSearchParams(location.search).has('debug');
if (debug) addDebugPanel();
window.__game = { heroine, passersby, world, stars, inspector, mapData, camera, controls, renderer, cityAudio, get painted() { return painter !== null; }, get painter() { return painter; } };

// ── Движение ─────────────────────────────────────────────────
const MAX_WALK = 1.45, MAX_RUN = 3.8, MAX_BACK = 0.95; // м/с
let speed = 0, facing = Math.PI, streetTick = 0, lastStreet = '';
const moveDir = new THREE.Vector3(), camTarget = new THREE.Vector3(), want = new THREE.Vector3();
const clock = new THREE.Clock();
camera.position.set(sx, world.heightAt(sx, sz) + 3, sz + 5);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const c = controls.update();

  // Направление относительно камеры
  const yaw = c.camYaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  moveDir.set(rx * c.move.x + fx * c.move.y, 0, rz * c.move.x + fz * c.move.y);
  const input = Math.min(1, moveDir.length());

  // Прыжок и удар
  if (c.jump) { heroine.play('jump'); c.jump = false; }
  if (c.punch) { heroine.play('punch'); c.punch = false; }
  const punching = heroine.busy === 'punch';

  // «Назад» без бега — шаг назад, не поворачиваясь спиной
  const backstep = !c.run && c.move.y < -0.5 && Math.abs(c.move.x) < 0.4;
  let target = input < 0.05 ? 0 : (c.run ? MAX_RUN : MAX_WALK * Math.max(input, 0.6));
  if (backstep) target = -MAX_BACK;
  if (punching) target = 0;
  speed += (target - speed) * (1 - Math.exp(-dt * 6));

  const p = heroine.root.position;
  if (input > 0.05 && !punching) {
    if (backstep) moveDir.set(fx, 0, fz); else moveDir.normalize();
    let d = Math.atan2(moveDir.x, moveDir.z) - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    facing += d * (1 - Math.exp(-dt * 10));
  }
  heroine.root.rotation.y = facing;

  // Шаг со скольжением вдоль стен
  const stepX = Math.sin(facing) * speed * dt, stepZ = Math.cos(facing) * speed * dt;
  if (!blocked(p.x + stepX, p.z + stepZ)) { p.x += stepX; p.z += stepZ; }
  else if (!blocked(p.x + stepX, p.z)) { p.x += stepX; speed *= 0.9; }
  else if (!blocked(p.x, p.z + stepZ)) { p.z += stepZ; speed *= 0.9; }
  else speed *= 0.5;

  p.y = world.heightAt(p.x, p.z);
  heroine.setState(speed < -0.2 ? 'back' : speed < 0.25 ? 'idle' : speed > (MAX_WALK + MAX_RUN) / 2 ? 'run' : 'walk');
  heroine.update(dt, speed);

  // Камера сзади-сверху; если между ней и героиней стена — придвигаем
  camTarget.set(p.x, p.y + 1.4, p.z);
  const cp = Math.cos(c.camPitch), sp = Math.sin(c.camPitch);
  let dist = c.camDist;
  for (let i = 1; i <= 8; i++) {
    const t = (i / 8) * c.camDist;
    if (world.inside(p.x + Math.sin(yaw) * cp * t, p.z + Math.cos(yaw) * cp * t)) { dist = Math.max(0.6, t - c.camDist / 8 - 0.25); break; }
  }
  want.set(p.x + Math.sin(yaw) * cp * dist, 0, p.z + Math.cos(yaw) * cp * dist);
  want.y = Math.max(world.heightAt(want.x, want.z) + 0.45, p.y + 1.4 + sp * dist);   // камера не уходит под склон
  camera.position.lerp(want, 1 - Math.exp(-dt * 10));
  camera.lookAt(camTarget);

  world.update(dt, p.x, p.z, camera);
  if (!distantRequested && Math.hypot(p.x - sacreX, p.z - sacreZ - 60) < 100) {
    distantRequested = true;
    afterFrame(() => addPasserby(true));
  }
  for (const actor of passersby) actor.update(dt);
  stars.update(dt, p.x, p.z, facing);
  cityAudio.update(dt, p.x, p.z, yaw, heroine.busy !== 'jump');

  // Название улицы
  streetTick -= dt;
  if (streetTick <= 0) {
    streetTick = 0.4;
    const s = world.streetAt(p.x, p.z);
    if (s !== lastStreet) { lastStreet = s; streetEl.textContent = s; streetEl.style.opacity = s ? 1 : 0; }
  }

  minimap.update(p.x, p.z, facing, yaw);
  if (minimap.bigOpen) minimap.drawBig(p.x, p.z, facing);

  // Если кадры идут медленно — мазки мельче, потом кадр в меньшем разрешении
  if (painter && ++frames > 60) {
    if (dt > 1 / 26) slowFrames++;
    if (frames > 240) {
      if (slowFrames > 110) {
        if (painter.radius > 1) painter.setRadius(painter.radius - 1);
        else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); painter.setSize(); }
        else painter.setScale(0.75);
      }
      frames = 60;
      slowFrames = 0;
    }
  }
  if (painter) painter.render(scene, camera); else renderer.render(scene, camera);
});

// 38 МБ второстепенных моделей не задерживают вход. Дальняя прохожая нужна только у базилики.
function afterFrame(task) {
  requestAnimationFrame(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(task, { timeout: 2000 });
    else setTimeout(task, 0);
  });
}
async function addPasserby(distant) {
  const asset = await loadPasserby(distant ? 'athletic-walk-in-circle.glb' : 'sporty-walking.glb', distant ? 'Walk In Circle' : 'Walking');
  if (!asset) return;
  const actor = distant
    ? placeCircularPasserby(scene, asset, world, player, (x, z) => near(walkingPasserby, x, z), [sacreX, sacreZ + 60])
    : placePasserby(scene, asset, world, player, (x, z) => near(circularPasserby, x, z), [-6, -4]);
  if (!actor) return;
  if (distant) circularPasserby = actor; else walkingPasserby = actor;
  world.paint(asset.model);
  asset.model.traverse((o) => { if (o.userData.word) inspector.addTarget(o); });
  passersby.push(actor);
}
afterFrame(() => addPasserby(false));

// Галочка «Падающие звёзды»: выбор запоминается в браузере
function installStarToggle(stars) {
  const box = document.querySelector('#star-toggle input');
  const KEY = 'nuit-a-paris:stars-on';
  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch { /* нет доступа к хранилищу */ }
  box.checked = on; stars.setEnabled(on);
  box.addEventListener('change', () => {
    stars.setEnabled(box.checked);
    try { localStorage.setItem(KEY, box.checked ? '1' : '0'); } catch { /* не страшно */ }
    box.blur();
  });
}

// ── Отладка (открой игру с ?debug) ──────────────────────────────
async function addDebugPanel() {
  const { default: GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm');
  const gui = new GUI({ title: 'Отладка' });
  gui.close();
  const atmosphere = gui.addFolder('Ночное небо');
  atmosphere.add(world.sky.uniforms.uCloudOpacity, 'value', 0, 1, 0.01).name('плотность облаков');
  atmosphere.add(world.sky.uniforms.uStarIntensity, 'value', 0, 1, 0.01).name('яркость звёзд');
  atmosphere.add(world.look.uFogDensity, 'value', 0, 0.02, 0.0001).name('дальняя дымка');
  atmosphere.add(world.look.uWindowsOn, 'value', 0, 1, 0.01).name('горящие окна');
  if (painter) {
    const art = gui.addFolder('Живопись');
    art.add(painter.uniforms.uPaint, 'value', 0, 1, 1).name('мазки');
    art.add(painter.uniforms.uEdges, 'value', 0, 1, 0.05).name('контуры');
    art.add(painter.uniforms.uLine, 'value', 0.5, 3, 0.05).name('толщина линии');
    art.add(painter.uniforms.uHeroLine, 'value', 0.3, 1.2, 0.05).name('контур героини');
  }
  const arms = gui.addFolder('Руки к телу (°)');
  for (const k of ['idle', 'walk', 'run']) arms.add(TUNING.armIn, k, -20, 30, 0.5);
  arms.add(TUNING, 'armSign', [1, -1]).name('направление');
  const legs = gui.addFolder('Ноги врозь (°)');
  for (const k of ['idle', 'walk', 'run']) legs.add(TUNING.legOut, k, -10, 15, 0.5);
  legs.add(TUNING, 'legSign', [1, -1]).name('направление');
  gui.add(TUNING, 'walkSpeed', 0.6, 2.5, 0.05).name('темп шага');
  gui.add(TUNING, 'runSpeed', 2, 6, 0.05).name('темп бега');
  gui.add(TUNING, 'backSpeed', 0.4, 2, 0.05).name('темп шага назад');
  gui.add({ copy: () => navigator.clipboard?.writeText(JSON.stringify(TUNING)) }, 'copy').name('скопировать настройки');
  gui.add({ save: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(mapData)], { type: 'application/json' }));
    a.download = 'montmartre.json'; a.click();
  } }, 'save').name('сохранить карту в файл');
  gui.add({ reload: () => { clearMapCache(); location.reload(); } }, 'reload').name('перекачать карту');
}
