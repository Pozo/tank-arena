import { CFG } from './config.js';
import { tileAt } from './map.js';

function clear(state, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  for (let s = 16; s < d; s += 16) {
    if (tileAt(state.bricks, a.x + (b.x - a.x) * s / d, a.y + (b.y - a.y) * s / d) !== '.') return false;
  }
  return true;
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// ponytail: no pathfinding; bots head straight and back out when stuck. Add A* if they look dumb.
export function botInput(state, id) {
  const me = state.tanks.find(t => t.id === id);
  const ai = me.ai ??= { x: me.x, y: me.y, check: 0, back: 0, side: 1, err: 0, wander: me.a };
  const enemies = state.tanks.filter(t => t !== me && t.alive);
  const dist = t => Math.hypot(t.x - me.x, t.y - me.y);
  const target = enemies.sort((a, b) => dist(a) - dist(b))[0];

  if (state.time >= ai.check) {
    const stuck = Math.hypot(me.x - ai.x, me.y - ai.y) < 30 && (!target || dist(target) > 250);
    if (stuck) {
      ai.back = state.time + 0.7;
      ai.side = state.rand() < 0.5 ? -1 : 1;
      ai.wander = state.rand() * Math.PI * 2;
    }
    Object.assign(ai, { x: me.x, y: me.y, check: state.time + 1, err: (state.rand() - 0.5) * 0.24 });
  }

  const sees = target && dist(target) < 700 && clear(state, me, target);
  const aim = target ? Math.atan2(target.y - me.y, target.x - me.x) + ai.err : me.a;
  if (state.time < ai.back) return { fwd: -1, turn: ai.side, aim, fire: false };

  const heading = target ? Math.atan2(target.y - me.y, target.x - me.x) : ai.wander;
  const diff = wrap(heading - me.a);
  // Shoot at a brick in the way so a walled-in bot digs out.
  const brickAhead = tileAt(state.bricks,
    me.x + Math.cos(aim) * CFG.TILE, me.y + Math.sin(aim) * CFG.TILE) === 'B';
  return {
    fwd: sees && dist(target) < 220 ? 0 : 1,
    turn: Math.max(-1, Math.min(1, diff * 2)),
    aim,
    fire: Boolean(sees) || brickAhead,
  };
}
