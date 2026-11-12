import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const RADIUS = 0.34;
const WALK_SPEED = 1.3;

export async function loadPasserby(file, clip) {
  try {
    const { scene, animations } = await new GLTFLoader().loadAsync(`assets/people/${file}`);
    const walking = animations.find(({ name }) => name === clip);
    if (!walking) throw new Error(`Анимация ${clip} отсутствует`);
    scene.traverse((part) => {
      if (!part.isSkinnedMesh) return;
      part.userData.word = 'passerby';
      part.castShadow = true;
      part.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(walking).play();
    mixer.update(0);
    return { model: scene, mixer, duration: walking.duration };
  } catch (error) {
    console.warn('Не удалось загрузить прохожую:', error);
    return null;
  }
}

export function placePasserby(scene, asset, world, player, occupied) {
  if (!asset) return null;
  const anchorX = player.x - 2.7, anchorZ = player.z - 6;
  const [x, z] = world.freeSpot(anchorX, anchorZ);
  const root = new THREE.Group();
  root.name = 'Passante';
  root.position.set(x, world.heightAt?.(x, z) ?? 0, z);
  root.rotation.y = Math.PI / 2;
  asset.model.position.y += 0.021;
  root.add(asset.model);
  scene.add(root);

  const position = root.position;
  let destination = null;
  let retry = 0;
  function free(x, z) {
    return !world.blocked(x, z) &&
      !world.blocked(x + RADIUS, z) && !world.blocked(x - RADIUS, z) &&
      !world.blocked(x, z + RADIUS) && !world.blocked(x, z - RADIUS) &&
      Math.hypot(x - player.x, z - player.z) > 0.86 && !occupied(x, z);
  }

  function chooseDestination() {
    for (let attempt = 0; attempt < 18; attempt++) {
      const angle = root.rotation.y + (Math.random() - 0.5) * (attempt < 6 ? 2 : 2 * Math.PI);
      const length = 3 + Math.random() * 6;
      const dx = Math.sin(angle) * length, dz = Math.cos(angle) * length;
      const x = position.x + dx, z = position.z + dz;
      if (Math.hypot(x - anchorX, z - anchorZ) > 16) continue;
      const samples = Math.ceil(length / 0.5);
      let clear = true;
      for (let i = 1; i <= samples; i++) {
        if (!free(position.x + dx * i / samples, position.z + dz * i / samples)) {
          clear = false;
          break;
        }
      }
      if (clear) return { x, z };
    }
    return null;
  }

  function update(dt) {
    if (!destination) {
      retry -= dt;
      if (retry > 0) return;
      destination = chooseDestination();
      if (!destination) { retry = 0.45; return; }
    }
    const dx = destination.x - position.x, dz = destination.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) { destination = null; return; }

    const yaw = Math.atan2(dx, dz);
    const delta = yaw - root.rotation.y;
    const angle = Math.atan2(Math.sin(delta), Math.cos(delta));
    root.rotation.y += angle * (1 - Math.exp(-dt * 7));
    const step = Math.min(distance, WALK_SPEED * dt) * Math.max(0, Math.cos(angle));
    const x = position.x + dx / distance * step, z = position.z + dz / distance * step;
    if (!free(x, z)) { destination = null; return; }
    position.set(x, world.heightAt?.(x, z) ?? 0, z);
    asset.mixer.update(step / WALK_SPEED);
  }

  return { update, position };
}

export function placeCircularPasserby(scene, asset, world, player, occupied) {
  if (!asset) return null;
  const { model, mixer, duration } = asset;
  const hips = model.getObjectByName('mixamorigHips');
  if (!hips) { console.warn('Скелет второй прохожей не содержит кости Hips'); return null; }

  // Клип сам переносит скелет по кругу. Проверяем весь маршрут перед размещением.
  const path = Array.from({ length: 64 }, (_, i) => {
    mixer.setTime(i * duration / 64);
    return hips.getWorldPosition(new THREE.Vector3());
  });
  const center = new THREE.Box3().setFromPoints(path).getCenter(new THREE.Vector3());
  const candidates = [[4, -10], [2, -7], [-2, -9], [5, -12]];
  const start = candidates.map(([x, z]) => [player.x + x - center.x, player.z + z - center.z])
    .find(([x, z]) => path.every((point) => {
      const px = x + point.x, pz = z + point.z;
      return [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]
        .every(([dx, dz]) => !world.blocked(px + dx, pz + dz));
    }));
  if (!start) { console.warn('Не нашлось места для кругового маршрута'); return null; }

  model.name = 'Passante en cercle';
  model.position.set(start[0], (world.heightAt?.(start[0] + center.x, start[1] + center.z) ?? 0) + 0.004, start[1]);
  scene.add(model);
  // Сдвигаем начало клипа, чтобы прохожая появилась со стороны камеры.
  let time = duration * 0.75;
  mixer.setTime(time);
  const position = hips.getWorldPosition(new THREE.Vector3());
  const nextPosition = new THREE.Vector3();
  return {
    position,
    update(dt) {
      const nextTime = (time + dt) % duration;
      mixer.setTime(nextTime);
      hips.getWorldPosition(nextPosition);
      if (Math.hypot(nextPosition.x - player.x, nextPosition.z - player.z) < 0.66 ||
          occupied(nextPosition.x, nextPosition.z)) {
        mixer.setTime(time);
        return;
      }
      time = nextTime;
      position.copy(nextPosition);
      model.position.y = (world.heightAt?.(position.x, position.z) ?? 0) + 0.004;   // круг по склону
    },
  };
}

export function passerbyBlocksStep(passerby, player, x, z) {
  const position = passerby.position;
  const distance = (x - position.x) ** 2 + (z - position.z) ** 2;
  return distance < (RADIUS + 0.24) ** 2 &&
    distance < (player.x - position.x) ** 2 + (player.z - position.z) ** 2;
}
