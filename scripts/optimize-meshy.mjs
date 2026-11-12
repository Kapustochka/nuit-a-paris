// optimize-meshy.mjs — лёгкая копия модели Meshy для assets/street/.
// Убирает скелет и анимации, упрощает сетку (meshoptimizer), пересчитывает гладкие нормали,
// уменьшает текстуры и переводит их в WebP, сжимает геометрию EXT_meshopt_compression.
//
// Установка (один раз, в папке игры; node_modules/ в .gitignore):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp draco3dgltf
// Запуск из папки игры:
//   node scripts/optimize-meshy.mjs <исходник.glb> <assets/street/имя.glb> <треугольники> <базовая текстура> <остальные текстуры, 0 = убрать>
//   ERR=0.08 — допустимая ошибка упрощения (доля размера модели).
//
// Параметры моделей из ноября 2026 (исходник Meshy → файл в игре):
//   chair-rattan   Zigzag_Woven_Rattan_B…      3000  1024 512   bicycle-red    Crimson_Cruiser…        6000 1024 512
//   bistro-table   White_Italian_Carrara…      4000  1024 512   bicycle-black  Bicycle…                6000 1024 0
//   croissant      Realistic_Bakery_Croi…      3000   512   0   scooter-red    Red_scooter…            5000 1024 0
//   kiosk          J_aimerais_dans_une_s…     10000  1024 512   scooter-lime   Vintage_Lime_Scooter…   5000 1024 512
//   newspaper      A_discarded_partiall…       2500   512   0   cat            Whisker_Paws…           6000 1024 0
//   trash-bin      Green_Park_Trash_Bin…       2000  1024 512   rat            Eine_Ratte…             3000  512 0
//   flower-pot     Blossoms_in_a_Pot…          3000  1024 512   fruit-crate    A_sturdy_wooden_fruit…  4000 1024 512
//   lamp-ornate    Ornate_Vintage_Lamppo…      4000  1024   0   lamp-lantern   Vintage_Lantern_Post…   2000 1024 512
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, flatten, unpartition, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const [inp, out, target = '8000', baseTex = '1024', otherTex = '512'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const root = doc.getRoot();
for (const s of root.listSkins()) s.dispose();
for (const a of root.listAnimations()) a.dispose();
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { p.setAttribute('JOINTS_0', null); p.setAttribute('WEIGHTS_0', null); p.setAttribute('NORMAL', null); p.setAttribute('TANGENT', null); p.setAttribute('COLOR_0', null); const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
await doc.transform(dedup(), flatten(), weld());
await MeshoptSimplifier.ready;
const ratio = Math.min(1, +target / tris);
if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: +(process.env.ERR || 0.02), lockBorder: false }));
// Если обычное упрощение упёрлось в швы развёртки, разрешаем схлопывать швы (Permissive), сверяя UV
{
  let now = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) now += p.getIndices().getCount() / 3;
  if (now > +target * 1.3) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices();
    const want = Math.floor(idx.getCount() * (+target / now) / 3) * 3;
    const uv = p.getAttribute('TEXCOORD_0');
    const [out] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(idx.getArray()), new Float32Array(pos.getArray()), 3,
      new Float32Array(uv.getArray()), 2, [0.5, 0.5], null, want, 0.08, ['Permissive']);
    idx.setArray(new Uint32Array(out));
  }
  await doc.transform(prune());
}
// Гладкие нормали: усредняем по совпадающим позициям, чтобы швы UV не давали рёбер
for (const m of root.listMeshes()) for (const prim of m.listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), n = pos.getCount();
  const P = pos.getArray(), key = new Int32Array(n), map = new Map();
  for (let i = 0; i < n; i++) { const k = `${P[i*3].toFixed(5)},${P[i*3+1].toFixed(5)},${P[i*3+2].toFixed(5)}`; if (!map.has(k)) map.set(k, map.size); key[i] = map.get(k); }
  const acc = new Float32Array(map.size * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t+1], c = idx[t+2];
    const ux = P[b*3]-P[a*3], uy = P[b*3+1]-P[a*3+1], uz = P[b*3+2]-P[a*3+2], vx = P[c*3]-P[a*3], vy = P[c*3+1]-P[a*3+1], vz = P[c*3+2]-P[a*3+2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    for (const v of [a, b, c]) { const k = key[v]*3; acc[k] += nx; acc[k+1] += ny; acc[k+2] += nz; }
  }
  const N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = key[i]*3, l = Math.hypot(acc[k], acc[k+1], acc[k+2]) || 1; N[i*3] = acc[k]/l; N[i*3+1] = acc[k+1]/l; N[i*3+2] = acc[k+2]/l; }
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(pos.getBuffer()));
}
const other = +otherTex;
for (const mat of root.listMaterials()) {
  mat.setEmissiveTexture(null); mat.setEmissiveFactor([0,0,0]); mat.setOcclusionTexture(null);
  if (!other) { mat.setNormalTexture(null); mat.setMetallicRoughnessTexture(null); mat.setOcclusionTexture(null); mat.setEmissiveTexture(null); mat.setEmissiveFactor([0,0,0]); mat.setMetallicFactor(0); mat.setRoughnessFactor(0.85); }
}
await doc.transform(prune());
const base = new Set(root.listMaterials().map(m => m.getBaseColorTexture()).filter(Boolean));
for (const t of root.listTextures()) {
  const n = base.has(t) ? +baseTex : other;
  const img = await sharp(Buffer.from(t.getImage())).resize(n, n, { fit: 'inside' }).webp({ quality: base.has(t) ? 82 : 75 }).toBuffer();
  t.setImage(new Uint8Array(img)).setMimeType('image/webp');
  t.setURI('');
}
await doc.transform(prune(), unpartition());
let after = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) after += p.getIndices().getCount() / 3;
await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log(`${out.split('/').pop()}: ${Math.round(tris)} -> ${Math.round(after)} tris`);
