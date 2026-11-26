import { CFG, COLORS } from './config.js';
import { SPAWNS, tileAt, freshBricks } from './map.js';

export function createState(rand = Math.random) {
  return {
    time: 0, tanks: [], shells: [], bricks: freshBricks(), pickups: [], events: [],
    phase: 'playing', timeLeft: CFG.ROUND_TIME, winner: null, rand,
  };
}

// Spawn point farthest from every living enemy; random among ties.
function spawnPoint(state, self) {
  let best = [], bestD = -1;
  for (const p of SPAWNS) {
    let d = Infinity;
    for (const t of state.tanks) {
      if (t !== self && t.alive) d = Math.min(d, Math.hypot(t.x - p.x, t.y - p.y));
    }
    if (d > bestD) { bestD = d; best = [p]; } else if (d === bestD) best.push(p);
  }
  return best[Math.floor(state.rand() * best.length)];
}

function place(state, tank) {
  const p = spawnPoint(state, tank);
  const a = p.x < 1280 ? 0 : Math.PI;
  Object.assign(tank, {
    x: p.x, y: p.y, a, aim: a, hp: CFG.HP, alive: true,
    reload: 0, respawn: 0, invuln: CFG.INVULN, buff: null,
  });
}

export function addTank(state, { id, name, bot = false }) {
  if (state.tanks.length >= CFG.MAX_TANKS) return null;
  const color = COLORS.find(c => !state.tanks.some(t => t.color === c));
  const tank = { id, name, bot, color, kills: 0, deaths: 0 };
  place(state, tank);
  state.tanks.push(tank);
  return tank;
}

function pushOut(tank, px, py, min) {
  const dx = tank.x - px, dy = tank.y - py, d = Math.hypot(dx, dy);
  if (d >= min || d === 0) return;
  tank.x = px + (dx / d) * min;
  tank.y = py + (dy / d) * min;
}

function collideWalls(state, tank) {
  const T = CFG.TILE, R = CFG.TANK_R;
  for (let r = Math.floor((tank.y - R) / T); r <= Math.floor((tank.y + R) / T); r++) {
    for (let c = Math.floor((tank.x - R) / T); c <= Math.floor((tank.x + R) / T); c++) {
      if (tileAt(state.bricks, (c + 0.5) * T, (r + 0.5) * T) === '.') continue;
      pushOut(tank, Math.max(c * T, Math.min(tank.x, (c + 1) * T)),
        Math.max(r * T, Math.min(tank.y, (r + 1) * T)), R);
    }
  }
}

export function moveTank(state, tank, input, dt) {
  const n = Math.max(1, Math.ceil(dt / CFG.MAX_STEP - 1e-9));
  const h = dt / n;
  const speed = CFG.SPEED * (tank.buff?.type === 'speed' ? 1.5 : 1);
  tank.aim = input.aim;
  for (let i = 0; i < n; i++) {
    tank.a += input.turn * CFG.TURN * h;
    tank.x += Math.cos(tank.a) * input.fwd * speed * h;
    tank.y += Math.sin(tank.a) * input.fwd * speed * h;
    for (const o of state.tanks) {
      if (o.id !== tank.id && o.alive) pushOut(tank, o.x, o.y, CFG.TANK_R * 2);
    }
    collideWalls(state, tank); // walls last: a tank must never end up inside one
  }
}
