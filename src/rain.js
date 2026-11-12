// rain.js — лёгкий ночной дождь, который иногда начинается и проходит сам.
// Капли — тонкие штрихи вокруг камеры (одна геометрия, всё движение в шейдере). Их рисуют поверх
// уже «написанного» кадра, а не до кисти: фильтр Кувахары съел бы тонкие линии, а так дождь
// выглядит как штрихи пером поверх картины. Вместе с дождём гуще облака, плотнее дымка,
// больше луж и ярче мокрые блики фонарей; звук — шум дождя в city-audio.js.
// Галочка «Дождь» разрешает погоде меняться; ?rain — дождь сразу и без перерывов (для проверки).
import * as THREE from 'three';

const KEY = 'nuit-a-paris:rain-on';
const BOX = new THREE.Vector3(26, 16, 26);

export function createRain(renderer, world, { phone = false, cityAudio = null } = {}) {
  const count = phone ? 1000 : 2200;
  const seeds = new Float32Array(count * 2 * 4), ends = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    seeds.set(s, i * 8); seeds.set(s, i * 8 + 4);
    ends[i * 2 + 1] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uBox: { value: BOX },
    uWind: { value: new THREE.Vector2(1.3, 0.6) }, uColor: { value: new THREE.Color(0.78, 0.8, 1.0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; attribute float aEnd;
      uniform float uTime, uAmount; uniform vec3 uBox; uniform vec2 uWind;
      varying float vAlpha;
      void main() {
        float speed = 8.5 + aSeed.w * 3.0;
        vec3 fall = normalize(vec3(uWind.x, -speed, uWind.y));
        vec3 p = aSeed.xyz * uBox + fall * uTime * speed;         // fall смотрит вниз
        vec3 c = cameraPosition + vec3(0.0, 3.0, 0.0);
        p = c + mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;      // ящик капель всегда вокруг камеры
        p -= fall * aEnd * (0.32 + aSeed.w * 0.25);              // хвост штриха
        float d = distance(p, cameraPosition);
        vAlpha = step(aSeed.w, uAmount) * smoothstep(0.7, 2.0, d) * (1.0 - smoothstep(8.0, 12.5, d)) * mix(0.48, 0.12, aEnd);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vAlpha;
      void main() { if (vAlpha < 0.01) discard; gl_FragColor = vec4(uColor, vAlpha); }`,
  });
  const drops = new THREE.LineSegments(geometry, material);
  drops.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(drops);

  // ── Погода: сухо → морось → сухо ─────────────────────────────
  const forced = new URLSearchParams(location.search).has('rain');
  const box = document.querySelector('#rain-toggle input');
  let allowed = true;
  try { allowed = localStorage.getItem(KEY) !== '0'; } catch { /* нет хранилища */ }
  if (box) {
    box.checked = allowed;
    box.addEventListener('change', () => {
      allowed = box.checked;
      try { localStorage.setItem(KEY, allowed ? '1' : '0'); } catch { /* не страшно */ }
      if (allowed && !raining) clock = Math.min(clock, 4);        // включили — скоро пойдёт
      box.blur();
    });
  }
  let raining = forced, clock = forced ? 1e9 : 240 + Math.random() * 180, level = forced ? 1 : 0, strength = 0.75;
  const sky = world.sky.uniforms, look = world.look;
  const dry = { clouds: sky.uCloudOpacity.value, stars: sky.uStarIntensity.value, fog: look.uFogDensity.value };

  let lastWet = -1;
  function update(dt) {
    uniforms.uTime.value = (uniforms.uTime.value + dt) % 1000;
    clock -= dt;
    if (clock <= 0) {
      raining = !raining && allowed;
      clock = raining ? 60 + Math.random() * 50 : 480 + Math.random() * 420;   // редко: дождик на минуту-две раз в 10–15 минут
      strength = 0.6 + Math.random() * 0.3;
    }
    if (!allowed && !forced) raining = false;
    const target = raining ? (forced ? 0.8 : strength) : 0;
    level += (target - level) * (1 - Math.exp(-dt / 6));         // дождь набирается и стихает секунд за десять
    if (level < 0.002) level = 0;
    uniforms.uAmount.value = level;
    uniforms.uWind.value.set(1.3 + Math.sin(uniforms.uTime.value * 0.2) * 0.6, 0.6);
    cityAudio?.setRain?.(level);
    const wet = Math.min(1, level * 1.4);
    if (wet === lastWet) return;                                 // в сухую погоду не трогаем (и ползунки ?debug)
    lastWet = wet;
    sky.uCloudOpacity.value = THREE.MathUtils.lerp(dry.clouds, 0.8, wet);
    sky.uStarIntensity.value = THREE.MathUtils.lerp(dry.stars, 0.12, wet);
    look.uFogDensity.value = THREE.MathUtils.lerp(dry.fog, dry.fog * 1.45, wet);
    if (look.uWet) look.uWet.value = wet;
  }
  function render(camera) {
    if (level <= 0) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.autoClear = auto;
  }
  return { update, render, get level() { return level; }, get raining() { return level > 0.25; } };
}
