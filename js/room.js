import { CFG } from './config.js';
import { freshBricks } from './map.js';
import { createState, addTank, removeTank, step, restartRound } from './sim.js';
import { botInput } from './bots.js';

const BOT_NAMES = ['Rusty', 'Boomer', 'Dozer', 'Clank', 'Sarge', 'Pickle', 'Bolt'];
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);

export function sanitizeName(x) {
  const s = typeof x === 'string' ? x.replace(/\p{C}/gu, '').trim().slice(0, 16).trim() : '';
  return s || 'Tank';
}

export function sanitizeInput(x) {
  return {
    fwd: num(x?.fwd, -1, 1), turn: num(x?.turn, -1, 1),
    aim: num(x?.aim, -10, 10), fire: x?.fire === true,
  };
}

export function createRoom({ hostName, send, rand }) {
  const state = createState(rand);
  const humans = new Map(); // connId -> {input, seq, age}
  let botTarget = 0, started = false, ticks = 0, botSerial = 0;

  const join = (id, name) => {
    humans.set(id, { input: sanitizeInput(), seq: 0, age: 0 });
    syncBots(1);
    addTank(state, { id, name: sanitizeName(name) });
  };

  // `incoming` reserves seats for humans about to be added.
  function syncBots(incoming = 0) {
    const bots = state.tanks.filter(t => t.bot);
    const humanTanks = state.tanks.length - bots.length + incoming;
    const want = Math.max(0, Math.min(botTarget, CFG.MAX_TANKS - humanTanks));
    for (const b of bots.slice(want)) removeTank(state, b.id);
    for (let i = bots.length; i < want; i++) {
      const name = BOT_NAMES.find(n => !state.tanks.some(t => t.name === n)) ?? 'Bot';
      addTank(state, { id: 'bot' + ++botSerial, name, bot: true });
    }
  }

  const lobby = () => ({
    players: state.tanks.map(({ id, name, color, bot }) => ({ id, name, color, bot })),
    bots: botTarget, started,
  });
  const broadcast = msg => { for (const id of humans.keys()) send(id, msg); };
  const announce = () => broadcast({ t: 'lobby', ...lobby() });

  const snapshot = () => ({
    t: 'snap', time: state.time, phase: state.phase, timeLeft: state.timeLeft, winner: state.winner,
    tanks: state.tanks.map(({ ai, ...t }) => ({ ...t, buff: t.buff && { ...t.buff } })),
    shells: state.shells.map(s => ({ ...s })),
    pickups: state.pickups.map(p => ({ ...p })),
    broken: [...freshBricks()].filter(i => !state.bricks.has(i)),
    events: state.events.splice(0),
    acks: Object.fromEntries([...humans].map(([id, h]) => [id, h.seq])),
  });

  join('host', hostName);

  return {
    state, lobby, snapshot,
    onMessage(id, msg) {
      if (id === 'host' || !msg || typeof msg !== 'object') return;
      const human = humans.get(id);
      if (msg.t === 'join' && !human) {
        if (humans.size >= CFG.MAX_TANKS) return send(id, { t: 'full' });
        join(id, msg.name);
        send(id, { t: 'welcome', id });
        announce();
      } else if (msg.t === 'in' && human) {
        human.input = sanitizeInput(msg);
        human.seq = num(msg.seq, 0, Number.MAX_SAFE_INTEGER);
        human.age = 0;
      }
    },
    leave(id) {
      if (!humans.delete(id)) return;
      removeTank(state, id);
      syncBots();
      announce();
    },
    setBots(n) {
      botTarget = Math.floor(num(n, 0, CFG.MAX_TANKS - 1));
      syncBots();
      announce();
    },
    start() {
      started = true;
      restartRound(state);
      announce();
    },
    setHostInput(input) {
      Object.assign(humans.get('host'), { input: sanitizeInput(input), age: 0 });
    },
    tick(dt) {
      if (!started) return;
      const inputs = {};
      for (const [id, h] of humans) {
        h.age += dt;
        inputs[id] = h.age <= 1 ? h.input : { fwd: 0, turn: 0, aim: h.input.aim, fire: false };
      }
      for (const t of state.tanks) if (t.bot && t.alive) inputs[t.id] = botInput(state, t.id);
      step(state, inputs, dt);
      if (++ticks % 2 === 0) broadcast(snapshot());
    },
  };
}
