import {CONSUMABLE_DEFS} from "../database/consumables";

/**
 * Real-time per-unit battle sim: the skirmish that plays out in the encounter popup when the squad attacks
 * a nest. Pure module in the squad.js mold: redux owns the battle object (inside squad.fighting) and calls
 * advanceBattle from the planet tick; the popup's canvas just draws unit positions.
 *
 * Model: every droid and bug is an agent with position, hp, and an attack cooldown. Units seek the nearest
 * enemy and trade fixed damage in melee range; the outcome emerges from counts, per-unit stats, and whatever
 * consumables the player pops mid-fight. Deliberately no RNG anywhere: motion "wobble" is a deterministic
 * per-unit sine drift, so a replayed tick stream (save reload, background-tab catch-up) reproduces the same
 * fight. Positions live in a fixed float arena space; pixel scaling is the renderer's problem, which is what
 * lets the popup grow as armies scale (endgame target is 200v200+; the sim is O(n^2) per step for target
 * acquisition, fine to ~500 units).
 */

// Arena coordinate space. Droids enter from the left, bugs from the right.
export const ARENA_W = 100;
export const ARENA_H = 60;

// --- Tuning ---
// Kill-time asymmetry is the balance dial: a droid is worth roughly two bugs, so matched counts win with
// light losses and ~1.5x bug numbers is the break-even. Bugs are faster (they swarm), droids hit harder.
export const UNIT_STATS = {
    droid: { hp: 9, damage: 1, attackMs: 1500, speed: 9 },
    bug:   { hp: 6, damage: 1, attackMs: 1300, speed: 11 }
};
const ATTACK_RANGE = 3;
const SEPARATION_RADIUS = 2.4;  // same-side personal space; keeps a swarm from collapsing to a point
const SEPARATION_PUSH = 6;      // units/sec shove when crowding
const WOBBLE = 3;               // units/sec of deterministic lateral drift (organic motion without RNG)
const WITHDRAW_SPEED = 13;      // faster than bugs, so disengaging works once contact is broken
const ESCAPE_X = 1.5;           // a withdrawing droid past this x has left the field
const SUBSTEP_MS = 50;          // integration cap; callers may pass any dt (catch-up replays big ones)
export const FX_TTL_MS = 600;   // hit/death/bomb markers linger this long for the renderer

export const BATTLE_PHASES = { active: 'active', withdrawing: 'withdrawing' };

// A fresh squad's per-droid hp list (persistence helpers: squad state and save migration use it too).
export function fullDroidHp(count) {
    return new Array(count).fill(UNIT_STATS.droid.hp);
}

function spawnSide(side, count, hpList = null) {
    // Column formation, filled top to bottom, growing away from the center line. Column height scales with
    // army size so big armies form a deep front instead of a 60-unit-tall line.
    const perCol = Math.max(12, Math.ceil(count / 8));
    const spacing = Math.min(4, (ARENA_H - 8) / perCol);
    const stats = UNIT_STATS[side];
    const units = [];
    for (let i = 0; i < count; i++) {
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        const colHeight = Math.min(count - col * perCol, perCol);
        const x = side === 'droid' ? 28 - col * 2.5 : ARENA_W - 28 + col * 2.5;
        units.push({
            id: `${side[0]}${i}`,
            side,
            x: Math.min(ARENA_W - 2, Math.max(2, x)),
            y: ARENA_H / 2 + (row - (colHeight - 1) / 2) * spacing,
            hp: hpList ? hpList[i] : stats.hp,
            maxHp: stats.hp,
            cooldownMs: (i * 137) % stats.attackMs, // deterministic stagger so opening volleys aren't synchronized
            seed: i * 2.399                          // phase offset for the wobble drift
        });
    }
    return units;
}

/**
 * `droids` is a per-droid hp list (wounds persist between fights in the field, so the droid that got
 * mauled last time really is the fragile one now); a plain count means a fresh squad at full health.
 * Bugs always spawn at full strength: nests reset completely between engagements (each side heals at
 * home), so every assault faces the full garrison and must be decisive.
 */
export function createBattle(droids, bugCount) {
    const droidHp = Array.isArray(droids) ? droids : fullDroidHp(droids);
    return {
        phase: BATTLE_PHASES.active,
        elapsedMs: 0,
        startingDroids: droidHp.length, // initial force sizes; the header bars drain against these
        startingBugs: bugCount,
        escaped: 0,                    // withdrawing droids that reached the edge (they count as survivors)
        escapedHp: [],                 // ...and the hp each of them left with (persists onto the squad)
        buffs: { overchargeMs: 0 },
        fx: [],                        // { type: 'hit'|'death'|'heal'|'bomb', x, y, t } markers for the renderer
        units: [...spawnSide('droid', droidHp.length, droidHp), ...spawnSide('bug', bugCount)]
    };
}

export function countUnits(battle, side) {
    return battle.units.reduce((n, u) => n + (u.side === side ? 1 : 0), 0);
}

function nearestEnemy(unit, units) {
    let best = null, bestD2 = Infinity;
    for (const other of units) {
        if (other.side === unit.side || other.hp <= 0) continue;
        const dx = other.x - unit.x, dy = other.y - unit.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = other; }
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
    const fx = battle.fx.filter(f => elapsedMs - f.t < FX_TTL_MS);
    const units = battle.units.map(u => ({ ...u }));

    // Movement: withdrawing droids run for the left edge; everyone else seeks their nearest enemy and
    // holds position once in melee range. Wobble is applied perpendicular to the seek direction.
    for (const unit of units) {
        if (unit.side === 'droid' && withdrawing) {
            unit.x -= WITHDRAW_SPEED * dtSec;
            continue;
        }
        const target = nearestEnemy(unit, units);
        if (!target) continue;
        const dx = target.x - unit.x, dy = target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > ATTACK_RANGE) {
            const speed = UNIT_STATS[unit.side].speed * dtSec;
            const wobble = Math.sin(elapsedMs / 400 + unit.seed) * WOBBLE * dtSec;
            unit.x += (dx / dist) * speed + (-dy / dist) * wobble;
            unit.y += (dy / dist) * speed + (dx / dist) * wobble;
        }
    }

    // Separation: shove apart from the nearest same-side neighbor when crowding, then clamp to the arena.
    for (const unit of units) {
        let nx = 0, ny = 0, nd2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
        for (const other of units) {
            if (other === unit || other.side !== unit.side) continue;
            const dx = unit.x - other.x, dy = unit.y - other.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < nd2) { nd2 = d2; nx = dx; ny = dy; }
        }
        if (nx !== 0 || ny !== 0) {
            const d = Math.sqrt(nd2) || 0.1;
            unit.x += (nx / d) * SEPARATION_PUSH * dtSec;
            unit.y += (ny / d) * SEPARATION_PUSH * dtSec;
        }
        unit.x = Math.min(ARENA_W - 1, Math.max(withdrawing && unit.side === 'droid' ? -2 : 1, unit.x));
        unit.y = Math.min(ARENA_H - 1, Math.max(1, unit.y));
    }

    // Attacks. Damage lands immediately on the shared clones, so simultaneous kills within a substep are
    // possible (both sides can hit 0). Withdrawing droids don't fight back; that IS the retreat cost.
    const overchargeActive = overchargeMs > 0;
    const rateMultiplier = CONSUMABLE_DEFS.overchargeCell.effect.rateMultiplier;
    for (const unit of units) {
        unit.cooldownMs = Math.max(0, unit.cooldownMs - dtMs);
        if (unit.hp <= 0 || unit.cooldownMs > 0) continue;
        if (unit.side === 'droid' && withdrawing) continue;
        const target = nearestEnemy(unit, units);
        if (!target) continue;
        const dx = target.x - unit.x, dy = target.y - unit.y;
        if (dx * dx + dy * dy > ATTACK_RANGE * ATTACK_RANGE) continue;
        const stats = UNIT_STATS[unit.side];
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
 * Applies a consumable's effect (CONSUMABLE_DEFS[itemId].effect) to the battle. Pure; pouch accounting is
 * the caller's job. All effects are instant and untargeted for now (aiming is a later positional upgrade):
 * the demo charge self-targets the densest bug clump and never harms droids.
 */
export function applyConsumable(battle, itemId) {
    const def = CONSUMABLE_DEFS[itemId];
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
