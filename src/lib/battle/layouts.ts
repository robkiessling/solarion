/**
 * Battle openings: the spawn formations (FORMATIONS) and the arena terrain generators (TERRAIN_LAYOUTS).
 * Both are registries of deterministic placement algorithms keyed by the ids settlement levels declare
 * (poi.formation, poi.terrain in database/planet/pois.ts). A new id is new code here; the sim (sim.ts)
 * takes the results and never cares which layout produced them.
 */
import {TERRAIN_PIECES, type TerrainPieceId} from "../../database/battle/terrain_art";
import type {BattleSide, BattleTerrainPiece} from "./sim";

/** Spawn layouts: the keys of FORMATIONS */
export type FormationId = keyof typeof FORMATIONS;

/** The formations a settlement may declare; squadron and center are droid-side layouts the engine picks itself */
export type HostileFormation = Exclude<FormationId, 'squadron' | 'center' | 'edge'>;

/** Arena obstacle layouts: the keys of TERRAIN_LAYOUTS */
export type TerrainLayoutId = keyof typeof TERRAIN_LAYOUTS;

export type XY = { x: number, y: number };
type Layout = (count: number, arenaW: number, arenaH: number, side: BattleSide) => XY[];
type Placer = ReturnType<typeof makePlacer>;

const FRONT_GAP = 44;              // spawn distance between the two front lines, at any arena size
// Arena terrain cell metrics: a body width wide, a glyph tall (the renderer draws obstacle art at these)
export const TERRAIN_CELL_W = 2;    // arena units; about one monospace char at the unit font size
export const TERRAIN_CELL_H = 3.2;  // matches the renderer's glyph height, so art cells stay square-ish

// Deterministic 32-bit hash -> [0, 1). Decorrelates per-unit phases (wobble, swing timers, collision
// tie-breaks) without RNG: linear-in-index seeds made whole formations snake and swing in sync, because
// neighbors in a lattice have neighboring indices.
export function hash01(n: number) {
    let h = Math.imul(n + 1, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1597334677);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Quasi-random low-discrepancy sequence (R2): evenly spread points that never clump, without RNG.
const R2_A1 = 0.7548776662466927, R2_A2 = 0.5698402909980532;

/**
 * Spawn layouts: pure functions (count, arenaW, arenaH, side) -> [{x, y}], deterministic, all spaced at
 * least SPAWN_SPACING apart (just above the collision contact distance, so nobody spawns overlapped).
 * `column` is the historical default; settlements declare theirs via poi.formation, and the droid side always
 * deploys in `squadron` (a small team degrades to a single block). Layouts only shape the opening --
 * targeting takes over after contact -- but the opening decides the geometry: wrap, split, or wall.
 */
const SPAWN_SPACING = 2.6;

function frontX(side: BattleSide, arenaW: number) {
    return side === 'droid' ? arenaW / 2 - FRONT_GAP / 2 : arenaW / 2 + FRONT_GAP / 2;
}

// Deep front of columns growing away from the center line.
function columnLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    const perCol = Math.max(12, Math.ceil(count / 8));
    const spacing = Math.min(4, (arenaH - 8) / perCol);
    const front = frontX(side, arenaW);
    return Array.from({ length: count }, (_, i) => {
        const col = Math.floor(i / perCol);
        const colHeight = Math.min(count - col * perCol, perCol);
        return {
            x: front + (side === 'droid' ? -1 : 1) * col * 2.5,
            y: arenaH / 2 + ((i % perCol) - (colHeight - 1) / 2) * spacing
        };
    });
}

// Legion-style blocks: rectangular squadrons of ~24 on a grid with lanes between them. Blocks fill
// vertically first (a 5-droid team is one short column), ranks deepen away from the front.
function squadronLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    const PER_BLOCK = 24, BLOCK_H = 6, BLOCK_W = 4, LANE = 5;
    const blockHpx = (BLOCK_H - 1) * SPAWN_SPACING, blockWpx = (BLOCK_W - 1) * SPAWN_SPACING;
    const blocks = Math.ceil(count / PER_BLOCK);
    const maxRows = Math.max(1, Math.floor((arenaH - 8 + LANE) / (blockHpx + LANE)));
    const rows = Math.min(maxRows, Math.max(1, Math.round(Math.sqrt(blocks))));
    const totalH = rows * blockHpx + (rows - 1) * LANE;
    const front = frontX(side, arenaW);
    const dir = side === 'droid' ? -1 : 1;
    return Array.from({ length: count }, (_, i) => {
        const b = Math.floor(i / PER_BLOCK);
        const u = i % PER_BLOCK;
        const depthCol = Math.floor(b / rows);  // squadron grid: fills a vertical stack, then deepens
        const row = b % rows;
        return {
            x: front + dir * (Math.floor(u / BLOCK_H) * SPAWN_SPACING + depthCol * (blockWpx + LANE)),
            y: arenaH / 2 - totalH / 2 + row * (blockHpx + LANE) + (u % BLOCK_H) * SPAWN_SPACING
        };
    });
}

// Concentric rings around a center: the dense settlement circle. Ring m holds as many units as fit at spacing;
// per-ring angular offsets stop the radial spokes lining up.
function ringPositions(count: number, cx: number, cy: number, startIndex = 0): XY[] {
    const positions: { x: number, y: number }[] = [];
    if (count > 0) positions.push({ x: cx, y: cy });
    let ring = 1;
    while (positions.length < count) {
        const radius = ring * SPAWN_SPACING;
        const capacity = Math.floor((2 * Math.PI * radius) / SPAWN_SPACING);
        const offset = hash01(startIndex + ring) * 2 * Math.PI;
        for (let j = 0; j < capacity && positions.length < count; j++) {
            const angle = offset + (2 * Math.PI * j) / capacity;
            positions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        }
        ring++;
    }
    return positions;
}

function ringLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    const radius = SPAWN_SPACING * (Math.sqrt(count / Math.PI) + 1);
    const dir = side === 'droid' ? -1 : 1;
    // Near edge sits where the side's front line would be; clamped back inside the arena
    let cx = frontX(side, arenaW) + dir * radius;
    cx = dir > 0 ? Math.min(cx, arenaW - radius - 2) : Math.max(cx, radius + 2);
    return ringPositions(count, cx, Math.max(radius + 2, Math.min(arenaH - radius - 2, arenaH / 2)));
}

// Exact outer radius of a ringPositions(n) pocket: mirrors its ring-capacity math, so the pocket
// layouts budget true extents. (An earlier padded estimate cost midgame fights their pockets entirely:
// pocket area scales with the garrison exactly as arena area scales with the fight, so at design
// density the fit is genuinely tight and every wasted unit of padding matters.)
function ringExtent(n: number) {
    let placed = Math.min(n, 1);
    let ring = 0;
    while (placed < n) {
        ring++;
        placed += Math.floor(2 * Math.PI * ring);
    }
    return ring * SPAWN_SPACING;
}

// True when every pair of centers ([fx, fy] fractions of a boxW x boxH space; pass 1x1 for absolute
// coordinates) sits at least minSep apart. The surround layout's fit check: separated pockets need
// center gaps of both extents plus spawn spacing, or their rings spawn overlapped.
function fitsApart(centers: [number, number][], boxW: number, boxH: number, minSep: number) {
    return centers.every(([ax, ay], i) => centers.slice(i + 1).every(([bx, by]) =>
        Math.hypot((ax - bx) * boxW, (ay - by) * boxH) >= minSep));
}

// k pocket centers packed into a boxW x boxH space, all pairs at least minSep apart, or null when no
// arrangement manages it. Picks the rows x cols grid whose smallest neighbor gap is largest (matched to
// the box's aspect: a tall half stacks pockets, a wide one ranks them), then jitters each center
// deterministically inside its spare separation so the openings stay organic rather than parade-ground.
// An axis without neighbors (single column/row) is free and jitters across its whole span.
function packCenters(k: number, boxW: number, boxH: number, minSep: number, salt: number): [number, number][] | null {
    if (boxW <= 0 || boxH <= 0) return null;
    let cols = 1, rows = k, bestGap = -Infinity;
    for (let c = 1; c <= k; c++) {
        const r = Math.ceil(k / c);
        const gap = Math.min(c > 1 ? boxW / (c - 1) : Infinity, r > 1 ? boxH / (r - 1) : Infinity);
        if (gap > bestGap) { bestGap = gap; cols = c; rows = r; }
    }
    if (bestGap < minSep) return null;
    const gapX = cols > 1 ? boxW / (cols - 1) : 0;
    const gapY = rows > 1 ? boxH / (rows - 1) : 0;
    const jx = cols > 1 ? Math.min((gapX - minSep) / 2, gapX * 0.3) : boxW / 2;
    const jy = rows > 1 ? Math.min((gapY - minSep) / 2, gapY * 0.3) : boxH / 2;
    return Array.from({ length: k }, (_, i): [number, number] => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(k - row * cols, cols); // the last row may be partial (and gets centered)
        const cx = inRow > 1 ? (cols - inRow) * gapX / 2 + (i % cols) * gapX : boxW / 2;
        const cy = rows > 1 ? row * gapY : boxH / 2;
        return [
            Math.min(boxW, Math.max(0, cx + (hash01(salt + i * 2) * 2 - 1) * jx)),
            Math.min(boxH, Math.max(0, cy + (hash01(salt + i * 2 + 1) * 2 - 1) * jy))
        ];
    });
}

// Dense mini-rings at the given centers, dealing the count round-robin-ish (remainder to the first
// pockets). Position order leads with one pocket CENTER per group (slot k = pocket k's center), so a
// garrison's leading composition entries -- shelters -- distribute one per pocket instead of stacking in
// the first one; the escort fill follows, pocket by pocket.
function pocketPositions(centers: [number, number][], count: number): XY[] {
    const groups = centers.map(([cx, cy], c) => ringPositions(
        Math.floor(count / centers.length) + (c < count % centers.length ? 1 : 0), cx, cy, c * 1000));
    const occupied = groups.filter(g => g.length > 0);
    return [...occupied.map(g => g[0]), ...occupied.flatMap(g => g.slice(1))];
}

// A few separated groups over the side's half, each a dense mini-ring, packed by packCenters. The
// ideal pocket count (headcount/40, 2-6) backs off when even the best packing can't fit them with
// clear water between; the floor is the single ring.
function clustersLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    for (let k = Math.max(2, Math.min(6, Math.round(count / 40))); k >= 2; k--) {
        const extent = ringExtent(Math.ceil(count / k)); // the largest pocket's true outer radius
        const margin = extent + 2;                       // clear of the walls (the spawn clamp sits at 2)
        const left = (side === 'droid' ? 0 : arenaW / 2) + margin;
        const centers = packCenters(k, arenaW / 2 - 2 * margin, arenaH - 2 * margin,
            2 * extent + SPAWN_SPACING, count * 31 + k * 7919);
        if (centers) return pocketPositions(centers.map(([x, y]) => [left + x, margin + y]), count);
    }
    return ringLayout(count, arenaW, arenaH, side);
}

// Disturbed garrison: low-discrepancy spread over the side's half. R2 keeps points evenly spaced (no RNG,
// no clumps); collision tidies any near-contact pairs on the first substeps.
function scatterLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    const left = side === 'droid' ? 4 : arenaW / 2 + 4;
    const width = arenaW / 2 - 8;
    return Array.from({ length: count }, (_, i) => ({
        x: left + ((0.5 + (i + 1) * R2_A1) % 1) * width,
        y: 4 + ((0.5 + (i + 1) * R2_A2) % 1) * (arenaH - 8)
    }));
}

// Ambush: the garrison opens in corner pockets (same dense mini-rings as clusters, but spread over the
// WHOLE arena, not the hostile half) with the field's middle left empty for the prey. Paired with its
// `center` counter-layout below, first contact comes from every direction at once. Four corners when
// they fit with clear water, backing off to a diagonal pincer, then to the plain ring for fights too
// big for their field to encircle anything.
function surroundLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    for (const k of [4, 2]) {
        const extent = ringExtent(Math.ceil(count / k));
        const margin = extent + 2;
        const corners: [number, number][] = k === 4
            ? [[margin, margin], [arenaW - margin, margin],
               [margin, arenaH - margin], [arenaW - margin, arenaH - margin]]
            : [[margin, margin], [arenaW - margin, arenaH - margin]];
        if (fitsApart(corners, 1, 1, 2 * extent + SPAWN_SPACING)) return pocketPositions(corners, count);
    }
    return ringLayout(count, arenaW, arenaH, side);
}

// Squadron blocks re-anchored to the middle of the field: the droid opening when the enemy doesn't
// have a "side" to face (see COUNTER_FORMATIONS).
function centerLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    const positions = squadronLayout(count, arenaW, arenaH, side);
    const meanX = positions.reduce((sum, p) => sum + p.x, 0) / count;
    return positions.map(p => ({ x: p.x + arenaW / 2 - meanX, y: p.y }));
}

// The squadron blocks pushed back against the left edge: the squad arrives from the side it withdraws to
// (the droid default), so a fight opens with an approach across the field instead of a drop into the
// middle of it. The blocks' near face sits a body in from the boundary.
function edgeLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    const positions = squadronLayout(count, arenaW, arenaH, side);
    const minX = Math.min(...positions.map(p => p.x));
    return positions.map(p => ({ x: p.x - minX + SPAWN_SPACING, y: p.y }));
}

// The layout registry (settlements declare theirs via poi.formation). Roster slot 0 -- where a garrison's
// leading composition entry, e.g. a shelter, ends up -- noted per layout.
export const FORMATIONS = {
    column: columnLayout,       // deep battle-line of columns at the front; slot 0: top of the front column
    squadron: squadronLayout,   // rectangular blocks with lanes at the front; slot 0: first block's corner
    ring: ringLayout,           // one dense circle behind the front line; slot 0: dead center
    clusters: clustersLayout,   // 2-6 separated pockets over the side's half; slots 0..k-1: one pocket center each
    scatter: scatterLayout,     // even scatter over the side's half; slot 0: nothing special (quasi-random)
    surround: surroundLayout,   // ambush: four corner pockets of the WHOLE arena; slots 0-3: one corner center each
    center: centerLayout,       // squadron blocks re-anchored mid-field (surround's droid counter-layout)
    edge: edgeLayout            // squadron blocks against the left edge (the droid default: an approach)
} satisfies Record<string, Layout>;

// A hostile formation can dictate the droid side's deployment (createBattle consults this): a surround
// opening only reads as an ambush if the droids actually start encircled in the middle.
export const COUNTER_FORMATIONS: Partial<Record<HostileFormation, FormationId>> = { surround: 'center' };

/**
 * Terrain layout generators: (arenaW, arenaH, salt) -> [{ art, col, row }], deterministic in the salt.
 * Settlements declare theirs via poi.terrain with a coord-stable salt, so a given settlement always fights on the
 * same ground and players can learn it. Coverage scales by COUNT (piece budget follows arena area, and
 * the canyon tiles wall segments into longer runs), never by inflating the pieces themselves.
 */
function terrainSize(art: TerrainPieceId) {
    const lines = TERRAIN_PIECES[art];
    return { w: Math.max(...lines.map((l: string) => l.length)), h: lines.length };
}

// Shared placement state. tryPlace rejects out-of-bounds spots and, unless forced, anything within
// `pad` cells of an existing piece: 2 clear cells between pieces guarantees composed gaps stay wide
// enough for a body to physically pass (a 1-cell slit is open to the BFS but not to a unit). `force`
// lets a layout intentionally merge pieces into one mass, like the canyon's wall runs.
function makePlacer(arenaW: number, arenaH: number) {
    const cols = Math.ceil(arenaW / TERRAIN_CELL_W);
    const rows = Math.ceil(arenaH / TERRAIN_CELL_H);
    const occupied = new Set<number>();
    const pieces: BattleTerrainPiece[] = [];
    const PAD = 2;
    return {
        cols, rows, pieces,
        tryPlace(art: TerrainPieceId, col: number, row: number, force = false) {
            const { w, h } = terrainSize(art);
            if (col < 0 || row < 0 || col + w > cols || row + h > rows) return false;
            if (!force) {
                for (let c = col - PAD; c < col + w + PAD; c++) {
                    for (let r = row - PAD; r < row + h + PAD; r++) {
                        if (occupied.has(r * cols + c)) return false;
                    }
                }
            }
            for (let c = col; c < col + w; c++) {
                for (let r = row; r < row + h; r++) occupied.add(r * cols + c);
            }
            pieces.push({ art, col, row });
            return true;
        }
    };
}

// Scatters count pieces from the arts pool over the given column band via salted hash draws; spots that
// collide with earlier pieces or the bounds are simply skipped, so density degrades gracefully.
function scatterPieces(placer: Placer, arts: TerrainPieceId[], count: number, colMin: number, colMax: number, salt: number) {
    for (let i = 0; placer.pieces.length < count && i < count * 5; i++) {
        const art = arts[Math.floor(hash01(salt + i * 3) * arts.length)];
        const col = colMin + Math.floor(hash01(salt + i * 3 + 1) * Math.max(1, colMax - colMin));
        const row = 1 + Math.floor(hash01(salt + i * 3 + 2) * Math.max(1, placer.rows - 2));
        placer.tryPlace(art, col, row);
    }
}

// Boulder field over the mid-field strip between the two spawn fronts: breaks the clean line clash into
// local skirmishes without ever sitting on top of a formation.
function rocksTerrain(arenaW: number, arenaH: number, salt: number): BattleTerrainPiece[] {
    const placer = makePlacer(arenaW, arenaH);
    const bandHalf = FRONT_GAP / 2 - 3;
    scatterPieces(placer, ['boulder', 'spire', 'boulderBig', 'boulder', 'spire'],
        Math.max(3, Math.round((arenaW * arenaH) / 1100)),
        Math.floor((arenaW / 2 - bandHalf) / TERRAIN_CELL_W),
        Math.ceil((arenaW / 2 + bandHalf) / TERRAIN_CELL_W), salt);
    return placer.pieces;
}

// Broken structures over the whole field (minus breathing room at both spawn edges): walls, arches, and
// bunkers that funnel the approach. Spawns that land on a ruin get relocated by the fixup.
function ruinsTerrain(arenaW: number, arenaH: number, salt: number): BattleTerrainPiece[] {
    const placer = makePlacer(arenaW, arenaH);
    const edge = Math.ceil(8 / TERRAIN_CELL_W);
    scatterPieces(placer, ['ruinWall', 'wallV', 'bunker', 'arch', 'wallH', 'boulder'],
        Math.max(4, Math.round((arenaW * arenaH) / 850)), edge, placer.cols - edge, salt);
    return placer.pieces;
}

// A full-height wall across the middle of the field with one choke (4 cells, about 4 bodies abreast) at
// a salted height, plus light cover on both approaches. The wall meets both arena edges on purpose:
// otherwise the boundary strip becomes a rat line and armies single-file along it.
function canyonTerrain(arenaW: number, arenaH: number, salt: number): BattleTerrainPiece[] {
    const placer = makePlacer(arenaW, arenaH);
    const tileH = terrainSize('wallV').h;
    const col = Math.round(placer.cols / 2) - 1 + Math.floor(hash01(salt) * 5) - 2;
    const gapCells = 4;
    const gapTop = Math.round((placer.rows - gapCells) * (0.3 + 0.4 * hash01(salt + 1)));
    // Two solid runs, one above and one below the choke. Tiles overlap-place (force) so each run ends
    // exactly at its segment edge instead of rounding the choke wider by a partial tile.
    for (const [from, to] of [[0, gapTop], [gapTop + gapCells, placer.rows]]) {
        let row = from;
        for (; row + tileH <= to; row += tileH) placer.tryPlace('wallV', col, row, true);
        if (row < to && to - tileH >= 0) placer.tryPlace('wallV', col, to - tileH, true);
    }
    // Cover on the approaches, kept a few cells clear of the wall so the choke stays the only pass
    for (let i = 0; i < Math.max(4, Math.round((arenaW * arenaH) / 2200)); i++) {
        const art = hash01(salt + 100 + i * 3) < 0.5 ? 'boulder' : 'spire';
        const side = i % 2 === 0 ? -1 : 1;
        const offset = 5 + Math.floor(hash01(salt + 101 + i * 3) * Math.max(1, placer.cols / 2 - 9));
        placer.tryPlace(art, col + (side > 0 ? offset : -offset - terrainSize(art).w),
            1 + Math.floor(hash01(salt + 102 + i * 3) * Math.max(1, placer.rows - 5)));
    }
    return placer.pieces;
}

// A tunnel: solid rock above and below a band a few bodies tall running the whole width, so both sides
// meet head-on in a narrow front and numbers count for less than the queue. A little rubble inside the band
// breaks it up. The band's height and where it sits come from the salt.
function corridorTerrain(arenaW: number, arenaH: number, salt: number): BattleTerrainPiece[] {
    const placer = makePlacer(arenaW, arenaH);
    const tile = terrainSize('wallH');
    const bandRows = 5 + Math.floor(hash01(salt) * 3); // 5..7 cells
    const bandTop = Math.round((placer.rows - bandRows) * (0.3 + 0.4 * hash01(salt + 1)));
    // Rock fill in wallH tiles; runs end exactly at the band's edges (force-placed, overlapping) and at the
    // right arena edge, so no seam is left open
    for (const [from, to] of [[0, bandTop], [bandTop + bandRows, placer.rows]]) {
        for (let row = from; row < to; row += tile.h) {
            const r = Math.min(row, to - tile.h);
            if (r < from) break;
            for (let col = 0; col < placer.cols; col += tile.w) placer.tryPlace('wallH', Math.min(col, placer.cols - tile.w), r, true);
        }
    }
    // Rubble in the band, clear of both spawn ends
    const edge = Math.ceil(10 / TERRAIN_CELL_W);
    for (let i = 0; i < Math.max(2, Math.round(arenaW / 40)); i++) {
        const col = edge + Math.floor(hash01(salt + 50 + i * 2) * Math.max(1, placer.cols - 2 * edge));
        placer.tryPlace('boulder', col, bandTop + 1 + Math.floor(hash01(salt + 51 + i * 2) * Math.max(1, bandRows - 3)));
    }
    return placer.pieces;
}

// A built site: a walled compound on the hostile side of the field, its long wall facing the squad with one
// or two gaps in it, and buildings in rows inside. The garrison spawns inside (any spawn that lands on a wall
// or a building is moved by the fixup), so the fight is the approach, the gaps, and the streets. Where the
// gaps fall, how many, and the building rows come from the salt.
// The compound's footprint in terrain cells: from a little past mid-field to near the right edge, and most of
// the arena's height. Shared by the layout and its garrison anchor.
function compoundBounds(cols: number, rows: number) {
    return { left: Math.round(cols * 0.55), right: cols - 2, top: 1, bottom: rows - 1 };
}
function compoundTerrain(arenaW: number, arenaH: number, salt: number): BattleTerrainPiece[] {
    const placer = makePlacer(arenaW, arenaH);
    const wallH = terrainSize('wallH'), wallV = terrainSize('wallV'), bunker = terrainSize('bunker');
    const { left, right, top, bottom } = compoundBounds(placer.cols, placer.rows);
    const gaps = 1 + Math.floor(hash01(salt) * 2);
    const gapCells = 4; // about four bodies abreast
    const gapRows: number[] = [];
    for (let g = 0; g < gaps; g++) {
        const lo = top + 1 + Math.floor((bottom - top - gapCells - 2) * (g / gaps));
        const hi = top + 1 + Math.floor((bottom - top - gapCells - 2) * ((g + 1) / gaps));
        gapRows.push(lo + Math.floor(hash01(salt + 1 + g) * Math.max(1, hi - lo)));
    }
    const inGap = (row: number) => gapRows.some(gr => row >= gr && row < gr + gapCells);
    // The facing wall: each solid run between gaps tiled in wallV, the last tile pulled back so the run ends
    // exactly at the gap's edge (tiles overlap-place, as the canyon's do)
    let runStart: number | null = null;
    for (let row = top; row <= bottom; row++) {
        const solid = row < bottom && !inGap(row);
        if (solid && runStart === null) runStart = row;
        if (!solid && runStart !== null) {
            const runEnd = row; // exclusive
            for (let r = runStart; r + wallV.h <= runEnd; r += wallV.h) placer.tryPlace('wallV', left, r, true);
            if (runEnd - runStart >= wallV.h && (runEnd - runStart) % wallV.h !== 0) placer.tryPlace('wallV', left, runEnd - wallV.h, true);
            else if (runEnd - runStart < wallV.h && runEnd - wallV.h >= top) placer.tryPlace('wallV', left, runEnd - wallV.h, true);
            runStart = null;
        }
    }
    // Top and bottom walls, in wallH tiles, to the right edge
    for (let col = left; col < right; col += wallH.w) {
        const c = Math.min(col, right - wallH.w);
        placer.tryPlace('wallH', c, top, true);
        placer.tryPlace('wallH', c, bottom - wallH.h, true);
    }
    // Buildings in rows inside. Streets are three cells wide everywhere (behind the facing wall, under the top
    // wall, between rows): two is the minimum a body passes, and a one-cell slit is a single-file queue.
    const STREET = 3;
    const innerLeft = left + wallV.w + STREET;
    const rowStep = bunker.h + STREET;
    // The middle stays open: a plaza the garrison musters in (TERRAIN_ANCHORS.compound), buildings around it.
    // A small arena has room for one row of bunkers, and that row is the plaza, so it gets low buildings
    // (arches) hugging the top and bottom walls instead; bigger arenas fit bunker rows above and below.
    const plazaCol = (left + wallV.w + right) / 2, plazaRow = (top + bottom) / 2;
    const innerTop = top + wallH.h + STREET, innerBottom = bottom - wallH.h - STREET;
    const bunkerRows = Math.floor((innerBottom - innerTop + STREET) / rowStep);
    const art: TerrainPieceId = bunkerRows >= 3 ? 'bunker' : 'arch';
    const piece = terrainSize(art);
    const rowStarts = bunkerRows >= 3
        ? Array.from({ length: bunkerRows }, (_, i) => innerTop + i * rowStep)
        : [innerTop, innerBottom - piece.h];
    // The plaza's half-size in cells; a small interior keeps it to the middle row so the low buildings above
    // and below it survive
    const plazaHalfW = 3, plazaHalfH = bunkerRows >= 3 ? 2 : 0;
    for (const row of rowStarts) {
        if (row < innerTop || row + piece.h > innerBottom) continue;
        for (let col = innerLeft; col + piece.w <= right - 1; col += piece.w + STREET) {
            const onPlaza = col <= plazaCol + plazaHalfW && col + piece.w > plazaCol - plazaHalfW &&
                row <= plazaRow + plazaHalfH && row + piece.h > plazaRow - plazaHalfH;
            if (onPlaza) continue;
            if (hash01(salt + 200 + row * 7 + col) < 0.85) placer.tryPlace(art, col, row, true);
        }
    }
    return placer.pieces;
}

// Where a layout wants the garrison: the hostile formation is re-centred on this point (arena units) before
// the spawn fixup, so a walled site's defenders start inside its walls instead of wherever the formation's
// default front happens to fall (which left them scattered around the outside, and the squad pathing round
// the whole compound to reach them). Layouts without an entry leave the formation where it is.
export const TERRAIN_ANCHORS: Partial<Record<string, (arenaW: number, arenaH: number, salt: number) => XY>> = {
    compound: (arenaW, arenaH) => {
        const cols = Math.ceil(arenaW / TERRAIN_CELL_W), rows = Math.ceil(arenaH / TERRAIN_CELL_H);
        const { left, right, top, bottom } = compoundBounds(cols, rows);
        return { x: ((left + terrainSize('wallV').w + right) / 2) * TERRAIN_CELL_W, y: ((top + bottom) / 2) * TERRAIN_CELL_H };
    }
};

// The layout registry (settlements declare theirs via poi.terrain; unset = open ground).
export const TERRAIN_LAYOUTS = {
    rocks: rocksTerrain,     // boulder field over the mid-field strip
    ruins: ruinsTerrain,     // broken structures over the whole field
    canyon: canyonTerrain,   // one full-height wall with a single choke
    corridor: corridorTerrain, // a tunnel: rock above and below a narrow band the whole way across
    compound: compoundTerrain  // a built site: a walled compound with gaps, streets and buildings inside
} satisfies Record<string, (arenaW: number, arenaH: number, salt: number) => BattleTerrainPiece[]>;
