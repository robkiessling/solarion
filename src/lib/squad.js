import {getAdjacentCoords, NUM_PLANET_ROWS, PLANET_COLS} from "./planet_geometry";
import {getCrossTime, isOnGrid, STATUSES} from "./planet_map";
import {mod} from "./helpers";
import {POI_STATUS} from "./expeditions";
import {advanceBattle, DROID_BASE_STATS, fullDroidHp} from "./battle";
import {EQUIPMENT_DEFS} from "../database/equipment";

/**
 * The player-driven squad that IS act-2 exploration. Owns the
 * pure movement/charge/reveal simulation plus routing, and ticks the live battle sim while fighting; input
 * handling lives in the planet component and redux thunks. The battle itself (per-unit combat) is lib/battle.js.
 *
 * Contact model (roguelike bump-to-attack): uncleared nests and capability-gated POIs are impassable to the
 * squad. A deliberate keyboard tap into a nest starts the fight; held-key continuation and click-routes stop
 * at contact like a wall. Caches/story sites are walkable and resolve on entry.
 */

export const SQUAD_GLYPH = '◈';

// Movement pace. crossTime is seconds-per-tile for scouts; the squad multiplies it down so driving feels
// snappy (flatland 0.5s * 0.4 = 200ms/tile, ~5 tiles/sec).
export const SQUAD_SPEED_FACTOR = 0.4;

// Charge model: drains per tile entered while off the powered grid, snaps to full on the grid. At zero the
// squad limps ("reserve power"): crossings take twice as long. A planning aid, never a fail state.
// Drain scales with the assigned droids (not the replicated units, so growing the multiplier never shrinks
// range): a bigger team is a shorter-legged team, which is what makes force sizing a real decision.
export const SQUAD_MAX_CHARGE = 100;
export const SQUAD_DRAIN_PER_DROID = 0.4; // per assigned droid per tile; the default 5-droid team drains 2
export const RESERVE_SPEED_PENALTY = 2;

// isOnGrid lives in planet_map (the halo shares it); re-exported so squad consumers keep one import site.
export {isOnGrid} from "./planet_map";

export function squadDrainPerTile(squad) {
    return SQUAD_DRAIN_PER_DROID * (squad.assignedDroids || 5);
}

/**
 * Replication multiplies the fielded force: `assignedDroids` leave the pool, but the squad's roster is
 * assignedDroids x multiplier effective UNITS (snapshotted at deploy; replicating while deployed doesn't
 * grow a fielded squad). Everything downstream -- battles, wounds (droidHp), losses, the sidebar --
 * deals in units 1:1; whole droids only reappear at disband settlement (droidsRecovered).
 */
export function createSquad(homeCoord, assignedDroids = 1, multiplier = 1, equipment = {}, droidStats = DROID_BASE_STATS) {
    const numUnits = assignedDroids * multiplier;
    return {
        coord: homeCoord,
        path: [],
        moveProgress: 0,
        charge: SQUAD_MAX_CHARGE,
        assignedDroids,          // droids consumed from the pool at deploy; the resource-side contract
        multiplier,              // replication multiplier snapshotted at deploy
        squadSize: numUnits,     // current roster in effective units (shrinks as units die)
        cargo: {},               // loot collected at POIs; banks whenever the squad touches the grid, dies on a wipe
        equipment,               // carried gear charges { itemId: chargesLeft }; spend in battle, reload on the grid
        droidStats,              // effective unit stats (base + upgrades), snapshotted at deploy: refit at base
        droidHp: fullDroidHp(numUnits, droidStats.hp), // per-unit hull; wounds persist in the field, repaired on the grid
        fighting: null           // null | { poiId, battle } -- live per-unit sim (see lib/battle.js)
    };
}

// Disband settlement: surviving units round back to whole droids, to the nearest (losing less than half a
// multiplier's worth of units costs nothing: partial stacks re-replicate at home, the same fiction as
// heals-at-home; unexploitable because nests reset fully between engagements).
export function droidsRecovered(squad) {
    return Math.min(squad.assignedDroids || squad.squadSize,
        Math.round(squad.squadSize / (squad.multiplier || 1)));
}

// The available (discovered, unresolved) POI standing on `coord`, or null.
export function poiAtCoord(pois, coord) {
    return Object.values(pois || {}).find(poi =>
        poi.status === POI_STATUS.available && poi.coord[0] === coord[0] && poi.coord[1] === coord[1]
    ) || null;
}

export function squadCrossMs(map, coord, unlocks, charge) {
    const base = getCrossTime(map[coord[0]][coord[1]].terrain, unlocks) * 1000 * SQUAD_SPEED_FACTOR;
    return charge <= 0 ? base * RESERVE_SPEED_PENALTY : base;
}

/**
 * Advances the squad one tick: battle sim when fighting (movement is locked), otherwise movement along
 * its path. Per tile entered: line-of-sight reveal (the tile + its neighbors, same rule as scouts), charge
 * drain off-grid / snap-to-full on-grid, and contact events. Pure; returns the next squad, the coords newly
 * revealed this tick (still-unknown tiles only), and events for the caller to resolve:
 *   { type: 'battleOver', poiId, result, survivors, bugsRemaining, battle }  (live fight ended; `battle`
 *       is the final field state, kept so the result popup can hold the last frame; see lib/battle.js)
 *   { type: 'enteredPoi', poiId }          (stepped onto an available cache/story tile: resolve it)
 *   { type: 'onGrid' }                     (stepped onto powered ground: deliver any cargo)
 */
export function advanceSquad(map, pois, squad, moveAmountMs, unlocks) {
    const events = [];

    if (squad.fighting) {
        const { battle, events: battleEvents } = advanceBattle(squad.fighting.battle, moveAmountMs);
        const over = battleEvents.find(event => event.type === 'battleOver');
        if (!over) {
            return { squad: {...squad, fighting: {...squad.fighting, battle}}, reveals: [], events };
        }
        events.push({ ...over, poiId: squad.fighting.poiId, battle });
        return { squad: {...squad, fighting: null}, reveals: [], events };
    }

    let {coord, path, moveProgress, charge, droidHp, equipment} = squad;
    path = path ? path.slice() : [];
    moveProgress = (moveProgress || 0) + moveAmountMs;

    const reveals = new Set();
    const reveal = ([r, c]) => {
        if (map[r][c].status === STATUSES.unknown.enum) reveals.add(`${r},${c}`);
    };

    while (path.length > 0) {
        const next = path[0];
        const tileCrossMs = squadCrossMs(map, next, unlocks, charge);
        if (moveProgress < tileCrossMs) break;
        moveProgress -= tileCrossMs;
        coord = next;
        path = path.slice(1);

        reveal(coord);
        getAdjacentCoords(coord).forEach(reveal);

        if (isOnGrid(map, coord)) {
            charge = SQUAD_MAX_CHARGE;
            // Powered ground repairs battle wounds and reloads equipment charges the same way it refills
            // charge (everyone heals at home, gear reloads at home)
            const maxHp = (squad.droidStats || DROID_BASE_STATS).hp;
            if (droidHp && droidHp.some(hp => hp < maxHp)) {
                droidHp = fullDroidHp(droidHp.length, maxHp);
            }
            if (equipment && Object.entries(equipment).some(([id, n]) => n < EQUIPMENT_DEFS[id].charges)) {
                equipment = Object.fromEntries(
                    Object.keys(equipment).map(id => [id, EQUIPMENT_DEFS[id].charges]));
            }
            events.push({ type: 'onGrid' });
        }
        else {
            charge = Math.max(0, charge - squadDrainPerTile(squad));
        }

        const poi = poiAtCoord(pois, coord);
        if (poi) {
            // Contact interrupts: stop here and let the caller raise the interaction prompt (any remaining
            // route is abandoned -- the world just got more interesting than the destination)
            events.push({ type: 'enteredPoi', poiId: poi.id });
            path = [];
            break;
        }
    }

    if (path.length === 0) moveProgress = 0;

    return {
        squad: {...squad, coord, path, moveProgress, charge, droidHp, equipment},
        reveals: [...reveals].map(key => key.split(',').map(Number)),
        events
    };
}

/**
 * Keyboard step target: pure coordinate arithmetic on the uniform grid. Up/down move one row (null at the
 * poles -- the world doesn't wrap north-south), left/right move one column with east-west wrap. dirVec is a
 * screen-space unit vector (up = [0,-1]); on the uniform grid screen space IS coordinate space, at any camera
 * rotation, which is what makes movement reversible and camera-independent. Ignores passability -- the caller
 * decides whether a blocked target means "reveal the wall" or "bump".
 */
export function stepInDirection(coord, dirVec) {
    const [dx, dy] = dirVec;

    if (dy !== 0) {
        const row = coord[0] + dy;
        if (row < 0 || row >= NUM_PLANET_ROWS) return null;
        return [row, coord[1]];
    }

    return [coord[0], mod(coord[1] + dx, PLANET_COLS)];
}
