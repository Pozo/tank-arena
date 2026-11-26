import { CFG } from './config.js';
import { createState, addTank, step } from './sim.js';
import { botInput } from './bots.js';
import { createRoom, sanitizeName } from './room.js';
import { createView } from './client.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { hostPeer, joinPeer } from './net.js';
import { startTicker } from './ticker.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const renderer = createRenderer(canvas);
const audio = createAudio();
const BUFF_NAMES = { rapid: 'Rapid fire', triple: 'Triple shot', shield: 'Shield', speed: 'Speed boost' };
let session = null; // everything about the current room; null while in the menu

function el(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function show(screen) {
  for (const id of ['menu', 'lobby', 'error', 'hud']) $(id).hidden = id !== screen;
}

function playerName() {
  const name = sanitizeName($('name').value);
  try { localStorage.setItem('tank-name', name); } catch { /* storage blocked */ }
  return name;
}

function leave() {
  const s = session;
  session = null;
  s?.stopTicker?.();
  s?.input?.destroy();
  s?.net?.close();
  renderer.reset();
  $('feed').replaceChildren();
  for (const b of ['create', 'join']) $(b).disabled = false;
  $('status').textContent = '';
}

function toMenu() {
  leave();
  history.replaceState(null, '', location.pathname + location.search);
  show('menu');
}

function fail(message) {
  leave();
  $('error-text').textContent = message;
  show('error');
}

function begin(text) {
  for (const b of ['create', 'join']) $(b).disabled = true;
  $('status').textContent = text;
  return (session = { myId: null, lobby: null, input: null, seq: 0, sent: 0, scores: '' });
}

async function host() {
  const name = playerName();
  const s = begin('Creating room…');
  let room = null;
  try {
    const net = await hostPeer({
      onMessage: (id, msg) => room?.onMessage(id, msg),
      onLeave: id => room?.leave(id),
    });
    if (session !== s) return net.close();
    s.net = net;
    s.code = net.code;
    s.myId = 'host';
    room = s.room = createRoom({
      hostName: name,
      send: (id, msg) => (id === 'host' ? receive(s, msg) : net.send(id, msg)),
    });
    s.stopTicker = startTicker(60, dt => room.tick(dt));
    receive(s, { t: 'lobby', ...room.lobby() });
  } catch (err) {
    if (session === s) fail(err.message);
  }
}

async function join() {
  const code = $('code').value.trim().toUpperCase();
  if (!/^[A-Z2-9]{5}$/.test(code)) {
    $('status').textContent = 'Enter the 5-character room code.';
    return;
  }
  const name = playerName();
  const s = begin('Connecting…');
  s.code = code;
  try {
    const net = await joinPeer(code, {
      onMessage: msg => session === s && receive(s, msg),
      onClose: () => session === s && fail('Lost connection to the host. The match is over.'),
    });
    if (session !== s) return net.close();
    s.net = net;
    s.view = null;
    net.send({ t: 'join', name });
  } catch (err) {
    if (session === s) fail(err.message);
  }
}

function receive(s, msg) {
  if (msg.t === 'welcome') {
    s.myId = msg.id;
    s.view = createView(msg.id);
  } else if (msg.t === 'full') {
    fail('That room is full (8 players).');
  } else if (msg.t === 'lobby') {
    s.lobby = msg;
    if (msg.started) enterGame(s);
    else renderLobby(s);
  } else if (msg.t === 'snap') {
    s.view?.push(msg, performance.now() / 1000);
    onEvents(s, msg);
  }
}

const inviteLink = s => `${location.origin}${location.pathname}${location.search}#${s.code}`;

async function copyInvite(button) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(inviteLink(session));
    button.textContent = 'Copied!';
  } catch {
    prompt('Copy this invite link:', inviteLink(session));
  }
  setTimeout(() => { button.textContent = label; }, 1500);
}

function renderLobby(s) {
  show('lobby');
  $('room-code').textContent = s.code;
  $('invite').value = inviteLink(s);
  $('players').replaceChildren(...s.lobby.players.map(p => {
    const li = el('li', p.name + (p.id === s.myId ? ' (you)' : p.bot ? ' (bot)' : ''));
    li.style.setProperty('--c', p.color);
    return li;
  }));
  const isHost = Boolean(s.room);
  $('host-controls').hidden = !isHost;
  $('waiting').hidden = isHost;
  $('bots').value = String(s.lobby.bots);
}

function enterGame(s) {
  if (s.input) return;
  show('hud');
  renderer.reset();
  s.input = createInput(canvas, renderer);
}

function onEvents(s, snap) {
  if (!s.input || !snap.events.length) return;
  renderer.addEvents(snap.events, s.myId);
  const me = snap.tanks.find(t => t.id === s.myId);
  if (me) audio.play(snap.events, me.x, me.y);
  for (const e of snap.events) {
    if (e.type !== 'boom') continue;
    const line = el('div', `${e.killer}  💥  ${e.victim}`);
    $('feed').append(line);
    setTimeout(() => line.remove(), 4000);
  }
}

function hud(s, view) {
  const me = view.tanks.find(t => t.id === s.myId);
  const left = Math.ceil(view.timeLeft);
  $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $('hp-fill').style.width = `${me ? me.hp : 0}%`;
  $('hp-text').textContent = me ? Math.ceil(me.hp) : '';
  $('buff').textContent = me?.buff ? `${BUFF_NAMES[me.buff.type]} ${Math.ceil(me.buff.t)}s` : '';

  const ranked = [...view.tanks].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const key = view.phase + ranked.map(t => `${t.id}:${t.kills}:${t.deaths}`).join();
  if (key !== s.scores) {
    s.scores = key;
    const rows = full => ranked.map(t => {
      const li = el('li', '', t.id === s.myId ? 'me' : '');
      li.style.setProperty('--c', t.color);
      li.append(el('span', t.name), el('b', full ? `${t.kills} kills · ${t.deaths} deaths` : String(t.kills)));
      return li;
    });
    $('scores').replaceChildren(...rows(false));
    $('final').replaceChildren(...rows(true));
  }
  $('round-over').hidden = view.phase !== 'over';
  $('winner').textContent = view.phase === 'over' ? `${view.winner} wins!` : '';
  $('respawn').textContent = me && !me.alive && view.phase === 'playing'
    ? `Destroyed! Back in ${Math.max(1, Math.ceil(me.respawn))}…` : '';
}

// A bots-only match plays behind the menu.
const demo = createState();
for (let i = 0; i < 6; i++) addTank(demo, { id: 'd' + i, name: '', bot: true });
function runDemo(dt) {
  step(demo, Object.fromEntries(demo.tanks.filter(t => t.alive).map(t => [t.id, botInput(demo, t.id)])), dt);
  renderer.addEvents(demo.events.splice(0), null);
  renderer.draw(demo, 'd0', dt);
}

let previous = performance.now();
function frame(ms) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (ms - previous) / 1000));
  previous = ms;
  const s = session;
  if (!s?.input) return runDemo(dt);
  const input = s.input.read();
  const now = performance.now() / 1000;
  let view;
  if (s.room) {
    s.room.setHostInput(input);
    view = s.room.state;
  } else {
    if (now - s.sent >= 1 / 31) {
      s.sent = now;
      s.net.send({ t: 'in', seq: ++s.seq, ...input });
    }
    view = s.view?.frame(now, input, dt, s.seq);
  }
  if (!view) return;
  renderer.draw(view, s.myId, dt);
  hud(s, view);
}

try { $('name').value = localStorage.getItem('tank-name') ?? ''; } catch { /* storage blocked */ }
function readHash() {
  const code = location.hash.slice(1).toUpperCase();
  if (code && !session) $('code').value = code.slice(0, 5);
}
readHash();
addEventListener('hashchange', readHash);
addEventListener('pagehide', () => session?.net?.close());

for (let n = 0; n < CFG.MAX_TANKS; n++) $('bots').append(el('option', String(n)));
$('menu-form').addEventListener('submit', e => {
  e.preventDefault();
  if (session) return;
  // Enter joins when a code is filled in, otherwise creates.
  const action = e.submitter?.id ?? ($('code').value.trim() ? 'join' : 'create');
  if (action === 'join') join(); else host();
});
$('bots').addEventListener('change', () => session?.room?.setBots(Number($('bots').value)));
$('start').addEventListener('click', () => session?.room?.start());
$('copy').addEventListener('click', e => copyInvite(e.target));
$('hud-copy').addEventListener('click', e => copyInvite(e.target));
for (const b of document.querySelectorAll('.leave')) b.addEventListener('click', toMenu);
const muteLabel = () => { $('mute').textContent = audio.muted ? '🔇' : '🔊'; };
$('mute').addEventListener('click', () => { audio.toggleMute(); muteLabel(); });
muteLabel();

show('menu');
requestAnimationFrame(frame);
