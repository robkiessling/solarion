import {EQUIPMENT_DEFS, type EquipmentId} from "../../database/squad/equipment";
import {typedEntries} from "../helpers";
import {TERRAIN_PIECES, type TerrainPieceId} from "../../database/battle/terrain_art";
import {HOSTILE_TYPES, DROID_BASE_STATS, type HostileType, type DroidStats, type UnitStats, type UnitType} from "../../database/battle/units";
import {GROUND_BLURBS, HOSTILE_BLURBS, RING_SPAWNER_BLURBS} from "../../database/battle/blurbs";
import {COUNTER_FORMATIONS, FORMATIONS, hash01, TERRAIN_ANCHORS, TERRAIN_CELL_H, TERRAIN_CELL_W, TERRAIN_LAYOUTS, type FormationId, type HostileFormation, type TerrainLayoutId, type XY} from "./layouts";
export type {FormationId, HostileFormation, TerrainLayoutId} from "./layouts";

export type BattleSide = 'droid' | 'hostile';

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

/** A renderer marker at (x, y). A 'shot' is a ranged unit's tracer: (x, y) is the target, (x2, y2) the shooter.
 * A 'blast' is a splash burst of radius r (the squad's bomb draws its own 'bomb' ring at the bomb's fixed size). */
export interface BattleFx { type: 'hit' | 'death' | 'heal' | 'bomb' | 'spawn' | 'shot' | 'blast'; x: number; y: number; t: number; x2?: number; y2?: number; r?: number }

/** A placed obstacle: `art` names a TERRAIN_PIECES entry (database/battle/terrain_art.ts) */
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
    startingHostiles: number;
    startingSpawners: number;
    hostilesPeak: number;
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
    hostilesRemaining: number;
    /** the survivors' hulls */
    droidHp: number[];
}

export type BattleEvent = BattleOverEvent;

// Content records (unit stats, scene text, arena art) live in database/battle/; this module is the engine.

/**
 * Real-time per-unit battle sim: the skirmish that plays out in the encounter popup when the squad attacks
 * a settlement. Pure module in the squad.ts mold: redux owns the battle object (inside squad.fighting) and calls
 * advanceBattle from the planet tick; the popup's canvas just draws unit positions.
 *
 * Model: every droid and hostile is an agent with position, hp, and an attack cooldown. Units seek the nearest
 * enemy and trade fixed damage in melee range; bodies collide (both sides), so frontage is physical and
 * rear ranks queue. Spawn arrangements are data-driven (FORMATIONS: settlements declare poi.formation, droids
 * deploy in squadron blocks unless the hostile formation dictates a counter-layout). Spawner-type hostiles
 * (HOSTILE_TYPES rows with spawnEveryMs) sit immobile and feed fresh hostiles into the fight on a fixed clock
 * until killed. The outcome emerges from counts, per-unit stats, the opening geometry, and
 * whatever equipment the player fires mid-fight. Deliberately no RNG anywhere: motion "wobble" is a deterministic
 * per-unit sine drift, so a replayed tick stream (save reload, background-tab catch-up) reproduces the same
 * fight. Positions live in a float arena space sized per battle (constant unit density, so big armies get a
 * bigger field, not a mosh pit); pixel scaling is the renderer's problem, which is what lets the popup grow
 * as armies scale. Neighbor queries go through a spatial hash grid, so endgame armies (hundreds per side)
 * and their catch-up replays stay cheap.
 *
 * Terrain: settlements may declare an obstacle layout (poi.terrain -> TERRAIN_LAYOUTS), which stamps ASCII
 * pieces (database/battle/terrain_art.ts) onto a coarse cell grid at battle creation. Blocked cells are
 * impassable to both sides: bodies collide with them, target acquisition demands line of sight, the
 * flow field and the withdrawal route path around them, and spawn positions that land inside are
 * relocated to the nearest reachable ground. Since frontage is already physical, walls and chokepoints
 * shape fights with no new combat rules. Pieces are sized in body-widths (they do NOT grow with the
 * arena; layouts place MORE of them), and the whole thing stays deterministic: the placed piece list
 * lives on battle.terrain, everything else is derived.
 */

// Baseline arena coordinate space. Droids enter from the left, hostiles from the right. Battles above
// ARENA_BASELINE_UNITS total combatants scale both dimensions up (see createBattle); battle.arenaW/arenaH
// are the authoritative dimensions, these constants are the floor (and the fallback for pre-scaling saves).
/** Coarse obstacle grid derived from a battle's terrain pieces; see getTerrainGrid */
type TerrainGrid = { cols: number, rows: number, blocked: Set<number>, exitDist: Int32Array };
/** Spatial hash of one side's units; see buildGrid */
type UnitGrid = { cells: Map<number, { unit: BattleUnit, i: number }[]>, cell: number, count: number };
type FlowField = ReturnType<typeof buildFlowField>;

export const ARENA_W = 100;
export const ARENA_H = 60;
const ARENA_BASELINE_UNITS = 320;  // a 160v160 fills the baseline arena at design density

// --- Tuning ---
// The unit stat blocks (DROID_BASE_STATS, HOSTILE_TYPES) are content records in database/battle/units.ts; the
// dials below are engine mechanics.
const ATTACK_RANGE = 3;
const UNIT_RADIUS = 1.2;        // hard collision radius, both sides: pairs closer than 2R get pushed apart,
                                // so frontage is physical (only the units that fit can engage; ranks queue)
const WOBBLE = 3;               // units/sec of deterministic lateral drift (organic motion without RNG)
const WITHDRAW_SPEED = 13;      // faster than hostiles, so disengaging works once contact is broken
const ESCAPE_X = 1.5;           // a withdrawing droid past this x has left the field
const SUBSTEP_MS = 50;          // integration cap; callers may pass any dt (catch-up replays big ones)
export const FX_TTL_MS = 600;   // hit/death/bomb markers linger this long for the renderer

// A fresh squad's per-droid hp list (persistence helpers: squad state and save migration use it too).
export function fullDroidHp(count: number, maxHp: number = DROID_BASE_STATS.hp): number[] {
    return new Array(count).fill(maxHp);
}

/**
 * Terrain: impassable obstacle cells stamped from ASCII pieces (database/battle/terrain_art.ts; the art is
 * the collision map, non-space char = blocked cell). Cells match the renderer's glyph metrics (a body
 * width wide, a glyph tall), so a piece is a fixed size in BODIES at any arena scale; a choke that
 * admits three droids admits three droids in every fight. battle.terrain stores only the placed piece
 * list ({ art, col, row }); the blocked set and the exit field are derived (and cached per terrain
 * object, so save reloads rebuild them transparently).
 */

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
                // Center inside the cell (bomb knock-in, fresh shelter spawn): eject through the nearest face
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

// One-line scene description for the battle footer: ground clause + the garrison's opening (text records
// in database/battle/blurbs.ts), matching what the arena actually shows. Pure presentation (derived at render
// time, nothing reads it back), so existing mid-fight saves get it too.
export function battleBlurb(battle: Battle, formation?: HostileFormation): string {
    const ground = GROUND_BLURBS[battle.terrain ? battle.terrain.id : 'open'] || GROUND_BLURBS.open;
    let hostiles = (formation && HOSTILE_BLURBS[formation]) || HOSTILE_BLURBS.column;
    // The ring's center slot is where a garrison's leading shelter stands (see createBattle); name the
    // objective when it's really there
    if (formation === 'ring' && battle.startingSpawners > 0) {
        hostiles = battle.startingSpawners > 1 ? RING_SPAWNER_BLURBS.many : RING_SPAWNER_BLURBS.one;
    }
    return `${ground}; ${hostiles}.`;
}

// One combat-ready unit. `base` selects the unit's deterministic hash streams (opening swing delay,
// wobble phase/period, collision tie-break angle) and must be unique across every unit the battle will
// ever hold, including hostiles a spawner adds mid-fight.
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
function spawnUnits(side: BattleSide, roster: { type: UnitType, hp?: number }[], statsByType: Record<UnitType, UnitStats>, arenaW: number, arenaH: number, formation: FormationId, terrainGrid: TerrainGrid | null, anchor: XY | null = null): BattleUnit[] {
    const layout = FORMATIONS[formation] || FORMATIONS.column;
    let positions = layout(roster.length, arenaW, arenaH, side);
    if (anchor && positions.length > 0) {
        const cx = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
        const cy = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
        positions = positions.map(p => ({ x: p.x + anchor.x - cx, y: p.y + anchor.y - cy }));
    }
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
 * `hostiles` is a composition { hostileType: count }. Hostiles always spawn at
 * full strength: settlements reset completely between engagements (each side heals at home), so every assault
 * faces the full garrison and must be decisive.
 * `droidStats` is the squad's effective stat block (base + researched upgrades), snapshotted onto the
 * battle so a mid-fight save replays with the stats the fight started with.
 * `hostileFormation` is the settlement's spawn layout (poi.formation; see FORMATIONS), defaulting to the column
 * front. Droids deploy in squadron blocks unless the hostile formation dictates a counter-layout
 * (COUNTER_FORMATIONS: a surround opening re-anchors the squadrons to the middle of the field).
 * Composition entry order maps to formation slots (the first roster unit takes layout index 0), so a
 * ring-formation garrison declared { shelter: 1, hostile: N } puts the shelter at the ring's center, and the
 * pocket layouts (clusters, surround) lead with one slot per pocket center, distributing leading shelters
 * one per pocket.
 * `terrainId` picks an obstacle layout (poi.terrain; see TERRAIN_LAYOUTS), generated deterministically
 * from `terrainSalt`. Callers pass a salt derived from the settlement's map position, so the same settlement always
 * fights on the same ground; unset = open field.
 */
export function createBattle(droids: number | number[], hostiles: Partial<Record<HostileType, number>>,
                             droidStats: DroidStats = DROID_BASE_STATS, hostileFormation: HostileFormation = 'column',
                             terrainId: TerrainLayoutId | null = null, terrainSalt = 0): Battle {
    const droidHp = Array.isArray(droids) ? droids : fullDroidHp(droids, droidStats.hp);
    const stats: Record<UnitType, UnitStats> = { droid: droidStats, ...HOSTILE_TYPES };
    const hostileRoster: { type: HostileType, hp?: number }[] = [];
    typedEntries(hostiles).forEach(([type, n]) => {
        for (let i = 0; i < n; i++) hostileRoster.push({ type });
    });

    const startingSpawners = hostileRoster.reduce((n, e) => n + (HOSTILE_TYPES[e.type].spawnEveryMs ? 1 : 0), 0);

    // Constant-density field: area grows with headcount, so linear dimensions scale with its square root.
    // Small fights stay on the baseline arena (never shrink below it).
    const arenaScale = Math.max(1, Math.sqrt((droidHp.length + hostileRoster.length) / ARENA_BASELINE_UNITS));
    const arenaW = Math.round(ARENA_W * arenaScale);
    const arenaH = Math.round(ARENA_H * arenaScale);

    const terrainLayout = terrainId && TERRAIN_LAYOUTS[terrainId];
    const terrainPieces = terrainLayout ? terrainLayout(arenaW, arenaH, terrainSalt) : [];
    const terrain = terrainId && terrainPieces.length > 0 ? { id: terrainId, pieces: terrainPieces } : null;
    const terrainGrid = terrain ? buildTerrainGrid(terrainPieces, arenaW, arenaH) : null;
    if (terrain) TERRAIN_GRID_CACHE.set(terrain, terrainGrid);
    const anchorFor = terrainId && TERRAIN_ANCHORS[terrainId];
    const hostileAnchor = anchorFor ? anchorFor(arenaW, arenaH, terrainSalt) : null;

    return {
        phase: 'active',
        elapsedMs: 0,
        stats,                          // per-type stat blocks this battle runs on (upgrade snapshot)
        arenaW,                         // field dimensions for this engagement (renderer + clamps)
        arenaH,
        startingDroids: droidHp.length, // initial force sizes; the header fractions read against these
        startingHostiles: hostileRoster.length,
        startingSpawners,
        // High-water mark of the field (spawners excluded): the header's hostile-fraction denominator, so a
        // spawner-fed garrison reads against its true peak instead of overflowing its starting total
        hostilesPeak: hostileRoster.length - startingSpawners,
        spawnCounter: 0,                // hostiles spawned mid-fight so far: unique ids/hash streams for late arrivals
        escaped: 0,                     // withdrawing droids that reached the edge (they count as survivors)
        escapedHp: [],                  // ...and the hp each of them left with (persists onto the squad)
        buffs: { overchargeMs: 0 },
        terrain,                        // { id, pieces: [{ art, col, row }] } or null for open ground
        fx: [],                         // { type: 'hit'|'death'|'heal'|'bomb', x, y, t } markers for the renderer
        units: [
            ...spawnUnits('droid', droidHp.map(hp => ({ type: 'droid', hp })), stats, arenaW, arenaH,
                COUNTER_FORMATIONS[hostileFormation] || 'edge', terrainGrid),
            ...spawnUnits('hostile', hostileRoster, stats, arenaW, arenaH, hostileFormation, terrainGrid, hostileAnchor)
        ]
    };
}

export function countUnits(battle: Battle, side: BattleSide): number {
    return battle.units.reduce((n, u) => n + (u.side === side ? 1 : 0), 0);
}

// Living spawners afield: the header's spawner fraction reads these against startingSpawners.
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
 *   { type: 'battleOver', result: 'won'|'wiped'|'retreated', survivors, hostilesRemaining, droidHp }
 * 'won'      = no hostiles left; survivors = droids standing plus any that fled earlier.
 * 'wiped'    = no droids left and none escaped (covers mutual annihilation; hostilesRemaining may be 0).
 * 'retreated'= withdrawal finished with escapees.
 * droidHp is the survivors' per-droid hp (arena standers + escapees); the squad carries these wounds
 * until the powered grid repairs them. hostilesRemaining is informational only: settlements reset fully.
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
    // Two passes, matching the units array's droids-then-hostiles order: droids target the hostiles' pre-move
    // positions, then hostiles target the droids' post-move positions.
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
            // A ranged unit holds just inside its reach instead of closing to melee (NEAR_RINGS spans more
            // than any declared range, so the exact search always covers it)
            const range = battle.stats[unit.type].range;
            return { tx: near.x, ty: near.y, stop: range && range > ATTACK_RANGE ? range * 0.9 : ATTACK_RANGE };
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
    const hostileGrid = buildGrid(units, 'hostile', TARGET_CELL);
    const hostileFlow = buildFlowField(units, 'hostile', tGrid, arenaW, arenaH);
    for (const unit of units) {
        if (unit.side !== 'droid') continue;
        if (withdrawing) {
            withdrawStep(unit);
            continue;
        }
        seek(unit, acquire(unit, hostileGrid, hostileFlow));
    }
    const droidGrid = buildGrid(units, 'droid', TARGET_CELL);
    const droidFlow = buildFlowField(units, 'droid', tGrid, arenaW, arenaH);
    for (const unit of units) {
        // speed-0 units (spawners) don't seek at all: even the wobble term would send the hole wandering
        if (unit.side === 'hostile' && battle.stats[unit.type].speed > 0) {
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
        droid: buildGrid(units, 'hostile', TARGET_CELL),
        hostile: buildGrid(units, 'droid', TARGET_CELL)
    };
    for (const unit of units) {
        unit.cooldownMs = Math.max(0, unit.cooldownMs - dtMs);
        if (unit.hp <= 0 || unit.cooldownMs > 0) continue;
        if (unit.side === 'droid' && withdrawing) continue;
        const stats = battle.stats[unit.type];
        if (stats.damage <= 0) continue; // spawners don't fight back; their threat is the spawn clock
        // Reach is melee unless the type declares a range. The grid search is capped to the rings that can
        // hold a target in reach: melee reach is always inside the 3x3 cell block (range << cell size), so
        // searching the whole arena for a target to then range-reject was pure waste; a ranged unit scans as
        // many rings as its reach spans. Within the cap the pick is exact, so hits land identically.
        const range = stats.range ?? ATTACK_RANGE;
        const ranged = range > ATTACK_RANGE;
        const ringCap = ranged ? Math.ceil(range / TARGET_CELL) + 1 : 1;
        const target = nearestInGrid(targetGrids[unit.side], unit.x, unit.y, maxDim, ringCap);
        if (!target) continue;
        const dx = target.x - unit.x, dy = target.y - unit.y;
        if (dx * dx + dy * dy > range * range) continue;
        // No stabbing (or shooting) through walls: melee reach slightly exceeds wall thickness at cell corners
        if (tGrid && !hasLOS(tGrid, unit.x, unit.y, target.x, target.y)) continue;
        unit.cooldownMs = unit.side === 'droid' && overchargeActive ? stats.attackMs / rateMultiplier : stats.attackMs;
        if (stats.splash) {
            // The attack bursts: every enemy within the splash radius of the burst takes the full damage (the
            // struck target included), each with its own hit or death mark under one blast ring. A ranged shot
            // bursts on the target (with a tracer); a detonating unit bursts on itself and dies in the same step
            // (the sweep below drops it), so its blast is the whole of its attack.
            const bx = stats.detonates ? unit.x : target.x, by = stats.detonates ? unit.y : target.y;
            const s2 = stats.splash * stats.splash;
            if (ranged) fx.push({ type: 'shot', x: target.x, y: target.y, x2: unit.x, y2: unit.y, t: elapsedMs });
            fx.push({ type: 'blast', x: bx, y: by, r: stats.splash, t: elapsedMs });
            for (const victim of units) {
                if (victim.side === unit.side || victim.hp <= 0) continue;
                const vx = victim.x - bx, vy = victim.y - by;
                if (vx * vx + vy * vy > s2) continue;
                victim.hp -= stats.damage;
                fx.push({ type: victim.hp <= 0 ? 'death' : 'hit', x: victim.x, y: victim.y, t: elapsedMs });
            }
            if (stats.detonates) {
                unit.hp = 0;
                fx.push({ type: 'death', x: unit.x, y: unit.y, t: elapsedMs });
            }
            continue;
        }
        target.hp -= stats.damage;
        if (ranged) {
            // A shot draws as a tracer from the shooter to the target; the shooter itself stays put
            fx.push({ type: 'shot', x: target.x, y: target.y, x2: unit.x, y2: unit.y, t: elapsedMs });
        }
        else {
            // Cosmetic strike cue: the renderer lunges the glyph along this direction, then springs back.
            // The unit's real position never moves (range checks and determinism are untouched).
            const reach = Math.sqrt(dx * dx + dy * dy) || 1;
            unit.strike = { dx: dx / reach, dy: dy / reach, t: elapsedMs };
        }
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

    // Spawners: each living shelter runs its own deterministic clock (same countdown convention as attack
    // cooldowns, so replays land identically) and on firing sends out a batch of fresh hostiles at its rim;
    // they join targeting/collision on the next substep. battle.spawnCounter hands late arrivals ids and
    // hash streams the opening roster can never collide with. A shelter holds fire while spawnCap
    // non-spawner hostiles are already afield, so a stalled assault meets a saturated field, not an
    // ever-denser death spiral.
    let spawnCounter = battle.spawnCounter || 0;
    let fieldHostiles = 0;
    for (const u of alive) if (u.side === 'hostile' && !battle.stats[u.type].spawnEveryMs) fieldHostiles++;
    const spawned: BattleUnit[] = [];
    for (const unit of alive) {
        const stats = battle.stats[unit.type];
        if (unit.side !== 'hostile' || !stats.spawnEveryMs) continue;
        unit.spawnMs = Math.max(0, (unit.spawnMs ?? 0) - dtMs); // a spawner from an older save has no clock: spawn now
        if (unit.spawnMs > 0) continue;
        unit.spawnMs = stats.spawnEveryMs;
        const spawnType = stats.spawns;
        if (!spawnType) continue;
        const spawnStats = battle.stats[spawnType];
        for (let k = 0; k < (stats.spawnBatch ?? 1) && fieldHostiles < (stats.spawnCap ?? Infinity); k++) {
            const base = 1000003 + spawnCounter * 2 + 1; // far above any opening roster's i*2+1 streams
            const angle = hash01(base + 400009) * 2 * Math.PI;
            const sx = unit.x + Math.cos(angle) * (2 * UNIT_RADIUS + 0.6);
            const sy = unit.y + Math.sin(angle) * (2 * UNIT_RADIUS + 0.6);
            spawned.push(makeUnit(`s${spawnCounter}`, 'hostile', spawnType, spawnStats, base,
                sx, sy, arenaW, arenaH));
            fx.push({ type: 'spawn', x: sx, y: sy, t: elapsedMs });
            spawnCounter++;
            fieldHostiles++;
        }
    }
    alive.push(...spawned);
    const hostilesPeak = Math.max(battle.hostilesPeak || 0, fieldHostiles); // field high-water mark (header denominator)

    const droidsLeft = alive.reduce((n, u) => n + (u.side === 'droid' ? 1 : 0), 0);
    const hostilesLeft = alive.length - droidsLeft;
    if (droidsLeft === 0) {
        events.push(escaped > 0
            ? { type: 'battleOver', result: 'retreated', survivors: escaped, hostilesRemaining: hostilesLeft, droidHp: escapedHp }
            : { type: 'battleOver', result: 'wiped', survivors: 0, hostilesRemaining: hostilesLeft, droidHp: [] });
    }
    else if (hostilesLeft === 0) {
        const standerHp = alive.filter(u => u.side === 'droid').map(u => u.hp);
        events.push({ type: 'battleOver', result: 'won', survivors: droidsLeft + escaped,
            hostilesRemaining: 0, droidHp: [...standerHp, ...escapedHp] });
    }

    return { ...battle, elapsedMs, escaped, escapedHp, spawnCounter, hostilesPeak, buffs: { overchargeMs }, fx, units: alive };
}

/**
 * Applies an equipment piece's effect (EQUIPMENT_DEFS[itemId].effect) to the battle. Pure; charge
 * accounting is the caller's job. All effects are instant and untargeted for now (aiming is a later
 * positional upgrade): the demo charge self-targets the densest hostile clump and never harms droids.
 */
export function applyEquipment(battle: Battle, itemId: EquipmentId): Battle {
    const def = EQUIPMENT_DEFS[itemId];
    if (!def) return battle;
    const effect = def.effect;

    if (effect.kind === 'aoe') {
        const hostiles = battle.units.filter(u => u.side === 'hostile');
        if (hostiles.length === 0) return battle;
        const r2 = effect.radius * effect.radius;
        let center = hostiles[0], most = -1;
        for (const candidate of hostiles) {
            let neighbors = 0;
            for (const other of hostiles) {
                const dx = other.x - candidate.x, dy = other.y - candidate.y;
                if (dx * dx + dy * dy <= r2) neighbors++;
            }
            if (neighbors > most) { most = neighbors; center = candidate; }
        }
        const fx: BattleFx[] = [...battle.fx, { type: 'bomb', x: center.x, y: center.y, t: battle.elapsedMs }];
        const units: BattleUnit[] = [];
        for (const u of battle.units) {
            const dx = u.x - center.x, dy = u.y - center.y;
            if (u.side === 'hostile' && dx * dx + dy * dy <= r2) {
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

// Orders the withdrawal; droids stop fighting and run for the edge while hostiles keep swinging at whoever is
// in reach, so the cost of retreating scales with how engaged you were. No-op if already withdrawing.
export function startWithdrawal(battle: Battle): Battle {
    return battle.phase === 'withdrawing' ? battle : { ...battle, phase: 'withdrawing' };
}
