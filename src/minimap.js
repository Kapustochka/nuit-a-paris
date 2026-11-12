// minimap.js — круглая мини-карта в углу, как в GTA: вращается вместе с камерой, героиня в центре
export function createMinimap(el, data) {
  const S = 2.2;                                  // пикселей на метр на большой карте
  const b = data.bounds, W = Math.ceil((b.maxX - b.minX) * S), H = Math.ceil((b.maxZ - b.minZ) * S);
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  const g = big.getContext('2d');
  const X = (x) => (x - b.minX) * S, Z = (z) => (z - b.minZ) * S;

  g.fillStyle = '#241c4a'; g.fillRect(0, 0, W, H);
  // улицы
  g.lineCap = g.lineJoin = 'round';
  const WIDTH = { primary: 9, secondary: 8, tertiary: 7, residential: 6, living_street: 6, pedestrian: 6, unclassified: 6, footway: 2.5, path: 2.5, steps: 3 };
  for (const pass of [0, 1]) for (const r of data.roads) {
    const w = (WIDTH[r.k] || 3) * S * 0.9; if ((w > 8) !== (pass === 1)) continue;
    g.strokeStyle = r.k === 'steps' ? '#8d7fb0' : w > 8 ? '#6f66a6' : '#4d457e'; g.lineWidth = w;
    if (r.k === 'steps') g.setLineDash([2, 3]); else g.setLineDash([]);
    g.beginPath();
    for (let i = 0; i < r.p.length; i += 2) i ? g.lineTo(X(r.p[i]), Z(r.p[i + 1])) : g.moveTo(X(r.p[i]), Z(r.p[i + 1]));
    g.stroke();
  }
  g.setLineDash([]);
  // дома
  g.fillStyle = '#d9c3a0'; g.strokeStyle = '#7a6a78'; g.lineWidth = 1;
  for (const bd of data.buildings) {
    g.beginPath();
    for (let i = 0; i < bd.p.length; i += 2) i ? g.lineTo(X(bd.p[i]), Z(bd.p[i + 1])) : g.moveTo(X(bd.p[i]), Z(bd.p[i + 1]));
    g.closePath(); g.fill(); g.stroke();
  }
  // деревья и кафе
  g.fillStyle = '#5f9a5a';
  for (let i = 0; i < data.trees.length; i += 2) { g.beginPath(); g.arc(X(data.trees[i]), Z(data.trees[i + 1]), 3, 0, 6.3); g.fill(); }
  for (const p of data.pois) {
    g.fillStyle = p.k === 'bakery' ? '#ffcf5a' : '#e0456a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(p.x), Z(p.z), 4.5, 0, 6.3); g.fill(); g.stroke();
  }

  const ctx = el.getContext('2d');
  let goal = null;
  function drawGoal(context, x, y, size) {
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = '#ffdc82';
    context.strokeStyle = '#412a38';
    context.lineWidth = size / 3;
    context.fillRect(-size, -size, 2 * size, 2 * size);
    context.strokeRect(-size, -size, 2 * size, 2 * size);
    context.restore();
  }
  let size = 0;
  function resize() {
    const css = el.clientWidth || 150, dpr = Math.min(devicePixelRatio || 1, 2);
    size = Math.round(css * dpr); el.width = el.height = size;
  }
  resize(); addEventListener('resize', resize);

  function update(x, z, facing, yaw) {
    const R = size / 2, zoom = size / (95 * S);   // в кружке видно около 95 метров
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); ctx.arc(R, R, R - 3, 0, 6.3); ctx.clip();
    ctx.fillStyle = '#241c4a'; ctx.fillRect(0, 0, size, size);
    ctx.translate(R, R); ctx.rotate(yaw); ctx.scale(zoom, zoom); ctx.translate(-X(x), -Z(z));
    ctx.drawImage(big, 0, 0);
    if (goal) drawGoal(ctx, X(goal.x), Z(goal.z), 4 / zoom);
    ctx.restore();
    // героиня — стрелка
    ctx.save();
    ctx.translate(R, R); ctx.rotate(Math.PI - (facing - yaw));
    const a = size * 0.075;
    ctx.fillStyle = '#ff5a8a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.014;
    ctx.beginPath(); ctx.moveTo(0, -a * 1.25); ctx.lineTo(a * 0.85, a); ctx.lineTo(0, a * 0.5); ctx.lineTo(-a * 0.85, a); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // ободок и «N»
    ctx.strokeStyle = 'rgba(246,223,180,0.9)'; ctx.lineWidth = size * 0.022;
    ctx.beginPath(); ctx.arc(R, R, R - size * 0.022, 0, 6.3); ctx.stroke();
    const nx = R + Math.sin(yaw) * (R - size * 0.11), ny = R - Math.cos(yaw) * (R - size * 0.11);
    ctx.fillStyle = '#14103a'; ctx.beginPath(); ctx.arc(nx, ny, size * 0.065, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#f6dfb4'; ctx.font = `700 ${size * 0.085}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + size * 0.005);
  }
  // ── Большая карта (клавиша M или нажатие на мини-карту) ───────
  const overlay = document.getElementById('bigmap'), bc = overlay.querySelector('canvas'), bctx = bc.getContext('2d');
  let labeled = null, open = false;
  function buildLabeled() {
    const K = 2;                                   // вдвое крупнее мини-карты, чтобы подписи были чёткими
    const c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
    const q = c.getContext('2d');
    q.imageSmoothingQuality = 'high'; q.drawImage(big, 0, 0, W * K, H * K);
    q.textAlign = 'center'; q.textBaseline = 'middle'; q.lineJoin = 'round';
    // названия улиц: по самому длинному отрезку каждой улицы
    const byName = new Map();
    for (const r of data.roads) {
      if (!r.n) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const dx = r.p[i + 2] - r.p[i], dz = r.p[i + 3] - r.p[i + 1], len = Math.hypot(dx, dz);
        const cur = byName.get(r.n);
        if (!cur || len > cur.len) byName.set(r.n, { len, x: (r.p[i] + r.p[i + 2]) / 2, z: (r.p[i + 1] + r.p[i + 3]) / 2, a: Math.atan2(dz, dx) });
      }
    }
    q.font = 'italic 600 19px Georgia, serif';
    for (const [name, s] of byName) {
      let a = s.a; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      q.save(); q.translate(X(s.x) * K, Z(s.z) * K); q.rotate(a);
      q.strokeStyle = 'rgba(20,16,58,0.9)'; q.lineWidth = 5; q.strokeText(name, 0, 0);
      q.fillStyle = '#fff3d6'; q.fillText(name, 0, 0); q.restore();
    }
    // названия кафе рядом с центром
    q.font = '600 14px Georgia, serif';
    for (const p of data.pois) {
      if (!p.n || Math.hypot(p.x, p.z) > 130) continue;
      q.strokeStyle = 'rgba(20,16,58,0.9)'; q.lineWidth = 4; q.strokeText(p.n, X(p.x) * K, Z(p.z) * K - 14);
      q.fillStyle = p.k === 'bakery' ? '#ffe08a' : '#ffb3c6'; q.fillText(p.n, X(p.x) * K, Z(p.z) * K - 14);
    }
    return { c, K };
  }
  function toggleBig(force) {
    open = force === undefined ? !open : force;
    overlay.style.display = open ? 'grid' : 'none';
    if (open && !labeled) labeled = buildLabeled();
  }
  function drawBig(x, z, facing) {
    const dpr = Math.min(devicePixelRatio || 1, 2), cw = Math.round(bc.clientWidth * dpr), ch = Math.round(bc.clientHeight * dpr);
    if (bc.width !== cw || bc.height !== ch) { bc.width = cw; bc.height = ch; }
    const { c, K } = labeled, sc = Math.min(cw / c.width, ch / c.height), ox = (cw - c.width * sc) / 2, oy = (ch - c.height * sc) / 2;
    bctx.clearRect(0, 0, cw, ch);
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(c, ox, oy, c.width * sc, c.height * sc);
    if (goal) drawGoal(bctx, ox + X(goal.x) * K * sc, oy + Z(goal.z) * K * sc, 7 * dpr);
    const hx = ox + X(x) * K * sc, hy = oy + Z(z) * K * sc, a = Math.max(11, cw * 0.012) * dpr / dpr;
    const pulse = 1 + 0.25 * Math.sin(performance.now() / 250);
    bctx.strokeStyle = 'rgba(255,90,138,0.55)'; bctx.lineWidth = 3; bctx.beginPath(); bctx.arc(hx, hy, a * 2.1 * pulse, 0, 6.3); bctx.stroke();
    bctx.save(); bctx.translate(hx, hy); bctx.rotate(Math.PI - facing);      // север сверху
    bctx.fillStyle = '#ff5a8a'; bctx.strokeStyle = '#fff'; bctx.lineWidth = 2.5;
    bctx.beginPath(); bctx.moveTo(0, -a * 1.3); bctx.lineTo(a * 0.9, a); bctx.lineTo(0, a * 0.5); bctx.lineTo(-a * 0.9, a); bctx.closePath(); bctx.fill(); bctx.stroke();
    bctx.restore();
  }
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) toggleBig(); if (e.code === 'Escape') toggleBig(false); });
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toggleBig(); });
  overlay.addEventListener('pointerdown', () => toggleBig(false));

  return { update, drawBig, toggleBig, setGoal(point) { goal = point; }, get bigOpen() { return open; } };
}
