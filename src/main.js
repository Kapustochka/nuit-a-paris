// main.js — сцена, камера от третьего лица, движение героини по настоящему Монмартру
import * as THREE from 'three';
import { loadHeroine, TUNING } from './heroine.js';
import { loadMapData, clearMapCache } from './osm.js';
import { buildParis } from './world.js';
import { loadTerrain } from './terrain.js';
import { createControls } from './controls.js';
import { createMinimap } from './minimap.js';
import { loadStreetProps } from './street-props.js';
import { installWordInspector } from './word-inspector.js';
import { createFrenchAudio } from './french-audio.js';
import { createLesson } from './lesson.js';
import { createFallingStars } from './falling-star.js';
import { loadPasserby, placePasserby, placeCircularPasserby, passerbyBlocksStep } from './passerby.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const loading = document.getElementById('loading');
const streetEl = document.getElementById('street');
const fail = (e) => { loading.textContent = String(e.message || e); throw e; };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 4000);

// Цветокоррекция ночи (до тонмаппинга): тени уходят в синеву, свет фонарей теплее, края кадра темнее
const NIGHT_GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 cool = vec3(0.86, 0.92, 1.12), warm = vec3(1.08, 0.98, 0.86);
      c.rgb *= mix(cool, warm, smoothstep(0.05, 0.6, l));
      c.rgb = mix(vec3(l), c.rgb, 1.08);                                  // чуть сочнее
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - smoothstep(0.35, 0.95, length(d * vec2(1.1, 1.0))) * 0.55;
      gl_FragColor = c;
    }`,
};

// Мягкое свечение фонарей и окон (bloom). На слабом телефоне отключается само.
const noBloom = new URLSearchParams(location.search).has('nobloom');
let composer = null;
if (!noBloom) {
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, {
    type: THREE.HalfFloatType,
    samples: Math.min(2, renderer.capabilities.maxSamples),
  });
  composer = new EffectComposer(renderer, target);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.36, 0.6, 0.82));
  composer.addPass(new ShaderPass(NIGHT_GRADE));
  composer.addPass(new OutputPass());
}
let slowFrames = 0, frames = 0;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

const streetProps = loadStreetProps();
const passerbyAssets = Promise.all([
  loadPasserby('sporty-walking.glb', 'Walking'),
  loadPasserby('athletic-walk-in-circle.glb', 'Walk In Circle'),
]);
const terrainLoad = loadTerrain();
const mapData = await loadMapData((t) => { loading.textContent = t; }).catch(fail);
// Нарисованные фасады домов и Сакре-Кёр (запечены из моделей Meshy)
const tl = new THREE.TextureLoader();
const cityTex = async (url) => { const t = await tl.loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const [facadeTex, groundTex, facadeMeta, sacreTex, sacre] = await Promise.all([
  cityTex('assets/city/facades.webp'), cityTex('assets/city/facades_ground.webp'), fetch('assets/city/facades.json').then((r) => r.json()),
  cityTex('assets/city/sacre.webp'), fetch('assets/city/sacre.json').then((r) => r.json()),
]).catch(fail);
const world = buildParis(scene, renderer, mapData, {
  facadeTex, groundTex, facades: facadeMeta.facades, split: facadeMeta.split, sacreTex, sacre, terrain: await terrainLoad,
}, await streetProps);
const controls = createControls(renderer.domElement);
controls.state.camDist = 3.6;
const minimap = createMinimap(document.getElementById('minimap'), mapData);

loading.textContent = 'Bonsoir…';
const heroine = await loadHeroine(scene).catch(fail);
const [sx, sz] = world.freeSpot(0, 6);
heroine.root.position.set(sx, world.heightAt(sx, sz), sz);
const [walkingAsset, circleAsset] = await passerbyAssets;
const player = heroine.root.position;
const near = (actor, x, z) => actor && Math.hypot(x - actor.position.x, z - actor.position.z) < 0.75;
const walkingPasserby = placePasserby(scene, walkingAsset, world, player, (x, z) => near(circularPasserby, x, z));
const circularPasserby = placeCircularPasserby(scene, circleAsset, world, player, (x, z) => near(walkingPasserby, x, z));
const passersby = [walkingPasserby, circularPasserby].filter(Boolean);
const blocked = (x, z) => world.blocked(x, z) || passersby.some((actor) => passerbyBlocksStep(actor, player, x, z));
const audio = createFrenchAudio();
const lesson = createLesson(world.bakery, heroine.root.position, audio, minimap, (key) => inspector.show(key));
const inspector = installWordInspector(renderer.domElement, scene, camera, world.sky.moonDirection, audio, lesson.inspect);
const stars = createFallingStars(scene, camera, world, inspector);
loading.remove();

const debug = new URLSearchParams(location.search).has('debug');
if (debug) addDebugPanel();
window.__game = { heroine, world, stars, mapData, camera, controls, renderer, get bloom() { return composer !== null; } };

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
  for (const actor of passersby) actor.update(dt);
  stars.update(dt, p.x, p.z, facing);

  // Название улицы
  streetTick -= dt;
  if (streetTick <= 0) {
    streetTick = 0.4;
    const s = world.streetAt(p.x, p.z);
    lesson.update();
    if (s !== lastStreet) { lastStreet = s; streetEl.textContent = s; streetEl.style.opacity = s ? 1 : 0; }
  }

  minimap.update(p.x, p.z, facing, yaw);
  if (minimap.bigOpen) minimap.drawBig(p.x, p.z, facing);

  // Если кадры идут медленно — выключаем свечение и снижаем чёткость
  if (composer && ++frames > 60) {
    if (dt > 1 / 26) slowFrames++;
    if (frames > 240) {
      if (slowFrames > 110) {
        for (const pass of composer.passes) pass.dispose();
        composer.dispose();
        composer = null;
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
      }
      frames = 60;
      slowFrames = 0;
    }
  }
  if (composer) composer.render(dt); else renderer.render(scene, camera);
});

// ── Отладка (открой игру с ?debug) ──────────────────────────────
async function addDebugPanel() {
  const { default: GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm');
  const gui = new GUI({ title: 'Отладка' });
  gui.close();
  const atmosphere = gui.addFolder('Ночное небо');
  atmosphere.add(world.sky.uniforms.uCloudOpacity, 'value', 0, 1, 0.01).name('плотность облаков');
  atmosphere.add(world.sky.uniforms.uStarIntensity, 'value', 0, 1, 0.01).name('яркость звёзд');
  atmosphere.add(scene.fog, 'density', 0, 0.02, 0.0001).name('дальняя дымка');
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
