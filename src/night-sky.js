import * as THREE from 'three';

export function createNightSky(scene) {
  const moonDirection = new THREE.Vector3(0.29, 0.36, -1).normalize();
  const uniforms = {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color(0x090d26) },
    uMidSky: { value: new THREE.Color(0x1a2149) },
    uHorizon: { value: new THREE.Color(0x3e365f) },
    uCloudColor: { value: new THREE.Color(0x58618e) },
    uCloudOpacity: { value: 0.38 },
    uCityGlow: { value: 0.22 },
    uStarIntensity: { value: 0.68 },
    uMoonDirection: { value: moonDirection },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        // Центр купола совпадает с камерой. Глубина остаётся за всей сценой.
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = clip.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uCloudOpacity, uStarIntensity, uCityGlow;
      uniform vec3 uZenith, uMidSky, uHorizon, uCloudColor, uMoonDirection;
      varying vec3 vDirection;

      float hash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }

      float noise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
                   mix(hash(cell + vec2(0, 1)), hash(cell + 1.0), f.x), f.y);
      }

      float starField(vec3 direction, float height) {
        vec2 grid = vec2(atan(direction.z, direction.x) / 6.2831853 + 0.5,
                         asin(clamp(direction.y, -1.0, 1.0)) / 1.5707963);
        grid *= vec2(256.0, 64.0);
        vec2 cell = floor(grid);
        cell.x = mod(cell.x, 256.0);
        float seed = hash(cell);
        vec2 offset = vec2(hash(cell + 11.7), hash(cell + 43.1)) * 0.48 + 0.26;
        float radius = mix(0.028, 0.105, pow(hash(cell + 5.3), 5.0));
        vec2 delta = fract(grid) - offset;
        // Горизонтальный размер угловой ячейки уменьшается к зениту.
        delta.x *= max(0.3, sqrt(max(0.0, 1.0 - direction.y * direction.y)));
        float aa = clamp(length(fwidth(delta)) * 0.45, 0.008, 0.085);
        float point = 1.0 - smoothstep(radius * 0.3, radius + aa, length(delta));
        return point * step(0.88, seed) * mix(0.18, 1.0, hash(cell + 3.1))
          * smoothstep(0.035, 0.24, height) * (1.0 - smoothstep(0.86, 0.995, height));
      }

      void main() {
        vec3 direction = normalize(vDirection);
        float height = max(0.0, direction.y);
        vec3 color = mix(uHorizon, uMidSky, smoothstep(0.0, 0.32, height));
        color = mix(color, uZenith, smoothstep(0.12, 0.98, height));

        // Мягкий свет Парижа над горизонтом: неон не нужен, только приглушённый янтарь.
        // Небольшие широкие пятна не дают небу выглядеть как равномерный градиент.
        float horizonBand = exp(-height * 13.0);
        float cityVariation = 0.7 + 0.3 * noise(direction.xz * 3.5 + vec2(4.0, 9.0));
        color += vec3(0.24, 0.105, 0.095) * horizonBand * cityVariation * uCityGlow;

        vec2 p = direction.xz / (height + 0.40) * vec2(2.6, 5.5);
        p += vec2(0.0045, -0.0018) * uTime;
        float sweep = noise(p * 0.65);
        p.y += sweep * 1.7;
        float vapor = noise(p) * 0.60 + noise(p * 2.1 + 7.0) * 0.28
                    + noise(p * 4.2 - 3.0) * 0.12;
        float cloud = smoothstep(0.50, 0.77, vapor) * smoothstep(0.02, 0.15, height)
                    * (1.0 - smoothstep(0.46, 0.88, height)) * uCloudOpacity;

        vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDirection));
        vec3 moonUp = cross(uMoonDirection, moonRight);
        float facingMoon = dot(direction, uMoonDirection);
        vec2 moon = vec2(dot(direction, moonRight), dot(direction, moonUp)) / 0.021;
        float r = length(moon);
        float edge = max(fwidth(r), 0.01);
        float disk = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, r);
        float cut = smoothstep(0.93 - edge, 0.93 + edge, length(moon - vec2(0.43, 0.20)));
        float moonMask = step(0.0, facingMoon);
        float halo = exp(-r * 0.52) * moonMask;
        float stars = starField(direction, height) * (1.0 - disk * moonMask) * uStarIntensity;
        color += vec3(0.50, 0.66, 1.0) * stars * 0.52;
        color += vec3(0.31, 0.28, 0.19) * halo * 0.24;
        color = mix(color, vec3(0.88, 0.78, 0.57), disk * cut * moonMask);
        // Облака сохраняют цвет ночи, а не становятся серыми непрозрачными пятнами.
        vec3 cloudTint = mix(uCloudColor * 0.72, uCloudColor * 1.04, halo);
        color = mix(color, cloudTint, cloud * 0.78);
        color += (hash(gl_FragCoord.xy) - 0.5) * 0.0012;
        gl_FragColor = vec4(max(color, 0.0), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  mesh.name = 'Night sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  scene.add(mesh);

  return {
    uniforms,
    moonDirection,
    update(dt) { uniforms.uTime.value += dt; },
  };
}
