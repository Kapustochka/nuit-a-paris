# Loading and frame stalls

Measured on the real bundled Montmartre map (511 OSM buildings; 487 generated houses). These are Chromium CPU timings, not GPU FPS or physical-phone benchmarks.

| Check | Previous main | This change |
| --- | ---: | ---: |
| Secondary models required before entry | about 38 MB | 0 MB |
| Base chunks required before entry | 63 | 7 |
| Detailed chunks required before entry | 9 | 1 |
| Initial shell/far triangles | 533,166 | 71,345 |
| CPU time to assemble initial world without GLB props | 3,744 ms | 2,511 ms |
| Largest facade-update call on the same nine-point route | 164 ms | 43 ms |
| Facade-update calls longer than 50 ms on that route | 27 | 0 |

The initial map is about 150 KB before transfer compression. Normal startup reads this saved file instead of waiting on Overpass. The two existing passer-by models total about 38 MB: the nearby actor loads after the first frame, while the actor at Sacré-Cœur waits until the player is within 100 m. The heroine loads concurrently with the map and street props.

Facade generation now yields between street segments, attribute conversions, normal batches and foliage groups. Each update targets a 3 ms construction budget; an individual segment, allocation or garbage-collection pause can exceed that budget. Far facades remain visible while their detailed replacement is built. A cancelled partial build is disposed. Nearby base geometry has priority over distant blocks.

The settled city has the same vertex data, normals, mesh count and quality as before. Six browser regression checks cover exact normals, incremental/eager equivalence, cancellation and disposal. Hashes of all 208 generated geometries also match the previous main after completing the real-map route. This moves work across frames; it does not eliminate its total CPU cost.

## Remaining opportunities

1. **Lighter animated assets.** The two pedestrians are still large when eventually loaded. Rig-preserving geometry and texture compression should be measured and reviewed separately; automatic simplification may harm faces, skinning or animation.
2. **The heroine and street props.** Together they still require roughly 12 MB before entry. A smaller validated heroine asset and staged prop replacement could reduce slow-network startup further. Current controls and essential street objects stay available when entry completes.
3. **GPU cost of the painted frame.** The color pass, normal/depth pass and Kuwahara filter remain unchanged. Measure their GPU times on real target phones before changing resolution, sample count or brush radius; those choices visibly affect the approved art style.
4. **Large single allocations.** Segment generation, foliage, GPU uploads and GC can still create smaller spikes. Streaming is a soft budget, not a guarantee of a fixed frame time. A worker-based geometry builder is a possible next step if on-device measurements justify the added complexity.

Screenshots and interaction checks use real WebGL through SwiftShader and touch emulation. CPU-only tests disable rendering to isolate generation cost. Hardware FPS and end-to-end entry time depend on the actual GPU, connection, cache and model parsing.
