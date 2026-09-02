import {EQUIPMENT_DEFS} from "../database/equipment";
import {TERRAIN_PIECES} from "../database/battle_terrain";
import {BUG_TYPES, DROID_BASE_STATS, GROUND_BLURBS, SWARM_BLURBS} from "../database/battle";
import type {BugType, DroidStats, UnitStats, UnitType} from '../database/battle';
import type {EquipmentId} from '../database/equipment';
import type {TerrainPieceId} from '../database/battle_terrain';

/** Spawn layouts: the keys of FORMATIONS */
export type FormationId = keyof typeof FORMATIONS;

/** The formations a nest may declare; squadron and center are droid-side layouts the engine picks itself */
export type NestFormation = Exclude<FormationId, 'squadron' | 'center'>;

/** Arena obstacle layouts: the keys of TERRAIN_LAYOUTS */
export type TerrainLayoutId = keyof typeof TERRAIN_LAYOUTS;

export type BattleSide = 'droid' | 'bug';

export interface BattleUnit {
    id: string;
    side: BattleSide;
    type: UnitType;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    cooldownMs: number;
    seed: number;
    wobbleMs: number;
    spawnMs?: number;
    withdrawing?: boolean;
    /** cosmetic strike cue for the renderer: lunge direction and when it started */
    strike?: { dx: number, dy: number, t: number };
}

export interface BattleFx { type: 'hit' | 'death' | 'heal' | 'bomb' | 'spawn'; x: number; y: number; t: number }

/** A placed obstacle: `art` names a TERRAIN_PIECES entry (database/battle_terrain.ts) */
export interface BattleTerrainPiece { art: TerrainPieceId; col: number; row: number }

export type BattlePhase = 'active' | 'withdrawing';

export interface Battle {
    phase: BattlePhase;
    elapsedMs: number;
    /** per-type stat blocks this battle runs on */
    stats: { [unitType: string]: UnitStats };
    arenaW: number;
    arenaH: number;
    startingDroids: number;
    startingBugs: number;
    startingSpawners: number;
    bugsPeak: number;
    spawnCounter: number;
    escaped: number;
    escapedHp: number[];
    buffs: { overchargeMs: number };
    terrain: { id: TerrainLayoutId; pieces: BattleTerrainPiece[] } | null;
    fx: BattleFx[];
    units: BattleUnit[];
}

/** How a battle ended, reported by advanceBattle */
export interface BattleOverEvent {
    type: 'battleOver';
    result: 'won' | 'wiped' | 'retreated';
    /** droids still standing (plus escapees on a retreat) */
    survivors: number;
    bugsRemaining: number;
    /** the survivors' hulls */
    droidHp: number[];
}

export type BattleEvent = BattleOverEvent;

// Content records (stats, scene text) live in database/battle.ts; this module is the engine.
export {BUG_TYPES, DROID_BASE_STATS} from "../database/battle";

/**
 * Real-time per-unit battle sim: the skirmish that plays out in the encounter popup when the squad attacks
 * a nest. Pure module in the squad.ts mold: redux owns the battle object (inside squad.fighting) and calls
 * advanceBattle from the planet tick; the popup's canvas just draws unit positions.
 *
 * Model: every droid and bug is an agent with position, hp, and an attack cooldown. Units seek the nearest
 * enemy and trade fixed damage in melee range; bodies collide (both sides), so frontage is physical and
 * rear ranks queue. Spawn arrangements are data-driven (FORMATIONS: nests declare poi.formation, droids
 * deploy in squadron blocks unless the bug formation dictates a counter-layout). Spawner-type bugs
 * (BUG_TYPES rows with spawnEveryMs) sit immobile and feed fresh bugs into the fight on a fixed clock
 * until killed. The outcome emerges from counts, per-unit stats, the opening geometry, and
 * whatever equipment the player fires mid-fight. Deliberately no RNG anywhere: motion "wobble" is a deterministic
 * per-unit sine drift, so a replayed tick stream (save reload, background-tab catch-up) reproduces the same
 * fight. Positions live in a float arena space sized per battle (constant unit density, so big armies get a
 * bigger field, not a mosh pit); pixel scaling is the renderer's problem, which is what lets the popup grow
 * as armies scale. Neighbor queries go through a spatial hash grid, so endgame armies (hundreds per side)
 * and their catch-up replays stay cheap.
 *
 * Terrain: nests may declare an obstacle layout (poi.terrain -> TERRAIN_LAYOUTS), which stamps ASCII
 * pieces (database/battle_terrain.ts) onto a coarse cell grid at battle creation. Blocked cells are
 * impassable to both sides: bodies collide with them, target acquisition demands line of sight, the
 * flow field and the withdrawal route path around them, and spawn positions that land inside are
 * relocated to the nearest reachable ground. Since frontage is already physical, walls and chokepoints
 * shape fights with no new combat rules. Pieces are sized in body-widths (they do NOT grow with the
 * arena; layouts place MORE of them), and the whole thing stays deterministic: the placed piece list
 * lives on battle.terrain, everything else is derived.
 */

// Baseline arena coordinate space. Droids enter from the left, bugs from the right. Battles above
// ARENA_BASELINE_UNITS total combatants scale both dimensions up (see createBattle); battle.arenaW/arenaH
// are the authoritative dimensions, these constants are the floor (and the fallback for pre-scaling saves).
type XY = { x: number, y: number };
type Layout = (count: number, arenaW: number, arenaH: number, side: BattleSide) => XY[];
/** Coarse obstacle grid derived from a battle's terrain pieces; see getTerrainGrid */
type TerrainGrid = { cols: number, rows: number, blocked: Set<number>, exitDist: Int32Array };
/** Spatial hash of one side's units; see buildGrid */
type UnitGrid = { cells: Map<number, { unit: BattleUnit, i: number }[]>, cell: number, count: number };
type Placer = ReturnType<typeof makePlacer>;
type FlowField = ReturnType<typeof buildFlowField>;

export const ARENA_W = 100;
export const ARENA_H = 60;
const ARENA_BASELINE_UNITS = 320;  // a 160v160 fills the baseline arena at design density
const FRONT_GAP = 44;              // spawn distance between the two front lines, at any arena size

// --- Tuning ---
// The unit stat blocks (DROID_BASE_STATS, BUG_TYPES) are content records in database/battle.ts; the
// dials below are engine mechanics.
const ATTACK_RANGE = 3;
const UNIT_RADIUS = 1.2;        // hard collision radius, both sides: pairs closer than 2R get pushed apart,
                                // so frontage is physical (only the units that fit can engage; ranks queue)
const WOBBLE = 3;               // units/sec of deterministic lateral drift (organic motion without RNG)
const WITHDRAW_SPEED = 13;      // faster than bugs, so disengaging works once contact is broken
const ESCAPE_X = 1.5;           // a withdrawing droid past this x has left the field
const SUBSTEP_MS = 50;          // integration cap; callers may pass any dt (catch-up replays big ones)
export const FX_TTL_MS = 600;   // hit/death/bomb markers linger this long for the renderer


// A fresh squad's per-droid hp list (persistence helpers: squad state and save migration use it too).
export function fullDroidHp(count: number, maxHp: number = DROID_BASE_STATS.hp): number[] {
    return new Array(count).fill(maxHp);
}

// Deterministic 32-bit hash -> [0, 1). Decorrelates per-unit phases (wobble, swing timers, collision
// tie-breaks) without RNG: linear-in-index seeds made whole formations snake and swing in sync, because
// neighbors in a lattice have neighboring indices.
function hash01(n: number) {
    let h = Math.imul(n + 1, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1597334677);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Quasi-random low-discrepancy sequence (R2): evenly spread points that never clump, without RNG.
const R2_A1 = 0.7548776662466927, R2_A2 = 0.5698402909980532;

/**
 * Spawn layouts: pure functions (count, arenaW, arenaH, side) -> [{x, y}], deterministic, all spaced at
 * least SPAWN_SPACING apart (just above the collision contact distance, so nobody spawns overlapped).
 * `column` is the historical default; nests declare theirs via poi.formation, and the droid side always
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

// Concentric rings around a center: the dense nest circle. Ring m holds as many units as fit at spacing;
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
// garrison's leading composition entries -- hives -- distribute one per pocket instead of stacking in
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

// Disturbed swarm: low-discrepancy spread over the side's half. R2 keeps points evenly spaced (no RNG,
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
// WHOLE arena, not the bug half) with the field's middle left empty for the prey. Paired with its
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

// The layout registry (nests declare theirs via poi.formation). Roster slot 0 -- where a garrison's
// leading composition entry, e.g. a hive, ends up -- noted per layout.
export const FORMATIONS = {
    column: columnLayout,       // deep battle-line of columns at the front; slot 0: top of the front column
    squadron: squadronLayout,   // rectangular blocks with lanes (the droid default); slot 0: first block's corner
    ring: ringLayout,           // one dense circle behind the front line; slot 0: dead center
    clusters: clustersLayout,   // 2-6 separated pockets over the side's half; slots 0..k-1: one pocket center each
    scatter: scatterLayout,     // even scatter over the side's half; slot 0: nothing special (quasi-random)
    surround: surroundLayout,   // ambush: four corner pockets of the WHOLE arena; slots 0-3: one corner center each
    center: centerLayout        // squadron blocks re-anchored mid-field (surround's droid counter-layout)
} satisfies Record<string, Layout>;

// A bug formation can dictate the droid side's deployment (createBattle consults this): a surround
// opening only reads as an ambush if the droids actually start encircled in the middle.
const COUNTER_FORMATIONS: Partial<Record<NestFormation, FormationId>> = { surround: 'center' };

/**
 * Terrain: impassable obstacle cells stamped from ASCII pieces (database/battle_terrain.ts; the art is
 * the collision map, non-space char = blocked cell). Cells match the renderer's glyph metrics (a body
 * width wide, a glyph tall), so a piece is a fixed size in BODIES at any arena scale; a choke that
 * admits three droids admits three droids in every fight. battle.terrain stores only the placed piece
 * list ({ art, col, row }); the blocked set and the exit field are derived (and cached per terrain
 * object, so save reloads rebuild them transparently).
 */
export const TERRAIN_CELL_W = 2;    // arena units; about one monospace char at the unit font size
export const TERRAIN_CELL_H = 3.2;  // matches the renderer's glyph height, so art cells stay square-ish

// Derived per-battle terrain data: { cols, rows, blocked (Set of row*cols+col), exitDist }. exitDist is
// a BFS distance-to-the-left-edge per cell, -1 for blocked cells: it routes withdrawing droids around
// walls, and doubles as the reachability mask (exitDist >= 0 means open AND connected to the field) that
// the spawn fixup checks, so nothing ever starts sealed inside a hollow.
const TERRAIN_GRID_CACHE = new WeakMap();

export function getTerrainGrid(battle: Battle) {
    const terrain = battle.terrain;
    if (!terrain || !terrain.pieces || terrain.pieces.length === 0) return null;
    let grid = TERRAIN_GRID_CACHE.get(terrain);
    if (!grid) {
        grid = buildTerrainGrid(terrain.pieces, battle.arenaW || ARENA_W, battle.arenaH || ARENA_H);
        TERRAIN_GRID_CACHE.set(terrain, grid);
    }
    return grid;
}

function buildTerrainGrid(pieces: BattleTerrainPiece[], arenaW: number, arenaH: number): TerrainGrid {
    const cols = Math.ceil(arenaW / TERRAIN_CELL_W);
    const rows = Math.ceil(arenaH / TERRAIN_CELL_H);
    const blocked = new Set<number>();
    for (const { art, col, row } of pieces) {
        const lines = TERRAIN_PIECES[art];
        if (!lines) continue; // a save from a version with pieces this build lacks: skip, stay playable
        lines.forEach((line, j) => {
            for (let i = 0; i < line.length; i++) {
                const c = col + i, r = row + j;
                if (line[i] !== ' ' && c >= 0 && r >= 0 && c < cols && r < rows) blocked.add(r * cols + c);
            }
        });
    }
    const exitDist = new Int32Array(cols * rows).fill(-1);
    const queue: number[] = [];
    for (let r = 0; r < rows; r++) {
        if (!blocked.has(r * cols)) { exitDist[r * cols] = 0; queue.push(r * cols); }
    }
    for (let head = 0; head < queue.length; head++) {
        const idx = queue[head];
        const c = idx % cols, r = (idx - c) / cols;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (!dc && !dr) continue;
                const nc = c + dc, nr = r + dr;
                if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
                const nIdx = nr * cols + nc;
                if (exitDist[nIdx] >= 0 || blocked.has(nIdx)) continue;
                // No corner cutting: a diagonal step needs both orthogonal cells open too
                if (dc && dr && (blocked.has(r * cols + nc) || blocked.has(nr * cols + c))) continue;
                exitDist[nIdx] = exitDist[idx] + 1;
                queue.push(nIdx);
            }
        }
    }
    return { cols, rows, blocked, exitDist };
}

// Circle-vs-blocked-cells resolution: pushes the unit fully out of any terrain cell it overlaps.
// Terrain never yields, mirroring how spawner bodies work; called from the collision pass.
function collideTerrain(grid: TerrainGrid | null, unit: BattleUnit) {
    if (!grid) return;
    const minC = Math.max(0, Math.floor((unit.x - UNIT_RADIUS) / TERRAIN_CELL_W));
    const maxC = Math.min(grid.cols - 1, Math.floor((unit.x + UNIT_RADIUS) / TERRAIN_CELL_W));
    const minR = Math.max(0, Math.floor((unit.y - UNIT_RADIUS) / TERRAIN_CELL_H));
    const maxR = Math.min(grid.rows - 1, Math.floor((unit.y + UNIT_RADIUS) / TERRAIN_CELL_H));
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            if (!grid.blocked.has(r * grid.cols + c)) continue;
            const x0 = c * TERRAIN_CELL_W, y0 = r * TERRAIN_CELL_H;
            const nx = Math.min(x0 + TERRAIN_CELL_W, Math.max(x0, unit.x));
            const ny = Math.min(y0 + TERRAIN_CELL_H, Math.max(y0, unit.y));
            const dx = unit.x - nx, dy = unit.y - ny;
            const d2 = dx * dx + dy * dy;
            if (d2 >= UNIT_RADIUS * UNIT_RADIUS) continue;
            if (d2 > 1e-9) {
                const d = Math.sqrt(d2);
                unit.x += (dx / d) * (UNIT_RADIUS - d);
                unit.y += (dy / d) * (UNIT_RADIUS - d);
            }
            else {
                // Center inside the cell (bomb knock-in, fresh hive spawn): eject through the nearest face
                const pens = [unit.x - x0, x0 + TERRAIN_CELL_W - unit.x, unit.y - y0, y0 + TERRAIN_CELL_H - unit.y];
                const m = Math.min(...pens);
                if (m === pens[0]) unit.x = x0 - UNIT_RADIUS;
                else if (m === pens[1]) unit.x = x0 + TERRAIN_CELL_W + UNIT_RADIUS;
                else if (m === pens[2]) unit.y = y0 - UNIT_RADIUS;
                else unit.y = y0 + TERRAIN_CELL_H + UNIT_RADIUS;
            }
        }
    }
}

// Line-of-sight over the terrain grid (a DDA cell walk). Gates both target acquisition (a unit that
// can see its nearest enemy charges straight at it; one that can't defers to the flow field) and
// attacks, so nobody stabs through a wall. Trivially true on open fields.
function hasLOS(grid: TerrainGrid | null, x0: number, y0: number, x1: number, y1: number) {
    if (!grid) return true;
    // Withdrawing droids can sit just off-field (x < 0); clamp so cell keys never go negative
    const maxX = grid.cols * TERRAIN_CELL_W - 0.001, maxY = grid.rows * TERRAIN_CELL_H - 0.001;
    x0 = Math.min(maxX, Math.max(0, x0)); y0 = Math.min(maxY, Math.max(0, y0));
    x1 = Math.min(maxX, Math.max(0, x1)); y1 = Math.min(maxY, Math.max(0, y1));
    let c = Math.floor(x0 / TERRAIN_CELL_W), r = Math.floor(y0 / TERRAIN_CELL_H);
    const c1 = Math.floor(x1 / TERRAIN_CELL_W), r1 = Math.floor(y1 / TERRAIN_CELL_H);
    const dx = x1 - x0, dy = y1 - y0;
    const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
    let tMaxC = dx !== 0 ? ((stepC > 0 ? (c + 1) * TERRAIN_CELL_W : c * TERRAIN_CELL_W) - x0) / dx : Infinity;
    let tMaxR = dy !== 0 ? ((stepR > 0 ? (r + 1) * TERRAIN_CELL_H : r * TERRAIN_CELL_H) - y0) / dy : Infinity;
    const tDeltaC = dx !== 0 ? Math.abs(TERRAIN_CELL_W / dx) : Infinity;
    const tDeltaR = dy !== 0 ? Math.abs(TERRAIN_CELL_H / dy) : Infinity;
    let guard = grid.cols + grid.rows + 2;
    while ((c !== c1 || r !== r1) && guard-- > 0) {
        if (tMaxC < tMaxR) { c += stepC; tMaxC += tDeltaC; }
        else { r += stepR; tMaxR += tDeltaR; }
        if (grid.blocked.has(r * grid.cols + c)) return false;
    }
    return true;
}

// Spawn fixup: a formation position that lands on blocked or sealed-off ground relocates to the nearest
// reachable open cell (Chebyshev ring scan, fixed order, so it's deterministic). The jitter keeps
// several relocated units from stacking on the exact cell center; collision separates the rest.
function freePosition(grid: TerrainGrid, x: number, y: number, salt: number): XY {
    const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / TERRAIN_CELL_W)));
    const r = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / TERRAIN_CELL_H)));
    if (grid.exitDist[r * grid.cols + c] >= 0) return { x, y };
    for (let ring = 1; ring < Math.max(grid.cols, grid.rows); ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
            for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
                const nc = c + dc, nr = r + dr;
                if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
                if (grid.exitDist[nr * grid.cols + nc] < 0) continue;
                return {
                    x: (nc + 0.5) * TERRAIN_CELL_W + (hash01(salt * 2 + 17) - 0.5) * 0.8,
                    y: (nr + 0.5) * TERRAIN_CELL_H + (hash01(salt * 2 + 18) - 0.5) * 0.8
                };
            }
        }
    }
    return { x, y };
}

/**
 * Terrain layout generators: (arenaW, arenaH, salt) -> [{ art, col, row }], deterministic in the salt.
 * Nests declare theirs via poi.terrain with a coord-stable salt, so a given nest always fights on the
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
    scatterPieces(placer, ['boulder', 'spire', 'boulderBig', 'boulder', 'spire'] as TerrainPieceId[],
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
    scatterPieces(placer, ['ruinWall', 'wallV', 'bunker', 'arch', 'wallH', 'boulder'] as TerrainPieceId[],
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

// The layout registry (nests declare theirs via poi.terrain; unset = open ground).
export const TERRAIN_LAYOUTS = {
    rocks: rocksTerrain,     // boulder field over the mid-field strip
    ruins: ruinsTerrain,     // broken structures over the whole field
    canyon: canyonTerrain    // one full-height wall with a single choke
} satisfies Record<string, (arenaW: number, arenaH: number, salt: number) => BattleTerrainPiece[]>;

// One-line scene description for the battle footer: ground clause + the garrison's opening (text records
// in database/battle.ts), matching what the arena actually shows. Pure presentation (derived at render
// time, nothing reads it back), so existing mid-fight saves get it too.
export function battleBlurb(battle: Battle, formation?: NestFormation): string {
    const ground = GROUND_BLURBS[battle.terrain ? battle.terrain.id : 'open'] || GROUND_BLURBS.open;
    let swarm = (formation && SWARM_BLURBS[formation]) || SWARM_BLURBS.column;
    // The ring's center slot is where a garrison's leading hive stands (see createBattle); name the
    // objective when it's really there
    if (formation === 'ring' && battle.startingSpawners > 0) {
        swarm = `bugs circle tight around their ${battle.startingSpawners > 1 ? 'hives' : 'hive'}`;
    }
    return `${ground}; ${swarm}.`;
}

// One combat-ready unit. `base` selects the unit's deterministic hash streams (opening swing delay,
// wobble phase/period, collision tie-break angle) and must be unique across every unit the battle will
// ever hold, including bugs a spawner adds mid-fight.
function makeUnit(id: string, side: BattleSide, type: UnitType, stats: UnitStats, base: number, x: number, y: number, arenaW: number, arenaH: number, hp?: number): BattleUnit {
    const unit: BattleUnit = {
        id, side, type,
        x: Math.min(arenaW - 2, Math.max(2, x)),
        y: Math.min(arenaH - 2, Math.max(2, y)),
        hp: hp != null ? hp : stats.hp,
        maxHp: stats.hp,
        cooldownMs: Math.floor(hash01(base + 200003) * stats.attackMs), // desynchronized opening swings
        seed: hash01(base) * 2 * Math.PI,                // wobble phase (also the collision tie-break angle)
        wobbleMs: 340 + Math.floor(hash01(base + 100003) * 120) // per-unit wobble period, 340-460ms
    };
    if (stats.spawnEveryMs) unit.spawnMs = stats.spawnEveryMs; // spawner clock: counts down to the next batch
    return unit;
}

// roster: [{ type, hp? }] per unit; hp defaults to the type's full pool. Formation positions that land
// on terrain are relocated to the nearest reachable ground (see freePosition).
function spawnUnits(side: BattleSide, roster: { type: UnitType, hp?: number }[], statsByType: Record<string, UnitStats>, arenaW: number, arenaH: number, formation: FormationId, terrainGrid: TerrainGrid | null): BattleUnit[] {
    const layout = FORMATIONS[formation] || columnLayout;
    const positions = layout(roster.length, arenaW, arenaH, side);
    const sideSalt = side === 'droid' ? 0 : 1;
    return roster.map((entry, i) => {
        const pos = terrainGrid ? freePosition(terrainGrid, positions[i].x, positions[i].y, i * 2 + sideSalt)
            : positions[i];
        return makeUnit(`${side[0]}${i}`, side, entry.type, statsByType[entry.type],
            i * 2 + sideSalt, // distinct hash streams per unit AND per side
            pos.x, pos.y, arenaW, arenaH, entry.hp);
    });
}

/**
 * `droids` is a per-droid hp list (wounds persist between fights in the field, so the droid that got
 * mauled last time really is the fragile one now); a plain count means a fresh squad at full health.
 * `bugs` is a composition { bugType: count } (a plain count means standard bugs). Bugs always spawn at
 * full strength: nests reset completely between engagements (each side heals at home), so every assault
 * faces the full garrison and must be decisive.
 * `droidStats` is the squad's effective stat block (base + researched upgrades), snapshotted onto the
 * battle so a mid-fight save replays with the stats the fight started with.
 * `bugFormation` is the nest's spawn layout (poi.formation; see FORMATIONS), defaulting to the column
 * front. Droids deploy in squadron blocks unless the bug formation dictates a counter-layout
 * (COUNTER_FORMATIONS: a surround opening re-anchors the squadrons to the middle of the field).
 * Composition entry order maps to formation slots (the first roster unit takes layout index 0), so a
 * ring-formation garrison declared { hive: 1, bug: N } puts the hive at the ring's center, and the
 * pocket layouts (clusters, surround) lead with one slot per pocket center, distributing leading hives
 * one per pocket.
 * `terrainId` picks an obstacle layout (poi.terrain; see TERRAIN_LAYOUTS), generated deterministically
 * from `terrainSalt`. Callers pass a salt derived from the nest's map position, so the same nest always
 * fights on the same ground; unset = open field.
 */
export function createBattle(droids: number | number[], bugs: number | Partial<Record<BugType, number>>,
                             droidStats: DroidStats = DROID_BASE_STATS, bugFormation: NestFormation = 'column',
                             terrainId: TerrainLayoutId | null = null, terrainSalt = 0): Battle {
    const droidHp = Array.isArray(droids) ? droids : fullDroidHp(droids, droidStats.hp);
    const composition: Partial<Record<BugType, number>> = typeof bugs === 'number' ? { bug: bugs } : bugs;

    const stats: Record<string, UnitStats> = { droid: droidStats };
    const bugRoster: { type: BugType, hp?: number }[] = [];
    (Object.entries(composition) as [BugType, number][]).forEach(([type, n]) => {
        stats[type] = BUG_TYPES[type];
        // A spawner's output type fights too, even when the opening garrison fields none of it
        const spawns = BUG_TYPES[type].spawns;
        if (spawns) stats[spawns] = BUG_TYPES[spawns];
        for (let i = 0; i < n; i++) bugRoster.push({ type });
    });

    const startingSpawners = bugRoster.reduce((n, e) => n + (BUG_TYPES[e.type].spawnEveryMs ? 1 : 0), 0);

    // Constant-density field: area grows with headcount, so linear dimensions scale with its square root.
    // Small fights stay on the baseline arena (never shrink below it).
    const arenaScale = Math.max(1, Math.sqrt((droidHp.length + bugRoster.length) / ARENA_BASELINE_UNITS));
    const arenaW = Math.round(ARENA_W * arenaScale);
    const arenaH = Math.round(ARENA_H * arenaScale);

    const terrainLayout = terrainId && TERRAIN_LAYOUTS[terrainId];
    const terrainPieces = terrainLayout ? terrainLayout(arenaW, arenaH, terrainSalt) : [];
    const terrain = terrainId && terrainPieces.length > 0 ? { id: terrainId, pieces: terrainPieces } : null;
    const terrainGrid = terrain ? buildTerrainGrid(terrainPieces, arenaW, arenaH) : null;
    if (terrain) TERRAIN_GRID_CACHE.set(terrain, terrainGrid);

    return {
        phase: 'active',
        elapsedMs: 0,
        stats,                          // per-type stat blocks this battle runs on (upgrade snapshot)
        arenaW,                         // field dimensions for this engagement (renderer + clamps)
        arenaH,
        startingDroids: droidHp.length, // initial force sizes; the header fractions read against these
        startingBugs: bugRoster.length,
        startingSpawners,
        // High-water mark of the swarm (spawners excluded): the header's bug-fraction denominator, so a
        // spawner-fed swarm reads against its true peak instead of overflowing its starting total
        bugsPeak: bugRoster.length - startingSpawners,
        spawnCounter: 0,                // bugs spawned mid-fight so far: unique ids/hash streams for late arrivals
        escaped: 0,                     // withdrawing droids that reached the edge (they count as survivors)
        escapedHp: [],                  // ...and the hp each of them left with (persists onto the squad)
        buffs: { overchargeMs: 0 },
        terrain,                        // { id, pieces: [{ art, col, row }] } or null for open ground
        fx: [],                         // { type: 'hit'|'death'|'heal'|'bomb', x, y, t } markers for the renderer
        units: [
            ...spawnUnits('droid', droidHp.map(hp => ({ type: 'droid', hp })), stats, arenaW, arenaH,
                COUNTER_FORMATIONS[bugFormation] || 'squadron', terrainGrid),
            ...spawnUnits('bug', bugRoster, stats, arenaW, arenaH, bugFormation, terrainGrid)
        ]
    };
}

export function countUnits(battle: Battle, side: BattleSide): number {
    return battle.units.reduce((n, u) => n + (u.side === side ? 1 : 0), 0);
}

// Living spawners afield: the header's "Hives x/y" fraction reads these against startingSpawners.
export function countSpawners(battle: Battle): number {
    return battle.units.reduce((n, u) => n + (battle.stats[u.type].spawnEveryMs ? 1 : 0), 0);
}

/**
 * Spatial hash grid. At endgame scale (hundreds of units per side) the all-pairs O(n^2) scans for
 * targeting and separation dominate the tick, and catch-up replays multiply them by hundreds of substeps.
 * The grid buckets units by cell and queries expand outward ring by ring. Within its ring cap, a query
 * is bit-identical to a brute-force scan of the units array: the comparator is (squared distance, then
 * array index), which is exactly the winner the sequential first-strictly-closer scan produced.
 *
 * Targeting is two-tier: the exact ring search runs only out to NEAR_RINGS cells (everything that can
 * fight or is about to). Units farther than that from any enemy steer by a flow field instead -- a
 * multi-source BFS over the grid's cells seeded from every enemy-occupied cell -- because at
 * replicated-army scale (thousands per side on a giant arena) exact long-range searches made opening
 * ticks cost hundreds of ms. The field is still deterministic (seed order is grid insertion order =
 * units order; FIFO expansion breaks ties by queue position), just approximate: a marching unit heads
 * for its nearest enemy-occupied CELL, and precise nearest-unit targeting takes over as it closes in.
 */
const TARGET_CELL = 12;                   // targeting cell size (arena units); coarse, rings expand as needed
const NEAR_RINGS = 3;                     // exact-search radius in cells; beyond this the flow field steers
const KEY_OFFSET = 8, KEY_STRIDE = 4096;  // packs (possibly slightly negative) cell coords into one int key

function cellKey(cx: number, cy: number) { return (cx + KEY_OFFSET) * KEY_STRIDE + (cy + KEY_OFFSET); }

// One side's units (or all units, side = null) bucketed by cell; entries carry their units-array index
// for tie-breaking.
function buildGrid(units: BattleUnit[], side: BattleSide | null, cell: number): UnitGrid {
    const cells = new Map<number, { unit: BattleUnit, i: number }[]>();
    let count = 0;
    units.forEach((unit, i) => {
        if (side !== null && unit.side !== side) return;
        const key = cellKey(Math.floor(unit.x / cell), Math.floor(unit.y / cell));
        const bucket = cells.get(key);
        if (bucket) bucket.push({ unit, i }); else cells.set(key, [{ unit, i }]);
        count++;
    });
    return { cells, cell, count };
}

// Nearest living unit in the grid to (x, y). Expands Chebyshev rings of cells; a ring-r cell is at least
// (r-1) whole cells away, so the search stops once even that bound can't beat (or tie) the best found.
// maxDim bounds the expansion so a query against a nearly-empty grid still terminates; ringCap bounds it
// harder (returns null if nothing lives within that many rings -- callers fall back to the flow field).
function nearestInGrid(grid: UnitGrid, x: number, y: number, maxDim: number, ringCap = Infinity): BattleUnit | null {
    if (grid.count === 0) return null;
    const cell = grid.cell;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const maxRing = Math.min(Math.ceil(maxDim / cell) + 2, ringCap);
    let best: BattleUnit | null = null, bestD2 = Infinity, bestI = Infinity;
    const scanCell = (dx: number, dy: number) => {
        const bucket = grid.cells.get(cellKey(cx + dx, cy + dy));
        if (!bucket) return;
        for (const { unit, i } of bucket) {
            if (unit.hp <= 0) continue;
            const ddx = unit.x - x, ddy = unit.y - y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < bestD2 || (d2 === bestD2 && i < bestI)) { best = unit; bestD2 = d2; bestI = i; }
        }
    };
    for (let r = 0; r <= maxRing; r++) {
        const ringMin = (r - 1) * cell;
        if (best && ringMin > 0 && ringMin * ringMin > bestD2) break;
        if (r === 0) {
            scanCell(0, 0);
        }
        else {
            for (let dx = -r; dx <= r; dx++) { scanCell(dx, -r); scanCell(dx, r); }
            for (let dy = -r + 1; dy <= r - 1; dy++) { scanCell(-r, dy); scanCell(r, dy); }
        }
    }
    return best;
}

// Long-range steering (see the two-tier note above): every cell learns which unit stands in its nearest
// enemy-occupied cell, via multi-source BFS with each occupied cell seeded as its own source (its
// lowest-units-array-index occupant, the exact search's tie-break; seeds are found by iterating units in
// array order). Runs on the terrain grid's cell metrics and refuses to expand through blocked cells, so
// every cell also learns its BFS parent: one step along the (wall-respecting) path toward that enemy.
// Units with line of sight to the cell's enemy charge it straight (identical to the old open-field
// behavior); units without it steer to the parent cell instead, which is how armies round walls.
// O(cells) per side per substep -- still cheap next to the per-unit work it replaces.
function buildFlowField(units: BattleUnit[], side: BattleSide, terrainGrid: TerrainGrid | null, arenaW: number, arenaH: number) {
    const cols = terrainGrid ? terrainGrid.cols : Math.ceil(arenaW / TERRAIN_CELL_W);
    const rows = terrainGrid ? terrainGrid.rows : Math.ceil(arenaH / TERRAIN_CELL_H);
    const target = new Array(cols * rows).fill(null);
    const parent = new Int32Array(cols * rows).fill(-1);
    const queue: number[] = [];
    for (const unit of units) {
        if (unit.side !== side) continue;
        // Clamped: withdrawing droids can hold positions just off-field (x down to -2)
        const c = Math.min(cols - 1, Math.max(0, Math.floor(unit.x / TERRAIN_CELL_W)));
        const r = Math.min(rows - 1, Math.max(0, Math.floor(unit.y / TERRAIN_CELL_H)));
        const idx = r * cols + c;
        if (target[idx] === null) { target[idx] = unit; queue.push(idx); }
    }
    const blocked = terrainGrid ? terrainGrid.blocked : null;
    for (let head = 0; head < queue.length; head++) {
        const idx = queue[head];
        const c = idx % cols, r = (idx - c) / cols;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (!dc && !dr) continue;
                const nc = c + dc, nr = r + dr;
                if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
                const nIdx = nr * cols + nc;
                if (target[nIdx] !== null) continue;
                if (blocked) {
                    if (blocked.has(nIdx)) continue;
                    // No corner cutting: a diagonal step needs both orthogonal cells open too
                    if (dc && dr && (blocked.has(r * cols + nc) || blocked.has(nr * cols + c))) continue;
                }
                target[nIdx] = target[idx];
                parent[nIdx] = idx;
                queue.push(nIdx);
            }
        }
    }
    return { target, parent, cols, rows };
}

// Beyond this squared distance the LOS probe to the flow target is skipped and the parent chain steers
// directly: a far unit's straight ray costs a long DDA walk every substep and quantized cell-to-cell
// motion is invisible at that range anyway.
const FLOW_LOS_MAX_D2 = 1600;

// Steering resolution for a unit with no visible near target: { tx, ty, stop } or null when the enemy
// is unreachable (sealed off; the unit holds). stop is the approach cutoff (ATTACK_RANGE when chasing a
// unit, 0 when stepping cell to cell so choke queues keep pressing forward).
function flowSteer(field: FlowField, terrainGrid: TerrainGrid | null, unit: BattleUnit) {
    const c = Math.min(field.cols - 1, Math.max(0, Math.floor(unit.x / TERRAIN_CELL_W)));
    const r = Math.min(field.rows - 1, Math.max(0, Math.floor(unit.y / TERRAIN_CELL_H)));
    const idx = r * field.cols + c;
    const enemy = field.target[idx];
    if (!enemy) return null;
    const dx = enemy.x - unit.x, dy = enemy.y - unit.y;
    if (!terrainGrid || field.parent[idx] < 0 ||
        (dx * dx + dy * dy <= FLOW_LOS_MAX_D2 && hasLOS(terrainGrid, unit.x, unit.y, enemy.x, enemy.y))) {
        return { tx: enemy.x, ty: enemy.y, stop: ATTACK_RANGE };
    }
    const p = field.parent[idx];
    return {
        tx: (p % field.cols + 0.5) * TERRAIN_CELL_W,
        ty: (Math.floor(p / field.cols) + 0.5) * TERRAIN_CELL_H,
        stop: 0
    };
}

// Catch-up guard. Substepping a big dt at army scale can cost more wall-clock than the dt being
// simulated, and every over-budget frame grows the next frame's dt: a death spiral that freezes the
// page. Each advanceBattle call therefore caps how many substeps it runs, from a deterministic cost
// model (fitted against scale probes: one substep costs ~units/500 ms) aimed at ~30ms of work per
// call. Deliberately NOT measured wall-clock time: the cap must be a pure function of battle state
// so a replayed tick stream reproduces the same fight. Small fights never hit the cap (a backgrounded
// tab still catches up in one call); huge fights simulate as fast as they can, dropping the unprocessed
// remainder of dt each call, so the arena fast-forwards smoothly instead of stalling the tab.
const CATCHUP_BUDGET_MS = 30;

/**
 * Advances the battle, substepping internally for stability. Pure: returns { battle, events } and never
 * mutates the input. Terminal event (at most one, and the loop stops on it):
 *   { type: 'battleOver', result: 'won'|'wiped'|'retreated', survivors, bugsRemaining, droidHp }
 * 'won'      = no bugs left; survivors = droids standing plus any that fled earlier.
 * 'wiped'    = no droids left and none escaped (covers mutual annihilation; bugsRemaining may be 0).
 * 'retreated'= withdrawal finished with escapees.
 * droidHp is the survivors' per-droid hp (arena standers + escapees); the squad carries these wounds
 * until the powered grid repairs them. bugsRemaining is informational only: nests reset fully.
 */
export function advanceBattle(battle: Battle, dtMs: number): { battle: Battle, events: BattleEvent[] } {
    const events: BattleEvent[] = [];
    let current = battle;
    let remaining = dtMs;
    let stepsLeft = Math.max(1, Math.ceil(CATCHUP_BUDGET_MS / (battle.units.length / 500)));
    while (remaining > 0 && events.length === 0 && stepsLeft-- > 0) {
        const step = Math.min(remaining, SUBSTEP_MS);
        remaining -= step;
        current = advanceStep(current, step, events);
    }
    return { battle: current, events };
}

function advanceStep(battle: Battle, dtMs: number, events: BattleEvent[]) {
    const dtSec = dtMs / 1000;
    const elapsedMs = battle.elapsedMs + dtMs;
    const overchargeMs = Math.max(0, battle.buffs.overchargeMs - dtMs);
    const withdrawing = battle.phase === 'withdrawing';
    const arenaW = battle.arenaW || ARENA_W;
    const arenaH = battle.arenaH || ARENA_H;
    const maxDim = Math.max(arenaW, arenaH);
    const fx = battle.fx.filter(f => elapsedMs - f.t < FX_TTL_MS);
    const units = battle.units.map(u => ({ ...u }));

    // Movement: withdrawing droids run for the left edge; everyone else seeks their nearest enemy and
    // holds position once in melee range. Wobble is applied perpendicular to the seek direction.
    // Two passes, matching the units array's droids-then-bugs order: droids target the bugs' pre-move
    // positions, then bugs target the droids' post-move positions.
    const tGrid = getTerrainGrid(battle);
    const seek = (unit: BattleUnit, t: { tx: number, ty: number, stop: number } | null) => {
        if (!t) return;
        const dx = t.tx - unit.x, dy = t.ty - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > t.stop) {
            const speed = battle.stats[unit.type].speed * dtSec;
            const wobble = Math.sin(elapsedMs / (unit.wobbleMs || 400) + unit.seed) * WOBBLE * dtSec;
            unit.x += (dx / dist) * speed + (-dy / dist) * wobble;
            unit.y += (dy / dist) * speed + (dx / dist) * wobble;
        }
    };
    // A unit that can SEE its nearest enemy charges it; one that can't (or has none near) defers to the
    // flow field, which knows the way around walls. On open ground LOS is always clear, so this is
    // exactly the historical nearest-or-flow behavior.
    const acquire = (unit: BattleUnit, nearGrid: UnitGrid, flow: FlowField) => {
        const near = nearestInGrid(nearGrid, unit.x, unit.y, maxDim, NEAR_RINGS);
        if (near && hasLOS(tGrid, unit.x, unit.y, near.x, near.y)) {
            return { tx: near.x, ty: near.y, stop: ATTACK_RANGE };
        }
        return flowSteer(flow, tGrid, unit);
    };
    // Withdrawal descends the exit field (BFS distance to the left edge) so routed droids round walls
    // instead of pressing into them; on open ground it stays the straight leftward sprint.
    const NEIGHBORS8 = [[-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 1], [1, 0]];
    const withdrawStep = (unit: BattleUnit) => {
        if (tGrid) {
            const c = Math.min(tGrid.cols - 1, Math.max(0, Math.floor(unit.x / TERRAIN_CELL_W)));
            const r = Math.min(tGrid.rows - 1, Math.max(0, Math.floor(unit.y / TERRAIN_CELL_H)));
            const here = tGrid.exitDist[r * tGrid.cols + c];
            if (here > 0) {
                let best = -1, bestD = here;
                for (const [dc, dr] of NEIGHBORS8) {
                    const nc = c + dc, nr = r + dr;
                    if (nc < 0 || nr < 0 || nc >= tGrid.cols || nr >= tGrid.rows) continue;
                    if (dc && dr && (tGrid.blocked.has(r * tGrid.cols + nc) || tGrid.blocked.has(nr * tGrid.cols + c))) continue;
                    const d = tGrid.exitDist[nr * tGrid.cols + nc];
                    if (d >= 0 && d < bestD) { bestD = d; best = nr * tGrid.cols + nc; }
                }
                if (best >= 0) {
                    const tx = (best % tGrid.cols + 0.5) * TERRAIN_CELL_W;
                    const ty = (Math.floor(best / tGrid.cols) + 0.5) * TERRAIN_CELL_H;
                    const dx = tx - unit.x, dy = ty - unit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    unit.x += (dx / dist) * WITHDRAW_SPEED * dtSec;
                    unit.y += (dy / dist) * WITHDRAW_SPEED * dtSec;
                    return;
                }
            }
        }
        unit.x -= WITHDRAW_SPEED * dtSec;
    };
    const bugGrid = buildGrid(units, 'bug', TARGET_CELL);
    const bugFlow = buildFlowField(units, 'bug', tGrid, arenaW, arenaH);
    for (const unit of units) {
        if (unit.side !== 'droid') continue;
        if (withdrawing) {
            withdrawStep(unit);
            continue;
        }
        seek(unit, acquire(unit, bugGrid, bugFlow));
    }
    const droidGrid = buildGrid(units, 'droid', TARGET_CELL);
    const droidFlow = buildFlowField(units, 'droid', tGrid, arenaW, arenaH);
    for (const unit of units) {
        // speed-0 units (spawners) don't seek at all: even the wobble term would send the hole wandering
        if (unit.side === 'bug' && battle.stats[unit.type].speed > 0) {
            seek(unit, acquire(unit, droidGrid, droidFlow));
        }
    }

    // Collision: hard personal space, both sides. Each unit is pushed out of overlap with EVERY neighbor
    // within contact distance (half the overlap each; the pair fully resolves as both get processed),
    // then clamped to the arena. Bodies can't stack, so a melee line has physical frontage: rear ranks
    // press, spread sideways, and queue instead of merging into the front. One grid holds both sides
    // (cell = contact distance, so a 3x3 scan covers it), live-updated as units are displaced: each unit
    // reacts to where earlier units actually ended up.
    const contact = 2 * UNIT_RADIUS;
    const collGrid = buildGrid(units, null, contact);
    units.forEach((unit, i) => {
        // Spawners are terrain: they occupy space (neighbors still get pushed off them) but never get
        // displaced themselves, so a crush can't shove the hole across the field.
        if (battle.stats[unit.type].speed === 0) return;
        const cx = Math.floor(unit.x / contact), cy = Math.floor(unit.y / contact);
        const oldKey = cellKey(cx, cy);
        let pushX = 0, pushY = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const bucket = collGrid.cells.get(cellKey(cx + dx, cy + dy));
                if (!bucket) continue;
                for (const entry of bucket) {
                    if (entry.i === i) continue;
                    const ddx = unit.x - entry.unit.x, ddy = unit.y - entry.unit.y;
                    const d2 = ddx * ddx + ddy * ddy;
                    if (d2 >= contact * contact) continue;
                    const d = Math.sqrt(d2);
                    if (d < 0.001) {
                        // Exactly stacked (old saves, bomb knock-ins): split along the unit's own phase
                        // angle; the partner resolves along its different angle when its turn comes.
                        pushX += Math.cos(unit.seed) * UNIT_RADIUS;
                        pushY += Math.sin(unit.seed) * UNIT_RADIUS;
                    }
                    else {
                        const overlap = (contact - d) / 2;
                        pushX += (ddx / d) * overlap;
                        pushY += (ddy / d) * overlap;
                    }
                }
            }
        }
        // Cap the net displacement: in a deep crush the summed pushes can exceed a body width, and an
        // uncapped shove would tunnel units through their neighbors.
        const push = Math.sqrt(pushX * pushX + pushY * pushY);
        if (push > contact) { pushX *= contact / push; pushY *= contact / push; }
        unit.x += pushX;
        unit.y += pushY;
        // Terrain is the other immovable body: whatever the crush did, walls win
        if (tGrid) collideTerrain(tGrid, unit);
        unit.x = Math.min(arenaW - 1, Math.max(withdrawing && unit.side === 'droid' ? -2 : 1, unit.x));
        unit.y = Math.min(arenaH - 1, Math.max(1, unit.y));
        const newKey = cellKey(Math.floor(unit.x / contact), Math.floor(unit.y / contact));
        if (newKey !== oldKey) {
            const oldBucket = collGrid.cells.get(oldKey);
            if (oldBucket) oldBucket.splice(oldBucket.findIndex(entry => entry.i === i), 1);
            const newBucket = collGrid.cells.get(newKey);
            if (newBucket) newBucket.push({ unit, i }); else collGrid.cells.set(newKey, [{ unit, i }]);
        }
    });

    // Attacks. Damage lands immediately on the shared clones, so simultaneous kills within a substep are
    // possible (both sides can hit 0), and later attackers retarget past enemies that just dropped (the
    // grids hold references; the hp check happens at query time). Withdrawing droids don't fight back;
    // that IS the retreat cost.
    const overchargeActive = overchargeMs > 0;
    const rateMultiplier = EQUIPMENT_DEFS.overchargeCell.effect.rateMultiplier;
    const targetGrids = {
        droid: buildGrid(units, 'bug', TARGET_CELL),
        bug: buildGrid(units, 'droid', TARGET_CELL)
    };
    for (const unit of units) {
        unit.cooldownMs = Math.max(0, unit.cooldownMs - dtMs);
        if (unit.hp <= 0 || unit.cooldownMs > 0) continue;
        if (unit.side === 'droid' && withdrawing) continue;
        const stats = battle.stats[unit.type];
        if (stats.damage <= 0) continue; // spawners don't fight back; their threat is the spawn clock
        // Ring cap 1: attacks only land within ATTACK_RANGE, and that's always inside the 3x3 cell
        // block (range << cell size), so searching the whole arena for a target to then range-reject
        // was pure waste. Within the cap the pick is exact, so hits land identically.
        const target = nearestInGrid(targetGrids[unit.side], unit.x, unit.y, maxDim, 1);
        if (!target) continue;
        const dx = target.x - unit.x, dy = target.y - unit.y;
        if (dx * dx + dy * dy > ATTACK_RANGE * ATTACK_RANGE) continue;
        // No stabbing through walls: melee reach slightly exceeds wall thickness at cell corners
        if (tGrid && !hasLOS(tGrid, unit.x, unit.y, target.x, target.y)) continue;
        target.hp -= stats.damage;
        unit.cooldownMs = unit.side === 'droid' && overchargeActive ? stats.attackMs / rateMultiplier : stats.attackMs;
        // Cosmetic strike cue: the renderer lunges the glyph along this direction, then springs back.
        // The unit's real position never moves (range checks and determinism are untouched).
        const reach = Math.sqrt(dx * dx + dy * dy) || 1;
        unit.strike = { dx: dx / reach, dy: dy / reach, t: elapsedMs };
        fx.push({ type: target.hp <= 0 ? 'death' : 'hit', x: target.x, y: target.y, t: elapsedMs });
    }

    // Sweep the field: drop the dead, bank withdrawing droids that reached the edge (with their hp).
    let escaped = battle.escaped;
    const escapedHp = battle.escapedHp.slice();
    const alive: BattleUnit[] = [];
    for (const unit of units) {
        if (unit.hp <= 0) continue;
        if (unit.side === 'droid' && withdrawing && unit.x <= ESCAPE_X) { escaped++; escapedHp.push(unit.hp); continue; }
        alive.push(unit);
    }

    // Spawners: each living hive runs its own deterministic clock (same countdown convention as attack
    // cooldowns, so replays land identically) and on firing disgorges a batch of fresh bugs at its rim;
    // they join targeting/collision on the next substep. battle.spawnCounter hands late arrivals ids and
    // hash streams the opening roster can never collide with. A hive holds fire while spawnCap
    // non-spawner bugs are already afield, so a stalled assault meets a saturated field, not an
    // ever-denser death spiral.
    let spawnCounter = battle.spawnCounter || 0;
    let fieldBugs = 0;
    for (const u of alive) if (u.side === 'bug' && !battle.stats[u.type].spawnEveryMs) fieldBugs++;
    const spawned: BattleUnit[] = [];
    for (const unit of alive) {
        const stats = battle.stats[unit.type];
        if (unit.side !== 'bug' || !stats.spawnEveryMs) continue;
        unit.spawnMs = Math.max(0, (unit.spawnMs ?? 0) - dtMs); // a spawner from an older save has no clock: spawn now
        if (unit.spawnMs > 0) continue;
        unit.spawnMs = stats.spawnEveryMs;
        const spawnType = stats.spawns;
        if (!spawnType) continue;
        const spawnStats = battle.stats[spawnType];
        for (let k = 0; k < (stats.spawnBatch ?? 1) && fieldBugs < (stats.spawnCap ?? Infinity); k++) {
            const base = 1000003 + spawnCounter * 2 + 1; // far above any opening roster's i*2+1 streams
            const angle = hash01(base + 400009) * 2 * Math.PI;
            const sx = unit.x + Math.cos(angle) * (2 * UNIT_RADIUS + 0.6);
            const sy = unit.y + Math.sin(angle) * (2 * UNIT_RADIUS + 0.6);
            spawned.push(makeUnit(`s${spawnCounter}`, 'bug', spawnType, spawnStats, base,
                sx, sy, arenaW, arenaH));
            fx.push({ type: 'spawn', x: sx, y: sy, t: elapsedMs });
            spawnCounter++;
            fieldBugs++;
        }
    }
    alive.push(...spawned);
    const bugsPeak = Math.max(battle.bugsPeak || 0, fieldBugs); // swarm high-water mark (header denominator)

    const droidsLeft = alive.reduce((n, u) => n + (u.side === 'droid' ? 1 : 0), 0);
    const bugsLeft = alive.length - droidsLeft;
    if (droidsLeft === 0) {
        events.push(escaped > 0
            ? { type: 'battleOver', result: 'retreated', survivors: escaped, bugsRemaining: bugsLeft, droidHp: escapedHp }
            : { type: 'battleOver', result: 'wiped', survivors: 0, bugsRemaining: bugsLeft, droidHp: [] });
    }
    else if (bugsLeft === 0) {
        const standerHp = alive.filter(u => u.side === 'droid').map(u => u.hp);
        events.push({ type: 'battleOver', result: 'won', survivors: droidsLeft + escaped,
            bugsRemaining: 0, droidHp: [...standerHp, ...escapedHp] });
    }

    return { ...battle, elapsedMs, escaped, escapedHp, spawnCounter, bugsPeak, buffs: { overchargeMs }, fx, units: alive };
}

/**
 * Applies an equipment piece's effect (EQUIPMENT_DEFS[itemId].effect) to the battle. Pure; charge
 * accounting is the caller's job. All effects are instant and untargeted for now (aiming is a later
 * positional upgrade): the demo charge self-targets the densest bug clump and never harms droids.
 */
export function applyEquipment(battle: Battle, itemId: EquipmentId): Battle {
    const def = EQUIPMENT_DEFS[itemId];
    if (!def) return battle;
    const effect = def.effect;

    if (effect.kind === 'aoe') {
        const bugs = battle.units.filter(u => u.side === 'bug');
        if (bugs.length === 0) return battle;
        const r2 = effect.radius * effect.radius;
        let center = bugs[0], most = -1;
        for (const candidate of bugs) {
            let neighbors = 0;
            for (const other of bugs) {
                const dx = other.x - candidate.x, dy = other.y - candidate.y;
                if (dx * dx + dy * dy <= r2) neighbors++;
            }
            if (neighbors > most) { most = neighbors; center = candidate; }
        }
        const fx: BattleFx[] = [...battle.fx, { type: 'bomb', x: center.x, y: center.y, t: battle.elapsedMs }];
        const units: BattleUnit[] = [];
        for (const u of battle.units) {
            const dx = u.x - center.x, dy = u.y - center.y;
            if (u.side === 'bug' && dx * dx + dy * dy <= r2) {
                const hp = u.hp - effect.damage;
                fx.push({ type: hp <= 0 ? 'death' : 'hit', x: u.x, y: u.y, t: battle.elapsedMs });
                if (hp > 0) units.push({ ...u, hp });
            }
            else units.push(u);
        }
        return { ...battle, units, fx };
    }

    if (effect.kind === 'heal') {
        const fx = battle.fx.slice();
        const units = battle.units.map(u => {
            if (u.side !== 'droid' || u.hp >= u.maxHp) return u;
            fx.push({ type: 'heal', x: u.x, y: u.y, t: battle.elapsedMs });
            return { ...u, hp: Math.min(u.maxHp, u.hp + effect.amount) };
        });
        return { ...battle, units, fx };
    }

    if (effect.kind === 'overcharge') {
        return { ...battle, buffs: { ...battle.buffs, overchargeMs: battle.buffs.overchargeMs + effect.durationMs } };
    }

    return battle;
}

// Orders the withdrawal; droids stop fighting and run for the edge while bugs keep swinging at whoever is
// in reach, so the cost of retreating scales with how engaged you were. No-op if already withdrawing.
export function startWithdrawal(battle: Battle): Battle {
    return battle.phase === 'withdrawing' ? battle : { ...battle, phase: 'withdrawing' };
}
