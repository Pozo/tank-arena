const KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], fire: ['Space'],
};
const clamp = v => Math.max(-1, Math.min(1, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const RADIUS = 55;

export function createInput(canvas, renderer) {
  const held = new Set(), abort = new AbortController(), opts = { signal: abort.signal };
  const sticks = { move: null, aim: null };
  let mouse = null, mouseDown = false, aim = 0;
  const down = name => KEYS[name].some(k => held.has(k));

  function release() {
    held.clear(); mouseDown = false;
    for (const k of Object.keys(sticks)) end(k);
  }
  function end(k) { sticks[k]?.el.remove(); sticks[k] = null; }

  addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (!Object.values(KEYS).flat().includes(e.code)) return;
    e.preventDefault();
    held.add(e.code);
  }, opts);
  addEventListener('keyup', e => held.delete(e.code), opts);
  addEventListener('blur', release, opts);
  document.addEventListener('visibilitychange', release, opts);

  canvas.addEventListener('contextmenu', e => e.preventDefault(), opts);
  canvas.addEventListener('pointerdown', e => {
    document.activeElement?.blur(); // so Space does not press a focused HUD button
    if (e.pointerType === 'mouse') {
      if (e.button === 0) mouseDown = true;
      mouse = { x: e.clientX, y: e.clientY };
      return;
    }
    const k = e.clientX < innerWidth / 2 ? 'move' : 'aim';
    if (sticks[k]) return;
    const el = document.createElement('div');
    el.className = 'stick';
    el.style.left = e.clientX + 'px';
    el.style.top = e.clientY + 'px';
    el.append(document.createElement('i'));
    document.body.append(el);
    sticks[k] = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, el };
  }, opts);
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { mouse = { x: e.clientX, y: e.clientY }; return; }
    for (const s of Object.values(sticks)) {
      if (s?.id !== e.pointerId) continue;
      let dx = (e.clientX - s.x) / RADIUS, dy = (e.clientY - s.y) / RADIUS;
      const len = Math.max(1, Math.hypot(dx, dy));
      s.dx = dx / len; s.dy = dy / len;
      s.el.firstChild.style.transform = `translate(${s.dx * RADIUS}px, ${s.dy * RADIUS}px)`;
    }
  }, opts);
  for (const type of ['pointerup', 'pointercancel']) {
    addEventListener(type, e => {
      if (e.pointerType === 'mouse') { mouseDown = false; return; }
      for (const k of Object.keys(sticks)) if (sticks[k]?.id === e.pointerId) end(k);
    }, opts);
  }

  return {
    read() {
      let fwd = down('up') - down('down');
      let turn = down('right') - down('left');
      let fire = down('fire') || mouseDown;
      if (mouse) aim = renderer.screenToAim(mouse.x, mouse.y);
      const m = sticks.move;
      if (m && Math.hypot(m.dx, m.dy) > 0.2) {
        let diff = wrap(Math.atan2(m.dy, m.dx) - renderer.myAngle());
        const reverse = Math.abs(diff) > 2.4;
        if (reverse) diff = wrap(diff + Math.PI);
        turn = clamp(diff * 2.5);
        fwd = (reverse ? -1 : 1) * Math.hypot(m.dx, m.dy) * Math.max(0, Math.cos(diff));
      }
      const s = sticks.aim;
      if (s && Math.hypot(s.dx, s.dy) > 0.2) {
        aim = Math.atan2(s.dy, s.dx);
        fire = Math.hypot(s.dx, s.dy) > 0.6;
      }
      return { fwd, turn, aim, fire };
    },
    destroy() { release(); abort.abort(); },
  };
}
