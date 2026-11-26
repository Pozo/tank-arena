import { CFG } from './config.js';
import { ROWS, COLS, WIDTH, HEIGHT } from './map.js';

const T = CFG.TILE, TAU = Math.PI * 2;
const PICKUP_STYLE = {
  repair: ['#43d17a', '✚'], rapid: ['#ffb300', '»'], triple: ['#ff7043', '⋔'],
  shield: ['#40c4ff', '⛨'], speed: ['#e879f9', '⚡'],
};
const rnd = (a, b) => a + Math.random() * (b - a);

function surface(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'));
  return c;
}

function paintGround(g) {
  g.fillStyle = '#6f8650';
  g.fillRect(0, 0, WIDTH, HEIGHT);
  for (let i = 0; i < 900; i++) {
    const x = rnd(0, WIDTH), y = rnd(0, HEIGHT), r = rnd(20, 90);
    g.fillStyle = Math.random() < 0.5 ? 'rgba(137,160,92,.14)' : 'rgba(74,92,52,.14)';
    g.beginPath(); g.ellipse(x, y, r, r * rnd(0.5, 1), rnd(0, TAU), 0, TAU); g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#86a05c' : '#566c3c';
    g.fillRect(rnd(0, WIDTH), rnd(0, HEIGHT), 3, 3);
  }
}

const steelTile = surface(T, T, g => {
  g.fillStyle = '#59636e'; g.fillRect(0, 0, T, T);
  g.fillStyle = '#8b98a6'; g.fillRect(0, 0, T, 5); g.fillRect(0, 0, 5, T);
  g.fillStyle = '#333b44'; g.fillRect(0, T - 7, T, 7); g.fillRect(T - 5, 0, 5, T);
  g.fillStyle = '#aab6c2';
  for (const [x, y] of [[13, 13], [T - 15, 13], [13, T - 17], [T - 15, T - 17]]) {
    g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
  }
});

const brickTile = surface(T, T, g => {
  g.fillStyle = '#5a342a'; g.fillRect(0, 0, T, T);
  for (let row = 0; row < 4; row++) {
    for (let x = -(row % 2) * 16; x < T; x += 32) {
      g.fillStyle = (row + x / 16) % 3 ? '#b8654a' : '#a65640';
      g.fillRect(x + 2, row * 16 + 2, 29, 13);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 2, row * 16 + 2, 29, 3);
    }
  }
});

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const ground = surface(WIDTH, HEIGHT, paintGround);
  let particles = [], treads = [], shake = 0, last = new Map();
  let cam = { x: 0, y: 0, scale: 1 }, me = null, focus = { x: WIDTH / 2, y: HEIGHT / 2 };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return dpr;
  }

  function spark(n, x, y, color, speed, life, size) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(0.2, 1) * speed;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.5, 1) * life, max: life, size: rnd(0.5, 1) * size, color });
    }
    if (particles.length > 600) particles = particles.slice(-600);
  }

  function addEvents(events, myId) {
    for (const e of events) {
      const near = Math.max(0, 1 - Math.hypot(e.x - focus.x, e.y - focus.y) / 800);
      if (e.type === 'fire') {
        spark(8, e.x, e.y, '#ffe082', 190, 0.16, 7);
        spark(4, e.x, e.y, 'rgba(210,210,210,.5)', 50, 0.5, 9);
      } else if (e.type === 'bounce') spark(7, e.x, e.y, '#fff3b0', 220, 0.2, 3);
      else if (e.type === 'brick') {
        spark(18, e.x, e.y, '#b8654a', 220, 0.55, 8);
        spark(6, e.x, e.y, 'rgba(120,100,90,.6)', 60, 0.8, 18);
      } else if (e.type === 'hit') {
        spark(12, e.x, e.y, '#ffca28', 260, 0.3, 4);
        shake = Math.max(shake, e.id === myId ? 10 : 3 * near);
      } else if (e.type === 'boom') {
        spark(40, e.x, e.y, '#ff9800', 320, 0.6, 10);
        spark(20, e.x, e.y, '#ffeb3b', 180, 0.4, 14);
        spark(24, e.x, e.y, 'rgba(50,50,50,.6)', 90, 1.4, 24);
        spark(14, e.x, e.y, '#222', 380, 0.7, 6);
        shake = Math.max(shake, e.id === myId ? 20 : 12 * near);
      } else if (e.type === 'pickup') spark(16, e.x, e.y, PICKUP_STYLE[e.kind][0], 140, 0.5, 6);
    }
  }

  function drawTank(t, time) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(4, 7, 29, 25, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.rotate(t.a);
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#23261f';
      ctx.beginPath(); ctx.roundRect(-27, side * 17 - 7, 54, 14, 4); ctx.fill();
      ctx.fillStyle = '#4a4f42';
      for (let x = -22; x < 24; x += 9) ctx.fillRect(x, side * 17 - 7, 3, 14);
    }
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.roundRect(-23, -14, 46, 28, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-20, -9, 7, 18);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(17, -9, 3, 6); ctx.fillRect(17, 3, 3, 6);
    ctx.restore();
    ctx.rotate(t.aim);
    ctx.fillStyle = '#2b2f27'; ctx.fillRect(6, -5, 30, 10); ctx.fillRect(32, -6.5, 8, 13);
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.arc(-3, -3, 5, 0, TAU); ctx.fill();
    ctx.restore();

    const shield = t.buff?.type === 'shield';
    if (shield || t.invuln > 0) {
      ctx.strokeStyle = shield ? '#40c4ff' : '#fff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 12);
      ctx.beginPath(); ctx.arc(t.x, t.y, 34, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(t.name, t.x, t.y - 46);
    ctx.fillStyle = '#fff'; ctx.fillText(t.name, t.x, t.y - 46);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(t.x - 24, t.y - 41, 48, 6);
    ctx.fillStyle = t.hp > 50 ? '#5ee27a' : t.hp > 25 ? '#ffca28' : '#ff5252';
    ctx.fillRect(t.x - 23, t.y - 40, 46 * t.hp / CFG.HP, 4);
  }

  function minimap(view, myId, dpr) {
    const s = (canvas.clientWidth < 700 ? 100 : 170) / WIDTH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(12, 12);
    ctx.fillStyle = 'rgba(10,14,10,.65)'; ctx.fillRect(0, 0, WIDTH * s, HEIGHT * s);
    ROWS.forEach((row, r) => {
      for (let c = 0; c < COLS; c++) {
        const wall = row[c] === '#' ? '#8b98a6' : view.bricks.has(r * COLS + c) ? '#b8654a' : null;
        if (!wall) continue;
        ctx.fillStyle = wall;
        ctx.fillRect(c * T * s, r * T * s, T * s + 0.3, T * s + 0.3);
      }
    });
    for (const t of view.tanks) {
      if (!t.alive) continue;
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(t.x * s, t.y * s, t.id === myId ? 4 : 2.8, 0, TAU); ctx.fill();
      if (t.id === myId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }

  function draw(view, myId, dt) {
    const dpr = resize();
    const time = performance.now() / 1000;
    me = view.tanks.find(t => t.id === myId) ?? null;
    if (me) focus = { x: me.x, y: me.y };
    const scale = Math.max(canvas.width / 1400, canvas.height / 900, 0.45 * dpr);
    const vw = canvas.width / scale, vh = canvas.height / scale;
    const clamp = (v, view_, size) => (view_ >= size ? (size - view_) / 2 : Math.max(0, Math.min(size - view_, v - view_ / 2)));
    cam = { x: clamp(focus.x, vw, WIDTH), y: clamp(focus.y, vh, HEIGHT), scale: scale / dpr };
    shake *= Math.pow(0.002, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#171c14'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, (-cam.x + rnd(-shake, shake)) * scale, (-cam.y + rnd(-shake, shake)) * scale);
    ctx.drawImage(ground, 0, 0);

    for (const t of view.tanks) {
      const p = last.get(t.id);
      if (!t.alive) { last.delete(t.id); continue; }
      const moved = p ? Math.hypot(t.x - p.x, t.y - p.y) : 0;
      if (!p || moved > 12) {
        if (p && moved < 80) treads.push({ x: t.x, y: t.y, a: t.a, life: 6 });
        last.set(t.id, { x: t.x, y: t.y });
      }
    }
    treads = treads.filter(p => (p.life -= dt) > 0).slice(-500);
    for (const p of treads) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = `rgba(45,38,22,${0.05 * p.life})`;
      ctx.fillRect(-4, -23, 7, 11); ctx.fillRect(-4, 12, 7, 11);
      ctx.restore();
    }

    for (let r = 0; r < ROWS.length; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = ROWS[r][c] === '#' ? steelTile : view.bricks.has(r * COLS + c) ? brickTile : null;
        if (!tile) continue;
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(c * T + 6, r * T + 8, T, T);
        ctx.drawImage(tile, c * T, r * T);
      }
    }

    for (const p of view.pickups) {
      const [color, icon] = PICKUP_STYLE[p.type];
      const bob = Math.sin(time * 4 + p.x) * 3;
      ctx.globalAlpha = p.t < 4 && Math.sin(time * 14) < 0 ? 0.35 : 1;
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, 17, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#10160f'; ctx.font = '800 21px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icon, p.x, p.y + bob + 1);
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }

    for (const t of view.tanks) if (t.alive) drawTank(t, time);

    ctx.lineCap = 'round';
    for (const s of view.shells) {
      const len = Math.hypot(s.vx, s.vy) || 1;
      ctx.strokeStyle = 'rgba(255,190,60,.55)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(s.x - s.vx / len * 22, s.y - s.vy / len * 22); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath(); ctx.arc(s.x, s.y, CFG.SHELL_R, 0, TAU); ctx.fill();
    }

    particles = particles.filter(p => (p.life -= dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.08, dt); p.vy *= Math.pow(0.08, dt);
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    minimap(view, myId, dpr);
  }

  return {
    draw, addEvents,
    screenToAim(px, py) {
      if (!me) return 0;
      const box = canvas.getBoundingClientRect();
      return Math.atan2(py - box.top - (me.y - cam.y) * cam.scale, px - box.left - (me.x - cam.x) * cam.scale);
    },
    myAngle: () => me?.a ?? 0,
    reset() { particles = []; treads = []; shake = 0; last = new Map(); me = null; focus = { x: WIDTH / 2, y: HEIGHT / 2 }; },
  };
}
