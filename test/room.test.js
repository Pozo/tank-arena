import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, sanitizeName, sanitizeInput } from '../js/room.js';
import { tileAt } from '../js/map.js';

function mkRoom(rand) {
  const sent = [];
  const room = createRoom({ hostName: 'host', send: (id, msg) => sent.push({ id, msg }), rand });
  room.sent = sent;
  return room;
}
const tankOf = (room, id) => room.state.tanks.find(t => t.id === id);
const run = (room, s) => { for (let i = 0; i < s * 60; i++) room.tick(1 / 60); };

test('names are sanitized', () => {
  assert.equal(sanitizeName('   '), 'Tank');
  assert.equal(sanitizeName(undefined), 'Tank');
  assert.equal(sanitizeName({}), 'Tank');
  assert.equal(sanitizeName('a\u0000\nb'), 'ab');
  assert.equal(sanitizeName('x'.repeat(99)).length, 16);
});
test('garbage input is clamped and never throws', () => {
  assert.deepEqual(sanitizeInput({ fwd: 1e9, turn: 'a', aim: NaN }), { fwd: 1, turn: 0, aim: 0, fire: false });
  assert.deepEqual(sanitizeInput(null), { fwd: 0, turn: 0, aim: 0, fire: false });
  const room = mkRoom();
  room.onMessage('c1', { t: 'join', name: 'c' });
  room.start();
  for (const m of [null, undefined, 5, 'x', {}, { t: 'nope' }, { t: 'in' }, { t: 'in', fwd: Infinity, seq: 'z' }]) {
    room.onMessage('c1', m);
    room.onMessage('stranger', m);
  }
  run(room, 0.1);
  assert.ok(Number.isFinite(tankOf(room, 'c1').x));
  assert.equal(room.state.tanks.length, 2);
});
test('second join from one connection adds nothing', () => {
  const room = mkRoom();
  room.onMessage('c1', { t: 'join', name: 'one' });
  room.onMessage('c1', { t: 'join', name: 'two' });
  assert.equal(room.state.tanks.length, 2);
  assert.equal(tankOf(room, 'c1').name, 'one');
});
test('silent client stops moving', () => {
  const room = mkRoom();
  room.onMessage('c1', { t: 'join', name: 'c' });
  room.start();
  room.onMessage('c1', { t: 'in', seq: 1, fwd: 0, turn: 1, aim: 0, fire: false });
  run(room, 1.2);
  const a = tankOf(room, 'c1').a;
  run(room, 1);
  assert.equal(tankOf(room, 'c1').a, a);
});
test('human replaces a bot in a full room; ninth human gets full', () => {
  const room = mkRoom();
  room.setBots(99);
  assert.equal(room.state.tanks.length, 8);
  for (let i = 1; i <= 7; i++) room.onMessage('c' + i, { t: 'join', name: 'h' + i });
  assert.equal(room.state.tanks.length, 8);
  assert.equal(room.state.tanks.filter(t => t.bot).length, 0);
  room.onMessage('c8', { t: 'join', name: 'late' });
  assert.deepEqual(room.sent.at(-1), { id: 'c8', msg: { t: 'full' } });
  room.leave('c1');
  assert.equal(room.state.tanks.filter(t => t.bot).length, 1);
});
test('snapshot is sent every second tick to everyone and acks the last seq', () => {
  const room = mkRoom();
  room.onMessage('c1', { t: 'join', name: 'c' });
  room.start();
  room.onMessage('c1', { t: 'in', seq: 7, fwd: 0, turn: 0, aim: 0, fire: true });
  room.sent.length = 0;
  room.tick(1 / 60);
  assert.equal(room.sent.length, 0);
  room.tick(1 / 60);
  assert.deepEqual(room.sent.map(s => s.id).sort(), ['c1', 'host']);
  const snap = room.sent[0].msg;
  assert.equal(snap.t, 'snap');
  assert.equal(snap.acks.c1, 7);
  assert.deepEqual(snap.broken, []);
  assert.ok(snap.events.some(e => e.type === 'fire'));
  assert.equal(room.state.events.length, 0);
});
test('bots play a match without entering walls', () => {
  let seed = 1;
  const room = mkRoom(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  room.setBots(7);
  room.start();
  let deaths = 0;
  for (let i = 0; i < 90 * 60; i++) {
    room.tick(1 / 60);
    deaths += room.sent.splice(0).filter(s => s.id === 'host')
      .flatMap(s => s.msg.events ?? []).filter(e => e.type === 'boom').length;
    if (i % 30) continue;
    for (const t of room.state.tanks) assert.equal(tileAt(room.state.bricks, t.x, t.y), '.');
  }
  assert.ok(deaths > 0);
});
