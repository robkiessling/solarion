import {EQUIPMENT_DEFS} from "../database/equipment";

/**
 * Real-time per-unit battle sim: the skirmish that plays out in the encounter popup when the squad attacks
 * a nest. Pure module in the squad.js mold: redux owns the battle object (inside squad.fighting) and calls
 * advanceBattle from the planet tick; the popup's canvas just draws unit positions.
 *
 * Model: every droid and bug is an agent with position, hp, and an attack cooldown. Units seek the nearest
 * enemy and trade fixed damage in melee range; bodies collide (both sides), so frontage is physical and
 * rear ranks queue. Spawn arrangements are data-driven (FORMATIONS: nests declare poi.formation, droids
 * deploy in squadron blocks). The outcome emerges from counts, per-unit stats, the opening geometry, and
 * whatever equipment the player fires mid-fight. Deliberately no RNG anywhere: motion "wobble" is a deterministic
 * per-unit sine drift, so a replayed tick stream (save reload, background-tab catch-up) reproduces the same
 * fight. Positions live in a float arena space sized per battle (constant unit density, so big armies get a
 * bigger field, not a mosh pit); pixel scaling is the renderer's problem, which is what lets the popup grow
 * as armies scale. Neighbor queries go through a spatial hash grid, so endgame armies (hundreds per side)
 * and their catch-up replays stay cheap.
 */

// Baseline arena coordinate space. Droids enter from the left, bugs from the right. Battles above
// ARENA_BASELINE_UNITS total combatants scale both dimensions up (see createBattle); battle.arenaW/arenaH
// are the authoritative dimensions, these constants are the floor (and the fallback for pre-scaling saves).
export const ARENA_W = 100;
export const ARENA_H = 60;
const ARENA_BASELINE_UNITS = 80;   // a 40v40 fills the baseline arena at design density
const FRONT_GAP = 44;              // spawn distance between the two front lines, at any arena size

// --- Tuning ---
// Kill-time asymmetry is the balance dial: a stock droid is worth roughly two standard bugs, so matched
// counts win with light losses and ~1.5x bug numbers is the break-even. Bugs are faster (they swarm),
// droids hit harder.
//
// Droids have BASE stats: combat upgrades modify a copy (getDroidStats in redux/reducer.js) that is
// snapshotted onto the squad at deploy (refits apply to the next deployment, not squads in the field).
// Bug TYPES are static definitions, never upgraded; nests differ only in how many of each type they
// field (their composition). New types (tougher variants, bosses) are new rows here; anything with hp
// above the standard bug automatically earns an hp bar in the arena (battle_canvas.jsx).
export const DROID_BASE_STATS = { hp: 9, damage: 1, attackMs: 1500, speed: 9 };
export const BUG_TYPES = {
    bug: { hp: 6, damage: 1, attackMs: 1300, speed: 11 }
};
const ATTACK_RANGE = 3;
const UNIT_RADIUS = 1.2;        // hard collision radius, both sides: pairs closer than 2R get pushed apart,
                                // so frontage is physical (only the units that fit can engage; ranks queue)
const WOBBLE = 3;               // units/sec of deterministic lateral drift (organic motion without RNG)
const WITHDRAW_SPEED = 13;      // faster than bugs, so disengaging works once contact is broken
const ESCAPE_X = 1.5;           // a withdrawing droid past this x has left the field
const SUBSTEP_MS = 50;          // integration cap; callers may pass any dt (catch-up replays big ones)
export const FX_TTL_MS = 600;   // hit/death/bomb markers linger this long for the renderer

export const BATTLE_PHASES = { active: 'active', withdrawing: 'withdrawing' };

// A fresh squad's per-droid hp list (persistence helpers: squad state and save migration use it too).
export function fullDroidHp(count, maxHp = DROID_BASE_STATS.hp) {
    return new Array(count).fill(maxHp);
}

// Deterministic 32-bit hash -> [0, 1). Decorrelates per-unit phases (wobble, swing timers, collision
// tie-breaks) without RNG: linear-in-index seeds made whole formations snake and swing in sync, because
// neighbors in a lattice have neighboring indices.
function hash01(n) {
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

function frontX(side, arenaW) {
    return side === 'droid' ? arenaW / 2 - FRONT_GAP / 2 : arenaW / 2 + FRONT_GAP / 2;
}

// Deep front of columns growing away from the center line.
function columnLayout(count, arenaW, arenaH, side) {
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
function squadronLayout(count, arenaW, arenaH, side) {
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
function ringPositions(count, cx, cy, startIndex = 0) {
    const positions = [];
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

function ringLayout(count, arenaW, arenaH, side) {
    const radius = SPAWN_SPACING * (Math.sqrt(count / Math.PI) + 1);
    const dir = side === 'droid' ? -1 : 1;
    // Near edge sits where the side's front line would be; clamped back inside the arena
    let cx = frontX(side, arenaW) + dir * radius;
    cx = dir > 0 ? Math.min(cx, arenaW - radius - 2) : Math.max(cx, radius + 2);
    return ringPositions(count, cx, Math.max(radius + 2, Math.min(arenaH - radius - 2, arenaH / 2)));
}

// A few separated groups: fixed dice-face style center patterns over the side's half (fractions of the
// half's box), each group a dense mini-ring. Group count scales with headcount.
const CLUSTER_PATTERNS = {
    2: [[0.3, 0.3], [0.7, 0.7]],
    3: [[0.3, 0.2], [0.65, 0.55], [0.25, 0.85]],
    4: [[0.3, 0.25], [0.75, 0.3], [0.25, 0.75], [0.7, 0.8]],
    5: [[0.3, 0.2], [0.75, 0.3], [0.5, 0.5], [0.25, 0.8], [0.7, 0.85]],
    6: [[0.25, 0.2], [0.7, 0.25], [0.3, 0.5], [0.75, 0.55], [0.25, 0.85], [0.7, 0.85]]
};

function clustersLayout(count, arenaW, arenaH, side) {
    const k = Math.max(2, Math.min(6, Math.round(count / 40)));
    const centers = CLUSTER_PATTERNS[Math.min(k, count)] || CLUSTER_PATTERNS[2];
    const margin = SPAWN_SPACING * (Math.sqrt(count / centers.length / Math.PI) + 2);
    const halfLeft = side === 'droid' ? margin : arenaW / 2 + margin / 2;
    const halfW = arenaW / 2 - margin * 1.5;
    const positions = [];
    centers.forEach(([fx, fy], c) => {
        const groupSize = Math.floor(count / centers.length) + (c < count % centers.length ? 1 : 0);
        positions.push(...ringPositions(groupSize,
            halfLeft + fx * halfW,
            margin + fy * (arenaH - 2 * margin),
            c * 1000));
    });
    return positions;
}

// Disturbed swarm: low-discrepancy spread over the side's half. R2 keeps points evenly spaced (no RNG,
// no clumps); collision tidies any near-contact pairs on the first substeps.
function scatterLayout(count, arenaW, arenaH, side) {
    const left = side === 'droid' ? 4 : arenaW / 2 + 4;
    const width = arenaW / 2 - 8;
    return Array.from({ length: count }, (_, i) => ({
        x: left + ((0.5 + (i + 1) * R2_A1) % 1) * width,
        y: 4 + ((0.5 + (i + 1) * R2_A2) % 1) * (arenaH - 8)
    }));
}

export const FORMATIONS = {
    column: columnLayout,
    squadron: squadronLayout,
    ring: ringLayout,
    clusters: clustersLayout,
    scatter: scatterLayout
};

// roster: [{ type, hp? }] per unit; hp defaults to the type's full pool.
function spawnUnits(side, roster, statsByType, arenaW, arenaH, formation) {
    const layout = FORMATIONS[formation] || columnLayout;
    const positions = layout(roster.length, arenaW, arenaH, side);
    const sideSalt = side === 'droid' ? 0 : 1;
    return roster.map((entry, i) => {
        const stats = statsByType[entry.type];
        const base = i * 2 + sideSalt; // distinct hash streams per unit AND per side
        return {
            id: `${side[0]}${i}`,
            side,
            type: entry.type,
            x: Math.min(arenaW - 2, Math.max(2, positions[i].x)),
            y: Math.min(arenaH - 2, Math.max(2, positions[i].y)),
            hp: entry.hp != null ? entry.hp : stats.hp,
            maxHp: stats.hp,
            cooldownMs: Math.floor(hash01(base + 200003) * stats.attackMs), // desynchronized opening swings
            seed: hash01(base) * 2 * Math.PI,                // wobble phase (also the collision tie-break angle)
            wobbleMs: 340 + Math.floor(hash01(base + 100003) * 120) // per-unit wobble period, 340-460ms
        };
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
 * front. Droids always deploy in squadron blocks.
 */
export function createBattle(droids, bugs, droidStats = DROID_BASE_STATS, bugFormation = 'column') {
    const droidHp = Array.isArray(droids) ? droids : fullDroidHp(droids, droidStats.hp);
    const composition = typeof bugs === 'number' ? { bug: bugs } : bugs;

    const stats = { droid: droidStats };
    const bugRoster = [];
    Object.entries(composition).forEach(([type, n]) => {
        stats[type] = BUG_TYPES[type];
        for (let i = 0; i < n; i++) bugRoster.push({ type });
    });

    // Constant-density field: area grows with headcount, so linear dimensions scale with its square root.
    // Small fights stay on the baseline arena (never shrink below it).
    const arenaScale = Math.max(1, Math.sqrt((droidHp.length + bugRoster.length) / ARENA_BASELINE_UNITS));
    const arenaW = Math.round(ARENA_W * arenaScale);
    const arenaH = Math.round(ARENA_H * arenaScale);

    return {
        phase: BATTLE_PHASES.active,
        elapsedMs: 0,
        stats,                          // per-type stat blocks this battle runs on (upgrade snapshot)
        arenaW,                         // field dimensions for this engagement (renderer + clamps)
        arenaH,
        startingDroids: droidHp.length, // initial force sizes; the header pips count against these
        startingBugs: bugRoster.length,
        escaped: 0,                     // withdrawing droids that reached the edge (they count as survivors)
        escapedHp: [],                  // ...and the hp each of them left with (persists onto the squad)
        buffs: { overchargeMs: 0 },
        fx: [],                         // { type: 'hit'|'death'|'heal'|'bomb', x, y, t } markers for the renderer
        units: [
            ...spawnUnits('droid', droidHp.map(hp => ({ type: 'droid', hp })), stats, arenaW, arenaH, 'squadron'),
            ...spawnUnits('bug', bugRoster, stats, arenaW, arenaH, bugFormation)
        ]
    };
}

export function countUnits(battle, side) {
    return battle.units.reduce((n, u) => n + (u.side === side ? 1 : 0), 0);
}

/**
 * Spatial hash grid. At endgame scale (hundreds of units per side) the all-pairs O(n^2) scans for
 * targeting and separation dominate the tick, and catch-up replays multiply them by hundreds of substeps.
 * The grid buckets units by cell and queries expand outward ring by ring. Results are bit-identical to a
 * brute-force scan of the units array: the comparator is (squared distance, then array index), which is
 * exactly the winner the sequential first-strictly-closer scan produced, so determinism is untouched.
 */
const TARGET_CELL = 12;                   // targeting cell size (arena units); coarse, rings expand as needed
const KEY_OFFSET = 8, KEY_STRIDE = 4096;  // packs (possibly slightly negative) cell coords into one int key

function cellKey(cx, cy) { return (cx + KEY_OFFSET) * KEY_STRIDE + (cy + KEY_OFFSET); }

// One side's units (or all units, side = null) bucketed by cell; entries carry their units-array index
// for tie-breaking.
function buildGrid(units, side, cell) {
    const cells = new Map();
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
// maxDim bounds the expansion so a query against a nearly-empty grid still terminates.
function nearestInGrid(grid, x, y, maxDim) {
    if (grid.count === 0) return null;
    const cell = grid.cell;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const maxRing = Math.ceil(maxDim / cell) + 2;
    let best = null, bestD2 = Infinity, bestI = Infinity;
    const scanCell = (dx, dy) => {
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
export function advanceBattle(battle, dtMs) {
    const events = [];
    let current = battle;
    let remaining = dtMs;
    while (remaining > 0 && events.length === 0) {
        const step = Math.min(remaining, SUBSTEP_MS);
        remaining -= step;
        current = advanceStep(current, step, events);
    }
    return { battle: current, events };
}

function advanceStep(battle, dtMs, events) {
    const dtSec = dtMs / 1000;
    const elapsedMs = battle.elapsedMs + dtMs;
    const overchargeMs = Math.max(0, battle.buffs.overchargeMs - dtMs);
    const withdrawing = battle.phase === BATTLE_PHASES.withdrawing;
    const arenaW = battle.arenaW || ARENA_W;
    const arenaH = battle.arenaH || ARENA_H;
    const maxDim = Math.max(arenaW, arenaH);
    const fx = battle.fx.filter(f => elapsedMs - f.t < FX_TTL_MS);
    const units = battle.units.map(u => ({ ...u }));

    // Movement: withdrawing droids run for the left edge; everyone else seeks their nearest enemy and
    // holds position once in melee range. Wobble is applied perpendicular to the seek direction.
    // Two passes, matching the units array's droids-then-bugs order: droids target the bugs' pre-move
    // positions, then bugs target the droids' post-move positions.
    const seek = (unit, target) => {
        if (!target) return;
        const dx = target.x - unit.x, dy = target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > ATTACK_RANGE) {
            const speed = battle.stats[unit.type].speed * dtSec;
            const wobble = Math.sin(elapsedMs / (unit.wobbleMs || 400) + unit.seed) * WOBBLE * dtSec;
            unit.x += (dx / dist) * speed + (-dy / dist) * wobble;
            unit.y += (dy / dist) * speed + (dx / dist) * wobble;
        }
    };
    const bugGrid = buildGrid(units, 'bug', TARGET_CELL);
    for (const unit of units) {
        if (unit.side !== 'droid') continue;
        if (withdrawing) {
            unit.x -= WITHDRAW_SPEED * dtSec;
            continue;
        }
        seek(unit, nearestInGrid(bugGrid, unit.x, unit.y, maxDim));
    }
    const droidGrid = buildGrid(units, 'droid', TARGET_CELL);
    for (const unit of units) {
        if (unit.side === 'bug') seek(unit, nearestInGrid(droidGrid, unit.x, unit.y, maxDim));
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
        unit.x = Math.min(arenaW - 1, Math.max(withdrawing && unit.side === 'droid' ? -2 : 1, unit.x));
        unit.y = Math.min(arenaH - 1, Math.max(1, unit.y));
        const newKey = cellKey(Math.floor(unit.x / contact), Math.floor(unit.y / contact));
        if (newKey !== oldKey) {
            const oldBucket = collGrid.cells.get(oldKey);
            oldBucket.splice(oldBucket.findIndex(entry => entry.i === i), 1);
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
        const target = nearestInGrid(targetGrids[unit.side], unit.x, unit.y, maxDim);
        if (!target) continue;
        const dx = target.x - unit.x, dy = target.y - unit.y;
        if (dx * dx + dy * dy > ATTACK_RANGE * ATTACK_RANGE) continue;
        const stats = battle.stats[unit.type];
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
    const alive = [];
    for (const unit of units) {
        if (unit.hp <= 0) continue;
        if (unit.side === 'droid' && withdrawing && unit.x <= ESCAPE_X) { escaped++; escapedHp.push(unit.hp); continue; }
        alive.push(unit);
    }

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

    return { ...battle, elapsedMs, escaped, escapedHp, buffs: { overchargeMs }, fx, units: alive };
}

/**
 * Applies an equipment piece's effect (EQUIPMENT_DEFS[itemId].effect) to the battle. Pure; charge
 * accounting is the caller's job. All effects are instant and untargeted for now (aiming is a later
 * positional upgrade): the demo charge self-targets the densest bug clump and never harms droids.
 */
export function applyEquipment(battle, itemId) {
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
        const fx = [...battle.fx, { type: 'bomb', x: center.x, y: center.y, t: battle.elapsedMs }];
        const units = [];
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
export function startWithdrawal(battle) {
    return battle.phase === BATTLE_PHASES.withdrawing ? battle : { ...battle, phase: BATTLE_PHASES.withdrawing };
}
