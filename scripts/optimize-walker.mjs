// Сжимает модель со скелетом и анимацией: упрощение сетки (доля ratio), текстуры 1024 WebP, meshopt.
// node scripts/optimize-walker.mjs in.glb out.glb 0.12   (нужны те же пакеты, что и для optimize-meshy.mjs)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, resample, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const [,, inp, out, ratio] = process.argv;
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const tris = (d) => d.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
console.log('before', tris(doc));
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.002 }), resample(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
console.log('after', tris(doc));
await io.write(out, doc);
