// Timers inside a worker keep running when the tab is in the background.
export function startTicker(hz, fn) {
  const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${1000 / hz})`], { type: 'text/javascript' }));
  const worker = new Worker(url);
  let last = performance.now();
  worker.onmessage = () => {
    const now = performance.now();
    fn(Math.min(0.25, (now - last) / 1000));
    last = now;
  };
  return () => { worker.terminate(); URL.revokeObjectURL(url); };
}
