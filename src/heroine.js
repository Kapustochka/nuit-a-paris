// heroine.js — героиня с ригом и анимациями Mixamo:
// стойка, ходьба, бег, шаг назад, прыжок, удары. Цвета берём из исходной модели Meshy.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = 'assets/mixamo/';
const LOOPS = { idle: 'idle.fbx', walk: 'walk.fbx', run: 'run.fbx', back: 'walk_back.fbx' };   // повторяются по кругу
const ONCE = { jump: 'jump.fbx', punch: 'punch.fbx' };                                          // проигрываются один раз
export const EMOTES = { dance: 1, rumba: 1 };   // dances: only in a GLB heroine, played once, stopped by moving

const BONES = {
  leftArm: 'mixamorigLeftArm', rightArm: 'mixamorigRightArm',
  leftUpLeg: 'mixamorigLeftUpLeg', rightUpLeg: 'mixamorigRightUpLeg',
};

// Настройки «на глаз». Ползунки: открой игру с ?debug в адресе.
export const TUNING = {
  armIn: { idle: 0, walk: 0, run: 0 },     // прижать руки к телу, градусы (у Mixamo пока не нужно)
  armSign: 1,
  legOut: { idle: 0, walk: 0, run: 0 },    // развести ноги, градусы
  legSign: 1,
  fade: 0.22,                              // плавность смены анимаций, секунды
  walkSpeed: 1.45,                         // скорость (м/с), при которой шаги не скользят
  runSpeed: 3.8,
  backSpeed: 0.95,
};

export async function loadHeroine(scene, height = 1.65, glbUrl = null) {
  const names = { ...LOOPS, ...ONCE };
  const { model, mesh, clips } = glbUrl ? await loadGlb(glbUrl) : await loadMixamo(names);
  mesh.castShadow = true; mesh.frustumCulled = false;

  // Animations play in place: the hips' horizontal travel is removed in world space (the hips' parent
  // may be rotated, so stripping local x/z is not enough). For one-shot moves (a jump forward) the
  // removed travel is kept as a curve, and the game moves the heroine herself along it.
  const mixer = new THREE.AnimationMixer(model);
  const actions = {}, rootMotion = {};
  const hips = findHips(model);
  model.updateMatrixWorld(true);
  const keys = glbUrl ? [...Object.keys(names), ...Object.keys(EMOTES)] : Object.keys(names);
  keys.forEach((key) => {
    const clip = clips[key];
    if (!clip) { if (!glbUrl && names[key]) console.warn('Нет анимации в', names[key]); return; }
    clip.name = key;
    const curve = hips && inPlace(clip, hips);
    const a = mixer.clipAction(clip);
    if (ONCE[key] || EMOTES[key]) {
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
      if (curve && glbUrl) rootMotion[key] = curve;   // the Paris jump is already in place
    }
    actions[key] = a;
  });

  // Рост в метрах и ступни на полу — меряем по стойке
  const root = new THREE.Group();
  root.add(model);
  actions.idle.play(); mixer.update(0);
  model.updateMatrixWorld(true);
  mesh.skeleton.update();
  mesh.computeBoundingBox();
  const box = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  const s = height / (box.max.y - box.min.y);
  model.scale.multiplyScalar(s);
  model.position.y -= box.min.y * s;
  scene.add(root);
  for (const c of Object.values(rootMotion)) for (let i = 0; i < c.z.length; i++) c.z[i] *= s;
  let lastFwd = 0;

  const bones = {};
  for (const [k, n] of Object.entries(BONES)) bones[k] = model.getObjectByName(n);

  let current = 'idle', once = null;
  let armIn = 0, legOut = 0;
  const deg = THREE.MathUtils.degToRad;

  function setState(state) {
    if (state === current || !actions[state]) return;
    const next = actions[state];
    if (once) { current = state; return; }            // вернёмся к ней после прыжка/удара
    next.reset().setEffectiveWeight(1).play();
    actions[current].crossFadeTo(next, TUNING.fade, false);
    current = state;
  }

  // Прыжок или удар: проигрывается один раз, потом возвращаемся к ходьбе/стойке
  function play(name) {
    if (once || !actions[name]) return false;
    once = name; lastFwd = 0;
    const a = actions[name];
    a.reset().setEffectiveWeight(1).play();
    actions[current].crossFadeTo(a, 0.12, false);
    return true;
  }
  mixer.addEventListener('finished', (e) => {
    if (!once || e.action !== actions[once]) return;
    const back = actions[current];
    back.reset().setEffectiveWeight(1).play();
    e.action.crossFadeTo(back, 0.2, false);
    once = null;
  });

  // Stop a dance (or any one-shot move) right away, e.g. when the player starts walking
  function stop() {
    if (!once) return;
    const a = actions[once], back = actions[current];
    back.reset().setEffectiveWeight(1).play();
    a.crossFadeTo(back, 0.2, false);
    once = null;
  }

  // How far forward (metres) the current one-shot move travelled since the last call
  function rootStep() {
    const c = once && rootMotion[once];
    if (!c) return 0;
    const t = actions[once].time, f = sample(c, t), d = f - lastFwd;
    lastFwd = f;
    return d;
  }

  function update(dt, speed = 0) {
    const sp = Math.abs(speed);
    if (actions.walk) actions.walk.timeScale = THREE.MathUtils.clamp(sp / TUNING.walkSpeed, 0.6, 1.5);
    if (actions.run) actions.run.timeScale = THREE.MathUtils.clamp(sp / TUNING.runSpeed, 0.7, 1.4);
    if (actions.back) actions.back.timeScale = THREE.MathUtils.clamp(sp / TUNING.backSpeed, 0.6, 1.5);
    mixer.update(dt);

    const key = current === 'back' ? 'walk' : current;
    const k = 1 - Math.exp(-dt / (TUNING.fade / 3));
    armIn += ((once ? 0 : TUNING.armIn[key] || 0) - armIn) * k;
    legOut += ((once ? 0 : TUNING.legOut[key] || 0) - legOut) * k;
    const a = TUNING.armSign * deg(armIn), l = TUNING.legSign * deg(legOut);
    if (a) { bones.leftArm.rotation.z -= a; bones.rightArm.rotation.z += a; }
    if (l) { bones.leftUpLeg.rotation.z -= l; bones.rightUpLeg.rotation.z += l; }
  }

  return { root, model, mesh, mixer, actions, setState, play, stop, rootStep, update, get state() { return current; }, get busy() { return once; } };
}

// Героиня Paris: модель и анимации Mixamo в FBX, развёртку текстуры возвращаем из исходной модели Meshy
async function loadMixamo(names) {
  const fbx = new FBXLoader();
  const tl = new THREE.TextureLoader();
  const loadTex = async (name, srgb) => {
    const t = await tl.loadAsync(DIR + name);
    t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const [model, uvBuf, color, normal, mr, ...animFiles] = await Promise.all([
    fbx.loadAsync(DIR + 'base.fbx'),
    fetch(DIR + 'heroine_uv.bin').then((r) => { if (!r.ok) throw new Error('нет heroine_uv.bin'); return r.arrayBuffer(); }),
    loadTex('heroine_color.jpg', true), loadTex('heroine_normal.jpg'), loadTex('heroine_mr.jpg'),
    ...Object.values(names).map((f) => fbx.loadAsync(DIR + f)),
  ]);

  // Меш и развёртка текстуры (Mixamo её не сохранил — возвращаем из исходной модели)
  let mesh = null;
  model.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error('В base.fbx нет модели со скелетом');
  const dv = new DataView(uvBuf), nPV = dv.getUint32(0, true), nCP = dv.getUint32(4, true);
  const idx = new Uint16Array(uvBuf, 8, nPV), uvs = new Uint16Array(uvBuf, 8 + (nPV + (nPV % 2)) * 2, nCP * 2);
  const count = mesh.geometry.attributes.position.count;
  if (count !== nPV) console.warn(`Развёртка: вершин ${count}, ожидалось ${nPV} — цвета могут лечь неверно`);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < Math.min(count, nPV); i++) { uv[i * 2] = uvs[idx[i] * 2] / 65535; uv[i * 2 + 1] = uvs[idx[i] * 2 + 1] / 65535; }
  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.material = new THREE.MeshStandardMaterial({
    map: color, normalMap: normal, normalScale: new THREE.Vector2(1, -1),
    roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: 1, side: THREE.DoubleSide,
  });
  const clips = {};
  Object.keys(names).forEach((key, i) => { clips[key] = animFiles[i].animations[0]; });
  return { model, mesh, clips };
}

// Героиня одним GLB (London): текстуры и анимации внутри файла. Каких клипов нет — заменяем похожими:
// бег — та же ходьба быстрее, шаг назад — ходьба медленнее; без прыжка и удара она просто не прыгает.
async function loadGlb(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  let mesh = null;
  model.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error('В ' + url + ' нет модели со скелетом');
  model.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; if (o.material.map) o.material.map.anisotropy = 4; } });
  const byName = Object.fromEntries(gltf.animations.map((c) => [c.name.toLowerCase(), c]));
  const walk = byName.walk || byName.walking;
  const clips = {
    dance: byName.dance, rumba: byName.rumba,
    idle: byName.idle || gltf.animations[0], walk,
    run: byName.run || walk?.clone(), back: byName.walk_back || byName.back || walk?.clone(),
    jump: byName.jump, punch: byName.punch,
  };
  return { model, mesh, clips };
}

function findHips(model) {
  let h = null;
  model.traverse((o) => { if (!h && o.isBone && /Hips$/.test(o.name)) h = o; });
  return h;
}

// Keep the hips at their first-frame horizontal place (in the model's space), keep the vertical motion.
// Returns the removed forward travel (model +z) as { t, z } for root motion.
function inPlace(clip, hips) {
  const track = clip.tracks.find((t) => t.name === hips.name + '.position');
  if (!track) return null;
  const m = hips.parent.matrixWorld, inv = m.clone().invert();
  const v = track.values, w = new THREE.Vector3(), w0 = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(m);
  const z = new Float32Array(track.times.length);
  for (let i = 0; i < track.times.length; i++) {
    w.set(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]).applyMatrix4(m);
    z[i] = w.z - w0.z;
    w.x = w0.x; w.z = w0.z;
    w.applyMatrix4(inv);
    v[i * 3] = w.x; v[i * 3 + 1] = w.y; v[i * 3 + 2] = w.z;
  }
  return { t: track.times, z };
}

function sample(c, t) {
  const { t: ts, z } = c;
  if (t <= ts[0]) return z[0];
  for (let i = 1; i < ts.length; i++) if (t <= ts[i]) return z[i - 1] + (z[i] - z[i - 1]) * (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
  return z[z.length - 1];
}
