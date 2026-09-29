/**
 * Converts the .minochar drawings under ascii/minochar/ into the files the game loads, through minochar's own
 * CLI exporter. The drawings are the source of truth: edit them in minochar, never the generated files.
 *
 *   npm run import:art     convert every stale drawing in IMPORTS
 *   npm run watch:art      keep watching, converting on every save
 *
 * IMPORTS below is the whole routing: which drawing goes where, and as what. A .minochar file that no entry
 * names is ignored (sketches, old versions and UI mockups live in the same folders).
 *
 * The sweep is make-style: an output is fresh, and skipped before the exporter is even spawned, when it is
 * newer than both its drawing and this script (so a change to the converter regenerates everything).
 */
import {existsSync, mkdirSync, statSync, watch, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(scriptPath), '..');

/**
 * `as` picks the converter:
 *   text    the drawing's art as plain text, one line per row (the world map)
 *   pieces  battle terrain pieces, one per frame, as a generated module (see convertPieces)
 *
 * A drawing's art is every VISIBLE layer except the reserved ones, combined. A hidden layer is left out (a
 * sketch, a reference), and a reserved layer is never art whether it shows or not: the converters read those
 * for themselves.
 */
const IMPORTS = [
    { from: 'ascii/minochar/planet/map.minochar', as: 'text', to: 'src/database/planet/map.txt' },
    { from: 'ascii/minochar/battle/pieces.minochar', as: 'pieces', to: 'src/database/battle/terrain_pieces.ts' }
];

// Runs the minochar CLI and returns what it prints. A real `minochar` on PATH wins; the usual setup is a shell
// alias onto the sibling checkout, which a script cannot see, so ENOENT falls back to running that checkout's
// CLI through its own tsx.
async function minochar(args) {
    const options = { maxBuffer: 64 * 1024 * 1024 };
    try {
        return (await execFileAsync('minochar', args, options)).stdout;
    }
    catch (error) {
        if (error.code !== 'ENOENT') throw new Error(`minochar ${args[0]} failed (${error.message})`);
    }
    const sibling = join(repoRoot, '..', 'minochar');
    const cli = join(sibling, 'cli', 'main.ts');
    if (!existsSync(cli)) throw new Error(`no "minochar" on PATH and no sibling checkout at ${sibling}`);
    try {
        return (await execFileAsync(join(sibling, 'node_modules', '.bin', 'tsx'), [cli, ...args], options)).stdout;
    }
    catch (error) {
        throw new Error(`minochar ${args[0]} failed (${error.message})`);
    }
}

const RESERVED_LAYERS = ['names', 'markers', 'decor'];

// The export flags that select a drawing's art. The exporter's own default is every visible layer, which would
// bake a visible names layer into the art, so the layers are always picked explicitly (by index: two layers
// can share a name).
async function artLayerFlags(from) {
    const info = JSON.parse(await minochar(['info', from]));
    const art = info.layers.filter(layer => layer.visible && !RESERVED_LAYERS.includes(layer.name));
    if (art.length === 0) throw new Error('no visible art layer');
    return art.flatMap(layer => ['--layer-index', String(layer.index)]);
}

// Every frame of the chosen layers, combined, as rows of text
async function exportFrames(from, layerFlags) {
    const exported = JSON.parse(await minochar(['export', from, '-f', 'json', '--chars-format', 'rows', '--frames', 'all', ...layerFlags]));
    return exported.frames.map(frame => frame.chars);
}

/**
 * The collision mask of a piece: '#' where a body cannot be, ' ' where it can. Every drawn character blocks its
 * cell, and so does open ground no body can use, so the pathing never sends a unit somewhere it cannot stand:
 *   hollows  open cells walled in on every side (the inside of a drawn boulder)
 *   slits    open cells with a wall on both their left and their right: a body is wider than one cell, so a gap
 *            has to be two cells across to be a way through (a cell is taller than a body, so a gap one row
 *            tall is fine)
 * Closing a slit can wall in what lay behind it, so the two repeat until nothing changes.
 */
function solidMask(art) {
    const rows = art.length, cols = art[0].length;
    const solid = art.map(line => Array.from(line, char => char !== ' '));
    const counts = { hollows: 0, slits: 0 };
    const blocked = (row, col) => row >= 0 && row < rows && col >= 0 && col < cols && solid[row][col];
    for (let changed = true; changed;) {
        changed = false;
        // Flood the open ground in from outside the piece (a one-cell margin all round); what it never reaches is walled in
        const reached = Array.from({ length: rows + 2 }, () => new Array(cols + 2).fill(false));
        const queue = [[0, 0]];
        reached[0][0] = true;
        while (queue.length > 0) {
            const [row, col] = queue.pop();
            for (const [dRow, dCol] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nRow = row + dRow, nCol = col + dCol;
                if (nRow < 0 || nRow > rows + 1 || nCol < 0 || nCol > cols + 1 || reached[nRow][nCol]) continue;
                if (blocked(nRow - 1, nCol - 1)) continue;
                reached[nRow][nCol] = true;
                queue.push([nRow, nCol]);
            }
        }
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (solid[row][col]) continue;
                const hollow = !reached[row + 1][col + 1];
                if (!hollow && !(blocked(row, col - 1) && blocked(row, col + 1))) continue;
                solid[row][col] = true;
                counts[hollow ? 'hollows' : 'slits']++;
                changed = true;
            }
        }
    }
    return { solid: solid.map(line => line.map(cell => (cell ? '#' : ' ')).join('')), ...counts };
}

/**
 * Battle terrain pieces. Each frame is one piece: its name typed on the `names` layer, its art on the art
 * layer, anywhere on the canvas (the empty rows and columns around it are trimmed off). A frame with no name
 * continues the one before it and a repeated name joins the same piece, so a piece is a list of looks the
 * placer picks between. A frame with no art is skipped.
 */
async function convertPieces(from) {
    const info = JSON.parse(await minochar(['info', from]));
    if (!info.layers.some(layer => layer.name === 'names')) throw new Error('no layer called "names"');
    const names = await exportFrames(from, ['--layer', 'names']);
    const frames = await exportFrames(from, await artLayerFlags(from));

    const pieces = new Map();
    let name = null;
    frames.forEach((chars, index) => {
        const label = names[index].map(line => line.trim()).filter(line => line.length > 0).join(' ');
        if (label) {
            if (!/^[a-z][a-zA-Z0-9]*$/.test(label)) throw new Error(`frame ${index + 1}: "${label}" is not a camelCase name`);
            name = label;
        }
        const drawn = chars.map(line => line.replace(/\s+$/, ''));
        const top = drawn.findIndex(line => line.length > 0);
        if (top === -1) return; // nothing drawn
        if (!name) throw new Error(`frame ${index + 1}: art before any name`);
        const bottom = drawn.length - [...drawn].reverse().findIndex(line => line.length > 0);
        const left = Math.min(...drawn.slice(top, bottom).filter(line => line.length > 0).map(line => line.search(/\S/)));
        const width = Math.max(...drawn.slice(top, bottom).map(line => line.length)) - left;
        const art = drawn.slice(top, bottom).map(line => line.slice(left).padEnd(width));
        if (!pieces.has(name)) pieces.set(name, []);
        pieces.get(name).push({ art, frame: index + 1, ...solidMask(art) });
    });
    if (pieces.size === 0) throw new Error('no pieces drawn');

    const rows = (lines, indent) => lines.map(line => `${indent}${JSON.stringify(line)}`).join(',\n');
    const look = ({ art, solid }) => `        {\n            art: [\n${rows(art, '                ')}\n            ],\n` +
        `            solid: [\n${rows(solid, '                ')}\n            ]\n        }`;
    const report = [...pieces].map(([piece, looks]) => {
        const closed = looks.filter(each => each.hollows + each.slits > 0)
            .map(each => `frame ${each.frame}: ${[each.hollows && `${each.hollows} hollow`, each.slits && `${each.slits} slit`].filter(Boolean).join(', ')} closed`);
        return `  ${piece.padEnd(12)} ${String(looks.length).padStart(2)} look${looks.length > 1 ? 's' : ' '}  ` +
            `${looks.map(each => `${each.art[0].length}x${each.art.length}`).join(' ')}${closed.length > 0 ? `\n${' '.repeat(16)}${closed.join('; ')}` : ''}`;
    });
    console.log(report.join('\n'));

    return `/**
 * Generated by scripts/import_art.mjs from ${relative(repoRoot, from)}. Redraw it in minochar and run
 * \`npm run import:art\` instead of editing this file.
 *
 * Each piece is a list of looks. \`art\` is what is drawn; \`solid\` is the collision mask ('#' = a body cannot
 * be there): every drawn cell, plus the open cells inside or between them that no body could use.
 */
import type {TerrainPieceLook} from "./terrain_art";

export const IMPORTED_PIECES = {
${[...pieces].map(([piece, looks]) => `    ${piece}: [\n${looks.map(look).join(',\n')}\n    ]`).join(',\n')}
} satisfies Record<string, TerrainPieceLook[]>;
`;
}

const CONVERTERS = {
    text: async (from) => minochar(['export', from, '-f', 'txt', ...await artLayerFlags(from)]),
    pieces: convertPieces
};

function isFresh(from, to) {
    if (!existsSync(to)) return false;
    const written = statSync(to).mtimeMs;
    return written >= statSync(from).mtimeMs && written >= statSync(scriptPath).mtimeMs;
}

// One bad drawing is reported by name and skipped (it must not block the ones after it); the sweep then fails
// at the end, so a one-shot run still exits nonzero.
async function sweep() {
    let fresh = 0;
    const failures = [];
    for (const entry of IMPORTS) {
        const from = join(repoRoot, entry.from), to = join(repoRoot, entry.to);
        try {
            if (!existsSync(from)) throw new Error('drawing not found');
            if (isFresh(from, to)) { fresh++; continue; }
            const output = await CONVERTERS[entry.as](from);
            mkdirSync(dirname(to), { recursive: true });
            writeFileSync(to, output);
            console.log(`${entry.from} -> ${entry.to}`);
        }
        catch (error) {
            failures.push(entry.from);
            console.error(`import-art: ${entry.from}: ${error.message}`);
        }
    }
    if (fresh > 0) console.log(`${fresh} of ${IMPORTS.length} up to date`);
    if (failures.length > 0) throw new Error(`${failures.length} of ${IMPORTS.length} failed (${failures.join(', ')})`);
}

// Sweeps now, on every change to a watched folder (debounced: editors fire several events per save), and on a
// slow poll regardless. The poll is what makes watching trustworthy: macOS fs.watch can go silently deaf in a
// long-running process, and a sweep that failed on a half-saved file would otherwise wait for an event that may
// never come. Polling a fresh tree costs a stat per file; nothing is spawned.
async function watchArt() {
    let running = false;
    const resweep = async () => {
        if (running) return; // a sweep in flight; anything it misses is caught by the next poll
        running = true;
        try { await sweep(); }
        catch (error) { console.error(`import-art: ${error.message}`); }
        finally { running = false; }
    };
    await resweep();
    let timer;
    const folders = [...new Set(IMPORTS.map(entry => dirname(join(repoRoot, entry.from))))];
    folders.forEach(folder => watch(folder, () => {
        clearTimeout(timer);
        timer = setTimeout(resweep, 150);
    }));
    setInterval(resweep, 2000);
    console.log(`watching ${folders.map(folder => relative(repoRoot, folder)).join(', ')} (Ctrl+C to stop)`);
}

try {
    if (process.argv[2] === '--watch') await watchArt(); // the watcher keeps the process alive
    else await sweep();
}
catch (error) {
    console.error(`import-art: ${error.message}`);
    process.exit(1);
}
