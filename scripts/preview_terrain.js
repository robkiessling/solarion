/**
 * Prints a battle terrain as the sim will lay it out, so a drawing can be checked without playing to it.
 *   npm run preview:terrain -- rocks                 the baseline arena (fights up to 160 a side)
 *   npm run preview:terrain -- rocks 800             the arena an 800-unit fight gets (both sides together)
 *   npm run preview:terrain -- rocks 800 12          a different site (the seed picks the spots)
 *   npm run preview:terrain                          lists the terrains
 * '#' marks ground the sim blocks that the art leaves undrawn (the inside of a boulder, a gap too narrow for a
 * body); everything else is the art itself.
 */
import {TERRAIN_LAYOUTS, TERRAIN_CELL_W, TERRAIN_CELL_H} from '../src/lib/battle/layouts.ts';
import {terrainPieceLook} from '../src/database/battle/terrain_art.ts';

const [id, units = '320', seed = '1'] = process.argv.slice(2);
if (!TERRAIN_LAYOUTS[id]) {
    console.log(`terrains: ${Object.keys(TERRAIN_LAYOUTS).join(', ')}`);
    process.exit(id ? 1 : 0);
}
// The sim's arena sizing (createBattle): constant density, never smaller than the baseline
const scale = Math.max(1, Math.sqrt(Number(units) / 320));
const arenaW = Math.round(100 * scale), arenaH = Math.round(60 * scale);
const cols = Math.ceil(arenaW / TERRAIN_CELL_W), rows = Math.ceil(arenaH / TERRAIN_CELL_H);

const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
const pieces = TERRAIN_LAYOUTS[id](arenaW, arenaH, Number(seed));
for (const { art, col, row, look } of pieces) {
    const { art: lines, solid } = terrainPieceLook(art, look);
    solid.forEach((line, j) => Array.from(line).forEach((cell, i) => {
        const c = col + i, r = row + j;
        if (cell === ' ' || c < 0 || r < 0 || c >= cols || r >= rows) return;
        grid[r][c] = lines[j][i] === ' ' ? '#' : lines[j][i];
    }));
}
const open = grid.reduce((n, line) => n + line.filter(cell => cell === ' ').length, 0);
console.log(`${id}: ${cols}x${rows} cells, ${pieces.length} pieces, ${open} open cells (room for about ${Math.round(open / 3)})`);
console.log(`+${'-'.repeat(cols)}+`);
grid.forEach(line => console.log(`|${line.join('')}|`));
console.log(`+${'-'.repeat(cols)}+`);
process.exit(0);
