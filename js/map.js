import { CFG } from './config.js';

// Top-left quarter; mirrored both ways so every corner is equally fair.
const QUARTER = [
  '####################',
  '#...................',
  '#.S.................',
  '#.....BBB.....##....',
  '#.....#.......#....B',
  '#..BB.#...P...#....B',
  '#..B..........B.....',
  '#..B.....###..B.....',
  '#........#..........',
  '####.....#....BB....',
  '#.............BS....',
  '#...BBB.............',
  '#..P....##.....#....',
  '#.......#......#....',
];
const half = QUARTER.map(r => r + [...r].reverse().join(''));
export const ROWS = [...half, ...[...half].reverse()];
export const COLS = ROWS[0].length;
export const WIDTH = COLS * CFG.TILE;
export const HEIGHT = ROWS.length * CFG.TILE;

function spots(ch) {
  const out = [];
  ROWS.forEach((row, r) => [...row].forEach((c, col) => {
    if (c === ch) out.push({ x: (col + 0.5) * CFG.TILE, y: (r + 0.5) * CFG.TILE });
  }));
  return out;
}
export const SPAWNS = spots('S');
export const PICKUP_SPOTS = spots('P');

export function freshBricks() {
  const set = new Set();
  ROWS.forEach((row, r) => [...row].forEach((c, col) => { if (c === 'B') set.add(r * COLS + col); }));
  return set;
}
export const tileIndex = (x, y) => Math.floor(y / CFG.TILE) * COLS + Math.floor(x / CFG.TILE);

export function tileAt(bricks, x, y) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return '#';
  const c = ROWS[Math.floor(y / CFG.TILE)][Math.floor(x / CFG.TILE)];
  if (c === '#') return '#';
  return bricks.has(tileIndex(x, y)) ? 'B' : '.';
}
