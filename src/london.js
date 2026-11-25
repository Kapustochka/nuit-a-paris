// london.js — the landmarks of Night in London that the facade generator can't make:
// Elizabeth Tower (Big Ben) with glowing clock faces that show the real time and strike the hours,
// and the London Eye turning slowly across the river. Built with the same painted Builder as the city.
import * as THREE from 'three';
import { Builder, K } from './paint/builder.js';
import { paintMaterial } from './paint/paint.js';

const STONE = [0.92, 0.79, 0.55], STONE_D = [0.8, 0.67, 0.46], GOLD = [0.95, 0.78, 0.42], SLATE = [0.3, 0.33, 0.42], DARK = [0.18, 0.18, 0.28];

// Elizabeth Tower: 96 m, shaft ~12 m square, clock stage at ~55 m, belfry, iron spire. Local origin = foot of the tower.
function towerMesh(look) {
  const B = new Builder(), w = 6;
  B.box(-w, 0, -w, w, 52, w, STONE, K.WALL);
  // buttress ribs and tall gothic panels on every side
  for (let s = 0; s < 4; s++) {
    const a = s * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const P = (x, y, z) => [x * ca - z * sa, y, x * sa + z * ca];
    const C = new Builder();
    for (const x of [-5.6, -1.9, 1.9, 5.6]) C.box(x - 0.35, 0, w - 0.1, x + 0.35, 53, w + 0.45, STONE_D, K.TRIM);
    for (const x of [-3.75, 0, 3.75]) for (let y = 6; y < 48; y += 7) {
      C.quad([x - 0.7, y, w + 0.02], [x + 0.7, y, w + 0.02], [x + 0.7, y + 4.6, w + 0.02], [x - 0.7, y + 4.6, w + 0.02], [0.93, 0.9, 0.84], K.GLASS, [0, 0, 1, 1], y > 30 ? 0.3 : 0.1);
      C.tri([x - 0.7, y + 4.6, w + 0.02], [x + 0.7, y + 4.6, w + 0.02], [x, y + 5.6, w + 0.02], DARK, K.GLASS);
    }
    // clock stage: square panel with gilded frame around the face
    C.box(-6.2, 52, w - 0.2, 6.2, 63, w + 0.5, STONE, K.WALL);
    C.box(-5.2, 53, w + 0.5, 5.2, 62.2, w + 0.7, GOLD, K.TRIM);
    // belfry with three pointed openings
    C.box(-5.4, 63, w - 0.8, 5.4, 70, w - 0.4, STONE_D, K.WALL);
    for (const x of [-3, 0, 3]) {
      C.quad([x - 1, 64, w - 0.38], [x + 1, 64, w - 0.38], [x + 1, 68, w - 0.38], [x - 1, 68, w - 0.38], [0.95, 0.85, 0.6], K.GLASS, [0, 0, 1, 1], 0.95);
      C.tri([x - 1, 68, w - 0.38], [x + 1, 68, w - 0.38], [x, 69.4, w - 0.38], [0.95, 0.85, 0.6], K.GLASS, [0, 0, 1, 0, 0.5, 1], 0.95);
    }
    B.append(C, ([x, y, z]) => P(x, y, z));
  }
  // corner pinnacles at the clock stage and belfry
  for (const [x, z] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) {
    B.box(x - 0.6, 63, z - 0.6, x + 0.6, 66.5, z + 0.6, STONE_D, K.TRIM);
    B.tri([x - 0.6, 66.5, z - 0.6], [x, 70, z], [x + 0.6, 66.5, z - 0.6], GOLD, K.TRIM);
    B.tri([x + 0.6, 66.5, z + 0.6], [x, 70, z], [x - 0.6, 66.5, z + 0.6], GOLD, K.TRIM);
    B.tri([x + 0.6, 66.5, z - 0.6], [x, 70, z], [x + 0.6, 66.5, z + 0.6], GOLD, K.TRIM);
    B.tri([x - 0.6, 66.5, z + 0.6], [x, 70, z], [x - 0.6, 66.5, z - 0.6], GOLD, K.TRIM);
  }
  // steep slate roof, lantern and iron spire
  const pyr = (y0, y1, r0, r1, col) => {
    const c0 = [[-r0, -r0], [r0, -r0], [r0, r0], [-r0, r0]], c1 = [[-r1, -r1], [r1, -r1], [r1, r1], [-r1, r1]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      B.quad([c0[i][0], y0, c0[i][1]], [c0[j][0], y0, c0[j][1]], [c1[j][0], y1, c1[j][1]], [c1[i][0], y1, c1[i][1]], col, K.ROOF);
    }
  };
  pyr(70, 80, 5.6, 2.4, SLATE);
  B.box(-2.4, 80, -2.4, 2.4, 84, 2.4, GOLD, K.TRIM);
  pyr(84, 95.5, 2.0, 0.08, SLATE);
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]) B.box(x - 0.25, 80, z - 0.25, x + 0.25, 86, z + 0.25, GOLD, K.TRIM);
  const m = new THREE.Mesh(B.geometry(0, Math.PI / 4), paintMaterial(look));
  m.userData.word = 'clockTower';
  return m;
}

// Four lit clock faces with hands. MeshBasic stays bright: paintPatch does not touch it.
function clockFaces(group) {
  const faceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.72), fog: false });
  const handMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.07, 0.1), fog: false });
  const hands = [];
  for (let s = 0; s < 4; s++) {
    const face = new THREE.Group();
    face.rotation.y = s * Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), faceMat);
    disc.position.set(0, 57.6, 6.75);
    face.add(disc);
    for (let k = 0; k < 12; k++) {                     // hour marks
      const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.22, k % 3 ? 0.5 : 0.8), handMat);
      const a = k / 12 * Math.PI * 2;
      mk.position.set(Math.sin(a) * 3.0, 57.6 + Math.cos(a) * 3.0, 6.77); mk.rotation.z = -a;
      face.add(mk);
    }
    const hour = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 2.0).translate(0, 0.9, 0), handMat);
    const minute = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 3.0).translate(0, 1.35, 0), handMat);
    hour.position.set(0, 57.6, 6.79); minute.position.set(0, 57.6, 6.8);
    face.add(hour, minute);
    hands.push([hour, minute]);
    group.add(face);
  }
  return (date) => {
    const m = date.getMinutes() + date.getSeconds() / 60, h = (date.getHours() % 12) + m / 60;
    for (const [hour, minute] of hands) { hour.rotation.z = -h / 12 * Math.PI * 2; minute.rotation.z = -m / 60 * Math.PI * 2; }
  };
}

// Big Ben's strike: a deep bell made of inharmonic partials, once per hour, louder when close
function bell(ctx, when, gain) {
  const out = ctx.createGain(); out.gain.value = gain; out.connect(ctx.destination);
  for (const [f, a, d] of [[110, 1, 6], [220, 0.5, 4], [262, 0.35, 3], [330, 0.25, 2.5], [440, 0.15, 1.6], [587, 0.08, 1.2]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(a, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + d);
    o.connect(g).connect(out); o.start(when); o.stop(when + d + 0.1);
  }
}

export function buildLondonLandmarks(scene, look, { tower, eye, glow }) {
  // Elizabeth Tower on its OSM footprint
  const group = new THREE.Group();
  group.position.set(tower.x, 0, tower.z); group.rotation.y = tower.angle;
  group.add(towerMesh(look));
  const setTime = clockFaces(group);
  scene.add(group);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.position.set(tower.x, 58, tower.z); halo.scale.set(60, 60, 1);
  scene.add(halo);

  // London Eye: 120 m wheel, hub at 70 m, 32 lit capsules, A-frame legs, turning slowly
  const wheel = new THREE.Group(), R = 60;
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.0), fog: false });
  const spokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.45, 0.7), fog: false, transparent: true, opacity: 0.55 });
  const podMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1.0), fog: false });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.7, 6, 96), rimMat));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R - 3, 0.35, 6, 96), rimMat));
  const pod = new THREE.SphereGeometry(1.6, 10, 6).scale(1.6, 1, 1);
  for (let k = 0; k < 32; k++) {
    const a = k / 32 * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, R, 4), spokeMat);
    spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); spoke.rotation.z = a - Math.PI / 2;
    const p = new THREE.Mesh(pod, podMat);
    p.position.set(Math.cos(a) * (R + 1.8), Math.sin(a) * (R + 1.8), 0);
    wheel.add(spoke, p);
  }
  const eyeGroup = new THREE.Group();
  eyeGroup.position.set(eye.x, 70, eye.z); eyeGroup.rotation.y = eye.angle;
  eyeGroup.add(wheel);
  const legMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.3, 0.45), fog: false });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 78, 6), legMat);
    leg.position.set(s * 18, -35, -14); leg.rotation.z = s * 0.25; leg.rotation.x = -0.18;
    eyeGroup.add(leg);
  }
  scene.add(eyeGroup);

  let audio = null, lastHour = new Date().getHours(), tick = 0;
  const startAudio = () => { try { audio ||= new AudioContext(); audio.resume?.(); } catch { /* no audio */ } };
  addEventListener('pointerdown', startAudio, { once: true }); addEventListener('keydown', startAudio, { once: true });
  setTime(new Date());
  return {
    tower: group,
    update(dt, hx, hz) {
      wheel.rotation.z += dt * 0.01;
      if ((tick += dt) < 1) return;
      tick = 0;
      const now = new Date(); setTime(now);
      if (now.getHours() !== lastHour) {
        lastHour = now.getHours();
        const d = Math.hypot(hx - tower.x, hz - tower.z), gain = 0.5 * Math.max(0.15, 1 - d / 400);
        if (audio && audio.state === 'running') for (let i = 0, n = lastHour % 12 || 12; i < n; i++) bell(audio, audio.currentTime + 0.1 + i * 2.6, gain);
      }
    },
  };
}
