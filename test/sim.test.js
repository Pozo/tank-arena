import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../js/config.js';
import { ROWS, SPAWNS, PICKUP_SPOTS, tileAt, freshBricks } from '../js/map.js';
import { createState, addTank, moveTank } from '../js/sim.js';

const drive = { fwd: 1, turn: 0, aim: 0, fire: false };

test('map is 40x28, bordered, with 8 spawns', () => {
  assert.equal(ROWS.length, 28);
  assert.ok(ROWS.every(r => r.length === 40 && r[0] === '#' && r[39] === '#'));
  assert.ok(SPAWNS.length >= 8);
  assert.ok(PICKUP_SPOTS.length >= 4);
});
test('every spawn and pickup spot is reachable without breaking steel', () => {
  const seen = new Set(), todo = [[1, 1]];
  while (todo.length) {
    const [c, r] = todo.pop();
    if (seen.has(r * 40 + c) || ROWS[r][c] === '#') continue;
    seen.add(r * 40 + c);
    todo.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  for (const p of [...SPAWNS, ...PICKUP_SPOTS]) {
    assert.ok(seen.has(Math.floor(p.y / 64) * 40 + Math.floor(p.x / 64)));
  }
});
test('outside the map counts as steel', () => {
  assert.equal(tileAt(freshBricks(), -5, 100), '#');
  assert.equal(tileAt(freshBricks(), 1e9, 100), '#');
});
test('ninth tank is refused', () => {
  const s = createState();
  for (let i = 0; i < 8; i++) assert.ok(addTank(s, { id: 'p' + i, name: 'n' }));
  assert.equal(addTank(s, { id: 'p8', name: 'n' }), null);
});
test('driving moves along hull angle', () => {
  const s = createState(); const t = addTank(s, { id: 'a', name: 'a' });
  Object.assign(t, { x: 96, y: 96, a: 0 });
  moveTank(s, t, drive, 0.1);
  assert.ok(Math.abs(t.x - 118) < 0.5);
});
test('a huge step does not pass through a wall', () => {
  const s = createState(); const t = addTank(s, { id: 'a', name: 'a' });
  Object.assign(t, { x: 96, y: 96, a: Math.PI });
  moveTank(s, t, drive, 5);
  assert.ok(t.x >= 64 + CFG.TANK_R - 0.5);
});

// ---- combat ----
import { step, removeTank } from '../js/sim.js';
import { tileIndex } from '../js/map.js';

const idle = { fwd: 0, turn: 0, aim: 0, fire: false };
const shoot = aim => ({ ...idle, aim, fire: true });
const run = (s, seconds, inputs = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(s, inputs, 1 / 60);
};
function duel() {
  const s = createState(() => 0);
  const a = addTank(s, { id: 'a', name: 'a' }), b = addTank(s, { id: 'b', name: 'b' });
  Object.assign(a, { x: 96, y: 96, a: 0, invuln: 0 });
  Object.assign(b, { x: 300, y: 96, a: 0, invuln: 0 });
  return { s, a, b };
}

test('four hits kill and credit the shooter', () => {
  const { s, a, b } = duel();
  run(s, 4, { a: shoot(0) });
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  assert.equal(b.deaths, 1);
  assert.equal(a.hp, 100);
  const boom = s.events.find(e => e.type === 'boom');
  assert.deepEqual([boom.victim, boom.killer], ['b', 'a']);
});
test('dead tank respawns after 3 s with invulnerability', () => {
  const { s, b } = duel();
  Object.assign(b, { alive: false, respawn: 3, hp: 0 });
  run(s, 2.9);
  assert.equal(b.alive, false);
  run(s, 0.2);
  assert.equal(b.alive, true);
  assert.equal(b.hp, 100);
  assert.ok(b.invuln > 0);
});
test('firing ends invulnerability', () => {
  const { s, a } = duel();
  a.invuln = 2;
  step(s, { a: shoot(0) }, 1 / 60);
  assert.equal(a.invuln, 0);
});
test('shell bounces once off steel then dies', () => {
  const { s, b } = duel();
  b.y = 600;
  step(s, { a: shoot(Math.PI) }, 1 / 60);
  run(s, 2);
  assert.equal(s.events.filter(e => e.type === 'bounce').length, 1);
  assert.equal(s.shells.length, 0);
});
test('shell breaks a brick', () => {
  const { s, b } = duel();
  s.bricks.add(tileIndex(4 * 64 + 1, 96));
  run(s, 1, { a: shoot(0) });
  assert.ok(!s.bricks.has(tileIndex(4 * 64 + 1, 96)));
  assert.ok(s.events.some(e => e.type === 'brick'));
  assert.ok(b.hp === 100 || s.events.findIndex(e => e.type === 'brick') < s.events.findIndex(e => e.type === 'hit'));
});
test('big step does not tunnel a shell through a wall', () => {
  const { s, a, b } = duel();
  s.bricks.add(tileIndex(3 * 64 + 1, 96));
  s.shells.push({ id: 999, owner: a.id, x: 140, y: 96, vx: 600, vy: 0, life: 2, bounces: 1 });
  step(s, {}, 1);
  assert.ok(!s.bricks.has(tileIndex(3 * 64 + 1, 96)));
  assert.equal(b.hp, 100);
});
test('removing a tank removes its shells', () => {
  const { s } = duel();
  step(s, { a: shoot(Math.PI / 2) }, 1 / 60);
  assert.equal(s.shells.length, 1);
  removeTank(s, 'a');
  assert.equal(s.shells.length, 0);
  assert.equal(s.tanks.length, 1);
  step(s, {}, 1 / 60);
});
test('15th kill ends the round and it restarts after 8 s', () => {
  const { s, a, b } = duel();
  a.kills = 14; b.hp = 25;
  run(s, 1, { a: shoot(0) });
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 'a');
  run(s, 8.1);
  assert.equal(s.phase, 'playing');
  assert.equal(a.kills, 0);
  assert.equal(b.alive, true);
});
test('time running out ends the round', () => {
  const { s, b } = duel();
  b.kills = 3; s.timeLeft = 0.1;
  run(s, 0.2);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 'b');
});
test('each pickup type applies its effect', () => {
  for (const type of ['repair', 'rapid', 'triple', 'shield', 'speed']) {
    const { s, a } = duel();
    a.hp = 25;
    s.pickups.push({ type, spot: 0, x: a.x, y: a.y, t: 20 });
    step(s, {}, 1 / 60);
    assert.ok(!s.pickups.some(p => p.x === a.x && p.y === a.y), type);
    if (type === 'repair') assert.equal(a.hp, 75);
    else assert.equal(a.buff.type, type);
  }
});
test('buffs change firing and damage', () => {
  const { s, a, b } = duel();
  a.buff = { type: 'triple', t: 8 };
  step(s, { a: shoot(Math.PI / 2) }, 1 / 60);
  assert.equal(s.shells.length, 3);
  a.buff = { type: 'rapid', t: 8 }; a.reload = 0;
  step(s, { a: shoot(Math.PI / 2) }, 1 / 60);
  assert.ok(Math.abs(a.reload - 0.3) < 0.02);
  b.buff = { type: 'shield', t: 6 }; a.reload = 0; s.shells.length = 0;
  run(s, 1, { a: shoot(0) });
  assert.equal(b.hp, 100);
});
test('pickups appear, vanish after 20 s, and the spot refills 15 s later', () => {
  const s = createState(() => 0);
  run(s, 15.1);
  const n = s.pickups.length;
  assert.ok(n > 0);
  run(s, 20);
  assert.equal(s.pickups.length, 0);
  run(s, 15.1);
  assert.equal(s.pickups.length, n);
});
