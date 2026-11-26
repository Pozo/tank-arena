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
