/**
 * Runs one fight headless and reports how it went, so a terrain or a level can be tried without playing to it.
 *   npm run sim:fight -- testLarge 1000 1000                    1000 droids against 1000 defenders on that terrain
 *   npm run sim:fight -- testLarge 1000 shelter:2,sentry:4,defender:994
 *   npm run sim:fight -- open 24 shelter:1,defender:18 5 front loose      open ground, seed 5, that opening and spread
 * Prints the arena, what the terrain has room for, the scale factor if the fight had to be scaled to fit, the
 * opening (see preview_terrain.js for the key), and then the result: who won, who was left, how long the fight
 * ran, and how long it took to simulate.
 */
import {TERRAIN_CELL_W, TERRAIN_CELL_H} from '../src/lib/battle/arena.ts';
import {TERRAINS} from '../src/lib/battle/terrain.ts';
import {terrainPieceLook} from '../src/database/battle/terrain_art.ts';
import {advanceBattle, battleHeadcount, createBattle} from '../src/lib/battle/sim.ts';

const [id, droidsArg, hostilesArg, seed = '1', opening = 'marked', spread = 'tight'] = process.argv.slice(2);
if (!id || !droidsArg || !hostilesArg || (id !== 'open' && !TERRAINS[id])) {
    console.log('usage: npm run sim:fight -- <terrain|open> <droids> <hostiles> [seed] [opening] [spread]');
    console.log(`terrains: open, ${Object.keys(TERRAINS).join(', ')}`);
    console.log('hostiles: a number of defenders, or a composition like shelter:2,sentry:4,defender:994');
    process.exit(1);
}
const hostiles = /^\d+$/.test(hostilesArg) ? { defender: Number(hostilesArg) }
    : Object.fromEntries(hostilesArg.split(',').map(part => { const [type, n] = part.split(':'); return [type.trim(), Number(n)]; }));

let battle = createBattle(Number(droidsArg), hostiles, undefined, opening, id === 'open' ? null : id, Number(seed), spread);
const cols = Math.ceil(battle.arenaW / TERRAIN_CELL_W), rows = Math.ceil(battle.arenaH / TERRAIN_CELL_H);

// The opening, as preview_terrain.js draws it
const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
for (const { art, col, row, look } of (battle.terrain ? battle.terrain.pieces : [])) {
    const { art: lines, solid } = terrainPieceLook(art, look);
    solid.forEach((line, j) => Array.from(line).forEach((cell, i) => {
        const c = col + i, r = row + j;
        if (cell === ' ' || c < 0 || r < 0 || c >= cols || r >= rows) return;
        grid[r][c] = lines[j][i] === ' ' ? '#' : lines[j][i];
    }));
}
const open = grid.reduce((n, line) => n + line.filter(cell => cell === ' ').length, 0);
const glyph = (unit) => (unit.side === 'droid' ? 'd' : battle.stats[unit.type].spawnEveryMs ? 'S' : battle.stats[unit.type].speed === 0 ? 'P' : 'h');
[...battle.units].sort((a, b) => 'dhPS'.indexOf(glyph(a)) - 'dhPS'.indexOf(glyph(b))).forEach(unit => {
    grid[Math.min(rows - 1, Math.floor(unit.y / TERRAIN_CELL_H))][Math.min(cols - 1, Math.floor(unit.x / TERRAIN_CELL_W))] = glyph(unit);
});
const head = battleHeadcount(battle);
console.log(`${id}: ${cols}x${rows} cells, ${open} open cells (room for about ${Math.round(open / 3)}); ` +
    `${head.droids} droids against ${head.hostiles + head.spawners} hostiles` +
    (battle.stack > 1 ? `, scaled by ${battle.stack.toFixed(2)} to fit (${battle.units.length} units on the field)` : ''));
console.log(`+${'-'.repeat(cols)}+`);
grid.forEach(line => console.log(`|${line.join('')}|`));
console.log(`+${'-'.repeat(cols)}+`);

// The fight
const started = Date.now();
let over = null, ticks = 0;
while (!over && battle.elapsedMs < 600000) {
    const step = advanceBattle(battle, 33);
    battle = step.battle;
    over = step.events[0] || null;
    ticks++;
}
const wall = Date.now() - started;
const left = battleHeadcount(battle);
console.log(over
    ? `${over.result} after ${(battle.elapsedMs / 1000).toFixed(1)}s: ${over.survivors} droids left, ${over.hostilesRemaining} hostiles left`
    : `no result after ${(battle.elapsedMs / 1000).toFixed(0)}s: ${left.droids} droids and ${left.hostiles + left.spawners} hostiles still standing`);
console.log(`simulated in ${(wall / 1000).toFixed(1)}s (${(wall / ticks).toFixed(2)}ms a tick)`);
process.exit(0);
