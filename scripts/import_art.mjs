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
import {existsSync, mkdirSync, readdirSync, statSync, watch, writeFileSync} from 'node:fs';
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
 *   pieces    battle terrain pieces, one per frame, as a generated module (see convertPieces)
 *   drawings  whole battlefields, one per frame, as a generated module (see convertDrawings). `from` is a
 *             folder: every drawing in it that no other entry names is a file of battlefields
 *
 * A drawing's art is every VISIBLE layer except the reserved ones, combined. A hidden layer is left out (a
 * sketch, a reference), and a reserved layer is never art whether it shows or not: the converters read those
 * for themselves.
 */
const IMPORTS = [
    { from: 'ascii/minochar/planet/map.minochar', as: 'text', to: 'src/database/planet/map.txt' },
    { from: 'ascii/minochar/battle/pieces.minochar', as: 'pieces', to: 'src/database/battle/terrain_pieces.ts' },
    { from: 'ascii/minochar/battle', as: 'drawings', to: 'src/database/battle/terrain_drawings.ts' }
];

// The drawings an entry reads: the one it names, or (a folder) every drawing in it no other entry names
function sources(entry) {
    const from = join(repoRoot, entry.from);
    if (!existsSync(from)) throw new Error('not found');
    if (!statSync(from).isDirectory()) return [from];
    const named = IMPORTS.map(other => join(repoRoot, other.from));
    return readdirSync(from).filter(file => file.endsWith('.minochar')).sort().map(file => join(from, file))
        .filter(file => !named.includes(file));
}

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

const RESERVED_LAYERS = ['names', 'markers', 'decor', 'low'];

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
 *
 * A `markers` layer, if the drawing has one, marks where the opening puts units around the piece: `1` to `9`
 * a spawn point, `P` a post (ascii/minochar/README.md). A marker has to stand on open ground.
 */
// A drawing's frames, as the converters want them: each with the name it goes by (its own, or the one it
// continues), its art and its markers as rows the width of the canvas. Frames with nothing drawn are left out.
async function readFrames(from) {
    const info = JSON.parse(await minochar(['info', from]));
    if (!info.layers.some(layer => layer.name === 'names')) throw new Error('no layer called "names"');
    const names = await exportFrames(from, ['--layer', 'names']);
    const art = await exportFrames(from, await artLayerFlags(from));
    const marked = info.layers.some(layer => layer.name === 'markers') ? await exportFrames(from, ['--layer', 'markers']) : null;
    const rows = (chars) => Array.from({ length: info.height }, (_, row) => (chars[row] || '').padEnd(info.width).slice(0, info.width));

    const frames = [];
    let name = null;
    art.forEach((chars, index) => {
        const label = names[index].map(line => line.trim()).filter(line => line.length > 0).join(' ');
        if (label) {
            if (!/^[a-z][a-zA-Z0-9]*$/.test(label)) throw new Error(`frame ${index + 1}: "${label}" is not a camelCase name`);
            name = label;
        }
        if (!chars.some(line => line.trim().length > 0)) return; // nothing drawn
        if (!name) throw new Error(`frame ${index + 1}: art before any name`);
        frames.push({ name, frame: index + 1, art: rows(chars), marks: rows(marked ? marked[index] : []) });
    });
    return { frames, width: info.width, height: info.height };
}

// The markers of a frame, within the box [left, left + width) x [top, bottom) and counted from its corner
function readMarkers({ name, frame, marks }, solid, allowed, left, top, width, bottom) {
    const markers = [];
    marks.slice(top, bottom).forEach((line, row) => Array.from(line.slice(left, left + width)).forEach((mark, col) => {
        if (mark === ' ') return;
        const where = `frame ${frame} (${name}): marker "${mark}"`;
        if (mark === '0' && !allowed.includes('0')) throw new Error(`${where} is the squad's start, which belongs in a drawing, not a piece`);
        if (!/^[0-9P]$/.test(mark)) throw new Error(`${where} is not one of 0 to 9 or P`);
        if (solid[row][col] !== ' ') throw new Error(`${where} (column ${left + col + 1}, row ${top + row + 1}) stands on ground that is blocked or cut off`);
        markers.push({ mark, col, row });
    }));
    if (markers.filter(marker => marker.mark === '0').length > 1) throw new Error(`frame ${frame} (${name}): more than one "0"`);
    return markers;
}

const emitRows = (lines, indent) => lines.map(line => `${indent}${JSON.stringify(line)}`).join(',\n');
const emitLook = ({ art, solid, markers }) => `        {\n            art: [\n${emitRows(art, '                ')}\n            ],\n` +
    `            solid: [\n${emitRows(solid, '                ')}\n            ]` +
    (markers.length > 0 ? `,\n            markers: [${markers.map(({ mark, col, row }) => `{ mark: '${mark}', col: ${col}, row: ${row} }`).join(', ')}]` : '') +
    '\n        }';
const emitLooks = (byName) => [...byName].map(([name, looks]) => `    ${name}: [\n${looks.map(emitLook).join(',\n')}\n    ]`).join(',\n');
const closedNote = (each) => [each.hollows && `${each.hollows} hollow`, each.slits && `${each.slits} slit`].filter(Boolean).join(', ');

async function convertPieces(from) {
    const pieces = new Map();
    for (const each of (await readFrames(from)).frames) {
        // The piece is the box around everything in the frame, its markers included, so they keep their place
        const drawn = each.art.map((line, row) => Array.from(line, (char, col) => (char !== ' ' || each.marks[row][col] !== ' ' ? 'x' : ' ')).join('').replace(/\s+$/, ''));
        const top = drawn.findIndex(line => line.length > 0);
        const bottom = drawn.length - [...drawn].reverse().findIndex(line => line.length > 0);
        const left = Math.min(...drawn.slice(top, bottom).filter(line => line.length > 0).map(line => line.search(/\S/)));
        const width = Math.max(...drawn.slice(top, bottom).map(line => line.length)) - left;
        const art = each.art.slice(top, bottom).map(line => line.slice(left, left + width));
        const mask = solidMask(art);
        const markers = readMarkers(each, mask.solid, '123456789P', left, top, width, bottom);
        if (!pieces.has(each.name)) pieces.set(each.name, []);
        pieces.get(each.name).push({ art, markers, frame: each.frame, ...mask });
    }
    if (pieces.size === 0) throw new Error('no pieces drawn');

    const report = [...pieces].map(([piece, looks]) => {
        const closed = looks.filter(each => each.hollows + each.slits > 0).map(each => `frame ${each.frame}: ${closedNote(each)} closed`);
        const marks = looks.filter(each => each.markers.length > 0)
            .map(each => `frame ${each.frame}: marks ${each.markers.map(marker => marker.mark).sort().join(' ')}`);
        return `  ${piece.padEnd(12)} ${String(looks.length).padStart(2)} look${looks.length > 1 ? 's' : ' '}  ` +
            `${looks.map(each => `${each.art[0].length}x${each.art.length}`).join(' ')}` +
            [...closed, ...marks].map(note => `\n${' '.repeat(16)}${note}`).join('');
    });
    console.log(report.join('\n'));

    return `/**
 * Generated by scripts/import_art.mjs from ${relative(repoRoot, from)}. Redraw it in minochar and run
 * \`npm run import:art\` instead of editing this file.
 *
 * Each piece is a list of looks. \`art\` is what is drawn; \`solid\` is the collision mask ('#' = a body cannot
 * be there): every drawn cell, plus the open cells inside or between them that no body could use; \`markers\`
 * is what the look marks for the opening.
 */
import type {TerrainPieceLook} from "./terrain_art";

export const IMPORTED_PIECES = {
${emitLooks(pieces)}
} satisfies Record<string, TerrainPieceLook[]>;
`;
}

/**
 * The collision mask of a whole battlefield, and what it has room for. As a piece's (solidMask), with the
 * field's own edges counting as walls, and with "walled in" meaning what the squad cannot walk to from where
 * it starts (its `0`, or the left edge): ground like that is closed, so nothing is ever sent there. A field
 * with no way from the squad's start to the left edge is fine (the inside of a building): the squad
 * withdraws to where it started instead.
 */
function fieldMask(art, start) {
    const rows = art.length, cols = art[0].length;
    const solid = art.map(line => Array.from(line, char => char !== ' '));
    const counts = { hollows: 0, slits: 0 };
    const blocked = (row, col) => row < 0 || row >= rows || col < 0 || col >= cols || solid[row][col];
    let open = 0;
    for (let changed = true; changed;) {
        changed = false;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (solid[row][col] || !(blocked(row, col - 1) && blocked(row, col + 1))) continue;
                solid[row][col] = true;
                counts.slits++;
            }
        }
        // Walk out from the start the way a unit moves: to any of the eight cells around, but never cutting a corner
        const reached = Array.from({ length: rows }, () => new Array(cols).fill(false));
        const queue = (start ? [[start.row, start.col]] : Array.from({ length: rows }, (_, row) => [row, 0])).filter(([row, col]) => !blocked(row, col));
        queue.forEach(([row, col]) => { reached[row][col] = true; });
        while (queue.length > 0) {
            const [row, col] = queue.pop();
            for (let dRow = -1; dRow <= 1; dRow++) {
                for (let dCol = -1; dCol <= 1; dCol++) {
                    const nRow = row + dRow, nCol = col + dCol;
                    if ((!dRow && !dCol) || blocked(nRow, nCol) || reached[nRow][nCol]) continue;
                    if (dRow && dCol && (blocked(row, nCol) || blocked(nRow, col))) continue;
                    reached[nRow][nCol] = true;
                    queue.push([nRow, nCol]);
                }
            }
        }
        open = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (solid[row][col]) continue;
                if (reached[row][col]) { open++; continue; }
                solid[row][col] = true;
                counts.hollows++;
                changed = true;
            }
        }
    }
    const wayOut = solid.some(line => !line[0]);
    return { solid: solid.map(line => line.map(cell => (cell ? '#' : ' ')).join('')), open, wayOut, ...counts };
}

/**
 * Whole battlefields. Each frame is one: its name on the `names` layer, its art on the art layer, its markers
 * on the `markers` layer (ascii/minochar/README.md). The canvas is the arena, cell for cell, so nothing is
 * trimmed. Frames sharing a name (a frame with no name continues the one before it) are looks of one
 * battlefield, and have to be the same size. Every marker has to stand on ground the squad can walk to.
 */
async function convertDrawings(from, entry) {
    const drawings = new Map();
    const report = [];
    for (const file of sources(entry)) {
        const { frames, width, height } = await readFrames(file);
        for (const each of frames) {
            const zero = each.marks.flatMap((line, row) => Array.from(line, (mark, col) => (mark === '0' ? { row, col } : null))).find(Boolean);
            if (zero && each.art[zero.row][zero.col] !== ' ') throw new Error(`frame ${each.frame} (${each.name}): marker "0" stands on the art`);
            const mask = fieldMask(each.art, zero || null);
            if (mask.open === 0) throw new Error(`frame ${each.frame} (${each.name}): no open ground on the left edge for the squad to start from, and no "0" to say where it does`);
            const markers = readMarkers(each, mask.solid, '0123456789P', 0, 0, width, height);
            const looks = drawings.get(each.name) || [];
            if (looks.length > 0 && (looks[0].art.length !== height || looks[0].art[0].length !== width)) {
                throw new Error(`${each.name}: drawn at ${width}x${height} in ${relative(repoRoot, file)} and at another size elsewhere`);
            }
            drawings.set(each.name, [...looks, { art: each.art, markers, ...mask }]);
            report.push(`  ${each.name.padEnd(14)} ${width}x${height}   room for ${Math.round(mask.open / 3)}` +
                `   marks ${markers.map(marker => marker.mark).sort().join(' ') || 'none'}` +
                (mask.hollows + mask.slits > 0 ? `\n${' '.repeat(16)}${closedNote(mask)} closed` : '') +
                (mask.wayOut ? '' : `\n${' '.repeat(16)}closed off from the left edge: the squad withdraws to its 0`));
        }
    }
    if (drawings.size === 0) throw new Error('no battlefields drawn');
    console.log(report.join('\n'));

    return `/**
 * Generated by scripts/import_art.mjs from the battlefields drawn in ${entry.from}/. Redraw them in minochar
 * and run \`npm run import:art\` instead of editing this file.
 *
 * Each battlefield is a list of looks the size of its arena. \`art\` is what is drawn; \`solid\` is the collision
 * mask ('#' = a body cannot be there): every drawn cell, plus the open ground no body could use or reach;
 * \`markers\` is where the opening puts everyone.
 */
import type {TerrainPieceLook} from "./terrain_art";

export const IMPORTED_DRAWINGS = {
${emitLooks(drawings)}
} satisfies Record<string, TerrainPieceLook[]>;
`;
}

const CONVERTERS = {
    text: async (from) => minochar(['export', from, '-f', 'txt', ...await artLayerFlags(from)]),
    pieces: convertPieces,
    drawings: convertDrawings
};

function isFresh(from, to) {
    if (!existsSync(to)) return false;
    const written = statSync(to).mtimeMs;
    return written >= statSync(scriptPath).mtimeMs && from.every(file => written >= statSync(file).mtimeMs);
}

// One bad drawing is reported by name and skipped (it must not block the ones after it); the sweep then fails
// at the end, so a one-shot run still exits nonzero.
async function sweep() {
    let fresh = 0;
    const failures = [];
    for (const entry of IMPORTS) {
        const to = join(repoRoot, entry.to);
        try {
            const from = sources(entry);
            if (isFresh(from, to)) { fresh++; continue; }
            const output = await CONVERTERS[entry.as](from[0], entry);
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
    const folders = [...new Set(IMPORTS.map(entry => join(repoRoot, entry.from)).map(from => (statSync(from).isDirectory() ? from : dirname(from))))];
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
