import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const people = [
  ['coat', 1.68, [1.8, -4], true, 'passerby'],
  ['hoodie', 1.62, [-3.4, -9], true, 'passerby'],
  ['urban', 1.73, [9, 15], true, 'passerby'],
  ['coat', 1.75, [22, 10], true, 'passerby'],
  ['hoodie', 1.65, [-9, 18], true, 'passerby'],
  ['urban', 1.66, [31, -11], true, 'passerby'],
  ['autumn', 1.69, [-5, 4], false, 'passerby'],
  ['coffee', 1.65, [10, 18], false, 'passerby'],
  ['dog-walker', 1.66, [50, -3], false, 'passerby'],
  ['conversation', 1.80, [-5, -13], false, 'conversation'],
  ['stroll', 1.77, [18, 13], false, 'couple'],
  ['family', 1.82, [-10, 22], false, 'family'],
];

export async function loadPeople() {
  const loader = new GLTFLoader();
  const names = [...new Set(people.map(([name]) => name))];
  const assets = await Promise.all(names.map(async (name) => {
    try {
      const { scene } = await loader.loadAsync(`assets/people/${name}.glb`);
      scene.updateMatrixWorld(true);
      let source;
      scene.traverse((part) => { if (part.isMesh) source = part; });
      if (!source) return null;
      const geometry = source.geometry.applyMatrix4(source.matrixWorld);
      geometry.computeBoundingBox();
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      const height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
      geometry.translate(-center.x, -geometry.boundingBox.min.y, -center.z);
      geometry.scale(1 / height, 1 / height, 1 / height);
      geometry.computeBoundingSphere();
      geometry.boundingSphere.radius += 0.12;
      return [name, { geometry, material: source.material }];
    } catch (error) {
      console.warn(`Прохожий ${name}: ${error.message}`);
      return null;
    }
  }));
  return new Map(assets.filter(Boolean));
}

function walkingMaterial(base, gait) {
  const material = base.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.walkPhase = gait.phase;
    shader.uniforms.walkAmount = gait.amount;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float walkPhase, walkAmount;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float side = smoothstep(-0.018, 0.018, position.x) * 2.0 - 1.0;
        float leg = 1.0 - smoothstep(0.10, 0.51, position.y);
        float stepForward = sin(walkPhase) * side;
        float footUp = max(0.0, cos(walkPhase) * side);
        transformed.z += stepForward * leg * 0.115 * walkAmount;
        transformed.y += footUp * leg * leg * 0.045 * walkAmount;
        transformed.x += sin(walkPhase) * smoothstep(0.32, 0.96, position.y) * 0.012 * walkAmount;
        transformed.y += (0.5 - 0.5 * cos(2.0 * walkPhase)) * 0.008 * walkAmount;
      `);
  };
  return material;
}

export function placeCrowd(scene, assets, blocked, player) {
  const actors = [];
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 48;
  const ctx = shadowCanvas.getContext('2d');
  const shade = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  shade.addColorStop(0, '#100b20b8');
  shade.addColorStop(1, '#100b2000');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 48, 48);
  const shadowGeo = new THREE.PlaneGeometry(1, 0.7).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1,
  });

  function free(x, z, radius, except) {
    return !blocked(x, z) && !blocked(x + radius, z) && !blocked(x - radius, z) &&
      !blocked(x, z + radius) && !blocked(x, z - radius) &&
      actors.every((actor) => actor === except || Math.hypot(actor.x - x, actor.z - z) >= actor.radius + radius);
  }

  for (const [name, height, [ax, az], walking, word] of people) {
    const asset = assets.get(name);
    if (!asset) continue;
    const width = asset.geometry.boundingBox.max.x - asset.geometry.boundingBox.min.x;
    const radius = Math.max(0.31, width * height * 0.46);
    let x, z;
    for (let i = 0; i < 42; i++) {
      const r = i * 0.11, a = i * 2.39996;
      x = ax + Math.sin(a) * r;
      z = az + Math.cos(a) * r;
      if (free(x, z, radius) && Math.hypot(player.x - x, player.z - z) > 2.5) break;
      x = undefined;
    }
    if (x === undefined) continue;
    const gait = { phase: { value: Math.random() * 6.28 }, amount: { value: 0 } };
    const mesh = new THREE.Mesh(asset.geometry, walking ? walkingMaterial(asset.material, gait) : asset.material);
    mesh.userData.word = word;
    mesh.scale.setScalar(height);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.012;
    shadow.scale.set(radius * 2.1, 1, 1.12);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * 6.28;
    group.add(shadow, mesh);
    scene.add(group);
    actors.push({ x, z, group, gait, radius, walking, speed: 0.68 + Math.random() * 0.32, pause: Math.random() * 1.5, target: null });
  }

  function destination(actor) {
    for (let i = 0; i < 20; i++) {
      const a = actor.group.rotation.y + (Math.random() - 0.5) * (i < 6 ? 2 : 6.28);
      const length = 3 + Math.random() * 8;
      const dx = Math.sin(a) * length, dz = Math.cos(a) * length;
      const steps = Math.ceil(length / 0.55);
      let clear = true;
      for (let j = 1; j <= steps; j++) {
        if (!free(actor.x + dx * j / steps, actor.z + dz * j / steps, actor.radius, actor)) { clear = false; break; }
      }
      if (clear) return { x: actor.x + dx, z: actor.z + dz };
    }
    return null;
  }

  function update(dt) {
    for (const actor of actors) {
      if (!actor.walking || Math.hypot(actor.x - player.x, actor.z - player.z) > 85) continue;
      let advancing = false;
      actor.pause -= dt;
      if (actor.pause <= 0 && !actor.target) {
        actor.target = destination(actor);
        if (!actor.target) actor.pause = 1 + Math.random();
      }
      if (actor.target) {
        const dx = actor.target.x - actor.x, dz = actor.target.z - actor.z;
        const remaining = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        const angle = Math.atan2(Math.sin(yaw - actor.group.rotation.y), Math.cos(yaw - actor.group.rotation.y));
        actor.group.rotation.y += angle * (1 - Math.exp(-dt * 8));
        const step = Math.min(remaining, actor.speed * dt);
        const x = actor.x + Math.sin(yaw) * step, z = actor.z + Math.cos(yaw) * step;
        const nearPlayer = Math.hypot(x - player.x, z - player.z) < 0.85;
        if (remaining < 0.12 || nearPlayer || !free(x, z, actor.radius, actor)) {
          actor.target = null;
          actor.pause = 0.5 + Math.random() * 2.1;
        } else if (Math.abs(angle) < 0.8) {
          actor.x = x;
          actor.z = z;
          actor.group.position.set(x, 0, z);
          advancing = true;
        }
      }
      actor.gait.amount.value += (Number(advancing) - actor.gait.amount.value) * (1 - Math.exp(-dt * 8));
      actor.gait.phase.value = (actor.gait.phase.value + dt * 5.5 * actor.gait.amount.value) % (Math.PI * 2);
    }
  }

  function blocksStep(x, z) {
    return actors.some((actor) => {
      const distance = (x - actor.x) ** 2 + (z - actor.z) ** 2;
      return distance < (actor.radius + 0.24) ** 2 &&
        distance < (player.x - actor.x) ** 2 + (player.z - actor.z) ** 2;
    });
  }

  return { update, actors, blocksStep };
}
