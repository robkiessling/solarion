/**
 * Prints a battle terrain as the sim will lay it out, so a drawing can be checked without playing to it.
 *   npm run preview:terrain -- rocks                 the baseline arena (fights up to 160 a side)
 *   npm run preview:terrain -- rocks 800             the arena an 800-unit fight gets (both sides together)
 *   npm run preview:terrain -- rocks 800 12          a different site (the seed picks the spots)
 *   npm run preview:terrain -- rocks 100 1 groups    with a fight's opening on it: the squad and a garrison of
 *                                                    that many between them, under that formation
 *   npm run preview:terrain -- open 100 1 surround loose     open ground, a loose spread
 *   npm run preview:terrain                          lists the terrains
 * '#' marks ground the sim blocks that the art leaves undrawn (the inside of a boulder, a gap too narrow for a
 * body); everything else is the art itself. In an opening, d is a droid, h a hostile, S a source (what the
 * others come out of) and P a post (what stands and shoots).
 */
import {TERRAIN_LAYOUTS, TERRAIN_CELL_W, TERRAIN_CELL_H} from '../src/lib/battle/layouts.ts';
import {terrainPieceLook} from '../src/database/battle/terrain_art.ts';
import {createBattle} from '../src/lib/battle/sim.ts';

const [id, units = '320', seed = '1', formation, spread] = process.argv.slice(2);
if (id !== 'open' && !TERRAIN_LAYOUTS[id]) {
    console.log(`terrains: open, ${Object.keys(TERRAIN_LAYOUTS).join(', ')}`);
    console.log('formations: terrain, front, groups, surround      spreads: tight, loose');
    process.exit(id ? 1 : 0);
}
// A fight of that many: half of them the squad, the rest a garrison with a source and two posts in it
const total = Math.max(8, Number(units));
const battle = createBattle(Math.floor(total / 2), { shelter: 1, sentry: 2, defender: Math.ceil(total / 2) - 3 },
    undefined, formation || 'terrain', id === 'open' ? null : id, Number(seed), spread || 'tight');
const cols = Math.ceil(battle.arenaW / TERRAIN_CELL_W), rows = Math.ceil(battle.arenaH / TERRAIN_CELL_H);

const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
const pieces = battle.terrain ? battle.terrain.pieces : [];
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
if (formation) {
    const glyph = (unit) => (unit.side === 'droid' ? 'd' : unit.type === 'shelter' ? 'S' : unit.type === 'sentry' ? 'P' : 'h');
    // Sources and posts last, so a body sharing their cell does not hide them
    [...battle.units].sort((a, b) => 'dhPS'.indexOf(glyph(a)) - 'dhPS'.indexOf(glyph(b))).forEach(unit => {
        const c = Math.min(cols - 1, Math.floor(unit.x / TERRAIN_CELL_W)), r = Math.min(rows - 1, Math.floor(unit.y / TERRAIN_CELL_H));
        grid[r][c] = glyph(unit);
    });
    console.log(`opening: ${formation}${spread ? `, ${spread}` : ''}; ${Math.floor(total / 2)} droids against ${Math.ceil(total / 2)}`);
}
console.log(`+${'-'.repeat(cols)}+`);
grid.forEach(line => console.log(`|${line.join('')}|`));
console.log(`+${'-'.repeat(cols)}+`);
process.exit(0);
