// ambient.js — мелкая жизнь в воздухе:
//   • листья и лепестки летят по ветру вокруг героини, у земли и деревьев мерцают светлячки;
//   • над столиками кафе поднимается пар от кофе, из труб на крышах идёт дым.
// Листья и светлячки — одна стая точек, которая «заворачивается» вокруг камеры: всё движение считает
// видеокарта. Пар и дым — несколько десятков клубов у ближайших столиков и труб.
import * as THREE from 'three';

const WIND = new THREE.Vector3(0.9, 0, 0.35);          // м/с, тот же ветер несёт и листья, и дым

export function createAmbient(scene, world, { phone = false } = {}) {
  const drift = createDrift(phone ? 90 : 220);
  const puffs = createPuffs(phone ? 30 : 64);
  scene.add(drift.points, puffs.points);

  // столики со свечами (их уже подняли на склон) и трубы построенных домов
  const candles = scene.getObjectByName('Terrace candles')?.geometry.attributes.position;
  const tables = [];
  if (candles) for (let i = 0; i < candles.count; i++) tables.push(new THREE.Vector3(candles.getX(i), candles.getY(i) + 0.02, candles.getZ(i)));
  const nearest = (list, cam, n, reach) => list.map((p) => ({ p, d: p.distanceToSquared(cam) })).filter((e) => e.d < reach * reach)
    .sort((a, b) => a.d - b.d).slice(0, n).map((e) => e.p);
  let chimneys = [], tick = 0, steamAt = [], smokeAt = [];
  const steamN = phone ? 4 : 8, smokeN = phone ? 4 : 8;

  function update(dt, camera, groundY) {
    drift.update(dt, camera, groundY);
    tick -= dt;
    if (tick <= 0) {
      tick = 1.5;
      chimneys = [];
      for (const h of world.houses) if (h.chimneys) for (const c of h.chimneys) {
        if ((c[0] - camera.position.x) ** 2 + (c[2] - camera.position.z) ** 2 < 150 * 150) chimneys.push(c.v ||= new THREE.Vector3(c[0], c[1], c[2]));
      }
      steamAt = nearest(tables, camera.position, steamN, 30);
      smokeAt = nearest(chimneys, camera.position, smokeN, 150);
    }
    puffs.update(dt, steamAt, smokeAt);
  }
  return { update, drift, puffs };
}

// ── Листья, лепестки, светлячки ───────────────────────────────
function createDrift(count) {
  const BOX = new THREE.Vector3(44, 13, 44);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    pos.set([rnd() * BOX.x, rnd() * BOX.y, rnd() * BOX.z], i * 3);
    const kind = rnd();                                   // < 0.5 лист, < 0.72 лепесток, дальше светлячок
    seed.set([kind < 0.5 ? 0 : kind < 0.72 ? 1 : 2, rnd(), rnd(), rnd()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 }, uBox: { value: BOX }, uWind: { value: WIND }, uGround: { value: 0 }, uScale: { value: 1 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,   // лист закрывает, светлячок светит
    vertexShader: /* glsl */ `
      uniform float uTime, uGround, uScale; uniform vec3 uBox, uWind;
      attribute vec4 aSeed; varying vec4 vSeed; varying float vFade; varying float vSpin;
      void main() {
        vSeed = aSeed;
        float kind = aSeed.x, t = uTime;
        vec3 p = position;
        if (kind < 1.5) {                                  // лист или лепесток: падает, качается, летит по ветру
          float sway = t * (0.7 + aSeed.y) + aSeed.z * 40.0;
          p += uWind * t * (0.7 + 0.6 * aSeed.w) + vec3(sin(sway) * 0.7, -t * (0.28 + 0.3 * aSeed.y), cos(sway * 0.8) * 0.7);
          p += vec3(0.0, sin(t * 0.23 + aSeed.w * 30.0) * 0.8, 0.0);   // порыв иногда подхватывает вверх
        } else {                                           // светлячок: медленно бродит на месте
          p += vec3(sin(t * 0.31 + aSeed.y * 50.0), sin(t * 0.47 + aSeed.z * 50.0) * 0.4, cos(t * 0.27 + aSeed.w * 50.0)) * 1.6;
        }
        // стая заворачивается вокруг камеры: частица, улетевшая за край, появляется с другой стороны
        vec3 c = vec3(cameraPosition.x, uGround + uBox.y * 0.5 - 0.4, cameraPosition.z);
        p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
        if (kind > 1.5) p.y = -uBox.y * 0.5 + 0.7 + fract(aSeed.y * 7.0) * 2.4 + sin(t * 0.47 + aSeed.z * 50.0) * 0.5;   // светлячки держатся у земли
        float edge = max(abs(p.x) / uBox.x, abs(p.z) / uBox.z) * 2.0;
        vFade = smoothstep(1.0, 0.75, edge);
        vec4 mv = viewMatrix * vec4(p + c, 1.0);
        float size = kind < 0.5 ? 0.26 : kind < 1.5 ? 0.15 : 0.3;
        gl_PointSize = clamp(uScale * size * (0.8 + 0.5 * aSeed.w) * 620.0 / max(-mv.z, 0.5), 1.5, 40.0 * uScale);
        vFade *= smoothstep(0.6, 1.6, -mv.z);              // у самого объектива не мельтешат
        vSpin = t * (1.5 + 3.0 * aSeed.z) + aSeed.w * 30.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec4 vSeed; varying float vFade; varying float vSpin;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float kind = vSeed.x;
        if (kind > 1.5) {                                  // светлячок: мягкий огонёк, дышит
          float pulse = 0.35 + 0.65 * smoothstep(-0.2, 0.9, sin(uTime * (0.8 + vSeed.y * 1.4) + vSeed.z * 40.0));
          float g = smoothstep(0.5, 0.0, length(q)); g = g * g + smoothstep(0.12, 0.0, length(q)) * 0.8;
          gl_FragColor = vec4(vec3(0.95, 1.0, 0.45) * g * pulse * vFade * 0.8, 0.0);
          return;
        }
        // лист кувыркается: повёрнутый эллипс, который то виден плашмя, то ребром
        float cs = cos(vSpin), sn = sin(vSpin); vec2 r = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
        float flat_ = 0.35 + 0.65 * abs(sin(vSpin * 0.7 + vSeed.y * 9.0));
        float d = length(vec2(r.x / 0.46, r.y / (0.24 * flat_)));
        float a = smoothstep(1.0, 0.8, d) * vFade;
        if (a < 0.02) discard;
        vec3 leaf = mix(vec3(0.72, 0.42, 0.16), vec3(0.55, 0.5, 0.2), vSeed.y);            // охра и оливковый
        leaf = mix(leaf, vec3(0.62, 0.2, 0.14), step(0.75, vSeed.w));                      // изредка багряный
        vec3 col = kind < 0.5 ? leaf : mix(vec3(0.95, 0.72, 0.78), vec3(1.0, 0.9, 0.88), vSeed.y);
        col *= (kind < 0.5 ? 0.85 : 0.9) * (0.8 + 0.3 * flat_) * (1.0 - 0.35 * smoothstep(0.0, 0.05, abs(r.y)) * step(kind, 0.5));   // ночью приглушены
        gl_FragColor = vec4(col * a, a);
      }`,
  }));
  points.frustumCulled = false; points.renderOrder = 4; points.userData.noPaint = true;
  points.onBeforeRender = (r) => { uniforms.uScale.value = (r.getRenderTarget()?.height ?? r.domElement.height) / 720; };
  return { points, uniforms, update(dt, camera, groundY) { uniforms.uTime.value += dt; uniforms.uGround.value = groundY; } };
}

// ── Пар над чашками и дым из труб ──────────────────────────────
function createPuffs(count) {
  const pos = new Float32Array(count * 3), data = new Float32Array(count * 3);   // data: возраст 0..1, размер, прозрачность
  const life = new Float32Array(count), age = new Float32Array(count).fill(1), vel = new Float32Array(count * 3), kind = new Uint8Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 3).setUsage(THREE.DynamicDrawUsage));
  const uniforms = { uScale: { value: 1 } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uScale; attribute vec3 aData; varying vec3 vData;
      void main() {
        vData = aData;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(uScale * aData.y * 720.0 / max(-mv.z, 0.5), 220.0 * uScale);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vData;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0, t = vData.x;
        float soft = smoothstep(1.0, 0.0, d);
        float a = soft * soft * smoothstep(0.0, 0.12, t) * (1.0 - t) * (1.0 - t) * vData.z;
        if (a < 0.004) discard;
        gl_FragColor = vec4(mix(vec3(0.7, 0.66, 0.84), vec3(0.42, 0.38, 0.6), t), a);     // сиреневый дым в ночном воздухе
      }`,
  }));
  points.frustumCulled = false; points.renderOrder = 4; points.userData.noPaint = true;
  points.onBeforeRender = (r) => { uniforms.uScale.value = (r.getRenderTarget()?.height ?? r.domElement.height) / 720; };

  let next = 0, steamClock = 0, smokeClock = 0, steamTurn = 0, smokeTurn = 0;
  function spawn(p, smoke) {
    const i = next; next = (next + 1) % count;
    kind[i] = smoke ? 1 : 0; age[i] = 0; life[i] = smoke ? 7 + Math.random() * 3 : 1.6 + Math.random() * 0.8;
    pos.set([p.x + (Math.random() - 0.5) * (smoke ? 0.25 : 0.05), p.y, p.z + (Math.random() - 0.5) * (smoke ? 0.25 : 0.05)], i * 3);
    vel.set([(Math.random() - 0.5) * 0.12, smoke ? 0.75 : 0.22, (Math.random() - 0.5) * 0.12], i * 3);
  }
  function update(dt, steamAt, smokeAt) {
    // клубы рождаются по очереди у каждого столика и каждой трубы
    steamClock += dt; smokeClock += dt;
    if (steamAt.length && steamClock > 0.9 / steamAt.length) { steamClock = 0; spawn(steamAt[steamTurn++ % steamAt.length], false); }
    if (smokeAt.length && smokeClock > 1.6 / smokeAt.length) { smokeClock = 0; spawn(smokeAt[smokeTurn++ % smokeAt.length], true); }
    for (let i = 0; i < count; i++) {
      if (age[i] >= 1) { data[i * 3 + 2] = 0; continue; }
      age[i] = Math.min(1, age[i] + dt / life[i]);
      const smoke = kind[i] === 1, t = age[i], lean = smoke ? Math.min(1, t * 2.5) : t * 0.25;   // дым постепенно подхватывает ветер
      pos[i * 3] += (vel[i * 3] + WIND.x * lean) * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * (1 - 0.5 * t) * dt;
      pos[i * 3 + 2] += (vel[i * 3 + 2] + WIND.z * lean) * dt;
      data[i * 3] = t; data[i * 3 + 1] = smoke ? 0.5 + 2.4 * t : 0.07 + 0.3 * t; data[i * 3 + 2] = smoke ? 0.55 : 0.45;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aData.needsUpdate = true;
  }
  return { points, update };
}
