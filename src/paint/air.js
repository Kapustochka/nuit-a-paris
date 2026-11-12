// air.js — воздух ночного Монмартра, рисуется в пост-проходе (post.js) по глубине кадра:
//   • дымка лежит слоем у земли и редеет с высотой: дальние дома тают, крыши и Сакре-Кёр остаются над ней;
//   • под ближайшими фонарями — конусы света с лучами, вокруг — мягкий ореол в тумане;
//   • базилика светится сквозь дымку, и этот свет закрывают дома на переднем плане.
// Всё считается формулами без текстур: на телефоне фонарей и шагов меньше (SHAFTS, SHAFT_STEPS).
import * as THREE from 'three';

export const MAX_SHAFTS = 10;

export function airUniforms() {
  return {
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uTime: { value: 0 },
    uShaftPos: { value: Array.from({ length: MAX_SHAFTS }, () => new THREE.Vector4(0, -100, 0, 0)) },   // xyz фонаря, w — сила
    uBeacon: { value: new THREE.Vector4(0, -1000, 0, 0) },                                              // Сакре-Кёр
    uGroundY: { value: 0 },
    uMist: { value: 1 }, uShaft: { value: 1 },
    uMistCol: { value: new THREE.Color(0.3, 0.27, 0.52) }, uMistWarm: { value: new THREE.Color(0.56, 0.38, 0.5) },
    uShaftCol: { value: new THREE.Color(1.0, 0.72, 0.38) },
  };
}

// Требует lin(), vnoise(), fbm(), hash() из post.js
export const AIR_GLSL = /* glsl */ `
  uniform mat4 uProjInv, uCamWorld; uniform float uTime, uGroundY, uMist, uShaft;
  uniform vec4 uShaftPos[${MAX_SHAFTS}]; uniform vec4 uBeacon; uniform vec3 uMistCol, uMistWarm, uShaftCol;
  // свет точки, собранный вдоль луча в однородном тумане (точная формула, без шагов)
  float airlight(vec3 ro, vec3 rd, float dist, vec3 p, float soft) {
    vec3 oc = p - ro; float tc = dot(oc, rd), h = sqrt(max(dot(oc, oc) - tc * tc, 0.0) + soft * soft);
    return (atan((dist - tc) / h) + atan(tc / h)) / h;
  }
  vec3 air(vec3 col, vec2 uv, float depth, vec2 sp) {
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0); vec3 dv = v.xyz / v.w; dv /= -dv.z;
    vec3 rd = mat3(uCamWorld) * dv; float rl = length(rd); rd /= rl;
    vec3 ro = uCamWorld[3].xyz;
    bool sky = depth > 0.999999;
    float dist = sky ? 1400.0 : lin(depth) * rl;

    // ── дымка: плотность падает с высотой над землёй под героиней ──
    const float H = 16.0;
    float ky = rd.y / H, top = exp(-max(ro.y - uGroundY, 0.0) / H);
    float path = abs(ky) < 1e-4 ? dist : (1.0 - exp(-ky * dist)) / ky;
    vec3 far = ro + rd * min(dist, 500.0);
    float banks = 0.7 + 0.6 * fbm(far.xz * 0.012 + vec2(uTime * 0.012, far.y * 0.02));
    float mist = (1.0 - exp(-path * top * 0.0042 * banks)) * uMist;
    vec3 mistCol = mix(uMistCol, uMistWarm, smoothstep(0.25, 0.0, abs(rd.y)) * smoothstep(120.0, 500.0, dist));
    col = mix(col, mistCol, mist * (sky ? 0.75 : 1.0));

    // ── Сакре-Кёр светит сквозь туман ──
    float halo = airlight(ro, rd, dist, uBeacon.xyz, 55.0) * 55.0 / 3.1416;
    vec3 beaconCol = vec3(1.0, 0.84, 0.62) * uBeacon.w * uMist;
    col += beaconCol * halo * halo;
    #if SHAFT_STEPS > 0
    {                                                      // прожекторы базилики: веер лучей вверх
      vec3 base = uBeacon.xyz - vec3(0.0, 46.0, 0.0), c = base + vec3(0.0, 40.0, 0.0); const float R = 95.0;
      vec3 oc = ro - c; float b = dot(oc, rd), d2 = b * b - dot(oc, oc) + R * R;
      if (d2 > 0.0) {
        float sq = sqrt(d2), t0 = max(-b - sq, 0.0), t1 = min(-b + sq, dist);
        if (t1 > t0) {
          float dt = (t1 - t0) / 4.0, beam = 0.0, j = 0.5 + (vnoise(sp / 1.7 + 9.0) - 0.5) * 0.7;
          for (int s = 0; s < 4; s++) {
            vec3 q = ro + rd * (t0 + (float(s) + j) * dt) - base;
            float r = length(q.xz), fan = smoothstep(1.25, 0.35, r / (q.y + 22.0)) * smoothstep(0.0, 12.0, q.y);
            float rays = 0.35 + 1.2 * vnoise(q.xz / (r + 1.0) * 3.2 + uTime * 0.02);
            beam += fan * rays / (1.0 + dot(q, q) / 2600.0);
          }
          col += beaconCol * beam * dt * 0.012;
        }
      }
    }
    #endif

    // ── фонари: ореол и конус света с лучами ──
    #if SHAFTS > 0
    float jitter = 0.5 + (vnoise(sp / 2.6) - 0.5) * 0.5;     // мягкая зернистость вместо полос от шагов
    vec3 glow = vec3(0.0);
    for (int i = 0; i < SHAFTS; i++) {
      vec4 L = uShaftPos[i];
      if (L.w < 0.003) continue;
      glow += uShaftCol * airlight(ro, rd, dist, L.xyz, 0.45) * 0.017 * L.w;
      // шар вокруг конуса: от фонаря до земли
      vec3 c = L.xyz - vec3(0.0, 1.9, 0.0); const float R = 3.6;
      vec3 oc = ro - c; float b = dot(oc, rd), d2 = b * b - dot(oc, oc) + R * R;
      if (d2 <= 0.0) continue;
      float sq = sqrt(d2), t0 = max(-b - sq, 0.0), t1 = min(-b + sq, dist);
      if (t1 <= t0) continue;
      float dt = (t1 - t0) / float(SHAFT_STEPS), beam = 0.0;
      for (int s = 0; s < SHAFT_STEPS; s++) {
        vec3 q = ro + rd * (t0 + (float(s) + jitter) * dt) - L.xyz;
        float down = -q.y, r = length(q.xz);
        float cone = smoothstep(0.95, 0.35, r / (down + 0.3)) * smoothstep(-0.1, 0.5, down);
        float rays = 0.4 + 1.1 * vnoise(q.xz / (r + 0.05) * 2.8 + L.xz + uTime * 0.04);
        beam += cone * rays / (1.0 + 0.22 * dot(q, q));
      }
      glow += uShaftCol * beam * dt * 0.3 * L.w * uShaft;
    }
    col += glow * (1.0 - 0.35 * col);
    #endif
    return col;
  }
`;
