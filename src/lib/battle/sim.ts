import {EQUIPMENT_DEFS, type EquipmentId} from "../../database/squad/equipment";
import {typedEntries} from "../helpers";
import {terrainPieceLook, type TerrainPieceId} from "../../database/battle/terrain_art";
import {HOSTILE_TYPES, DROID_BASE_STATS, type HostileType, type DroidStats, type UnitStats, type UnitType} from "../../database/battle/units";
import {GROUND_BLURBS, OPENING_BLURBS, SOURCE_BLURBS} from "../../database/battle/blurbs";
import {ARENA_H, ARENA_W, hash01, TERRAIN_CELL_H, TERRAIN_CELL_W, type XY} from "./arena";
import {droidOpening, hostileOpening, type Opening, type SpawnRole, type Spread} from "./openings";
import {drawnArena, terrainMarkers, TERRAINS, type TerrainId} from "./terrain";
export {ARENA_H, ARENA_W} from "./arena";
export type {Opening, Spread} from "./openings";
export type {TerrainId} from "./terrain";

export type BattleSide = 'droid' | 'hostile';

export interface BattleUnit {
    id: string;
    side: BattleSide;
    type: UnitType;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    /** real combatants this unit stands for (see FIELD_CAP): its hull and damage are that many units' worth.
     * Unset = 1, which is every unit of a fight under the cap. */
    count?: number;
    /** a droid unit standing for several: the hull of each droid it still holds (`hp` is their sum). Wounds
     * persist between fights, so its members are told apart instead of pooled. Unset on a unit of one. */
    memberHp?: number[];
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

/** A placed obstacle: `art` names a TERRAIN_PIECES entry (database/battle/terrain_art.ts), `look` which of
 * its looks (unset = the first) */
export interface BattleTerrainPiece { art: TerrainPieceId; col: number; row: number; look?: number }

export type BattlePhase = 'active' | 'withdrawing';

export interface Battle {
    phase: BattlePhase;
    elapsedMs: number;
    /** per-type stat blocks this battle runs on */
    stats: { [unitType: string]: UnitStats };
    arenaW: number;
    arenaH: number;
    /** the engagement's scale factor (see FIELD_CAP): the most real combatants any one field unit stands for is
     * this, rounded up. 1 = every unit is one droid or hostile. What a given unit stands for is its own `count`. */
    stack: number;
    /** force sizes in FIELD units (what the arena holds and draws) */
    startingDroids: number;
    startingHostiles: number;
    startingSpawners: number;
    hostilesPeak: number;
    /** the same in REAL combatants (what the header reads); see battleHeadcount */
    realDroids: number;
    realSpawners: number;
    realHostilesPeak: number;
    spawnCounter: number;
    escaped: number;
    escapedHp: number[];
    buffs: { overchargeMs: number };
    terrain: { id: TerrainId; pieces: BattleTerrainPiece[] } | null;
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
 * rear ranks queue. The opening is data-driven (lib/battle/openings.ts: hostiles form groups on spawn points,
 * the terrain's own or the ones a level's opening lays out; droids deploy in squadron blocks). Spawner-type hostiles
 * (HOSTILE_TYPES rows with spawnEveryMs) sit immobile and feed fresh hostiles into the fight on a fixed clock
 * until killed. The outcome emerges from counts, per-unit stats, the opening geometry, and
 * whatever equipment the player fires mid-fight. Deliberately no RNG anywhere: motion "wobble" is a deterministic
 * per-unit sine drift, so a replayed tick stream (save reload, background-tab catch-up) reproduces the same
 * fight. Positions live in a float arena space sized per battle (constant unit density, so big armies get a
 * bigger field, not a mosh pit); pixel scaling is the renderer's problem, which is what lets the popup grow
 * as armies scale. Neighbor queries go through a spatial hash grid, so endgame armies (hundreds per side)
 * and their catch-up replays stay cheap.
 *
 * Terrain: settlements may declare an obstacle layout (poi.terrain -> TERRAINS), which stamps ASCII
 * pieces (database/battle/terrain_art.ts) onto a coarse cell grid at battle creation. Blocked cells are
 * impassable to both sides: bodies collide with them, target acquisition demands line of sight, the
 * flow field and the withdrawal route path around them, and spawn positions that land inside are
 * relocated to the nearest reachable ground. Since frontage is already physical, walls and chokepoints
 * shape fights with no new combat rules. Pieces are sized in body-widths (they do NOT grow with the
 * arena; a scattered terrain places MORE of them), and the whole thing stays deterministic: the placed piece list
 * lives on battle.terrain, everything else is derived.
 */

/** Coarse obstacle grid derived from a battle's terrain pieces; see getTerrainGrid */
type TerrainGrid = { cols: number, rows: number, blocked: Set<number>, exitDist: Int32Array, exit: XY | null };
/** Spatial hash of one side's units; see buildGrid */
type UnitGrid = { cells: Map<number, { unit: BattleUnit, i: number }[]>, cell: number, count: number };
type FlowField = ReturnType<typeof buildFlowField>;

const ARENA_BASELINE_UNITS = 320;  // a 160v160 fills the baseline arena at design density
const CELLS_PER_UNIT = 3;          // the same density in terrain cells of open ground: what a drawn battlefield holds

// --- Tuning ---
// The unit stat blocks (DROID_BASE_STATS, HOSTILE_TYPES) are content records in database/battle/units.ts; the
// dials below are engine mechanics.
const ATTACK_RANGE = 3;
const UNIT_RADIUS = 1.2;        // hard collision radius, both sides: pairs closer than 2R get pushed apart,
                                // so frontage is physical (only the units that fit can engage; ranks queue)
const WOBBLE = 3;               // units/sec of deterministic lateral drift (organic motion without RNG)
const WITHDRAW_SPEED = 13;      // faster than hostiles, so disengaging works once contact is broken
const ESCAPE_X = 1.5;           // a withdrawing droid past this x has left the field
const EXIT_REACH = 2;           // ...as has one within this many cells of a marked way out (see buildTerrainGrid)
const SUBSTEP_MS = 50;          // integration cap; callers may pass any dt (catch-up replays big ones)
export const FX_TTL_MS = 600;   // hit/death/bomb markers linger this long for the renderer

// A fresh squad's per-droid hp list (persistence helpers: squad state and save migration use it too).
export function fullDroidHp(count: number, maxHp: number = DROID_BASE_STATS.hp): number[] {
    return new Array(count).fill(maxHp);
}

// Field cap. Replication multiplies the fielded squad, and a level is authored as a ratio against it, so
// late fights are written in the thousands a side. The sim, the popup and the eye all top out at a few
// hundred, and the arena's openings, ranges and splash radii are tuned there. Above the cap a fight is
// scaled down at the door instead: one factor for the whole engagement (the bigger side over the cap, so the
// bigger side fields exactly the cap and the field never thins as an army grows past a threshold), and every
// force is dealt into about 1/factor as many field units. A unit stands for a WHOLE number of real combatants
// (its `count`): its hull is theirs summed and its damage theirs multiplied, so a fractional factor deals a
// mix (at 1.2, one unit in five stands for two) and a type too few to fill a unit fields one that stands for
// just what the level wrote (a lone sentry is one sentry at any factor). Every force's total hull and damage
// are therefore exactly the real fight's, kill times are unchanged (a unit of k hits k times harder into k
// times the hull), and both sides shrink together so the authored ratio holds. The sim runs the fight the
// level was tuned at; only the door and the exit know the factor. A droid unit keeps the hull of each droid
// it holds (memberHp: a hit wears them down one at a time), so survivors and their wounds come back out
// exactly; the header counts real combatants (battleHeadcount), and equipment works per member.
// Under the cap the factor is 1, every count is 1, and nothing here applies.
// A battlefield drawn whole (database/battle/drawn_terrains.ts) is its own cap: it is the size it was drawn,
// so a fight too big for the open ground it has is scaled down to fit it the same way (see createBattle).
export const FIELD_CAP = 1000;

// How many field units a force of `real` fields at this factor (never more than `real`, never none), and how
// many real combatants each stands for: as even a deal as whole numbers allow, the bigger units spread through
// the roster instead of bunched at one end.
function dealCounts(real: number, stack: number): number[] {
    if (real <= 0) return [];
    const units = stack <= 1 ? real : Math.max(1, Math.ceil(real / stack - 1e-9));
    return Array.from({ length: units }, (_, i) => Math.floor((i + 1) * real / units) - Math.floor(i * real / units));
}

/** Groups a per-droid hull list into field units of `counts` droids each (consecutive droids, in order): a
 * unit's hull is its members' hull summed, and its max is their full hull. */
function stackDroidHp(droidHp: number[], counts: number[], hpMax: number): { hp: number, maxHp: number, count: number, memberHp: number[] }[] {
    let next = 0;
    return counts.map(count => {
        const memberHp = droidHp.slice(next, next + count);
        next += count;
        return { hp: memberHp.reduce((sum, hp) => sum + hp, 0), maxHp: count * hpMax, count, memberHp };
    });
}

// The hull of each droid a unit holds: its members', or its own when it is one droid
function droidMembers(unit: BattleUnit): number[] {
    return unit.memberHp || [unit.hp];
}

// The real combatants a unit still holds. A droid unit knows its members; a hostile one always opened at full
// hull and loses its members one at a time, so its hull says how many are left (as many whole ones as it
// covers, plus one carrying any remainder).
function livingMembers(unit: BattleUnit, hpEach: number): number {
    if (unit.memberHp) return unit.memberHp.length;
    const count = unit.count || 1;
    return count === 1 ? 1 : Math.min(count, Math.ceil(unit.hp / hpEach - 1e-9));
}

// Lands a hit. On a unit that tells its members apart it wears them down one at a time, front to back, what
// is left of the hit carrying on into the next.
function hurt(unit: BattleUnit, damage: number) {
    unit.hp -= damage;
    if (!unit.memberHp) return;
    const memberHp = unit.memberHp.slice(); // the old battle state still holds the list it was given
    let left = damage;
    while (left > 0 && memberHp.length > 0) {
        if (memberHp[0] > left) { memberHp[0] -= left; left = 0; }
        else left -= memberHp.shift()!;
    }
    unit.memberHp = memberHp;
}

/**
 * Terrain: impassable obstacle cells stamped from ASCII pieces (database/battle/terrain_art.ts; the art is
 * the collision map, non-space char = blocked cell). Cells match the renderer's glyph metrics (a body
 * width wide, a glyph tall), so a piece is a fixed size in BODIES at any arena scale; a choke that
 * admits three droids admits three droids in every fight. battle.terrain stores only the placed piece
 * list ({ art, col, row }); the blocked set and the exit field are derived (and cached per terrain
 * object, so save reloads rebuild them transparently).
 */

// Derived per-battle terrain data: { cols, rows, blocked (Set of row*cols+col), exitDist, exit }. exitDist
// is a BFS distance-to-the-way-out per cell, -1 for blocked cells: it routes withdrawing droids around
// walls, and doubles as the reachability mask (exitDist >= 0 means open AND connected to the field) that
// the spawn fixup checks, so nothing ever starts sealed inside a hollow. The way out is the left edge, the
// side the squad came from. A battlefield drawn closed off from it (the inside of a building) is left the
// way it was entered: by the squad's own start, its `0`, which is then `exit`.
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
    for (const { art, col, row, look } of pieces) {
        const lines = terrainPieceLook(art, look)?.solid;
        if (!lines) continue; // a save from a version with pieces this build lacks: skip, stay playable
        lines.forEach((line, j) => {
            for (let i = 0; i < line.length; i++) {
                const c = col + i, r = row + j;
                if (line[i] !== ' ' && c >= 0 && r >= 0 && c < cols && r < rows) blocked.add(r * cols + c);
            }
        });
    }
    // The distance of every cell a body can walk to from the cells it is given (the ways out)
    const distancesFrom = (exits: number[]) => {
        const exitDist = new Int32Array(cols * rows).fill(-1);
        const queue = exits.filter(idx => !blocked.has(idx));
        queue.forEach(idx => { exitDist[idx] = 0; });
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
        return exitDist;
    };
    const fromLeftEdge = distancesFrom(Array.from({ length: rows }, (_, r) => r * cols));
    const squad = terrainMarkers(pieces, arenaW, arenaH).squad;
    if (!squad) return { cols, rows, blocked, exitDist: fromLeftEdge, exit: null };
    const c = Math.floor(squad.x / TERRAIN_CELL_W), r = Math.floor(squad.y / TERRAIN_CELL_H);
    if (fromLeftEdge[r * cols + c] >= 0) return { cols, rows, blocked, exitDist: fromLeftEdge, exit: null };
    // Closed off from the left edge: the way out is the ground around the squad's start
    const around: number[] = [];
    for (let dr = -EXIT_REACH; dr <= EXIT_REACH; dr++) {
        for (let dc = -EXIT_REACH; dc <= EXIT_REACH; dc++) {
            if (c + dc >= 0 && r + dr >= 0 && c + dc < cols && r + dr < rows) around.push((r + dr) * cols + c + dc);
        }
    }
    return { cols, rows, blocked, exitDist: distancesFrom(around), exit: squad };
}

/** Where the squad withdraws to when it is not the left edge (see buildTerrainGrid); null when it is */
export function battleExit(battle: Battle): XY | null {
    const grid = getTerrainGrid(battle);
    return grid ? grid.exit : null;
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

// Spawn fixup: an opening position that lands on blocked or sealed-off ground relocates to the nearest
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
export function battleBlurb(battle: Battle, opening?: Opening): string {
    const ground = GROUND_BLURBS[battle.terrain ? battle.terrain.id : 'open'] || GROUND_BLURBS.open;
    let hostiles = (opening && OPENING_BLURBS[opening]) || OPENING_BLURBS.marked;
    // A group's centre is where a garrison's source stands (see hostileOpening); name the objective when it's
    // really there. An ambush keeps its own line: the encirclement is the news.
    if (opening !== 'surround' && battle.startingSpawners > 0) {
        hostiles = battle.startingSpawners > 1 ? SOURCE_BLURBS.many : SOURCE_BLURBS.one;
    }
    return `${ground}; ${hostiles}.`;
}

// A unit's part in the opening, from its stats (see SpawnRole in lib/battle/openings.ts)
function spawnRole(stats: UnitStats): SpawnRole {
    if (stats.spawnEveryMs) return 'source';
    return stats.speed === 0 && stats.damage > 0 ? 'post' : 'body';
}

// One combat-ready unit. `base` selects the unit's deterministic hash streams (opening swing delay,
// wobble phase/period, collision tie-break angle) and must be unique across every unit the battle will
// ever hold, including hostiles a spawner adds mid-fight.
// `count` is how many real combatants it stands for (see FIELD_CAP): its full hull is that many units' worth.
function makeUnit(id: string, side: BattleSide, type: UnitType, stats: UnitStats, base: number, x: number, y: number, arenaW: number, arenaH: number, hp?: number, maxHp?: number, count = 1): BattleUnit {
    const unit: BattleUnit = {
        id, side, type,
        x: Math.min(arenaW - 2, Math.max(2, x)),
        y: Math.min(arenaH - 2, Math.max(2, y)),
        hp: hp != null ? hp : stats.hp * count,
        maxHp: maxHp != null ? maxHp : stats.hp * count,
        cooldownMs: Math.floor(hash01(base + 200003) * stats.attackMs), // desynchronized opening swings
        seed: hash01(base) * 2 * Math.PI,                // wobble phase (also the collision tie-break angle)
        wobbleMs: 340 + Math.floor(hash01(base + 100003) * 120) // per-unit wobble period, 340-460ms
    };
    if (stats.spawnEveryMs) unit.spawnMs = stats.spawnEveryMs; // spawner clock: counts down to the next batch
    if (count !== 1) unit.count = count;
    return unit;
}

// roster: [{ type, hp? }] per unit; hp defaults to the type's full pool. `positions` is the opening's, one
// per roster entry (lib/battle/openings.ts); any that land on terrain are relocated to the nearest reachable
// ground (see freePosition).
function spawnUnits(side: BattleSide, roster: { type: UnitType, hp?: number, maxHp?: number, count?: number, memberHp?: number[] }[], statsByType: Record<UnitType, UnitStats>, arenaW: number, arenaH: number, positions: XY[], terrainGrid: TerrainGrid | null): BattleUnit[] {
    const sideSalt = side === 'droid' ? 0 : 1;
    return roster.map((entry, i) => {
        const pos = terrainGrid ? freePosition(terrainGrid, positions[i].x, positions[i].y, i * 2 + sideSalt)
            : positions[i];
        const unit = makeUnit(`${side[0]}${i}`, side, entry.type, statsByType[entry.type],
            i * 2 + sideSalt, // distinct hash streams per unit AND per side
            pos.x, pos.y, arenaW, arenaH, entry.hp, entry.maxHp, entry.count);
        if (entry.memberHp && entry.memberHp.length > 1) unit.memberHp = entry.memberHp;
        return unit;
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
 * `opening` is how the fight opens (poi.opening; see Opening in lib/battle/openings.ts):
 * unset, the terrain decides. `spread` is how close each group stands around its point. A hostile's place in
 * the opening follows from its stats (spawnRole), not from where the composition lists it.
 * `terrainId` picks an obstacle layout (poi.terrain; see TERRAINS), generated deterministically
 * from `terrainSalt`. Callers pass a salt derived from the settlement's map position, so the same settlement always
 * fights on the same ground; unset = open field. A terrain is laid out to fit the fight (the arena grows with
 * the headcount), except a battlefield drawn whole, where the fight is fitted to the drawing.
 */
export function createBattle(droids: number | number[], hostiles: Partial<Record<HostileType, number>>,
                             droidStats: DroidStats = DROID_BASE_STATS, opening: Opening = 'marked',
                             terrainId: TerrainId | null = null, terrainSalt = 0, spread: Spread = 'tight'): Battle {
    const realDroidHp = Array.isArray(droids) ? droids : fullDroidHp(droids, droidStats.hp);
    const realHostiles = typedEntries(hostiles).reduce((n, [, count]) => n + (count || 0), 0);

    // A drawn battlefield comes first: its arena is its canvas, and the open ground the squad can reach on it
    // is what it has room for
    const drawn = drawnArena(terrainId);
    const drawnPieces = drawn && terrainId ? TERRAINS[terrainId](drawn.arenaW, drawn.arenaH, terrainSalt) : null;
    const drawnGrid = drawn && drawnPieces ? buildTerrainGrid(drawnPieces, drawn.arenaW, drawn.arenaH) : null;
    const room = drawnGrid ? Math.max(1, drawnGrid.exitDist.reduce((n, d) => n + (d >= 0 ? 1 : 0), 0) / CELLS_PER_UNIT) : Infinity;

    const stack = Math.max(1, Math.max(realDroidHp.length, realHostiles) / FIELD_CAP, (realDroidHp.length + realHostiles) / room);
    // The stat blocks stay per real combatant at any factor; a unit carries what it stands for (its count)
    const stats: Record<UnitType, UnitStats> = { droid: droidStats, ...HOSTILE_TYPES };
    const droidRoster: { type: UnitType, hp: number, maxHp?: number, count?: number, memberHp?: number[] }[] = stack === 1
        ? realDroidHp.map(hp => ({ type: 'droid', hp }))
        : stackDroidHp(realDroidHp, dealCounts(realDroidHp.length, stack), droidStats.hp)
            .map(unit => ({ type: 'droid', ...unit }));
    // Each type is dealt on its own, so every type the level wrote is on the field at its written strength
    const hostileRoster: { type: HostileType, count: number }[] = [];
    typedEntries(hostiles).forEach(([type, n]) => {
        dealCounts(n || 0, stack).forEach(count => hostileRoster.push({ type, count }));
    });

    const isSpawner = (entry: { type: HostileType }) => !!HOSTILE_TYPES[entry.type].spawnEveryMs;
    const startingSpawners = hostileRoster.reduce((n, e) => n + (isSpawner(e) ? 1 : 0), 0);
    const realSpawners = hostileRoster.reduce((n, e) => n + (isSpawner(e) ? e.count : 0), 0);

    // Constant-density field: area grows with headcount, so linear dimensions scale with its square root.
    // Small fights stay on the baseline arena (never shrink below it).
    const arenaScale = Math.max(1, Math.sqrt((droidRoster.length + hostileRoster.length) / ARENA_BASELINE_UNITS));
    const arenaW = drawn ? drawn.arenaW : Math.round(ARENA_W * arenaScale);
    const arenaH = drawn ? drawn.arenaH : Math.round(ARENA_H * arenaScale);

    const terrainLayout = terrainId && TERRAINS[terrainId];
    const terrainPieces = drawnPieces || (terrainLayout ? terrainLayout(arenaW, arenaH, terrainSalt) : []);
    const terrain = terrainId && terrainPieces.length > 0 ? { id: terrainId, pieces: terrainPieces } : null;
    const terrainGrid = terrain ? drawnGrid || buildTerrainGrid(terrainPieces, arenaW, arenaH) : null;
    if (terrain) TERRAIN_GRID_CACHE.set(terrain, terrainGrid);

    // The opening. Anything that is not an opening by name (a save from before they were named this way) is
    // left to the terrain's markers.
    const named: Opening = ['front', 'groups', 'surround'].includes(opening) ? opening : 'marked';
    const markers = terrainMarkers(terrainPieces, arenaW, arenaH);
    const droidPositions = droidOpening(droidRoster.length, named, markers, arenaW, arenaH);
    const squadAt = droidPositions.length === 0 ? { x: 0, y: arenaH / 2 } : {
        x: droidPositions.reduce((sum, p) => sum + p.x, 0) / droidPositions.length,
        y: droidPositions.reduce((sum, p) => sum + p.y, 0) / droidPositions.length
    };
    const hostilePositions = hostileOpening(hostileRoster.map(entry => spawnRole(HOSTILE_TYPES[entry.type])),
        named, markers, spread, squadAt, arenaW, arenaH, terrainSalt);

    return {
        phase: 'active',
        elapsedMs: 0,
        stats,                          // per-type stat blocks this battle runs on (upgrade snapshot)
        arenaW,                         // field dimensions for this engagement (renderer + clamps)
        arenaH,
        stack,                          // the engagement's scale factor (see FIELD_CAP)
        startingDroids: droidRoster.length, // initial force sizes, in field units
        startingHostiles: hostileRoster.length,
        startingSpawners,
        // High-water mark of the field (spawners excluded), so a spawner-fed garrison reads against its true
        // peak instead of overflowing its starting total
        hostilesPeak: hostileRoster.length - startingSpawners,
        realDroids: realDroidHp.length, // the same in real combatants; the header fractions read against these
        realSpawners,
        realHostilesPeak: realHostiles - realSpawners,
        spawnCounter: 0,                // hostiles spawned mid-fight so far: unique ids/hash streams for late arrivals
        escaped: 0,                     // withdrawing droids that reached the edge (they count as survivors)
        escapedHp: [],                  // ...and the hp each of them left with (persists onto the squad)
        buffs: { overchargeMs: 0 },
        terrain,                        // { id, pieces: [{ art, col, row }] } or null for open ground
        fx: [],                         // { type: 'hit'|'death'|'heal'|'bomb', x, y, t } markers for the renderer
        units: [
            ...spawnUnits('droid', droidRoster, stats, arenaW, arenaH, droidPositions, terrainGrid),
            ...spawnUnits('hostile', hostileRoster, stats, arenaW, arenaH, hostilePositions, terrainGrid)
        ]
    };
}

export function countUnits(battle: Battle, side: BattleSide): number {
    return battle.units.reduce((n, u) => n + (u.side === side ? 1 : 0), 0);
}

// Living spawners afield, in field units
export function countSpawners(battle: Battle): number {
    return battle.units.reduce((n, u) => n + (battle.stats[u.type].spawnEveryMs ? 1 : 0), 0);
}

// The real hostiles afield, spawners apart (they are the header's own fraction)
function realHostilesAfield(battle: Battle, units: BattleUnit[]): { hostiles: number, spawners: number } {
    let hostiles = 0, spawners = 0;
    for (const unit of units) {
        if (unit.side !== 'hostile') continue;
        const members = livingMembers(unit, battle.stats[unit.type].hp);
        if (battle.stats[unit.type].spawnEveryMs) spawners += members; else hostiles += members;
    }
    return { hostiles, spawners };
}

/**
 * The header's numbers, in real combatants: a unit on the field counts for the members it still holds, and
 * droids that escaped count as alive (off the field, not dead). Each `...Of` is what that count reads against.
 */
export function battleHeadcount(battle: Battle) {
    const droids = battle.units.reduce((n, u) => n + (u.side === 'droid' ? droidMembers(u).length : 0), 0) +
        (battle.escapedHp || []).length;
    const { hostiles, spawners } = realHostilesAfield(battle, battle.units);
    return {
        droids, droidsOf: battle.realDroids,
        spawners, spawnersOf: battle.realSpawners,
        hostiles, hostilesOf: Math.max(battle.realHostilesPeak, hostiles)
    };
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
 * multi-source shortest-path search over the terrain grid's cells seeded from every enemy-occupied
 * cell -- because at replicated-army scale (thousands per side on a giant arena) exact long-range
 * searches made opening ticks cost hundreds of ms. The field is still deterministic (seed order is
 * units order; equal-cost expansion is FIFO), just approximate: a marching unit heads for its nearest
 * enemy-occupied CELL, and precise nearest-unit targeting takes over as it closes in.
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
// enemy-occupied cell, via a multi-source Dijkstra with each occupied cell seeded as its own source (its
// lowest-units-array-index occupant, the exact search's tie-break; seeds are found by iterating units in
// array order). Runs on the terrain grid's cell metrics and refuses to expand through blocked cells, so
// every cell also learns its parent: one step along the (wall-respecting) shortest path toward that
// enemy. Units with line of sight to the cell's enemy charge it straight (identical to the old
// open-field behavior); units without it steer to the parent cell instead, which is how armies round
// walls.
//
// Steps are priced by real cell geometry rather than counted: a plain 8-connected BFS calls a diagonal
// step as short as a straight one, so for an enemy dead ahead every zig-zag bulge ties the straight
// line and the north-first neighbor order handed each cell a parent one row up. Both armies then
// marched diagonally north for half the approach and back down for the rest. With a diagonal costing
// more than a straight step the straight line is the unique optimum, so the ties (and the drift) are
// gone. The costs are integers so a bucket queue (Dial's algorithm) keeps the search O(cells) per side
// per substep with FIFO tie-breaking, still cheap next to the per-unit work it replaces.
const FLOW_STEP_X = 5;    // cells are 2 wide by 3.2 tall, so a horizontal, vertical and diagonal step
const FLOW_STEP_Y = 8;    // run 2 : 3.2 : 3.77, which 5 : 8 : 9 approximates
const FLOW_STEP_DIAG = 9;

function buildFlowField(units: BattleUnit[], side: BattleSide, terrainGrid: TerrainGrid | null, arenaW: number, arenaH: number) {
    const cols = terrainGrid ? terrainGrid.cols : Math.ceil(arenaW / TERRAIN_CELL_W);
    const rows = terrainGrid ? terrainGrid.rows : Math.ceil(arenaH / TERRAIN_CELL_H);
    const target = new Array(cols * rows).fill(null);
    const parent = new Int32Array(cols * rows).fill(-1);
    const cost = new Int32Array(cols * rows).fill(-1);  // best travel cost found so far; -1 = unreached
    const buckets: number[][] = [[]];                   // cells to expand, indexed by their cost
    for (const unit of units) {
        if (unit.side !== side) continue;
        // Clamped: withdrawing droids can hold positions just off-field (x down to -2)
        const c = Math.min(cols - 1, Math.max(0, Math.floor(unit.x / TERRAIN_CELL_W)));
        const r = Math.min(rows - 1, Math.max(0, Math.floor(unit.y / TERRAIN_CELL_H)));
        const idx = r * cols + c;
        if (target[idx] === null) { target[idx] = unit; cost[idx] = 0; buckets[0].push(idx); }
    }
    const blocked = terrainGrid ? terrainGrid.blocked : null;
    for (let d = 0; d < buckets.length; d++) {
        const bucket = buckets[d];
        if (!bucket) continue;
        for (let head = 0; head < bucket.length; head++) {
            const idx = bucket[head];
            if (cost[idx] !== d) continue; // stale entry: the cell was reached cheaper after this push
            const c = idx % cols, r = (idx - c) / cols;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (!dc && !dr) continue;
                    const nc = c + dc, nr = r + dr;
                    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
                    const nIdx = nr * cols + nc;
                    const nd = d + (dc && dr ? FLOW_STEP_DIAG : dc ? FLOW_STEP_X : FLOW_STEP_Y);
                    if (cost[nIdx] >= 0 && cost[nIdx] <= nd) continue;
                    if (blocked) {
                        if (blocked.has(nIdx)) continue;
                        // No corner cutting: a diagonal step needs both orthogonal cells open too
                        if (dc && dr && (blocked.has(r * cols + nc) || blocked.has(nr * cols + c))) continue;
                    }
                    cost[nIdx] = nd;
                    target[nIdx] = target[idx];
                    parent[nIdx] = idx;
                    if (!buckets[nd]) buckets[nd] = [];
                    buckets[nd].push(nIdx);
                }
            }
        }
    }
    return { target, parent, cost, cols, rows };
}

// The exact ring search is skipped for a unit whose flow cost to the nearest enemy cell proves the
// rings hold nobody. During an approach every unit is out of ring range, so without this every one
// of them scanned all 49 cells, found nothing and steered by the field anyway; at army scale that
// empty scan was most of the opening ticks (the fight itself is cheaper: hits come in the first ring
// and the search exits on its bound). The threshold is the largest flow cost an enemy inside the
// scan area could have, so the skip never changes a result: the rings reach (NEAR_RINGS + 1) target
// cells in each axis, the field's cost per arena unit is at least the diagonal step's ratio, and the
// unit and its enemy each sit anywhere within their flow cells (one cell diagonal of slack each).
// An unreached cell (cost -1, sealed off) still scans, since the exact search ignores walls.
const FLOW_NEAR_SKIP_COST = Math.ceil(
    ((NEAR_RINGS + 1) * TARGET_CELL * Math.SQRT2 + 2 * Math.hypot(TERRAIN_CELL_W, TERRAIN_CELL_H)) *
    Math.min(FLOW_STEP_X / TERRAIN_CELL_W, FLOW_STEP_Y / TERRAIN_CELL_H, FLOW_STEP_DIAG / Math.hypot(TERRAIN_CELL_W, TERRAIN_CELL_H)));

function flowCostAt(field: FlowField, unit: BattleUnit) {
    const c = Math.min(field.cols - 1, Math.max(0, Math.floor(unit.x / TERRAIN_CELL_W)));
    const r = Math.min(field.rows - 1, Math.max(0, Math.floor(unit.y / TERRAIN_CELL_H)));
    return field.cost[r * field.cols + c];
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
        const flowCost = flowCostAt(flow, unit);
        const near = flowCost > FLOW_NEAR_SKIP_COST ? null : nearestInGrid(nearGrid, unit.x, unit.y, maxDim, NEAR_RINGS);
        if (near && hasLOS(tGrid, unit.x, unit.y, near.x, near.y)) {
            // A ranged unit holds just inside its reach instead of closing to melee (NEAR_RINGS spans more
            // than any declared range, so the exact search always covers it)
            const range = battle.stats[unit.type].range;
            return { tx: near.x, ty: near.y, stop: range && range > ATTACK_RANGE ? range * 0.9 : ATTACK_RANGE };
        }
        return flowSteer(flow, tGrid, unit);
    };
    // Withdrawal descends the exit field (BFS distance to the way out) so routed droids round walls
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
            if (tGrid.exit) return; // at the way out (or cut off from it): nowhere further to run
        }
        unit.x -= WITHDRAW_SPEED * dtSec;
    };
    const atExit = (unit: BattleUnit) => {
        if (!tGrid || !tGrid.exit) return unit.x <= ESCAPE_X;
        const c = Math.floor(unit.x / TERRAIN_CELL_W), r = Math.floor(unit.y / TERRAIN_CELL_H);
        return tGrid.exitDist[r * tGrid.cols + c] === 0;
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
        unit.x = Math.min(arenaW - 1, Math.max(withdrawing && unit.side === 'droid' && !(tGrid && tGrid.exit) ? -2 : 1, unit.x));
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
        const damage = stats.damage * (unit.count || 1); // every member it stands for lands the hit
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
                hurt(victim, damage);
                fx.push({ type: victim.hp <= 0 ? 'death' : 'hit', x: victim.x, y: victim.y, t: elapsedMs });
            }
            if (stats.detonates) {
                unit.hp = 0;
                fx.push({ type: 'death', x: unit.x, y: unit.y, t: elapsedMs });
            }
            continue;
        }
        hurt(target, damage);
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
        if (unit.side === 'droid' && withdrawing && atExit(unit)) { escaped++; escapedHp.push(...droidMembers(unit)); continue; }
        alive.push(unit);
    }

    // Spawners: each living shelter runs its own deterministic clock (same countdown convention as attack
    // cooldowns, so replays land identically) and on firing sends out a batch of fresh hostiles at its rim;
    // they join targeting/collision on the next substep. battle.spawnCounter hands late arrivals ids and
    // hash streams the opening roster can never collide with. A shelter holds fire while spawnCap
    // non-spawner hostiles are already afield, so a stalled assault meets a saturated field, not an
    // ever-denser death spiral. What comes out stands for as many as the shelter does (a unit of k shelters
    // sends out k times the batch, as units of k).
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
                sx, sy, arenaW, arenaH, undefined, undefined, unit.count || 1));
            fx.push({ type: 'spawn', x: sx, y: sy, t: elapsedMs });
            spawnCounter++;
            fieldHostiles++;
        }
    }
    alive.push(...spawned);
    const hostilesPeak = Math.max(battle.hostilesPeak || 0, fieldHostiles); // field high-water mark
    const realAfield = realHostilesAfield(battle, alive);
    const realHostilesPeak = Math.max(battle.realHostilesPeak || 0, realAfield.hostiles); // the header's denominator

    // The event reports real droids and hostiles: the members the field units stand for (see FIELD_CAP)
    const droidsLeft = alive.reduce((n, u) => n + (u.side === 'droid' ? 1 : 0), 0);
    const hostilesLeft = alive.length - droidsLeft;
    if (droidsLeft === 0) {
        const hostilesRemaining = realAfield.hostiles + realAfield.spawners;
        events.push(escaped > 0
            ? { type: 'battleOver', result: 'retreated', survivors: escapedHp.length, hostilesRemaining, droidHp: escapedHp }
            : { type: 'battleOver', result: 'wiped', survivors: 0, hostilesRemaining, droidHp: [] });
    }
    else if (hostilesLeft === 0) {
        const survivorHp = [...alive.filter(u => u.side === 'droid').flatMap(droidMembers), ...escapedHp];
        events.push({ type: 'battleOver', result: 'won', survivors: survivorHp.length,
            hostilesRemaining: 0, droidHp: survivorHp });
    }

    return { ...battle, elapsedMs, escaped, escapedHp, spawnCounter, hostilesPeak, realHostilesPeak, buffs: { overchargeMs }, fx, units: alive };
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
                const hp = u.hp - effect.damage * (u.count || 1); // per member it stands for (see FIELD_CAP)
                fx.push({ type: hp <= 0 ? 'death' : 'hit', x: u.x, y: u.y, t: battle.elapsedMs });
                if (hp > 0) units.push({ ...u, hp });
            }
            else units.push(u);
        }
        return { ...battle, units, fx };
    }

    if (effect.kind === 'heal') {
        const fx = battle.fx.slice();
        // A unit heals only the droids it still holds, each by the kit's amount and no further than full (the
        // rig does not rebuild the destroyed)
        const perDroidHp = battle.stats.droid.hp;
        const units = battle.units.map(u => {
            if (u.side !== 'droid' || u.hp >= u.maxHp) return u;
            const healed = droidMembers(u).map(hp => Math.min(perDroidHp, hp + effect.amount));
            const hp = healed.reduce((sum, memberHp) => sum + memberHp, 0);
            if (hp <= u.hp) return u;
            fx.push({ type: 'heal', x: u.x, y: u.y, t: battle.elapsedMs });
            return u.memberHp ? { ...u, hp, memberHp: healed } : { ...u, hp };
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
