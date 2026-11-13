import * as THREE from 'three';

export function createNightSky(scene) {
  const moonDirection = new THREE.Vector3(0.29, 0.36, -1).normalize();
  const uniforms = {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color(0x0d0f33) },
    uMidSky: { value: new THREE.Color(0x2b2461) },
    uHorizon: { value: new THREE.Color(0x80547f) },
    uCloudColor: { value: new THREE.Color(0x6a5c9a) },
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

      float cloudShape(vec2 p) {
        return noise(p) * 0.56 + noise(p * 2.1 + 7.0) * 0.27 + noise(p * 4.2 - 3.0) * 0.12 + noise(p * 8.6 + 1.3) * 0.05;
      }

      float starField(vec3 direction, float height) {
        vec2 grid = vec2(atan(direction.z, direction.x) / 6.2831853 + 0.5,
                         asin(clamp(direction.y, -1.0, 1.0)) / 1.5707963);
        grid *= vec2(256.0, 64.0);
        vec2 cell = floor(grid);
        cell.x = mod(cell.x, 256.0);
        float seed = hash(cell);
        vec2 offset = vec2(hash(cell + 11.7), hash(cell + 43.1)) * 0.48 + 0.26;
        float radius = mix(0.06, 0.19, pow(hash(cell + 5.3), 4.0));      // крупнее мазка кисти, иначе фильтр их стирает
        vec2 delta = fract(grid) - offset;
        // Горизонтальный размер угловой ячейки уменьшается к зениту.
        delta.x *= max(0.3, sqrt(max(0.0, 1.0 - direction.y * direction.y)));
        float aa = clamp(length(fwidth(delta)) * 0.45, 0.008, 0.085);
        float point = 1.0 - smoothstep(radius * 0.3, radius + aa, length(delta));
        // мерцание: у каждой звезды свой темп, яркие дышат заметнее
        float twinkle = 0.72 + 0.28 * sin(uTime * (0.9 + 2.6 * hash(cell + 7.9)) + seed * 91.0);
        twinkle *= 0.9 + 0.1 * sin(uTime * 7.0 * hash(cell + 1.7) + seed * 33.0);
        // у самых ярких — короткие лучики крестом
        float big = step(0.13, radius);
        float cross = big * max(exp(-abs(delta.x) * 34.0 - abs(delta.y) * 5.0), exp(-abs(delta.y) * 34.0 - abs(delta.x) * 5.0)) * 0.55;
        point = max(point, cross) * twinkle;
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

        // Млечный Путь: едва заметная светлая полоса через зенит
        float band = exp(-pow(dot(direction, normalize(vec3(0.55, 0.25, -0.8))) * 3.2, 2.0));
        color += vec3(0.05, 0.05, 0.11) * band * (0.5 + 0.5 * noise(direction.xz * 9.0 + direction.y * 5.0)) * smoothstep(0.1, 0.5, height);

        // Луна: серп с пепельным светом тёмной стороны и нарисованными «морями»
        vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDirection));
        vec3 moonUp = cross(uMoonDirection, moonRight);
        float moonMask = step(0.0, dot(direction, uMoonDirection));
        vec2 moon = vec2(dot(direction, moonRight), dot(direction, moonUp)) / 0.027;
        float r = length(moon);
        float edge = max(fwidth(r), 0.01);
        float disk = (1.0 - smoothstep(1.0 - edge, 1.0 + edge, r)) * moonMask;
        float cut = smoothstep(0.93 - edge, 0.93 + edge, length(moon - vec2(0.43, 0.20)));
        // ореол в три кольца, как на акварели: каждое шире и слабее
        float halo = (exp(-r * 0.52) + 0.5 * smoothstep(3.4, 2.6, r) * 0.22 + smoothstep(7.5, 4.5, r) * 0.07) * moonMask;

        // Облака в два слоя: дальние гряды плывут медленно, ближние клочья — быстрее.
        // Край, обращённый к луне, светлый; низ у горизонта тёплый от огней города.
        vec2 sky2 = direction.xz / (height + 0.38);
        vec2 toMoon = normalize(uMoonDirection.xz / (uMoonDirection.y + 0.38) - sky2 + 1e-4);
        float fade = smoothstep(0.02, 0.15, height) * (1.0 - smoothstep(0.5, 0.92, height));
        vec3 cloudCol = vec3(0.0); float cloudA = 0.0;
        for (int layer = 0; layer < 2; layer++) {
          float k = float(layer);
          vec2 p = sky2 * mix(vec2(2.2, 4.8), vec2(4.6, 8.4), k) + mix(vec2(0.0045, -0.0018), vec2(0.011, -0.006), k) * uTime + k * 17.0;
          p.y += noise(p * 0.65) * 1.7;
          float d = cloudShape(p), dLit = cloudShape(p + toMoon * 0.22);
          float a = smoothstep(0.54, 0.66 + 0.1 * k, d) * fade * uCloudOpacity * mix(1.0, 0.55, k);
          float rim = smoothstep(0.015, 0.075, d - dLit);                 // плотность падает в сторону луны — это освещённый край
          float core = smoothstep(0.56, 0.74, d);                         // плотная середина темнее
          vec3 c = mix(uCloudColor * 0.92, uCloudColor * 0.6, core);
          c = mix(c, mix(uCloudColor * 1.35, vec3(0.74, 0.72, 0.9), 0.45), rim * (0.55 + 0.45 * min(halo * 4.0, 1.0)));
          c = mix(c, c + vec3(0.2, 0.09, 0.07) * uCityGlow * 2.2, exp(-height * 7.0));
          cloudCol = mix(cloudCol, c, a / max(a + cloudA * (1.0 - a), 1e-4));
          cloudA = a + cloudA * (1.0 - a);
        }

        float stars = starField(direction, height) * (1.0 - disk) * (1.0 - cloudA) * uStarIntensity;
        color += mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.86, 0.7), step(0.8, hash(floor(direction.xz * 91.0)))) * stars * 1.05;
        color += vec3(0.31, 0.28, 0.19) * halo * 0.24;
        vec3 moonLit = vec3(0.9, 0.8, 0.58) * (0.9 + 0.14 * noise(moon * 2.3 + 4.0) - 0.1 * smoothstep(0.5, 0.62, noise(moon * 1.3 + 9.0)));
        color = mix(color, mix(color + vec3(0.05, 0.055, 0.09), moonLit, cut), disk);
        color = mix(color, cloudCol, cloudA * 0.82 * (1.0 - disk * cut * 0.6));
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
