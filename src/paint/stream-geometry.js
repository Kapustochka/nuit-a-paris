import * as THREE from 'three';

// Buffer conversion and normal generation are resumable; cancelling releases partial geometry.
export function* streamGeometry(B, normals = false, crease = 0) {
  const g = new THREE.BufferGeometry();
  let complete = false;
  try {
    for (const [name, values, size] of [['position', B.pos, 3], ['color', B.col, 3], ['uv', B.uv, 2], ['aKind', B.kind, 1], ['aRand', B.rand, 1]]) {
      g.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
      yield;
    }
    g.setAttribute('aBase', new THREE.BufferAttribute(new Float32Array(B.kind.length), 1));
    yield;
    if (crease) yield* creasedNormals(g, crease);
    else if (normals) { g.computeVertexNormals(); yield; }
    g.computeBoundingSphere();
    complete = true;
    return g;
  } finally {
    if (!complete) g.dispose();
  }
}

// Same order and Float32 results as Three.js r170 toCreasedNormals, yielded every 128 triangles.
// Adapted from https://github.com/mrdoob/three.js/blob/r170/examples/jsm/utils/BufferGeometryUtils.js
function* creasedNormals(g, angle) {
  const dot = Math.cos(angle), multiplier = (1 + 1e-10) * 1e2;
  const verts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const ab = new THREE.Vector3(), cb = new THREE.Vector3(), face = new THREE.Vector3(), average = new THREE.Vector3();
  const pos = g.attributes.position, map = {};
  const hash = (v) => `${~~(v.x * multiplier)},${~~(v.y * multiplier)},${~~(v.z * multiplier)}`;
  function load(i) {
    for (let k = 0; k < 3; k++) verts[k].fromBufferAttribute(pos, i + k);
    cb.subVectors(verts[2], verts[1]); ab.subVectors(verts[0], verts[1]);
  }
  for (let i = 0; i < pos.count; i += 3) {
    load(i);
    const normal = new THREE.Vector3().crossVectors(cb, ab).normalize();
    for (const v of verts) (map[hash(v)] ||= []).push(normal);
    if (i % 384 === 381) yield;
  }
  const attr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3, false);
  for (let i = 0; i < pos.count; i += 3) {
    load(i); face.crossVectors(cb, ab).normalize();
    for (let k = 0; k < 3; k++) {
      average.set(0, 0, 0);
      for (const normal of map[hash(verts[k])]) if (face.dot(normal) > dot) average.add(normal);
      average.normalize(); attr.setXYZ(i + k, average.x, average.y, average.z);
    }
    if (i % 384 === 381) yield;
  }
  g.setAttribute('normal', attr);
}

/*
MIT License — Three.js, Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
