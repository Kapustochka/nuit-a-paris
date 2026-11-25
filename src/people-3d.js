// 3D-прохожие: 13 персонажей со скелетом и родным клипом ходьбы + собака у хозяйки.
// Модели лежат в assets/people/3d/ (сжаты из исходников Максима: текстура 1024, meshopt).
// Движение по тротуарам и обход препятствий — общие с нарисованными прохожими (people.js: addModel).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// home — место, вокруг которого гуляет персонаж (метры сцены, как у POI в montmartre.json), range — радиус прогулки
export const CAST_3D = [
  { file: 'painter', woman: true, home: [4, -6], range: 26 },            // художница — площадь Тертр
  { file: 'gentleman', woman: false, home: [-61, -55], range: 40 },      // джентльмен — у Le Consulat
  { file: 'dog-walker', woman: true, home: [-22, 8], range: 45, dog: 'dog' },   // с собакой — улочки у старта
  { file: 'baker', woman: false, home: [18, 28], range: 30 },            // пекарь — у булочной Carette
  { file: 'accordionist', woman: false, home: [-6, 4], range: 30 },      // аккордеонист — Тертр
  { file: 'student', woman: true, home: [-8, -110], range: 50 },         // студентка — к кафе Renoir
  { file: 'elegant-woman', woman: true, sacre: [0, 40], range: 40 },     // в кремовом плаще — у Сакре-Кёр
  { file: 'waiter', woman: false, home: [11, -22], range: 24 },          // официант — у La Mère Catherine
  { file: 'florist', woman: true, home: [-25, 25], range: 35 },          // цветочница — у Chez Plumeau
  { file: 'bike-courier', woman: false, home: [0, 0], range: 95 },       // велокурьер ходит дальше всех
  { file: 'street-cleaner', woman: false, home: [34, 1], range: 35 },    // уборщик — у Au Clairon des Chasseurs
  { file: 'photographer', woman: true, sacre: [0, 55], range: 40 },      // фотографка — смотровая перед базиликой
  { file: 'nurse', woman: true, home: [-40, 60], range: 50 },            // медсестра идёт домой после смены
];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export async function loadWalker(file) {
  const { scene, animations } = await loader.loadAsync(`assets/people/3d/${file}.glb`);
  const clip = animations[0];
  if (!clip) throw new Error(`В ${file}.glb нет анимации`);
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.castShadow = true;
    o.userData.figure = true;          // post.js: мельче мазки, чтобы лицо и одежда читались
    // ночной живописный свет превращает одежду в силуэт вдали от фонарей — часть цвета текстуры светится сама
    // (как у нарисованных прохожих в people.js, только слабее: у 3D есть своя светотень)
    if (o.material.map) { o.material.emissiveMap = o.material.map; o.material.emissive.setScalar(file === 'dog' ? 0.12 : 0.3); }   // белая собака и так светится под фонарём
    // постоянная сфера для отсечения по кадру: не пересчитывать по костям и не «мигать» в первом кадре
    o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.3);
  });
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const speed = gaitSpeed(scene, mixer, clip.duration);
  mixer.setTime(Math.random() * clip.duration);
  return { model: scene, mixer, duration: clip.duration, speed, name: file };
}

// Клипы «на месте»: бёдра не уезжают вперёд (смещение за цикл < 1 см), значит движение по маршруту
// не складывается с движением из анимации. Скорость, при которой стопа на земле стоит неподвижно,
// = скорость, с которой опорная стопа едет назад в клипе. Анимацию потом крутим ровно по пройденному пути.
function gaitSpeed(model, mixer, duration) {
  const toes = [];
  model.traverse((o) => { if (o.isBone && /toe|foot/i.test(o.name) && !/_end/i.test(o.name)) toes.push(o); });
  const N = 72, dt = duration / N, track = toes.map(() => []);
  const v = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt);
    model.updateMatrixWorld(true);
    toes.forEach((b, k) => { b.getWorldPosition(v); track[k].push([v.y, v.z]); });
  }
  const speeds = [];
  for (const t of track) {
    const low = Math.min(...t.map(([y]) => y));
    for (let i = 1; i < t.length; i++) {
      if (t[i][0] < low + 0.015 && t[i - 1][0] < low + 0.015) speeds.push(Math.abs(t[i][1] - t[i - 1][1]) / dt);
    }
  }
  speeds.sort((a, b) => a - b);
  const median = speeds[Math.floor(speeds.length / 2)] || 1.2;
  return THREE.MathUtils.clamp(median, 0.5, 2);
}
