// Static rotated footprints, indexed in the same world coordinates used by blocked().
export function createPropCollisions(padding) {
  const cells = new Map();
  const cellAt = value => Math.floor(value / 8);

  function add(box) {
    const width = box.halfWidth + padding, depth = box.halfDepth + padding;
    const cos = Math.abs(box.cos), sin = Math.abs(box.sin);
    const extentX = width * cos + depth * sin, extentZ = width * sin + depth * cos;
    for (let ix = cellAt(box.x - extentX); ix <= cellAt(box.x + extentX); ix++) {
      let column = cells.get(ix);
      if (!column) {
        column = new Map();
        cells.set(ix, column);
      }
      for (let iz = cellAt(box.z - extentZ); iz <= cellAt(box.z + extentZ); iz++) {
        let boxes = column.get(iz);
        if (boxes) boxes.push(box);
        else column.set(iz, [box]);
      }
    }
  }

  function contains(x, z) {
    const boxes = cells.get(cellAt(x))?.get(cellAt(z));
    if (!boxes) return false;
    for (const box of boxes) {
      const dx = x - box.x, dz = z - box.z;
      if (Math.abs(dx * box.cos - dz * box.sin) < box.halfWidth + padding &&
          Math.abs(dx * box.sin + dz * box.cos) < box.halfDepth + padding) return true;
    }
    return false;
  }
  return { add, contains };
}
