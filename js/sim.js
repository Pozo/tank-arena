import { CFG, COLORS } from './config.js';
import { SPAWNS, PICKUP_SPOTS, tileAt, tileIndex, freshBricks } from './map.js';

export function createState(rand = Math.random) {
  return {
    time: 0, tanks: [], shells: [], bricks: freshBricks(), pickups: [], events: [],
    phase: 'playing', timeLeft: CFG.ROUND_TIME, winner: null, rand,
    nextId: 1, intermission: 0,
    spotWait: PICKUP_SPOTS.map(() => CFG.PICKUP_WAIT),
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

const PICKUPS = { repair: 0, rapid: 8, triple: 8, shield: 6, speed: 8 };

export function removeTank(state, id) {
  state.tanks = state.tanks.filter(t => t.id !== id);
  state.shells = state.shells.filter(s => s.owner !== id);
}

export function restartRound(state) {
  Object.assign(state, {
    shells: [], pickups: [], bricks: freshBricks(), phase: 'playing',
    timeLeft: CFG.ROUND_TIME, winner: null,
    spotWait: PICKUP_SPOTS.map(() => CFG.PICKUP_WAIT),
  });
  for (const t of state.tanks) t.alive = false;
  for (const t of state.tanks) {
    Object.assign(t, { kills: 0, deaths: 0 });
    place(state, t);
  }
}

function endRound(state) {
  const top = [...state.tanks].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
  Object.assign(state, { phase: 'over', winner: top?.name ?? null, intermission: CFG.INTERMISSION, shells: [] });
}

const emit = (state, type, x, y, extra) => state.events.push({ type, x, y, ...extra });

function fire(state, tank) {
  const triple = tank.buff?.type === 'triple';
  for (const off of triple ? [-0.15, 0, 0.15] : [0]) {
    const a = tank.aim + off;
    // Starts at the tank centre so a barrel poking into a wall cannot fire through it.
    state.shells.push({
      id: state.nextId++, owner: tank.id, x: tank.x, y: tank.y,
      vx: Math.cos(a) * CFG.SHELL_SPEED, vy: Math.sin(a) * CFG.SHELL_SPEED,
      life: CFG.SHELL_LIFE, bounces: 1,
    });
  }
  tank.reload = tank.buff?.type === 'rapid' ? 0.3 : CFG.RELOAD;
  tank.invuln = 0;
  emit(state, 'fire', tank.x + Math.cos(tank.aim) * 34, tank.y + Math.sin(tank.aim) * 34, { a: tank.aim });
}

function damage(state, victim, ownerId) {
  if (victim.invuln > 0 || victim.buff?.type === 'shield') return;
  victim.hp -= CFG.DAMAGE;
  emit(state, 'hit', victim.x, victim.y, { id: victim.id });
  if (victim.hp > 0) return;
  Object.assign(victim, { hp: 0, alive: false, respawn: CFG.RESPAWN, buff: null });
  victim.deaths++;
  const killer = state.tanks.find(t => t.id === ownerId);
  if (killer) killer.kills++;
  emit(state, 'boom', victim.x, victim.y, { id: victim.id, victim: victim.name, killer: killer?.name ?? '?' });
  if (killer && killer.kills >= CFG.KILL_LIMIT) endRound(state);
}

// Returns false when the shell is spent. h must be small enough to move less than a shell diameter or so.
function moveShell(state, s, h) {
  s.life -= h;
  if (s.life <= 0) return false;
  const nx = s.x + s.vx * h, ny = s.y + s.vy * h;
  const tile = tileAt(state.bricks, nx, ny);
  if (tile === 'B') {
    state.bricks.delete(tileIndex(nx, ny));
    emit(state, 'brick', nx, ny);
    return false;
  }
  if (tile === '#') {
    if (s.bounces-- <= 0) return false;
    const hitX = tileAt(state.bricks, nx, s.y) !== '.';
    const hitY = tileAt(state.bricks, s.x, ny) !== '.';
    if (hitX || !hitY) s.vx = -s.vx;
    if (hitY || !hitX) s.vy = -s.vy;
    emit(state, 'bounce', s.x, s.y);
    return true;
  }
  s.x = nx; s.y = ny;
  const victim = state.tanks.find(t => t.alive && t.id !== s.owner
    && Math.hypot(t.x - nx, t.y - ny) < CFG.TANK_R + CFG.SHELL_R);
  if (!victim) return true;
  damage(state, victim, s.owner);
  return false;
}

function applyPickup(tank, type) {
  if (type === 'repair') tank.hp = Math.min(CFG.HP, tank.hp + 50);
  else tank.buff = { type, t: PICKUPS[type] };
}

function stepPickups(state, h) {
  for (const p of state.pickups) {
    p.t -= h;
    const taker = state.tanks.find(t => t.alive && Math.hypot(t.x - p.x, t.y - p.y) < CFG.TANK_R + 16);
    if (taker) {
      applyPickup(taker, p.type);
      emit(state, 'pickup', p.x, p.y, { id: taker.id, kind: p.type });
      p.t = 0;
    }
    if (p.t <= 0) state.spotWait[p.spot] = CFG.PICKUP_WAIT;
  }
  state.pickups = state.pickups.filter(p => p.t > 0);
  PICKUP_SPOTS.forEach((pos, spot) => {
    if (state.pickups.some(p => p.spot === spot)) return;
    state.spotWait[spot] -= h;
    if (state.spotWait[spot] > 0) return;
    const types = Object.keys(PICKUPS);
    const type = types[Math.floor(state.rand() * types.length)];
    state.pickups.push({ type, spot, x: pos.x, y: pos.y, t: CFG.PICKUP_LIFE });
  });
}

function tick(state, inputs, h) {
  state.time += h;
  if (state.phase === 'over') {
    state.intermission -= h;
    if (state.intermission <= 0) restartRound(state);
    return;
  }
  for (const t of state.tanks) {
    if (!t.alive) {
      t.respawn -= h;
      if (t.respawn <= 0) place(state, t);
      continue;
    }
    t.reload = Math.max(0, t.reload - h);
    t.invuln = Math.max(0, t.invuln - h);
    if (t.buff && (t.buff.t -= h) <= 0) t.buff = null;
    const input = inputs[t.id];
    if (!input) continue;
    moveTank(state, t, input, h);
    if (input.fire && t.reload <= 0) fire(state, t);
  }
  state.shells = state.shells.filter(s => moveShell(state, s, h));
  if (state.phase !== 'playing') { state.shells = []; return; }
  stepPickups(state, h);
  state.timeLeft = Math.max(0, state.timeLeft - h);
  if (state.timeLeft === 0) endRound(state);
}

export function step(state, inputs, dt) {
  const n = Math.max(1, Math.ceil(dt / CFG.MAX_STEP - 1e-9));
  for (let i = 0; i < n; i++) tick(state, inputs, dt / n);
}
