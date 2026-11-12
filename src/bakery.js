import * as THREE from 'three';

export function buildBakeryCounter(scene, shop, blocked) {
  if (!shop) return null;
  const { nx, nz } = shop;
  const yaw = Math.atan2(nx, nz);
  let placement;
  for (const distance of [1.45, 2.0, 2.55]) {
    for (const side of [0, 0.9, -0.9, 1.6, -1.6]) {
      const x = shop.x + nx * distance + nz * side;
      const z = shop.z + nz * distance - nx * side;
      if ([-0.85, 0, 0.85].every((u) => [-0.38, 0.38, 1.1].every((v) =>
        !blocked(x + nz * u + nx * v, z - nx * u + nz * v)))) {
        placement = { x, z };
        break;
      }
    }
    if (placement) break;
  }
  if (!placement) return null;
  const stand = new THREE.Group();
  stand.name = 'Le comptoir de la boulangerie';
  stand.position.set(placement.x, 0, placement.z);
  stand.rotation.y = yaw;
  const wood = new THREE.MeshStandardMaterial({ color: 0x52333d, roughness: 0.88 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xb47b4c, roughness: 0.7, emissive: 0x271306 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xe4bf98, roughness: 0.68, emissive: 0x2c1810 });
  const wicker = new THREE.MeshStandardMaterial({ color: 0xbb8654, roughness: 0.91, emissive: 0x211405 });
  const crust = new THREE.MeshStandardMaterial({ color: 0xe39a49, roughness: 0.9, emissive: 0x412208 });
  const pastry = new THREE.MeshStandardMaterial({ color: 0xc97a36, roughness: 0.8, emissive: 0x471f06 });
  const score = new THREE.MeshStandardMaterial({ color: 0xf3bf7c, roughness: 0.86, emissive: 0x3a200c });

  function mesh(geometry, material, x, y, z, word) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.userData.word = word;
    stand.add(object);
    return object;
  }
  mesh(new THREE.BoxGeometry(1.68, 0.82, 0.53), wood, 0, 0.47, 0, 'counter');
  mesh(new THREE.BoxGeometry(1.81, 0.095, 0.65), stone, 0, 0.925, 0, 'counter');
  mesh(new THREE.BoxGeometry(1.59, 0.045, 0.03), trim, 0, 0.17, 0.274, 'counter');
  for (const x of [-0.76, 0.76]) mesh(new THREE.BoxGeometry(0.035, 0.66, 0.03), trim, x, 0.52, 0.275, 'counter');

  const label = document.createElement('canvas');
  label.width = 512;
  label.height = 128;
  const pen = label.getContext('2d');
  pen.fillStyle = '#3f2936';
  pen.fillRect(0, 0, 512, 128);
  pen.strokeStyle = '#c6925e';
  pen.lineWidth = 4;
  pen.strokeRect(10, 10, 492, 108);
  pen.fillStyle = '#f6d5a4';
  pen.font = '600 39px Georgia';
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.fillText('BOULANGERIE', 256, 66);
  const labelMap = new THREE.CanvasTexture(label);
  labelMap.colorSpace = THREE.SRGBColorSpace;
  mesh(new THREE.PlaneGeometry(1.32, 0.33), new THREE.MeshBasicMaterial({ map: labelMap }), 0, 0.62, 0.282, 'bakery');

  const pastryLift = 0.23;
  mesh(new THREE.CylinderGeometry(0.10, 0.17, pastryLift, 18), trim, 0, 1 + pastryLift / 2, 0, 'counter');
  for (const x of [-0.57, 0, 0.57]) {
    const y = x === 0 ? pastryLift : 0;
    mesh(new THREE.CylinderGeometry(0.265, 0.22, 0.035, 22), wicker, x, 1.004 + y, 0, 'basket');
    const rim = mesh(new THREE.TorusGeometry(0.245, 0.02, 8, 24), wicker, x, 1.04 + y, 0, 'basket');
    rim.rotation.x = Math.PI / 2;
    rim.scale.y = 0.86;
  }

  const loafGeo = new THREE.CapsuleGeometry(0.054, 0.34, 5, 12).rotateZ(Math.PI / 2);
  const slashGeo = new THREE.CapsuleGeometry(0.009, 0.036, 3, 7).rotateZ(Math.PI / 2);
  for (const [y, z] of [[1.09, -0.10], [1.07, 0.045], [1.14, -0.035]]) {
    const bread = mesh(loafGeo, crust, -0.57, y, z, 'baguette');
    bread.rotation.y = 0.14;
    bread.userData.bakeryChoice = true;
    for (const x of [-0.12, 0, 0.12]) {
      const slash = new THREE.Mesh(slashGeo, score);
      slash.position.set(x, 0.051, 0);
      slash.rotation.y = -0.58;
      slash.userData.word = 'baguette';
      slash.userData.bakeryChoice = true;
      bread.add(slash);
    }
  }

  const sphere = new THREE.SphereGeometry(1, 14, 9);
  for (const offset of [-0.11, 0.08]) {
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.38, thickness = 0.058 - Math.abs(i) * 0.012;
      const curl = mesh(sphere, i % 2 ? crust : pastry, Math.sin(a) * 0.13, 1.045 + pastryLift + thickness * 0.57,
        offset + (1 - Math.cos(a)) * 0.10, 'croissant');
      curl.scale.set(thickness * 1.12, thickness, thickness * 1.08);
      curl.userData.bakeryChoice = true;
    }
  }
  const round = mesh(sphere, crust, 0.57, 1.10, 0, 'loaf');
  round.scale.set(0.17, 0.092, 0.15);
  round.userData.bakeryChoice = true;
  for (const z of [-0.04, 0.035]) {
    const slash = mesh(slashGeo, score, 0.57, 1.189, z, 'loaf');
    slash.scale.x = 2.8;
    slash.userData.bakeryChoice = true;
  }

  scene.add(stand);
  return {
    ...placement, name: shop.name, stand,
    blocks(x, z) {
      const dx = x - placement.x, dz = z - placement.z;
      return Math.abs(dx * nz - dz * nx) < 1.08 && Math.abs(dx * nx + dz * nz) < 0.57;
    },
  };
}
