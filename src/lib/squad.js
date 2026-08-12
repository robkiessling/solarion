import {getAdjacentCoords, NUM_PLANET_ROWS, PLANET_COLS} from "./planet_geometry";
import {getCrossTime, isOnGrid, STATUSES} from "./planet_map";
import {mod} from "./helpers";
import {POI_STATUS} from "./expeditions";
import {advanceBattle, fullDroidHp, UNIT_STATS} from "./battle";

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
export const SQUAD_MAX_CHARGE = 100;
export const SQUAD_DRAIN_PER_TILE = 2;
export const RESERVE_SPEED_PENALTY = 2;

// isOnGrid lives in planet_map (the halo shares it); re-exported so squad consumers keep one import site.
export {isOnGrid} from "./planet_map";

export function createSquad(homeCoord, squadSize, pouch = {}) {
    return {
        coord: homeCoord,
        path: [],
        moveProgress: 0,
        charge: SQUAD_MAX_CHARGE,
        squadSize,
        cargo: {},               // loot collected at POIs; banks whenever the squad touches the grid, dies on a wipe
        pouch,                   // carried consumables { itemId: count }; unused ones return on disband, die on a wipe
        droidHp: fullDroidHp(squadSize), // per-droid hull; battle wounds persist in the field, repaired on the grid
        fighting: null           // null | { poiId, battle } -- live per-unit sim (see lib/battle.js)
    };
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
 *   { type: 'battleOver', poiId, result, survivors, bugsRemaining }  (live fight ended; see lib/battle.js)
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
        events.push({ ...over, poiId: squad.fighting.poiId });
        return { squad: {...squad, fighting: null}, reveals: [], events };
    }

    let {coord, path, moveProgress, charge, droidHp} = squad;
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
            // Powered ground repairs battle wounds the same way it refills charge (each side heals at home)
            if (droidHp && droidHp.some(hp => hp < UNIT_STATS.droid.hp)) {
                droidHp = fullDroidHp(droidHp.length);
            }
            events.push({ type: 'onGrid' });
        }
        else {
            charge = Math.max(0, charge - SQUAD_DRAIN_PER_TILE);
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
        squad: {...squad, coord, path, moveProgress, charge, droidHp},
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
