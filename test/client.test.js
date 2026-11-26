import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../js/client.js';

const tank = (id, o) => ({ id, name: id, color: '#fff', x: 96, y: 96, a: 0, aim: 0, hp: 100, alive: true, kills: 0, deaths: 0, invuln: 0, respawn: 0, buff: null, ...o });
const snap = (tanks, o) => ({ t: 'snap', time: 0, phase: 'playing', timeLeft: 100, winner: null, tanks, shells: [], pickups: [], broken: [], events: [], acks: {}, ...o });
const idle = { fwd: 0, turn: 0, aim: 0, fire: false };
const drive = { ...idle, fwd: 1 };
const get = (f, id) => f.tanks.find(t => t.id === id);

test('no frame before the first snapshot', () => {
  assert.equal(createView('me').frame(0, idle, 0.016, 1), null);
});
test('other tanks are drawn between snapshots, 0.1 s in the past', () => {
  const v = createView('me');
  v.push(snap([tank('me'), tank('o', { x: 200 })]), 1.0);
  v.push(snap([tank('me'), tank('o', { x: 300 })]), 1.1);
  assert.ok(Math.abs(get(v.frame(1.15, idle, 0, 1), 'o').x - 250) < 1);
});
test('angles interpolate the short way across pi', () => {
  const v = createView('me');
  v.push(snap([tank('me'), tank('o', { a: 3.0 })]), 1.0);
  v.push(snap([tank('me'), tank('o', { a: -3.0 })]), 1.1);
  assert.ok(Math.abs(get(v.frame(1.15, idle, 0, 1), 'o').a) > 3.0);
});
test('own tank moves before the host answers', () => {
  const v = createView('me');
  v.push(snap([tank('me')]), 0);
  assert.ok(get(v.frame(0.1, drive, 0.1, 1), 'me').x > 115);
});
test('own tank converges on the host position', () => {
  const v = createView('me');
  v.push(snap([tank('me')]), 0);
  v.frame(0.1, drive, 0.2, 1); // predicted 44 px ahead, host never moved
  let f;
  for (let i = 1; i <= 40; i++) {
    v.push(snap([tank('me')], { acks: { me: 1 } }), i / 30);
    f = v.frame(i / 30, idle, 1 / 30, 1);
  }
  assert.ok(Math.abs(get(f, 'me').x - 96) < 2);
});
test('latency alone does not drag own tank backwards', () => {
  const v = createView('me');
  v.push(snap([tank('me')]), 0);
  v.frame(0.1, drive, 0.1, 1);
  const before = get(v.frame(0.2, drive, 0.1, 2), 'me').x;
  v.push(snap([tank('me', { x: 118 })], { acks: { me: 1 } }), 0.2); // host agrees with seq 1
  assert.ok(Math.abs(get(v.frame(0.2, idle, 0, 2), 'me').x - before) < 1);
});
test('respawn teleports instead of sliding', () => {
  const v = createView('me');
  v.push(snap([tank('me', { alive: false })]), 0);
  v.push(snap([tank('me', { x: 900, y: 900 })]), 0.1);
  const me = get(v.frame(0.1, idle, 0, 1), 'me');
  assert.deepEqual([me.x, me.y], [900, 900]);
});
test('broken bricks are missing from the frame', () => {
  const v = createView('me');
  v.push(snap([tank('me')]), 0);
  const all = v.frame(0, idle, 0, 1).bricks;
  const first = [...all][0];
  v.push(snap([tank('me')], { broken: [first] }), 0.1);
  assert.ok(!v.frame(0.1, idle, 0, 1).bricks.has(first));
});
