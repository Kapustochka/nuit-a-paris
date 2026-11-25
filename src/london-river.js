// london-river.js — the Thames at night: a dark moving surface with ripples, the sky mirrored at grazing
// angles and broken golden columns of light under the embankment lamps, Big Ben's clock faces and the Eye.
// Reflections are cheap glints of a rippled normal toward a short list of point lights (no reflection pass).
import * as THREE from 'three';

const MAX = 40;

export function riverMaterial(look, sky) {
  const lights = Array.from({ length: MAX }, () => new THREE.Vector4());
  const colors = Array.from({ length: MAX }, () => new THREE.Vector3());
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uLights: { value: lights }, uColors: { value: colors }, uCount: { value: 0 },
      uZenith: { value: lin(sky.uZenith ?? 0x081a30) }, uHorizon: { value: lin(sky.uHorizon ?? 0x7a6a72) },
      uFogCol: look.uFogCol, uFogDensity: look.uFogDensity,
    },
    vertexShader: `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uFogDensity; uniform int uCount;
      uniform vec4 uLights[${MAX}]; uniform vec3 uColors[${MAX}];
      uniform vec3 uZenith, uHorizon, uFogCol;
      varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float waves(vec2 p) {
        return vnoise(p * vec2(0.9, 2.6) + vec2(uTime * 0.35, 0.0)) * 0.5
             + vnoise(p * vec2(2.1, 5.5) - vec2(uTime * 0.6, uTime * 0.1)) * 0.3
             + vnoise(p * 7.0 + vec2(0.0, uTime * 0.9)) * 0.2;
      }
      void main() {
        vec3 toEye = cameraPosition - vW; float dist = length(toEye); vec3 V = toEye / dist;
        vec2 e = vec2(0.08, 0.0);
        float h = waves(vW.xz), hx = waves(vW.xz + e.xy), hz = waves(vW.xz + e.yx);
        float amp = 0.55 / (1.0 + dist * 0.02);                         // calmer far away, less shimmer
        vec3 N = normalize(vec3((h - hx) / e.x * amp, 1.0, (h - hz) / e.x * amp));
        vec3 R = reflect(-V, N);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 skyCol = mix(uHorizon, uZenith, clamp(R.y * 1.6, 0.0, 1.0));
        vec3 col = vec3(0.02, 0.045, 0.07) + skyCol * (0.12 + fres * 1.2);
        for (int i = 0; i < ${MAX}; i++) {
          if (i >= uCount) break;
          vec4 L = uLights[i]; vec3 toL = L.xyz - vW; float d = length(toL);
          float a = max(dot(toL / d, R), 0.0);
          float glint = pow(a, 160.0) * 4.0 + pow(a, 18.0) * 0.25;       // sharp sparkle + soft column
          col += uColors[i] * glint * L.w / (1.0 + d * d * 0.004);
        }
        float fd = dist * uFogDensity;
        col = mix(col, uFogCol, (1.0 - exp(-fd * fd)) * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return {
    material,
    // [x, y, z, strength] + linear RGB; the brightest MAX are kept
    setLights(list) {
      list.sort((a, b) => b[3] - a[3]).slice(0, MAX).forEach(([x, y, z, s, c], i) => { lights[i].set(x, y, z, s); colors[i].set(c.r, c.g, c.b); });
      material.uniforms.uCount.value = Math.min(list.length, MAX);
    },
    update(dt) { material.uniforms.uTime.value = (material.uniforms.uTime.value + dt) % 3600; },
  };
}
