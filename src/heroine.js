// heroine.js — героиня с ригом и анимациями Mixamo:
// стойка, ходьба, бег, шаг назад, прыжок, удары. Цвета берём из исходной модели Meshy.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const DIR = 'assets/mixamo/';
const LOOPS = { idle: 'idle.fbx', walk: 'walk.fbx', run: 'run.fbx', back: 'walk_back.fbx' };   // повторяются по кругу
const ONCE = { jump: 'jump.fbx', punch: 'punch.fbx' };                                          // проигрываются один раз

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

export async function loadHeroine(scene, height = 1.65) {
  const fbx = new FBXLoader();
  const tl = new THREE.TextureLoader();
  const loadTex = async (name, srgb) => {
    const t = await tl.loadAsync(DIR + name);
    t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const names = { ...LOOPS, ...ONCE };
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
  mesh.castShadow = true; mesh.frustumCulled = false;

  // Анимации: убираем «уезжание» вперёд — двигаем героиню сами
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  Object.keys(names).forEach((key, i) => {
    const clip = animFiles[i].animations[0];
    if (!clip) { console.warn('Нет анимации в', names[key]); return; }
    clip.name = key;
    for (const t of clip.tracks) {
      if (/Hips\.position$/.test(t.name)) for (let k = 0; k < t.values.length; k += 3) { t.values[k] = t.values[0]; t.values[k + 2] = t.values[2]; }
    }
    const a = mixer.clipAction(clip);
    if (ONCE[key]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
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
    once = name;
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

  return { root, model, mesh, mixer, actions, setState, play, update, get state() { return current; }, get busy() { return once; } };
}
