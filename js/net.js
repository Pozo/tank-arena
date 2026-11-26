import { startTicker } from './ticker.js';

/* global Peer */
const PREFIX = 'tankarena-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TIMEOUT = 12000, SILENCE = 15000, MAX_CONNECTIONS = 16;
const BLOCKED = 'Could not connect. A strict network or firewall may be blocking direct connections.';

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => ALPHABET[b % ALPHABET.length]).join('');

function explain(err) {
  if (err?.type === 'peer-unavailable') return new Error('No room with that code. Check it, or ask the host for a new link.');
  if (err?.type === 'browser-incompatible') return new Error('This browser does not support WebRTC.');
  return new Error(BLOCKED);
}

function openPeer(id) {
  if (typeof Peer === 'undefined') return Promise.reject(new Error('Networking library did not load. Check your connection and reload.'));
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const fail = err => { clearTimeout(timer); peer.destroy(); reject(err); };
    const timer = setTimeout(() => fail(new Error(BLOCKED)), TIMEOUT);
    peer.once('open', () => { clearTimeout(timer); peer.off('error', fail); resolve(peer); });
    peer.on('error', fail);
  });
}

export async function hostPeer({ onMessage, onLeave }) {
  let peer, code;
  for (let attempt = 0; !peer; attempt++) {
    code = newCode();
    try {
      peer = await openPeer(PREFIX + code);
    } catch (err) {
      if (err.type !== 'unavailable-id' || attempt >= 3) throw explain(err);
    }
  }
  const conns = new Map(); // our own ids: a client must not be able to pick one
  let serial = 0;
  const drop = id => {
    const c = conns.get(id);
    if (!c) return;
    conns.delete(id);
    c.conn.close();
    onLeave(id);
  };
  peer.on('connection', conn => {
    if (conns.size >= MAX_CONNECTIONS) return conn.close();
    const id = 'c' + ++serial;
    conns.set(id, { conn, seen: Date.now() });
    conn.on('data', msg => {
      const c = conns.get(id);
      if (!c) return;
      c.seen = Date.now();
      if (msg?.t !== 'ping') onMessage(id, msg);
    });
    conn.on('close', () => drop(id));
    conn.on('error', () => drop(id));
  });
  // Losing the broker only stops new joins; reconnect so the invite link keeps working.
  peer.on('disconnected', () => setTimeout(() => !peer.destroyed && peer.reconnect(), 2000));
  peer.on('error', () => {});
  const stop = startTicker(1, () => {
    for (const [id, c] of conns) {
      if (Date.now() - c.seen > SILENCE) drop(id);
      else if (c.conn.open) c.conn.send({ t: 'ping' });
    }
  });
  return {
    code,
    send(id, msg) {
      const c = conns.get(id);
      if (c?.conn.open) c.conn.send(msg);
    },
    close() { stop(); peer.destroy(); },
  };
}

export async function joinPeer(code, { onMessage, onClose }) {
  const peer = await openPeer().catch(err => { throw explain(err); });
  const conn = await new Promise((resolve, reject) => {
    // ponytail: reliable ordered channel; switch snapshots to unreliable if lossy links stutter.
    const c = peer.connect(PREFIX + code, { reliable: true });
    const fail = err => { clearTimeout(timer); peer.destroy(); reject(explain(err)); };
    const timer = setTimeout(fail, TIMEOUT);
    c.once('open', () => { clearTimeout(timer); peer.off('error', fail); resolve(c); });
    peer.on('error', fail);
  });
  let seen = Date.now(), closed = false, stop = () => {};
  const close = () => { closed = true; stop(); peer.destroy(); };
  const lost = () => { if (!closed) { close(); onClose(); } };
  conn.on('data', msg => {
    seen = Date.now();
    if (!closed && msg?.t !== 'ping') onMessage(msg);
  });
  conn.on('close', lost);
  conn.on('error', lost);
  peer.on('error', () => {});
  stop = startTicker(1, () => {
    if (Date.now() - seen > SILENCE) lost();
    else if (conn.open) conn.send({ t: 'ping' });
  });
  return { send(msg) { if (conn.open) conn.send(msg); }, close };
}
