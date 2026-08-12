import {getAdjacentCoords, NUM_PLANET_ROWS, PLANET_COLS} from "./planet_geometry";
import {getCrossTime, STATUSES, TERRAINS} from "./planet_map";
import {mod} from "./helpers";
import {POI_STATUS} from "./expeditions";

/**
 * The player-driven squad that IS act-2 exploration (see design-2.0.md Addendum 2.1). Owns the
 * pure movement/charge/reveal/fight simulation plus routing; input handling lives in the planet component and
 * redux thunks. POI *resolution* math (computeOutcome etc.) stays in expeditions.js.
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

const GRID_TERRAINS = new Set([TERRAINS.home.enum, TERRAINS.developing.enum, TERRAINS.developed.enum]);

export function createSquad(homeCoord, squadSize) {
    return {
        coord: homeCoord,
        path: [],
        moveProgress: 0,
        charge: SQUAD_MAX_CHARGE,
        squadSize,
        cargo: {},               // loot collected at POIs; banks whenever the squad touches the grid, dies on a wipe
        fighting: null,          // null | { poiId, remainingMs, outcome } -- outcome decided at initiation
        prompt: null             // null | { poiId } -- standing on a cache/story tile, awaiting the player's choice
    };
}

// The available (discovered, unresolved) POI standing on `coord`, or null.
export function poiAtCoord(pois, coord) {
    return Object.values(pois || {}).find(poi =>
        poi.status === POI_STATUS.available && poi.coord[0] === coord[0] && poi.coord[1] === coord[1]
    ) || null;
}

// The powered grid: home base and replicated land. Standing here recharges instantly.
export function isOnGrid(map, coord) {
    return GRID_TERRAINS.has(map[coord[0]][coord[1]].terrain);
}

export function squadCrossMs(map, coord, unlocks, charge) {
    const base = getCrossTime(map[coord[0]][coord[1]].terrain, unlocks) * 1000 * SQUAD_SPEED_FACTOR;
    return charge <= 0 ? base * RESERVE_SPEED_PENALTY : base;
}

/**
 * Advances the squad one tick: fight countdown when fighting (movement is locked), otherwise movement along
 * its path. Per tile entered: line-of-sight reveal (the tile + its neighbors, same rule as scouts), charge
 * drain off-grid / snap-to-full on-grid, and contact events. Pure; returns the next squad, the coords newly
 * revealed this tick (still-unknown tiles only), and events for the caller to resolve:
 *   { type: 'fightOver', poiId, outcome }  (timed skirmish finished; outcome was decided at initiation)
 *   { type: 'enteredPoi', poiId }          (stepped onto an available cache/story tile: resolve it)
 *   { type: 'onGrid' }                     (stepped onto powered ground: deliver any cargo)
 */
export function advanceSquad(map, pois, squad, moveAmountMs, unlocks) {
    const events = [];

    if (squad.fighting) {
        const remainingMs = squad.fighting.remainingMs - moveAmountMs;
        if (remainingMs > 0) {
            return { squad: {...squad, fighting: {...squad.fighting, remainingMs}}, reveals: [], events };
        }
        events.push({ type: 'fightOver', poiId: squad.fighting.poiId, outcome: squad.fighting.outcome });
        return { squad: {...squad, fighting: null}, reveals: [], events };
    }

    let {coord, path, moveProgress, charge} = squad;
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
        squad: {...squad, coord, path, moveProgress, charge},
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
