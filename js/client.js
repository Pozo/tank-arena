import { freshBricks } from './map.js';
import { moveTank } from './sim.js';

const DELAY = 0.1;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, k) => a + (b - a) * k;

export function createView(myId) {
  const snaps = [];            // {at, snap}
  const history = new Map();   // seq -> predicted {x, y, a}
  let pred = null, bricks = freshBricks();

  function reconcile(snap) {
    const me = snap.tanks.find(t => t.id === myId);
    if (!me) return;
    const was = snaps.at(-1)?.snap.tanks.find(t => t.id === myId);
    const reset = () => { pred = { x: me.x, y: me.y, a: me.a }; history.clear(); };
    if (!pred || !me.alive || !was?.alive) return reset();
    const ack = snap.acks[myId];
    const then = history.get(ack) ?? pred;
    const dx = me.x - then.x, dy = me.y - then.y, da = wrap(me.a - then.a);
    if (Math.hypot(dx, dy) > 120) return reset();
    const k = 0.2;
    // Shift the remembered positions too, or the same error gets corrected twice.
    for (const p of new Set([pred, ...history.values()])) {
      p.x += dx * k; p.y += dy * k; p.a += da * k;
    }
    for (const seq of history.keys()) if (seq < ack) history.delete(seq);
  }

  return {
    push(snap, now) {
      reconcile(snap);
      bricks = freshBricks();
      for (const i of snap.broken) bricks.delete(i);
      snaps.push({ at: now, snap });
      if (snaps.length > 30) snaps.shift();
    },
    frame(now, input, dt, seq) {
      const latest = snaps.at(-1)?.snap;
      if (!latest) return null;
      const when = now - DELAY;
      let i = snaps.length - 1;
      while (i > 0 && snaps[i - 1].at >= when) i--;
      const next = snaps[i], prev = snaps[i - 1] ?? next;
      const k = next.at === prev.at ? 1 : Math.max(0, Math.min(1, (when - prev.at) / (next.at - prev.at)));
      const blend = (cur, old) => {
        // Jumps (respawn) snap instead of sliding across the map.
        if (!old || Math.hypot(cur.x - old.x, cur.y - old.y) > 200) return cur;
        const out = { ...cur, x: lerp(old.x, cur.x, k), y: lerp(old.y, cur.y, k) };
        if ('a' in cur) {
          out.a = old.a + wrap(cur.a - old.a) * k;
          out.aim = old.aim + wrap(cur.aim - old.aim) * k;
        }
        return out;
      };
      const between = key => next.snap[key].map(c => blend(c, prev.snap[key].find(o => o.id === c.id)));

      const me = latest.tanks.find(t => t.id === myId);
      const tanks = between('tanks').filter(t => t.id !== myId);
      if (me) {
        if (me.alive && latest.phase === 'playing') {
          const body = { ...me, ...pred };
          const others = latest.tanks.filter(t => t.id !== myId);
          moveTank({ bricks, tanks: others }, body, input, dt);
          Object.assign(pred, { x: body.x, y: body.y, a: body.a });
          history.set(seq, { ...pred });
          if (history.size > 240) history.delete(history.keys().next().value);
        }
        tanks.push({ ...me, ...pred, aim: me.alive ? input.aim : me.aim });
      }
      const { phase, timeLeft, winner, pickups } = latest;
      return { tanks, shells: between('shells'), pickups, bricks, phase, timeLeft, winner };
    },
  };
}
