/**
 * Battle openings: where everyone stands when a fight starts (droidOpening, hostileOpening) and the arena
 * terrain generators (TERRAIN_LAYOUTS), both deterministic and keyed by what a settlement's level declares
 * (`formation`, `terrain` in database/planet/pois.ts). A built terrain is code here; a scatter terrain is a
 * record (database/battle/terrains.ts). The sim (sim.ts) takes the results and never cares what produced them.
 */
import {TERRAIN_DRAWINGS, TERRAIN_PIECES, terrainPieceLook, type TerrainDrawingId, type TerrainPieceId, type TerrainPieceLook} from "../../database/battle/terrain_art";
import {SCATTER_TERRAINS, type ScatterTerrain, type TerrainBand} from "../../database/battle/terrains";
import type {BattleSide, BattleTerrainPiece} from "./sim";

/**
 * How a fight opens, as a level declares it (`formation` in database/planet/pois.ts):
 *   terrain   the place decides: hostiles form up on the terrain's numbered spawn points and the squad starts
 *             on its `0`. A terrain that marks no points opens like `front`; one with no `0` starts the squad
 *             at the left edge. What a level gets when it names nothing.
 *   front     groups in a line down the hostile side, the squad at the left edge
 *   groups    groups spread over the hostile half, the squad at the left edge
 *   surround  groups in the corners of the whole field, the squad in the middle (an ambush)
 * Naming one of the last three overrules the terrain's points and its `0`.
 */
export type HostileFormation = 'terrain' | 'front' | 'groups' | 'surround';

/** How close a group stands around its point: formed up, or caught going about its business */
export type Spread = 'tight' | 'loose';

/** What a hostile does in the opening, read off its stats (never its name): a `source` produces other units and
 * takes the centre of a group, a `post` cannot move but attacks and stands where it has a line of fire, and
 * everything else is the `body` of a group. */
export type SpawnRole = 'body' | 'source' | 'post';

/** What a terrain marks, in arena units: where the squad starts (`0`), the numbered spawn points (`1` to `9`),
 * and where posts stand (`P`). See terrainMarks. */
export interface TerrainMarks {
    squad: XY | null;
    points: { n: number, x: number, y: number }[];
    posts: XY[];
}

/** Arena obstacle layouts: the keys of TERRAIN_LAYOUTS */
export type TerrainLayoutId = keyof typeof TERRAIN_LAYOUTS;

export type XY = { x: number, y: number };
type Placer = ReturnType<typeof makePlacer>;

const FRONT_GAP = 44;              // spawn distance between the two front lines, at any arena size
const BASELINE_ARENA_W = 100, BASELINE_ARENA_H = 60; // the smallest arena (sim.ts ARENA_W/H): what a scatter terrain's count is written for
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

/**
 * The opening: where everyone stands when a fight starts. Pure and deterministic. Hostiles form groups around
 * spawn points (the terrain's own, or the ones a formation lays out), about GROUP_SIZE to a point, so a bigger
 * garrison brings more points into use; the squad deploys in squadron blocks. Nobody spawns closer than
 * SPAWN_SPACING (just above the collision contact distance). The opening only shapes the first contact
 * (targeting takes over after it), but it decides the geometry: wrap, split, or wall.
 */
const SPAWN_SPACING = 2.6;
const GROUP_SIZE = 40;
// A loose group stands out of line (see groupSlots) and up to twice as far apart: as far as the field has
// room for, which at design density (a full garrison on a field sized to it) is only a little
const LOOSE_SPACING = SPAWN_SPACING * 2;
const LOOSE_FILL = 0.5;          // the share of the hostile half a loose garrison may spread itself over

function frontX(side: BattleSide, arenaW: number) {
    return side === 'droid' ? arenaW / 2 - FRONT_GAP / 2 : arenaW / 2 + FRONT_GAP / 2;
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

/**
 * Where the squad stands. At the left edge by default: it arrives from the side it withdraws to, so a fight
 * opens with an approach across the field (the blocks' near face a body in from the boundary). A surround
 * puts it in the middle (an ambush only reads as one if the droids start encircled), and a terrain that marks
 * a `0` puts it there, unless the level named a formation of its own.
 */
export function droidOpening(count: number, formation: HostileFormation, marks: TerrainMarks, arenaW: number, arenaH: number): XY[] {
    if (count === 0) return [];
    const blocks = squadronLayout(count, arenaW, arenaH, 'droid');
    const meanX = blocks.reduce((sum, p) => sum + p.x, 0) / count;
    const meanY = blocks.reduce((sum, p) => sum + p.y, 0) / count;
    if (formation === 'terrain' && marks.squad) {
        const { x, y } = marks.squad;
        return blocks.map(p => ({ x: p.x + x - meanX, y: p.y + y - meanY }));
    }
    if (formation === 'surround') return blocks.map(p => ({ x: p.x + arenaW / 2 - meanX, y: p.y }));
    const minX = Math.min(...blocks.map(p => p.x));
    return blocks.map(p => ({ x: p.x - minX + SPAWN_SPACING, y: p.y }));
}

// Concentric rings around a center: a group standing on its point. Ring m holds as many units as fit at
// the spacing; per-ring angular offsets stop the radial spokes lining up. A `jitter` salt knocks every slot
// but the centre out of line (a loose group is not drawn up in rings), by as much as the spacing can spare
// with any two neighbours still SPAWN_SPACING apart.
function groupSlots(count: number, cx: number, cy: number, startIndex: number, spacing: number, jitter: number | null): XY[] {
    const positions: { x: number, y: number }[] = [];
    if (count > 0) positions.push({ x: cx, y: cy });
    let ring = 1;
    while (positions.length < count) {
        const radius = ring * spacing;
        const capacity = Math.floor((2 * Math.PI * radius) / spacing);
        const offset = hash01(startIndex + ring) * 2 * Math.PI;
        for (let j = 0; j < capacity && positions.length < count; j++) {
            const angle = offset + (2 * Math.PI * j) / capacity;
            positions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        }
        ring++;
    }
    if (jitter === null) return positions;
    const spare = Math.max(0, spacing - SPAWN_SPACING) / (2 * Math.SQRT2);
    return positions.map((p, i) => (i === 0 ? p : {
        x: p.x + (hash01(jitter + i * 2) * 2 - 1) * spare,
        y: p.y + (hash01(jitter + i * 2 + 1) * 2 - 1) * spare
    }));
}

// Exact outer radius of a groupSlots(n) group: mirrors its ring-capacity math, so the point layouts budget
// true extents. (An earlier padded estimate cost midgame fights their groups entirely: group area scales
// with the garrison exactly as arena area scales with the fight, so at design density the fit is genuinely
// tight and every wasted unit of padding matters.)
function groupExtent(n: number, spacing: number) {
    let placed = Math.min(n, 1);
    let ring = 0;
    while (placed < n) {
        ring++;
        placed += Math.floor(2 * Math.PI * ring);
    }
    return ring * spacing;
}

// True when every pair of centers sits at least minSep apart: separated groups need center gaps of both
// extents plus spawn spacing, or their rings spawn overlapped.
function fitsApart(centers: XY[], minSep: number) {
    return centers.every((a, i) => centers.slice(i + 1).every(b => Math.hypot(a.x - b.x, a.y - b.y) >= minSep));
}

// k centers packed into a boxW x boxH space, all pairs at least minSep apart, or null when no
// arrangement manages it. Picks the rows x cols grid whose smallest neighbor gap is largest (matched to
// the box's aspect: a tall half stacks groups, a wide one ranks them), then jitters each center
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

// `front`: the points in a line down the hostile side, their near edge on the front line. A line that is
// full starts another behind it; when even that runs out of field the groups get bigger instead (fewer
// points), down to the one group every fight has room for (pulled back inside the arena if it must be).
function frontPoints(wanted: number, grouped: number, spacing: number, arenaW: number, arenaH: number): XY[] {
    for (let k = wanted; k >= 1; k--) {
        const extent = groupExtent(Math.ceil(grouped / k), spacing);
        const gap = 2 * extent + SPAWN_SPACING;
        const span = arenaH - 2 * (extent + 2); // clear of the walls (the spawn clamp sits at 2)
        const perLine = Math.max(1, Math.floor(span / gap));
        const lines = Math.ceil(k / perLine);
        const nearest = frontX('hostile', arenaW) + extent;
        const overrun = nearest + (lines - 1) * gap + extent - (arenaW - 2);
        if (overrun > 0 && k > 1) continue;
        return Array.from({ length: k }, (_, i) => {
            const line = Math.floor(i / perLine);
            const inLine = Math.min(perLine, k - line * perLine);
            return {
                x: nearest + line * gap - Math.max(0, overrun),
                y: span > 0 ? extent + 2 + span * ((i % perLine) + 0.5) / inLine : arenaH / 2
            };
        });
    }
    return [];
}

// `groups`: the points spread over the hostile half, packed by packCenters. Never fewer than two while two
// fit with clear water between; when they do not, it is a front.
function groupsPoints(wanted: number, grouped: number, spacing: number, arenaW: number, arenaH: number, salt: number): XY[] {
    for (let k = Math.min(grouped, Math.max(2, wanted)); k >= 2; k--) {
        const extent = groupExtent(Math.ceil(grouped / k), spacing);
        const margin = extent + 2;
        const centers = packCenters(k, arenaW / 2 - 2 * margin, arenaH - 2 * margin,
            2 * extent + SPAWN_SPACING, salt + grouped * 31 + k * 7919);
        if (centers) return centers.map(([x, y]) => ({ x: arenaW / 2 + margin + x, y: margin + y }));
    }
    return frontPoints(1, grouped, spacing, arenaW, arenaH);
}

// `surround`: the points in the corners of the WHOLE arena, the field's middle left empty for the prey, so
// first contact comes from every direction at once. Four corners when they fit with clear water, backing
// off to a diagonal pincer, then to a front for fights too big for their field to encircle anything.
function surroundPoints(grouped: number, spacing: number, arenaW: number, arenaH: number): XY[] {
    for (const k of [4, 2]) {
        const extent = groupExtent(Math.ceil(grouped / k), spacing);
        const margin = extent + 2;
        const corners: XY[] = k === 4
            ? [{ x: margin, y: margin }, { x: arenaW - margin, y: margin },
               { x: margin, y: arenaH - margin }, { x: arenaW - margin, y: arenaH - margin }]
            : [{ x: margin, y: margin }, { x: arenaW - margin, y: arenaH - margin }];
        if (fitsApart(corners, 2 * extent + SPAWN_SPACING)) return corners;
    }
    return frontPoints(1, grouped, spacing, arenaW, arenaH);
}

// The spawn points a fight uses. A terrain's own come into use in number order, as many numbers as it takes
// to have a point for every GROUP_SIZE of the garrison (points that share a number open together); a
// formation lays out as many as the garrison needs.
function spawnPoints(formation: HostileFormation, marks: TerrainMarks, grouped: number, spacing: number,
                     arenaW: number, arenaH: number, salt: number): XY[] {
    const wanted = Math.max(1, Math.round(grouped / GROUP_SIZE));
    if (formation === 'terrain' && marks.points.length > 0) {
        const inOrder = [...marks.points].sort((a, b) => a.n - b.n || a.y - b.y || a.x - b.x);
        const inUse: typeof inOrder = [];
        for (const point of inOrder) {
            if (inUse.length >= wanted && point.n !== inUse[inUse.length - 1].n) break;
            inUse.push(point);
        }
        return inUse.map(({ x, y }) => ({ x, y }));
    }
    if (formation === 'surround') return surroundPoints(grouped, spacing, arenaW, arenaH);
    if (formation === 'groups') return groupsPoints(wanted, grouped, spacing, arenaW, arenaH, salt);
    return frontPoints(wanted, grouped, spacing, arenaW, arenaH);
}

/**
 * Where the hostiles stand: a position for each of `roles`, in order (the roster's). The sources and the
 * bodies are dealt evenly over the spawn points in use and each point's group arranges itself: a source at
 * the centre (dealt one to a point before any point gets a second), the bodies in rings around it. A post
 * stands on one of the terrain's `P` marks (taken in reading order); a post with no mark left stands just
 * outside a group, on the side facing `toward` (the squad).
 */
export function hostileOpening(roles: SpawnRole[], formation: HostileFormation, marks: TerrainMarks, spread: Spread,
                               toward: XY, arenaW: number, arenaH: number, salt: number): XY[] {
    const grouped = roles.filter(role => role !== 'post').length;
    const room = Math.sqrt((arenaW / 2) * arenaH * LOOSE_FILL / Math.max(1, grouped));
    const spacing = spread === 'loose' ? Math.min(LOOSE_SPACING, Math.max(SPAWN_SPACING, room)) : SPAWN_SPACING;
    const points = spawnPoints(formation, marks, grouped, spacing, arenaW, arenaH, salt);
    const sizes = points.map((_, g) => Math.floor(grouped / points.length) + (g < grouped % points.length ? 1 : 0));
    const slots = points.map(({ x, y }, g) => groupSlots(sizes[g], x, y, g * 1000, spacing, spread === 'loose' ? salt + g * 7919 : null));

    // Slot order: every group's centre, then every group's next slot in, and so on. Sources draw from the front
    // of it (so they sit at centres, one to a group first); bodies fill what is left, group by group.
    const deepest = Math.max(0, ...sizes);
    const sourceOrder: XY[] = [];
    for (let depth = 0; depth < deepest; depth++) slots.forEach(group => { if (depth < group.length) sourceOrder.push(group[depth]); });
    const sources = roles.filter(role => role === 'source').length;
    const taken = new Set(sourceOrder.slice(0, sources));
    const bodyOrder = slots.flat().filter(slot => !taken.has(slot));

    const marked = [...marks.posts].sort((a, b) => a.y - b.y || a.x - b.x);
    let nextSource = 0, nextBody = 0, nextPost = 0;
    return roles.map(role => {
        if (role === 'source') return sourceOrder[nextSource++];
        if (role === 'body') return bodyOrder[nextBody++];
        const post = nextPost++;
        if (post < marked.length) return marked[post];
        // Unmarked: fanned out just beyond a group's edge, around the line from its point to the squad
        const unmarked = post - marked.length, g = unmarked % points.length, turn = Math.floor(unmarked / points.length);
        const facing = Math.atan2(toward.y - points[g].y, toward.x - points[g].x) + Math.ceil(turn / 2) * 0.45 * (turn % 2 ? 1 : -1);
        const reach = groupExtent(sizes[g], spacing) + SPAWN_SPACING * 1.5;
        return { x: points[g].x + Math.cos(facing) * reach, y: points[g].y + Math.sin(facing) * reach };
    });
}

/**
 * What a terrain marks for the opening, in arena units: the markers drawn into the looks of its placed pieces
 * (database/battle/terrain_art.ts), each at the middle of its cell.
 */
export function terrainMarks(pieces: BattleTerrainPiece[], arenaW: number, arenaH: number): TerrainMarks {
    const marks: TerrainMarks = { squad: null, points: [], posts: [] };
    for (const { art, col, row, look } of pieces) {
        for (const marker of terrainPieceLook(art, look)?.markers || []) {
            const at = { x: (col + marker.col + 0.5) * TERRAIN_CELL_W, y: (row + marker.row + 0.5) * TERRAIN_CELL_H };
            if (at.x >= arenaW || at.y >= arenaH) continue;
            if (marker.mark === '0') marks.squad = at;
            else if (marker.mark === 'P') marks.posts.push(at);
            else marks.points.push({ n: Number(marker.mark), ...at });
        }
    }
    return marks;
}

/**
 * Terrain layout generators: (arenaW, arenaH, salt) -> [{ art, col, row }], deterministic in the salt.
 * Settlements declare theirs via poi.terrain with a coord-stable salt, so a given settlement always fights on the
 * same ground and players can learn it. Coverage scales by COUNT (piece budget follows arena area, and
 * the canyon tiles wall segments into longer runs), never by inflating the pieces themselves.
 */
function terrainSize(art: TerrainPieceId, look = 0) {
    const lines = terrainPieceLook(art, look)!.solid;
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
        tryPlace(art: TerrainPieceId, col: number, row: number, force = false, look = 0) {
            const { w, h } = terrainSize(art, look);
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
            pieces.push(look ? { art, col, row, look } : { art, col, row });
            return true;
        }
    };
}

// Scatters count pieces from the arts pool over the given column band via salted hash draws: the picks first
// (a piece, and which of its looks), then a spot for each, biggest first so the large pieces get the room
// they need and the small ones fill in around them. A pick gets a few tries at a spot where it fits inside the
// band and clear of what is already down; one that finds none is left out, so density degrades gracefully.
const SCATTER_TRIES = 6;
function scatterPieces(placer: Placer, arts: TerrainPieceId[], count: number, colMin: number, colMax: number, salt: number) {
    const picks = Array.from({ length: count }, (_, i) => {
        const art = arts[Math.floor(hash01(salt + i * 3) * arts.length)];
        const look = Math.floor(hash01(salt + i * 3 + 500009) * TERRAIN_PIECES[art].length);
        return { art, look, i, ...terrainSize(art, look) };
    });
    picks.sort((a, b) => b.w * b.h - a.w * a.h || a.i - b.i);
    for (const { art, look, i, w, h } of picks) {
        for (let attempt = 0; attempt < SCATTER_TRIES; attempt++) {
            const draw = salt + i * 3 + attempt * 7919;
            const col = colMin + Math.floor(hash01(draw + 1) * Math.max(1, colMax - colMin - w + 1));
            const row = 1 + Math.floor(hash01(draw + 2) * Math.max(1, placer.rows - 1 - h));
            if (placer.tryPlace(art, col, row, false, look)) break;
        }
    }
}

// A band's columns [from, to) on an arena this wide (see database/battle/terrains.ts). The middle strip is as
// wide as the gap between the fronts at any arena size, so it never sits on top of a formation; the field
// leaves breathing room at both spawn ends (spawns that land on a piece are relocated by the fixup).
function bandCols(band: TerrainBand, arenaW: number): [number, number] {
    const cols = Math.ceil(arenaW / TERRAIN_CELL_W);
    const edge = Math.ceil(8 / TERRAIN_CELL_W), half = Math.round(cols / 2);
    const bandHalf = FRONT_GAP / 2 - 3;
    switch (band) {
        case 'middle': return [Math.floor((arenaW / 2 - bandHalf) / TERRAIN_CELL_W), Math.ceil((arenaW / 2 + bandHalf) / TERRAIN_CELL_W)];
        case 'left': return [edge, half];
        case 'right': return [half, cols - edge];
        case 'field': return [edge, cols - edge];
    }
}

// A scatter terrain's layout: its pieces over its band, as many as the record counts for the baseline arena
// and more on a bigger one, in proportion to the band's area (so the cover is as dense at any size).
function scatterTerrain({ scatter, count, band }: ScatterTerrain) {
    return (arenaW: number, arenaH: number, salt: number): BattleTerrainPiece[] => {
        const placer = makePlacer(arenaW, arenaH);
        const [from, to] = bandCols(band, arenaW);
        const [baseFrom, baseTo] = bandCols(band, BASELINE_ARENA_W);
        const growth = ((to - from) * arenaH) / ((baseTo - baseFrom) * BASELINE_ARENA_H);
        scatterPieces(placer, scatter, Math.max(1, Math.round(count * growth)), from, to, salt);
        return placer.pieces;
    };
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

type TerrainLayout = (arenaW: number, arenaH: number, salt: number) => BattleTerrainPiece[];

// A drawn battlefield's layout: the drawing itself, corner to corner (the arena is cut to it, see drawingArena),
// in the look the salt picks
function drawnTerrain(id: TerrainDrawingId): TerrainLayout {
    return (arenaW, arenaH, salt) => {
        const look = Math.floor(hash01(salt + 900007) * TERRAIN_DRAWINGS[id].length);
        return [look ? { art: id, col: 0, row: 0, look } : { art: id, col: 0, row: 0 }];
    };
}

/** The arena a drawn battlefield is fought on, whatever the armies: its canvas, cell for cell. Null for a
 * terrain that is laid out to fit the fight. */
export function drawingArena(id: TerrainLayoutId | null): { arenaW: number, arenaH: number } | null {
    const looks = id && (TERRAIN_DRAWINGS as Partial<Record<string, TerrainPieceLook[]>>)[id];
    if (!looks) return null;
    return { arenaW: looks[0].solid[0].length * TERRAIN_CELL_W, arenaH: Math.floor(looks[0].solid.length * TERRAIN_CELL_H) };
}

// The layout registry (settlements declare theirs via poi.terrain; unset = open ground): the built terrains, the
// scatter terrains (records in database/battle/terrains.ts) and the drawn ones (database/battle/terrain_drawings.ts).
export const TERRAIN_LAYOUTS = {
    canyon: canyonTerrain,   // one full-height wall with a single choke
    corridor: corridorTerrain, // a tunnel: rock above and below a narrow band the whole way across
    ...(Object.fromEntries(Object.entries(SCATTER_TERRAINS).map(([id, terrain]) => [id, scatterTerrain(terrain)])) as Record<keyof typeof SCATTER_TERRAINS, TerrainLayout>),
    ...(Object.fromEntries(Object.keys(TERRAIN_DRAWINGS).map(id => [id, drawnTerrain(id as TerrainDrawingId)])) as Record<TerrainDrawingId, TerrainLayout>)
} satisfies Record<string, TerrainLayout>;
